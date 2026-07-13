import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, DollarSign, Package, Truck, Wrench, MoreHorizontal } from 'lucide-react';
import Button from '../../components/Button';
import type { LucideIcon } from 'lucide-react';
import './MarketplacePage.css';

interface MarketplaceItem {
  id: string;
  publicId: string;
  title: string;
  description: string;
  category: 'vehicle' | 'equipment' | 'goods' | 'other';
  price: number | null;
  priceNegotiable: boolean;
  currency: string;
  location: string;
  country: string;
  imageUrls: string[];
  viewCount: number;
  unlockCount: number;
  createdAt: string;
  expiresAt: string;
}

const categoryIcons: Record<string, LucideIcon> = {
  vehicle: Truck,
  equipment: Wrench,
  goods: Package,
  other: MoreHorizontal,
};

const MarketplacePage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchItems();
  }, [category, page]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (category) params.append('category', category);
      if (search) params.append('search', search);

      const response = await fetch(`/api/v1/marketplace?${params}`);
      const data = await response.json();

      if (data.success) {
        setItems(data.data.items);
        setTotal(data.data.total);
      }
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchItems();
  };

  const formatPrice = (price: number | null, currency: string) => {
    if (!price) return 'Price on request';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  const categories = [
    { id: '', label: 'All' },
    { id: 'vehicle', label: 'Vehicles' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'goods', label: 'Goods' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div className="marketplace-page">
      <header className="marketplace-header">
        <h1>Marketplace</h1>
        <p>Find trucks, equipment, and goods for your transport business</p>
      </header>

      <div className="marketplace-filters">
        <div className="category-tabs">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`category-tab ${category === cat.id ? 'active' : ''}`}
              onClick={() => {
                setCategory(cat.id);
                setPage(1);
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <Button type="submit" variant="primary">Search</Button>
        </form>
      </div>

      <div className="marketplace-content">
        {loading ? (
          <div className="marketplace-loading">Loading items...</div>
        ) : items.length === 0 ? (
          <div className="marketplace-empty">
            <p>No items found</p>
            {search && <p>Try adjusting your search terms</p>}
          </div>
        ) : (
          <div className="items-grid">
            {items.map((item) => {
              const IconComponent = categoryIcons[item.category] || Package;
              return (
                <div
                  key={item.id}
                  className="item-card"
                  onClick={() => navigate(`/marketplace/${item.publicId}`)}
                >
                  <div className="item-image">
                    {item.imageUrls && item.imageUrls.length > 0 ? (
                      <img src={item.imageUrls[0]} alt={item.title} />
                    ) : (
                      <div className="item-image-placeholder">
                        <IconComponent size={48} />
                      </div>
                    )}
                  </div>

                  <div className="item-content">
                    <span className="item-category">{item.category}</span>
                    <h3 className="item-title">{item.title}</h3>

                    <div className="item-location">
                      <MapPin size={16} />
                      <span>{item.location}{item.country ? `, ${item.country}` : ''}</span>
                    </div>

                    <div className="item-price">
                      <DollarSign size={18} />
                      <span className="price-value">{formatPrice(item.price, item.currency)}</span>
                      {item.priceNegotiable && <span className="negotiable">Negotiable</span>}
                    </div>

                    <div className="item-stats">
                      <span>{item.viewCount} views</span>
                      <span>{item.unlockCount} unlocks</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {total > items.length && (
          <div className="pagination">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="outline"
              disabled={items.length < 20}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplacePage;
