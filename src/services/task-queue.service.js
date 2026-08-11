"use strict";

// Cola compartida para operaciones que consumen red, CPU o navegador.
// No aplica cuotas por usuario o grupo: solo evita saturar el proceso.
const DEFAULT_CONCURRENCY = 2;
let running = 0;
const pending = [];

function drain() {
  while (running < DEFAULT_CONCURRENCY && pending.length > 0) {
    const job = pending.shift();
    running++;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        running--;
        drain();
      });
  }
}

function enqueue(task, label = "task") {
  if (typeof task !== "function") {
    return Promise.reject(new TypeError("La tarea debe ser una función"));
  }
  return new Promise((resolve, reject) => {
    pending.push({ task, label, resolve, reject });
    drain();
  });
}

function getStats() {
  return { running, pending: pending.length, concurrency: DEFAULT_CONCURRENCY };
}

module.exports = { enqueue, getStats };
