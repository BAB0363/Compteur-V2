// jsapp.js
import { ui } from './jsui.js';
import { gps } from './jsgps.js';
import { ml } from './jsml.js'; // 🧠 Import de l'IA

window.ui = ui; window.gps = gps; window.ml = ml;

const app = {
    currentUser: localStorage.getItem('currentUser') || 'Sylvain',
    currentMode: localStorage.getItem('currentMode') || 'voiture',
    usersList: JSON.parse(localStorage.getItem('usersList')) || ['Sylvain'],

    storage: {
        get(key) { return localStorage.getItem(window.app.currentUser + '_' + window.app.currentMode + '_' + key); },
        set(key, value) { localStorage.setItem(window.app.currentUser + '_' + window.app.currentMode + '_' + key, value); },
        remove(key) { localStorage.removeItem(window.app.currentUser + '_' + window.app.currentMode + '_' + key); }
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
    altitudeModalChart: null, 
    monthlyChart: null, roadTypeChart: null, monthlyModalChart: null, roadModalChart: null,
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
                let all = await this.getAll(type);
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
            roads: { "Ville (<50km/h)": 0, "Route (50-80km/h)": 0, "Autoroute (>80km/h)": 0, "Inconnu": 0 },
            alts: { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 },
            byVeh: {}, 
            seqs: {}, 
            seqs3: {}, 
            lastVehicles: [], 
            predictions: { total: 0, success: 0 }
        };
    },

    async buildPermanentAnalyticsFromIDB(type, targetAna) {
        let sessions = await this.idb.getAll(type);
        let dayKeys = Object.keys(targetAna.days);
        let monthKeys = Object.keys(targetAna.months);
        
        if (!targetAna.byVeh) targetAna.byVeh = {};
        if (!targetAna.seqs3) targetAna.seqs3 = {};
        if (!targetAna.lastVehicles) targetAna.lastVehicles = [];
        if (!targetAna.months) { targetAna.months = this.getEmptyAnalytics().months; }
        if (!targetAna.roads) { targetAna.roads = this.getEmptyAnalytics().roads; }

        sessions.forEach(s => {
            if (s.history) {
                let hist = s.history.filter(h => !h.isEvent);
                let sessionLastVehicles = []; 
                
                for(let i = 0; i < hist.length; i++) {
                    let h = hist[i];
                    let vehType = type === 'trucks' ? h.brand : h.type;

                    if (!targetAna.byVeh[vehType]) {
                        targetAna.byVeh[vehType] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
                    }
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
        let oldProfile = localStorage.getItem('activeProfile');
        if (oldProfile) {
            const keys = ['truckCounters', 'vehicleCounters', 'globalTruckCounters', 'globalCarCounters', 'truckHistory', 'carHistory', 'globalTruckDistance', 'globalCarDistance', 'globalTruckTime', 'globalCarTime', 'truckChronoSec', 'truckAccumulatedTime', 'truckStartTime', 'truckChronoRun', 'carChronoSec', 'carAccumulatedTime', 'carStartTime', 'carChronoRun', 'liveTruckDist', 'liveCarDist', 'globalAnaTrucks', 'globalAnaCars'];
            
            ['voiture', 'camion'].forEach(mode => {
                keys.forEach(k => {
                    let val = localStorage.getItem(mode + '_' + k);
                    if (val !== null) { 
                        localStorage.setItem('Sylvain_' + mode + '_' + k, val); 
                        localStorage.removeItem(mode + '_' + k); 
                    }
                });
            });

            let allSessions = await this.idb.getAllRaw();
            if (allSessions.length > 0) {
                let tx = this.idb.db.transaction('sessions', 'readwrite');
                let store = tx.objectStore('sessions');
                allSessions.forEach(s => { 
                    if (!s.user) { 
                        s.user = 'Sylvain'; 
                        s.mode = s.profile || 'voiture';
                        s.profile = 'Sylvain_' + s.mode;
                        store.put(s); 
                    } 
                });
            }
            localStorage.removeItem('activeProfile');
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
            this.usersList = this.usersList.filter(u => u !== this.currentUser);
            localStorage.setItem('usersList', JSON.stringify(this.usersList));
            this.changeUser(this.usersList[0]);
        }
    },

    async changeUser(newUser) {
        if (this.isTruckRunning) this.toggleTruckChrono();
        if (this.isCarRunning) this.toggleCarChrono();

        this.currentUser = newUser;
        localStorage.setItem('currentUser', newUser);

        await this.init(true);
        if (window.ui) { window.ui.showToast(`👤 Utilisateur changé : ${newUser}`); }
    },

    async changeMode(newMode) {
        if (this.isTruckRunning) this.toggleTruckChrono();
        if (this.isCarRunning) this.toggleCarChrono();

        this.currentMode = newMode;
        localStorage.setItem('currentMode', newMode);

        await this.init(true);
        if (window.ui) { window.ui.showToast(`🔄 Mode changé : ${newMode === 'voiture' ? '🚘 Voiture' : '🚛 Camion'}`); }
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
                    if (currentSpeedKmh > 80) chanceEtranger += 0.2; 
                    
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
        let isHighway = currentSpeedKmh > 80; 
        let currentRoad = currentSpeedKmh === 0 ? "Inconnu" : (currentSpeedKmh < 50 ? "Ville (<50km/h)" : (currentSpeedKmh <= 80 ? "Route (50-80km/h)" : "Autoroute (>80km/h)"));
        
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
            if (isDenseTraffic) {
                scores['Voitures'] += 30; 
            }
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
    },


    async init(isProfileSwitch = false) {
        if (!isProfileSwitch) { await this.idb.init(); await this.migrateData(); }
        if (window.ml) await window.ml.init();

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

        try { this.truckCounters = JSON.parse(this.storage.get('truckCounters')) || {}; } catch(e) { this.truckCounters = {}; }
        try { this.vehicleCounters = JSON.parse(this.storage.get('vehicleCounters')) || {}; } catch(e) { this.vehicleCounters = {}; }
        try { this.globalTruckCounters = JSON.parse(this.storage.get('globalTruckCounters')) || {}; } catch(e) { this.globalTruckCounters = {}; }
        try { this.globalCarCounters = JSON.parse(this.storage.get('globalCarCounters')) || {}; } catch(e) { this.globalCarCounters = {}; }
        try { this.truckHistory = JSON.parse(this.storage.get('truckHistory')) || []; } catch(e) { this.truckHistory = []; }
        try { this.carHistory = JSON.parse(this.storage.get('carHistory')) || []; } catch(e) { this.carHistory = []; }
        
        try { this.globalAnaTrucks = JSON.parse(this.storage.get('globalAnaTrucks')); } catch(e) {}
        if (!this.globalAnaTrucks || !this.globalAnaTrucks.months) { 
            this.globalAnaTrucks = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('trucks', this.globalAnaTrucks);
        }
        if (!this.globalAnaTrucks.predictions) this.globalAnaTrucks.predictions = { total: 0, success: 0 };
        if (!this.globalAnaTrucks.byVeh) this.globalAnaTrucks.byVeh = {};
        if (!this.globalAnaTrucks.seqs3) this.globalAnaTrucks.seqs3 = {};
        if (!this.globalAnaTrucks.lastVehicles) this.globalAnaTrucks.lastVehicles = [];
        this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));

        try { this.globalAnaCars = JSON.parse(this.storage.get('globalAnaCars')); } catch(e) {}
        if (!this.globalAnaCars || !this.globalAnaCars.months) { 
            this.globalAnaCars = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('cars', this.globalAnaCars);
        }
        if (!this.globalAnaCars.predictions) this.globalAnaCars.predictions = { total: 0, success: 0 };
        if (!this.globalAnaCars.byVeh) this.globalAnaCars.byVeh = {};
        if (!this.globalAnaCars.seqs3) this.globalAnaCars.seqs3 = {};
        if (!this.globalAnaCars.lastVehicles) this.globalAnaCars.lastVehicles = [];
        this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));

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
            this.globalAnaTrucks.lastVehicles = []; 
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
            this.globalAnaCars.lastVehicles = []; 
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
                // 🎁 Hook Gamification
                if (window.gami) window.gami.notifyVehicleAdded(brand, type);
                
                if (this.currentPredictionTruck) {
                    this.globalAnaTrucks.predictions.total++;
                    this.sessionTruckPredictions.total++;
                    if (this.currentPredictionTruck.brand === brand && this.currentPredictionTruck.nat === type) {
                        this.globalAnaTrucks.predictions.success++;
                        this.sessionTruckPredictions.success++;
                        if(window.ui) window.ui.showToast("🔮 Prédiction exacte !");
                    }
                }

                this.truckCounters[brand][type] += amount;
                this.globalTruckCounters[brand][type] += amount; 
                
                let nowTs = new Date().getTime();
                let speedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
                let roadType = speedKmh === 0 ? "Inconnu" : (speedKmh < 50 ? "Ville (<50km/h)" : (speedKmh <= 80 ? "Route (50-80km/h)" : "Autoroute (>80km/h)"));
                
                let histItem = { brand: brand, type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, alt: window.gps.currentPos.alt, speed: speedKmh, road: roadType, chronoTime: this.formatTime(this.truckSeconds), timestamp: nowTs };
                this.truckHistory.push(histItem);

                let d = new Date(nowTs);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(this.globalAnaTrucks.days)[d.getDay()];
                let monthKey = Object.keys(this.globalAnaTrucks.months)[d.getMonth()];
                let altVal = window.gps.currentPos.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";

                this.globalAnaTrucks.hours[hourKey]++;
                this.globalAnaTrucks.days[dayKey]++;
                this.globalAnaTrucks.months[monthKey]++;
                this.globalAnaTrucks.alts[altKey]++;
                this.globalAnaTrucks.roads[roadType]++;

                if (!this.globalAnaTrucks.byVeh[brand]) {
                    this.globalAnaTrucks.byVeh[brand] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
                }
                if (!this.globalAnaTrucks.byVeh[brand].months) this.globalAnaTrucks.byVeh[brand].months = {};
                if (!this.globalAnaTrucks.byVeh[brand].roads) this.globalAnaTrucks.byVeh[brand].roads = {};

                this.globalAnaTrucks.byVeh[brand].hours[hourKey] = (this.globalAnaTrucks.byVeh[brand].hours[hourKey] || 0) + 1;
                this.globalAnaTrucks.byVeh[brand].days[dayKey] = (this.globalAnaTrucks.byVeh[brand].days[dayKey] || 0) + 1;
                this.globalAnaTrucks.byVeh[brand].months[monthKey] = (this.globalAnaTrucks.byVeh[brand].months[monthKey] || 0) + 1;
                this.globalAnaTrucks.byVeh[brand].alts[altKey] = (this.globalAnaTrucks.byVeh[brand].alts[altKey] || 0) + 1;
                this.globalAnaTrucks.byVeh[brand].roads[roadType] = (this.globalAnaTrucks.byVeh[brand].roads[roadType] || 0) + 1;

                if (!this.globalAnaTrucks.lastVehicles) this.globalAnaTrucks.lastVehicles = [];
                if (!this.globalAnaTrucks.seqs3) this.globalAnaTrucks.seqs3 = {};

                if (this.globalAnaTrucks.lastVehicles.length >= 1) {
                    let vDernier = this.globalAnaTrucks.lastVehicles[this.globalAnaTrucks.lastVehicles.length - 1];
                    let pair = `${vDernier} ➡️ ${brand}`;
                    this.globalAnaTrucks.seqs[pair] = (this.globalAnaTrucks.seqs[pair] || 0) + 1;
                }

                if (this.globalAnaTrucks.lastVehicles.length >= 2) {
                    let vAvantDernier = this.globalAnaTrucks.lastVehicles[0];
                    let vDernier = this.globalAnaTrucks.lastVehicles[1];
                    let triplet = `${vAvantDernier} ➡️ ${vDernier} ➡️ ${brand}`;
                    this.globalAnaTrucks.seqs3[triplet] = (this.globalAnaTrucks.seqs3[triplet] || 0) + 1;
                }

                this.globalAnaTrucks.lastVehicles.push(brand);
                if (this.globalAnaTrucks.lastVehicles.length > 2) {
                    this.globalAnaTrucks.lastVehicles.shift();
                }

                this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
                
                if(window.ui && e) { window.ui.triggerHapticFeedback('truck'); window.ui.showClickParticle(e, `+1`); }
                this.storage.set('truckCounters', JSON.stringify(this.truckCounters)); 
                this.storage.set('globalTruckCounters', JSON.stringify(this.globalTruckCounters)); 
                this.storage.set('truckHistory', JSON.stringify(this.truckHistory));
                this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
                this.updatePrediction('trucks');
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
                // 🎁 Hook Gamification
                if (window.gami) window.gami.notifyVehicleAdded(type, null);

                if (this.currentPredictionCar) {
                    this.globalAnaCars.predictions.total++;
                    this.sessionCarPredictions.total++;
                    if (this.currentPredictionCar.type === type) {
                        this.globalAnaCars.predictions.success++;
                        this.sessionCarPredictions.success++;
                        if(window.ui) window.ui.showToast("🔮 Prédiction exacte !");
                    }
                }

                this.vehicleCounters[type] += amount; 
                this.globalCarCounters[type] += amount; 

                let nowTs = new Date().getTime();
                let speedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
                let roadType = speedKmh === 0 ? "Inconnu" : (speedKmh < 50 ? "Ville (<50km/h)" : (speedKmh <= 80 ? "Route (50-80km/h)" : "Autoroute (>80km/h)"));
                
                let histItem = { type: type, lat: window.gps.currentPos.lat, lon: window.gps.currentPos.lon, alt: window.gps.currentPos.alt, speed: speedKmh, road: roadType, chronoTime: this.formatTime(this.carSeconds), timestamp: nowTs };
                this.carHistory.push(histItem);

                let d = new Date(nowTs);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(this.globalAnaCars.days)[d.getDay()];
                let monthKey = Object.keys(this.globalAnaCars.months)[d.getMonth()];
                let altVal = window.gps.currentPos.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";

                this.globalAnaCars.hours[hourKey]++;
                this.globalAnaCars.days[dayKey]++;
                this.globalAnaCars.months[monthKey]++;
                this.globalAnaCars.alts[altKey]++;
                this.globalAnaCars.roads[roadType]++;

                if (!this.globalAnaCars.byVeh[type]) {
                    this.globalAnaCars.byVeh[type] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
                }
                if (!this.globalAnaCars.byVeh[type].months) this.globalAnaCars.byVeh[type].months = {};
                if (!this.globalAnaCars.byVeh[type].roads) this.globalAnaCars.byVeh[type].roads = {};

                this.globalAnaCars.byVeh[type].hours[hourKey] = (this.globalAnaCars.byVeh[type].hours[hourKey] || 0) + 1;
                this.globalAnaCars.byVeh[type].days[dayKey] = (this.globalAnaCars.byVeh[type].days[dayKey] || 0) + 1;
                this.globalAnaCars.byVeh[type].months[monthKey] = (this.globalAnaCars.byVeh[type].months[monthKey] || 0) + 1;
                this.globalAnaCars.byVeh[type].alts[altKey] = (this.globalAnaCars.byVeh[type].alts[altKey] || 0) + 1;
                this.globalAnaCars.byVeh[type].roads[roadType] = (this.globalAnaCars.byVeh[type].roads[roadType] || 0) + 1;

                if (!this.globalAnaCars.lastVehicles) this.globalAnaCars.lastVehicles = [];
                if (!this.globalAnaCars.seqs3) this.globalAnaCars.seqs3 = {};

                if (this.globalAnaCars.lastVehicles.length >= 1) {
                    let vDernier = this.globalAnaCars.lastVehicles[this.globalAnaCars.lastVehicles.length - 1];
                    let pair = `${vDernier} ➡️ ${type}`;
                    this.globalAnaCars.seqs[pair] = (this.globalAnaCars.seqs[pair] || 0) + 1;
                }

                if (this.globalAnaCars.lastVehicles.length >= 2) {
                    let vAvantDernier = this.globalAnaCars.lastVehicles[0];
                    let vDernier = this.globalAnaCars.lastVehicles[1];
                    let triplet = `${vAvantDernier} ➡️ ${vDernier} ➡️ ${type}`;
                    this.globalAnaCars.seqs3[triplet] = (this.globalAnaCars.seqs3[triplet] || 0) + 1;
                }

                this.globalAnaCars.lastVehicles.push(type);
                if (this.globalAnaCars.lastVehicles.length > 2) {
                    this.globalAnaCars.lastVehicles.shift();
                }

                this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
                
                let hapticType = 'car';
                if(type === 'Motos' || type === 'Vélos') hapticType = 'moto';
                if(type === 'Engins agricoles' || type === 'Camions' || type === 'Bus/Car') hapticType = 'tractor';

                if(window.ui && e) { window.ui.triggerHapticFeedback(hapticType); window.ui.showClickParticle(e, `+1`, '#e74c3c'); }
                this.storage.set('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
                this.storage.set('globalCarCounters', JSON.stringify(this.globalCarCounters)); 
                this.storage.set('carHistory', JSON.stringify(this.carHistory));
                this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
                this.updatePrediction('cars');
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

            if (item.timestamp) {
                let d = new Date(item.timestamp);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(this.globalAnaTrucks.days)[d.getDay()];
                let monthKey = Object.keys(this.globalAnaTrucks.months)[d.getMonth()];
                let altVal = item.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                let roadType = item.road || "Inconnu";

                if(this.globalAnaTrucks.hours[hourKey] > 0) this.globalAnaTrucks.hours[hourKey]--;
                if(this.globalAnaTrucks.days[dayKey] > 0) this.globalAnaTrucks.days[dayKey]--;
                if(this.globalAnaTrucks.months[monthKey] > 0) this.globalAnaTrucks.months[monthKey]--;
                if(this.globalAnaTrucks.alts[altKey] > 0) this.globalAnaTrucks.alts[altKey]--;
                if(this.globalAnaTrucks.roads[roadType] > 0) this.globalAnaTrucks.roads[roadType]--;

                if(this.globalAnaTrucks.byVeh && this.globalAnaTrucks.byVeh[item.brand]) {
                    if(this.globalAnaTrucks.byVeh[item.brand].hours[hourKey] > 0) this.globalAnaTrucks.byVeh[item.brand].hours[hourKey]--;
                    if(this.globalAnaTrucks.byVeh[item.brand].days[dayKey] > 0) this.globalAnaTrucks.byVeh[item.brand].days[dayKey]--;
                    if(this.globalAnaTrucks.byVeh[item.brand].months && this.globalAnaTrucks.byVeh[item.brand].months[monthKey] > 0) this.globalAnaTrucks.byVeh[item.brand].months[monthKey]--;
                    if(this.globalAnaTrucks.byVeh[item.brand].alts[altKey] > 0) this.globalAnaTrucks.byVeh[item.brand].alts[altKey]--;
                    if(this.globalAnaTrucks.byVeh[item.brand].roads && this.globalAnaTrucks.byVeh[item.brand].roads[roadType] > 0) this.globalAnaTrucks.byVeh[item.brand].roads[roadType]--;
                }

                if(index === this.truckHistory.length - 1) {
                    if(this.globalAnaTrucks.lastVehicles && this.globalAnaTrucks.lastVehicles.length > 0) {
                        this.globalAnaTrucks.lastVehicles.pop();
                    }
                }
                this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
            }
        }
        this.truckHistory.splice(index, 1);
        this.storage.set('truckCounters', JSON.stringify(this.truckCounters)); 
        this.storage.set('globalTruckCounters', JSON.stringify(this.globalTruckCounters)); 
        this.storage.set('truckHistory', JSON.stringify(this.truckHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Camion supprimé"); }
        this.renderTrucks(); this.renderKmStats(); this.renderLiveStats('trucks');
        this.updatePrediction('trucks');
        if (document.getElementById('truck-stats-view').style.display !== 'none') this.renderAdvancedStats('trucks');
    },

    deleteCarHistoryItem(index) {
        let item = this.carHistory[index];
        if (!item.isEvent && this.vehicleCounters[item.type] > 0) {
            this.vehicleCounters[item.type]--;
            if (this.globalCarCounters[item.type] > 0) this.globalCarCounters[item.type]--;

            if (item.timestamp) {
                let d = new Date(item.timestamp);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(this.globalAnaCars.days)[d.getDay()];
                let monthKey = Object.keys(this.globalAnaCars.months)[d.getMonth()];
                let altVal = item.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                let roadType = item.road || "Inconnu";

                if(this.globalAnaCars.hours[hourKey] > 0) this.globalAnaCars.hours[hourKey]--;
                if(this.globalAnaCars.days[dayKey] > 0) this.globalAnaCars.days[dayKey]--;
                if(this.globalAnaCars.months[monthKey] > 0) this.globalAnaCars.months[monthKey]--;
                if(this.globalAnaCars.alts[altKey] > 0) this.globalAnaCars.alts[altKey]--;
                if(this.globalAnaCars.roads[roadType] > 0) this.globalAnaCars.roads[roadType]--;

                if(this.globalAnaCars.byVeh && this.globalAnaCars.byVeh[item.type]) {
                    if(this.globalAnaCars.byVeh[item.type].hours[hourKey] > 0) this.globalAnaCars.byVeh[item.type].hours[hourKey]--;
                    if(this.globalAnaCars.byVeh[item.type].days[dayKey] > 0) this.globalAnaCars.byVeh[item.type].days[dayKey]--;
                    if(this.globalAnaCars.byVeh[item.type].months && this.globalAnaCars.byVeh[item.type].months[monthKey] > 0) this.globalAnaCars.byVeh[item.type].months[monthKey]--;
                    if(this.globalAnaCars.byVeh[item.type].alts[altKey] > 0) this.globalAnaCars.byVeh[item.type].alts[altKey]--;
                    if(this.globalAnaCars.byVeh[item.type].roads && this.globalAnaCars.byVeh[item.type].roads[roadType] > 0) this.globalAnaCars.byVeh[item.type].roads[roadType]--;
                }

                if(index === this.carHistory.length - 1) {
                    if(this.globalAnaCars.lastVehicles && this.globalAnaCars.lastVehicles.length > 0) {
                        this.globalAnaCars.lastVehicles.pop();
                    }
                }
                this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
            }
        }
        this.carHistory.splice(index, 1);
        this.storage.set('vehicleCounters', JSON.stringify(this.vehicleCounters)); 
        this.storage.set('globalCarCounters', JSON.stringify(this.globalCarCounters)); 
        this.storage.set('carHistory', JSON.stringify(this.carHistory));
        if(window.ui) { window.ui.triggerHapticFeedback('error'); window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Véhicule supprimé"); }
        this.renderCars(); this.renderKmStats(); this.renderLiveStats('cars');
        this.updatePrediction('cars');
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
        this.sessionTruckPredictions = { total: 0, success: 0 };
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
        this.sessionCarPredictions = { total: 0, success: 0 };
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
            user: this.currentUser,
            mode: this.currentMode,
            profile: this.currentUser + '_' + this.currentMode,
            sessionType: type, 
            startDate: startDateStr, 
            date: dateStr, 
            startAddress: startAddress, 
            endAddress: endAddress, 
            durationSec: type === 'trucks' ? this.truckSeconds : this.carSeconds, 
            distanceKm: parseFloat((type === 'trucks' ? this.liveTruckDistance : this.liveCarDistance).toFixed(2)), 
            history: history, 
            summary: JSON.parse(JSON.stringify(type === 'trucks' ? this.truckCounters : this.vehicleCounters)),
            predictions: type === 'trucks' ? { ...this.sessionTruckPredictions } : { ...this.sessionCarPredictions }
        };

        await this.idb.add(newSession);

        if (window.ml) {
            window.ml.trainModel(type).then(success => {
                if (success) window.ml.updateUIStatus();
            });
        }

        if (type === 'trucks') this.resetTrucksData(); 
        else this.resetCarsData(); 
        
        if(window.ui) window.ui.showToast("💾 Session sauvegardée !");
    },

    async resetTrucks() { 
        if (confirm(`⚠️ Effacer toutes les sessions Camions de ${this.currentUser} ? Tes stats globales resteront intactes !`)) { 
            await this.idb.clear('trucks'); 
            this.renderAdvancedStats('trucks'); 
            window.ui.showToast("🗑️ Historique des sessions effacé"); 
        } 
    },
    async resetCars() { 
        if (confirm(`⚠️ Effacer toutes les sessions Véhicules de ${this.currentUser} ? Tes stats globales resteront intactes !`)) { 
            await this.idb.clear('cars'); 
            this.renderAdvancedStats('cars'); 
            window.ui.showToast("🗑️ Historique des sessions effacé"); 
        } 
    },

    resetGlobalStats() {
        if (confirm(`⚠️ Es-tu sûr de vouloir effacer TOUTES les statistiques globales et analyses pour le profil de ${this.currentUser} ? Action irréversible !`)) {
            this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
            this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);
            this.globalTruckDistance = 0; this.globalTruckTime = 0;
            this.globalCarDistance = 0; this.globalCarTime = 0;
            
            this.globalAnaTrucks = this.getEmptyAnalytics();
            this.globalAnaCars = this.getEmptyAnalytics();
            this.storage.set('globalAnaTrucks', JSON.stringify(this.globalAnaTrucks));
            this.storage.set('globalAnaCars', JSON.stringify(this.globalAnaCars));
            
            this.storage.set('globalTruckCounters', JSON.stringify(this.globalTruckCounters));
            this.storage.set('globalCarCounters', JSON.stringify(this.globalCarCounters));
            this.storage.set('globalTruckDistance', 0); this.storage.set('globalTruckTime', 0);
            this.storage.set('globalCarDistance', 0); this.storage.set('globalCarTime', 0);
            
            this.renderDashboard('trucks');
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
            container.innerHTML += `<div class="vehicle-card"><div class="vehicle-name">${icons[v] || "🚘"} ${displayName}</div><div class="vehicle-controls"><button class="btn-corr" onclick="window.app.updateVehicle(event, '${v}', -1)">-</button><span class="vehicle-score">${score}</span><button class="btn-add btn-add-fr" onclick="window.app.updateVehicle(event, '${v}', 1)">+</button></div></div>`;
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
                statsArr.forEach(st => {
                    html += `<div class="km-stat-card"><span class="km-stat-title">${st.name}</span><span class="km-stat-value">${st.ratioStr} /km</span><span class="km-stat-extra">⏱️ ${st.freq}</span></div>`;
                });
                
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
                statsArr.forEach(st => {
                    html += `<div class="km-stat-card"><span class="km-stat-title">${st.name}</span><span class="km-stat-value">${st.ratioStr} /km</span><span class="km-stat-extra">⏱️ ${st.freq}</span></div>`;
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
                title = `🚘 ${key === 'Camions' ? 'Poids Lourds' : key}`;
                count = this.globalCarCounters[key] || 0;
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
            <div style="border-top: 2px dashed #eee; margin: 15px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">Quantité globale comptée</span><span class="session-detail-value" style="color:#27ae60; font-size:1.1em;">${count}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne par km</span><span class="session-detail-value" style="color:#8e44ad;">${avgKm}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Apparitions par minute</span><span class="session-detail-value">${freq}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme par heure</span><span class="session-detail-value">${speed}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Espacement Moyen</span><span class="session-detail-value">${espTemps} / ${espDist}</span></div>
        `;

        if (key === 'Total') {
             let preds = type === 'trucks' ? this.globalAnaTrucks.predictions : this.globalAnaCars.predictions;
             let predScore = "-";
             if (preds && preds.total > 0) {
                 predScore = Math.round((preds.success / preds.total) * 100) + "% (" + preds.success + "/" + preds.total + ")";
             }
             html += `<div style="border-top: 2px dashed #eee; margin: 15px 0;"></div><div class="session-detail-row"><span class="session-detail-label">🔮 Taux de réussite prédictions</span><span class="session-detail-value" style="color:#8e44ad; font-weight:bold;">${predScore}</span></div>`;
        }

        document.getElementById('modal-session-title').innerText = `🌍 Stats Globales : ${title}`;
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Répartition par heure (Tous confondus)";
        document.getElementById('modal-weekly-section').style.display = 'block';

        document.getElementById('session-detail-modal').style.display = 'flex';

        let btnPdf = document.getElementById('btn-export-pdf');
        if(btnPdf) {
            btnPdf.onclick = () => window.app.exportSessionPDF();
        }

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
        
        if (liveHistory && liveHistory.length > 0) {
            allHistories.push({ history: liveHistory });
        }
        sessions.forEach(s => allHistories.push(s)); 

        let counters = {};
        let alts = { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 };
        let days = { "Dim":0, "Lun":0, "Mar":0, "Mer":0, "Jeu":0, "Ven":0, "Sam":0 };
        let months = { "Jan":0, "Fév":0, "Mar":0, "Avr":0, "Mai":0, "Juin":0, "Juil":0, "Aoû":0, "Sep":0, "Oct":0, "Nov":0, "Déc":0 }; 
        let roads = { "Ville (<50km/h)": 0, "Route (50-80km/h)": 0, "Autoroute (>80km/h)": 0, "Inconnu": 0 }; 

        let seqs = {}; 
        let dayKeys = Object.keys(days);
        let monthKeys = Object.keys(months);
        let gTotal = 0;
        let gTotalDist = 0;
        let frTotal = 0, etrTotal = 0;

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
                    if (h.type === 'fr') frTotal++;
                    else if (h.type === 'etr') etrTotal++;
                }

                if (h.timestamp) {
                    let d = new Date(h.timestamp);
                    days[dayKeys[d.getDay()]]++;
                    months[monthKeys[d.getMonth()]]++;
                }

                let altVal = h.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                alts[altKey]++;

                let roadKey = h.road || "Inconnu";
                roads[roadKey]++;

                if (i < sHist.length - 1) {
                    let nxt = type === 'trucks' ? sHist[i+1].brand : sHist[i+1].type;
                    let pair = `${vehType} ➡️ ${nxt}`;
                    seqs[pair] = (seqs[pair] || 0) + 1;
                }
                
                if (i < sHist.length - 2) {
                    let nxt1 = type === 'trucks' ? sHist[i+1].brand : sHist[i+1].type;
                    let nxt2 = type === 'trucks' ? sHist[i+2].brand : sHist[i+2].type;
                    let triplet = `${vehType} ➡️ ${nxt1} ➡️ ${nxt2}`;
                    seqs[triplet] = (seqs[triplet] || 0) + 1;
                }
            });
        });

        let tTitle = document.getElementById('dash-title-total'); 
        if (tTitle) { 
            tTitle.innerText = type === 'trucks' ? "🚛 Cumul Total Camions" : "🚗 Cumul Total Véhicules"; 
            tTitle.style.color = type === 'trucks' ? "#e67e22" : "#3498db"; 
        }

        let gRatio = gTotalDist > 0 ? (gTotal / gTotalDist).toFixed(1) + " /km" : "- /km";
        let htmlList = `<div class="km-stat-card" style="border-color:${type === 'trucks' ? '#27ae60' : '#3498db'}; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('${type}', 'Total')"><span class="km-stat-title">${type === 'trucks' ? 'Toutes Marques' : 'Tous Véhicules'}</span><span class="km-stat-value" style="color:${type === 'trucks' ? '#27ae60' : '#3498db'}; font-size:0.9em;">🔍 Voir Absolus</span><span style="display:block; font-size:0.75em; color:#7f8c8d; margin-top:3px;">${gRatio}</span></div>`;
        
        let labelsForChart = [];
        let dataForChart = [];
        
        let itemsArr = [];
        let typeList = type === 'trucks' ? this.brands : this.vehicleTypes;
        typeList.forEach(item => {
            let count = counters[item] || 0;
            if (count > 0) {
                itemsArr.push({ name: item, count: count });
            }
        });
        
        itemsArr.sort((a, b) => b.count - a.count);

        itemsArr.forEach(obj => {
            let item = obj.name;
            let count = obj.count;
            let ratio = gTotalDist > 0 ? (count / gTotalDist).toFixed(1) + " /km" : "";
            let displayItem = item === 'Camions' && type === 'cars' ? 'Poids Lourds' : item;
            htmlList += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('${type}', '${item}')"><span class="km-stat-title">${displayItem}</span><span class="km-stat-value">${count}</span><span style="display:block; font-size:0.75em; color:#7f8c8d; margin-top:3px;">${ratio}</span></div>`;
            labelsForChart.push(displayItem);
            dataForChart.push(count);
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
                let aiLabels = [];
                let aiData = [];
                
                aiSessions.forEach((s, idx) => {
                    aiLabels.push(`Sess. ${idx + 1}`);
                    let successRate = Math.round((s.predictions.success / s.predictions.total) * 100);
                    aiData.push(successRate);
                });

                this.aiEvolutionChart = new Chart(ctxAi, {
                    type: 'line',
                    data: {
                        labels: aiLabels,
                        datasets: [{
                            label: 'Précision IA (%)',
                            data: aiData,
                            borderColor: '#8e44ad',
                            backgroundColor: 'rgba(142, 68, 173, 0.2)',
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#8e44ad'
                        }]
                    },
                    options: {
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, max: 100, ticks: { color: textColor, callback: function(val) { return val + '%'; } } },
                            x: { ticks: { color: textColor } }
                        }
                    }
                });
                ctxAi.parentElement.style.display = 'block';
            } else {
                ctxAi.parentElement.style.display = 'none'; 
            }
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
        } else {
            if (natContainer) natContainer.style.display = 'none';
        }

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
            this.roadTypeChart = new Chart(ctxR, {
                type: 'doughnut',
                data: { labels: Object.keys(roads), datasets: [{ data: Object.values(roads), backgroundColor: ['#3498db', '#f1c40f', '#e74c3c', '#95a5a6'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
            });
        }

        let seqArr = Object.entries(seqs).sort((a,b) => b[1] - a[1]).slice(0, 5);
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
            <div class="session-detail-row"><span class="session-detail-label">Apparitions par minute</span><span class="session-detail-value">${freq} /min</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme</span><span class="session-detail-value">${speed} /h</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne</span><span class="session-detail-value">${avgKm} /km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Espacement Moyen</span><span class="session-detail-value">${espTemps} / ${espDist}</span></div>
            <div style="border-top: 2px dashed #eee; margin: 10px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">🔮 Réussite Prédictions</span><span class="session-detail-value" style="color:#8e44ad; font-weight:bold;">${predTxt}</span></div>
        `;
        document.getElementById('modal-session-title').innerText = type === 'trucks' ? '🚛 Détails Session Camions' : '🚗 Détails Session Véhicules';
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Densité Temporelle (Session)";
        document.getElementById('modal-weekly-section').style.display = 'none';
        
        let altSection = document.getElementById('modal-altitude-section');
        if (altSection) altSection.style.display = 'none'; 
        
        let monthSection = document.getElementById('modal-monthly-section');
        if (monthSection) monthSection.style.display = 'none';
        
        let roadSection = document.getElementById('modal-road-section');
        if (roadSection) roadSection.style.display = 'none';

        document.getElementById('session-detail-modal').style.display = 'flex';

        let btnPdf = document.getElementById('btn-export-pdf');
        if(btnPdf) {
            btnPdf.onclick = () => window.app.exportSessionPDF();
        }

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
        if (typeof html2pdf === 'undefined') {
            if(window.ui) window.ui.showToast("⚠️ Outil PDF non chargé.");
            return;
        }
        
        let element = document.getElementById('pdf-export-content');
        let btns = element.querySelectorAll('button');
        
        btns.forEach(b => b.style.display = 'none');
        
        let opt = {
            margin:       10,
            filename:     `Bilan_Compteur_${new Date().toISOString().slice(0,10)}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
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
            let freqMin = (count > 0 && s.durationSec > 0) ? +(count / (s.durationSec / 60)).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            let espaceTemps = count > 1 ? +(s.durationSec / count).toFixed(1) : 0;
            let rythmeH = s.durationSec > 0 ? +(count / (s.durationSec / 3600)).toFixed(1) : 0;
            
            let detailAuKm = {};
            if (s.distanceKm > 0 && s.summary) {
               Object.keys(s.summary).forEach(b => {
                  let tot = s.summary[b].fr + s.summary[b].etr;
                  if(tot > 0) detailAuKm[b] = +(tot / s.distanceKm).toFixed(2);
               });
            }

            return { ...s, totalCount: count, camionsParKm: vehPerKm, apparitionsParMinute: freqMin, rythmeParHeure: rythmeH, vitesseMoyenneKmh: avgSpeed, espacementMoyenSec: espaceTemps, detailsAuKm: detailAuKm };
        });

        let enrichedCarSessions = carSessions.map(s => {
            let count = s.history ? s.history.filter(h => !h.isEvent).length : 0;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(count / (s.durationSec / 60)).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            let espaceTemps = count > 1 ? +(s.durationSec / count).toFixed(1) : 0;
            let rythmeH = s.durationSec > 0 ? +(count / (s.durationSec / 3600)).toFixed(1) : 0;

            let detailAuKm = {};
            if (s.distanceKm > 0 && s.summary) {
               Object.keys(s.summary).forEach(v => {
                  let tot = s.summary[v];
                  if(tot > 0) detailAuKm[v] = +(tot / s.distanceKm).toFixed(2);
               });
            }

            return { ...s, totalCount: count, vehiculesParKm: vehPerKm, apparitionsParMinute: freqMin, rythmeParHeure: rythmeH, vitesseMoyenneKmh: avgSpeed, espacementMoyenSec: espaceTemps, detailsAuKm: detailAuKm };
        });

        let allSessions = [...enrichedTruckSessions, ...enrichedCarSessions];
        
        let globalSummary = { 
            profile: this.currentUser,
            mode: this.currentMode,
            totalSessions: allSessions.length, 
            scorePredictionCamions: this.globalAnaTrucks.predictions,
            scorePredictionVehicules: this.globalAnaCars.predictions,
            globalDonneesBrutesCamions: this.globalTruckCounters, 
            globalDonneesBrutesVehicules: this.globalCarCounters,
            analysesPermanentesCamions: this.globalAnaTrucks,
            analysesPermanentesVehicules: this.globalAnaCars
        };

        let exportData = { appVersion: "Compteur Trafic v5.1", exportDate: new Date().toISOString(), globalSummary: globalSummary, sessions: allSessions };
        const dataStr = JSON.stringify(exportData, null, 2);
        const fileName = `Compteur_Export_${this.currentUser}_${new Date().toISOString().slice(0,10)}.txt`;
        
        await this.triggerDownloadOrShare(dataStr, fileName);
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
                let displayType = item.type === 'Camions' ? 'Poids Lourds' : item.type;
                let title = item.isEvent ? item.eventType : (type === 'trucks' ? `${item.brand} (${item.type === 'fr' ? '🇫🇷' : '🌍'})` : displayType);
                let titleStyle = item.isEvent ? 'color: #f39c12;' : '';
                historyContainer.innerHTML += `<div class="history-item"><div class="history-item-header"><strong style="${titleStyle}">${title}</strong><span class="history-meta">⏱️ ${item.chronoTime} | 📍 ${item.lat ? parseFloat(item.lat).toFixed(4) : '?'}</span><button class="btn-del-history" onclick="window.app.${type === 'trucks' ? 'deleteTruckHistoryItem' : 'deleteCarHistoryItem'}(${realIndex})">🗑️</button></div></div>`;
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
    }
};

window.app = app;
window.onload = () => { 
    app.init(); 
    if(window.ui) ui.init(); 
    if(window.gps) gps.init(); 
    if(window.gami) window.gami.init(); // 🎁 Hook Gamification
};
