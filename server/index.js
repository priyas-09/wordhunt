import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

// JWT secret (MUST be set in environment variables for production)
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is required!');
    console.error('Please set JWT_SECRET in your .env file');
    process.exit(1);
}

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check if session is still valid
        const sessionResult = await pool.query(
            'SELECT * FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW() AND is_active = true',
            [bcrypt.hashSync(token, 10)]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

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
        console.log('startGame event received from socket:', socket.id);
        const playerData = players.get(socket.id);
        console.log('Player data:', playerData);
        if (!playerData) {
            console.log('No player data found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get(playerData.lobbyId);
        console.log('Lobby found:', lobby ? 'yes' : 'no');
        if (!lobby) return;

        const player = lobby.players.find(p => p.id === playerData.player.id);
        console.log('Player found:', player ? 'yes' : 'no', 'Is host:', player?.isHost);
        if (!player || !player.isHost) {
            console.log('Player is not host or not found');
            return;
        }

        lobby.gameState = {
            grid: data.grid,
            gridSize: data.gridSize,
            difficulty: data.difficulty,
            gameDuration: data.gameDuration,
            isActive: true,
            timeLeft: data.gameDuration
        };

        console.log(`Broadcasting game start to lobby ${playerData.lobbyId} with ${lobby.players.length} players`);
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

// Authentication endpoints
app.post("/auth/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
            [username, email, passwordHash]
        );

        const user = result.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Store session
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await pool.query(
            'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, bcrypt.hashSync(token, 10), expiresAt]
        );

        res.json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post("/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND is_active = true',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Store session
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await pool.query(
            'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, bcrypt.hashSync(token, 10), expiresAt]
        );

        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                totalGamesPlayed: user.total_games_played,
                totalScore: user.total_score,
                bestScore: user.best_score,
                lastLogin: user.last_login
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post("/auth/logout", authenticateToken, async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        // Deactivate session
        await pool.query(
            'UPDATE user_sessions SET is_active = false WHERE token_hash = $1',
            [bcrypt.hashSync(token, 10)]
        );

        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get("/auth/me", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, total_games_played, total_score, best_score, last_login, created_at FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                totalGamesPlayed: user.total_games_played,
                totalScore: user.total_score,
                bestScore: user.best_score,
                lastLogin: user.last_login,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post("/auth/update-stats", authenticateToken, async (req, res) => {
    try {
        const { gameScore } = req.body;

        if (typeof gameScore !== 'number' || gameScore < 0) {
            return res.status(400).json({ error: 'Invalid game score' });
        }

        // Get current user stats
        const currentUser = await pool.query(
            'SELECT total_games_played, total_score, best_score FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (currentUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const current = currentUser.rows[0];
        const newTotalGames = current.total_games_played + 1;
        const newTotalScore = current.total_score + gameScore;
        const newBestScore = Math.max(current.best_score, gameScore);

        // Update user stats
        await pool.query(
            'UPDATE users SET total_games_played = $1, total_score = $2, best_score = $3, updated_at = NOW() WHERE id = $4',
            [newTotalGames, newTotalScore, newBestScore, req.user.userId]
        );

        res.json({
            message: 'Stats updated successfully',
            stats: {
                totalGamesPlayed: newTotalGames,
                totalScore: newTotalScore,
                bestScore: newBestScore,
                gameScore: gameScore
            }
        });
    } catch (error) {
        console.error('Update stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get("/", async (req, res) => {
    const result = await pool.query("SELECT NOW()");
    res.json({ time: result.rows[0].now });
});

// Word validation endpoint
app.get("/validate-word/:word", async (req, res) => {
    const word = req.params.word.toLowerCase();

    // Basic validation - 3+ letters, only alphabetic characters
    if (word.length < 3 || !/^[a-z]+$/.test(word)) {
        return res.json({ valid: false, reason: 'Invalid format' });
    }

    try {
        // Try the external API
        const response = await fetch(`https://api.dictionaryapi.dev/api/v1/entries/en/${word}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'WordHuntGame/1.0'
            },
            timeout: 5000
        });

        if (response.ok) {
            return res.json({ valid: true, source: 'dictionary-api' });
        } else {
            return res.json({ valid: false, reason: 'API returned error', status: response.status });
        }
    } catch (error) {
        console.error('Word validation error:', error);
        return res.json({ valid: false, reason: 'API error', error: error.message });
    }
});

server.listen(5000, () => console.log("🚀 Server running on port 5000"));
