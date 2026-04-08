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

    // NOUVEAU : Classes combinées pour les camions (Marque + Nationalité)
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

    // Générateur de conseils personnalisés (Insights) pour le Dashboard
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

    // NOUVEAU : Génération du HTML pour le Bulletin de Notes
    generateReportCard(type, anaData) {
        if (!anaData || !anaData.predictionsByClass || Object.keys(anaData.predictionsByClass).length === 0) {
            return `<div style="grid-column: 1 / -1; text-align:center; color:#7f8c8d;">Pas encore assez de prédictions vérifiées pour établir un bulletin. Continue à compter ! 📝</div>`;
        }

        let stats = [];
        for (let [className, data] of Object.entries(anaData.predictionsByClass)) {
            if (data.total >= 5) { // On filtre pour n'afficher que les stats significatives
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

        // Formatage sympa du nom pour l'affichage
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

    // Détecteur d'anomalies en temps réel
    checkAnomaly(type, vehKey, speedKmh, recentHistory) {
        let isHighway = speedKmh >= 90; 
        
        // 1. Incohérence Vitesse / Type de Véhicule
        if (type === 'cars' && isHighway) {
            if (vehKey === 'Vélos') {
                return { type: 'anomaly', msg: "🚨 Un vélo sur voie rapide à plus de 90 km/h, Sylvain ?! Tu es sûr ?" };
            }
            if (vehKey === 'Engins agricoles') {
                return { type: 'anomaly', msg: "🚜 Attention anomalie : Un tracteur sur l'autoroute !" };
            }
        }

        // 2. Combo Ultra Rare
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

        if(window.ui) window.ui.showToast("🧠 Début de l'entraînement de l'IA (Nouvelle architecture)...");

        await this.trainModel('trucks');
        await this.trainModel('cars');

        this.isTraining = false;
        if (uiProgress) uiProgress.style.display = 'none';
        this.updateUIStatus();

        if(window.ui) window.ui.showToast("✨ Entraînement terminé avec succès !");
    },

    // NOUVEAU : Extraction de 8 features (avec jour exact et mémoire)
    extractFeatures(h, recentHistory, labelsList, type) {
        let d = new Date(h.timestamp);
        let hour = d.getHours() / 24.0; 
        let dayOfWeek = d.getDay() / 6.0; // 0 = Dimanche, 6 = Samedi (Normalisé entre 0 et 1)
        let speed = Math.min((h.speed || 0) / 130.0, 1.0); 
        let alt = Math.min((h.alt || 0) / 2000.0, 1.0); 
        let road = (this.roadMap[h.road || "Inconnu"] || 0) / 3.0; 

        // Fonction pour récupérer l'index normalisé d'un véhicule précédent
        let getPrevIndex = (offset) => {
            if (!recentHistory || recentHistory.length < offset) return 0; // 0 si aucun véhicule précédent
            let prevItem = recentHistory[recentHistory.length - offset];
            let labelText = type === 'trucks' ? (prevItem.brand + '_' + prevItem.type) : prevItem.type;
            let idx = labelsList.indexOf(labelText);
            return idx !== -1 ? (idx + 1) / (labelsList.length + 1) : 0;
        };

        let prev1 = getPrevIndex(1); // Le véhicule juste avant (N-1)
        let prev2 = getPrevIndex(2); // (N-2)
        let prev3 = getPrevIndex(3); // (N-3)

        return [hour, dayOfWeek, speed, alt, road, prev1, prev2, prev3];
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

        let labelsList = type === 'trucks' ? this.getTruckClasses() : this.carTypes;
        let numClasses = labelsList.length;

        let features = [];
        let labels = [];

        // On boucle sur l'historique pour préparer les données
        for (let i = 0; i < allItems.length; i++) {
            let h = allItems[i];
            let labelText = type === 'trucks' ? (h.brand + '_' + h.type) : h.type;
            let labelIndex = labelsList.indexOf(labelText);
            
            if (labelIndex !== -1 && h.timestamp) {
                // On recrée un historique fictif pour l'instant T (mémoire à court terme)
                let pastHistory = allItems.slice(Math.max(0, i - 3), i);
                features.push(this.extractFeatures(h, pastHistory, labelsList, type));
                labels.push(labelIndex);
            }
        }

        if (features.length === 0) return false;

        const xs = tf.tensor2d(features);
        const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

        const model = tf.sequential();
        // NOUVEAU : La couche d'entrée passe à 8 neurones (inputShape: [8])
        model.add(tf.layers.dense({ units: 24, activation: 'relu', inputShape: [8] }));
        model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
        model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

        // Entraînement !
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

    // NOUVEAU : Prédiction du Top 3
    async predictNext(type) {
        let model = type === 'trucks' ? this.modelTrucks : this.modelCars;
        if (!model) return null;

        let labelsList = type === 'trucks' ? this.getTruckClasses() : this.carTypes;

        let currentSpeedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
        let currentRoad = window.app.getRoadType(currentSpeedKmh, window.app.currentMode);
        
        let liveHistory = type === 'trucks' ? window.app.truckHistory : window.app.carHistory;
        let recentHist = liveHistory.filter(h => !h.isEvent).slice(-3);
        
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
        
        // On trie pour avoir le score le plus élevé en premier
        results.sort((a, b) => b.confidence - a.confidence);

        // On renvoie les 3 meilleurs !
        return { top3: results.slice(0, 3) };
    }
};

window.ml = ml;
