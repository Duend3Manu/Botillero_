// src/utils/apiService.js
"use strict";

const FormData = require('form-data');
const axios = require('axios');

/**
 * Consulta la información de una patente vehicular.
 * @param {string} patente - La patente a consultar.
 * @returns {Promise<object>} Un objeto con el resultado de la consulta.
 */
async function getPatenteDataFormatted(patente) {
    console.log(`(apiService) -> Buscando patente: ${patente}`);
    const apiUrl = `https://infoflow.cloud/patlite.php?pat=${encodeURIComponent(patente)}`;
    const maxIntentos = 5;
    let apiResponse = null;

    for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
            const response = await axios.get(apiUrl, {
                headers: { 'User-Agent': 'BotilleroBot/1.0' },
                timeout: 10000,
            });

            if (response.status === 200 && response.data && JSON.stringify(response.data).length > 10) {
                apiResponse = response.data;
                break;
            } else {
                console.warn(`(apiService) Intento ${intento}: respuesta vacía o corta para patente ${patente}. Status: ${response.status}`);
            }
        } catch (error) {
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                console.error(`(apiService) Intento ${intento}: TIMEOUT para patente ${patente}`);
            } else if (error.response) {
                console.error(`(apiService) Intento ${intento}: Error HTTP ${error.response.status} para patente ${patente}`);
            } else {
                console.error(`(apiService) Intento ${intento}: Error de red para patente ${patente} → ${error.message}`);
            }
        }
        if (intento < maxIntentos) await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!apiResponse) {
        return { error: true, message: `😕 Lo siento, el sistema está con alta demanda y no pude obtener los datos de la patente.\nPor favor, intenta nuevamente en unos minutos.` };
    }

    // Validar que la estructura de la respuesta sea la esperada
    if (apiResponse.valido === true && apiResponse.info && typeof apiResponse.info.Respuesta === 'object' && apiResponse.info.Respuesta !== null) {
        const info = apiResponse.info.Respuesta;
        const formatear = (valor, fallback = 'No disponible') => (valor && String(valor).trim() !== '') ? String(valor).trim() : fallback;

        let roboMsg = '';
        if (info.ROBO_IG && info.ROBO_IG.tiene_activa) {
            roboMsg = `\n\n🚨 *ALERTA: VEHÍCULO CON ENCARGO POR ROBO* 🚨`;
            if (info.ROBO_IG.publicaciones && info.ROBO_IG.publicaciones.length > 0) {
                roboMsg += `\n🔗 *Fuente:* ${info.ROBO_IG.publicaciones[0].url}`;
            }
        } else if (info.ROBO_IG && info.ROBO_IG.ok) {
            roboMsg = `\n\n✅ *Sin encargo por robo en redes sociales*`;
        }

        let prtMsg = '';
        if (info.PRT_FECHA) {
            prtMsg = `\n\n🛠️ *Revisión Técnica (PRT)*\n` +
                     `📅 *Fecha PRT:* ${formatear(info.PRT_FECHA)}\n` +
                     `🏢 *Planta:* ${formatear(info.PRT_PLANTA)}\n` +
                     `⛽ *Combustible:* ${formatear(info.PRT_COMBUSTIBLE)}\n` +
                     `🛣️ *Kilometraje:* ${formatear(info.PRT_KILOMETRO)}\n` +
                     `📋 *Servicio:* ${formatear(info.PRT_SERVICIO)}`;
        }

        const mensaje =
`🚗 *Información de la Patente*
🔍 *Patente:* ${formatear(info.plate, patente.toUpperCase())}
🚙 *Marca:* ${formatear(info.brand)}
🔧 *Modelo:* ${formatear(info.model)}
📅 *Año:* ${formatear(info.year)}
🎨 *Color:* ${formatear(info.color)}
🔩 *Nro. Motor:* ${formatear(info.engine)}
🔖 *Chassis:* ${formatear(info.chassis)}
🔧 *Tipo:* ${formatear(info.typeDescription)}
👤 *Nombre:* ${formatear(info.name?.replace(/\s+/g, ' '))}
🪪 *RUT:* ${formatear(info.numberOfIdentification && info.verifierDigit ? `${info.numberOfIdentification}-${info.verifierDigit}` : '')}
📍 *Dirección:* ${formatear(info.DIRECCION)}\n` + prtMsg + roboMsg;

        return { error: false, data: mensaje.trim() };
    } else {
        // Loguear la respuesta real para facilitar el diagnóstico
        const mensajeApi = apiResponse.mensaje || apiResponse.message || '';
        console.warn(`(apiService) Respuesta no válida para patente ${patente}. valido=${apiResponse.valido}, mensaje API: "${mensajeApi}", estructura:`, JSON.stringify(apiResponse).substring(0, 300));

        const errorMsg = `🚨 *Patente inválida o no encontrada*

La patente *${patente}* no fue encontrada en el sistema.${mensajeApi ? `\n_Detalle: ${mensajeApi}_` : ''}

🏍️ Si es una moto, agrega un '0' después de las letras. Ejemplo: \`AB0123\`.
🚗 Para vehículos, la patente debe tener 6 caracteres (letras y números). Ejemplo: \`ABC123\`.`;
        return { error: true, message: errorMsg };
    }
}

module.exports = {
    getPatenteDataFormatted,
    getPhoneData
};