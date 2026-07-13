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
const PricingPage = lazy(() => import('./pages/PricingPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));

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
            <Route path="/pricing" element={<PricingPage />} />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
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
            <Route
              path="/my-unlocks"
              element={
                <ProtectedRoute>
                  <div>My Unlocks Page (Coming Soon)</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Marketplace routes */}
            <Route path="/marketplace" element={<MarketplacePage />} />

            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
