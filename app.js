const playerNameInput = document.getElementById('playerName');
const addBtn = document.getElementById('addBtn');
const scoreboard = document.getElementById('scoreboard');
const resetBtn = document.getElementById('resetBtn');

// On récupère les données sauvegardées ou on crée un tableau vide
let players = JSON.parse(localStorage.getItem('retroScoreData')) || [];

function renderScores() {
    scoreboard.innerHTML = '';
    players.forEach((player, index) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="name">${player.name}</div>
            <div class="score">${player.score}</div>
            <div class="score-controls">
                <button onclick="updateScore(${index}, -1)">-</button>
                <button onclick="updateScore(${index}, 1)">+</button>
            </div>
        `;
        scoreboard.appendChild(card);
    });
    // On sauvegarde à chaque affichage !
    localStorage.setItem('retroScoreData', JSON.stringify(players));
}

function updateScore(index, change) {
    players[index].score += change;
    renderScores();
}

addBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        players.push({ name: name.toUpperCase(), score: 0 });
        playerNameInput.value = '';
        renderScores();
    }
});

resetBtn.addEventListener('click', () => {
    if(confirm('GAME OVER ? Effacer tous les scores ?')) {
        players = [];
        renderScores();
    }
});

// Enregistrement du Service Worker pour le mode PWA/Hors-ligne
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('✅ Service Worker enregistré !'))
            .catch(err => console.error('❌ Erreur Service Worker', err));
    });
}

// Affichage initial
renderScores();
