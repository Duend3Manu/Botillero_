/**
 * Servicio de Metro — Solo scraping, sin IA
 */
"use strict";

const pythonService = require('./python.service');

const METRO_SCRIPT_NAME = 'metro.py';

// Variables para caché (evita ejecutar Python innecesariamente)
let metroCache = null;
let lastUpdate = 0;
const CACHE_TTL = 60 * 1000; // 1 minuto de caché

let monitoringInterval = null;
let lastAlertState = false; // false = normal, true = en alerta (para no repetir mensajes)

/**
 * Obtiene el estado bruto del metro desde el script Python
 */
async function getMetroStatusRaw() {
    try {
        console.log(`(Servicio Metro) -> Ejecutando ${METRO_SCRIPT_NAME}...`);
        const result = await pythonService.executeScript(METRO_SCRIPT_NAME);
        
        if (result.code !== 0) {
            console.error(`Error al ejecutar metro.py: ${result.stderr}`);
            return null;
        }
        
        return result.stdout;
    } catch (error) {
        console.error("Error en el servicio de Metro:", error.message);
        return null;
    }
}

/**
 * Función principal del Metro — con caché, sin IA
 */
async function getMetroStatus() {
    // Revisar caché: Si tenemos datos recientes (menos de 1 min), los devolvemos directo
    if (metroCache && (Date.now() - lastUpdate < CACHE_TTL)) {
        return metroCache;
    }

    try {
        const metroStatus = await getMetroStatusRaw();
        
        if (!metroStatus) {
            return "⚠️ No pude obtener el estado del metro en este momento.";
        }

        // Guardamos en caché antes de retornar
        metroCache = metroStatus;
        lastUpdate = Date.now();

        return metroStatus;
    } catch (error) {
        console.error("Error en getMetroStatus:", error.message);
        return "⚠️ No pude obtener el estado del metro en este momento.";
    }
}

/**
 * Inicia el monitoreo automático del Metro en segundo plano.
 * @param {import('whatsapp-web.js').Client} client - Cliente de WhatsApp
 * @param {string} [chatId] - (Opcional) ID específico. Si se omite, envía a todos los grupos.
 */
function startMetroMonitoring(client, chatId = null) {
    if (monitoringInterval) clearInterval(monitoringInterval);
    
    console.log(`(Metro) -> Iniciando monitoreo automático...`);
    
    // Revisar cada 5 minutos (300000 ms)
    monitoringInterval = setInterval(async () => {
        const status = await getMetroStatusRaw();
        if (!status) return;
        
        const lowerStatus = status.toLowerCase();
        // Detectar palabras clave de cierre crítico
        const isClosed = lowerStatus.includes('cerrada') || lowerStatus.includes('cierre total') || lowerStatus.includes('suspendido');
        
        let messageToSend = null;

        if (isClosed && !lastAlertState) {
            // ESTADO: CRÍTICO (Nuevo) -> Enviamos alerta
            lastAlertState = true;
            messageToSend = `🚨 *ALERTA DE METRO* 🚨\n\nSe ha detectado un cierre o suspensión en la red:\n\n${status}`;

        } else if (!isClosed && lastAlertState) {
            // ESTADO: NORMAL (Recuperado) -> Avisamos que pasó el peligro
            lastAlertState = false;
            messageToSend = `✅ *ALERTA FINALIZADA*\n\nEl estado del Metro parece haberse normalizado (ya no se detectan cierres).`;
        }
        
        // Enviar el mensaje si corresponde
        if (messageToSend) {
            if (chatId) {
                await client.sendMessage(chatId, messageToSend);
            } else {
                // Enviar a todos los grupos donde está el bot
                try {
                    const chats = await client.getChats();
                    const groups = chats.filter(c => c.isGroup);
                    for (const group of groups) {
                        await client.sendMessage(group.id._serialized, messageToSend);
                    }
                    console.log(`(Metro) -> Alerta enviada a ${groups.length} grupos.`);
                } catch (e) {
                    console.error('(Metro) -> Error enviando alertas:', e);
                }
            }
        }

    }, 5 * 60 * 1000); 
}

module.exports = { getMetroStatus, startMetroMonitoring };