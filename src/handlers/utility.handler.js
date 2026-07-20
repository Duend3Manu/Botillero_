// src/handlers/utility.handler.js
"use strict";

const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const config = require('../config');
const { generateWhatsAppMessage } = require('../utils/secService');
const { getRandomInfo, getStreamingTrending } = require('../services/utility.service');
const { generateConversationSummary } = require('../services/ai.service');
const { getBanksStatus } = require('../services/bank.service');
const messageBuffer = require('../services/message-buffer.service');
const rateLimiter = require('../services/rate-limiter.service');

// Variables para caché de farmacias (evita descargar la lista gigante en cada consulta)
let farmaciasCache = null;
let lastFarmaciasUpdate = 0;
const FARMACIAS_CACHE_TTL = 60 * 60 * 1000; // 1 hora de caché

async function handleFeriados(message) {
    try {
        if (message) await message.react('🇨🇱');
        const pythonService = require('../services/python.service');
        const result = await pythonService.executeScript('feriados.py');
        
        if (result.code !== 0) {
            console.error('Error al ejecutar feriados.py:', result.stderr);
            return 'Ocurrió un error al obtener los feriados.';
        }
        return result.stdout;
    } catch (error) {
        console.error('Error al obtener los feriados:', error.message);
        return 'Ocurrió un error al obtener los feriados. Intenta más tarde.';
    }
}

async function handleFarmacias(message) {
    const city = message.body.replace(/^([!/])far\s*/i, '').trim().toLowerCase();
    if (!city) {
        return 'Debes especificar una comuna. Por ejemplo: `!far santiago`';
    }

    try {
        await message.react('⏳');
        
        let farmacias;
        // Verificar si tenemos datos en caché recientes
        if (farmaciasCache && (Date.now() - lastFarmaciasUpdate < FARMACIAS_CACHE_TTL)) {
            farmacias = farmaciasCache;
        } else {
            console.log(`(Farmacias) -> Descargando lista actualizada del Minsal...`);
            const response = await axios.get('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php');
            farmacias = response.data;
            farmaciasCache = farmacias; // Guardamos en caché
            lastFarmaciasUpdate = Date.now();
        }
       
        // Filtrar por comuna
        const filteredFarmacias = farmacias.filter(f => 
            f.comuna_nombre && f.comuna_nombre.toLowerCase().includes(city)
        );
        
        console.log(`(Farmacias) -> Farmacias filtradas: ${filteredFarmacias.length}`);

        if (filteredFarmacias.length > 0) {
            // Encontró farmacias en la API
            let replyMessage = `🏥 *Farmacias de turno en ${filteredFarmacias[0].comuna_nombre}*\n\n`;
            filteredFarmacias.slice(0, 5).forEach(f => {
                replyMessage += `*${f.local_nombre}*\n`;
                replyMessage += `📍 ${f.local_direccion}\n`;
                replyMessage += `🕐 ${f.funcionamiento_hora_apertura} - ${f.funcionamiento_hora_cierre}\n`;
                if (f.local_telefono) replyMessage += `📞 ${f.local_telefono}\n`;
                replyMessage += `\n`;
            });
            await message.react('✅');
            return replyMessage.trim();
        }
        
        // No encontró en API, ofrecer alternativas
        const comunasDisponibles = [...new Set(farmacias.map(f => f.comuna_nombre))];
        const algunasComunas = comunasDisponibles.slice(0, 8).join(', ');
        
        await message.react('❌');
        return `❌ No encontré farmacias de turno para "${city}" en la base de datos actual.\n\n💡 **Comunas disponibles en la API:**\n${algunasComunas}\n\n🌐 **Para otras comunas de Chile:**\nConsulta el sitio oficial del Minsal:\nhttps://seremienlinea.minsal.cl/asdigital/index.php?mfarmacias`;
        
    } catch (error) {
        console.error('(Farmacias) -> Error:', error.message);
        await message.react('❌');
        return '❌ No pude obtener información de farmacias en este momento.\n\n🌐 Puedes consultar directamente en:\nhttps://seremienlinea.minsal.cl/asdigital/index.php?mfarmacias';
    }
}

