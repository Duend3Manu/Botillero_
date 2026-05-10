// src/services/message-counter.service.js
"use strict";

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'message_counters.json');

// -----------------------------------------------------------------------
// Persistencia en disco
// -----------------------------------------------------------------------

/** Carga los contadores desde disco. Si no existe el archivo, retorna {}. */
function loadCounters() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('(Counter) -> Error al leer counters.json:', e.message);
        return {};
    }
}

/** Guarda los contadores en disco (síncrono, seguro para volumen de WhatsApp). */
function saveCounters(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('(Counter) -> Error al guardar counters.json:', e.message);
    }
}

// Cache en memoria para no leer disco en cada mensaje
let countersCache = loadCounters();

// -----------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------

/**
 * Registra un mensaje de un usuario en un grupo.
 * @param {string} groupId   - ID del grupo (ej: "1234567890@g.us")
 * @param {string} userId    - ID del usuario (ej: "56912345678@c.us")
 * @param {string} userName  - Nombre o alias del usuario
 * @param {string} msgType   - Tipo de mensaje: 'chat'|'audio'|'image'|'video'|'document'|'ptt'|etc.
 */
function recordMessage(groupId, userId, userName, msgType = 'chat') {
    if (!groupId || !userId) return;

    if (!countersCache[groupId]) countersCache[groupId] = {};

    const group = countersCache[groupId];

    if (!group[userId]) {
        group[userId] = { name: userName, count: 0, lastSeen: Date.now() };
    }

    // Actualizar nombre si cambió
    if (userName && group[userId].name !== userName) {
        group[userId].name = userName;
    }

    group[userId].count++;
    group[userId].lastSeen = Date.now();

    saveCounters(countersCache);
}

/**
 * Retorna la lista de usuarios de un grupo, ordenada por mensajes descendente.
 * @param {string} groupId
 * @returns {Array<{userId, name, count, lastSeen}>}
 */
function getCounters(groupId) {
    if (!countersCache[groupId]) return [];

    return Object.entries(countersCache[groupId])
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Retorna el timestamp de última actividad de un usuario en un grupo.
 * @param {string} groupId
 * @param {string} userId
 * @returns {number|null} timestamp en ms, o null si no hay registro
 */
function getLastSeen(groupId, userId) {
    if (!countersCache[groupId]) return null;
    if (!countersCache[groupId][userId]) return null;
    return countersCache[groupId][userId].lastSeen;
}

/**
 * Retorna todos los grupos registrados.
 */
function getAllGroups() {
    return Object.keys(countersCache);
}

/**
 * Resetea el contador de un grupo (solo para admins).
 * @param {string} groupId
 */
function resetGroup(groupId) {
    if (countersCache[groupId]) {
        delete countersCache[groupId];
        saveCounters(countersCache);
        return true;
    }
    return false;
}

module.exports = {
    recordMessage,
    getCounters,
    getLastSeen,
    getAllGroups,
    resetGroup
};
