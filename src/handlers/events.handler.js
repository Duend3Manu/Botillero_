// src/handlers/events.handler.js (VERSIÓN WHATSAPP)
"use strict";

const { storeMessage, getOriginalMessage } = require('../utils/db.js');
const messageCounter = require('../services/message-counter.service');
const messageBuffer = require('../services/message-buffer.service');
const { incrementStats } = require('./system.handler');

/**
 * handleMessageCreate — Guarda el mensaje en DB para registrar historial
 */
async function handleMessageCreate(client, message) {
    // Ignorar mensajes enviados por el propio bot
    if (message.fromMe) return;

    const msgKey = message.id._serialized;
    const body = message.body || "";

    // 1. Incrementar estadísticas globales para el comando !ping
    incrementStats('message', message.author || message.from);

    // 2. Guardar en Base de Datos para el log de ediciones/eliminaciones
    if (body) {
        storeMessage(msgKey, body);
    }

    // 3. Si el mensaje es en un grupo, alimentar servicios de tracking
    if (message.from.endsWith('@g.us')) {
        const groupId = message.from;
        const userId = message.author || message.from;
        const pushname = message._data?.notifyName || message.pushname || 'Usuario';

        // Registrar en el contador (!contador)
        const msgType = message.hasMedia ? (message.type || 'media') : 'chat';
        messageCounter.recordMessage(groupId, userId, pushname, msgType);

        // Guardar en el buffer para el resumen (!recap)
        if (body && body.trim().length > 0) {
            // Limpiamos el ID del remitente para que Gemini reciba solo el número (sin @c.us ni signos)
            const numeroLimpio = userId.replace(/\D/g, '');

            messageBuffer.addMessage(groupId, {
                userId: numeroLimpio,
                pushname,
                body: body,
                timestamp: Date.now()
            });
        }
    }
}

/**
 * handleMessageUpdate — Se activa cuando un usuario edita su mensaje
 */
async function handleMessageUpdate(client, message) {
    if (!message || !message.body) return;

    const msgKey = message.id._serialized;
    const originalBody = await getOriginalMessage(msgKey);

    if (originalBody && originalBody !== message.body) {
        const contact = await message.getContact();
        const senderName = contact.pushname || contact.name || contact.number || "Usuario";

        const notifyMessage = `✏️ *${senderName}* editó un mensaje.\n\n*Original:* "${originalBody}"\n*Editado:* "${message.body}"`;

        try {
            await client.sendMessage(message.from, notifyMessage);
            // Actualizar en DB
            storeMessage(msgKey, message.body);
        } catch (err) {
            console.warn('(EventsHandler) -> Error al notificar edición:', err.message);
        }
    }
}

/**
 * handleMessageRevoke — Se activa cuando alguien elimina un mensaje para todos
 */
async function handleMessageRevoke(client, after, before) {
    if (!before) return; // No tenemos el mensaje original en cache del wwebjs

    const msgKey = before.id._serialized;
    const originalBody = await getOriginalMessage(msgKey);

    if (originalBody) {
        const contact = await before.getContact();
        const senderName = contact.pushname || contact.name || contact.number || "Usuario";

        const notifyMessage = `🗑️ *${senderName}* eliminó un mensaje.\n\n*Contenido:* "${originalBody}"`;

        try {
            await client.sendMessage(before.from, notifyMessage);
        } catch (err) {
            console.warn('(EventsHandler) -> Error al notificar eliminación:', err.message);
        }
    }
}

module.exports = {
    handleMessageCreate,
    handleMessageUpdate,
    handleMessageRevoke
};