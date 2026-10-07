from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')


class BetanoEnVivo:
    """Scraper para TODOS los partidos EN VIVO"""
    
    def __init__(self, headless=False, filtrar_competiciones=None):
        # URL de la sección EN VIVO de Betano
        self.url = "https://www.betanosports.com/"
        
        self.options = Options()
        if headless:
            self.options.add_argument('--headless')
        self.options.add_argument('--no-sandbox')
        self.options.add_argument('--disable-gpu')
        self.options.add_argument('--window-size=1920,1080')
        self.options.add_argument('--user-agent=Mozilla/5.0')
        
        self.driver = None
        
        # Competiciones a filtrar (None = todas)
        self.filtrar_competiciones = filtrar_competiciones
    
    def iniciar(self):
        self.driver = webdriver.Chrome(options=self.options)
    
    def cerrar(self):
        if self.driver:
            self.driver.quit()
    
    def extraer_en_vivo(self):
        """Extrae TODOS los partidos EN VIVO"""
        self.iniciar()
        
        try:
            print(f"Navegando a: {self.url}")
            self.driver.get(self.url)
            time.sleep(10)
            
            # Scroll para cargar más eventos
            for _ in range(5):
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)
            
            html = self.driver.page_source
            soup = BeautifulSoup(html, "lxml")
            
            print(f"\nTotal elementos: {len(soup.find_all())}")
            
            # Buscar TODOS los eventos
            contenedores = soup.select("[data-evtid]")
            
            print(f"Eventos encontrados: {len(contenedores)}")
            
            # Detectar cuáles están EN VIVO
            en_vivo_count = 0
            competiciones_disponibles = set()
            
            for contenedor in contenedores:
                # Verificar si es EN VIVO
                en_vivo = contenedor.select_one(
                    '[class*="live"], [class*="inplay"], [data-qa*="live"]'
                )
                
                if en_vivo:
                    en_vivo_count += 1
                    
                    # Detectar competición
                    competicion_elem = contenedor.select_one(
                        '[class*="league"], [class*="competition"], '
                        '[class*="tournament"], [class*="category"]'
                    )
                    
                    if competicion_elem:
                        competicion = competicion_elem.get_text(" ", strip=True)
                        competiciones_disponibles.add(competicion)
            
            print(f"Eventos EN VIVO: {en_vivo_count}")
            print(f"\nCompeticiones disponibles:")
            for comp in sorted(competiciones_disponibles):
                print(f"  - {comp}")
            
            if en_vivo_count == 0:
                print("\n✗ No hay partidos EN VIVO en este momento")
                return []
            
            # Ahora extraer los partidos
            partidos_vivo = []
            
            for contenedor in contenedores:
                evento_id = contenedor.get("data-evtid", "")
                
                # Verificar si es EN VIVO
                en_vivo = contenedor.select_one(
                    '[class*="live"], [class*="inplay"], [data-qa*="live"]'
                )
                
                if not en_vivo:
                    continue
                
                # Buscar competición
                competicion_elem = contenedor.select_one(
                    '[class*="league"], [class*="competition"], '
                    '[class*="tournament"], [class*="category"]'
                )
                
                competicion = ""
                if competicion_elem:
                    competicion = competicion_elem.get_text(" ", strip=True)
                
                # Filtrar por competiciones si se especificó
                if self.filtrar_competiciones:
                    if not any(filt.lower() in competicion.lower() for filt in self.filtrar_competiciones):
                        continue
                
                # Buscar resultado actual (goles)
                resultado = contenedor.select_one(
                    '[class*="score"], [class*="result"]'
                )
                
                goles_local = ""
                goles_visitante = ""
                
                if resultado:
                    goles_texto = resultado.get_text(" ", strip=True)
                    goles_match = re.search(r'(\d+)\s*[-–]\s*(\d+)', goles_texto)
                    
                    if goles_match:
                        goles_local = goles_match.group(1)
                        goles_visitante = goles_match.group(2)
                
                # Buscar minuto de juego
                minuto_elem = contenedor.select_one(
                    '[class*="minute"], [class*="time"]'
                )
                
                minuto = ""
                if minuto_elem:
                    minuto = minuto_elem.get_text(" ", strip=True)
                    minuto = re.sub(r'[^\d\']', '', minuto)
                
                # Extraer equipos
                enlace = contenedor.select_one('a[href*="/cuotas-de-partido/"]')
                
                if not enlace:
                    continue
                
                participantes = enlace.select(
                    '[data-qa="participants"] .tw-truncate.tw-text-s'
                )
                
                nombres = []
                for elemento in participantes:
                    nombre = elemento.get_text(" ", strip=True)
                    nombre = re.sub(r"\s+", " ", nombre).strip()
                    if nombre and nombre not in nombres:
                        nombres.append(nombre)
                
                # Fallback con alt de imágenes
                if len(nombres) < 2:
                    nombres = []
                    for imagen in enlace.select('[data-qa="participants"] img[alt]'):
                        nombre = imagen.get("alt", "").strip()
                        if nombre and nombre not in nombres:
                            nombres.append(nombre)
                
                if len(nombres) < 2:
                    continue
                
                equipo_local = nombres[0]
                equipo_visitante = nombres[1]
                
                # Normalizar Ñublense
                if equipo_visitante.lower() in ("ublense", "nublense"):
                    equipo_visitante = "ÑUBLENSE"
                if equipo_local.lower() in ("ublense", "nublense"):
                    equipo_local = "ÑUBLENSE"
                
                # Extraer cuotas en vivo
                cuotas = {}
                
                for seleccion in contenedor.select('[aria-label*="odds"]'):
                    aria = seleccion.get("aria-label", "")
                    match_cuota = re.search(
                        r"Bet on\s+([1X2])\s+with odds\s+([\d.]+)",
                        aria,
                        re.IGNORECASE
                    )
                    if match_cuota:
                        tipo = match_cuota.group(1).upper()
                        valor = match_cuota.group(2).rstrip('.')
                        cuotas[tipo] = valor
                
                # Fallback cuotas visuales
                if not all(tipo in cuotas for tipo in ("1", "X", "2")):
                    valores = contenedor.select(
                        ".tw-text-sem-color-text-highlight"
                    )
                    numeros = []
                    for valor in valores:
                        texto = valor.get_text(strip=True)
                        if re.fullmatch(r"\d+(?:\.\d+)?", texto):
                            numeros.append(texto)
                    if len(numeros) >= 3:
                        cuotas = {
                            "1": numeros[0],
                            "X": numeros[1],
                            "2": numeros[2]
                        }
                
                href = enlace.get("href", "")
                if href.startswith("/"):
                    url_partido = "https://www.betanosports.com" + href
                else:
                    url_partido = href
                
                partido = {
                    "id_evento": evento_id,
                    "competicion": competicion,
                    "equipo_local": equipo_local,
                    "equipo_visitante": equipo_visitante,
                    "goles_local": goles_local,
                    "goles_visitante": goles_visitante,
                    "minuto": minuto,
                    "en_vivo": True,
                    "cuota_local": cuotas.get("1", ""),
                    "cuota_empate": cuotas.get("X", ""),
                    "cuota_visitante": cuotas.get("2", ""),
                    "url": url_partido,
                    "fecha_extraccion": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                
                partidos_vivo.append(partido)
                
                print(f"\n✓ EN VIVO - {competicion}")
                print(f"  {equipo_local} {goles_local} - {goles_visitante} {equipo_visitante}")
                print(f"  Minuto: {minuto}")
                if cuotas.get("1"):
                    print(f"  Cuotas: {cuotas.get('1', '-')} | {cuotas.get('X', '-')} | {cuotas.get('2', '-')}")
            
            # Eliminar duplicados
            partidos_unicos = []
            ids_vistos = set()
            
            for partido in partidos_vivo:
                clave = partido["id_evento"]
                if clave not in ids_vistos:
                    ids_vistos.add(clave)
                    partidos_unicos.append(partido)
            
            partidos_vivo = partidos_unicos
            
            print(f"\nTotal partidos EN VIVO: {len(partidos_vivo)}")
            
            if partidos_vivo:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                archivo = f"en_vivo_{timestamp}.json"
                
                with open(archivo, "w", encoding="utf-8") as f:
                    json.dump(partidos_vivo, f, indent=2, ensure_ascii=False)
                
                print(f"✓ Guardado en: {archivo}")
            
            return partidos_vivo
            
        finally:
            self.cerrar()
    
    def mostrar(self, partidos):
        if not partidos:
            print("\n✗ No hay partidos EN VIVO")
            return
        
        print("\n" + "=" * 70)
        print(f"PARTIDOS EN VIVO ({len(partidos)})")
        print("=" * 70)
        
        # Agrupar por competición
        por_competicion = {}
        for p in partidos:
            comp = p['competicion'] or 'Sin competición'
            if comp not in por_competicion:
                por_competicion[comp] = []
            por_competicion[comp].append(p)
        
        for competicion, partidos_comp in por_competicion.items():
            print(f"\n🏆 {competicion} ({len(partidos_comp)} partidos)")
            print("-" * 70)
            
            for i, p in enumerate(partidos_comp, 1):
                print(f"\n  {i}. {p['equipo_local']} vs {p['equipo_visitante']}")
                print(f"     Resultado: {p['goles_local']} - {p['goles_visitante']}")
                print(f"     Minuto: {p['minuto']}")
                if p['cuota_local']:
                    print(f"     Cuotas: {p['cuota_local']} | {p['cuota_empate']} | {p['cuota_visitante']}")


if __name__ == "__main__":
    # Opción 1: TODOS los partidos EN VIVO (sin filtro)
    scraper = BetanoEnVivo(headless=False)
    
    # Opción 2: Solo competiciones específicas (descomentar para usar)
    # scraper = BetanoEnVivo(
    #     headless=False,
    #     filtrar_competiciones=[
    #         'Liga de Primera',
    #         'Amistosos',
    #         'Nations League'
    #     ]
    # )
    
    partidos = scraper.extraer_en_vivo()
    scraper.mostrar(partidos)
    print("\n✓ LISTO!")