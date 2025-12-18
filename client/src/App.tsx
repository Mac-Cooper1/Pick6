import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { LeagueSetup } from './pages/LeagueSetup';
import { MainApp } from './pages/MainApp';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            {/* Dashboard - My Leagues */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            {/* Create/Join League */}
            <Route
              path="/league/create"
              element={
                <ProtectedRoute>
                  <LeagueSetup mode="create" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/league/join"
              element={
                <ProtectedRoute>
                  <LeagueSetup mode="join" />
                </ProtectedRoute>
              }
            />
            {/* Legacy route */}
            <Route
              path="/league-setup"
              element={
                <ProtectedRoute>
                  <LeagueSetup />
                </ProtectedRoute>
              }
            />
            {/* League detail */}
            <Route
              path="/league/:leagueId"
              element={
                <ProtectedRoute>
                  <MainApp />
                </ProtectedRoute>
              }
            />
            {/* Legacy route */}
            <Route
              path="/app/:leagueId"
              element={
                <ProtectedRoute>
                  <MainApp />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
