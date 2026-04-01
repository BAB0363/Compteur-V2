// jsui.js
export const ui = {
    activeTab: 'trucks',

    init() {
        this.applyTheme();
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

    showToast(msg) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast'; toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    showClickParticle(e, text, color = '#27ae60') {
        if(!e || !e.clientX) return;
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
        ['trucks', 'cars', 'save'].forEach(t => {
            let sec = document.getElementById(`section-${t}`);
            let btn = document.getElementById(`tab-${t}`);
            if(sec) sec.style.display = tab === t ? 'block' : 'none';
            if(btn) btn.classList.toggle('active', tab === t);
        });
    },

    toggleMinimalMode() {
        let minimalUI = document.getElementById('minimal-mode-ui');
        if(!minimalUI) return;
        if (minimalUI.style.display === 'none') {
            minimalUI.style.display = 'flex';
            if(window.app) window.app.renderMinimalGrid();
        } else {
            minimalUI.style.display = 'none';
        }
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
            btn.innerText = "📊 Stats & Carte"; btn.classList.remove('active'); 
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
            btn.innerText = "📊 Stats & Carte"; btn.classList.remove('active'); 
        }
    }
};
