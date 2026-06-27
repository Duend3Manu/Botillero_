// serviceMonitor.js
const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const https = require('https');

// Forzamos el uso de DNS públicos
const dnsResolver = new dns.Resolver();
dnsResolver.setServers(['1.1.1.1', '8.8.8.8']);

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Sistema de atajos (Diccionario)
const urlDictionary = {
    'whatsapp': { domain: 'web.whatsapp.com', url: 'https://web.whatsapp.com', port: 443 },
    'instagram': { domain: 'instagram.com', url: 'https://www.instagram.com', port: 443 },
    'facebook': { domain: 'facebook.com', url: 'https://www.facebook.com', port: 443 },
    'google': { domain: 'google.com', url: 'https://www.google.com', port: 443 },
    'banco estado': { domain: 'www.bancoestado.cl', url: 'https://www.bancoestado.cl', port: 443 }
};

// NUEVA FUNCIÓN: Transforma cualquier texto en una configuración válida
function parseDynamicUrl(input) {
    let raw = input.toLowerCase().trim();
    
    // Si el usuario no puso http o https, asumimos https por seguridad
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        raw = 'https://' + raw;
    }
    
    try {
        const parsed = new URL(raw);
        return {
            domain: parsed.hostname, // Extrae limpio el www.tucasa.cl
            url: parsed.href,        // La URL completa lista para Axios
            port: parsed.protocol === 'http:' ? 80 : 443
        };
    } catch (e) {
        return null; // Si el texto definitivamente no es una URL (ej: "hola mundo")
    }
}

function tcpPing(domain, port = 443) {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        socket.setTimeout(2500);
        
        socket.connect(port, domain, () => {
            const latency = Date.now() - start;
            socket.destroy();
            resolve({ success: true, time: latency });
        });
        
        socket.on('error', () => { socket.destroy(); resolve({ success: false, time: null }); });
        socket.on('timeout', () => { socket.destroy(); resolve({ success: false, time: null }); });
    });
}

function checkSSLExpiry(domain) {
    return new Promise((resolve) => {
        const options = { host: domain, port: 443, method: 'GET', rejectUnauthorized: false };
        const req = https.request(options, (res) => {
            const cert = res.socket.getPeerCertificate();
            if (cert && cert.valid_to) {
                const expiryDate = new Date(cert.valid_to);
                const daysRemaining = Math.ceil((expiryDate - Date.now()) / (1000 * 60 * 60 * 24));
                resolve({ valid: res.socket.authorized, daysRemaining });
            } else {
                resolve({ valid: false, daysRemaining: 0 });
            }
        });
        req.on('error', () => resolve({ valid: false, daysRemaining: 0 }));
        req.setTimeout(2500, () => { req.destroy(); resolve({ valid: false, daysRemaining: 0 }); });
        req.end();
    });
}

async function checkServiceStatus(userInput) {
    const rawInput = userInput.toLowerCase().trim();
    const now = Date.now();
    
    // 1. Primero buscamos si es un atajo de nuestro diccionario
    let serviceConfig = urlDictionary[rawInput];
    let serviceName = userInput;

    // 2. Si no es un atajo, lo intentamos procesar como URL libre
    if (!serviceConfig) {
        serviceConfig = parseDynamicUrl(rawInput);
        if (!serviceConfig) {
            return { error: `🚨 No pude reconocer "${userInput}" como un servicio registrado ni como una URL válida. Intenta escribiendo el dominio (ej: mipagina.com).` };
        }
        // Usamos el dominio limpio como nombre del servicio para el reporte
        serviceName = serviceConfig.domain.toUpperCase(); 
    }

    const { domain, url, port } = serviceConfig;
    
    // Usamos el dominio como llave para la caché, así no se duplican peticiones
    const cacheKey = domain;

    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (now - cached.timestamp < CACHE_TTL) {
            return cached.report;
        }
    }

    let report = {
        service: serviceName,
        domain: domain,
        ip: 'Desconocida',
        dnsStatus: '❌ FALLÓ',
        tcpLatency: 'N/A',
        httpStatus: '❌ CAÍDO',
        httpTime: 'N/A',
        sslStatus: 'N/A',
        sslDays: null,
        redundancy: { nsCount: 0, mxCount: 0 },
        diagnostic: '',
        downtimeStart: cache.has(cacheKey) ? cache.get(cacheKey).report.downtimeStart : null
    };

    try {
        const lookup = await dns.lookup(domain);
        report.ip = lookup.address;
        report.dnsStatus = '✅ OK';

        const [nsRecords, mxRecords] = await Promise.allSettled([
            dnsResolver.resolveNs(domain),
            dnsResolver.resolveMx(domain)
        ]);

        report.redundancy.nsCount = nsRecords.status === 'fulfilled' ? nsRecords.value.length : 0;
        report.redundancy.mxCount = mxRecords.status === 'fulfilled' ? mxRecords.value.length : 0;
    } catch (err) {
        report.diagnostic = '🚨 Error de Red: El dominio no existe o no resuelve por DNS. Verifica que la dirección esté bien escrita.';
        cache.set(cacheKey, { report, timestamp: now });
        return report;
    }

    const pingResult = await tcpPing(domain, port);
    if (pingResult.success) {
        report.tcpLatency = `${pingResult.time}ms`;
    }

    const sslInfo = await checkSSLExpiry(domain);
    report.sslStatus = sslInfo.valid ? '✅ VÁLIDO' : '⚠️ ALERTA';
    report.sslDays = sslInfo.daysRemaining;

    try {
        const start = Date.now();
        const response = await axios.get(url, { 
            timeout: 3000, 
            headers: { 'User-Agent': 'BoTilleroEngine/2.0' },
            validateStatus: () => true 
        });
        const rTime = Date.now() - start;
        report.httpTime = `${rTime}ms`;

        if (response.status >= 200 && response.status < 300) {
            report.httpStatus = rTime > 2000 ? '⚠️ LENTO' : '✅ ONLINE';
            report.diagnostic = 'El sistema responde perfectamente en todas sus capas.';
            report.downtimeStart = null; 
        } else {
            report.httpStatus = `🚫 HTTP ${response.status}`;
            report.diagnostic = `El servidor responde pero rechaza peticiones (Código ${response.status}).`;
            if (!report.downtimeStart) report.downtimeStart = now;
        }
    } catch (httpError) {
        report.httpStatus = '❌ TIMEOUT / CAÍDO';
        report.diagnostic = 'El servidor de aplicaciones no responde.';
        if (!report.downtimeStart) report.downtimeStart = now;
    }

    cache.set(cacheKey, { report, timestamp: now });
    return report;
}

module.exports = { checkServiceStatus };