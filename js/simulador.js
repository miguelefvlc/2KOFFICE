/**
 * simulador.js — Lógica del Simulador Global (simulador.html)
 * ============================================================
 * Depende de los módulos compartidos:
 *   - js/shared/constants.js
 *   - js/shared/csv_service.js
 *   - js/shared/engine.js
 *   - js/shared/utils.js
 *   - js/simulador_ui.js (importado vía HTML para interacciones UI)
 *
 * Este archivo contiene SOLO la lógica exclusiva del Simulador Global.
 */

import { CSV_URLS, FA_TEAM_ID, FREESPOT_BONUS, ROSTER_THRESHOLD, ROSTER_FULL, FIXED_DELAYED_SIM, RANGE_R3_START, RANGE_R3_END, DEFAULT_TEAM, TEAM_LOGOS, TEAM_ABBR, STAR_PATH_FILLED, STAR_PATH_EMPTY } from './shared/constants.js';
import { CSVService } from './shared/csv_service.js';
import { mapCsvToTeam, mapCsvToPlayer } from './shared/engine.js';
import { parseCurrency, calculateAge, formatCurrency, getColorClass, getPlayerPhotoPath } from './shared/utils.js';

// === ESTADO GLOBAL DEL SIMULADOR ===

window.dbEquipos_Base = [];
window.dbJugadores_Base = [];

window.allTeams    = [];
window.livePlayers = [];
window.activeTeam  = null;
window.activePlayerId = null;

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
        alert('Error al leer los archivos CSV locales. Comprueba que \'players.csv\' y \'economia.csv\' están en esta carpeta.');
        if (loader) loader.style.display = 'none';
    });
}

// === MOTOR FINANCIERO (Modo Global — aplica efectos a TODOS los equipos) ===

window.recalculateCapHolds = function() {
    // 1. Resetear todos los equipos a sus valores base del CSV
    allTeams.forEach(t => {
        const baseTeam = dbEquipos_Base.find(bt => bt.name === t.name);
        if (baseTeam) {
            t.capHoldSum          = 0;
            t.capHoldTotal        = 0;
            t.renounceableCapHolds = 0;
            t.numPlayers          = baseTeam.numPlayers;
            t.mle                 = baseTeam.mle;
            t.budgetEfectivo      = baseTeam.budgetEfectivo;
            t.cap                 = baseTeam.cap;
            t.budget              = baseTeam.budget;
        }
    });

    // 2. Sumar Cap Holds activos para cada equipo
    livePlayers.forEach(p => {
        if (!p.derechos || p.renounced) return;
        // Una firma normal libera el Cap Hold; una retrasada no
        const isNormalSigned = p.simulatedSigned && p.simTx && !p.simTx.isDelayed;
        if (!isNormalSigned) {
            const team = allTeams.find(t => t.name === p.originTeam);
            if (team) {
                team.capHoldSum += p.capHold;
                if (!p.simulatedSigned) team.renounceableCapHolds += p.capHold;
            }
        }
    });

    // 3. Calcular LS Efectivo
    allTeams.forEach(t => {
        t.efectivo     = t.cap - t.capHoldSum;
        t.capHoldTotal = t.capHoldSum;
    });

    // 4. Aplicar efectos de firmas simuladas para TODOS los equipos
    allTeams.forEach(currentActive => {
        currentActive.simSignedCount = 0;
        livePlayers.forEach(p => {
            if (!p.simulatedSigned || !p.simTx || p.simTx.team !== currentActive.name) return;
            const tx = p.simTx;
            if (!tx.isPreloaded) currentActive.simSignedCount++;

            if (tx.isDelayed) {
                if (!tx.isPreloaded) {
                    currentActive.budgetEfectivo -= (p.capHold || 0);
                    currentActive.budget         -= (p.capHold || 0);
                }
            } else {
                currentActive.budgetEfectivo -= tx.salary;
                currentActive.budget         -= tx.salary;
            }

            if (!tx.isDelayed) {
                if (tx.exception === 'cap' || tx.exception === 'bird') {
                    currentActive.efectivo -= tx.salary;
                    currentActive.cap      -= tx.salary;
                } else if (tx.exception === 'mle') {
                    currentActive.mle -= tx.salary;
                }
            } else if (!tx.isPreloaded) {
                currentActive.cap -= p.capHold;
            }
        });
    });

    // 5. Bonus de plazas libres (freespot)
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

    // 6. Sincronizar el objeto activeTeam
    if (activeTeam) {
        const currentActive = allTeams.find(t => t.name === activeTeam.name);
        if (currentActive) {
            activeTeam.cap             = currentActive.cap;
            activeTeam.efectivo        = currentActive.efectivo;
            activeTeam.budget          = currentActive.budget;
            activeTeam.budgetEfectivo  = currentActive.budgetEfectivo;
            activeTeam.capHoldTotal    = currentActive.capHoldTotal;
            activeTeam.mle             = currentActive.mle;
            activeTeam.numPlayers      = currentActive.numPlayers;
        }
    }

    // 7. Actualizar barra visual
    if (typeof window.renderTopTeamsBar === 'function') window.renderTopTeamsBar();
};

