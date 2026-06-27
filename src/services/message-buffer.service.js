"use strict";

const buffers = {};
const MAX_MESSAGES = 50;

module.exports = {
    /**
     * Añade un mensaje al buffer de un grupo específico
     */
    addMessage(groupId, message) {
        if (!buffers[groupId]) {
            buffers[groupId] = [];
        }
        buffers[groupId].push(message);
        
        if (buffers[groupId].length > MAX_MESSAGES) {
            buffers[groupId].shift();
        }
    },

    getMessages(groupId) {
        return buffers[groupId] || [];
    }
};