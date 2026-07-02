let playersData = [];
let teamsData = [];
let currentSort = { column: 'rating', asc: false };

async function init() {
    try {
        const [playersRes, ecoRes] = await Promise.all([
            fetch('players.csv'),
            fetch('economia.csv')
        ]);
        const playersText = await playersRes.text();
        const ecoText = await ecoRes.text();
        
        const delimiterEco = ecoText.split('\n')[0].includes(';') ? ';' : ',';
        const delimiterPlayers = playersText.split('\n')[0].includes(';') ? ';' : ',';
        
        const parsedEco = Papa.parse(ecoText, { header: true, skipEmptyLines: true, delimiter: delimiterEco }).data;
        
        // Parse teams
        parsedEco.forEach((teamRow, idx) => {
            let teamName = teamRow["Equipo"] || teamRow["Team"] || "Equipo " + (idx+1);
            teamName = teamName.replace(/['"]/g, '');
            teamsData.push({
                id: (idx + 1).toString(),
                name: teamName
            });
        });
        
        // Populate team filter
        const teamFilter = document.getElementById('filter-team');
        teamsData.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            teamFilter.appendChild(opt);
        });

        // Parse players
        const parsedPlayers = Papa.parse(playersText, { header: true, skipEmptyLines: true, delimiter: delimiterPlayers }).data;
        parsedPlayers.forEach((p, idx) => {
            const isFA = !p.team_id || p.team_id.trim() === '' || p.team_id === '0' || (parseFloat(p.t1) || 0) === 0;
            const teamObj = teamsData.find(t => t.id === p.team_id);
            const teamName = isFA ? 'FA' : (teamObj ? teamObj.name : '-');
            
            // Keep all players for the players section, unlike trade which filters out FAs
            playersData.push({
                uid: 'p' + idx,
                name: p.Player,
                teamId: p.team_id,
                teamName: teamName,
                salary: parseFloat(p.t1) || 0,
                pos: p.Position || '-',
                rating: parseInt(p.Rating) || 0,
                t1: p.t1 || 0, o1: p.o1 || '',
                t2: p.t2 || 0, o2: p.o2 || '',
                t3: p.t3 || 0, o3: p.o3 || '',
                t4: p.t4 || 0, o4: p.o4 || '',
                t5: p.t5 || 0, o5: p.o5 || '',
                age: calculateAge(p.FechaNacimiento),
                bird: p.Bird || '-',
                r: p.FA && p.FA.toUpperCase() === 'R' ? 'R' : '',
                isFA: isFA
            });
        });

        setupFilters();
        applyFiltersAndRender();
        
        document.getElementById('loader').style.display = 'none';
    } catch(err) {
        alert("Error cargando los CSV. Asegúrate de ejecutar esto en un servidor local (Live Server).");
        document.getElementById('loader').style.display = 'none';
    }
}

function setupFilters() {
    const inputs = document.querySelectorAll('.players-sidebar input, .players-sidebar select');
    inputs.forEach(input => {
        input.addEventListener('input', applyFiltersAndRender);
        input.addEventListener('change', applyFiltersAndRender);
    });
}

let selectedYear = 0;
window.selectYear = function(year) {
    if (selectedYear === year) {
        selectedYear = 0;
        document.getElementById('year-' + year).classList.remove('active');
    } else {
        selectedYear = year;
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById('year-' + i);
            if (btn) btn.classList.remove('active');
        }
        document.getElementById('year-' + year).classList.add('active');
    }
    applyFiltersAndRender();
}

function resetFilters() {
    const inputs = document.querySelectorAll('.players-sidebar input[type="text"], .players-sidebar input[type="number"]');
    inputs.forEach(input => input.value = '');
    const selects = document.querySelectorAll('.players-sidebar select');
    selects.forEach(select => select.value = '');
    
    // Reset slider
    const salarySlider = document.getElementById('filter-salary');
    if (salarySlider) {
        salarySlider.value = 70;
        document.getElementById('salary-val').textContent = '70';
    }
    
    // Reset years
    selectedYear = 0;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById('year-' + i);
        if (btn) btn.classList.remove('active');
    }
    
    applyFiltersAndRender();
}

function sortBy(col) {
    if (currentSort.column === col) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.column = col;
        currentSort.asc = false; // Por defecto descendente la primera vez que se hace clic
    }
    applyFiltersAndRender();
}

function getContractYears(p) {
    let years = 0;
    if (parseFloat(p.t1) > 0) years++;
    if (parseFloat(p.t2) > 0) years++;
    if (parseFloat(p.t3) > 0) years++;
    if (parseFloat(p.t4) > 0) years++;
    if (parseFloat(p.t5) > 0) years++;
    return years;
}