// === RESET DE SIMULACIÓN ===

window.resetSimulation = function() {
    if (!activeTeam) return;

    window.allTeams    = structuredClone(window.dbEquipos_Base);
    window.livePlayers = structuredClone(window.dbJugadores_Base);

    FIXED_DELAYED_SIM.forEach(fd => {
        const p = window.livePlayers.find(pl => pl.name === fd.name && pl.originTeam === fd.team);
        if (p) {
            p.simulatedSigned = true;
            p.simTx = { salary: p.capHold, exception: 'bird', isDelayed: true, isPreloaded: true, team: fd.team };
        }
    });

    window.activePlayerId = null;
    const tName = document.getElementById('player-target-name');
    if (tName) tName.innerText = 'Selecciona un objetivo...';
    const tBox  = document.getElementById('threats-box');
    if (tBox)  tBox.innerHTML = "<span class='text-muted text-small'>Radar inactivo.</span>";

    const list     = document.getElementById('signed-players-list');
    if (list) list.innerHTML = '';
    const hojaList = document.getElementById('hoja-ruta-list');
    if (hojaList) hojaList.innerHTML = '<span class="text-muted text-small">Aún no hay firmas en la hoja de ruta.</span>';
    const simPanel = document.getElementById('simulator-panel');
    if (simPanel) simPanel.style.display = 'none';

    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();
    if (typeof renderSignedPlayersList === 'function') renderSignedPlayersList();
};

// === TABLA DE AGENTES LIBRES (Simulador Global) ===

