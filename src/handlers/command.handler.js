// src/handlers/command.handler.js (VERSIÓN OPTIMIZADA)
"use strict";

const { MessageMedia } = require('../adapters/wwebjs-adapter');
const rateLimiter = require('../services/rate-limiter.service');
const { handleReaction } = require('../services/messaging.service');

const botConfig = require('../../config/bot.config');

// --- Lazy Loading de Servicios ---
// Los servicios solo se cargan cuando realmente se necesitan
const services = {
    get metro() { return require('../services/metro.service'); },
    get nationalTeam() { return require('../services/nationalTeam.service'); },
    get economy() { return require('../services/economy.service'); },
    get horoscope() { return require('../services/horoscope.service'); },
    get league() { return require('../services/league.service.js'); },
    get transbank() { return require('../services/transbank.service.js'); },
    get system() { return require('./system.handler'); },
    get utility() { return require('./utility.handler'); },
    get fun() { return require('./fun.handler'); },
    get search() { return require('./search.handler'); },
    get stateful() { return require('./stateful.handler'); },
    get ai() { return require('./ai.handler'); },
    get personalSearch() { return require('./personalsearch.handler'); },
    get network() { return require('./network.handler'); },
    get fap() { return require('./fap.handler'); },
    get group() { return require('./group.handler'); },
    get admin() { return require('./admin.handler'); },
    get birthday() { return require('./birthday.handler'); },
    get counter() { return require('./counter.handler'); },
    get kast() { return require('./kast.handler'); }
};

// --- Cooldowns para comandos específicos ---
let lastTransbankRequestTimestamp = 0;
const TRANSBANK_COOLDOWN_SECONDS = 30;

// --- Anti-spam: detectar comandos repetidos por usuario ---
const spamTracker = new Map(); // userId -> { command, count, lastTime }
const SPAM_THRESHOLD = 3;       // 3 veces seguidas = spam
const SPAM_WINDOW_MS = 60000;   // Ventana de 60 segundos

function checkSpam(userId, command) {
    const now = Date.now();
    const tracker = spamTracker.get(userId);

    if (!tracker || tracker.command !== command || (now - tracker.lastTime) > SPAM_WINDOW_MS) {
        // Comando diferente o ventana expirada: resetear
        spamTracker.set(userId, { command, count: 1, lastTime: now });
        return false;
    }

    // Mismo comando dentro de la ventana
    tracker.count++;
    tracker.lastTime = now;

    if (tracker.count >= SPAM_THRESHOLD) {
        tracker.count = 0; // Resetear para que pueda volver a usar después
        return true; // ¡Es spam!
    }

    return false;
}

// --- Helpers para comandos con lógica repetida ---
async function handleHoroscopeCommand(client, message, serviceMethod) {
    const signo = message.body.split(' ')[1];
    if (!signo) {
        return "Por favor, escribe un signo. Ej: `!horoscopo aries`";
    }
    
    const result = await serviceMethod(signo);
    await message.reply(result.text);
    
    if (result.imagePath) {
        const media = MessageMedia.fromFilePath(result.imagePath);
        await client.sendMessage(message.from, media);
    }
    return null; // Ya enviamos la respuesta
}

async function handleTransbankWithCooldown() {
    const now = Date.now();
    const timeSinceLastRequest = (now - lastTransbankRequestTimestamp) / 1000;

    if (timeSinceLastRequest < TRANSBANK_COOLDOWN_SECONDS) {
        const timeLeft = Math.ceil(TRANSBANK_COOLDOWN_SECONDS - timeSinceLastRequest);
        return `⏳ El comando !transbank está en cooldown. Por favor, espera ${timeLeft} segundos.`;
    }
    
    const result = await services.transbank.getTransbankStatus();
    lastTransbankRequestTimestamp = Date.now();
    return result;
}

async function handleRandomCommand(client, message) {
    const randomData = await services.utility.handleRandom();
    
    if (randomData.type === 'image' && randomData.media_url) {
        try {
            const media = await MessageMedia.fromUrl(randomData.media_url);
            await client.sendMessage(message.from, media, { caption: randomData.caption });
        } catch (err) {
            console.error("Error al enviar imagen random:", err);
            await message.reply(randomData.caption + "\n\n(No pude cargar la imagen 😢)");
        }
        return null;
    }
    
    return randomData.caption;
}

