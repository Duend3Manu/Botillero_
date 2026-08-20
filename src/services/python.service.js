"use strict";

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const taskQueue = require('./task-queue.service');

// Detectar el comando Python correcto automáticamente
const projectRoot = path.join(__dirname, '..', '..');
const localVenvPython = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python');

function findCommandInPath(command) {
    const result = spawnSync('where', [command], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status === 0) {
        const output = result.stdout.toString().trim().split(/\r?\n/);
        for (const line of output) {
            if (line && !line.toLowerCase().includes('windowsapps')) {
                return line;
            }
        }
        if (output.length > 0 && output[0]) {
            return output[0];
        }
    }
    return null;
}

function resolvePyLauncher() {
    const result = spawnSync('py', ['-0p'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status !== 0) {
        return null;
    }

    const output = result.stdout.toString().trim().split(/\r?\n/);
    for (const line of output) {
        const match = line.match(/([A-Z]:\\.+?python\.exe)$/i);
        if (match) {
            const candidate = match[1].trim();
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}

function isExecutablePython(candidate) {
    if (!candidate) {
        return false;
    }
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) {
        return false;
    }
    const result = spawnSync(candidate, ['--version'], { windowsHide: true, stdio: 'ignore' });
    return result.status === 0;
}

function findPythonCommand() {
    if (process.env.PYTHON && isExecutablePython(process.env.PYTHON)) {
        return process.env.PYTHON;
    }
    if (process.platform !== 'win32' && fs.existsSync(localVenvPython) && isExecutablePython(localVenvPython)) {
        return localVenvPython;
    }

    if (process.platform === 'win32') {
        const resolvedPython = findCommandInPath('python');
        if (resolvedPython && isExecutablePython(resolvedPython)) {
            return resolvedPython;
        }

        const resolvedPyLauncher = resolvePyLauncher();
        if (resolvedPyLauncher && isExecutablePython(resolvedPyLauncher)) {
            return resolvedPyLauncher;
        }

        const resolvedPy = findCommandInPath('py');
        if (resolvedPy && isExecutablePython(resolvedPy)) {
            return resolvedPy;
        }

        const possibleLauncher = 'C:\\Windows\\py.exe';
        if (fs.existsSync(possibleLauncher) && isExecutablePython(possibleLauncher)) {
            return possibleLauncher;
        }

        return 'python';
    }

    const candidates = ['python3', 'python'];
    for (const candidate of candidates) {
        if (isExecutablePython(candidate)) {
            return candidate;
        }
    }

    return 'python3';
}

const PYTHON_COMMAND = findPythonCommand();

/**
 * Ejecuta un script Python y devuelve una Promise con { stdout, stderr, code, json }.
 * @param {string} scriptName - Nombre del archivo .py (se busca en scripts/python/)
 * @param {Array} args - Argumentos para pasar al script
 * @param {Object} opts - Opciones: {pythonExec, timeout}
 * @returns {Promise<{code, stdout, stderr, json}>}
 */
function executeScript(scriptName, args = [], opts = {}) {
    if (!/^[a-zA-Z0-9_.-]+\.py$/.test(scriptName)) {
        return Promise.reject(new Error('Nombre de script Python no válido'));
    }
    return taskQueue.enqueue(() => new Promise((resolve, reject) => {
        const pythonExec = opts.pythonExec || PYTHON_COMMAND;
        const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'python', scriptName);
        
        // Agregamos '-u' para forzar salida sin buffer (importante para logs en tiempo real y evitar cortes)
        const proc = spawn(pythonExec, ['-u', scriptPath, ...args], { 
            windowsHide: true,
            timeout: opts.timeout || 30000 // 30 segundos por defecto
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('error', (err) => {
            console.error(`Error al ejecutar script Python (${scriptName}):`, err.message);
            return reject(new Error(`Python spawn error: ${err.message}`));
        });

        proc.on('close', (code, signal) => {
            // Si code es null, fue matado por señal (ej: timeout)
            const finalCode = code !== null ? code : (signal ? 1 : 0);

            if (finalCode !== 0 && stderr) {
                console.error(`Error en script Python (${scriptName}) [Code: ${finalCode}, Signal: ${signal}]: ${stderr}`);
            }

            // Intentar parsear JSON si el script devuelve JSON
            let parsed = null;
            try { 
                parsed = JSON.parse(stdout); 
            } catch (e) { 
                /* No es JSON, es normal */ 
            }

            resolve({
                code: finalCode,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                json: parsed
            });
        });
    }), `python:${scriptName}`);
}

module.exports = { executeScript };
