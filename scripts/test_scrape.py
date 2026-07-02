import requests
from bs4 import BeautifulSoup

url = "https://www.2kratings.com/nikola-jokic"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    response = requests.get(url, headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        soup = BeautifulSoup(response.text, "html.parser")
        # Trying to find the rating. 2kratings usually has it in a specific span or h1, let's just print title and some text
        print(soup.title.text)
        print("Success fetching")
    else:
        print("Failed to fetch")
except Exception as e:
    print(f"Error: {e}")