async function handleStickerToImage(client, message) {
    if (!message.hasQuotedMsg) {
        return 'Debes responder a un sticker para convertirlo en imagen.';
    }

    // Obtener la data del sticker directamente desde message._data.quotedMsg
    // para evitar el bug "r: r" de whatsapp-web.js con page.evaluate()
    const quotedData = message._data.quotedMsg;
    if (!quotedData || !quotedData.directPath) {
        return 'El mensaje al que respondiste no tiene media.';
    }
    if (quotedData.type !== 'sticker') {
        return 'El mensaje al que respondiste no es un sticker.';
    }

    try {
        try { await message.react('🖼️'); } catch (e) { }

        const crypto = require('crypto');
        const axios = require('axios');
        const sharp = require('sharp');

        // 1. Descargar el media encriptado desde el CDN de WhatsApp
        const mediaUrl = quotedData.deprecatedMms3Url || `https://mmg.whatsapp.net${quotedData.directPath}`;
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const encBuffer = Buffer.from(response.data);

        // 2. Desencriptar el media usando el mediaKey (HKDF + AES-256-CBC)
        const mediaKeyBuffer = Buffer.from(quotedData.mediaKey, 'base64');

        // HKDF expand: los stickers usan el mismo info que las imágenes
        const hkdfInfoMap = {
            'sticker': 'WhatsApp Image Keys',
            'image': 'WhatsApp Image Keys',
            'video': 'WhatsApp Video Keys',
            'audio': 'WhatsApp Audio Keys',
            'document': 'WhatsApp Document Keys',
        };
        const info = hkdfInfoMap[quotedData.type] || 'WhatsApp Image Keys';

        // HKDF-SHA256 extract and expand
        const salt = Buffer.alloc(32, 0);
        const prk = crypto.createHmac('sha256', salt).update(mediaKeyBuffer).digest();
        let prev = Buffer.alloc(0);
        let okm = Buffer.alloc(0);
        for (let i = 1; okm.length < 112; i++) {
            const hmac = crypto.createHmac('sha256', prk);
            hmac.update(Buffer.concat([prev, Buffer.from(info), Buffer.from([i])]));
            prev = hmac.digest();
            okm = Buffer.concat([okm, prev]);
        }
        okm = okm.slice(0, 112);

        const iv = okm.slice(0, 16);
        const cipherKey = okm.slice(16, 48);
        // macKey = okm.slice(48, 80) — no lo verificamos para simplificar

        // Separar ciphertext (todo menos los últimos 10 bytes de MAC)
        const ciphertext = encBuffer.slice(0, encBuffer.length - 10);

        // Desencriptar con AES-256-CBC
        const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

        // 3. Convertir WebP a PNG usando sharp
        const pngBuffer = await sharp(decrypted).png().toBuffer();
        const pngBase64 = pngBuffer.toString('base64');

        const imageMedia = new MessageMedia('image/png', pngBase64, 'sticker.png');
        await client.sendMessage(message.from, imageMedia, {
            caption: '🖼️ ¡Aquí tienes tu sticker como imagen!'
        });
        return null;
    } catch (err) {
        console.error('(toimg) -> Error:', err.message);
        return '❌ No pude convertir el sticker a imagen.';
    }
}


// --- Mapa de Alias ---
const commandAliases = {
    'ligatabla': 'tabla',
    'ligapartidos': 'prox',
    'selecciontabla': 'tclasi',
    'seleccionpartidos': 'clasi',
    'ticketr': 'ticket',
    'tickete': 'ticket',
    'ecaso': 'caso',
    'icaso': 'caso',
    'tel': 'num',
    'patente': 'pat',
    'net': 'whois',
    'sonidos': 'audios',
    'comandos': 'menu',
    'secrm': 'sec',
    'dato': 'random',
    'curiosidad': 'random',
    'precio': 'oferta',
    'desc': 'oferta',
    'producto': 'oferta'
};

