// src/handlers/admin.handler.js
"use strict";

async function handleAgregar(client, message, args) {
    const chatId = message.from;
    
    if (!chatId.endsWith('@g.us')) {
        return message.reply("❌ Este comando solo puede usarse en grupos.");
    }

    const authorId = message.author || message.from;

    // Obtener info de admin saltando completamente la librería para evitar el error "r: r"
    const { isAdmin, adminsList } = await client.pupPage.evaluate(async (groupId, authorId) => {
        try {
            const authorNumber = authorId.split('@')[0];
            
            const groupWid = window.require('WAWebWidFactory').createWid(groupId);
            
            // Buscar el chat en WAWebCollections.Chat
            const chatModel = window.require('WAWebCollections').Chat.get(groupWid) || (await window.require('WAWebCollections').Chat.find(groupWid));
            
            if (!chatModel || !chatModel.groupMetadata) {
                return { isAdmin: false, adminsList: [] };
            }

            const groupMeta = chatModel.groupMetadata;
            if (!groupMeta.participants) {
                return { isAdmin: false, adminsList: [] };
            }

            let admins = [];
            let isUserAdmin = false;

            // Iterar los modelos directamente para evitar serializaciones defectuosas de la librería
            const models = typeof groupMeta.participants.getModelsArray === 'function' ? groupMeta.participants.getModelsArray() : (groupMeta.participants.models || groupMeta.participants);
            
            for (let p of models) {
                const isAdminStatus = p.isAdmin || p.isSuperAdmin;
                const pIdStr = p.id ? (p.id._serialized || p.id.user) : null;
                
                if (isAdminStatus && pIdStr) {
                    admins.push(pIdStr);
                }
                
                if (pIdStr === authorId || (p.id && p.id.user === authorNumber)) {
                    isUserAdmin = isAdminStatus;
                }
            }

            return { isAdmin: isUserAdmin, adminsList: admins };
        } catch (e) {
            return { isAdmin: false, adminsList: ["Error interno: " + e.message] };
        }
    }, chatId, authorId);

    if (!isAdmin) {
        let debugMsg = `🤖 *Debug /agregar*\n`;
        debugMsg += `- Tu ID: ${authorId}\n`;
        debugMsg += `\nAdmins detectados directamente desde WA Web:\n• ${adminsList.length > 0 ? adminsList.join('\n• ') : 'Ninguno'}\n`;
        
        await message.reply(debugMsg);
        return message.reply("⛔ Solo los administradores del grupo pueden usar este comando.");
    }

    // Verificar si se pasó un número
    if (args.length === 0) {
        return message.reply("⚠️ Debes proporcionar un número para agregar.\nEjemplo: `/agregar +56912345678`");
    }

    // Limpiar el número (quitar el +, espacios, guiones, etc)
    let rawNumber = args.join("").replace(/\D/g, '');
    
    if (rawNumber.length < 10) {
        return message.reply("⚠️ El número proporcionado no parece válido.");
    }

    const formattedNumber = `${rawNumber}@c.us`;

    try {
        await message.react('⏳');
        
        // Falsificar el objeto GroupChat para llamar a addParticipants y saltarnos getChatById
        const GroupChat = require('whatsapp-web.js/src/structures/GroupChat');
        const fakeGroup = {
            client: client,
            id: { _serialized: chatId }
        };
        
        await GroupChat.prototype.addParticipants.call(fakeGroup, [formattedNumber]);
        
        await message.reply(`✅ Participante añadido con éxito.`);
        await message.react('✅');

        // 4. Forzar el mensaje de bienvenida de inmediato
        try {
            const { name, description } = await client.pupPage.evaluate(async (groupId) => {
                try {
                    const groupWid = window.require('WAWebWidFactory').createWid(groupId);
                    const chatModel = window.require('WAWebCollections').Chat.get(groupWid) || (await window.require('WAWebCollections').Chat.find(groupWid));
                    return {
                        name: chatModel ? (chatModel.name || chatModel.formattedTitle) : "el grupo",
                        description: chatModel && chatModel.groupMetadata && chatModel.groupMetadata.desc ? chatModel.groupMetadata.desc.toString() : "Bienvenido(a) a nuestro grupo."
                    };
                } catch (e) {
                    return { name: "el grupo", description: "Bienvenido(a) a nuestro grupo." };
                }
            }, chatId);

            const welcomeMsg = `¡Hola @${rawNumber}, bienvenido al grupo *${name || 'el grupo'}*! 👋\n\n📖 *Información / Reglas:*\n${description || ''}`;
            
            await client.sendMessage(chatId, welcomeMsg, { mentions: [formattedNumber] });
        } catch (e) {
            console.error("(AdminHandler) -> Error forzando bienvenida:", e.message);
        }

    } catch (err) {
        console.error('(AdminHandler) -> Error al agregar participante:', err.message);
        await message.react('❌');
        await message.reply(`❌ No se pudo agregar al participante. Asegúrate de que el número sea correcto y de que *el bot sea administrador* del grupo.`);
    }
}

