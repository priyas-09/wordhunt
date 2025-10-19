# WordHunt

A real-time multiplayer word-finding game built with React, Node.js, and PostgreSQL. Players compete to find as many valid words as possible within a time limit using letters from a randomly generated grid.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Development](#development)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Features

### Core Gameplay
- Real-time multiplayer word-finding gameplay
- Configurable game duration and grid sizes
- Word validation using dictionary API
- Score tracking and leaderboards
- Host management with automatic host transfer

### User Management
- User registration and authentication
- JWT-based secure sessions
- User profile management with game statistics
- Persistent score tracking (total games, total score, best score)

### Technical Features
- Responsive design with Tailwind CSS
- Docker containerization for easy deployment
- WebSocket-based real-time communication
- PostgreSQL database with migrations
- RESTful API endpoints

## Tech Stack

### Frontend
- **React 18** - Component-based UI framework
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Socket.IO Client** - Real-time communication

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **Socket.IO** - Real-time bidirectional communication
- **PostgreSQL** - Relational database
- **JWT** - JSON Web Tokens for authentication
- **bcryptjs** - Password hashing

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **PostCSS** - CSS processing

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │    │  Express Server │    │   PostgreSQL    │
│                 │    │                 │    │                 │
│ - Game UI       │◄──►│ - REST API      │◄──►│ - User Data     │
│ - Auth Context  │    │ - WebSocket     │    │ - Game Stats    │
│ - Socket Client │    │ - JWT Auth      │    │ - Sessions      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Component Structure
```
client/src/
├── App.js                 # Main application component
├── AuthContext.js         # Authentication state management
├── Login.js              # Login/register modal
├── UserProfile.js        # User profile and stats
├── WordHuntGame.js       # Core game logic and UI
└── App.css              # Custom Tailwind components

server/
├── index.js              # Main server file
├── migrations/           # Database migrations
└── run-migrations.js     # Migration runner
```

## Prerequisites

- Docker and Docker Compose
- Git
- Modern web browser

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wordhunt
   ```

2. **Set up environment variables**
   ```bash
   cp env.example .env
   ```

3. **Configure your environment**
   Edit the `.env` file with your settings:
   ```env
   DATABASE_URL=postgresql://postgres:password@db:5432/wordhunt
   JWT_SECRET=your-secure-jwt-secret-here
   NODE_ENV=development
   ```

4. **Start the application**
   ```bash
   docker-compose up --build
   ```

5. **Run database migrations**
   ```bash
   docker-compose exec server node run-migrations.js
   ```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:port/db` |
| `JWT_SECRET` | Secret key for JWT tokens | `your-secure-secret-key` |
| `NODE_ENV` | Application environment | `development` or `production` |

### Game Settings

The game supports various configuration options:

- **Grid Size**: 4x4, 5x5, 6x6 (configurable in game settings)
- **Game Duration**: 60-300 seconds (default: 120 seconds)
- **Difficulty**: Easy/Hard (affects letter distribution)

## Usage

### Starting the Game

1. **Access the application**: http://localhost:3000
2. **Create an account** or **login** with existing credentials
3. **Create a lobby** or **join an existing lobby** using the lobby code
4. **Start the game** (host only) when all players are ready
5. **Find words** by selecting adjacent letters on the grid
6. **Submit words** for validation and scoring

### Game Rules

- Words must be at least 3 letters long
- Letters must be adjacent (horizontally, vertically, or diagonally)
- Each letter can only be used once per word
- Words are validated against a dictionary API
- Scoring is based on word length and complexity

### Multiplayer Features

- **Lobby System**: Create or join game lobbies with unique codes
- **Host Management**: First player becomes host, automatic host transfer
- **Real-time Updates**: Live score updates and game state synchronization
- **Player Management**: Players can join/leave lobbies dynamically

## API Documentation

### Authentication Endpoints

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "jwt-token",
  "user": {
    "id": 1,
    "username": "string",
    "email": "string",
    "createdAt": "timestamp"
  }
}
```

#### POST /auth/login
Authenticate user and return JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

#### POST /auth/logout
Invalidate user session.

**Headers:** `Authorization: Bearer <token>`

#### GET /auth/me
Get current user profile and statistics.

**Headers:** `Authorization: Bearer <token>`

#### POST /auth/update-stats
Update user game statistics after game completion.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "gameScore": 150
}
```

