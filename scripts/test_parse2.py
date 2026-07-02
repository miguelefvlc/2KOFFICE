import cloudscraper
import re

scraper = cloudscraper.create_scraper()

def get_overall(player_url):
    html = scraper.get(player_url).text
    match = re.search(r'labels:\s*\["Overall"[^\]]*\],\s*(?:[^\]]*\s*)*?data:\s*\[(\d+)', html)
    if match:
        return match.group(1)
    
    # Fallback just in case
    match2 = re.search(r'labels:\s*\["Overall".*?data:\s*\[(\d+)', html, re.DOTALL)
    if match2:
        return match2.group(1)
    
    return "Not found"

print("Jokic:", get_overall('https://www.2kratings.com/nikola-jokic'))
print("LeBron:", get_overall('https://www.2kratings.com/lebron-james'))
print("Random bench:", get_overall('https://www.2kratings.com/christian-braun'))