async function handleClima(message) {
    const city = message.body.replace(/^([!/])clima\s*/i, '').trim();
    if (!city) {
        return "Debes indicar una ciudad. Ejemplo: `!clima santiago`";
    }

    try {
        await message.react('⏳');
        const response = await axios.get('http://api.weatherapi.com/v1/forecast.json', {
            params: {
                key: config.weatherApiKey,
                q: city,
                days: 1,
                aqi: 'no',
                alerts: 'no',
                lang: 'es'
            }
        });

        const data = response.data;
        const current = data.current;
        const forecast = data.forecast.forecastday[0].day;
        const location = data.location;

        const reply = `
🌤️ *Clima en ${location.name}, ${location.region}*

- *Ahora:* ${current.temp_c}°C, ${current.condition.text}
- *Sensación Térmica:* ${current.feelslike_c}°C
- *Viento:* ${current.wind_kph} km/h
- *Humedad:* ${current.humidity}%

- *Máx/Mín hoy:* ${forecast.maxtemp_c}°C / ${forecast.mintemp_c}°C
- *Posibilidad de lluvia:* ${forecast.daily_chance_of_rain}%
        `.trim();
        await message.react('🌤️');
        return reply;
    } catch (error) {
        console.error("Error al obtener el clima de WeatherAPI:", error.response?.data?.error?.message || error.message);
        await message.react('❌');
        return `No pude encontrar el clima para "${city}".`;
    }
}

async function handleSismos() {
    try {
        // Nota: handleSismos se llama desde command.handler y retorna string, no recibe message para reaccionar aquí.
        const response = await axios.get('https://api.gael.cloud/general/public/sismos');
        let reply = '🌋 *Últimos 5 sismos en Chile:*\n\n';
        
        response.data.slice(0, 5).forEach(sismo => {
            const fecha = moment(sismo.Fecha).tz('America/Santiago').format('DD/MM/YYYY HH:mm');
            reply += `*Fecha:* ${fecha}\n`;
            reply += `*Lugar:* ${sismo.RefGeografica}\n`;
            reply += `*Magnitud:* ${sismo.Magnitud} ${sismo.Escala}\n`;
            reply += `*Profundidad:* ${sismo.Profundidad} km\n\n`;
        });
        return reply;
    } catch (error) {
        console.error("Error al obtener sismos:", error);
        return "No pude obtener la información de los sismos.";
    }
}


// --- Lógica para !sec (CORREGIDA Y SIMPLIFICADA) ---
async function handleSec(message) {
    // Detectar si el comando contiene 'rm' (ej: !secrm, /secrm)
    const isRm = /\bsecrm\b/i.test(message.body);
    const region = isRm ? 'Metropolitana' : null;
    return generateWhatsAppMessage(region);
}

async function handleRandom() {
    try {
        return await getRandomInfo();
    } catch (error) {
        console.error('Error al obtener dato random:', error);
        return '🎲 Hubo un error al lanzar los dados de la información.';
    }
}

async function handleStreaming(message) {
    try {
        await message.react('⏳');
        const result = await getStreamingTrending();
        await message.react('🍿');
        return result;
    } catch (error) {
        console.error('Error al obtener streaming:', error);
        await message.react('❌');
        return '❌ No pude obtener los estrenos de streaming.';
    }
}


// --- Cooldown propio para !recap (separado del rate limiter global de IA) ---
let lastRecapTimestamp = 0;
const RECAP_COOLDOWN_SECONDS = 15;

// --- Lógica para !recap (Resumen de conversación) ---
async function handleRecap(message) {
    try {
        const groupId = message.from;
        
        // Verificar que sea grupo
        if (!groupId || !groupId.endsWith('@g.us')) {
            return '⚠️ Este comando solo funciona en grupos';
        }
        
        // Obtener mensajes del buffer
        const messages = messageBuffer.getMessages(groupId);
        
        if (messages.length < 5) {
            return `⚠️ Necesito al menos 5 mensajes para hacer un resumen. Por ahora solo tengo ${messages.length}.`;
        }
        
        // Cooldown propio para recap (no compartido con !ia)
        const now = Date.now();
        const timeSinceLastRecap = (now - lastRecapTimestamp) / 1000;
        if (timeSinceLastRecap < RECAP_COOLDOWN_SECONDS) {
            const timeLeft = Math.ceil(RECAP_COOLDOWN_SECONDS - timeSinceLastRecap);
            await message.react('⏳');
            return `⏳ El resumen está en cooldown. Espera ${timeLeft} segundo${timeLeft > 1 ? 's' : ''}.`;
        }
        lastRecapTimestamp = now;
        
        await message.react('🤖');
        
        // Generar resumen con IA
        console.log(`(Recap) -> Generando resumen para ${groupId} con ${messages.length} mensajes...`);
        const summary = await generateConversationSummary(messages);
        
        if (!summary || summary.trim().length === 0) {
            console.error('(Recap) -> El servicio de IA retornó un resumen vacío');
            await message.react('❌');
            return '❌ La IA no pudo generar un resumen. Intenta de nuevo.';
        }
        
        await message.react('✅');
        
        // Reconstruir los JIDs correctos (numero@c.us) para que las menciones funcionen
        const uniqueUserIds = [...new Set(messages.map(m => `${m.userId}@c.us`).filter(Boolean))];
        
        const recapMessage = `📝 *Resumen de los últimos ${messages.length} mensajes:*\n\n${summary}\n\n_Generado por Gemini 2.5 Flash_`;
        
        // Enviar con menciones si hay usuarios
        if (uniqueUserIds.length > 0) {
            await message.reply(recapMessage, undefined, {
                mentions: uniqueUserIds
            });
            return null; // Ya enviamos el mensaje
        } else {
            return recapMessage;
        }
        
    } catch (error) {
        console.error('(Recap) -> Error:', error.message || error);
        try { await message.react('❌'); } catch (e) { }
        
        // Mensajes de error más descriptivos
        if (error.message?.includes('API Key')) {
            return '❌ La API Key de Gemini no está configurada. Contacta al admin.';
        }
        if (error.message?.includes('404') || error.message?.includes('not found')) {
            return '❌ El modelo de IA no está disponible. Contacta al admin.';
        }
        return '❌ Hubo un error al generar el resumen. Intenta de nuevo.';
    }
}

