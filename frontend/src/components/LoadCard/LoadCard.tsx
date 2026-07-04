import React from 'react';
import { MapPin, Truck, Calendar, DollarSign, Eye, Package, TriangleAlert as AlertTriangle, Clock } from 'lucide-react';
import type { Load } from '../../types';
import './LoadCard.css';

interface LoadCardProps {
  load: Load;
  onUnlock?: (loadId: string) => void;
  onView?: (loadId: string) => void;
  isUnlocked?: boolean;
  showStatus?: boolean;
  highlight?: boolean;
}

const LoadCard: React.FC<LoadCardProps> = ({
  load,
  onUnlock,
  onView,
  isUnlocked = false,
  showStatus = false,
  highlight = false,
}) => {
  const formatPrice = (price: number | null, currency: string) => {
    if (!price) return 'Price on request';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Flexible';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getConfidenceBadge = () => {
    if (!load.aiConfidenceLevel) return null;

    const colors = {
      high: 'confidence--high',
      medium: 'confidence--medium',
      low: 'confidence--low',
      failed: 'confidence--failed',
    };

    return (
      <span className={`load-card__confidence ${colors[load.aiConfidenceLevel] || ''}`}>
        {load.aiConfidenceLevel === 'high' && 'Verified'}
        {load.aiConfidenceLevel === 'medium' && 'Review'}
        {load.aiConfidenceLevel === 'low' && 'Check'}
      </span>
    );
  };

  const getStatusBadge = () => {
    if (!showStatus) return null;

    const statusColors: Record<string, string> = {
      published: 'status--published',
      pending_review: 'status--pending',
      moderation: 'status--moderation',
      expired: 'status--expired',
      rejected: 'status--rejected',
    };

    return (
      <span className={`load-card__status ${statusColors[load.status] || ''}`}>
        {load.status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <article className={`load-card ${highlight ? 'load-card--highlight' : ''}`} onClick={() => onView?.(load.id)}>
      <div className="load-card__header">
        <div className="load-card__route">
          <div className="load-card__location load-card__location--origin">
            <MapPin size={16} />
            <span>{load.origin}</span>
          </div>
          <div className="load-card__connector">
            <div className="load-card__connector-line"></div>
          </div>
          <div className="load-card__location load-card__location--destination">
            <MapPin size={16} />
            <span>{load.destination}</span>
          </div>
        </div>
        <div className="load-card__badges">
          {getConfidenceBadge()}
          {getStatusBadge()}
          {load.isHazardous && (
            <span className="load-card__hazardous">
              <AlertTriangle size={14} />
            </span>
          )}
        </div>
      </div>

      <div className="load-card__body">
        {load.cargoType && (
          <div className="load-card__info">
            <Package size={18} className="load-card__icon" />
            <span className="load-card__value">{load.cargoType}</span>
          </div>
        )}

        <div className="load-card__info">
          <Truck size={18} className="load-card__icon" />
          <span className="load-card__value">
            {load.truckType || 'Any truck'}
            {load.numberOfTrucks > 1 && ` (${load.numberOfTrucks})`}
          </span>
        </div>

        <div className="load-card__info">
          <Calendar size={18} className="load-card__icon" />
          <span className="load-card__value">
            {formatDate(load.pickupDate)}
            {load.deliveryDate && ` → ${formatDate(load.deliveryDate)}`}
          </span>
        </div>

        <div className="load-card__info load-card__info--price">
          <DollarSign size={18} className="load-card__icon" />
          <span className="load-card__value">
            {formatPrice(load.price, load.currency)}
            {load.priceNegotiable && <span className="load-card__negotiable">nego</span>}
          </span>
        </div>
      </div>

      <div className="load-card__footer">
        <div className="load-card__meta">
          <span className="load-card__id">#{load.publicId}</span>
          <div className="load-card__stats">
            <span className="load-card__stat">
              <Eye size={14} />
              {load.viewCount}
            </span>
          </div>
          <span className="load-card__time">
            <Clock size={14} />
            {new Date(load.createdAt).toLocaleDateString()}
          </span>
        </div>

        <div className="load-card__actions">
          {isUnlocked ? (
            <button
              className="load-card__unlocked"
              onClick={(e) => {
                e.stopPropagation();
                onView?.(load.id);
              }}
            >
              View Contact
            </button>
          ) : (
            <button
              className="load-card__unlock"
              onClick={(e) => {
                e.stopPropagation();
                onUnlock?.(load.id);
              }}
            >
              Unlock Contact
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default LoadCard;
