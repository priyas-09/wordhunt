import React, { useState, useEffect, useRef } from 'react';
import { Users, Crown, Play, LogOut, Plus, Settings, Search } from 'lucide-react';
import './App.css';

// Word validation cache to avoid repeated API calls
const wordCache = {};

const useWebSocket = (lobbyId, playerId) => {
    const [gameState, setGameState] = useState(null);
    const [players, setPlayers] = useState([]);
    const ws = useRef(null);

    useEffect(() => {
        if (!lobbyId || !playerId) return;

        const mockWs = {
            send: (data) => console.log('WS Send:', data),
            close: () => console.log('WS Closed')
        };
        ws.current = mockWs;

        setPlayers([
            { id: playerId, name: 'You', score: 0, isHost: true, number: 1 },
            { id: '2', name: 'Player 2', score: 0, isHost: false, number: 2 },
            { id: '3', name: 'Player 3', score: 0, isHost: false, number: 3 }
        ]);

        return () => mockWs.close();
    }, [lobbyId, playerId]);

    const sendMessage = (type, data) => {
        if (ws.current) {
            ws.current.send(JSON.stringify({ type, data }));
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

    return { gameState, players, sendMessage, updatePlayerScore, resetPlayerScores };
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
    const [grid, setGrid] = useState([]);
    const [selectedCells, setSelectedCells] = useState([]);
    const [foundWords, setFoundWords] = useState([]);
    const [currentWord, setCurrentWord] = useState('');
    const [searchWord, setSearchWord] = useState('');
    const [timeLeft, setTimeLeft] = useState(120);
    const [isGameActive, setIsGameActive] = useState(false);
    const [validatingWord, setValidatingWord] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);

    // Game settings
    const [gridSize, setGridSize] = useState(5);
    const [difficulty, setDifficulty] = useState('easy'); // easy or hard
    const [gameDuration, setGameDuration] = useState(120); // in seconds
    const [showSettings, setShowSettings] = useState(false);

    const { gameState, players, sendMessage, updatePlayerScore, resetPlayerScores } = useWebSocket(lobbyId, playerId);
    const isHost = players.length > 0 ? (players.find(p => p.id === playerId)?.isHost || false) : false;

    console.log('Current state - screen:', screen, 'isHost:', isHost, 'players:', players);

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

        try {
            console.log('Fetching from API:', lowerWord);
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${lowerWord}`);
            const isValid = response.ok;
            console.log('API response:', lowerWord, isValid);
            wordCache[lowerWord] = isValid;
            return isValid;
        } catch (error) {
            console.error('Error validating word:', error);
            return false;
        }
    };

    const createLobby = () => {
        if (!playerName.trim()) return;
        const newLobbyId = Math.random().toString(36).substr(2, 6).toUpperCase();
        setLobbyId(newLobbyId);
        sendMessage('createLobby', { playerName });
        setScreen('lobby');
    };

    const joinLobby = (id) => {
        if (!playerName.trim() || !id.trim()) return;
        setLobbyId(id);
        sendMessage('joinLobby', { lobbyId: id, playerName });
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
        sendMessage('startGame', { grid: newGrid, gridSize, difficulty, gameDuration });
        setScreen('game');
    };

    const leaveLobby = () => {
        sendMessage('leaveLobby', {});
        setScreen('menu');
        setLobbyId(null);
    };

    const isCellAdjacent = (cell1, cell2) => {
        const rowDiff = Math.abs(cell1.row - cell2.row);
        const colDiff = Math.abs(cell1.col - cell2.col);
        return rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0);
    };

    const handleCellClick = (row, col) => {
        if (!isGameActive) return;

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

        const upperWord = word.toUpperCase().trim();

        // Check if already found
        if (foundWords.some(w => w.word === upperWord)) {
            alert(`You already found "${upperWord}"!`);
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
                alert(`✓ "${upperWord}" added! +${score} points`);
            } else {
                alert(`✗ "${upperWord}" is not a valid word!`);
            }
        } catch (error) {
            console.error('Error in submitWord:', error);
            alert('Error validating word. Please try again.');
        } finally {
            setValidatingWord(false);
            setSelectedCells([]);
            setCurrentWord('');
        }
    };

    const submitSearchWord = async () => {
        if (!searchWord.trim() || validatingWord) return;

        const upperWord = searchWord.toUpperCase();
        const gridLetters = grid.flat().join('');

        // Check if all letters in the word exist in the grid
        const wordLetters = upperWord.split('');
        const gridLettersCopy = gridLetters.split('');

        for (let letter of wordLetters) {
            const idx = gridLettersCopy.indexOf(letter);
            if (idx === -1) {
                alert(`Cannot form "${upperWord}" - missing letter "${letter}"`);
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
            <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                    <h1 className="text-4xl font-bold text-center mb-2 text-purple-600">Word Hunt</h1>
                    <p className="text-center text-gray-600 mb-8">Multiplayer Word Game</p>

                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        className="input-default"
                    />

                    <button
                        onClick={createLobby}
                        disabled={!playerName.trim()}
                        className={`btn-primary ${!playerName.trim() ? 'btn-disabled' : ''}`}
                    >
                        <Plus size={20} /> Create Lobby
                    </button>


                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">or</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Lobby Code"
                            className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none uppercase"
                            maxLength={6}
                            id="lobbyCode"
                        />
                        <button
                            onClick={() => {
                                const code = document.getElementById('lobbyCode').value;
                                joinLobby(code);
                            }}
                            disabled={!playerName.trim()}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
            <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-3xl font-bold text-purple-600">Lobby: {lobbyId}</h2>
                            <p className="text-gray-600">Waiting for players... ({players.length}/8)</p>
                        </div>
                        <button
                            onClick={leaveLobby}
                            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 flex items-center gap-2"
                        >
                            <LogOut size={18} /> Leave
                        </button>
                    </div>

                    {isHost && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Settings size={20} /> Game Settings
                                </h3>
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className="text-purple-600 text-sm"
                                >
                                    {showSettings ? 'Hide' : 'Show'}
                                </button>
                            </div>

                            {showSettings && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Grid Size</label>
                                        <div className="flex gap-2">
                                            {[4, 5, 6, 7, 8].map(size => (
                                                <button
                                                    key={size}
                                                    onClick={() => setGridSize(size)}
                                                    className={`px-4 py-2 rounded-lg font-semibold ${gridSize === size
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-white border-2 border-gray-300 text-gray-700'
                                                        }`}
                                                >
                                                    {size}x{size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Game Duration</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {[
                                                { label: '10 sec', value: 10 },
                                                { label: '1 min', value: 60 },
                                                { label: '2 min', value: 120 },
                                                { label: '3 min', value: 180 },
                                                { label: '5 min', value: 300 },
                                                { label: '10 min', value: 600 }
                                            ].map(option => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => setGameDuration(option.value)}
                                                    className={`px-4 py-2 rounded-lg font-semibold ${gameDuration === option.value
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-white border-2 border-gray-300 text-gray-700'
                                                        }`}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Difficulty</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setDifficulty('easy')}
                                                className={`flex-1 px-4 py-3 rounded-lg font-semibold ${difficulty === 'easy'
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-white border-2 border-gray-300 text-gray-700'
                                                    }`}
                                            >
                                                Easy
                                                <div className="text-xs mt-1">Pick any letter</div>
                                            </button>
                                            <button
                                                onClick={() => setDifficulty('hard')}
                                                className={`flex-1 px-4 py-3 rounded-lg font-semibold ${difficulty === 'hard'
                                                    ? 'bg-red-600 text-white'
                                                    : 'bg-white border-2 border-gray-300 text-gray-700'
                                                    }`}
                                            >
                                                Hard
                                                <div className="text-xs mt-1">Adjacent only</div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Users size={20} /> Players
                        </h3>
                        <div className="space-y-2">
                            {players.map(player => (
                                <div className="flex items-center justify-between bg-white p-3 rounded-lg"
                                >
                                    <div className="flex items-center gap-2">
                                        {player.isHost && <Crown size={18} className="text-yellow-500" />}
                                        <span className="font-medium">{player.name}</span>
                                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">#{player.number}</span>
                                        {player.id === playerId && (
                                            <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">You</span>
                                        )}
                                    </div>
                                    <span className="text-gray-600">{player.score} pts</span>
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
                            className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Play size={24} /> Start Game
                        </button>
                    )}

                    {!isHost && (
                        <div className="text-center text-gray-600 py-4">
                            Waiting for host to start the game...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-lg shadow-2xl p-6 mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-purple-600">Word Hunt</h2>
                            <p className="text-sm text-gray-600">
                                {difficulty === 'easy' ? '🟢 Easy Mode' : '🔴 Hard Mode'} - {gridSize}x{gridSize} Grid
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className={`text-2xl font-bold ${timeLeft < 30 ? 'text-red-600' : 'text-gray-700'}`}>
                                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                            </div>
                            <button
                                onClick={leaveLobby}
                                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600"
                            >
                                Leave
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <div className="bg-gray-50 p-4 rounded-lg mb-4">
                                <div className={`grid gap-2 mb-4`} style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
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
                                                    className={`grid-cell ${isSelected ? 'selected' : 'default'}`}
                                                >
                                                    {letter}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="bg-white p-4 rounded-lg mb-2">
                                    <div className="text-center mb-2">
                                        <span className="text-sm text-gray-600">Current Word:</span>
                                        <div className="text-3xl font-bold text-purple-600 min-h-[40px]">
                                            {currentWord || '...'}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mb-4">
                                        <button
                                            onClick={() => submitWord()}
                                            disabled={currentWord.length < 3 || validatingWord}
                                            className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                            {validatingWord ? 'Checking...' : 'Submit Word'}
                                        </button>
                                        <button
                                            onClick={clearSelection}
                                            className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600"
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    <div className="border-t pt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Or type a word:
                                        </label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                                <input
                                                    type="text"
                                                    value={searchWord}
                                                    onChange={(e) => setSearchWord(e.target.value.toUpperCase())}
                                                    onKeyPress={(e) => e.key === 'Enter' && submitSearchWord()}
                                                    placeholder="Type word here..."
                                                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none uppercase"
                                                />
                                            </div>
                                            <button
                                                onClick={submitSearchWord}
                                                disabled={searchWord.length < 3 || validatingWord}
                                                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                            >
                                                {validatingWord ? '...' : 'Add'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-semibold mb-3">Players</h3>
                                <div className="space-y-2">
                                    {players.sort((a, b) => b.score - a.score).map((player, idx) => (
                                        <div key={player.id} className="flex justify-between items-center bg-white p-2 rounded">
                                            <div className="flex items-center gap-2">
                                                {idx === 0 && <span className="text-yellow-500">🏆</span>}
                                                <span className="font-medium">{player.name}</span>
                                            </div>
                                            <span className="text-purple-600 font-bold">{player.score}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="font-semibold mb-3">Your Words ({foundWords.length})</h3>
                                <div className="max-h-96 overflow-y-auto space-y-1">
                                    {foundWords.length === 0 ? (
                                        <p className="text-gray-500 text-sm text-center py-4">No words found yet</p>
                                    ) : (
                                        foundWords.map((wordObj, idx) => (
                                            <div key={idx} className="bg-white p-2 rounded flex justify-between">
                                                <span className="font-medium">{wordObj.word}</span>
                                                <span className="text-purple-600">+{wordObj.score}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WordHuntGame;
