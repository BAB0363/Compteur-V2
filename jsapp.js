// jsapp.js
import { ui } from './jsui.js';
import { gps } from './jsgps.js';

window.ui = ui; window.gps = gps;

const app = {
    brands: ["Renault Trucks", "Mercedes-Benz", "Volvo Trucks", "Scania", "DAF", "MAN", "Iveco", "Ford Trucks"],
    vehicleTypes: ["Voitures", "Camions", "Tracteurs", "Motos"],
    
    truckCounters: {}, vehicleCounters: {},
    truckHistory: [], carHistory: [],
    
    // Nouveaux chronos fiables
    truckSeconds: parseInt(localStorage.getItem('truckChronoSec')) || 0,
    truckAccumulatedTime: parseInt(localStorage.getItem('truckAccumulatedTime')) || 0,
    truckStartTime: parseInt(localStorage.getItem('truckStartTime')) || 0,
    isTruckRunning: localStorage.getItem('truckChronoRun') === 'true',
    
    carSeconds: parseInt(localStorage.getItem('carChronoSec')) || 0,
    carAccumulatedTime: parseInt(localStorage.getItem('carAccumulatedTime')) || 0,
    carStartTime: parseInt(localStorage.getItem('carStartTime')) || 0,
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

        // Reprise des chronos
        if (!this.isTruckRunning) { this.truckAccumulatedTime = this.truckSeconds; }
        if (!this.isCarRunning) { this.carAccumulatedTime = this.carSeconds; }

        if (this.isTruckRunning) { this.isTruckRunning = false; this.toggleTruckChrono(); } else this.updateTruckChronoDisp();
        if (this.isCarRunning) { this.isCarRunning = false; this.toggleCarChrono(); } else this.updateCarChronoDisp();
        
        this.renderTrucks();
        this.renderCars();
        this.renderKmStats();
        this.renderLiveStats('trucks');
        this.renderLiveStats('cars');

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
            this.truckStartTime = Date.now(); localStorage.setItem('truckStartTime', this.truckStartTime);
            this.truckInterval = setInterval(() => { 
                let elapsed = Math.floor((Date.now() - this.truckStartTime) / 1000);
                this.truckSeconds = this.truckAccumulatedTime + elapsed; 
                localStorage.setItem('truckChronoSec', this.truckSeconds); 
                this.updateTruckChronoDisp(); 
                this.renderLiveStats('trucks');
            }, 1000); 
        } else { 
            btn.innerText = "▶️ Start"; btn.classList.remove('running'); 
            clearInterval(this.truckInterval); 
            this.truckAccumulatedTime = this.truckSeconds;
            localStorage.setItem('truckAccumulatedTime', this.truckAccumulatedTime);
        }
    },

    toggleCarChrono() {
        this.isCarRunning = !this.isCarRunning; localStorage.setItem('carChronoRun', this.isCarRunning);
        const btn = document.getElementById('btn-car-chrono'); if(!btn) return;
        if (this.isCarRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.carStartTime = Date.now(); localStorage.setItem('carStartTime', this.carStartTime);
            this.carInterval = setInterval(() => { 
                let elapsed = Math.floor((Date.now() - this.carStartTime) / 1000);
                this.carSeconds = this.carAccumulatedTime + elapsed; 
                localStorage.setItem('carChronoSec', this.carSeconds); 
                this.updateCarChronoDisp(); 
                this.renderLiveStats('cars');
            }, 1000); 
        } else { 
            btn.innerText = "▶️ Start"; btn.classList.remove('running'); 
            clearInterval(this.carInterval); 
            this.carAccumulatedTime = this.carSeconds;
            localStorage.setItem('carAccumulatedTime', this.carAccumulatedTime);
        }
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
                this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
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
                this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
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
        this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');
    },

    deleteCarHistoryItem(index) {
        let item = this.carHistory[index];
        if (this.vehicleCounters[item.type] > 0) this.vehicleCounters[item.type]--;
        this.carHistory.splice(index, 1);
        localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); localStorage.setItem('carHistory', JSON.stringify(this.carHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast("❌ Véhicule supprimé"); }
        this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
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
        this.brands.forEach(b => { this.truckCounters[b] = { fr: 0, etr: 0 }; }); 
        this.truckHistory = []; this.truckSeconds = 0; this.truckAccumulatedTime = 0; this.liveTruckDistance = 0;
        localStorage.setItem('truckCounters', JSON.stringify(this.truckCounters)); 
        localStorage.setItem('truckHistory', JSON.stringify([])); 
        localStorage.setItem('truckChronoSec', 0); localStorage.setItem('truckAccumulatedTime', 0); localStorage.setItem('liveTruckDist', 0);
        this.updateTruckChronoDisp(); this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
    },
    stopTruckSession() {
        if (this.isTruckRunning) this.toggleTruckChrono(); 
        if (this.truckSeconds === 0 && this.truckHistory.length === 0) { this.resetTrucksData(); return; }
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { this.saveSession('trucks'); } 
        else if (confirm("⚠️ La session sera effacée. Confirmer ?")) this.resetTrucksData();
    },

    resetCarsData() {
        this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0); 
        this.carHistory = []; this.carSeconds = 0; this.carAccumulatedTime = 0; this.liveCarDistance = 0;
        localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
        localStorage.setItem('carHistory', JSON.stringify([])); 
        localStorage.setItem('carChronoSec', 0); localStorage.setItem('carAccumulatedTime', 0); localStorage.setItem('liveCarDist', 0);
        this.updateCarChronoDisp(); this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
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
            sessions.push({ id: Date.now().toString(), date: dateStr, durationSec: this.truckSeconds, distanceKm: parseFloat(this.liveTruckDistance.toFixed(2)), weather: window.gps.currentWeatherLabel, history: this.truckHistory, summary: JSON.parse(JSON.stringify(this.truckCounters)) });
            localStorage.setItem('truckSessions', JSON.stringify(sessions)); this.resetTrucksData(); if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
        } else if (type === 'cars') {
            let sessions = []; try { sessions = JSON.parse(localStorage.getItem('carSessions')) || []; } catch(e){}
            sessions.push({ id: Date.now().toString(), date: dateStr, durationSec: this.carSeconds, distanceKm: parseFloat(this.liveCarDistance.toFixed(2)), weather: window.gps.currentWeatherLabel, history: this.carHistory, summary: JSON.parse(JSON.stringify(this.vehicleCounters)) });
            localStorage.setItem('carSessions', JSON.stringify(sessions)); this.resetCarsData(); if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
        }
    },

    resetTrucks() { if (confirm("⚠️ Effacer toutes les sessions sauvegardées ? Irréversible !")) { localStorage.removeItem('truckSessions'); this.renderAdvancedStats('trucks'); window.ui.showToast("🗑️ Historique effacé"); } },
    resetCars() { if (confirm("⚠️ Effacer toutes les sessions sauvegardées ? Irréversible !")) { localStorage.removeItem('carSessions'); this.renderAdvancedStats('cars'); window.ui.showToast("🗑️ Historique effacé"); } },

    exportSaveFile() {
        let truckSessions = JSON.parse(localStorage.getItem('truckSessions')) || [];
        let carSessions = JSON.parse(localStorage.getItem('carSessions')) || [];
        
        let allSessions = [
            ...truckSessions.map(s => ({...s, sessionType: 'trucks'})), 
            ...carSessions.map(s => ({...s, sessionType: 'cars'}))
        ];

        let globalSummary = {
            totalSessions: allSessions.length,
            totalDistanceKm: allSessions.reduce((acc, s) => acc + (s.distanceKm || 0), 0),
            totalTrucks: truckSessions.reduce((acc, s) => acc + (s.history ? s.history.length : 0), 0),
            totalCars: carSessions.reduce((acc, s) => acc + (s.history ? s.history.length : 0), 0)
        };

        let exportData = { appVersion: "Gégé v2.0", exportDate: new Date().toISOString(), globalSummary: globalSummary, sessions: allSessions };
        const data = JSON.stringify(exportData, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement("a"); 
        a.href = url; 
        a.download = `Gege_Export_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
        if(window.ui) window.ui.showToast("💾 JSON généré avec succès !");
    },
    
    importSaveFile(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.sessions && confirm("⚠️ Attention : L'importation va remplacer ton historique actuel. Continuer ?")) {
                    let tSess = data.sessions.filter(s => s.sessionType === 'trucks');
                    let cSess = data.sessions.filter(s => s.sessionType === 'cars');
                    localStorage.setItem('truckSessions', JSON.stringify(tSess));
                    localStorage.setItem('carSessions', JSON.stringify(cSess));
                    alert("✅ Historique importé avec succès ! Redémarrage..."); location.reload();
                } else if(!data.sessions) { alert("❌ Format JSON non reconnu."); }
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
    
    renderLiveStats(type) {
        let container = document.getElementById(type === 'trucks' ? 'truck-live-stats' : 'car-live-stats');
        if (!container) return;
        
        let sec = type === 'trucks' ? this.truckSeconds : this.carSeconds;
        let count = type === 'trucks' ? this.truckHistory.length : this.carHistory.length;
        
        let freq = (count > 0 && sec > 0) ? (sec / 60 / count).toFixed(1) + " min" : "-";
        let speed = (sec > 0) ? (count / (sec / 3600)).toFixed(1) + " /h" : "-";
        let weather = window.gps ? window.gps.currentWeatherLabel : "Inconnue";

        container.innerHTML = `
            <div class="km-stat-card"><span class="km-stat-title">Fréquence d'app.</span><span class="km-stat-value">${freq}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Rythme / Heure</span><span class="km-stat-value">${speed}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Météo dominante</span><span class="km-stat-value" style="color:#e67e22; font-size: 1em;">${weather}</span></div>
        `;
    },

    renderKmStats() {
        let tContainer = document.getElementById('truck-km-list');
        if (tContainer) {
            if (this.liveTruckDistance > 0) {
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${(this.truckHistory.length / this.liveTruckDistance).toFixed(1)} /km</span></div>`;
                this.brands.forEach(brand => {
                    let count = this.truckCounters[brand] ? (this.truckCounters[brand].fr + this.truckCounters[brand].etr) : 0;
                    if (count > 0) html += `<div class="km-stat-card"><span class="km-stat-title">${brand}</span><span class="km-stat-value">${(count / this.liveTruckDistance).toFixed(1)} /km</span></div>`;
                });
                tContainer.innerHTML = html;
            } else { tContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats... 🚚💨</span>'; }
        }

        let cContainer = document.getElementById('car-km-list');
        if (cContainer) {
            if (this.liveCarDistance > 0) {
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${(this.carHistory.length / this.liveCarDistance).toFixed(1)} /km</span></div>`;
                this.vehicleTypes.forEach(v => {
                    let count = this.vehicleCounters[v] || 0;
                    if (count > 0) html += `<div class="km-stat-card"><span class="km-stat-title">${v}</span><span class="km-stat-value">${(count / this.liveCarDistance).toFixed(1)} /km</span></div>`;
                });
                cContainer.innerHTML = html;
            } else { cContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats... 🚗💨</span>'; }
        }
    },

    showSessionDetails(type, reversedIndex) {
        let sessions = JSON.parse(localStorage.getItem(type === 'trucks' ? 'truckSessions' : 'carSessions')) || [];
        let realIndex = sessions.length - 1 - reversedIndex;
        let session = sessions[realIndex];
        if(!session) return;

        let itemsCount = session.history ? session.history.length : 0;
        let freq = itemsCount > 0 && session.durationSec > 0 ? (session.durationSec / 60 / itemsCount).toFixed(1) : '-';
        let speed = session.durationSec > 0 ? (itemsCount / (session.durationSec / 3600)).toFixed(1) : '-';
        let dist = session.distanceKm || 0;

        let html = `
            <div class="session-detail-row"><span class="session-detail-label">Date</span><span class="session-detail-value">${session.date}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Durée</span><span class="session-detail-value">${this.formatTime(session.durationSec || 0)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Distance</span><span class="session-detail-value">${dist} km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Météo</span><span class="session-detail-value">${session.weather || 'Inconnue'}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Véhicules comptés</span><span class="session-detail-value">${itemsCount}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Fréquence</span><span class="session-detail-value">${freq} min/véh.</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme</span><span class="session-detail-value">${speed} /h</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne</span><span class="session-detail-value">${dist > 0 ? (itemsCount / dist).toFixed(1) : '-'} /km</span></div>
        `;
        document.getElementById('modal-session-title').innerText = type === 'trucks' ? '🚛 Détails Session Camions' : '🚗 Détails Session Véhicules';
        document.getElementById('modal-session-content').innerHTML = html;
        document.getElementById('session-detail-modal').style.display = 'flex';
    },

    renderAdvancedStats(type) {
        let historyContainer = document.getElementById(type === 'trucks' ? 'truck-history-container' : 'car-history-container');
        let sessionsContainer = document.getElementById(type === 'trucks' ? 'truck-sessions-container' : 'car-sessions-container');

        if (!historyContainer || !sessionsContainer) return;
        let currentHistory = type === 'trucks' ? this.truckHistory : this.carHistory;
        
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

        let sessions = [];
        try { sessions = JSON.parse(localStorage.getItem(type === 'trucks' ? 'truckSessions' : 'carSessions')) || []; } catch(e) {}
        sessionsContainer.innerHTML = '';
        if (sessions.length === 0) {
            sessionsContainer.innerHTML = '<div class="history-item">Aucune session sauvegardée. 🚦</div>';
        } else {
            sessions.slice().reverse().forEach((session, reversedIndex) => {
                let itemsCount = session.history ? session.history.length : 0;
                let durationTxt = session.durationSec ? this.formatTime(session.durationSec) : "00:00:00";
                sessionsContainer.innerHTML += `
                    <div class="history-item clickable" onclick="window.app.showSessionDetails('${type}', ${reversedIndex})" style="cursor: pointer; background: var(--card-bg); padding: 10px; border-radius: 6px; margin-bottom: 5px; box-shadow: 0 1px 2px var(--shadow);">
                        <div class="history-item-header" style="pointer-events: none;">
                            <strong>📅 ${session.date.split(' ')[0]}</strong>
                            <span class="history-meta" style="color: #2980b9; font-weight: bold;">
                                ⏱️ ${durationTxt} | 📍 ${session.distanceKm || 0} km | 👁️ ${itemsCount} comptés
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
};
