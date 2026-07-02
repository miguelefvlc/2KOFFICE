// Archivos locales CSV
const URL_JUGADORES = "players.csv";
const URL_ECONOMIA = "economia.csv";
const TEAM_LOGOS = {
    "Atlanta Hawks": "imgi_287_atl.png",
    "Boston Celtics": "imgi_267_bos.png",
    "Brooklyn Nets": "imgi_268_bkn.png",
    "Charlotte Hornets": "imgi_288_cha.png",
    "Chicago Bulls": "imgi_272_chi.png",
    "Cleveland Cavaliers": "imgi_273_cle.png",
    "Dallas Mavericks": "imgi_292_dal.png",
    "Denver Nuggets": "imgi_277_den.png",
    "Detroit Pistons": "imgi_274_det.png",
    "Golden State Warriors": "imgi_282_gs.png",
    "Houston Rockets": "imgi_293_hou.png",
    "Indiana Pacers": "imgi_275_ind.png",
    "Los Angeles Clippers": "imgi_283_lac.png",
    "Los Angeles Lakers": "imgi_284_lal.png",
    "Memphis Grizzlies": "imgi_294_mem.png",
    "Miami Heat": "imgi_289_mia.png",
    "Milwaukee Bucks": "imgi_276_mil.png",
    "Minnesota Timberwolves": "imgi_278_min.png",
    "New Orleans Pelicans": "imgi_295_no.png",
    "New York Knicks": "imgi_269_ny.png",
    "Oklahoma City Thunder": "imgi_279_okc.png",
    "Orlando Magic": "imgi_290_orl.png",
    "Philadelphia 76ers": "imgi_270_phi.png",
    "Phoenix Suns": "imgi_285_phx.png",
    "Portland Trail Blazers": "imgi_280_por.png",
    "Sacramento Kings": "imgi_286_sac.png",
    "San Antonio Spurs": "imgi_296_sa.png",
    "Toronto Raptors": "imgi_271_tor.png",
    "Utah Jazz": "imgi_281_utah.png",
    "Washington Wizards": "imgi_291_wsh.png"
};

let dbEquipos_Base = [];
let dbJugadores_Base = [];

let allTeams = [];
let livePlayers = [];
let activeTeam = null;
let activePlayerId = null;

// Global Simulator State
let isGlobalSimOpen = false;
let globalSimActivePlayerId = null;
let globalSimActiveTeamName = null;

// Constantes SVG para el icono de estrella (favorito)
const STAR_PATH_FILLED = "M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.692c.197-.39.73-.39.927 0l2.184 4.427 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z";
const STAR_PATH_EMPTY  = "M2.866 14.85c-.078.444.368.791.746.593l4.39-2.256 4.389 2.256c.377.197.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.565.565 0 0 0-.163-.505L1.71 6.745l4.052-.576a.525.525 0 0 0 .393-.288L8 2.223l1.847 3.658a.525.525 0 0 0 .393.288l4.052.575-2.906 2.77a.565.565 0 0 0-.163.506l.694 3.957-3.686-1.894a.503.503 0 0 0-.461 0z";

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';
    
    // Fetching archivos CSV locales
    Promise.all([
        fetch(URL_JUGADORES, { cache: "no-store" }).then(res => {
            if (!res.ok) throw new Error("No se pudo cargar players.csv");
            return res.text();
        }),
        fetch(URL_ECONOMIA, { cache: "no-store" }).then(res => {
            if (!res.ok) throw new Error("No se pudo cargar economia.csv");
            return res.text();
        })
    ]).then(([csvPlayers, csvEconomy]) => {
        
        const delimiterPlayers = csvPlayers.split('\n')[0].includes(';') ? ';' : ',';
        const delimiterEconomy = csvEconomy.split('\n')[0].includes(';') ? ';' : ',';

        const rawPlayers = Papa.parse(csvPlayers, { header: true, skipEmptyLines: true, delimiter: delimiterPlayers }).data;
        const rawTeams = Papa.parse(csvEconomy, { header: true, skipEmptyLines: true, delimiter: delimiterEconomy }).data;
        
        function mapCsvToTeam(t, idx) {
            const keys = Object.keys(t);
            const nameCol = keys.find(k => k.toLowerCase().includes("team") || k.toLowerCase().includes("equipo")) || keys[0];
            const lsCol = keys.find(k => k.toLowerCase().includes("límite salarial") || k.toLowerCase().includes("limite salarial") || k.toLowerCase().includes("lmite")) || keys[1]; 
            const presCol = keys.find(k => k.toLowerCase().includes("presupuesto") && !k.toLowerCase().includes("efectivo")) || keys[2];
            const mleCol = keys.find(k => k.toLowerCase().includes("mle") || k.toLowerCase().includes("mid")) || keys[3];
            const capHoldCol = keys.find(k => k.toLowerCase().includes("caphold") || k.toLowerCase().includes("cap hold") || k.toLowerCase().includes("retenido")) || keys[4];
            const lsEfectivoCol = keys.find(k => k.toLowerCase().includes("efectivo ls") || k.toLowerCase().includes("limite - ch")) || keys[5];
            const budEfectivoCol = keys.find(k => k.toLowerCase().includes("efectivo presupuesto") || k.toLowerCase().includes("presupuesto - ch") || k.toLowerCase().includes("retrasadas")) || keys[6];

            return {
                id: (idx + 1).toString(),
                name: t[nameCol] || "Desconocido",
                cap: parseCurrency(t[lsCol]),
                efectivo: parseCurrency(t[lsEfectivoCol]),
                budget: parseCurrency(t[presCol]),
                budgetEfectivo: parseCurrency(t[budEfectivoCol]),
                capHoldTotal: parseCurrency(t[capHoldCol]),
                mle: parseCurrency(t[mleCol]),
                numPlayers: 0
            };
        }

        // Mapear TODOS los equipos
        dbEquipos_Base = rawTeams
            .map(mapCsvToTeam)
            .filter(t => t.name !== "Desconocido");

        // Calcular numero de jugadores por equipo
        let rostersCount = {};
        rawPlayers.forEach(p => {
            const t1 = parseFloat(p.t1) || 0;
            if (t1 > 0 && p.team_id !== "31") {
                rostersCount[p.team_id] = (rostersCount[p.team_id] || 0) + 1;
            }
        });

        dbEquipos_Base.forEach(t => {
            t.numPlayers = rostersCount[t.id] || 0;
        });

        // Mapear Jugadores (Solo FA)
        dbJugadores_Base = rawPlayers.filter(p => {
            const t1Val = parseFloat(p.t1) || 0;
            return t1Val === 0 || p.team_id === "31";
        }).map((p, idx) => {
            const minSal = parseCurrency(p['Minimum'] || p['Minimum Sa'] || p['Minimum Salary'] || p.MinimumSalary || "0");
            const maxSal = parseCurrency(p['Maximum'] || p['Maximum Sa'] || p['Maximum Salary'] || p.MaximumSalary || "0");
            const capHold = parseCurrency(p['caphold'] || p['Cap Hold'] || p.CapHold || "0");
            const isR = (p.FA && p.FA.trim().toUpperCase() === 'R');
            const isBird = (parseInt(p.Bird) >= 3);
            const teamObj = dbEquipos_Base.find(t => t.id == p.team_id);
            const teamName = teamObj ? teamObj.name : "FA";

            const rating = parseInt(p.Rating) || 0;
            let calcRound = "5";
            if (rating >= 85) calcRound = "1";
            else if (rating >= 82) calcRound = "2";
            else if (rating >= 80) calcRound = "3";
            else if (rating >= 75) calcRound = "4";

            return {
                id: idx + 1,
                name: p.Player || "Desconocido",
                team: teamName,
                pos: p.Position || p.Pos || "-",
                rating: rating,
                edad: typeof calculateAge === 'function' ? calculateAge(p.FechaNacimiento) : (parseInt(p.Age) || 0),
                bird: p.Bird || "0",
                r: p.FA || "",
                min: minSal,
                max: maxSal,
                capHold: capHold,
                round: calcRound,
                originTeam: teamName,
                derechos: isR || isBird,
                renounced: false
            };
        }).filter(p => p.name !== "Desconocido");

        let orlando = dbEquipos_Base.find(t => t.name === "Orlando Magic");
        activeTeam = structuredClone(orlando || dbEquipos_Base[0]);

        // Inicializar Selector de Logos
        renderLogoGrid();
        updateActiveTeamUI(activeTeam.name);

        if (loader) loader.style.display = 'none';
        resetSimulation();
        initPlayerSearch();

    }).catch(err => {
        alert("Error al leer los archivos CSV locales. Comprueba que 'players.csv' y 'economia.csv' están en esta carpeta.");
        if (loader) loader.style.display = 'none';
    });
}

