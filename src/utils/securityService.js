"use strict";

const axios = require('axios');
const db = require('./db');
require('dotenv').config();

// 🔑 Se recomienda configurar VIRUSTOTAL_API_KEY en tu archivo .env
const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY;

const LIMITS = {
    MIN: 4,
    DAY: 500,
    MONTH: 15500
};

/**
 * Verifica y actualiza los límites de la API en la base de datos.
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkAndIncrementApiLimits() {
    const now = Date.now();
    const usage = db.getApiUsage('virustotal');

    // Lógica de Resets
    const isNewMinute = now > usage.minute_reset;
    const isNewDay = now > usage.day_reset;
    const isNewMonth = now > usage.month_reset;

    const newUsage = {
        service: 'virustotal',
        minute_count: isNewMinute ? 0 : usage.minute_count,
        minute_reset: isNewMinute ? now + (60 * 1000) : usage.minute_reset,
        day_count: isNewDay ? 0 : usage.day_count,
        day_reset: isNewDay ? now + (24 * 60 * 60 * 1000) : usage.day_reset,
        month_count: isNewMonth ? 0 : usage.month_count,
        month_reset: isNewMonth ? now + (30 * 24 * 60 * 60 * 1000) : usage.month_reset
    };

    // Validaciones
    if (newUsage.minute_count >= LIMITS.MIN) {
        return { allowed: false, reason: 'minuto (máx 4)' };
    }
    if (newUsage.day_count >= LIMITS.DAY) {
        return { allowed: false, reason: 'día (máx 500)' };
    }
    if (newUsage.month_count >= LIMITS.MONTH) {
        return { allowed: false, reason: 'mes (máx 15.5K)' };
    }

    // Incrementar
    newUsage.minute_count++;
    newUsage.day_count++;
    newUsage.month_count++;

    db.updateApiUsage(newUsage);
    return { allowed: true };
}

/**
 * Formatea el timestamp de VirusTotal a un formato legible.
 */
