const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

async function getPartidos() {
    const outputFilename = path.join(__dirname, '../../temp/partidos_chile.json');
    const pythonScript = path.join(__dirname, '../../betano.py');
    const venvPython = path.join(__dirname, '../../.venv/Scripts/python.exe');
    
    // Si existe el venv, usamos su python, sino el global
    let pythonCmd = 'python';
    try {
        await fs.access(venvPython);
        pythonCmd = `"${venvPython}"`;
    } catch (e) {
        // pythonCmd se queda como 'python'
    }
    
    try {
        await execAsync(`${pythonCmd} "${pythonScript}" --headless --output "${outputFilename}"`);
        
        const data = await fs.readFile(outputFilename, 'utf-8');
        const partidos = JSON.parse(data);
        
        if (!partidos || partidos.length === 0) {
            return '❌ No encontré partidos programados por ahora.';
        }
        
        let response = '🏆 *PARTIDOS LIGA CHILENA* 🏆\n\n';
        
        const porFecha = {};
        for (const p of partidos) {
            if (!porFecha[p.fecha]) porFecha[p.fecha] = [];
            porFecha[p.fecha].push(p);
        }
        
        for (const fecha of Object.keys(porFecha).sort()) {
            response += `📅 *${fecha}*\n`;
            for (const p of porFecha[fecha]) {
                response += `⚽ *${p.equipo_local}* vs *${p.equipo_visitante}*\n`;
                response += `⏱️ ${p.hora}\n`;
                response += `📈 Cuotas: L: *${p.cuota_local}* | E: *${p.cuota_empate}* | V: *${p.cuota_visitante}*\n\n`;
            }
        }
        
        return response.trim();
        
    } catch (error) {
        console.error('Error en getPartidos:', error);
        return '❌ Hubo un problema obteniendo los partidos. Intenta de nuevo más tarde.';
    }
}

async function getPartidosEnVivo() {
    const outputFilename = path.join(__dirname, '../../temp/en_vivo.json');
    const pythonScript = path.join(__dirname, '../../betano_envivo.py');
    const venvPython = path.join(__dirname, '../../.venv/Scripts/python.exe');
    
    let pythonCmd = 'python';
    try {
        await fs.access(venvPython);
        pythonCmd = `"${venvPython}"`;
    } catch (e) {
        // pythonCmd se queda como 'python'
    }
    
    try {
        await execAsync(`${pythonCmd} "${pythonScript}" --headless --output "${outputFilename}"`);
        
        const data = await fs.readFile(outputFilename, 'utf-8');
        const partidos = JSON.parse(data);
        
        if (!partidos || partidos.length === 0) {
            return '❌ No hay partidos en vivo en este momento.';
        }
        
        let response = '🔴 *PARTIDOS EN VIVO* 🔴\n\n';
        
        const porCompeticion = {};
        for (const p of partidos) {
            const comp = p.competicion || 'Sin competición';
            if (!porCompeticion[comp]) porCompeticion[comp] = [];
            porCompeticion[comp].push(p);
        }
        
        for (const comp of Object.keys(porCompeticion)) {
            response += `🏆 *${comp}*\n`;
            for (const p of porCompeticion[comp]) {
                response += `⚽ *${p.equipo_local}* ${p.goles_local} - ${p.goles_visitante} *${p.equipo_visitante}*\n`;
                response += `⏱️ Minuto: ${p.minuto}\n`;
                if (p.cuota_local) {
                    response += `📈 Cuotas: L: *${p.cuota_local}* | E: *${p.cuota_empate}* | V: *${p.cuota_visitante}*\n`;
                }
                response += `\n`;
            }
        }
        
        return response.trim();
        
    } catch (error) {
        console.error('Error en getPartidosEnVivo:', error);
        return '❌ Hubo un problema obteniendo los partidos en vivo. Intenta de nuevo más tarde.';
    }
}

module.exports = {
    getPartidos,
    getPartidosEnVivo
};
