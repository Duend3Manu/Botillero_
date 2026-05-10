// src/services/message-buffer.service.js
"use strict";

const fs = require('fs');
const path = require('path');

/**
 * Servicio para almacenar los últimos N mensajes de cada grupo.
 * Implementa buffer circular FIFO (First In, First Out).
 * Los datos se persisten en disco para sobrevivir reinicios del bot.
 */

const MAX_MESSAGES_PER_GROUP = 30;
const BUFFER_FILE = path.join(__dirname, '..', 'data', 'message_buffer.json');

// -----------------------------------------------------------------------
// Persistencia en disco
// -----------------------------------------------------------------------

/** Carga el buffer desde disco. Si no existe o falla, retorna Map vacío. */
function loadBuffer() {
    try {
        if (!fs.existsSync(BUFFER_FILE)) return new Map();
        const raw = fs.readFileSync(BUFFER_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // JSON no serializa Map, lo guardamos como objeto plano
        const map = new Map();
        for (const [groupId, messages] of Object.entries(parsed)) {
            map.set(groupId, messages);
        }
        console.log(`(Buffer) -> Cargados buffers de ${map.size} grupo(s) desde disco`);
        return map;
    } catch (e) {
        console.error('(Buffer) -> Error al leer buffer desde disco:', e.message);
        return new Map();
    }
}

/** Guarda el buffer en disco. Se usa un write con debounce para no thrash el disco. */
let saveTimer = null;
function scheduleBufferSave(groupBuffers) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            const obj = {};
            for (const [groupId, messages] of groupBuffers.entries()) {
                obj[groupId] = messages;
            }
            fs.writeFileSync(BUFFER_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch (e) {
            console.error('(Buffer) -> Error al guardar buffer en disco:', e.message);
        }
    }, 3000); // Espera 3s antes de escribir (batching)
}

// Map<groupId, Array<MessageData>>
const groupBuffers = loadBuffer();

// -----------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------

/**
 * Agrega un mensaje al buffer del grupo.
 * Si el buffer supera MAX_MESSAGES_PER_GROUP, elimina el más antiguo.
 * @param {string} groupId - ID del grupo
 * @param {Object} messageData - Datos del mensaje
 */
function addMessage(groupId, messageData) {
    if (!groupBuffers.has(groupId)) {
        groupBuffers.set(groupId, []);
    }

    const buffer = groupBuffers.get(groupId);

    // Agregar mensaje al final
    buffer.push(messageData);

    // Si supera el límite, eliminar el más antiguo (FIFO)
    if (buffer.length > MAX_MESSAGES_PER_GROUP) {
        buffer.shift();
    }

    console.log(`(Buffer) -> Grupo ${groupId.slice(0, 15)}...: ${buffer.length}/${MAX_MESSAGES_PER_GROUP} mensajes`);

    // Persistir en disco (con debounce de 3s)
    scheduleBufferSave(groupBuffers);
}

/**
 * Obtiene los mensajes del buffer de un grupo.
 * @param {string} groupId - ID del grupo
 * @returns {Array} Array de mensajes
 */
function getMessages(groupId) {
    if (!groupBuffers.has(groupId)) {
        return [];
    }
    return groupBuffers.get(groupId);
}

/**
 * Limpia el buffer de un grupo.
 * @param {string} groupId - ID del grupo
 */
function clearBuffer(groupId) {
    groupBuffers.delete(groupId);
    scheduleBufferSave(groupBuffers);
    console.log(`(Buffer) -> Buffer del grupo ${groupId.slice(0, 15)}... limpiado`);
}

/**
 * Obtiene estadísticas del buffer.
 * @returns {Object} Estadísticas
 */
function getStats() {
    const stats = {
        totalGroups: groupBuffers.size,
        groups: []
    };

    for (const [groupId, buffer] of groupBuffers.entries()) {
        stats.groups.push({
            groupId: groupId.slice(0, 15) + '...',
            messageCount: buffer.length
        });
    }

    return stats;
}

module.exports = {
    addMessage,
    getMessages,
    clearBuffer,
    getStats,
    MAX_MESSAGES_PER_GROUP
};
