const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let gameRooms = {};
const imageFiles = Array.from({ length: 279 }, (_, i) => `card-${i + 1}.jpg`);

function generateGameCode() { let code; do { code = ''; const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; for (let i = 0; i < 4; i++) code += c.charAt(Math.floor(Math.random() * c.length)); } while (gameRooms[code]); return code; }

function createNewGameState() { return { board: [], keycard: [], turn: 'red', gameOver: false, winningTeam: null, clue: { word: '', number: 0 }, guessesAllowed: 0, guessesLeft: 0 }; }

function setupNewGame(roomCode, startingTeam) { const room = gameRooms[roomCode]; if (!room) return; let boardImages = [...imageFiles].sort(() => 0.5 - Math.random()).slice(0, 20); room.gameState.board = boardImages.map(img => ({ img, revealed: false, color: '', votes: [] })); let colors = []; if (startingTeam === 'red') colors = [...Array(8).fill('red'), ...Array(7).fill('blue')]; else colors = [...Array(7).fill('red'), ...Array(8).fill('blue')]; colors.push(...Array(4).fill('bystander'), 'assassin'); room.gameState.turn = startingTeam; room.gameState.keycard = colors.sort(() => 0.5 - Math.random()); room.gameState.gameOver = false; room.gameState.winningTeam = null; room.gameState.clue = { word: '', number: 0 }; room.gameState.guessesAllowed = 0; room.gameState.guessesLeft = 0; for (let i = 0; i < 20; i++) room.gameState.board[i].color = room.gameState.keycard[i]; }

function clearAllVotes(gameState) { gameState.board.forEach(card => card.votes = []); }
function switchTurn(gameState) { gameState.turn = gameState.turn === 'red' ? 'blue' : 'red'; gameState.clue = { word: '', number: 0 }; gameState.guessesAllowed = 0; gameState.guessesLeft = 0; clearAllVotes(gameState); }

// --- THIS IS THE FUNCTION WITH THE FIX ---
function revealCard(room, cardIndex, gameCode) {
    const { gameState } = room;
    gameState.board[cardIndex].revealed = true;
    gameState.guessesLeft--;
    const cardColor = gameState.keycard[cardIndex];

    // Step 1: Always check for a win condition first.
    const redLeft = gameState.board.filter((c, i) => gameState.keycard[i] === 'red' && !c.revealed).length;
    const blueLeft = gameState.board.filter((c, i) => gameState.keycard[i] === 'blue' && !c.revealed).length;
    if (redLeft === 0) {
        gameState.gameOver = true;
        gameState.winningTeam = 'red';
        io.to(gameCode).emit('cardRevealed', gameState);
        return; // Stop execution here, the game is over.
    }
    if (blueLeft === 0) {
        gameState.gameOver = true;
        gameState.winningTeam = 'blue';
        io.to(gameCode).emit('cardRevealed', gameState);
        return; // Stop execution here, the game is over.
    }

    // Step 2: If no one has won, check for assassin or turn-ending plays.
    if (cardColor === 'assassin') {
        gameState.gameOver = true;
        gameState.winningTeam = gameState.turn === 'red' ? 'blue' : 'red';
    } else if (cardColor === 'bystander' || cardColor !== gameState.turn) {
        switchTurn(gameState); // Wrong guess ends the turn.
    } else { // Correct guess
        if (gameState.guessesLeft === 0) {
            switchTurn(gameState); // Ran out of guesses, end the turn.
        }
    }
    
    clearAllVotes(gameState);
    io.to(gameCode).emit('cardRevealed', gameState);
}

