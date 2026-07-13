import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Truck, Menu, X, Bell, User, LogOut, Settings, Package, Wallet, CreditCard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../Button';
import './Header.css';

const Header: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="header__container">
        <Link to="/" className="header__logo">
          <Truck className="header__logo-icon" />
          <span className="header__logo-text">FreightLink</span>
          <span className="header__logo-accent">Africa</span>
        </Link>

        <nav className={`header__nav ${isMobileMenuOpen ? 'header__nav--open' : ''}`}>
          <Link
            to="/loads"
            className={`header__link ${isActive('/loads') ? 'header__link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Browse Loads
          </Link>

          <Link
            to="/marketplace"
            className={`header__link ${isActive('/marketplace') ? 'header__link--active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Marketplace
          </Link>

          {isAuthenticated && (
            <>
              <Link
                to="/dashboard"
                className={`header__link ${isActive('/dashboard') ? 'header__link--active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/my-loads"
                className={`header__link ${isActive('/my-loads') ? 'header__link--active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                My Loads
              </Link>
              <Link
                to="/create-load"
                className={`header__link ${isActive('/create-load') ? 'header__link--active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Post Load
              </Link>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className={`header__link ${isActive('/admin') ? 'header__link--active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Admin
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="header__actions">
          {isAuthenticated ? (
            <>
              <button className="header__icon-btn" aria-label="Notifications">
                <Bell size={20} />
                <span className="header__notification-badge">2</span>
              </button>

              <div className="header__profile">
                <button
                  className="header__profile-trigger"
                  onClick={() => setProfileMenuOpen(!isProfileMenuOpen)}
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="header__avatar">
                    {user?.firstName?.[0]?.toUpperCase() || <User size={20} />}
                  </div>
                  <span className="header__profile-name">
                    {user?.firstName || 'User'}
                  </span>
                </button>

                {isProfileMenuOpen && (
                  <div className="header__profile-menu">
                    <div className="header__profile-header">
                      <p className="header__profile-email">{user?.email}</p>
                      <p className="header__profile-role">{user?.roleName}</p>
                    </div>

                    <Link
                      to="/profile"
                      className="header__menu-item"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <Settings size={18} />
                      <span>Settings</span>
                    </Link>

                    <Link
                      to="/pricing"
                      className="header__menu-item"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <CreditCard size={18} />
                      <span>Buy Credits</span>
                    </Link>

                    <Link
                      to="/wallet"
                      className="header__menu-item"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <Wallet size={18} />
                      <span>Wallet</span>
                    </Link>

                    <Link
                      to="/my-unlocks"
                      className="header__menu-item"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <Package size={18} />
                      <span>My Unlocks</span>
                    </Link>

                    <hr className="header__menu-divider" />

                    <button
                      className="header__menu-item header__menu-item--danger"
                      onClick={handleLogout}
                    >
                      <LogOut size={18} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="header__auth-buttons">
              <Link to="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">Get Started</Button>
              </Link>
            </div>
          )}

          <button
            className="header__mobile-toggle"
            onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu backdrop */}
      {isMobileMenuOpen && (
        <div
          className="header__backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  );
};

export default Header;
