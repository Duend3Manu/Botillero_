import sys
import io
import requests
from datetime import datetime
import locale

# Configuración de la salida a UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuración de locale para leer fechas en español
try:
    locale.setlocale(locale.LC_TIME, 'es_ES.UTF-8')
except locale.Error:
    try:
        locale.setlocale(locale.LC_TIME, 'es_CL.UTF-8')
    except locale.Error:
        pass

def obtener_proximos_feriados():
    url = "https://api.boostr.cl/holidays.json"
    headers = {"accept": "application/json"}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json().get('data', [])
        
        today = datetime.now().date()
        proximos = []
        
        for feriado in data:
            fecha_str = feriado.get('date')
            try:
                fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").date()
            except ValueError:
                continue
                
            if fecha_obj >= today:
                proximos.append({
                    'fecha': fecha_obj,
                    'nombre': feriado.get('title'),
                    'tipo': feriado.get('type', ''),
                    'irrenunciable': feriado.get('inalienable', False),
                    'extra': feriado.get('extra', '')
                })
        
        # Ordenar por fecha y tomar los próximos 5
        proximos.sort(key=lambda x: x['fecha'])
        proximos = proximos[:5]
        
        if len(proximos) > 0:
            print('🥳 *Próximos feriados en Chile:*\n')
            for i, feriado in enumerate(proximos, 1):
                fecha_formateada = feriado['fecha'].strftime('%d de %B').lower()
                dia_semana = feriado['fecha'].strftime('%A').capitalize()
                
                dias_restantes = (feriado['fecha'] - today).days
                
                if dias_restantes == 0:
                    marcador = "🔴 Hoy"
                elif dias_restantes == 1:
                    marcador = "⏰ Mañana"
                else:
                    marcador = f"📅 En {dias_restantes} días"
                
                # Etiquetas
                tag_irrenunciable = "🚫 *IRRENUNCIABLE*" if feriado['irrenunciable'] else "✅ Renunciable"
                
                is_regional = "regional" in feriado['extra'].lower() or "regional" in feriado['tipo'].lower() or "regional" in feriado['nombre'].lower()
                tag_regional = " 📍 *REGIONAL*" if is_regional else ""
                
                output = f"{i}. *{feriado['nombre']}*\n"
                output += f"   {dia_semana}, {fecha_formateada} ({marcador})\n"
                output += f"   {tag_irrenunciable}{tag_regional}\n"
                print(output)
        else:
            print('🎉 Ucha, parece que no quedan feriados. ¡Que descanses!')

    except Exception as e:
        print(f"⚠️ Error al obtener los feriados desde API: {str(e)}", file=sys.stderr)

if __name__ == "__main__":
    obtener_proximos_feriados()