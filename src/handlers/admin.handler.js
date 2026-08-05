// src/handlers/admin.handler.js
"use strict";

// --- Helper reutilizable: verificar si el autor es admin del grupo ---
async function checkIsAdmin(client, chatId, authorId) {
    return client.pupPage.evaluate(async (groupId, authorId) => {
        try {
            const authorNumber = authorId.split('@')[0];
            const groupWid = window.require('WAWebWidFactory').createWid(groupId);
            const chatModel = window.require('WAWebCollections').Chat.get(groupWid) || (await window.require('WAWebCollections').Chat.find(groupWid));

            if (!chatModel || !chatModel.groupMetadata) return { isAdmin: false };
            const groupMeta = chatModel.groupMetadata;
            if (!groupMeta.participants) return { isAdmin: false };

            let isUserAdmin = false;
            const models = typeof groupMeta.participants.getModelsArray === 'function'
                ? groupMeta.participants.getModelsArray()
                : (groupMeta.participants.models || groupMeta.participants);

            for (let p of models) {
                const isAdminStatus = p.isAdmin || p.isSuperAdmin;
                const pIdStr = p.id ? (p.id._serialized || p.id.user) : null;
                if (pIdStr === authorId || (p.id && p.id.user === authorNumber)) {
                    isUserAdmin = isAdminStatus;
                    break;
                }
            }
            return { isAdmin: isUserAdmin };
        } catch (e) {
            return { isAdmin: false };
        }
    }, chatId, authorId);
}

// --- Helper reutilizable: obtener el target del comando (mención o cita) ---
async function resolveTarget(message) {
    const mentionedIds = await message.getMentions();
    if (mentionedIds && mentionedIds.length > 0) {
        return mentionedIds[0].id._serialized;
    }
    if (message.hasQuotedMsg) {
        const quotedMsg = await message.getQuotedMessage();
        return quotedMsg.author || quotedMsg.from;
    }
    return null;
}

// --- Helper: obtener datos del grupo (nombre y descripción) ---
async function getGroupInfo(client, chatId) {
    try {
        return await client.pupPage.evaluate(async (groupId) => {
            try {
                const groupWid = window.require('WAWebWidFactory').createWid(groupId);
                const chatModel = window.require('WAWebCollections').Chat.get(groupWid) || (await window.require('WAWebCollections').Chat.find(groupWid));
                return {
                    name: chatModel ? (chatModel.name || chatModel.formattedTitle || 'el grupo') : 'el grupo',
                    description: chatModel && chatModel.groupMetadata && chatModel.groupMetadata.desc
                        ? chatModel.groupMetadata.desc.toString()
                        : 'Bienvenido(a) a nuestro grupo.'
                };
            } catch (e) {
                return { name: 'el grupo', description: 'Bienvenido(a) a nuestro grupo.' };
            }
        }, chatId);
    } catch (e) {
        return { name: 'el grupo', description: 'Bienvenido(a) a nuestro grupo.' };
    }
}

