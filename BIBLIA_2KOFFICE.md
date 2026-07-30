# 2K OFFICE — La Biblia del Proyecto (Documentación Técnica 2.0)

Este documento es el **análisis profundo y actualizado** de 2K OFFICE. Sirve como mapa arquitectónico y manual de referencia para entender el código al 100% antes de realizar cualquier modificación, garantizando que el proyecto sea sostenible y escalable en el futuro.

---

## 🧭 1. Visión General y Arquitectura
**2K OFFICE** es un simulador de gestión de franquicias de la NBA (estilo Pro-GM). 
Es una **Single Page Application distribuida** construida íntegramente con HTML, CSS, y Vanilla JavaScript (ES6 Modules). 
No utiliza frameworks (React/Vue) ni bases de datos tradicionales (SQL/Mongo). Todo su estado y persistencia reside en archivos **CSV locales** que actúan como "Base de Datos", los cuales son leídos en tiempo real por el navegador usando **PapaParse**.

> [!IMPORTANT]
> **Entorno Requerido:** Dado que el navegador bloquea la lectura de archivos locales vía `fetch()` por CORS, la aplicación **debe** ejecutarse usando un servidor local (ej. Live Server de VS Code). 

---

## 🗂️ 2. Estructura de Directorios (Refactorizada)

La arquitectura ha sido recientemente modernizada para usar Módulos ES6 y evitar dependencias globales espagueti.

```text
2kOFFICE/
├── 📄 *.html                 (Archivos de Vistas UI)
│   ├── index.html            (Menú principal / Hub)
│   ├── fa.html               (Agencia Libre - Módulo de firmas)
│   ├── simulador.html        (Simulador Global - Vista extendida de FA)
│   ├── trade.html            (Trade Machine - Simulador de traspasos)
│   ├── jugadores.html        (Explorador/Buscador avanzado)
│   └── equipos.html / roster.html (Visualización de plantillas)
│
├── 📂 data/                  (La "Base de Datos" del proyecto)
│   ├── players.csv           (Info de jugadores, ratings, contratos, cap holds)
│   ├── economia.csv          (Info financiera de los 30 equipos)
│   └── draft_picks.csv       (Derechos de rondas de draft)
│
├── 📂 js/                    (Lógica de Negocio y Controladores)
│   ├── app.js                (Controlador de fa.html)
│   ├── simulador.js          (Controlador de simulador.html)
│   ├── trade.js              (Controlador de trade.html)
│   ├── ui.js / simulador_ui.js (Handlers de modales y botones de la UI)
│   │
│   └── 📂 shared/            (Módulos CORE importables reutilizables)
│       ├── constants.js      (Fuente única de verdad: URLs, FA_TEAM_ID, reglas NBA)
│       ├── utils.js          (Funciones matemáticas, parseo de moneda, fotos)
│       ├── csv_service.js    (Singleton que maneja la caché y promesas de PapaParse)
│       ├── engine.js         (Motor económico y mapeador de CSV a Objetos)
│       └── admin_auth.js     (Herramientas de escritura/guardado de CSV)
│
├── 📂 css/                   (Hojas de estilo - Dark Analytics UI Premium)
├── 📂 assets/ / logos/       (Recursos gráficos y logos SVG/PNG)
└── 📂 _tools_y_scrapers/     (Scripts Python/BAT para web scraping y limpieza de datos)
```

---

## 📊 3. Modelo de Datos (Los CSV)

### `players.csv` (Tabla de Jugadores)
Posee los datos de ~700 jugadores. Es la fuente de la verdad para contratos.
- **Identificación:** `Player` (nombre), `Rating` (media 2k), `Position`, `FechaNacimiento`.
- **Economía:** `Minimum` (Salario Min), `Maximum` (Salario Max), `caphold` (Dinero retenido).
- **Contratos:** `t1` a `t6` (Salarios por año). `o1` a `o6` (Opciones de equipo/jugador).
- **Derechos:** `Bird` (años en el equipo, >=3 da derechos plenos), `FA` ("R" = Restringido).
- **Relación con Equipo:** `team_id`. Un jugador pertenece a un equipo si su `team_id` coincide con el índice del equipo en `economia.csv` y tiene `t1 > 0`. Si `t1 == 0` o `team_id == 31`, es Agente Libre.

### `economia.csv` (Tabla de Equipos)
Posee el estado financiero de las 30 franquicias. El orden de las filas (índice 1 a 30) define el `team_id` implícito.
- `Equipo`: Nombre completo.
- `Disponible limite salarial`: Espacio salarial base.
- `Disponible presupuesto`: Dinero total.
- `Disponible MLE`: Mid-Level Exception disponible.
- `Caphold retenido` y `Efectivo LS`: Cálculos pre-guardados (aunque el motor JS los recalcula en vivo).

---

## ⚙️ 4. El Motor JS (Flujo de Ejecución)

Al abrir `fa.html` o `simulador.html`, el flujo de carga es el siguiente:

