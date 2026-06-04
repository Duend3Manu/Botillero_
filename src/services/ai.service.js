"use strict";

const axios = require('axios');

/**
 * Envía una consulta al servicio local de Qwen (FastAPI)
 * @param {string} prompt El texto a procesar
 * @returns {Promise<string>} La respuesta del modelo
 */
async function getLocalAIResponse(prompt) {
    try {
        const response = await axios.post('http://localhost:8000/ask', {
            message: prompt
        }, { 
            timeout: 35000 // Los Xeon son potentes, pero la IA requiere tiempo
        });

        return response.data.reply;
    } catch (error) {
        console.error("(AIService) -> Error en conexión local:", error.message);
        return "⚠️ Mi módulo de pensamiento local (Qwen) no está respondiendo. Verifica que el engine de Python esté corriendo.";
    }
}

module.exports = { getLocalAIResponse };