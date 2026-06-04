import asyncio
import aiohttp
from bs4 import BeautifulSoup
import sys
import requests
from datetime import datetime
import io
import re
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Configurar salida UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
    'Referer': 'https://www.google.com/'
}

MAX_CONCURRENT_REQUESTS = 5

def limpiar_valor_cl(texto):
    if not texto: return 0.0
    limpio = re.sub(r'[^\d,.-]', '', texto.split()[0])
    if '.' in limpio and ',' in limpio:
        limpio = limpio.replace('.', '').replace(',', '.')
    elif ',' in limpio:
        limpio = limpio.replace(',', '.')
    elif '.' in limpio:
        partes = limpio.split('.')
        if len(partes[-1]) == 3:
            limpio = limpio.replace('.', '')
    try: return float(limpio)
    except: return 0.0

def formatear_con_separadores(valor):
    try:
        return "{:,}".format(int(float(valor))).replace(",", ".")
    except: return str(valor)

def formatear_con_decimales(valor):
    try:
        if isinstance(valor, (int, float)):
            val_float = float(valor)
        else:
            val_float = limpiar_valor_cl(str(valor))
        return "{:,.2f}".format(val_float).replace(",", "X").replace(".", ",").replace("X", ".")
    except: return str(valor)

async def obtener_valor_google(session, url, semaphore):
    async with semaphore:
        try:
            # hl=es asegura que el formato de moneda y decimales sea consistente
            params = {'hl': 'es', 'gl': 'cl'}
            async with session.get(url, headers=HEADERS, timeout=15, params=params) as response:
                if response.status == 200:
                    html = await response.text()
                    soup = BeautifulSoup(html, 'html.parser')

                    # 1. Intentar obtener de metadatos (itemprop="price"), es lo más estable para bots
                    meta_price = soup.find('meta', itemprop='price')
                    if meta_price and meta_price.get('content'):
                        return meta_price.get('content')

                    # 2. Fallback a selectores visuales si falla el meta tag
                    elemento_valor = (
                        soup.select_one('.YMlKec.fxKbKc') or 
                        soup.find(class_='YMlKec') or
                        soup.find(class_=re.compile(r'YMlKec'))
                    )

                    if elemento_valor:
                        texto = elemento_valor.get_text(strip=True)
                        return re.sub(r'[^\d,.]', '', texto)
        except: pass
        return None

