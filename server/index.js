import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import Joi from 'joi';

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

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting - more lenient for development
const isDevelopment = process.env.NODE_ENV === 'development';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 100, // More lenient in development
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limits for auth endpoints - more lenient in development
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 20 : 5, // More lenient in development
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
});

// Slow down repeated requests
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per 15 minutes, then...
    delayMs: 500 // begin adding 500ms of delay per request above 50
});

app.use(limiter);
app.use(speedLimiter);

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
            [hashToken(token)]
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

// Helper function to create consistent token hashes
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

// Validation schemas
const registerSchema = Joi.object({
    username: Joi.string()
        .alphanum()
        .min(3)
        .max(30)
        .required()
        .messages({
            'string.alphanum': 'Username must contain only letters and numbers',
            'string.min': 'Username must be at least 3 characters',
            'string.max': 'Username cannot exceed 30 characters'
        }),
    email: Joi.string()
        .email()
        .max(100)
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'string.max': 'Email cannot exceed 100 characters'
        }),
    password: Joi.string()
        .min(8)
        .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])'))
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
        })
});

const loginSchema = Joi.object({
    username: Joi.string()
        .alphanum()
        .min(3)
        .max(30)
        .required(),
    password: Joi.string()
        .min(6)
        .required()
});

const updateStatsSchema = Joi.object({
    gameScore: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .required()
        .messages({
            'number.min': 'Game score cannot be negative',
            'number.max': 'Game score cannot exceed 10000'
        })
});

// Security helper functions
const logSecurityEvent = async (eventType, eventDescription, userId = null, ipAddress = null, userAgent = null, additionalData = null) => {
    try {
        await pool.query(
            'INSERT INTO security_audit_log (user_id, event_type, event_description, ip_address, user_agent, additional_data) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, eventType, eventDescription, ipAddress, userAgent, additionalData]
        );
    } catch (error) {
        console.error('Failed to log security event:', error);
    }
};

const checkLoginAttempts = async (ip, username) => {
    const recentAttempts = await pool.query(
        `SELECT COUNT(*) as count FROM login_attempts 
         WHERE ip_address = $1 AND attempted_at > NOW() - INTERVAL '15 minutes'`,
        [ip]
    );

    const failedAttempts = await pool.query(
        `SELECT COUNT(*) as count FROM login_attempts 
         WHERE ip_address = $1 AND success = false AND attempted_at > NOW() - INTERVAL '15 minutes'`,
        [ip]
    );

    if (failedAttempts.rows[0].count >= 5) {
        throw new Error('Too many failed login attempts. Please try again in 15 minutes.');
    }
};

const recordLoginAttempt = async (ip, username, success, userAgent = null) => {
    try {
        await pool.query(
            'INSERT INTO login_attempts (ip_address, username, success, user_agent) VALUES ($1, $2, $3, $4)',
            [ip, username, success, userAgent]
        );
    } catch (error) {
        console.error('Failed to record login attempt:', error);
    }
};

const checkAccountLockout = async (userId) => {
    const user = await pool.query(
        'SELECT locked_until, failed_login_attempts FROM users WHERE id = $1',
        [userId]
    );

    if (user.rows.length === 0) return false;

    const userData = user.rows[0];
    if (userData.locked_until && new Date() < userData.locked_until) {
        return true; // Account is locked
    }

    return false;
};

const lockAccount = async (userId, lockoutMinutes = 15) => {
    const lockoutUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    await pool.query(
        'UPDATE users SET locked_until = $1, failed_login_attempts = failed_login_attempts + 1, last_failed_login = NOW() WHERE id = $2',
        [lockoutUntil, userId]
    );
};

const unlockAccount = async (userId) => {
    await pool.query(
        'UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = $1',
        [userId]
    );
};

// Store active lobbies and players
const lobbies = new Map();
const players = new Map();

// WebSocket rate limiting
const wsRateLimit = new Map();

