"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sourceHealth = require("../src/services/source-health.service");

test("la salud de una fuente se recupera tras una respuesta correcta", async () => {
  await sourceHealth.recordFailure("https://api.example.test/data", new Error("timeout"));
  sourceHealth.recordSuccess("https://api.example.test/data");
  const source = sourceHealth.getStatus().find(item => item.source === "api.example.test");
  assert.equal(source.failures, 0);
  assert.ok(source.lastSuccess);
});