def obtener_indicadores_finclaro():
    options = Options()
    options.add_argument("--headless=new")
    driver = webdriver.Chrome(options=options)
    
    try:
        driver.get("https://finclaro.cl/indicadores")
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CLASS_NAME, "glass-card")))
        time.sleep(2)
        
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        indicadores = {}
        
        for card in soup.find_all("div", class_="glass-card"):
            titulo_elem = card.find("h3")
            if not titulo_elem: continue
            
            label = titulo_elem.get_text(strip=True).lower()
            
            # EXTRAER FECHA (el span hermano del h3)
            fecha_tag = titulo_elem.find_next_sibling("span")
            fecha = fecha_tag.get_text(strip=True) if fecha_tag else ""
            
            # EXTRAER VALOR
            val_tag = card.find("span", class_=lambda c: c and ("text-2xl" in c or "text-3xl" in c))
            if not val_tag: continue
            val_raw = val_tag.get_text(strip=True)
            
            # Guardamos valor y fecha en un diccionario
            datos = {"val": val_raw, "fec": fecha}
            
            if "uf" in label: indicadores['uf'] = datos
            elif "dólar observado" in label: indicadores['dolar'] = datos
            elif "utm" in label: indicadores['utm'] = datos
            elif "mensual" in label and "ipc" in label: indicadores['ipc_m'] = datos
            elif "anual" in label and "ipc" in label: indicadores['ipc_a'] = datos
            elif "tpm" in label: indicadores['tpm'] = datos
            elif "cobre" in label: indicadores['cobre'] = datos

        driver.quit()
        
        if not indicadores: return "⚠️ No se encontraron indicadores."

        # Construcción del reporte con fechas al costado
        reporte = []
        
        if 'uf' in indicadores:
            val = formatear_con_separadores(limpiar_valor_cl(indicadores['uf']['val']))
            reporte.append(f"🇨🇱 *UF:* ${val} ({indicadores['uf']['fec']})")
            
        if 'dolar' in indicadores:
            val = formatear_con_separadores(limpiar_valor_cl(indicadores['dolar']['val']))
            reporte.append(f"💵 *Dólar:* ${val} ({indicadores['dolar']['fec']})")
            
        if 'utm' in indicadores:
            val = formatear_con_separadores(limpiar_valor_cl(indicadores['utm']['val']))
            reporte.append(f"⚖️ *UTM:* ${val} ({indicadores['utm']['fec']})")
            
        if 'ipc_m' in indicadores or 'ipc_a' in indicadores:
            m_val = indicadores.get('ipc_m', {}).get('val', 'N/A')
            m_fec = indicadores.get('ipc_m', {}).get('fec', '')
            a_val = indicadores.get('ipc_a', {}).get('val', 'N/A')
            a_fec = indicadores.get('ipc_a', {}).get('fec', '')
            reporte.append(f"📈 *IPC:* {m_val} ({m_fec}) Mes | {a_val} ({a_fec}) Anual")
            
        if 'tpm' in indicadores:
            reporte.append(f"🏦 *TPM:* {indicadores['tpm']['val']} ({indicadores['tpm']['fec']})")
        
        return "\n".join(reporte)
    except Exception as e:
        driver.quit()
        return f"⚠️ Error en Finclaro: {e}"

async def obtener_valores_divisas(session):
    urls = {
        '💵 USD': 'https://www.google.com/finance/quote/USD-CLP',
        '🇪🇺 EUR': 'https://www.google.com/finance/quote/EUR-CLP',
        '🇧🇷 BRL': 'https://www.google.com/finance/quote/BRL-CLP',
        '🇵🇪 PEN': 'https://www.google.com/finance/quote/PEN-CLP',
        '🇦🇷 ARS': 'https://www.google.com/finance/quote/ARS-CLP',
        '🇨🇴 COP': 'https://www.google.com/finance/quote/COP-CLP',
        '🇵🇾 PYG': 'https://www.google.com/finance/quote/PYG-CLP',
        '🇯🇵 JPY': 'https://www.google.com/finance/quote/JPY-CLP',
    }
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    tasks = [obtener_valor_google(session, url, semaphore) for url in urls.values()]
    resultados = await asyncio.gather(*tasks)
    
    return dict(zip(urls.keys(), resultados))

async def main():
    print(f"📅 *Indicadores Económicos - {datetime.now().strftime('%d-%m-%Y')}*\n")
    
    # 1. Indicadores Nacionales (FinClaro + Selenium)
    info_finclaro = obtener_indicadores_finclaro()
    print(info_finclaro)
    
    # 2. Mercado de Divisas (Google Finance + Aiohttp)
    # Usamos un conector que ignore errores de SSL comunes en entornos Windows (certificados desactualizados)
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        valores_divisas = await obtener_valores_divisas(session)
        
        # Si al menos una divisa se obtuvo, mostramos la sección
        if valores_divisas and any(v is not None for v in valores_divisas.values()):
            print("\n--- 🌎 *Conversión a Pesos (CLP)* ---")
            for nombre, valor in valores_divisas.items():
                if valor:
                    try:
                        val_float = limpiar_valor_cl(valor)
                        if val_float < 10:
                            # Formateo con 4 decimales para monedas pequeñas
                            f_val = f"{val_float:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        else:
                            f_val = formatear_con_decimales(val_float)
                            
                        print(f"{nombre}: ${f_val}")
                    except:
                        continue

if __name__ == "__main__":
    asyncio.run(main())