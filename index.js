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
const qrcode = require('qrcode-terminal');
const { handleMessageCreate, handleMessageRevoke, handleMessageUpdate } = require('./src/handlers/events.handler');
const commandHandler = require('./src/handlers/command.handler');
const { incrementStats } = require('./src/handlers/system.handler');
const messageBuffer = require('./src/services/message-buffer.service');
const messageCounter = require('./src/services/message-counter.service');
const botConfig = require('./config/bot.config');

console.log("🚀 Iniciando Botillero v2.0...");

// --- CONFIGURACIÓN DEL CLIENTE ---
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: botConfig.authStrategy.clientId,
        dataPath: botConfig.authStrategy.dataPath
    }),
    puppeteer: botConfig.puppeteer
});

// --- EVENTOS DE CONEXIÓN ---
client.on('qr', qr => {
    console.log('📱 QR listo para escanear:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ ¡Bot conectado y listo!');
    const { startLunesVideoScheduler } = require('./src/services/schedule.service');
    startLunesVideoScheduler(client);
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('⚠️  Bot desconectado:', reason);
    console.log('🔄 Intentando reconectar en 10 segundos...');
    
    setTimeout(() => {
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

    // Evitar auto-respuestas infinitas a frases normales, pero permitir probar comandos (!)
    if (message.fromMe && !(hasBody && message.body.startsWith('!'))) return;

    // Ejecutar handleMessageCreate para logging/analytics (solo mensajes con texto)
    if (hasBody) {
        handleMessageCreate(client, message).catch(err => {
            console.error('Error en handleMessageCreate:', err.message);
        });
    }

    // Procesar mensajes (incluyendo los del bot para pruebas si empieza con !)
    incrementStats('message', message.from);

    // Registrar en buffer (!recap) y en contador de mensajes (!contador / !actividad)
    const isCommand = hasBody && message.body.startsWith('!');
    if (!isCommand) {
        // El registro en buffer y contador ya se maneja dentro de handleMessageCreate
        // para evitar duplicidad y asegurar limpieza de IDs.
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

// --- CIERRE ELEGANTE ---
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando bot...');
    try {
        await client.destroy();
        console.log('✅ Cliente cerrado correctamente.');
    } catch (e) {
        console.error('❌ Error al cerrar cliente:', e);
    }
    process.exit(0);
});

// --- INICIAR CLIENTE ---
client.initialize();

setTimeout(() => {
    console.log('\n💡 Recordatorio: Usa prefijo ! para comandos: !menu, !sonido, !horoscopo, etc.');
}, 3000);