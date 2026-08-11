// src/services/horoscope.service.js
"use strict";

const path = require('path');
const fs = require('fs');
const pythonService = require('./python.service');

const signosZodiacales = ['aries', 'tauro', 'geminis', 'cancer', 'leo', 'virgo', 'libra', 'escorpion', 'sagitario', 'capricornio', 'acuario', 'piscis'];
const signosChinos = ['rata', 'buey', 'tigre', 'conejo', 'dragon', 'serpiente', 'caballo', 'cabra', 'mono', 'gallo', 'perro', 'cerdo'];

function limpiarSigno(signo) {
  if (!signo) return '';
  return signo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function findImagePath(signo) {
    const signoLimpio = limpiarSigno(signo);
    // RUTA CORREGIDA: Ahora es relativa al proyecto, no depende de C:\
    const imageDir = path.join(__dirname, '..', '..', 'signos');
    
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];

    for (const ext of extensions) {
        const imagePath = path.join(imageDir, `${signoLimpio}${ext}`);
        if (fs.existsSync(imagePath)) {
            return imagePath;
        }
    }
    
    console.warn(`No se encontró imagen para el signo: ${signo}`);
    return null;
}

function normalizeHoroscopeText(text, label) {
    const value = (text || '').trim();
    if (!value) return `${label} no devolvió información hoy 😵‍💫. Intenta de nuevo más tarde.`;
    if (/^(error|signo no encontrado)/i.test(value)) {
        console.warn(`Fuente de ${label} respondió: ${value}`);
        return `${label} está con dramas para responder ahora 😵‍💫. Prueba de nuevo más tarde.`;
    }
    return value;
}

async function getHoroscope(signo) {
    const signoLimpio = limpiarSigno(signo);
    let scriptName = '';

    if (signosZodiacales.includes(signoLimpio)) {
        scriptName = 'horoscopo.py';
    } else if (signosChinos.includes(signoLimpio)) {
        scriptName = 'horoscopoc.py';
    } else {
        return { text: 'Por favor, proporciona un signo zodiacal o chino válido.', imagePath: null };
    }

    try {
        console.log(`(Servicio Horóscopo) -> Ejecutando ${scriptName} para el signo ${signoLimpio}...`);
        const result = await pythonService.executeScript(scriptName, [signoLimpio]);
        if (result.code !== 0) {
            throw new Error(result.stderr || 'Error al ejecutar script de horóscopo');
        }
        const text = normalizeHoroscopeText(result.stdout, 'El horóscopo');
        if (text.startsWith('El horóscopo está con dramas') || text.startsWith('El horóscopo no devolvió')) {
            return { text, imagePath: null };
        }
        const imagePath = findImagePath(signoLimpio);
        
        return { text, imagePath: imagePath };

    } catch (error) {
        console.error(`Error en getHoroscope para ${signo}:`, error.message);
        return { text: 'No pude obtener el horóscopo en este momento.', imagePath: null };
    }
}

async function getChineseHoroscope(signo) {
    const signoLimpio = limpiarSigno(signo);

    if (!signosChinos.includes(signoLimpio)) {
        return { text: 'Por favor, proporciona un signo chino válido (rata, buey, tigre, conejo, dragón, serpiente, caballo, cabra, mono, gallo, perro, cerdo).', imagePath: null };
    }

    try {
        console.log(`(Servicio Horóscopo Chino) -> Ejecutando horoscopoc.py para el signo ${signoLimpio}...`);
        const result = await pythonService.executeScript('horoscopoc.py', [signoLimpio]);
        if (result.code !== 0) {
            throw new Error(result.stderr || 'Error al ejecutar script de horóscopo chino');
        }
        const text = normalizeHoroscopeText(result.stdout, 'El horóscopo chino');
        if (text.startsWith('El horóscopo chino está con dramas') || text.startsWith('El horóscopo chino no devolvió')) {
            return { text, imagePath: null };
        }
        const imagePath = findImagePath(signoLimpio);
        
        return { text, imagePath: imagePath };

    } catch (error) {
        console.error(`Error en getChineseHoroscope para ${signo}:`, error.message);
        return { text: 'No pude obtener el horóscopo chino en este momento.', imagePath: null };
    }
}

module.exports = {
    getHoroscope,
    getChineseHoroscope
};
