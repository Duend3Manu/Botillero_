// src/services/messaging.service.js
"use strict";

/**
 * Intenta reaccionar a un mensaje, ignorando errores si falla.
 * @param {import('whatsapp-web.js').Message} message El objeto del mensaje.
 * @param {string} reaction El emoji para reaccionar.
 */
async function tryReact(message, reaction) {
    try {
        await message.react(reaction);
    } catch (error) {
        // Ignora el error de reacción, pero lo registra como advertencia.
        console.warn(`(MessagingService) -> No se pudo reaccionar con ${reaction}: ${error.message}`);
    }
}

/**
 * Maneja el ciclo de vida de las reacciones para un comando.
 * @param {import('whatsapp-web.js').Message} message El objeto del mensaje.
 * @param {Promise<any>} commandPromise La promesa que representa la ejecución del comando.
 */
async function handleReaction(message, commandPromise, successReaction = '✅') {
    // Reaccionamos inmediatamente con reloj de arena
    await tryReact(message, '⏳');

    const startTime = Date.now();

    try {
        await commandPromise;
        
        // Esperamos un mínimo de 1.5s para que WhatsApp alcance a procesar el ⏳
        // y para evitar un error de rate-limit al cambiar la reacción muy rápido
        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) {
            await new Promise(r => setTimeout(r, 1500 - elapsed));
        }

        await tryReact(message, successReaction);
    } catch (error) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) {
            await new Promise(r => setTimeout(r, 1500 - elapsed));
        }
        await tryReact(message, '❌');
        // El error se relanza para que el manejador principal lo capture y envíe el mensaje de error.
        throw error;
    }
}

module.exports = { handleReaction, tryReact };