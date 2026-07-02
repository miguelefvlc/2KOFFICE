const teamLogos = {
    "Denver Nuggets": "logos/imgi_277_den.png",
    "Brooklyn Nets": "logos/imgi_268_bkn.png",
    "New York Knicks": "logos/imgi_269_ny.png",
    "Philadelphia 76ers": "logos/imgi_270_phi.png",
    "Toronto Raptors": "logos/imgi_271_tor.png",
    "Chicago Bulls": "logos/imgi_272_chi.png",
    "Cleveland Cavaliers": "logos/imgi_273_cle.png",
    "Detroit Pistons": "logos/imgi_274_det.png",
    "Indiana Pacers": "logos/imgi_275_ind.png",
    "Milwaukee Bucks": "logos/imgi_276_mil.png",
    "Atlanta Hawks": "logos/imgi_287_atl.png",
    "Charlotte Hornets": "logos/imgi_288_cha.png",
    "Miami Heat": "logos/imgi_289_mia.png",
    "Orlando Magic": "logos/imgi_290_orl.png",
    "Washington Wizards": "logos/imgi_291_wsh.png",
    "Boston Celtics": "logos/imgi_267_bos.png",
    "Minnesota Timberwolves": "logos/imgi_278_min.png",
    "Oklahoma City Thunder": "logos/imgi_279_okc.png",
    "Portland Trail Blazers": "logos/imgi_280_por.png",
    "Utah Jazz": "logos/imgi_281_utah.png",
    "Golden State Warriors": "logos/imgi_282_gs.png",
    "LA Clippers": "logos/imgi_283_lac.png",
    "Los Angeles Lakers": "logos/imgi_284_lal.png",
    "Phoenix Suns": "logos/imgi_285_phx.png",
    "Sacramento Kings": "logos/imgi_286_sac.png",
    "Dallas Mavericks": "logos/imgi_292_dal.png",
    "Houston Rockets": "logos/imgi_293_hou.png",
    "Memphis Grizzlies": "logos/imgi_294_mem.png",
    "New Orleans Pelicans": "logos/imgi_295_no.png",
    "San Antonio Spurs": "logos/imgi_296_sa.png",
};


