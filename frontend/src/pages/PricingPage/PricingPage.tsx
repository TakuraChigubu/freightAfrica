import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { pricingApi } from '../../services/api';
import type { PricingInfo, PricingBundle } from '../../types';
import './PricingPage.css';

const paymentMethods = [
  { id: 'ecocash', name: 'EcoCash', icon: Smartphone, description: 'Pay with EcoCash mobile money' },
  { id: 'onemoney', name: 'OneMoney', icon: Smartphone, description: 'Pay with OneMoney mobile money' },
  { id: 'zipit', name: 'ZIPIT', icon: CreditCard, description: 'Bank transfer via ZIPIT' },
  { id: 'card', name: 'Card', icon: CreditCard, description: 'Visa or Mastercard' },
  { id: 'wallet', name: 'Wallet', icon: Wallet, description: 'Use your FreightLink wallet' },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const [pricingInfo, setPricingInfo] = useState<PricingInfo | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<PricingBundle | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string>('ecocash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      const data = await pricingApi.getPricing();
      setPricingInfo(data);
      const defaultBundle = data.bundles.find(b => b.isDefault);
      if (defaultBundle) {
        setSelectedBundle(defaultBundle);
      }
    } catch (err) {
      setError('Failed to load pricing information');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedBundle) return;

    if (selectedPayment !== 'wallet' && !phoneNumber) {
      setError('Please enter your phone number');
      return;
    }

    setPurchasing(true);
    setError(null);

    try {
      const result = await pricingApi.purchaseBundle({
        bundleType: selectedBundle.id,
        paymentMethod: selectedPayment as any,
        phoneNumber: selectedPayment !== 'wallet' ? phoneNumber : undefined,
        idempotencyKey: `purchase-${Date.now()}`,
      });

      if (result.paymentStatus === 'confirmed') {
        navigate('/dashboard', {
          state: { message: 'Bundle purchased successfully! You can now unlock contacts.' }
        });
      } else if (result.paynowRedirectUrl) {
        window.location.href = result.paynowRedirectUrl;
      } else if (result.paynowPollUrl) {
        navigate('/payment/pending', {
          state: {
            paymentId: result.paymentId,
            pollUrl: result.paynowPollUrl,
            bundleName: selectedBundle.name,
          }
        });
      }
    } catch (err: any) {
      setError(err.message || 'Purchase failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="pricing-page">
        <div className="pricing-loading">Loading pricing...</div>
      </div>
    );
  }

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <h1>Unlock Load Contacts</h1>
        <p>Purchase credits to unlock broker contact details</p>
      </header>

      {pricingInfo && (
        <div className="pricing-info-bar">
          <span>
            Browse loads for free. Pay only when you need contact details.
          </span>
          <span className="pricing-duration">
            Unlock access lasts {pricingInfo.unlockDurationHours} hours
          </span>
        </div>
      )}

      <div className="pricing-content">
        <section className="bundles-section">
          <h2>Select a Bundle</h2>
          <div className="bundles-grid">
            {pricingInfo?.bundles.map((bundle) => (
              <div
                key={bundle.id}
                className={`bundle-card ${selectedBundle?.id === bundle.id ? 'selected' : ''}`}
                onClick={() => setSelectedBundle(bundle)}
              >
                {bundle.isDefault && <div className="bundle-badge">Popular</div>}
                <h3>{bundle.name}</h3>
                <div className="bundle-price">
                  <span className="price-amount">${bundle.price.toFixed(2)}</span>
                  <span className="price-currency">USD</span>
                </div>
                <div className="bundle-per-unlock">
                  ${bundle.pricePerUnlock.toFixed(2)} per unlock
                </div>
                {bundle.savingsPercent > 0 && (
                  <div className="bundle-savings">
                    Save {bundle.savingsPercent}%
                  </div>
                )}
                <div className="bundle-description">{bundle.description}</div>
                <div className="bundle-check">
                  {selectedBundle?.id === bundle.id && <Check size={24} />}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="payment-section">
          <h2>Payment Method</h2>
          <div className="payment-methods">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                className={`payment-method ${selectedPayment === method.id ? 'selected' : ''}`}
                onClick={() => setSelectedPayment(method.id)}
              >
                <method.icon size={24} />
                <span>{method.name}</span>
              </button>
            ))}
          </div>

          {selectedPayment !== 'wallet' && (
            <div className="phone-input-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                placeholder="e.g., 0771234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                pattern="[0-9]{10,}"
                required
              />
              <small>Enter the number registered with your payment method</small>
            </div>
          )}

          {error && <div className="pricing-error">{error}</div>}

          <button
            className="purchase-button"
            onClick={handlePurchase}
            disabled={!selectedBundle || purchasing}
          >
            {purchasing
              ? 'Processing...'
              : selectedBundle
                ? `Pay $${selectedBundle.price.toFixed(2)}`
                : 'Select a bundle'}
          </button>
        </section>

        <section className="pricing-faq">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-item">
            <h3>How do unlocks work?</h3>
            <p>
              After purchasing a bundle, you can unlock contact details for any load.
              Each unlock gives you access to the broker's phone number, WhatsApp, and
              company name for 24 hours.
            </p>
          </div>
          <div className="faq-item">
            <h3>Do credits expire?</h3>
            <p>
              Your purchased credits never expire. Use them whenever you need to
              contact a broker about a load.
            </p>
          </div>
          <div className="faq-item">
            <h3>What payment methods are accepted?</h3>
            <p>
              We accept EcoCash, OneMoney, ZIPIT bank transfers, and Visa/Mastercard
              through Paynow Zimbabwe.
            </p>
          </div>
        </section>
      </div>

      <footer className="pricing-footer">
        <p>
          Secure payment processing by Paynow Zimbabwe.
          Contact support@freightlink.africa for assistance.
        </p>
      </footer>
    </div>
  );
}