async function handleBanTemporal(client, message, args) {
    const chatId = message.from;
    
    if (!chatId.endsWith('@g.us')) {
        return message.reply("❌ Este comando solo puede usarse en grupos.");
    }

    const authorId = message.author || message.from;

    // Verificar si es admin con la misma lógica segura
    const { isAdmin, adminsList } = await client.pupPage.evaluate(async (groupId, authorId) => {
        try {
            const authorNumber = authorId.split('@')[0];
            const groupWid = window.require('WAWebWidFactory').createWid(groupId);
            const chatModel = window.require('WAWebCollections').Chat.get(groupWid) || (await window.require('WAWebCollections').Chat.find(groupWid));
            
            if (!chatModel || !chatModel.groupMetadata) return { isAdmin: false, adminsList: [] };
            const groupMeta = chatModel.groupMetadata;
            if (!groupMeta.participants) return { isAdmin: false, adminsList: [] };

            let isUserAdmin = false;
            let admins = [];
            const models = typeof groupMeta.participants.getModelsArray === 'function' ? groupMeta.participants.getModelsArray() : (groupMeta.participants.models || groupMeta.participants);
            
            for (let p of models) {
                const isAdminStatus = p.isAdmin || p.isSuperAdmin;
                const pIdStr = p.id ? (p.id._serialized || p.id.user) : null;
                
                if (isAdminStatus && pIdStr) {
                    admins.push(pIdStr);
                }

                if (pIdStr === authorId || (p.id && p.id.user === authorNumber)) {
                    isUserAdmin = isAdminStatus;
                }
            }
            return { isAdmin: isUserAdmin, adminsList: admins };
        } catch (e) {
            return { isAdmin: false, adminsList: [] };
        }
    }, chatId, authorId);

    if (!isAdmin) {
        return message.reply("⛔ Solo los administradores del grupo pueden usar este comando.");
    }

    // Identificar a quién banear
    const mentionedIds = await message.getMentions();
    let targetParticipant = null;
    
    if (mentionedIds && mentionedIds.length > 0) {
        targetParticipant = mentionedIds[0].id._serialized;
    } else if (message.hasQuotedMsg) {
        const quotedMsg = await message.getQuotedMessage();
        targetParticipant = quotedMsg.author || quotedMsg.from;
    } else {
        return message.reply("⚠️ Debes mencionar al usuario o responder a uno de sus mensajes.\nEjemplo: `/ban @usuario 1 min`");
    }

    if (!targetParticipant) {
        return message.reply("⚠️ No pude identificar al usuario.");
    }

    // Prevenir auto-baneo o baneo del bot
    if (targetParticipant === authorId || targetParticipant === client.info.wid._serialized) {
        return message.reply("⛔ No puedes banearte a ti mismo ni al bot.");
    }

    // Extraer tiempo en minutos (ej: 1 min, 5 minutos) y el motivo
    const fullArgs = args.join(" ");
    const lowerArgs = fullArgs.toLowerCase();
    
    let minutes = null; // Si se queda en null, es permanente
    let reason = "";

    // Extraer el motivo (todo lo que esté después de una coma)
    if (fullArgs.includes(',')) {
        const parts = fullArgs.split(',');
        reason = parts.slice(1).join(',').trim();
    }

    const match = lowerArgs.match(/(\d+)\s*(m|min|mins|minuto|minutos)/);
    if (match) {
        minutes = parseInt(match[1]);
    } else {
        // Intentar buscar un número suelto antes de la coma que actúe como tiempo
        const beforeComma = fullArgs.split(',')[0].trim();
        const numMatch = beforeComma.match(/\b(\d+)\b/);
        if (numMatch) {
            minutes = parseInt(numMatch[1]);
        }
    }

    try {
        await message.react('⏳');
        
        const GroupChat = require('whatsapp-web.js/src/structures/GroupChat');
        const fakeGroup = {
            client: client,
            id: { _serialized: chatId }
        };
        
        // Banear (Expulsar). Envolvemos en try/catch porque la librería crashea localmente
        try {
            await GroupChat.prototype.removeParticipants.call(fakeGroup, [targetParticipant]);
        } catch (e) {
            console.warn("(AdminHandler) -> Ignorando error local tras baneo:", e.message);
        }
        
        const mentionTarget = `@${targetParticipant.split('@')[0]}`;
        
        try {
            // Construir mensaje de baneo con el motivo
            let banMessage = `🔨 ${mentionTarget} fue expulsado ${minutes ? `temporalmente por ${minutes} minuto(s)` : 'permanentemente'}.`;
            if (reason) {
                banMessage += `\n📝 *Motivo:* ${reason}`;
            }
            
            // No podemos usar 'mentions' aquí porque el usuario ya no está en el grupo y WhatsApp rechaza el mensaje
            await message.reply(banMessage);
            await message.react('✅');
        } catch (e) {
            console.warn("(AdminHandler) -> Error al enviar mensaje de éxito:", e.message);
        }

        // Programar re-agregado automático SOLO si hay un tiempo definido
        if (minutes && minutes > 0) {
            setTimeout(async () => {
                try {
                    try {
                        await GroupChat.prototype.addParticipants.call(fakeGroup, [targetParticipant]);
                    } catch (e) {
                        console.warn("(AdminHandler) -> Ignorando error local tras re-agregar:", e.message);
                    }
                    
                    // Forzar bienvenida especial. Aquí sí podemos mencionarlo porque ya volvió al grupo
                    await client.sendMessage(chatId, `⏳ ¡El tiempo de ban expiró! ${mentionTarget} ha vuelto al grupo. Portate bien. 🛡️`, { mentions: [targetParticipant] });
                } catch (err) {
                    console.error("(AdminHandler) -> Error re-agregando tras ban:", err);
                }
            }, minutes * 60 * 1000);
        }

    } catch (err) {
        console.error('(AdminHandler) -> Error fatal al banear:', err);
        try { await message.react('❌'); } catch (e) {}
        try { await message.reply(`❌ Ocurrió un error inesperado al procesar el ban.`); } catch (e) {}
    }
}

module.exports = {
    handleAgregar,
    handleBanTemporal
};
