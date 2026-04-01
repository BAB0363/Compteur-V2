// jsapp.js
import { ui } from './jsui.js';
import { gps } from './jsgps.js';
import { speech } from './jsspeech.js';

window.ui = ui; window.gps = gps; window.speech = speech;

const app = {
    brands: ["Renault Trucks", "Mercedes-Benz", "Volvo Trucks", "Scania", "DAF", "MAN", "Iveco", "Ford Trucks"],
    vehicleTypes: ["Voitures", "Camions", "Tracteurs", "Motos"],
    
    truckCounters: {}, vehicleCounters: {},
    truckHistory: [], carHistory: [],
    truckSeconds: parseInt(localStorage.getItem('truckChronoSec')) || 0,
    carSeconds: parseInt(localStorage.getItem('carChronoSec')) || 0,
    isTruckRunning: localStorage.getItem('truckChronoRun') === 'true',
    isCarRunning: localStorage.getItem('carChronoRun') === 'true',
    truckInterval: null, carInterval: null,
    liveTruckDistance: parseFloat(localStorage.getItem('liveTruckDist')) || 0,
    liveCarDistance: parseFloat(localStorage.getItem('liveCarDist')) || 0,
    wakeLock: null, 

    init() {
        try { this.truckCounters = JSON.parse(localStorage.getItem('truckCounters')) || {}; } catch(e) { this.truckCounters = {}; }
        try { this.vehicleCounters = JSON.parse(localStorage.getItem('vehicleCounters')) || {}; } catch(e) { this.vehicleCounters = {}; }
        try { this.truckHistory = JSON.parse(localStorage.getItem('truckHistory')) || []; } catch(e) { this.truckHistory = []; }
        try { this.carHistory = JSON.parse(localStorage.getItem('carHistory')) || []; } catch(e) { this.carHistory = []; }
        
        if(Object.keys(this.truckCounters).length === 0) this.brands.forEach(b => this.truckCounters[b] = { fr: 0, etr: 0 });
        if(Object.keys(this.vehicleCounters).length === 0) this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0);

        if (this.isTruckRunning) { this.isTruckRunning = false; this.toggleTruckChrono(); } else this.updateTruckChronoDisp();
        if (this.isCarRunning) { this.isCarRunning = false; this.toggleCarChrono(); } else this.updateCarChronoDisp();
        
        this.renderTrucks();
        this.renderCars();
        this.renderKmStats();

        this.requestWakeLock();
        document.addEventListener('visibilitychange', async () => {
            if (this.wakeLock !== null && document.visibilityState === 'visible') this.requestWakeLock();
        });
    },

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                let wls = document.getElementById('wake-lock-status');
                if(wls) wls.innerText = "☀️ Écran OK";
            }
        } catch (e) {
            console.warn("Wake Lock refusé", e);
        }
    },

    formatTime(totalSec) {
        let h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
        let m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
        let s = (totalSec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    },

    updateTruckChronoDisp() { 
        let elTime = document.getElementById('truck-chrono'), elDist = document.getElementById('truck-dist');
        if(elTime) elTime.innerText = `⏱️ ${this.formatTime(this.truckSeconds)}`; 
        if(elDist) elDist.innerText = `📍 ${this.liveTruckDistance.toFixed(2)} km`; 
    },
    updateCarChronoDisp() { 
        let cc = document.getElementById('car-chrono'), cd = document.getElementById('car-dist');
        if(cc) cc.innerText = `⏱️ ${this.formatTime(this.carSeconds)}`; 
        if(cd) cd.innerText = `📍 ${this.liveCarDistance.toFixed(2)} km`; 
    },

    toggleTruckChrono() {
        this.isTruckRunning = !this.isTruckRunning; localStorage.setItem('truckChronoRun', this.isTruckRunning);
        const btn = document.getElementById('btn-truck-chrono'); if(!btn) return;
        if (this.isTruckRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.truckInterval = setInterval(() => { this.truckSeconds++; localStorage.setItem('truckChronoSec', this.truckSeconds); this.updateTruckChronoDisp(); }, 1000); 
        } else { btn.innerText = "▶️ Start"; btn.classList.remove('running'); clearInterval(this.truckInterval); }
        if (document.getElementById('minimal-mode-ui').style.display !== 'none') this.renderMinimalGrid();
    },

    toggleCarChrono() {
        this.isCarRunning = !this.isCarRunning; localStorage.setItem('carChronoRun', this.isCarRunning);
        const btn = document.getElementById('btn-car-chrono'); if(!btn) return;
        if (this.isCarRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.carInterval = setInterval(() => { this.carSeconds++; localStorage.setItem('carChronoSec', this.carSeconds); this.updateCarChronoDisp(); }, 1000); 
        } else { btn.innerText = "▶️ Start"; btn.classList.remove('running'); clearInterval(this.carInterval); }
        if (document.getElementById('minimal-mode-ui').style.display !== 'none') this.renderMinimalGrid();
    },

    updateTruck(e, brand, type, amount) {
        if (!this.isTruckRunning) { alert("Lance le chrono Camions d'abord ! ⏱️"); return; }
        if (!this.truckCounters[brand]) this.truckCounters[brand] = { fr: 0, etr: 0 };
        
        if (this.truckCounters[brand][type] + amount >= 0) {
            if (amount > 0) {
                this.truckCounters[brand][type] += amount;
                
                let histItem = { brand: brand, type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, chronoTime: this.formatTime(this.truckSeconds), timestamp: new Date().getTime() };
                this.truckHistory.push(histItem);
                
                if(window.ui && e) { window.ui.triggerHapticFeedback('truck'); window.ui.showClickParticle(e, `+1`); }
                localStorage.setItem('truckCounters', JSON.stringify(this.truckCounters)); localStorage.setItem('truckHistory', JSON.stringify(this.truckHistory));
                this.renderTrucks(); this.renderKmStats();
            } else if (amount < 0) {
                for (let i = this.truckHistory.length - 1; i >= 0; i--) {
                    if (this.truckHistory[i].brand === brand && this.truckHistory[i].type === type) {
                        this.deleteTruckHistoryItem(i);
                        return;
                    }
                }
            }
        }
    },

    updateVehicle(e, type, amount) {
        if (!this.isCarRunning) { alert("Lance le chrono Véhicules d'abord ! ⏱️"); return; }
        if (typeof this.vehicleCounters[type] === 'undefined') this.vehicleCounters[type] = 0;
        
        if (this.vehicleCounters[type] + amount >= 0) {
            if (amount > 0) {
                this.vehicleCounters[type] += amount; 

                let histItem = { type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, chronoTime: this.formatTime(this.carSeconds), timestamp: new Date().getTime() };
                this.carHistory.push(histItem);
                
                let hapticType = type === 'Motos' ? 'moto' : (type === 'Tracteurs' ? 'tractor' : 'car');
                if(window.ui && e) { window.ui.triggerHapticFeedback(hapticType); window.ui.showClickParticle(e, `+1`, '#e74c3c'); }
                localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); localStorage.setItem('carHistory', JSON.stringify(this.carHistory));
                this.renderCars(); this.renderKmStats();
            } else if (amount < 0) {
                for (let i = this.carHistory.length - 1; i >= 0; i--) {
                    if (this.carHistory[i].type === type) {
                        this.deleteCarHistoryItem(i);
                        return;
                    }
                }
            }
        }
    },

    deleteTruckHistoryItem(index) {
        let item = this.truckHistory[index];
        if (this.truckCounters[item.brand] && this.truckCounters[item.brand][item.type] > 0) this.truckCounters[item.brand][item.type]--;
        this.truckHistory.splice(index, 1);
        localStorage.setItem('truckCounters', JSON.stringify(this.truckCounters)); localStorage.setItem('truckHistory', JSON.stringify(this.truckHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast("❌ Camion supprimé"); }
        this.renderTrucks(); this.renderKmStats();
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');
    },

    deleteCarHistoryItem(index) {
        let item = this.carHistory[index];
        if (this.vehicleCounters[item.type] > 0) this.vehicleCounters[item.type]--;
        this.carHistory.splice(index, 1);
        localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); localStorage.setItem('carHistory', JSON.stringify(this.carHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast("❌ Véhicule supprimé"); }
        this.renderCars(); this.renderKmStats();
        if (document.getElementById('car-stats-view').style.display !== 'none') this.renderAdvancedStats('cars');
    },

    undoLast() {
        if(window.ui && window.ui.activeTab === 'trucks' && this.truckHistory.length > 0) { 
            this.deleteTruckHistoryItem(this.truckHistory.length - 1);
        } else if(window.ui && window.ui.activeTab === 'cars' && this.carHistory.length > 0) { 
            this.deleteCarHistoryItem(this.carHistory.length - 1);
        } else if(window.ui) { window.ui.showToast("Rien à annuler !"); }
    },

    resetTrucksData() {
        this.brands.forEach(b => { this.truckCounters[b] = { fr: 0, etr: 0 }; }); this.truckHistory = []; this.truckSeconds = 0; this.liveTruckDistance = 0;
        localStorage.setItem('truckCounters', JSON.stringify(this.truckCounters)); localStorage.setItem('truckHistory', JSON.stringify([])); localStorage.setItem('truckChronoSec', 0); localStorage.setItem('liveTruckDist', 0);
        this.updateTruckChronoDisp(); this.renderTrucks(); this.renderKmStats();
    },
    stopTruckSession() {
        if (this.isTruckRunning) this.toggleTruckChrono(); 
        if (this.truckSeconds === 0 && this.truckHistory.length === 0) { this.resetTrucksData(); return; }
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { this.saveSession('trucks'); } 
        else if (confirm("⚠️ La session sera effacée. Confirmer ?")) this.resetTrucksData();
    },

    resetCarsData() {
        this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0); this.carHistory = []; this.carSeconds = 0; this.liveCarDistance = 0;
        localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); localStorage.setItem('carHistory', JSON.stringify([])); localStorage.setItem('carChronoSec', 0); localStorage.setItem('liveCarDist', 0);
        this.updateCarChronoDisp(); this.renderCars(); this.renderKmStats();
    },
    stopCarSession() {
        if (this.isCarRunning) this.toggleCarChrono(); 
        if (this.carSeconds === 0 && this.carHistory.length === 0) { this.resetCarsData(); return; }
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { this.saveSession('cars'); } 
        else if (confirm("⚠️ La session sera effacée. Confirmer ?")) this.resetCarsData();
    },

    saveSession(type) {
        let dateStr = new Date().toLocaleString('fr-FR');
        if (type === 'trucks') {
            let sessions = []; try { sessions = JSON.parse(localStorage.getItem('truckSessions')) || []; } catch(e){}
            sessions.push({ date: dateStr, duration: this.formatTime(this.truckSeconds), distance: this.liveTruckDistance.toFixed(2), history: this.truckHistory });
            localStorage.setItem('truckSessions', JSON.stringify(sessions)); this.resetTrucksData(); if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
        } else if (type === 'cars') {
            let sessions = []; try { sessions = JSON.parse(localStorage.getItem('carSessions')) || []; } catch(e){}
            sessions.push({ date: dateStr, duration: this.formatTime(this.carSeconds), distance: this.liveCarDistance.toFixed(2), history: this.carHistory });
            localStorage.setItem('carSessions', JSON.stringify(sessions)); this.resetCarsData(); if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
        }
    },

    resetTrucks() { if (confirm("⚠️ Tout effacer ? Irréversible !")) { localStorage.removeItem('truckSessions'); this.resetTrucksData(); } },
    resetCars() { if (confirm("⚠️ Tout effacer ? Irréversible !")) { localStorage.removeItem('carSessions'); this.resetCarsData(); } },

    shareScore(type) {
        let title = type === 'trucks' ? 'Rapport Camions 🚛' : 'Rapport Véhicules 🚗';
        let dist = type === 'trucks' ? this.liveTruckDistance : this.liveCarDistance;
        let chrono = type === 'trucks' ? this.formatTime(this.truckSeconds) : this.formatTime(this.carSeconds);
        let items = type === 'trucks' ? this.truckHistory.length : this.carHistory.length;
        let text = `🔥 Je viens de rouler ${dist.toFixed(2)} km avec "Compteurs Gégé" !\n\n⏱️ Temps: ${chrono}\n👀 Observés: ${items} ${type === 'trucks' ? 'camions' : 'véhicules'}\n\nPeux-tu battre mon score sur la route ? 🛣️💨`;
        if (navigator.share) { navigator.share({ title: title, text: text }).catch(console.error); } 
        else { navigator.clipboard.writeText(text); if(window.ui) window.ui.showToast("📋 Score copié dans le presse-papier !"); }
    },

    downloadCSV(csvContent, filename) {
        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a"); const url = URL.createObjectURL(blob);
        link.setAttribute("href", url); link.setAttribute("download", filename); link.style.visibility = 'hidden';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },
    exportAllTrucksCSV() {
        let sessions = []; try { sessions = JSON.parse(localStorage.getItem('truckSessions')) || []; } catch(e){}
        if (sessions.length === 0) { if(window.ui) window.ui.showToast("Aucune session à exporter !"); return; }
        let csv = "Session_Date;Session_Duree;Session_Distance_km;Marque;Origine;Lat;Lon\n";
        sessions.forEach(s => { if(s.history) s.history.forEach((h) => { csv += `${s.date||''};${s.duration||''};${s.distance||0};${h.brand||''};${h.type === 'fr' ? 'FR' : 'ETR'};${h.lat||''};${h.lon||''}\n`; }); });
        this.downloadCSV(csv, "Toutes_Sessions_Camions.csv");
    },
    exportAllCarsCSV() {
        let sessions = []; try { sessions = JSON.parse(localStorage.getItem('carSessions')) || []; } catch(e){}
        if (sessions.length === 0) { if(window.ui) window.ui.showToast("Aucune session à exporter !"); return; }
        let csv = "Session_Date;Session_Duree;Session_Distance_km;Type_Vehicule;Lat;Lon\n";
        sessions.forEach(s => { if(s.history) s.history.forEach((h) => { csv += `${s.date||''};${s.duration||''};${s.distance||0};${h.type||''};${h.lat||''};${h.lon||''}\n`; }); });
        this.downloadCSV(csv, "Toutes_Sessions_Vehicules.csv");
    },
    exportSaveFile() {
        const data = JSON.stringify(localStorage); const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Gege_Sauvegarde_${new Date().toISOString().slice(0,10)}.gege`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); if(window.ui) window.ui.showToast("💾 Sauvegarde exportée avec succès !");
    },
    importSaveFile(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm("⚠️ Attention : L'importation va écraser ta progression actuelle. Continuer ?")) {
                    localStorage.clear(); for (let key in data) { localStorage.setItem(key, data[key]); }
                    alert("✅ Sauvegarde restaurée ! Redémarrage..."); location.reload();
                }
            } catch (err) { alert("❌ Fichier invalide ou corrompu !"); }
        }; reader.readAsText(file);
    },

    renderTrucks() {
        const container = document.getElementById('truck-container'); if(!container) return;
        container.innerHTML = '';
        let grandTotal = 0, totalFr = 0, totalEtr = 0, maxScore = 0, leader = "Aucune";

        this.brands.forEach(brand => {
            let fr = this.truckCounters[brand] ? this.truckCounters[brand].fr : 0; 
            let etr = this.truckCounters[brand] ? this.truckCounters[brand].etr : 0;
            let tot = fr + etr;
            grandTotal += tot; totalFr += fr; totalEtr += etr;
            if (tot > maxScore) { maxScore = tot; leader = brand; }
            
            container.innerHTML += `<div class="brand-card"><div class="brand-name">${brand}</div><div class="counter-section"><span class="flag">🇫🇷</span><button class="btn-corr" onclick="window.app.updateTruck(event, '${brand}', 'fr', -1)">-</button><span class="score">${fr}</span><button class="btn-add btn-add-fr" onclick="window.app.updateTruck(event, '${brand}', 'fr', 1)">+</button></div><div class="counter-section"><span class="flag">🌍</span><button class="btn-corr" onclick="window.app.updateTruck(event, '${brand}', 'etr', -1)">-</button><span class="score">${etr}</span><button class="btn-add btn-add-etr" onclick="window.app.updateTruck(event, '${brand}', 'etr', 1)">+</button></div></div>`;
        });

        let gtEl = document.getElementById('grand-total'); if(gtEl) gtEl.innerText = grandTotal; 
        let lnEl = document.getElementById('leader-name'); if(lnEl) lnEl.innerText = maxScore > 0 ? `${leader} (${maxScore})` : "Aucune";
        
        let pctFr = grandTotal === 0 ? 50 : Math.round((totalFr / grandTotal) * 100);
        let barFr = document.getElementById('bar-fr'); if(barFr) { barFr.style.width = pctFr + '%'; barFr.innerText = grandTotal > 0 ? `🇫🇷 ${pctFr}%` : ''; }
        let barEtr = document.getElementById('bar-etr'); if(barEtr) { barEtr.style.width = (100 - pctFr) + '%'; barEtr.innerText = grandTotal > 0 ? `🌍 ${100 - pctFr}%` : ''; }
    },

    renderCars() {
        const container = document.getElementById('car-container'); if(!container) return;
        container.innerHTML = ''; 
        let grandTotal = 0; 
        this.vehicleTypes.forEach(v => grandTotal += (this.vehicleCounters[v] || 0)); 
        let cgt = document.getElementById('car-grand-total'); if(cgt) cgt.innerText = grandTotal;

        this.vehicleTypes.forEach(v => {
            let pct = grandTotal === 0 ? 25 : Math.round(((this.vehicleCounters[v]||0) / grandTotal) * 100); 
            let bar = document.getElementById(`bar-${v.toLowerCase()}`);
            if (bar) { bar.style.width = pct + '%'; bar.innerText = (grandTotal > 0 && this.vehicleCounters[v] > 0) ? `${pct}%` : ''; }
        });

        const icons = { Voitures: "🚗", Camions: "🚛", Tracteurs: "🚜", Motos: "🏍️" };
        this.vehicleTypes.forEach(v => {
            let score = this.vehicleCounters[v] || 0;
            container.innerHTML += `<div class="vehicle-card"><div class="vehicle-name">${icons[v]} ${v}</div><div class="vehicle-controls"><button class="btn-corr" onclick="window.app.updateVehicle(event, '${v}', -1)">-</button><span class="vehicle-score">${score}</span><button class="btn-add btn-add-fr" onclick="window.app.updateVehicle(event, '${v}', 1)">+</button></div></div>`;
        });
    },

    renderKmStats() {
        let tContainer = document.getElementById('truck-km-list');
        if (tContainer) {
            if (this.liveTruckDistance > 0) {
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${(this.truckHistory.length / this.liveTruckDistance).toFixed(1)} /km</span></div>`;
                
                this.brands.forEach(brand => {
                    let count = this.truckCounters[brand] ? (this.truckCounters[brand].fr + this.truckCounters[brand].etr) : 0;
                    if (count > 0) {
                        html += `<div class="km-stat-card"><span class="km-stat-title">${brand}</span><span class="km-stat-value">${(count / this.liveTruckDistance).toFixed(1)} /km</span></div>`;
                    }
                });
                tContainer.innerHTML = html;
            } else {
                tContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats détaillées... 🚚💨</span>';
            }
        }

        let cContainer = document.getElementById('car-km-list');
        if (cContainer) {
            if (this.liveCarDistance > 0) {
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${(this.carHistory.length / this.liveCarDistance).toFixed(1)} /km</span></div>`;
                
                this.vehicleTypes.forEach(v => {
                    let count = this.vehicleCounters[v] || 0;
                    if (count > 0) {
                        html += `<div class="km-stat-card"><span class="km-stat-title">${v}</span><span class="km-stat-value">${(count / this.liveCarDistance).toFixed(1)} /km</span></div>`;
                    }
                });
                cContainer.innerHTML = html;
            } else {
                 cContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats détaillées... 🚗💨</span>';
            }
        }
    },

    renderMinimalGrid() {
        const grid = document.getElementById('minimal-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (this.isTruckRunning) {
            this.brands.forEach(brand => {
                grid.innerHTML += `
                    <button class="minimal-btn" onclick="window.app.updateTruck(event, '${brand}', 'fr', 1)" style="background-color: #2980b9;">
                        ${brand} 🇫🇷
                    </button>
                    <button class="minimal-btn" onclick="window.app.updateTruck(event, '${brand}', 'etr', 1)" style="background-color: #e67e22;">
                        ${brand} 🌍
                    </button>
                `;
            });
        } else if (this.isCarRunning) {
            const icons = { Voitures: "🚗", Camions: "🚛", Tracteurs: "🚜", Motos: "🏍️" };
            this.vehicleTypes.forEach(v => {
                grid.innerHTML += `
                    <button class="minimal-btn" onclick="window.app.updateVehicle(event, '${v}', 1)" style="font-size: 3em;">
                        ${icons[v]}<br><span style="font-size: 0.3em; color: white;">${v}</span>
                    </button>
                `;
            });
        } else {
            grid.innerHTML = '<div style="color:white; font-size: 1.5em; text-align:center; grid-column: span 2; padding: 50px;">Lance le Chrono Camion ou Véhicule d\'abord ! ⏱️</div>';
        }
    },

    renderAdvancedStats(type) {
        let historyContainer = document.getElementById(type === 'trucks' ? 'truck-history-container' : 'car-history-container');
        let sessionsContainer = document.getElementById(type === 'trucks' ? 'truck-sessions-container' : 'car-sessions-container');

        if (!historyContainer || !sessionsContainer) return;

        let currentHistory = type === 'trucks' ? this.truckHistory : this.carHistory;
        
        // --- Historique ---
        historyContainer.innerHTML = '';
        if (currentHistory.length === 0) {
            historyContainer.innerHTML = '<div class="history-item">Aucune donnée pour la session en cours. 🛣️</div>';
        } else {
            currentHistory.slice().reverse().forEach((item, index) => {
                let realIndex = currentHistory.length - 1 - index;
                let title = type === 'trucks' ? `${item.brand} (${item.type === 'fr' ? '🇫🇷' : '🌍'})` : item.type;
                historyContainer.innerHTML += `
                    <div class="history-item">
                        <div class="history-item-header">
                            <strong>${title}</strong>
                            <span class="history-meta">⏱️ ${item.chronoTime} | 📍 ${item.lat ? parseFloat(item.lat).toFixed(4) : '?'}</span>
                            <button class="btn-del-history" onclick="window.app.${type === 'trucks' ? 'deleteTruckHistoryItem' : 'deleteCarHistoryItem'}(${realIndex})">🗑️</button>
                        </div>
                    </div>`;
            });
        }

        // --- Sessions Sauvegardées ---
        let sessions = [];
        try { sessions = JSON.parse(localStorage.getItem(type === 'trucks' ? 'truckSessions' : 'carSessions')) || []; } catch(e) {}
        sessionsContainer.innerHTML = '';
        if (sessions.length === 0) {
            sessionsContainer.innerHTML = '<div class="history-item">Aucune session sauvegardée pour le moment. 🚦</div>';
        } else {
            sessions.slice().reverse().forEach((session) => {
                let itemsCount = session.history ? session.history.length : 0;
                sessionsContainer.innerHTML += `
                    <div class="history-item" style="cursor: default; background: var(--card-bg); padding: 10px; border-radius: 6px; margin-bottom: 5px; box-shadow: 0 1px 2px var(--shadow);">
                        <div class="history-item-header">
                            <strong>📅 ${session.date}</strong>
                            <span class="history-meta" style="color: #2980b9; font-weight: bold;">
                                ⏱️ ${session.duration} | 📍 ${session.distance} km | 👁️ ${itemsCount} comptés
                            </span>
                        </div>
                    </div>`;
            });
        }
    }
};

window.app = app;
window.onload = () => { 
    app.init(); 
    if(window.ui) ui.init(); 
    if(window.gps) gps.init(); 
    if(window.speech) speech.init(); 
};