window.recalculateCapHolds = function() {
    // 1. Resetear todos los equipos en allTeams a sus valores base
    allTeams.forEach(t => {
        let baseTeam = dbEquipos_Base.find(bt => bt.name === t.name);
        if (baseTeam) {
            t.capHoldSum = 0;
            t.capHoldTotal = 0;
            t.numPlayers = baseTeam.numPlayers;
            t.mle = baseTeam.mle;
            t.budgetEfectivo = baseTeam.budgetEfectivo;
            t.cap = baseTeam.cap;
            t.budget = baseTeam.budget;
        }
    });

    // 2. Sumar Cap Holds activos para cada equipo
    livePlayers.forEach(p => {
        if (p.derechos && !p.renounced) {
            // Si el jugador está firmado simulado y NO pospuesto (firma normal), su Cap Hold se libera.
            // Si está pospuesto (isDelayed === true), el Cap Hold sigue restando.
            let countsAsCapHold = true;
            if (p.simulatedSigned && p.simTx && !p.simTx.isDelayed) {
                countsAsCapHold = false;
            }
            if (countsAsCapHold) {
                let team = allTeams.find(t => t.name === p.originTeam);
                if (team) {
                    team.capHoldSum += p.capHold;
                }
            }
        }
    });

    // 3. Establecer efectivo inicial (Límite - Cap Holds) y total de cap holds
    allTeams.forEach(t => {
        t.efectivo = t.cap - t.capHoldSum;
        t.capHoldTotal = t.capHoldSum;
    });

    // 4. Aplicar los efectos de las firmas simuladas activas (ahora para TODOS los equipos)
    allTeams.forEach(currentActive => {
        currentActive.simSignedCount = 0;
        livePlayers.forEach(p => {
            if (p.simulatedSigned && p.simTx && p.simTx.team === currentActive.name) {
                currentActive.simSignedCount++;
                const tx = p.simTx;
                
                currentActive.budgetEfectivo -= tx.salary;
                currentActive.budget -= tx.salary; // El presupuesto potencial también baja
                
                if (!tx.isDelayed) {
                    if (tx.exception === 'cap' || tx.exception === 'bird') {
                        currentActive.efectivo -= tx.salary;
                        currentActive.cap -= tx.salary; // El Cap potencial también baja
                    } else if (tx.exception === 'mle') {
                        currentActive.mle -= tx.salary;
                    }
                } else {
                    // Si está retrasada, su Cap Hold ya no se puede renunciar. 
                    // Por tanto, el Cap Potencial se reduce por este Cap Hold.
                    // (En el efectivo ya está restado desde el paso 3)
                    currentActive.cap -= p.capHold;
                }
            }
        });
    });

    // 5. Aplicar la devolución del "freespot" y actualizar roster para todos los equipos
    allTeams.forEach(t => {
        let baseTeam = dbEquipos_Base.find(bt => bt.name === t.name);
        if (baseTeam) {
            let signedCount = t.simSignedCount || 0;
            let totalRoster = baseTeam.numPlayers + signedCount;
            t.numPlayers = totalRoster;
            
            let baseEmptySpots = Math.max(0, 14 - baseTeam.numPlayers);
            let currentEmptySpots = Math.max(0, 14 - totalRoster);
            let filledSpots = baseEmptySpots - currentEmptySpots;
            let totalFreespotBonus = filledSpots * 1800000;
            
            t.efectivo += totalFreespotBonus;
            t.budgetEfectivo += totalFreespotBonus;
        }
    });

    // 6. Sincronizar el objeto activeTeam global
    if (activeTeam) {
        let currentActive = allTeams.find(t => t.name === activeTeam.name);
        if (currentActive) {
            activeTeam.efectivo = currentActive.efectivo;
            activeTeam.budgetEfectivo = currentActive.budgetEfectivo;
            activeTeam.capHoldTotal = currentActive.capHoldTotal;
            activeTeam.mle = currentActive.mle;
            activeTeam.numPlayers = currentActive.numPlayers;
            activeTeam.cap = currentActive.cap;
            activeTeam.budget = currentActive.budget;
        }
    }

    // 7. Actualizar la barra visual
    if (typeof window.renderTopTeamsBar === "function") {
        window.renderTopTeamsBar();
    }
}

