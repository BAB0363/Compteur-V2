// jsml.js
export const ml = {
    modelTrucks: null,
    modelCars: null,
    isTraining: false,
    worker: null,

    // Dictionnaires pour convertir les textes en nombres pour l'IA
    roadMap: { 
        "Inconnu": 0, 
        "Ville (0-50 km/h)": 1, 
        "Ville (0-40 km/h)": 1, 
        "Route (50-100 km/h)": 2, 
        "Route (40-80 km/h)": 2, 
        "Autoroute (>100 km/h)": 3,
        "Autoroute (>80 km/h)": 3
    },
    truckBrands: ["Renault Trucks", "Mercedes-Benz", "Volvo Trucks", "Scania", "DAF", "MAN", "Iveco", "Ford Trucks"],
    carTypes: ["Voitures", "Utilitaires", "Motos", "Camions", "Camping-cars", "Bus/Car", "Engins agricoles", "Vélos"],

    getTruckClasses() {
        let classes = [];
        this.truckBrands.forEach(b => { 
            classes.push(b + "_fr"); 
            classes.push(b + "_etr"); 
        });
        return classes;
    },

    async init() {
        if (typeof tf === 'undefined') {
            console.warn("TensorFlow.js n'est pas chargé.");
            return;
        }
        this.initWorker();
        await this.loadModels();
        this.updateUIStatus();
    },

    initWorker() {
        if (window.Worker) {
            this.worker = new Worker('jsml-worker.js');
            this.worker.onmessage = async (e) => {
                const { success, type } = e.data;
                this.isTraining = false;
                
                let uiProgress = document.getElementById('ai-training-progress');
                if (uiProgress) uiProgress.style.display = 'none';

                if (success) {
                    await this.loadModels();
                    this.updateUIStatus();
                    if(window.ui) window.ui.showToast(`✨ L'IA a fini d'apprendre en arrière-plan !`);
                }
            };
        }
    },

    async loadModels() {
        try {
            this.modelTrucks = await tf.loadLayersModel('indexeddb://model-trucks');
        } catch (e) { this.modelTrucks = null; }
        
        try {
            this.modelCars = await tf.loadLayersModel('indexeddb://model-cars');
        } catch (e) { this.modelCars = null; }
    },

    updateUIStatus() {
        let elTrucks = document.getElementById('ai-status-trucks');
        let elCars = document.getElementById('ai-status-cars');
        
        if (elTrucks) {
            elTrucks.innerText = this.modelTrucks ? "Prêt et Entraîné ✅" : "En attente de données ❌";
            elTrucks.style.color = this.modelTrucks ? "#27ae60" : "#e74c3c";
        }
        if (elCars) {
            elCars.innerText = this.modelCars ? "Prêt et Entraîné ✅" : "En attente de données ❌";
            elCars.style.color = this.modelCars ? "#27ae60" : "#e74c3c";
        }
    },

    generateInsights(type, anaData) {
        if (!anaData || !anaData.hours) return "Besoin de plus de données pour te donner un conseil... ⏳";
        
        let maxCount = 0;
        let peakHour = "";
        
        for (let [hour, count] of Object.entries(anaData.hours)) {
            if (count > maxCount) {
                maxCount = count;
                peakHour = hour;
            }
        }
        
        if (maxCount === 0) return "Commence par enregistrer quelques sessions pour que Gégé apprenne tes habitudes ! 🛣️";
        
        let insight = `D'après ton historique, le grand pic de trafic pour les <strong>${type === 'trucks' ? 'Camions' : 'Véhicules'}</strong> se produit généralement vers <strong>${peakHour}</strong>. `;
        
        let bestRoad = "Inconnu";
        let maxRoad = 0;
        if (anaData.roads) {
            for (let [road, count] of Object.entries(anaData.roads)) {
                if(count > maxRoad && road !== "Inconnu") {
                    maxRoad = count;
                    bestRoad = road;
                }
            }
        }
        
        if (maxRoad > 0) {
            insight += `<br>🎯 Ton terrain de chasse le plus prolifique est actuellement : <em>${bestRoad}</em>.`;
        }
        
        return insight;
    },

    generateReportCard(type, anaData) {
        if (!anaData || !anaData.predictionsByClass || Object.keys(anaData.predictionsByClass).length === 0) {
            return `<div style="grid-column: 1 / -1; text-align:center; color:#7f8c8d;">Pas encore assez de prédictions vérifiées pour établir un bulletin. Continue à compter ! 📝</div>`;
        }

        let stats = [];
        for (let [className, data] of Object.entries(anaData.predictionsByClass)) {
            if (data.total >= 5) {
                stats.push({ 
                    name: className, 
                    accuracy: Math.round((data.success / data.total) * 100), 
                    total: data.total 
                });
            }
        }

        if (stats.length === 0) {
            return `<div style="grid-column: 1 / -1; text-align:center; color:#7f8c8d;">J'analyse tes validations, le bulletin arrive bientôt ! (Minimum 5 essais requis par catégorie) ⏳</div>`;
        }

        stats.sort((a, b) => b.accuracy - a.accuracy);
        let best = stats[0];
        let worst = stats[stats.length - 1];

        let formatName = (n) => {
            if (n === 'Camions') return 'Poids Lourds';
            return n.replace('_fr', ' 🇫🇷').replace('_etr', ' 🌍');
        };

        let html = `
            <div class="report-card-item" style="border-color: #27ae60; background: rgba(39, 174, 96, 0.1);">
                <span class="report-card-label">🏆 Meilleure Précision</span>
                <span class="report-card-value text-success">${formatName(best.name)}</span>
                <span style="display:block; font-size:0.85em; color:#27ae60; margin-top:4px;">${best.accuracy}% (${best.total} essais)</span>
            </div>
            <div class="report-card-item" style="border-color: #e74c3c; background: rgba(231, 76, 60, 0.1);">
                <span class="report-card-label">📉 Point Faible</span>
                <span class="report-card-value text-danger">${formatName(worst.name)}</span>
                <span style="display:block; font-size:0.85em; color:#e74c3c; margin-top:4px;">${worst.accuracy}% (${worst.total} essais)</span>
            </div>
        `;
        return html;
    },

    checkAnomaly(type, vehKey, speedKmh, recentHistory) {
        let isHighway = type === 'cars' ? speedKmh >= 100 : speedKmh >= 80; 
        
        if (type === 'cars' && isHighway) {
            if (vehKey === 'Vélos') {
                return { type: 'anomaly', msg: "🚨 Un vélo sur voie rapide à plus de 100 km/h, Sylvain ?! Tu es sûr ?" };
            }
            if (vehKey === 'Engins agricoles') {
                return { type: 'anomaly', msg: "🚜 Attention anomalie : Un tracteur sur l'autoroute !" };
            }
        }

        return null;
    },

    async forceTraining() {
        if (this.isTraining || !this.worker) {
            if(window.ui) window.ui.showToast("⏳ Un entraînement est déjà en cours ou le Worker n'est pas prêt.");
            return;
        }
        
        let uiProgress = document.getElementById('ai-training-progress');
        if (uiProgress) uiProgress.style.display = 'block';

        if(window.ui) window.ui.showToast("🧠 Début de l'entraînement de l'IA (Nouvelle architecture 10 neurones)...");

        this.trainModel('trucks');
        setTimeout(() => this.trainModel('cars'), 500); 
    },

    extractFeatures(h, recentHistory, labelsList, type) {
        let d = new Date(h.timestamp);
        let hour = d.getHours() / 24.0; 
        let dayOfWeek = d.getDay() / 6.0; 
        let speed = Math.min((h.speed || 0) / 130.0, 1.0); 
        let alt = Math.min((h.alt || 0) / 2000.0, 1.0); 
        let road = (this.roadMap[h.road || "Inconnu"] || 0) / 3.0; 

        let getPrevIndex = (offset) => {
            if (!recentHistory || recentHistory.length < offset) return 0;
            let prevItem = recentHistory[recentHistory.length - offset];
            let labelText = type === 'trucks' ? (prevItem.brand + '_' + prevItem.type) : prevItem.type;
            let idx = labelsList.indexOf(labelText);
            return idx !== -1 ? (idx + 1) / (labelsList.length + 1) : 0;
        };

        let prev1 = getPrevIndex(1);
        let prev2 = getPrevIndex(2);
        let prev3 = getPrevIndex(3);

        let tenMinsAgo = h.timestamp - 600000;
        let count10m = recentHistory.filter(item => item.timestamp >= tenMinsAgo).length;
        let tendance = Math.min(count10m / 200.0, 1.0); 

        let rythmeH = 0;
        if (recentHistory.length > 1) {
            let firstTs = recentHistory[0].timestamp;
            let durationSec = (h.timestamp - firstTs) / 1000;
            if (durationSec > 0) rythmeH = (recentHistory.length / (durationSec / 3600));
        }
        let rythmeNorm = Math.min(rythmeH / 1200.0, 1.0); 

        return [hour, dayOfWeek, speed, alt, road, prev1, prev2, prev3, rythmeNorm, tendance];
    },

    async trainModel(type) {
        if (this.isTraining || !this.worker) return false;
        
        let sessions = await window.app.idb.getAll(type);
        let liveHistory = type === 'trucks' ? window.app.truckHistory : window.app.carHistory;
        
        let allItems = [];
        sessions.forEach(s => {
            if (s.history) allItems = allItems.concat(s.history.filter(h => !h.isEvent));
        });
        allItems = allItems.concat(liveHistory.filter(h => !h.isEvent));

        if (allItems.length < 50) return false;

        let labelsList = type === 'trucks' ? this.getTruckClasses() : this.carTypes;
        let numClasses = labelsList.length;

        let features = [];
        let labels = [];

        for (let i = 0; i < allItems.length; i++) {
            let h = allItems[i];
            let labelText = type === 'trucks' ? (h.brand + '_' + h.type) : h.type;
            let labelIndex = labelsList.indexOf(labelText);
            
            if (labelIndex !== -1 && h.timestamp) {
                let pastHistory = allItems.slice(Math.max(0, i - 15), i); 
                features.push(this.extractFeatures(h, pastHistory, labelsList, type));
                labels.push(labelIndex);
            }
        }

        if (features.length === 0) return false;

        this.isTraining = true;
        this.worker.postMessage({
            type: type,
            features: features,
            labels: labels,
            numClasses: numClasses
        });

        return true;
    },

    async predictNext(type) {
        let model = type === 'trucks' ? this.modelTrucks : this.modelCars;
        if (!model) return null;

        let labelsList = type === 'trucks' ? this.getTruckClasses() : this.carTypes;

        let currentSpeedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
        let currentRoad = window.app.getRoadType(currentSpeedKmh, window.app.currentMode);
        
        let liveHistory = type === 'trucks' ? window.app.truckHistory : window.app.carHistory;
        let recentHist = liveHistory.filter(h => !h.isEvent);
        
        let mockEvent = {
            timestamp: Date.now(),
            speed: currentSpeedKmh,
            alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : 0,
            road: currentRoad
        };

        let currentFeatures = this.extractFeatures(mockEvent, recentHist, labelsList, type);
        const inputTensor = tf.tensor2d([currentFeatures]);

        const prediction = model.predict(inputTensor);
        const scores = await prediction.data();
        
        inputTensor.dispose();
        prediction.dispose();

        let results = [];
        for (let i = 0; i < scores.length; i++) {
            results.push({ 
                candidate: labelsList[i], 
                confidence: Math.round(scores[i] * 100) 
            });
        }
        
        results.sort((a, b) => b.confidence - a.confidence);

        return { top3: results.slice(0, 3) };
    }
};

window.ml = ml;
