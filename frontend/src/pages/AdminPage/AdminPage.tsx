import React, { useState, useEffect } from 'react';
import {
  Package, Clock, CheckCircle, XCircle,
  Eye, Edit2, Trash2, Upload, AlertTriangle
} from 'lucide-react';
import Button from '../../components/Button';
import './AdminPage.css';

interface AdminStats {
  loads: { total: number; pending: number; published: number; expired: number; rejected: number; today: number };
  users: { total: number; active: number; new_this_week: number; logged_in_today: number };
  revenue: { total_revenue: string; revenue_this_week: string; revenue_this_month: string; total_transactions: number };
  unlocks: { total: number; this_week: number; this_month: number };
  marketplace: { total_items: number; pending: number; approved: number; sold: number };
}

interface Load {
  id: string;
  public_id: string;
  origin_raw: string;
  destination_raw: string;
  cargo_type: string;
  status: string;
  created_at: string;
  posted_by_email?: string;
  rejection_reason?: string;
}

type TabType = 'overview' | 'pending' | 'loads' | 'bulk' | 'users';

const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingLoads, setPendingLoads] = useState<Load[]>([]);
  const [allLoads, setAllLoads] = useState<Load[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [parsedLoads, setParsedLoads] = useState<any[]>([]);
  const [editingLoad, setEditingLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadStats();
    loadPendingLoads();
    loadAllLoads();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/v1/admin/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingLoads = async () => {
    try {
      const response = await fetch('/api/v1/admin/pending', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setPendingLoads(data.data.loads);
      }
    } catch (error) {
      console.error('Failed to load pending loads:', error);
    }
  };

  const loadAllLoads = async () => {
    try {
      const response = await fetch('/api/v1/admin/loads?limit=50', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setAllLoads(data.data.loads);
      }
    } catch (error) {
      console.error('Failed to load loads:', error);
    }
  };

  const handleApproveLoad = async (loadId: string) => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/v1/admin/loads/${loadId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (data.success) {
        loadPendingLoads();
        loadAllLoads();
        loadStats();
      }
    } catch (error) {
      console.error('Failed to approve load:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectLoad = async (loadId: string, reason: string) => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/v1/admin/loads/${loadId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (data.success) {
        loadPendingLoads();
        loadAllLoads();
        loadStats();
      }
    } catch (error) {
      console.error('Failed to reject load:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleParseBulk = async () => {
    if (!bulkText.trim()) return;
    setProcessing(true);
    try {
      const response = await fetch('/api/v1/admin/parse-bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: bulkText }),
      });
      const data = await response.json();
      if (data.success) {
        setParsedLoads(data.data.loads || []);
      }
    } catch (error) {
      console.error('Failed to parse bulk:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkCreate = async () => {
    if (parsedLoads.length === 0) return;
    setProcessing(true);
    try {
      const response = await fetch('/api/v1/admin/bulk-create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ loads: parsedLoads }),
      });
      const data = await response.json();
      if (data.success) {
        alert(`${data.data.count} loads created successfully!`);
        setBulkText('');
        setParsedLoads([]);
        loadAllLoads();
        loadStats();
      }
    } catch (error) {
      console.error('Failed to bulk create:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteLoad = async (loadId: string) => {
    if (!confirm('Are you sure you want to delete this load?')) return;
    try {
      await fetch(`/api/v1/admin/loads/${loadId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Admin deleted' }),
      });
      loadAllLoads();
      loadStats();
    } catch (error) {
      console.error('Failed to delete load:', error);
    }
  };

  if (loading) {
    return (
      <div className="admin-page loading">
        <div className="loading-spinner" />
        <p>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Admin Panel</h1>
        <p>Manage FreightLink loads and users</p>
      </header>

      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Eye size={18} />
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <Clock size={18} />
          Pending ({pendingLoads.length})
        </button>
        <button
          className={`tab ${activeTab === 'loads' ? 'active' : ''}`}
          onClick={() => setActiveTab('loads')}
        >
          <Package size={18} />
          All Loads
        </button>
        <button
          className={`tab ${activeTab === 'bulk' ? 'active' : ''}`}
          onClick={() => setActiveTab('bulk')}
        >
          <Upload size={18} />
          Bulk Import
        </button>
      </div>

      <div className="admin-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="overview-grid">
            <div className="overview-card">
              <h3>Loads</h3>
              <div className="stats-list">
                <div className="stat-row">
                  <span>Total</span>
                  <strong>{stats.loads.total}</strong>
                </div>
                <div className="stat-row">
                  <span>Pending</span>
                  <strong className="warning">{stats.loads.pending}</strong>
                </div>
                <div className="stat-row">
                  <span>Published</span>
                  <strong className="success">{stats.loads.published}</strong>
                </div>
                <div className="stat-row">
                  <span>Today</span>
                  <strong>{stats.loads.today}</strong>
                </div>
              </div>
            </div>

            <div className="overview-card">
              <h3>Users</h3>
              <div className="stats-list">
                <div className="stat-row">
                  <span>Total</span>
                  <strong>{stats.users.total}</strong>
                </div>
                <div className="stat-row">
                  <span>Active</span>
                  <strong className="success">{stats.users.active}</strong>
                </div>
                <div className="stat-row">
                  <span>New This Week</span>
                  <strong>{stats.users.new_this_week}</strong>
                </div>
              </div>
            </div>

            <div className="overview-card">
              <h3>Revenue</h3>
              <div className="stats-list">
                <div className="stat-row">
                  <span>Total</span>
                  <strong>${parseFloat(stats.revenue.total_revenue || '0').toFixed(2)}</strong>
                </div>
                <div className="stat-row">
                  <span>This Week</span>
                  <strong>${parseFloat(stats.revenue.revenue_this_week || '0').toFixed(2)}</strong>
                </div>
                <div className="stat-row">
                  <span>Transactions</span>
                  <strong>{stats.revenue.total_transactions}</strong>
                </div>
              </div>
            </div>

            <div className="overview-card">
              <h3>Unlocks</h3>
              <div className="stats-list">
                <div className="stat-row">
                  <span>Total</span>
                  <strong>{stats.unlocks.total}</strong>
                </div>
                <div className="stat-row">
                  <span>This Week</span>
                  <strong>{stats.unlocks.this_week}</strong>
                </div>
                <div className="stat-row">
                  <span>This Month</span>
                  <strong>{stats.unlocks.this_month}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending Loads Tab */}
        {activeTab === 'pending' && (
          <div className="pending-section">
            {pendingLoads.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={48} />
                <h3>All caught up!</h3>
                <p>No loads pending review</p>
              </div>
            ) : (
              <div className="loads-list">
                {pendingLoads.map((load) => (
                  <div key={load.id} className="load-item">
                    <div className="load-info">
                      <span className="load-route">
                        {load.origin_raw} → {load.destination_raw}
                      </span>
                      <span className="load-meta">
                        {load.cargo_type} • {load.public_id} • {new Date(load.created_at).toLocaleDateString()}
                      </span>
                      {load.posted_by_email && (
                        <span className="load-poster">Posted by: {load.posted_by_email}</span>
                      )}
                    </div>
                    <div className="load-actions">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApproveLoad(load.id)}
                        disabled={processing}
                      >
                        <CheckCircle size={16} />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          const reason = prompt('Enter rejection reason:');
                          if (reason) handleRejectLoad(load.id, reason);
                        }}
                        disabled={processing}
                      >
                        <XCircle size={16} />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Loads Tab */}
        {activeTab === 'loads' && (
          <div className="all-loads-section">
            <div className="loads-list">
              {allLoads.map((load) => (
                <div key={load.id} className="load-item">
                  <div className="load-info">
                    <span className="load-route">
                      {load.origin_raw} → {load.destination_raw}
                    </span>
                    <span className="load-meta">
                      {load.cargo_type} • {load.public_id}
                    </span>
                    <span className={`load-status status-${load.status}`}>
                      {load.status}
                    </span>
                  </div>
                  <div className="load-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLoad(load)}
                    >
                      <Edit2 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLoad(load.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Import Tab */}
        {activeTab === 'bulk' && (
          <div className="bulk-section">
            <div className="bulk-input">
              <label>
                <Upload size={18} />
                Paste Chain Messages
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Paste WhatsApp chain messages here. The AI will extract individual loads..."
                rows={10}
              />
              <div className="bulk-actions">
                <Button
                  variant="primary"
                  onClick={handleParseBulk}
                  disabled={!bulkText.trim() || processing}
                >
                  {processing ? 'Parsing...' : 'Parse Messages'}
                </Button>
              </div>
            </div>

            {parsedLoads.length > 0 && (
              <div className="parsed-loads">
                <h3>Extracted Loads ({parsedLoads.length})</h3>
                <div className="parsed-list">
                  {parsedLoads.map((load, index) => (
                    <div key={index} className="parsed-item">
                      <div className="parsed-info">
                        <strong>{load.origin} → {load.destination}</strong>
                        <span>{load.cargoType || 'General cargo'}</span>
                        {load.price && <span>${load.price}</span>}
                        {load._needsReview && (
                          <span className="review-badge">
                            <AlertTriangle size={12} />
                            Needs Review
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="primary"
                  onClick={handleBulkCreate}
                  disabled={processing}
                >
                  Create {parsedLoads.length} Loads
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingLoad && (
        <div className="modal-overlay" onClick={() => setEditingLoad(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Load</h2>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setEditingLoad(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
