import re

with open('roster.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update Promise.all fetch
old_fetch = '''const [playersRes, ecoRes] = await Promise.all([
            fetch('players.csv'),
            fetch('economia.csv')
        ]);
        if (!playersRes.ok || !ecoRes.ok) throw new Error('No se pudo descargar los CSVs.');

        const playersText = await playersRes.text();
        const ecoText = await ecoRes.text();'''

new_fetch = '''const [playersRes, ecoRes, draftRes] = await Promise.all([
            fetch('players.csv'),
            fetch('economia.csv'),
            fetch('draft_picks.csv')
        ]);
        if (!playersRes.ok || !ecoRes.ok || !draftRes.ok) throw new Error('No se pudo descargar los CSVs.');

        const playersText = await playersRes.text();
        const ecoText = await ecoRes.text();
        const draftText = await draftRes.text();'''

js = js.replace(old_fetch, new_fetch)

# 2. Add draft logic after Economy logic
old_eco_end = '''        } else {
            ecoBody.innerHTML = `<tr><td colspan="2" class="text-center" style="color: var(--text-muted);">No hay datos económicos.</td></tr>`;
        }'''

new_draft_logic = '''        } else {
            ecoBody.innerHTML = `<tr><td colspan="2" class="text-center" style="color: var(--text-muted);">No hay datos económicos.</td></tr>`;
        }

        // 6. Rellenar Tabla Rondas Draft
        const parsedDraft = Papa.parse(draftText, { header: true, skipEmptyLines: true }).data;
        const draftBody = document.getElementById('draft-body');
        if (draftBody) {
            draftBody.innerHTML = '';
            // Handle header encoding for 'Año' which might be mangled
            const teamDraftPicks = parsedDraft.filter(d => d.Equipo && d.Equipo.toLowerCase() === targetTeamName.toLowerCase());
            
            if (teamDraftPicks.length === 0) {
                draftBody.innerHTML = `<tr><td colspan="4" class="text-center" style="color: var(--text-muted); font-style: italic;">No hay rondas registradas.</td></tr>`;
            } else {
                // Determine the 'Año' key
                const sample = parsedDraft[0] || {};
                const yearKey = Object.keys(sample).find(k => k.includes('A') && k.includes('o')) || 'Año';
                
                teamDraftPicks.sort((a, b) => {
                    const ya = parseInt(a[yearKey] || 0);
                    const yb = parseInt(b[yearKey] || 0);
                    if (ya !== yb) return ya - yb;
                    return parseInt(a.Ronda || 0) - parseInt(b.Ronda || 0);
                });

                teamDraftPicks.forEach(d => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="text-center font-data">${d[yearKey] || '-'}</td>
                        <td class="text-center font-data">${d.Ronda || '-'}</td>
                        <td>${d["Equipo Original"] || '-'}</td>
                        <td style="font-size: 13px; color: var(--text-muted);">${d.Comentario || ''}</td>
                    `;
                    draftBody.appendChild(tr);
                });
            }
        }'''

if old_eco_end in js:
    js = js.replace(old_eco_end, new_draft_logic)
    with open('roster.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print("Success")
else:
    print("Could not find old_eco_end")
