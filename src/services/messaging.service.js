"use strict";

const REACTION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendVerifiedReaction(message, reaction) {
    const messageId = message?.id?._serialized || message?._data?.id?._serialized ||
        (typeof message?.id === 'string' ? message.id : null);
    const client = message?.client || message?._client;
    if (!messageId) {
        throw new Error('El mensaje no tiene un ID serializado para reaccionar');
    }
    if (!client?.pupPage) {
        throw new Error('El mensaje no tiene cliente de WhatsApp asociado');
    }

    return client.pupPage.evaluate(async (id, emoji) => {
        try {
            const collections = window.require('WAWebCollections');
            const msg = collections.Msg.get(id) ||
                (await collections.Msg.getMessagesById([id]))?.messages?.[0];
            if (!msg) return { ok: false, reason: 'message_not_found' };
            await window.require('WAWebSendReactionMsgAction').sendReactionToMsg(msg, emoji);
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: error.message || 'reaction_error' };
        }
    }, messageId, reaction);
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
