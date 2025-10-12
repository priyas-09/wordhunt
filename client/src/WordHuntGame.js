import React, { useState, useEffect, useRef } from 'react';
import { Users, Crown, Play, LogOut, Plus, Settings, Search } from 'lucide-react';
import { io } from 'socket.io-client';
import './App.css';

// Word validation cache to avoid repeated API calls
const wordCache = {};
const validationQueue = new Set(); // Track ongoing validations to prevent duplicates

const useWebSocket = (lobbyId, playerId, players, setPlayers) => {
    const [gameState, setGameState] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);

    useEffect(() => {
        // Connect to the real WebSocket server immediately
        const socket = io('http://localhost:9091');
        ws.current = socket;

        socket.on('connect', () => {
            console.log('Connected to server:', socket.id);
            setIsConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            setIsConnected(false);
        });

        socket.on('lobbyJoined', (data) => {
            console.log('Lobby joined:', data);
            setPlayers(data.players);
        });

        socket.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            setPlayers(data.players);
        });

        socket.on('playerLeft', (data) => {
            console.log('Player left:', data);
            setPlayers(data.players);
        });

        socket.on('gameStarted', (data) => {
            console.log('Game started:', data);
            setGameState(data);
        });

        socket.on('wordSubmitted', (data) => {
            console.log('Word submitted:', data);
            setPlayers(data.players);
        });

        socket.on('error', (data) => {
            console.error('Socket error:', data.message);
            // Show error popup
            const errorMessage = document.createElement('div');
            errorMessage.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up';
            errorMessage.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-2xl">⚠️</span>
                    <div>
                        <div class="font-bold">Connection Error</div>
                        <div class="text-sm opacity-90">${data.message}</div>
                    </div>
                </div>
            `;
            document.body.appendChild(errorMessage);

            setTimeout(() => {
                errorMessage.remove();
            }, 5000);
        });

        return () => socket.disconnect();
    }, []); // Remove lobbyId and playerId dependencies

    const sendMessage = (type, data) => {
        if (ws.current && isConnected) {
            console.log(`Sending ${type}:`, data);
            ws.current.emit(type, data);
        } else {
            console.error(`Cannot send ${type}: WebSocket not connected`);
        }
    };

    const updatePlayerScore = (playerId, scoreToAdd) => {
        setPlayers(prev =>
            prev.map(p =>
                p.id === playerId ? { ...p, score: p.score + scoreToAdd } : p
            )
        );
    };

    const resetPlayerScores = () => {
        setPlayers(prev => prev.map(p => ({ ...p, score: 0 })));
    };

    const addPlayer = (playerData) => {
        setPlayers(prev => {
            const newPlayer = {
                ...playerData,
                number: prev.length + 1
            };
            return [...prev, newPlayer];
        });
    };

    const removePlayer = (playerIdToRemove) => {
        setPlayers(prev => {
            const updated = prev.filter(p => p.id !== playerIdToRemove);
            // If the host left, assign a new host
            if (updated.length > 0 && !updated.some(p => p.isHost)) {
                updated[0].isHost = true;
            }
            return updated;
        });
    };

    const transferHost = (newHostId) => {
        setPlayers(prev => prev.map(p => ({
            ...p,
            isHost: p.id === newHostId
        })));
    };

    return { gameState, players, sendMessage, updatePlayerScore, resetPlayerScores, addPlayer, removePlayer, transferHost, ws: ws.current, isConnected };
};

const LETTER_WEIGHTS = {
    'E': 12, 'T': 9, 'A': 8, 'O': 8, 'I': 8, 'N': 7, 'S': 7, 'H': 6, 'R': 6,
    'D': 4, 'L': 4, 'C': 3, 'U': 3, 'M': 3, 'W': 3, 'F': 2, 'G': 2, 'Y': 2,
    'P': 2, 'B': 2, 'V': 1, 'K': 1, 'J': 1, 'X': 1, 'Q': 1, 'Z': 1
};

const generateWeightedLetter = () => {
    const letters = Object.keys(LETTER_WEIGHTS);
    const weights = Object.values(LETTER_WEIGHTS);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < letters.length; i++) {
        random -= weights[i];
        if (random <= 0) return letters[i];
    }
    return letters[0];
};

const generateGrid = (size) => {
    return Array(size).fill(null).map(() =>
        Array(size).fill(null).map(() => generateWeightedLetter())
    );
};

const WordHuntGame = () => {
    const [screen, setScreen] = useState('menu');
    const [lobbyId, setLobbyId] = useState(null);
    const [playerId] = useState(Math.random().toString(36).substr(2, 9));
    const [playerName, setPlayerName] = useState('');
    const [players, setPlayers] = useState([]);
    const [grid, setGrid] = useState([]);
    const [selectedCells, setSelectedCells] = useState([]);
    const [foundWords, setFoundWords] = useState([]);
    const [currentWord, setCurrentWord] = useState('');
    const [searchWord, setSearchWord] = useState('');
    const [timeLeft, setTimeLeft] = useState(120);
    const [isGameActive, setIsGameActive] = useState(false);
    const [validatingWord, setValidatingWord] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);
    const validationTimeoutRef = useRef(null);

    // Game settings
    const [gridSize, setGridSize] = useState(5);
    const [difficulty, setDifficulty] = useState('easy'); // easy or hard
    const [gameDuration, setGameDuration] = useState(120); // in seconds
    const [showSettings, setShowSettings] = useState(false);

    const { gameState, sendMessage, updatePlayerScore, resetPlayerScores, addPlayer, removePlayer, transferHost, ws, isConnected } = useWebSocket(lobbyId, playerId, players, setPlayers);
    const isHost = players.length > 0 ? (players.find(p => p.id === playerId)?.isHost || false) : false;

    console.log('Current state - screen:', screen, 'isHost:', isHost, 'players:', players);

    // Initialize players state
    useEffect(() => {
        if (players.length === 0) {
            setPlayers([{ id: playerId, name: 'You', score: 0, isHost: true, number: 1 }]);
        }
    }, [playerId]);

    // Handle game state from server
    useEffect(() => {
        if (gameState && gameState.isActive) {
            setGrid(gameState.grid);
            setTimeLeft(gameState.timeLeft);
            setIsGameActive(true);
            setGameEnded(false);
            setFoundWords([]);
            setSelectedCells([]);
            setCurrentWord('');
            setSearchWord('');
            setScreen('game');
        }
    }, [gameState]);

    useEffect(() => {
        if (isGameActive && timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else if (timeLeft === 0 && isGameActive) {
            setIsGameActive(false);
            setGameEnded(true);
        }
    }, [timeLeft, isGameActive]);

    const validateWord = async (word) => {
        const lowerWord = word.toLowerCase().trim();

        if (lowerWord.length < 3) {
            console.log('Word too short:', lowerWord);
            return false;
        }

        // Check cache first
        if (wordCache[lowerWord] !== undefined) {
            console.log('Found in cache:', lowerWord, wordCache[lowerWord]);
            return wordCache[lowerWord];
        }

        // Check if validation is already in progress
        if (validationQueue.has(lowerWord)) {
            console.log('Validation already in progress for:', lowerWord);
            // Wait for the existing validation to complete
            return new Promise((resolve) => {
                const checkCache = () => {
                    if (wordCache[lowerWord] !== undefined) {
                        resolve(wordCache[lowerWord]);
                    } else {
                        setTimeout(checkCache, 100);
                    }
                };
                checkCache();
            });
        }

        // Add to validation queue
        validationQueue.add(lowerWord);

        try {
            console.log('Fetching from API:', lowerWord);
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${lowerWord}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                // Add timeout to prevent hanging requests
                signal: AbortSignal.timeout(5000)
            });
            const isValid = response.ok;
            console.log('API response:', lowerWord, isValid);
            wordCache[lowerWord] = isValid;
            return isValid;
        } catch (error) {
            console.error('Error validating word:', error);
            // Cache failed requests as invalid to prevent repeated attempts
            wordCache[lowerWord] = false;
            return false;
        } finally {
            // Remove from validation queue
            validationQueue.delete(lowerWord);
        }
    };

    const createLobby = () => {
        if (!playerName.trim()) return;
        const newLobbyId = Math.random().toString(36).substr(2, 6).toUpperCase();
        console.log('Creating lobby with ID:', newLobbyId);
        setLobbyId(newLobbyId);

        // Wait for connection if not connected
        if (!isConnected) {
            console.log('Waiting for connection before creating lobby...');
            setTimeout(() => createLobby(), 1000);
            return;
        }

        sendMessage('createLobby', {
            playerName: playerName.trim(),
            lobbyId: newLobbyId,
            playerId: playerId
        });
        setScreen('lobby');
    };

    const joinLobby = (id) => {
        if (!playerName.trim() || !id.trim()) return;
        console.log('Attempting to join lobby with ID:', id);
        setLobbyId(id);

        // Wait for connection if not connected
        if (!isConnected) {
            console.log('Waiting for connection before joining lobby...');
            setTimeout(() => joinLobby(id), 1000);
            return;
        }

        sendMessage('joinLobby', {
            lobbyId: id,
            playerName: playerName.trim(),
            playerId: playerId
        });
        setScreen('lobby');
    };

    const startGame = () => {
        console.log('startGame called, isHost:', isHost, 'players.length:', players.length);

        if (!isHost) {
            console.log('Not host, cannot start');
            return;
        }

        if (players.length < 1) {
            console.log('Not enough players');
            return;
        }

        console.log('Generating grid with size:', gridSize);
        const newGrid = generateGrid(gridSize);
        console.log('Grid generated:', newGrid);

        setGrid(newGrid);
        setTimeLeft(gameDuration);
        setIsGameActive(true);
        setGameEnded(false);
        setFoundWords([]);
        setSelectedCells([]);
        setCurrentWord('');
        setSearchWord('');

        // Reset all player scores
        resetPlayerScores();

        console.log('Moving to game screen');
        sendMessage('startGame', {
            grid: newGrid,
            gridSize,
            difficulty,
            gameDuration
        });
        setScreen('game');
    };

    const leaveLobby = () => {
        sendMessage('leaveLobby', {});
        // If the current player is the host, transfer host to another player
        if (isHost && players.length > 1) {
            const otherPlayers = players.filter(p => p.id !== playerId);
            if (otherPlayers.length > 0) {
                transferHost(otherPlayers[0].id);
            }
        }
        setScreen('menu');
        setLobbyId(null);
        // Reset to initial state with just the current player
        setPlayers([{ id: playerId, name: 'You', score: 0, isHost: true, number: 1 }]);
    };

    const isCellAdjacent = (cell1, cell2) => {
        const rowDiff = Math.abs(cell1.row - cell2.row);
        const colDiff = Math.abs(cell1.col - cell2.col);
        return rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0);
    };

    const handleCellClick = (row, col) => {
        if (!isGameActive || gameEnded) return;

        const isSelected = selectedCells.some(c => c.row === row && c.col === col);

        if (isSelected) {
            if (selectedCells[selectedCells.length - 1].row === row &&
                selectedCells[selectedCells.length - 1].col === col) {
                const newSelected = selectedCells.slice(0, -1);
                setSelectedCells(newSelected);
                setCurrentWord(newSelected.map(c => grid[c.row][c.col]).join(''));
            }
            return;
        }

        // Easy mode: can pick any letter
        // Hard mode: must be adjacent
        if (difficulty === 'easy' || selectedCells.length === 0 ||
            isCellAdjacent(selectedCells[selectedCells.length - 1], { row, col })) {
            const newSelected = [...selectedCells, { row, col }];
            setSelectedCells(newSelected);
            setCurrentWord(newSelected.map(c => grid[c.row][c.col]).join(''));
        }
    };

    const submitWord = async (word = currentWord) => {
        console.log('submitWord called with:', word);

        if (!word || word.length < 3) {
            console.log('Word too short or empty');
            return;
        }

        if (validatingWord) {
            console.log('Already validating a word');
            return;
        }

        if (!isGameActive || gameEnded) {
            console.log('Game is not active or has ended');
            return;
        }

        // Clear any pending validation timeout
        if (validationTimeoutRef.current) {
            clearTimeout(validationTimeoutRef.current);
        }

        const upperWord = word.toUpperCase().trim();

        // Check if already found
        if (foundWords.some(w => w.word === upperWord)) {
            // Enhanced duplicate word feedback
            const duplicateMessage = document.createElement('div');
            duplicateMessage.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up';
            duplicateMessage.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-2xl">⚠️</span>
                    <div>
                        <div class="font-bold">"${upperWord}" already found!</div>
                        <div class="text-sm opacity-90">Try a different word</div>
                    </div>
                </div>
            `;
            document.body.appendChild(duplicateMessage);

            // Remove after 3 seconds
            setTimeout(() => {
                duplicateMessage.remove();
            }, 3000);

            setSelectedCells([]);
            setCurrentWord('');
            return;
        }

        console.log('Starting validation for:', upperWord);
        setValidatingWord(true);

        try {
            const isValid = await validateWord(word);
            console.log('Validation result:', isValid);

            if (isValid) {
                const score = word.length * 10;
                const newWord = { word: upperWord, score };
                console.log('Adding word:', newWord);

                setFoundWords(prev => {
                    console.log('Previous foundWords:', prev);
                    const updated = [...prev, newWord];
                    console.log('Updated foundWords:', updated);
                    return updated;
                });

                // Update player score
                updatePlayerScore(playerId, score);

                sendMessage('submitWord', { word: upperWord, score });

                // Enhanced success feedback
                const successMessage = document.createElement('div');
                successMessage.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up';
                successMessage.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">✓</span>
                        <div>
                            <div class="font-bold">"${upperWord}" added!</div>
                            <div class="text-sm opacity-90">+${score} points</div>
                        </div>
                    </div>
                `;
                document.body.appendChild(successMessage);

                // Remove after 3 seconds
                setTimeout(() => {
                    successMessage.remove();
                }, 3000);
            } else {
                // Enhanced error feedback
                const errorMessage = document.createElement('div');
                errorMessage.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up';
                errorMessage.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">✗</span>
                        <div>
                            <div class="font-bold">"${upperWord}" is not valid!</div>
                            <div class="text-sm opacity-90">Try a different word</div>
                        </div>
                    </div>
                `;
                document.body.appendChild(errorMessage);

                // Remove after 3 seconds
                setTimeout(() => {
                    errorMessage.remove();
                }, 3000);
            }
        } catch (error) {
            console.error('Error in submitWord:', error);
            // Enhanced error feedback
            const errorMessage = document.createElement('div');
            errorMessage.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up';
            errorMessage.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-2xl">⚠️</span>
                    <div>
                        <div class="font-bold">Error validating word</div>
                        <div class="text-sm opacity-90">Please try again</div>
                    </div>
                </div>
            `;
            document.body.appendChild(errorMessage);

            // Remove after 3 seconds
            setTimeout(() => {
                errorMessage.remove();
            }, 3000);
        } finally {
            setValidatingWord(false);
            setSelectedCells([]);
            setCurrentWord('');
        }
    };

    const submitSearchWord = async () => {
        if (!searchWord.trim() || validatingWord || !isGameActive || gameEnded) return;

        const upperWord = searchWord.toUpperCase();
        const gridLetters = grid.flat().join('');

        // Check if all letters in the word exist in the grid
        const wordLetters = upperWord.split('');
        const gridLettersCopy = gridLetters.split('');

        for (let letter of wordLetters) {
            const idx = gridLettersCopy.indexOf(letter);
            if (idx === -1) {
                // Enhanced error feedback for missing letters
                const errorMessage = document.createElement('div');
                errorMessage.className = 'fixed top-4 right-4 bg-orange-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 animate-slide-up';
                errorMessage.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🔤</span>
                        <div>
                            <div class="font-bold">Missing letter "${letter}"</div>
                            <div class="text-sm opacity-90">Cannot form "${upperWord}"</div>
                        </div>
                    </div>
                `;
                document.body.appendChild(errorMessage);

                // Remove after 3 seconds
                setTimeout(() => {
                    errorMessage.remove();
                }, 3000);
                return;
            }
            gridLettersCopy.splice(idx, 1);
        }

        await submitWord(upperWord);
        setSearchWord('');
    };

    const clearSelection = () => {
        setSelectedCells([]);
        setCurrentWord('');
    };

    if (screen === 'menu') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-blue-600 flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                }}></div>

                <div className="game-container w-full max-w-md relative z-10 animate-game-start">
                    <div className="text-center mb-8">
                        <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                            Word Hunt
                        </h1>
                        <p className="text-gray-600 text-lg">Multiplayer Word Game</p>
                        <div className="flex justify-center mt-4">
                            <div className="flex space-x-1">
                                {['🎯', '📝', '🏆', '⚡'].map((emoji, i) => (
                                    <span key={i} className="text-2xl animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}>
                                        {emoji}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Enter your name"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            className="input-default text-center text-lg"
                        />

                        <button
                            onClick={createLobby}
                            disabled={!playerName.trim()}
                            className={`btn-primary w-full text-lg py-4 ${!playerName.trim() ? 'btn-disabled' : ''}`}
                        >
                            <Plus size={24} /> Create Lobby
                        </button>
                    </div>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white text-gray-500 font-medium">or join existing</span>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="Lobby Code"
                            className="flex-1 input-default text-center text-lg font-mono tracking-widest"
                            maxLength={6}
                            id="lobbyCode"
                        />
                        <button
                            onClick={() => {
                                const code = document.getElementById('lobbyCode').value;
                                joinLobby(code);
                            }}
                            disabled={!playerName.trim()}
                            className="btn-secondary px-8 text-lg"
                        >
                            Join
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (screen === 'lobby') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-blue-600 flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                }}></div>

                <div className="game-container w-full max-w-2xl relative z-10 animate-game-start">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                                Lobby: {lobbyId}
                            </h2>
                            <p className="text-gray-600 text-lg mt-1">
                                Waiting for players... ({players.length}/8)
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                Connection: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                            </p>
                        </div>
                        <button
                            onClick={leaveLobby}
                            className="btn-danger flex items-center gap-2"
                        >
                            <LogOut size={18} /> Leave
                        </button>
                    </div>

                    {isHost && (
                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 mb-8 border border-gray-200">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                                    <Settings size={24} className="text-primary-600" /> Game Settings
                                </h3>
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className="text-primary-600 hover:text-primary-700 font-semibold transition-colors duration-200"
                                >
                                    {showSettings ? 'Hide' : 'Show'}
                                </button>
                            </div>

                            {showSettings && (
                                <div className="space-y-6 animate-slide-up">
                                    <div>
                                        <label className="block text-lg font-semibold mb-3 text-gray-800">Grid Size</label>
                                        <div className="flex gap-3 flex-wrap">
                                            {[4, 5, 6, 7, 8].map(size => (
                                                <button
                                                    key={size}
                                                    onClick={() => setGridSize(size)}
                                                    className={`px-6 py-3 rounded-lg font-bold text-lg transition-all duration-200 ${gridSize === size
                                                        ? 'bg-primary-600 text-white shadow-lg scale-105'
                                                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-primary-300 hover:shadow-md'
                                                        }`}
                                                >
                                                    {size}×{size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-lg font-semibold mb-3 text-gray-800">Game Duration</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { label: '10 sec', value: 10, emoji: '⚡' },
                                                { label: '1 min', value: 60, emoji: '⏱️' },
                                                { label: '2 min', value: 120, emoji: '⏰' },
                                                { label: '3 min', value: 180, emoji: '🕐' },
                                                { label: '5 min', value: 300, emoji: '🕔' },
                                                { label: '10 min', value: 600, emoji: '🕙' }
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => setGameDuration(option.value)}
                                                    className={`px-4 py-3 rounded-lg font-semibold transition-all duration-200 ${gameDuration === option.value
                                                        ? 'bg-primary-600 text-white shadow-lg scale-105'
                                                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-primary-300 hover:shadow-md'
                                                        }`}
                                                >
                                                    <div className="text-lg">{option.emoji}</div>
                                                    <div className="text-sm">{option.label}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-lg font-semibold mb-3 text-gray-800">Difficulty</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => setDifficulty('easy')}
                                                className={`px-6 py-4 rounded-lg font-bold text-lg transition-all duration-200 ${difficulty === 'easy'
                                                    ? 'bg-green-600 text-white shadow-lg scale-105'
                                                    : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-green-300 hover:shadow-md'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-center gap-2 mb-1">
                                                    <span className="text-2xl">🟢</span>
                                                    <span>Easy</span>
                                                </div>
                                                <div className="text-sm opacity-90">Pick any letter</div>
                                            </button>
                                            <button
                                                onClick={() => setDifficulty('hard')}
                                                className={`px-6 py-4 rounded-lg font-bold text-lg transition-all duration-200 ${difficulty === 'hard'
                                                    ? 'bg-red-600 text-white shadow-lg scale-105'
                                                    : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-red-300 hover:shadow-md'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-center gap-2 mb-1">
                                                    <span className="text-2xl">🔴</span>
                                                    <span>Hard</span>
                                                </div>
                                                <div className="text-sm opacity-90">Adjacent only</div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 mb-8 border border-gray-200">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">
                            <Users size={24} className="text-primary-600" /> Players ({players.length})
                        </h3>
                        <div className="space-y-3">
                            {players.map((player, index) => (
                                <div key={player.id} className={`player-card ${index === 0 ? 'ring-2 ring-primary-200' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {player.isHost && <Crown size={20} className="text-yellow-500 animate-pulse-slow" />}
                                            <span className="font-semibold text-lg">{player.name}</span>
                                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-mono">#{player.number}</span>
                                            {player.id === playerId && (
                                                <span className="text-xs bg-primary-100 text-primary-600 px-2 py-1 rounded-full font-semibold">You</span>
                                            )}
                                        </div>
                                        <span className="text-primary-600 font-bold text-lg">{player.score} pts</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {isHost && (
                        <button
                            onClick={() => {
                                console.log('Start Game button clicked');
                                startGame();
                            }}
                            disabled={players.length < 1}
                            className="btn-success w-full text-xl py-5 flex items-center justify-center gap-3"
                        >
                            <Play size={28} /> Start Game
                        </button>
                    )}

                    {!isHost && (
                        <div className="text-center py-8">
                            <div className="text-gray-600 text-lg mb-2">Waiting for host to start the game...</div>
                            <div className="flex justify-center">
                                <div className="flex space-x-1">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Development helper - Add test players */}
                    {process.env.NODE_ENV === 'development' && (
                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800 mb-2">Development Mode - Add test players:</p>
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => addPlayer({
                                        id: `test-${Date.now()}`,
                                        name: `Player ${players.length}`,
                                        score: 0,
                                        isHost: false
                                    })}
                                    className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded text-sm hover:bg-yellow-300"
                                >
                                    Add Player
                                </button>
                                <button
                                    onClick={() => {
                                        const testPlayers = [
                                            { id: 'test-1', name: 'Alice', score: 0, isHost: false },
                                            { id: 'test-2', name: 'Bob', score: 0, isHost: false },
                                            { id: 'test-3', name: 'Charlie', score: 0, isHost: false }
                                        ];
                                        testPlayers.forEach(player => addPlayer(player));
                                    }}
                                    className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded text-sm hover:bg-yellow-300"
                                >
                                    Add 3 Players
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-blue-600 p-4 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}></div>

            <div className="max-w-7xl mx-auto relative z-10">
                <div className="game-container mb-6 animate-game-start">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                                Word Hunt
                            </h2>
                            <p className="text-lg text-gray-600 mt-1">
                                {difficulty === 'easy' ? '🟢 Easy Mode' : '🔴 Hard Mode'} - {gridSize}×{gridSize} Grid
                            </p>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className={`text-4xl font-bold font-mono ${timeLeft < 30 ? 'timer-warning' : 'timer-normal'}`}>
                                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                            </div>
                            {timeLeft < 10 && (
                                <div className="text-red-500 text-lg font-semibold animate-pulse">
                                    ⚠️ Game Ending Soon!
                                </div>
                            )}
                            <button
                                onClick={leaveLobby}
                                className="btn-danger flex items-center gap-2"
                            >
                                <LogOut size={18} /> Leave
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                        <div className="xl:col-span-3">
                            <div className="game-grid mb-6">
                                <div className={`grid gap-3 mb-6 justify-center`} style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
                                    {grid.map((row, rowIdx) =>
                                        row.map((letter, colIdx) => {
                                            const isSelected = selectedCells.some(
                                                c => c.row === rowIdx && c.col === colIdx
                                            );
                                            return (
                                                <button
                                                    key={`${rowIdx}-${colIdx}`}
                                                    onClick={() => handleCellClick(rowIdx, colIdx)}
                                                    disabled={!isGameActive}
                                                    className={`grid-cell ${isSelected ? 'selected animate-cell-select' : 'default'}`}
                                                >
                                                    {letter}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                    <div className="text-center mb-6">
                                        <span className="text-lg text-gray-600 font-medium">Current Word:</span>
                                        <div className="text-4xl font-bold text-primary-600 min-h-[50px] flex items-center justify-center font-mono tracking-wider">
                                            {currentWord || '...'}
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mb-6">
                                        <button
                                            onClick={() => submitWord()}
                                            disabled={currentWord.length < 3 || validatingWord || !isGameActive || gameEnded}
                                            className="btn-success flex-1 text-lg py-4"
                                        >
                                            {validatingWord ? 'Checking...' : gameEnded ? 'Game Ended' : 'Submit Word'}
                                        </button>
                                        <button
                                            onClick={clearSelection}
                                            className="bg-gray-500 text-white px-8 py-4 rounded-lg font-semibold hover:bg-gray-600 transition-all duration-200"
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    <div className="border-t border-gray-200 pt-6">
                                        <label className="block text-lg font-semibold text-gray-800 mb-3">
                                            Or type a word:
                                        </label>
                                        <div className="flex gap-3">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={24} />
                                                <input
                                                    type="text"
                                                    value={searchWord}
                                                    onChange={(e) => setSearchWord(e.target.value.toUpperCase())}
                                                    onKeyPress={(e) => e.key === 'Enter' && submitSearchWord()}
                                                    placeholder={gameEnded ? "Game has ended" : "Type word here..."}
                                                    disabled={!isGameActive || gameEnded}
                                                    className="w-full pl-12 pr-4 py-4 border-2 border-gray-300 rounded-lg focus:border-primary-500 focus:outline-none uppercase text-lg font-mono tracking-wider disabled:bg-gray-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <button
                                                onClick={submitSearchWord}
                                                disabled={searchWord.length < 3 || validatingWord || !isGameActive || gameEnded}
                                                className="btn-secondary px-8 text-lg"
                                            >
                                                {validatingWord ? '...' : gameEnded ? 'Ended' : 'Add'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
                                    <Users size={24} className="text-primary-600" /> Players
                                </h3>
                                <div className="space-y-3">
                                    {players.sort((a, b) => b.score - a.score).map((player, idx) => (
                                        <div key={player.id} className={`player-card ${idx === 0 ? 'ring-2 ring-yellow-300 bg-yellow-50' : ''}`}>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    {idx === 0 && <span className="text-2xl">🏆</span>}
                                                    <span className="font-semibold text-lg">{player.name}</span>
                                                    {player.id === playerId && (
                                                        <span className="text-xs bg-primary-100 text-primary-600 px-2 py-1 rounded-full font-semibold">You</span>
                                                    )}
                                                </div>
                                                <span className="text-primary-600 font-bold text-xl">{player.score}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
                                    <span className="text-2xl">📝</span> Your Words ({foundWords.length})
                                </h3>
                                <div className="max-h-96 overflow-y-auto space-y-2">
                                    {foundWords.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-gray-500 text-lg">No words found yet</p>
                                            <p className="text-gray-400 text-sm mt-2">Start clicking letters to form words!</p>
                                        </div>
                                    ) : (
                                        foundWords.map((wordObj, idx) => (
                                            <div key={idx} className="word-item flex justify-between items-center">
                                                <span className="font-bold text-lg font-mono">{wordObj.word}</span>
                                                <span className="text-green-600 font-bold text-lg">+{wordObj.score}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Game End Overlay */}
            {gameEnded && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-8 max-w-md mx-4 text-center animate-scale-in">
                        <div className="text-6xl mb-4">🏁</div>
                        <h2 className="text-3xl font-bold text-gray-800 mb-2">Game Over!</h2>
                        <p className="text-gray-600 mb-6">Time's up! Here are the final results:</p>

                        <div className="space-y-3 mb-6">
                            {players.sort((a, b) => b.score - a.score).map((player, idx) => (
                                <div key={player.id} className={`flex justify-between items-center p-3 rounded-lg ${idx === 0 ? 'bg-yellow-100 border-2 border-yellow-300' : 'bg-gray-50'
                                    }`}>
                                    <div className="flex items-center gap-3">
                                        {idx === 0 && <span className="text-2xl">🏆</span>}
                                        <span className="font-semibold">{player.name}</span>
                                        {player.id === playerId && (
                                            <span className="text-xs bg-primary-100 text-primary-600 px-2 py-1 rounded-full">You</span>
                                        )}
                                    </div>
                                    <span className="font-bold text-lg">{player.score} pts</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setGameEnded(false);
                                    setIsGameActive(false);
                                    setScreen('lobby');
                                }}
                                className="btn-primary flex-1"
                            >
                                Back to Lobby
                            </button>
                            <button
                                onClick={() => {
                                    if (isHost) {
                                        startGame();
                                    }
                                }}
                                disabled={!isHost}
                                className="btn-success flex-1"
                            >
                                {isHost ? 'Play Again' : 'Wait for Host'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WordHuntGame;
