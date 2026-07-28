// src/handlers/admin.handler.js
"use strict";

async function handleAgregar(client, message, args) {
    const chat = await message.getChat();
    
    if (!chat.isGroup) {
        return message.reply("❌ Este comando solo puede usarse en grupos.");
    }

    // Verificar si el usuario que envía el mensaje es admin
    const authorId = message.author || message.from;
    const isAdmin = chat.participants.find(p => p.id._serialized === authorId && (p.isAdmin || p.isSuperAdmin));
    
    if (!isAdmin) {
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
        // Agregar participante
        await chat.addParticipants([formattedNumber]);
        
        await message.reply(`✅ Participante añadido con éxito.`);
        await message.react('✅');
    } catch (err) {
        console.error('(AdminHandler) -> Error al agregar participante:', err.message);
        await message.react('❌');
        await message.reply(`❌ No se pudo agregar al participante. Asegúrate de que el número sea correcto y de que *el bot sea administrador* del grupo.`);
    }
}

module.exports = {
    handleAgregar
};