// --- Lógica para !menu (ACTUALIZADO) ---
function handleMenu() {
    return `
╔════════════════════════════╗
   🤖 *BOTILLERO - MENÚ* 🤖
╚════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ *SERVICIOS Y CONSULTAS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☀️ \`!clima [ciudad]\` → Pronóstico del tiempo
💵 \`!valores\` → Indicadores económicos (UF, dólar, etc.)
🎉 \`!feriados\` → Próximos feriados en Chile
💊 \`!far [comuna]\` → Farmacias de turno
🚇 \`!metro\` → Estado del Metro de Santiago
🌋 \`!sismos\` → Últimos sismos reportados
⚡ \`!sec\` / \`!secrm\` → Cortes de luz (nacional/RM)
💳 \`!transbank\` → Estado servicios Transbank
📝 \`!recap\` → Resumir últimos mensajes del grupo
📊 \`!contador\` → Ranking de mensajes por usuario
👀 \`!actividad [@user]\` → Última actividad de un usuario
🔧 \`!ping\` → Estado del sistema/bot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 *BÚSQUEDAS E INFORMACIÓN*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📰 \`!noticias\` → Titulares de última hora
🚗 \`!pat [patente]\` → Info de vehículo
📱 \`!num [teléfono]\` → Info de número
📝 \`!resumen\` → Resumen de la conversación del grupo
🎲 \`!random\` → Dato curioso aleatorio
🍿 \`!streaming\` → Trending en Netflix, Disney+, HBO
🤝 \`!ayuda [duda]\` → Asistente IA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚽ *FÚTBOL Y DEPORTES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 \`!tabla\` → Tabla liga chilena
📅 \`!partidos\` → Resumen de la fecha
📆 \`!prox\` → Próximos partidos liga
🇨🇱 \`!clasi\` → Partidos clasificatorias
🏅 \`!tclasi\` → Tabla clasificatorias
🏆 \`!cliga\` → Grupos Copa de la Liga
📅 \`!liga\` → Partidos Copa de la Liga

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 *REDES Y DOMINIOS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 \`!whois [dominio/ip]\` → Consulta WHOIS
🇨🇱 \`!nic [dominio.cl]\` → Info dominio chileno

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 *ENTRETENIMIENTO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
�️ \`!s\` → Crear sticker (responde img/video)
🎵 \`!audios\` → Lista comandos de audio
😂 \`!chiste\` → Escuchar chiste random
🖼️ \`!toimg\` → Sticker a imagen
⏳ \`!18\` / \`!navidad\` / \`!añonuevo\` → Countdowns
🔮 \`!horoscopo [signo]\` → Tu horóscopo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *GESTIÓN*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎫 \`!ticket [texto]\` → Crear ticket
✅ \`!ticketr [num]\` → Resolver ticket
❌ \`!tickete [num]\` → Eliminar ticket
👮 \`!caso [texto]\` → Registrar caso aislado
📋 \`!icaso\` → Listar casos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *TIP:* Escribe \`bot\` para interactuar conmigo 😎
    `.trim();
}

module.exports = { 
    handleFeriados,
    handleFarmacias,
    handleClima,
    handleSismos,
    handleSec,
    handleMenu,
    handleRandom,
    handleRecap,
    handleStreaming
};