// --- Command Map (Reemplaza el switch gigante) ---
const commandMap = {
    // Liga/Deportes
    'tabla': async (client, msg) => {
        await msg.reply('📊 Buscando la tabla de posiciones, dame un segundo...');
        return services.league.getLeagueTable();
    },
    'grupos': async (client, msg) => {
        await msg.reply('📊 Buscando la tabla de posiciones en la ANFP, dame un segundo...');
        return services.league.getCopaLigaGroups();
    },
    'prox': () => services.league.getLeagueUpcomingMatches(),
    'partidos': () => services.league.getMatchDaySummary(),
    'tclasi': () => services.nationalTeam.getQualifiersTable(),
    'clasi': () => services.nationalTeam.getQualifiersMatches(),
    'liga': async (client, msg) => {
        await msg.reply('⚽ Consultando el VAR de la Copa de la Liga, dame un segundito...');
        return services.league.getCopaLigaMatches();
    },
    'cliga': async (client, msg) => {
        await msg.reply('📊 Buscando la tabla de posiciones en la ANFP, dame un segundo...');
        return services.league.getCopaLigaGroups();
    },
    
    // Servicios públicos
    'metro': () => services.metro.getMetroStatus(),
    'valores': () => services.economy.getEconomicIndicators(),
    'horoscopo': (client, msg) => handleHoroscopeCommand(client, msg, services.horoscope.getHoroscope.bind(services.horoscope)),
    'chino': (client, msg) => handleHoroscopeCommand(client, msg, services.horoscope.getChineseHoroscope.bind(services.horoscope)),
    'trstatus': () => services.transbank.getTransbankStatus(),
    'transbank': () => handleTransbankWithCooldown(),
    
    // Sistema y utilidades
    'ping': (_, msg) => services.system.handlePing(msg),
    'feriados': (_, msg) => services.utility.handleFeriados(msg),
    'far': (_, msg) => services.utility.handleFarmacias(msg),
    'clima': (_, msg) => services.utility.handleClima(msg),
    'sismos': () => services.utility.handleSismos(),
    'sec': (_, msg) => services.utility.handleSec(msg),
    'menu': async (_, msg) => {
        const { getMainMenu } = require('./menu.handler');
        return getMainMenu();
    },
    'recap': (_, msg) => services.utility.handleRecap(msg),
    'resumen': (_, msg) => services.utility.handleRecap(msg),
    
    // Búsquedas
    'noticias': (_, msg) => services.search.handleNews(msg),
    'oferta': (_, msg) => services.search.handleDealsSearch(msg),
    'streaming': (_, msg) => services.utility.handleStreaming(msg),
    'analiza': (client, msg) => services.fun.handleUrlAnalysis(client, msg),
    'pat': (_, msg) => services.personalSearch.handlePatenteSearch(msg),
    'audios': () => services.fun.handleAudioList(),
    
    // Diversión
    'chiste': (client, msg) => services.fun.handleJoke(client, msg),
    's': (client, msg) => services.fun.handleSticker(client, msg),
    'random': (client, msg) => handleRandomCommand(client, msg),
    'toimg': (client, msg) => handleStickerToImage(client, msg),
    
    // Tickets y casos
    'ticket': (_, msg) => services.stateful.handleTicket(msg),
    'caso': (_, msg) => services.stateful.handleCaso(msg),
    
    // IA y ayuda
    'ayuda': (_, msg) => services.ai.handleAiHelp(msg),
    'ia': (_, msg) => services.ai.handleLocalIA(msg),
    
    // Búsquedas personales
    'num': (client, msg) => services.personalSearch.handlePhoneSearch(client, msg),
    
    // Red
    'whois': (_, msg) => services.network.handleNetworkQuery(msg),
    'nic': (_, msg) => services.network.handleNicClSearch(msg),
    
    // FAP y grupos
    'fap': (client, msg) => services.fap.handleFapSearch(client, msg),
    
    // Admin
    'agregar': (client, msg) => {
        const args = msg.body.trim().split(' ').slice(1);
        return services.admin.handleAgregar(client, msg, args);
    },
    'ban': (client, msg) => {
        const args = msg.body.trim().split(' ').slice(1);
        return services.admin.handleBanTemporal(client, msg, args);
    },
    
    // Cumpleaños
    'cumpleaños': (client, msg) => {
        const args = msg.body.trim().split(' ').slice(1);
        return services.birthday.handleCumpleanos(client, msg, args);
    },
    
    // ID del chat
    'id': (_, msg) => {
        console.log('ID de este chat:', msg.from);
        msg.reply(`ℹ️ El ID de este chat es:\n${msg.from}`);
        return null;
    },

    // Contador de mensajes y actividad
    'contador': (client, msg) => services.counter.handleContador(client, msg),
    'actividad': (client, msg) => services.counter.handleActividad(client, msg),
    
    // Kast
    'kast': (_, msg) => services.kast.handleKast(msg)
};

// --- Lista de comandos válidos ---
const soundCommands = services.fun.getSoundCommands();
const countdownCommands = ['18', 'navidad', 'añonuevo'];

const validCommands = new Set([
    ...soundCommands, 
    ...countdownCommands,
    ...Object.keys(commandMap),
    ...Object.keys(commandAliases)
]);

