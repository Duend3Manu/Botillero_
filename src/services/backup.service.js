"use strict";

const fs = require("fs");
const path = require("path");
const { createBackup } = require("../utils/db");
const logger = require("../utils/logger");

const BACKUP_DIR = path.join(__dirname, "..", "..", "backups");
const MAX_BACKUPS = 14;
let lastBackupDay = null;

function pruneBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(name => /^messages-.*\.db$/.test(name))
    .sort()
    .reverse();
  for (const name of backups.slice(MAX_BACKUPS)) {
    fs.unlinkSync(path.join(BACKUP_DIR, name));
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => /^messages-.*\.db$/.test(name))
    .sort()
    .reverse()
    .map(name => {
      const file = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(file);
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    });
}

function runBackup() {
  const file = createBackup(BACKUP_DIR);
  pruneBackups();
  logger.info("Respaldo creado", { file: path.basename(file) });
  return file;
}

function startBackupScheduler() {
  const check = () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getHours() === 3 && lastBackupDay !== day) {
      lastBackupDay = day;
      try { runBackup(); } catch (error) { logger.error("Error creando respaldo", { error: error.message }); }
    }
  };
  check();
  const timer = setInterval(check, 60 * 60 * 1000);
  timer.unref?.();
}

module.exports = { runBackup, startBackupScheduler, listBackups };
