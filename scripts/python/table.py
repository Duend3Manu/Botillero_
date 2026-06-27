import sys
import io
import requests

# Forzar UTF-8 para emojis y acentos en Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def obtener_tabla():
    url = "https://site.web.api.espn.com/apis/v2/sports/soccer/chi.1/standings"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        
        # Obtenemos la lista de entradas de la tabla
        entries = data['children'][0]['standings']['entries']
        
        print("🏆 *Tabla de Posiciones Campeonato Nacional* 🇨🇱\n")
        
        for entry in entries:
            equipo = entry['team']['shortDisplayName']
            
            puntos = "0"
            posicion_real = None
            
            for stat in entry['stats']:
                if stat.get('name') == 'points':
                    puntos = stat.get('displayValue', '0')
                if stat.get('name') == 'rank':
                    posicion_real = stat.get('displayValue')
            
            # Si no viene el rango explicito, usamos el índice
            if not posicion_real:
                posicion_real = entries.index(entry) + 1
                
            print(f"{posicion_real}. *{equipo}* - {puntos} pts")
            
    except Exception as e:
        print(f"⚠️ Error al obtener la tabla de posiciones: {e}")

if __name__ == "__main__":
    obtener_tabla()
