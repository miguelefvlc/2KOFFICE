import cloudscraper
from bs4 import BeautifulSoup
import re

scraper = cloudscraper.create_scraper()
html = scraper.get('https://www.2kratings.com/nikola-jokic').text
soup = BeautifulSoup(html, 'html.parser')

# Let's look for elements that have the text "98" which we know is his rating, and print their classes
rating_value = "98"
for elem in soup.find_all(string=lambda text: text and rating_value in text):
    parent = elem.parent
    if parent.has_attr('class'):
        print(f"Parent tag: {parent.name}, classes: {parent['class']}, text: {parent.text.strip()}")
    else:
        print(f"Parent tag: {parent.name}, no class, text: {parent.text.strip()}")
