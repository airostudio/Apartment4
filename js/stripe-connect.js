/**
 * Cascade Apartment 4 - Stripe Payment Integration
 * Handles: payment processing and checkout flow
 *
 * NOTE: This module requires the Stripe.js library to be loaded:
 * <script src="https://js.stripe.com/v3/"></script>
 *
 * The publishable key is loaded from localStorage (set via admin/payments.html).
 * Secret key operations must be performed server-side.
 */

(function() {
  'use strict';

  var LS_KEY = 'cascade_stripe_settings';

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(e) { return {}; }
  }

  var StripePayment = {
    stripe: null,
    elements: null,
    cardElement: null,

    config: {
      locale: 'en-AU',
      currency: 'aud',
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0f2744',
          colorBackground: '#ffffff',
          colorText: '#2d2926',
          colorDanger: '#e74c3c',
          fontFamily: 'Inter, sans-serif',
          spacingUnit: '4px',
          borderRadius: '8px'
        }
      }
    },

    /**
     * Initialise Stripe with the publishable key stored by the admin.
     */
    init() {
      if (typeof Stripe === 'undefined') {
        console.warn('Stripe.js not loaded. Payment processing unavailable.');
        this.showPlaceholder();
        return;
      }

      var settings = getSettings();
      var publishableKey = settings.publishableKey || '';

      if (!publishableKey) {
        console.warn('Stripe publishable key not configured. Visit Admin \u2192 Stripe Settings.');
        this.showPlaceholder();
        return;
      }

      try {
        this.stripe = Stripe(publishableKey);
        this.createElements();
      } catch (e) {
        console.warn('Failed to initialise Stripe:', e.message);
        this.showPlaceholder();
      }
    },

    /**
     * Create Stripe Elements card input.
     */
    createElements() {
      var cardContainer = document.getElementById('stripe-card-element');
      if (!cardContainer || !this.stripe) return;

      this.elements = this.stripe.elements({ appearance: this.config.appearance });

      this.cardElement = this.elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            color: '#2d2926',
            fontFamily: 'Inter, sans-serif',
            '::placeholder': { color: '#b8b0a4' }
          },
          invalid: { color: '#e74c3c' }
        }
      });

      this.cardElement.mount('#stripe-card-element');

      this.cardElement.on('change', function(event) {
        var errorEl = document.getElementById('card-errors');
        if (errorEl) errorEl.textContent = event.error ? event.error.message : '';
      });
    },

    /**
     * Show a placeholder when Stripe cannot be loaded.
     */
    showPlaceholder() {
      var cardContainer = document.getElementById('stripe-card-element');
      if (cardContainer) {
        cardContainer.innerHTML =
          '<div style="padding:16px;border:2px dashed var(--color-light);border-radius:8px;text-align:center;color:var(--color-gray);">' +
          '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 auto 8px;">' +
          '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
          '<p style="font-size:14px;margin-bottom:4px;">Stripe Payment Element</p>' +
          '<p style="font-size:12px;opacity:.7;">Configure your Stripe keys in Admin \u2192 Stripe Settings</p>' +
          '</div>';
      }
    },

    /**
     * Process a payment.
     * In production: create a PaymentIntent server-side, return the client_secret,
     * then call stripe.confirmCardPayment(clientSecret, { payment_method: { card: ... } }).
     */
    async processPayment(bookingData) {
      if (!this.stripe || !this.cardElement) {
        throw new Error('Stripe not initialised');
      }

      var billingDetails = {
        name: bookingData.cardholderName,
        email: bookingData.email,
        address: {
          line1: bookingData.address,
          city: bookingData.city,
          state: bookingData.state,
          postal_code: bookingData.postcode,
          country: bookingData.country || 'AU'
        }
      };

      // Production flow:
      // 1. POST booking data to your server
      // 2. Server calls stripe.paymentIntents.create({ amount, currency, ... })
      // 3. Server returns { clientSecret }
      // 4. Call stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, billing_details: billingDetails } })

      console.log('Payment would be processed:', {
        amount: bookingData.amount,
        currency: getSettings().currency || this.config.currency,
        billingDetails: billingDetails
      });

      return {
        success: true,
        paymentIntentId: 'pi_simulated_' + Date.now(),
        status: 'succeeded'
      };
    },

    /**
     * Create a refund (server-side operation).
     */
    async createRefund(paymentIntentId, amount, reason) {
      console.log('Refund would be processed:', { paymentIntentId, amount, reason });
      return { success: true, refundId: 'rf_simulated_' + Date.now(), status: 'succeeded' };
    }
  };

  // ============================================
  // Checkout Form Handler
  // ============================================
  function initCheckoutForm() {
    var form = document.getElementById('checkoutForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      var submitBtn = form.querySelector('button[type="submit"]');
      var originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
      }

      try {
        var formData = new FormData(form);
        var data = Object.fromEntries(formData);

        var result = await StripePayment.processPayment({
          cardholderName: data.cardholderName,
          email: data.email,
          address: data.address,
          city: data.city,
          state: data.state,
          postcode: data.postcode,
          country: data.country,
          amount: parseInt(data.amount) || 0
        });

        if (result.success) {
          window.CascadeApt4?.showToast('Payment successful!', 'success');
          window.location.href = 'confirmation.html?ref=' +
            (window.CascadeApt4?.BookingEngine?.generateReference() || 'TRA-2026-00001');
        }
      } catch (error) {
        window.CascadeApt4?.showToast(error.message || 'Payment failed. Please try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }

  // ============================================
  // Initialise
  // ============================================
  function init() {
    StripePayment.init();
    initCheckoutForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CascadeApt4 = window.CascadeApt4 || {};
  window.CascadeApt4.StripePayment = StripePayment;
})();
