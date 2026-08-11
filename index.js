// index.js (VERSIÓN WHATSAPP)
"use strict";

require('dotenv').config();

// --- Manejo de Errores Globales ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const sourceHealth = require('./src/services/source-health.service');
const qrcode = require('qrcode-terminal');
const { handleMessageCreate, handleMessageRevoke, handleMessageUpdate, handleGroupJoin } = require('./src/handlers/events.handler');
const commandHandler = require('./src/handlers/command.handler');
const { addToMediaCache } = require('./src/handlers/fun.handler');
const { incrementStats } = require('./src/handlers/system.handler');
const messageBuffer = require('./src/services/message-buffer.service');
const messageCounter = require('./src/services/message-counter.service');
const botConfig = require('./config/bot.config');
const logger = require('./src/utils/logger');
require('./src/api/admin-server').startAdminServer();

// Valor por defecto para integraciones externas; cada servicio puede definir uno menor.
axios.defaults.timeout = Number(process.env.HTTP_TIMEOUT_MS || 15000);
axios.defaults.maxContentLength = 15 * 1024 * 1024;
axios.interceptors.response.use(
    response => { sourceHealth.recordSuccess(response.config.url); return response; },
    error => { sourceHealth.recordFailure(error.config?.url, error).catch(() => {}); return Promise.reject(error); }
);

console.log("🚀 Iniciando Botillero v2.0...");

// --- CONFIGURACIÓN DEL CLIENTE ---
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: botConfig.authStrategy.clientId,
        dataPath: botConfig.authStrategy.dataPath
    }),
    puppeteer: botConfig.puppeteer,
    webVersionCache: botConfig.webVersionCache,
    ffmpegPath: process.env.FFMPEG_PATH || undefined
});

// --- EVENTOS DE CONEXIÓN ---
client.on('qr', qr => {
    console.log('📱 QR listo para escanear:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ ¡Bot conectado y listo!');
    const { startLunesVideoScheduler, startBirthdayScheduler } = require('./src/services/schedule.service');
    startLunesVideoScheduler(client);
    startBirthdayScheduler(client);
    require('./src/services/scheduled-tasks.service').startScheduledTaskRunner(client);
    require('./src/services/backup.service').startBackupScheduler();
    sourceHealth.configureNotifier(client, botConfig.notificationGroupId || process.env.NOTIFICATION_GROUP_ID);
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

let reconnectTimer = null;
client.on('disconnected', (reason) => {
    console.log('⚠️  Bot desconectado:', reason);
    console.log('🔄 Intentando reconectar en 10 segundos...');
    
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        console.log('🔄 Reiniciando cliente...');
        client.initialize().catch(err => {
            console.error('❌ Error al reconectar:', err);
        });
    }, 10000);
});

// --- MANEJADOR DE MENSAJES ---
client.on('message_create', async (message) => {
    const startTime = Date.now();

    const hasBody = message.body && message.body.trim().length > 0;
    const hasMedia = message.hasMedia;

    // Si no tiene ni texto ni media, ignorar (mensajes de sistema, etc.)
    if (!hasBody && !hasMedia) return;

    // Evitar auto-respuestas infinitas a frases normales, pero permitir probar comandos (! o /)
    if (message.fromMe && !(hasBody && (message.body.startsWith('!') || message.body.startsWith('/')))) return;

    // Ejecutar handleMessageCreate para logging/analytics (solo mensajes con texto)
    if (hasBody) {
        handleMessageCreate(client, message).catch(err => {
            console.error('Error en handleMessageCreate:', err.message);
        });
    }

    // Procesar mensajes (incluyendo los del bot para pruebas si empieza con ! o /)
    incrementStats('message', message.from);

    // Registrar en buffer (!recap) y en contador de mensajes (!contador / !actividad)
    const isCommand = hasBody && (
        /^\s*[!/][a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ18]+/.test(message.body) ||   // Comando al inicio
        /\s![a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ18]+/.test(message.body)            // !comando dentro de frase
    );
    if (!isCommand) {
        // El registro en buffer y contador ya se maneja dentro de handleMessageCreate
        // para evitar duplicidad y asegurar limpieza de IDs.
    }

    // Pre-cachear media de mensajes entrantes para fallback de !s
    if (hasMedia && !isCommand) {
        message.downloadMedia().then(media => {
            if (media) {
                addToMediaCache(message.id._serialized || message.id, media, media.mimetype, message.from);
            }
        }).catch(() => { /* silencioso, solo es pre-caché */ });
    }

    // Procesar comandos y frases (solo si tiene texto)
    if (!hasBody) return;

    try {
        if (isCommand) {
            incrementStats('command', message.from);
        }
        await commandHandler(client, message);
    } catch (error) {
        console.error(`❌ Error procesando mensaje:`, error.message);
    }

    const processingTime = Date.now() - startTime;
    if (isCommand) {
        console.log(`⏱️  Comando procesado en ${processingTime}ms`);
    }
});

client.on('message_revoke_everyone', (after, before) => handleMessageRevoke(client, after, before));
client.on('message_update', message => handleMessageUpdate(client, message));
client.on('group_join', notification => handleGroupJoin(client, notification));

// --- CIERRE ELEGANTE ---
let isShuttingDown = false;
async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Cerrando bot', { signal });
    require('./src/services/message-counter.service').flushCounters();
    process.emit('botillero:shutdown');
    console.log('\n🛑 Cerrando bot...');
    try {
        await client.destroy();
        console.log('✅ Cliente cerrado correctamente.');
    } catch (e) {
        console.error('❌ Error al cerrar cliente:', e);
    }
    process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- INICIAR CLIENTE ---
client.initialize();

setTimeout(() => {
    console.log('\n💡 Recordatorio: Usa prefijo ! para comandos: !menu, !sonido, !horoscopo, etc.');
}, 3000);
