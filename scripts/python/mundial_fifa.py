import sys
from playwright.sync_api import sync_playwright
from datetime import datetime

# Forzar salida en UTF-8 para soportar emojis en Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# --- DICCIONARIO MAESTRO DE BANDERAS FIFA ---
EMOJIS_BANDERAS = {
    # CONMEBOL (Sudamérica)
    "ARG": "🇦🇷", "BOL": "🇧🇴", "BRA": "🇧🇷", "CHI": "🇨🇱", "COL": "🇨🇴",
    "ECU": "🇪🇨", "PAR": "🇵🇾", "PER": "🇵🇪", "URU": "🇺🇾", "VEN": "🇻🇪",
    
    # CONCACAF (Norte, Centroamérica y Caribe)
    "CAN": "🇨🇦", "MEX": "🇲🇽", "USA": "🇺🇸", "CRC": "🇨🇷", "PAN": "🇵🇦",
    "HON": "🇭🇳", "SLV": "🇸🇻", "JAM": "🇯🇲", "GUA": "🇬🇹", "HAI": "🇭🇹",
    "CUB": "🇨🇺", "TRI": "🇹🇹",
    
    # UEFA (Europa)
    "ESP": "🇪🇸", "GER": "🇩🇪", "FRA": "🇫🇷", "ENG": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "ITA": "🇮🇹",
    "POR": "🇵🇹", "NED": "🇳🇱", "BEL": "🇧🇪", "CRO": "🇭🇷", "SUI": "🇨🇭",
    "DEN": "🇩🇰", "SRB": "🇷🇸", "POL": "🇵🇱", "WAL": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "SCO": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "AUT": "🇦🇹", "CZE": "🇨🇿", "NOR": "🇳🇴", "SWE": "🇸🇪", "FIN": "🇫🇮",
    "UKR": "🇺🇦", "TUR": "🇹🇷", "GRE": "🇬🇷", "ROU": "🇷🇴", "HUN": "🇭🇺",
    "SVK": "🇸🇰", "IRL": "🇮🇪", "NIR": "🏴󠁧󠁢󠁮󠁩󠁲󠁿", "ISL": "🇮🇸", "ALB": "🇦🇱",
    
    # CAF (África)
    "SEN": "🇸🇳", "MAR": "🇲🇦", "TUN": "🇹🇳", "CMR": "🇨🇲", "GHA": "🇬🇭",
    "EGY": "🇪🇬", "ALG": "🇩🇿", "NGA": "🇳🇬", "CIV": "🇨🇮", "MLI": "🇲🇱",
    "BFA": "🇧🇫", "RSA": "🇿🇦", "CPV": "🇨🇻", "COD": "🇨🇩", "GUI": "🇬🇳",
    "ZAM": "🇿🇲", "GAB": "🇬🇦", "ANG": "🇦🇴", "UGA": "🇺🇬", "EQG": "🇬🇶",
    
    # AFC (Asia)
    "JPN": "🇯🇵", "KOR": "🇰🇷", "IRN": "🇮🇷", "KSA": "🇸🇦", "AUS": "🇦🇺",
    "QAT": "🇶🇦", "UZB": "🇺🇿", "IRQ": "🇮🇶", "UAE": "🇦🇪", "CHN": "🇨🇳",
    "SYR": "🇸🇾", "BHR": "🇧🇭", "OMA": "🇴🇲", "JOR": "🇯🇴", "LBN": "🇱🇧",
    "VIE": "🇻🇳", "THA": "🇹🇭", "IDN": "🇮🇩", "MAS": "🇲🇾", "IND": "🇮🇳",
    
    # OFC (Oceanía)
    "NZL": "🇳🇿", "SOL": "🇸🇧", "FIJ": "🇫🇯", "TAH": "🇵🇫", "NCL": "🇳🇨", "PNG": "🇵🇬"
}

# --- LISTA MAESTRA DE CHV (Fase de Grupos) ---
PARTIDOS_CHV = [
    "España - Arabia Saudí",
    "Bélgica - RI de Irán",
    "Argentina - Austria",
    "Noruega - Senegal",
    "Portugal - Uzbekistán",
    "Inglaterra - Ghana",
    "Panamá - Croacia",
    "Escocia - Brasil",
    "México - Chequia",
    "Ecuador - Alemania",
    "Túnez - Países Bajos",
    "Paraguay - Australia",
    "Noruega - Francia",
    "Uruguay - España",
    "Colombia - Portugal"
]

