const fs = require('fs');
let content = fs.readFileSync('H:/Mi unidad/2kOFFICE/app.js', 'utf8');

content = content.replace(/livePlayers\.forEach\(p => \{\r?\n        let tr = document\.createElement\('tr'\);/g, 
  'livePlayers.forEach(p => {\n        if (activeTeam && p.simulatedSigned && p.simTx && p.simTx.team === activeTeam.name) return;\n        let tr = document.createElement(\'tr\');');

const startStr = 'window.renderSignedPlayersList = function() {';
const startIndex = content.indexOf(startStr);
if (startIndex !== -1) {
    content = content.substring(0, startIndex);
}

const newFunc = `window.renderSignedPlayersList = function() {
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
            : \`https://ui-avatars.com/api/?name=\${encodeURIComponent(p.name)}&background=1f2937&color=f3f4f6&rounded=true&size=32\`;
            
        let excText = isDelayed ? 'Firma Retrasada' : '';
        if (!isDelayed) {
            if (exception === 'cap') excText = 'Cap Space';
            else if (exception === 'mle') excText = 'MLE';
            else if (exception === 'minimum') excText = 'Mínimo';
            else if (exception === 'bird') excText = 'Bird/R';
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
        
        folded.id = \`sim-folded-\${p.id}\`;
        folded.innerHTML = \`
            <button onclick="undoSimulatedSigning(\${p.id})" style="position: absolute; top: 4px; right: 4px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; line-height: 1;" title="Deshacer firma">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="\${photoUrl}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="font-size: 12px; color: var(--text-main); line-height: 1.1;">\${p.name}</strong>
                    <span class="text-muted text-xsmall" style="font-size: 10px;">\${excText}</span>
                </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
                <div class="data-num color-green" style="font-size: 11px; margin-right: 16px;">\${formatCurrency(salary)}</div>
                <button onclick="editSimulatedSigning(\${p.id})" style="background: transparent; border: none; color: var(--accent-blue); cursor: pointer; padding: 2px; margin-right: 12px;" title="Modificar firma">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                    </svg>
                </button>
            </div>
        \`;
        list.appendChild(folded);
    });
}
`;

content += newFunc;

fs.writeFileSync('H:/Mi unidad/2kOFFICE/app.js', content, 'utf8');