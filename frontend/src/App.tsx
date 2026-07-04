import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import { useAuth } from './contexts/AuthContext';

// Lazy load pages
const HomePage = lazy(() => import('./pages/HomePage'));
const LoadsPage = lazy(() => import('./pages/LoadsPage'));
const LoadDetailPage = lazy(() => import('./pages/LoadDetailPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));

// Loading spinner component
const LoadingSpinner: React.FC = () => (
  <div className="loading-screen">
    <div className="loading-spinner" />
    <p>Loading...</p>
  </div>
);

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/loads" element={<LoadsPage />} />
            <Route path="/loads/:id" element={<LoadDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected routes */}
            <Route
              path="/my-loads"
              element={
                <ProtectedRoute>
                  <div>My Loads Page (Coming Soon)</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-load"
              element={
                <ProtectedRoute>
                  <div>Create Load Page (Coming Soon)</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/wallet"
              element={
                <ProtectedRoute>
                  <div>Wallet Page (Coming Soon)</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <div>Profile Page (Coming Soon)</div>
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
