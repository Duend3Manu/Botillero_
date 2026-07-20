// src/handlers/menu.handler.js (VERSIÓN ORIGINAL RESTAURADA)
"use strict";

/**
 * Handler de menú original restaurado para WhatsApp
 */

function getMainMenu() {
    return `
╔════════════════════════════╗
   🤖 *BOTILLERO - MENÚ* 🤖
╚════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ *SERVICIOS Y CONSULTAS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☀️ \`!clima [ciudad]\` → Pronóstico del tiempo
💵 \`!valores\` → Indicadores económicos (UF, dólar, etc.)
🎉 \`!feriados\` → Próximos feriados en Chile
💊 \`!far [comuna]\` → Farmacias de turno
🚇 \`!metro\` → Estado del Metro de Santiago
🌋 \`!sismos\` → Últimos sismos reportados
⚡ \`!sec\` / \`!secrm\` → Cortes de luz (nacional/RM)
💳 \`!transbank\` → Estado servicios Transbank
📝 \`!recap\` → Resumir últimos mensajes del grupo
🔧 \`!ping\` → Estado del sistema/bot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 *BÚSQUEDAS E INFORMACIÓN*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📰 \`!noticias\` → Titulares de última hora
🚗 \`!pat [patente]\` → Info de vehículo
📱 \`!num [teléfono]\` → Info de número
🎲 \`!random\` → Dato curioso aleatorio
🍿 \`!streaming\` → Trending en Netflix, Disney+, HBO
🤝 \`!ayuda [duda]\` → Asistente IA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 *REDES Y DOMINIOS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 \`!whois [dominio/ip]\` → Consulta WHOIS
🇨🇱 \`!nic [dominio.cl]\` → Info dominio chileno

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 *ENTRETENIMIENTO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 \`!s\` → Crear sticker (responde img/video)
🎵 \`!audios\` → Lista comandos de audio
😂 \`!chiste\` → Escuchar chiste random
🖼️ \`!toimg\` → Sticker a imagen
⏳ \`!18\` / \`!navidad\` / \`!añonuevo\` → Countdowns
🔮 \`!horoscopo [signo]\` → Tu horóscopo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *GESTIÓN*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎫 \`!ticket [texto]\` → Crear ticket
✅ \`!ticketr [num]\` → Resolver ticket
❌ \`!tickete [num]\` → Eliminar ticket
👮 \`!caso [texto]\` → Registrar caso aislado
📋 \`!icaso\` → Listar casos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *TIP:* Escribe \`bot\` para interactuar conmigo 😎`.trim();
}

module.exports = {
    getMainMenu
};
