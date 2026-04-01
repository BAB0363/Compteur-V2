// jsspeech.js
export const speech = {
    recognition: null,
    isActive: false,

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'fr-FR';
            this.recognition.continuous = true;
            this.recognition.interimResults = false;

            this.recognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
                console.log("🗣️ Gégé a entendu : ", transcript);
                this.processCommand(transcript);
            };
            
            // CORRECTION : Relance automatique après un silence !
            this.recognition.onend = () => {
                if (this.isActive) {
                    try { this.recognition.start(); } catch(e) {}
                }
            };
            
            this.recognition.onerror = (e) => { 
                console.warn("Erreur vocale", e); 
                if(e.error !== 'no-speech') this.stop(); 
            };
        }
    },

    toggleVoiceCommand() {
        if(!this.recognition) { 
            if(window.ui) window.ui.showToast("❌ La commande vocale n'est pas supportée par ton navigateur."); 
            return; 
        }
        
        const btn = document.getElementById('btn-voice-command');
        if(this.isActive) {
            this.stop();
            if(btn) { btn.innerText = "🎤 Activer la Commande Vocale"; btn.style.backgroundColor = "#3498db"; }
            if(window.ui) window.ui.showToast("🎙️ Commande vocale désactivée");
        } else {
            this.start();
            if(btn) { btn.innerText = "🔴 Sur Écoute... (Dis 'Voiture', 'Scania'...)"; btn.style.backgroundColor = "#e74c3c"; }
            if(window.ui) window.ui.showToast("🎙️ Gégé t'écoute ! Parle fort et clair.");
        }
    },

    start() { this.isActive = true; try { this.recognition.start(); } catch(e) {} },
    stop() { this.isActive = false; try { this.recognition.stop(); } catch(e) {} },

    processCommand(text) {
        if(!window.app) return;

        if(text.includes('voiture')) { window.app.updateVehicle(null, 'Voitures', 1); }
        else if(text.includes('moto')) { window.app.updateVehicle(null, 'Motos', 1); }
        else if(text.includes('tracteur')) { window.app.updateVehicle(null, 'Tracteurs', 1); }
        else if(text.includes('renault')) { window.app.updateTruck(null, 'Renault Trucks', 'fr', 1); }
        else if(text.includes('mercedes')) { window.app.updateTruck(null, 'Mercedes-Benz', 'etr', 1); }
        else if(text.includes('volvo')) { window.app.updateTruck(null, 'Volvo Trucks', 'etr', 1); }
        else if(text.includes('scania')) { window.app.updateTruck(null, 'Scania', 'etr', 1); }
        else if(text.includes('daf')) { window.app.updateTruck(null, 'DAF', 'etr', 1); }
        else if(text.includes('man') || text.includes('m a n')) { window.app.updateTruck(null, 'MAN', 'etr', 1); }
        else if(text.includes('iveco')) { window.app.updateTruck(null, 'Iveco', 'etr', 1); }
        else if(text.includes('camion')) {
             if(window.ui) window.ui.showToast("🚚 Gégé : Précise la marque du camion !");
             if(window.ui) window.ui.triggerHapticFeedback('error');
        }
    }
};
