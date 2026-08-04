#!/usr/bin/env python3
"""
Script estilo CCleaner para Windows - limpieza y optimización de memoria.
Autor: asistente
Requiere: Python 3.6+, Windows 10/11.
Modo por defecto: seguro, sin elevar permisos.
"""

import argparse
import os
import sys
import shutil
import tempfile
import ctypes
import time
from pathlib import Path

# Intentamos importar psutil (opcional pero recomendado para la limpieza de RAM)
try:
    import psutil
    PSUTIL_DISPONIBLE = True
except ImportError:
    PSUTIL_DISPONIBLE = False
    print("⚠️  psutil no instalado. La limpieza de RAM se omitirá (opcional).")
    print("   Instálalo con: pip install psutil")

# Constantes para APIs de Windows
SHEmptyRecycleBinW = ctypes.windll.shell32.SHEmptyRecycleBinW
SHEmptyRecycleBinW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint32]
SHEmptyRecycleBinW.restype = ctypes.c_int32

SHERB_NOCONFIRMATION = 0x00000001
SHERB_NOPROGRESSUI   = 0x00000002
SHERB_NOSOUND        = 0x00000004

# ----------------------------------------------------------------------
def es_admin():
    """Devuelve True si el script se ejecuta con privilegios de administrador."""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def vaciar_papelera():
    """Vacía la papelera de reciclaje de todas las unidades (sin confirmación)."""
    print("🗑️  Vaciando papelera de reciclaje...")
    if not es_admin():
        print("   - Se omite porque el proceso no tiene permisos de administrador.")
        return False

    resultado = SHEmptyRecycleBinW(None, None,
                                   SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND)
    if resultado == 0:
        print("   ✓ Papelera vaciada.")
    else:
        print(f"   ✗ Error al vaciar papelera (código {resultado}).")
    return resultado == 0

def limpiar_directorio(ruta, descripcion, borrar_raiz=False, patron="*"):
    """
    Elimina recursivamente archivos/carpetas que coincidan con 'patron' dentro de 'ruta'.
    Si borrar_raiz=True, elimina también la propia carpeta base.
    """
    ruta = os.path.expandvars(ruta)
    if not os.path.exists(ruta):
        return
    eliminados = 0
    try:
        for item in Path(ruta).glob(patron):
            try:
                if item.is_file() or item.is_symlink():
                    item.unlink()
                    eliminados += 1
                elif item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                    eliminados += 1
            except Exception:
                pass
        if borrar_raiz:
            shutil.rmtree(ruta, ignore_errors=True)
    except Exception:
        pass
    if eliminados > 0:
        print(f"   ✓ {descripcion}: {eliminados} elementos eliminados.")
    else:
        print(f"   - {descripcion}: ya estaba limpio.")

def limpiar_archivos_temporales(modo="seguro"):
    """Limpia las carpetas temporales del usuario y, si aplica, del sistema."""
    print("\n🧹 Limpiando archivos temporales...")
    # %TEMP% y %TMP%
    limpiar_directorio(tempfile.gettempdir(), "Carpeta TEMP del usuario")

    # Carpetas del sistema: solo se usan en modo completo y si ya hay permisos de administrador.
    if modo == "completo" and es_admin():
        limpiar_directorio(r"C:\Windows\Temp", "Carpeta Temp de Windows")
        limpiar_directorio(r"C:\Windows\Prefetch", "Prefetch de Windows")
    elif modo == "completo":
        print("   - Se omiten carpetas temporales del sistema porque no hay permisos de administrador.")
    else:
        print("   - Modo seguro: se omiten carpetas temporales del sistema.")

    # Archivos temporales de Internet (si existe)
    limpiar_directorio(os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\INetCache"),
                       "Caché de Internet Explorer/Edge Legacy")