// Add utility functions
function calculateAge(birthday) {
    if (!birthday) return '-';
    const ageDifMs = Date.now() - new Date(birthday).getTime();
    const ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function getPlayerPhotoPath(playerName) {
    if (!playerName) return '';
    let slug = playerName.toLowerCase();
    slug = slug.normalize("NFD").replace(/[̀-ͯ]/g, "");
    slug = slug.replace(/['’.]/g, "");
    slug = slug.replace(/[^a-z0-9]+/g, "-");
    slug = slug.replace(/^-+|-+$/g, "");
    return `photos/${slug}.png`;
}

function generate2kRatingUrl(playerName) {
    if (!playerName) return '#';
    const formattedName = playerName.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().replace(/\s+/g, '-');
    return `https://www.2kratings.com/player/${formattedName}`;
}

function getOptClass(optStr) {
    if(!optStr) return '';
    const upper = optStr.toString().toUpperCase();
    if(upper.includes('PO')) return 'opt-po';
    if(upper.includes('TO')) return 'opt-to';
    if(upper.includes('NG')) return 'opt-ng';
    return '';
}

function formatCurrencyOpt(val) {
    if(!val || val === '0') return '-';
    return formatCurrency(parseCurrencyStr(val));
}

// Utils
function formatCurrency(value) {
    if (!value || isNaN(value)) return "$0";
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function parseCurrencyStr(val) {
    if(!val) return 0;
    return parseFloat(val.toString().replace(/[\$,]/g, '')) || 0;
}

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Obtener parámetro de URL
    const urlParams = new URLSearchParams(window.location.search);
    const teamNameParam = urlParams.get('team');

    if (!teamNameParam) {
        document.getElementById('roster-team-name').textContent = "Equipo no encontrado";
        document.getElementById('loader').style.display = 'none';
        document.getElementById('roster-content').style.display = 'block';
        return;
    }

    const targetTeamName = teamNameParam;

    // Populate Nav Bar
    const navBar = document.getElementById('roster-nav-bar');
    if (navBar) {
        Object.keys(teamLogos).forEach(team => {
            const a = document.createElement('a');
            a.href = `roster.html?team=${encodeURIComponent(team)}`;
            const img = document.createElement('img');
            img.src = teamLogos[team];
            img.className = 'roster-nav-logo';
            img.title = team;
            if (team.toLowerCase() === targetTeamName.toLowerCase()) {
                img.classList.add('active');
            }
            a.appendChild(img);
            navBar.appendChild(a);
        });
    }


    // 2. Establecer Cabecera
    document.getElementById('roster-team-name').textContent = targetTeamName.toUpperCase();
    const logoSrc = teamLogos[targetTeamName] || "";
    if (logoSrc) {
        document.getElementById('roster-team-logo').src = logoSrc;
    } else {
        document.getElementById('roster-team-logo').style.display = 'none';
    }

    try {
        // 3. Fetch CSVs
        const [playersRes, ecoRes, draftRes] = await Promise.all([
            fetch('players.csv'),
            fetch('economia.csv'),
            fetch('draft_picks.csv')
        ]);
        if (!playersRes.ok || !ecoRes.ok || !draftRes.ok) throw new Error('No se pudo descargar los CSVs.');

        const playersText = await playersRes.text();
        const ecoText = await ecoRes.text();
        const draftText = await draftRes.text();
        const delimiterEco = ecoText.split('\n')[0].includes(';') ? ';' : ',';
        const delimiterPlayers = playersText.split('\n')[0].includes(';') ? ';' : ',';
        
        const parsedEco = Papa.parse(ecoText, { header: true, skipEmptyLines: true, delimiter: delimiterEco }).data;
        const parsedPlayers = Papa.parse(playersText, { header: true, skipEmptyLines: true, delimiter: delimiterPlayers }).data;

        // 4. Buscar Equipo en economia.csv para obtener su ID y sus datos financieros
        let teamId = null;
        let teamEconomyData = null;

        parsedEco.forEach((row, idx) => {
            let name = row["Equipo"] || row["Team"] || "Equipo " + (idx+1);
            name = name.replace(/['"]/g, '').trim();
            if (name.toLowerCase() === targetTeamName.toLowerCase()) {
                teamId = (idx + 1).toString();
                teamEconomyData = row;
            }
        });

        if (!teamId) {
            console.error("No se encontró el equipo en economia.csv");
            document.getElementById('loader').style.display = 'none';
            document.getElementById('roster-content').style.display = 'block';
            return;
        }

        // 5. Rellenar Tabla Economía
        const ecoBody = document.getElementById('economy-body');
        ecoBody.innerHTML = ''; // Clear
        
        if (teamEconomyData) {
            // Extraer las claves principales de economía
            const keys = [
                "Disponible limite salarial",
                "Disponible presupuesto",
                "Disponible MLE",
                "Caphold retenido",
                "Efectivo LS (- Cap Hold)",
                "Efectivo Presupuesto (- firmas retrasadas)"
            ];

            keys.forEach(key => {
                if (teamEconomyData[key] !== undefined) {
                    const val = parseCurrencyStr(teamEconomyData[key]);
                    const tr = document.createElement('tr');
                    
                    const tdLabel = document.createElement('td');
                    tdLabel.textContent = key;
                    tdLabel.style.fontWeight = '600';
                    
                    const tdVal = document.createElement('td');
                    tdVal.textContent = formatCurrency(val);
                    tdVal.className = 'text-right font-data';
                    
                    // Colorear negativos
                    if (val < 0) {
                        tdVal.classList.add('economy-row-negative');
                    } else if (val > 0 && key.includes("Disponible")) {
                        tdVal.classList.add('economy-row-positive');
                    }
                    
                    tr.appendChild(tdLabel);
                    tr.appendChild(tdVal);
                    ecoBody.appendChild(tr);
                }
            });
        }

        // 6. Filtrar y Rellenar Tabla Jugadores
        const rosterBody = document.getElementById('roster-body');
        rosterBody.innerHTML = '';

        const teamPlayers = parsedPlayers.filter(p => p.team_id === teamId);

        // Sort by Rating by default
        teamPlayers.sort((a, b) => {
            return (parseFloat(b.Rating) || 0) - (parseFloat(a.Rating) || 0);
        });

        if (teamPlayers.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="9" class="text-center text-muted">No hay jugadores en plantilla.</td>`;
            rosterBody.appendChild(tr);
        } else {
            teamPlayers.forEach(p => {
                const tr = document.createElement('tr');
                const age = calculateAge(p.FechaNacimiento);
                const bird = p.Bird && p.Bird !== '0' ? p.Bird : '-';
                const r = p.FA && p.FA.toUpperCase() === 'R' ? 'R' : '';
                
                const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.Player)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
                const photoPath = getPlayerPhotoPath(p.Player);
                const url2k = generate2kRatingUrl(p.Player);
                
                tr.innerHTML = `
                    <td style="text-align:left; display: flex; align-items: center; gap: 10px; font-weight:600;">
                        <img src="${photoPath}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${p.Player}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--bg-panel);">
                        <a href="${url2k}" target="_blank" style="color: inherit; text-decoration: none;" title="Ver en 2kratings">
                            ${p.Player || '-'}
                        </a>
                    </td>
                    <td class="text-center">${p.Position || '-'}</td>
                    <td class="text-center"><div style="background: var(--bg-panel); color: var(--accent-orange); font-size: 11px; font-weight: bold; border: 1px solid var(--border-subtle); border-radius: 4px; display: inline-block; padding: 2px 6px;">${p.Rating || '-'}</div></td>
                    <td class="text-center">${age}</td>
                    <td class="text-center ${parseInt(bird) >= 3 ? 'bg-bird' : ''}">${bird}</td>
                    <td class="text-center ${r === 'R' ? 'bg-r' : ''}">${r}</td>
                    <td class="text-right font-data ${getOptClass(p.o1)}">${formatCurrencyOpt(p.t1)}</td>
                    <td class="text-right font-data ${getOptClass(p.o2)}">${formatCurrencyOpt(p.t2)}</td>
                    <td class="text-right font-data ${getOptClass(p.o3)}">${formatCurrencyOpt(p.t3)}</td>
                    <td class="text-right font-data ${getOptClass(p.o4)}">${formatCurrencyOpt(p.t4)}</td>
                    <td class="text-right font-data ${getOptClass(p.o5)}">${formatCurrencyOpt(p.t5)}</td>
                `;
                rosterBody.appendChild(tr);
            });
        }

        // 7. Rellenar Tabla Rondas Draft
        const parsedDraft = Papa.parse(draftText, { header: true, skipEmptyLines: true }).data;
        const draftBody = document.getElementById('draft-body');
        if (draftBody) {
            draftBody.innerHTML = '';
            
            const teamDraftPicks = parsedDraft.filter(d => d.Equipo && d.Equipo.toLowerCase() === targetTeamName.toLowerCase());
            
            if (teamDraftPicks.length === 0) {
                draftBody.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--text-muted); font-style: italic;">No hay rondas registradas.</td></tr>`;
            } else {
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
                    
                    let infoIcon = '';
                    if (d.Comentario && d.Comentario.trim() !== '') {
                        const safeComment = d.Comentario.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        infoIcon = ` <span class="custom-tooltip">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: -3px; margin-left: 4px; color: var(--accent-orange);">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                            </svg>
                            <span class="tooltip-text">${safeComment}</span>
                        </span>`;
                    }
                    
                    tr.innerHTML = `
                        <td class="text-center font-data">${d[yearKey] || '-'}</td>
                        <td class="text-center font-data">${d.Ronda || '-'}${infoIcon}</td>
                        <td>${d["Equipo Original"] || '-'}</td>
                    `;
                    draftBody.appendChild(tr);
                });
            }
        }

        // Finalizar Carga
        document.getElementById('loader').style.display = 'none';
        document.getElementById('roster-content').style.display = 'block';

    } catch (e) {
        console.error("Error al cargar los datos:", e);
        document.getElementById('loader').innerHTML = `<p style="color:var(--accent-red)">Error al cargar datos. Comprueba la consola.<br><strong>Error:</strong> ${e.message}<br><strong>Stack:</strong> ${e.stack}</p>`;
    }
});