### Game Endpoints

#### GET /validate-word/:word
Validate if a word exists in the dictionary.

**Response:**
```json
{
  "valid": true,
  "source": "dictionary-api"
}
```

### WebSocket Events

#### Client to Server
- `createLobby` - Create a new game lobby
- `joinLobby` - Join an existing lobby
- `leaveLobby` - Leave current lobby
- `startGame` - Start the game (host only)
- `submitWord` - Submit a word for validation

#### Server to Client
- `lobbyJoined` - Confirmation of lobby join
- `playerJoined` - New player joined lobby
- `playerLeft` - Player left lobby
- `gameStarted` - Game has started
- `wordSubmitted` - Word submission result
- `error` - Error message

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    total_games_played INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);
```

### User Sessions Table
```sql
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);
```

## Authentication

The application uses JWT (JSON Web Tokens) for authentication with the following security features:

### Security Measures
- **Password Hashing**: bcrypt with salt rounds
- **JWT Tokens**: 7-day expiration with secure secret
- **Session Management**: Database-tracked sessions
- **Token Validation**: Server-side token verification
- **CORS Protection**: Configured for specific origins

### Authentication Flow
1. User registers/logs in with credentials
2. Server validates credentials and generates JWT
3. JWT is stored in localStorage and sent with requests
4. Server validates JWT on protected endpoints
5. Session is tracked in database for security

## Development

### Project Structure
```
wordhunt/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   └── styles/         # CSS and styling
│   ├── public/            # Static assets
│   └── Dockerfile         # Frontend container
├── server/                # Node.js backend
│   ├── migrations/        # Database migrations
│   ├── index.js          # Main server file
│   └── Dockerfile        # Backend container
├── docker-compose.yml    # Container orchestration
├── .env                  # Environment variables (not in git)
└── .gitignore           # Git ignore rules
```

### Development Commands

```bash
# Start development environment
docker-compose up --build

# View logs
docker-compose logs -f

# Run database migrations
docker-compose exec server node run-migrations.js

# Access database
docker-compose exec db psql -U postgres -d wordhunt

# Rebuild specific service
docker-compose up --build server
```

### Code Style
- **Frontend**: Functional components with hooks
- **Backend**: Express.js with async/await
- **Database**: PostgreSQL with prepared statements
- **Styling**: Tailwind CSS utility classes

## Security

### Environment Security
- Environment variables are not committed to git
- JWT secrets are generated securely
- Database credentials are configurable
- CORS is properly configured

### Application Security
- Passwords are hashed with bcrypt
- JWT tokens have expiration dates
- SQL injection protection with parameterized queries
- Input validation on all endpoints
- Rate limiting on API endpoints

### Deployment Security
- Docker containers run as non-root users
- Secrets are managed through environment variables
- Database connections use SSL in production
- Regular security updates for dependencies

## Troubleshooting

### Common Issues

#### Server won't start
- Check if JWT_SECRET is set in environment variables
- Verify database connection string
- Ensure ports 3000 and 9091 are available

#### Database connection errors
- Verify PostgreSQL container is running
- Check DATABASE_URL format
- Run migrations: `docker-compose exec server node run-migrations.js`

#### Authentication issues
- Clear browser localStorage
- Check JWT token expiration
- Verify user account is active

#### Game not starting
- Ensure word validation API is accessible
- Check WebSocket connection status
- Verify all players are connected

### Debug Commands

```bash
# Check container status
docker-compose ps

# View server logs
docker-compose logs server

# View database logs
docker-compose logs db

# Access server container
docker-compose exec server sh

# Check environment variables
docker-compose exec server env
```

### Performance Optimization

- **Database Indexing**: Indexes on frequently queried columns
- **Connection Pooling**: PostgreSQL connection pooling
- **Caching**: Word validation caching to reduce API calls
- **Compression**: Gzip compression for API responses