def limpiar_cache_navegadores():
    """Elimina las cachés de los navegadores más comunes."""
    print("\n🌐 Limpiando cachés de navegadores...")
    base_local = os.environ.get("LOCALAPPDATA", "")
    base_roaming = os.environ.get("APPDATA", "")

    navegadores = [
        # Chrome
        (os.path.join(base_local, r"Google\Chrome\User Data\Default\Cache"), "Google Chrome"),
        (os.path.join(base_local, r"Google\Chrome\User Data\Default\Code Cache"), "Chrome Code Cache"),
        # Edge (Chromium)
        (os.path.join(base_local, r"Microsoft\Edge\User Data\Default\Cache"), "Microsoft Edge"),
        (os.path.join(base_local, r"Microsoft\Edge\User Data\Default\Code Cache"), "Edge Code Cache"),
        # Firefox
        (os.path.join(base_roaming, r"Mozilla\Firefox\Profiles"), "Firefox (cachés de perfiles)"),
        # Brave
        (os.path.join(base_local, r"BraveSoftware\Brave-Browser\User Data\Default\Cache"), "Brave"),
        # Opera
        (os.path.join(base_roaming, r"Opera Software\Opera Stable\Cache"), "Opera"),
    ]
    for ruta, nombre in navegadores:
        if "Firefox" in nombre:
            # Firefox tiene múltiples perfiles; limpiamos cache2/entries y startupCache
            if os.path.exists(ruta):
                for perfil in Path(ruta).glob("*"):
                    cache_dir = perfil / "cache2" / "entries"
                    startup_cache = perfil / "startupCache"
                    if cache_dir.exists():
                        limpiar_directorio(str(cache_dir), f"{nombre} ({perfil.name})")
                    if startup_cache.exists():
                        limpiar_directorio(str(startup_cache), f"{nombre} startupCache ({perfil.name})")
        else:
            if os.path.exists(ruta):
                # Para Chrome/Edge/Brave eliminamos toda la carpeta Cache
                shutil.rmtree(ruta, ignore_errors=True)
                print(f"   ✓ {nombre}: caché eliminada.")
            else:
                # Buscar en todos los perfiles (por si hay varios)
                base_path = os.path.dirname(ruta)
                if os.path.exists(base_path):
                    for perfil in Path(base_path).glob("Profile *"):
                        perfil_cache = perfil / "Cache"
                        if perfil_cache.exists():
                            shutil.rmtree(perfil_cache, ignore_errors=True)
                            print(f"   ✓ {nombre} ({perfil.name}): caché eliminada.")
                # También intentar "Default" si no estaba la ruta exacta
                default_cache = os.path.join(base_path, "Default", "Cache") if "Default" not in ruta else None
                if default_cache and os.path.exists(default_cache):
                    shutil.rmtree(default_cache, ignore_errors=True)
                    print(f"   ✓ {nombre}: caché Default eliminada.")

def limpiar_logs_sistema(modo="seguro"):
    """Borra archivos de registro de Windows (logs, CBS, etc.) solo si es seguro hacerlo."""
    print("\n📋 Limpiando logs del sistema...")
    if modo == "completo" and es_admin():
        limpiar_directorio(r"C:\Windows\Logs\CBS", "Logs CBS (mantenimiento)")
        limpiar_directorio(r"C:\Windows\Logs\DISM", "Logs DISM")
        limpiar_directorio(r"C:\Windows\Logs\WindowsUpdate", "Logs Windows Update")
    else:
        print("   - Se omiten logs del sistema en modo seguro o sin permisos de administrador.")

def limpiar_volcados_memoria(modo="seguro"):
    """Elimina los volcados de memoria solo en modo completo y con permisos adecuados."""
    print("\n🧠 Limpiando volcados de memoria...")
    if modo == "completo" and es_admin():
        if os.path.exists(r"C:\Windows\MEMORY.DMP"):
            try:
                os.remove(r"C:\Windows\MEMORY.DMP")
                print("   ✓ MEMORY.DMP eliminado.")
            except Exception as e:
                print(f"   ✗ No se pudo eliminar MEMORY.DMP: {e}")
        limpiar_directorio(r"C:\Windows\Minidump", "Minidumps", patron="*.dmp")
        limpiar_directorio(r"C:\Windows\LiveKernelReports", "Reportes LiveKernel")
    else:
        print("   - Se omiten volcados de memoria en modo seguro o sin permisos de administrador.")

