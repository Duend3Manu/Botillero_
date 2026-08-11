# Botillero

Bot de WhatsApp para un grupo privado. Incluye utilidades chilenas, entretenimiento, consultas, moderación y resúmenes asistidos por IA.

## Requisitos

- Node.js 20 o superior.
- Python 3 y las dependencias de `requirements.txt` para los comandos que usan scripts Python.
- FFmpeg disponible en el sistema o indicado mediante `FFMPEG_PATH`.
- Una sesión de WhatsApp válida al iniciar por primera vez.

## Instalación

1. Copia `.env.example` como `.env` y completa solo las claves de las funciones que usarás.
2. Instala las dependencias con `npm install`.
3. Instala las dependencias Python con `python -m pip install -r requirements.txt`.
4. Inicia el bot con `npm start` y escanea el código QR.

## Operación

- `npm start`: inicia el bot.
- `npm run check`: valida la sintaxis de los puntos principales de arranque.
- `npm test`: ejecuta pruebas automatizadas.
- `npm run backup`: crea un respaldo manual de la base de datos.

El bot también crea un respaldo diario a las 03:00 y conserva los 14 últimos en `backups/`.

## Menú

`!menu` se genera desde el catálogo de comandos. Usa `!ayuda <comando>` para ver el uso de una función. Algunos comandos de administración y uso privado no se muestran en el menú.

## Panel local

Si agregas `ADMIN_SERVER=true` a `.env`, el bot expone solo en el equipo local:

- `/health`: estado básico.
- `/status`: cola y salud de fuentes externas.
- `/backups`: respaldos disponibles.
- `/tasks`: tareas programadas pendientes.
- `/errors`: últimos errores del proceso.

Puedes crear un respaldo desde el panel con una petición `POST /backups`.

## Inicio automático en Windows

Abre PowerShell como administrador y ejecuta:

`powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1`

Esto crea una tarea programada llamada `Botillero` que se inicia con Windows y se reinicia tras un fallo. Para eliminarla:

`powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-service.ps1`

## Datos locales

- `messages.db`: mensajes temporales, cumpleaños y tareas programadas.
- `src/data/message_counters.json`: estadísticas de actividad del grupo.
- `.wwebjs_auth/`: sesión de WhatsApp; nunca se debe compartir ni subir al repositorio.

Los datos son para el grupo privado que opera el bot. Mantén protegidos `.env`, la sesión de WhatsApp, la base de datos y los respaldos.

## Configuración

Variables disponibles:

- `GEMINI_API_KEY`: IA y recap.
- `WEATHER_API_KEY`: clima.
- `VIRUSTOTAL_API_KEY`: análisis de enlaces.
- `FFMPEG_PATH`: ruta completa al ejecutable de FFmpeg si no está en PATH.
- `PYTHON`: ejecutable de Python alternativo.

## Mantenimiento

- Antes de actualizar dependencias, ejecuta `npm test` y `npm run check`.
- Revisa `bot.log` para fallos operacionales; el archivo rota automáticamente.
- Los trabajos pesados de IA y Python pasan por una cola compartida para evitar sobrecargar el proceso, sin establecer límites de uso por integrante o grupo.
