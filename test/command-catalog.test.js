"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getCommandHelp, getMenu } = require("../src/config/command-catalog");

test("el catálogo ofrece ayuda para comandos conocidos", () => {
  assert.equal(getCommandHelp("clima").description, "Pronóstico del tiempo");
  assert.equal(getCommandHelp("no-existe"), null);
});

test("el menú refleja comandos en mantenimiento", () => {
  const menu = getMenu(new Set(["clima"]));
  assert.match(menu, /!clima \[ciudad\].*en mantenimiento/);
});