function applyFiltersAndRender() {
    const nameFilter = document.getElementById('filter-name').value.toLowerCase();
    const teamFilter = document.getElementById('filter-team').value;
    const posFilter = document.getElementById('filter-pos').value;
    
    const ratingMin = parseInt(document.getElementById('filter-rating-min').value);
    const ratingMax = parseInt(document.getElementById('filter-rating-max').value);
    
    const ageMin = parseInt(document.getElementById('filter-age-min').value);
    const ageMax = parseInt(document.getElementById('filter-age-max').value);
    
    const salaryMax = parseFloat(document.getElementById('filter-salary').value) * 1000000;
    
    const yearsFilter = selectedYear;

    let filtered = playersData.filter(p => {
        if (nameFilter && !p.name.toLowerCase().includes(nameFilter)) return false;
        
        if (teamFilter === 'FA') {
            if (!p.isFA) return false;
        } else if (teamFilter) {
            if (p.teamId !== teamFilter) return false;
        }
        
        if (posFilter && !p.pos.includes(posFilter)) return false;
        
        if (!isNaN(ratingMin) && p.rating < ratingMin) return false;
        if (!isNaN(ratingMax) && p.rating > ratingMax) return false;
        
        if (!isNaN(ageMin) && p.age < ageMin) return false;
        if (!isNaN(ageMax) && p.age > ageMax) return false;
        
        // As it's a single slider from 3 to 70 for Max Salary
        if (p.salary > salaryMax) return false;
        
        if (yearsFilter > 0 && getContractYears(p) !== yearsFilter) return false;
        
        return true;
    });

    // Ordenar
    filtered.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];
        
        if (currentSort.column === 't1' || currentSort.column === 't2' || currentSort.column === 't3' || currentSort.column === 't4' || currentSort.column === 't5') {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return currentSort.asc ? valA - valB : valB - valA;
        }
    });

    document.getElementById('players-count').textContent = filtered.length;

    const tbody = document.getElementById('players-tbody');
    const noResults = document.getElementById('no-results');
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }
    
    noResults.style.display = 'none';
    
    let html = '';
    filtered.forEach(p => {
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32`;
        const photoPath = typeof getPlayerPhotoPath === 'function' ? getPlayerPhotoPath(p.name) : fallbackUrl;
        const url2k = typeof generate2kRatingUrl === 'function' ? generate2kRatingUrl(p.name) : '#';
        
        html += `
            <tr>
                <td data-label="Jugador" style="text-align:left; display: flex; align-items: center; gap: 10px;">
                    <img src="${photoPath}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${p.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--bg-surface);">
                    <a href="${url2k}" target="_blank" style="color: inherit; text-decoration: none; font-weight: 600;" title="Ver en 2kratings">
                        ${p.name}
                    </a>
                </td>
                <td data-label="Equipo">${p.teamName}</td>
                <td data-label="Pos">${p.pos}</td>
                <td data-label="Media"><div style="background: var(--bg-panel); color: var(--accent-orange); font-size: 11px; font-weight: bold; border: 1px solid var(--border-subtle); border-radius: 4px; display: inline-block; padding: 2px 6px;">${p.rating}</div></td>
                <td data-label="Edad">${p.age}</td>
                <td data-label="Bird" class="${parseInt(p.bird) >= 3 ? 'bg-bird' : ''}">${p.bird !== '0' && p.bird !== '' ? p.bird : '-'}</td>
                <td data-label="R" class="${p.r === 'R' ? 'bg-r' : ''}">${p.r}</td>
                <td data-label="T1" class="${typeof getOptClass === 'function' ? getOptClass(p.o1) : ''}">${typeof formatCurrencyOpt === 'function' ? formatCurrencyOpt(p.t1) : p.t1}</td>
                <td data-label="T2" class="${typeof getOptClass === 'function' ? getOptClass(p.o2) : ''}">${typeof formatCurrencyOpt === 'function' ? formatCurrencyOpt(p.t2) : p.t2}</td>
                <td data-label="T3" class="${typeof getOptClass === 'function' ? getOptClass(p.o3) : ''}">${typeof formatCurrencyOpt === 'function' ? formatCurrencyOpt(p.t3) : p.t3}</td>
                <td data-label="T4" class="${typeof getOptClass === 'function' ? getOptClass(p.o4) : ''}">${typeof formatCurrencyOpt === 'function' ? formatCurrencyOpt(p.t4) : p.t4}</td>
                <td data-label="T5" class="${typeof getOptClass === 'function' ? getOptClass(p.o5) : ''}">${typeof formatCurrencyOpt === 'function' ? formatCurrencyOpt(p.t5) : p.t5}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Start application
window.addEventListener('DOMContentLoaded', init);
