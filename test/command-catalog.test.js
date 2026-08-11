"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getCommandHelp, getMenu } = require("../src/config/command-catalog");

test("el catálogo ofrece ayuda para comandos conocidos", () => {
  assert.equal(getCommandHelp("clima").description, "Pronóstico del tiempo");
  assert.equal(getCommandHelp("no-existe"), null);
});

test("el menú incluye emojis y oculta comandos privados", () => {
  const menu = getMenu();
  assert.match(menu, /🌤️/);
  assert.doesNotMatch(menu, /!mantenimiento|!ban|!kick|!ia|!oferta/);
});
