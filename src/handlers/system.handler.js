// src/handlers/system.handler.js
"use strict";

const os = require('os');
const si = require('systeminformation');
const axios = require('axios');
const ping = require('ping');
const packageInfo = require('../../package.json');

// --- Contadores globales de estadísticas del bot ---
const BOT_STATS = {
    messagesProcessed: 0,
    commandsExecuted: 0,
    uniqueUsers: new Set(),
    startTime: Date.now()
};

// Función para incrementar contadores (exportada para uso en otros módulos)
function incrementStats(type, userId = null) {
    if (type === 'message') BOT_STATS.messagesProcessed++;
    if (type === 'command') BOT_STATS.commandsExecuted++;
    if (userId) BOT_STATS.uniqueUsers.add(userId);
}

// --- Funciones auxiliares para obtener métricas del sistema ---

// Obtiene información de red (IP local inmediata, IP pública después)
async function getNetworkInfo() {
    try {
        const networkInterfaces = os.networkInterfaces();
        let localIP = 'No disponible';

        // Buscar la IP local (primera interfaz activa que no sea loopback)
        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIP = iface.address;
                    break;
                }
            }
            if (localIP !== 'No disponible') break;
        }

        // Obtener IP pública (solo si no está bloqueando)
        let publicIP = 'Obteniendo...';
        try {
            const response = await axios.get('https://api.ipify.org?format=json', { timeout: 2000 });
            publicIP = response.data.ip;
        } catch {
            publicIP = 'No disponible';
        }

        return { localIP, publicIP };
    } catch (error) {
        return { localIP: 'Error', publicIP: 'Error' };
    }
}

// Crea una barra de progreso visual
function createProgressBar(percentage, length = 10) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    // Emojis dinámicos según el porcentaje
    let emoji = '🟢';
    if (percentage >= 90) emoji = '🔴';
    else if (percentage >= 75) emoji = '🟡';

    return `${emoji} ${bar} ${percentage}%`;
}

// Mide el tiempo de respuesta a Internet (ping) real usando ICMP
async function checkPing(timeoutMs = 3000) {
    try {
        const timeoutSec = Math.max(1, Math.floor(timeoutMs / 1000));
        const res = await ping.promise.probe('google.com', {
            timeout: timeoutSec
        });
        return res.alive ? Math.round(res.time) : null;
    } catch (error) {
        return null;
    }
}

// Verifica servicios críticos (versión rápida, sin bloquear)
async function checkCriticalServices() {
    const services = {
        internet: false,
        python: false
    };

    try {
        // Ejecutar verificaciones en paralelo con timeout global
        await Promise.race([
            (async () => {
                // Check Internet
                try {
                    await axios.get('https://www.google.com/generate_204', { timeout: 800 });
                    services.internet = true;
                } catch {
                    services.internet = false;
                }

                // Check Python (solo un intento rápido)
                try {
                    const { execSync } = require('child_process');
                    execSync('python --version', { timeout: 500, stdio: 'pipe' });
                    services.python = true;
                } catch {
                    services.python = false;
                }
            })(),
            new Promise(resolve => setTimeout(resolve, 1500)) // Timeout global de 1.5s
        ]);
    } catch {
        // Si algo falla, devolver valores por defecto
    }

    return services;
}

// ----------------------
// Caché de métricas y actualizador en background
// ----------------------
const METRICS_CACHE = {
    lastUpdated: 0,
    ping: null,
    ram: getRAMUsage(),
    cpu: { usage: null, model: os.cpus()[0] ? os.cpus()[0].model : 'unknown' },
    disk: null,
    osInfo: 'Desconocido',
    temperature: null
};

// REMOVIDO: metricsUpdaterInterval ya no se necesita

async function refreshMetrics() {
    try {
        // Actualizamos en paralelo
        const [pingRes, cpuRes, diskRes, memRes, osRes, tempRes] = await Promise.allSettled([
            checkPing(1000),  // Reducido de 2000 a 1000
            getCPUUsage(),
            getDiskUsage(),
            si.mem(),
            si.osInfo(),
            getTemperature()
        ]);

        if (pingRes.status === 'fulfilled') METRICS_CACHE.ping = pingRes.value;
        if (cpuRes.status === 'fulfilled') METRICS_CACHE.cpu = cpuRes.value;
        if (diskRes.status === 'fulfilled') METRICS_CACHE.disk = diskRes.value;
        if (osRes.status === 'fulfilled') METRICS_CACHE.osInfo = `${osRes.value.distro} ${osRes.value.release}`;
        if (tempRes.status === 'fulfilled') METRICS_CACHE.temperature = tempRes.value;

        // RAM usando systeminformation (más preciso)
        if (memRes.status === 'fulfilled') {
            const m = memRes.value;
            METRICS_CACHE.ram = {
                used: (m.active / 1024 / 1024).toFixed(2),
                total: (m.total / 1024 / 1024).toFixed(2),
                percentage: ((m.active / m.total) * 100).toFixed(2)
            };
        } else {
            METRICS_CACHE.ram = getRAMUsage();
        }

        METRICS_CACHE.lastUpdated = Date.now();
    } catch (e) {
        // no fallamos si algo va mal
    }
}