function renderStudyTable() {
    const tbody = document.getElementById('study-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const starred = JSON.parse(localStorage.getItem('starred_players') || '[]');

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

        // Estado visual si está firmado
        if (p.simulatedSigned && p.simTx) {
            tr.style.borderLeft      = `4px solid ${p.simTx.isDelayed ? 'var(--accent-blue)' : 'var(--accent-green)'}`;
            tr.style.backgroundColor = p.simTx.isDelayed ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)';
        }

        tr.onclick = () => selectStudyPlayer(p.id);

        const birdStyle  = parseInt(p.bird) >= 3 ? `style="color: var(--accent-green); font-weight: bold;"` : '';
        const rStyle     = (p.r && p.r.trim().toUpperCase() === 'R') ? `style="color: var(--accent-yellow); font-weight: bold;"` : '';
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
        const isStarred  = starred.includes(p.id);
        const starColor  = isStarred ? 'var(--accent-yellow)' : 'var(--text-muted)';
        const starPath   = isStarred ? STAR_PATH_FILLED : STAR_PATH_EMPTY;

        // --- Columna Aspirantes ---
        let aspirantesHTML = `<div style="display: flex; flex-wrap: wrap; gap: 4px;">`;

        if (p.simulatedSigned && p.simTx) {
            const teamLogo = TEAM_LOGOS[p.simTx.team] ? `assets/logos/${TEAM_LOGOS[p.simTx.team]}` : '';
            if (p.simTx.isDelayed) {
                aspirantesHTML += `
                    <div style="display:flex; align-items:center; gap: 6px; padding: 4px 8px; background: rgba(59, 130, 246, 0.2); border-radius: 4px; border: 1px solid var(--accent-blue); cursor: pointer;" title="Haz click para deshacer" onclick="event.stopPropagation(); undoSimulatedSigning(${p.id})">
                        <img src="${teamLogo}" style="height: 20px;">
                        <span style="font-size: 11px; font-weight: bold; color: var(--accent-blue);">ATRASADA POR ${formatCurrency(p.capHold)}</span>
                        <span style="color: var(--accent-red); font-weight: bold; margin-left: 5px;">&times;</span>
                    </div>`;
            } else {
                aspirantesHTML += `
                    <div style="display:flex; align-items:center; gap: 6px; padding: 4px 8px; background: rgba(34, 197, 94, 0.2); border-radius: 4px; border: 1px solid var(--accent-green); cursor: pointer;" title="Haz click para deshacer" onclick="event.stopPropagation(); undoSimulatedSigning(${p.id})">
                        <img src="${teamLogo}" style="height: 20px;">
                        <span style="font-size: 11px; font-weight: bold; color: var(--accent-green);">FIRMADO POR ${formatCurrency(p.simTx.salary)}</span>
                        <span style="color: var(--accent-red); font-weight: bold; margin-left: 5px;">&times;</span>
                    </div>`;
            }
        } else {
            const validAspirantes = [];
            allTeams.forEach(t => {
                const isBoss = p.derechos && p.originTeam === t.name;
                if (t.numPlayers >= ROSTER_FULL && !isBoss) return;

                const canBidImmediate = isBoss
                    ? t.budgetEfectivo >= p.min
                    : (t.efectivo >= p.min) || (t.mle >= p.min);
                const canBidPotential = isBoss
                    ? t.budget >= p.min
                    : ((t.efectivo + t.renounceableCapHolds) >= p.min) || (t.mle >= p.min);

                if (canBidImmediate || canBidPotential) {
                    const sortVal = isBoss
                        ? (canBidImmediate ? t.budgetEfectivo : t.budget)
                        : Math.max(t.efectivo, t.mle);
                    validAspirantes.push({ team: t, isBoss, canBidImmediate, sortVal });
                }
            });

            validAspirantes.sort((a, b) => {
                if (a.isBoss !== b.isBoss) return a.isBoss ? -1 : 1;
                if (a.canBidImmediate !== b.canBidImmediate) return a.canBidImmediate ? -1 : 1;
                return b.sortVal - a.sortVal;
            });

            validAspirantes.forEach(({ team: t, canBidImmediate, isBoss }) => {
                const borderColor = canBidImmediate ? 'var(--accent-green)' : 'var(--accent-yellow)';
                const opacity     = canBidImmediate ? '1' : '0.6';
                const title       = `${t.name}\nEstado: ${canBidImmediate ? 'Dinero listo' : 'Necesita renunciar a derechos'}`;
                const logoUrl     = TEAM_LOGOS[t.name] ? `assets/logos/${TEAM_LOGOS[t.name]}` : '';
                if (logoUrl) {
                    aspirantesHTML += `<img src="${logoUrl}" title="${title}" onclick="event.stopPropagation(); openGlobalSignModal(${p.id}, '${t.name}')" style="height: 24px; cursor: pointer; border: 2px solid ${borderColor}; border-radius: 4px; padding: 2px; background: var(--bg-panel); opacity: ${opacity}; transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">`;
                }
            });

            if (validAspirantes.length === 0) {
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
            <td data-label="Equipo" style="text-align: center;" title="${p.team}">
                <span class="text-muted" style="font-weight: 600; font-size: 12px;">${TEAM_ABBR[p.team] || p.team}</span>
            </td>
            <td data-label="Pos">${p.pos}</td>
            <td data-label="Media" class="data-num">${p.rating}</td>
            <td data-label="Edad" class="data-num">${p.edad}</td>
            <td data-label="Bird" class="data-num" ${birdStyle}>${p.bird}</td>
            <td data-label="R" ${rStyle}>${p.r}</td>
            <td data-label="Aspirantes">${aspirantesHTML}</td>
            <td data-label="Ronda" onclick="event.stopPropagation(); openRoundSelector(${p.id})" style="cursor: pointer;" title="Cambiar de ronda">
                ${p.round !== '0' ? `<span class="round-badge round-${p.round}">R${p.round}</span>` : ''}
            </td>
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

// === HOJA DE RUTA (registro de firmas globales) ===

window.renderSignedPlayersList = function() {
    const list = document.getElementById('hoja-ruta-list');
    if (!list) return;
    list.innerHTML = '';

    const signedPlayers = livePlayers.filter(p => p.simulatedSigned && p.simTx && !p.simTx.isPreloaded);

    if (signedPlayers.length === 0) {
        list.innerHTML = '<span class="text-muted text-small">Aún no hay firmas en la hoja de ruta.</span>';
        return;
    }

    const excLabel = exc => ({ cap: 'Cap Space', mle: 'MLE', minimum: 'Mínimo', bird: 'Bird/R' }[exc] || '');

    signedPlayers.forEach(p => {
        const { salary, exception, isDelayed, team: teamName } = p.simTx;
        const excText  = isDelayed ? 'Firma Retrasada' : excLabel(exception);
        const photoUrl = getPlayerPhotoPath(p.name);
        const logoUrl  = TEAM_LOGOS[teamName] ? `assets/logos/${TEAM_LOGOS[teamName]}` : '';

        const folded = document.createElement('div');
        folded.className = 'panel';
        folded.id        = `sim-folded-${p.id}`;
        Object.assign(folded.style, {
            padding: '6px 10px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', position: 'relative', marginTop: '0',
            backgroundColor: 'var(--bg-panel)',
            borderLeft: `4px solid ${isDelayed ? 'var(--accent-blue)' : 'var(--accent-green)'}`
        });

        folded.innerHTML = `
            <button onclick="undoSimulatedSigning(${p.id})" style="position: absolute; top: 0px; right: 0px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px;" title="Deshacer firma">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
            </button>
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${photoUrl}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                <div style="display: flex; flex-direction: column;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <strong style="font-size: 13px; color: var(--text-main); line-height: 1.1;">${p.name}</strong>
                        ${p.round !== '0' ? `<span class="round-badge round-${p.round}" style="font-size: 9px; padding: 1px 4px; border-radius: 3px;">R${p.round}</span>` : ''}
                    </div>
                    <span class="text-muted text-xsmall" style="font-size: 10px; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                        ${logoUrl ? `<img src="${logoUrl}" style="height: 12px;">` : ''} ${teamName} - ${excText}
                    </span>
                </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center; padding-right: 12px;">
                <div class="data-num color-green" style="font-size: 12px; margin-right: 4px;">${formatCurrency(salary)}</div>
                <button onclick="editSimulatedSigning(${p.id})" style="background: transparent; border: none; color: var(--accent-blue); cursor: pointer; padding: 2px;" title="Modificar firma">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                </button>
            </div>
        `;
        list.appendChild(folded);
    });
};

// === ACCIONES SOBRE FIRMAS SIMULADAS ===

window.undoSimulatedSigning = function(playerId) {
    const p = livePlayers.find(pl => pl.id == playerId);
    if (!p || !p.simulatedSigned || !p.simTx) return;

    p.simulatedSigned = false;
    delete p.simTx;

    if (typeof renderSignedPlayersList === 'function') renderSignedPlayersList();
    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();

    if (isGlobalSimOpen && typeof renderGlobalSimTable === 'function') renderGlobalSimTable();
};

window.editSimulatedSigning = function(id) {
    const p = livePlayers.find(pl => pl.id === id);
    if (!p || !p.simTx) return;

    const oldSal  = p.simTx.salary;
    const oldExc  = p.simTx.exception;
    const oldTeam = p.simTx.team;

    undoSimulatedSigning(id);
    openGlobalSignModal(id, oldTeam);

    setTimeout(() => {
        const salaryInput     = document.getElementById('global-sim-salary-input');
        const exceptionSelect = document.getElementById('global-sim-exception-select');
        if (salaryInput)     { salaryInput.value = oldSal; salaryInput.dispatchEvent(new Event('input')); }
        if (exceptionSelect) { exceptionSelect.value = oldExc; exceptionSelect.dispatchEvent(new Event('change')); }
    }, 50);
};

window.updateSimEconomySummary = function() {
    const sumDiv = document.getElementById('sim-economy-summary');
    if (!sumDiv || !activeTeam) return;
    sumDiv.style.display = 'flex';

    const negOrMain = val => val < 0 ? 'var(--accent-red)' : 'var(--text-main)';
    const lsEl   = document.getElementById('sim-sum-ls');
    const presEl = document.getElementById('sim-sum-pres');
    const mleEl  = document.getElementById('sim-sum-mle');
    if (lsEl)   { lsEl.innerText   = formatCurrency(activeTeam.efectivo);       lsEl.style.color   = negOrMain(activeTeam.efectivo);       }
    if (presEl) { presEl.innerText = formatCurrency(activeTeam.budgetEfectivo); presEl.style.color = negOrMain(activeTeam.budgetEfectivo); }
    if (mleEl)  { mleEl.innerText  = formatCurrency(activeTeam.mle);            mleEl.style.color  = negOrMain(activeTeam.mle);            }
};

// === MODAL GLOBAL DE FIRMAS ===

window.closeGlobalSignModal = function() {
    document.getElementById('global-sign-modal').style.display = 'none';
    window.globalSimPlayer = null;
    window.globalSimTeam   = null;
};

function refreshGlobalSignModal(p) {
    document.getElementById('global-sim-info-min').innerText = formatCurrency(p.min);
    document.getElementById('global-sim-info-max').innerText = p.max > 0 ? formatCurrency(p.max) : 'N/A';
    document.getElementById('global-sim-salary-input').value = p.min;

    const roundBtn = document.getElementById('global-sim-round-btn');
    if (roundBtn) { roundBtn.innerText = 'R' + p.round; roundBtn.className = `round-badge round-${p.round}`; }
}

window.openGlobalSignModal = function(playerId, teamName) {
    const p = livePlayers.find(pl => pl.id === playerId);
    const t = allTeams.find(tm => tm.name === teamName);
    if (!p || !t) return;

    window.globalSimPlayer = p;
    window.globalSimTeam   = t;

    document.getElementById('global-sign-modal-title').innerText = `Firmar a ${p.name} con ${t.name}`;
    document.getElementById('global-sign-team-name').innerText   = t.name;
    document.getElementById('global-sim-player-photo').src       = getPlayerPhotoPath(p.name);
    document.getElementById('global-sim-info-ch').innerText      = formatCurrency(p.capHold);

    refreshGlobalSignModal(p);
    updateGlobalSimEconomySummary();
    renderGlobalSimCapHolds();
    checkGlobalSimCanSign();

    document.getElementById('global-sign-modal').style.display = 'flex';
};

window.updateGlobalSimEconomySummary = function() {
    const t = window.globalSimTeam;
    if (!t) return;

    const negOrMain = val => val < 0 ? 'var(--accent-red)' : 'var(--text-main)';
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) { el.innerText = formatCurrency(val); el.style.color = negOrMain(val); }
    };
    set('global-sim-sum-ls',   t.efectivo);
    set('global-sim-sum-pres', t.budgetEfectivo);
    set('global-sim-sum-mle',  t.mle);
};

window.renderGlobalSimCapHolds = function() {
    const t       = window.globalSimTeam;
    const content = document.getElementById('global-sign-ch-content');
    if (!t || !content) return;

    const myFAs = livePlayers.filter(p =>
        p.originTeam === t.name && p.capHold > 0 &&
        !(p.simulatedSigned && p.simTx && !p.simTx.isDelayed)
    );

    if (myFAs.length === 0) {
        content.innerHTML = `<p class="text-muted" style="font-style:italic; text-align:center;">No tiene jugadores con Cap Hold activo.</p>`;
        return;
    }

    let html = `<table class="modern-table" style="width: 100%;"><thead><tr>
        <th>Jugador</th><th>Pos</th><th class="data-num">Min / Max</th>
        <th class="data-num">Cap Hold</th><th style="text-align:center;">Mantener Derechos</th>
    </tr></thead><tbody>`;

    myFAs.forEach(fa => {
        const isChecked     = !fa.renounced ? 'checked' : '';
        const opacityStyle  = fa.renounced ? 'opacity: 0.5;' : (fa.simTx && fa.simTx.isDelayed ? 'opacity: 0.55; filter: grayscale(0.4);' : '');
        const capHoldDecor  = fa.renounced ? 'text-decoration: line-through;' : '';
        const fallbackUrl   = `https://ui-avatars.com/api/?name=${encodeURIComponent(fa.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;

        html += `<tr style="${opacityStyle}">
            <td><div style="display: flex; align-items: center;">
                <img src="${getPlayerPhotoPath(fa.name)}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${fa.name}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; object-fit: cover; background: var(--bg-surface);">
                <strong>${fa.name}</strong>
            </div></td>
            <td>${fa.pos}</td>
            <td class="data-num text-muted" style="font-size:11px;">${formatCurrency(fa.min)} - ${formatCurrency(fa.max)}</td>
            <td class="data-num color-red" style="${capHoldDecor}">-${formatCurrency(fa.capHold)}</td>
            <td style="text-align:center;">
                ${fa.simulatedSigned
                    ? `<span style="font-size:10px; font-weight:bold; color:${fa.simTx && fa.simTx.isDelayed ? 'var(--accent-orange)' : 'var(--accent-green)'};">${fa.simTx && fa.simTx.isDelayed ? 'POSPUESTO' : 'FIRMADO'}</span>`
                    : `<input type="checkbox" class="global-sim-ch-checkbox" data-id="${fa.id}" ${isChecked} onchange="simulateGlobalActiveEconomy(${fa.id}, '${t.name}', this.checked)" style="cursor:pointer; width:18px; height:18px;">`}
            </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    content.innerHTML = html;
};

window.simulateGlobalActiveEconomy = function(pId, teamName, checked) {
    const player = livePlayers.find(p => p.id === pId);
    if (player) { player.renounced = !checked; player.derechos = checked; }

    recalculateCapHolds();
    window.globalSimTeam = allTeams.find(tm => tm.name === teamName);

    updateGlobalSimEconomySummary();
    renderGlobalSimCapHolds();
    checkGlobalSimCanSign();
    renderTopEconomy();
    renderStudyTable();
};

window.checkGlobalSimCanSign = function() {
    const p         = window.globalSimPlayer;
    const t         = window.globalSimTeam;
    const btn       = document.getElementById('global-sim-sign-btn');
    const delayBtn  = document.getElementById('global-sim-delay-btn');
    const feedback  = document.getElementById('global-sim-feedback');
    const salaryInput = document.getElementById('global-sim-salary-input');
    const select    = document.getElementById('global-sim-exception-select');

    if (!p || !t || !btn) return;

    const salary    = parseFloat(salaryInput.value) || 0;
    const exception = select.value;

    btn.disabled           = true;
    btn.style.opacity      = '0.5';
    btn.style.cursor       = 'not-allowed';
    delayBtn.style.display = 'none';

    const isBoss = p.derechos && p.originTeam === t.name;

    if (t.numPlayers >= ROSTER_FULL && !isBoss)  { feedback.innerText = 'Roster Lleno (15 jugadores)'; return; }
    if (salary < p.min)                           { feedback.innerText = 'El salario ofrecido es menor a lo que pide el jugador.'; return; }
    if (p.max > 0 && salary > p.max)              { feedback.innerText = 'El salario ofrecido supera el máximo permitido para este jugador.'; return; }

    if (exception === 'cap') {
        if (salary > t.efectivo) { feedback.innerText = 'No hay suficiente Límite Salarial Efectivo.'; return; }
    } else if (exception === 'mle') {
        if (salary > t.mle) { feedback.innerText = 'No hay suficiente Excepción Media (MLE).'; return; }
    } else if (exception === 'bird') {
        if (!isBoss) { feedback.innerText = 'No tienes los derechos Bird/R de este jugador.'; return; }
        if (salary > t.budgetEfectivo) { feedback.innerText = 'No hay suficiente Presupuesto para renovarlo por esa cantidad.'; return; }
    } else if (exception === 'minimum') {
        if (salary > p.min) { feedback.innerText = 'El contrato mínimo debe ser por la cantidad mínima exigida.'; return; }
    }

    if (isBoss) delayBtn.style.display = 'block';
    feedback.innerText   = 'Oferta Válida.';
    feedback.style.color = 'var(--accent-green)';
    btn.disabled         = false;
    btn.style.opacity    = '1';
    btn.style.cursor     = 'pointer';
};

window.executeGlobalSign = function(isDelayed) {
    const p = window.globalSimPlayer;
    const t = window.globalSimTeam;
    if (!p || !t) return;

    const salary    = parseFloat(document.getElementById('global-sim-salary-input').value) || 0;
    const exception = document.getElementById('global-sim-exception-select').value;

    p.simulatedSigned = true;
    p.simTx = { team: t.name, salary, exception, isDelayed };

    recalculateCapHolds();
    renderTopEconomy();
    renderStudyTable();
    if (typeof renderSignedPlayersList === 'function') renderSignedPlayersList();
    if (typeof updateSimEconomySummary === 'function') updateSimEconomySummary();
    closeGlobalSignModal();
};

// === SELECTOR DE RONDA ===

function getRoundMultiplier(baseRound, currentRound) {
    let b = parseInt(baseRound), c = parseInt(currentRound);
    if (c === b) return 1.0;

    let multiplier = 1.0;
    if (c > b) {
        for (let i = b; i < c; i++) {
            if (i <= 2) multiplier *= 0.85;
            else        multiplier *= 0.90;
        }
    } else {
        for (let i = b; i > c; i--) {
            if (i <= 3) multiplier *= 1.15;
            else        multiplier *= 1.10;
        }
    }
    return multiplier;
}

window.changePlayerRound = function(id, newRound) {
    const p = livePlayers.find(pl => pl.id === id);
    if (!p) return;

    p.round          = newRound.toString();
    p.roundChangedAt = Date.now();
    const multiplier = getRoundMultiplier(p.baseRound, p.round);
    p.min = p.baseMin * multiplier;
    p.max = p.baseMax * multiplier;

    renderStudyTable();
    if (activePlayerId === id) selectStudyPlayer(id);
    if (window.globalSimPlayer && window.globalSimPlayer.id === id) {
        refreshGlobalSignModal(p);
        if (typeof checkGlobalSimCanSign === 'function') checkGlobalSimCanSign();
    }
};

window.openRoundSelector = function(id) {
    const p = livePlayers.find(pl => pl.id === id);
    if (!p) return;

    const overlay = document.createElement('div');
    overlay.id = 'round-selector-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)',
        zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center'
    });

    let optionsHTML = '';
    for (let i = 1; i <= 7; i++) {
        const isCurrent = p.round == i;
        optionsHTML += `<button onclick="closeRoundSelector(); changePlayerRound(${id}, ${i})" style="width: 100%; padding: 10px; margin-bottom: 5px; background: ${isCurrent ? 'var(--accent-blue)' : 'var(--bg-panel)'}; color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 6px; cursor: pointer; font-weight: ${isCurrent ? 'bold' : 'normal'};">Ronda ${i}</button>`;
    }

    overlay.innerHTML = `
        <div style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-subtle); width: 250px; text-align: center;">
            <h3 style="margin-top:0; margin-bottom: 5px;">Mover de Ronda</h3>
            <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 15px;"><strong>${p.name}</strong></p>
            ${optionsHTML}
            <button onclick="closeRoundSelector()" style="margin-top: 10px; padding: 6px 12px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; text-decoration: underline;">Cancelar</button>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.closeRoundSelector = function() {
    const overlay = document.getElementById('round-selector-overlay');
    if (overlay) overlay.remove();
};

// === LISTENERS DEL MODAL GLOBAL ===

document.addEventListener('DOMContentLoaded', () => {
    const salaryInput = document.getElementById('global-sim-salary-input');
    const select      = document.getElementById('global-sim-exception-select');
    if (salaryInput) salaryInput.addEventListener('input',  checkGlobalSimCanSign);
    if (select)      select.addEventListener('change', checkGlobalSimCanSign);
});
