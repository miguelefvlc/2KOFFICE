import pandas as pd
import cloudscraper
import re
import time
import unicodedata
import os
import shutil

# Configuración
CSV_FILE = 'players.csv'
BACKUP_FILE = 'players_backup.csv'

def clean_name(name):
    # Convertir a minúsculas
    name = name.lower()
    # Eliminar acentos y caracteres especiales
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
    # Reemplazar espacios por guiones y eliminar puntos o comillas
    name = re.sub(r'[^a-z0-9\s-]', '', name)
    name = re.sub(r'\s+', '-', name)
    return name

def get_overall(scraper, player_name):
    url_name = clean_name(player_name)
    url = f'https://www.2kratings.com/{url_name}'
    try:
        response = scraper.get(url, timeout=10)
        if response.status_code == 200:
            html = response.text
            # Buscar el Overall en el bloque de código de Chart.js
            match = re.search(r'labels:\s*\["Overall"[^\]]*\],\s*(?:[^\]]*\s*)*?data:\s*\[(\d+)', html)
            if match:
                return int(match.group(1))
            
            # Segunda búsqueda en caso de que cambie el formato
            match2 = re.search(r'labels:\s*\["Overall".*?data:\s*\[(\d+)', html, re.DOTALL)
            if match2:
                return int(match2.group(1))
                
            # Tercera búsqueda: buscar dentro de .attribute-box u otro si ChartJS falla
            match3 = re.search(r'<span class="attribute-box[^>]*>(\d+)</span>', html)
            if match3:
                return int(match3.group(1))
                
            print(f"  [!] No se pudo encontrar el número de Overall en la página de {player_name}")
        elif response.status_code == 404:
            print(f"  [!] Jugador no encontrado en 2kratings: {player_name} ({url_name})")
        else:
            print(f"  [!] Error HTTP {response.status_code} al buscar a {player_name}")
    except Exception as e:
        print(f"  [!] Error de conexión con {player_name}: {e}")
    
    return None

def main():
    print("Iniciando actualización automática de Ratings...")
    
    # Crear copia de seguridad
    if os.path.exists(CSV_FILE):
        shutil.copy(CSV_FILE, BACKUP_FILE)
        print(f"Copia de seguridad creada en {BACKUP_FILE}")
    else:
        print(f"Error: No se encontró el archivo {CSV_FILE}")
        return
        
    # Leer CSV
    df = pd.read_csv(CSV_FILE)
    if 'Player' not in df.columns or 'Rating' not in df.columns:
        print("Error: El CSV no tiene las columnas 'Player' o 'Rating'.")
        return
        
    scraper = cloudscraper.create_scraper()
    
    actualizados = 0
    errores = 0
    
    # Iterar sobre los jugadores
    total = len(df)
    for index, row in df.iterrows():
        player_name = row['Player']
        old_rating = row['Rating']
        
        print(f"[{index + 1}/{total}] Buscando a {player_name}...")
        
        new_rating = get_overall(scraper, player_name)
        
        if new_rating is not None:
            if new_rating != old_rating:
                print(f"  => Actualizado: {old_rating} -> {new_rating}")
                df.at[index, 'Rating'] = new_rating
                actualizados += 1
            else:
                print(f"  => Sin cambios (mantiene {old_rating})")
        else:
            errores += 1
            
        # Pequeña pausa para no saturar el servidor
        time.sleep(1)
        
        # Guardado parcial cada 50 jugadores por seguridad
        if (index + 1) % 50 == 0:
            df.to_csv(CSV_FILE, index=False)
            print(f"--- Progreso guardado automáticamente ---")
            
    # Guardado final
    df.to_csv(CSV_FILE, index=False)
    print("\n--- RESUMEN ---")
    print(f"Jugadores procesados: {total}")
    print(f"Ratings actualizados: {actualizados}")
    print(f"Errores / No encontrados: {errores}")
    print("El archivo players.csv ha sido actualizado exitosamente.")

if __name__ == "__main__":
    main()
