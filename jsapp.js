// jsapp.js
import { ui } from './jsui.js';
import { gps } from './jsgps.js';

window.ui = ui; window.gps = gps;

const app = {
    brands: ["Renault Trucks", "Mercedes-Benz", "Volvo Trucks", "Scania", "DAF", "MAN", "Iveco", "Ford Trucks"],
    vehicleTypes: ["Voitures", "Utilitaires", "Camions", "Engins agricoles", "Bus/Car", "Camping-cars", "Motos", "Vélos"],
    
    truckCounters: {}, vehicleCounters: {},
    globalTruckCounters: {}, globalCarCounters: {}, 
    truckHistory: [], carHistory: [],
    
    // Nouvelles variables de temps et distance globaux
    globalTruckDistance: parseFloat(localStorage.getItem('globalTruckDistance')) || 0,
    globalCarDistance: parseFloat(localStorage.getItem('globalCarDistance')) || 0,
    globalTruckTime: parseInt(localStorage.getItem('globalTruckTime')) || 0,
    globalCarTime: parseInt(localStorage.getItem('globalCarTime')) || 0,
    lastGlobalTruckTick: 0, lastGlobalCarTick: 0,

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
        try { this.globalTruckCounters = JSON.parse(localStorage.getItem('globalTruckCounters')) || {}; } catch(e) { this.globalTruckCounters = {}; }
        try { this.globalCarCounters = JSON.parse(localStorage.getItem('globalCarCounters')) || {}; } catch(e) { this.globalCarCounters = {}; }
        try { this.truckHistory = JSON.parse(localStorage.getItem('truckHistory')) || []; } catch(e) { this.truckHistory = []; }
        try { this.carHistory = JSON.parse(localStorage.getItem('carHistory')) || []; } catch(e) { this.carHistory = []; }
        
        if (this.vehicleCounters["Tracteurs"] !== undefined) {
            this.vehicleCounters["Engins agricoles"] = (this.vehicleCounters["Engins agricoles"] || 0) + this.vehicleCounters["Tracteurs"];
            delete this.vehicleCounters["Tracteurs"];
            localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters));
        }

        if(Object.keys(this.truckCounters).length === 0) this.brands.forEach(b => this.truckCounters[b] = { fr: 0, etr: 0 });
        if(Object.keys(this.vehicleCounters).length === 0) this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0);
        if(Object.keys(this.globalTruckCounters).length === 0) this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
        if(Object.keys(this.globalCarCounters).length === 0) this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);

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
        } catch (e) { console.warn("Wake Lock refusé", e); }
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
        
        let eventType = this.isTruckRunning ? "▶️ Reprise" : "⏸️ Pause";
        let histItem = { isEvent: true, eventType: eventType, lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, chronoTime: this.formatTime(this.truckSeconds), timestamp: new Date().getTime() };
        this.truckHistory.push(histItem);
        localStorage.setItem('truckHistory', JSON.stringify(this.truckHistory));
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');

        if (this.isTruckRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.truckStartTime = Date.now(); localStorage.setItem('truckStartTime', this.truckStartTime);
            this.lastGlobalTruckTick = Date.now(); // Init chrono global
            this.truckInterval = setInterval(() => { 
                let now = Date.now();
                let elapsed = Math.floor((now - this.truckStartTime) / 1000);
                this.truckSeconds = this.truckAccumulatedTime + elapsed; 
                localStorage.setItem('truckChronoSec', this.truckSeconds); 
                
                // MAJ du temps Global
                let delta = now - this.lastGlobalTruckTick;
                if(delta >= 1000) {
                    let add = Math.floor(delta / 1000);
                    this.globalTruckTime += add;
                    localStorage.setItem('globalTruckTime', this.globalTruckTime);
                    this.lastGlobalTruckTick += add * 1000;
                }

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
        
        let eventType = this.isCarRunning ? "▶️ Reprise" : "⏸️ Pause";
        let histItem = { isEvent: true, eventType: eventType, lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, chronoTime: this.formatTime(this.carSeconds), timestamp: new Date().getTime() };
        this.carHistory.push(histItem);
        localStorage.setItem('carHistory', JSON.stringify(this.carHistory));
        if (document.getElementById('car-stats-view').style.display !== 'none') this.renderAdvancedStats('cars');

        if (this.isCarRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.carStartTime = Date.now(); localStorage.setItem('carStartTime', this.carStartTime);
            this.lastGlobalCarTick = Date.now(); // Init chrono global
            this.carInterval = setInterval(() => { 
                let now = Date.now();
                let elapsed = Math.floor((now - this.carStartTime) / 1000);
                this.carSeconds = this.carAccumulatedTime + elapsed; 
                localStorage.setItem('carChronoSec', this.carSeconds); 
                
                // MAJ du temps Global
                let delta = now - this.lastGlobalCarTick;
                if(delta >= 1000) {
                    let add = Math.floor(delta / 1000);
                    this.globalCarTime += add;
                    localStorage.setItem('globalCarTime', this.globalCarTime);
                    this.lastGlobalCarTick += add * 1000;
                }

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
        if (!this.globalTruckCounters[brand]) this.globalTruckCounters[brand] = { fr: 0, etr: 0 };
        
        if (this.truckCounters[brand][type] + amount >= 0) {
            if (window.ui) window.ui.playBeep(amount > 0);
            if (amount > 0) {
                this.truckCounters[brand][type] += amount;
                this.globalTruckCounters[brand][type] += amount; 
                
                let histItem = { brand: brand, type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, alt: window.gps.currentPos.alt, chronoTime: this.formatTime(this.truckSeconds), timestamp: new Date().getTime() };
                this.truckHistory.push(histItem);
                
                if(window.ui && e) { window.ui.triggerHapticFeedback('truck'); window.ui.showClickParticle(e, `+1`); }
                localStorage.setItem('truckCounters', JSON.stringify(this.truckCounters)); 
                localStorage.setItem('globalTruckCounters', JSON.stringify(this.globalTruckCounters)); 
                localStorage.setItem('truckHistory', JSON.stringify(this.truckHistory));
                this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
            } else if (amount < 0) {
                for (let i = this.truckHistory.length - 1; i >= 0; i--) {
                    if (!this.truckHistory[i].isEvent && this.truckHistory[i].brand === brand && this.truckHistory[i].type === type) {
                        this.deleteTruckHistoryItem(i); return;
                    }
                }
            }
        }
    },

    updateVehicle(e, type, amount) {
        if (!this.isCarRunning) { alert("Lance le chrono Véhicules d'abord ! ⏱️"); return; }
        if (typeof this.vehicleCounters[type] === 'undefined') this.vehicleCounters[type] = 0;
        if (typeof this.globalCarCounters[type] === 'undefined') this.globalCarCounters[type] = 0;
        
        if (this.vehicleCounters[type] + amount >= 0) {
            if (window.ui) window.ui.playBeep(amount > 0);
            if (amount > 0) {
                this.vehicleCounters[type] += amount; 
                this.globalCarCounters[type] += amount; 

                let histItem = { type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, alt: window.gps.currentPos.alt, chronoTime: this.formatTime(this.carSeconds), timestamp: new Date().getTime() };
                this.carHistory.push(histItem);
                
                let hapticType = 'car';
                if(type === 'Motos' || type === 'Vélos') hapticType = 'moto';
                if(type === 'Engins agricoles' || type === 'Camions' || type === 'Bus/Car') hapticType = 'tractor';

                if(window.ui && e) { window.ui.triggerHapticFeedback(hapticType); window.ui.showClickParticle(e, `+1`, '#e74c3c'); }
                localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
                localStorage.setItem('globalCarCounters', JSON.stringify(this.globalCarCounters)); 
                localStorage.setItem('carHistory', JSON.stringify(this.carHistory));
                this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
            } else if (amount < 0) {
                for (let i = this.carHistory.length - 1; i >= 0; i--) {
                    if (!this.carHistory[i].isEvent && this.carHistory[i].type === type) {
                        this.deleteCarHistoryItem(i); return;
                    }
                }
            }
        }
    },

    deleteTruckHistoryItem(index) {
        let item = this.truckHistory[index];
        if (!item.isEvent && this.truckCounters[item.brand] && this.truckCounters[item.brand][item.type] > 0) {
            this.truckCounters[item.brand][item.type]--;
            if (this.globalTruckCounters[item.brand] && this.globalTruckCounters[item.brand][item.type] > 0) {
                this.globalTruckCounters[item.brand][item.type]--;
            }
        }
        this.truckHistory.splice(index, 1);
        localStorage.setItem('truckCounters', JSON.stringify(this.truckCounters)); 
        localStorage.setItem('globalTruckCounters', JSON.stringify(this.globalTruckCounters)); 
        localStorage.setItem('truckHistory', JSON.stringify(this.truckHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Camion supprimé"); }
        this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');
    },

    deleteCarHistoryItem(index) {
        let item = this.carHistory[index];
        if (!item.isEvent && this.vehicleCounters[item.type] > 0) {
            this.vehicleCounters[item.type]--;
            if (this.globalCarCounters[item.type] > 0) this.globalCarCounters[item.type]--;
        }
        this.carHistory.splice(index, 1);
        localStorage.setItem('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
        localStorage.setItem('globalCarCounters', JSON.stringify(this.globalCarCounters)); 
        localStorage.setItem('carHistory', JSON.stringify(this.carHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Véhicule supprimé"); }
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
    async stopTruckSession() {
        if (this.isTruckRunning) this.toggleTruckChrono(); 
        if (this.truckSeconds === 0 && this.truckHistory.length === 0) { this.resetTrucksData(); return; }
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { 
            if(window.ui) window.ui.showToast("⏳ Géocodage des adresses en cours...");
            await this.saveSession('trucks'); 
        } 
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
    async stopCarSession() {
        if (this.isCarRunning) this.toggleCarChrono(); 
        if (this.carSeconds === 0 && this.carHistory.length === 0) { this.resetCarsData(); return; }
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { 
            if(window.ui) window.ui.showToast("⏳ Géocodage des adresses en cours...");
            await this.saveSession('cars'); 
        } 
        else if (confirm("⚠️ La session sera effacée. Confirmer ?")) this.resetCarsData();
    },

    async saveSession(type) {
        let dateStr = new Date().toLocaleString('fr-FR');
        let history = type === 'trucks' ? this.truckHistory : this.carHistory;
        
        let startLat = history.length > 0 ? history[0].lat : (window.gps.currentPos.lat || null);
        let startLon = history.length > 0 ? history[0].lon : (window.gps.currentPos.lon || null);
        let endLat = window.gps.currentPos.lat || null;
        let endLon = window.gps.currentPos.lon || null;

        let startAddress = "Inconnue"; let endAddress = "Inconnue";
        if (startLat && startLon) startAddress = await window.gps.getAddress(startLat, startLon);
        if (endLat && endLon) endAddress = await window.gps.getAddress(endLat, endLon);

        if (type === 'trucks') {
            let sessions = []; try { sessions = JSON.parse(localStorage.getItem('truckSessions')) || []; } catch(e){}
            sessions.push({ id: Date.now().toString(), date: dateStr, startAddress: startAddress, endAddress: endAddress, durationSec: this.truckSeconds, distanceKm: parseFloat(this.liveTruckDistance.toFixed(2)), weather: window.gps.currentWeatherLabel, history: this.truckHistory, summary: JSON.parse(JSON.stringify(this.truckCounters)) });
            sessions = sessions.slice(-10); 
            localStorage.setItem('truckSessions', JSON.stringify(sessions)); this.resetTrucksData(); if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
        } else if (type === 'cars') {
            let sessions = []; try { sessions = JSON.parse(localStorage.getItem('carSessions')) || []; } catch(e){}
            sessions.push({ id: Date.now().toString(), date: dateStr, startAddress: startAddress, endAddress: endAddress, durationSec: this.carSeconds, distanceKm: parseFloat(this.liveCarDistance.toFixed(2)), weather: window.gps.currentWeatherLabel, history: this.carHistory, summary: JSON.parse(JSON.stringify(this.vehicleCounters)) });
            sessions = sessions.slice(-10); 
            localStorage.setItem('carSessions', JSON.stringify(sessions)); this.resetCarsData(); if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
        }
    },

    resetTrucks() { if (confirm("⚠️ Effacer toutes les sessions sauvegardées ? Irréversible !")) { localStorage.removeItem('truckSessions'); this.renderAdvancedStats('trucks'); window.ui.showToast("🗑️ Historique effacé"); } },
    resetCars() { if (confirm("⚠️ Effacer toutes les sessions sauvegardées ? Irréversible !")) { localStorage.removeItem('carSessions'); this.renderAdvancedStats('cars'); window.ui.showToast("🗑️ Historique effacé"); } },

    resetGlobalStats() {
        if (confirm("⚠️ Es-tu sûr de vouloir effacer TOUTES les statistiques globales depuis le début ? Action irréversible !")) {
            this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
            this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);
            this.globalTruckDistance = 0; this.globalTruckTime = 0;
            this.globalCarDistance = 0; this.globalCarTime = 0;
            
            localStorage.setItem('globalTruckCounters', JSON.stringify(this.globalTruckCounters));
            localStorage.setItem('globalCarCounters', JSON.stringify(this.globalCarCounters));
            localStorage.setItem('globalTruckDistance', 0); localStorage.setItem('globalTruckTime', 0);
            localStorage.setItem('globalCarDistance', 0); localStorage.setItem('globalCarTime', 0);
            
            this.renderGlobalStats();
            if(window.ui) window.ui.showToast("🗑️ Statistiques globales effacées !");
        }
    },

    // LA NOUVELLE FONCTION POUR AFFICHER LES DÉTAILS GLOBAUX DANS LA MODALE
    showGlobalDetails(type, key) {
        let count = 0, time = 0, dist = 0;
        let title = "";

        if (type === 'trucks') {
            time = this.globalTruckTime; dist = this.globalTruckDistance;
            if (key === 'Total') {
                title = "🚛 Total toutes Marques";
                this.brands.forEach(b => count += (this.globalTruckCounters[b]?.fr || 0) + (this.globalTruckCounters[b]?.etr || 0));
            } else {
                title = `🚛 ${key}`;
                count = (this.globalTruckCounters[key]?.fr || 0) + (this.globalTruckCounters[key]?.etr || 0);
            }
        } else {
            time = this.globalCarTime; dist = this.globalCarDistance;
            if (key === 'Total') {
                title = "🚗 Total tous Véhicules";
                this.vehicleTypes.forEach(v => count += (this.globalCarCounters[v] || 0));
            } else {
                title = `🚘 ${key}`;
                count = this.globalCarCounters[key] || 0;
            }
        }

        let freq = (count > 0 && time > 0) ? (time / 60 / count).toFixed(1) + " min/véh." : "-";
        let speed = (time > 0) ? (count / (time / 3600)).toFixed(1) + " /h" : "-";
        let avgKm = (dist > 0) ? (count / dist).toFixed(2) + " /km" : "-";

        let html = `
            <div class="session-detail-row"><span class="session-detail-label">Temps total cumulé</span><span class="session-detail-value">${this.formatTime(time)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Distance totale cumulée</span><span class="session-detail-value">${dist.toFixed(2)} km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Vitesse Moyenne Globale</span><span class="session-detail-value" style="color:#f39c12;">${time > 0 ? (dist / (time/3600)).toFixed(1) : '-'} km/h</span></div>
            <div style="border-top: 2px dashed #eee; margin: 15px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">Quantité globale comptée</span><span class="session-detail-value" style="color:#27ae60; font-size:1.1em;">${count}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne par km</span><span class="session-detail-value" style="color:#8e44ad;">${avgKm}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Fréquence d'apparition</span><span class="session-detail-value">${freq}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme par heure</span><span class="session-detail-value">${speed}</span></div>
        `;

        document.getElementById('modal-session-title').innerText = `🌍 Stats Globales : ${title}`;
        document.getElementById('modal-session-content').innerHTML = html;
        document.getElementById('session-detail-modal').style.display = 'flex';
    },

    renderGlobalStats() {
        let gTruckTotal = 0;
        let truckHtml = `<div class="km-stat-card" style="border-color:#27ae60; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('trucks', 'Total')"><span class="km-stat-title">Toutes Marques</span><span class="km-stat-value" style="color:#27ae60; font-size:0.9em;">🔍 Voir Détails</span></div>`;
        this.brands.forEach(b => {
            let count = (this.globalTruckCounters[b]?.fr || 0) + (this.globalTruckCounters[b]?.etr || 0);
            gTruckTotal += count;
            if (count > 0) truckHtml += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('trucks', '${b}')"><span class="km-stat-title">${b}</span><span class="km-stat-value">${count}</span><div style="font-size:0.7em; color:#7f8c8d; margin-top:4px;">🖱️ Détails</div></div>`;
        });
        
        let ttEl = document.getElementById('global-truck-total'); if(ttEl) ttEl.innerText = gTruckTotal;
        let tlEl = document.getElementById('global-truck-list'); 
        if(tlEl) tlEl.innerHTML = truckHtml;

        let gCarTotal = 0;
        let carHtml = `<div class="km-stat-card" style="border-color:#3498db; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('cars', 'Total')"><span class="km-stat-title">Tous Véhicules</span><span class="km-stat-value" style="color:#3498db; font-size:0.9em;">🔍 Voir Détails</span></div>`;
        this.vehicleTypes.forEach(v => {
            let count = this.globalCarCounters[v] || 0;
            gCarTotal += count;
            if (count > 0) carHtml += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('cars', '${v}')"><span class="km-stat-title">${v}</span><span class="km-stat-value">${count}</span><div style="font-size:0.7em; color:#7f8c8d; margin-top:4px;">🖱️ Détails</div></div>`;
        });
        
        let ctEl = document.getElementById('global-car-total'); if(ctEl) ctEl.innerText = gCarTotal;
        let clEl = document.getElementById('global-car-list'); 
        if(clEl) clEl.innerHTML = carHtml;
    },

    // ... (Le reste du code des exports / imports et affichage classique n'a pas changé par rapport à l'envoi précédent)
    exportSaveFile() {
        let truckSessions = JSON.parse(localStorage.getItem('truckSessions')) || [];
        let carSessions = JSON.parse(localStorage.getItem('carSessions')) || [];

        let enrichedTruckSessions = truckSessions.map(s => {
            let count = s.history ? s.history.filter(h => !h.isEvent).length : 0;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(s.durationSec / 60 / count).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            return { ...s, sessionType: 'trucks', totalCount: count, camionsParKm: vehPerKm, frequenceMinutes: freqMin, vitesseMoyenneKmh: avgSpeed };
        });

        let enrichedCarSessions = carSessions.map(s => {
            let count = s.history ? s.history.filter(h => !h.isEvent).length : 0;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(s.durationSec / 60 / count).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            return { ...s, sessionType: 'cars', totalCount: count, vehiculesParKm: vehPerKm, frequenceMinutes: freqMin, vitesseMoyenneKmh: avgSpeed };
        });

        let allSessions = [...enrichedTruckSessions, ...enrichedCarSessions];
        
        let globalSummary = {
            totalSessions: allSessions.length,
            globalDonneesBrutesCamions: this.globalTruckCounters,
            globalDonneesBrutesVehicules: this.globalCarCounters
        };

        let exportData = { appVersion: "Compteur Trafic v3.0", exportDate: new Date().toISOString(), globalSummary: globalSummary, sessions: allSessions };
        const data = JSON.stringify(exportData, null, 2);
        const blob = new Blob([data], { type: "text/plain" });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement("a"); a.href = url; 
        a.download = `Compteur_Export_Global_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
        if(window.ui) window.ui.showToast("💾 Export global réussi !");
    },
    
    exportSingleSession(event, type, reversedIndex) {
        event.stopPropagation();
        let sessions = JSON.parse(localStorage.getItem(type === 'trucks' ? 'truckSessions' : 'carSessions')) || [];
        let realIndex = sessions.length - 1 - reversedIndex;
        let session = sessions[realIndex];
        if(!session) return;

        let exportData = { appVersion: "Compteur Trafic v3.0", exportDate: new Date().toISOString(), sessionType: type, session: session };
        const data = JSON.stringify(exportData, null, 2);
        const blob = new Blob([data], { type: "text/plain" });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement("a"); a.href = url; 
        let safeDate = session.date.replace(/[\/ :]/g, '_');
        a.download = `Compteur_Session_${type}_${safeDate}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
        if(window.ui) window.ui.showToast("📤 Session exportée !");
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
                    
                    if (data.globalSummary?.globalDonneesBrutesCamions) {
                        localStorage.setItem('globalTruckCounters', JSON.stringify(data.globalSummary.globalDonneesBrutesCamions));
                    }
                    if (data.globalSummary?.globalDonneesBrutesVehicules) {
                        localStorage.setItem('globalCarCounters', JSON.stringify(data.globalSummary.globalDonneesBrutesVehicules));
                    }
                    
                    alert("✅ Historique importé avec succès ! Redémarrage..."); location.reload();
                } else if(!data.sessions) { alert("❌ Format non reconnu."); }
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

        const slugMap = {
            "Voitures": "voitures",
            "Utilitaires": "utilitaires",
            "Camions": "camions",
            "Engins agricoles": "engins",
            "Bus/Car": "bus",
            "Camping-cars": "camping",
            "Motos": "motos",
            "Vélos": "velos"
        };

        this.vehicleTypes.forEach(v => {
            let pct = grandTotal === 0 ? (100 / this.vehicleTypes.length) : Math.round(((this.vehicleCounters[v]||0) / grandTotal) * 100); 
            let slug = slugMap[v];
            let bar = document.getElementById(`bar-${slug}`);
            if (bar) { 
                bar.style.width = pct + '%'; 
                bar.innerText = (grandTotal > 0 && this.vehicleCounters[v] > 0) ? `${pct}%` : ''; 
            }
        });

        const icons = { Voitures: "🚗", Utilitaires: "🚐", Camions: "🚛", "Engins agricoles": "🚜", "Bus/Car": "🚌", "Camping-cars": "🏕️", Motos: "🏍️", Vélos: "🚲" };
        this.vehicleTypes.forEach(v => {
            let score = this.vehicleCounters[v] || 0;
            container.innerHTML += `<div class="vehicle-card"><div class="vehicle-name">${icons[v] || "🚘"} ${v}</div><div class="vehicle-controls"><button class="btn-corr" onclick="window.app.updateVehicle(event, '${v}', -1)">-</button><span class="vehicle-score">${score}</span><button class="btn-add btn-add-fr" onclick="window.app.updateVehicle(event, '${v}', 1)">+</button></div></div>`;
        });
    },
    
    renderLiveStats(type) {
        let container = document.getElementById(type === 'trucks' ? 'truck-live-stats' : 'car-live-stats');
        if (!container) return;
        
        let sec = type === 'trucks' ? this.truckSeconds : this.carSeconds;
        let dist = type === 'trucks' ? this.liveTruckDistance : this.liveCarDistance;
        let count = type === 'trucks' ? this.truckHistory.filter(h => !h.isEvent).length : this.carHistory.filter(h => !h.isEvent).length;
        
        let freq = (count > 0 && sec > 0) ? (sec / 60 / count).toFixed(1) + " min" : "-";
        let speed = (sec > 0) ? (count / (sec / 3600)).toFixed(1) + " /h" : "-";
        let avgSpeed = (sec > 0) ? (dist / (sec / 3600)).toFixed(1) + " km/h" : "-";
        let weather = window.gps ? window.gps.currentWeatherLabel : "Inconnue";

        container.innerHTML = `
            <div class="km-stat-card"><span class="km-stat-title">Vitesse Moy.</span><span class="km-stat-value" style="color:#8e44ad;">${avgSpeed}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Fréq. Apparition</span><span class="km-stat-value">${freq}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Rythme / Heure</span><span class="km-stat-value">${speed}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Météo</span><span class="km-stat-value" style="color:#e67e22; font-size: 1em;">${weather}</span></div>
        `;
    },

    renderKmStats() {
        let tContainer = document.getElementById('truck-km-list');
        if (tContainer) {
            if (this.liveTruckDistance > 0) {
                let truckCount = this.truckHistory.filter(h => !h.isEvent).length;
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${(truckCount / this.liveTruckDistance).toFixed(1)} /km</span></div>`;
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
                let carCount = this.carHistory.filter(h => !h.isEvent).length;
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${(carCount / this.liveCarDistance).toFixed(1)} /km</span></div>`;
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

        let itemsCount = session.history ? session.history.filter(h => !h.isEvent).length : 0;
        let freq = itemsCount > 0 && session.durationSec > 0 ? (session.durationSec / 60 / itemsCount).toFixed(1) : '-';
        let speed = session.durationSec > 0 ? (itemsCount / (session.durationSec / 3600)).toFixed(1) : '-';
        let dist = session.distanceKm || 0;
        let avgSpeedKmh = session.durationSec > 0 ? (dist / (session.durationSec / 3600)).toFixed(1) : '-';

        let html = `
            <div class="session-detail-row"><span class="session-detail-label">Date</span><span class="session-detail-value">${session.date}</span></div>
            <div class="session-detail-row"><span class="session-detail-label" style="color:#27ae60;">🟢 Départ</span><span class="session-detail-value">${session.startAddress || "Inconnue"}</span></div>
            <div class="session-detail-row"><span class="session-detail-label" style="color:#c0392b;">🔴 Arrivée</span><span class="session-detail-value">${session.endAddress || "Inconnue"}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Durée</span><span class="session-detail-value">${this.formatTime(session.durationSec || 0)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Distance</span><span class="session-detail-value">${dist} km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Vitesse Moyenne</span><span class="session-detail-value" style="color:#8e44ad;">${avgSpeedKmh} km/h</span></div>
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
                let title = item.isEvent ? item.eventType : (type === 'trucks' ? `${item.brand} (${item.type === 'fr' ? '🇫🇷' : '🌍'})` : item.type);
                let titleStyle = item.isEvent ? 'color: #f39c12;' : '';
                historyContainer.innerHTML += `
                    <div class="history-item">
                        <div class="history-item-header">
                            <strong style="${titleStyle}">${title}</strong>
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
                let itemsCount = session.history ? session.history.filter(h => !h.isEvent).length : 0;
                let durationTxt = session.durationSec ? this.formatTime(session.durationSec) : "00:00:00";
                let avgSpeedStr = (session.durationSec > 0 && session.distanceKm) ? ` | ⚡ ${(session.distanceKm / (session.durationSec / 3600)).toFixed(0)} km/h` : "";
                
                sessionsContainer.innerHTML += `
                    <div class="history-item clickable" onclick="window.app.showSessionDetails('${type}', ${reversedIndex})" style="cursor: pointer; background: var(--card-bg); padding: 10px; border-radius: 6px; margin-bottom: 5px; box-shadow: 0 1px 2px var(--shadow); position: relative;">
                        <div class="history-item-header" style="pointer-events: none; padding-right: 40px;">
                            <strong>📅 ${session.date.split(' ')[0]} <span style="font-size:0.8em; color:#7f8c8d; font-weight:normal;">(${session.endAddress ? session.endAddress.split(',')[0] : 'Inconnu'})</span></strong>
                            <span class="history-meta" style="color: #2980b9; font-weight: bold;">
                                ⏱️ ${durationTxt} | 📍 ${session.distanceKm || 0} km${avgSpeedStr} | 👁️ ${itemsCount} comptés
                            </span>
                        </div>
                        <button onclick="window.app.exportSingleSession(event, '${type}', ${reversedIndex})" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #2980b9; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 1.1em; cursor: pointer; z-index: 2; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">📤</button>
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
