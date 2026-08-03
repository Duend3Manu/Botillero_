const cheerio = require('cheerio');
const moment = require('moment-timezone');
const axios = require('axios');

async function handleKast(message) {
    try {
        if (message) await message.react('⏳');
        
        // 1. Calculate time until March 11, 2030, 12:00 PM
        const targetDate = moment.tz('2030-03-11 12:00:00', 'America/Santiago');
        const now = moment().tz('America/Santiago');
        
        const duration = moment.duration(targetDate.diff(now));
        
        const years = duration.years();
        const months = duration.months();
        const days = duration.days();
        const hours = duration.hours();
        const minutes = duration.minutes();
        
        let timeRemainingText = `⏳ Faltan `;
        if (years > 0) timeRemainingText += `${years} años, `;
        if (months > 0) timeRemainingText += `${months} meses, `;
        timeRemainingText += `${days} días, ${hours} horas y ${minutes} minutos para que Kast deje la presidencia.\n\n`;
        
        // 2. Scrape live data from renunciaskast.cl
        const response = await axios.get('https://renunciaskast.cl/', { timeout: 10000 });
        const $ = cheerio.load(response.data);
        
        const meta = $('.tracker .meta').text();
        const big = $('.tracker .big').text();
        const cap = $('.tracker .cap').text();
        
        let trackerText = `📊 *Resumen de renuncias* (${meta})\n`;
        trackerText += `Total: *${big}* ${cap}\n\n`;
        
        $('.tracker .strip > div').each((i, el) => {
            const num = $(el).find('.sn').text();
            const label = $(el).find('.sl').text();
            trackerText += `🔸 ${num} ${label}\n`;
        });
        
        const finalMessage = timeRemainingText + trackerText;
        return finalMessage;
        
    } catch (error) {
        console.error('Error in handleKast:', error);
        return 'Ocurrió un error al calcular el tiempo para que se vaya Kast. Intenta más tarde.';
    }
}

module.exports = {
    handleKast
};
