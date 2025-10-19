import React, { useState } from 'react';
import WordHuntGame from './WordHuntGame';
import Login from './Login';
import UserProfile from './UserProfile';
import { AuthProvider, useAuth } from './AuthContext';
import { User, LogIn } from 'lucide-react';
import './index.css';

const AppContent = () => {
  const { user, isAuthenticated, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-800">WordHunt</h1>
            </div>

            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  <span className="text-gray-600">Welcome, {user?.username}!</span>
                  <button
                    onClick={() => setShowProfile(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <User size={20} />
                    Profile
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <LogIn size={20} />
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <WordHuntGame />
      </main>

      {/* Modals */}
      {showLogin && (
        <Login
          onClose={() => setShowLogin(false)}
        />
      )}

      {showProfile && (
        <UserProfile
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
