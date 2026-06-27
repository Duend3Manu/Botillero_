// src/handlers/search.handler.js
"use strict";

const axios = require('axios');
const cheerio = require('cheerio');
const { MessageMedia } = require('../adapters/wwebjs-adapter');
const config = require('../config');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimiter = require('../services/rate-limiter.service');

// IA de producción
const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
const genAI = (apiKey && apiKey.length > 30) ? new GoogleGenerativeAI(apiKey) : null;
const AI_MODEL = "gemini-1.5-flash";

// User-Agent compartido para todas las peticiones
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';


async function handleNews(message) {
    try {
        await message.react('⏳');
        const response = await axios.get('http://chile.infoflow.cloud/p.php/infoflow2017/noticias-nacionales');
        const html = response.data;
        const $ = cheerio.load(html);

        let newsText = $('body').text().trim();
        newsText = newsText.replace(/editor-card/g, '');
        newsText = newsText.replace(/\n\s*\n/g, '\n\n');

        await message.react('📰');
        return "📰 *Noticias Nacionales - Última Hora:*\n\n" + newsText;
    } catch (error) {
        console.error('Error al obtener las noticias:', error);
        await message.react('❌');
        return 'Lo siento, no pude obtener las noticias en este momento.';
    }
}


// ─────────────────────────────────────────────
// BÚSQUEDA DE OFERTAS (SoloTodo + Knasta + Descuentos Rata)
// ─────────────────────────────────────────────
const { searchAllDeals, formatPrice } = require('../services/deals.service');

async function handleDealsSearch(message) {
    const searchTerm = message.body.replace(/^([!/])oferta\s*/i, '').trim();

    if (!searchTerm) {
        return '🛒 Escribe un producto para buscar ofertas. Ejemplo: `!oferta zapatillas nike`';
    }

    try {
        await message.react('⏳');

        const results = await searchAllDeals(searchTerm);

        if (!results || results.length === 0) {
            await message.react('❌');
            return `😕 No encontré ofertas para *"${searchTerm}"* en este momento. Intenta con otro término.`;
        }

        let msg = `🔍 Ofertas para *"${searchTerm}"*\n`;
        msg += `_(${results.length} resultado${results.length !== 1 ? 's' : ''}, ordenados por mayor descuento)_\n\n`;

        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

        results.forEach((p, i) => {
            const discountStr = p.descuento > 0 ? ` — *-${p.descuento}%* 🔥` : '';
            const precioStr   = formatPrice(p.precio);
            const anterior    = p.precioOriginal && p.precioOriginal > p.precio
                ? ` _(antes ${formatPrice(p.precioOriginal)})_`
                : '';

            msg += `${emojis[i] || `${i + 1}.`} *${p.nombre}*${discountStr}\n`;
            msg += `   💰 ${precioStr}${anterior}\n`;
            msg += `   🏪 ${p.tienda} | ${p.fuente}\n`;
            msg += `   🔗 ${p.url}\n\n`;
        });

        await message.react('✅');
        return msg.trim();

    } catch (err) {
        console.error('[handleDealsSearch] Error:', err.message);
        await message.react('❌');
        return 'Ocurrió un error al buscar ofertas. Intenta nuevamente.';
    }
}

module.exports = {
    handleNews,
    handleDealsSearch
};