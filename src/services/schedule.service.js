"use strict";

const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { getBirthdaysForDate } = require('../utils/db');

let lastSentDateLunes = null;
let lastSentDateBirthdays = null;

function startLunesVideoScheduler(client) {
    console.log(`(Scheduler) -> Iniciando programador del video de los lunes (10:00 AM)...`);
    
    // Revisar cada minuto
    setInterval(async () => {
        const now = new Date();
        const currentDateString = now.toDateString();
        
        // getDay() === 1 es Lunes
        if (now.getDay() === 1 && now.getHours() === 10 && lastSentDateLunes !== currentDateString) {
            console.log(`(Scheduler) -> ¡Es Lunes 10:00 AM! Enviando lunes.mp4 a los grupos...`);
            lastSentDateLunes = currentDateString; // Marcar como enviado hoy para no repetir
            
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

function startBirthdayScheduler(client) {
    console.log(`(Scheduler) -> Iniciando programador de cumpleaños (10:00 AM)...`);
    
    setInterval(async () => {
        const now = new Date();
        const currentDateString = now.toDateString();
        
        if (now.getHours() === 10 && lastSentDateBirthdays !== currentDateString) {
            console.log(`(Scheduler) -> Revisando cumpleaños del día...`);
            lastSentDateBirthdays = currentDateString;
            
            try {
                const day = now.getDate();
                const month = now.getMonth() + 1; // 0-indexed
                const currentYear = now.getFullYear();
                
                const birthdays = getBirthdaysForDate(day, month);
                
                for (const b of birthdays) {
                    const age = currentYear - b.year;
                    const mention = `@${b.userId.split('@')[0]}`;
                    
                    const messageToSend = `🥳 wena ${mention}, feliz cumpleaños wn! 🎉🎂\n¡Ya son ${age} años! Pásalo chancho y tómate una cosita a mi salud 🍻`;
                    
                    const targetChat = b.groupId ? b.groupId : b.userId;
                    
                    try {
                        await client.sendMessage(targetChat, messageToSend, {
                            mentions: [b.userId]
                        });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (err) {
                        console.error(`Error saludando a ${b.userId}:`, err.message);
                    }
                }
            } catch (error) {
                console.error('(Scheduler) -> Error al procesar cumpleaños:', error);
            }
        }
    }, 60 * 1000); // 1 minuto
}

module.exports = { startLunesVideoScheduler, startBirthdayScheduler };
