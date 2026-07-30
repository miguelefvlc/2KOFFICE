/**
 * app.js — Lógica de FA Office (fa.html)
 * ========================================
 * Depende de los módulos compartidos:
 *   - js/shared/constants.js
 *   - js/shared/csv_service.js
 *   - js/shared/engine.js
 *   - js/shared/utils.js
 *   - js/ui.js (importado vía HTML para interacciones UI)
 *
 * Este archivo contiene SOLO la lógica exclusiva de FA Office.
 */


import { CSV_URLS, FA_TEAM_ID, FREESPOT_BONUS, ROSTER_THRESHOLD, ROSTER_FULL, FIXED_DELAYED_FA, RANGE_R3_START, RANGE_R3_END, DEFAULT_TEAM, STAR_PATH_FILLED, STAR_PATH_EMPTY } from './shared/constants.js';
import { CSVService } from './shared/csv_service.js';
import { mapCsvToTeam, mapCsvToPlayer } from './shared/engine.js';
import { formatCurrency, getPlayerPhotoPath } from './shared/utils.js';

// === ESTADO GLOBAL DE FA OFFICE ===

window.dbEquipos_Base = [];
window.dbJugadores_Base = [];

window.allTeams    = [];
window.livePlayers = [];
window.activeTeam  = null;
window.activePlayerId = null;

// Variables de control del simulador global (solo usadas si se abre simulador.html)
window.isGlobalSimOpen         = false;
window.globalSimActivePlayerId = null;
window.globalSimActiveTeamName = null;

// === ARRANQUE ===

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// === INICIALIZACIÓN ===

function initApp() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    Promise.all([
        CSVService.getPlayers(),
        CSVService.getEconomy()
    ]).then(([rawPlayers, rawTeams]) => {

        // --- Equipos ---
        window.dbEquipos_Base = rawTeams.map(mapCsvToTeam).filter(t => t.name !== 'Desconocido');

        // Calcular número de jugadores en plantilla por equipo (t1 > 0 y no FA)
        const rostersCount = {};
        rawPlayers.forEach(p => {
            const t1 = parseFloat(p.t1) || 0;
            if (t1 > 0 && p.team_id !== FA_TEAM_ID) {
                rostersCount[p.team_id] = (rostersCount[p.team_id] || 0) + 1;
            }
        });
        window.dbEquipos_Base.forEach(t => { t.numPlayers = rostersCount[t.id] || 0; });

        // --- Jugadores FA ---
        const startR3Idx = rawPlayers.findIndex(x => x.Player === RANGE_R3_START);
        const endR3Idx   = rawPlayers.findIndex(x => x.Player === RANGE_R3_END);

        window.dbJugadores_Base = rawPlayers
            .filter(p => (parseFloat(p.t1) || 0) === 0 || p.team_id === FA_TEAM_ID)
            .map((p, idx) => mapCsvToPlayer(p, idx, window.dbEquipos_Base, rawPlayers, startR3Idx, endR3Idx))
            .filter(p => p.name !== 'Desconocido');

        // Equipo activo por defecto
        window.activeTeam = structuredClone(
            window.dbEquipos_Base.find(t => t.name === DEFAULT_TEAM) || window.dbEquipos_Base[0]
        );

        renderLogoGrid();
        updateActiveTeamUI(activeTeam.name);

        if (loader) loader.style.display = 'none';
        resetSimulation();
        initPlayerSearch();

    }).catch(err => {
        console.error(err);
        alert('Error al leer los archivos CSV locales.\n\nComprueba que \'players.csv\' y \'economia.csv\' están en esta carpeta.\nRecuerda que debes abrir fa.html usando \'Live Server\' de VS Code por seguridad del navegador.');
        if (loader) loader.style.display = 'none';
    });
}

// === MOTOR FINANCIERO (Modo FA — solo aplica efectos al equipo activo) ===

