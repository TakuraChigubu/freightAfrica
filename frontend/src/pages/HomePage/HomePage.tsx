import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, TrendingUp, Shield, Zap, Users, ArrowRight } from 'lucide-react';
import Button from '../../components/Button';
import { loadsApi } from '../../services/api';
import type { Load } from '../../types';
import LoadCard from '../../components/LoadCard';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [featuredLoads, setFeaturedLoads] = useState<Load[]>([]);
  const [stats, setStats] = useState({
    totalLoads: 0,
    countries: 5,
    brokers: 0,
    successRate: 98,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [loadsResponse, statsResponse] = await Promise.all([
          loadsApi.list({ limit: 3, sortBy: 'view_count', sortOrder: 'DESC' }),
          loadsApi.getStats(),
        ]);

        if ('data' in loadsResponse) {
          setFeaturedLoads(loadsResponse.data);
        }

        if (statsResponse) {
          setStats(prev => ({
            ...prev,
            totalLoads: statsResponse.total || 0,
            brokers: Math.floor((statsResponse.total || 0) * 0.1) || 50,
          }));
        }
      } catch (error) {
        console.error('Failed to fetch homepage data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = formData.get('search');
    navigate(`/loads?search=${encodeURIComponent(search as string)}`);
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__container">
          <div className="hero__content">
            <h1 className="hero__title">
              Connect with <span className="hero__highlight">Freight</span> Across Africa
            </h1>
            <p className="hero__subtitle">
              The AI-powered marketplace connecting brokers, shippers, and transport companies.
              Find loads, unlock broker contacts, and move freight efficiently.
            </p>

            <form className="hero__search" onSubmit={handleSearch}>
              <div className="hero__search-icon">
                <Search size={20} />
              </div>
              <input
                type="text"
                name="search"
                placeholder="Search origin, destination, or cargo type..."
                className="hero__search-input"
              />
              <Button type="submit" variant="primary" size="lg">
                Find Loads
              </Button>
            </form>

            <div className="hero__stats">
              <div className="hero__stat">
                <span className="hero__stat-value">{stats.totalLoads.toLocaleString()}+</span>
                <span className="hero__stat-label">Active Loads</span>
              </div>
              <div className="hero__stat">
                <span className="hero__stat-value">{stats.countries}</span>
                <span className="hero__stat-label">Countries</span>
              </div>
              <div className="hero__stat">
                <span className="hero__stat-value">{stats.brokers.toLocaleString()}+</span>
                <span className="hero__stat-label">Brokers</span>
              </div>
            </div>
          </div>

          <div className="hero__image">
            <div className="hero__illustration">
              <div className="hero__route">
                <MapPin className="hero__pin hero__pin--origin" />
                <div className="hero__path"></div>
                <MapPin className="hero__pin hero__pin--dest" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Loads */}
      <section className="featured">
        <div className="featured__container">
          <div className="featured__header">
            <h2 className="featured__title">Trending Loads</h2>
            <Button variant="ghost" onClick={() => navigate('/loads')}>
              View All <ArrowRight size={16} />
            </Button>
          </div>

          <div className="featured__grid">
            {isLoading ? (
              <p className="featured__loading">Loading...</p>
            ) : featuredLoads.length > 0 ? (
              featuredLoads.map(load => (
                <LoadCard
                  key={load.id}
                  load={load}
                  onView={(id) => navigate(`/loads/${id}`)}
                  onUnlock={(id) => navigate(`/loads/${id}?unlock=true`)}
                />
              ))
            ) : (
              <p className="featured__empty">No loads available. Check back soon!</p>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div className="features__container">
          <h2 className="features__title">Why FreightLink Africa?</h2>

          <div className="features__grid">
            <div className="feature-card">
              <div className="feature-card__icon feature-card__icon--ai">
                <Zap size={24} />
              </div>
              <h3 className="feature-card__title">AI-Powered Parsing</h3>
              <p className="feature-card__description">
                WhatsApp messages are automatically parsed and structured using Google Gemini AI.
                Get accurate load details in seconds.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card__icon feature-card__icon--shield">
                <Shield size={24} />
              </div>
              <h3 className="feature-card__title">Verified Brokers</h3>
              <p className="feature-card__description">
                AI confidence scoring helps identify reliable loads. Verified brokers get priority
                listing for better visibility.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card__icon feature-card__icon--trending">
                <TrendingUp size={24} />
              </div>
              <h3 className="feature-card__title">Fair Pricing</h3>
              <p className="feature-card__description">
                Transparent unlock pricing. Pay only when you need broker contact details.
                No subscriptions, no hidden fees.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card__icon feature-card__icon--users">
                <Users size={24} />
              </div>
              <h3 className="feature-card__title">Growing Network</h3>
              <p className="feature-card__description">
                Connect with brokers, shippers, and transport companies across Zimbabwe, South Africa,
                Botswana, Zambia, and Mozambique.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="cta__container">
          <div className="cta__content">
            <h2 className="cta__title">Ready to move freight?</h2>
            <p className="cta__description">
              Join thousands of transport professionals already using FreightLink Africa.
            </p>
            <div className="cta__buttons">
              <Button variant="primary" size="lg" onClick={() => navigate('/register')}>
                Get Started Free
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('/loads')}>
                Browse Loads
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer__container">
          <div className="footer__content">
            <div className="footer__brand">
              <span className="footer__logo">FreightLink Africa</span>
              <p className="footer__tagline">
                Powering freight logistics across Africa.
              </p>
            </div>

            <div className="footer__links">
              <div className="footer__column">
                <h4 className="footer__heading">Platform</h4>
                <a href="/loads" className="footer__link">Browse Loads</a>
                <a href="/register" className="footer__link">Post a Load</a>
                <a href="/pricing" className="footer__link">Pricing</a>
              </div>

              <div className="footer__column">
                <h4 className="footer__heading">Support</h4>
                <a href="/help" className="footer__link">Help Center</a>
                <a href="/contact" className="footer__link">Contact Us</a>
                <a href="/api" className="footer__link">API Docs</a>
              </div>

              <div className="footer__column">
                <h4 className="footer__heading">Legal</h4>
                <a href="/terms" className="footer__link">Terms of Service</a>
                <a href="/privacy" className="footer__link">Privacy Policy</a>
              </div>
            </div>
          </div>

          <div className="footer__bottom">
            <p className="footer__copyright">
              &copy; {new Date().getFullYear()} FreightLink Africa. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
