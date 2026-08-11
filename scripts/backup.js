"use strict";

const { runBackup } = require("../src/services/backup.service");
console.log(`Respaldo creado: ${runBackup()}`);
