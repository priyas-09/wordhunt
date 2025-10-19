import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // Check if user is logged in on app start
    useEffect(() => {
        const checkAuth = async () => {
            if (token) {
                try {
                    const response = await fetch('http://localhost:9091/auth/me', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        setUser(data.user);
                    } else {
                        // Token is invalid, remove it
                        localStorage.removeItem('token');
                        setToken(null);
                    }
                } catch (error) {
                    console.error('Auth check failed:', error);
                    localStorage.removeItem('token');
                    setToken(null);
                }
            }
            setLoading(false);
        };

        checkAuth();
    }, [token]);

    const login = async (username, password) => {
        try {
            const response = await fetch('http://localhost:9091/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                setToken(data.token);
                setUser(data.user);
                localStorage.setItem('token', data.token);
                return { success: true, message: data.message };
            } else {
                return { success: false, message: data.error };
            }
        } catch (error) {
            return { success: false, message: 'Network error. Please try again.' };
        }
    };

    const register = async (username, email, password) => {
        try {
            const response = await fetch('http://localhost:9091/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                setToken(data.token);
                setUser(data.user);
                localStorage.setItem('token', data.token);
                return { success: true, message: data.message };
            } else {
                return { success: false, message: data.error };
            }
        } catch (error) {
            return { success: false, message: 'Network error. Please try again.' };
        }
    };

    const logout = async () => {
        try {
            if (token) {
                await fetch('http://localhost:9091/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            setToken(null);
            localStorage.removeItem('token');
        }
    };

    const updateUserStats = async (gameScore) => {
        if (!token || !user) return { success: false, message: 'Not authenticated' };

        try {
            const response = await fetch('http://localhost:9091/auth/update-stats', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameScore })
            });

            const data = await response.json();

            if (response.ok) {
                // Update local user state with new stats
                setUser(prevUser => ({
                    ...prevUser,
                    totalGamesPlayed: data.stats.totalGamesPlayed,
                    totalScore: data.stats.totalScore,
                    bestScore: data.stats.bestScore
                }));
                return { success: true, message: data.message, stats: data.stats };
            } else {
                return { success: false, message: data.error };
            }
        } catch (error) {
            return { success: false, message: 'Network error. Please try again.' };
        }
    };

    const value = {
        user,
        token,
        login,
        register,
        logout,
        updateUserStats,
        loading,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