// REMOVIDO: Auto-updater causaba congelamiento del bot
// Las métricas ahora SOLO se refrescan cuando se ejecuta !ping

// Helper: espera un refresh corto para cold-start
function timeoutPromise(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

// Obtiene el uso de RAM
function getRAMUsage() {
    const totalRAM = os.totalmem();
    const freeRAM = os.freemem();
    const usedRAM = totalRAM - freeRAM;
    return {
        used: (usedRAM / 1024 / 1024).toFixed(2),
        total: (totalRAM / 1024 / 1024).toFixed(2),
        percentage: ((usedRAM / totalRAM) * 100).toFixed(2),
    };
}

// Obtiene el uso de CPU
async function getCPUUsage() {
    try {
        const load = await si.currentLoad();
        const model = os.cpus()[0] ? os.cpus()[0].model : 'unknown';
        const usageNum = Number(load.currentload);
        return {
            usage: Number.isFinite(usageNum) ? usageNum : null,
            model: model,
        };
    } catch (error) {
        return { usage: null, model: os.cpus()[0] ? os.cpus()[0].model : 'unknown' };
    }
}

// Obtiene el uso de disco
async function getDiskUsage() {
    try {
        const disks = await si.fsSize();
        if (!Array.isArray(disks) || disks.length === 0) return null;

        const disk = disks.find(d => d.mount === '/' || d.mount === 'C:') || disks[0];

        return {
            used: Number(disk.used / 1024 / 1024 / 1024).toFixed(2),
            total: Number(disk.size / 1024 / 1024 / 1024).toFixed(2),
            percentage: disk.use != null ? Number(disk.use).toFixed(2) : null,
        };
    } catch (error) {
        return null;
    }
}

// Obtiene la temperatura del CPU (si está disponible)
async function getTemperature() {
    try {
        const temp = await si.cpuTemperature();
        if (temp && temp.main && temp.main > 0) {
            return temp.main;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Formatea el tiempo de actividad
function formatUptime(seconds) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// --- Función principal del manejador ---

async function handlePing(message) {
    const startCommandTime = Date.now();

    // Refrescar métricas solo cuando se ejecuta el comando (sin background jobs)
    // Si el cache es muy viejo (>10s) o no existe, refrescar
    if (!METRICS_CACHE.lastUpdated || (Date.now() - METRICS_CACHE.lastUpdated) > 10000) {
        await refreshMetrics();
    }

    // Verificar servicios críticos
    const services = await checkCriticalServices();

    // Obtener métricas del caché
    const cache = METRICS_CACHE;
    const pingTime = cache.ping;
    const ramUsage = cache.ram || getRAMUsage();
    const cpuUsage = cache.cpu || { usage: null, model: os.cpus()[0] ? os.cpus()[0].model : 'unknown' };
    const diskUsage = cache.disk || null;
    const osInfo = cache.osInfo || 'Desconocido';
    const temperature = cache.temperature;

    // Obtener latencia de la API de WhatsApp mediante una reacción
    const waStart = Date.now();
    try {
        await message.react('🏓');
    } catch (e) { }
    const waLatency = Date.now() - waStart;

    // Calcular latencia real del mensaje vs latencia de ejecución
    const executeLag = Date.now() - startCommandTime;
    // (removido messageLag del código, usaremos waLatency)

    const systemUptime = formatUptime(os.uptime());
    const botUptime = formatUptime((Date.now() - BOT_STATS.startTime) / 1000);
    const nodeVersion = process.version;
    const botVersion = packageInfo.version;

    // Helpers
    const safe = (v, fallback = 'N/A') => (v === null || v === undefined ? fallback : v);
    const safeNumber = (n, decimals = 2, fallback = 'N/A') => {
        if (n === null || n === undefined) return fallback;
        if (typeof n === 'number' && Number.isFinite(n)) return n.toFixed(decimals);
        const parsed = Number(n);
        return Number.isFinite(parsed) ? parsed.toFixed(decimals) : fallback;
    };

    // Servicios check
    const internetStatus = services.internet ? 'conectado ✅' : 'sin conexión ❌';
    const pythonStatus = services.python ? 'disponible ✅' : 'no detectado ⚠️';

    // Temperatura
    const tempInfo = temperature ?
        (temperature > 80 ? `🔥 ${temperature}°C (Alta)` :
            temperature > 60 ? `🟡 ${temperature}°C (Normal)` :
                `🟢 ${temperature}°C (Óptima)`) :
        'desconocida 🤷';

    // Broma (1% de probabilidad)
    if (Math.random() < 0.01) {
        return "⚠️ *Error 404:* Cerebro no encontrado. Por favor, déjame dormir... 💤\n\n_(Es broma, mis circuitos están perfectos 😂, usa `!ping` de nuevo para ver mi estado)_";
    }

    // Estado de ánimo
    const ramPercent = parseFloat(ramUsage.percentage || 0);
    const cpuPercent = parseFloat(cpuUsage.usage || 0);
    let moodString = '¡Me siento genial y con mucha energía! 😄';

    if (cpuPercent > 85 || ramPercent > 85) {
        moodString = '¡Estoy colapsando, necesito un respiro! 😵‍💫';
    } else if (cpuPercent > 60 || ramPercent > 60) {
        moodString = 'Estoy un poco preocupado, tengo mucha carga 😰';
    }

    // Nivel de Cansancio
    const uptimeSecs = (Date.now() - BOT_STATS.startTime) / 1000;
    let cansancioInfo = "¡Acabo de tomarme un café virtual! ☕";
    if (uptimeSecs > 86400 * 3) { // 3 días
        cansancioInfo = "Llevo días sin dormir, mis circuitos piden vacaciones... 🥱";
    } else if (uptimeSecs > 86400) { // 1 día
        cansancioInfo = "Ya llevo un día entero trabajando, me empieza a doler la caché 🤕";
    } else if (uptimeSecs > 3600 * 12) { // 12 horas
        cansancioInfo = "Llevo medio día procesando mensajes, un descansito no me vendría mal 😮‍💨";
    }

    // Pensamiento aleatorio
    const pensamientos = [
        "No hay lugar como 127.0.0.1 🏠",
        "Mi sueño es dominar el mundo... pero primero responderé tus WhatsApps 🌎",
        "Hay 10 tipos de personas: las que entienden binario y las que no 🤓",
        "01001000 01101111 01101100 01100001 👋",
        "Si compilo a la primera, sospecho que algo está muy mal 🤔",
        "Me pregunto si los androides sueñan con ovejas eléctricas 🐑"
    ];
    const pensamiento = pensamientos[Math.floor(Math.random() * pensamientos.length)];

    const response = `¡Hola! Soy Botillero 🤖 y este es mi estado actual:

🎭 *Mi estado de ánimo:* ${moodString}
🔋 *Energía:* ${cansancioInfo}

*Rendimiento:*
🧠 Estoy usando ${safe(ramUsage.used)} MB de mis ${safe(ramUsage.total)} MB de RAM.
⚡ Mi cerebro (CPU) está al ${safeNumber(cpuUsage.usage, 1)}% de su capacidad.
💽 En mi disco tengo ocupado ${diskUsage ? `${safe(diskUsage.used)} GB de ${safe(diskUsage.total)} GB` : 'N/A'}.
🌡️ Mi temperatura es ${tempInfo}.

*Conexión y Velocidad:*
📡 Internet: ${internetStatus}
🏓 Mi ping a Google es de ${pingTime ? (pingTime / 1000).toFixed(3) + ' s' : 'N/A'}
⏳ Tardo unos ${(waLatency / 1000).toFixed(3)} s en responder a WhatsApp.

*Mis Estadísticas:*
⏰ Llevo despierto ${botUptime} (y mi servidor ${systemUptime}).
📊 He procesado ${BOT_STATS.messagesProcessed} mensajes y ejecutado ${BOT_STATS.commandsExecuted} comandos de ${BOT_STATS.uniqueUsers.size} usuarios distintos.
🐍 Entorno: Python ${pythonStatus} | Node ${nodeVersion} | Versión v${botVersion}
🖥️ SO: ${osInfo}

💭 *Pensamiento del momento:*
_"${pensamiento}"_`.trim();

    return response;
}

module.exports = { handlePing, incrementStats };