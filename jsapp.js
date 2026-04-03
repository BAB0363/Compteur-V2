// jsapp.js
import { ui } from './jsui.js';
import { gps } from './jsgps.js';

window.ui = ui; window.gps = gps;

const app = {
    activeProfile: localStorage.getItem('activeProfile') || 'voiture',
    storage: {
        get(key) { return localStorage.getItem(window.app.activeProfile + '_' + key); },
        set(key, value) { localStorage.setItem(window.app.activeProfile + '_' + key, value); },
        remove(key) { localStorage.removeItem(window.app.activeProfile + '_' + key); }
    },

    brands: ["Renault Trucks", "Mercedes-Benz", "Volvo Trucks", "Scania", "DAF", "MAN", "Iveco", "Ford Trucks"],
    vehicleTypes: ["Voitures", "Utilitaires", "Camions", "Engins agricoles", "Bus/Car", "Camping-cars", "Motos", "Vélos"],
    
    truckCounters: {}, vehicleCounters: {},
    globalTruckCounters: {}, globalCarCounters: {}, 
    truckHistory: [], carHistory: [],
    
    // NOUVEAU : Registres permanents pour les analyses absolues
    globalAnaTrucks: null, globalAnaCars: null,

    globalTruckDistance: 0, globalCarDistance: 0,
    globalTruckTime: 0, globalCarTime: 0,
    lastGlobalTruckTick: 0, lastGlobalCarTick: 0,

    truckSeconds: 0, truckAccumulatedTime: 0, truckStartTime: 0, isTruckRunning: false,
    carSeconds: 0, carAccumulatedTime: 0, carStartTime: 0, isCarRunning: false,
    
    truckInterval: null, carInterval: null,
    liveTruckDistance: 0, liveCarDistance: 0,
    wakeLock: null, 
    
    truckChart: null, carChart: null,
    temporalChart: null, weeklyChart: null, altitudeChart: null, weeklyGlobalChart: null,

    idb: {
        db: null,
        async init() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open("CompteurTraficDB", 1);
                req.onupgradeneeded = e => {
                    let db = e.target.result;
                    if (!db.objectStoreNames.contains('sessions')) {
                        db.createObjectStore('sessions', { keyPath: 'id' });
                    }
                };
                req.onsuccess = e => { this.db = e.target.result; resolve(); };
                req.onerror = e => reject("Erreur IDB");
            });
        },
        async getAllRaw() {
            return new Promise(resolve => {
                let tx = this.db.transaction('sessions', 'readonly');
                let req = tx.objectStore('sessions').getAll();
                req.onsuccess = e => resolve(e.target.result);
            });
        },
        async getAll(type) {
            return new Promise(resolve => {
                let tx = this.db.transaction('sessions', 'readonly');
                let req = tx.objectStore('sessions').getAll();
                req.onsuccess = e => resolve(e.target.result.filter(s => s.sessionType === type && s.profile === window.app.activeProfile));
            });
        },
        async getById(id) {
            return new Promise(resolve => {
                let tx = this.db.transaction('sessions', 'readonly');
                let req = tx.objectStore('sessions').get(id);
                req.onsuccess = e => resolve(e.target.result);
            });
        },
        async add(session) {
            return new Promise(resolve => {
                let tx = this.db.transaction('sessions', 'readwrite');
                tx.objectStore('sessions').put(session);
                tx.oncomplete = () => resolve();
            });
        },
        async clear(type) {
            return new Promise(async resolve => {
                let all = await this.getAll(type);
                let tx = this.db.transaction('sessions', 'readwrite');
                let store = tx.objectStore('sessions');
                all.forEach(s => store.delete(s.id));
                tx.oncomplete = () => resolve();
            });
        }
    },

    // Crée une structure vide pour les analyses
    getEmptyAnalytics() {
        let hours = {}; for(let i=0; i<24; i++) hours[`${i}h`] = 0;
        return {
            hours: hours,
            days: { "Dim":0, "Lun":0, "Mar":0, "Mer":0, "Jeu":0, "Ven":0, "Sam":0 },
            alts: { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 },
            seqs: {}, lastVeh: null
        };
    },

    // Moulinette magique : importe tes anciens historiques dans la mémoire permanente
    async buildPermanentAnalyticsFromIDB(type, targetAna) {
        let sessions = await this.idb.getAll(type);
        let dayKeys = Object.keys(targetAna.days);
        sessions.forEach(s => {
            if (s.history) {
                let hist = s.history.filter(h => !h.isEvent);
                for(let i = 0; i < hist.length; i++) {
                    let h = hist[i];
                    if (h.timestamp) {
                        let d = new Date(h.timestamp);
                        targetAna.hours[`${d.getHours()}h`]++;
                        targetAna.days[dayKeys[d.getDay()]]++;
                    }
                    let altVal = h.alt || 0;
                    let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                    targetAna.alts[altKey]++;

                    if (i < hist.length - 1) {
                        let cur = type === 'trucks' ? h.brand : h.type;
                        let nxt = type === 'trucks' ? hist[i+1].brand : hist[i+1].type;
                        let pair = `${cur} ➡️ ${nxt}`;
                        targetAna.seqs[pair] = (targetAna.seqs[pair] || 0) + 1;
                    }
                }
            }
        });
    },

    async migrateData() {
        let oldVal = localStorage.getItem('truckCounters');
        if (oldVal && !localStorage.getItem('voiture_truckCounters') && !localStorage.getItem('camion_truckCounters')) {
            const keys = ['truckCounters', 'vehicleCounters', 'globalTruckCounters', 'globalCarCounters', 'truckHistory', 'carHistory', 'globalTruckDistance', 'globalCarDistance', 'globalTruckTime', 'globalCarTime', 'truckChronoSec', 'truckAccumulatedTime', 'truckStartTime', 'truckChronoRun', 'carChronoSec', 'carAccumulatedTime', 'carStartTime', 'carChronoRun', 'liveTruckDist', 'liveCarDist'];
            keys.forEach(k => {
                let val = localStorage.getItem(k);
                if (val !== null) { localStorage.setItem('voiture_' + k, val); localStorage.removeItem(k); }
            });

            let allSessions = await this.idb.getAllRaw();
            if (allSessions.length > 0) {
                let tx = this.idb.db.transaction('sessions', 'readwrite');
                let store = tx.objectStore('sessions');
                allSessions.forEach(s => { if (!s.profile) { s.profile = 'voiture'; store.put(s); } });
                return new Promise(resolve => { tx.oncomplete = () => resolve(); });
            }
        }
    },

    async changeProfile(newProfile) {
        if (this.isTruckRunning) this.toggleTruckChrono();
        if (this.isCarRunning) this.toggleCarChrono();

        this.activeProfile = newProfile;
        localStorage.setItem('activeProfile', newProfile);

        await this.init(true);
        if (window.ui) { window.ui.showToast(`🔄 Profil changé : ${newProfile === 'voiture' ? '🚘 Voiture' : '🚛 Camion'}`); }
    },

    async init(isProfileSwitch = false) {
        if (!isProfileSwitch) { await this.idb.init(); await this.migrateData(); }

        let selector = document.getElementById('profile-selector');
        if (selector) selector.value = this.activeProfile;

        if (this.truckInterval) clearInterval(this.truckInterval);
        if (this.carInterval) clearInterval(this.carInterval);

        try { this.truckCounters = JSON.parse(this.storage.get('truckCounters')) || {}; } catch(e) { this.truckCounters = {}; }
        try { this.vehicleCounters = JSON.parse(this.storage.get('vehicleCounters')) || {}; } catch(e) { this.vehicleCounters = {}; }
        try { this.globalTruckCounters = JSON.parse(this.storage.get('globalTruckCounters')) || {}; } catch(e) { this.globalTruckCounters = {}; }
        try { this.globalCarCounters = JSON.parse(this.storage.get('globalCarCounters')) || {}; } catch(e) { this.globalCarCounters = {}; }
        try { this.truckHistory = JSON.parse(this.storage.get('truckHistory')) || []; } catch(e) { this.truckHistory = []; }
        try { this.carHistory = JSON.parse(this.storage.get('carHistory')) || []; } catch(e) { this.carHistory = []; }
        
        // Initialisation ou Migration des stats permanentes
        try { this.globalAnaTrucks = JSON.parse(this.storage.get('globalAnaTrucks')); } catch(e) {}
        if (!this.globalAnaTrucks) { 
            this.globalAnaTrucks = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('trucks', this.globalAnaTrucks);
            this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
        }

        try { this.globalAnaCars = JSON.parse(this.storage.get('globalAnaCars')); } catch(e) {}
        if (!this.globalAnaCars) { 
            this.globalAnaCars = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('cars', this.globalAnaCars);
            this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
        }

        if (this.vehicleCounters["Tracteurs"] !== undefined) {
            this.vehicleCounters["Engins agricoles"] = (this.vehicleCounters["Engins agricoles"] || 0) + this.vehicleCounters["Tracteurs"];
            delete this.vehicleCounters["Tracteurs"];
            this.storage.set('vehicleCounters', JSON.stringify(this.vehicleCounters));
        }

        if(Object.keys(this.truckCounters).length === 0) this.brands.forEach(b => this.truckCounters[b] = { fr: 0, etr: 0 });
        if(Object.keys(this.vehicleCounters).length === 0) this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0);
        if(Object.keys(this.globalTruckCounters).length === 0) this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
        if(Object.keys(this.globalCarCounters).length === 0) this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);

        this.globalTruckDistance = parseFloat(this.storage.get('globalTruckDistance')) || 0;
        this.globalCarDistance = parseFloat(this.storage.get('globalCarDistance')) || 0;
        this.globalTruckTime = parseInt(this.storage.get('globalTruckTime')) || 0;
        this.globalCarTime = parseInt(this.storage.get('globalCarTime')) || 0;

        this.truckSeconds = parseInt(this.storage.get('truckChronoSec')) || 0;
        this.truckAccumulatedTime = parseInt(this.storage.get('truckAccumulatedTime')) || 0;
        this.truckStartTime = parseInt(this.storage.get('truckStartTime')) || 0;
        this.isTruckRunning = this.storage.get('truckChronoRun') === 'true';

        this.carSeconds = parseInt(this.storage.get('carChronoSec')) || 0;
        this.carAccumulatedTime = parseInt(this.storage.get('carAccumulatedTime')) || 0;
        this.carStartTime = parseInt(this.storage.get('carStartTime')) || 0;
        this.isCarRunning = this.storage.get('carChronoRun') === 'true';

        this.liveTruckDistance = parseFloat(this.storage.get('liveTruckDist')) || 0;
        this.liveCarDistance = parseFloat(this.storage.get('liveCarDist')) || 0;

        if (!this.isTruckRunning) { this.truckAccumulatedTime = this.truckSeconds; }
        if (!this.isCarRunning) { this.carAccumulatedTime = this.carSeconds; }

        if (this.isTruckRunning) { this.isTruckRunning = false; this.toggleTruckChrono(); } else this.updateTruckChronoDisp();
        if (this.isCarRunning) { this.isCarRunning = false; this.toggleCarChrono(); } else this.updateCarChronoDisp();
        
        this.renderTrucks(); this.renderCars(); this.renderKmStats();
        this.renderLiveStats('trucks'); this.renderLiveStats('cars');
        this.renderGlobalStats();

        if (window.ui && window.ui.activeTab === 'analytics') this.renderAnalytics('trucks');
        if (document.getElementById('truck-stats-view') && document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');
        if (document.getElementById('car-stats-view') && document.getElementById('car-stats-view').style.display !== 'none') this.renderAdvancedStats('cars');

        if (!isProfileSwitch) {
            this.requestWakeLock();
            document.addEventListener('visibilitychange', async () => {
                if (this.wakeLock !== null && document.visibilityState === 'visible') this.requestWakeLock();
            });
        }
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
        this.isTruckRunning = !this.isTruckRunning; this.storage.set('truckChronoRun', this.isTruckRunning);
        const btn = document.getElementById('btn-truck-chrono'); if(!btn) return;
        
        let eventType = this.isTruckRunning ? "▶️ Reprise" : "⏸️ Pause";
        let histItem = { isEvent: true, eventType: eventType, lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, chronoTime: this.formatTime(this.truckSeconds), timestamp: new Date().getTime() };
        this.truckHistory.push(histItem);
        this.storage.set('truckHistory', JSON.stringify(this.truckHistory));
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');

        if (this.isTruckRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.truckStartTime = Date.now(); this.storage.set('truckStartTime', this.truckStartTime);
            this.lastGlobalTruckTick = Date.now();
            this.truckInterval = setInterval(() => { 
                let now = Date.now();
                let elapsed = Math.floor((now - this.truckStartTime) / 1000);
                this.truckSeconds = this.truckAccumulatedTime + elapsed; 
                this.storage.set('truckChronoSec', this.truckSeconds); 
                
                let delta = now - this.lastGlobalTruckTick;
                if(delta >= 1000) {
                    let add = Math.floor(delta / 1000);
                    this.globalTruckTime += add;
                    this.storage.set('globalTruckTime', this.globalTruckTime);
                    this.lastGlobalTruckTick += add * 1000;
                }

                this.updateTruckChronoDisp(); 
                this.renderLiveStats('trucks');
            }, 1000); 
        } else { 
            btn.innerText = "▶️ Start"; btn.classList.remove('running'); 
            clearInterval(this.truckInterval); 
            this.truckAccumulatedTime = this.truckSeconds;
            this.storage.set('truckAccumulatedTime', this.truckAccumulatedTime);
            this.globalAnaTrucks.lastVeh = null; // Coupe la séquence
            this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
        }
    },

    toggleCarChrono() {
        this.isCarRunning = !this.isCarRunning; this.storage.set('carChronoRun', this.isCarRunning);
        const btn = document.getElementById('btn-car-chrono'); if(!btn) return;
        
        let eventType = this.isCarRunning ? "▶️ Reprise" : "⏸️ Pause";
        let histItem = { isEvent: true, eventType: eventType, lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, chronoTime: this.formatTime(this.carSeconds), timestamp: new Date().getTime() };
        this.carHistory.push(histItem);
        this.storage.set('carHistory', JSON.stringify(this.carHistory));
        if (document.getElementById('car-stats-view').style.display !== 'none') this.renderAdvancedStats('cars');

        if (this.isCarRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            this.carStartTime = Date.now(); this.storage.set('carStartTime', this.carStartTime);
            this.lastGlobalCarTick = Date.now(); 
            this.carInterval = setInterval(() => { 
                let now = Date.now();
                let elapsed = Math.floor((now - this.carStartTime) / 1000);
                this.carSeconds = this.carAccumulatedTime + elapsed; 
                this.storage.set('carChronoSec', this.carSeconds); 
                
                let delta = now - this.lastGlobalCarTick;
                if(delta >= 1000) {
                    let add = Math.floor(delta / 1000);
                    this.globalCarTime += add;
                    this.storage.set('globalCarTime', this.globalCarTime);
                    this.lastGlobalCarTick += add * 1000;
                }

                this.updateCarChronoDisp(); 
                this.renderLiveStats('cars');
            }, 1000); 
        } else { 
            btn.innerText = "▶️ Start"; btn.classList.remove('running'); 
            clearInterval(this.carInterval); 
            this.carAccumulatedTime = this.carSeconds;
            this.storage.set('carAccumulatedTime', this.carAccumulatedTime);
            this.globalAnaCars.lastVeh = null; // Coupe la séquence
            this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
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
                
                let nowTs = new Date().getTime();
                let histItem = { brand: brand, type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, alt: window.gps.currentPos.alt, chronoTime: this.formatTime(this.truckSeconds), timestamp: nowTs };
                this.truckHistory.push(histItem);

                // ENREGISTREMENT PERMANENT (Heure, Jour, Alt, Séquence)
                let d = new Date(nowTs);
                this.globalAnaTrucks.hours[`${d.getHours()}h`]++;
                this.globalAnaTrucks.days[Object.keys(this.globalAnaTrucks.days)[d.getDay()]]++;
                
                let altVal = window.gps.currentPos.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                this.globalAnaTrucks.alts[altKey]++;

                if (this.globalAnaTrucks.lastVeh) {
                    let pair = `${this.globalAnaTrucks.lastVeh} ➡️ ${brand}`;
                    this.globalAnaTrucks.seqs[pair] = (this.globalAnaTrucks.seqs[pair] || 0) + 1;
                }
                this.globalAnaTrucks.lastVeh = brand;
                this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
                
                if(window.ui && e) { window.ui.triggerHapticFeedback('truck'); window.ui.showClickParticle(e, `+1`); }
                this.storage.set('truckCounters', JSON.stringify(this.truckCounters)); 
                this.storage.set('globalTruckCounters', JSON.stringify(this.globalTruckCounters)); 
                this.storage.set('truckHistory', JSON.stringify(this.truckHistory));
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

                let nowTs = new Date().getTime();
                let histItem = { type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, alt: window.gps.currentPos.alt, chronoTime: this.formatTime(this.carSeconds), timestamp: nowTs };
                this.carHistory.push(histItem);

                // ENREGISTREMENT PERMANENT (Heure, Jour, Alt, Séquence)
                let d = new Date(nowTs);
                this.globalAnaCars.hours[`${d.getHours()}h`]++;
                this.globalAnaCars.days[Object.keys(this.globalAnaCars.days)[d.getDay()]]++;
                
                let altVal = window.gps.currentPos.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                this.globalAnaCars.alts[altKey]++;

                if (this.globalAnaCars.lastVeh) {
                    let pair = `${this.globalAnaCars.lastVeh} ➡️ ${type}`;
                    this.globalAnaCars.seqs[pair] = (this.globalAnaCars.seqs[pair] || 0) + 1;
                }
                this.globalAnaCars.lastVeh = type;
                this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
                
                let hapticType = 'car';
                if(type === 'Motos' || type === 'Vélos') hapticType = 'moto';
                if(type === 'Engins agricoles' || type === 'Camions' || type === 'Bus/Car') hapticType = 'tractor';

                if(window.ui && e) { window.ui.triggerHapticFeedback(hapticType); window.ui.showClickParticle(e, `+1`, '#e74c3c'); }
                this.storage.set('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
                this.storage.set('globalCarCounters', JSON.stringify(this.globalCarCounters)); 
                this.storage.set('carHistory', JSON.stringify(this.carHistory));
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

            // RETRAIT DES STATS PERMANENTES (En cas d'erreur)
            if (item.timestamp) {
                let d = new Date(item.timestamp);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(this.globalAnaTrucks.days)[d.getDay()];
                let altVal = item.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";

                if(this.globalAnaTrucks.hours[hourKey] > 0) this.globalAnaTrucks.hours[hourKey]--;
                if(this.globalAnaTrucks.days[dayKey] > 0) this.globalAnaTrucks.days[dayKey]--;
                if(this.globalAnaTrucks.alts[altKey] > 0) this.globalAnaTrucks.alts[altKey]--;
                if(index === this.truckHistory.length - 1) this.globalAnaTrucks.lastVeh = null; // Casse la séquence si c'est le dernier
                this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
            }
        }
        this.truckHistory.splice(index, 1);
        this.storage.set('truckCounters', JSON.stringify(this.truckCounters)); 
        this.storage.set('globalTruckCounters', JSON.stringify(this.globalTruckCounters)); 
        this.storage.set('truckHistory', JSON.stringify(this.truckHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Camion supprimé"); }
        this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');
    },

    deleteCarHistoryItem(index) {
        let item = this.carHistory[index];
        if (!item.isEvent && this.vehicleCounters[item.type] > 0) {
            this.vehicleCounters[item.type]--;
            if (this.globalCarCounters[item.type] > 0) this.globalCarCounters[item.type]--;

            // RETRAIT DES STATS PERMANENTES (En cas d'erreur)
            if (item.timestamp) {
                let d = new Date(item.timestamp);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(this.globalAnaCars.days)[d.getDay()];
                let altVal = item.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";

                if(this.globalAnaCars.hours[hourKey] > 0) this.globalAnaCars.hours[hourKey]--;
                if(this.globalAnaCars.days[dayKey] > 0) this.globalAnaCars.days[dayKey]--;
                if(this.globalAnaCars.alts[altKey] > 0) this.globalAnaCars.alts[altKey]--;
                if(index === this.carHistory.length - 1) this.globalAnaCars.lastVeh = null; 
                this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
            }
        }
        this.carHistory.splice(index, 1);
        this.storage.set('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
        this.storage.set('globalCarCounters', JSON.stringify(this.globalCarCounters)); 
        this.storage.set('carHistory', JSON.stringify(this.carHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Véhicule supprimé"); }
        this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
        if (document.getElementById('car-stats-view').style.display !== 'none') this.renderAdvancedStats('cars');
    },

    undoLast() {
        if(window.ui && window.ui.activeTab === 'trucks' && this.truckHistory.length > 0) { 
            this.deleteTruckHistoryItem(this.truckHistory.length - 1);
        } else if(window.ui && window.ui.activeTab === 'cars' && this.carHistory.length > 0) { 
            this.deleteCarHistoryItem(this.carHistory.length - 1);
        } else if(window.ui) { window.ui.showToast("Rien à annuler ! 🤷‍♂️"); }
    },

    resetTrucksData() {
        this.brands.forEach(b => { this.truckCounters[b] = { fr: 0, etr: 0 }; }); 
        this.truckHistory = []; this.truckSeconds = 0; this.truckAccumulatedTime = 0; this.liveTruckDistance = 0;
        this.storage.set('truckCounters', JSON.stringify(this.truckCounters)); 
        this.storage.set('truckHistory', JSON.stringify([])); 
        this.storage.set('truckChronoSec', 0); this.storage.set('truckAccumulatedTime', 0); this.storage.set('liveTruckDist', 0);
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
        this.storage.set('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
        this.storage.set('carHistory', JSON.stringify([])); 
        this.storage.set('carChronoSec', 0); this.storage.set('carAccumulatedTime', 0); this.storage.set('liveCarDist', 0);
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
        
        let startDateStr = dateStr;
        if (history.length > 0 && history[0].timestamp) {
            startDateStr = new Date(history[0].timestamp).toLocaleString('fr-FR');
        }

        let startLat = history.length > 0 ? history[0].lat : (window.gps.currentPos.lat || null);
        let startLon = history.length > 0 ? history[0].lon : (window.gps.currentPos.lon || null);
        let endLat = window.gps.currentPos.lat || null;
        let endLon = window.gps.currentPos.lon || null;

        let startAddress = "Inconnue"; let endAddress = "Inconnue";
        if (startLat && startLon) startAddress = await window.gps.getAddress(startLat, startLon);
        if (endLat && endLon) endAddress = await window.gps.getAddress(endLat, endLon);

        let newSession = { 
            id: Date.now().toString(), 
            profile: this.activeProfile,
            sessionType: type, 
            startDate: startDateStr, 
            date: dateStr, 
            startAddress: startAddress, 
            endAddress: endAddress, 
            durationSec: type === 'trucks' ? this.truckSeconds : this.carSeconds, 
            distanceKm: parseFloat((type === 'trucks' ? this.liveTruckDistance : this.liveCarDistance).toFixed(2)), 
            weather: window.gps.currentWeatherLabel, 
            history: history, 
            summary: JSON.parse(JSON.stringify(type === 'trucks' ? this.truckCounters : this.vehicleCounters)) 
        };

        await this.idb.add(newSession);

        if (type === 'trucks') this.resetTrucksData(); 
        else this.resetCarsData(); 
        
        if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
    },

    async resetTrucks() { 
        if (confirm("⚠️ Effacer toutes les sessions Camions sauvegardées (pour ce profil) ? Tes stats globales et tes analyses resteront intactes !")) { 
            await this.idb.clear('trucks'); 
            this.renderAdvancedStats('trucks'); 
            window.ui.showToast("🗑️ Historique des sessions effacé"); 
        } 
    },
    async resetCars() { 
        if (confirm("⚠️ Effacer toutes les sessions Véhicules sauvegardées (pour ce profil) ? Tes stats globales et tes analyses resteront intactes !")) { 
            await this.idb.clear('cars'); 
            this.renderAdvancedStats('cars'); 
            window.ui.showToast("🗑️ Historique des sessions effacé"); 
        } 
    },

    resetGlobalStats() {
        if (confirm("⚠️ Es-tu sûr de vouloir effacer TOUTES les statistiques globales et analyses pour ce profil ? Action irréversible !")) {
            this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
            this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);
            this.globalTruckDistance = 0; this.globalTruckTime = 0;
            this.globalCarDistance = 0; this.globalCarTime = 0;
            
            // On vide aussi les analyses permanentes
            this.globalAnaTrucks = this.getEmptyAnalytics();
            this.globalAnaCars = this.getEmptyAnalytics();
            this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
            this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
            
            this.storage.set('globalTruckCounters', JSON.stringify(this.globalTruckCounters));
            this.storage.set('globalCarCounters', JSON.stringify(this.globalCarCounters));
            this.storage.set('globalTruckDistance', 0); this.storage.set('globalTruckTime', 0);
            this.storage.set('globalCarDistance', 0); this.storage.set('globalCarTime', 0);
            
            this.renderGlobalStats();
            if(window.ui) window.ui.showToast("🗑️ Statistiques globales et analyses effacées !");
        }
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

        const slugMap = { "Voitures": "voitures", "Utilitaires": "utilitaires", "Camions": "camions", "Engins agricoles": "engins", "Bus/Car": "bus", "Camping-cars": "camping", "Motos": "motos", "Vélos": "velos" };

        this.vehicleTypes.forEach(v => {
            let pct = grandTotal === 0 ? (100 / this.vehicleTypes.length) : Math.round(((this.vehicleCounters[v]||0) / grandTotal) * 100); 
            let slug = slugMap[v];
            let bar = document.getElementById(`bar-${slug}`);
            if (bar) { bar.style.width = pct + '%'; bar.innerText = (grandTotal > 0 && this.vehicleCounters[v] > 0) ? `${pct}%` : ''; }
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
        let hist = type === 'trucks' ? this.truckHistory : this.carHistory;
        
        let items = hist.filter(h => !h.isEvent);
        let count = items.length;
        
        let avgSpeed = (sec > 0) ? (dist / (sec / 3600)).toFixed(1) + " km/h" : "-";
        let freqApp = (count > 0 && sec > 0) ? (sec / 60 / count).toFixed(1) + " min" : "-";
        let rythmeHeure = (sec > 0) ? (count / (sec / 3600)).toFixed(1) + " /h" : "-";
        let weather = window.gps ? window.gps.currentWeatherLabel : "Inconnue";

        let espTemps = count > 1 ? (sec / count).toFixed(1) + " s" : "-";
        let espDist = (count > 1 && dist > 0) ? ((dist * 1000) / count).toFixed(0) + " m" : "-";
        let nowTimestamp = Date.now();
        let tenMinsAgo = nowTimestamp - 600000;
        let recentItems = items.filter(h => h.timestamp >= tenMinsAgo);
        let mobilePace = recentItems.length > 0 ? (recentItems.length * 6) + " /h" : "-";
        let ratePerSec = count / (sec || 1);
        let proj = sec > 0 ? Math.round(count + (ratePerSec * 3600)) : "-";

        container.innerHTML = `
            <div class="km-stat-card"><span class="km-stat-title">Météo</span><span class="km-stat-value" style="color:#e67e22;">${weather}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Vitesse Moy.</span><span class="km-stat-value" style="color:#8e44ad;">${avgSpeed}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Fréq. Apparition</span><span class="km-stat-value">${freqApp}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Rythme / Heure</span><span class="km-stat-value">${rythmeHeure}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Tendance (10m)</span><span class="km-stat-value" style="color:#e67e22;">${mobilePace}</span></div>
            <div class="km-stat-card"><span class="km-stat-title">Espacement Moyen</span><span class="km-stat-value">${espTemps} / ${espDist}</span></div>
            <div class="km-stat-card" style="border-color: #27ae60;"><span class="km-stat-title">Projection (+1h)</span><span class="km-stat-value" style="color:#27ae60;">${proj} estimés</span></div>
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

    async showGlobalDetails(type, key) {
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
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Répartition par heure (Tous modèles confondus)";
        document.getElementById('modal-weekly-section').style.display = 'block';

        document.getElementById('session-detail-modal').style.display = 'flex';

        let anaData = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;

        // 1. Dessiner le graphique Horaire (Lecture de la mémoire permanente)
        let ctxD = document.getElementById('temporalDensityChart');
        if(ctxD) {
            if(this.temporalChart) this.temporalChart.destroy();
            let hasData = Object.values(anaData.hours).some(v => v > 0);
            if(hasData) {
                let isDark = document.body.classList.contains('dark-mode');
                let tColor = isDark ? '#d2dae2' : '#333';
                this.temporalChart = new Chart(ctxD, {
                    type: 'bar',
                    data: { labels: Object.keys(anaData.hours), datasets: [{ label: 'Véhicules par heure', data: Object.values(anaData.hours), backgroundColor: type === 'trucks' ? '#27ae60' : '#3498db', borderRadius: 4 }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tColor, stepSize: 1 } }, x: { ticks: { color: tColor } } } }
                });
            }
        }

        // 2. Dessiner le graphique Journalier (Lecture de la mémoire permanente)
        let ctxW = document.getElementById('weeklyGlobalChart');
        if(ctxW) {
            if(this.weeklyGlobalChart) this.weeklyGlobalChart.destroy();
            let hasDayData = Object.values(anaData.days).some(v => v > 0);
            if(hasDayData) {
                let isDark = document.body.classList.contains('dark-mode');
                let tColor = isDark ? '#d2dae2' : '#333';
                this.weeklyGlobalChart = new Chart(ctxW, {
                    type: 'bar',
                    data: { labels: Object.keys(anaData.days), datasets: [{ label: 'Véhicules par jour', data: Object.values(anaData.days), backgroundColor: type === 'trucks' ? '#e67e22' : '#9b59b6', borderRadius: 4 }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tColor, stepSize: 1 } }, x: { ticks: { color: tColor } } } }
                });
            }
        }
    },

    renderGlobalStats() {
        let gTruckTotal = 0;
        let truckDataForChart = [];
        let truckLabelsForChart = [];
        let truckHtml = `<div class="km-stat-card" style="border-color:#27ae60; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('trucks', 'Total')"><span class="km-stat-title">Toutes Marques</span><span class="km-stat-value" style="color:#27ae60; font-size:0.9em;">🔍 Voir Détails</span></div>`;
        
        this.brands.forEach(b => {
            let count = (this.globalTruckCounters[b]?.fr || 0) + (this.globalTruckCounters[b]?.etr || 0);
            gTruckTotal += count;
            if (count > 0) {
                truckHtml += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('trucks', '${b}')"><span class="km-stat-title">${b}</span><span class="km-stat-value">${count}</span></div>`;
                truckLabelsForChart.push(b);
                truckDataForChart.push(count);
            }
        });
        
        let ttEl = document.getElementById('global-truck-total'); if(ttEl) ttEl.innerText = gTruckTotal;
        let tlEl = document.getElementById('global-truck-list'); if(tlEl) tlEl.innerHTML = truckHtml;

        let gCarTotal = 0;
        let carDataForChart = [];
        let carLabelsForChart = [];
        let carHtml = `<div class="km-stat-card" style="border-color:#3498db; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('cars', 'Total')"><span class="km-stat-title">Tous Véhicules</span><span class="km-stat-value" style="color:#3498db; font-size:0.9em;">🔍 Voir Détails</span></div>`;
        
        this.vehicleTypes.forEach(v => {
            let count = this.globalCarCounters[v] || 0;
            gCarTotal += count;
            if (count > 0) {
                carHtml += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('cars', '${v}')"><span class="km-stat-title">${v}</span><span class="km-stat-value">${count}</span></div>`;
                carLabelsForChart.push(v);
                carDataForChart.push(count);
            }
        });
        
        let ctEl = document.getElementById('global-car-total'); if(ctEl) ctEl.innerText = gCarTotal;
        let clEl = document.getElementById('global-car-list'); if(clEl) clEl.innerHTML = carHtml;

        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#d2dae2' : '#2c3e50';
        const colors = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'];

        const ctxTruck = document.getElementById('globalTruckChart');
        if (ctxTruck) {
            if (this.truckChart) this.truckChart.destroy();
            if (truckDataForChart.length > 0) {
                this.truckChart = new Chart(ctxTruck, {
                    type: 'doughnut',
                    data: { labels: truckLabelsForChart, datasets: [{ data: truckDataForChart, backgroundColor: colors, borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
                });
            }
        }

        const ctxCar = document.getElementById('globalCarChart');
        if (ctxCar) {
            if (this.carChart) this.carChart.destroy();
            if (carDataForChart.length > 0) {
                this.carChart = new Chart(ctxCar, {
                    type: 'doughnut',
                    data: { labels: carLabelsForChart, datasets: [{ data: carDataForChart, backgroundColor: colors, borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
                });
            }
        }
    },

    async renderAnalytics(type) {
        let btn1 = document.getElementById('btn-ana-trucks');
        let btn2 = document.getElementById('btn-ana-cars');
        if(btn1 && btn2) {
            btn1.style.backgroundColor = type === 'trucks' ? '#e67e22' : 'var(--btn-bg)';
            btn1.style.color = type === 'trucks' ? 'white' : 'var(--btn-text)';
            btn2.style.backgroundColor = type === 'cars' ? '#e67e22' : 'var(--btn-bg)';
            btn2.style.color = type === 'cars' ? 'white' : 'var(--btn-text)';
        }

        // LECTURE DIRECTE DE LA MEMOIRE PERMANENTE (Au lieu de parser les sessions !)
        let anaData = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;

        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#d2dae2' : '#2c3e50';

        let ctxW = document.getElementById('weeklyChart');
        if(ctxW) {
            if(this.weeklyChart) this.weeklyChart.destroy();
            this.weeklyChart = new Chart(ctxW, {
                type: 'line',
                data: { labels: Object.keys(anaData.days), datasets: [{ label: 'Total cumulé', data: Object.values(anaData.days), borderColor: '#e67e22', backgroundColor: 'rgba(230, 126, 34, 0.2)', fill: true, tension: 0.4 }] },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: textColor } }, x: { ticks: { color: textColor } } } }
            });
        }

        let ctxA = document.getElementById('altitudeChart');
        if(ctxA) {
            if(this.altitudeChart) this.altitudeChart.destroy();
            this.altitudeChart = new Chart(ctxA, {
                type: 'pie',
                data: { labels: Object.keys(anaData.alts), datasets: [{ data: Object.values(anaData.alts), backgroundColor: ['#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
            });
        }

        let seqArr = Object.entries(anaData.seqs).sort((a,b) => b[1] - a[1]).slice(0, 5);
        let seqHtml = '';
        if(seqArr.length === 0) seqHtml = '<p style="color:#7f8c8d; font-size:0.9em;">Pas assez de données pour lier des séquences.</p>';
        seqArr.forEach(item => {
            seqHtml += `<div class="sequence-item"><span class="sequence-flow">${item[0]}</span><span class="sequence-count">${item[1]}x</span></div>`;
        });
        document.getElementById('sequence-container').innerHTML = seqHtml;
    },

    async showSessionDetails(type, sessionId) {
        let session = await this.idb.getById(sessionId);
        if(!session) return;

        let items = session.history ? session.history.filter(h => !h.isEvent) : [];
        let itemsCount = items.length;
        
        let freq = itemsCount > 0 && session.durationSec > 0 ? (session.durationSec / 60 / itemsCount).toFixed(1) : '-';
        let speed = session.durationSec > 0 ? (itemsCount / (session.durationSec / 3600)).toFixed(1) : '-';
        let dist = session.distanceKm || 0;
        let avgSpeedKmh = session.durationSec > 0 ? (dist / (session.durationSec / 3600)).toFixed(1) : '-';
        let avgKm = dist > 0 ? (itemsCount / dist).toFixed(1) : '-';

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
            <div class="session-detail-row"><span class="session-detail-label">Moyenne</span><span class="session-detail-value">${avgKm} /km</span></div>
        `;
        document.getElementById('modal-session-title').innerText = type === 'trucks' ? '🚛 Détails Session Camions' : '🚗 Détails Session Véhicules';
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Densité Temporelle (Session)";
        document.getElementById('modal-weekly-section').style.display = 'none'; // Cache les jours pour une session unique

        document.getElementById('session-detail-modal').style.display = 'flex';

        let ctxD = document.getElementById('temporalDensityChart');
        if(ctxD) {
            if(this.temporalChart) this.temporalChart.destroy();
            
            if(itemsCount > 0) {
                let firstTime = items[0].timestamp;
                let blocks = {};
                
                items.forEach(h => {
                    let minOffset = Math.floor((h.timestamp - firstTime) / 60000);
                    let blockIndex = Math.floor(minOffset / 5) * 5; 
                    let label = `+${blockIndex}m`;
                    blocks[label] = (blocks[label] || 0) + 1;
                });
                
                let isDark = document.body.classList.contains('dark-mode');
                let tColor = isDark ? '#d2dae2' : '#333';
                
                this.temporalChart = new Chart(ctxD, {
                    type: 'bar',
                    data: { labels: Object.keys(blocks), datasets: [{ label: 'Véhicules / 5 min', data: Object.values(blocks), backgroundColor: '#3498db', borderRadius: 4 }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tColor, stepSize: 1 } }, x: { ticks: { color: tColor } } } }
                });
            }
        }
    },

    async triggerDownloadOrShare(dataString, fileName) {
        const file = new File([dataString], fileName, { type: "text/plain" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ title: 'Export Compteur Trafic', text: 'Voici mes données.', files: [file] }); return; } catch (err) {}
        }
        const blob = new Blob([dataString], { type: "text/plain" });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement("a"); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
    },

    async exportSingleSession(event, type, sessionId) {
        event.stopPropagation();
        let session = await this.idb.getById(sessionId);
        if(!session) return;
        let exportData = { appVersion: "Compteur Trafic v5.1", exportDate: new Date().toISOString(), sessionType: type, session: session };
        const dataStr = JSON.stringify(exportData, null, 2);
        let safeDate = session.date.replace(/[\/ :]/g, '_');
        await this.triggerDownloadOrShare(dataStr, `Compteur_Session_${type}_${safeDate}.txt`);
    },

    async exportSaveFile() {
        let truckSessions = await this.idb.getAll('trucks');
        let carSessions = await this.idb.getAll('cars');

        let enrichedTruckSessions = truckSessions.map(s => {
            let count = s.history ? s.history.filter(h => !h.isEvent).length : 0;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(s.durationSec / 60 / count).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            let espaceTemps = count > 1 ? +(s.durationSec / count).toFixed(1) : 0;
            return { ...s, totalCount: count, camionsParKm: vehPerKm, frequenceMinutes: freqMin, vitesseMoyenneKmh: avgSpeed, espacementMoyenSec: espaceTemps };
        });

        let enrichedCarSessions = carSessions.map(s => {
            let count = s.history ? s.history.filter(h => !h.isEvent).length : 0;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(s.durationSec / 60 / count).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            let espaceTemps = count > 1 ? +(s.durationSec / count).toFixed(1) : 0;
            return { ...s, totalCount: count, vehiculesParKm: vehPerKm, frequenceMinutes: freqMin, vitesseMoyenneKmh: avgSpeed, espacementMoyenSec: espaceTemps };
        });

        let allSessions = [...enrichedTruckSessions, ...enrichedCarSessions];
        
        // On inclut les analyses permanentes dans l'export pour ne pas les perdre
        let globalSummary = { 
            profile: this.activeProfile, 
            totalSessions: allSessions.length, 
            globalDonneesBrutesCamions: this.globalTruckCounters, 
            globalDonneesBrutesVehicules: this.globalCarCounters,
            analysesPermanentesCamions: this.globalAnaTrucks,
            analysesPermanentesVehicules: this.globalAnaCars
        };

        let exportData = { appVersion: "Compteur Trafic v5.1", exportDate: new Date().toISOString(), globalSummary: globalSummary, sessions: allSessions };
        const dataStr = JSON.stringify(exportData, null, 2);
        const fileName = `Compteur_Export_${this.activeProfile}_${new Date().toISOString().slice(0,10)}.txt`;
        
        await this.triggerDownloadOrShare(dataStr, fileName);
    },

    importSaveFile(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.sessions && confirm(`⚠️ Attention : L'importation va remplacer l'historique actuel pour le profil "${this.activeProfile}". Continuer ?`)) {
                    await this.idb.clear('trucks'); await this.idb.clear('cars');
                    for (let s of data.sessions) { if (!s.id) s.id = Date.now().toString() + Math.random().toString(); s.profile = this.activeProfile; await this.idb.add(s); }
                    
                    if (data.globalSummary?.globalDonneesBrutesCamions) this.storage.set('globalTruckCounters', JSON.stringify(data.globalSummary.globalDonneesBrutesCamions));
                    if (data.globalSummary?.globalDonneesBrutesVehicules) this.storage.set('globalCarCounters', JSON.stringify(data.globalSummary.globalDonneesBrutesVehicules));
                    if (data.globalSummary?.analysesPermanentesCamions) this.storage.set('globalAnaTrucks', JSON.stringify(data.globalSummary.analysesPermanentesCamions));
                    if (data.globalSummary?.analysesPermanentesVehicules) this.storage.set('globalAnaCars', JSON.stringify(data.globalSummary.analysesPermanentesVehicules));
                    
                    alert("✅ Historique et analyses importés avec succès ! Redémarrage..."); location.reload();
                } else if(!data.sessions) { alert("❌ Format non reconnu."); }
            } catch (err) { alert("❌ Fichier invalide ou corrompu !"); }
        }; reader.readAsText(file);
    },

    async renderAdvancedStats(type) {
        let historyContainer = document.getElementById(type === 'trucks' ? 'truck-history-container' : 'car-history-container');
        let sessionsContainer = document.getElementById(type === 'trucks' ? 'truck-sessions-container' : 'car-sessions-container');
        if (!historyContainer || !sessionsContainer) return;

        let currentHistory = type === 'trucks' ? this.truckHistory : this.carHistory;
        historyContainer.innerHTML = '';
        if (currentHistory.length === 0) { historyContainer.innerHTML = '<div class="history-item">Aucune donnée pour la session en cours. 🛣️</div>'; } 
        else {
            currentHistory.slice().reverse().forEach((item, index) => {
                let realIndex = currentHistory.length - 1 - index;
                let title = item.isEvent ? item.eventType : (type === 'trucks' ? `${item.brand} (${item.type === 'fr' ? '🇫🇷' : '🌍'})` : item.type);
                let titleStyle = item.isEvent ? 'color: #f39c12;' : '';
                historyContainer.innerHTML += `<div class="history-item"><div class="history-item-header"><strong style="${titleStyle}">${title}</strong><span class="history-meta">⏱️ ${item.chronoTime} | 📍 ${item.lat ? parseFloat(item.lat).toFixed(4) : '?'}</span><button class="btn-del-history" onclick="window.app.${type === 'trucks' ? 'deleteTruckHistoryItem' : 'deleteCarHistoryItem'}(${realIndex})">🗑️</button></div></div>`;
            });
        }

        let sessions = await this.idb.getAll(type);
        sessions.sort((a, b) => b.id - a.id);
        
        sessionsContainer.innerHTML = '';
        if (sessions.length === 0) { sessionsContainer.innerHTML = '<div class="history-item">Aucune session sauvegardée pour ce profil. 🚦</div>'; } 
        else {
            sessions.forEach((session) => {
                let itemsCount = session.history ? session.history.filter(h => !h.isEvent).length : 0;
                let durationTxt = session.durationSec ? this.formatTime(session.durationSec) : "00:00:00";
                sessionsContainer.innerHTML += `
                    <div class="history-item clickable" onclick="window.app.showSessionDetails('${type}', '${session.id}')" style="cursor: pointer; background: var(--card-bg); padding: 10px; border-radius: 6px; margin-bottom: 5px; box-shadow: 0 1px 2px var(--shadow); position: relative;">
                        <div class="history-item-header" style="pointer-events: none; padding-right: 40px;">
                            <strong>📅 ${session.date.split(' ')[0]} <span style="font-size:0.8em; color:#7f8c8d; font-weight:normal;">(${session.endAddress ? session.endAddress.split(',')[0] : 'Inconnu'})</span></strong>
                            <span class="history-meta" style="color: #2980b9; font-weight: bold;">⏱️ ${durationTxt} | 📍 ${session.distanceKm || 0} km | 👁️ ${itemsCount} comptés</span>
                        </div>
                        <button onclick="window.app.exportSingleSession(event, '${type}', '${session.id}')" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: #2980b9; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 1.1em; cursor: pointer; z-index: 2; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">📤</button>
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