window.recalculateCapHolds = function() {
    // 1. Resetear todos los equipos a sus valores base del CSV
    allTeams.forEach(t => {
        const baseTeam = dbEquipos_Base.find(bt => bt.name === t.name);
        if (baseTeam) {
            t.capHoldSum    = 0;
            t.capHoldTotal  = 0;
            t.numPlayers    = baseTeam.numPlayers;
            t.mle           = baseTeam.mle;
            t.budgetEfectivo = baseTeam.budgetEfectivo;
            t.cap           = baseTeam.cap;
            t.budget        = baseTeam.budget;
        }
    });

    // 2. Sumar Cap Holds activos para cada equipo
    //    (Una firma normal del equipo activo libera el Cap Hold; una retrasada no)
    livePlayers.forEach(p => {
        if (!p.derechos || p.renounced) return;
        let countsAsCapHold = true;
        if (p.simulatedSigned && p.simTx &&
            p.simTx.team === (activeTeam ? activeTeam.name : null) &&
            !p.simTx.isDelayed) {
            countsAsCapHold = false;
        }
        if (countsAsCapHold) {
            const team = allTeams.find(t => t.name === p.originTeam);
            if (team) team.capHoldSum += p.capHold;
        }
    });

    // 3. Calcular LS Efectivo = LS - Cap Holds
    allTeams.forEach(t => {
        t.efectivo     = t.cap - t.capHoldSum;
        t.capHoldTotal = t.capHoldSum;
    });

    // 4. Aplicar efectos de firmas simuladas (solo del equipo activo en FA Office)
    if (activeTeam) {
        const currentActive = allTeams.find(t => t.name === activeTeam.name);
        if (currentActive) {
            currentActive.simSignedCount = 0;
            livePlayers.forEach(p => {
                if (!p.simulatedSigned || !p.simTx || p.simTx.team !== activeTeam.name) return;
                const tx = p.simTx;
                if (!tx.isPreloaded) currentActive.simSignedCount++;

                if (tx.isDelayed) {
                    if (!tx.isPreloaded) currentActive.budgetEfectivo -= (p.capHold || 0);
                } else {
                    currentActive.budgetEfectivo -= tx.salary;
                    if (tx.exception === 'cap' || tx.exception === 'bird') {
                        currentActive.efectivo -= tx.salary;
                        if (tx.exception === 'cap') currentActive.cap -= tx.salary;
                    } else if (tx.exception === 'mle') {
                        currentActive.mle -= tx.salary;
                    }
                }
            });
        }
    }

    // 5. Bonus de plazas libres (freespot) — aplica a todos los equipos
    allTeams.forEach(t => {
        const baseTeam = dbEquipos_Base.find(bt => bt.name === t.name);
        if (!baseTeam) return;
        const signedCount        = t.simSignedCount || 0;
        const totalRoster        = baseTeam.numPlayers + signedCount;
        t.numPlayers             = totalRoster;
        const baseEmptySpots     = Math.max(0, ROSTER_THRESHOLD - baseTeam.numPlayers);
        const currentEmptySpots  = Math.max(0, ROSTER_THRESHOLD - totalRoster);
        const totalFreespotBonus = (baseEmptySpots - currentEmptySpots) * FREESPOT_BONUS;
        t.efectivo       += totalFreespotBonus;
        t.budgetEfectivo += totalFreespotBonus;
        t.cap            += totalFreespotBonus;
        t.budget         += totalFreespotBonus;
    });

    // 6. Sincronizar el objeto activeTeam con los valores recalculados
    if (activeTeam) {
        const currentActive = allTeams.find(t => t.name === activeTeam.name);
        if (currentActive) {
            activeTeam.cap            = currentActive.cap;
            activeTeam.efectivo       = currentActive.efectivo;
            activeTeam.budget         = currentActive.budget;
            activeTeam.budgetEfectivo = currentActive.budgetEfectivo;
            activeTeam.capHoldTotal   = currentActive.capHoldTotal;
            activeTeam.mle            = currentActive.mle;
            activeTeam.numPlayers     = currentActive.numPlayers;
        }
    }

    // 7. Actualizar la barra visual de equipos
    if (typeof window.renderTopTeamsBar === 'function') window.renderTopTeamsBar();
};

