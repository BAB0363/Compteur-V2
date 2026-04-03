/* ==========================================
   Variables pour le Dark Mode
   ========================================== */
:root {
    --bg-color: #f4f7f6;
    --text-color: #333;
    --card-bg: white;
    --btn-bg: #bdc3c7;
    --btn-text: #2c3e50;
    --border-color: #eee;
    --shadow: rgba(0,0,0,0.1);
}

body.dark-mode { --bg-color: #1e272e; --text-color: #d2dae2; --card-bg: #2f3640; --btn-bg: #485460; --btn-text: #d2dae2; --border-color: #576574; --shadow: rgba(0,0,0,0.5); }

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: var(--bg-color); color: var(--text-color);
    margin: 0; padding: 10px; box-sizing: border-box;
    transition: background-color 0.5s ease, color 0.5s ease;
}

/* ==========================================
   Effets Visuels au Clic
   ========================================== */
.click-particle {
    position: fixed; pointer-events: none;
    font-size: 1.5em; font-weight: bold; z-index: 9999;
    animation: popOut 0.6s ease-out forwards;
}
@keyframes popOut {
    0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
    50% { transform: translate(-50%, -100px) scale(1.5); opacity: 0.8; }
    100% { transform: translate(-50%, -150px) scale(1); opacity: 0; }
}

.top-bar-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 5px; }
.top-bar-controls button { padding: 8px 15px; border-radius: 20px; font-size: 0.9em; background-color: var(--card-bg); color: var(--text-color); border: 1px solid var(--border-color); box-shadow: 0 1px 2px var(--shadow); cursor: pointer; }

