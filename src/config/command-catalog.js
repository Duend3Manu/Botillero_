"use strict";

const categories = [
  { icon: "⚙️", title: "SERVICIOS", commands: [
    ["🌤️", "clima", "[ciudad]", "Pronóstico del tiempo"],
    ["💵", "valores", "", "UF, dólar y otros indicadores"],
    ["🎉", "feriados", "", "Próximos feriados"],
    ["💊", "far", "[comuna]", "Farmacias de turno"],
    ["🚇", "metro", "", "Estado del Metro"],
    ["🌋", "sismos", "", "Últimos sismos"],
    ["⚡", "sec", "", "Cortes de energía"],
    ["💳", "transbank", "", "Estado de Transbank"],
    ["📝", "recap", "", "Resumen de la conversación"],
    ["🔧", "ping", "", "Estado del bot"]
  ] },
  { icon: "🔎", title: "INFORMACIÓN", commands: [
    ["📰", "noticias", "", "Noticias nacionales"],
    ["🍿", "streaming", "", "Tendencias de streaming"],
    ["🚘", "pat", "[patente]", "Consultar vehículo"],
    ["📱", "num", "[teléfono]", "Consultar número"],
    ["🌐", "whois", "[dominio/ip]", "Consulta de red"],
    ["🇨🇱", "nic", "[dominio.cl]", "Dominio NIC Chile"],
    ["🎲", "random", "", "Dato curioso"]
  ] },
  { icon: "⚽", title: "FÚTBOL", commands: [
    ["🏆", "tabla", "", "Tabla de posiciones"],
    ["📅", "partidos", "", "Resumen de la fecha"],
    ["📆", "prox", "", "Próximos partidos"],
    ["🇨🇱", "clasi", "", "Partidos de clasificatorias"],
    ["🏅", "tclasi", "", "Tabla de clasificatorias"]
  ] },
  { icon: "🎉", title: "ENTRETENIMIENTO", commands: [
    ["🎨", "s", "", "Crear sticker respondiendo una imagen o video"],
    ["🖼️", "toimg", "", "Convertir sticker a imagen"],
    ["🎵", "audios", "", "Lista de comandos de audio"],
    ["😂", "chiste", "", "Chiste aleatorio"],
    ["🔮", "horoscopo", "[signo]", "Horóscopo"]
  ] },
  { icon: "📋", title: "GRUPO", commands: [
    ["📊", "contador", "", "Actividad del grupo"],
    ["👀", "actividad", "[@usuario]", "Última actividad"],
    ["🎂", "cumpleaños", "", "Gestionar cumpleaños"],
    ["📣", "todos", "[mensaje]", "Mencionar al grupo (admins)"]
  ] }
];

const definitions = new Map(categories.flatMap(category => category.commands.map(([icon, name, args, description]) => [name, {
  name, args, description, category: category.title, icon
}])));

function getCommandHelp(name) {
  return definitions.get(name.toLowerCase()) || null;
}

function getMenu() {
  const sections = categories.map(category => {
    const commands = category.commands.map(([icon, name, args, description]) =>
      `${icon} \`!${name}${args ? ` ${args}` : ""}\` → ${description}`
    );
    return `${category.icon} *${category.title}*\n${commands.join("\n")}`;
  });
  return `🤖 *BOTILLERO — MENÚ*\n\n${sections.join("\n\n")}\n\n💡 Usa \`!ayuda <comando>\` para ver detalles.`;
}

module.exports = { getCommandHelp, getMenu, definitions };