def obtener_partidos_del_dia(fecha_buscada):
    url = "https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=CL&wtw-filter=ALL"

    print(f"Iniciando escaneo para la fecha: {fecha_buscada}...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(url)
        page.wait_for_timeout(6000)

        partidos_encontrados = page.evaluate('''
            (fecha) => {
                let resultados = [];
                let elementos = document.querySelectorAll('div[class*="matches-container_title"], div[class*="match-row_matchRowContainer"]');
                let capturando = false;
                
                for (let el of elementos) {
                    if (el.className.includes("matches-container_title")) {
                        if (el.innerText.toLowerCase().includes(fecha.toLowerCase())) {
                            capturando = true; 
                        } else if (capturando) {
                            break; 
                        }
                    } 
                    else if (capturando && el.className.includes("match-row_matchRowContainer")) {
                        
                        let estadoElem = el.querySelector('[class*="match-row_statusLabel"]');
                        let horaElem = el.querySelector('[class*="match-row_matchTime"]');
                        
                        let estado = "";
                        
                        if (estadoElem && estadoElem.innerText.trim() !== "") {
                            estado = estadoElem.innerText.trim();
                        } else if (horaElem && horaElem.innerText.trim() !== "") {
                            estado = horaElem.innerText.trim();
                        } else {
                            estado = "Por jugar";
                        }
                        
                        let equipos = el.querySelectorAll('[class*="match-row_team"] span.d-none.d-md-block');
                        let equipo_local = equipos.length > 0 ? equipos[0].innerText.trim() : "Local";
                        let equipo_visita = equipos.length > 1 ? equipos[1].innerText.trim() : "Visita";
                        
                        let goles = el.querySelectorAll('[class*="match-row_score"]');
                        let marcador = goles.length > 1 ? `${goles[0].innerText.trim()} - ${goles[1].innerText.trim()}` : "VS";
                        
                        let imgs = el.querySelectorAll('img');
                        let bandera_local = imgs.length > 0 && imgs[0].srcset ? imgs[0].srcset.split(' ')[0] : "";
                        let bandera_visita = imgs.length > 1 && imgs[1].srcset ? imgs[1].srcset.split(' ')[0] : "";
                        
                        resultados.push({
                            estado: estado,
                            local: equipo_local,
                            marcador: marcador,
                            visita: equipo_visita,
                            bandera_local: bandera_local,
                            bandera_visita: bandera_visita
                        });
                    }
                }
                return resultados;
            }
        ''', fecha_buscada)

        if not partidos_encontrados:
            print(f"\nNo pude encontrar partidos para '{fecha_buscada}'.")
        else:
            print(f"\n--- PARTIDOS DEL {fecha_buscada.upper()} ---\n")
            for p in partidos_encontrados:
                
                codigo_local = p['bandera_local'].split('/')[-1] if p['bandera_local'] else ""
                codigo_visita = p['bandera_visita'].split('/')[-1] if p['bandera_visita'] else ""

                emoji_local = EMOJIS_BANDERAS.get(codigo_local, "🏳️")
                emoji_visita = EMOJIS_BANDERAS.get(codigo_visita, "🏳️")

                estado_actual = p['estado']
                
                if "'" in estado_actual or "VIVO" in estado_actual.upper() or "LIVE" in estado_actual.upper():
                    estado_actual = f"🔴 {estado_actual}"

                # Lógica de Canales
                llave_partido = f"{p['local']} - {p['visita']}"
                if llave_partido in PARTIDOS_CHV:
                    canal = "📺 CHV"
                else:
                    canal = "📡 DSports"

                print(f"[{estado_actual}] {emoji_local} {p['local']}  {p['marcador']}  {p['visita']} {emoji_visita}  | {canal}")
            print("\n")

        browser.close()

if __name__ == "__main__":
    hoy = datetime.now()
    meses = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", 
             "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    
    fecha_hoy = f"{hoy.day} {meses[hoy.month]}" 
    obtener_partidos_del_dia(fecha_hoy)