import re
with open('equipos.html', 'r', encoding='utf-8') as f:
    html = f.read()
matches = re.findall(r'<img src="(logos/[^"]+)" alt="([^"]+)" class="team-logo">', html)
for src, alt in matches:
    print(f'"{alt}": "{src}",')
