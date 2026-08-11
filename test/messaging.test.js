"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { tryReact } = require("../src/services/messaging.service");

test("las reacciones se reintentan cuando WhatsApp aún no encuentra el mensaje", async () => {
  let attempts = 0;
  const message = {
    id: { _serialized: "message-id" },
    client: { pupPage: { evaluate: async () => ({ ok: ++attempts === 2, reason: "message_not_found" }) } }
  };
  assert.equal(await tryReact(message, "✅"), true);
  assert.equal(attempts, 2);
});

test("una reacción reporta fallo si nunca encuentra el mensaje", async () => {
  const message = {
    id: { _serialized: "message-id" },
    client: { pupPage: { evaluate: async () => ({ ok: false, reason: "message_not_found" }) } }
  };
  assert.equal(await tryReact(message, "✅"), false);
});
