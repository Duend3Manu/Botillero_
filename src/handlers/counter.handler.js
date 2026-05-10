// src/handlers/counter.handler.js
"use strict";

const messageCounter = require('../services/message-counter.service');

// -----------------------------------------------------------------------
// Frases de broma chilena cuando el usuario estuvo activo RECIENTEMENTE
// (menos de 15 minutos)
// -----------------------------------------------------------------------
const frasesReciente = [
    'mira bien pajaron ql, escribió hace poco po wn, ¿ están ciegos o qué?',
    'oiga weón, estuvo activo recién, ábranse los ojos ctm',
    '¿en serio me preguntai eso? ¡acaba de mandar cosas! ¿están de vacaciones cerebrales?',
    'jajaja qliao, si acabó de escribir, ¿qué más querís saber?',
    'cuéntame más sobre cómo no lo viste escribir... fue hace nada, perkin',
    'ufff compadre, ¿con qué ojo lo estabai mirando? escribió recién po',
    'bájate del columpio wn, si estuvo activo hace un rato nomás, ¿dormiste mal?',
    'oye genio, si está activo todavía prácticamente, ¿qué wea me estás preguntando?',
    'jajaja, ¿y vo creís que tení razón? escribió hace poquito po weon',
    'mira weón, si hasta yo lo vi escribir y soy un bot, ábranse los ojos'
];

// Frases cuando ya pasó un rato pero menos de 24h
const frasesNormal = [
    'estuvo activo hace',
    'pasó por acá hace',
    'fue visto hace',
    'mandó algo hace',
    'dejó rastros hace'
];

function getFraseReciente() {
    return frasesReciente[Math.floor(Math.random() * frasesReciente.length)];
}

function getFraseNormal() {
    return frasesNormal[Math.floor(Math.random() * frasesNormal.length)];
}

// -----------------------------------------------------------------------
// Helper: formatea millisegundos a HH:MM
// -----------------------------------------------------------------------
function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} hrs`;
    }
    if (minutes > 0) {
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')} min`;
    }
    return `${String(secs).padStart(2, '0')} seg`;
}

// -----------------------------------------------------------------------
// Medallas para el ranking
// -----------------------------------------------------------------------
function getMedal(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return '  ';
}

// -----------------------------------------------------------------------
// !contador — Ranking de mensajes del grupo actual
// -----------------------------------------------------------------------
async function handleContador(client, message) {
    try {
        const chat = await message.getChat();
        if (!chat.isGroup) {
            return '⚠️ Este comando solo funciona en grupos.';
        }

        const groupId = message.from;
        const counters = messageCounter.getCounters(groupId);

        if (counters.length === 0) {
            return '📊 Aún no hay mensajes registrados en este grupo. ¡Hablen algo primero!';
        }

        await message.react('📊');

        const totalMsgs = counters.reduce((sum, u) => sum + u.count, 0);

        // Construir lista y armar menciones
        const mentions = counters.map(u => u.userId);
        let lines = '';

        counters.forEach((user, i) => {
            const pos = i + 1;
            const medal = getMedal(pos);
            const numero = user.userId.split('@')[0];
            const pct = ((user.count / totalMsgs) * 100).toFixed(1);
            lines += `${medal} ${pos}. @${numero} — *${user.count}* msgs _(${pct}%)_\n`;
        });

        const groupName = chat.name || 'este grupo';
        const response = `📊 *Contador de mensajes — ${groupName}*\n\n${lines.trim()}\n\n_Total: ${totalMsgs} mensajes contabilizados_`;

        await message.reply(response, undefined, { mentions });
        return null;

    } catch (error) {
        console.error('(Counter) -> Error en handleContador:', error);
        await message.react('❌');
        return '❌ Hubo un error al obtener el contador de mensajes.';
    }
}

// -----------------------------------------------------------------------
// !actividad [@usuario] — Última actividad de un usuario
// -----------------------------------------------------------------------
async function handleActividad(client, message) {
    try {
        const chat = await message.getChat();
        if (!chat.isGroup) {
            return '⚠️ Este comando solo funciona en grupos.';
        }

        const groupId = message.from;

        // Obtener ID del solicitante
        const requesterId = message.author || message.from;
        const requesterNumber = requesterId.split('@')[0];

        // Buscar usuario mencionado en el mensaje
        let targetId = null;
        let targetNumber = null;

        // Intentar obtener menciones del mensaje
        const mentionedIds = message.mentionedIds || [];

        if (mentionedIds.length > 0) {
            // Usar la primera mención que no sea el bot mismo
            targetId = mentionedIds[0];
            targetNumber = targetId.split('@')[0];
        } else {
            // Intentar parsear número del cuerpo del mensaje
            const bodyParsed = message.body.replace(/^[!/]actividad\s*/i, '').trim();
            if (bodyParsed) {
                // Limpiar el @, espacios, guiones
                const numClean = bodyParsed.replace(/[@\s\-]/g, '').replace(/^\+/, '');
                if (/^\d+$/.test(numClean)) {
                    targetId = `${numClean}@c.us`;
                    targetNumber = numClean;
                } else {
                    // Buscar por nombre en los contadores
                    const counters = messageCounter.getCounters(groupId);
                    const found = counters.find(u =>
                        u.name && u.name.toLowerCase().includes(bodyParsed.toLowerCase())
                    );
                    if (found) {
                        targetId = found.userId;
                        targetNumber = targetId.split('@')[0];
                    }
                }
            }
        }

        if (!targetId) {
            return `⚠️ @${requesterNumber} debes mencionar a alguien. Ej: \`!actividad @usuario\``;
        }

        const lastSeen = messageCounter.getLastSeen(groupId, targetId);

        if (!lastSeen) {
            await message.reply(
                `@${requesterNumber} no tengo registro de @${targetNumber} en este grupo. Quizás nunca ha escrito desde que empecé a llevar el conteo.`,
                undefined,
                { mentions: [requesterId, targetId] }
            );
            return null;
        }

        const elapsed = Date.now() - lastSeen;
        const QUINCE_MIN = 15 * 60 * 1000;
        const VEINTICUATRO_H = 24 * 60 * 60 * 1000;

        await message.react('👀');

        if (elapsed <= QUINCE_MIN) {
            // Activo muy recientemente → broma chilena
            const frase = getFraseReciente();
            await message.reply(
                `@${requesterNumber} ${frase} @${targetNumber}`,
                undefined,
                { mentions: [requesterId, targetId] }
            );
        } else {
            // Respuesta normal con tiempo
            const tiempoStr = formatElapsed(elapsed);
            const frase = getFraseNormal();
            const extra = elapsed > VEINTICUATRO_H ? ' 👻 (más de 24 horas)' : '';

            await message.reply(
                `@${requesterNumber}, @${targetNumber} ${frase} *${tiempoStr}*${extra}`,
                undefined,
                { mentions: [requesterId, targetId] }
            );
        }

        return null;

    } catch (error) {
        console.error('(Counter) -> Error en handleActividad:', error);
        await message.react('❌');
        return '❌ Hubo un error al consultar la actividad.';
    }
}

module.exports = {
    handleContador,
    handleActividad
};
