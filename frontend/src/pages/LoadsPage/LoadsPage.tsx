import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ListFilter as Filter, ChevronDown, MapPin, X } from 'lucide-react';
import Button from '../../components/Button';
import LoadCard from '../../components/LoadCard';
import { loadsApi } from '../../services/api';
import type { Load, Pagination } from '../../types';
import './LoadsPage.css';

const LoadsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loads, setLoads] = useState<Load[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Filter state
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [originCountry, setOriginCountry] = useState(searchParams.get('originCountry') || '');
  const [destinationCountry, setDestinationCountry] = useState(searchParams.get('destinationCountry') || '');

  const countries = ['Zimbabwe', 'South Africa', 'Botswana', 'Zambia', 'Mozambique'];

  useEffect(() => {
    fetchLoads();
  }, [searchParams]);

  const fetchLoads = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        page: parseInt(searchParams.get('page') || '1'),
        limit: 12,
        search: searchParams.get('search') || undefined,
        originCountry: searchParams.get('originCountry') || undefined,
        destinationCountry: searchParams.get('destinationCountry') || undefined,
      };

      const response = await loadsApi.list(params);

      if ('data' in response) {
        setLoads(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch loads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (originCountry) params.set('originCountry', originCountry);
    if (destinationCountry) params.set('destinationCountry', destinationCountry);
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearch('');
    setOriginCountry('');
    setDestinationCountry('');
    setSearchParams(new URLSearchParams());
  };

  const loadPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    setSearchParams(params);
  };

  return (
    <div className="loads-page">
      <div className="loads-page__container">
        <header className="loads-page__header">
          <h1 className="loads-page__title">Browse Freight Loads</h1>
          <p className="loads-page__subtitle">
            Find available loads across Zimbabwe and South Africa
          </p>
        </header>

        <div className="loads-page__toolbar">
          <form className="loads-page__search" onSubmit={handleSearch}>
            <div className="search-input-wrapper">
              <Search className="search-icon" size={20} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search origin, destination, cargo..."
                className="search-input"
              />
            </div>
            <Button type="submit" variant="primary">Search</Button>
          </form>

          <button
            className="filter-toggle"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <Filter size={18} />
            <span>Filters</span>
            <ChevronDown size={16} className={isFilterOpen ? 'rotated' : ''} />
          </button>
        </div>

        {isFilterOpen && (
          <div className="filters-panel">
            <div className="filter-group">
              <label htmlFor="originCountry">Origin Country</label>
              <select
                id="originCountry"
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value)}
              >
                <option value="">All Countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="destinationCountry">Destination Country</label>
              <select
                id="destinationCountry"
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
              >
                <option value="">All Countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <Button variant="ghost" onClick={clearFilters} leftIcon={<X size={16} />}>
              Clear Filters
            </Button>
          </div>
        )}

        <div className="loads-page__results">
          {isLoading ? (
            <div className="loads-page__loading">
              <div className="loading-spinner" />
              <p>Loading loads...</p>
            </div>
          ) : loads.length > 0 ? (
            <>
              <p className="loads-page__count">
                Showing {loads.length} of {pagination?.total || 0} loads
              </p>
              <div className="loads-page__grid">
                {loads.map((load) => (
                  <LoadCard
                    key={load.id}
                    load={load}
                    onView={(id) => window.location.href = `/loads/${id}`}
                    onUnlock={(id) => window.location.href = `/loads/${id}?unlock=true`}
                  />
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="loads-page__pagination">
                  <Button
                    variant="outline"
                    disabled={!pagination.hasPrev}
                    onClick={() => loadPage((pagination.page || 1) - 1)}
                  >
                    Previous
                  </Button>
                  <span className="pagination-info">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!pagination.hasNext}
                    onClick={() => loadPage((pagination.page || 1) + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="loads-page__empty">
              <MapPin size={48} />
              <h3>No loads found</h3>
              <p>Try adjusting your search or filters</p>
              <Button variant="primary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadsPage;
