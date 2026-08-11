"use strict";

const fs = require("fs");
const path = require("path");

const funPath = path.join(__dirname, "..", "src", "handlers", "fun.handler.js");
const funContent = fs.readFileSync(funPath, "utf8");
const start = funContent.indexOf("const soundMap = {");
const end = funContent.indexOf("};", start) + 2;

if (start < 0 || end < 2) throw new Error("No se encontró soundMap");

const mapSource = funContent.slice(start, end);
const entryPattern = /['"]([^'"]+)['"]:\s*\{\s*file:\s*(\[[^\]]*\]|['"][^'"]+['"])\s*,\s*reaction:\s*['"]([^'"]*)['"]\s*\}/g;
const entries = [];
let match;
while ((match = entryPattern.exec(mapSource))) {
  const files = [...match[2].matchAll(/['"]([^'"]+)['"]/g)].map(file => file[1]);
  entries.push({ command: match[1], files, reaction: match[3] });
}

if (entries.length === 0) throw new Error("No se pudieron leer los sonidos de forma segura");
if (!entries.some(entry => entry.command === "martes")) {
  entries.push({ command: "martes", files: ["Martes.mp3", "Martes1.mp3"], reaction: "😂" });
}

entries.sort((a, b) => a.command.localeCompare(b.command, "es"));
const newMap = ["const soundMap = {"]
  .concat(entries.map(({ command, files, reaction }) => {
    const fileValue = files.length === 1
      ? `'${files[0]}'`
      : `[${files.map(file => `'${file}'`).join(", ")}]`;
    return `    '${command}': { file: ${fileValue}, reaction: '${reaction}' },`;
  }))
  .concat(["};"])
  .join("\n");

fs.writeFileSync(funPath, funContent.slice(0, start) + newMap + funContent.slice(end), "utf8");
console.log("Mapa de sonidos actualizado.");
