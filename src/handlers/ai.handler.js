"use strict";

const aiService = require('../services/ai.service');

/**
 * Maneja la interacción con la IA local
 */
async function handleLocalIA(msg) {
    const prompt = msg.body.replace(/^[!/]ia/i, '').trim();

    if (!prompt) {
        return "🤖 ¿En qué puedo ayudarte? Escribe algo después del comando.\n\nEjemplo: `!ia haz un script de suma en js` ";
    }

    try {
        // Feedback visual
        await msg.react('🧠');
        
        const response = await aiService.getLocalAIResponse(prompt);
        
        return response;
    } catch (error) {
        console.error("Error en handleLocalIA:", error);
        return "❌ Tuve un error interno al intentar pensar esa respuesta.";
    }
}

/**
 * Otros métodos de IA que ya tenías referenciados
 */
async function handleAiHelp(msg) {
    return "Para usar mi IA local, usa el comando `!ia [tu pregunta]`. Soy experto en programación y lógica técnica.";
}

async function handleSummary(msg) {
    return "Esta función de resumen se implementará próximamente usando Qwen.";
}

module.exports = {
    handleLocalIA,
    handleAiHelp,
    handleSummary
};