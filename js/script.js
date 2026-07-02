let teamsData = [];
let playersData = [];
let draftsData = [];
let tradeColumns = [];

async function init() {
    try {
        const [playersRes, ecoRes, draftsRes] = await Promise.all([
            fetch('players.csv'),
            fetch('economia.csv'),
            fetch('draft_picks.csv')
        ]);
        const playersText = await playersRes.text();
        const ecoText = await ecoRes.text();
        const draftsText = await draftsRes.text();
        
        const delimiterEco = ecoText.split('\n')[0].includes(';') ? ';' : ',';
        const delimiterPlayers = playersText.split('\n')[0].includes(';') ? ';' : ',';
        const delimiterDrafts = draftsText.split('\n')[0].includes(';') ? ';' : ',';
        
        const parsedEco = Papa.parse(ecoText, { header: true, skipEmptyLines: true, delimiter: delimiterEco }).data;
        
        parsedEco.forEach((teamRow, idx) => {
            let teamName = teamRow["Equipo"] || teamRow["Team"] || "Equipo " + (idx+1);
            teamName = teamName.replace(/['"]/g, '');
            teamsData.push({
                id: (idx + 1).toString(),
                name: teamName,
                capSpace: parseCurrency(teamRow["Disponible limite salarial"]),
                budgetSpace: parseCurrency(teamRow["Disponible presupuesto"]),
                cap: parseCurrency(teamRow["Efectivo LS (- Cap Hold)"])
            });
        });

        const parsedPlayers = Papa.parse(playersText, { header: true, skipEmptyLines: true, delimiter: delimiterPlayers }).data;
        parsedPlayers.forEach((p, idx) => {
            const t1Val = parseFloat(p.t1);
            if (isNaN(t1Val) || t1Val <= 0) return; // Filtrar FAs y jugadores con t1 vacío/0
            
            playersData.push({
                uid: 'p' + idx,
                name: p.Player,
                teamId: p.team_id,
                salary: t1Val,
                pos: p.Position || '-',
                rating: p.Rating || '-',
                t1: p.t1 || 0, o1: p.o1 || '',
                t2: p.t2 || 0, o2: p.o2 || '',
                t3: p.t3 || 0, o3: p.o3 || '',
                t4: p.t4 || 0, o4: p.o4 || '',
                t5: p.t5 || 0, o5: p.o5 || '',
                t6: p.t6 || 0, o6: p.o6 || '',
                caphold: p.caphold || 0,
                age: calculateAge(p.FechaNacimiento),
                bird: p.Bird || '-',
                r: p.FA && p.FA.toUpperCase() === 'R' ? 'R' : ''
            });
        });

        const parsedDrafts = Papa.parse(draftsText, { header: true, skipEmptyLines: true, delimiter: delimiterDrafts }).data;
        parsedDrafts.forEach((d, idx) => {
            const tName = (d["Equipo"] || "").toLowerCase().replace(/['"]/g, '').trim();
            const team = teamsData.find(t => t.name.toLowerCase().trim() === tName);
            const teamId = team ? team.id : null;
            draftsData.push({
                uid: 'd' + idx,
                teamId: teamId,
                year: d["Año"],
                round: d["Ronda"],
                originalTeam: d["Equipo Original"],
                comment: d["Comentario"]
            });
        });

        addTeamColumn();
        addTeamColumn();
        
        const orlando = teamsData.find(t => t.name.toLowerCase().includes("orlando magic"));
        if (orlando && tradeColumns.length > 0) {
            tradeColumns[0].teamId = orlando.id;
        }
        
        renderBoard();
        
        document.getElementById('loader').style.display = 'none';
    } catch(err) {
        alert("Error cargando los CSV. Asegúrate de ejecutar esto en un servidor local (Live Server).");
        document.getElementById('loader').style.display = 'none';
    }
}

function renderBoard() {
    const board = document.getElementById('trade-board');
    board.innerHTML = '';
    
    tradeColumns.forEach((col, index) => {
        const colDiv = document.createElement('div');
        colDiv.className = 'panel team-column';
        
        let optionsHtml = `<option value="">Selecciona un equipo...</option>`;
        teamsData.forEach(t => {
            const isSelectedElsewhere = tradeColumns.some((c, i) => i !== index && c.teamId === t.id);
            if (!isSelectedElsewhere) {
                optionsHtml += `<option value="${t.id}" ${col.teamId === t.id ? 'selected' : ''}>${t.name}</option>`;
            }
        });
        
        let playersHtml = '';
        let salaryOut = 0;
        let salaryIn = 0;
        
        if (col.teamId) {
            const teamPlayers = playersData.filter(p => p.teamId === col.teamId && p.salary > 0);
            const teamPicks = draftsData.filter(d => d.teamId === col.teamId);

            const playersLeaving = col.tradesOut.filter(t => t.playerUid.startsWith('p'));
            const picksLeaving = col.tradesOut.filter(t => t.playerUid.startsWith('d'));

            const playersEntering = tradeColumns.flatMap(c => c.tradesOut).filter(t => t.toTeamId === col.teamId && t.playerUid.startsWith('p'));
            const picksEntering = tradeColumns.flatMap(c => c.tradesOut).filter(t => t.toTeamId === col.teamId && t.playerUid.startsWith('d'));

            playersHtml += `<div class="player-list">`;
            
            // Jugadores entrantes
            playersEntering.forEach(trade => {
                const p = playersData.find(x => x.uid === trade.playerUid);
                if (p) salaryIn += p.salary;
            });
            
            // Jugadores del equipo (salientes o quedarse)
            teamPlayers.forEach(p => {
                const isTraded = playersLeaving.find(x => x.playerUid === p.uid);
                
                let destOptions = `<option value="">Enviar a...</option>`;
                tradeColumns.forEach((c, i) => {
                    if (i !== index && c.teamId) {
                        const destTeam = teamsData.find(t => t.id === c.teamId);
                        const isSelected = isTraded && isTraded.toTeamId === c.teamId ? "selected" : "";
                        destOptions += `<option value="${c.teamId}" ${isSelected}>${destTeam ? destTeam.name : 'Equipo ' + c.teamId}</option>`;
                    }
                });

                if (isTraded) {
                    salaryOut += p.salary;
                    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=ef4444&color=fff&rounded=true&size=32`;
                    playersHtml += `
                        <div class="player-item traded-player" onmouseenter="showTooltip(event, '${p.uid}')" onmouseleave="hideTooltip()" onmousemove="moveTooltip(event)">
                            <img src="${getPlayerPhotoPath(p.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${p.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; opacity: 0.8; object-fit: cover; background: var(--bg-surface);">
                            <div style="flex: 1;">
                                <a href="${generate2kRatingUrl(p.name)}" target="_blank" style="color: inherit; text-decoration: none;" title="Ver en 2kratings">
                                    <strong style="text-decoration: line-through;">${p.name}</strong>
                                </a> 
                                <div class="data-num color-red">-${formatCurrency(p.salary)}</div>
                            </div>
                            <div style="display: flex; gap: 6px; align-items: stretch; margin-top: 8px;">
                                <div style="background: var(--bg-panel); color: var(--accent-orange); font-size: 11px; font-weight: bold; border: 1px solid var(--border-subtle); border-radius: 4px; display: flex; align-items: center; justify-content: center; padding: 0 8px;" title="Rating 2K">${p.rating}</div>
                                <select class="dest-select" style="margin-top: 0; background-color: rgba(239, 68, 68, 0.1); border-color: var(--accent-red); color: var(--accent-red);" onchange="addTrade(${index}, '${p.uid}', this.value)">
                                    ${destOptions}
                                </select>
                            </div>
                        </div>
                    `;
                } else {
                    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
                    playersHtml += `
                        <div class="player-item" onmouseenter="showTooltip(event, '${p.uid}')" onmouseleave="hideTooltip()" onmousemove="moveTooltip(event)">
                            <img src="${getPlayerPhotoPath(p.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${p.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                            <div style="flex: 1;">
                                <a href="${generate2kRatingUrl(p.name)}" target="_blank" style="color: inherit; text-decoration: none;" title="Ver en 2kratings">
                                    <strong>${p.name}</strong>
                                </a> 
                                <div class="data-num">${formatCurrency(p.salary)}</div>
                            </div>
                            <div style="display: flex; gap: 6px; align-items: stretch; margin-top: 8px;">
                                <div style="background: var(--bg-panel); color: var(--accent-orange); font-size: 11px; font-weight: bold; border: 1px solid var(--border-subtle); border-radius: 4px; display: flex; align-items: center; justify-content: center; padding: 0 8px;" title="Rating 2K">${p.rating}</div>
                                <select class="dest-select" style="margin-top: 0;" onchange="addTrade(${index}, '${p.uid}', this.value)">
                                    ${destOptions}
                                </select>
                            </div>
                        </div>
                    `;
                }
            });
            
            // Rondas visibles (traspasadas o preparadas)
            const visiblePicks = teamPicks.filter(d => 
                col.tradesOut.some(t => t.playerUid === d.uid) || 
                (col.stagedPicks && col.stagedPicks.includes(d.uid))
            );

            visiblePicks.forEach(d => {
                const isTraded = col.tradesOut.find(x => x.playerUid === d.uid);
                
                let destOptions = `<option value="">Enviar a...</option>`;
                tradeColumns.forEach((c, i) => {
                    if (i !== index && c.teamId) {
                        const destTeam = teamsData.find(t => t.id === c.teamId);
                        const isSelected = isTraded && isTraded.toTeamId === c.teamId ? "selected" : "";
                        destOptions += `<option value="${c.teamId}" ${isSelected}>${destTeam ? destTeam.name : 'Equipo ' + c.teamId}</option>`;
                    }
                });

                if (isTraded) {
                    playersHtml += `
                        <div class="player-item traded-player">
                            <div style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; background: var(--accent-orange); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; color: white;">PICK</div>
                            <div style="flex: 1;">
                                <strong style="text-decoration: line-through;">${d.round}ªRONDA ${d.year}</strong>
                                <div class="data-num" style="font-size: 10px; color: var(--text-muted);">${d.originalTeam.toUpperCase()}</div>
                            </div>
                            <div style="display: flex; gap: 6px; align-items: stretch; margin-top: 8px;">
                                <select class="dest-select" style="margin-top: 0; background-color: rgba(239, 68, 68, 0.1); border-color: var(--accent-red); color: var(--accent-red);" onchange="addTrade(${index}, '${d.uid}', this.value)">
                                    ${destOptions}
                                </select>
                                <button onclick="removePick(${index}, '${d.uid}')" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-weight:bold; padding: 0 5px;" title="Quitar ronda">✖</button>
                            </div>
                        </div>
                    `;
                } else {
                    playersHtml += `
                        <div class="player-item">
                            <div style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; background: var(--bg-surface); border: 1px solid var(--text-muted); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; color: var(--text-muted);">PICK</div>
                            <div style="flex: 1;">
                                <strong>${d.round}ªRONDA ${d.year}</strong>
                                <div class="data-num" style="font-size: 10px; color: var(--text-muted);">${d.originalTeam.toUpperCase()}</div>
                            </div>
                            <div style="display: flex; gap: 6px; align-items: stretch; margin-top: 8px;">
                                <select class="dest-select" style="margin-top: 0;" onchange="addTrade(${index}, '${d.uid}', this.value)">
                                    ${destOptions}
                                </select>
                                <button onclick="removePick(${index}, '${d.uid}')" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-weight:bold; padding: 0 5px;" title="Quitar ronda">✖</button>
                            </div>
                        </div>
                    `;
                }
            });

            // Selector para añadir rondas
            let availablePicks = teamPicks.filter(d => !visiblePicks.find(v => v.uid === d.uid));
            let pickOptions = `<option value="">Añadir ronda...</option>`;
            availablePicks.forEach(d => {
                pickOptions += `<option value="${d.uid}">${d.round}ªRONDA ${d.originalTeam.toUpperCase()} ${d.year}</option>`;
            });

            playersHtml += `
                <div class="player-item" style="border: 1px dashed var(--border-subtle); background: transparent; padding: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; background: var(--bg-surface); border: 1px dashed var(--text-muted); display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--text-muted);">+</div>
                    <div style="flex: 1;">
                        <select class="dest-select" style="margin-top: 0; width: 100%; border-color: var(--border-subtle);" onchange="if(this.value) { stagePick(${index}, this.value); this.value=''; }">
                            ${pickOptions}
                        </select>
                    </div>
                </div>
            `;

            playersHtml += `</div>`;
            
            const diff = salaryIn - salaryOut;
            const diffColor = diff > 0 ? 'color-red' : 'color-green';
            const rosterCount = teamPlayers.length - playersLeaving.length + playersEntering.length;
            const team = teamsData.find(t => t.id === col.teamId);
            const newCapSpace = team.capSpace - diff;
            const newBudgetSpace = team.budgetSpace - diff;
            
            playersHtml += `
                <div class="salary-summary">
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px dashed var(--border-subtle); padding-bottom: 5px;">
                        <strong>Roster: ${rosterCount} / 15</strong>
                    </div>
                    <div class="salary-row" style="margin-top: 8px;"><span>Salarios Entrantes:</span> <span class="data-num color-green">${formatCurrency(salaryIn)}</span></div>
                    <div class="salary-row"><span>Salarios Salientes:</span> <span class="data-num color-red">${formatCurrency(salaryOut)}</span></div>
                    <div class="salary-row" style="font-weight:bold; margin-top:5px; border-top:1px solid var(--border-subtle); padding-top:10px;">
                        <span>Impacto Neto:</span> <span class="data-num ${diffColor}">${diff > 0 ? '+' : ''}${formatCurrency(diff)}</span>
                    </div>
                    <div class="salary-row" style="margin-top: 15px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px;">
                        <strong>Situación Económica Final</strong>
                    </div>
                    <div class="salary-row"><span>Espacio Salarial:</span> <span class="data-num ${newCapSpace >= 0 ? 'color-green' : 'color-red'}">${formatCurrency(newCapSpace)}</span></div>
                    <div class="salary-row"><span>Margen Presupuesto:</span> <span class="data-num ${newBudgetSpace >= 0 ? 'color-green' : 'color-red'}">${formatCurrency(newBudgetSpace)}</span></div>
                </div>
            `;
        }
        
        colDiv.innerHTML = `
            <button class="btn-remove-team" onclick="removeTeamColumn(${index})" title="Quitar equipo">✖</button>
            <select onchange="selectTeam(${index}, this.value)">
                ${optionsHtml}
            </select>
            ${playersHtml}
        `;
        board.appendChild(colDiv);
    });
    
    const addBtn = document.createElement('div');
    addBtn.className = 'add-team-btn';
    addBtn.innerHTML = '+';
    addBtn.title = "Añadir equipo al traspaso";
    addBtn.onclick = () => { addTeamColumn(); renderBoard(); };
    board.appendChild(addBtn);
    
    const count = tradeColumns.filter(c => c.teamId !== "").length || tradeColumns.length;
    document.getElementById('teams-count').innerText = count;
    
    validateTrade();
}

window.addTeamColumn = function() {
    tradeColumns.push({
        teamId: "",
        tradesOut: [],
        stagedPicks: []
    });
}

window.stagePick = function(colIndex, uid) {
    if (!tradeColumns[colIndex].stagedPicks) {
        tradeColumns[colIndex].stagedPicks = [];
    }
    tradeColumns[colIndex].stagedPicks.push(uid);
    renderBoard();
}

window.removePick = function(colIndex, uid) {
    if (tradeColumns[colIndex].stagedPicks) {
        tradeColumns[colIndex].stagedPicks = tradeColumns[colIndex].stagedPicks.filter(id => id !== uid);
    }
    tradeColumns[colIndex].tradesOut = tradeColumns[colIndex].tradesOut.filter(t => t.playerUid !== uid);
    renderBoard();
}

window.removeTeamColumn = function(colIndex) {
    const teamId = tradeColumns[colIndex].teamId;
    if (teamId) {
        tradeColumns.forEach(c => {
            c.tradesOut = c.tradesOut.filter(t => t.toTeamId !== teamId);
        });
    }
    tradeColumns.splice(colIndex, 1);
    renderBoard();
}

window.selectTeam = function(colIndex, teamId) {
    tradeColumns[colIndex].teamId = teamId;
    tradeColumns[colIndex].tradesOut = [];
    tradeColumns[colIndex].stagedPicks = [];
    
    tradeColumns.forEach(c => {
        c.tradesOut = c.tradesOut.filter(t => t.toTeamId !== teamId);
    });
    
    renderBoard();
}

window.addTrade = function(colIndex, playerUid, toTeamId) {
    tradeColumns[colIndex].tradesOut = tradeColumns[colIndex].tradesOut.filter(t => t.playerUid !== playerUid);
    if (toTeamId) {
        tradeColumns[colIndex].tradesOut.push({ playerUid, toTeamId });
    }
    renderBoard();
}

window.cancelTradeFromDest = function(playerUid) {
    tradeColumns.forEach(c => {
        c.tradesOut = c.tradesOut.filter(t => t.playerUid !== playerUid);
    });
    renderBoard();
}


function validateTrade() {
    const valPanel = document.getElementById('trade-validation');
    const valDetails = document.getElementById('validation-details');
    const statusWidget = document.getElementById('trade-status');
    
    const allTrades = tradeColumns.flatMap(c => c.tradesOut);
    
    if (allTrades.length === 0) {
        valPanel.style.display = 'none';
        statusWidget.innerHTML = `<span>Estado</span><strong style="color: var(--text-muted); font-size: 18px;">Pendiente</strong>`;
        statusWidget.className = "widget";
        return;
    }
    
    valPanel.style.display = 'block';
    
    let html = '';
    let isApproved = true;
    
    tradeColumns.forEach(col => {
        if (!col.teamId) return;
        const team = teamsData.find(t => t.id === col.teamId);
        
        let salaryOut = 0;
        let salaryIn = 0;
        
        col.tradesOut.forEach(t => {
            if (t.playerUid.startsWith('p')) {
                const p = playersData.find(x => x.uid === t.playerUid);
                if (p) salaryOut += p.salary;
            }
        });
        
        allTrades.filter(t => t.toTeamId === col.teamId).forEach(t => {
            if (t.playerUid.startsWith('p')) {
                const p = playersData.find(x => x.uid === t.playerUid);
                if (p) salaryIn += p.salary;
            }
        });
        
        const diff = salaryIn - salaryOut;
        let valid = true;
        let reason = "";
        
        // 1. Validar límite de Presupuesto
        if (diff > team.budgetSpace) {
            valid = false;
            reason = `Supera el Presupuesto Total. Espacio de ppto: ${formatCurrency(team.budgetSpace)}, impacto del traspaso: ${formatCurrency(diff)}.`;
            isApproved = false;
        } else {
            // 2. Comprobar si asume salario con su Cap Space
            if (team.capSpace > 0 && diff < team.capSpace) {
                // Absorbe el impacto estando por debajo del límite salarial
                reason = `Absorbe el impacto (${formatCurrency(diff)}) con su espacio salarial (${formatCurrency(team.capSpace)} disponibles).`;
            } else {
                // 3. Supera el Cap Space o ya estaba por encima (Casuísticas 2)
                let maxReceived = 0;
                let ruleDesc = "";
                
                if (salaryOut <= 6500000) {
                    maxReceived = salaryOut * 1.75;
                    ruleDesc = "175% del salario enviado";
                } else if (salaryOut <= 19500000) {
                    maxReceived = salaryOut + 5000000;
                    ruleDesc = "salario enviado + $5.000.000";
                } else {
                    maxReceived = (salaryOut * 1.25) + 100000;
                    ruleDesc = "125% del salario enviado + $100.000";
                }
                
                // Excepción: si el equipo no envía ni recibe nada (no participa en realidad)
                if (salaryIn === 0 && salaryOut === 0) {
                    reason = `No realiza movimientos.`;
                } else if (salaryIn > maxReceived) {
                    valid = false;
                    reason = `Traspaso INVÁLIDO. Envía ${formatCurrency(salaryOut)} y puede recibir un máximo de ${formatCurrency(maxReceived)} (${ruleDesc}). Intenta recibir: ${formatCurrency(salaryIn)}.`;
                    isApproved = false;
                } else {
                    reason = `Traspaso válido. Envía ${formatCurrency(salaryOut)} y puede recibir hasta ${formatCurrency(maxReceived)} (${ruleDesc}). Recibe: ${formatCurrency(salaryIn)}.`;
                }
            }
        }
        
        const newCapSpace = team.capSpace - diff;
        const newBudgetSpace = team.budgetSpace - diff;
        
        let incomingHtml = "";
        const teamIncoming = tradeColumns.flatMap(c => c.tradesOut).filter(t => t.toTeamId === team.id);
        if (teamIncoming.length > 0) {
            const incomingPlayers = teamIncoming.filter(t => t.playerUid.startsWith('p'));
            const incomingPicks = teamIncoming.filter(t => t.playerUid.startsWith('d'));

            if (incomingPlayers.length > 0) {
                incomingHtml += `
                    <table class="tooltip-table" style="width: 100%; margin-top: 10px; font-size: 11px;">
                        <thead>
                            <tr>
                                <th style="text-align:left;">Jugador que recibe</th>
                                <th>Pos</th>
                                <th>Rating</th>
                                <th>Age</th>
                                <th>Bird</th>
                                <th>R</th>
                                <th>26/27</th>
                                <th>27/28</th>
                                <th>28/29</th>
                                <th>29/30</th>
                                <th>30/31</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                incomingPlayers.forEach(trade => {
                    const p = playersData.find(x => x.uid === trade.playerUid);
                    if (!p) return;
                    incomingHtml += `
                        <tr>
                            <td style="text-align:left; font-weight:600;">${p.name}</td>
                            <td>${p.pos}</td>
                            <td>${p.rating}</td>
                            <td>${p.age}</td>
                            <td class="${parseInt(p.bird) >= 3 ? 'bg-bird' : ''}">${p.bird !== '0' && p.bird !== '' ? p.bird : '-'}</td>
                            <td class="${p.r === 'R' ? 'bg-r' : ''}">${p.r}</td>
                            <td class="${getOptClass(p.o1)}">${formatCurrencyOpt(p.t1)}</td>
                            <td class="${getOptClass(p.o2)}">${formatCurrencyOpt(p.t2)}</td>
                            <td class="${getOptClass(p.o3)}">${formatCurrencyOpt(p.t3)}</td>
                            <td class="${getOptClass(p.o4)}">${formatCurrencyOpt(p.t4)}</td>
                            <td class="${getOptClass(p.o5)}">${formatCurrencyOpt(p.t5)}</td>
                        </tr>
                    `;
                });
                incomingHtml += `</tbody></table>`;
            }

            if (incomingPicks.length > 0) {
                incomingHtml += `<div style="margin-top: 10px; font-size: 11px;"><strong>Rondas recibidas:</strong><ul>`;
                incomingPicks.forEach(trade => {
                    const d = draftsData.find(x => x.uid === trade.playerUid);
                    if (d) {
                        incomingHtml += `<li style="margin-top: 3px;"><strong>${d.round}ªRONDA ${d.originalTeam.toUpperCase()} ${d.year}</strong></li>`;
                    }
                });
                incomingHtml += `</ul></div>`;
            }
        }
        
        let ecoHtml = `
            <div style="margin-top: 10px; font-size: 11px; display: flex; gap: 15px; border-top: 1px dashed var(--border-subtle); padding-top: 8px;">
                <div><strong>Situación Económica:</strong></div>
                <div>Espacio Salarial: <span class="data-num ${newCapSpace >= 0 ? 'color-green' : 'color-red'}">${formatCurrency(newCapSpace)}</span></div>
                <div>Margen Presupuesto: <span class="data-num ${newBudgetSpace >= 0 ? 'color-green' : 'color-red'}">${formatCurrency(newBudgetSpace)}</span></div>
            </div>
        `;
        
        if (salaryIn === 0 && salaryOut === 0) {
             html += `
                <div style="padding: 12px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-base); margin-bottom: 10px;">
                    <strong>${team.name}</strong>: ℹ️ No realiza movimientos.
                </div>
            `;
        } else {
            html += `
                <div style="padding: 12px; border: 1px solid ${valid ? 'var(--accent-green)' : 'var(--accent-red)'}; border-radius: 6px; background: ${valid ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'}; margin-bottom: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <strong style="color: ${valid ? 'var(--accent-green)' : 'var(--accent-red)'}; font-size: 14px;">${team.name}</strong>
                        <span style="cursor: pointer; font-size: 11px; opacity: 0.8; padding: 2px 4px; border-radius: 4px; border: 1px dashed var(--border-subtle);" onmouseenter="document.getElementById('rule-desc-${col.teamId}').style.display = 'block'" onmouseleave="document.getElementById('rule-desc-${col.teamId}').style.display = 'none'">
                            ${valid ? '✅ VÁLIDO' : '❌ NO VÁLIDO'}
                        </span>
                    </div>
                    <div id="rule-desc-${col.teamId}" style="display: none; margin-bottom: 10px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 11px;">
                        <strong>Regla:</strong> ${reason}
                    </div>
                    ${incomingHtml}
                    ${ecoHtml}
                </div>
            `;
        }
    });
    
    html += `
        <div style="display: flex; justify-content: flex-end; margin-top: 15px;">
            <button onclick="generateNotification()" style="font-size: 12px; padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-base);">Notificar</button>
        </div>
    `;
    
    valDetails.innerHTML = html;
    
    if (isApproved) {
        statusWidget.innerHTML = `<span>Estado</span><strong style="color: var(--accent-green); font-size: 18px;">VÁLIDO</strong>`;
        statusWidget.className = "widget highlight";
        statusWidget.style.borderColor = "var(--accent-green)";
    } else {
        statusWidget.innerHTML = `<span>Estado</span><strong style="color: var(--accent-red); font-size: 18px;">NO VÁLIDO</strong>`;
        statusWidget.className = "widget highlight";
        statusWidget.style.borderColor = "var(--accent-red)";
    }
}

window.showTooltip = function(e, uid) {
    const p = playersData.find(x => x.uid === uid);
    if(!p) return;
    
    const tooltip = document.getElementById('player-tooltip');
    
    let html = `
        <table class="tooltip-table">
            <thead>
                <tr>
                    <th style="text-align:left;">Jugador</th>
                    <th>Pos</th>
                    <th>Rating</th>
                    <th>Age</th>
                    <th>Bird</th>
                    <th>R</th>
                    <th>26/27</th>
                    <th>27/28</th>
                    <th>28/29</th>
                    <th>29/30</th>
                    <th>30/31</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="text-align:left; font-weight:600;">${p.name}</td>
                    <td>${p.pos}</td>
                    <td>${p.rating}</td>
                    <td>${p.age}</td>
                    <td class="${parseInt(p.bird) >= 3 ? 'bg-bird' : ''}">${p.bird !== '0' && p.bird !== '' ? p.bird : '-'}</td>
                    <td class="${p.r === 'R' ? 'bg-r' : ''}">${p.r}</td>
                    <td class="${getOptClass(p.o1)}">${formatCurrencyOpt(p.t1)}</td>
                    <td class="${getOptClass(p.o2)}">${formatCurrencyOpt(p.t2)}</td>
                    <td class="${getOptClass(p.o3)}">${formatCurrencyOpt(p.t3)}</td>
                    <td class="${getOptClass(p.o4)}">${formatCurrencyOpt(p.t4)}</td>
                    <td class="${getOptClass(p.o5)}">${formatCurrencyOpt(p.t5)}</td>
                </tr>
            </tbody>
        </table>
    `;
    
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    
    positionTooltip(e, tooltip);
}

window.hideTooltip = function() {
    const tooltip = document.getElementById('player-tooltip');
    tooltip.style.display = 'none';
}

window.moveTooltip = function(e) {
    const tooltip = document.getElementById('player-tooltip');
    if (tooltip.style.display === 'none') return;
    positionTooltip(e, tooltip);
}

function positionTooltip(e, tooltip) {
    let x = e.pageX + 15;
    let y = e.pageY + 15;
    
    if (x + tooltip.offsetWidth > window.innerWidth) {
        x = window.innerWidth - tooltip.offsetWidth - 10;
    }
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function getOptClass(opt) {
    if (!opt) return "";
    opt = opt.toUpperCase();
    if (opt.includes('TO') || opt === 'T') return "opt-to";
    if (opt.includes('PO') || opt === 'P') return "opt-po";
    return "";
}

window.generateNotification = function() {
    let text = "";
    
    tradeColumns.forEach((col) => {
        if (!col.teamId) return;
        const team = teamsData.find(t => t.id === col.teamId);
        if (!team) return;
        
        const playersLeaving = col.tradesOut;
        const playersEntering = tradeColumns.flatMap(c => c.tradesOut).filter(t => t.toTeamId === col.teamId);
        
        if (playersLeaving.length === 0 && playersEntering.length === 0) return;
        
        let salaryOut = 0;
        let salaryIn = 0;
        
        let outText = "";
        playersLeaving.forEach(trade => {
            if (trade.playerUid.startsWith('p')) {
                const p = playersData.find(x => x.uid === trade.playerUid);
                if (p) {
                    salaryOut += p.salary;
                    outText += formatPlayerSalaryStr(p) + "\n";
                }
            } else if (trade.playerUid.startsWith('d')) {
                const d = draftsData.find(x => x.uid === trade.playerUid);
                if (d) {
                    outText += `${d.round}ªRONDA ${d.originalTeam.toUpperCase()} ${d.year}\n`;
                }
            }
        });
        
        let inText = "";
        playersEntering.forEach(trade => {
            if (trade.playerUid.startsWith('p')) {
                const p = playersData.find(x => x.uid === trade.playerUid);
                if (p) {
                    salaryIn += p.salary;
                    inText += formatPlayerSalaryStr(p) + "\n";
                }
            } else if (trade.playerUid.startsWith('d')) {
                const d = draftsData.find(x => x.uid === trade.playerUid);
                if (d) {
                    inText += `${d.round}ªRONDA ${d.originalTeam.toUpperCase()} ${d.year}\n`;
                }
            }
        });
        
        text += `${team.name.toUpperCase()} envía: ${salaryOut.toLocaleString('es-ES')}\n`;
        text += outText + "\n";
        text += `${team.name.toUpperCase()} recibe: ${salaryIn.toLocaleString('es-ES')}\n`;
        text += inText + "\n";
    });
    
    navigator.clipboard.writeText(text.trim()).then(() => {
        alert("Texto de notificación copiado al portapapeles.");
    }).catch(err => {
    });
}

function formatPlayerSalaryStr(p) {
    let salaries = [];
    let lastOpt = '';
    
    if (p.t1 > 0) { salaries.push(parseFloat(p.t1)); lastOpt = p.o1; }
    if (p.t2 > 0) { salaries.push(parseFloat(p.t2)); lastOpt = p.o2; }
    if (p.t3 > 0) { salaries.push(parseFloat(p.t3)); lastOpt = p.o3; }
    if (p.t4 > 0) { salaries.push(parseFloat(p.t4)); lastOpt = p.o4; }
    if (p.t5 > 0) { salaries.push(parseFloat(p.t5)); lastOpt = p.o5; }
    if (p.t6 > 0) { salaries.push(parseFloat(p.t6)); lastOpt = p.o6; }
    
    let salaryStr = "$" + salaries.map(s => s.toLocaleString('en-US')).join('-$');
    if (lastOpt && lastOpt !== '-') {
        if (lastOpt.toUpperCase().includes('TO') || lastOpt === 'T') salaryStr += ' (TO)';
        if (lastOpt.toUpperCase().includes('PO') || lastOpt === 'P') salaryStr += ' (PO)';
    }
    
    let parts = [];
    parts.push(`${p.name} ${p.pos}`);
    if (p.rating && p.rating !== '-') parts.push(p.rating);
    if (p.bird && p.bird !== '-' && p.bird !== '0') {
        if (!isNaN(p.bird)) {
            parts.push(p.bird + 'B');
        } else {
            parts.push(p.bird);
        }
    }
    if (p.r === 'R') parts.push('R');
    
    return `${parts.join(' / ')} ${salaryStr}`;
}

init();
