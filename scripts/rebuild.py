with open('roster.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re
# Grab the headers up to main-layout
end_header = html.find('<!-- PANEL JUGADORES -->')
header_html = html[:end_header]

# Construct the new 2-col structure
new_structure = '''
        <div class="two-col-layout">
            
            <div class="left-col-wrapper">
                <!-- PANEL JUGADORES -->
                <div class="panel players-panel">
                    <div class="panel-header">
                        <h2>ROSTER</h2>
                    </div>
                    <div class="panel-content">
                        <div class="table-container">
                            <table class="data-table" id="roster-table">
                                <thead>
                                    <tr>
                                        <th style="text-align:left;">Jugador</th>
                                        <th class="text-center">Pos</th>
                                        <th class="text-center">Rat</th>
                                        <th class="text-center">Edad</th>
                                        <th class="text-center">Bird</th>
                                        <th class="text-center">R</th>
                                        <th class="text-right">26/27</th>
                                        <th class="text-right">27/28</th>
                                        <th class="text-right">28/29</th>
                                        <th class="text-right">29/30</th>
                                        <th class="text-right">30/31</th>
                                    </tr>
                                </thead>
                                <tbody id="roster-body">
                                    <!-- JS will populate -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="right-col-stack">
                <!-- PANEL ECONOMIA -->
                <div class="panel economy-panel">
                    <div class="panel-header">
                        <h2>ECONOMÍA</h2>
                    </div>
                    <div class="panel-content">
                        <table class="data-table" id="economy-table">
                            <thead>
                                <tr>
                                    <th>Concepto</th>
                                    <th class="text-right">Cantidad ($)</th>
                                </tr>
                            </thead>
                            <tbody id="economy-body">
                                <!-- JS will populate -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PANEL RONDAS -->
                <div class="panel draft-panel">
                    <div class="panel-header">
                        <h2>Rondas del Draft</h2>
                    </div>
                    <div class="panel-content">
                        <table class="data-table" id="draft-table">
                            <thead>
                                <tr>
                                    <th class="text-center">Año</th>
                                    <th class="text-center">Ronda</th>
                                    <th>Equipo Original</th>
                                </tr>
                            </thead>
                            <tbody id="draft-body">
                                <!-- JS will populate -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>

    </div>

    <script src="roster.js"></script>
</body>
</html>
'''

with open('roster.html', 'w', encoding='utf-8') as f:
    f.write(header_html + new_structure)

print('Updated roster.html')