io.on('connection', (socket) => {
    // All other socket event handlers remain exactly the same.
    socket.on('hostGame', (nickname) => { const gameCode = generateGameCode(); socket.join(gameCode); gameRooms[gameCode] = { hostId: socket.id, players: [{ id: socket.id, nickname: nickname, role: null }], gameState: createNewGameState() }; socket.emit('gameCreated', { gameCode, room: gameRooms[gameCode] }); });
    socket.on('joinGame', ({ nickname, gameCode }) => { const room = gameRooms[gameCode]; if (!room) { return socket.emit('gameError', 'Game not found.'); } socket.join(gameCode); room.players.push({ id: socket.id, nickname: nickname, role: null }); socket.emit('joinSuccess', { gameCode, room }); io.to(gameCode).emit('playerListUpdate', room.players); });
    socket.on('selectRole', ({ role, gameCode }) => { const room = gameRooms[gameCode]; if (!room) return; const player = room.players.find(p => p.id === socket.id); if (player) { const e = room.players.find(p => p.role === role); if (role.includes('spymaster') && e) { return socket.emit('gameError', 'This Spymaster role is already taken.'); } player.role = role; io.to(gameCode).emit('playerListUpdate', room.players); } });
    socket.on('startGame', ({ gameCode, startingTeam }) => { const room = gameRooms[gameCode]; if (room && room.hostId === socket.id) { const p = room.players; const rS = p.some(x=>x.role==='red-spymaster'), rO = p.some(x=>x.role==='red-operative'), bS = p.some(x=>x.role==='blue-spymaster'), bO = p.some(x=>x.role==='blue-operative'); if (!rS||!rO||!bS||!bO) { return socket.emit('gameError', 'Both teams need at least one Spymaster and one Operative.'); } setupNewGame(gameCode, startingTeam); io.to(gameCode).emit('gameStarted', room.gameState); } });
    socket.on('submitClue', ({ clue, gameCode }) => { const room = gameRooms[gameCode]; if (!room) return; const player = room.players.find(p => p.id === socket.id); const { gameState } = room; if (player && player.role === `${gameState.turn}-spymaster`) { const cardsLeft = gameState.board.filter((c, i) => gameState.keycard[i] === gameState.turn && !c.revealed).length; if (clue.number > cardsLeft || clue.number < 1) return; gameState.clue = clue; gameState.guessesAllowed = clue.number; gameState.guessesLeft = clue.number; io.to(gameCode).emit('clueSubmitted', gameState); } });
    socket.on('voteForCard', ({ cardIndex, gameCode }) => { const room = gameRooms[gameCode]; if (!room) return; const player = room.players.find(p => p.id === socket.id); const { gameState } = room; const card = gameState.board[cardIndex]; const canVote = player && player.role.includes('operative') && gameState.turn.startsWith(player.role.split('-')[0]) && !card.revealed && gameState.clue.word; if (!canVote) return; const voteIndex = card.votes.indexOf(player.id); if (voteIndex > -1) card.votes.splice(voteIndex, 1); else card.votes.push(player.id); const operatives = room.players.filter(p => p.role === `${gameState.turn}-operative`); const totalOperatives = operatives.length > 0 ? operatives.length : 1; if (card.votes.length >= totalOperatives) { revealCard(room, cardIndex, gameCode); } else { io.to(gameCode).emit('voteUpdate', gameState); } });
    socket.on('endTurn', ({ gameCode }) => { const room = gameRooms[gameCode]; if (!room) return; const player = room.players.find(p => p.id === socket.id); if (player && player.role.includes('operative') && room.gameState.turn.startsWith(player.role.split('-')[0])) { switchTurn(room.gameState); io.to(gameCode).emit('turnEnded', room.gameState); } });
    socket.on('disconnect', () => { for (const gameCode in gameRooms) { const room = gameRooms[gameCode]; const pIndex = room.players.findIndex(p => p.id === socket.id); if (pIndex > -1) { room.players.splice(pIndex, 1); if (room.players.length === 0) { delete gameRooms[gameCode]; } else { if (room.hostId === socket.id) { room.hostId = room.players[0].id; io.to(gameCode).emit('hostUpdate', room.hostId); } io.to(gameCode).emit('playerListUpdate', room.players); } break; } } });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));