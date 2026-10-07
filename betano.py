from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime
import time
import sys
import argparse

sys.stdout.reconfigure(encoding='utf-8')


class BetanoChileScraper:
    def __init__(self, headless=False, output_file=None):
        self.url = "https://www.betanosports.com/sport/futbol/chile/liga-de-primera/16932/?bt=matchresult"
        self.output_file = output_file
        
        self.options = Options()
        if headless:
            self.options.add_argument('--headless')
        self.options.add_argument('--no-sandbox')
        self.options.add_argument('--disable-gpu')
        self.options.add_argument('--window-size=1920,1080')
        self.options.add_argument('--user-agent=Mozilla/5.0')
        
        self.driver = None
        
        self.equipos_chile = [
            'COBRESAL', 'UNIVERSIDAD DE CONCEPCION', 'HUACHIPATO', "O'HIGGINS",
            'UNIVERSIDAD CATOLICA', 'AUDAX ITALIANO', 'EVERTON DE VINA DEL MAR',
            'DEPORTES LA SERENA', 'COQUIMBO UNIDO', 'COLO COLO',
            'DEPORTES CONCEPCION', 'UNIÓN LA CALERA', 'DEPORTES LIMACHE',
            'PALESTINO', 'UNIÓN ESPAÑOLA', 'UNIVERSIDAD DE CHILE',
            'ÑUBLENSE', 'COPIAPÓ', 'MAGALLANES', 'SANTIAGO MORNING'
        ]
    
    def iniciar(self):
        self.driver = webdriver.Chrome(options=self.options)
    
    def cerrar(self):
        if self.driver:
            self.driver.quit()
    
    def extraer(self):
        """Extrae todos los partidos desde los contenedores individuales."""
        self.iniciar()
        
        try:
            print(f"Navegando a: {self.url}")
            self.driver.get(self.url)
            time.sleep(10)
            
            # La página usa una lista virtual. Hay que desplazar varias veces
            # para que Vue renderice todos los eventos.
            altura_anterior = 0
            for _ in range(12):
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(1.5)
                altura_actual = self.driver.execute_script("return document.body.scrollHeight")
                if altura_actual == altura_anterior:
                    break
                altura_anterior = altura_actual
            
            # Volver arriba no es necesario; tomamos el HTML renderizado.
            html = self.driver.page_source
            soup = BeautifulSoup(html, "lxml")
            print(f"\nTotal elementos: {len(soup.find_all())}")
            
            # La estructura real usa este atributo: data-evtid
            contenedores = soup.select("[data-evtid]")
            print(f"Contenedores de eventos encontrados: {len(contenedores)}")
            
            partidos = []
            for contenedor in contenedores:
                evento_id = contenedor.get("data-evtid", "")
                
                # Fecha y hora
                spans_hora = contenedor.select(".tw-text-sem-color-text-gray-subtle span")
                textos_hora = [
                    span.get_text(" ", strip=True)
                    for span in spans_hora
                    if span.get_text(strip=True)
                ]
                if len(textos_hora) < 2:
                    print(f"⚠ Evento {evento_id}: no tiene fecha/hora")
                    continue
                fecha = textos_hora[0]
                hora = textos_hora[1]
                
                # Enlace que contiene los dos equipos
                enlace = contenedor.select_one('a[href*="/cuotas-de-partido/"]')
                if not enlace:
                    print(f"⚠ Evento {evento_id}: no tiene enlace")
                    continue
                
                # Los equipos están dentro de data-qa="participants"
                participantes = enlace.select('[data-qa="participants"] .tw-truncate.tw-text-s')
                nombres = []
                for elemento in participantes:
                    nombre = elemento.get_text(" ", strip=True)
                    nombre = re.sub(r"\s+", " ", nombre).strip()
                    if nombre and nombre not in nombres:
                        nombres.append(nombre)
                
                # Fallback utilizando los atributos alt de los escudos
                if len(nombres) < 2:
                    nombres = []
                    for imagen in enlace.select('[data-qa="participants"] img[alt]'):
                        nombre = imagen.get("alt", "").strip()
                        if nombre and nombre not in nombres:
                            nombres.append(nombre)
                
                if len(nombres) < 2:
                    print(f"⚠ Evento {evento_id}: no se encontraron los dos equipos")
                    continue
                
                equipo_local = nombres[0]
                equipo_visitante = nombres[1]
                
                if equipo_visitante.lower() in ("ublense", "nublense"):
                    equipo_visitante = "ÑUBLENSE"
                if equipo_local.lower() in ("ublense", "nublense"):
                    equipo_local = "ÑUBLENSE"
                
                # Cuotas mediante aria-label
                cuotas = {}
                for seleccion in contenedor.select('[aria-label*="odds"]'):
                    aria = seleccion.get("aria-label", "")
                    match_cuota = re.search(r"Bet on\s+([1X2])\s+with odds\s+([\d.]+)", aria, re.IGNORECASE)
                    if match_cuota:
                        tipo = match_cuota.group(1).upper()
                        valor = match_cuota.group(2).rstrip('.')
                        cuotas[tipo] = valor
                
                # Fallback para extraer las cuotas visuales
                if not all(tipo in cuotas for tipo in ("1", "X", "2")):
                    valores = contenedor.select(".tw-text-sem-color-text-highlight")
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
                
                if not all(tipo in cuotas for tipo in ("1", "X", "2")):
                    print(f"⚠ {equipo_local} vs {equipo_visitante}: faltan cuotas")
                    continue
                
                href = enlace.get("href", "")
                if href.startswith("/"):
                    url_partido = "https://www.betanosports.com" + href
                else:
                    url_partido = href
                
                partido = {
                    "id_evento": evento_id,
                    "fecha": fecha,
                    "hora": hora,
                    "equipo_local": equipo_local,
                    "equipo_visitante": equipo_visitante,
                    "cuota_local": cuotas["1"],
                    "cuota_empate": cuotas["X"],
                    "cuota_visitante": cuotas["2"],
                    "url": url_partido
                }
                partidos.append(partido)
                print(f"\n✓ {fecha} {hora}")
                print(f"  {equipo_local} vs {equipo_visitante}")
                print(f"  Cuotas: {cuotas['1']} | {cuotas['X']} | {cuotas['2']}")
            
            # Eliminar duplicados por ID de evento
            partidos_unicos = []
            ids_vistos = set()
            for partido in partidos:
                clave = partido["id_evento"]
                if clave not in ids_vistos:
                    ids_vistos.add(clave)
                    partidos_unicos.append(partido)
            
            partidos = partidos_unicos
            print(f"\nTotal partidos únicos: {len(partidos)}")
            
            if partidos:
                archivo = self.output_file if self.output_file else f"partidos_chile_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                with open(archivo, "w", encoding="utf-8") as f:
                    json.dump(partidos, f, indent=2, ensure_ascii=False)
                print(f"✓ Guardado en: {archivo}")
            
            return partidos
            
        finally:
            self.cerrar()

    def mostrar(self, partidos):
        if not partidos:
            print("\n✗ Sin partidos")
            return
        
        print("\n" + "=" * 70)
        print(f"PARTIDOS LIGA CHILENA ({len(partidos)})")
        print("=" * 70)
        
        por_fecha = {}
        for p in partidos:
            if p['fecha'] not in por_fecha:
                por_fecha[p['fecha']] = []
            por_fecha[p['fecha']].append(p)
        
        for fecha in sorted(por_fecha.keys()):
            print(f"\n📅 {fecha}")
            print("-" * 70)
            
            for i, p in enumerate(por_fecha[fecha], 1):
                print(f"  {i:2}. {p['hora']} | {p['equipo_local'][:30]:<30} vs {p['equipo_visitante'][:30]:<30}")
                print(f"       Cuotas: {p['cuota_local']:>6} | {p['cuota_empate']:>6} | {p['cuota_visitante']:>6}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    parser.add_argument("--output", type=str, help="Output JSON file path")
    args = parser.parse_args()
    
    scraper = BetanoChileScraper(headless=args.headless, output_file=args.output)
    partidos = scraper.extraer()
    if not args.output:
        scraper.mostrar(partidos)
    print("\n✓ LISTO!")