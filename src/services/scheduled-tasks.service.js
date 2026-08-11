"use strict";

const { getDueTasks, completeTask } = require("../utils/db");
const logger = require("../utils/logger");

let timer = null;

async function executeTask(client, task) {
  if (task.type !== "unban") return;
  const { chatId, participantId } = task.payload;
  const GroupChat = require("whatsapp-web.js/src/structures/GroupChat");
  const group = { client, id: { _serialized: chatId } };
  await GroupChat.prototype.addParticipants.call(group, [participantId]);
  const mention = `@${participantId.split("@")[0]}`;
  await client.sendMessage(chatId, `⏳ ¡El tiempo de ban expiró! ${mention} ha vuelto al grupo.`, { mentions: [participantId] });
}

async function processDueTasks(client) {
  for (const task of getDueTasks()) {
    try {
      await executeTask(client, task);
      completeTask(task.id);
      logger.info("Tarea programada completada", { type: task.type, id: task.id });
    } catch (error) {
      logger.warn("No se pudo completar tarea programada; se reintentará", { type: task.type, id: task.id, error: error.message });
    }
  }
}

function startScheduledTaskRunner(client) {
  if (timer) return;
  processDueTasks(client).catch(error => logger.error("Error iniciando tareas", { error: error.message }));
  timer = setInterval(() => processDueTasks(client), 60 * 1000);
  timer.unref?.();
}

module.exports = { startScheduledTaskRunner, processDueTasks };
