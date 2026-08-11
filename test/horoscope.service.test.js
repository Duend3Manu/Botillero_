"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const horoscope = require("../src/services/horoscope.service");

test("un signo inválido siempre devuelve una respuesta visible", async () => {
  const result = await horoscope.getHoroscope("inventado");
  assert.ok(result.text.length > 0);
  assert.equal(result.imagePath, null);
});
