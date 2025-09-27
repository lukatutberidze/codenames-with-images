const socket = io();

// --- STATE VARIABLES ---
let myRole = null, myNickname = '', gameCode = '', isHost = false;
let startingTeam = 'red';
let currentPlayers = [];

// --- DOM Elements ---
const homeScreen = document.getElementById('home-screen'), gameContainer = document.getElementById('game-container');
const nicknameInput = document.getElementById('nickname-input'), hostBtn = document.getElementById('host-btn');
const showJoinBtn = document.getElementById('show-join-btn'), joinForm = document.getElementById('join-form');
const gameCodeInput = document.getElementById('game-code-input'), joinBtn = document.getElementById('join-btn');
const redOperativesList = document.getElementById('red-operatives'), redSpymasterList = document.getElementById('red-spymaster');
const blueOperativesList = document.getElementById('blue-operatives'), blueSpymasterList = document.getElementById('blue-spymaster');
const gameCodeText = document.getElementById('game-code-text'), roleButtons = document.querySelectorAll('.role-btn');
const gameBoard = document.getElementById('game-board'), spymasterControls = document.getElementById('spymaster-controls');
const lobbyView = document.getElementById('lobby-view'), gameView = document.getElementById('game-view');
const turnIndicator = document.getElementById('turn-indicator'), clueDisplay = document.getElementById('clue-display');
const gameOverModal = document.getElementById('game-over-modal'), winnerMessage = document.getElementById('winner-message');
const playAgainBtn = document.getElementById('play-again-btn');
const hostControls = document.getElementById('host-controls'), redStartsBtn = document.getElementById('red-starts-btn');
const blueStartsBtn = document.getElementById('blue-starts-btn'), startGameBtn = document.getElementById('start-game-btn');
const endTurnBtn = document.getElementById('end-turn-btn');
const clueNumberInput = document.getElementById('clue-number-input');

// --- Event Listeners ---
hostBtn.addEventListener('click', () => { myNickname = nicknameInput.value.trim(); if (myNickname) socket.emit('hostGame', myNickname); else alert('Please enter a nickname.'); });
showJoinBtn.addEventListener('click', () => { joinForm.style.display = 'block'; });
joinBtn.addEventListener('click', () => { myNickname = nicknameInput.value.trim(); const code = gameCodeInput.value.trim().toUpperCase(); if (myNickname && code) socket.emit('joinGame', { nickname: myNickname, gameCode: code }); else alert('Please enter a nickname and a game code.'); });
roleButtons.forEach(button => { button.addEventListener('click', () => { myRole = button.dataset.role; socket.emit('selectRole', { role: myRole, gameCode }); }); });
redStartsBtn.addEventListener('click', () => { startingTeam = 'red'; redStartsBtn.classList.add('active'); blueStartsBtn.classList.remove('active'); });
blueStartsBtn.addEventListener('click', () => { startingTeam = 'blue'; blueStartsBtn.classList.add('active'); redStartsBtn.classList.remove('active'); });
startGameBtn.addEventListener('click', () => { if (isHost) socket.emit('startGame', { gameCode, startingTeam }); });
playAgainBtn.addEventListener('click', () => { gameOverModal.style.display = 'none'; lobbyView.style.display = 'block'; gameView.style.display = 'none'; document.body.classList.remove('spymaster-view'); });
endTurnBtn.addEventListener('click', () => { socket.emit('endTurn', { gameCode }); });

// --- Socket.io Event Handlers ---
socket.on('gameCreated', (data) => { gameCode = data.gameCode; isHost = true; homeScreen.style.display = 'none'; gameContainer.style.display = 'flex'; gameCodeText.textContent = gameCode; hostControls.style.display = 'block'; updatePlayerLists(data.room.players); });
socket.on('joinSuccess', (data) => { gameCode = data.gameCode; isHost = (socket.id === data.room.hostId); homeScreen.style.display = 'none'; gameContainer.style.display = 'flex'; gameCodeText.textContent = gameCode; updatePlayerLists(data.room.players); if(isHost) hostControls.style.display = 'block'; });
socket.on('playerListUpdate', (players) => { currentPlayers = players; updatePlayerLists(players); });
socket.on('hostUpdate', (hostId) => { isHost = (socket.id === hostId); hostControls.style.display = isHost ? 'block' : 'none'; });
socket.on('gameStarted', (gameState) => { lobbyView.style.display = 'none'; gameView.style.display = 'flex'; updateGameBoard(gameState); updateGameInfo(gameState); });
socket.on('cardRevealed', (gameState) => { updateGameBoard(gameState); updateGameInfo(gameState); if (gameState.gameOver) { setTimeout(() => { winnerMessage.textContent = `${gameState.winningTeam.toUpperCase()} TEAM WINS!`; gameOverModal.style.display = 'flex'; }, 1500); } });
socket.on('clueSubmitted', (gameState) => updateGameInfo(gameState));
socket.on('turnEnded', (gameState) => updateGameInfo(gameState));
socket.on('voteUpdate', (gameState) => updateGameBoard(gameState));
socket.on('gameError', (message) => alert(message));

