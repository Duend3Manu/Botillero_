"use strict";

const express = require("express");
const { getRuntimeStats } = require("../handlers/system.handler");
const logger = require("../utils/logger");
const { listBackups, runBackup } = require("../services/backup.service");
const { getScheduledTasks } = require("../utils/db");
const sourceHealth = require("../services/source-health.service");

function startAdminServer() {
  if (process.env.ADMIN_SERVER !== "true") return null;
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.json({ ok: true, ...getRuntimeStats() }));
  app.get("/status", (_req, res) => res.json({ ...getRuntimeStats(), sources: sourceHealth.getStatus() }));
  app.get("/backups", (_req, res) => res.json(listBackups()));
  app.get("/tasks", (_req, res) => res.json(getScheduledTasks().map(({ payload, ...task }) => task)));
  app.get("/errors", (_req, res) => res.json(logger.recent("ERROR")));
  app.post("/backups", (_req, res) => {
    try { res.status(201).json({ file: runBackup() }); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.listen(Number(process.env.PORT || 3000), "127.0.0.1", () => {
    logger.info("Panel local disponible", { address: `http://127.0.0.1:${process.env.PORT || 3000}/health` });
  });
  return app;
}

module.exports = { startAdminServer };
