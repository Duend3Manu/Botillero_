"use strict";

const sources = new Map();
let client = null;
let groupId = null;

function sourceName(url) {
  try { return new URL(url).hostname; } catch (_) { return "desconocida"; }
}

function recordSuccess(url) {
  const name = sourceName(url);
  const current = sources.get(name) || {};
  sources.set(name, { ...current, failures: 0, lastSuccess: Date.now(), lastError: null });
}

async function recordFailure(url, error) {
  const name = sourceName(url);
  const current = sources.get(name) || { failures: 0, lastAlert: 0 };
  const next = { ...current, failures: current.failures + 1, lastError: error.message, lastFailure: Date.now() };
  sources.set(name, next);
  if (next.failures < 3 || Date.now() - (current.lastAlert || 0) < 30 * 60 * 1000 || !client || !groupId) return;
  next.lastAlert = Date.now();
  try {
    await client.sendMessage(groupId, `⚠️ La fuente ${name} ha fallado ${next.failures} veces. Sus comandos podrían estar temporalmente afectados.`);
  } catch (_) { /* La alerta no debe afectar el comando original. */ }
}

function configureNotifier(whatsappClient, notificationGroupId) {
  client = whatsappClient;
  groupId = notificationGroupId && notificationGroupId.endsWith("@g.us") ? notificationGroupId : null;
}

function getStatus() {
  return [...sources.entries()].map(([source, status]) => ({ source, ...status }));
}

module.exports = { recordSuccess, recordFailure, configureNotifier, getStatus };
