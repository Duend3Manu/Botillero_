"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("../config");
const rateLimiter = require("./rate-limiter.service");
const taskQueue = require("./task-queue.service");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
  if (!apiKey) {
    throw new Error("API Key de Gemini no configurada");
  }
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL });
}

async function generate(prompt) {
  const permission = rateLimiter.tryAcquire();
  if (!permission.success) {
    return rateLimiter.getCooldownMessage(permission.timeLeft);
  }
  return taskQueue.enqueue(async () => {
    const result = await getModel().generateContent(prompt);
    return result.response.text().trim();
  }, "gemini");
}

async function getLocalAIResponse(prompt) {
  return generate(`Responde en español de forma útil y concisa. ${prompt}`);
}

async function generateConversationSummary(messages) {
  const transcript = messages
    .slice(-100)
    .map(({ pushname, body }) => `${pushname}: ${body}`)
    .join("\n");
  return generate(`Resume esta conversación de WhatsApp en español. Incluye acuerdos, temas y pendientes; no inventes información.\n\n${transcript}`);
}

module.exports = { getLocalAIResponse, generateConversationSummary };
