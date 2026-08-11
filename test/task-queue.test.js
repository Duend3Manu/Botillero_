"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { enqueue, getStats } = require("../src/services/task-queue.service");

test("la cola ejecuta tareas y expone su estado", async () => {
  const result = await Promise.all([
    enqueue(async () => 1, "first"),
    enqueue(async () => 2, "second")
  ]);
  assert.deepEqual(result, [1, 2]);
  assert.equal(getStats().running, 0);
  assert.equal(getStats().pending, 0);
});

test("la cola rechaza tareas inválidas", async () => {
  await assert.rejects(enqueue(null), /debe ser una función/);
});
