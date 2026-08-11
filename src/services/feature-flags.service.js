"use strict";

const fs = require("fs");
const path = require("path");
const botConfig = require("../../config/bot.config");

const FILE = path.join(__dirname, "..", "..", "config", "runtime-features.json");
let disabled = new Set(botConfig.disabledFeatures || []);

function load() {
  try {
    if (!fs.existsSync(FILE)) return;
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    disabled = new Set([...(botConfig.disabledFeatures || []), ...(data.disabledFeatures || [])]);
  } catch (error) {
    console.warn("No se pudo cargar la configuración temporal:", error.message);
  }
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify({ disabledFeatures: [...disabled].sort() }, null, 2), "utf8");
}

function isDisabled(name) { return disabled.has(name); }
function getDisabled() { return new Set(disabled); }
function setDisabled(name, value) {
  if (value) disabled.add(name); else disabled.delete(name);
  save();
}

load();
module.exports = { isDisabled, getDisabled, setDisabled };
