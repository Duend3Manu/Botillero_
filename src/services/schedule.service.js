"use strict";

const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

let lastSentDate = null;

function startLunesVideoScheduler(client) {
    console.log(`(Scheduler) -> Iniciando programador del video de los lunes (10:00 AM)...`);
    
    // Revisar cada minuto
    setInterval(async () => {
        const now = new Date();
        const currentDateString = now.toDateString();
        
        // getDay() === 1 es Lunes
        if (now.getDay() === 1 && now.getHours() === 10 && lastSentDate !== currentDateString) {
            console.log(`(Scheduler) -> ¡Es Lunes 10:00 AM! Enviando lunes.mp4 a los grupos...`);
            lastSentDate = currentDateString; // Marcar como enviado hoy para no repetir
            
            try {
                const videoPath = path.join(__dirname, '..', '..', 'mp3', 'lunes.mp4');
                const media = MessageMedia.fromFilePath(videoPath);
                
                const chats = await client.getChats();
                const groups = chats.filter(c => c.isGroup);
                
                let sentCount = 0;
                for (const group of groups) {
                    try {
                        await client.sendMessage(group.id._serialized, media, { caption: "¡Ánimo que es Lunes! 💪☕" });
                        sentCount++;
                        // Pausa de 2 segundos entre cada grupo para evitar baneos por spam
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (err) {
                        console.error(`Error enviando video a grupo ${group.name}:`, err.message);
                    }
                }
                console.log(`(Scheduler) -> lunes.mp4 enviado exitosamente a ${sentCount} grupos.`);
            } catch (error) {
                console.error('(Scheduler) -> Error general al enviar lunes.mp4:', error);
            }
        }
    }, 60 * 1000); // 1 minuto
}

module.exports = { startLunesVideoScheduler };
