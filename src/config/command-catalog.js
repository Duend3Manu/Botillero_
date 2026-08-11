"use strict";

const categories = [
  { title: "Servicios", commands: [
    ["clima", "[ciudad]", "Pronóstico del tiempo"], ["valores", "", "UF, dólar y otros indicadores"],
    ["feriados", "", "Próximos feriados"], ["far", "[comuna]", "Farmacias de turno"],
    ["metro", "", "Estado del Metro"], ["sismos", "", "Últimos sismos"],
    ["sec", "", "Cortes de energía"], ["transbank", "", "Estado de Transbank"],
    ["recap", "", "Resumen de la conversación"], ["ping", "", "Estado del bot"]
  ] },
  { title: "Información", commands: [
    ["noticias", "", "Noticias nacionales"], ["oferta", "[producto]", "Buscar ofertas"],
    ["streaming", "", "Tendencias de streaming"], ["pat", "[patente]", "Consultar vehículo"],
    ["num", "[teléfono]", "Consultar número"], ["whois", "[dominio/ip]", "Consulta de red"],
    ["nic", "[dominio.cl]", "Dominio NIC Chile"], ["ia", "[pregunta]", "Asistente IA"]
  ] },
  { title: "Entretenimiento", commands: [
    ["s", "", "Crear sticker desde una respuesta"], ["toimg", "", "Sticker a imagen"],
    ["audios", "", "Lista de audios"], ["chiste", "", "Chiste aleatorio"],
    ["random", "", "Dato curioso"], ["horoscopo", "[signo]", "Horóscopo"],
    ["todos", "[mensaje]", "Mencionar al grupo (admins)"]
  ] },
  { title: "Administración", commands: [
    ["agregar", "[número]", "Agregar participante"], ["ban", "[@usuario] [tiempo]", "Expulsión temporal"],
    ["kick", "[@usuario]", "Expulsión permanente"], ["mantenimiento", "[comando] on|off", "Activar o desactivar comando"],
    ["contador", "", "Actividad del grupo"], ["cumpleaños", "", "Gestionar cumpleaños"]
  ] }
];

const definitions = new Map(categories.flatMap(category => category.commands.map(([name, args, description]) => [name, {
  name, args, description, category: category.title
}])));

function getCommandHelp(name) {
  return definitions.get(name.toLowerCase()) || null;
}

function getMenu(disabled = new Set()) {
  const sections = categories.map(category => {
    const commands = category.commands.map(([name, args, description]) => {
      const state = disabled.has(name) ? " (en mantenimiento)" : "";
      return `• !${name}${args ? ` ${args}` : ""} — ${description}${state}`;
    });
    return `*${category.title}*\n${commands.join("\n")}`;
  });
  return `🤖 *BOTILLERO — MENÚ*\n\n${sections.join("\n\n")}\n\nUsa \`!ayuda <comando>\` para ver detalles.`;
}

module.exports = { getCommandHelp, getMenu, definitions };