1. **Importación de Módulos:** `app.js` importa constantes y el `CSVService`.
2. **Carga Síncrona de Datos:** Se lanza un `Promise.all` a `CSVService.getPlayers()` y `getEconomy()`. El `CSVService` hace `fetch` a la carpeta `data/`, usa `PapaParse` y almacena los resultados en una caché local (`_caches`).
3. **Mapeo (El "ORM"):**
   - Se pasa el CSV crudo a `mapCsvToTeam` y `mapCsvToPlayer` (ubicados en `engine.js`).
   - Se asigna un `team_id` real a cada equipo.
   - Se procesa cada jugador aplicando las **Normas FA** (Rondas 1 a 5 según Rating, descuentos de veteranos, degradados automáticos, etc.).
4. **Almacenamiento Global:** Los datos normalizados se guardan en `window.dbEquipos_Base` y `window.dbJugadores_Base`.
5. **Clonación de Estado:** Se copian las bases a `window.allTeams` y `window.livePlayers`. **Esto es crucial**: la app modifica la copia (`livePlayers`) para simular firmas, pero siempre puede volver a la base (`dbJugadores_Base`) mediante `resetSimulation()`.
6. **Recálculo Económico:** Se ejecuta `recalculateCapHolds()`, que calcula al vuelo cuánto Cap Space tiene realmente cada equipo restando los Cap Holds activos.

---

## 🧮 5. Cálculos y Lógicas Fundamentales

### A. Lógica de "Rondas" de FA
Para dar realismo al mercado, los jugadores piden contratos menores conforme avanzan las rondas.
Ubicado en `engine.js` -> `mapCsvToPlayer`:
1. **Ronda Base:** `R1` (Rating >= 85), `R2` (>= 82), `R3` (>= 80), `R4` (>= 75), `R5` (< 75).
2. **Overrides Manuales:** Se leen variables de `constants.js` (`RANGE_R3_START`, `FIXED_ROUND4_PLAYERS`) para alterar la ronda de jugadores específicos ignorando su rating.
3. **Decay (Degradado):** A medida que pasan las rondas, los salarios Mínimos y Máximos solicitados se reducen (multiplicadores `0.85`, `0.90`).

### B. El Motor Financiero (`recalculateCapHolds`)
Es la función más compleja (en `app.js` y `simulador.js`).
- `Efectivo = Limite Salarial Base - Suma de Cap Holds`
- `Freespot Bonus`: Por cada hueco libre en la plantilla hasta llegar a 14 jugadores (threshold), el sistema inyecta **$1.8M** al Cap Space del equipo simulando el salario mínimo virtual que la liga descuenta de base.
- Si un usuario simula firmar a un jugador, la función descuenta el salario de:
  - `Cap` (Si usa excepción LS)
  - `MLE` (Si usa excepción MLE)
  - `Presupuesto` (Siempre)

### C. Trade Machine (`trade.js`)
El validador de traspasos sigue fielmente las matemáticas de la NBA (CBA):
- Si el equipo receptor **tiene Cap Space** suficiente para absorber los contratos, el trade es válido.
- Si está por encima del Cap, debe cumplir reglas de igualación salarial (`applyEconomyDelta`):
  - Salario Saliente <= $6.5M ➡️ Puede recibir hasta `175% + $250k`.
  - Salario Saliente <= $19.5M ➡️ Puede recibir hasta `Salario + $5M`.
  - Salario Saliente > $19.5M ➡️ Puede recibir hasta `125% + $250k`.

---

## 🛠️ 6. Notas de Mantenimiento y Quirks

1. **Variables Globales en Módulos:** Aunque el proyecto usa módulos ES6, las funciones de UI (`renderLogoGrid`, `updateActiveTeamUI`, etc.) en `engine.js` se asignan al objeto `window` (`window.renderLogoGrid = ...`) para que puedan ser invocadas directamente por eventos `onclick` en el HTML.
2. **Sensibilidad del CSV:** El `team_id` de los jugadores **depende del orden** de las filas en `economia.csv`. Nunca se debe cambiar el orden alfabético de los equipos en `economia.csv` sin actualizar masivamente los `team_id` en `players.csv`.
3. **Manejo de Errores Silencioso:** Dado que son módulos, olvidar importar una función de `utils.js` (como `formatCurrency`) provocará un error de "ReferenceError" que colapsará la renderización de la promesa sin aviso claro en la UI. Siempre hay que verificar los `import { ... }` en la cabecera.
4. **Backend (Persistencia Real):** El frontend es estático, pero cuenta con `admin_auth.js` que en teoría puede lanzar peticiones a un backend local (o script python) para sobreescribir los archivos en `data/` y hacer las firmas permanentes.

---

> [!TIP]
> **Resumen para el Desarrollador:** Si necesitas cambiar un color, está en CSS. Si necesitas cambiar cuánto dinero pide un jugador o sus Rondas, edita `js/shared/constants.js`. Si vas a modificar el cálculo de Límite Salarial, edita `recalculateCapHolds` en `app.js/simulador.js`. Si vas a hacer validaciones de la NBA, ve a `trade.js`.
