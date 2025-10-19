import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { X, User, Trophy, Calendar, LogOut } from 'lucide-react';

const UserProfile = ({ onClose }) => {
    const { user, logout } = useAuth();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const handleLogout = async () => {
        await logout();
        setShowLogoutConfirm(false);
        onClose();
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <User size={24} />
                        Profile
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* User Info */}
                    <div className="text-center">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User size={32} className="text-blue-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800">{user?.username}</h3>
                        <p className="text-gray-600">{user?.email}</p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <Trophy className="mx-auto mb-2 text-blue-600" size={24} />
                            <div className="text-2xl font-bold text-blue-600">{user?.bestScore || 0}</div>
                            <div className="text-sm text-gray-600">Best Score</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{user?.totalScore || 0}</div>
                            <div className="text-sm text-gray-600">Total Score</div>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">{user?.totalGamesPlayed || 0}</div>
                            <div className="text-sm text-gray-600">Games Played</div>
                        </div>
                    </div>

                    {/* Account Info */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <Calendar size={20} className="text-gray-500" />
                            <div>
                                <div className="text-sm text-gray-600">Member since</div>
                                <div className="font-medium">{formatDate(user?.createdAt)}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <LogOut size={20} className="text-gray-500" />
                            <div>
                                <div className="text-sm text-gray-600">Last login</div>
                                <div className="font-medium">{formatDate(user?.lastLogin)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Logout Button */}
                    <div className="pt-4 border-t">
                        <button
                            onClick={() => setShowLogoutConfirm(true)}
                            className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center justify-center gap-2"
                        >
                            <LogOut size={20} />
                            Logout
                        </button>
                    </div>
                </div>

                {/* Logout Confirmation */}
                {showLogoutConfirm && (
                    <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center rounded-lg">
                        <div className="text-center p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Confirm Logout</h3>
                            <p className="text-gray-600 mb-4">Are you sure you want to logout?</p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserProfile;
