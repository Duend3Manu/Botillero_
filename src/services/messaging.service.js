"use strict";

const REACTION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendVerifiedReaction(message, reaction) {
    const rawId = message?.id || message?._data?.id;
    const messageId = rawId?._serialized || rawId?.serialized || rawId?.id?._serialized ||
        (typeof rawId === 'string' ? rawId : null);
    const localId = rawId?.id || rawId?._id || null;
    const chatId = message?.from || message?._data?.from?._serialized || message?._data?.from || null;
    const client = message?.client || message?._client;
    if (!messageId && !localId) {
        const idKeys = rawId && typeof rawId === 'object' ? Object.keys(rawId).join(',') : typeof rawId;
        throw new Error(`El mensaje no tiene un ID utilizable para reaccionar (campos: ${idKeys})`);
    }
    if (!client?.pupPage) {
        throw new Error('El mensaje no tiene cliente de WhatsApp asociado');
    }

    return client.pupPage.evaluate(async (id, internalId, targetChatId, emoji) => {
        try {
            const collections = window.require('WAWebCollections');
            let msg = id && (collections.Msg.get(id) ||
                (await collections.Msg.getMessagesById([id]))?.messages?.[0]);

            // Algunos mensajes LID llegan sin _serialized. Buscamos por su clave interna y chat.
            if (!msg && internalId) {
                const models = typeof collections.Msg.getModelsArray === 'function'
                    ? collections.Msg.getModelsArray()
                    : Object.values(collections.Msg.models || {});
                msg = models.find(candidate => {
                    const candidateId = candidate.id || {};
                    const candidateChatId = candidateId.remote?._serialized || candidateId.remote;
                    return candidateId.id === internalId && (!targetChatId || candidateChatId === targetChatId);
                });
            }
            if (!msg) return { ok: false, reason: 'message_not_found' };
            await window.require('WAWebSendReactionMsgAction').sendReactionToMsg(msg, emoji);
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: error.message || 'reaction_error' };
        }
    }, messageId, localId, chatId, reaction);
}

async function tryReact(message, reaction) {
    console.log(`(MessagingService) -> Intentando reaccionar con: ${reaction}`);
    let lastReason = 'unknown';
    for (let attempt = 1; attempt <= REACTION_ATTEMPTS; attempt++) {
        try {
            const result = await sendVerifiedReaction(message, reaction);
            if (result?.ok) {
                console.log(`(MessagingService) -> Reacción ${reaction} enviada (intento ${attempt}).`);
                return true;
            }
            lastReason = result?.reason || lastReason;
        } catch (error) {
            lastReason = error.message;
        }
        if (attempt < REACTION_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
    console.warn(`(MessagingService) -> No se pudo reaccionar con ${reaction}: ${lastReason}`);
    return false;
}

async function handleReaction(message, actionFn, successReaction = '✅') {
    await delay(300);
    await tryReact(message, '⏳');
    const startTime = Date.now();
    try {
        await actionFn();
        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) await delay(1500 - elapsed);
        await tryReact(message, successReaction);
    } catch (error) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) await delay(1500 - elapsed);
        await tryReact(message, '❌');
        throw error;
    }
}

module.exports = { handleReaction, tryReact, sendVerifiedReaction };
