import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CreditCard, Package, Clock, ShoppingBag, ArrowRight,
  TrendingUp, DollarSign
} from 'lucide-react';
import Button from '../../components/Button';
import { useAuth } from '../../contexts/AuthContext';
import './DashboardPage.css';

interface DashboardData {
  credits: {
    total: number;
    bundles: Array<{
      id: string;
      bundleType: string;
      remaining: number;
      expiresAt: string | null;
    }>;
  };
  unlocks: {
    total: number;
    active: number;
    thisWeek: number;
    thisMonth: number;
  };
  marketplace: {
    total: number;
    active: number;
  };
  purchases: {
    totalBundles: number;
    totalUnlocks: number;
    totalUsed: number;
    totalSpent: number;
  };
  recentActivity: Array<{
    id: string;
    public_id: string;
    origin: string;
    destination: string;
    cargo_type: string;
    created_at: string;
  }>;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    loadActivity();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/v1/dashboard', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setDashboard(data.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    try {
      const response = await fetch('/api/v1/dashboard/activity', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setActivity(data.data);
      }
    } catch (error) {
      console.error('Failed to load activity:', error);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page loading">
        <div className="loading-spinner" />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="welcome-section">
          <h1>Welcome back, {user?.firstName || 'User'}</h1>
          <p>Manage your FreightLink account and activity</p>
        </div>
        <Link to="/pricing">
          <Button variant="primary">
            <CreditCard size={18} />
            Buy Credits
          </Button>
        </Link>
      </header>

      {/* Credits Section */}
      <section className="credits-section">
        <div className="credits-card">
          <div className="credits-header">
            <h2>Your Credits</h2>
            <span className="credits-badge">
              {dashboard?.credits.bundles.length || 0} active bundles
            </span>
          </div>
          <div className="credits-display">
            <span className="credits-amount">{dashboard?.credits.total || 0}</span>
            <span className="credits-label">unlocks available</span>
          </div>
          <div className="credits-actions">
            <Button variant="primary" onClick={() => navigate('/pricing')}>
              Buy More Credits
            </Button>
          </div>
        </div>

        {dashboard?.credits.bundles && dashboard.credits.bundles.length > 0 && (
          <div className="bundles-list">
            <h3>Active Bundles</h3>
            {dashboard.credits.bundles.map((bundle) => (
              <div key={bundle.id} className="bundle-item">
                <div className="bundle-info">
                  <span className="bundle-name">{bundle.bundleType}</span>
                  <span className="bundle-remaining">{bundle.remaining} remaining</span>
                </div>
                {bundle.expiresAt && (
                  <span className="bundle-expires">
                    Expires {new Date(bundle.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stats Grid */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Package size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">{dashboard?.unlocks.total || 0}</span>
            <span className="stat-label">Total Unlocks</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">{dashboard?.unlocks.active || 0}</span>
            <span className="stat-label">Active Access</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">{dashboard?.unlocks.thisMonth || 0}</span>
            <span className="stat-label">This Month</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-content">
            <span className="stat-value">${dashboard?.purchases.totalSpent.toFixed(2) || '0.00'}</span>
            <span className="stat-label">Total Spent</span>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          <button className="action-card" onClick={() => navigate('/loads')}>
            <Package size={24} />
            <span>Browse Loads</span>
            <ArrowRight size={16} />
          </button>
          <button className="action-card" onClick={() => navigate('/my-unlocks')}>
            <Clock size={24} />
            <span>My Unlocks</span>
            <ArrowRight size={16} />
          </button>
          <button className="action-card" onClick={() => navigate('/marketplace')}>
            <ShoppingBag size={24} />
            <span>Marketplace</span>
            <ArrowRight size={16} />
          </button>
          <button className="action-card" onClick={() => navigate('/pricing')}>
            <CreditCard size={24} />
            <span>Buy Credits</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="recent-activity">
        <h2>Recent Activity</h2>
        {activity.length === 0 ? (
          <div className="empty-activity">
            <p>No activity yet</p>
            <p className="empty-hint">Start by browsing loads and unlocking contacts</p>
          </div>
        ) : (
          <div className="activity-list">
            {activity.map((item) => (
              <div key={item.id} className="activity-item">
                <div className="activity-icon">
                  {item.type === 'load_unlock' ? <Package size={20} /> : <CreditCard size={20} />}
                </div>
                <div className="activity-content">
                  <span className="activity-title">
                    {item.type === 'load_unlock'
                      ? `Unlocked: ${item.data.origin} → ${item.data.destination}`
                      : `Purchased: ${item.data.bundleName}`}
                  </span>
                  <span className="activity-time">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Purchase History */}
      <section className="purchase-history">
        <h2>Purchase History</h2>
        <div className="history-stats">
          <div className="history-stat">
            <span className="history-value">{dashboard?.purchases.totalBundles || 0}</span>
            <span className="history-label">Bundles Purchased</span>
          </div>
          <div className="history-stat">
            <span className="history-value">{dashboard?.purchases.totalUnlocks || 0}</span>
            <span className="history-label">Total Credits</span>
          </div>
          <div className="history-stat">
            <span className="history-value">{dashboard?.purchases.totalUsed || 0}</span>
            <span className="history-label">Credits Used</span>
          </div>
          <div className="history-stat">
            <span className="history-value">${dashboard?.purchases.totalSpent.toFixed(2) || '0.00'}</span>
            <span className="history-label">Total Spent</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
