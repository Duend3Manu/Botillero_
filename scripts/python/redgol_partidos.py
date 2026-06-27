import sys
import json
import re
import os
import requests
from datetime import datetime

# Forzar UTF-8 para emojis y acentos
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'liga_week.json')
BASE_URL = 'https://redgol.cl/resultados/futbol/competencias/liga-de-primera/c8b5e107-50d8-445c-99b0-57c3b5989ec1/calendario?stage_id=af2d629a-8fa1-465d-8430-c946e715e373&week={}'

def fix_encoding(text):
    if not text: return ""
    # The API returns unicode replacement char for accents
    return text.replace('\ufffdn', 'ón').replace('\ufffdublense', 'Ñublense').replace('\ufffdo', 'ío').replace('Uni\ufffdn', 'Unión').replace('Concepci\ufffdn', 'Concepción').replace('\ufffd', '')

def load_week():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f).get('current_week', 16)
        except:
            pass
    return 16

def save_week(week):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump({'current_week': week}, f, indent=2)

def fetch_and_parse(week):
    url = BASE_URL.format(week)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', r.text)
    if not m:
        raise ValueError("No se pudo encontrar el JSON de Redgol")
        
    data = json.loads(m.group(1))
    props = data.get('props', {}).get('pageProps', {})
    
    schedule = props.get('schedule', {})
    if not schedule:
        raise ValueError("Estructura inesperada (sin schedule)")
        
    matchday = schedule.get('matchday', {})
    if not matchday or not matchday.get('groups'):
        return [], ""
        
    matches = []
    for g in matchday.get('groups', []):
        matches.extend(g.get('matches', []))
        
    title = matchday.get('title', f"Fecha {week}")
    return matches, title

DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

def procesar_partidos(week, check_auto_advance=True):
    matches, title = fetch_and_parse(week)
    
    if not matches:
        print(f"🚫 No hay partidos programados para la fecha {week}.")
        return
        
    print(f"🏆 *Liga Chilena - {title.upper()}* 🇨🇱\n")
    
    todos_finalizados = True
    partidos_por_fecha = {}
    
    for m in matches:
        home = fix_encoding(m['home_team']['name'])
        away = fix_encoding(m['away_team']['name'])
        score_home = m.get('total_scores_home', 0)
        score_away = m.get('total_scores_away', 0)
        mode = m.get('mode', '')
        hora = m.get('hour', '')
        date_str = m.get('date', '')
        
        # Parsear fecha
        try:
            # extraemos yyyy-mm-dd
            dt = datetime.strptime(date_str[:10], '%Y-%m-%d')
            fecha_key = f"{DIAS_SEMANA[dt.weekday()]} {dt.strftime('%d/%m')}"
        except:
            fecha_key = "Por confirmar"
        
        # Determine status
        if mode == 'HOUR' or not mode:
            status = f"_{hora}_"
            todos_finalizados = False
        elif mode in ['FT', 'PEN', 'AET', 'FINISHED']:
            status = f"*{score_home} - {score_away}*"
        elif mode in ['LIVE', 'MIN', 'HT']:
            minuto = m.get('minute', '')
            status = f"🔴 {score_home} - {score_away} ({minuto}')"
            todos_finalizados = False
        else:
            status = f"*{score_home} - {score_away}* ({mode})"
            if mode not in ['POST', 'CANC']: 
                todos_finalizados = False
                
        if fecha_key not in partidos_por_fecha:
            partidos_por_fecha[fecha_key] = []
            
        partidos_por_fecha[fecha_key].append(f"🏟️ *{home}* {status} *{away}*")
        
    for fecha, lista in partidos_por_fecha.items():
        print(f"📅 *{fecha}*")
        for p in lista:
            print(p)
        print("")
        
    # Avance automático
    if check_auto_advance and matches and todos_finalizados:
        next_week = week + 1
        save_week(next_week)
        print("⏳ _Todos los partidos han finalizado. Mostrando la siguiente fecha..._")
        print("-" * 30 + "\n")
        procesar_partidos(next_week, check_auto_advance=False)

if __name__ == "__main__":
    try:
        current_week = load_week()
        procesar_partidos(current_week)
    except Exception as e:
        print(f"⚠️ Error al obtener partidos desde Redgol: {e}")
