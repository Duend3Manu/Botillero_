const fs = require('fs');
const path = require('path');

const funPath = path.join(__dirname, '..', 'src', 'handlers', 'fun.handler.js');
let funContent = fs.readFileSync(funPath, 'utf8');

// 1. Extract and sort soundMap
const startIdx = funContent.indexOf('const soundMap = {');
const endIdx = funContent.indexOf('};', startIdx) + 2;
if (startIdx === -1 || endIdx === -1) throw new Error('Could not find soundMap');

let soundMapStr = funContent.substring(startIdx + 17, endIdx - 1);
let soundMap;
eval('soundMap = ' + soundMapStr);

// Add martes
soundMap['martes'] = { file: ['Martes.mp3', 'Martes1.mp3'], reaction: '😂' };

// Sort alphabetically
const sortedKeys = Object.keys(soundMap).sort();
let newCode = 'const soundMap = {\n';
for (const key of sortedKeys) {
    const val = soundMap[key];
    const fileStr = Array.isArray(val.file) 
        ? '[' + val.file.map(f => "'" + f + "'").join(', ') + ']' 
        : "'" + val.file + "'";
    newCode += '    \'' + key + '\': { file: ' + fileStr + ', reaction: \'' + val.reaction + '\' },\n';
}
newCode = newCode.replace(/,\n$/, '\n');
newCode += '};';

funContent = funContent.substring(0, startIdx) + newCode + funContent.substring(endIdx);

// 2. Modify handleSound
const fnStart = funContent.indexOf('async function handleSound');
const fnEnd = funContent.indexOf('function getSoundCommands()');
if (fnStart > -1 && fnEnd > -1) {
    const handleSoundNew = `async function handleSound(client, message, command) {
    const soundInfo = soundMap[command];
    if (!soundInfo) return;

    const files = Array.isArray(soundInfo.file) ? soundInfo.file : [soundInfo.file];

    try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Pausa de 0.5s
        await message.react(soundInfo.reaction);
    } catch (reactionError) {
        // Ignoramos el error cosmético
    }

    for (const file of files) {
        const audioPath = path.join(__dirname, '..', '..', 'mp3', file);
        try {
            await fs.promises.access(audioPath);
            const media = MessageMedia.fromFilePath(audioPath);
            await message.reply(media);
        } catch (error) {
            if (error.code === 'ENOENT') {
                message.reply(\`No se encontró el archivo de audio para "!$\{command}".\`);
                console.error(\`Archivo no encontrado: $\{audioPath}\`);
            } else {
                console.error(\`Error en handleSound:\`, error);
            }
        }
    }
}
`;
    funContent = funContent.substring(0, fnStart) + handleSoundNew + '\n' + funContent.substring(fnEnd);
} else {
    throw new Error('Could not replace handleSound');
}

fs.writeFileSync(funPath, funContent);
console.log('DONE');
