import  { ui } from './jsui.js';
import { gps } from './jsgps.js';
import { ml } from './jsml.js';

window.ui = ui; window.gps = gps; window.ml = ml;

const app = {
    currentUser: localStorage.getItem('currentUser') || 'Sylvain',
    currentMode: localStorage.getItem('currentMode') || 'voiture',
    usersList: JSON.parse(localStorage.getItem('usersList')) || ['Sylvain'],

    // ⚖️ Dictionnaire dynamique des Poids et CO2
    vehicleSpecs: {
        "Voitures": { wMin: 1100, wMax: 1900, cMin: 90, cMax: 180 },
        "Utilitaires": { wMin: 1700, wMax: 3500, cMin: 160, cMax: 260 },
        "Motos": { wMin: 150, wMax: 400, cMin: 60, cMax: 130 },
        "Camions": { wMin: 12000, wMax: 44000, cMin: 600, cMax: 1300 },
        "Camping-cars": { wMin: 2800, wMax: 4250, cMin: 190, cMax: 320 },
        "Bus/Car": { wMin: 12000, wMax: 19000, cMin: 800, cMax: 1400 },
        "Engins agricoles": { wMin: 4000, wMax: 15000, cMin: 1000, cMax: 2500 },
        "Vélos": { wMin: 10, wMax: 28, cMin: 0, cMax: 0 }
    },

    // 💸 Dictionnaire des valeurs financières (Compteur Véhicules)
    bankValues: {
        "Voitures": 1,
        "Vélos": 1,
        "Utilitaires": 5,
        "Motos": 5,
        "Camions": 20, 
        "Camping-cars": 50,
        "Bus/Car": 50,
        "Engins agricoles": 200
    },

    // ==========================================
    // 🏢 VARIABLES DE L'ENTREPRISE (TYCOON)
    // ==========================================
    companyCatalog: {
        buildings: {
            terrain: { id: 'terrain', name: 'Terrain vague', price: 15000, slots: 3, icon: '🚧' },
            depot: { id: 'depot', name: 'Dépôt Sécurisé', price: 120000, slots: 10, icon: '🏭' },
            hub: { id: 'hub', name: 'Hub Logistique', price: 800000, slots: 999, icon: '🏢' } // 999 = illimité
        },
        fleet: {
            vul: { id: 'vul', name: 'VUL d\'occasion', price: 15000, income: 0.50, icon: '🚐' },
            porteur: { id: 'porteur', name: 'Petit Porteur 19t', price: 45000, income: 1.50, icon: '🚚' },
            tracteur: { id: 'tracteur', name: 'Tracteur Routier', price: 110000, income: 4.00, icon: '🚛' },
            frigo: { id: 'frigo', name: 'Ens. Frigorifique', price: 170000, income: 6.00, icon: '❄️' },
            convoi: { id: 'convoi', name: 'Convoi Exceptionnel', price: 350000, income: 12.00, icon: '⚠️' }
        }
    },
    companyState: {
        buildings: { terrain: 0, depot: 0, hub: 0 },
        fleet: { vul: 0, porteur: 0, tracteur: 0, frigo: 0, convoi: 0 },
        pendingIncome: 0
    },

    // ==========================================
    // 🏦 VARIABLES DE LA BOURSE DE L'ASPHALTE
    // ==========================================
    bankBalance: 0,
    bankHistory: [],
    bankStats: { gains: 0, losses: 0 },
    sessionFinance: { gains: 0, losses: 0, carbon: 0, details: {} }, 
    
    pendingSponsor: null,
    activeSponsor: null,
    sponsorCooldownUntil: 0, 
    lastCountTime: 0,
    regularityChain: 0,

    sessionPaveWeight: 0,
    consecutiveLightVehicles: 0,

    formatWeight(kg) {
        if (!kg) return "0 kg";
        return kg >= 1000 ? (kg / 1000).toFixed(1) + " t" : kg + " kg";
    },

    formatCarbon(g) {
        if (!g) return "0 g";
        if (g >= 1000000) return (g / 1000000).toFixed(2) + " t";
        if (g >= 1000) return (g / 1000).toFixed(1) + " kg";
        return Math.round(g) + " g";
    },

    storage: {
        state: {},
        init() {
            let key = `appState_${window.app.currentUser}_${window.app.currentMode}`;
            let data = localStorage.getItem(key);
            this.state = data ? JSON.parse(data) : {};
        },
        get(k) { return this.state[k] !== undefined ? this.state[k] : null; },
        set(k, v) { 
            this.state[k] = v; 
            let key = `appState_${window.app.currentUser}_${window.app.currentMode}`;
            localStorage.setItem(key, JSON.stringify(this.state));
        },
        clearAll() {
            this.state = {};
            let key = `appState_${window.app.currentUser}_${window.app.currentMode}`;
            localStorage.removeItem(key);
        }
    },

    async initBank() {
        let userData = null;
        if (this.idb && this.idb.db) {
            userData = await this.idb.getUserData(this.currentUser);
        }
        
        let needsMigration = false;
        let defaultCompany = { buildings: { terrain: 0, depot: 0, hub: 0 }, fleet: { vul: 0, porteur: 0, tracteur: 0, frigo: 0, convoi: 0 }, pendingIncome: 0 };

        if (userData) {
            this.bankBalance = userData.bankBalance || 0;
            this.bankHistory = userData.bankHistory || [];
            this.bankStats = userData.bankStats || { gains: 0, losses: 0 };
            
            this.companyState = JSON.parse(JSON.stringify(defaultCompany));
            if (userData.companyState) {
                if (userData.companyState.buildings) this.companyState.buildings = { ...defaultCompany.buildings, ...userData.companyState.buildings };
                if (userData.companyState.fleet) this.companyState.fleet = { ...defaultCompany.fleet, ...userData.companyState.fleet };
                this.companyState.pendingIncome = userData.companyState.pendingIncome || 0;
            }
            
            if (window.gami && userData.gamiState) {
                window.gami.state = userData.gamiState;
            }
        } else {
            this.companyState = JSON.parse(JSON.stringify(defaultCompany));
        }

        let savedBank = localStorage.getItem('bankState_' + this.currentUser);
        if (savedBank !== null) {
            this.bankBalance = parseFloat(savedBank);
            this.bankHistory = JSON.parse(localStorage.getItem('bankHistory_' + this.currentUser) || "[]");
            this.bankStats = JSON.parse(localStorage.getItem('bankStats_' + this.currentUser) || '{"gains":0,"losses":0}');
            
            let savedComp = localStorage.getItem('companyState_' + this.currentUser);
            if (savedComp) {
                let parsed = JSON.parse(savedComp);
                if (parsed.buildings) this.companyState.buildings = { ...defaultCompany.buildings, ...parsed.buildings };
                if (parsed.fleet) this.companyState.fleet = { ...defaultCompany.fleet, ...parsed.fleet };
                this.companyState.pendingIncome = parsed.pendingIncome || 0;
            }
            
            let savedGami = localStorage.getItem('gami_state_' + this.currentUser);
            if (savedGami && window.gami) window.gami.state = JSON.parse(savedGami);

            needsMigration = true;
        }

        if (needsMigration) {
            await this.saveUserData();
            localStorage.removeItem('bankState_' + this.currentUser);
            localStorage.removeItem('bankHistory_' + this.currentUser);
            localStorage.removeItem('bankStats_' + this.currentUser);
            localStorage.removeItem('companyState_' + this.currentUser);
            localStorage.removeItem('gami_state_' + this.currentUser);
        }

        this.companyState.pendingIncome = 0; 
        this.updateBankUI();
        this.renderCompanyUI();
    },

    async saveUserData() {
        let data = {
            bankBalance: this.bankBalance,
            bankHistory: this.bankHistory,
            bankStats: this.bankStats,
            companyState: this.companyState,
            gamiState: window.gami ? window.gami.state : null
        };
        if (this.idb && this.idb.db) {
            await this.idb.saveUserData(this.currentUser, data);
        }
    },

    getCompanyStats() {
        if (!this.companyState) this.companyState = { buildings: { terrain: 0, depot: 0, hub: 0 }, fleet: { vul: 0, porteur: 0, tracteur: 0, frigo: 0, convoi: 0 }, pendingIncome: 0 };
        if (!this.companyState.buildings) this.companyState.buildings = { terrain: 0, depot: 0, hub: 0 };
        if (!this.companyState.fleet) this.companyState.fleet = { vul: 0, porteur: 0, tracteur: 0, frigo: 0, convoi: 0 };

        let maxSlots = (this.companyState.buildings.terrain * 3) + (this.companyState.buildings.depot * 10) + (this.companyState.buildings.hub * 999);
        let usedSlots = Object.values(this.companyState.fleet).reduce((a, b) => a + b, 0);
        let incomePerMin = 0;
        Object.keys(this.companyState.fleet).forEach(k => {
            incomePerMin += this.companyState.fleet[k] * this.companyCatalog.fleet[k].income;
        });
        if (this.companyState.buildings.hub > 0) {
            incomePerMin *= 1.10;
        }
        // 📢 PUBLICITÉ TYCOON : +5% par camion possédé dans la flotte
        let totalTrucks = Object.values(this.companyState.fleet).reduce((a, b) => a + b, 0);
        if (totalTrucks > 0) {
            incomePerMin *= (1 + totalTrucks * 0.05);
        }
        return { maxSlots, usedSlots, incomePerMin };
    },

    buyCompanyItem(category, id) {
        let item = this.companyCatalog[category][id];
        if (!item) return;
        
        if (this.bankBalance < item.price) {
            if(window.ui) window.ui.showToast("❌ Fonds insuffisants pour cet investissement !");
            return;
        }
        
        if (category === 'fleet') {
            let stats = this.getCompanyStats();
            if (stats.usedSlots >= stats.maxSlots) {
                if(window.ui) window.ui.showToast("🅿️ Plus de place de parking ! Achète des infrastructures d'abord.");
                return;
            }
        }

        if(confirm(`Investir ${item.price.toLocaleString('fr-FR')} € dans : ${item.name} ?`)) {
            this.addBankTransaction(-item.price, `Achat Actif : ${item.name}`);
            if(window.gami) window.gami.updateProgress('tycoon_buy', 1); // 🎯 QUÊTE TYCOON
            this.companyState[category][id] = (this.companyState[category][id] || 0) + 1;
            this.saveUserData();
            this.renderCompanyUI();
            
            if(window.ui) {
                window.ui.playGamiSound('cash');
                window.ui.showToast(`🏢 Achat réussi : ${item.name} !`);
            }
        }
    },

    async renderCompanyUI() {
        let stats = this.getCompanyStats();
        
        let elSlotsUsed = document.getElementById('company-slots-used');
        let elSlotsMax = document.getElementById('company-slots-max');
        let elRate = document.getElementById('company-rate-display');
        let elPending = document.getElementById('company-pending-income');

        if(elSlotsUsed) elSlotsUsed.innerText = stats.usedSlots;
        if(elSlotsMax) elSlotsMax.innerText = stats.maxSlots === 0 ? "0" : (stats.maxSlots >= 999 ? "∞" : stats.maxSlots);
        if(elRate) elRate.innerText = `Rythme actuel : + ${stats.incomePerMin.toFixed(2)} € / min`;
        if(elPending) elPending.innerText = this.companyState.pendingIncome.toFixed(2) + ' €';

        let buildList = document.getElementById('company-buildings-list');
        if(buildList) {
            buildList.innerHTML = '';
            Object.keys(this.companyCatalog.buildings).forEach(k => {
                let item = this.companyCatalog.buildings[k];
                let count = this.companyState.buildings[k] || 0;
                let canBuy = this.bankBalance >= item.price;
                
                buildList.innerHTML += `
                    <div class="tycoon-card ${count > 0 ? 'owned' : ''}">
                        ${count > 0 ? `<div class="tycoon-owned-badge">${count}x</div>` : ''}
                        <div class="tycoon-title">${item.icon} ${item.name}</div>
                        <div class="tycoon-revenue">Places : +${item.slots >= 999 ? 'Illimitées' : item.slots}</div>
                        <div class="tycoon-price">${item.price.toLocaleString('fr-FR')} €</div>
                        <button class="btn-buy" ${!canBuy ? 'disabled' : ''} onclick="window.app.buyCompanyItem('buildings', '${k}')">Acheter</button>
                    </div>
                `;
            });
        }

        let fleetList = document.getElementById('company-fleet-list');
        if(fleetList) {
            fleetList.innerHTML = '';
            Object.keys(this.companyCatalog.fleet).forEach(k => {
                let item = this.companyCatalog.fleet[k];
                let count = this.companyState.fleet[k] || 0;
                let canBuy = this.bankBalance >= item.price && stats.usedSlots < stats.maxSlots;
                let btnTxt = stats.usedSlots >= stats.maxSlots && stats.maxSlots > 0 ? "Parking plein" : "Acheter";

                fleetList.innerHTML += `
                    <div class="tycoon-card ${count > 0 ? 'owned' : ''}">
                        ${count > 0 ? `<div class="tycoon-owned-badge">${count}x</div>` : ''}
                        <div class="tycoon-title">${item.icon} ${item.name}</div>
                        <div class="tycoon-revenue">Revenu net : +${item.income.toFixed(2)} €/min</div>
                        <div class="tycoon-price">${item.price.toLocaleString('fr-FR')} €</div>
                        <button class="btn-buy" ${!canBuy ? 'disabled' : ''} onclick="window.app.buyCompanyItem('fleet', '${k}')">${btnTxt}</button>
                    </div>
                `;
            });
        }

        let histContainer = document.getElementById('company-financial-history');
        if (histContainer && this.idb && this.idb.db) {
            let carSessions = await this.idb.getAll('cars');
            carSessions.sort((a,b) => b.id - a.id);
            
            let html = '';
            let financialSessions = carSessions.filter(s => s.sessionFinance && (s.sessionFinance.gains > 0 || s.sessionFinance.losses > 0 || s.sessionFinance.carbon !== 0));

            if(financialSessions.length === 0) {
                html = '<span style="color:#7f8c8d; font-size:0.9em; padding: 10px; display: block; text-align: center;">Aucun ticket de caisse généré. Fais un trajet ! 🚗💨</span>';
            } else {
                financialSessions.slice(0, 15).forEach(s => {
                    let sf = s.sessionFinance || { gains: 0, losses: 0, carbon: 0 };
                    let gains = sf.gains || 0;
                    let losses = sf.losses || 0;
                    let carb = sf.carbon || 0;
                    let bal = gains - losses + carb; 
                    
                    let color = bal >= 0 ? '#27ae60' : '#e74c3c';
                    let sign = bal > 0 ? '+' : '';
                    
                    let htmlDetailVehicules = '';
                    if (s.summary) {
                        Object.keys(s.summary).forEach(type => {
                            let count = s.summary[type];
                            if (count > 0) {
                                let icon = type === "Voitures" ? "🚗" : type === "Utilitaires" ? "🚐" : type === "Camions" ? "🚛" : type === "Engins agricoles" ? "🚜" : type === "Bus/Car" ? "🚌" : type === "Camping-cars" ? "🏕️" : type === "Motos" ? "🏍️" : type === "Vélos" ? "🚲" : "🚘";
                                htmlDetailVehicules += `<div style="display:flex; justify-content: space-between; font-size:0.8em; margin-bottom:2px; color: var(--text-color);">
                                    <span>${icon} ${type === "Camions" ? "Poids Lourds" : type} (x${count})</span>
                                </div>`;
                            }
                        });
                    }

                    html += `
                    <div class="tycoon-card clickable" style="cursor:pointer; padding: 12px; border-left: 4px solid ${color}; margin-bottom:10px;" onclick="window.app.showSessionDetails('cars', '${s.id}')">
                        <div style="display:flex; justify-content: space-between; border-bottom: 1px dashed var(--border-color); padding-bottom: 5px; margin-bottom: 8px;">
                            <strong style="font-size:0.9em;">🧾 SESSION ${s.date.split(' ')[0]}</strong>
                            <strong style="color:${color};">${sign}${bal} €</strong>
                        </div>
                        
                        <div style="margin-bottom: 8px;">
                            <strong style="font-size:0.75em; color:#7f8c8d; display:block; margin-bottom:4px; text-transform:uppercase;">Détail du comptage :</strong>
                            ${htmlDetailVehicules}
                        </div>

                        <div style="border-top: 1px solid rgba(0,0,0,0.05); padding-top: 5px; font-size:0.8em;">
                            <div style="display:flex; justify-content: space-between; margin-bottom:2px;">
                                <span style="color:#7f8c8d;">📈 Gains & Bonus</span>
                                <span style="color:#27ae60; font-weight:bold;">+${gains}€</span>
                            </div>
                            <div style="display:flex; justify-content: space-between; margin-bottom:2px;">
                                <span style="color:#7f8c8d;">💸 Péages & Amendes</span>
                                <span style="color:#e74c3c; font-weight:bold;">-${losses}€</span>
                            </div>
                            <div style="display:flex; justify-content: space-between;">
                                <span style="color:#7f8c8d;">🌿 Bilan Carbone</span>
                                <span style="color:${carb >= 0 ? '#27ae60' : '#e74c3c'}; font-weight:bold;">${carb > 0 ? '+' : ''}${carb}€</span>
                            </div>
                        </div>
                    </div>`;
                });
            }
            histContainer.innerHTML = html;
        }
    }, 

    async resetBankData() {
        if (confirm(`🚨 ATTENTION SYLVAIN ! Tu vas vider ton compte en banque, ton historique financier ET revendre toute ton entreprise pour zéro euro ! Es-tu sûr de vouloir déclarer faillite ?`)) {
            this.bankBalance = 0;
            this.bankHistory = [];
            this.bankStats = { gains: 0, losses: 0 };
            this.sessionFinance = { gains: 0, losses: 0, carbon: 0 };
            
            this.companyState = { buildings: { terrain: 0, depot: 0, hub: 0 }, fleet: { vul: 0, porteur: 0, tracteur: 0, frigo: 0, convoi: 0 }, pendingIncome: 0 };
            
            await this.saveUserData();
            
            this.updateBankUI();
            this.renderCompanyUI();
            
            if (window.ui) window.ui.showToast("💸 La Bourse et l'Entreprise ont été remises à zéro !");
        }
    },

    addBankTransaction(amount, reason) {
        if (amount === 0) return;
        this.bankBalance += amount;
        if (amount > 0) {
            this.bankStats.gains += amount;
            if (this.isCarRunning) this.sessionFinance.gains += amount;
        } else {
            this.bankStats.losses += Math.abs(amount);
            if (this.isCarRunning) this.sessionFinance.losses += Math.abs(amount);
        }

        let now = new Date();
        this.bankHistory.unshift({
            time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            amount: amount,
            reason: reason
        });

        if (this.bankHistory.length > 50) this.bankHistory.pop();
        this.saveUserData(); 
        this.updateBankUI(); 
        
        if(window.ui && window.ui.activeTab === 'company') {
            this.renderCompanyUI();
        }
    },

    updateBankUI() {
        let badge = document.getElementById('bank-badge');
        let display = document.getElementById('display-bank');
        let banner = document.getElementById('huissier-banner');
        let sTitle = document.getElementById('sponsor-title');

        if (!badge || !display) return;

        badge.style.display = 'flex';
        display.innerText = Math.round(this.bankBalance).toLocaleString('fr-FR') + ' €';
        
        if (this.bankBalance < 0) {
            badge.classList.remove('bank-positive');
            badge.classList.add('bank-negative');
            if (banner) banner.style.display = 'block';
            if (sTitle && this.activeSponsor) sTitle.style.color = '#e74c3c';
        } else {
            badge.classList.remove('bank-negative');
            badge.classList.add('bank-positive');
            if (banner) banner.style.display = 'none';
            if (sTitle && this.activeSponsor) sTitle.style.color = '#f1c40f';
        }
    },

    openBankModal() {
        let elGains = document.getElementById('bank-total-gains');
        let elLosses = document.getElementById('bank-total-losses');
        let elList = document.getElementById('bank-history-list');

        if (elGains) elGains.innerText = Math.round(this.bankStats.gains) + ' €';
        if (elLosses) elLosses.innerText = Math.round(this.bankStats.losses) + ' €';

        if (elList) {
            elList.innerHTML = '';
            if (this.bankHistory.length === 0) {
                elList.innerHTML = '<span style="color:#7f8c8d; font-size:0.9em;">Aucune transaction... commence à compter !</span>';
            } else {
                this.bankHistory.forEach(tx => {
                    let color = tx.amount > 0 ? '#27ae60' : '#e74c3c';
                    let sign = tx.amount > 0 ? '+' : '';
                    elList.innerHTML += `
                        <div class="session-detail-row">
                            <span class="session-detail-label" style="font-size:0.85em;">${tx.time} - ${tx.reason}</span>
                            <span class="session-detail-value" style="color:${color}; font-size:0.95em;">${sign}${Math.round(tx.amount)} €</span>
                        </div>
                    `;
                });
            }
        }
        document.getElementById('bank-modal').style.display = 'flex';
    },

    async checkBankruptcy() {
        if (this.bankBalance <= -10000) {
            if(window.ui) {
                window.ui.showToast("☠️ LIQUIDATION JUDICIAIRE ! La faillite est prononcée.", "anomaly");
                window.ui.playGamiSound('siren');
            }
            this.addBankTransaction(Math.abs(this.bankBalance), "Saisie Totale (Faillite)"); 
            
            this.companyState = { buildings: { terrain: 0, depot: 0, hub: 0 }, fleet: { vul: 0, porteur: 0, tracteur: 0, frigo: 0, convoi: 0 }, pendingIncome: 0 };
            await this.saveUserData(); 

            if (window.gami) {
                window.gami.state.level = 1;
                window.gami.state.xp = 0;
                window.gami.saveState();
            }
        }
    },

    showMoneyParticle(e, amount) {
        if (!e || !e.clientX) return;
        const p = document.createElement('div');
        p.className = 'money-particle ' + (amount >= 0 ? 'money-positive' : 'money-negative');
        p.innerText = amount >= 0 ? `+${amount} €` : `${amount} €`;
        p.style.left = e.clientX + 'px';
        p.style.top = e.clientY + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    },

    updateCarbonGauge() {
        if (!this.isCarRunning) {
            let container = document.getElementById('carbon-gauge-container');
            if (container) container.style.display = 'none';
            return;
        }

        let container = document.getElementById('carbon-gauge-container');
        let fill = document.getElementById('carbon-gauge-fill');
        let text = document.getElementById('carbon-gauge-text');
        
        if (container) container.style.display = 'block';

        let items = this.carHistory.filter(h => !h.isEvent);
        let totalRealCo2 = 0;
        let quota = 0;
        let bikeBonus = 0; 
        
        items.forEach(item => {
            let distVehicule = Math.max(0.1, this.liveCarDistance - (item.distAtSighting || 0));
            let categoryAverage = this.vehicleSpecs[item.type] ? (this.vehicleSpecs[item.type].cMin + this.vehicleSpecs[item.type].cMax) / 2 : 120;
            let co2 = item.co2 !== undefined ? item.co2 : categoryAverage;
            totalRealCo2 += co2 * distVehicule;
            quota += categoryAverage * distVehicule; 
            
            if (item.type === "Vélos" && item.bikeBonus) bikeBonus += item.bikeBonus;
        });
        
        quota += bikeBonus; 
        
        let pct = quota > 0 ? (totalRealCo2 / quota) * 100 : 0;
        let visualPct = pct > 100 ? 100 : pct; 
        
        if (fill) {
            fill.style.width = visualPct + '%';
            if (totalRealCo2 > quota) {
                fill.style.backgroundColor = '#e74c3c'; 
                container.style.borderColor = '#e74c3c';
            } else if (totalRealCo2 > quota * 0.8) {
                fill.style.backgroundColor = '#f39c12'; 
                container.style.borderColor = '#f39c12';
            } else {
                fill.style.backgroundColor = '#27ae60'; 
                container.style.borderColor = '#27ae60';
            }
        }
        
        if (text) {
            text.innerText = `${this.formatCarbon(totalRealCo2)} / ${this.formatCarbon(quota)} autorisés`;
            text.style.color = totalRealCo2 > quota ? '#e74c3c' : '#7f8c8d';
        }
    },

    checkCarbonFootprint() {
        let items = this.carHistory.filter(h => !h.isEvent);
        let count = items.length;
        if (count === 0) return 0;

        let totalRealCo2 = 0;
        let quota = 0;
        let bikeBonus = 0; 

        items.forEach(item => {
            let distVehicule = Math.max(0.1, this.liveCarDistance - (item.distAtSighting || 0));
            let categoryAverage = this.vehicleSpecs[item.type] ? (this.vehicleSpecs[item.type].cMin + this.vehicleSpecs[item.type].cMax) / 2 : 120;
            let co2 = item.co2 !== undefined ? item.co2 : categoryAverage;
            totalRealCo2 += co2 * distVehicule;
            quota += categoryAverage * distVehicule;
            
            if (item.type === "Vélos" && item.bikeBonus) bikeBonus += item.bikeBonus;
        });

        quota += bikeBonus; 
        
        let diff = quota - totalRealCo2; 
        let euros = Math.round(diff / 100); 

        if (euros < 0 && window.gami && window.gami.state.unlockedTalents.ecoConduite) {
            euros = Math.round(euros * 0.85); 
            if(window.ui) window.ui.showToast(`🌳 Talent Éco-Conduite : Taxe carbone réduite !`);
        }

        if (euros > 0) {
            this.addBankTransaction(euros, "Revente Crédits Carbone 🌿");
            if(window.gami) window.gami.updateProgress('carbone_cash', euros); // 🎯 QUÊTE CARBONE
            if(window.ui) { window.ui.showToast(`🌿 Trafic Écolo ! Crédits revendus : +${euros} €`); window.ui.playGamiSound('cash'); }
        } else if (euros < 0) {
            this.addBankTransaction(euros, "Taxe Carbone Globale 💨");
            if(window.ui) { window.ui.showToast(`💨 Trafic Polluant ! Taxe Carbone : ${euros} €`, "anomaly"); window.ui.playGamiSound('siren'); }
        }
        
        return euros;
    },

    generateSponsorOffer() {
        if (this.activeSponsor || !this.isCarRunning) return;
        if (Date.now() < this.sponsorCooldownUntil) return; 
        if (Math.random() > 0.15) return; 

        let types = ["Utilitaires", "Camions", "Camping-cars", "Bus/Car"];
        let t = types[Math.floor(Math.random() * types.length)];
        let target = Math.floor(Math.random() * 8) + 3; 
        let advance = target * (this.bankValues[t] || 5) * 3; 
        
        if (window.gami && window.gami.state.unlockedTalents.negociateur) {
            advance = Math.round(advance * 1.20); 
        }

        this.pendingSponsor = { type: t, target: target, advance: advance, penalty: advance * 2 };
        
        let modalDesc = document.getElementById('sponsor-desc');
        if (modalDesc) {
            modalDesc.innerHTML = `L'entreprise te propose <strong style="color:#27ae60;">+${advance}€</strong> pour <strong>${target} ${t === 'Camions' ? 'Poids Lourds' : t}</strong>. <span style="color:#e74c3c; font-size:0.85em;">Pénalité échec : -${advance*2}€ !</span>`;
        }
        
        let actions = document.getElementById('sponsor-offer-actions');
        if (actions) actions.style.display = 'flex';
        
        if(window.ui) {
            window.ui.showToast(`💼 Offre de Sponsor reçue !`);
            window.ui.playGamiSound('siren');
        }
    },

    refuseSponsorOffer() {
        this.pendingSponsor = null;
        this.sponsorCooldownUntil = Date.now() + (2 * 60 * 1000); 
        let actions = document.getElementById('sponsor-offer-actions');
        if (actions) actions.style.display = 'none';
        document.getElementById('sponsor-desc').innerText = `Recherche d'un nouveau sponsor en cours...`;
    },

    signSponsorContract() {
        if (!this.pendingSponsor) return;
        let actions = document.getElementById('sponsor-offer-actions');
        if (actions) actions.style.display = 'none';

        this.activeSponsor = { ...this.pendingSponsor, current: 0 };
        this.pendingSponsor = null;
        
        this.addBankTransaction(this.activeSponsor.advance, `Avance Sponsor (${this.activeSponsor.type})`);
        if(window.ui) window.ui.playGamiSound('cash');
        
        document.getElementById('sponsor-title').innerText = `🤝 Contrat : ${this.activeSponsor.target} ${this.activeSponsor.type}`;
        document.getElementById('sponsor-desc').innerText = `Objectif à atteindre avant la fin de session.`;
        document.getElementById('btn-validate-sponsor').style.display = 'none';
        document.getElementById('sponsor-banner').classList.add('sponsor-active');
        this.updateSponsorUI();
    },

    updateSponsorUI() {
        if (!this.activeSponsor) return;
        let el = document.getElementById('sponsor-progress');
        let btnValidate = document.getElementById('btn-validate-sponsor');
        
        el.style.display = 'block';
        el.innerText = `Progression : ${this.activeSponsor.current} / ${this.activeSponsor.target}`;
        
        if (this.activeSponsor.current >= this.activeSponsor.target) {
            el.innerText = "✅ Objectif atteint !";
            el.style.color = "#2ecc71";
            if(btnValidate) btnValidate.style.display = 'block'; 
        } else {
            el.style.color = "#fff";
            if(btnValidate) btnValidate.style.display = 'none';
        }
    },

    validateSponsorContract() {
        if (!this.activeSponsor || this.activeSponsor.current < this.activeSponsor.target) return;
        let bonusMultiplier = 1.05 + (Math.random() * 0.20); 
        let finalReward = Math.round(this.activeSponsor.advance * bonusMultiplier);
        
        this.addBankTransaction(finalReward, `Bonus Fin de Contrat Sponsor (${this.activeSponsor.type})`);
        if(window.gami) window.gami.updateProgress('sponsor', 1); // 🎯 QUÊTE SPONSOR
        if(window.ui) { window.ui.showToast(`🎉 Contrat validé ! Bénéfice encaissé : +${finalReward} € !`); window.ui.playGamiSound('cash'); }
        
        this.activeSponsor = null;
        this.sponsorCooldownUntil = Date.now() + (3 * 60 * 1000); 
        this.resetSponsorUI();
    },

    checkSponsorOnStop() {
        if (this.activeSponsor) {
            if (this.activeSponsor.current < this.activeSponsor.target) {
                this.addBankTransaction(-this.activeSponsor.penalty, `Rupture Contrat Sponsor (${this.activeSponsor.type})`);
                if(window.ui) { window.ui.showToast(`📉 Contrat raté ! Pénalité : -${this.activeSponsor.penalty} €`, "anomaly"); window.ui.playGamiSound('crash'); }
            } else {
                this.validateSponsorContract(); 
            }
            this.activeSponsor = null;
            this.resetSponsorUI();
        } else if (this.pendingSponsor) {
            this.pendingSponsor = null;
            this.resetSponsorUI();
        }
    },

    resetSponsorUI() {
        let elTitle = document.getElementById('sponsor-title');
        let elDesc = document.getElementById('sponsor-desc');
        let elProg = document.getElementById('sponsor-progress');
        let elBanner = document.getElementById('sponsor-banner');
        let btnValidate = document.getElementById('btn-validate-sponsor');
        let actions = document.getElementById('sponsor-offer-actions');
        
        if(elTitle) elTitle.innerText = `🤝 Aucun contrat`;
        if(elDesc) elDesc.innerText = this.isCarRunning ? `Recherche de sponsor en cours... 👀` : `Lance le chrono...`;
        if(elProg) elProg.style.display = 'none';
        if(elBanner) elBanner.classList.remove('sponsor-active');
        if(btnValidate) btnValidate.style.display = 'none';
        if(actions) actions.style.display = 'none';
    },

    getRoadType(speedKmh, mode) {
        if (speedKmh === 0) return "Inconnu";
        if (mode === 'voiture') {
            if (speedKmh <= 50) return "Ville (0-50 km/h)";
            if (speedKmh <= 100) return "Route (50-100 km/h)";
            return "Autoroute (>100 km/h)";
        } else {
            if (speedKmh <= 40) return "Ville (0-40 km/h)";
            if (speedKmh <= 80) return "Route (40-80 km/h)";
            return "Autoroute (>80 km/h)";
        }
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
    altitudeModalChart: null, monthlyChart: null, roadTypeChart: null, monthlyModalChart: null, roadModalChart: null,
    aiEvolutionChart: null, 

    currentDashboardFilter: 'all',
    activeDashboardType: 'trucks',
    currentPredictionTruck: null, 
    currentPredictionCar: null,
    predictionIntervals: { trucks: null, cars: null },

    idb: {
        db: null,
        async init() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open("CompteurTraficDB", 2); 
                req.onupgradeneeded = e => {
                    let db = e.target.result;
                    if (!db.objectStoreNames.contains('sessions')) {
                        db.createObjectStore('sessions', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('userData')) {
                        db.createObjectStore('userData', { keyPath: 'id' });
                    }
                };
                req.onsuccess = e => { this.db = e.target.result; resolve(); };
                req.onerror = e => reject("Erreur IDB");
            });
        },
        async getUserData(userId) {
            return new Promise(resolve => {
                let tx = this.db.transaction('userData', 'readonly');
                let req = tx.objectStore('userData').get(userId);
                req.onsuccess = e => resolve(e.target.result);
                req.onerror = () => resolve(null);
            });
        },
        async saveUserData(userId, data) {
            return new Promise(resolve => {
                let tx = this.db.transaction('userData', 'readwrite');
                data.id = userId; 
                tx.objectStore('userData').put(data);
                tx.oncomplete = () => resolve();
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
                let all = await window.app.idb.getAll(type);
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
            roads: { "Inconnu": 0, "Ville (0-50 km/h)": 0, "Route (50-100 km/h)": 0, "Autoroute (>100 km/h)": 0, "Ville (0-40 km/h)": 0, "Route (40-80 km/h)": 0, "Autoroute (>80 km/h)": 0 },
            alts: { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 },
            byVeh: {}, seqs: {}, seqs3: {}, lastVehicles: [], 
            predictions: { total: 0, success: 0 },
            predictionsByClass: {} 
        };
    },

    async buildPermanentAnalyticsFromIDB(type, targetAna) {
        let sessions = await this.idb.getAll(type);
        let dayKeys = Object.keys(targetAna.days);
        let monthKeys = Object.keys(targetAna.months);
        
        if (!targetAna.byVeh) targetAna.byVeh = {};
        if (!targetAna.seqs3) targetAna.seqs3 = {};
        if (!targetAna.lastVehicles) targetAna.lastVehicles = [];
        if (!targetAna.months) targetAna.months = this.getEmptyAnalytics().months;
        if (!targetAna.roads) targetAna.roads = this.getEmptyAnalytics().roads;
        if (!targetAna.predictionsByClass) targetAna.predictionsByClass = {};

        sessions.forEach(s => {
            if (s.history) {
                let hist = s.history.filter(h => !h.isEvent);
                let sessionLastVehicles = []; 
                
                for(let i = 0; i < hist.length; i++) {
                    let h = hist[i];
                    let vehType = type === 'trucks' ? h.brand : h.type;

                    if (!targetAna.byVeh[vehType]) targetAna.byVeh[vehType] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
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
        this.storage.init();
        const keys = [
            'truckCounters', 'vehicleCounters', 'globalTruckCounters', 'globalCarCounters', 
            'truckHistory', 'carHistory', 'globalTruckDistance', 'globalCarDistance', 
            'globalTruckTime', 'globalCarTime', 'truckChronoSec', 'truckAccumulatedTime', 
            'truckStartTime', 'truckChronoRun', 'carChronoSec', 'carAccumulatedTime', 
            'carStartTime', 'carChronoRun', 'liveTruckDist', 'liveCarDist', 
            'globalAnaTrucks', 'globalAnaCars'
        ];
        
        let hasMigrated = false;
        keys.forEach(k => {
            let oldKey = this.currentUser + '_' + this.currentMode + '_' + k;
            let val = localStorage.getItem(oldKey);
            if (val !== null) { 
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (!isNaN(val) && val.trim() !== '') val = Number(val);
                else { try { val = JSON.parse(val); } catch(e) { } }
                this.storage.set(k, val); 
                localStorage.removeItem(oldKey); 
                hasMigrated = true;
            }
        });

        let allSessions = await this.idb.getAllRaw();
        if (allSessions.length > 0) {
            let tx = this.idb.db.transaction('sessions', 'readwrite');
            let store = tx.objectStore('sessions');
            allSessions.forEach(s => { 
                if (!s.user) { 
                    s.user = 'Sylvain'; s.mode = s.profile || 'voiture'; s.profile = 'Sylvain_' + s.mode; store.put(s); 
                } 
            });
        }
    },

    updateHeaderDisplay() {
        let elUser = document.getElementById('display-user');
        let elMode = document.getElementById('display-mode');
        if(elUser) elUser.innerText = this.currentUser;
        if(elMode) elMode.innerText = this.currentMode === 'voiture' ? '🚗 Voiture' : '🚛 Camion';
        this.updateBankUI();
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
            this.storage.clearAll();
            localStorage.removeItem('bankState_' + this.currentUser);
            localStorage.removeItem('bankHistory_' + this.currentUser);
            localStorage.removeItem('bankStats_' + this.currentUser);
            localStorage.removeItem('companyState_' + this.currentUser);
            this.usersList = this.usersList.filter(u => u !== this.currentUser);
            localStorage.setItem('usersList', JSON.stringify(this.usersList));
            this.changeUser(this.usersList[0]);
        }
    },

    async changeUser(newUser) {
        if (this.isTruckRunning) this.toggleChrono('trucks');
        if (this.isCarRunning) this.toggleChrono('cars');

        this.currentUser = newUser;
        localStorage.setItem('currentUser', newUser);
        await this.init(true);
        if (window.ui) window.ui.showToast(`👤 Utilisateur changé : ${newUser}`);
    },

    async changeMode(newMode) {
        if (this.isTruckRunning) this.toggleChrono('trucks');
        if (this.isCarRunning) this.toggleChrono('cars');

        this.currentMode = newMode;
        localStorage.setItem('currentMode', newMode);
        await this.init(true);
        if (window.ui) window.ui.showToast(`🔄 Mode changé : ${newMode === 'voiture' ? '🚘 Voiture' : '🚛 Camion'}`);
    },

    async init(isProfileSwitch = false) {
        if (!isProfileSwitch) { await this.idb.init(); await this.migrateData(); }
        if (window.ml) await window.ml.init();

        this.storage.init();
        await this.initBank();

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

        this.truckCounters = this.storage.get('truckCounters') || {};
        this.vehicleCounters = this.storage.get('vehicleCounters') || {};
        this.globalTruckCounters = this.storage.get('globalTruckCounters') || {};
        this.globalCarCounters = this.storage.get('globalCarCounters') || {};
        this.truckHistory = this.storage.get('truckHistory') || [];
        this.carHistory = this.storage.get('carHistory') || [];
        
        this.globalAnaTrucks = this.storage.get('globalAnaTrucks');
        if (!this.globalAnaTrucks || !this.globalAnaTrucks.months) { 
            this.globalAnaTrucks = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('trucks', this.globalAnaTrucks);
        }
        if (!this.globalAnaTrucks.predictions) this.globalAnaTrucks.predictions = { total: 0, success: 0 };
        if (!this.globalAnaTrucks.predictionsByClass) this.globalAnaTrucks.predictionsByClass = {};
        if (!this.globalAnaTrucks.byVeh) this.globalAnaTrucks.byVeh = {};
        if (!this.globalAnaTrucks.seqs3) this.globalAnaTrucks.seqs3 = {};
        if (!this.globalAnaTrucks.lastVehicles) this.globalAnaTrucks.lastVehicles = [];
        this.storage.set('globalAnaTrucks', this.globalAnaTrucks);

        this.globalAnaCars = this.storage.get('globalAnaCars');
        if (!this.globalAnaCars || !this.globalAnaCars.months) { 
            this.globalAnaCars = this.getEmptyAnalytics(); 
            await this.buildPermanentAnalyticsFromIDB('cars', this.globalAnaCars);
        }
        if (!this.globalAnaCars.predictions) this.globalAnaCars.predictions = { total: 0, success: 0 };
        if (!this.globalAnaCars.predictionsByClass) this.globalAnaCars.predictionsByClass = {};
        if (!this.globalAnaCars.byVeh) this.globalAnaCars.byVeh = {};
        if (!this.globalAnaCars.seqs3) this.globalAnaCars.seqs3 = {};
        if (!this.globalAnaCars.lastVehicles) this.globalAnaCars.lastVehicles = [];
        this.storage.set('globalAnaCars', this.globalAnaCars);

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
        this.isTruckRunning = this.storage.get('truckChronoRun') === true;

        this.carSeconds = parseInt(this.storage.get('carChronoSec')) || 0;
        this.carAccumulatedTime = parseInt(this.storage.get('carAccumulatedTime')) || 0;
        this.carStartTime = parseInt(this.storage.get('carStartTime')) || 0;
        this.isCarRunning = this.storage.get('carChronoRun') === true;

        this.liveTruckDistance = parseFloat(this.storage.get('liveTruckDist')) || 0;
        this.liveCarDistance = parseFloat(this.storage.get('liveCarDist')) || 0;

        if (!this.isTruckRunning) this.truckAccumulatedTime = this.truckSeconds;
        if (!this.isCarRunning) this.carAccumulatedTime = this.carSeconds;

        if (this.isTruckRunning) { this.isTruckRunning = false; this.toggleChrono('trucks'); } else this.updateChronoDisp('trucks');
        if (this.isCarRunning) { this.isCarRunning = false; this.toggleChrono('cars'); } else this.updateChronoDisp('cars');
        
        this.renderTrucks(); this.renderCars(); this.renderKmStats();
        this.renderLiveStats('trucks'); this.renderLiveStats('cars');
        
        this.renderDashboard('trucks');
        
        this.updatePrediction('trucks');
        this.updatePrediction('cars'); 
        
        this.updateCarbonGauge();

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
        } catch (e) { console.warn("Wake Lock refusé"); }
    },

    formatTime(totalSec) {
        let h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
        let m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
        let s = (totalSec % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    },

    updateChronoDisp(type) {
        let isTruck = type === 'trucks';
        let elTime = document.getElementById(isTruck ? 'truck-chrono' : 'car-chrono');
        let elDist = document.getElementById(isTruck ? 'truck-dist' : 'car-dist');
        let sec = isTruck ? this.truckSeconds : this.carSeconds;
        let dist = isTruck ? this.liveTruckDistance : this.liveCarDistance;

        if(elTime) elTime.innerText = `⏱️ ${this.formatTime(sec)}`; 
        if(elDist) elDist.innerText = `📍 ${dist.toFixed(2)} km`; 
    },

    triggerCompanyRandomEvents() {
        let stats = this.getCompanyStats();
        if (stats.usedSlots > 0 && Math.random() < 0.20) { 
            if (Math.random() > 0.5) {
                let bonus = Math.round(stats.incomePerMin * 5); 
                this.addBankTransaction(bonus, "🏢 Fret exceptionnel (Entreprise)");
                if(window.ui) { window.ui.showToast(`🏢 Ton entreprise a décroché un fret express : +${bonus} € !`); window.ui.playGamiSound('cash'); }
            } else {
                let malus = Math.round(stats.incomePerMin * 3); 
                this.addBankTransaction(-malus, "🏢 Réparation d'urgence (Entreprise)");
                if(window.ui) { window.ui.showToast(`⚠️ Crevaison sur un de tes camions d'entreprise ! Frais : -${malus} €`, 'anomaly'); window.ui.playGamiSound('crash'); }
            }
        }
    },

    toggleChrono(type) {
        let isTruck = type === 'trucks';
        let isRunning = isTruck ? this.isTruckRunning : this.isCarRunning;
        isRunning = !isRunning; 
        
        if (isTruck) { this.isTruckRunning = isRunning; this.storage.set('truckChronoRun', isRunning); } 
        else { this.isCarRunning = isRunning; this.storage.set('carChronoRun', isRunning); }

        const btn = document.getElementById(isTruck ? 'btn-truck-chrono' : 'btn-car-chrono'); 
        if(!btn) return;
        
        let seconds = isTruck ? this.truckSeconds : this.carSeconds;
        let hist = isTruck ? this.truckHistory : this.carHistory;
        
        let eventType = isRunning ? "▶️ Reprise" : "⏸️ Pause";
        let histItem = { 
            isEvent: true, eventType: eventType, 
            lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, 
            lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, 
            alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, 
            chronoTime: this.formatTime(seconds), timestamp: Date.now() 
        };
        
        hist.push(histItem);
        this.storage.set(isTruck ? 'truckHistory' : 'carHistory', hist);
        
        let statsView = document.getElementById(isTruck ? 'truck-stats-view' : 'car-stats-view');
        if (statsView && statsView.style.display !== 'none') this.renderAdvancedStats(type);

        if (isRunning) { 
            btn.innerText = "⏸️ Pause"; btn.classList.add('running'); 
            let startTime = Date.now();
            
            if(isTruck) { 
                this.truckStartTime = startTime; this.storage.set('truckStartTime', startTime); 
                this.lastGlobalTruckTick = startTime; 
            } else { 
                this.carStartTime = startTime; this.storage.set('carStartTime', startTime); 
                this.lastGlobalCarTick = startTime; 
                this.lastCountTime = Date.now(); 

                let sponsorDesc = document.getElementById('sponsor-desc');
                if (sponsorDesc && !this.activeSponsor && !this.pendingSponsor) {
                    sponsorDesc.innerText = "Recherche de sponsor en cours... 👀";
                }
            }
            
            let interval = setInterval(() => { 
                let now = Date.now();
                let elapsed = 0;
                
                if(isTruck) {
                    elapsed = Math.floor((now - this.truckStartTime) / 1000);
                    this.truckSeconds = this.truckAccumulatedTime + elapsed; 
                    this.storage.set('truckChronoSec', this.truckSeconds); 
                    
                    let delta = now - this.lastGlobalTruckTick;
                    if(delta >= 1000) {
                        let add = Math.floor(delta / 1000);
                        this.globalTruckTime += add;
                        this.storage.set('globalTruckTime', this.globalTruckTime);
                        this.lastGlobalTruckTick += add * 1000;
                    }
                } else {
                    elapsed = Math.floor((now - this.carStartTime) / 1000);
                    this.carSeconds = this.carAccumulatedTime + elapsed; 
                    this.storage.set('carChronoSec', this.carSeconds); 
                    
                    let delta = now - this.lastGlobalCarTick;
                    if(delta >= 1000) {
                        let add = Math.floor(delta / 1000);
                        this.globalCarTime += add;
                        this.storage.set('globalCarTime', this.globalCarTime);
                        this.lastGlobalCarTick += add * 1000;
                    }

                    if (elapsed > 0 && elapsed % 60 === 0) {
                        this.generateSponsorOffer();
                    }

                    if (elapsed > 0 && elapsed % 300 === 0) { 
                        let currentHour = new Date().getHours();
                        let isNight = (currentHour >= 21 || currentHour < 6);
                        let isRushHour = (currentHour >= 7 && currentHour < 9) || (currentHour >= 17 && currentHour < 19);
            
                        let baseToll = isRushHour ? 20 : (isNight ? 5 : 10);
                        let stepToll = isRushHour ? 20 : (isNight ? 5 : 10);
                        let maxToll = isRushHour ? 200 : (isNight ? 50 : 100);
            
                        let inflationMultiplier = Math.floor(elapsed / 900);
                        let currentToll = baseToll + (inflationMultiplier * stepToll);
                        if (currentToll > maxToll) currentToll = maxToll;
            
                        let tollName = "Péage" + (isRushHour ? " (Heure de pointe) 🚗🚗🚗" : (isNight ? " de nuit 🌙" : " ☀️"));
                        this.addBankTransaction(-currentToll, tollName);
                        if(window.ui) {
                            window.ui.showToast(`💸 ${tollName} : - ${currentToll} €`, "anomaly");
                            window.ui.playGamiSound('siren');
                        }
                    }

                    if (elapsed > 0 && elapsed % 600 === 0 && this.bankBalance < 0) {
                        let agios = Math.abs(this.bankBalance) * 0.05;
                        this.addBankTransaction(-agios, "Agios (5%)");
                        if(window.ui) {
                            window.ui.showToast(`📉 Agios (5%) : - ${Math.round(agios)} €`, "anomaly");
                            window.ui.playGamiSound('crash');
                        }
                    }

                    this.updateCarbonGauge();
                }

                let cStats = this.getCompanyStats();
                if (cStats.incomePerMin > 0) {
                    this.companyState.pendingIncome += (cStats.incomePerMin / 60); 
                    let displayPending = document.getElementById('company-pending-income');
                    if (displayPending) displayPending.innerText = this.companyState.pendingIncome.toFixed(2) + ' €';
                }

                if (elapsed > 0 && elapsed % 300 === 0) {
                    this.triggerCompanyRandomEvents();
                }

                this.updateChronoDisp(type); 
                this.renderLiveStats(type);
            }, 1000); 
            
            if(isTruck) this.truckInterval = interval; else this.carInterval = interval;
            
            if (this.predictionIntervals[type]) clearInterval(this.predictionIntervals[type]);
            this.predictionIntervals[type] = setInterval(() => {
                this.updatePrediction(type);
            }, 8000);
            
        } else { 
            btn.innerText = "▶️ Start"; btn.classList.remove('running'); 
            if(isTruck) {
                clearInterval(this.truckInterval); 
                this.truckAccumulatedTime = this.truckSeconds;
                this.storage.set('truckAccumulatedTime', this.truckAccumulatedTime);
                this.globalAnaTrucks.lastVehicles = []; 
                this.storage.set('globalAnaTrucks', this.globalAnaTrucks);
            } else {
                let sponsorDesc = document.getElementById('sponsor-desc');
                if (sponsorDesc && !this.activeSponsor && !this.pendingSponsor) {
                    sponsorDesc.innerText = "Chrono en pause ⏸️";
                }

                clearInterval(this.carInterval); 
                this.carAccumulatedTime = this.carSeconds;
                this.storage.set('carAccumulatedTime', this.carAccumulatedTime);
                this.globalAnaCars.lastVehicles = []; 
                this.storage.set('globalAnaCars', this.globalAnaCars);
            }
            
            if (this.predictionIntervals && this.predictionIntervals[type]) {
                clearInterval(this.predictionIntervals[type]);
            }
        }
    },

    updateCounter(mode, key1, key2, amount, e) {
        let isTruck = mode === 'trucks';
        if (isTruck && !this.isTruckRunning) { alert("Lance le chrono Camions d'abord ! ⏱️"); return; }
        if (!isTruck && !this.isCarRunning) { alert("Lance le chrono Véhicules d'abord ! ⏱️"); return; }

        let counters = isTruck ? this.truckCounters : this.vehicleCounters;
        let globalCounters = isTruck ? this.globalTruckCounters : this.globalCarCounters;
        let history = isTruck ? this.truckHistory : this.carHistory;
        let ana = isTruck ? this.globalAnaTrucks : this.globalAnaCars;
        let sessionPreds = isTruck ? this.sessionTruckPredictions : this.sessionCarPredictions;
        let currPred = isTruck ? this.currentPredictionTruck : this.currentPredictionCar;

        if (isTruck) {
            if (!counters[key1]) counters[key1] = { fr: 0, etr: 0 };
            if (!globalCounters[key1]) globalCounters[key1] = { fr: 0, etr: 0 };
        } else {
            if (typeof counters[key1] === 'undefined') counters[key1] = 0;
            if (typeof globalCounters[key1] === 'undefined') globalCounters[key1] = 0;
        }

        let currentCount = isTruck ? counters[key1][key2] : counters[key1];

        if (currentCount + amount >= 0) {
            if (window.ui) window.ui.playBeep(amount > 0);
            
            if (amount > 0) {
                // L'ancien notifyVehicleAdded a été retiré, on enverra tout à la fin !

                let isExact = false;
                let gegeMultiplier = 1; // 🧠 NOUVEAU : Multiplicateur IA

                if (currPred && currPred.class) {
                    ana.predictions.total++; sessionPreds.total++;
                    let actualClass = isTruck ? `${key1}_${key2}` : key1;
                    
                    if (!ana.predictionsByClass) ana.predictionsByClass = {};
                    if (!ana.predictionsByClass[currPred.class]) ana.predictionsByClass[currPred.class] = { total: 0, success: 0 };
                    
                    ana.predictionsByClass[currPred.class].total++;

                    isExact = (currPred.class === actualClass);
                    
                    // 🎯 SYSTÈME DE CONFIANCE GÉGÉ
                    let conf = currPred.confidence || 50; 

                    if (isExact) {
                        ana.predictions.success++; sessionPreds.success++;
                        ana.predictionsByClass[currPred.class].success++;
                        
                        if (conf < 40) gegeMultiplier = 5;      // Jauge Rouge
                        else if (conf <= 70) gegeMultiplier = 3; // Jauge Orange
                        else gegeMultiplier = 2;                 // Jauge Verte
                        
                        if(window.ui) window.ui.showToast(`🎯 Prédiction exacte (${conf}%) ! Gains x${gegeMultiplier} !`, 'success');
                    } else {
                        // 📉 MALUS INATTENTION (si IA était sûre > 70%)
                        if (conf > 70) {
                            this.addBankTransaction(-20, "Malus Gégé : Inattention");
                            if(window.ui) window.ui.showToast(`📉 Inattention ! Gégé était sûr (${conf}%), Amende : -20 € !`, 'anomaly');
                        }
                    }
                    
                    // Reset prédiction pour éviter la triche
                    if (isTruck) this.currentPredictionTruck = null;
                    else this.currentPredictionCar = null;
                }

                let specs = this.vehicleSpecs[key1] || { wMin: 1500, wMax: 1500, cMin: 120, cMax: 120 };
                if (isTruck) specs = this.vehicleSpecs["Camions"]; 
                
                let randWeight = Math.floor(Math.random() * (specs.wMax - specs.wMin + 1)) + specs.wMin;
                let co2Ratio = specs.wMax === specs.wMin ? 0 : (randWeight - specs.wMin) / (specs.wMax - specs.wMin);
                let randCo2 = Math.round(specs.cMin + co2Ratio * (specs.cMax - specs.cMin));
                
                let bikeBonus = 0; // 🚲 NOUVEAU

                if (!isTruck) {
                    let baseVal = this.bankValues[key1] || 1;
                    
                    // 🚲 NOUVEAU : Calcul du bonus carbone pour les Vélos
                    if (key1 === "Vélos") {
                        bikeBonus = Math.floor(Math.random() * 1751); // Entre 0 et 1750g
                        randCo2 = 0; // Force le CO2 du vélo à 0
                        if(window.ui) window.ui.showToast(`🚲 Bonus Écolo : +${bikeBonus}g au quota !`, 'success');
                    }

                    let currentHour = new Date().getHours();
                    let isNight = (currentHour >= 21 || currentHour < 6);
                    let isRushHour = (currentHour >= 7 && currentHour < 9) || (currentHour >= 17 && currentHour < 19);
            
                    if (isNight) {
                        if (key1 === "Camions" || key1 === "Utilitaires") {
                            baseVal = Math.round(baseVal * 0.5); 
                        } else {
                            baseVal = Math.round(baseVal * 5); 
                        }
                    } else if (isRushHour) {
                        if (key1 === "Voitures" || key1 === "Utilitaires") {
                            baseVal = Math.round(baseVal * 0.5); 
                        } else if (key1 === "Motos" || key1 === "Vélos") {
                            baseVal = Math.round(baseVal * 2); 
                        }
                    }

                    let nowTs = Date.now();

                    this.sessionPaveWeight = (this.sessionPaveWeight || 0) + randWeight;
                    if (this.sessionPaveWeight >= 100000) { // T.U.R. 100t : seuil relevé à 100 tonnes
                        this.addBankTransaction(-50, "Taxe d'Usure des Routes (T.U.R) 🚧");
                        if(window.ui) { window.ui.showToast("🚧 La route fissure ! Taxe d'Usure : -50 €", "anomaly"); window.ui.playGamiSound('crash'); }
                        this.sessionPaveWeight = 0; 
                    }

                    if (randWeight < 500) {
                        this.consecutiveLightVehicles = (this.consecutiveLightVehicles || 0) + 1;
                        if (this.consecutiveLightVehicles >= 4) {
                            this.addBankTransaction(30, "Prime Poids Plume 🪶");
                            if(window.ui) { window.ui.showToast("🪶 Prime Poids Plume ! Trafic ultra-léger : +30 €"); window.ui.playGamiSound('cash'); }
                            this.consecutiveLightVehicles = 0;
                        }
                    } else { this.consecutiveLightVehicles = 0; }
                    
                    if (this.lastCountTime > 0) {
                        let diffSec = (nowTs - this.lastCountTime) / 1000;
                        if (diffSec >= 5 && diffSec <= 30) {
                            this.regularityChain++;
                            if (this.regularityChain >= 10) {
                                this.addBankTransaction(100, "Prime de Régularité (Flux parfait)");
                                if(window.ui) { window.ui.showToast("🌊 Bonus de Flux ! Régularité parfaite : +100 €"); window.ui.playGamiSound('cash'); }
                                this.regularityChain = 0; 
                            }
                        } else { this.regularityChain = 0; }
                    }
                    this.lastCountTime = nowTs;

                    let consecutive = 0;
                    let justHistory = history.filter(h => !h.isEvent);
                    let lastTs = nowTs;

                    for (let i = justHistory.length - 1; i >= 0; i--) {
                        let h = justHistory[i];
                        if (lastTs - h.timestamp > 45000) break; 
                        
                        if (h.type === key1) {
                            consecutive++;
                            lastTs = h.timestamp;
                        } else { break; }
                    }

                    let speedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
                    let isHighway = speedKmh > 80;
                    let threshold = isHighway ? 10 : 4; 

                    if (isExact) {
                        // 🧠 NOUVEAU : Application du multiplicateur de Gégé (x5, x3, x2)
                        baseVal *= gegeMultiplier;
                        
                        if (window.gami && window.gami.state.unlockedTalents && window.gami.state.unlockedTalents.oeilDeLynx) {
                            baseVal = Math.round(baseVal * 1.10);
                            if(window.ui) window.ui.showToast(`👁️ Talent Œil de Lynx : Bonus de prédiction boosté !`);
                        }
                    }

                    if (consecutive >= threshold + 2) { 
                        baseVal = -Math.max(1, Math.round(Math.abs(baseVal) * 0.2)); 
                        // Notification une seule fois, puis arrière-plan silencieux
                        if (!this._congestNotified || this._congestNotified[key1] !== 'frais') {
                            if (!this._congestNotified) this._congestNotified = {};
                            this._congestNotified[key1] = 'frais';
                            if(window.ui) { window.ui.showToast(`🚧 Frais de congestion ! Trop de ${key1} !`, "anomaly"); window.ui.playGamiSound('crash'); }
                        }
                    } else if (consecutive === threshold + 1) { 
                        baseVal = 0;
                        if (!this._congestNotified || this._congestNotified[key1] !== 'sature') {
                            if (!this._congestNotified) this._congestNotified = {};
                            this._congestNotified[key1] = 'sature';
                            if(window.ui) { window.ui.showToast(`⚠️ Marché saturé pour ${key1} (Gain 0€)`, "anomaly"); window.ui.playGamiSound('crash'); }
                        }
                    } else if (consecutive === threshold) { 
                        baseVal = Math.round(baseVal * 0.5);
                        if (!this._congestNotified || this._congestNotified[key1] !== 'baisse') {
                            if (!this._congestNotified) this._congestNotified = {};
                            this._congestNotified[key1] = 'baisse';
                            if(window.ui) { window.ui.showToast(`📉 Alerte : Le marché baisse pour ${key1} !`); }
                        }
                    } else {
                        // La série est brisée : on réinitialise la notification pour ce type
                        if (this._congestNotified) this._congestNotified[key1] = null;
                    }

                    if (this.bankBalance < 0 && baseVal > 0) {
                        baseVal = Math.round(baseVal * 0.2); 
                    }

                    // 🌅 PRIME DE L'AUBE : Gains x2 entre 5h et 7h du matin
                    let currentHourForDawn = new Date().getHours();
                    if (baseVal > 0 && currentHourForDawn >= 5 && currentHourForDawn < 7) {
                        baseVal = baseVal * 2;
                        if(window.ui) window.ui.showToast(`🌅 Prime de l'Aube ! Gains doublés !`, 'success');
                    }

                    // ⛰️ BONUS D'ALTITUDE : +10% au-dessus de 800m
                    let altForBonus = window.gps && window.gps.currentPos ? (window.gps.currentPos.alt || 0) : 0;
                    if (baseVal > 0 && altForBonus > 800) {
                        let altBonus = Math.round(baseVal * 0.10);
                        baseVal += altBonus;
                        if(window.ui) window.ui.showToast(`⛰️ Bonus d'Altitude (+10%) : +${altBonus} €`);
                    }

                    this.addBankTransaction(baseVal, `Comptage ${key1}${isExact ? ' (x' + gegeMultiplier + ' IA)' : ''}`);

                    // 🌈 COMBO ARC-EN-CIEL : +200€ si 5 catégories différentes enchaînées
                    if (!isTruck) {
                        let recentCats = history.filter(h => !h.isEvent).slice(-5).map(h => h.type);
                        if (recentCats.length === 5 && new Set(recentCats).size === 5) {
                            this.addBankTransaction(200, "🌈 Combo Arc-en-ciel (5 catégories !)");
                            if(window.ui) { window.ui.showToast("🌈 COMBO ARC-EN-CIEL ! 5 catégories d'affilée : +200 € !", 'rare-combo'); window.ui.playGamiSound('cash'); }
                        }
                    }

                    // 🚛 CONVOI EXCEPTIONNEL : +50€ si 3 camions en moins de 15 secondes
                    if (!isTruck && key1 === "Camions") {
                        if (!this._convoiTimes) this._convoiTimes = [];
                        this._convoiTimes.push(Date.now());
                        this._convoiTimes = this._convoiTimes.filter(t => Date.now() - t <= 15000);
                        if (this._convoiTimes.length >= 3) {
                            this.addBankTransaction(50, "🚛 Convoi Exceptionnel (3 camions en 15s)");
                            if(window.ui) { window.ui.showToast("🚛 CONVOI EXCEPTIONNEL ! 3 camions en 15s : +50 € !", 'success'); window.ui.playGamiSound('cash'); }
                            this._convoiTimes = []; // reset pour éviter cumul
                        }
                    }
                    this.showMoneyParticle(e, baseVal);
                    if (baseVal > 0 && window.ui && consecutive < threshold) window.ui.playGamiSound('cash');

                    // 🎯 NOUVEAU : Envoi massif d'informations à Gégé pour les Quêtes du Passe Routier
                    if (window.gami) {
                        let isNight = (new Date().getHours() >= 21 || new Date().getHours() < 6);
                        let alt = window.gps && window.gps.currentPos ? window.gps.currentPos.alt : 0;
                        
                        let extraData = { 
                            weight: randWeight, 
                            isNight: isNight, 
                            alt: alt, 
                            regularity: this.regularityChain,
                            isExact: isExact,
                            iaCash: isExact ? baseVal : 0
                        };
                        window.gami.notifyVehicleAdded(key1, key2, extraData);
                    }

                    if (this.activeSponsor && key1 === this.activeSponsor.type) {
                        this.activeSponsor.current += 1;
                        this.updateSponsorUI();
                        if (this.activeSponsor.current === this.activeSponsor.target) {
                            if (window.ui) { window.ui.showToast(`🎯 Contrat Rempli ! Encaisser tes gains !`, "rare-combo"); window.ui.playGamiSound('siren'); }
                        }
                    }
                }

                if (isTruck) { counters[key1][key2] += amount; globalCounters[key1][key2] += amount; }
                else { counters[key1] += amount; globalCounters[key1] += amount; }

                let nowTs = Date.now();
                let speedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
                let roadType = this.getRoadType(speedKmh, this.currentMode);
                
                let histItem = { 
                    lat: window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null, 
                    lon: window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null, 
                    alt: window.gps && window.gps.currentPos ? window.gps.currentPos.alt : null, 
                    speed: speedKmh, road: roadType, 
                    chronoTime: this.formatTime(isTruck ? this.truckSeconds : this.carSeconds), 
                    timestamp: nowTs,
                    distAtSighting: isTruck ? this.liveTruckDistance : this.liveCarDistance,
                    weight: randWeight, 
                    co2: randCo2,
                    bikeBonus: bikeBonus // 🚲 NOUVEAU : Sauvegarde du bonus vélo
                };
                
                if (isTruck) { histItem.brand = key1; histItem.type = key2; }
                else { histItem.type = key1; }
                history.push(histItem);

                let justVehiclesCount = history.filter(h => !h.isEvent).length;
                if (justVehiclesCount > 0 && justVehiclesCount % 50 === 0) {
                    if(window.ui) window.ui.showToast(`🧠 Palier de ${justVehiclesCount} ! Gégé apprend en direct...`);
                    if(window.ml) window.ml.trainModel(mode);
                }

                if (window.ml) {
                    let recentHist = history.filter(h => !h.isEvent);
                    let anomaly = window.ml.checkAnomaly(mode, key1, speedKmh, recentHist);
                    if (anomaly && window.ui) {
                        window.ui.showToast(anomaly.msg, anomaly.type);
                        if (anomaly.type === 'anomaly') {
                            window.ui.triggerHapticFeedback('error');
                            // 🛑 SUPPRESSION AMENDE IA 100€ : on ne garde que l'alarme visuelle et sonore
                            if (!isTruck) {
                                window.ui.playGamiSound('siren');
                            }
                        }
                        else window.ui.triggerHapticFeedback('success');
                    }
                }

                let d = new Date(nowTs);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(ana.days)[d.getDay()];
                let monthKey = Object.keys(ana.months)[d.getMonth()];
                let altVal = histItem.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";

                ana.hours[hourKey]++; ana.days[dayKey]++; ana.months[monthKey]++; ana.alts[altKey]++; 
                ana.roads[roadType] = (ana.roads[roadType] || 0) + 1;

                if (!ana.byVeh[key1]) ana.byVeh[key1] = { hours: {}, days: {}, alts: {}, months: {}, roads: {} };
                if (!ana.byVeh[key1].months) ana.byVeh[key1].months = {};
                if (!ana.byVeh[key1].roads) ana.byVeh[key1].roads = {};

                ana.byVeh[key1].hours[hourKey] = (ana.byVeh[key1].hours[hourKey] || 0) + 1;
                ana.byVeh[key1].days[dayKey] = (ana.byVeh[key1].days[dayKey] || 0) + 1;
                ana.byVeh[key1].months[monthKey] = (ana.byVeh[key1].months[monthKey] || 0) + 1;
                ana.byVeh[key1].alts[altKey] = (ana.byVeh[key1].alts[altKey] || 0) + 1;
                ana.byVeh[key1].roads[roadType] = (ana.byVeh[key1].roads[roadType] || 0) + 1;

                if (!ana.lastVehicles) ana.lastVehicles = [];
                if (!ana.seqs3) ana.seqs3 = {};

                if (ana.lastVehicles.length >= 1) {
                    let vDernier = ana.lastVehicles[ana.lastVehicles.length - 1];
                    let pair = `${vDernier} ➡️ ${key1}`;
                    ana.seqs[pair] = (ana.seqs[pair] || 0) + 1;
                }
                if (ana.lastVehicles.length >= 2) {
                    let vAvantDernier = ana.lastVehicles[0];
                    let vDernier = ana.lastVehicles[1];
                    let triplet = `${vAvantDernier} ➡️ ${vDernier} ➡️ ${key1}`;
                    ana.seqs3[triplet] = (ana.seqs3[triplet] || 0) + 1;
                }

                ana.lastVehicles.push(key1);
                if (ana.lastVehicles.length > 2) ana.lastVehicles.shift();

                this.storage.set(isTruck ? 'globalAnaTrucks' : 'globalAnaCars', ana);
                this.storage.set(isTruck ? 'truckCounters' : 'vehicleCounters', counters);
                this.storage.set(isTruck ? 'globalTruckCounters' : 'globalCarCounters', globalCounters);
                this.storage.set(isTruck ? 'truckHistory' : 'carHistory', history);

                if(window.ui && e) { 
                    let hapticType = isTruck ? 'truck' : 'car';
                    if (!isTruck) {
                        if(key1 === 'Motos' || key1 === 'Vélos') hapticType = 'moto';
                        if(key1 === 'Engins agricoles' || key1 === 'Camions' || key1 === 'Bus/Car') hapticType = 'tractor';
                    }
                    window.ui.triggerHapticFeedback(hapticType); 
                    window.ui.showClickParticle(e, `+1`, isTruck ? '#27ae60' : '#e74c3c'); 
                }

                if (isTruck) {
                    this.truckTotal += amount;
                    this.globalTruckTotal += amount;
                    this.renderTrucks();
                } else {
                    this.carTotal += amount;
                    this.globalCarTotal += amount;
                    this.renderCars();
                }
                
                this.renderKmStats(); 
                this.renderLiveStats(mode);
                this.updatePrediction(mode);
                if (!isTruck) this.updateCarbonGauge();

            } else if (amount < 0) {
                let lastIndex = history.map(h => !h.isEvent && (isTruck ? (h.brand === key1 && h.type === key2) : (h.type === key1))).lastIndexOf(true);
                
                if (lastIndex !== -1) {
                    if (!isTruck) {
                        let penalty = Math.max(5, Math.abs(this.bankBalance * 0.1)); 
                        this.addBankTransaction(-penalty, "Frais d'annulation");
                        if(window.ui) {
                            window.ui.showToast("📉 Frais d'annulation appliqués !", "anomaly");
                            window.ui.playGamiSound('crash');
                        }
                    }
                    this.deleteHistoryItem(mode, lastIndex); 
                    return;
                }
            }
        }
    },

    deleteHistoryItem(mode, index) {
        let isTruck = mode === 'trucks';
        let history = isTruck ? this.truckHistory : this.carHistory;
        let counters = isTruck ? this.truckCounters : this.vehicleCounters;
        let globalCounters = isTruck ? this.globalTruckCounters : this.globalCarCounters;
        let ana = isTruck ? this.globalAnaTrucks : this.globalAnaCars;

        let item = history[index];
        if (!item) return;

        let vehKey = isTruck ? item.brand : item.type;
        let subKey = isTruck ? item.type : null;

        if (!item.isEvent) {
            if (isTruck) {
                if (counters[vehKey] && counters[vehKey][subKey] > 0) counters[vehKey][subKey]--;
                if (globalCounters[vehKey] && globalCounters[vehKey][subKey] > 0) globalCounters[vehKey][subKey]--;
            } else {
                if (counters[vehKey] > 0) counters[vehKey]--;
                if (globalCounters[vehKey] > 0) globalCounters[vehKey]--;
                
                if (this.activeSponsor && vehKey === this.activeSponsor.type && this.activeSponsor.current > 0) {
                    this.activeSponsor.current--;
                    this.updateSponsorUI();
                }
            }

            if (item.timestamp) {
                let d = new Date(item.timestamp);
                let hourKey = `${d.getHours()}h`;
                let dayKey = Object.keys(ana.days)[d.getDay()];
                let monthKey = Object.keys(ana.months)[d.getMonth()];
                let altVal = item.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                let roadType = item.road || "Inconnu";

                if(ana.hours[hourKey] > 0) ana.hours[hourKey]--;
                if(ana.days[dayKey] > 0) ana.days[dayKey]--;
                if(ana.months[monthKey] > 0) ana.months[monthKey]--;
                if(ana.alts[altKey] > 0) ana.alts[altKey]--;
                if(ana.roads[roadType] > 0) ana.roads[roadType]--;

                if(ana.byVeh && ana.byVeh[vehKey]) {
                    if(ana.byVeh[vehKey].hours[hourKey] > 0) ana.byVeh[vehKey].hours[hourKey]--;
                    if(ana.byVeh[vehKey].days[dayKey] > 0) ana.byVeh[vehKey].days[dayKey]--;
                    if(ana.byVeh[vehKey].months && ana.byVeh[vehKey].months[monthKey] > 0) ana.byVeh[vehKey].months[monthKey]--;
                    if(ana.byVeh[vehKey].alts[altKey] > 0) ana.byVeh[vehKey].alts[altKey]--;
                    if(ana.byVeh[vehKey].roads && ana.byVeh[vehKey].roads[roadType] > 0) ana.byVeh[vehKey].roads[roadType]--;
                }

                if(index === history.length - 1 && ana.lastVehicles && ana.lastVehicles.length > 0) {
                    ana.lastVehicles.pop();
                }
                this.storage.set(isTruck ? 'globalAnaTrucks' : 'globalAnaCars', ana);
            }
        }

        history.splice(index, 1);

        this.storage.set(isTruck ? 'truckCounters' : 'vehicleCounters', counters);
        this.storage.set(isTruck ? 'globalTruckCounters' : 'globalCarCounters', globalCounters);
        this.storage.set(isTruck ? 'truckHistory' : 'carHistory', history);

        if(window.ui) { 
            window.ui.triggerHapticFeedback('error'); 
            window.ui.showToast(item.isEvent ? "🗑️ Événement supprimé" : "❌ Véhicule supprimé"); 
        }

        if (isTruck) this.renderTrucks(); else this.renderCars();
        this.renderKmStats(); 
        this.renderLiveStats(mode);
        this.updatePrediction(mode);
        if (!isTruck) this.updateCarbonGauge();
        
        let statsView = document.getElementById(isTruck ? 'truck-stats-view' : 'car-stats-view');
        if (statsView && statsView.style.display !== 'none') this.renderAdvancedStats(mode);
    },

    undoLast() {
        let activeTab = window.ui ? window.ui.activeTab : 'trucks';
        let history = activeTab === 'trucks' ? this.truckHistory : this.carHistory;
        
        if(history.length > 0) { 
            this.deleteHistoryItem(activeTab, history.length - 1);
        } else if(window.ui) { 
            window.ui.showToast("Rien à annuler ! 🤷‍♂️"); 
        }
    },

    resetSessionData(type) {
        let isTruck = type === 'trucks';
        if (isTruck) {
            this.brands.forEach(b => { this.truckCounters[b] = { fr: 0, etr: 0 }; }); 
            this.truckHistory = []; this.truckSeconds = 0; this.truckAccumulatedTime = 0; this.liveTruckDistance = 0;
            this.sessionTruckPredictions = { total: 0, success: 0 };
        } else {
            this.vehicleTypes.forEach(v => this.vehicleCounters[v] = 0); 
            this.carHistory = []; this.carSeconds = 0; this.carAccumulatedTime = 0; this.liveCarDistance = 0;
            this.sessionCarPredictions = { total: 0, success: 0 };
            
            this.regularityChain = 0;
            this.lastCountTime = 0;
            this.activeSponsor = null;
            this.pendingSponsor = null;
            this.sponsorCooldownUntil = 0; 
            this.sessionFinance = { gains: 0, losses: 0, carbon: 0, details: {} }; 
            
            this.sessionPaveWeight = 0;
            this.consecutiveLightVehicles = 0;
            
            this.resetSponsorUI();
        }
        
        this.storage.set(isTruck ? 'truckCounters' : 'vehicleCounters', isTruck ? this.truckCounters : this.vehicleCounters); 
        this.storage.set(isTruck ? 'truckHistory' : 'carHistory', []); 
        this.storage.set(isTruck ? 'truckChronoSec' : 'carChronoSec', 0); 
        this.storage.set(isTruck ? 'truckAccumulatedTime' : 'carAccumulatedTime', 0); 
        this.storage.set(isTruck ? 'liveTruckDist' : 'liveCarDist', 0);
        
        this.updateChronoDisp(type); 
        if (isTruck) this.renderTrucks(); else this.renderCars();
        this.renderKmStats(); 
        this.renderLiveStats(type);

        if (!isTruck) {
            let container = document.getElementById('carbon-gauge-container');
            if (container) container.style.display = 'none';
        }
    },

    async stopSession(type) {
        let isTruck = type === 'trucks';
        let isRunning = isTruck ? this.isTruckRunning : this.isCarRunning;
        let seconds = isTruck ? this.truckSeconds : this.carSeconds;
        let history = isTruck ? this.truckHistory : this.carHistory;

        if (isRunning) this.toggleChrono(type); 
        
        // 🏢 ENCAISSEMENT DES REVENUS DE L'ENTREPRISE A L'ARRET
        if (this.companyState.pendingIncome > 0) {
            let earned = Math.round(this.companyState.pendingIncome);
            if (earned > 0) {
                this.addBankTransaction(earned, "🏢 Bénéfices de l'Entreprise (Session)");
                if (window.ui) {
                    window.ui.playGamiSound('cash');
                    window.ui.showToast(`🏢 L'entreprise a généré +${earned} € pendant la session !`);
                }
            }
            this.companyState.pendingIncome = 0;
            await this.saveUserData();
        }

        if (seconds === 0 && history.length === 0) { 
            this.resetSessionData(type); 
            return; 
        }
        
        if (confirm("⏹️ Trajet terminé ! Veux-tu enregistrer cette session ?")) { 
            if (!isTruck) {
                this.checkSponsorOnStop(); 
                this.sessionFinance.carbon = this.checkCarbonFootprint(); 
            }
            
            if(window.ui) window.ui.showToast("⏳ Géocodage des adresses en cours...");
            await this.saveSession(type); 
        } 
        else if (confirm("⚠️ La session sera effacée. Confirmer ?")) {
            this.resetSessionData(type);
        }
    },

    async saveSession(type) {
        let isTruck = type === 'trucks';
        let dateStr = new Date().toLocaleString('fr-FR');
        let history = isTruck ? this.truckHistory : this.carHistory;
        
        let startDateStr = dateStr;
        if (history.length > 0 && history[0].timestamp) {
            startDateStr = new Date(history[0].timestamp).toLocaleString('fr-FR');
        }

        let startLat = history.length > 0 ? history[0].lat : (window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null);
        let startLon = history.length > 0 ? history[0].lon : (window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null);
        let endLat = window.gps && window.gps.currentPos ? window.gps.currentPos.lat : null;
        let endLon = window.gps && window.gps.currentPos ? window.gps.currentPos.lon : null;

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
            durationSec: isTruck ? this.truckSeconds : this.carSeconds, 
            distanceKm: parseFloat((isTruck ? this.liveTruckDistance : this.liveCarDistance).toFixed(2)), 
            history: history, 
            summary: JSON.parse(JSON.stringify(isTruck ? this.truckCounters : this.vehicleCounters)),
            predictions: isTruck ? { ...this.sessionTruckPredictions } : { ...this.sessionCarPredictions },
            sessionFinance: isTruck ? null : { ...this.sessionFinance } 
        };

        await this.idb.add(newSession);

        if (window.ml) {
            window.ml.trainModel(type).then(success => {
                if (success) window.ml.updateUIStatus();
            });
        }

        this.resetSessionData(type);
        if(window.ui) window.ui.showToast("💾 Session sauvegardée !");

        setTimeout(() => {
            this.showSessionDetails(type, newSession.id);
        }, 500);
    },

    async resetProfileData() {
        if (confirm(`🚨 ATTENTION SYLVAIN ! Tu es sur le point d'effacer TOUT ton historique, tes sessions, tes stats globales et l'IA pour ton profil actuel (${this.currentUser} - ${this.currentMode}). C'est totalement irréversible. Es-tu VRAIMENT sûr ?`)) {
            
            await this.idb.clear('trucks');
            await this.idb.clear('cars');

            this.storage.clearAll();
            localStorage.removeItem(`gami_state_${this.currentUser}`);
            localStorage.removeItem(`bankState_${this.currentUser}`);
            localStorage.removeItem(`bankHistory_${this.currentUser}`);
            localStorage.removeItem(`bankStats_${this.currentUser}`);
            localStorage.removeItem(`companyState_${this.currentUser}`); 

            try {
                if (typeof tf !== 'undefined') {
                    tf.io.removeModel('indexeddb://model-trucks').catch(e => {});
                    tf.io.removeModel('indexeddb://model-cars').catch(e => {});
                }
            } catch(e) {}

            if(window.ui) window.ui.showToast("💥 KABOOM ! Profil entièrement réinitialisé ! Redémarrage...");
            
            setTimeout(() => { location.reload(); }, 1500);
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
            
            container.innerHTML += `
                <div class="brand-card">
                    <div class="brand-name">${brand}</div>
                    <div class="counter-section">
                        <span class="flag">🇫🇷</span>
                        <button class="btn-corr" onclick="window.app.updateCounter('trucks', '${brand}', 'fr', -1, event)">-</button>
                        <span class="score">${fr}</span>
                        <button class="btn-add btn-add-fr" onclick="window.app.updateCounter('trucks', '${brand}', 'fr', 1, event)">+</button>
                    </div>
                    <div class="counter-section">
                        <span class="flag">🌍</span>
                        <button class="btn-corr" onclick="window.app.updateCounter('trucks', '${brand}', 'etr', -1, event)">-</button>
                        <span class="score">${etr}</span>
                        <button class="btn-add btn-add-etr" onclick="window.app.updateCounter('trucks', '${brand}', 'etr', 1, event)">+</button>
                    </div>
                </div>`;
        });

        let gtEl = document.getElementById('grand-total'); if(gtEl) gtEl.innerText = grandTotal; 
        let lnEl = document.getElementById('leader-name'); if(lnEl) lnEl.innerText = maxScore > 0 ? `${leader} (${maxScore})` : "Aucune";
        
        let truckWeightEl = document.getElementById('truck-weight');
        if(truckWeightEl) {
            let totalW = this.truckHistory.filter(h => !h.isEvent).reduce((sum, item) => sum + (item.weight || 18000), 0);
            truckWeightEl.innerText = this.formatWeight(totalW);
        }
        
        let pctFr = grandTotal === 0 ? 50 : Math.round((totalFr / grandTotal) * 100);
        let barFr = document.getElementById('bar-fr'); if(barFr) { barFr.style.width = pctFr + '%'; barFr.innerText = grandTotal > 0 ? `🇫🇷 ${pctFr}%` : ''; }
        let barEtr = document.getElementById('bar-etr'); if(barEtr) { barEtr.style.width = (100 - pctFr) + '%'; barEtr.innerText = grandTotal > 0 ? `🌍 ${100 - pctFr}%` : ''; }
    },

    renderCars() {
        const container = document.getElementById('car-container'); if(!container) return;
        container.innerHTML = ''; 
        let grandTotal = 0; 
        
        this.vehicleTypes.forEach(v => {
            let count = (this.vehicleCounters[v] || 0);
            grandTotal += count;
        }); 

        let cgt = document.getElementById('car-grand-total'); if(cgt) cgt.innerText = grandTotal;
        let cwEl = document.getElementById('car-weight'); 
        if(cwEl) {
            let totalW = this.carHistory.filter(h => !h.isEvent).reduce((sum, item) => {
                let fallback = this.vehicleSpecs[item.type] ? ((this.vehicleSpecs[item.type].wMin + this.vehicleSpecs[item.type].wMax) / 2) : 1350;
                return sum + (item.weight || fallback);
            }, 0);
            cwEl.innerText = this.formatWeight(totalW); 
        }

        const slugMap = { "Voitures": "voitures", "Utilitaires": "utilitaires", "Camions": "camions", "Engins agricoles": "engins", "Bus/Car": "bus", "Camping-cars": "camping", "Motos": "motos", "Vélos": "velos" };
        const nameMap = { "Camions": "Poids Lourds" }; 
        const icons = { Voitures: "🚗", Utilitaires: "🚐", Camions: "🚛", "Engins agricoles": "🚜", "Bus/Car": "🚌", "Camping-cars": "🏕️", Motos: "🏍️", Vélos: "🚲" };

        this.vehicleTypes.forEach(v => {
            let pct = grandTotal === 0 ? (100 / this.vehicleTypes.length) : Math.round(((this.vehicleCounters[v]||0) / grandTotal) * 100); 
            let slug = slugMap[v];
            let bar = document.getElementById(`bar-${slug}`);
            if (bar) { 
                bar.style.width = pct + '%'; 
                bar.innerText = (grandTotal > 0 && this.vehicleCounters[v] > 0) ? `${icons[v]} ${pct}%` : ''; 
            }
        });

        this.vehicleTypes.forEach(v => {
            let score = this.vehicleCounters[v] || 0;
            let displayName = nameMap[v] || v;
            container.innerHTML += `
                <div class="vehicle-card">
                    <div class="vehicle-name">${icons[v] || "🚘"} ${displayName}</div>
                    <div class="vehicle-controls">
                        <button class="btn-corr" onclick="window.app.updateCounter('cars', '${v}', null, -1, event)">-</button>
                        <span class="vehicle-score">${score}</span>
                        <button class="btn-add btn-add-fr" onclick="window.app.updateCounter('cars', '${v}', null, 1, event)">+</button>
                    </div>
                </div>`;
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
                statsArr.forEach(st => { html += `<div class="km-stat-card"><span class="km-stat-title">${st.name}</span><span class="km-stat-value">${st.ratioStr} /km</span><span class="km-stat-extra">⏱️ ${st.freq}</span></div>`; });
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
                statsArr.forEach(st => { html += `<div class="km-stat-card"><span class="km-stat-title">${st.name}</span><span class="km-stat-value">${st.ratioStr} /km</span><span class="km-stat-extra">⏱️ ${st.freq}</span></div>`; });
                cContainer.innerHTML = html;
            } else { cContainer.innerHTML = '<span style="color:#7f8c8d; font-size: 0.9em; grid-column: 1 / -1;">Roule un peu pour voir les stats... 🚗💨</span>'; }
        }
    },

    async showGlobalDetails(type, key) {
        let count = 0, time = 0, dist = 0, title = "", weight = 0;

        if (type === 'trucks') {
            time = this.globalTruckTime; dist = this.globalTruckDistance;
            if (key === 'Total') {
                title = "🚛 Total toutes Marques";
                this.brands.forEach(b => {
                    let c = (this.globalTruckCounters[b]?.fr || 0) + (this.globalTruckCounters[b]?.etr || 0);
                    count += c;
                });
                weight = count * 18000;
            } else {
                title = `🚛 ${key}`; count = (this.globalTruckCounters[key]?.fr || 0) + (this.globalTruckCounters[key]?.etr || 0);
                weight = count * 18000;
            }
        } else {
            time = this.globalCarTime; dist = this.globalCarDistance;
            if (key === 'Total') {
                title = "🚗 Total tous Véhicules";
                this.vehicleTypes.forEach(v => {
                    let c = (this.globalCarCounters[v] || 0);
                    count += c;
                    let fallback = this.vehicleSpecs[v] ? ((this.vehicleSpecs[v].wMin + this.vehicleSpecs[v].wMax) / 2) : 1350;
                    weight += c * fallback;
                });
            } else {
                title = `🚘 ${key === 'Camions' ? 'Poids Lourds' : key}`; count = this.globalCarCounters[key] || 0;
                let fallback = this.vehicleSpecs[key === 'Poids Lourds' ? 'Camions' : key] ? ((this.vehicleSpecs[key === 'Poids Lourds' ? 'Camions' : key].wMin + this.vehicleSpecs[key === 'Poids Lourds' ? 'Camions' : key].wMax) / 2) : 1350;
                weight = count * fallback;
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
            <div style="border-top: 2px dashed var(--border-color); margin: 15px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">Quantité globale comptée</span><span class="session-detail-value" style="color:#27ae60; font-size:1.1em;">${count}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Masse Totale Estimée</span><span class="session-detail-value" style="color:#e67e22; font-weight:bold;">⚖️ ${this.formatWeight(weight)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne par km</span><span class="session-detail-value" style="color:#8e44ad;">${avgKm}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Apparitions par minute</span><span class="session-detail-value">${freq}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme par heure</span><span class="session-detail-value">${speed}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Espacement Moyen</span><span class="session-detail-value">${espTemps} / ${espDist}</span></div>
        `;

        if (key === 'Total') {
             let preds = type === 'trucks' ? this.globalAnaTrucks.predictions : this.globalAnaCars.predictions;
             let predScore = "-";
             if (preds && preds.total > 0) predScore = Math.round((preds.success / preds.total) * 100) + "% (" + preds.success + "/" + preds.total + ")";
             html += `<div style="border-top: 2px dashed var(--border-color); margin: 15px 0;"></div><div class="session-detail-row"><span class="session-detail-label">🔮 Taux de réussite prédictions</span><span class="session-detail-value" style="color:#8e44ad; font-weight:bold;">${predScore}</span></div>`;
        }

        document.getElementById('modal-session-title').innerText = `🌍 Stats Globales : ${title}`;
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Répartition par heure (Tous confondus)";
        document.getElementById('modal-weekly-section').style.display = 'block';

        document.getElementById('session-detail-modal').style.display = 'flex';
        let btnPdf = document.getElementById('btn-export-pdf');
        if(btnPdf) btnPdf.onclick = () => window.app.exportSessionPDF();

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

    async renderEnvDashboard() {
        let filter = this.currentDashboardFilter || 'all';
        let sessions = await this.idb.getAll('cars'); 
        let liveHistory = this.carHistory;
        
        let allHistories = [];
        let now = new Date();
        
        if (liveHistory && liveHistory.length > 0) allHistories.push({ history: liveHistory });
        sessions.forEach(s => allHistories.push(s)); 

        let totalCo2 = 0;
        let totalQuota = 0;
        let co2ByType = {};
        let evolutionData = [];
        let evolutionLabels = [];

        let sortedSessions = [...sessions].sort((a,b) => parseInt(a.id) - parseInt(b.id));

        allHistories.forEach(s => {
            if (!s.history || s.history.length === 0) return;
            let firstItem = s.history.find(h => h.timestamp);
            if (!firstItem) return;
            let sDate = new Date(firstItem.timestamp);
            
            if (filter === 'month' && (sDate.getMonth() !== now.getMonth() || sDate.getFullYear() !== now.getFullYear())) return;
            if (filter === 'week' && (now.getTime() - sDate.getTime() > 7 * 24 * 60 * 60 * 1000)) return;

            let sHist = s.history.filter(h => !h.isEvent);

            sHist.forEach((h, i) => {
                let distVehicule = 0;
                if (s.distanceKm > 0) {
                    distVehicule = s.distanceKm / sHist.length;
                } else if (this.liveCarDistance > 0 && !s.id) {
                    distVehicule = this.liveCarDistance / sHist.length;
                } else {
                    distVehicule = 0.5;
                }

                let categoryAverage = this.vehicleSpecs[h.type] ? (this.vehicleSpecs[h.type].cMin + this.vehicleSpecs[h.type].cMax) / 2 : 120;
                let co2 = h.co2 !== undefined ? h.co2 : categoryAverage;
                
                let emitted = co2 * distVehicule;
                let allowed = categoryAverage * distVehicule;

                totalCo2 += emitted;
                totalQuota += allowed;
                co2ByType[h.type] = (co2ByType[h.type] || 0) + emitted;
            });
        });

        let last10Sessions = sortedSessions.slice(-10);
        last10Sessions.forEach((s, idx) => {
            let sHist = s.history ? s.history.filter(h => !h.isEvent) : [];
            let sCo2 = 0;
            let sQuota = 0;
            sHist.forEach(h => {
                let distVehicule = (s.distanceKm || 0) / (sHist.length || 1);
                let categoryAverage = this.vehicleSpecs[h.type] ? (this.vehicleSpecs[h.type].cMin + this.vehicleSpecs[h.type].cMax) / 2 : 120;
                let co2 = h.co2 !== undefined ? h.co2 : categoryAverage;
                sCo2 += co2 * distVehicule;
                sQuota += categoryAverage * distVehicule;
            });
            let ratio = sQuota > 0 ? (sCo2 / sQuota) * 100 : 0;
            evolutionLabels.push(`Sess. ${idx + 1}`);
            evolutionData.push(Math.round(ratio));
        });

        let elCo2 = document.getElementById('dash-env-co2');
        let elQuota = document.getElementById('dash-env-quota');
        let elDiff = document.getElementById('dash-env-diff');

        if (elCo2) elCo2.innerText = this.formatCarbon(totalCo2);
        if (elQuota) elQuota.innerText = this.formatCarbon(totalQuota);

        if (elDiff) {
            if (totalCo2 > totalQuota) {
                elDiff.innerHTML = `⚠️ Dépassement de <span style="color:#e74c3c">${this.formatCarbon(totalCo2 - totalQuota)}</span>`;
                if(elCo2) elCo2.style.color = '#e74c3c';
            } else {
                elDiff.innerHTML = `✅ Économie de <span style="color:#27ae60">${this.formatCarbon(totalQuota - totalCo2)}</span>`;
                if(elCo2) elCo2.style.color = '#27ae60';
            }
        }

        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#d2dae2' : '#2c3e50';

        let ctxPie = document.getElementById('envCo2PieChart');
        if (ctxPie) {
            if (this.envCo2PieChart) this.envCo2PieChart.destroy();
            let labels = Object.keys(co2ByType);
            let data = Object.values(co2ByType).map(v => Math.round(v/1000));
            
            this.envCo2PieChart = new Chart(ctxPie, {
                type: 'doughnut',
                data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#3498db', '#e67e22', '#2ecc71', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
            });
        }

        let ctxEvo = document.getElementById('envCo2EvolutionChart');
        if (ctxEvo) {
            if (this.envCo2EvolutionChart) this.envCo2EvolutionChart.destroy();
            
            this.envCo2EvolutionChart = new Chart(ctxEvo, {
                type: 'line',
                data: { 
                    labels: evolutionLabels, 
                    datasets: [
                        { label: '% du Quota (100% = Limite)', data: evolutionData, borderColor: '#27ae60', backgroundColor: 'rgba(39, 174, 96, 0.2)', fill: true, tension: 0.4, pointBackgroundColor: '#27ae60' }
                    ] 
                },
                options: { 
                    maintainAspectRatio: false, 
                    plugins: { 
                        legend: { display: false }
                    }, 
                    scales: { y: { beginAtZero: true, suggestedMax: 150, ticks: { color: textColor, callback: function(val) { return val + '%'; } } }, x: { ticks: { color: textColor } } } 
                }
            });
        }
    },

    async renderDashboard(type) {
        this.activeDashboardType = type;
        
        let btn1 = document.getElementById('btn-ana-trucks');
        let btn2 = document.getElementById('btn-ana-cars');
        let btnEnv = document.getElementById('btn-ana-env');
        
        if(btn1 && btn2 && btnEnv) {
            btn1.className = type === 'trucks' ? 'active btn-ana-trucks' : 'btn-ana-trucks';
            btn2.className = type === 'cars' ? 'active btn-ana-cars' : 'btn-ana-cars';
            btnEnv.className = type === 'env' ? 'active btn-ana-env' : 'btn-ana-env';
            
            btn1.style.backgroundColor = type === 'trucks' ? '#e67e22' : 'var(--btn-bg)';
            btn1.style.color = type === 'trucks' ? 'white' : 'var(--btn-text)';
            btn2.style.backgroundColor = type === 'cars' ? '#e67e22' : 'var(--btn-bg)';
            btn2.style.color = type === 'cars' ? 'white' : 'var(--btn-text)';
            btnEnv.style.backgroundColor = type === 'env' ? '#27ae60' : 'var(--btn-bg)';
            btnEnv.style.color = type === 'env' ? 'white' : 'var(--btn-text)';
        }

        let stdContainer = document.getElementById('dash-standard-container');
        let envContainer = document.getElementById('dash-env-container');

        if (type === 'env') {
            if (stdContainer) stdContainer.style.display = 'none';
            if (envContainer) envContainer.style.display = 'block';
            await this.renderEnvDashboard();
            return;
        } else {
            if (stdContainer) stdContainer.style.display = 'block';
            if (envContainer) envContainer.style.display = 'none';
        }

        let filter = this.currentDashboardFilter || 'all';
        let sessions = await this.idb.getAll(type);
        let liveHistory = type === 'trucks' ? this.truckHistory : this.carHistory;
        
        let allHistories = [];
        let now = new Date();
        
        if (liveHistory && liveHistory.length > 0) allHistories.push({ history: liveHistory });
        sessions.forEach(s => allHistories.push(s)); 

        let counters = {};
        let alts = { "< 200m": 0, "200-500m": 0, "500-1000m": 0, "> 1000m": 0 };
        let days = { "Dim":0, "Lun":0, "Mar":0, "Mer":0, "Jeu":0, "Ven":0, "Sam":0 };
        let months = { "Jan":0, "Fév":0, "Mar":0, "Avr":0, "Mai":0, "Juin":0, "Juil":0, "Aoû":0, "Sep":0, "Oct":0, "Nov":0, "Déc":0 }; 
        
        let roads = { "Inconnu": 0, "Ville (0-50 km/h)": 0, "Route (50-100 km/h)": 0, "Autoroute (>100 km/h)": 0, "Ville (0-40 km/h)": 0, "Route (40-80 km/h)": 0, "Autoroute (>80 km/h)": 0 }; 

        let seqs = {}; 
        let dayKeys = Object.keys(days);
        let monthKeys = Object.keys(months);
        let gTotal = 0, gTotalDist = 0, frTotal = 0, etrTotal = 0;
        let dashTotalWeight = 0;

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
                    dashTotalWeight += (h.weight || 18000);
                    if (h.type === 'fr') frTotal++; else if (h.type === 'etr') etrTotal++;
                } else {
                    let fallback = this.vehicleSpecs[h.type] ? ((this.vehicleSpecs[h.type].wMin + this.vehicleSpecs[h.type].wMax) / 2) : 1350;
                    dashTotalWeight += (h.weight || fallback);
                }

                if (h.timestamp) {
                    let d = new Date(h.timestamp);
                    days[dayKeys[d.getDay()]]++; months[monthKeys[d.getMonth()]]++;
                }

                let altVal = h.alt || 0;
                let altKey = altVal < 200 ? "< 200m" : altVal < 500 ? "200-500m" : altVal < 1000 ? "500-1000m" : "> 1000m";
                alts[altKey]++;

                let roadKey = h.road || "Inconnu";
                roads[roadKey] = (roads[roadKey] || 0) + 1;

                if (i < sHist.length - 1) {
                    let nxt = type === 'trucks' ? sHist[i+1].brand : sHist[i+1].type;
                    let pair = `${vehType} ➡️ ${nxt}`;
                    seqs[pair] = (seqs[pair] || 0) + 1;
                }
            });
        });

        let tTitle = document.getElementById('dash-title-total'); 
        if (tTitle) { 
            tTitle.innerText = type === 'trucks' ? "🚛 Cumul Total Camions" : "🚗 Cumul Total Véhicules"; 
            tTitle.style.color = type === 'trucks' ? "#e67e22" : "#3498db"; 
        }

        let dwEl = document.getElementById('dash-weight'); 
        if(dwEl) dwEl.innerText = this.formatWeight(dashTotalWeight);

        let anaData = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;

        let aiInsightContainer = document.getElementById('ai-insight-container');
        let aiInsightText = document.getElementById('ai-insight-text');
        if (aiInsightContainer && aiInsightText && window.ml) {
            let insightMsg = window.ml.generateInsights(type, anaData);
            aiInsightText.innerHTML = insightMsg;
            aiInsightContainer.style.display = 'block';
        }

        let reportContainer = document.getElementById('ai-report-card-container');
        let reportContent = document.getElementById('ai-report-card-content');
        if (reportContainer && reportContent && window.ml) {
            reportContent.innerHTML = window.ml.generateReportCard(type, anaData);
            reportContainer.style.display = 'block';
        }

        let gRatio = gTotalDist > 0 ? (gTotal / gTotalDist).toFixed(1) + " /km" : "- /km";
        let htmlList = `<div class="km-stat-card" style="border-color:${type === 'trucks' ? '#27ae60' : '#3498db'}; cursor:pointer; background:var(--bg-color);" onclick="window.app.showGlobalDetails('${type}', 'Total')"><span class="km-stat-title">${type === 'trucks' ? 'Toutes Marques' : 'Tous Véhicules'}</span><span class="km-stat-value" style="color:${type === 'trucks' ? '#27ae60' : '#3498db'}; font-size:0.9em;">🔍 Voir Absolus</span><span style="display:block; font-size:0.75em; color:#7f8c8d; margin-top:3px;">${gRatio}</span></div>`;
        
        let labelsForChart = [], dataForChart = [], itemsArr = [];
        let typeList = type === 'trucks' ? this.brands : this.vehicleTypes;
        
        typeList.forEach(item => {
            let count = counters[item] || 0;
            if (count > 0) itemsArr.push({ name: item, count: count });
        });
        
        itemsArr.sort((a, b) => b.count - a.count);

        itemsArr.forEach(obj => {
            let item = obj.name; let count = obj.count;
            let ratio = gTotalDist > 0 ? (count / gTotalDist).toFixed(1) + " /km" : "";
            let displayItem = item === 'Camions' && type === 'cars' ? 'Poids Lourds' : item;
            htmlList += `<div class="km-stat-card" style="cursor:pointer; position:relative;" onclick="window.app.showGlobalDetails('${type}', '${item}')"><span class="km-stat-title">${displayItem}</span><span class="km-stat-value">${count}</span><span style="display:block; font-size:0.75em; color:#7f8c8d; margin-top:3px;">${ratio}</span></div>`;
            labelsForChart.push(displayItem); dataForChart.push(count);
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

        // 📊 NOUVEAU GRAPHIQUE 24H (Empilé par catégorie)
        let ctx24h = document.getElementById('dashboard24hChart');
        if (ctx24h) {
            if (this.dashboard24hChart) this.dashboard24hChart.destroy();
            
            let labels24h = [];
            for (let i = 0; i < 24; i++) labels24h.push(`${i}h`);
            
            let datasets24h = [];
            let colors24h = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'];
            let cIdx = 0;
            
            // Trouver les catégories les plus fréquentes pour ne pas surcharger
            let topCategories = Object.keys(anaData.byVeh).sort((a,b) => {
                let sumA = Object.values(anaData.byVeh[a].hours).reduce((x,y)=>x+y,0);
                let sumB = Object.values(anaData.byVeh[b].hours).reduce((x,y)=>x+y,0);
                return sumB - sumA;
            }).slice(0, 8);

            topCategories.forEach(veh => {
                let dataPoint = [];
                for (let i = 0; i < 24; i++) {
                    dataPoint.push(anaData.byVeh[veh].hours[`${i}h`] || 0);
                }
                datasets24h.push({
                    label: veh.replace('_fr','🇫🇷').replace('_etr','🇪🇺'),
                    data: dataPoint,
                    backgroundColor: colors24h[cIdx % colors24h.length]
                });
                cIdx++;
            });

            this.dashboard24hChart = new Chart(ctx24h, {
                type: 'bar',
                data: { labels: labels24h, datasets: datasets24h },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: textColor, font: { size: 10 } } } },
                    scales: {
                        x: { stacked: true, ticks: { color: textColor } },
                        y: { stacked: true, ticks: { color: textColor } }
                    }
                }
            });
        }

        let ctxAi = document.getElementById('aiEvolutionChart');
        if (ctxAi) {
            if (this.aiEvolutionChart) this.aiEvolutionChart.destroy();
            let aiSessions = sessions.filter(s => s.predictions && s.predictions.total > 0).slice(-10);
            
            if (aiSessions.length > 0) {
                let aiLabels = [], aiData = [];
                aiSessions.forEach((s, idx) => {
                    aiLabels.push(`Sess. ${idx + 1}`);
                    aiData.push(Math.round((s.predictions.success / s.predictions.total) * 100));
                });
                this.aiEvolutionChart = new Chart(ctxAi, {
                    type: 'line',
                    data: { labels: aiLabels, datasets: [{ label: 'Précision IA (%)', data: aiData, borderColor: '#8e44ad', backgroundColor: 'rgba(142, 68, 173, 0.2)', fill: true, tension: 0.4, pointBackgroundColor: '#8e44ad' }] },
                    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { color: textColor, callback: function(val) { return val + '%'; } } }, x: { ticks: { color: textColor } } } }
                });
                ctxAi.parentElement.style.display = 'block';
            } else { ctxAi.parentElement.style.display = 'none'; }
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
        } else { if (natContainer) natContainer.style.display = 'none'; }

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
            
            let activeRoads = {};
            Object.keys(roads).forEach(k => { if(roads[k] > 0) activeRoads[k] = roads[k]; });

            this.roadTypeChart = new Chart(ctxR, {
                type: 'doughnut',
                data: { labels: Object.keys(activeRoads), datasets: [{ data: Object.values(activeRoads), backgroundColor: ['#3498db', '#f1c40f', '#e74c3c', '#95a5a6', '#8e44ad', '#27ae60', '#e67e22'], borderWidth: 1, borderColor: isDark ? '#2f3640' : '#fff' }] },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textColor } } } }
            });
        }

        let seqArr = Object.entries(seqs).sort((a,b) => b[1] - a[1]).slice(0, 5);
        let seqHtml = '';
        if(seqArr.length === 0) seqHtml = '<p style="color:#7f8c8d; font-size:0.9em;">Pas assez de données pour lier des séquences.</p>';
        seqArr.forEach(item => { seqHtml += `<div class="sequence-item"><span class="sequence-flow">${item[0]}</span><span class="sequence-count">${item[1]}x</span></div>`; });
        document.getElementById('sequence-container').innerHTML = seqHtml;
    },

    async showSessionDetails(type, sessionId) {
        let session = await this.idb.getById(sessionId);
        if(!session) return;

        let items = session.history ? session.history.filter(h => !h.isEvent) : [];
        let itemsCount = items.length;
        
        let sessionWeight = items.reduce((sum, item) => {
            let fallback = 1350;
            if (type === 'trucks') fallback = 18000;
            else if (this.vehicleSpecs[item.type]) fallback = (this.vehicleSpecs[item.type].wMin + this.vehicleSpecs[item.type].wMax) / 2;
            return sum + (item.weight || fallback);
        }, 0);
        
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

        let financeHtml = '';
        if (session.sessionFinance && type === 'cars') {
            let balance = session.sessionFinance.gains - session.sessionFinance.losses;
            let color = balance >= 0 ? '#27ae60' : '#e74c3c';
            let sign = balance > 0 ? '+' : '';

            let carbonEuros = session.sessionFinance.carbon || 0;
            let carbonColor = carbonEuros >= 0 ? '#27ae60' : '#e74c3c';
            let carbonSign = carbonEuros > 0 ? '+' : '';
            let carbonHtml = carbonEuros !== 0 ? `<div class="session-detail-row"><span class="session-detail-label" style="font-size:0.8em;">⚖️ Bilan Carbone</span><span class="session-detail-value" style="color:${carbonColor}; font-size:0.8em;">${carbonSign}${carbonEuros} €</span></div>` : '';

            financeHtml = `
                <div style="border-top: 2px dashed var(--border-color); margin: 10px 0;"></div>
                <div class="session-detail-row"><span class="session-detail-label">Bilan Financier Session</span><span class="session-detail-value" style="color:${color}; font-weight:bold;">${sign}${balance} €</span></div>
                <div class="session-detail-row"><span class="session-detail-label" style="font-size:0.8em;">Gains totaux</span><span class="session-detail-value" style="color:#27ae60; font-size:0.8em;">+${session.sessionFinance.gains} €</span></div>
                <div class="session-detail-row"><span class="session-detail-label" style="font-size:0.8em;">Pertes / Frais</span><span class="session-detail-value" style="color:#e74c3c; font-size:0.8em;">-${session.sessionFinance.losses} €</span></div>
                ${carbonHtml}
            `;
        }

        let html = `
            <div class="session-detail-row"><span class="session-detail-label">Date</span><span class="session-detail-value">${session.date}</span></div>
            <div class="session-detail-row"><span class="session-detail-label" style="color:#27ae60;">🟢 Départ</span><span class="session-detail-value">${session.startAddress || "Inconnue"}</span></div>
            <div class="session-detail-row"><span class="session-detail-label" style="color:#c0392b;">🔴 Arrivée</span><span class="session-detail-value">${session.endAddress || "Inconnue"}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Durée</span><span class="session-detail-value">${this.formatTime(session.durationSec || 0)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Distance</span><span class="session-detail-value">${dist} km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Vitesse Moyenne</span><span class="session-detail-value" style="color:#8e44ad;">${avgSpeedKmh} km/h</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Véhicules comptés</span><span class="session-detail-value">${itemsCount}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Masse Estimée</span><span class="session-detail-value" style="color:#e67e22; font-weight:bold;">⚖️ ${this.formatWeight(sessionWeight)}</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Apparitions par minute</span><span class="session-detail-value">${freq} /min</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Rythme</span><span class="session-detail-value">${speed} /h</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Moyenne</span><span class="session-detail-value">${avgKm} /km</span></div>
            <div class="session-detail-row"><span class="session-detail-label">Espacement Moyen</span><span class="session-detail-value">${espTemps} / ${espDist}</span></div>
            ${financeHtml}
            <div style="border-top: 2px dashed var(--border-color); margin: 10px 0;"></div>
            <div class="session-detail-row"><span class="session-detail-label">🔮 Réussite Prédictions</span><span class="session-detail-value" style="color:#8e44ad; font-weight:bold;">${predTxt}</span></div>
        `;
        document.getElementById('modal-session-title').innerText = type === 'trucks' ? '🚛 Détails Session Camions' : '🚗 Détails Session Véhicules';
        document.getElementById('modal-session-content').innerHTML = html;
        
        let titleEl = document.querySelector('#session-detail-modal h4');
        if (titleEl) titleEl.innerText = "📈 Densité Temporelle (Session)";
        document.getElementById('modal-weekly-section').style.display = 'none';
        
        let altSection = document.getElementById('modal-altitude-section'); if (altSection) altSection.style.display = 'none'; 
        let monthSection = document.getElementById('modal-monthly-section'); if (monthSection) monthSection.style.display = 'none';
        let roadSection = document.getElementById('modal-road-section'); if (roadSection) roadSection.style.display = 'none';

        document.getElementById('session-detail-modal').style.display = 'flex';
        let btnPdf = document.getElementById('btn-export-pdf');
        if(btnPdf) btnPdf.onclick = () => window.app.exportSessionPDF();

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
        if (typeof html2pdf === 'undefined') { if(window.ui) window.ui.showToast("⚠️ Outil PDF non chargé."); return; }
        
        let element = document.getElementById('pdf-export-content');
        let btns = element.querySelectorAll('button');
        btns.forEach(b => b.style.display = 'none');
        
        let opt = {
            margin: 10, filename: `Bilan_Compteur_${new Date().toISOString().slice(0,10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
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
        
        let items = session.history ? session.history.filter(h => !h.isEvent) : [];
        
        let sessionWeight = items.reduce((sum, item) => {
            let fallback = 1350;
            if (type === 'trucks') fallback = 18000;
            else if (this.vehicleSpecs[item.type]) fallback = (this.vehicleSpecs[item.type].wMin + this.vehicleSpecs[item.type].wMax) / 2;
            return sum + (item.weight || fallback);
        }, 0);
        
        session.masseTotaleKg = sessionWeight;

        let exportData = { appVersion: "Compteur Trafic v6.2", exportDate: new Date().toISOString(), sessionType: type, session: session };
        const dataStr = JSON.stringify(exportData, null, 2);
        let safeDate = session.date.replace(/[\/ :]/g, '_');
        await this.triggerDownloadOrShare(dataStr, `Compteur_Session_${type}_${safeDate}.txt`);
    },

    async exportSaveFile() {
        let truckSessions = await this.idb.getAll('trucks');
        let carSessions = await this.idb.getAll('cars');

        let enrichSession = (s) => {
            let items = s.history ? s.history.filter(h => !h.isEvent) : [];
            let count = items.length;
            let vehPerKm = s.distanceKm > 0 ? +(count / s.distanceKm).toFixed(2) : 0;
            let freqMin = (count > 0 && s.durationSec > 0) ? +(count / (s.durationSec / 60)).toFixed(2) : 0;
            let avgSpeed = s.durationSec > 0 ? +(s.distanceKm / (s.durationSec / 3600)).toFixed(1) : 0;
            let espaceTemps = count > 1 ? +(s.durationSec / count).toFixed(1) : 0;
            let rythmeH = s.durationSec > 0 ? +(count / (s.durationSec / 3600)).toFixed(1) : 0;
            
            let detailAuKm = {};
            let sessionWeight = items.reduce((sum, item) => {
                let fallback = 1350;
                if (s.sessionType === 'trucks') fallback = 18000;
                else if (this.vehicleSpecs[item.type]) fallback = (this.vehicleSpecs[item.type].wMin + this.vehicleSpecs[item.type].wMax) / 2;
                return sum + (item.weight || fallback);
            }, 0);

            if (s.distanceKm > 0 && s.summary) {
               Object.keys(s.summary).forEach(k => {
                  let tot = typeof s.summary[k] === 'object' ? (s.summary[k].fr + s.summary[k].etr) : s.summary[k];
                  if(tot > 0) detailAuKm[k] = +(tot / s.distanceKm).toFixed(2);
               });
            }
            return { ...s, totalCount: count, masseTotaleKg: sessionWeight, scoreParKm: vehPerKm, apparitionsParMinute: freqMin, rythmeParHeure: rythmeH, vitesseMoyenneKmh: avgSpeed, espacementMoyenSec: espaceTemps, detailsAuKm: detailAuKm };
        };

        let allSessions = [...truckSessions.map(enrichSession), ...carSessions.map(enrichSession)];
        
        let globalSummary = { 
            profile: this.currentUser,
            mode: this.currentMode,
            bankBalance: this.bankBalance,
            totalSessions: allSessions.length, 
            globalDonneesBrutesCamions: this.globalTruckCounters, 
            globalDonneesBrutesVehicules: this.globalCarCounters,
            analysesPermanentesCamions: this.globalAnaTrucks,
            analysesPermanentesVehicules: this.globalAnaCars
        };

        let exportData = { appVersion: "Compteur Trafic v6.2", exportDate: new Date().toISOString(), globalSummary: globalSummary, sessions: allSessions };
        const dataStr = JSON.stringify(exportData, null, 2);
        await this.triggerDownloadOrShare(dataStr, `Compteur_Export_${this.currentUser}_${new Date().toISOString().slice(0,10)}.txt`);
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
                    
                    if (data.globalSummary?.globalDonneesBrutesCamions) this.storage.set('globalTruckCounters', data.globalSummary.globalDonneesBrutesCamions);
                    if (data.globalSummary?.globalDonneesBrutesVehicules) this.storage.set('globalCarCounters', data.globalSummary.globalDonneesBrutesVehicules);
                    if (data.globalSummary?.analysesPermanentesCamions) this.storage.set('globalAnaTrucks', data.globalSummary.analysesPermanentesCamions);
                    if (data.globalSummary?.analysesPermanentesVehicules) this.storage.set('globalAnaCars', data.globalSummary.analysesPermanentesVehicules);
                    if (data.globalSummary?.bankBalance) {
                        this.bankBalance = parseFloat(data.globalSummary.bankBalance);
                        await this.saveUserData();
                    }
                    
                    alert("✅ Historique et analyses importés avec succès ! Redémarrage..."); location.reload();
                } else if(!data.sessions) { alert("❌ Format non reconnu."); }
            } catch (err) { alert("❌ Fichier invalide ou corrompu !"); }
        }; reader.readAsText(file);
    },

    async deleteSessionsByDateRange() {
        let startInput = document.getElementById('delete-start-date').value;
        let endInput = document.getElementById('delete-end-date').value;

        let startTs = startInput ? new Date(startInput).setHours(0, 0, 0, 0) : 0; 
        let endTs = endInput ? new Date(endInput).setHours(23, 59, 59, 999) : Date.now();

        if (startInput && endInput && startTs > endTs) {
            if(window.ui) window.ui.showToast("⚠️ La date de début doit être avant la date de fin."); return;
        }

        if (!confirm(`⚠️ Tu vas supprimer des sessions ET recalculer tous les totaux globaux pour cette période. Cette action est irréversible. Continuer ?`)) return;

        let allTruckSessions = await this.idb.getAll('trucks');
        let allCarSessions = await this.idb.getAll('cars');
        
        let tx = this.idb.db.transaction('sessions', 'readwrite');
        let store = tx.objectStore('sessions');
        let deletedCount = 0, keptTruckSessions = [], keptCarSessions = [];

        allTruckSessions.forEach(s => {
            if (parseInt(s.id) >= startTs && parseInt(s.id) <= endTs) { store.delete(s.id); deletedCount++; } 
            else { keptTruckSessions.push(s); }
        });

        allCarSessions.forEach(s => {
            if (parseInt(s.id) >= startTs && parseInt(s.id) <= endTs) { store.delete(s.id); deletedCount++; } 
            else { keptCarSessions.push(s); }
        });

        if (deletedCount === 0) { if(window.ui) window.ui.showToast("🤷‍♂️ Aucune session trouvée sur cette période."); return; }

        tx.oncomplete = async () => {
            this.brands.forEach(b => this.globalTruckCounters[b] = { fr: 0, etr: 0 });
            this.vehicleTypes.forEach(v => this.globalCarCounters[v] = 0);
            this.globalTruckDistance = 0; this.globalTruckTime = 0;
            this.globalCarDistance = 0; this.globalCarTime = 0;
            this.globalAnaTrucks = this.getEmptyAnalytics();
            this.globalAnaCars = this.getEmptyAnalytics();
            
            keptTruckSessions.forEach(s => {
                this.globalTruckDistance += (s.distanceKm || 0); this.globalTruckTime += (s.durationSec || 0);
                if (s.summary) Object.keys(s.summary).forEach(b => {
                    if (this.globalTruckCounters[b] && s.summary[b]) {
                        this.globalTruckCounters[b].fr += (s.summary[b].fr || 0);
                        this.globalTruckCounters[b].etr += (s.summary[b].etr || 0);
                    }
                });
                if (s.predictions) {
                    this.globalAnaTrucks.predictions.total += (s.predictions.total || 0);
                    this.globalAnaTrucks.predictions.success += (s.predictions.success || 0);
                }
            });

            keptCarSessions.forEach(s => {
                this.globalCarDistance += (s.distanceKm || 0); this.globalCarTime += (s.durationSec || 0);
                if (s.summary) Object.keys(s.summary).forEach(v => {
                    if (this.globalCarCounters[v] !== undefined) this.globalCarCounters[v] += (s.summary[v] || 0);
                });
                if (s.predictions) {
                    this.globalAnaCars.predictions.total += (s.predictions.total || 0);
                    this.globalAnaCars.predictions.success += (s.predictions.success || 0);
                }
            });

            await this.buildPermanentAnalyticsFromIDB('trucks', this.globalAnaTrucks);
            await this.buildPermanentAnalyticsFromIDB('cars', this.globalAnaCars);

            this.storage.set('globalTruckCounters', this.globalTruckCounters);
            this.storage.set('globalCarCounters', this.globalCarCounters);
            this.storage.set('globalTruckDistance', this.globalTruckDistance);
            this.storage.set('globalTruckTime', this.globalTruckTime);
            this.storage.set('globalCarDistance', this.globalCarDistance);
            this.storage.set('globalCarTime', this.globalCarTime);
            this.storage.set('globalAnaTrucks', this.globalAnaTrucks);
            this.storage.set('globalAnaCars', this.globalAnaCars);

            this.renderDashboard('trucks');
            this.renderAdvancedStats('trucks'); this.renderAdvancedStats('cars');
            if(window.ui) window.ui.showToast(`🧹 ${deletedCount} session(s) et les données nettoyées !`);
        };
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
                historyContainer.innerHTML += `<div class="history-item"><div class="history-item-header"><strong style="${titleStyle}">${title}</strong><span class="history-meta">⏱️ ${item.chronoTime} | 📍 ${item.lat ? parseFloat(item.lat).toFixed(4) : '?'}</span><button class="btn-del-history" onclick="window.app.deleteHistoryItem('${type}', ${realIndex})">🗑️</button></div></div>`;
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
    },

    formatCandidateName(c, type) {
        if (type === 'trucks') {
            return c.replace('_fr', ' 🇫🇷').replace('_etr', ' 🌍');
        } else {
            return c === 'Camions' ? 'Poids Lourds' : c;
        }
    },

        renderPredictionUI(type, top3, method) {
        let elMain = document.getElementById(type === 'trucks' ? 'pred-main-trucks' : 'pred-main-cars');
        let elGauge = document.getElementById(type === 'trucks' ? 'pred-gauge-trucks' : 'pred-gauge-cars');
        let elPodium = document.getElementById(type === 'trucks' ? 'pred-podium-trucks' : 'pred-podium-cars');
        let elJournal = document.getElementById(type === 'trucks' ? 'pred-journal-trucks' : 'pred-journal-cars'); 

        if (!elMain || !elGauge || !elPodium || !top3 || top3.length === 0) return;

        let best = top3[0];
        let displayName = this.formatCandidateName(best.candidate, type);
        
        elMain.innerHTML = `<strong>${displayName}</strong> ~${best.confidence}% <span style="color:#7f8c8d; font-size:0.8em;">(${method})</span>`;

        elGauge.style.width = best.confidence + '%';
        if (best.confidence < 40) elGauge.style.backgroundColor = '#e74c3c'; 
        else if (best.confidence < 70) elGauge.style.backgroundColor = '#f39c12'; 
        else elGauge.style.backgroundColor = '#27ae60'; 

        let podiumHtml = '';
        for (let i = 1; i < 3; i++) {
            if (top3[i]) {
                podiumHtml += `<span>#${i+1} ${this.formatCandidateName(top3[i].candidate, type)}<br><span class="pred-podium-score">${top3[i].confidence}%</span></span>`;
            } else {
                podiumHtml += `<span>-</span>`;
            }
        }
        elPodium.innerHTML = podiumHtml;

        if (type === 'trucks') {
            this.currentPredictionTruck = { class: best.candidate, confidence: best.confidence };
        } else {
            this.currentPredictionCar = { class: best.candidate, confidence: best.confidence };
        }

        if (elJournal) {
            let hist = type === 'trucks' ? this.truckHistory.filter(h=>!h.isEvent) : this.carHistory.filter(h=>!h.isEvent);
            let speed = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
            let alt = window.gps && window.gps.currentPos && window.gps.currentPos.alt ? window.gps.currentPos.alt : 0;
            
            let seqText = "📊 Init.";
            if (hist.length >= 2) {
                let l1 = type === 'trucks' ? hist[hist.length-1].brand.split(' ')[0] : (hist[hist.length-1].type === 'Camions' ? 'PL' : hist[hist.length-1].type.substring(0,4));
                let l2 = type === 'trucks' ? hist[hist.length-2].brand.split(' ')[0] : (hist[hist.length-2].type === 'Camions' ? 'PL' : hist[hist.length-2].type.substring(0,4));
                seqText = `🔁 [${l2}➡️${l1}]`;
            } else if (hist.length === 1) {
                let l1 = type === 'trucks' ? hist[0].brand.split(' ')[0] : (hist[0].type === 'Camions' ? 'PL' : hist[0].type.substring(0,4));
                seqText = `🔁 [${l1}]`;
            }

            let envText = speed > 80 ? `🛣️ >80km/h` : (speed > 40 ? `🚗 >40km/h` : `🏙️ <40km/h`);
            if (alt > 400) envText += ` (⛰️ ${Math.round(alt)}m)`;

            let tenMinsAgo = Date.now() - 600000;
            let count10m = hist.filter(item => item.timestamp >= tenMinsAgo).length;
            let trendText = count10m > 15 ? `🔥 Pic` : (count10m > 5 ? `🌊 Régulier` : `⏳ Calme`);

            elJournal.innerHTML = `🔍 <strong>Facteurs IA :</strong> ${seqText} | ${envText} | ${trendText}`;
        }

   }, 

    async updatePrediction(type) {
        let elMain = document.getElementById(type === 'trucks' ? 'pred-main-trucks' : 'pred-main-cars');
        if(elMain) elMain.innerHTML = "Analyse en cours... 🤖";

        if (window.ml) {
            let aiResult = await window.ml.predictNext(type);
            if (aiResult && aiResult.top3) {
                this.renderPredictionUI(type, aiResult.top3, 'IA 🧠');
                return;
            }
        }

        let ana = type === 'trucks' ? this.globalAnaTrucks : this.globalAnaCars;
        let history = type === 'trucks' ? this.truckHistory : this.carHistory;
        let globalCounters = type === 'trucks' ? this.globalTruckCounters : this.globalCarCounters;
        let candidates = type === 'trucks' ? window.ml.getTruckClasses() : this.vehicleTypes;

        let d = new Date();
        let currentHourKey = `${d.getHours()}h`;
        let currentDayKey = Object.keys(ana.days)[d.getDay()];
        let currentMonthKey = Object.keys(ana.months)[d.getMonth()];
        let currentAlt = window.gps && window.gps.currentPos && window.gps.currentPos.alt ? window.gps.currentPos.alt : 0;
        let altKey = currentAlt < 200 ? "< 200m" : currentAlt < 500 ? "200-500m" : currentAlt < 1000 ? "500-1000m" : "> 1000m";

        let currentSpeedKmh = window.gps ? window.gps.getSlidingSpeedKmh() : 0;
        let isHighway = (this.currentMode === 'voiture' && currentSpeedKmh > 100) || (this.currentMode === 'camion' && currentSpeedKmh > 80); 
        let currentRoad = this.getRoadType(currentSpeedKmh, this.currentMode);
        
        let sec = type === 'trucks' ? this.truckSeconds : this.carSeconds;
        let isDenseTraffic = sec > 0 && (history.length / (sec / 3600)) > 500; 

        let recentItems = history.filter(h => !h.isEvent).slice(-2);
        let lastV1 = recentItems.length > 1 ? (type === 'trucks' ? `${recentItems[0].brand}_${recentItems[0].type}` : recentItems[0].type) : null; 
        let lastV2 = recentItems.length > 0 ? (type === 'trucks' ? `${recentItems[recentItems.length-1].brand}_${recentItems[recentItems.length-1].type}` : recentItems[recentItems.length-1].type) : null; 

        let scores = {};
        let totalGlobalCount = 0;
        
        candidates.forEach(c => {
            let count = 0;
            if (type === 'trucks') {
                let parts = c.split('_');
                count = globalCounters[parts[0]] ? (globalCounters[parts[0]][parts[1]] || 0) : 0;
            } else {
                count = globalCounters[c] || 0;
            }
            scores[c] = count; 
            totalGlobalCount += count;
        });

        if(totalGlobalCount > 0) {
            candidates.forEach(c => { scores[c] = (scores[c] / totalGlobalCount) * 100; });
        } else {
            candidates.forEach(c => { scores[c] = 10; });
        }

        candidates.forEach(c => {
            let baseVehKey = type === 'trucks' ? c.split('_')[0] : c;

            if (lastV1 && lastV2 && ana.seqs3) {
                let triplet = `${lastV1} ➡️ ${lastV2} ➡️ ${baseVehKey}`;
                if (ana.seqs3[triplet]) scores[c] += 25; 
            }
            if (lastV2 && ana.seqs) {
                let pair = `${lastV2} ➡️ ${baseVehKey}`;
                if (ana.seqs[pair]) scores[c] += 10; 
            }

            if (ana.byVeh && ana.byVeh[baseVehKey]) {
                let pHeure = (ana.hours[currentHourKey] > 0) ? ((ana.byVeh[baseVehKey].hours[currentHourKey] || 0) / ana.hours[currentHourKey]) * 100 : 0;
                let pJour = (ana.days[currentDayKey] > 0) ? ((ana.byVeh[baseVehKey].days[currentDayKey] || 0) / ana.days[currentDayKey]) * 100 : 0;
                let pAlt = (ana.alts[altKey] > 0) ? ((ana.byVeh[baseVehKey].alts[altKey] || 0) / ana.alts[altKey]) * 100 : 0;
                let pMois = (ana.months[currentMonthKey] > 0) ? ((ana.byVeh[baseVehKey].months[currentMonthKey] || 0) / ana.months[currentMonthKey]) * 100 : 0;
                let pRoute = (ana.roads[currentRoad] > 0) ? ((ana.byVeh[baseVehKey].roads[currentRoad] || 0) / ana.roads[currentRoad]) * 100 : 0;

                scores[c] += (pHeure * 0.1) + (pJour * 0.1) + (pAlt * 0.1) + (pMois * 0.15) + (pRoute * 0.25);
            }
            
            if (type === 'trucks' && c.includes('_etr')) {
                if (isHighway) scores[c] += 15;
                let currentHour = d.getHours();
                if (currentHour < 5 || currentHour > 22) scores[c] += 15;
                if (d.getDay() === 0 || d.getDay() === 6) scores[c] += 15;
            }
        });

        if (type === 'cars') {
            if (isHighway) {
                scores['Camions'] += 40; 
                scores['Vélos'] = 0; 
                scores['Engins agricoles'] = 0;
            }
            if (isDenseTraffic) { scores['Voitures'] += 30; }
        }

        let results = [];
        candidates.forEach(c => {
            let finalScore = scores[c] + (Math.random() * (scores[c] * 0.1));
            results.push({ candidate: c, rawScore: finalScore });
        });

        results.sort((a, b) => b.rawScore - a.rawScore);
        
        let totalScoreSum = results.reduce((sum, r) => sum + Math.max(0, r.rawScore), 0);
        
        let top3 = results.slice(0, 3).map(r => {
            let conf = totalScoreSum > 0 ? Math.min(99, Math.round((Math.max(0, r.rawScore) / totalScoreSum) * 100)) : 33;
            return { candidate: r.candidate, confidence: conf };
        });

        this.renderPredictionUI(type, top3, 'Classique 📊');
    }
};

window.app = app;

const startApp = () => {
    app.init(); 
    if(window.ui) window.ui.init(); 
    if(window.gps) window.gps.init(); 
    if(window.gami) window.gami.init(); 
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