// --- Regex Pre-compilada ---
// Para / usamos ^ (solo al inicio) para evitar falsos positivos con URLs.
// Para ! permitimos detección en cualquier parte de la frase.
const commandRegex = new RegExp(
    `^\\s*([!/])(${[...validCommands].sort((a, b) => b.length - a.length).join('|')})\\b`, 
    'i'
);

// --- Handler Principal ---
async function commandHandler(client, message) {
    const body = message.body.trim();
    
    // 1. Intentar match al inicio del mensaje (forma normal con ! o /)
    let match = body.match(/^\s*([!/])([a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ18]+)/i);
    let isInPhrase = false;

    // 2. Si no hay match al inicio, buscar !comando dentro de la frase
    //    Solo con prefijo ! (no con / para evitar falsos positivos con URLs)
    if (!match) {
        match = body.match(/(?:^|\s)(!)(([a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ18]+))/i);
        if (match) {
            // Ajustar los grupos de captura (el grupo 2 tiene el comando)
            match = [match[0], match[1], match[2]];
            isInPhrase = true;
        }
    }

    if (!match) {
        // Easter eggs (menciones al bot sin prefijo de comando)
        const lowerBody = body.toLowerCase();
        if (/\b(bot|boot|bott|bbot)\b/.test(lowerBody)) {
            return services.fun.handleBotMention(client, message);
        }
        if (/\b(once|onse|11)\b/.test(lowerBody)) {
            return services.fun.handleOnce(client, message);
        }
        return;
    }

    const prefix = match[1];
    const command = match[2].toLowerCase();

    // Si el comando NO está en la lista de comandos válidos, sugerir !menu al usuario
    if (!validCommands.has(command)) {
        console.log(`(Handler) -> Comando no reconocido: "${prefix}${command}"`);
        const senderId = message.author || message.from;
        const userNumber = senderId.replace(/\D/g, '');
        try {
            await message.reply(
                `⚠️ Hola @${userNumber}, el comando *${prefix}${command}* no existe o no se reconoce.\n📌 Escribe *!menu* para ver la lista de comandos disponibles.`,
                undefined,
                { mentions: [senderId] }
            );
        } catch (err) {
            console.error('Error al responder comando no válido:', err.message);
        }
        return;
    }

    // --- Anti-spam: detectar repeticiones (solo para comandos explícitos, no en frases) ---
    if (!isInPhrase) {
        const senderId = message.author || message.from;
        if (checkSpam(senderId, command)) {
            console.log(`(Handler) -> Spam detectado: "${prefix}${command}" por ${senderId}`);
            try {
                await message.react('🤡');
                await message.reply(`Oye calmate weon, te pican los dedos que pide tanto *${prefix}${command}* 🤡`);
            } catch (e) { }
            return;
        }
    }

    // Comandos de sonido
    if (soundCommands.includes(command)) {
        console.log(`(Handler) -> Comando de sonido recibido: "${prefix}${command}"`);
        return services.fun.handleSound(client, message, command);
    }

    // Comandos de countdown
    if (countdownCommands.includes(command)) {
        const replyMessage = services.fun.handleCountdown(command);
        return message.reply(replyMessage);
    }

    const resolvedCommand = commandAliases[command] || command;

    // Verificar si la característica está deshabilitada en la configuración
    const isDisabled = botConfig.disabledFeatures && (
        botConfig.disabledFeatures.includes(resolvedCommand) ||
        botConfig.disabledFeatures.includes(command) ||
        (command === 'audios' && botConfig.disabledFeatures.includes('sonidos'))
    );

    if (isDisabled) {
        console.log(`(Handler) -> Comando bloqueado (deshabilitado): "${prefix}${command}"`);
        return;
    }

    try {
        await handleReaction(message, (async () => {
            console.log(`(Handler) -> Comando recibido: "${prefix}${command}"`);

            const handler = commandMap[resolvedCommand];
            
            if (!handler) {
                console.warn(`Comando no encontrado en el mapa: "${resolvedCommand}"`);
                return;
            }

            const replyMessage = await handler(client, message);
            
            // Solo hacer reply si el handler retornó un STRING.
            if (replyMessage && typeof replyMessage === 'string') {
                await message.reply(replyMessage);
            }
        })());
    } catch (error) {
        console.error(`Error al procesar el comando "${prefix}${command}":`, error);
        await message.reply(`Pta algo paso, no anda ese comando ahora 😔`);
    }
}

module.exports = commandHandler;