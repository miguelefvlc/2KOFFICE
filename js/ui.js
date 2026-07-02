/**
 * Motor de Renderizado UI (HTML Builders)
 * Aquí van todas las funciones que inyectan HTML en la interfaz.
 */

window.scanThreatsLogic = function(player, allTeams, activeTeamName) {
    let threatsCount = 0;
    let threatsHTML = "";
    let threatsList = [];

    allTeams.forEach(t => {
        let isBoss = (player.derechos && player.originTeam === t.name);
        
        // Si tiene roster lleno, no es amenaza (salvo que sea renovar a uno de los suyos)
        if (t.numPlayers >= 15 && !isBoss) return;

        if (isBoss && t.budget >= player.min) {
            let immediate = t.budgetEfectivo >= player.min;
            threatsList.push({ team: t, isBoss: true, isImmediate: immediate, sortVal: immediate ? t.budgetEfectivo : t.budget });
        } else if (!isBoss) {
            let canCap = t.cap >= player.min;
            let canMle = t.mle >= player.min;
            if (canCap || canMle) {
                let immediate = (t.efectivo >= player.min) || canMle;
                let sortVal = immediate ? Math.max(t.efectivo, t.mle) : t.cap;
                threatsList.push({ team: t, isBoss: false, isImmediate: immediate, sortVal: sortVal });
            }
        }
    });

    // Ordenar: Boss primero. Luego Inmediatos (por LS Efectivo desc). Luego Potenciales (por LS Crudo desc).
    threatsList.sort((a, b) => {
        if (a.isBoss && !b.isBoss) return -1;
        if (!a.isBoss && b.isBoss) return 1;
        
        if (a.isImmediate && !b.isImmediate) return -1;
        if (!a.isImmediate && b.isImmediate) return 1;

        return b.sortVal - a.sortVal;
    });

    threatsList.forEach(threat => {
        const t = threat.team;
        threatsCount++;

        let capClass = t.cap < 0 ? 'color-red' : 'color-green';
        let efClass = t.efectivo < 0 ? 'color-red' : 'color-green';
        
        let opacityStyle = "";
        let statusTag = "";

        if (t.numPlayers >= 15) {
            opacityStyle = "opacity: 0.3; filter: grayscale(0.8); pointer-events: none;";
            statusTag = `<span style="font-size: 9px; background: var(--bg-panel); color: var(--accent-red); padding: 2px 5px; border-radius: 4px;">Roster Lleno</span>`;
        } else if (!threat.isImmediate) {
            opacityStyle = "opacity: 0.45; filter: grayscale(0.5);";
            statusTag = `<span style="font-size: 9px; background: var(--bg-panel); color: var(--accent-orange); padding: 2px 5px; border-radius: 4px; box-shadow: 0 0 3px rgba(0,0,0,0.5);">Necesita renunciar a CH retenido</span>`;
        } else {
            statusTag = `<span style="font-size: 9px; background: var(--bg-panel); color: var(--accent-green); padding: 2px 5px; border-radius: 4px;">Dinero Listo</span>`;
        }

        let isBossClass = threat.isBoss ? `border: 1px solid var(--accent-purple); box-shadow: 0 0 5px rgba(168, 85, 247, 0.3);` : `border: 1px solid var(--border-subtle);`;
        let bossNameStyle = threat.isBoss ? `color:var(--accent-purple);` : ``;
        let outerOpacity = (t.numPlayers >= 15) ? "pointer-events: none;" : ""; // Dejamos el pointer-events en el padre

        // CALCULAR PREVISIONES DE OFERTA
        let maxCash = threat.isBoss ? t.budgetEfectivo : Math.max(t.efectivo, t.mle);
        let S = Math.min(player.max, Math.max(player.min, maxCash));
        let max4Yrs = S * 4; // Simplificado: Salario x 4
        let sorteo80_total = max4Yrs * 0.80;
        
        // Calcular cuánto tiene que ofrecer el USUARIO en el Año 1 para llegar a ese 80%
        let userMultiplier = 4; // Simplificado
        let userStartingSalaryNeeded = sorteo80_total / userMultiplier;
        userStartingSalaryNeeded = Math.max(userStartingSalaryNeeded, player.min);

        let forecastHTML = "";
        if (t.numPlayers < 15) {
            forecastHTML = `
                <div style="font-size:10px; color:var(--text-color); margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); ${opacityStyle}">
                    <div style="margin-bottom:2px; display:flex; flex-wrap:nowrap; gap:4px; align-items:center;">
                        <span style="opacity:0.7; white-space:nowrap;">Puede ofrecer:</span> 
                        <strong style="color:var(--accent-blue); white-space:nowrap;">$${(max4Yrs/1000000).toFixed(1)}M = ${(S/1000000).toFixed(1)}Mx4</strong>
                    </div>
                    <div style="display:flex; flex-wrap:nowrap; gap:4px; align-items:center;">
                        <span style="opacity:0.7; white-space:nowrap;">Para sorteo (80%):</span> 
                        <strong style="color:var(--accent-orange); white-space:nowrap; display:flex; align-items:center;" class="annual-req-display">
                            $${(sorteo80_total/1000000).toFixed(1)}M = <span class="annual-val" style="margin-right:2px;">$${(userStartingSalaryNeeded/1000000).toFixed(1)}M</span>x
                            <div class="yr-seg-group" data-total="${sorteo80_total}" data-pmax="${player.max}" data-pmin="${player.min}">
                                <span class="yr-seg" onclick="updateForecastYrs(this, 1, event)">1</span>
                                <span class="yr-seg" onclick="updateForecastYrs(this, 2, event)">2</span>
                                <span class="yr-seg" onclick="updateForecastYrs(this, 3, event)">3</span>
                                <span class="yr-seg active" onclick="updateForecastYrs(this, 4, event)">4</span>
                            </div>
                        </strong>
                    </div>
                </div>
            `;
        }

        threatsHTML += `
            <div class="rival-card" style="${isBossClass} cursor: pointer; ${outerOpacity}" onclick="openRivalModal('${t.name}')">
                <div class="flex-between" style="margin-bottom: 8px;">
                    <strong style="font-size:13px; ${bossNameStyle} ${opacityStyle}">${t.name}</strong>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${statusTag}
                        <div style="border: 1px solid var(--border-subtle); border-radius: 3px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); ${opacityStyle}" title="Jugadores en plantilla">${t.numPlayers}</div>
                    </div>
                </div>
                <div style="font-size:11px; text-align:right; ${opacityStyle}">
                    <span class="text-muted">LS-CH: <span class="data-num ${efClass}" style="font-weight:bold; font-size:13px;">$${(t.efectivo/1000000).toFixed(1)}M</span></span>
                </div>
                ${forecastHTML}
            </div>
        `;
    });

    let reportHtml = `<div style="display:flex; flex-direction:column; gap:4px;">`;
    if (threatsCount === 0) {
        reportHtml += `<p class="text-muted text-small">Nadie puede pagar el mínimo.</p>`;
    } else {
        reportHtml += threatsHTML;
    }
    reportHtml += `</div>`;
    return reportHtml;
}

