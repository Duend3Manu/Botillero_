// src/handlers/birthday.handler.js
"use strict";

const { saveBirthday } = require('../utils/db');

const meses = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
};

function parseDate(input) {
    const text = input.toLowerCase().trim();
    
    // Formato: DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
    const regexNum = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;
    const matchNum = text.match(regexNum);
    if (matchNum) {
        return {
            day: parseInt(matchNum[1], 10),
            month: parseInt(matchNum[2], 10),
            year: parseInt(matchNum[3], 10)
        };
    }
    
    // Formato: DD de [mes] de YYYY
    const regexText = /^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/;
    const matchText = text.match(regexText);
    if (matchText) {
        const d = parseInt(matchText[1], 10);
        const mStr = matchText[2];
        const y = parseInt(matchText[3], 10);
        if (meses[mStr]) {
            return { day: d, month: meses[mStr], year: y };
        }
    }
    
    return null;
}

async function handleCumpleanos(client, message, args) {
    if (args.length === 0) {
        return message.reply("🎂 Ingresa tu fecha de nacimiento para que Botillero te salude.\nEjemplo: `!cumpleaños 7 de agosto de 2000` o `!cumpleaños 07/08/2000`");
    }
    
    const inputDate = args.join(" ");
    const parsed = parseDate(inputDate);
    
    if (!parsed) {
        return message.reply("⚠️ No pude entender la fecha. Usa un formato como `7 de agosto de 2000` o `07/08/2000`.");
    }
    
    // Validar fecha
    if (parsed.month < 1 || parsed.month > 12 || parsed.day < 1 || parsed.day > 31) {
        return message.reply("⚠️ Esa fecha no existe en mi calendario.");
    }
    
    const currentYear = new Date().getFullYear();
    if (parsed.year < 1900 || parsed.year > currentYear) {
        return message.reply(`⚠️ Ingresa un año de nacimiento válido (entre 1900 y ${currentYear}).`);
    }

    const userId = message.author || message.from;
    const groupId = message.from.endsWith('@g.us') ? message.from : null;
    
    saveBirthday(userId, parsed.day, parsed.month, parsed.year, groupId);
    
    await message.react('🎂');
    return `✅ ¡Listo! Guardé tu cumpleaños (${parsed.day}/${parsed.month}/${parsed.year}). ¡Te saludaré cuando llegue el día! 🎉`;
}

module.exports = {
    handleCumpleanos
};