// --- Helper Functions ---
function checkTeamReadiness() {
    const hasRedSpymaster = currentPlayers.some(p => p.role === 'red-spymaster');
    const hasRedOperative = currentPlayers.some(p => p.role === 'red-operative');
    const hasBlueSpymaster = currentPlayers.some(p => p.role === 'blue-spymaster');
    const hasBlueOperative = currentPlayers.some(p => p.role === 'blue-operative');
    return hasRedSpymaster && hasRedOperative && hasBlueSpymaster && hasBlueOperative;
}

function updatePlayerLists(players) {
    redOperativesList.innerHTML = ''; redSpymasterList.innerHTML = '';
    blueOperativesList.innerHTML = ''; blueSpymasterList.innerHTML = '';
    players.forEach(p => { const d = document.createElement('div'); d.textContent = p.nickname; if (p.role === 'red-operative') redOperativesList.appendChild(d); else if (p.role === 'red-spymaster') redSpymasterList.appendChild(d); else if (p.role === 'blue-operative') blueOperativesList.appendChild(d); else if (p.role === 'blue-spymaster') blueSpymasterList.appendChild(d); });
    
    // Enable/disable start button for host based on team readiness
    if (isHost) {
        const ready = checkTeamReadiness();
        startGameBtn.disabled = !ready;
        startGameBtn.title = ready ? "Start the game!" : "Both teams need at least one Spymaster and one Operative.";
    }
}

function updateGameBoard(gameState) { if (myRole && myRole.includes('spymaster')) document.body.classList.add('spymaster-view'); else document.body.classList.remove('spymaster-view'); gameBoard.innerHTML = ''; gameState.board.forEach((card, index) => { const c = document.createElement('div'); c.classList.add('card', `${gameState.keycard[index]}-agent`); if (card.revealed) c.classList.add('revealed', card.color); const i = document.createElement('img'); i.src = `/img/${card.img}`; c.appendChild(i); const o = document.createElement('div'); o.classList.add('overlay'); c.appendChild(o); if (!card.revealed && card.votes.length > 0) { const tO = currentPlayers.filter(p => p.role === `${gameState.turn}-operative`).length || 1; const vO = document.createElement('div'); vO.classList.add('vote-overlay', gameState.turn); vO.textContent = `${card.votes.length}/${tO}`; c.appendChild(vO); } c.addEventListener('click', () => { if (myRole && myRole.includes('operative') && !card.revealed) socket.emit('voteForCard', { cardIndex: index, gameCode }); }); gameBoard.appendChild(c); }); }

function updateGameInfo(gameState) {
    const turnText = gameState.turn === 'red' ? "RED's Turn" : "BLUE's Turn";
    turnIndicator.textContent = turnText.toUpperCase();
    turnIndicator.style.color = gameState.turn === 'red' ? 'var(--red-team)' : 'var(--blue-team)';
    if (gameState.clue.word) { clueDisplay.innerHTML = `Clue: <strong>${gameState.clue.word}</strong>, <strong>${gameState.clue.number}</strong> (${gameState.guessesLeft} guesses left)`; }
    else { clueDisplay.textContent = 'Waiting for clue...'; }
    if (myRole === `${gameState.turn}-spymaster` && !gameState.clue.word) {
        spymasterControls.style.display = 'block';
        const cardsLeft = gameState.board.filter((c, i) => gameState.keycard[i] === gameState.turn && !c.revealed).length;
        clueNumberInput.max = cardsLeft; clueNumberInput.placeholder = `Num (Max ${cardsLeft})`;
    } else { spymasterControls.style.display = 'none'; }
    const amICurrentOperative = myRole && myRole.includes('operative') && gameState.turn.startsWith(myRole.split('-')[0]);
    const canEndTurn = amICurrentOperative && gameState.clue.word;
    endTurnBtn.style.display = canEndTurn ? 'block' : 'none';
}

document.getElementById('submit-clue-btn').addEventListener('click', () => {
    const word = document.getElementById('clue-word-input').value;
    const number = parseInt(clueNumberInput.value);
    if (word && number > 0) {
        if (number > parseInt(clueNumberInput.max)) { return alert(`Number cannot be greater than the team's remaining cards (${clueNumberInput.max}).`); }
        socket.emit('submitClue', { clue: { word, number }, gameCode });
        document.getElementById('clue-word-input').value = ''; clueNumberInput.value = '';
    }
});