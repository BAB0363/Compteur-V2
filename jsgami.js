// jsgami.js - Le Cerveau du Passe Routier (Version Blindée Anti-Crash)
export const gami = {
    state: {
        seasonId: "", 
        seasonName: "",
        level: 1,
        xp: 0,
        dailyQuests: [],
        weeklyQuests: [],
        seasonQuests: [],
        lastDailyUpdate: 0,
        lastWeeklyUpdate: 0,
        hasRerolledToday: false
    },
    
    xpPerLevel: 1000,
    maxLevel: 50,

    seasonNames: {
        1: "❄️ Saison 1 : L'Hiver des Poids Lourds",
        2: "🌸 Saison 2 : Le Réveil de l'Asphalte",
        3: "☀️ Saison 3 : Le Chassé-Croisé Estival",
        4: "🍂 Saison 4 : Les Rois de l'Automne"
    },

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
            let parsed = JSON.parse(saved);
            // Fusionne l'état par défaut avec la sauvegarde pour éviter les trous
            this.state = { ...this.state, ...parsed };
            
            // Sécurité absolue : on force la création des tableaux s'ils manquent
            if (!this.state.dailyQuests) this.state.dailyQuests = [];
            if (!this.state.weeklyQuests) this.state.weeklyQuests = [];
            if (!this.state.seasonQuests) this.state.seasonQuests = [];
        }
    },

    saveState() {
        let user = window.app && window.app.currentUser ? window.app.currentUser : "Default";
        localStorage.setItem(`gami_state_${user}`, JSON.stringify(this.state));
        this.updateUI();
    },

    getMonday(d) {
        d = new Date(d);
        var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
        return new Date(d.setDate(diff)).setHours(0,0,0,0);
    },

    checkSeasonAndQuests() {
        let now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth(); 
        let quarter = Math.floor(month / 3) + 1; 
        let currentSeasonId = `${year}-Q${quarter}`;

        // Nouveau trimestre = remise à zéro globale
        if (this.state.seasonId !== currentSeasonId) {
            this.state.seasonId = currentSeasonId;
            this.state.seasonName = this.seasonNames[quarter];
            this.state.level = 1;
            this.state.xp = 0;
            this.state.dailyQuests = [];
            this.state.weeklyQuests = [];
            this.state.seasonQuests = this.generateSeasonQuests();
            if(window.ui) window.ui.showToast(`🌷 Début de la ${this.state.seasonName} !`);
        }

        // Sécurité sur le nom de la saison si effacé
        if (!this.state.seasonName) this.state.seasonName = this.seasonNames[quarter];

        let today = new Date(year, month, now.getDate()).getTime();
        if (!this.state.lastDailyUpdate || this.state.lastDailyUpdate < today || this.state.dailyQuests.length === 0) {
            this.state.dailyQuests = this.generateDailyQuests();
            this.state.lastDailyUpdate = today;
            this.state.hasRerolledToday = false;
        }

        let thisMonday = this.getMonday(now);
        if (!this.state.lastWeeklyUpdate || this.state.lastWeeklyUpdate < thisMonday || this.state.weeklyQuests.length === 0) {
            this.state.weeklyQuests = this.generateWeeklyQuests();
            this.state.lastWeeklyUpdate = thisMonday;
        }

        if (!this.state.seasonQuests || this.state.seasonQuests.length === 0) {
            this.state.seasonQuests = this.generateSeasonQuests();
        }

        this.saveState();
    },

    generateDailyQuests() {
        const types = [
            { id: "tot", title: "L'Échauffement", desc: "Compter 50 véhicules.", target: 50, type: "total", xpReward: 200 },
            { id: "cam_fr", title: "Le Patriote", desc: "Compter 20 camions français.", target: 20, type: "camion_fr", xpReward: 200 },
            { id: "cam_etr", title: "L'International", desc: "Compter 20 camions étrangers.", target: 20, type: "camion_etr", xpReward: 200 },
            { id: "uti", title: "Les Artisans", desc: "Compter 30 Utilitaires.", target: 30, type: "utilitaire", xpReward: 200 },
            { id: "pl", title: "Les Rois", desc: "Compter 25 Poids Lourds.", target: 25, type: "poids_lourds", xpReward: 200 }
        ];
        return types.sort(() => 0.5 - Math.random()).slice(0, 3).map(q => ({ ...q, progress: 0, done: false }));
    },

    generateWeeklyQuests() {
        const types = [
            { id: "w_trans", title: "Le Transporteur", desc: "Compter 400 Camions cette semaine.", target: 400, type: "poids_lourds", xpReward: 1000 },
            { id: "w_inter", title: "Le Douanier", desc: "Compter 200 camions étrangers.", target: 200, type: "camion_etr", xpReward: 1000 },
            { id: "w_all", title: "Gros Trafic", desc: "Compter 1000 véhicules au total.", target: 1000, type: "total", xpReward: 1000 }
        ];
        return types.sort(() => 0.5 - Math.random()).slice(0, 2).map(q => ({ ...q, progress: 0, done: false }));
    },

    generateSeasonQuests() {
        return [
            { id: "s_cent", title: "Le Centurion", desc: "Compter 10 000 véhicules au total.", target: 10000, type: "total", xpReward: 5000, progress: 0, done: false },
            { id: "s_cam", title: "Le Titan", desc: "Compter 3 000 Camions.", target: 3000, type: "poids_lourds", xpReward: 5000, progress: 0, done: false }
        ];
    },

    rerollQuest(questIndex) {
        if (this.state.hasRerolledToday) {
            this.showToast("❌ Tu as déjà relancé une quête aujourd'hui !");
            return;
        }
        let pool = [
            { id: "r1", title: "Coup de Chance", desc: "Compter 10 Motos.", target: 10, type: "moto", xpReward: 200 },
            { id: "r2", title: "Le Campeur", desc: "Compter 5 Camping-cars.", target: 5, type: "camping", xpReward: 200 }
        ];
        let newQuest = pool[Math.floor(Math.random() * pool.length)];
        this.state.dailyQuests[questIndex] = { ...newQuest, progress: 0, done: false };
        this.state.hasRerolledToday = true;
        this.saveState();
        this.showToast("🎲 Quête relancée !");
    },

    addXp(amount) {
        if (this.state.level >= this.maxLevel) return; 

        this.state.xp += amount;
        let leveledUp = false;

        while (this.state.xp >= this.xpPerLevel && this.state.level < this.maxLevel) {
            this.state.xp -= this.xpPerLevel;
            this.state.level++;
            leveledUp = true;
        }

        if (leveledUp) this.showToast(`🎉 Niveau Supérieur ! Tu es niveau ${this.state.level} !`);
        this.saveState();
    },

    notifyVehicleAdded(typeVehicule, nationalite = null) {
        let changed = false;

        const checkAndUpdate = (q) => {
            if (!q || q.done) return false;
            let match = false;
            if (q.type === "total") match = true;
            if (q.type === "camion_fr" && nationalite === "fr") match = true;
            if (q.type === "camion_etr" && nationalite === "etr") match = true;
            if (q.type === "utilitaire" && typeVehicule === "Utilitaires") match = true;
            if (q.type === "poids_lourds" && typeVehicule === "Camions") match = true;
            if (q.type === "moto" && typeVehicule === "Motos") match = true;
            if (q.type === "camping" && typeVehicule === "Camping-cars") match = true;

            if (match) {
                q.progress++;
                if (q.progress >= q.target) {
                    q.progress = q.target;
                    q.done = true;
                    this.addXp(q.xpReward);
                    this.showToast(`🎯 Quête validée : ${q.title} (+${q.xpReward} XP)`);
                }
                return true;
            }
            return false;
        };

        if (this.state.dailyQuests) this.state.dailyQuests.forEach(q => { if(checkAndUpdate(q)) changed = true; });
        if (this.state.weeklyQuests) this.state.weeklyQuests.forEach(q => { if(checkAndUpdate(q)) changed = true; });
        if (this.state.seasonQuests) this.state.seasonQuests.forEach(q => { if(checkAndUpdate(q)) changed = true; });

        if (changed) this.saveState();
    },

    createUI() {
        if(document.getElementById('gami-overlay')) return;
        let div = document.createElement('div');
        div.id = 'gami-overlay';
        div.innerHTML = `
            <div id="gami-modal">
                <div class="gami-header">
                    <h2 class="gami-title">🎁 Passe Routier</h2>
                    <button class="btn-close-gami" onclick="document.getElementById('gami-overlay').style.display='none'">X</button>
                </div>
                
                <div style="text-align:center; font-size:0.9em; color:#f1c40f; margin-bottom:10px; font-weight:bold;" id="gami-season-name">Saison en cours</div>
                <div class="gami-level-info">Niveau <span id="gami-lvl-text">1</span></div>
                <div class="gami-xp-container">
                    <div class="gami-xp-fill" id="gami-xp-bar"></div>
                    <div class="gami-xp-text" id="gami-xp-label">0 / 1000 XP</div>
                </div>

                <div class="gami-section-title" style="border-color:#3498db;">📅 Quêtes Journalières</div>
                <div id="gami-daily-container"></div>

                <div class="gami-section-title" style="border-color:#9b59b6; margin-top:20px;">🗓️ Quêtes Hebdomadaires</div>
                <div id="gami-weekly-container"></div>

                <div class="gami-section-title" style="border-color:#e67e22; margin-top:20px;">🏆 Défis de Saison</div>
                <div id="gami-season-container"></div>
            </div>
        `;
        document.body.appendChild(div);

        setTimeout(() => {
            let topBar = document.querySelector('.top-bar-controls > div:nth-child(2)');
            if(topBar && !document.getElementById('btn-open-gami')) {
                let btn = document.createElement('button');
                btn.id = "btn-open-gami";
                btn.innerText = "🎁 Passe";
                btn.style.backgroundColor = "#8e44ad"; 
                btn.style.color = "white";
                btn.onclick = () => {
                    this.updateUI(); 
                    document.getElementById('gami-overlay').style.display = 'flex';
                };
                topBar.insertBefore(btn, topBar.firstChild);
            }
        }, 500);
    },

    renderQuests(containerId, questsArray, isDaily) {
        let el = document.getElementById(containerId);
        if(!el) return;
        el.innerHTML = '';
        
        // Sécurité ultime contre les bugs d'affichage
        if (!questsArray || questsArray.length === 0) {
            el.innerHTML = '<span style="color:#7f8c8d; font-size:0.8em;">Génération des quêtes en cours...</span>';
            return;
        }

        questsArray.forEach((q, index) => {
            let isDone = q.done ? "gami-quest-done" : "";
            let rerollBtn = (isDaily && !q.done && !this.state.hasRerolledToday) ? `<button class="gami-btn-reroll" onclick="window.gami.rerollQuest(${index})" title="Relancer cette quête">🎲</button>` : '';
            
            el.innerHTML += `
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
    },

    updateUI() {
        let elSeason = document.getElementById('gami-season-name');
        let elLvl = document.getElementById('gami-lvl-text');
        let elBar = document.getElementById('gami-xp-bar');
        let elLabel = document.getElementById('gami-xp-label');

        if(elSeason) elSeason.innerText = this.state.seasonName || "Saison";
        if(elLvl) elLvl.innerText = this.state.level;
        if(elBar) elBar.style.width = ((this.state.xp / this.xpPerLevel) * 100) + '%';
        if(elLabel) elLabel.innerText = `${this.state.xp} / ${this.xpPerLevel} XP`;

        this.renderQuests('gami-daily-container', this.state.dailyQuests, true);
        this.renderQuests('gami-weekly-container', this.state.weeklyQuests, false);
        this.renderQuests('gami-season-container', this.state.seasonQuests, false);
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