const checkWSRateLimit = (socket, event) => {
    const key = `${socket.id}-${event}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 30; // 30 requests per minute per event

    if (!wsRateLimit.has(key)) {
        wsRateLimit.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }

    const limit = wsRateLimit.get(key);
    if (now > limit.resetTime) {
        wsRateLimit.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }

    if (limit.count >= maxRequests) {
        return false;
    }

    limit.count++;
    return true;
};

// WebSocket authentication middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        // Check if session is still valid
        const sessionResult = await pool.query(
            'SELECT * FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW() AND is_active = true',
            [hashToken(token)]
        );

        if (sessionResult.rows.length === 0) {
            return next(new Error('Invalid or expired token'));
        }

        socket.userId = decoded.userId;
        socket.username = decoded.username;
        next();
    } catch (err) {
        next(new Error('Authentication error'));
    }
});

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    console.log('Current lobbies:', Array.from(lobbies.keys()));

    socket.on('createLobby', (data) => {
        if (!checkWSRateLimit(socket, 'createLobby')) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
        }

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
        if (!checkWSRateLimit(socket, 'joinLobby')) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
        }

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
        if (!checkWSRateLimit(socket, 'startGame')) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
        }

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

        // Send only the necessary game data to avoid circular references
        const gameData = {
            grid: lobby.gameState.grid,
            gridSize: lobby.gameState.gridSize,
            difficulty: lobby.gameState.difficulty,
            gameDuration: lobby.gameState.gameDuration,
            isActive: lobby.gameState.isActive,
            timeLeft: lobby.gameState.timeLeft
        };

        io.to(playerData.lobbyId).emit('gameStarted', gameData);
        console.log(`Game started in lobby ${playerData.lobbyId}`);
    });

    socket.on('submitWord', (data) => {
        if (!checkWSRateLimit(socket, 'submitWord')) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
        }

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
app.post("/auth/register", authLimiter, async (req, res) => {
    try {
        // Validate input
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            await logSecurityEvent('VALIDATION_ERROR', `Registration validation failed: ${error.details[0].message}`, null, req.ip, req.get('User-Agent'), { username: req.body.username });
            return res.status(400).json({ error: error.details[0].message });
        }

        const { username, email, password } = value;

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            await logSecurityEvent('REGISTRATION_FAILED', 'Username or email already exists', null, req.ip, req.get('User-Agent'), { username, email });
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

        // Generate JWT token with shorter expiration
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' } // Reduced from 7 days to 24 hours
        );

        // Store session
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await pool.query(
            'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, hashToken(token), expiresAt]
        );

        // Log successful registration
        await logSecurityEvent('REGISTRATION_SUCCESS', 'User registered successfully', user.id, req.ip, req.get('User-Agent'), { username, email });

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
        await logSecurityEvent('REGISTRATION_ERROR', `Registration failed: ${error.message}`, null, req.ip, req.get('User-Agent'), { username: req.body.username });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post("/auth/login", authLimiter, async (req, res) => {
    try {
        // Validate input
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            await logSecurityEvent('VALIDATION_ERROR', `Login validation failed: ${error.details[0].message}`, null, req.ip, req.get('User-Agent'), { username: req.body.username });
            return res.status(400).json({ error: error.details[0].message });
        }

        const { username, password } = value;

        // Check rate limiting for this IP
        try {
            await checkLoginAttempts(req.ip, username);
        } catch (rateLimitError) {
            await logSecurityEvent('RATE_LIMIT_EXCEEDED', 'Too many login attempts from IP', null, req.ip, req.get('User-Agent'), { username });
            return res.status(429).json({ error: rateLimitError.message });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND is_active = true',
            [username]
        );

        if (result.rows.length === 0) {
            await recordLoginAttempt(req.ip, username, false, req.get('User-Agent'));
            await logSecurityEvent('LOGIN_FAILED', 'User not found', null, req.ip, req.get('User-Agent'), { username });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check if account is locked
        if (await checkAccountLockout(user.id)) {
            await logSecurityEvent('LOGIN_FAILED', 'Account is locked', user.id, req.ip, req.get('User-Agent'), { username });
            return res.status(423).json({ error: 'Account is temporarily locked due to multiple failed login attempts' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            await recordLoginAttempt(req.ip, username, false, req.get('User-Agent'));
            await lockAccount(user.id);
            await logSecurityEvent('LOGIN_FAILED', 'Invalid password', user.id, req.ip, req.get('User-Agent'), { username });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Successful login - unlock account and record attempt
        await unlockAccount(user.id);
        await recordLoginAttempt(req.ip, username, true, req.get('User-Agent'));

        // Generate JWT token with shorter expiration
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' } // Reduced from 7 days to 24 hours
        );

        // Store session
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await pool.query(
            'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, hashToken(token), expiresAt]
        );

        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        // Log successful login
        await logSecurityEvent('LOGIN_SUCCESS', 'User logged in successfully', user.id, req.ip, req.get('User-Agent'), { username });

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
        await logSecurityEvent('LOGIN_ERROR', `Login failed: ${error.message}`, null, req.ip, req.get('User-Agent'), { username: req.body.username });
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
            [hashToken(token)]
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
        // Validate input
        const { error, value } = updateStatsSchema.validate(req.body);
        if (error) {
            await logSecurityEvent('VALIDATION_ERROR', `Stats update validation failed: ${error.details[0].message}`, req.user.userId, req.ip, req.get('User-Agent'), { gameScore: req.body.gameScore });
            return res.status(400).json({ error: error.details[0].message });
        }

        const { gameScore } = value;

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

// Development endpoint to clear rate limiting (only in development)
if (isDevelopment) {
    app.post("/dev/clear-rate-limits", (req, res) => {
        // Clear rate limiting memory stores
        limiter.resetKey(req.ip);
        authLimiter.resetKey(req.ip);
        speedLimiter.resetKey(req.ip);

        res.json({
            message: 'Rate limits cleared for this IP',
            ip: req.ip,
            environment: 'development'
        });
    });
}

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