// === RESET DE SIMULACIÓN ===

window.resetSimulation = function() {
    if (!activeTeam) return;
    const currentTeamName = activeTeam.name;

    window.allTeams    = structuredClone(window.dbEquipos_Base);
    window.livePlayers = structuredClone(window.dbJugadores_Base);

    // Aplicar firmas retrasadas preconfiguradas (definidas en constants.js)
    FIXED_DELAYED_FA.forEach(fd => {
        const p = window.livePlayers.find(pl => pl.name === fd.name && pl.originTeam === fd.team);
        if (p) {
            p.simulatedSigned = true;
            p.simTx = { salary: p.capHold, exception: 'bird', isDelayed: true, isPreloaded: true, team: fd.team };
        }
    });

    window.activeTeam     = window.allTeams.find(t => t.name === currentTeamName);
    window.activePlayerId = null;

    const tName = document.getElementById('player-target-name');
    if (tName) tName.innerText = 'Selecciona un objetivo...';
    const tBox  = document.getElementById('threats-box');
    if (tBox)  tBox.innerHTML  = "<span class='text-muted text-small'>Radar inactivo.</span>";

    const list     = document.getElementById('signed-players-list');
    if (list) list.innerHTML = '';
    const simPanel = document.getElementById('simulator-panel');
    if (simPanel) simPanel.style.display = 'none';

    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();
};

// === TABLA DE AGENTES LIBRES (FA Office) ===