window.openLogoModal = function() {
    document.getElementById('logo-modal').style.display = 'flex';
}

window.closeLogoModal = function() {
    document.getElementById('logo-modal').style.display = 'none';
}

function renderLogoGrid() {
    const grid = document.getElementById('logo-grid');
    grid.innerHTML = '';
    
    // Sort names alphabetically
    const teamNames = Object.keys(TEAM_LOGOS).sort();
    
    teamNames.forEach(name => {
        const file = TEAM_LOGOS[name];
        let btn = document.createElement('div');
        btn.className = 'team-logo-btn';
        btn.title = name;
        btn.innerHTML = `<img src="logos/${file}" alt="${name}">`;
        btn.onclick = function() {
            selectTeamByLogo(name);
        };
        grid.appendChild(btn);
    });
}

window.renderTopTeamsBar = function() {
    const bar = document.getElementById('top-teams-bar');
    if (!bar) return;
    
    let sortedTeams = [...allTeams].sort((a, b) => {
        let aFull = a.numPlayers >= 15;
        let bFull = b.numPlayers >= 15;
        if (aFull !== bFull) {
            return aFull ? 1 : -1;
        }
        return b.efectivo - a.efectivo;
    });
    
    bar.innerHTML = '';
    sortedTeams.forEach(t => {
        const file = TEAM_LOGOS[t.name];
        if (!file) return;
        
        let wrapper = document.createElement('div');
        wrapper.className = 'team-logo-wrapper';
        wrapper.title = `${t.name}\nEfectivo: ${formatCurrency(t.efectivo)}\nJugadores: ${t.numPlayers}`;
        
        let img = document.createElement('img');
        img.src = `logos/${file}`;
        img.alt = t.name;
        img.className = 'team-logo-img';
        
        if (t.numPlayers >= 15) {
            img.classList.add('disabled');
        }
        
        wrapper.onclick = function() {
            // Select this team as active team
            selectTeamByLogo(t.name);
            // Open rights modal
            if (typeof window.openActiveTeamCHModal === "function") {
                window.openActiveTeamCHModal();
            }
        };
        
        wrapper.appendChild(img);
        bar.appendChild(wrapper);
    });
}

function updateActiveTeamUI(name) {
    const logoImg = document.getElementById('active-team-logo');
    if (TEAM_LOGOS[name]) {
        logoImg.src = `logos/${TEAM_LOGOS[name]}`;
    }
}

window.selectTeamByLogo = function(name) {
    let teamInLive = allTeams.find(t => t.name === name);
    if (!teamInLive) return;
    activeTeam = teamInLive;
    updateActiveTeamUI(name);
    closeLogoModal();
    
    activePlayerId = null;
    const tName = document.getElementById('player-target-name');
    if (tName) tName.innerText = "Selecciona un objetivo...";
    const tBox = document.getElementById('threats-box');
    if (tBox) tBox.innerHTML = "<span class='text-muted text-small'>Radar inactivo.</span>";
    
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === "function") {
        updateSimEconomySummary();
    }
    if (typeof renderSignedPlayersList === "function") {
        renderSignedPlayersList();
    }
    const simPanel = document.getElementById('simulator-panel');
    if (simPanel) simPanel.style.display = 'none';
}

window.resetSimulation = function() {
    if(!activeTeam) return;
    
    allTeams = structuredClone(dbEquipos_Base);
    livePlayers = structuredClone(dbJugadores_Base);
    
    activePlayerId = null;
    const tName2 = document.getElementById('player-target-name');
    if (tName2) tName2.innerText = "Selecciona un objetivo...";
    const tBox2 = document.getElementById('threats-box');
    if (tBox2) tBox2.innerHTML = "<span class='text-muted text-small'>Radar inactivo.</span>";
    
    const list = document.getElementById('signed-players-list');
    if (list) list.innerHTML = '';
    const simPanel = document.getElementById('simulator-panel');
    if (simPanel) simPanel.style.display = 'none';

    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === "function") updateSimEconomySummary();
}

function renderTopEconomy() {
    if(!activeTeam) return;

    document.getElementById('top-mle').innerText = formatCurrency(activeTeam.mle);
    document.getElementById('top-mle').className = `data-num ${getColorClass(activeTeam.mle)}`;

    document.getElementById('top-cap').innerText = formatCurrency(activeTeam.cap);
    document.getElementById('top-cap').className = `data-num ${getColorClass(activeTeam.cap)}`;

    document.getElementById('top-budget').innerText = formatCurrency(activeTeam.budget);
    document.getElementById('top-budget').className = `data-num ${getColorClass(activeTeam.budget)}`;

    document.getElementById('top-ch').innerText = formatCurrency(activeTeam.capHoldTotal);
    document.getElementById('top-ch').className = `data-num ${getColorClass(activeTeam.capHoldTotal)}`;

    document.getElementById('top-efectivo').innerText = formatCurrency(activeTeam.efectivo);
    document.getElementById('top-efectivo').className = `data-num ${getColorClass(activeTeam.efectivo)}`;

    document.getElementById('top-bud-efectivo').innerText = formatCurrency(activeTeam.budgetEfectivo);
    document.getElementById('top-bud-efectivo').className = `data-num ${getColorClass(activeTeam.budgetEfectivo)}`;

    let nplayersEl = document.getElementById('top-nplayers');
    if (nplayersEl) {
        nplayersEl.innerText = activeTeam.numPlayers;
        nplayersEl.className = `data-num ${activeTeam.numPlayers >= 15 ? 'color-red' : 'color-green'}`;
    }
}


