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

    async forceTraining() {
        if (this.isTraining) {
            if(window.ui) window.ui.showToast("⏳ Un entraînement est déjà en cours...");
            return;
        }
        
        this.isTraining = true;
        let uiProgress = document.getElementById('ai-training-progress');
        if (uiProgress) uiProgress.style.display = 'block';

        if(window.ui) window.ui.showToast("🧠 Début de l'entraînement de l'IA...");

        // On entraîne les camions
        let tSuccess = await this.trainModel('trucks');
        // Puis les voitures
        let cSuccess = await this.trainModel('cars');

        this.isTraining = false;
        if (uiProgress) uiProgress.style.display = 'none';
        this.updateUIStatus();

        if(window.ui) window.ui.showToast("✨ Entraînement terminé !");
    },

    // Convertit un événement en tableau de caractéristiques (Features)
    extractFeatures(h) {
        let d = new Date(h.timestamp);
        let hour = d.getHours() / 24.0; // Normalisé entre 0 et 1
        let isWeekend = (d.getDay() === 0 || d.getDay() === 6) ? 1 : 0;
        let speed = Math.min((h.speed || 0) / 130.0, 1.0); // Normalisé max 130km/h
        let alt = Math.min((h.alt || 0) / 2000.0, 1.0); // Normalisé max 2000m
        let road = (this.roadMap[h.road || "Inconnu"] || 0) / 3.0; // Normalisé

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

        // Si on n'a pas au moins 50 véhicules, on n'entraîne pas (pas assez de data)
        if (allItems.length < 50) return false;

        let labelsList = type === 'trucks' ? this.truckBrands : this.carTypes;
        let numClasses = labelsList.length;

        let features = [];
        let labels = [];

        // On prépare les données : on utilise les conditions du moment T pour deviner le véhicule T
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

        // Conversion en Tensors
        const xs = tf.tensor2d(features);
        const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);

        // Création du réseau de neurones
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [5] }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

        model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

        // Entraînement
        await model.fit(xs, ys, {
            epochs: 50,
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    // Optionnel : afficher la progression dans la console
                    // console.log(`Époque ${epoch}: perte = ${logs.loss}`);
                }
            }
        });

        // Sauvegarde dans IndexedDB
        await model.save(`indexeddb://model-${type}`);
        
        if (type === 'trucks') this.modelTrucks = model;
        else this.modelCars = model;

        // Nettoyage de la mémoire
        xs.dispose();
        ys.dispose();

        return true;
    },

    async predictNext(type) {
        let model = type === 'trucks' ? this.modelTrucks : this.modelCars;
        
        // Si le modèle n'est pas prêt, on renvoie null (le système classique prendra le relais)
        if (!model) return null;

        let labelsList = type === 'trucks' ? this.truckBrands : this.carTypes;

        // On génère un "faux" historique basé sur l'instant présent pour questionner l'IA
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

        // L'IA réfléchit...
        const prediction = model.predict(inputTensor);
        const scores = await prediction.data();
        
        inputTensor.dispose();
        prediction.dispose();

        // On cherche le score le plus élevé
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