function renderStudyTable() {
    const tbody = document.getElementById('study-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const starred = JSON.parse(localStorage.getItem('starred_players') || '[]');

    // Ordenar: primero por ronda, luego por momento de cambio (reciente primero), luego por rating
    const sorted = [...livePlayers].sort((a, b) => {
        const rA = parseInt(a.round || 0), rB = parseInt(b.round || 0);
        if (rA !== rB) return rA - rB;
        const cA = a.roundChangedAt || 0, cB = b.roundChangedAt || 0;
        if (cA !== cB) return cB - cA;
        return b.rating - a.rating;
    });

    sorted.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'row-interactive';
        tr.setAttribute('data-id', p.id);
        if (p.id === activePlayerId) tr.classList.add('selected');

        // --- Color de fila según capacidad de puja del equipo activo ---
        let rowBorderColor = 'transparent';
        if (activeTeam) {
            const isBoss = p.derechos && p.originTeam === activeTeam.name && p.renounced !== true;
            const canBidImmediate = isBoss
                ? activeTeam.budgetEfectivo >= p.min
                : (activeTeam.efectivo >= p.min) || (activeTeam.mle >= p.min);
            const canBidPotential = isBoss
                ? activeTeam.budget >= p.min
                : ((activeTeam.efectivo + activeTeam.capHoldTotal) >= p.min) || (activeTeam.mle >= p.min);

            if (p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name) {
                rowBorderColor = 'var(--accent-green)';
                tr.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
                tr.style.opacity = '0.8';
            } else if (activeTeam.numPlayers >= ROSTER_FULL && !isBoss) {
                rowBorderColor = 'gray';
                tr.style.opacity = '0.3';
                tr.style.filter  = 'grayscale(0.8)';
            } else if (canBidImmediate) {
                rowBorderColor = 'var(--accent-green)';
                tr.style.backgroundColor = 'rgba(34, 197, 94, 0.05)';
            } else if (canBidPotential) {
                rowBorderColor = 'var(--accent-yellow)';
                tr.style.backgroundColor = 'rgba(234, 179, 8, 0.05)';
                tr.style.opacity = '0.5';
                tr.style.filter  = 'grayscale(0.3)';
            } else {
                rowBorderColor = 'gray';
                tr.style.opacity = '0.2';
                tr.style.filter  = 'grayscale(0.9)';
            }
        }

        tr.onclick = () => selectStudyPlayer(p.id);

        const birdStyle     = parseInt(p.bird) >= 3 ? `style="color: var(--accent-green); font-weight: bold;"` : '';
        const rStyle        = (p.r && p.r.trim().toUpperCase() === 'R') ? `style="color: var(--accent-yellow); font-weight: bold;"` : '';
        const capHoldDisplay = p.renounced
            ? `<span style="text-decoration: line-through; color: var(--accent-red); opacity: 0.7;">${formatCurrency(p.capHold)}</span>`
            : formatCurrency(p.capHold);
        const fallbackUrl   = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
        const isStarred     = starred.includes(p.id);
        const starColor     = isStarred ? 'var(--accent-yellow)' : 'var(--text-muted)';
        const starPath      = isStarred ? STAR_PATH_FILLED : STAR_PATH_EMPTY;

        tr.innerHTML = `
            <td style="border-left: 4px solid ${rowBorderColor};">
                <div style="display: flex; align-items: center;">
                    <img src="${getPlayerPhotoPath(p.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${p.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                    <strong>${p.name}</strong>
                </div>
            </td>
            <td>${p.team}</td>
            <td>${p.pos}</td>
            <td class="data-num">${p.rating}</td>
            <td class="data-num">${p.edad}</td>
            <td class="data-num" ${birdStyle}>${p.bird}</td>
            <td ${rStyle}>${p.r}</td>
            <td class="data-num">${formatCurrency(p.min)}</td>
            <td class="data-num">${formatCurrency(p.max)}</td>
            <td class="data-num">${capHoldDisplay}</td>
            <td>${p.round !== '0' ? `<span class="round-badge round-${p.round}">R${p.round}</span>` : ''}</td>
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

    const box = document.getElementById('threats-box');
    if (box) {
        box.innerHTML = typeof scanThreatsLogic === 'function'
            ? scanThreatsLogic(p, allTeams, activeTeam ? activeTeam.name : null)
            : "<span class='text-muted text-small'>Simulación de amenazas no disponible.</span>";
    }

    if (typeof updateSimulator === 'function') updateSimulator(p);
};

// === SIMULADOR DE FIRMAS (Panel derecho de FA Office) ===

window.updateSimulator = function(p) {
    const panel = document.getElementById('simulator-panel');
    if (!panel) return;

    if (!p || (p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name)) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    document.getElementById('sim-player-photo').src = getPlayerPhotoPath(p.name);

    const salaryInput = document.getElementById('sim-salary-input');
    salaryInput.value = p.max > 0 ? p.max : p.min;

    const select   = document.getElementById('sim-exception-select');
    const signBtn  = document.getElementById('sim-sign-btn');
    const feedback = document.getElementById('sim-feedback');

    // Auto-seleccionar la mejor excepción disponible
    if (activeTeam) {
        const isBoss = p.derechos && p.originTeam === activeTeam.name;
        select.value = isBoss ? 'bird' : (activeTeam.efectivo >= p.min ? 'cap' : activeTeam.mle >= p.min ? 'mle' : 'cap');
    }

    function checkCanSign() {
        const sal = parseFloat(salaryInput.value) || 0;
        const exc = select.value;
        let canSign = false;
        let msg     = '';

        if (sal < p.min) {
            msg = `El salario no puede ser menor al Mínimo (${formatCurrency(p.min)}).`;
        } else if (sal > p.max && p.max > 0) {
            msg = `El salario supera el máximo permitido (${formatCurrency(p.max)}).`;
        } else {
            if (exc === 'cap') {
                if (activeTeam.efectivo < sal) msg = 'Espacio salarial insuficiente.';
                else canSign = true;
            } else if (exc === 'mle') {
                if (activeTeam.mle < sal) msg = 'Excepción MLE insuficiente.';
                else canSign = true;
            } else if (exc === 'bird') {
                if (!p.derechos || p.originTeam !== activeTeam.name) msg = 'No posees derechos Bird/R sobre este jugador.';
                else if (activeTeam.budgetEfectivo < sal) msg = 'Presupuesto insuficiente para renovar.';
                else canSign = true;
            } else if (exc === 'minimum') {
                if (sal > p.min) msg = 'Por el Mínimo solo puedes ofrecer su salario Mínimo exacto.';
                else if (activeTeam.budgetEfectivo < sal) msg = 'Presupuesto insuficiente.';
                else canSign = true;
            }
        }

        const delayBtn = document.getElementById('sim-delay-btn');
        if (canSign) {
            signBtn.disabled = false;
            signBtn.style.opacity    = '1';
            signBtn.innerText        = 'FIRMA';
            signBtn.style.background = 'var(--accent-green, #22c55e)';
            feedback.innerText       = '';
            if (delayBtn) delayBtn.style.display = (p.derechos && p.originTeam === activeTeam.name) ? 'block' : 'none';
        } else {
            signBtn.disabled = true;
            signBtn.style.opacity    = '0.5';
            signBtn.innerText        = 'FIRMA (No viable)';
            signBtn.style.background = 'var(--text-muted, #9ca3af)';
            feedback.innerText       = msg;
            if (delayBtn) delayBtn.style.display = 'none';
        }

        if (typeof updateSimEconomySummary === 'function') {
            const capHold = (p.derechos && p.originTeam === activeTeam.name) ? p.capHold : 0;
            updateSimEconomySummary({ salary: sal, exception: exc, isDelayed: false, capHold });
        }
    }

    salaryInput.oninput = checkCanSign;
    select.onchange     = checkCanSign;
    checkCanSign();
};

window.signSimulatedPlayer = function(isDelayed = false) {
    if (!activePlayerId || !activeTeam) return;
    const p = livePlayers.find(pl => pl.id == activePlayerId);
    if (!p) return;

    const salary    = parseFloat(document.getElementById('sim-salary-input').value) || 0;
    const exception = document.getElementById('sim-exception-select').value;

    p.simulatedSigned = true;
    p.simTx = { salary, exception, isDelayed, team: activeTeam.name };

    recalculateCapHolds();
    if (typeof renderSignedPlayersList === 'function') renderSignedPlayersList();

    document.getElementById('simulator-panel').style.display = 'none';
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();

    if (isGlobalSimOpen && typeof renderGlobalSimTable === 'function') renderGlobalSimTable();
};

window.undoSimulatedSigning = function(playerId) {
    if (!activeTeam) return;
    const p = livePlayers.find(pl => pl.id == playerId);
    if (!p || !p.simulatedSigned || !p.simTx) return;

    p.simulatedSigned = false;
    delete p.simTx;

    if (typeof renderSignedPlayersList === 'function') renderSignedPlayersList();
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();

    if (activePlayerId === p.id) updateSimulator(p);
    if (isGlobalSimOpen && typeof renderGlobalSimTable === 'function') renderGlobalSimTable();
};

window.editSimulatedSigning = function(id) {
    const p = livePlayers.find(pl => pl.id === id);
    if (!p || !p.simTx) return;

    const oldSal = p.simTx.salary;
    const oldExc = p.simTx.exception;

    undoSimulatedSigning(id);
    selectStudyPlayer(id);

    setTimeout(() => {
        const salaryInput    = document.getElementById('sim-salary-input');
        const exceptionSelect = document.getElementById('sim-exception-select');
        if (salaryInput)    { salaryInput.value = oldSal; salaryInput.dispatchEvent(new Event('input')); }
        if (exceptionSelect) exceptionSelect.value = oldExc;
    }, 50);
};

window.makeSigningOfficial = function(playerId) {
    const p = livePlayers.find(pl => pl.id === playerId);
    if (!p || !p.simTx) return;
    p.simTx.isDelayed = false;
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();
    if (typeof renderSignedPlayersList === 'function') renderSignedPlayersList();
};

// === RESUMEN ECONÓMICO EN VIVO (panel de firma) ===

window.updateSimEconomySummary = function(previewTx = null) {
    const sumDiv = document.getElementById('sim-economy-summary');
    if (!sumDiv || !activeTeam) return;
    sumDiv.style.display = 'flex';

    const negOrMain = val => val < 0 ? 'var(--accent-red)' : 'var(--text-main)';
    let eff = activeTeam.efectivo;
    let bud = activeTeam.budgetEfectivo;
    let mle = activeTeam.mle;

    if (previewTx) {
        const { salary = 0, exception, isDelayed, capHold = 0 } = previewTx;
        bud -= isDelayed ? capHold : salary;
        if (!isDelayed) {
            if (exception === 'cap' || exception === 'bird') { eff -= salary; eff += capHold; }
            else if (exception === 'mle')    { mle -= salary; eff += capHold; }
            else if (exception === 'minimum') eff += capHold;
        }
    }

    const lsEl   = document.getElementById('sim-sum-ls');
    const presEl = document.getElementById('sim-sum-pres');
    const mleEl  = document.getElementById('sim-sum-mle');

    if (lsEl)   { lsEl.innerText   = formatCurrency(eff); lsEl.style.color   = negOrMain(eff); }
    if (presEl) { presEl.innerText = formatCurrency(bud); presEl.style.color = negOrMain(bud); }
    if (mleEl)  { mleEl.innerText  = formatCurrency(mle); mleEl.style.color  = negOrMain(mle); }
};

// === LISTA DE FIRMAS SIMULADAS (panel izquierdo) ===

window.renderSignedPlayersList = function() {
    const list = document.getElementById('signed-players-list');
    if (!list || !activeTeam) return;
    list.innerHTML = '';

    const excLabel = exc => ({ cap: 'Cap Space', mle: 'MLE', minimum: 'Mínimo', bird: 'Bird/R' }[exc] || '');

    livePlayers
        .filter(p => p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name)
        .forEach(p => {
            const { salary, exception, isDelayed } = p.simTx;
            const excText  = isDelayed ? 'Firma Retrasada' : excLabel(exception);
            const photoUrl = getPlayerPhotoPath(p.name);

            const folded = document.createElement('div');
            folded.className = 'panel';
            folded.id        = `sim-folded-${p.id}`;
            Object.assign(folded.style, {
                padding: '4px 8px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginTop: '0',
                backgroundColor: 'var(--bg-panel)', position: 'relative',
                border: '1px solid transparent',
                borderLeft: `4px solid ${isDelayed ? 'var(--accent-blue)' : 'var(--accent-green)'}`
            });

            const confirmBtnHTML = isDelayed
                ? `<button onclick="makeSigningOfficial(${p.id})" style="background: var(--accent-green); color: white; border: none; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; font-weight: bold; margin-right: 6px;" title="Hacer oficial la firma">FIRMAR</button>`
                : '';

            folded.innerHTML = `
                <button onclick="undoSimulatedSigning(${p.id})" style="position: absolute; top: 0px; right: 0px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px;" title="Deshacer firma">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
                </button>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${photoUrl}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                    <div style="display: flex; flex-direction: column;">
                        <strong style="font-size: 12px; color: var(--text-main); line-height: 1.1;">${p.name}</strong>
                        <span class="text-muted text-xsmall" style="font-size: 10px;">${excText}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 4px; align-items: center; padding-right: 12px;">
                    ${confirmBtnHTML}
                    <div class="data-num color-green" style="font-size: 11px; margin-right: 4px;">${formatCurrency(salary)}</div>
                    <button onclick="editSimulatedSigning(${p.id})" style="background: transparent; border: none; color: var(--accent-blue); cursor: pointer; padding: 2px;" title="Modificar firma">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                    </button>
                </div>
            `;
            list.appendChild(folded);
        });
};
