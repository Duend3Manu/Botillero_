/**
 * Servicio mejorado de Metro con análisis inteligente
 * Usa IA para sugerir rutas alternativas cuando hay problemas
 */
"use strict";

const pythonService = require('./python.service');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const rateLimiter = require('./rate-limiter.service');

const METRO_SCRIPT_NAME = 'metro.py';
// Inicializamos solo si hay key, para evitar errores si no está configurada
const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
const genAI = (apiKey && apiKey.length > 30) ? new GoogleGenerativeAI(apiKey) : null;

// Variables para caché (evita ejecutar Python/IA innecesariamente)
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
 * Genera recomendaciones inteligentes basadas en el estado del metro
 */
async function generateMetroAdvice(metroStatus) {
    if (!genAI) {
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
Eres "Botillero", un asistente inteligente de Metro. Analiza el siguiente estado del Metro de Santiago y da CONSEJO CORTO y PRÁCTICO.

Estado actual del Metro:
${metroStatus}

Tu tarea:
1. Si TODO está normal: Responde "✅ Metro operando normal, compa."
2. Si hay PROBLEMAS: Identifica qué líneas están fallando
3. Da UNA alternativa de ruta rápida (máximo 1-2 líneas de recomendación)
4. Usa lenguaje coloquial chileno
5. Responde SOLO el consejo, sin explicaciones adicionales
6. Máximo 2 líneas

Ejemplo de respuesta:
"⚠️ Línea 1 con delays. Usa L4 hacia Mapocho, luego L2 a Puente Cal y Canto."
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error al generar consejo del metro:', error.message);
        return null;
    }
}

/**
 * Función principal mejorada de Metro
 */
async function getMetroStatus() {
    // 1. Revisar caché: Si tenemos datos recientes (menos de 1 min), los devolvemos directo
    if (metroCache && (Date.now() - lastUpdate < CACHE_TTL)) {
        return metroCache;
    }

    try {
        // Primero obtener el estado bruto
        const metroStatus = await getMetroStatusRaw();
        
        if (!metroStatus) {
            return "⚠️ No pude obtener el estado del metro en este momento.";
        }

        let response = metroStatus;

        // Si hay problemas detectados y no estamos en cooldown, agregar análisis con IA
        const lowerStatus = metroStatus.toLowerCase();
        const errorKeywords = ['problema', 'delay', 'suspendido', 'cierre', 'retraso', 'falla', 'interrupción', 'cerrada', 'parcial'];
        
        if (errorKeywords.some(keyword => lowerStatus.includes(keyword))) {
            
            const limit = rateLimiter.tryAcquire();
            if (limit.success && genAI) {
                try {
                    const advice = await generateMetroAdvice(metroStatus);
                    if (advice) {
                        response += `\n\n💡 *Consejo:* ${advice}`;
                    }
                } catch (error) {
                    console.error('Error al generar consejo (no crítico):', error.message);
                    // Continuar sin consejo, no es crítico
                }
            }
        }

        // Guardamos en caché antes de retornar
        metroCache = response;
        lastUpdate = Date.now();

        return response;
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
            
            // Intentar agregar consejo IA para rutas alternativas
            if (genAI) {
                try {
                    const advice = await generateMetroAdvice(status);
                    if (advice) messageToSend += `\n\n💡 *Consejo:* ${advice}`;
                } catch (e) {}
            }

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