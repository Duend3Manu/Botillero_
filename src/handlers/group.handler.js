// src/handlers/group.handler.js (VERSIÓN WHATSAPP)
"use strict";

/**
 * Obtiene los participantes del grupo directamente desde la Store de WhatsApp Web,
 * evitando el método findOrCreateLatestChat que causa error "r: r" en versiones recientes.
 * 
 * @param {Object} client - Instancia de whatsapp-web.js
 * @param {string} chatId - ID del chat (ej: "1234@g.us")
 * @returns {Promise<Object|null>} - { participants: [...], isGroup: true } o null
 */
async function getGroupDataDirect(client, chatId) {
    try {
        let chat = await client.getChatById(chatId);
        if (!chat || !chat.isGroup || !chat.participants) return null;

        const participants = chat.participants.map(p => {
            return {
                id: { _serialized: p.id._serialized, user: p.id.user },
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin
            };
        });

        return { isGroup: true, participants };
    } catch (err) {
        console.error("(getGroupDataDirect) -> Error obteniendo chat de WWebJS:", err.message);
        return null;
    }
}

/**
 * Etiqueta a todos los participantes de un grupo.
 * Usa acceso directo a la Store para evitar errores de versión de WhatsApp Web.
 * 
 * @param {Object} client - Instancia de whatsapp-web.js
 * @param {Object} message - Mensaje nativo de whatsapp-web.js
 */
async function handleTagAll(client, message) {
    try {
        // Verificar que es un grupo por el ID (termina en @g.us)
        const chatId = message.from;
        if (!chatId || !chatId.endsWith('@g.us')) {
            return message.reply("Este comando solo se puede usar en grupos.");
        }

        // Intentar obtener datos del grupo directamente de la Store
        let groupData = await getGroupDataDirect(client, chatId);

        // Fallback: intentar con message.getChat() (puede funcionar si el bug no aplica)
        if (!groupData) {
            console.warn("(handleTagAll) -> Store directa falló, intentando message.getChat()...");
            try {
                const chat = await message.getChat();
                if (chat && chat.isGroup && chat.participants) {
                    groupData = {
                        isGroup: true,
                        participants: chat.participants.map(p => ({
                            id: { _serialized: p.id._serialized, user: p.id.user },
                            isAdmin: p.isAdmin,
                            isSuperAdmin: p.isSuperAdmin
                        }))
                    };
                }
            } catch (getChatErr) {
                console.warn("(handleTagAll) -> message.getChat() también falló:", getChatErr.message);
            }
        }

        if (!groupData || !groupData.participants || groupData.participants.length === 0) {
            return message.reply("⚠️ No se pudo obtener la lista de participantes del grupo. Intenta de nuevo más tarde.");
        }

        // --- Verificar que el usuario es administrador ---
        const senderId = message.author || message.from;
        if (!senderId) {
            return message.reply("No se pudo identificar al remitente.");
        }

        const participant = groupData.participants.find(p => p.id._serialized === senderId);
        
        if (!participant || (!participant.isAdmin && !participant.isSuperAdmin)) {
            return message.reply("👮‍♂️ Alto ahí. Solo los administradores pueden invocar a todos.");
        }

        // --- Construir mensaje con menciones ---
        const customText = message.body.replace(/^!todos\s*/i, '').trim();
        let text = customText ? `📢 *${customText}*\n\n` : "📢 *Atención grupo:*\n\n";
        
        const mentions = [];
        for (const part of groupData.participants) {
            mentions.push(part.id._serialized);
            text += `@${part.id.user} `;
        }
        
        // Usar client.sendMessage en vez de chat.sendMessage para evitar otro getChat()
        await client.sendMessage(chatId, text, { mentions });

    } catch (e) {
        console.error("Error en handleTagAll:", e);
        message.reply("Hubo un error al intentar etiquetar a todos.");
    }
}

module.exports = {
    handleTagAll
};