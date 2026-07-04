import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { MapPin, Truck, Calendar, Package, DollarSign, Clock, Phone, User, Building, TriangleAlert as AlertTriangle, Lock, ChevronLeft } from 'lucide-react';
import Button from '../../components/Button';
import { loadsApi, unlockApi } from '../../services/api';
import type { Load, UnlockResult } from '../../types';
import './LoadDetailPage.css';

const LoadDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [load, setLoad] = useState<Load | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockResult, setUnlockResult] = useState<UnlockResult | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [_error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchLoad(id);
      if (searchParams.get('unlock') === 'true') {
        handleUnlock();
      }
    }
  }, [id]);

  const fetchLoad = async (loadId: string) => {
    try {
      setIsLoading(true);
      const data = await loadsApi.get(loadId);
      setLoad(data);

      // Check unlock status
      try {
        const status = await unlockApi.getStatus(loadId);
        setIsUnlocked(status.isUnlocked);
        if (status.contact) {
          setUnlockResult({
            unlockId: '',
            accessExpiresAt: status.accessExpiresAt || '',
            contact: status.contact,
          });
        }
      } catch (e) {
        // Not unlocked
      }
    } catch (err) {
      setError('Failed to load details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!load) return;

    setIsUnlocking(true);
    try {
      const result = await unlockApi.unlock(load.id, 'wallet');
      setUnlockResult(result);
      setIsUnlocked(true);
    } catch (err: any) {
      setError(err.message || 'Failed to unlock. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const formatPrice = (price: number | null, currency: string) => {
    if (!price) return 'Price on request';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Flexible';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="load-detail loading">
        <div className="loading-spinner" />
        <p>Loading load details...</p>
      </div>
    );
  }

  if (!load) {
    return (
      <div className="load-detail error">
        <h2>Load not found</h2>
        <p>The load you're looking for doesn't exist or has been removed.</p>
        <Button onClick={() => navigate('/loads')}>Browse Loads</Button>
      </div>
    );
  }

  return (
    <div className="load-detail">
      <div className="load-detail__container">
        <button className="back-link" onClick={() => navigate('/loads')}>
          <ChevronLeft size={20} />
          Back to Browse
        </button>

        <div className="load-detail__header">
          <h1 className="load-detail__title">
            {load.origin} → {load.destination}
          </h1>
          <div className="load-detail__id">#{load.publicId}</div>
        </div>

        <div className="load-detail__content">
          <div className="load-detail__main">
            {/* Route Section */}
            <section className="detail-card">
              <h2 className="detail-card__title">Route Details</h2>
              <div className="route-visual">
                <div className="route-point route-point--origin">
                  <MapPin className="route-icon route-icon--origin" />
                  <div className="route-info">
                    <span className="route-label">Origin</span>
                    <span className="route-value">{load.origin}</span>
                    {load.originCountry && (
                      <span className="route-country">{load.originCountry}</span>
                    )}
                  </div>
                </div>
                <div className="route-connector">
                  <div className="route-connector-line"></div>
                </div>
                <div className="route-point route-point--dest">
                  <MapPin className="route-icon route-icon--dest" />
                  <div className="route-info">
                    <span className="route-label">Destination</span>
                    <span className="route-value">{load.destination}</span>
                    {load.destinationCountry && (
                      <span className="route-country">{load.destinationCountry}</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Cargo Section */}
            <section className="detail-card">
              <h2 className="detail-card__title">Cargo Information</h2>
              <div className="info-grid">
                <div className="info-item">
                  <Package className="info-icon" />
                  <div className="info-content">
                    <span className="info-label">Cargo Type</span>
                    <span className="info-value">{load.cargoType || 'General cargo'}</span>
                  </div>
                </div>

                <div className="info-item">
                  <Truck className="info-icon" />
                  <div className="info-content">
                    <span className="info-label">Truck Required</span>
                    <span className="info-value">
                      {load.truckType || 'Any'}
                      {load.numberOfTrucks > 1 && ` (${load.numberOfTrucks} trucks)`}
                    </span>
                  </div>
                </div>

                <div className="info-item">
                  <Calendar className="info-icon" />
                  <div className="info-content">
                    <span className="info-label">Pickup Date</span>
                    <span className="info-value">{formatDate(load.pickupDate)}</span>
                  </div>
                </div>

                <div className="info-item">
                  <Calendar className="info-icon" />
                  <div className="info-content">
                    <span className="info-label">Delivery Date</span>
                    <span className="info-value">{formatDate(load.deliveryDate)}</span>
                  </div>
                </div>

                {load.weightKg && (
                  <div className="info-item">
                    <Package className="info-icon" />
                    <div className="info-content">
                      <span className="info-label">Weight</span>
                      <span className="info-value">{load.weightKg.toLocaleString()} kg</span>
                    </div>
                  </div>
                )}

                {load.isHazardous && (
                  <div className="info-item info-item--hazardous">
                    <AlertTriangle className="info-icon" />
                    <div className="info-content">
                      <span className="info-label">Hazardous Cargo</span>
                      <span className="info-value">Special handling required</span>
                    </div>
                  </div>
                )}
              </div>

              {load.description && (
                <div className="info-description">
                  <h3>Description</h3>
                  <p>{load.description}</p>
                </div>
              )}
            </section>

            {/* Pricing Section */}
            <section className="detail-card">
              <h2 className="detail-card__title">Pricing</h2>
              <div className="pricing-display">
                <DollarSign className="pricing-icon" />
                <div className="pricing-content">
                  <span className="pricing-value">
                    {formatPrice(load.price, load.currency)}
                    {load.priceNegotiable && <span className="negotiable">Negotiable</span>}
                  </span>
                  {load.pricePerTon && (
                    <span className="pricing-per-ton">
                      ({formatPrice(load.pricePerTon, load.currency)}/ton)
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="load-detail__sidebar">
            {/* Unlock Section */}
            <div className={`unlock-card ${isUnlocked ? 'unlock-card--unlocked' : ''}`}>
              {isUnlocked && unlockResult ? (
                <>
                  <div className="unlock-card__header">
                    <Lock className="unlock-icon unlock-icon--unlocked" />
                    <h3>Contact Unlocked</h3>
                  </div>

                  <div className="broker-info">
                    <div className="broker-detail">
                      <Phone className="broker-icon" />
                      <div>
                        <span className="broker-label">Phone</span>
                        <a href={`tel:${unlockResult.contact.phone}`} className="broker-value">
                          {unlockResult.contact.phone}
                        </a>
                      </div>
                    </div>

                    <div className="broker-detail">
                      <Phone className="broker-icon" />
                      <div>
                        <span className="broker-label">WhatsApp</span>
                        <a
                          href={`https://wa.me/${unlockResult.contact.whatsapp?.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="broker-value"
                        >
                          {unlockResult.contact.whatsapp}
                        </a>
                      </div>
                    </div>

                    {unlockResult.contact.brokerName && (
                      <div className="broker-detail">
                        <User className="broker-icon" />
                        <div>
                          <span className="broker-label">Broker</span>
                          <span className="broker-value">{unlockResult.contact.brokerName}</span>
                        </div>
                      </div>
                    )}

                    {unlockResult.contact.brokerCompany && (
                      <div className="broker-detail">
                        <Building className="broker-icon" />
                        <div>
                          <span className="broker-label">Company</span>
                          <span className="broker-value">{unlockResult.contact.brokerCompany}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="unlock-expires">
                    Access expires: {new Date(unlockResult.accessExpiresAt).toLocaleString()}
                  </p>
                </>
              ) : (
                <>
                  <div className="unlock-card__header">
                    <Lock className="unlock-icon" />
                    <h3>Contact Locked</h3>
                  </div>

                  <p className="unlock-card__description">
                    Unlock to view broker contact details and connect directly
                  </p>

                  <div className="unlock-price">
                    <span className="unlock-price-value">$2.00</span>
                    <span className="unlock-price-label">one-time fee</span>
                  </div>

                  <Button
                    variant="primary"
                    fullWidth
                    onClick={handleUnlock}
                    isLoading={isUnlocking}
                  >
                    Unlock Contact
                  </Button>

                  <p className="unlock-note">
                    24-hour access to contact details
                  </p>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="stats-card">
              <div className="stat">
                <Clock className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{load.viewCount}</span>
                  <span className="stat-label">Views</span>
                </div>
              </div>
              <div className="stat">
                <Lock className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{load.unlockCount}</span>
                  <span className="stat-label">Unlocks</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadDetailPage;
