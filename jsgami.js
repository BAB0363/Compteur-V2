// jsgami.js - Le Cerveau du Passe Routier
export const gami = {
    state: {
        seasonId: "", // Ex: "2026-Q2"
        level: 1,
        xp: 0,
        dailyQuests: [],
        lastDailyUpdate: 0,
        hasRerolledToday: false
    },
    
    xpPerLevel: 1000,
    maxLevel: 50,

    init() {
        this.loadState();
        this.createUI();
        this.checkSeasonAndQuests();
        this.updateUI();
    },

    loadState() {
        let user = window.app && window.app.currentUser ? window.app.currentUser : "Default";
        let saved = localStorage.getItem(`gami_state_${user}`);
        if (saved) {
            this.state = JSON.parse(saved);
        }
    },

    saveState() {
        let user = window.app && window.app.currentUser ? window.app.currentUser : "Default";
        localStorage.setItem(`gami_state_${user}`, JSON.stringify(this.state));
        this.updateUI();
    },

    checkSeasonAndQuests() {
        let now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth(); // 0 = Janvier, 11 = Décembre
        
        // Calcul du trimestre (Saison 1, 2, 3 ou 4)
        let quarter = Math.floor(month / 3) + 1; 
        let currentSeasonId = `${year}-Q${quarter}`;

        // Nouvelle saison = Remise à zéro !
        if (this.state.seasonId !== currentSeasonId) {
            this.state.seasonId = currentSeasonId;
            this.state.level = 1;
            this.state.xp = 0;
            this.state.dailyQuests = [];
            if(window.ui) window.ui.showToast(`🌷 Début de la Saison ${quarter} !`);
        }

        // Vérification des quêtes journalières
        let today = new Date(year, month, now.getDate()).getTime();
        if (this.state.lastDailyUpdate < today) {
            this.generateDailyQuests();
            this.state.lastDailyUpdate = today;
            this.state.hasRerolledToday = false;
        }

        this.saveState();
    },

    // Générateur procédural de quêtes
    generateDailyQuests() {
        const types = [
            { id: "tot", title: "L'Échauffement", desc: "Compter 50 véhicules (tous confondus).", target: 50, type: "total" },
            { id: "cam_fr", title: "Le Patriote", desc: "Compter 20 camions français.", target: 20, type: "camion_fr" },
            { id: "cam_etr", title: "L'International", desc: "Compter 20 camions étrangers.", target: 20, type: "camion_etr" },
            { id: "uti", title: "Les Artisans", desc: "Compter 30 Utilitaires.", target: 30, type: "utilitaire" },
            { id: "pl", title: "Les Rois de la Route", desc: "Compter 25 Poids Lourds (Mode Véhicules).", target: 25, type: "poids_lourds" }
        ];

        // On mélange et on en prend 3 aléatoirement
        let shuffled = types.sort(() => 0.5 - Math.random());
        let selected = shuffled.slice(0, 3);

        this.state.dailyQuests = selected.map(q => ({
            ...q,
            progress: 0,
            done: false,
            xpReward: 200
        }));
    },

    rerollQuest(questIndex) {
        if (this.state.hasRerolledToday) {
            this.showToast("❌ Tu as déjà relancé une quête aujourd'hui !");
            return;
        }
        this.generateDailyQuests(); // Pour simplifier, on regénère tout (tu pourras affiner plus tard)
        this.state.hasRerolledToday = true;
        this.saveState();
        this.showToast("🎲 Quêtes relancées !");
    },

    addXp(amount) {
        if (this.state.level >= this.maxLevel) return; // Niveau max atteint

        this.state.xp += amount;
        let leveledUp = false;

        while (this.state.xp >= this.xpPerLevel && this.state.level < this.maxLevel) {
            this.state.xp -= this.xpPerLevel;
            this.state.level++;
            leveledUp = true;
        }

        if (leveledUp) {
            this.showToast(`🎉 Niveau Supérieur ! Tu es niveau ${this.state.level} !`);
            // Ici tu peux rajouter des confettis Lottie !
        }
        this.saveState();
    },

    // --- LE "CROCHET" POUR TON APP DE BASE ---
    // Cette fonction sera appelée par jsapp.js quand tu comptes un véhicule
    notifyVehicleAdded(typeVehicule, nationalite = null) {
        let changed = false;

        this.state.dailyQuests.forEach(q => {
            if (q.done) return;

            let match = false;
            if (q.type === "total") match = true;
            if (q.type === "camion_fr" && nationalite === "fr") match = true;
            if (q.type === "camion_etr" && nationalite === "etr") match = true;
            if (q.type === "utilitaire" && typeVehicule === "Utilitaires") match = true;
            if (q.type === "poids_lourds" && typeVehicule === "Camions") match = true;

            if (match) {
                q.progress++;
                if (q.progress >= q.target) {
                    q.progress = q.target;
                    q.done = true;
                    this.addXp(q.xpReward);
                    this.showToast(`🎯 Quête validée : ${q.title} (+${q.xpReward} XP)`);
                }
                changed = true;
            }
        });

        if (changed) this.saveState();
    },

    // --- INTERFACE GRAPHIQUE ---
    createUI() {
        let div = document.createElement('div');
        div.id = 'gami-overlay';
        div.innerHTML = `
            <div id="gami-modal">
                <div class="gami-header">
                    <h2 class="gami-title">🎁 Passe Routier</h2>
                    <button class="btn-close-gami" onclick="document.getElementById('gami-overlay').style.display='none'">X</button>
                </div>
                
                <div class="gami-level-info">Niveau <span id="gami-lvl-text">1</span></div>
                <div class="gami-xp-container">
                    <div class="gami-xp-fill" id="gami-xp-bar"></div>
                    <div class="gami-xp-text" id="gami-xp-label">0 / 1000 XP</div>
                </div>

                <div class="gami-section-title">Quêtes Journalières</div>
                <div id="gami-quests-container"></div>
            </div>
        `;
        document.body.appendChild(div);

        // Ajout du bouton d'ouverture dans ton top-bar-controls (à côté de "Nuit")
        setTimeout(() => {
            let topBar = document.querySelector('.top-bar-controls > div:nth-child(2)');
            if(topBar) {
                let btn = document.createElement('button');
                btn.innerText = "🎁 Passe";
                btn.style.backgroundColor = "#8e44ad"; 
                btn.style.color = "white";
                btn.onclick = () => document.getElementById('gami-overlay').style.display = 'flex';
                topBar.insertBefore(btn, topBar.firstChild);
            }
        }, 500);
    },

    updateUI() {
        let elLvl = document.getElementById('gami-lvl-text');
        let elBar = document.getElementById('gami-xp-bar');
        let elLabel = document.getElementById('gami-xp-label');
        let elQuests = document.getElementById('gami-quests-container');

        if(elLvl) elLvl.innerText = this.state.level;
        if(elBar) {
            let pct = (this.state.xp / this.xpPerLevel) * 100;
            elBar.style.width = pct + '%';
        }
        if(elLabel) elLabel.innerText = `${this.state.xp} / ${this.xpPerLevel} XP`;

        if(elQuests) {
            elQuests.innerHTML = '';
            this.state.dailyQuests.forEach((q, index) => {
                let isDone = q.done ? "gami-quest-done" : "";
                let rerollBtn = (!q.done && !this.state.hasRerolledToday) ? `<button class="gami-btn-reroll" onclick="window.gami.rerollQuest(${index})" title="Relancer cette quête">🎲</button>` : '';
                
                elQuests.innerHTML += `
                    <div class="gami-quest-card ${isDone}">
                        <div class="gami-quest-info">
                            <div class="gami-quest-title">${q.title} <span style="font-size:0.8em; color:#fff;">(+${q.xpReward} XP)</span></div>
                            <div class="gami-quest-desc">${q.desc}</div>
                            <div class="gami-quest-progress">${q.progress} / ${q.target}</div>
                        </div>
                        ${rerollBtn}
                    </div>
                `;
            });
        }
    },

    showToast(msg) {
        let toast = document.createElement('div');
        toast.className = 'gami-toast';
        toast.innerText = msg;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }
};

window.gami = gami;