function renderStudyTable() {
    const tbody = document.getElementById('study-tbody');
    tbody.innerHTML = '';
    
    let starred = JSON.parse(localStorage.getItem('starred_players') || '[]');
    
    livePlayers.forEach(p => {
        let tr = document.createElement('tr');
        tr.className = 'row-interactive';
        tr.setAttribute('data-id', p.id);
        if(p.id === activePlayerId) tr.classList.add('selected');

        if(p.id === activePlayerId) tr.classList.add('selected');
        
        let birdStyle = parseInt(p.bird) >= 3 ? `style="color: var(--accent-green); font-weight: bold;"` : ``;
        let rStyle = (p.r && p.r.trim().toUpperCase() === 'R') ? `style="color: var(--accent-yellow); font-weight: bold;"` : ``;
        let capHoldDisplay = p.renounced 
            ? `<span style="text-decoration: line-through; color: var(--accent-red); opacity: 0.7;">${formatCurrency(p.capHold)}</span>` 
            : formatCurrency(p.capHold);

        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;

        let isStarred = starred.includes(p.id);
        let pathFilled = "M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.692c.197-.39.73-.39.927 0l2.184 4.427 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z";
        let pathEmpty = "M2.866 14.85c-.078.444.368.791.746.593l4.39-2.256 4.389 2.256c.377.197.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.565.565 0 0 0-.163-.505L1.71 6.745l4.052-.576a.525.525 0 0 0 .393-.288L8 2.223l1.847 3.658a.525.525 0 0 0 .393.288l4.052.575-2.906 2.77a.565.565 0 0 0-.163.506l.694 3.957-3.686-1.894a.503.503 0 0 0-.461 0z";
        
        let starColor = isStarred ? "var(--accent-yellow)" : "var(--text-muted)";
        let starPath = isStarred ? pathFilled : pathEmpty;
        
        // CALCULAR ESTADO DE PUJA PARA ESTE JUGADOR
        // En el simulador global no se atenúa a nadie porque todas las franquicias están jugando
        if (p.simulatedSigned && p.simTx) {
            if (p.simTx.isDelayed) {
                tr.style.borderLeft = '4px solid var(--accent-blue)';
                tr.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            } else {
                tr.style.borderLeft = '4px solid var(--accent-green)';
                tr.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
            }
        }

        tr.onclick = () => { selectStudyPlayer(p.id); };
        
        let isSigned = p.simulatedSigned && p.simTx;
        let aspirantesHTML = `<div style="display: flex; flex-wrap: wrap; gap: 4px;">`;
        
        if (isSigned) {
            const teamLogo = TEAM_LOGOS[p.simTx.team] ? `logos/${TEAM_LOGOS[p.simTx.team]}` : '';
            if (p.simTx.isDelayed) {
                aspirantesHTML += `
                    <div style="display:flex; align-items:center; gap: 6px; padding: 4px 8px; background: rgba(59, 130, 246, 0.2); border-radius: 4px; border: 1px solid var(--accent-blue); cursor: pointer;" title="Haz click para deshacer el retraso" onclick="event.stopPropagation(); undoSimulatedSigning(${p.id})">
                        <img src="${teamLogo}" style="height: 20px;">
                        <span style="font-size: 11px; font-weight: bold; color: var(--accent-blue);">ATRASADA POR ${formatCurrency(p.capHold)}</span>
                        <span style="color: var(--accent-red); font-weight: bold; margin-left: 5px;">&times;</span>
                    </div>
                `;
            } else {
                aspirantesHTML += `
                    <div style="display:flex; align-items:center; gap: 6px; padding: 4px 8px; background: rgba(34, 197, 94, 0.2); border-radius: 4px; border: 1px solid var(--accent-green); cursor: pointer;" title="Haz click para deshacer la firma" onclick="event.stopPropagation(); undoSimulatedSigning(${p.id})">
                        <img src="${teamLogo}" style="height: 20px;">
                        <span style="font-size: 11px; font-weight: bold; color: var(--accent-green);">FIRMADO POR ${formatCurrency(p.simTx.salary)}</span>
                        <span style="color: var(--accent-red); font-weight: bold; margin-left: 5px;">&times;</span>
                    </div>
                `;
            }
        } else {
            let validAspirantes = [];
            allTeams.forEach(t => {
                let isBoss = (p.derechos && p.originTeam === t.name);
                if (t.numPlayers >= 15 && !isBoss) return;

                let canBidImmediate = false;
                let canBidPotential = false;
                
                if (isBoss) {
                    canBidImmediate = t.budgetEfectivo >= p.min;
                    canBidPotential = t.budget >= p.min;
                } else {
                    canBidImmediate = (t.efectivo >= p.min) || (t.mle >= p.min);
                    canBidPotential = (t.cap >= p.min) || (t.mle >= p.min);
                }
                
                if (canBidPotential || canBidImmediate) {
                    let sortVal = isBoss ? (canBidImmediate ? t.budgetEfectivo : t.budget) : Math.max(t.efectivo, t.mle);
                    validAspirantes.push({ team: t, isBoss: isBoss, canBidImmediate: canBidImmediate, sortVal: sortVal });
                }
            });
            
            validAspirantes.sort((a, b) => {
                if (a.isBoss && !b.isBoss) return -1;
                if (!a.isBoss && b.isBoss) return 1;
                if (a.canBidImmediate && !b.canBidImmediate) return -1;
                if (!a.canBidImmediate && b.canBidImmediate) return 1;
                return b.sortVal - a.sortVal;
            });
            
            validAspirantes.forEach(aspirante => {
                let t = aspirante.team;
                let borderColor = aspirante.canBidImmediate ? 'var(--accent-green)' : 'var(--accent-yellow)';
                let opacity = aspirante.canBidImmediate ? '1' : '0.6';
                let title = `${t.name}\nEstado: ${aspirante.canBidImmediate ? 'Dinero listo' : 'Necesita renunciar a derechos'}`;
                const logoUrl = TEAM_LOGOS[t.name] ? `logos/${TEAM_LOGOS[t.name]}` : '';
                
                if (logoUrl) {
                    aspirantesHTML += `<img src="${logoUrl}" title="${title}" onclick="event.stopPropagation(); openGlobalSignModal(${p.id}, '${t.name}')" style="height: 24px; cursor: pointer; border: 2px solid ${borderColor}; border-radius: 4px; padding: 2px; background: var(--bg-panel); opacity: ${opacity}; transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">`;
                }
            });

            if (aspirantesHTML === `<div style="display: flex; flex-wrap: wrap; gap: 4px;">`) {
                aspirantesHTML += `<span class="text-muted text-small">Sin aspirantes (nadie puede pagar el mínimo)</span>`;
            }
        }
        aspirantesHTML += `</div>`;

        tr.innerHTML = `
            <td data-label="Favorito" style="text-align:center; padding: 0 4px;">
                <svg onclick="toggleStar(event, ${p.id})" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="${starColor}" viewBox="0 0 16 16" style="cursor:pointer; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.8)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">
                    <path d="${starPath}"/>
                </svg>
            </td>
            <td data-label="Jugador">
                <div style="display: flex; align-items: center;">
                    <img src="${getPlayerPhotoPath(p.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${p.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                    <strong>${p.name}</strong>
                </div>
            </td>
            <td data-label="Equipo">${p.team}</td>
            <td data-label="Pos">${p.pos}</td>
            <td data-label="Media" class="data-num">${p.rating}</td>
            <td data-label="Edad" class="data-num">${p.edad}</td>
            <td data-label="Bird" class="data-num" ${birdStyle}>${p.bird}</td>
            <td data-label="R" ${rStyle}>${p.r}</td>
            <td data-label="Aspirantes">${aspirantesHTML}</td>
            <td data-label="Ronda">${p.round !== "0" ? `<span class="round-badge round-${p.round}">R${p.round}</span>` : ""}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.selectStudyPlayer = function(id) {
    activePlayerId = id;
    renderStudyTable(); 
    
    const p = livePlayers.find(pl => pl.id == id);
    if (!p) return;
    
    const targetName = document.getElementById('player-target-name');
    if (targetName) {
        targetName.innerHTML = `${p.name} <span class="data-num text-muted text-xsmall">Min: ${formatCurrency(p.min)} | Máx: ${formatCurrency(p.max)}</span>`;
    }
    
    // UI Updates
    const box = document.getElementById('threats-box');
    if (box) {
        if (typeof scanThreatsLogic === "function") {
            box.innerHTML = scanThreatsLogic(p, allTeams, activeTeam ? activeTeam.name : null);
        } else {
            box.innerHTML = "<span class='text-muted text-small'>Simulación de amenazas no disponible.</span>";
        }
    }

    if (typeof updateSimulator === "function") {
        updateSimulator(p);
    }
}

function initPlayerSearch() {
    const searchInput = document.getElementById("player-search-input");
    if (searchInput) {
        searchInput.addEventListener("keyup", function(e) {
            if (e.key === "Enter") {
                const term = this.value.toLowerCase().trim();
                if (!term) return;
                
                const rows = document.querySelectorAll("#study-tbody tr");
                let found = false;
                
                rows.forEach(row => {
                    const nameCell = row.querySelector("strong");
                    if (nameCell && nameCell.textContent.toLowerCase().includes(term) && !found) {
                        found = true;
                        
                        const id = row.getAttribute('data-id');
                        if (id) {
                            // Al seleccionar se regenera toda la tabla, destruyendo la fila actual.
                            selectStudyPlayer(parseInt(id));
                            
                            // Buscar la NUEVA fila recién generada para aplicarle el brillo
                            setTimeout(() => {
                                const newRow = document.querySelector(`tr[data-id="${id}"]`);
                                if (newRow) {
                                    newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    newRow.classList.add("glow-row");
                                }
                            }, 50);
                        }
                    }
                });
            }
        });
    }
}

window.toggleStar = function(event, playerId) {
    event.stopPropagation(); // Prevent row selection
    
    let starred = JSON.parse(localStorage.getItem('starred_players') || '[]');
    let idx = starred.indexOf(playerId);
    
    if(idx > -1) {
        starred.splice(idx, 1);
    } else {
        starred.push(playerId);
    }
    
    localStorage.setItem('starred_players', JSON.stringify(starred));
    
    let svg = event.currentTarget;
    let isStarred = (idx === -1); // If it wasn't there before, it is starred now
    
    svg.setAttribute('fill', isStarred ? "var(--accent-yellow)" : "var(--text-muted)");
    
    let pathFilled = "M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.692c.197-.39.73-.39.927 0l2.184 4.427 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z";
    let pathEmpty = "M2.866 14.85c-.078.444.368.791.746.593l4.39-2.256 4.389 2.256c.377.197.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.565.565 0 0 0-.163-.505L1.71 6.745l4.052-.576a.525.525 0 0 0 .393-.288L8 2.223l1.847 3.658a.525.525 0 0 0 .393.288l4.052.575-2.906 2.77a.565.565 0 0 0-.163.506l.694 3.957-3.686-1.894a.503.503 0 0 0-.461 0z";
    
    svg.querySelector('path').setAttribute('d', isStarred ? pathFilled : pathEmpty);
}





// Simulador de firmas
window.updateSimulator = function(p) {
    const panel = document.getElementById('simulator-panel');
    if (!panel) return;
    
    if (!p) {
        panel.style.display = 'none';
        return;
    }
    
    panel.style.display = 'block';
    
    const photoUrl = typeof getPlayerPhotoPath === 'function' 
        ? getPlayerPhotoPath(p.name) 
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=80`;
    
    document.getElementById('sim-player-photo').src = photoUrl;
    
    const salaryInput = document.getElementById('sim-salary-input');
    salaryInput.value = p.max > 0 ? p.max : p.min; // Pre-llenado inicial con el máximo
    
    const signBtn = document.getElementById('sim-sign-btn');
    const feedback = document.getElementById('sim-feedback');
    const select = document.getElementById('sim-exception-select');
    
    // Auto-seleccionar la mejor Excepción disponible
    if (activeTeam) {
        const isBoss = p.derechos && p.originTeam === activeTeam.name;
        if (isBoss) {
            select.value = 'bird';
        } else {
            if (activeTeam.efectivo >= p.min) {
                select.value = 'cap';
            } else if (activeTeam.mle >= p.min) {
                select.value = 'mle';
            } else {
                select.value = 'cap'; // fallback
            }
        }
    }
    
    if (p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name) {
        panel.style.display = 'none';
        return;
    }
    
    function checkCanSign() {
        let sal = parseFloat(salaryInput.value) || 0;
        let exc = select.value;
        let canSign = false;
        let msg = "";
        
        if (sal < p.min) {
            msg = `El salario no puede ser menor al Mínimo (${formatCurrency(p.min)}).`;
        } else if (sal > p.max && p.max > 0) {
            msg = `El salario supera el máximo permitido (${formatCurrency(p.max)}).`;
        } else {
            if (exc === 'cap') {
                if (activeTeam.efectivo < sal) msg = "Espacio salarial insuficiente.";
                else canSign = true;
            } else if (exc === 'mle') {
                if (activeTeam.mle < sal) msg = "Excepción MLE insuficiente.";
                else canSign = true;
            } else if (exc === 'bird') {
                if (!p.derechos || p.originTeam !== activeTeam.name) msg = "No posees derechos Bird/R sobre este jugador.";
                else if (activeTeam.budgetEfectivo < sal) msg = "Presupuesto insuficiente para renovar.";
                else canSign = true;
            } else if (exc === 'minimum') {
                if (sal > p.min) msg = "Por el Mínimo solo puedes ofrecer su salario Mínimo exacto.";
                else if (activeTeam.budgetEfectivo < sal) msg = "Presupuesto insuficiente.";
                else canSign = true;
            }
        }
        
        const delayBtn = document.getElementById('sim-delay-btn');

        if (canSign) {
            signBtn.disabled = false;
            signBtn.style.opacity = '1';
            signBtn.innerText = 'FIRMA';
            signBtn.style.background = 'var(--accent-green, #22c55e)';
            feedback.innerText = '';

            if (p.derechos && p.originTeam === activeTeam.name) {
                delayBtn.style.display = 'block';
                delayBtn.disabled = false;
            } else {
                if (delayBtn) delayBtn.style.display = 'none';
            }
        } else {
            signBtn.disabled = true;
            signBtn.style.opacity = '0.5';
            signBtn.innerText = 'FIRMA (No viable)';
            signBtn.style.background = 'var(--text-muted, #9ca3af)';
            feedback.innerText = msg;

            if (delayBtn) delayBtn.style.display = 'none';
        }
    }
    
    salaryInput.oninput = checkCanSign;
    select.onchange = checkCanSign;
    checkCanSign();
}

window.signSimulatedPlayer = function(isDelayed = false) {
    if (!activePlayerId || !activeTeam) return;
    const p = livePlayers.find(pl => pl.id == activePlayerId);
    if (!p) return;
    
    const salary = parseFloat(document.getElementById('sim-salary-input').value) || 0;
    const exception = document.getElementById('sim-exception-select').value;
    
    // Guardamos la firma simulada
    p.simulatedSigned = true; 
    p.simTx = { salary, exception, isDelayed, team: activeTeam.name };
    
    // Recalcular economía del equipo activo
    recalculateCapHolds();
    
    if (typeof renderSignedPlayersList === "function") {
        renderSignedPlayersList();
    }

    // Ocultar el panel activo
    document.getElementById('simulator-panel').style.display = 'none';
    
    // Actualizar UI general
    renderTopEconomy();
    renderStudyTable();
    updateSimEconomySummary();
    
    // Si estamos en el simulador global, refrescarlo también
    if (isGlobalSimOpen && typeof renderGlobalSimTable === "function") {
        renderGlobalSimTable();
    }
}

window.undoSimulatedSigning = function(playerId) {
    if (!activeTeam) return;
    const p = livePlayers.find(pl => pl.id == playerId);
    if (!p || !p.simulatedSigned || !p.simTx) return;
    
    p.simulatedSigned = false;
    delete p.simTx;
    
    if (typeof renderSignedPlayersList === "function") {
        renderSignedPlayersList();
    }
    
    // Recalcular economía y actualizar UI
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    updateSimEconomySummary();
    
    if (activePlayerId === p.id) {
        updateSimulator(p);
    }
    
    // Si estamos en el simulador global, refrescarlo también
    if (isGlobalSimOpen && typeof renderGlobalSimTable === "function") {
        renderGlobalSimTable();
    }
}

window.editSimulatedSigning = function(id) {
    const p = livePlayers.find(pl => pl.id === id);
    if (!p || !p.simTx) return;
    
    // Guardar valores antes de deshacer
    const oldSal = p.simTx.salary;
    const oldExc = p.simTx.exception;
    
    // Deshacer la firma
    undoSimulatedSigning(id);
    
    // Seleccionar al jugador para abrir el panel
    selectStudyPlayer(id);
    
    // Restaurar los valores en el panel (usamos timeout para asegurar que el DOM cargó)
    setTimeout(() => {
        const salaryInput = document.getElementById('sim-salary-input');
        const exceptionSelect = document.getElementById('sim-exception-select');
        
        if (salaryInput) {
            salaryInput.value = oldSal;
            // Disparamos el evento input para que se actualicen feedbacks si hay
            salaryInput.dispatchEvent(new Event('input'));
        }
        if (exceptionSelect) {
            exceptionSelect.value = oldExc;
        }
    }, 50);
}

window.updateSimEconomySummary = function() {
    const sumDiv = document.getElementById('sim-economy-summary');
    if (!sumDiv || !activeTeam) return;
    
    const anySigned = livePlayers.some(p => p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name);
    
    const negOrMain = (val) => val < 0 ? 'var(--accent-red)' : 'var(--text-main)';
    sumDiv.style.display = 'flex';

    const lsEl = document.getElementById('sim-sum-ls');
    lsEl.innerText = formatCurrency(activeTeam.efectivo);
    lsEl.style.color = negOrMain(activeTeam.efectivo);
    
    const presEl = document.getElementById('sim-sum-pres');
    presEl.innerText = formatCurrency(activeTeam.budgetEfectivo);
    presEl.style.color = negOrMain(activeTeam.budgetEfectivo);
    
    const mleEl = document.getElementById('sim-sum-mle');
    mleEl.innerText = formatCurrency(activeTeam.mle);
    mleEl.style.color = negOrMain(activeTeam.mle);
}

window.renderSignedPlayersList = function() {
    const list = document.getElementById('signed-players-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (!activeTeam) return;
    
    const signedPlayers = livePlayers.filter(p => p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name);
    
    signedPlayers.forEach(p => {
        const salary = p.simTx.salary;
        const exception = p.simTx.exception;
        const isDelayed = p.simTx.isDelayed;
        
        const photoUrl = typeof getPlayerPhotoPath === 'function' 
            ? getPlayerPhotoPath(p.name) 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
            
        let excText = isDelayed ? "Firma Retrasada" : "";
        if (!isDelayed) {
            if (exception === 'cap') excText = "Cap Space";
            else if (exception === 'mle') excText = "MLE";
            else if (exception === 'minimum') excText = "Mínimo";
            else if (exception === 'bird') excText = "Bird/R";
        }

        const folded = document.createElement('div');
        folded.className = 'panel';
        folded.style.padding = '4px 8px';
        folded.style.display = 'flex';
        folded.style.alignItems = 'center';
        folded.style.justifyContent = 'space-between';
        folded.style.borderLeft = '4px solid var(--accent-green)';
        folded.style.marginTop = '0';
        folded.style.backgroundColor = 'var(--bg-panel)';
        folded.style.position = 'relative';
        
        folded.id = `sim-folded-${p.id}`;
        folded.innerHTML = `
            <button onclick="undoSimulatedSigning(${p.id})" style="position: absolute; top: 0px; right: 0px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px;" title="Deshacer firma">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${photoUrl}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="font-size: 12px; color: var(--text-main); line-height: 1.1;">${p.name}</strong>
                    <span class="text-muted text-xsmall" style="font-size: 10px;">${excText}</span>
                </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center; padding-right: 12px;">
                <div class="data-num color-green" style="font-size: 11px; margin-right: 4px;">${formatCurrency(salary)}</div>
                <button onclick="editSimulatedSigning(${p.id})" style="background: transparent; border: none; color: var(--accent-blue); cursor: pointer; padding: 2px;" title="Modificar firma">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                    </svg>
                </button>
            </div>
        `;
        list.appendChild(folded);
    });
}

// ==========================================
// SIMULADOR GLOBAL LOGIC
// ==========================================

window.closeGlobalSignModal = function() {
    document.getElementById('global-sign-modal').style.display = 'none';
    window.globalSimPlayer = null;
    window.globalSimTeam = null;
}

window.openGlobalSignModal = function(playerId, teamName) {
    const p = livePlayers.find(pl => pl.id === playerId);
    const t = allTeams.find(tm => tm.name === teamName);
    if (!p || !t) return;
    
    window.globalSimPlayer = p;
    window.globalSimTeam = t;
    
    const modal = document.getElementById('global-sign-modal');
    document.getElementById('global-sign-modal-title').innerText = `Firmar a ${p.name} con ${t.name}`;
    document.getElementById('global-sign-team-name').innerText = t.name;
    
    const photoUrl = typeof getPlayerPhotoPath === 'function' 
        ? getPlayerPhotoPath(p.name) 
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=80`;
    document.getElementById('global-sim-player-photo').src = photoUrl;
    
    const salaryInput = document.getElementById('global-sim-salary-input');
    salaryInput.value = p.max > 0 ? p.max : p.min;
    
    document.getElementById('global-sim-info-min').innerText = formatCurrency(p.min);
    document.getElementById('global-sim-info-max').innerText = p.max > 0 ? formatCurrency(p.max) : 'N/A';
    document.getElementById('global-sim-info-ch').innerText = formatCurrency(p.capHold);
    
    updateGlobalSimEconomySummary();
    renderGlobalSimCapHolds();
    checkGlobalSimCanSign();
    
    modal.style.display = 'flex';
}

window.updateGlobalSimEconomySummary = function() {
    const t = window.globalSimTeam;
    if (!t) return;
    
    const negOrMain = (val) => val < 0 ? 'var(--accent-red)' : 'var(--text-main)';
    
    const lsEl = document.getElementById('global-sim-sum-ls');
    lsEl.innerText = formatCurrency(t.efectivo);
    lsEl.style.color = negOrMain(t.efectivo);
    
    const presEl = document.getElementById('global-sim-sum-pres');
    presEl.innerText = formatCurrency(t.budgetEfectivo);
    presEl.style.color = negOrMain(t.budgetEfectivo);
    
    const mleEl = document.getElementById('global-sim-sum-mle');
    mleEl.innerText = formatCurrency(t.mle);
    mleEl.style.color = negOrMain(t.mle);
}

window.renderGlobalSimCapHolds = function() {
    const t = window.globalSimTeam;
    const content = document.getElementById('global-sign-ch-content');
    if (!t || !content) return;
    
    let myFAs = livePlayers.filter(p => {
        if (p.originTeam !== t.name || p.capHold <= 0) return false;
        if (p.simulatedSigned && p.simTx && !p.simTx.isDelayed) return false;
        return true;
    });
    
    let html = "";
    if (myFAs.length === 0) {
        html += `<p class="text-muted" style="font-style:italic; text-align:center;">No tiene jugadores con Cap Hold activo.</p>`;
    } else {
        html += `<table class="modern-table" style="width: 100%;">
            <thead>
                <tr>
                    <th>Jugador</th>
                    <th>Pos</th>
                    <th class="data-num">Min / Max</th>
                    <th class="data-num">Cap Hold</th>
                    <th style="text-align:center;">Mantener Derechos</th>
                </tr>
            </thead>
            <tbody>`;
            
        myFAs.forEach(fa => {
            let isChecked = !fa.renounced ? "checked" : "";
            let opacityStyle = fa.renounced ? "opacity: 0.5;" : "";
            let capHoldDecor = fa.renounced ? "text-decoration: line-through;" : "";

            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fa.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
            html += `<tr style="${opacityStyle}">
                <td>
                    <div style="display: flex; align-items: center;">
                        <img src="${typeof getPlayerPhotoPath === 'function' ? getPlayerPhotoPath(fa.name) : fallbackUrl}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${fa.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                        <strong>${fa.name}</strong>
                    </div>
                </td>
                <td>${fa.pos}</td>
                <td class="data-num text-muted" style="font-size:11px;">${formatCurrency(fa.min)} - ${formatCurrency(fa.max)}</td>
                <td class="data-num color-red" style="${capHoldDecor}">-${formatCurrency(fa.capHold)}</td>
                <td style="text-align:center;">
                    <input type="checkbox" class="global-sim-ch-checkbox" data-id="${fa.id}" ${isChecked} onchange="simulateGlobalActiveEconomy(${fa.id}, '${t.name}', this.checked)" style="cursor:pointer; width:18px; height:18px;">
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }
    content.innerHTML = html;
}

window.simulateGlobalActiveEconomy = function(pId, teamName, checked) {
    let player = livePlayers.find(p => p.id === pId);
    if(player) {
        player.renounced = !checked;
        player.derechos = checked;
    }
    recalculateCapHolds();
    window.globalSimTeam = allTeams.find(tm => tm.name === teamName); // Refresh team ref
    
    updateGlobalSimEconomySummary();
    renderGlobalSimCapHolds();
    checkGlobalSimCanSign();
    renderTopEconomy();
    renderStudyTable();
}

window.checkGlobalSimCanSign = function() {
    const p = window.globalSimPlayer;
    const t = window.globalSimTeam;
    const btn = document.getElementById('global-sim-sign-btn');
    const delayBtn = document.getElementById('global-sim-delay-btn');
    const feedback = document.getElementById('global-sim-feedback');
    const salaryInput = document.getElementById('global-sim-salary-input');
    const select = document.getElementById('global-sim-exception-select');
    
    if (!p || !t || !btn) return;
    
    const salary = parseFloat(salaryInput.value) || 0;
    const exception = select.value;
    
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    delayBtn.style.display = 'none';
    
    let isBoss = (p.derechos && p.originTeam === t.name);
    
    if (t.numPlayers >= 15 && !isBoss) {
        feedback.innerText = "Roster Lleno (15 jugadores)";
        return;
    }
    if (salary < p.min) {
        feedback.innerText = "El salario ofrecido es menor a lo que pide el jugador.";
        return;
    }
    if (p.max > 0 && salary > p.max) {
        feedback.innerText = "El salario ofrecido supera el máximo permitido para este jugador.";
        return;
    }

    if (exception === 'cap') {
        if (salary > t.efectivo) {
            feedback.innerText = "No hay suficiente Límite Salarial Efectivo.";
            return;
        }
    } else if (exception === 'mle') {
        if (salary > t.mle) {
            feedback.innerText = "No hay suficiente Excepción Media (MLE).";
            return;
        }
    } else if (exception === 'bird') {
        if (!isBoss) {
            feedback.innerText = "No tienes los derechos Bird/R de este jugador.";
            return;
        }
        if (salary > t.budgetEfectivo) {
            feedback.innerText = "No hay suficiente Presupuesto para renovarlo por esa cantidad.";
            return;
        }
    } else if (exception === 'minimum') {
        if (salary > p.min) {
            feedback.innerText = "El contrato mínimo debe ser por la cantidad mínima exigida.";
            return;
        }
    }
    
    if (isBoss) {
        delayBtn.style.display = 'block';
    }

    feedback.innerText = "Oferta Válida.";
    feedback.style.color = "var(--accent-green)";
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
}

window.executeGlobalSign = function(isDelayed) {
    const p = window.globalSimPlayer;
    const t = window.globalSimTeam;
    if (!p || !t) return;
    
    const salary = parseFloat(document.getElementById('global-sim-salary-input').value) || 0;
    const exception = document.getElementById('global-sim-exception-select').value;
    
    p.simulatedSigned = true;
    p.simTx = {
        team: t.name,
        salary: salary,
        exception: exception,
        isDelayed: isDelayed
    };
    
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    closeGlobalSignModal();
}

// Escuchar cambios en el input/select para validar
document.addEventListener('DOMContentLoaded', () => {
    const salaryInput = document.getElementById('global-sim-salary-input');
    const select = document.getElementById('global-sim-exception-select');
    if (salaryInput) salaryInput.addEventListener('input', checkGlobalSimCanSign);
    if (select) select.addEventListener('change', checkGlobalSimCanSign);
});