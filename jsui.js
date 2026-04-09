// jsui.js
export const ui = {
    activeTab: 'trucks',
    deferredPrompt: null,
    audioCtx: null,
    lottieInstance: null,

    playBeep(isAdding) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            if (!this.audioCtx) this.audioCtx = new AudioContext();
            
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            
            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(isAdding ? 800 : 300, this.audioCtx.currentTime);
            gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
            
            oscillator.start();
            oscillator.stop(this.audioCtx.currentTime + 0.1);
        } catch(e) { 
            console.warn("Audio non supporté"); 
        }
    },

    playGamiSound(type) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            if (!this.audioCtx) this.audioCtx = new AudioContext();
            
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            
            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);
            
            if (type === 'questDone') {
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(600, this.audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(1200, this.audioCtx.currentTime + 0.15);
                gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
            } else if (type === 'levelUp') {
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(400, this.audioCtx.currentTime);
                oscillator.frequency.setValueAtTime(600, this.audioCtx.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(800, this.audioCtx.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.4);
            } else if (type === 'cash') {
                // Bruit de pièce / tiroir-caisse
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(1000, this.audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(2000, this.audioCtx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
            } else if (type === 'crash') {
                // Bruit de chute / Krach Boursier
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(300, this.audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, this.audioCtx.currentTime + 0.5);
                gainNode.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);
            } else if (type === 'siren') {
                // Alarme / Péage / Huissier
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(600, this.audioCtx.currentTime);
                oscillator.frequency.linearRampToValueAtTime(800, this.audioCtx.currentTime + 0.2);
                oscillator.frequency.linearRampToValueAtTime(600, this.audioCtx.currentTime + 0.4);
                gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);
            }

            oscillator.start();
            if (type === 'crash' || type === 'siren') {
                oscillator.stop(this.audioCtx.currentTime + 0.5);
            } else {
                oscillator.stop(this.audioCtx.currentTime + 0.4);
            }
        } catch(e) { 
            console.warn("Audio Gami non supporté"); 
        }
    },

    init() {
        this.applyTheme();
        this.initPWAInstall();
        this.initLottie();
    },

    initLottie() {
        const container = document.getElementById('lottie-container');
        if(container && typeof lottie !== 'undefined') {
            this.lottieInstance = lottie.loadAnimation({
                container: container,
                renderer: 'svg',
                loop: false,
                autoplay: false,
                path: 'https://assets9.lottiefiles.com/packages/lf20_u4yrau.json' 
            });
        }
    },

    initPWAInstall() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const installBtn = document.getElementById('btn-install-pwa');
            if(installBtn) {
                installBtn.style.display = 'block';
                installBtn.addEventListener('click', async () => {
                    if (this.deferredPrompt !== null) {
                        this.deferredPrompt.prompt();
                        const { outcome } = await this.deferredPrompt.userChoice;
                        if (outcome === 'accepted') {
                            installBtn.style.display = 'none';
                        }
                        this.deferredPrompt = null;
                    }
                });
            }
        });
    },

    applyTheme() {
        let isDark = localStorage.getItem('darkMode') === 'true';
        if (isDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    },

    toggleDarkMode() {
        let isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', !isDark);
        this.applyTheme();
    },

    showToast(msg, type = 'default') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast'; 
        if (type === 'anomaly') toast.classList.add('anomaly');
        if (type === 'rare-combo') toast.classList.add('rare-combo');
        
        toast.innerHTML = msg; // innerHTML pour supporter le gras/emojis
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    showClickParticle(e, text, color = '#27ae60') {
        if(!e || !e.clientX) return;

        const lottieContainer = document.getElementById('lottie-container');
        if (lottieContainer && this.lottieInstance) {
            lottieContainer.style.left = e.clientX + 'px';
            lottieContainer.style.top = e.clientY + 'px';
            lottieContainer.style.display = 'block';
            this.lottieInstance.stop();
            this.lottieInstance.play();
            setTimeout(() => { lottieContainer.style.display = 'none'; }, 800);
        }

        const particle = document.createElement('div');
        particle.className = 'click-particle';
        particle.innerText = text;
        particle.style.color = color;
        particle.style.left = e.clientX + 'px';
        particle.style.top = e.clientY + 'px';
        
        if(document.body.classList.contains('dark-mode')) {
            particle.style.textShadow = "1px 1px 2px white, 0 0 10px " + color;
        }

        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 600);
    },

    triggerHapticFeedback(type) {
        if (!navigator.vibrate) return;
        switch(type) {
            case 'truck': navigator.vibrate(80); break; 
            case 'car': navigator.vibrate(40); break;   
            case 'moto': navigator.vibrate([20, 30, 20]); break; 
            case 'tractor': navigator.vibrate([50, 50, 50]); break; 
            case 'error': navigator.vibrate([100, 50, 100]); break;
            case 'success': navigator.vibrate([30, 50, 30, 50, 30]); break;
            default: navigator.vibrate(30);
        }
    },

    switchTab(tab) {
        this.activeTab = tab;
        ['trucks', 'cars', 'dashboard', 'settings'].forEach(t => {
            let sec = document.getElementById(`section-${t}`);
            let btn = document.getElementById(`tab-${t}`);
            if(sec) sec.style.display = tab === t ? 'block' : 'none';
            if(btn) btn.classList.toggle('active', tab === t);
        });
        
        if(tab === 'dashboard' && window.app) window.app.renderDashboard('trucks');
    },

    toggleTruckStats() {
        let s = document.getElementById('truck-stats-view');
        let m = document.getElementById('truck-main-view'); 
        let btn = document.getElementById('btn-truck-stats');
        if(!s || !m || !btn) return;
        if(s.style.display === 'none') { 
            s.style.display = 'block'; m.style.display = 'none'; 
            btn.innerText = "⬅️ Retour Compteurs"; btn.classList.add('active'); 
            if(window.gps) setTimeout(() => { window.gps.initMap('map-trucks', window.app.truckHistory, 'trucks'); }, 100); 
            if(window.app) window.app.renderAdvancedStats('trucks');
        } else { 
            s.style.display = 'none'; m.style.display = 'block'; 
            btn.innerText = "🗺️ Carte & Actuel"; btn.classList.remove('active'); 
        }
    },

    toggleCarStats() {
        let s = document.getElementById('car-stats-view');
        let m = document.getElementById('car-main-view'); 
        let btn = document.getElementById('btn-car-stats'); 
        if(!s || !m || !btn) return;
        if(s.style.display === 'none') { 
            s.style.display = 'block'; m.style.display = 'none'; 
            btn.innerText = "⬅️ Retour Compteurs"; btn.classList.add('active'); 
            if(window.gps) setTimeout(() => { window.gps.initMap('map-cars', window.app.carHistory, 'cars'); }, 100); 
            if(window.app) window.app.renderAdvancedStats('cars');
        } else { 
            s.style.display = 'none'; m.style.display = 'block'; 
            btn.innerText = "🗺️ Carte & Actuel"; btn.classList.remove('active'); 
        }
    }
};