# ----------------------------------------------------------------------
# Funciones de liberación de RAM (requieren administrador y psutil)
# ----------------------------------------------------------------------
def liberar_memoria_ram():
    """
    Libera RAM reduciendo el conjunto de trabajo (working set) de todos los procesos
    y vaciando la caché del sistema de archivos.
    """
    if not es_admin():
        print("\n🔒 No tienes permisos de administrador; se omite la limpieza de RAM.")
        return False
    if not PSUTIL_DISPONIBLE:
        print("\n📦 psutil no disponible; se omite la limpieza de RAM.")
        return False

    print("\n⚡ Liberando memoria RAM...")
    procesos_optimizados = 0
    kernel32 = ctypes.windll.kernel32
    psapi = ctypes.windll.psapi
    EmptyWorkingSet = psapi.EmptyWorkingSet
    EmptyWorkingSet.argtypes = [ctypes.c_void_p]
    EmptyWorkingSet.restype = ctypes.c_bool

    PROCESS_QUERY_INFORMATION = 0x0400
    PROCESS_SET_QUOTA = 0x0100

    for proc in psutil.process_iter(['pid', 'name']):
        try:
            pid = proc.info['pid']
            handle = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA,
                                          False, pid)
            if handle:
                EmptyWorkingSet(handle)
                kernel32.CloseHandle(handle)
                procesos_optimizados += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
            pass

    print(f"   ✓ Se redujo el working set de {procesos_optimizados} procesos.")

    # Vaciar caché del sistema de archivos (requiere admin)
    try:
        # SetSystemFileCacheSize con (-1, -1, 0) fuerza el vaciado de la caché
        kernel32.SetSystemFileCacheSize(ctypes.c_size_t(-1), ctypes.c_size_t(-1), ctypes.c_ulong(0))
        print("   ✓ Caché del sistema de archivos vaciada.")
    except Exception as e:
        print(f"   ✗ Error al vaciar caché del sistema: {e}")

    return True

# ----------------------------------------------------------------------
def ejecutar_limpieza(modo="seguro"):
    """Ejecuta las tareas de limpieza y optimización en modo seguro o completo."""
    print("=" * 60)
    print("🧽  LIMPIADOR ESTILO CCLEANER PARA WINDOWS  🧽")
    print("=" * 60)
    inicio = time.time()

    if es_admin():
        print("🔐 El proceso tiene permisos de administrador.")
    else:
        print("🔓 El proceso no tiene permisos de administrador; se ejecutarán solo tareas seguras.\n")

    if modo == "seguro":
        print("🛡️  Modo seguro activado: se evitarán operaciones que requieran elevación.")
    else:
        print("⚙️  Modo completo activado: se intentarán tareas adicionales si ya hay permisos elevados.")

    # Limpieza de archivos
    limpiar_archivos_temporales(modo)
    limpiar_cache_navegadores()
    limpiar_logs_sistema(modo)
    limpiar_volcados_memoria(modo)
    vaciar_papelera()

    # Liberación de RAM (sólo si es administrador y psutil instalado)
    liberar_memoria_ram()

    tiempo_total = time.time() - inicio
    print("\n" + "=" * 60)
    print(f"✅ Limpieza completada en {tiempo_total:.2f} segundos.")
    print("Reinicia los programas abiertos si es necesario.")
    print("=" * 60)

# ----------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Limpia archivos temporales y cachés en Windows sin depender de permisos de administrador.")
    parser.add_argument("--silencioso", action="store_true", help="Ejecuta la limpieza sin preguntar al usuario.")
    parser.add_argument("--modo", choices=["seguro", "completo"], default="seguro",
                        help="Modo seguro (por defecto) o completo, que intenta usar tareas adicionales si ya hay privilegios elevados.")
    args = parser.parse_args()

    if args.silencioso:
        ejecutar_limpieza(args.modo)
    else:
        respuesta = input("¿Deseas ejecutar la limpieza? (s/n): ").lower()
        if respuesta in ("s", "si", "sí", "y", "yes"):
            ejecutar_limpieza(args.modo)
        else:
            print("Operación cancelada.")