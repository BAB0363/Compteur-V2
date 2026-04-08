// jsapp.js
import { ui } from './jsui.js';
import { gps } from './jsgps.js';
import { ml } from './jsml.js';

window.ui = ui; window.gps = gps; window.ml = ml;

const app = {
    currentUser: localStorage.getItem('currentUser') || 'Sylvain',
    currentMode: localStorage.getItem('currentMode') || 'voiture',
    usersList: JSON.parse(localStorage.getItem('usersList')) || ['Sylvain'],

    // ⚖️ Dictionnaire des poids
    vehicleWeights: {
        "Voitures": 1350,
        "Utilitaires": 2150,
        "Motos": 210,
        "Camions": 18000,
        "Camping-cars": 3150,
        "Bus/Car": 14000,
        "Engins agricoles": 6000,
        "Vélos": 20
    },

    // ⚖️ Fonction de formatage (passe en tonnes si > 1000 kg)
    formatWeight(kg) {
        if (!kg) return "0 kg";
        return kg >= 1000 ? (kg / 1000).toFixed(1) + " t" : kg + " kg";
    },

    storage: {
        state: {},
        init() {
            let key = `appState_${window.app.currentUser}_${window.app.currentMode}`;
            let data = localStorage.getItem(key);
            this.state = data ? JSON.parse(data) : {};
        },
        get(k) { return this.state[k] !== undefined ? this.state[k] : null; },
        set(k, v) { 
            this.state[k] = v; 
            let key = `appState_${window.app.currentUser}_${window.app.currentMode}`;
            localStorage.setItem(key, JSON.stringify(this.state));
        },
        clearAll() {
            this.state = {};
            let key = `appState_${window.app.currentUser}_${window.app.currentMode}`;
            localStorage.removeItem(key);
        }
    },

    getRoadType(speedKmh, mode) {
        if (speedKmh === 0) return "Inconnu";
        if (mode === 'voiture') {
            if (speedKmh <= 50) return "Ville (0-50 km/h)";
            if (speedKmh <= 100) return "Route (50-100 km/h)";
            return "Autoroute (>100 km/h)";
        } else {
            if (speedKmh <= 40) return "Ville (0-40 km/h)";
            if (speedKmh <= 80) return "Route (40-80 km/h)";
            return "Autoroute (>80 km/h)";
        }
    },

    brands: ["Renault Trucks", "Mercedes-Benz", "Volvo Trucks", "Scania", "DAF", "MAN", "Iveco", "Ford Trucks"],
    vehicleTypes: ["Voitures", "Utilitaires", "Motos", "Camions", "Camping-cars", "Bus/Car", "Engins agricoles", "Vélos"],
    
    truckCounters: {}, vehicleCounters: {},
    globalTruckCounters: {}, globalCarCounters: {}, 
    truckHistory: [], carHistory: [],
    
    globalAnaTrucks: null, globalAnaCars: null,
    sessionTruckPredictions: { total: 0, success: 0 },
    sessionCarPredictions: { total: 0, success: 0 },

    globalTruckDistance: 0, globalCarDistance: 0,
    globalTruckTime: 0, globalCarTime: 0,
    lastGlobalTruckTick: 0, lastGlobalCarTick: 0,

    truckSeconds: 0, truckAccumulatedTime: 0, truckStartTime: 0, isTruckRunning: false,
    carSeconds: 0, carAccumulatedTime: 0, carStartTime: 0, isCarRunning: false,
    
    truckInterval: null, carInterval: null,
    liveTruckDistance: 0, liveCarDistance: 0,
    wakeLock: null, 
    
    mainDashboardChart: null, natChart: null,
    temporalChart: null, weeklyChart: null, altitudeChart: null, weeklyGlobalChart: null,
    altitudeModalChart: null, monthlyChart: null, roadTypeChart: null, monthlyModalChart: null, roadModalChart: null,
    aiEvolutionChart: null, 

    currentDashboardFilter: 'all',
    activeDashboardType: 'trucks',
    currentPredictionTruck: null, 
    currentPredictionCar: null,

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
                req.onsuccess = e => resolve(e.target.result.filter(s => s.sessionType === type && s.user === window.app.currentUser && s.mode === window.app.currentMode));
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
                let all = await window.app.idb.getAll(type);
                let tx = this.db.transaction('sessions', 'readwrite');
                let store = tx.objectStore('sessions');
                all.forEach(s => store.delete(s.id));
                tx.oncomplete = () => resolve();
            });
        }
    },

    getEmptyAnalytics() {
        let hours = {}; for(let i=0; i<24; i++) hours[`${i}h`] = 0;
        return {
            hours: hours,
            days: { "Dim":0, "Lun":0, "Mar":0, "Mer":0, "Jeu":0, "Ven":0, "Sam":0 },
            months: { "Jan":0, "Fév":0, "Mar":0, "Avr":0, "Mai":0, "Juin":0, "Juil":0, "Aoû":0, "Sep":0, "Oct":0, "Nov":0, "Déc":0 },
            roads: { "Inconnu": 0, "Ville (0-50 km/h)": 0, "Route (50-100 km/h)": 0, "Autoroute (>100 km/h)": 0, "Ville (0-40 km/h)": 0, "Route (40-80 km/h)": 0, "Autoroute (>80 km/h)": 0 },
            alts: { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 },
            byVeh: {}, seqs: {}, seqs3: {}, lastVehicles: [], predictions: { total: 0, success: 0 }
        };
    },

    async buildPermanentAnalyticsFromIDB(type, targetAna) {
        let sessions = await this.idb.getAll(type);
        let dayKeys = Object.keys(targetAna.days);
        let monthKeys = Object.keys(targetAna.months);
        
        if (!targetAna.byVeh) targetAna.byVeh = {};
        if (!targetAna.seqs3) targetAna.seqs3 = {};
        if (!targetAna.lastVehicles) targetAna.lastVehicles = [];
        if (!targetAna.months) targetAna.months = this.getEmptyAnalytics().months;
        if (!targetAna.roads) targetAna.roads = this.getEmptyAnalytics().roads;

        sessions.forEach(s => {
            if (s.history) {
                let hist = s.history.filter(h => !h.isEvent);
                let sessionLastVehicles = []; 
                
                for(let i = 0; i < hist.length; i++) {
                    let h = hist[i];
                    let vehType = type === 'trucks' ? h.brand : h.type;

                    if (!targetAna.byVeh[vehType]) targetAna.byVeh[vehType] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
                    if (!targetAna.byVeh[vehType].months) targetAna.byVeh[vehType].months = {};
                    if (!targetAna.byVeh[vehType].roads) targetAna.byVeh[vehType].roads = {};

                    if (h.timestamp) {
                        let d = new Date(h.timestamp);
                        targetAna.hours[`${d.getHours()}h`]++;
                        targetAna.days[dayKeys[d.getDay()]]++;
                        targetAna.months[monthKeys[d.getMonth()]]++;
                        
                        targetAna.byVeh[vehType].hours[`${d.getHours()}h`] = (targetAna.byVeh[vehType].hours[`${d.getHours()}h`] || 0) + 1;
                        targetAna.byVeh[vehType].days[dayKeys[d.getDay()]] = (targetAna.byVeh[vehType].days[dayKeys[d.getDay()]] || 0) + 1;
                        targetAna.byVeh[vehType].months[monthKeys[d.getMonth()]] = (targetAna.byVeh[vehType].months[monthKeys[d.getMonth()]] || 0) + 1;
                    }
                    
                    let altVal = h.alt || 0;
                    let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                    targetAna.alts[altKey]++;
                    targetAna.byVeh[vehType].alts[altKey] = (targetAna.byVeh[vehType].alts[altKey] || 0) + 1;

                    let roadKey = h.road || "Inconnu";
                    targetAna.roads[roadKey] = (targetAna.roads[roadKey] || 0) + 1;
                    targetAna.byVeh[vehType].roads[roadKey] = (targetAna.byVeh[vehType].roads[roadKey] || 0) + 1;

                    if (sessionLastVehicles.length >= 1) {
                        let pair = `${sessionLastVehicles[sessionLastVehicles.length - 1]} ➡️ ${vehType}`;
                        targetAna.seqs[pair] = (targetAna.seqs[pair] || 0) + 1;
                    }
                    if (sessionLastVehicles.length >= 2) {
                        let triplet = `${sessionLastVehicles[0]} ➡️ ${sessionLastVehicles[1]} ➡️ ${vehType}`;
                        targetAna.seqs3[triplet] = (targetAna.seqs3[triplet] || 0) + 1;
                    }

                    sessionLastVehicles.push(vehType);
                    if (sessionLastVehicles.length > 2) sessionLastVehicles.shift();
                }
            }
        });
    },

    async migrateData() {
        this.storage.init();
        const keys = [
            'truckCounters', 'vehicleCounters', 'globalTruckCounters', 'globalCarCounters', 
            'truckHistory', 'carHistory', 'globalTruckDistance', 'globalCarDistance', 
            'globalTruckTime', 'globalCarTime', 'truckChronoSec', 'truckAccumulatedTime', 
            'truckStartTime', 'truckChronoRun', 'carChronoSec', 'carAccumulatedTime', 
            'carStartTime', 'carChronoRun', 'liveTruckDist', 'liveCarDist', 
            'globalAnaTrucks', 'globalAnaCars'
        ];
        
        let hasMigrated = false;
        keys.forEach(k => {
            let oldKey = this.currentUser + '_' + this.currentMode + '_' + k;
            let val = localStorage.getItem(oldKey);
            if (val !== null) { 
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (!isNaN(val) && val.trim() !== '') val = Number(val);
                else { try { val = JSON.parse(val); } catch(e) { } }
                this.storage.set(k, val); 
                localStorage.removeItem(oldKey); 
                hasMigrated = true;
            }
        });

        let allSessions = await this.idb.getAllRaw();
        if (allSessions.length > 0) {
            let tx = this.idb.db.transaction('sessions', 'readwrite');
            let store = tx.objectStore('sessions');
            allSessions.forEach(s => { 
                if (!s.user) { 
                    s.user = 'Sylvain'; s.mode = s.profile || 'voiture'; s.profile = 'Sylvain_' + s.mode; store.put(s); 
                } 
            });
        }
    },

    updateHeaderDisplay() {
        let elUser = document.getElementById('display-user');
        let elMode = document.getElementById('display-mode');
        if(elUser) elUser.innerText = this.currentUser;
        if(elMode) elMode.innerText = this.currentMode === 'voiture' ? '🚗 Voiture' : '🚛 Camion';
    },

    createUser() {
        let input = document.getElementById('new-user-input');
        if(!input) return;
        let newName = input.value.trim();
        if(newName && !this.usersList.includes(newName)) {
            this.usersList.push(newName);
            localStorage.setItem('usersList', JSON.stringify(this.usersList));
            input.value = '';
            this.changeUser(newName);
        } else if (this.usersList.includes(newName)) {
            if(window.ui) window.ui.showToast("❌ Cet utilisateur existe déjà");
        }
    },

    deleteUser() {
        if(this.usersList.length <= 1) {
            if(window.ui) window.ui.showToast("⚠️ Impossible de supprimer le dernier utilisateur !");
            return;
        }
        if(confirm(`⚠️ Supprimer définitivement le profil de ${this.currentUser} et TOUTES ses données locales ?`)) {
            this.storage.clearAll();
            this.usersList = this.usersList.filter(u => u !== this.currentUser);
            localStorage.setItem('usersList', JSON.stringify(this.usersList));
            this.changeUser(this.usersList[0]);
        }
    },

    async changeUser(newUser) {
        if (this.isTruckRunning) this.toggleChrono('trucks');
        if (this.isCarRunning) this.toggleChrono('cars');

        this.currentUser = newUser;
        localStorage.setItem('currentUser', newUser);
        await this.init(true);
        if (window.ui) window.ui.showToast(`👤 Utilisateur changé : ${newUser}`);
    },

    async changeMode(newMode) {
        if (this.isTruckRunning) this.toggleChrono('trucks');
        if (this.isCarRunning) this.toggleChrono('cars');

        this.currentMode = newMode;
        localStorage.setItem('currentMode', newMode);
        await this.init(true);
        if (window.ui) window.ui.showToast(`🔄 Mode changé : ${newMode === 'voiture' ? '🚘 Voiture' : '🚛 Camion'}`);
    },

    async init(isProfileSwitch = false) {
        if (!isProfileSwitch) { await this.idb.init(); await this.migrateData(); }
        if (window.ml) await window.ml.init();

        this.storage.init();

        let userSel = document.getElementById('user-selector');
        if(userSel) {
            userSel.innerHTML = '';
            this.usersList.forEach(u => {
                let opt = document.createElement('option');
                opt.value = u; opt.innerText = "👤 " + u;
                if(u === this.currentUser) opt.selected = true;
                userSel.appendChild(opt);
            });
        }

        let modeSel = document.getElementById('mode-selector');
        if (modeSel) modeSel.value = this.currentMode;

        this.updateHeaderDisplay();

        if (this.truckInterval) clearInterval(this.truckInterval);
        if (this.carInterval) clearInterval(this.carInterval);

        this.truckCounters = this.storage.get('truckCounters') || {};
        this.vehicleCounters = this.storage.get('vehicleCounters') || {};
        this.globalTruckCounters = this.storage.get('globalTruckCounters') || {};
        this.globalCarCounters = this.storage.get('globalCarCounters') || {};
        this.truckHistory = this.storage.get('truckHistory') || [];
        this.carHistory = this.storage.get('carHistory') || [];
        
        this.globalAnaTrucks = this.storage.get('globalAnaTrucks');
        if (!this.globalAnaTrucks || !this.globalAnaTrucks.months) { 
            this.globalAnaTrucks = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('trucks', this.globalAnaTrucks);
        }
        if (!this.globalAnaTrucks.predictions) this.globalAnaTrucks.predictions = { total: 0, success: 0 };
        if (!this.globalAnaTrucks.byVeh) this.globalAnaTrucks.byVeh = {};
        if (!this.globalAnaTrucks.seqs3) this.globalAnaTrucks.seqs3 = {};
        if (!this.globalAnaTrucks.lastVehicles) this.globalAnaTrucks.lastVehicles = [];
        this.storage.set('globalAnaTrucks', this.globalAnaTrucks);

        this.globalAnaCars = this.storage.get('globalAnaCars');
        if (!this.globalAnaCars || !this.globalAnaCars.months) { 
            this.globalAnaCars = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('cars', this.globalAnaCars);
        }
        if (!this.globalAnaCars.predictions) this.globalAnaCars.predictions = { total: 0, success: 0 };
        if (!this.globalAnaCars.byVeh) this.globalAnaCars.byVeh = {};
        if (!this.globalAnaCars.seqs3) this.globalAnaCars.seqs3 = {};
        if (!this.globalAnaCars.lastVehicles) this.globalAnaCars.lastVehicles = [];
        this.storage.set('globalAnaCars', this.globalAnaCars);

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
        this.isTruckRunning = this.storage.get('truckChronoRun') === true;

        this.carSeconds = parseInt(this.storage.get('carChronoSec')) || 0;
        this.carAccumulatedTime = parseInt(this.storage.get('carAccumulatedTime')) || 0;
        this.carStartTime = parseInt(this.storage.get('carStartTime')) || 0;
        this.isCarRunning = this.storage.get('carChronoRun') === true;

        this.liveTruckDistance = parseFloat(this.storage.get('liveTruckDist')) || 0;
        this.liveCarDistance = parseFloat(this.storage.get('liveCarDist')) || 0;

        if (!this.isTruckRunning) this.truckAccumulatedTime = this.truckSeconds;
        if (!this.isCarRunning) this.carAccumulatedTime = this.carSeconds;

        if (this.isTruckRunning) { this.isTruckRunning = false; this.toggleChrono('trucks'); } else this.updateChronoDisp('trucks');
        if (this.isCarRunning) { this.isCarRunning = false; this.toggleChrono('cars'); } else this.updateChronoDisp('cars');
        
        this.renderTrucks(); this.renderCars(); this.renderKmStats();
        this.renderLiveStats('trucks'); this.renderLiveStats('cars');
        
        this.renderDashboard('trucks');
        this.updatePrediction('trucks');
        this.updatePrediction('cars');

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
        } catch (e) { console.warn("Wake Lock refusé"); }
    },

    formatTime(totalSec) {
        let h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
        let m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
        let s = (totalSec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    },

    updateChronoDisp(type) {
        let isTruck = type === 'trucks';
        let elTime = document.getElementById(isTruck ? 'truck-chrono' : 'car-chrono');
        let elDist = document.getElementById(isTruck ? 'truck-dist' : 'car-dist');
        let sec = isTruck ? this.truckSeconds : this.carSeconds;
        let dist = isTruck ? this.liveTruckDistance : this.liveCarDistance;

        if(elTime) elTime.innerText = `⏱️ ${this.formatTime(sec)}`; 
        if(elDist) elDist.innerText = `📍 ${dist.toFixed(2)} km`; 
    },

    toggleChrono(type) {
        let isTruck = type === 'trucks';
        let isRunning = isTruck ? this.isTruckRunning : this.isCarRunning;
        isRunning = !isRunning; 
        
        if (isTruck) { this.isTruckRunning = isRunning; this.storage.set('truckChronoRun', isRunning); } 
        else { this.isCarRunning = isRunning; this.storage.set('carChronoRun', isRunning); }

        const btn = document.getElementById(isTruck ? 'btn-truck-chrono' : 'btn-car-chrono'); 
        if(!btn) return;
        
        let seconds = isTruck ? this.truckSeconds : this.carSeconds;
        let hist = isTruck ? this.truckHistory : this.carHistory;
        
        let eventType = isRunning ? "▶️ Reprise" : "⏸️ Pause";
        let histItem = { 
            isEvent: true, eventType: eventType, 
            lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, 
            lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, 
            alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, 
            chronoTime: this.formatTime(seconds), timestamp: Date.now() 
        };
        
        hist.push(histItem);
        this.storage.set(isTruck ? 'truckHistory' : 'carHistory', hist);
        
        let statsView = document.getElementById(isTruck ? 'truck-stats-view' : 'car-stats-view');
        if (statsView && statsView.style.display !== 'none') this.renderAdvancedStats(type);

        if (isRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            let startTime = Date.now();
            
            if(isTruck) { 
                this.truckStartTime = startTime; this.storage.set('truckStartTime', startTime); 
                this.lastGlobalTruckTick = startTime; 
            } else { 
                this.carStartTime = startTime; this.storage.set('carStartTime', startTime); 
                this.lastGlobalCarTick = startTime; 
            }
            
            let interval = setInterval(() => { 
                let now = Date.now();
                if(isTruck) {
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
                } else {
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
                }
                this.updateChronoDisp(type); 
                this.renderLiveStats(type);
            }, 1000); 
            
            if(isTruck) this.truckInterval = interval; else this.carInterval = interval;
            
        } else { 
            btn.innerText = "▶️ Start"; btn.classList.remove('running'); 
            if(isTruck) {
                clearInterval(this.truckInterval); 
                this.truckAccumulatedTime = this.truckSeconds;
                this.storage.set('truckAccumulatedTime', this.truckAccumulatedTime);
                this.globalAnaTrucks.lastVehicles = []; 
                this.storage.set('globalAnaTrucks', this.globalAnaTrucks);
            } else {
                clearInterval(this.carInterval); 
                this.carAccumulatedTime = this.carSeconds;
                this.storage.set('carAccumulatedTime', this.carAccumulatedTime);
                this.globalAnaCars.lastVehicles = []; 
                this.storage.set('globalAnaCars', this.globalAnaCars);
            }
        }
    },

    updateCounter(mode, key1, key2, amount, e) {
        let isTruck = mode === 'trucks';
        if (isTruck && !this.isTruckRunning) { alert("Lance le chrono Camions d'abord ! ⏱️"); return; }
        if (!isTruck && !this.isCarRunning) { alert("Lance le chrono Véhicules d'abord ! ⏱️"); return; }

        let counters = isTruck ? this.truckCounters : this.vehicleCounters;
        let globalCounters = isTruck ? this.globalTruckCounters : this.globalCarCounters;
        let history = isTruck ? this.truckHistory : this.carHistory;
        let ana = isTruck ? this.globalAnaTrucks : this.globalAnaCars;
        let sessionPreds = isTruck ? this.sessionTruckPredictions : this.sessionCarPredictions;
        let currPred = isTruck ? this.currentPredictionTruck : this.currentPredictionCar;

        if (isTruck) {
            if (!counters[key1]) counters[key1] = { fr: 0, etr: 0 };
            if (!globalCounters[key1]) globalCounters[key1] = { fr: 0, etr: 0 };
        } else {
            if (typeof counters[key1] === 'undefined') counters[key1] = 0;
            if (typeof globalCounters[key1] === 'undefined') globalCounters[key1] = 0;
        }

        let currentCount = isTruck ? counters[key1][key2] : counters[key1];

        if (currentCount + amount >= 0) {
            if (window.ui) window.ui.playBeep(amount > 0);
            
            if (amount > 0) {
                if (window.gami) window.gami.notifyVehicleAdded(key1, key2);

                if (currPred) {
                    ana.predictions.total++;
                    sessionPreds.total++;
                    let isExact = isTruck ? (currPred.brand === key1 && currPred.nat === key2) : (currPred.type === key1);
                    if (isExact) {
                        ana.predictions.success++;
                        sessionPreds.success++;
                        if(window.ui) window.ui.showToast("🔮 Prédiction exacte !");
                    }
                }

                if (isTruck) { counters[key1][key2] += amount; globalCounters[key1][key2] += amount; }
                else { counters[key1] += amount; globalCounters[key1] += amount; }

                let nowTs = Date.now();
                let speedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
                let roadType = this.getRoadType(speedKmh, this.currentMode);
                
                let histItem = { 
                    lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, 
                    lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, 
                    alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, 
                    speed: speedKmh, road: roadType, 
                    chronoTime: this.formatTime(isTruck ? this.truckSeconds : this.carSeconds), 
                    timestamp: nowTs 
                };
                
                if (isTruck) { histItem.brand = key1; histItem.type = key2; }
                else { histItem.type = key1; }
                history.push(histItem);

                // NOUVEAU : Vérification d'anomalies ou combos par l'IA
                if (window.ml) {
                    let recentHist = history.filter(h => !h.isEvent);
                    let anomaly = window.ml.checkAnomaly(mode, key1, speedKmh, recentHist);
                    if (anomaly && window.ui) {
                        window.ui.showToast(anomaly.msg, anomaly.type);
                        if (anomaly.type === 'anomaly') window.ui.triggerHapticFeedback('error');
                        else window.ui.triggerHapticFeedback('success');
                    }
                }

                let d = new Date(nowTs);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(ana.days)[d.getDay()];
                let monthKey = Object.keys(ana.months)[d.getMonth()];
                let altVal = histItem.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";

                ana.hours[hourKey]++; ana.days[dayKey]++; ana.months[monthKey]++; ana.alts[altKey]++; 
                ana.roads[roadType] = (ana.roads[roadType] || 0) + 1;

                if (!ana.byVeh[key1]) ana.byVeh[key1] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
                if (!ana.byVeh[key1].months) ana.byVeh[key1].months = {};
                if (!ana.byVeh[key1].roads) ana.byVeh[key1].roads = {};

                ana.byVeh[key1].hours[hourKey] = (ana.byVeh[key1].hours[hourKey] || 0) + 1;
                ana.byVeh[key1].days[dayKey] = (ana.byVeh[key1].days[dayKey] || 0) + 1;
                ana.byVeh[key1].months[monthKey] = (ana.byVeh[key1].months[monthKey] || 0) + 1;
                ana.byVeh[key1].alts[altKey] = (ana.byVeh[key1].alts[altKey] || 0) + 1;
                ana.byVeh[key1].roads[roadType] = (ana.byVeh[key1].roads[roadType] || 0) + 1;

                if (!ana.lastVehicles) ana.lastVehicles = [];
                if (!ana.seqs3) ana.seqs3 = {};

                if (ana.lastVehicles.length >= 1) {
                    let vDernier = ana.lastVehicles[ana.lastVehicles.length - 1];
                    let pair = `${vDernier} ➡️ ${key1}`;
                    ana.seqs[pair] = (ana.seqs[pair] || 0) + 1;
                }
                if (ana.lastVehicles.length >= 2) {
                    let vAvantDernier = ana.lastVehicles[0];
                    let vDernier = ana.lastVehicles[1];
                    let triplet = `${vAvantDernier} ➡️ ${vDernier} ➡️ ${key1}`;
                    ana.seqs3[triplet] = (ana.seqs3[triplet] || 0) + 1;
                }

                ana.lastVehicles.push(key1);
                if (ana.lastVehicles.length > 2) ana.lastVehicles.shift();

                this.storage.set(isTruck ? 'globalAnaTrucks' : 'globalAnaCars', ana);
                this.storage.set(isTruck ? 'truckCounters' : 'vehicleCounters', counters);
                this.storage.set(isTruck ? 'globalTruckCounters' : 'globalCarCounters', globalCounters);
                this.storage.set(isTruck ? 'truckHistory' : 'carHistory', history);

                if(window.ui && e) { 
                    let hapticType = isTruck ? 'truck' : 'car';
                    if (!isTruck) {
                        if(key1 === 'Motos' || key1 === 'Vélos') hapticType = 'moto';
                        if(key1 === 'Engins agricoles' || key1 === 'Camions' || key1 === 'Bus/Car') hapticType = 'tractor';
                    }
                    window.ui.triggerHapticFeedback(hapticType); 
                    window.ui.showClickParticle(e, `+1`, isTruck ? '#27ae60' : '#e74c3c'); 
                }

                if (isTruck) this.renderTrucks(); else this.renderCars();
                this.renderKmStats(); 
                this.renderLiveStats(mode);
                this.updatePrediction(mode);

            } else if (amount < 0) {
                for (let i = history.length - 1; i >= 0; i--) {
                    if (!history[i].isEvent) {
                        let match = isTruck ? (history[i].brand === key1 && history[i].type === key2) : (history[i].type === key1);
                        if (match) { this.deleteHistoryItem(mode, i); return; }
                    }
                }
            }
        }
    },

    deleteHistoryItem(mode, index) {
        let isTruck = mode === 'trucks';
        let history = isTruck ? this.truckHistory : this.carHistory;
        let counters = isTruck ? this.truckCounters : this.vehicleCounters;
        let globalCounters = isTruck ? this.globalTruckCounters : this.globalCarCounters;
        let ana = isTruck ? this.globalAnaTrucks : this.globalAnaCars;

        let item = history[index];
        if (!item) return;

        let vehKey = isTruck ? item.brand : item.type;
        let subKey = isTruck ? item.type : null;

        if (!item.isEvent) {
            if (isTruck) {
                if (counters[vehKey] && counters[vehKey][subKey] > 0) counters[vehKey][subKey]--;
                if (globalCounters[vehKey] && globalCounters[vehKey][subKey] > 0) globalCounters[vehKey][subKey]--;
            } else {
                if (counters[vehKey] > 0) counters[vehKey]--;
                if (globalCounters[vehKey] > 0) globalCounters[vehKey]--;
            }

            if (item.timestamp) {
                let d = new Date(item.timestamp);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(ana.days)[d.getDay()];
                let monthKey = Object.keys(ana.months)[d.getMonth()];
                let altVal = item.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                let roadType = item.road || "Inconnu";

                if(ana.hours[hourKey] > 0) ana.hours[hourKey]--;
                if(ana.days[dayKey] > 0) ana.days[dayKey]--;
                if(ana.months[monthKey] > 0) ana.months[monthKey]--;
                if(ana.alts[altKey] > 0) ana.alts[altKey]--;
                if(ana.roads[roadType] > 0) ana.roads[roadType]--;

                if(ana.byVeh && ana.byVeh[vehKey]) {
                    if(ana.byVeh[vehKey].hours[hourKey] > 0) ana.byVeh[vehKey].hours[hourKey]--;
                    if(ana.byVeh[vehKey].days[dayKey] > 0) ana.byVeh[vehKey].days[dayKey]--;
                    if(ana.byVeh[vehKey].months && ana.byVeh[vehKey].months[monthKey] > 0) ana.byVeh[vehKey].months[monthKey]--;
                    if(ana.byVeh[vehKey].alts[altKey] > 0) ana.byVeh[vehKey].alts[altKey]--;
                    if(ana.byVeh[vehKey].roads && ana.byVeh[vehKey].roads[roadType] > 0) ana.byVeh[vehKey].roads[roadType]--;
                }

                if(index === history.length - 1 && ana.lastVehicles && ana.lastVehicles.length > 0) {
                    ana.lastVehicles.pop();
                }
                this.storage.set(isTruck ? 'globalAnaTrucks' : 'globalAnaCars', ana);
            }
        }

        history.splice(index, 1);

        this.storage.set(isTruck ? 'truckCounters' : 'vehicleCounters', counters);
        this.storage.set(isTruck ? 'globalTruckCounters' : 'globalCarCounters', globalCounters);
        this.storage.set(isTruck ? 'truckHistory' : 'carHistory', history);

        if(window.ui) { 
            window.ui.triggerHapticFeedback('error'); 
            window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Véhicule supprimé"); 
        }

        if (isTruck) this.renderTrucks(); else this.renderCars();
        this.renderKmStats(); 
        this.renderLiveStats(mode);
        this.updatePrediction(mode);
        
        let statsView = document.getElementById(isTruck ? 'truck-stats-view' : 'car-stats-view');
        if (statsView && statsView.style.display !== 'none') this.renderAdvancedStats(mode);
    },

    undoLast() {
        let activeTab = window.ui ? window.ui.activeTab : 'trucks';
        let history = activeTab === 'trucks' ? this.truckHistory : this.carHistory;
        
        if(history.length > 0) { 
            this.deleteHistoryItem(activeTab, history.length - 1);
        } else if(window.ui) { 
            window.ui.showToast("Rien à annuler ! 🤷‍♂️"); 
        }
    },

    resetSessionData(type) {
        let isTruck = type === 'trucks';
        if (isTruck) {
            this.brands.forEach(b => { this.truckCounters[b] = { fr: 0, etr: 0 }; }); 
            this.truckHistory = []; this.truckSeconds = 0; this.truckAccumulatedTime = 0; this.liveTruckDistance = 0;
            this.sessionTruckPredictions = { total: 0, success: 0 };
        } else {
            this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0); 
            this.carHistory = []; this.carSeconds = 0; this.carAccumulatedTime = 0; this.liveCarDistance = 0;
            this.sessionCarPredictions = { total: 0, success: 0 };
        }
        
        this.storage.set(isTruck ? 'truckCounters' : 'vehicleCounters', isTruck ? this.truckCounters : this.vehicleCounters); 
        this.storage.set(isTruck ? 'truckHistory' : 'carHistory', []); 
        this.storage.set(isTruck ? 'truckChronoSec' : 'carChronoSec', 0); 
        this.storage.set(isTruck ? 'truckAccumulatedTime' : 'carAccumulatedTime', 0); 
        this.storage.set(isTruck ? 'liveTruckDist' : 'liveCarDist', 0);
        
        this.updateChronoDisp(type); 
        if (isTruck) this.renderTrucks(); else this.renderCars();
        this.renderKmStats(); 
        this.renderLiveStats(type);
    },

    async stopSession(type) {
        let isTruck = type === 'trucks';
        let isRunning = isTruck ? this.isTruckRunning : this.isCarRunning;
        let seconds = isTruck ? this.truckSeconds : this.carSeconds;
        let history = isTruck ? this.truckHistory : this.carHistory;

        if (isRunning) this.toggleChrono(type); 
        
        if (seconds === 0 && history.length === 0) { 
            this.resetSessionData(type); 
            return; 
        }
        
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { 
            if(window.ui) window.ui.showToast("⏳ Géocodage des adresses en cours...");
            await this.saveSession(type); 
        } 
        else if (confirm("⚠️ La session sera effacée. Confirmer ?")) {
            this.resetSessionData(type);
        }
    },

    async saveSession(type) {
        let isTruck = type === 'trucks';
        let dateStr = new Date().toLocaleString('fr-FR');
        let history = isTruck ? this.truckHistory : this.carHistory;
        
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
            user: this.currentUser,
            mode: this.currentMode,
            profile: this.currentUser + '_' + this.currentMode,
            sessionType: type, 
            startDate: startDateStr, 
            date: dateStr, 
            startAddress: startAddress, 
            endAddress: endAddress, 
            durationSec: isTruck ? this.truckSeconds : this.carSeconds, 
            distanceKm: parseFloat((isTruck ? this.liveTruckDistance : this.liveCarDistance).toFixed(2)), 
            history: history, 
            summary: JSON.parse(JSON.stringify(isTruck ? this.truckCounters : this.vehicleCounters)),
            predictions: isTruck ? { ...this.sessionTruckPredictions } : { ...this.sessionCarPredictions }
        };

        await this.idb.add(newSession);

        if (window.ml) {
            window.ml.trainModel(type).then(success => {
                if (success) window.ml.updateUIStatus();
            });
        }

        this.resetSessionData(type);
        if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
    },

    async resetProfileData() {
        if (confirm(`🚨 ATTENTION SYLVAIN ! Tu es sur le point d'effacer TOUT ton historique, tes sessions, tes stats globales et l'IA pour ton profil actuel (${this.currentUser} - ${this.currentMode}). C'est totalement irréversible. Es-tu VRAIMENT sûr ?`)) {
            
            await this.idb.clear('trucks');
            await this.idb.clear('cars');

            this.storage.clearAll();
            localStorage.removeItem(`gami_state_${this.currentUser}`);

            try {
                if (typeof tf !== 'undefined') {
                    tf.io.removeModel('indexeddb://model-trucks').catch(e => {});
                    tf.io.removeModel('indexeddb://model-cars').catch(e => {});
                }
            } catch(e) {}

            if(window.ui) window.ui.showToast("💥 KABOOM ! Profil entièrement réinitialisé ! Redémarrage...");
            
            setTimeout(() => { location.reload(); }, 1500);
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
            
            container.innerHTML += `
                <div class="brand-card">
                    <div class="brand-name">${brand}</div>
                    <div class="counter-section">
                        <span class="flag">🇫🇷</span>
                        <button class="btn-corr" onclick="window.app.updateCounter('trucks', '${brand}', 'fr', -1, event)">-</button>
                        <span class="score">${fr}</span>
                        <button class="btn-add btn-add-fr" onclick="window.app.updateCounter('trucks', '${brand}', 'fr', 1, event)">+</button>
                    </div>
                    <div class="counter-section">
                        <span class="flag">🌍</span>
                        <button class="btn-corr" onclick="window.app.updateCounter('trucks', '${brand}', 'etr', -1, event)">-</button>
                        <span class="score">${etr}</span>
                        <button class="btn-add btn-add-etr" onclick="window.app.updateCounter('trucks', '${brand}', 'etr', 1, event)">+</button>
                    </div>
                </div>`;
        });

        let gtEl = document.getElementById('grand-total'); if(gtEl) gtEl.innerText = grandTotal; 
        let lnEl = document.getElementById('leader-name'); if(lnEl) lnEl.innerText = maxScore > 0 ? `${leader} (${maxScore})` : "Aucune";
        
        let truckWeightEl = document.getElementById('truck-weight');
        if(truckWeightEl) truckWeightEl.innerText = this.formatWeight(grandTotal * 18000);
        
        let pctFr = grandTotal === 0 ? 50 : Math.round((totalFr / grandTotal) * 100);
        let barFr = document.getElementById('bar-fr'); if(barFr) { barFr.style.width = pctFr + '%'; barFr.innerText = grandTotal > 0 ? `🇫🇷 ${pctFr}%` : ''; }
        let barEtr = document.getElementById('bar-etr'); if(barEtr) { barEtr.style.width = (100 - pctFr) + '%'; barEtr.innerText = grandTotal > 0 ? `🌍 ${100 - pctFr}%` : ''; }
    },

    renderCars() {
        const container = document.getElementById('car-container'); if(!container) return;
        container.innerHTML = ''; 
        let grandTotal = 0; 
        let totalWeightKg = 0; 

        this.vehicleTypes.forEach(v => {
            let count = (this.vehicleCounters[v] || 0);
            grandTotal += count;
            totalWeightKg += count * (this.vehicleWeights[v] || 0); 
        }); 

        let cgt = document.getElementById('car-grand-total'); if(cgt) cgt.innerText = grandTotal;
        let cwEl = document.getElementById('car-weight'); if(cwEl) cwEl.innerText = this.formatWeight(totalWeightKg); 

        const slugMap = { "Voitures": "voitures", "Utilitaires": "utilitaires", "Camions": "camions", "Engins agricoles": "engins", "Bus/Car": "bus", "Camping-cars": "camping", "Motos": "motos", "Vélos": "velos" };
        const nameMap = { "Camions": "Poids Lourds" }; 

        this.vehicleTypes.forEach(v => {
            let pct = grandTotal === 0 ? (100 / this.vehicleTypes.length) : Math.round(((this.vehicleCounters[v]||0) / grandTotal) * 100); 
            let slug = slugMap[v];
            let bar = document.getElementById(`bar-${slug}`);
            if (bar) { bar.style.width = pct + '%'; bar.innerText = (grandTotal > 0 && this.vehicleCounters[v] > 0) ? `${pct}%` : ''; }
        });

        const icons = { Voitures: "🚗", Utilitaires: "🚐", Camions: "🚛", "Engins agricoles": "🚜", "Bus/Car": "🚌", "Camping-cars": "🏕️", Motos: "🏍️", Vélos: "🚲" };
        this.vehicleTypes.forEach(v => {
            let score = this.vehicleCounters[v] || 0;
            let displayName = nameMap[v] || v;
            container.innerHTML += `
                <div class="vehicle-card">
                    <div class="vehicle-name">${icons[v] || "🚘"} ${displayName}</div>
                    <div class="vehicle-controls">
                        <button class="btn-corr" onclick="window.app.updateCounter('cars', '${v}', null, -1, event)">-</button>
                        <span class="vehicle-score">${score}</span>
                        <button class="btn-add btn-add-fr" onclick="window.app.updateCounter('cars', '${v}', null, 1, event)">+</button>
                    </div>
                </div>`;
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
        let rythmeHeure = (sec > 0) ? (count / (sec / 3600)).toFixed(1) + " /h" : "-";

        let espTemps = count > 1 ? (sec / count).toFixed(1) + " s" : "-";
        let espDist = (count > 1 && dist > 0) ? ((dist * 1000) / count).toFixed(0) + " m" : "-";
        let nowTimestamp = Date.now();
        let tenMinsAgo = nowTimestamp - 600000;
        let recentItems = items.filter(h => h.timestamp >= tenMinsAgo);
        let mobilePace = recentItems.length > 0 ? (recentItems.length * 6) + " /h" : "-";
        let ratePerSec = count / (sec || 1);
        let proj = sec > 0 ? Math.round(count + (ratePerSec * 3600)) : "-";

        container.innerHTML = `
            <div class="km-stat-card"><span class="km-stat-title">Vitesse Moy.</span><span class="km-stat-value" style="color:#8e44ad;">${avgSpeed}</span></div>
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
                let gRatio = (truckCount / this.liveTruckDistance).toFixed(1);
                let gFreq = (truckCount > 0 && this.truckSeconds > 0) ? (truckCount / (this.truckSeconds / 60)).toFixed(1) + " /min" : "-";
                
                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${gRatio} /km</span><span class="km-stat-extra">⏱️ ${gFreq}</span></div>`;
                
                let statsArr = [];
                this.brands.forEach(brand => {
                    let count = this.truckCounters[brand] ? (this.truckCounters[brand].fr + this.truckCounters[brand].etr) : 0;
                    if (count > 0) {
                        let ratio = (count / this.liveTruckDistance).toFixed(1);
                        let freq = (this.truckSeconds > 0) ? (count / (this.truckSeconds / 60)).toFixed(1) + " /min" : "-";
                        statsArr.push({ name: brand, ratio: parseFloat(ratio), ratioStr: ratio, freq: freq });
                    }
                });
                
                statsArr.sort((a,b) => b.ratio - a.ratio);
                statsArr.forEach(st => { html += `<div class="km-stat-card"><span class="km-stat-title">${st.name}</span><span class="km-stat-value">${st.ratioStr} /km</span><span class="km-stat-extra">⏱️ ${st.freq}</span></div>`; });
                tContainer.innerHTML = html;
            } else { tContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats... 🚚💨</span>'; }
        }

        let cContainer = document.getElementById('car-km-list');
        if (cContainer) {
            if (this.liveCarDistance > 0) {
                let carCount = this.carHistory.filter(h => !h.isEvent).length;
                let gRatio = (carCount / this.liveCarDistance).toFixed(1);
                let gFreq = (carCount > 0 && this.carSeconds > 0) ? (carCount / (this.carSeconds / 60)).toFixed(1) + " /min" : "-";

                let html = `<div class="km-stat-card" style="border-color: #f39c12;"><span class="km-stat-title">Global</span><span class="km-stat-value">${gRatio} /km</span><span class="km-stat-extra">⏱️ ${gFreq}</span></div>`;
                
                let statsArr = [];
                this.vehicleTypes.forEach(v => {
                    let count = this.vehicleCounters[v] || 0;
                    if (count > 0) {
                        let ratio = (count / this.liveCarDistance).toFixed(1);
                        let freq = (this.carSeconds > 0) ? (count / (this.carSeconds / 60)).toFixed(1) + " /min" : "-";
                        let displayName = v === "Camions" ? "Poids Lourds" : v;
                        statsArr.push({ name: displayName, ratio: parseFloat(ratio), ratioStr: ratio, freq: freq });
                    }
                });
                
                statsArr.sort((a,b) => b.ratio - a.ratio);
                statsArr.forEach(st => { html += `<div class="km-stat-card"><span class="km-stat-title">${st.name}</span><span class="km-stat-value">${st.ratioStr} /km</span><span class="km-stat-extra">⏱️ ${st.freq}</span></div>`; });
                cContainer.innerHTML = html;
            } else { cContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats... 🚗💨</span>'; }
        }
    },

    async showGlobalDetails(type, key) {
        let count = 0, time = 0, dist = 0, title = "", weight = 0;

        if (type === 'trucks') {
            time = this.globalTruckTime; dist = this.globalTruckDistance;
            if (key === 'Total') {
                title = "🚛 Total toutes Marques";
                this.brands.forEach(b => {
                    let c = (this.globalTruckCounters[b]?.fr || 0) + (this.globalTruckCounters[b]?.etr || 0);
                    count += c;
                });
                weight = count * 18000;
            } else {
                title = `🚛 ${key}`; count = (this.globalTruckCounters[key]?.fr || 0) + (this.globalTruckCounters[key]?.etr || 0);
                weight = count * 18000;
            }
        } else {
            time = this.globalCarTime; dist = this.globalCarDistance;
            if (key === 'Total') {
                title = "🚗 Total tous Véhicules";
                this.vehicleTypes.forEach(v => {
                    let c = (this.globalCarCounters[v] || 0);
                    count += c;
                    weight += c * (this.vehicleWeights[v] || 0);
                });
            } else {
                title = `🚘 ${key === 'Camions' ? 'Poids Lourds' : key}`; count = this.globalCarCounters[key] || 0;
                weight = count * (this.vehicleWeights[key === 'Poids Lourds' ? 'Camions' : key] || 0);
            }
        }

        let freq = (count > 0 && time > 0) ? (count / (time / 60)).toFixed(1) + " /min" : "-";
        let speed = (time > 0) ? (count / (time / 3600)).toFixed(1) + " /h" : "-";
        let avgKm = (dist > 0) ? (count / dist).toFixed(2) + " /km" : "-";
        let espTemps = count > 1 ? (time / count).toFixed(1) + " s" : "-";
        let espDist = (count > 1 && dist > 0) ? ((dist * 1000) / count).toFixed(0) + " m" : "-";

        let html = `
            <div class="session-detail-row"><span class="session-detail-label">Temps total cumulé</span><span class="session-detail-value">${this.formatTime(time)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Distance totale cumulée</span><span class="session-detail-value">${dist.toFixed(2)} km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Vitesse Moyenne Globale</span><span class="session-detail-value" style="color:#f39c12;">${time > 0 ? (dist / (time/3600)).toFixed(1) : '-'} km/h</span></div>
            <div style="border-top: 2px dashed var(--border-color); margin: 15px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">Quantité globale comptée</span><span class="session-detail-value" style="color:#27ae60; font-size:1.1em;">${count}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Masse Totale Estimée</span><span class="session-detail-value" style="color:#e67e22; font-weight:bold;">⚖️ ${this.formatWeight(weight)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne par km</span><span class="session-detail-value" style="color:#8e44ad;">${avgKm}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Apparitions par minute</span><span class="session-detail-value">${freq}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme par heure</span><span class="session-detail-value">${speed}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Espacement Moyen</span><span class="session-detail-value">${espTemps} / ${espDist}</span></div>
        `;

        if (key === 'Total') {
             let preds = type === 'trucks' ? this.globalAnaTrucks.predictions : this.globalAnaCars.predictions;
             let predScore = "-";
             if (preds && preds.total > 0) predScore = Math.round((preds.success / preds.total) * 100) + "% (" + preds.success + "/" + preds.total + ")";
             html += `<div style="border-top: 2px dashed var(--border-color); margin: 15px 0;"></div><div class="session-detail-row"><span class="session-detail-label">🔮 Taux de réussite prédictions</span><span class="session-detail-value" style="color:#8e44ad; font-weight:bold;">${predScore}</span></div>`;
        }

        document.getElementById('modal-session-title').innerText = `🌍 Stats Globales : ${title}`;
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Répartition par heure (Tous confondus)";
        document.getElementById('modal-weekly-section').style.display = 'block';

        document.getElementById('session-detail-modal').style.display = 'flex';
        let btnPdf = document.getElementById('btn-export-pdf');
        if(btnPdf) btnPdf.onclick = () => window.app.exportSessionPDF();

        let anaData = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;
        let hoursSource = key === 'Total' ? anaData.hours : (anaData.byVeh[key]?.hours || {});
        let daysSource = key === 'Total' ? anaData.days : (anaData.byVeh[key]?.days || {});
        let altsSource = key === 'Total' ? anaData.alts : (anaData.byVeh[key]?.alts || {});
        let monthsSource = key === 'Total' ? anaData.months : (anaData.byVeh[key]?.months || {});
        let roadsSource = key === 'Total' ? anaData.roads : (anaData.byVeh[key]?.roads || {});

        let isDark = document.body.classList.contains('dark-mode');
        let tColor = isDark ? '#d2dae2' : '#333';

        let ctxD = document.getElementById('temporalDensityChart');
        if(ctxD) {
            if(this.temporalChart) this.temporalChart.destroy();
            let hasData = Object.values(hoursSource).some(v => v > 0);
            if(hasData) {
                this.temporalChart = new Chart(ctxD, {
                    type: 'bar',
                    data: { labels: Object.keys(hoursSource), datasets: [{ label: 'Véhicules par heure', data: Object.values(hoursSource), backgroundColor: type === 'trucks' ? '#27ae60' : '#3498db', borderRadius: 4 }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tColor, stepSize: 1 } }, x: { ticks: { color: tColor } } } }
                });
            }
        }

        let ctxW = document.getElementById('weeklyGlobalChart');
        if(ctxW) {
            if(this.weeklyGlobalChart) this.weeklyGlobalChart.destroy();
            let hasDayData = Object.values(daysSource).some(v => v > 0);
            if(hasDayData) {
                this.weeklyGlobalChart = new Chart(ctxW, {
                    type: 'bar',
                    data: { labels: Object.keys(daysSource), datasets: [{ label: 'Véhicules par jour', data: Object.values(daysSource), backgroundColor: type === 'trucks' ? '#e67e22' : '#9b59b6', borderRadius: 4 }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tColor, stepSize: 1 } }, x: { ticks: { color: tColor } } } }
                });
            }
        }

        let ctxA = document.getElementById('altitudeModalChart');
        if (ctxA) {
            if (this.altitudeModalChart) this.altitudeModalChart.destroy();
            let hasAltData = Object.values(altsSource).some(v => v > 0);
            let altSection = document.getElementById('modal-altitude-section');
            if (altSection) altSection.style.display = hasAltData ? 'block' : 'none';

            if (hasAltData) {
                this.altitudeModalChart = new Chart(ctxA, {
                    type: 'pie',
                    data: { labels: Object.keys(altsSource), datasets: [{ data: Object.values(altsSource), backgroundColor: ['#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: tColor } } } }
                });
            }
        }

        let ctxM = document.getElementById('monthlyModalChart');
        if(ctxM) {
            if(this.monthlyModalChart) this.monthlyModalChart.destroy();
            let hasMonthData = Object.values(monthsSource).some(v => v > 0);
            let monthSection = document.getElementById('modal-monthly-section');
            if (monthSection) monthSection.style.display = hasMonthData ? 'block' : 'none';

            if(hasMonthData) {
                this.monthlyModalChart = new Chart(ctxM, {
                    type: 'bar',
                    data: { labels: Object.keys(monthsSource), datasets: [{ label: 'Véhicules par mois', data: Object.values(monthsSource), backgroundColor: '#8e44ad', borderRadius: 4 }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: tColor, stepSize: 1 } }, x: { ticks: { color: tColor } } } }
                });
            }
        }

        let ctxR = document.getElementById('roadModalChart');
        if (ctxR) {
            if (this.roadModalChart) this.roadModalChart.destroy();
            let hasRoadData = Object.values(roadsSource).some(v => v > 0);
            let roadSection = document.getElementById('modal-road-section');
            if (roadSection) roadSection.style.display = hasRoadData ? 'block' : 'none';

            if (hasRoadData) {
                this.roadModalChart = new Chart(ctxR, {
                    type: 'doughnut',
                    data: { labels: Object.keys(roadsSource), datasets: [{ data: Object.values(roadsSource), backgroundColor: ['#3498db', '#f1c40f', '#e74c3c', '#95a5a6'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: tColor } } } }
                });
            }
        }
    },

    async applyDashboardFilter(filterValue) {
        this.currentDashboardFilter = filterValue;
        await this.renderDashboard(this.activeDashboardType || 'trucks');
    },

    async renderDashboard(type) {
        this.activeDashboardType = type;
        
        let btn1 = document.getElementById('btn-ana-trucks');
        let btn2 = document.getElementById('btn-ana-cars');
        if(btn1 && btn2) {
            btn1.style.backgroundColor = type === 'trucks' ? '#e67e22' : 'var(--btn-bg)';
            btn1.style.color = type === 'trucks' ? 'white' : 'var(--btn-text)';
            btn2.style.backgroundColor = type === 'cars' ? '#e67e22' : 'var(--btn-bg)';
            btn2.style.color = type === 'cars' ? 'white' : 'var(--btn-text)';
        }

        let filter = this.currentDashboardFilter || 'all';
        let sessions = await this.idb.getAll(type);
        let liveHistory = type === 'trucks' ? this.truckHistory : this.carHistory;
        
        let allHistories = [];
        let now = new Date();
        
        if (liveHistory && liveHistory.length > 0) allHistories.push({ history: liveHistory });
        sessions.forEach(s => allHistories.push(s)); 

        let counters = {};
        let alts = { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 };
        let days = { "Dim":0, "Lun":0, "Mar":0, "Mer":0, "Jeu":0, "Ven":0, "Sam":0 };
        let months = { "Jan":0, "Fév":0, "Mar":0, "Avr":0, "Mai":0, "Juin":0, "Juil":0, "Aoû":0, "Sep":0, "Oct":0, "Nov":0, "Déc":0 }; 
        
        let roads = { "Inconnu": 0, "Ville (0-50 km/h)": 0, "Route (50-100 km/h)": 0, "Autoroute (>100 km/h)": 0, "Ville (0-40 km/h)": 0, "Route (40-80 km/h)": 0, "Autoroute (>80 km/h)": 0 }; 

        let seqs = {}; 
        let dayKeys = Object.keys(days);
        let monthKeys = Object.keys(months);
        let gTotal = 0, gTotalDist = 0, frTotal = 0, etrTotal = 0;

        allHistories.forEach(s => {
            if (!s.history || s.history.length === 0) return;
            let firstItem = s.history.find(h => h.timestamp);
            if (!firstItem) return;
            let sDate = new Date(firstItem.timestamp);
            
            if (filter === 'month' && (sDate.getMonth() !== now.getMonth() || sDate.getFullYear() !== now.getFullYear())) return;
            if (filter === 'week' && (now.getTime() - sDate.getTime() > 7 * 24 * 60 * 60 * 1000)) return;

            gTotalDist += (!s.id) ? (type === 'trucks' ? this.liveTruckDistance : this.liveCarDistance) : (s.distanceKm || 0);

            let sHist = s.history.filter(h => !h.isEvent);
            sHist.forEach((h, i) => {
                let vehType = type === 'trucks' ? h.brand : h.type;
                counters[vehType] = (counters[vehType] || 0) + 1;
                gTotal++;

                if (type === 'trucks') {
                    if (h.type === 'fr') frTotal++; else if (h.type === 'etr') etrTotal++;
                }

                if (h.timestamp) {
                    let d = new Date(h.timestamp);
                    days[dayKeys[d.getDay()]]++; months[monthKeys[d.getMonth()]]++;
                }

                let altVal = h.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                alts[altKey]++;

                let roadKey = h.road || "Inconnu";
                roads[roadKey] = (roads[roadKey] || 0) + 1;

                if (i < sHist.length - 1) {
                    let nxt = type === 'trucks' ? sHist[i+1].brand : sHist[i+1].type;
                    let pair = `${vehType} ➡️ ${nxt}`;
                    seqs[pair] = (seqs[pair] || 0) + 1;
                }
            });
        });

        let tTitle = document.getElementById('dash-title-total'); 
        if (tTitle) { 
            tTitle.innerText = type === 'trucks' ? "🚛 Cumul Total Camions" : "🚗 Cumul Total Véhicules"; 
            tTitle.style.color = type === 'trucks' ? "#e67e22" : "#3498db"; 
        }

        // ⚖️ NOUVEAU : Calcul du poids total pour le tableau de bord
        let dashTotalWeight = 0;
        if (type === 'trucks') {
            dashTotalWeight = gTotal * 18000;
        } else {
            Object.keys(counters).forEach(k => {
                dashTotalWeight += (counters[k] || 0) * (this.vehicleWeights[k] || 0);
            });
        }
        let dwEl = document.getElementById('dash-weight'); 
        if(dwEl) dwEl.innerText = this.formatWeight(dashTotalWeight);

        // NOUVEAU : Injection des Conseils de Gégé (Insights IA)
        let aiInsightContainer = document.getElementById('ai-insight-container');
        let aiInsightText = document.getElementById('ai-insight-text');
        if (aiInsightContainer && aiInsightText && window.ml) {
            let anaData = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;
            let insightMsg = window.ml.generateInsights(type, anaData);
            aiInsightText.innerHTML = insightMsg;
            aiInsightContainer.style.display = 'block';
        }

        let gRatio = gTotalDist > 0 ? (gTotal / gTotalDist).toFixed(1) + " /km" : "- /km";
        let htmlList = `<div class="km-stat-card" style="border-color:${type === 'trucks' ? '#27ae60' : '#3498db'}; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('${type}', 'Total')"><span class="km-stat-title">${type === 'trucks' ? 'Toutes Marques' : 'Tous Véhicules'}</span><span class="km-stat-value" style="color:${type === 'trucks' ? '#27ae60' : '#3498db'}; font-size:0.9em;">🔍 Voir Absolus</span><span style="display:block; font-size:0.75em; color:#7f8c8d; margin-top:3px;">${gRatio}</span></div>`;
        
        let labelsForChart = [], dataForChart = [], itemsArr = [];
        let typeList = type === 'trucks' ? this.brands : this.vehicleTypes;
        
        typeList.forEach(item => {
            let count = counters[item] || 0;
            if (count > 0) itemsArr.push({ name: item, count: count });
        });
        
        itemsArr.sort((a, b) => b.count - a.count);

        itemsArr.forEach(obj => {
            let item = obj.name; let count = obj.count;
            let ratio = gTotalDist > 0 ? (count / gTotalDist).toFixed(1) + " /km" : "";
            let displayItem = item === 'Camions' && type === 'cars' ? 'Poids Lourds' : item;
            htmlList += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('${type}', '${item}')"><span class="km-stat-title">${displayItem}</span><span class="km-stat-value">${count}</span><span style="display:block; font-size:0.75em; color:#7f8c8d; margin-top:3px;">${ratio}</span></div>`;
            labelsForChart.push(displayItem); dataForChart.push(count);
        });

        let ttEl = document.getElementById('dash-grand-total'); if(ttEl) ttEl.innerText = gTotal;
        let tlEl = document.getElementById('dashboard-main-list'); if(tlEl) tlEl.innerHTML = htmlList;

        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#d2dae2' : '#2c3e50';
        const colors = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'];

        const ctxMain = document.getElementById('dashboardMainChart');
        if (ctxMain) {
            if (this.mainDashboardChart) this.mainDashboardChart.destroy();
            if (dataForChart.length > 0) {
                this.mainDashboardChart = new Chart(ctxMain, {
                    type: 'doughnut',
                    data: { labels: labelsForChart, datasets: [{ data: dataForChart, backgroundColor: colors, borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
                });
            }
        }

        let ctxAi = document.getElementById('aiEvolutionChart');
        if (ctxAi) {
            if (this.aiEvolutionChart) this.aiEvolutionChart.destroy();
            let aiSessions = sessions.filter(s => s.predictions && s.predictions.total > 0).slice(-10);
            
            if (aiSessions.length > 0) {
                let aiLabels = [], aiData = [];
                aiSessions.forEach((s, idx) => {
                    aiLabels.push(`Sess. ${idx + 1}`);
                    aiData.push(Math.round((s.predictions.success / s.predictions.total) * 100));
                });
                this.aiEvolutionChart = new Chart(ctxAi, {
                    type: 'line',
                    data: { labels: aiLabels, datasets: [{ label: 'Précision IA (%)', data: aiData, borderColor: '#8e44ad', backgroundColor: 'rgba(142, 68, 173, 0.2)', fill: true, tension: 0.4, pointBackgroundColor: '#8e44ad' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { color: textColor, callback: function(val) { return val + '%'; } } }, x: { ticks: { color: textColor } } } }
                });
                ctxAi.parentElement.style.display = 'block';
            } else { ctxAi.parentElement.style.display = 'none'; }
        }

        let natContainer = document.getElementById('dash-nat-container');
        if (type === 'trucks') {
            if (natContainer) natContainer.style.display = 'block';
            let ctxNat = document.getElementById('natChart');
            if(ctxNat && (frTotal > 0 || etrTotal > 0)) {
                if(this.natChart) this.natChart.destroy();
                this.natChart = new Chart(ctxNat, {
                    type: 'pie',
                    data: { labels: ['🇫🇷 France', '🌍 Étranger'], datasets: [{ data: [frTotal, etrTotal], backgroundColor: ['#3498db', '#e67e22'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
                });
            }
        } else { if (natContainer) natContainer.style.display = 'none'; }

        let ctxW = document.getElementById('weeklyChart');
        if(ctxW) {
            if(this.weeklyChart) this.weeklyChart.destroy();
            this.weeklyChart = new Chart(ctxW, {
                type: 'line',
                data: { labels: Object.keys(days), datasets: [{ label: 'Total cumulé', data: Object.values(days), borderColor: '#e67e22', backgroundColor: 'rgba(230, 126, 34, 0.2)', fill: true, tension: 0.4 }] },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: textColor } }, x: { ticks: { color: textColor } } } }
            });
        }

        let ctxA = document.getElementById('altitudeChart');
        if(ctxA) {
            if(this.altitudeChart) this.altitudeChart.destroy();
            this.altitudeChart = new Chart(ctxA, {
                type: 'pie',
                data: { labels: Object.keys(alts), datasets: [{ data: Object.values(alts), backgroundColor: ['#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
            });
        }

        let ctxM = document.getElementById('monthlyChart');
        if(ctxM) {
            if(this.monthlyChart) this.monthlyChart.destroy();
            this.monthlyChart = new Chart(ctxM, {
                type: 'bar',
                data: { labels: Object.keys(months), datasets: [{ label: 'Total par Mois', data: Object.values(months), backgroundColor: '#8e44ad', borderRadius: 4 }] },
                options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: textColor } }, x: { ticks: { color: textColor } } } }
            });
        }

        let ctxR = document.getElementById('roadTypeChart');
        if(ctxR) {
            if(this.roadTypeChart) this.roadTypeChart.destroy();
            
            let activeRoads = {};
            Object.keys(roads).forEach(k => { if(roads[k] > 0) activeRoads[k] = roads[k]; });

            this.roadTypeChart = new Chart(ctxR, {
                type: 'doughnut',
                data: { labels: Object.keys(activeRoads), datasets: [{ data: Object.values(activeRoads), backgroundColor: ['#3498db', '#f1c40f', '#e74c3c', '#95a5a6', '#8e44ad', '#27ae60', '#e67e22'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
            });
        }

        let seqArr = Object.entries(seqs).sort((a,b) => b[1] - a[1]).slice(0, 5);
        let seqHtml = '';
        if(seqArr.length === 0) seqHtml = '<p style="color:#7f8c8d; font-size:0.9em;">Pas assez de données pour lier des séquences.</p>';
        seqArr.forEach(item => { seqHtml += `<div class="sequence-item"><span class="sequence-flow">${item[0]}</span><span class="sequence-count">${item[1]}x</span></div>`; });
        document.getElementById('sequence-container').innerHTML = seqHtml;
    },

    async showSessionDetails(type, sessionId) {
        let session = await this.idb.getById(sessionId);
        if(!session) return;

        let items = session.history ? session.history.filter(h => !h.isEvent) : [];
        let itemsCount = items.length;
        
        let sessionWeight = 0;
        if (type === 'trucks') {
            sessionWeight = itemsCount * 18000;
        } else if (session.summary) {
            Object.keys(session.summary).forEach(v => {
                sessionWeight += (session.summary[v] || 0) * (this.vehicleWeights[v] || 0);
            });
        }
        
        let freq = itemsCount > 0 && session.durationSec > 0 ? (itemsCount / (session.durationSec / 60)).toFixed(1) : '-';
        let speed = session.durationSec > 0 ? (itemsCount / (session.durationSec / 3600)).toFixed(1) : '-';
        let dist = session.distanceKm || 0;
        let avgSpeedKmh = session.durationSec > 0 ? (dist / (session.durationSec / 3600)).toFixed(1) : '-';
        let avgKm = dist > 0 ? (itemsCount / dist).toFixed(1) : '-';
        let espTemps = itemsCount > 1 && session.durationSec > 0 ? (session.durationSec / itemsCount).toFixed(1) + " s" : "-";
        let espDist = (itemsCount > 1 && dist > 0) ? ((dist * 1000) / itemsCount).toFixed(0) + " m" : "-";

        let predTxt = "-";
        if (session.predictions && session.predictions.total > 0) {
            predTxt = Math.round((session.predictions.success / session.predictions.total) * 100) + "% (" + session.predictions.success + "/" + session.predictions.total + ")";
        }

        let html = `
            <div class="session-detail-row"><span class="session-detail-label">Date</span><span class="session-detail-value">${session.date}</span></div>
            <div class="session-detail-row"><span class="session-detail-label" style="color:#27ae60;">🟢 Départ</span><span class="session-detail-value">${session.startAddress || "Inconnue"}</span></div>
            <div class="session-detail-row"><span class="session-detail-label" style="color:#c0392b;">🔴 Arrivée</span><span class="session-detail-value">${session.endAddress || "Inconnue"}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Durée</span><span class="session-detail-value">${this.formatTime(session.durationSec || 0)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Distance</span><span class="session-detail-value">${dist} km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Vitesse Moyenne</span><span class="session-detail-value" style="color:#8e44ad;">${avgSpeedKmh} km/h</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Véhicules comptés</span><span class="session-detail-value">${itemsCount}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Masse Estimée</span><span class="session-detail-value" style="color:#e67e22; font-weight:bold;">⚖️ ${this.formatWeight(sessionWeight)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Apparitions par minute</span><span class="session-detail-value">${freq} /min</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme</span><span class="session-detail-value">${speed} /h</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne</span><span class="session-detail-value">${avgKm} /km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Espacement Moyen</span><span class="session-detail-value">${espTemps} / ${espDist}</span></div>
            <div style="border-top: 2px dashed var(--border-color); margin: 10px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">🔮 Réussite Prédictions</span><span class="session-detail-value" style="color:#8e44ad; font-weight:bold;">${predTxt}</span></div>
        `;
        document.getElementById('modal-session-title').innerText = type === 'trucks' ? '🚛 Détails Session Camions' : '🚗 Détails Session Véhicules';
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Densité Temporelle (Session)";
        document.getElementById('modal-weekly-section').style.display = 'none';
        
        let altSection = document.getElementById('modal-altitude-section'); if (altSection) altSection.style.display = 'none'; 
        let monthSection = document.getElementById('modal-monthly-section'); if (monthSection) monthSection.style.display = 'none';
        let roadSection = document.getElementById('modal-road-section'); if (roadSection) roadSection.style.display = 'none';

        document.getElementById('session-detail-modal').style.display = 'flex';
        let btnPdf = document.getElementById('btn-export-pdf');
        if(btnPdf) btnPdf.onclick = () => window.app.exportSessionPDF();

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

    exportSessionPDF() {
        if (typeof html2pdf === 'undefined') { if(window.ui) window.ui.showToast("⚠️ Outil PDF non chargé."); return; }
        
        let element = document.getElementById('pdf-export-content');
        let btns = element.querySelectorAll('button');
        btns.forEach(b => b.style.display = 'none');
        
        let opt = {
            margin: 10, filename: `Bilan_Compteur_${new Date().toISOString().slice(0,10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(element).save().then(() => {
            btns.forEach(b => b.style.display = ''); 
            if(window.ui) window.ui.showToast("📄 Export PDF réussi !");
        });
    },

    async triggerDownloadOrShare(dataString, fileName) {
        const blob = new Blob([dataString], { type: "text/plain" });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement("a"); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); 
        URL.revokeObjectURL(url);
    },

    async exportSingleSession(event, type, sessionId) {
        event.stopPropagation();
        let session = await this.idb.getById(sessionId);
        if(!session) return;
        
        // Ajout de la masse pour cet export précis
        let count = session.history ? session.history.filter(h => !h.isEvent).length : 0;
        let sessionWeight = 0;
        if (type === 'trucks') {
            sessionWeight = count * 18000;
        } else if (session.summary) {
            Object.keys(session.summary).forEach(v => {
                sessionWeight += (session.summary[v] || 0) * (this.vehicleWeights[v] || 0);
            });
        }
        session.masseTotaleKg = sessionWeight;

        let exportData = { appVersion: "Compteur Trafic v6.0", exportDate: new Date().toISOString(), sessionType: type, session: session };
        const dataStr = JSON.stringify(exportData, null, 2);
        let safeDate = session.date.replace(/[\/ :]/g, '_');
        await this.triggerDownloadOrShare(dataStr, `Compteur_Session_${type}_${safeDate}.txt`);
    },

    async exportSaveFile() {
        let truckSessions = await this.idb.getAll('trucks');
        let carSessions = await this.idb.getAll('cars');

        let enrichSession = (s) => {
            let count = s.history ? s.history.filter(h => !h.isEvent).length : 0;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(count / (s.durationSec / 60)).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            let espaceTemps = count > 1 ? +(s.durationSec / count).toFixed(1) : 0;
            let rythmeH = s.durationSec > 0 ? +(count / (s.durationSec / 3600)).toFixed(1) : 0;
            
            let detailAuKm = {};
            let sessionWeight = 0; // Ajout de la masse
            
            if (s.sessionType === 'trucks') {
                sessionWeight = count * 18000;
            } else if (s.summary) {
                Object.keys(s.summary).forEach(v => {
                    sessionWeight += (s.summary[v] || 0) * (this.vehicleWeights[v] || 0);
                });
            }

            if (s.distanceKm > 0 && s.summary) {
               Object.keys(s.summary).forEach(k => {
                  let tot = typeof s.summary[k] === 'object' ? (s.summary[k].fr + s.summary[k].etr) : s.summary[k];
                  if(tot > 0) detailAuKm[k] = +(tot / s.distanceKm).toFixed(2);
               });
            }
            return { ...s, totalCount: count, masseTotaleKg: sessionWeight, scoreParKm: vehPerKm, apparitionsParMinute: freqMin, rythmeParHeure: rythmeH, vitesseMoyenneKmh: avgSpeed, espacementMoyenSec: espaceTemps, detailsAuKm: detailAuKm };
        };

        let allSessions = [...truckSessions.map(enrichSession), ...carSessions.map(enrichSession)];
        
        let globalSummary = { 
            profile: this.currentUser,
            mode: this.currentMode,
            totalSessions: allSessions.length, 
            globalDonneesBrutesCamions: this.globalTruckCounters, 
            globalDonneesBrutesVehicules: this.globalCarCounters,
            analysesPermanentesCamions: this.globalAnaTrucks,
            analysesPermanentesVehicules: this.globalAnaCars
        };

        let exportData = { appVersion: "Compteur Trafic v6.0", exportDate: new Date().toISOString(), globalSummary: globalSummary, sessions: allSessions };
        const dataStr = JSON.stringify(exportData, null, 2);
        await this.triggerDownloadOrShare(dataStr, `Compteur_Export_${this.currentUser}_${new Date().toISOString().slice(0,10)}.txt`);
    },

    importSaveFile(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.sessions && confirm(`⚠️ Attention : L'importation va remplacer l'historique de ${this.currentUser}. Continuer ?`)) {
                    await this.idb.clear('trucks'); await this.idb.clear('cars');
                    for (let s of data.sessions) { if (!s.id) s.id = Date.now().toString() + Math.random().toString(); s.user = this.currentUser; await this.idb.add(s); }
                    
                    if (data.globalSummary?.globalDonneesBrutesCamions) this.storage.set('globalTruckCounters', data.globalSummary.globalDonneesBrutesCamions);
                    if (data.globalSummary?.globalDonneesBrutesVehicules) this.storage.set('globalCarCounters', data.globalSummary.globalDonneesBrutesVehicules);
                    if (data.globalSummary?.analysesPermanentesCamions) this.storage.set('globalAnaTrucks', data.globalSummary.analysesPermanentesCamions);
                    if (data.globalSummary?.analysesPermanentesVehicules) this.storage.set('globalAnaCars', data.globalSummary.analysesPermanentesVehicules);
                    
                    alert("✅ Historique et analyses importés avec succès ! Redémarrage..."); location.reload();
                } else if(!data.sessions) { alert("❌ Format non reconnu."); }
            } catch (err) { alert("❌ Fichier invalide ou corrompu !"); }
        }; reader.readAsText(file);
    },

    async deleteSessionsByDateRange() {
        let startInput = document.getElementById('delete-start-date').value;
        let endInput = document.getElementById('delete-end-date').value;

        let startTs = startInput ? new Date(startInput).setHours(0, 0, 0, 0) : 0; 
        let endTs = endInput ? new Date(endInput).setHours(23, 59, 59, 999) : Date.now();

        if (startInput && endInput && startTs > endTs) {
            if(window.ui) window.ui.showToast("⚠️ La date de début doit être avant la date de fin."); return;
        }

        if (!confirm(`⚠️ Tu vas supprimer des sessions ET recalculer tous les totaux globaux pour cette période. Cette action est irréversible. Continuer ?`)) return;

        let allTruckSessions = await this.idb.getAll('trucks');
        let allCarSessions = await this.idb.getAll('cars');
        
        let tx = this.idb.db.transaction('sessions', 'readwrite');
        let store = tx.objectStore('sessions');
        let deletedCount = 0, keptTruckSessions = [], keptCarSessions = [];

        allTruckSessions.forEach(s => {
            if (parseInt(s.id) >= startTs && parseInt(s.id) <= endTs) { store.delete(s.id); deletedCount++; } 
            else { keptTruckSessions.push(s); }
        });

        allCarSessions.forEach(s => {
            if (parseInt(s.id) >= startTs && parseInt(s.id) <= endTs) { store.delete(s.id); deletedCount++; } 
            else { keptCarSessions.push(s); }
        });

        if (deletedCount === 0) { if(window.ui) window.ui.showToast("🤷‍♂️ Aucune session trouvée sur cette période."); return; }

        tx.oncomplete = async () => {
            this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
            this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);
            this.globalTruckDistance = 0; this.globalTruckTime = 0;
            this.globalCarDistance = 0; this.globalCarTime = 0;
            this.globalAnaTrucks = this.getEmptyAnalytics();
            this.globalAnaCars = this.getEmptyAnalytics();
            
            keptTruckSessions.forEach(s => {
                this.globalTruckDistance += (s.distanceKm || 0); this.globalTruckTime += (s.durationSec || 0);
                if (s.summary) Object.keys(s.summary).forEach(b => {
                    if (this.globalTruckCounters[b] && s.summary[b]) {
                        this.globalTruckCounters[b].fr += (s.summary[b].fr || 0);
                        this.globalTruckCounters[b].etr += (s.summary[b].etr || 0);
                    }
                });
                if (s.predictions) {
                    this.globalAnaTrucks.predictions.total += (s.predictions.total || 0);
                    this.globalAnaTrucks.predictions.success += (s.predictions.success || 0);
                }
            });

            keptCarSessions.forEach(s => {
                this.globalCarDistance += (s.distanceKm || 0); this.globalCarTime += (s.durationSec || 0);
                if (s.summary) Object.keys(s.summary).forEach(v => {
                    if (this.globalCarCounters[v] !== undefined) this.globalCarCounters[v] += (s.summary[v] || 0);
                });
                if (s.predictions) {
                    this.globalAnaCars.predictions.total += (s.predictions.total || 0);
                    this.globalAnaCars.predictions.success += (s.predictions.success || 0);
                }
            });

            await this.buildPermanentAnalyticsFromIDB('trucks', this.globalAnaTrucks);
            await this.buildPermanentAnalyticsFromIDB('cars', this.globalAnaCars);

            this.storage.set('globalTruckCounters', this.globalTruckCounters);
            this.storage.set('globalCarCounters', this.globalCarCounters);
            this.storage.set('globalTruckDistance', this.globalTruckDistance);
            this.storage.set('globalTruckTime', this.globalTruckTime);
            this.storage.set('globalCarDistance', this.globalCarDistance);
            this.storage.set('globalCarTime', this.globalCarTime);
            this.storage.set('globalAnaTrucks', this.globalAnaTrucks);
            this.storage.set('globalAnaCars', this.globalAnaCars);

            this.renderDashboard('trucks');
            this.renderAdvancedStats('trucks'); this.renderAdvancedStats('cars');
            if(window.ui) window.ui.showToast(`🧹 ${deletedCount} session(s) et les données nettoyées !`);
        };
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
                let displayType = item.type === 'Camions' ? 'Poids Lourds' : item.type;
                let title = item.isEvent ? item.eventType : (type === 'trucks' ? `${item.brand} (${item.type === 'fr' ? '🇫🇷' : '🌍'})` : displayType);
                let titleStyle = item.isEvent ? 'color: #f39c12;' : '';
                historyContainer.innerHTML += `<div class="history-item"><div class="history-item-header"><strong style="${titleStyle}">${title}</strong><span class="history-meta">⏱️ ${item.chronoTime} | 📍 ${item.lat ? parseFloat(item.lat).toFixed(4) : '?'}</span><button class="btn-del-history" onclick="window.app.deleteHistoryItem('${type}', ${realIndex})">🗑️</button></div></div>`;
            });
        }

        let sessions = await this.idb.getAll(type);
        sessions.sort((a, b) => b.id - a.id);
        
        sessionsContainer.innerHTML = '';
        if (sessions.length === 0) { sessionsContainer.innerHTML = `<div class="history-item">Aucune session sauvegardée pour ${this.currentUser}. 🚦</div>`; } 
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
    },

    async updatePrediction(type) {
        let el = document.getElementById(type === 'trucks' ? 'pred-text-trucks' : 'pred-text-cars');
        if(el) el.innerText = "Analyse en cours... 🤖";

        if (window.ml) {
            let aiResult = await window.ml.predictNext(type);
            if (aiResult) {
                let bestCandidate = aiResult.candidate;
                let confidence = aiResult.confidence;

                if (type === 'trucks') {
                    let d = new Date();
                    let fr = this.globalTruckCounters[bestCandidate]?.fr || 0;
                    let etr = this.globalTruckCounters[bestCandidate]?.etr || 0;
                    let chanceEtranger = (etr / (fr + etr || 1));
                    
                    let currentSpeedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
                    let isHighway = (this.currentMode === 'voiture' && currentSpeedKmh > 100) || (this.currentMode === 'camion' && currentSpeedKmh > 80);
                    if (isHighway) chanceEtranger += 0.2; 
                    
                    let currentHour = d.getHours();
                    if (currentHour < 5 || currentHour > 22) chanceEtranger += 0.15;
                    if (d.getDay() === 0 || d.getDay() === 6) chanceEtranger += 0.15;
                    
                    let nat = Math.random() < chanceEtranger ? 'etr' : 'fr';

                    this.currentPredictionTruck = { brand: bestCandidate, nat: nat };
                    if(el) el.innerHTML = `<strong>${bestCandidate}</strong> (${nat === 'fr' ? '🇫🇷' : '🌍'}) ~${confidence}% <span style="color:#8e44ad; font-size:0.8em;">(IA 🧠)</span>`;
                } else {
                    this.currentPredictionCar = { type: bestCandidate };
                    if(el) el.innerHTML = `<strong>${bestCandidate === 'Camions' ? 'Poids Lourds' : bestCandidate}</strong> ~${confidence}% <span style="color:#8e44ad; font-size:0.8em;">(IA 🧠)</span>`;
                }
                return;
            }
        }

        let ana = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;
        let history = type === 'trucks' ? this.truckHistory : this.carHistory;
        let globalCounters = type === 'trucks' ? this.globalTruckCounters : this.globalCarCounters;
        let candidates = type === 'trucks' ? this.brands : this.vehicleTypes;

        let d = new Date();
        let currentHourKey = `${d.getHours()}h`;
        let currentDayKey = Object.keys(ana.days)[d.getDay()];
        let currentMonthKey = Object.keys(ana.months)[d.getMonth()];
        let currentAlt = window.gps && window.gps.currentPos && window.gps.currentPos.alt ? window.gps.currentPos.alt : 0;
        let altKey = currentAlt < 200 ? "< 200m" : currentAlt < 500 ? "200-500m" : currentAlt < 1000 ? "500-1000m" : "> 1000m";

        let currentSpeedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
        let isHighway = (this.currentMode === 'voiture' && currentSpeedKmh > 100) || (this.currentMode === 'camion' && currentSpeedKmh > 80); 
        let currentRoad = this.getRoadType(currentSpeedKmh, this.currentMode);
        
        let sec = type === 'trucks' ? this.truckSeconds : this.carSeconds;
        let isDenseTraffic = sec > 0 && (history.length / (sec / 3600)) > 500; 

        let recentItems = history.filter(h => !h.isEvent).slice(-2);
        let lastV1 = recentItems.length > 1 ? (type === 'trucks' ? recentItems[0].brand : recentItems[0].type) : null; 
        let lastV2 = recentItems.length > 0 ? (type === 'trucks' ? recentItems[recentItems.length-1].brand : recentItems[recentItems.length-1].type) : null; 

        let scores = {};
        let totalGlobalCount = 0;
        
        candidates.forEach(c => {
            let count = type === 'trucks' ? ((globalCounters[c]?.fr || 0) + (globalCounters[c]?.etr || 0)) : (globalCounters[c] || 0);
            scores[c] = count; 
            totalGlobalCount += count;
        });

        if(totalGlobalCount > 0) {
            candidates.forEach(c => { scores[c] = (scores[c] / totalGlobalCount) * 100; });
        } else {
            candidates.forEach(c => { scores[c] = 10; });
        }

        candidates.forEach(c => {
            if (lastV1 && lastV2 && ana.seqs3) {
                let triplet = `${lastV1} ➡️ ${lastV2} ➡️ ${c}`;
                if (ana.seqs3[triplet]) scores[c] += 25; 
            }
            if (lastV2 && ana.seqs) {
                let pair = `${lastV2} ➡️ ${c}`;
                if (ana.seqs[pair]) scores[c] += 10; 
            }

            if (ana.byVeh && ana.byVeh[c]) {
                let pHeure = (ana.hours[currentHourKey] > 0) ? ((ana.byVeh[c].hours[currentHourKey] || 0) / ana.hours[currentHourKey]) * 100 : 0;
                let pJour = (ana.days[currentDayKey] > 0) ? ((ana.byVeh[c].days[currentDayKey] || 0) / ana.days[currentDayKey]) * 100 : 0;
                let pAlt = (ana.alts[altKey] > 0) ? ((ana.byVeh[c].alts[altKey] || 0) / ana.alts[altKey]) * 100 : 0;
                let pMois = (ana.months[currentMonthKey] > 0) ? ((ana.byVeh[c].months[currentMonthKey] || 0) / ana.months[currentMonthKey]) * 100 : 0;
                let pRoute = (ana.roads[currentRoad] > 0) ? ((ana.byVeh[c].roads[currentRoad] || 0) / ana.roads[currentRoad]) * 100 : 0;

                scores[c] += (pHeure * 0.1) + (pJour * 0.1) + (pAlt * 0.1) + (pMois * 0.15) + (pRoute * 0.25);
            }
        });

        if (type === 'cars') {
            if (isHighway) {
                scores['Camions'] += 40; 
                scores['Vélos'] = 0; 
                scores['Engins agricoles'] = 0;
            }
            if (isDenseTraffic) { scores['Voitures'] += 30; }
        }

        let bestCandidate = null;
        let maxScore = -1;
        candidates.forEach(c => {
            let finalScore = scores[c] + (Math.random() * (scores[c] * 0.1));
            if (finalScore > maxScore && scores[c] >= 0) {
                maxScore = finalScore;
                bestCandidate = c;
            }
        });

        if (!bestCandidate) bestCandidate = candidates[Math.floor(Math.random() * candidates.length)];
        let totalScoreSum = Object.values(scores).reduce((a, b) => a + b, 0);
        let confidence = totalScoreSum > 0 ? Math.min(99, Math.round((maxScore / totalScoreSum) * 100)) : 50;

        if (type === 'trucks') {
            let fr = this.globalTruckCounters[bestCandidate]?.fr || 0;
            let etr = this.globalTruckCounters[bestCandidate]?.etr || 0;
            let chanceEtranger = (etr / (fr + etr || 1));
            if (isHighway) chanceEtranger += 0.2; 
            let currentHour = d.getHours();
            if (currentHour < 5 || currentHour > 22) chanceEtranger += 0.15;
            if (d.getDay() === 0 || d.getDay() === 6) chanceEtranger += 0.15;
            let nat = Math.random() < chanceEtranger ? 'etr' : 'fr';

            this.currentPredictionTruck = { brand: bestCandidate, nat: nat };
            if(el) el.innerHTML = `<strong>${bestCandidate}</strong> (${nat === 'fr' ? '🇫🇷' : '🌍'}) ~${confidence}% <span style="color:#7f8c8d; font-size:0.8em;">(Classique 📊)</span>`;
        } else {
            this.currentPredictionCar = { type: bestCandidate };
            if(el) el.innerHTML = `<strong>${bestCandidate === 'Camions' ? 'Poids Lourds' : bestCandidate}</strong> ~${confidence}% <span style="color:#7f8c8d; font-size:0.8em;">(Classique 📊)</span>`;
        }
    }
};

window.app = app;

const startApp = () => {
    app.init(); 
    if(window.ui) window.ui.init(); 
    if(window.gps) window.gps.init(); 
    if(window.gami) window.gami.init(); 
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
