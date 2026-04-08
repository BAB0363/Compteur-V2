// jsml.js
export const ml = {
    modelTrucks: null,
    modelCars: null,
    isTraining: false,

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

    async init() {
        if (typeof tf === 'undefined') {
            console.warn("TensorFlow.js n'est pas chargé.");
            return;
        }
        await this.loadModels();
        this.updateUIStatus();
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

    // NOUVEAU : Générateur de conseils personnalisés (Insights) pour le Dashboard
    generateInsights(type, anaData) {
        if (!anaData || !anaData.hours) return "Besoin de plus de données pour te donner un conseil... ⏳";
        
        let maxCount = 0;
        let peakHour = "";
        
        // Trouve l'heure avec le plus gros volume
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

    // NOUVEAU : Détecteur d'anomalies en temps réel
    checkAnomaly(type, vehKey, speedKmh, recentHistory) {
        let isHighway = speedKmh >= 90; // Vitesse d'autoroute
        
        // 1. Incohérence Vitesse / Type de Véhicule
        if (type === 'cars' && isHighway) {
            if (vehKey === 'Vélos') {
                return { type: 'anomaly', msg: "🚨 Un vélo sur voie rapide à plus de 90 km/h, Sylvain ?! Tu es sûr ?" };
            }
            if (vehKey === 'Engins agricoles') {
                return { type: 'anomaly', msg: "🚜 Attention anomalie : Un tracteur sur l'autoroute !" };
            }
        }

        // 2. Combo Ultra Rare (3x le même véhicule à la suite, sauf voitures classiques)
        if (recentHistory && recentHistory.length >= 3) {
            let v1 = type === 'trucks' ? recentHistory[recentHistory.length - 3].brand : recentHistory[recentHistory.length - 3].type;
            let v2 = type === 'trucks' ? recentHistory[recentHistory.length - 2].brand : recentHistory[recentHistory.length - 2].type;
            let v3 = vehKey;
            
            if (v1 === v2 && v2 === v3) {
                if (type === 'trucks' || (v1 !== 'Voitures' && v1 !== 'Utilitaires')) {
                    return { type: 'rare-combo', msg: `🎰 JACKPOT ! 3x ${v1} d'affilée !` };
                }
            }
        }
        
        return null;
    },

    async forceTraining() {
        if (this.isTraining) {
            if(window.ui) window.ui.showToast("⏳ Un entraînement est déjà en cours...");
            return;
        }
        
        this.isTraining = true;
        let uiProgress = document.getElementById('ai-training-progress');
        if (uiProgress) uiProgress.style.display = 'block';

        if(window.ui) window.ui.showToast("🧠 Début de l'entraînement de l'IA...");

        let tSuccess = await this.trainModel('trucks');
        let cSuccess = await this.trainModel('cars');

        this.isTraining = false;
        if (uiProgress) uiProgress.style.display = 'none';
        this.updateUIStatus();

        if(window.ui) window.ui.showToast("✨ Entraînement terminé !");
    },

    extractFeatures(h) {
        let d = new Date(h.timestamp);
        let hour = d.getHours() / 24.0; 
        let isWeekend = (d.getDay() === 0 || d.getDay() === 6) ? 1 : 0;
        let speed = Math.min((h.speed || 0) / 130.0, 1.0); 
        let alt = Math.min((h.alt || 0) / 2000.0, 1.0); 
        let road = (this.roadMap[h.road || "Inconnu"] || 0) / 3.0; 

        return [hour, isWeekend, speed, alt, road];
    },

    async trainModel(type) {
        let sessions = await window.app.idb.getAll(type);
        let liveHistory = type === 'trucks' ? window.app.truckHistory : window.app.carHistory;
        
        let allItems = [];
        sessions.forEach(s => {
            if (s.history) allItems = allItems.concat(s.history.filter(h => !h.isEvent));
        });
        allItems = allItems.concat(liveHistory.filter(h => !h.isEvent));

        if (allItems.length < 50) return false;

        let labelsList = type === 'trucks' ? this.truckBrands : this.carTypes;
        let numClasses = labelsList.length;

        let features = [];
        let labels = [];

        for (let i = 0; i < allItems.length; i++) {
            let h = allItems[i];
            let labelText = type === 'trucks' ? h.brand : h.type;
            let labelIndex = labelsList.indexOf(labelText);
            
            if (labelIndex !== -1 && h.timestamp) {
                features.push(this.extractFeatures(h));
                labels.push(labelIndex);
            }
        }

        if (features.length === 0) return false;

        const xs = tf.tensor2d(features);
        const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [5] }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

        await model.fit(xs, ys, {
            epochs: 50,
            shuffle: true
        });

        await model.save(`indexeddb://model-${type}`);
        
        if (type === 'trucks') this.modelTrucks = model;
        else this.modelCars = model;

        xs.dispose();
        ys.dispose();

        return true;
    },

    async predictNext(type) {
        let model = type === 'trucks' ? this.modelTrucks : this.modelCars;
        if (!model) return null;

        let labelsList = type === 'trucks' ? this.truckBrands : this.carTypes;

        let currentSpeedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
        let currentRoad = window.app.getRoadType(currentSpeedKmh, window.app.currentMode);
        
        let mockEvent = {
            timestamp: Date.now(),
            speed: currentSpeedKmh,
            alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : 0,
            road: currentRoad
        };

        let currentFeatures = this.extractFeatures(mockEvent);
        const inputTensor = tf.tensor2d([currentFeatures]);

        const prediction = model.predict(inputTensor);
        const scores = await prediction.data();
        
        inputTensor.dispose();
        prediction.dispose();

        let maxScore = -1;
        let bestIndex = -1;
        
        for (let i = 0; i < scores.length; i++) {
            if (scores[i] > maxScore) {
                maxScore = scores[i];
                bestIndex = i;
            }
        }

        let bestCandidate = labelsList[bestIndex];
        let confidence = Math.round(maxScore * 100);

        return { candidate: bestCandidate, confidence: confidence };
    }
};

window.ml = ml;