function formatearFecha(timestampSegundos) {
    if (!timestampSegundos) return 'No registrada';
    const d = new Date(timestampSegundos * 1000); 
    const pad = (n) => String(n).padStart(2, '0');
    
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Expansor de URLs (Anti-Acortadores) usando peticiones HEAD.
 */
async function obtenerUrlReal(urlOriginal) {
    try {
        const respuesta = await axios.head(urlOriginal, { 
            maxRedirects: 5,
            timeout: 5000,
            headers: { 'User-Agent': 'BotilleroScanner/1.0' }
        });
        return respuesta.request.res.responseUrl || urlOriginal;
    } catch (error) {
        // Si falla el HEAD (algunos sitios lo bloquean), devolvemos la original
        return urlOriginal;
    }
}

/**
 * Envía una URL desconocida para que VirusTotal comience a analizarla.
 */
async function solicitarNuevoAnalisis(url) {
    try {
        const limitCheck = await checkAndIncrementApiLimits();
        if (!limitCheck.allowed) {
            return false;
        }

        const params = new URLSearchParams();
        params.append('url', url);

        await axios.post('https://www.virustotal.com/api/v3/urls', params, {
            headers: {
                'x-apikey': VIRUSTOTAL_API_KEY,
                'accept': 'application/json',
                'content-type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
        });
        return true;
    } catch (error) {
        console.error("(SecurityService) -> Error al solicitar nuevo análisis:", error.message);
        return false;
    }
}

/**
 * Función Principal: El Scanner Pro
 */
async function analizarPeligroUrlPro(urlUsuario) {
    try {
        if (!VIRUSTOTAL_API_KEY) {
            console.error("❌ ERROR: VIRUSTOTAL_API_KEY no está definida. Verifica tu archivo .env");
            return "❌ El bot no tiene configurada la llave de seguridad (API Key). Por favor, configúrala en el archivo `.env`.";
        }

        const limitCheck = await checkAndIncrementApiLimits();
        if (!limitCheck.allowed) {
            return `⏳ *Límite de API alcanzado*\n\nBoTillero ha llegado al límite de consultas por ${limitCheck.reason}.\n\nPor favor, espera un momento antes de analizar otro enlace.`;
        }

        // 1. Verificar si es un enlace acortado y obtener el real
        const urlFinal = await obtenerUrlReal(urlUsuario);
        const huboRedireccion = urlUsuario !== urlFinal;

        // 2. Convertir la URL a base64url (requisito de VirusTotal v3)
        const urlBase64 = Buffer.from(urlFinal).toString('base64url');

        // 3. Configurar la petición a VirusTotal
        const opciones = {
            method: 'GET',
            url: `https://www.virustotal.com/api/v3/urls/${urlBase64}`,
            headers: {
                'accept': 'application/json',
                'x-apikey': VIRUSTOTAL_API_KEY
            }
        };

        // 4. Ejecutar el análisis
        const respuesta = await axios.request(opciones);
        const atributos = respuesta.data.data.attributes;
        
        const stats = atributos.last_analysis_stats;
        const resultadosMotores = atributos.last_analysis_results;
        
        // 5. Extraer estadísticas
        const maliciosos = stats.malicious;
        const sospechosos = stats.suspicious;
        const limpios = stats.harmless;
        const totalAnalizados = maliciosos + sospechosos + limpios + stats.undetected;

        const vecesReportada = atributos.times_submitted || 1;
        const ultimoAnalisis = formatearFecha(atributos.last_submission_date);
        const reputacion = atributos.reputation || 0;

        // 6. Identificar tipos de amenazas
        const tiposDetectados = new Set();
        for (const motor in resultadosMotores) {
            if (resultadosMotores[motor].category === 'malicious' && resultadosMotores[motor].result) {
                const resultado = resultadosMotores[motor].result;
                tiposDetectados.add(resultado.charAt(0).toUpperCase() + resultado.slice(1));
            }
        }
        const listaAmenazas = tiposDetectados.size > 0 ? Array.from(tiposDetectados).join(', ') : 'No especificado';

        // 7. Construir el mensaje final para WhatsApp
        let mensajeWhatsApp = `🔍 *SCANNER PRO DE BOTILLERO*\n\n`;
        
        if (huboRedireccion) {
            mensajeWhatsApp += `🕵️‍♂️ *Enlace Oculto Detectado:*\n`;
            mensajeWhatsApp += `El enlace original redirigía a otro sitio. BoTillero ha analizado el destino real:\n`;
            mensajeWhatsApp += `🔗 *Destino:* \`${urlFinal}\`\n\n`;
        } else {
            mensajeWhatsApp += `🔗 *Enlace:* \`${urlFinal}\`\n\n`;
        }
        
        mensajeWhatsApp += `📊 *Datos de la Base de Seguridad:*\n`;
        mensajeWhatsApp += ` 📥 *Consultas globales:* ${vecesReportada} ${vecesReportada === 1 ? 'vez' : 'veces'}\n`;
        mensajeWhatsApp += ` 🕒 *Último escaneo:* ${ultimoAnalisis}\n`;
        mensajeWhatsApp += ` 📈 *Reputación:* ${reputacion >= 0 ? '👍' : '👎'} (${reputacion} puntos)\n\n`;

        mensajeWhatsApp += `🛡️ *Veredicto Final:*\n`;

        if (maliciosos > 0 || sospechosos > 0) {
            mensajeWhatsApp += `🚨 *¡ALERTA DE SEGURIDAD MÁXIMA!* 🚨\n\n`;
            mensajeWhatsApp += `❌ *Peligro:* ${maliciosos + sospechosos} de ${totalAnalizados} antivirus bloquearon esta web.\n`;
            mensajeWhatsApp += `🎯 *Categoría:* ${listaAmenazas}\n\n`;
            mensajeWhatsApp += `🛑 *Acción recomendada:* Es un sitio malicioso diseñado para estafas o virus. *NO ABRAS ESTE ENLACE BAJO NINGUNA CIRCUNSTANCIA.*`;
        } else {
            mensajeWhatsApp += `✅ *SITIO LIMPIO Y SEGURO*\n\n`;
            mensajeWhatsApp += `🟢 ${totalAnalizados} motores de seguridad verificaron la página y no encontraron malware ni phishing.\n`;
            mensajeWhatsApp += `👌 Puedes navegar con tranquilidad.`;
        }

        return mensajeWhatsApp;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            // Si no existe, solicitamos que se analice ahora mismo
            await solicitarNuevoAnalisis(urlUsuario);
            
            return `⚠️ *URL Desconocida (Escaneo Iniciado)*\n\nEsta página no estaba en los registros de seguridad globales.\n\n✅ BoTillero ya envió el enlace a VirusTotal para un análisis profundo. Intenta consultarlo de nuevo con el comando en **1 o 2 minutos**.\n\n🛑 *Recomendación:* No abras el sitio hasta tener el veredicto final.`;
        }
        console.error("Error detallado en VirusTotal:", error.response ? error.response.data : error.message);
        return `❌ Error técnico al consultar los servidores de análisis (${error.response ? error.response.status : 'timeout'}). Inténtalo de nuevo más tarde.`;
    }
}

module.exports = { analizarPeligroUrlPro };