.main-tabs { display: flex; gap: 4px; margin-bottom: 15px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.main-tabs::-webkit-scrollbar { display: none; }
.main-tabs button { flex: 1; min-width: 75px; padding: 10px 2px; font-size: 0.9em; background-color: var(--btn-bg); color: var(--btn-text); border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; white-space: nowrap;}
.main-tabs button.active { background-color: #34495e; color: white; }
#tab-dashboard.active { background-color: #e67e22; color: white; }
#tab-settings.active { background-color: #7f8c8d; color: white; }

.header-dashboard { background: var(--card-bg); padding: 10px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 1px 3px var(--shadow); transition: 0.3s; }
.top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: bold; font-size: 1.1em; }
.chrono-container { display: flex; align-items: center; gap: 5px; }
.chrono-data { display: flex; flex-direction: column; line-height: 1.2; margin-right: 5px; }
.chrono-time { font-size: 0.95em; }
.chrono-dist { font-size: 0.8em; color: #7f8c8d; font-weight: normal; }
.btn-chrono { background-color: #27ae60; color: white; border: none; padding: 5px 8px; border-radius: 4px; font-size: 0.85em; cursor: pointer; font-weight: bold; }
.btn-chrono.running { background-color: #f39c12; }
.btn-chrono-reset { background-color: #e74c3c; color: white; border: none; padding: 5px 8px; border-radius: 4px; font-size: 0.85em; cursor: pointer; font-weight: bold; }
.btn-stats-toggle { background-color: #8e44ad; color: white; padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.9em; transition: background-color 0.2s; cursor: pointer;}
.btn-stats-toggle.active { background-color: #e67e22; }

.totals-row { text-align: center; font-size: 1.1em; margin-bottom: 8px; font-weight: bold; }
.proportion-bar { display: flex; height: 22px; border-radius: 11px; overflow: hidden; background: #7f8c8d; font-size: 0.7em; color: white; line-height: 22px; font-weight: bold; text-align: center; }

#bar-fr, #bar-etr, #bar-voitures, #bar-camions, #bar-utilitaires, #bar-engins, #bar-bus, #bar-camping, #bar-motos, #bar-velos { transition: width 0.3s; overflow: hidden; width: 0%; }
#bar-fr, #bar-voitures { background-color: #3498db; }
#bar-etr, #bar-camions { background-color: #e67e22; }
#bar-utilitaires { background-color: #1abc9c; }
#bar-engins { background-color: #27ae60; }
#bar-bus { background-color: #f1c40f; color: #333; }
#bar-camping { background-color: #d35400; }
#bar-motos { background-color: #9b59b6; }
#bar-velos { background-color: #e74c3c; }

.status-row { display: flex; justify-content: space-between; font-size: 0.75em; color: #7f8c8d; margin-bottom: 10px; background: var(--card-bg); padding: 5px 10px; border-radius: 5px; box-shadow: 0 1px 2px var(--shadow);}
#truck-container, #car-container { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
.brand-card, .vehicle-card { background: var(--card-bg); padding: 8px; border-radius: 6px; box-shadow: 0 1px 2px var(--shadow); display: flex; flex-direction: column; justify-content: space-between; transition: 0.3s;}
.brand-name, .vehicle-name { text-align: center; font-weight: bold; margin-bottom: 8px; font-size: 1.05em; color: var(--text-color);}
.counter-section, .vehicle-controls { display: flex; align-items: center; justify-content: space-between; background-color: var(--bg-color); padding: 5px; border-radius: 6px; margin-bottom: 4px;}
.flag { font-size: 1.2em; }
.score, .vehicle-score { font-size: 1.3em; font-weight: bold; width: 30px; text-align: center; }
button { border: none; border-radius: 4px; cursor: pointer; font-weight: bold; transition: transform 0.1s; }
button:active { transform: scale(0.95); }
.btn-add, .btn-corr { width: 40px; height: 35px; font-size: 1.2em; display: flex; align-items: center; justify-content: center; color: white; }
.btn-add-fr { background-color: #3498db; }
.btn-add-etr { background-color: #e67e22; }
.btn-corr { background-color: #e74c3c; font-size: 1em; }
.actions-container { display: flex; justify-content: space-between; padding-bottom: 10px; gap: 5px; flex-wrap: wrap; }
.share-btn, .reset-btn { padding: 10px 5px; font-size: 0.9em; color: white; border-radius: 6px; flex: 1; min-width: 30%; cursor: pointer;}
.share-btn { background-color: #3498db; }
.reset-btn { background-color: #c0392b; }
#truck-stats-view, #car-stats-view { background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px var(--shadow); }
.btn-return-large { width: 100%; padding: 12px; background-color: #34495e; color: white; border-radius: 6px; font-size: 1em; margin-bottom: 15px; cursor: pointer;}
.history-list { max-height: 250px; overflow-y: auto; margin-bottom: 15px; }
.history-item { font-size: 0.85em; border-bottom: 1px solid var(--border-color); padding: 8px 0; display: flex; flex-direction: column; gap: 4px; transition: background-color 0.2s; }
.history-item.clickable:active { background-color: var(--bg-color); }
.history-item-header { display: flex; justify-content: space-between; align-items: center; gap: 4px; width: 100%;}
.history-meta { color: #7f8c8d; font-size: 0.9em; }
.btn-del-history { background-color: transparent; color: #e74c3c; font-size: 1.2em; border: none; padding: 5px; margin-left: 10px; cursor: pointer; }
.mini-map { height: 250px; width: 100%; border-radius: 8px; margin-bottom: 15px; background-color: #ccc; z-index: 1;}

#toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 10px;}
.toast { background-color: #f1c40f; color: #2c3e50; padding: 10px 20px; border-radius: 20px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.2); animation: slideDown 0.3s ease-out forwards, fadeOut 0.5s ease-in 2.5s forwards; opacity: 0;}
@keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes fadeOut { to { opacity: 0; visibility: hidden; } }

.km-stats-container { background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px var(--shadow); }
.km-stats-container h4 { margin-top: 0; margin-bottom: 10px; color: var(--text-color); border-bottom: 2px solid var(--border-color); padding-bottom: 5px; }
.km-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; }
.km-stat-card { background: var(--bg-color); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border-color); }
.km-stat-title { font-size: 0.85em; color: #7f8c8d; font-weight: bold; display: block; margin-bottom: 5px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.km-stat-value { font-size: 1.2em; font-weight: bold; color: #2980b9; }

.session-detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--border-color); }
.session-detail-row:last-child { border-bottom: none; }
.session-detail-label { font-weight: bold; color: #7f8c8d; }
.session-detail-value { font-weight: bold; color: var(--text-color); text-align: right; }

/* Nouveaux styles pour les graphiques avancés */
.chart-wrapper { position: relative; height: 200px; width: 100%; margin-bottom: 15px; }
.sequence-item { display: flex; justify-content: space-between; background: var(--bg-color); padding: 8px; border-radius: 6px; margin-bottom: 5px; border: 1px solid var(--border-color); }
.sequence-flow { font-weight: bold; color: var(--text-color); }
.sequence-count { background: #34495e; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