// --- /agregar — Agregar participante al grupo ---
async function handleAgregar(client, message, args) {
    const chatId = message.from;

    if (!chatId.endsWith('@g.us')) {
        return message.reply("❌ Este comando solo puede usarse en grupos.");
    }

    const authorId = message.author || message.from;
    const { isAdmin } = await checkIsAdmin(client, chatId, authorId);

    if (!isAdmin) {
        return message.reply("⛔ Solo los administradores del grupo pueden usar este comando.");
    }

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

        const GroupChat = require('whatsapp-web.js/src/structures/GroupChat');
        const fakeGroup = { client, id: { _serialized: chatId } };

        await GroupChat.prototype.addParticipants.call(fakeGroup, [formattedNumber]);

        await message.reply(`✅ Participante añadido con éxito.`);
        await message.react('✅');

        // Forzar mensaje de bienvenida
        try {
            const { name, description } = await getGroupInfo(client, chatId);
            const welcomeMsg = `¡Hola @${rawNumber}, bienvenido al grupo *${name}*! 👋\n\n📖 *Información / Reglas:*\n${description}`;
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

// --- /ban — Expulsar usuario (temporal o permanente, con re-agregar automático si hay tiempo) ---
async function handleBanTemporal(client, message, args) {
    const chatId = message.from;

    if (!chatId.endsWith('@g.us')) {
        return message.reply("❌ Este comando solo puede usarse en grupos.");
    }

    const authorId = message.author || message.from;
    const { isAdmin } = await checkIsAdmin(client, chatId, authorId);

    if (!isAdmin) {
        return message.reply("⛔ Solo los administradores del grupo pueden usar este comando.");
    }

    const targetParticipant = await resolveTarget(message);

    if (!targetParticipant) {
        return message.reply("⚠️ Debes mencionar al usuario o responder a uno de sus mensajes.\nEjemplo: `/ban @usuario 5 min, portarse mal`");
    }

    // Prevenir auto-baneo o baneo del bot
    if (targetParticipant === authorId || targetParticipant === client.info.wid._serialized) {
        return message.reply("⛔ No puedes banearte a ti mismo ni al bot.");
    }

    // Extraer tiempo y motivo
    const fullArgs = args.join(" ");
    let minutes = null;
    let reason = "";

    if (fullArgs.includes(',')) {
        const parts = fullArgs.split(',');
        reason = parts.slice(1).join(',').trim();
    }

    const timeMatch = fullArgs.toLowerCase().match(/(\d+)\s*(m|min|mins|minuto|minutos|h|hr|hora|horas)/);
    if (timeMatch) {
        const val = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        minutes = unit.startsWith('h') ? val * 60 : val;
    } else {
        const beforeComma = fullArgs.split(',')[0].trim();
        const numMatch = beforeComma.match(/\b(\d+)\b/);
        if (numMatch) minutes = parseInt(numMatch[1]);
    }

    try {
        await message.react('⏳');

        const GroupChat = require('whatsapp-web.js/src/structures/GroupChat');
        const fakeGroup = { client, id: { _serialized: chatId } };
        const executorTag = `@${authorId.split('@')[0]}`;
        const targetTag = `@${targetParticipant.split('@')[0]}`;

        // Expulsar
        try {
            await GroupChat.prototype.removeParticipants.call(fakeGroup, [targetParticipant]);
        } catch (e) {
            console.warn("(AdminHandler) -> Ignorando error local tras baneo:", e.message);
        }

        // Confirmar con mensaje descriptivo
        try {
            let banMessage = `🔨 ${targetTag} fue expulsado ${minutes ? `temporalmente por ${minutes} minuto(s)` : 'permanentemente'} por ${executorTag}.`;
            if (reason) banMessage += `\n📝 *Motivo:* ${reason}`;
            await message.reply(banMessage);
            await message.react('✅');
        } catch (e) {
            console.warn("(AdminHandler) -> Error al enviar mensaje de éxito:", e.message);
        }

        // Re-agregar automáticamente si hay tiempo
        if (minutes && minutes > 0) {
            setTimeout(async () => {
                try {
                    try {
                        await GroupChat.prototype.addParticipants.call(fakeGroup, [targetParticipant]);
                    } catch (e) {
                        console.warn("(AdminHandler) -> Ignorando error local tras re-agregar:", e.message);
                    }
                    await client.sendMessage(chatId, `⏳ ¡El tiempo de ban expiró! ${targetTag} ha vuelto al grupo. Portate bien. 🛡️`, { mentions: [targetParticipant] });
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

// --- /kick — Expulsión permanente limpia (sin re-agregar automático) ---
async function handleKick(client, message, args) {
    const chatId = message.from;

    if (!chatId.endsWith('@g.us')) {
        return message.reply("❌ Este comando solo puede usarse en grupos.");
    }

    const authorId = message.author || message.from;
    const { isAdmin } = await checkIsAdmin(client, chatId, authorId);

    if (!isAdmin) {
        return message.reply("⛔ Solo los administradores del grupo pueden usar este comando.");
    }

    const targetParticipant = await resolveTarget(message);

    if (!targetParticipant) {
        return message.reply("⚠️ Debes mencionar al usuario o responder a uno de sus mensajes.\nEjemplo: `/kick @usuario [, motivo]`");
    }

    if (targetParticipant === authorId || targetParticipant === client.info.wid._serialized) {
        return message.reply("⛔ No puedes expulsarte a ti mismo ni al bot.");
    }

    // Extraer motivo (todo después de la primera coma)
    const fullArgs = args.join(" ");
    const reason = fullArgs.includes(',') ? fullArgs.split(',').slice(1).join(',').trim() : '';
    const executorTag = `@${authorId.split('@')[0]}`;
    const targetTag = `@${targetParticipant.split('@')[0]}`;

    try {
        await message.react('⏳');

        const GroupChat = require('whatsapp-web.js/src/structures/GroupChat');
        const fakeGroup = { client, id: { _serialized: chatId } };

        try {
            await GroupChat.prototype.removeParticipants.call(fakeGroup, [targetParticipant]);
        } catch (e) {
            console.warn("(AdminHandler) -> Ignorando error local tras kick:", e.message);
        }

        let kickMessage = `🥾 ${targetTag} fue expulsado permanentemente por ${executorTag}.`;
        if (reason) kickMessage += `\n📝 *Motivo:* ${reason}`;

        await message.reply(kickMessage);
        await message.react('✅');

    } catch (err) {
        console.error('(AdminHandler) -> Error fatal en kick:', err);
        try { await message.react('❌'); } catch (e) {}
        try { await message.reply(`❌ Ocurrió un error inesperado al procesar el kick.`); } catch (e) {}
    }
}

module.exports = {
    handleAgregar,
    handleBanTemporal,
    handleKick
};
