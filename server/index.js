import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();
const { Pool } = pkg;

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Store active lobbies and players
const lobbies = new Map();
const players = new Map();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    console.log('Current lobbies:', Array.from(lobbies.keys()));

    socket.on('createLobby', (data) => {
        const { playerName, lobbyId, playerId } = data;
        const player = {
            id: playerId || socket.id,
            name: playerName,
            score: 0,
            isHost: true,
            number: 1
        };

        lobbies.set(lobbyId, {
            id: lobbyId,
            players: [player],
            gameState: null
        });

        players.set(socket.id, { lobbyId, player });
        socket.join(lobbyId);
        socket.emit('lobbyJoined', { lobbyId, players: [player] });
        console.log(`Lobby ${lobbyId} created by ${playerName} (${player.id})`);
    });

    socket.on('joinLobby', (data) => {
        const { lobbyId, playerName, playerId } = data;
        console.log(`Attempting to join lobby ${lobbyId} by ${playerName}`);
        console.log('Available lobbies:', Array.from(lobbies.keys()));

        const lobby = lobbies.get(lobbyId);

        if (!lobby) {
            socket.emit('error', { message: 'Lobby not found' });
            console.log(`Failed to join lobby ${lobbyId} - lobby not found`);
            return;
        }

        const player = {
            id: playerId || socket.id,
            name: playerName,
            score: 0,
            isHost: false,
            number: lobby.players.length + 1
        };

        lobby.players.push(player);
        players.set(socket.id, { lobbyId, player });
        socket.join(lobbyId);

        // Notify all players in the lobby
        io.to(lobbyId).emit('playerJoined', { players: lobby.players });
        console.log(`${playerName} (${player.id}) joined lobby ${lobbyId}`);
    });

    socket.on('startGame', (data) => {
        const playerData = players.get(socket.id);
        if (!playerData) return;

        const lobby = lobbies.get(playerData.lobbyId);
        if (!lobby) return;

        const player = lobby.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) return;

        lobby.gameState = {
            grid: data.grid,
            gridSize: data.gridSize,
            difficulty: data.difficulty,
            gameDuration: data.gameDuration,
            isActive: true,
            timeLeft: data.gameDuration
        };

        io.to(playerData.lobbyId).emit('gameStarted', lobby.gameState);
        console.log(`Game started in lobby ${playerData.lobbyId}`);
    });

    socket.on('submitWord', (data) => {
        const playerData = players.get(socket.id);
        if (!playerData) return;

        const lobby = lobbies.get(playerData.lobbyId);
        if (!lobby) return;

        const player = lobby.players.find(p => p.id === socket.id);
        if (!player) return;

        player.score += data.score;
        io.to(playerData.lobbyId).emit('wordSubmitted', {
            playerId: socket.id,
            word: data.word,
            score: data.score,
            players: lobby.players
        });
    });

    socket.on('disconnect', () => {
        const playerData = players.get(socket.id);
        if (playerData) {
            const lobby = lobbies.get(playerData.lobbyId);
            if (lobby) {
                lobby.players = lobby.players.filter(p => p.id !== socket.id);

                // If host left, assign new host
                if (lobby.players.length > 0 && !lobby.players.some(p => p.isHost)) {
                    lobby.players[0].isHost = true;
                }

                if (lobby.players.length === 0) {
                    lobbies.delete(playerData.lobbyId);
                } else {
                    io.to(playerData.lobbyId).emit('playerLeft', { players: lobby.players });
                }
            }
            players.delete(socket.id);
        }
        console.log('Player disconnected:', socket.id);
    });
});

app.get("/", async (req, res) => {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0].now });
});

server.listen(5000, () => console.log("🚀 Server running on port 5000"));