window.updateForecastYrs = function(el, years, event) {
    if (event) event.stopPropagation(); // Evitar que se abra la ventana emergente
    
    let group = el.closest('.yr-seg-group');
    if(!group) return;
    
    // Update active class UI
    group.querySelectorAll('.yr-seg').forEach(s => s.classList.remove('active'));
    el.classList.add('active');

    let total = parseFloat(group.getAttribute('data-total'));
    let pMax = parseFloat(group.getAttribute('data-pmax'));
    let pMin = parseFloat(group.getAttribute('data-pmin'));
    
    let reqAnnual = total / years;
    reqAnnual = Math.max(reqAnnual, pMin); // Nunca puede ser menos del mínimo
    
    let color = (reqAnnual > pMax) ? 'var(--accent-red)' : 'var(--accent-orange)';
    
    let parent = group.closest('.annual-req-display');
    if(parent) {
        let valEl = parent.querySelector('.annual-val');
        if(valEl) {
            valEl.innerText = '$' + (reqAnnual / 1000000).toFixed(1) + 'M';
            parent.style.color = color;
        }
    }
}


window.openRivalModal = function(teamName) {
    const modal = document.getElementById('rival-modal');
    const title = document.getElementById('rival-modal-title');
    const content = document.getElementById('rival-modal-content');
    
    // Buscar el equipo
    const t = allTeams.find(x => x.name === teamName);
    if (!t) return;

    // Obtener la ruta del logo
    const logoFile = typeof TEAM_LOGOS !== 'undefined' && TEAM_LOGOS[teamName] ? `logos/${TEAM_LOGOS[teamName]}` : '';
    const logoHtml = logoFile ? `<img src="${logoFile}" alt="${teamName}" style="max-height: 80px; display: block; margin: 0 auto;">` : `<span style="font-size:24px;">${teamName}</span>`;

    // Configurar el título
    title.innerHTML = logoHtml;
    title.style.width = "100%";
    title.style.justifyContent = "center";
    
    // Construir los widgets
    let html = `
        <h3 style="text-align:center; color:var(--text-main); margin-bottom: 20px; font-weight:600; letter-spacing:1px;">SITUACIÓN ECONÓMICA</h3>
        
        <div class="economy-widgets" style="margin-bottom:30px;">
            <div class="widget highlight" title="Límite Salarial base extraído directamente de la liga.">
                <span style="color: var(--accent-blue); font-size:10px; text-transform:uppercase;">Disponible limite salarial</span>
                <strong class="data-num ${getColorClass(t.cap)}" style="font-size:13px;">${formatCurrency(t.cap)}</strong>
            </div>
            <div class="widget highlight" title="Presupuesto base extraído de la liga. Normalmente usado para renovar a tus propios jugadores (Derechos Bird/R).">
                <span style="color: var(--accent-blue); font-size:10px; text-transform:uppercase;">Disponible presupuesto</span>
                <strong class="data-num ${getColorClass(t.budget)}" style="font-size:13px;">${formatCurrency(t.budget)}</strong>
            </div>
            <div class="widget" title="Mid-Level Exception. Bolsa de dinero extra para fichar sin consumir Límite Salarial.">
                <span class="text-muted" style="font-size:10px; text-transform:uppercase;">Disponible MLE</span>
                <strong class="data-num ${getColorClass(t.mle)}" style="font-size:13px;">${formatCurrency(t.mle)}</strong>
            </div>
            <div class="widget" title="Dinero 'congelado' temporalmente por los agentes libres de tu equipo hasta que renueven o renuncies a ellos.">
                <span class="text-muted" style="font-size:10px; text-transform:uppercase;">Cap Hold retenido</span>
                <strong id="sim-ch" class="data-num ${getColorClass(t.capHoldTotal)}" style="font-size:13px;">${formatCurrency(t.capHoldTotal)}</strong>
            </div>
            <div class="widget" title="Límite Salarial REAL con el que cuentas para fichar a jugadores externos tras descontar tus Cap Holds.">
                <span class="text-muted" style="font-size:10px; text-transform:uppercase;">Efectivo LS (-Cap Hold)</span>
                <strong id="sim-ls" class="data-num ${getColorClass(t.efectivo)}" style="font-size:13px;">${formatCurrency(t.efectivo)}</strong>
            </div>
            <div class="widget" title="Presupuesto REAL que tienes tras contabilizar todos los gastos y firmas.">
                <span class="text-muted" style="font-size:10px; text-transform:uppercase;">Efectivo presupuesto (-Firmas retrasadas)</span>
                <strong id="sim-bud" class="data-num ${getColorClass(t.budgetEfectivo)}" style="font-size:13px;">${formatCurrency(t.budgetEfectivo)}</strong>
            </div>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); margin: 30px 0;"></div>
        
        <h4 style="color:var(--text-main); margin-bottom: 15px;">Simulador de Cap Holds</h4>
    `;

    // Buscar los Agentes Libres de este equipo que tengan Cap Hold
    let myFAs = livePlayers.filter(p => p.originTeam === teamName && p.capHold > 0);
    
    if (myFAs.length === 0) {
        html += `<p class="text-muted" style="font-style:italic;">Este equipo no tiene jugadores con Cap Hold activo.</p>`;
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
                <td data-label="Jugador">
                    <div style="display: flex; align-items: center;">
                        <img src="${getPlayerPhotoPath(fa.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${fa.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                        <strong>${fa.name}</strong>
                    </div>
                </td>
                <td data-label="Pos">${fa.pos}</td>
                <td data-label="Min / Max" class="data-num text-muted" style="font-size:11px;">${formatCurrency(fa.min)} - ${formatCurrency(fa.max)}</td>
                <td data-label="Cap Hold" class="data-num color-red" style="${capHoldDecor}">-${formatCurrency(fa.capHold)}</td>
                <td data-label="Mantener Derechos" style="text-align:center;">
                    <input type="checkbox" class="sim-ch-checkbox" data-id="${fa.id}" data-ch="${fa.capHold}" ${isChecked} onchange="simulateRivalEconomy('${teamName}')" style="cursor:pointer; width:18px; height:18px;">
                </td>
            </tr>`;
        });
        
        html += `</tbody></table>`;
    }

    content.innerHTML = html;
    modal.style.display = 'flex';
    
    // Ejecutar la simulación inmediatamente para aplicar la penalización de roster desde el inicio
    simulateRivalEconomy(teamName);
}

window.simulateRivalEconomy = function(teamName) {
    const t = allTeams.find(x => x.name === teamName);
    if (!t) return;

    // Actualizar el estado global de los jugadores según los checkboxes
    const checkboxes = document.querySelectorAll('.sim-ch-checkbox');
    checkboxes.forEach(cb => {
        let pId = parseInt(cb.getAttribute('data-id'));
        let player = livePlayers.find(p => p.id === pId);
        if(player) {
            player.renounced = !cb.checked;
            player.derechos = cb.checked;
        }
    });

    // Recalcular la economía oficial de todos los equipos
    recalculateCapHolds();

    // Refrescar paneles de fondo para que los cambios se vean en vivo
    renderTopEconomy();
    renderStudyTable();

    // Actualizar UI del Modal usando los datos OFICIALES recién calculados

    let elCH = document.getElementById('sim-ch');
    let elLS = document.getElementById('sim-ls');
    let elBud = document.getElementById('sim-bud');

    if(elCH) {
        elCH.innerText = formatCurrency(t.capHoldTotal);
        elCH.className = `data-num ${getColorClass(t.capHoldTotal)}`;
    }
    if(elLS) {
        elLS.innerText = formatCurrency(t.efectivo);
        elLS.className = `data-num ${getColorClass(t.efectivo)}`;
    }
    if(elBud) {
        elBud.innerText = formatCurrency(t.budgetEfectivo);
        elBud.className = `data-num ${getColorClass(t.budgetEfectivo)}`;
    }
    
    if(activePlayerId) {
        const p = livePlayers.find(pl => pl.id == activePlayerId);
        if(p) {
            const box = document.getElementById('threats-box');
            box.innerHTML = scanThreatsLogic(p, allTeams, activeTeam.name);
        }
    }
}

window.closeRivalModal = function() {
    document.getElementById('rival-modal').style.display = 'none';
    if(activePlayerId) {
        // Refrescar el radar de rivales por si las posiciones han cambiado
        const p = livePlayers.find(pl => pl.id == activePlayerId);
        if(p) {
            const box = document.getElementById('threats-box');
            box.innerHTML = scanThreatsLogic(p, allTeams, activeTeam.name);
        }
    }
}

window.openActiveTeamCHModal = function() {
    if (!activeTeam) return;

    const modal = document.getElementById('active-ch-modal');
    const content = document.getElementById('active-ch-modal-content');
    
    let myFAs = livePlayers.filter(p => p.originTeam === activeTeam.name && p.capHold > 0);
    
    let html = "";
    if (myFAs.length === 0) {
        html += `<p class="text-muted" style="font-style:italic; text-align:center;">No tienes jugadores con Cap Hold activo.</p>`;
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
                <td data-label="Jugador">
                    <div style="display: flex; align-items: center;">
                        <img src="${getPlayerPhotoPath(fa.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${fa.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                        <strong>${fa.name}</strong>
                    </div>
                </td>
                <td data-label="Pos">${fa.pos}</td>
                <td data-label="Min / Max" class="data-num text-muted" style="font-size:11px;">${formatCurrency(fa.min)} - ${formatCurrency(fa.max)}</td>
                <td data-label="Cap Hold" class="data-num color-red" style="${capHoldDecor}">-${formatCurrency(fa.capHold)}</td>
                <td data-label="Mantener Derechos" style="text-align:center;">
                    <input type="checkbox" class="sim-active-ch-checkbox" data-id="${fa.id}" ${isChecked} onchange="simulateActiveEconomy()" style="cursor:pointer; width:18px; height:18px;">
                </td>
            </tr>`;
        });
        
        html += `</tbody></table>`;
    }

    content.innerHTML = html;
    modal.style.display = 'flex';
}

window.simulateActiveEconomy = function() {
    const checkboxes = document.querySelectorAll('.sim-active-ch-checkbox');
    checkboxes.forEach(cb => {
        let pId = parseInt(cb.getAttribute('data-id'));
        let player = livePlayers.find(p => p.id === pId);
        if(player) {
            player.renounced = !cb.checked;
            player.derechos = cb.checked;
        }
    });

    // Recalcular
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    
    // Si tenemos un jugador abierto en el radar, lo refrescamos también
    if(activePlayerId) {
        const p = livePlayers.find(pl => pl.id == activePlayerId);
        if(p) {
            const box = document.getElementById('threats-box');
            box.innerHTML = scanThreatsLogic(p, allTeams, activeTeam.name);
        }
    }
}

window.closeActiveTeamCHModal = function() {
    document.getElementById('active-ch-modal').style.display = 'none';
}

