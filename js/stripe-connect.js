/**
 * Cascade Apartment 4 — Stripe Payment Integration
 *
 * Requires: <script src="https://js.stripe.com/v3/"></script> in the page head.
 * The publishable key is stored in localStorage via Admin → Stripe Settings.
 * Secret key operations must be handled server-side.
 */

(function () {
  'use strict';

  var LS_KEY = 'cascade_stripe_settings';

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }

  /* ─────────────────────────────────────────────
     Stripe Payment Object
  ───────────────────────────────────────────── */
  var StripePayment = {
    stripe:      null,
    elements:    null,
    cardElement: null,
    cardComplete: false,  // tracked via Stripe's change event
    cardError:   null,    // last error message from Stripe

    config: {
      locale: 'en-AU',
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary:     '#0f2744',
          colorBackground:  '#ffffff',
          colorText:        '#2d2926',
          colorDanger:      '#dc2626',
          fontFamily:       'Inter, sans-serif',
          spacingUnit:      '4px',
          borderRadius:     '8px'
        }
      }
    },

    init: function () {
      if (typeof Stripe === 'undefined') {
        console.warn('Stripe.js not loaded — payment processing unavailable.');
        this.showPlaceholder('Stripe.js could not be loaded. Please check your internet connection and refresh.');
        return;
      }

      var settings = getSettings();
      var publishableKey = settings.publishableKey || '';

      if (!publishableKey) {
        console.warn('Stripe publishable key not configured. Visit Admin → Stripe Settings.');
        this.showPlaceholder('Payment processing is not yet configured. Please contact the host to complete your booking.');
        return;
      }

      try {
        this.stripe = Stripe(publishableKey);
        this.createElements();
      } catch (e) {
        console.warn('Failed to initialise Stripe:', e.message);
        this.showPlaceholder('Could not initialise payment processing. Please refresh the page or contact support.');
      }
    },

    createElements: function () {
      var cardContainer = document.getElementById('stripe-card-element');
      if (!cardContainer || !this.stripe) return;

      this.elements = this.stripe.elements({ appearance: this.config.appearance });

      this.cardElement = this.elements.create('card', {
        style: {
          base: {
            fontSize:    '16px',
            color:       '#2d2926',
            fontFamily:  'Inter, sans-serif',
            '::placeholder': { color: '#9ca3af' }
          },
          invalid: { color: '#dc2626' }
        }
      });

      this.cardElement.mount('#stripe-card-element');

      var self = this;
      this.cardElement.on('change', function (event) {
        self.cardComplete = event.complete;
        self.cardError    = event.error ? event.error.message : null;

        var errorEl = document.getElementById('card-errors');
        if (errorEl) {
          errorEl.textContent = self.cardError || '';
        }

        // Clear the invalid state on the card wrapper once the user starts typing
        var cardWrapper = document.getElementById('stripe-card-element');
        if (cardWrapper && event.error) {
          cardWrapper.classList.add('is-invalid');
        } else if (cardWrapper) {
          cardWrapper.classList.remove('is-invalid');
        }
      });
    },

    showPlaceholder: function (message) {
      var cardContainer = document.getElementById('stripe-card-element');
      if (!cardContainer) return;
      cardContainer.innerHTML =
        '<div class="stripe-not-configured">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>' +
          '</svg>' +
          '<p style="margin:0;">' + message + '</p>' +
        '</div>';
    },

    /**
     * Process a payment.
     * Production: create PaymentIntent server-side, then call
     * stripe.confirmCardPayment(clientSecret, { payment_method: { card, billing_details } })
     */
    processPayment: async function (bookingData) {
      if (!this.stripe || !this.cardElement) {
        throw new Error('Payment processing is not available. Please contact the host to complete your booking.');
      }

      var billingDetails = {
        name: bookingData.cardholderName,
        address: {
          line1:       bookingData.address,
          city:        bookingData.city,
          state:       bookingData.state,
          postal_code: bookingData.postcode,
          country:     bookingData.country || 'AU'
        }
      };

      // Production flow:
      // 1. POST booking data to your server
      // 2. Server calls stripe.paymentIntents.create({ amount, currency })
      // 3. Server returns { clientSecret }
      // 4. await stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, billing_details } })

      console.log('Payment ready to process:', {
        amount:         bookingData.amount,
        currency:       getSettings().currency || 'aud',
        billingDetails: billingDetails
      });

      // Simulated success response (replace with real server call)
      return {
        success:         true,
        paymentIntentId: 'pi_demo_' + Date.now(),
        status:          'succeeded'
      };
    }
  };

  /* ─────────────────────────────────────────────
     Inline validation helpers
  ───────────────────────────────────────────── */

  function showFieldError(fieldId, errorId) {
    var field = document.getElementById(fieldId);
    var err   = document.getElementById(errorId);
    if (field) field.classList.add('is-invalid');
    if (err)   err.classList.add('visible');
  }

  function clearFieldError(fieldId, errorId) {
    var field = document.getElementById(fieldId);
    var err   = document.getElementById(errorId);
    if (field) field.classList.remove('is-invalid');
    if (err)   err.classList.remove('visible');
  }

  function showFormError(message) {
    var banner = document.getElementById('formErrorBanner');
    var msg    = document.getElementById('formErrorMessage');
    if (msg)    msg.textContent = message;
    if (banner) banner.classList.add('visible');
    // Scroll banner into view
    if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearFormError() {
    var banner = document.getElementById('formErrorBanner');
    if (banner) banner.classList.remove('visible');
  }

  /* Attach live clear-on-type listeners to all required fields */
  function attachClearListeners() {
    var fields = [
      { id: 'cardHolderName', errId: 'err-cardHolderName' },
      { id: 'billingStreet',  errId: 'err-billingStreet'  },
      { id: 'billingCity',    errId: 'err-billingCity'    },
      { id: 'billingState',   errId: 'err-billingState'   },
      { id: 'billingPostcode',errId: 'err-billingPostcode' }
    ];
    fields.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      el.addEventListener('input', function () {
        if (el.value.trim()) clearFieldError(f.id, f.errId);
        clearFormError();
      });
    });
    var country = document.getElementById('billingCountry');
    if (country) {
      country.addEventListener('change', function () {
        clearFormError();
      });
    }
  }

  /* ─────────────────────────────────────────────
     Checkout Form Handler
  ───────────────────────────────────────────── */
  function initCheckoutForm() {
    var form = document.getElementById('checkoutForm');
    if (!form) return;

    attachClearListeners();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      clearFormError();

      /* ── 1. Validate required text fields ── */
      var requiredFields = [
        { id: 'cardHolderName', errId: 'err-cardHolderName' },
        { id: 'billingStreet',  errId: 'err-billingStreet'  },
        { id: 'billingCity',    errId: 'err-billingCity'    },
        { id: 'billingState',   errId: 'err-billingState'   },
        { id: 'billingPostcode',errId: 'err-billingPostcode' }
      ];

      var firstInvalid = null;
      requiredFields.forEach(function (f) {
        var el = document.getElementById(f.id);
        if (!el) return;
        if (!el.value.trim()) {
          showFieldError(f.id, f.errId);
          if (!firstInvalid) firstInvalid = el;
        } else {
          clearFieldError(f.id, f.errId);
        }
      });

      /* ── 2. Validate card element ── */
      var cardWrapper  = document.getElementById('stripe-card-element');
      var cardErrorsEl = document.getElementById('card-errors');

      var stripeReady = StripePayment.stripe && StripePayment.cardElement;
      var cardOk      = false;

      if (stripeReady) {
        if (!StripePayment.cardComplete) {
          if (cardWrapper) cardWrapper.classList.add('is-invalid');
          if (cardErrorsEl && !cardErrorsEl.textContent) {
            cardErrorsEl.textContent = 'Please enter your complete card details.';
          }
          if (!firstInvalid) firstInvalid = cardWrapper;
        } else if (StripePayment.cardError) {
          if (cardWrapper) cardWrapper.classList.add('is-invalid');
          if (!firstInvalid) firstInvalid = cardWrapper;
        } else {
          if (cardWrapper) cardWrapper.classList.remove('is-invalid');
          if (cardErrorsEl) cardErrorsEl.textContent = '';
          cardOk = true;
        }
      } else {
        // Stripe not configured — flag it but don't block on card
        cardOk = true;
      }

      /* ── 3. Abort if any errors ── */
      if (firstInvalid || !cardOk) {
        showFormError('Please complete all required fields highlighted below before continuing.');
        if (firstInvalid) {
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof firstInvalid.focus === 'function') firstInvalid.focus();
        }
        return;
      }

      /* ── 4. Submit ── */
      var payNowBtn    = document.getElementById('payNowBtn');
      var originalHTML = payNowBtn ? payNowBtn.innerHTML : '';
      if (payNowBtn) {
        payNowBtn.disabled   = true;
        payNowBtn.innerHTML  =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">' +
          '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4' +
          'M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Processing…';
      }

      try {
        var data = {
          cardholderName: document.getElementById('cardHolderName').value.trim(),
          address:        document.getElementById('billingStreet').value.trim(),
          city:           document.getElementById('billingCity').value.trim(),
          state:          document.getElementById('billingState').value.trim(),
          postcode:       document.getElementById('billingPostcode').value.trim(),
          country:        (document.getElementById('billingCountry') || {}).value || 'AU',
          amount:         0
        };

        var result = await StripePayment.processPayment(data);

        if (result.success) {
          window.location.href = 'confirmation.html?ref=TRA-' +
            new Date().getFullYear() + '-' +
            String(Math.floor(Math.random() * 90000) + 10000);
        }
      } catch (error) {
        showFormError(error.message || 'Payment failed. Please check your card details and try again.');
        if (payNowBtn) {
          payNowBtn.disabled  = false;
          payNowBtn.innerHTML = originalHTML;
        }
      }
    });
  }

  /* ─────────────────────────────────────────────
     Spin keyframe (for processing indicator)
  ───────────────────────────────────────────── */
  (function injectSpinStyle() {
    if (document.getElementById('stripe-spin-style')) return;
    var s = document.createElement('style');
    s.id = 'stripe-spin-style';
    s.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  })();

  /* ─────────────────────────────────────────────
     Init
  ───────────────────────────────────────────── */
  function init() {
    StripePayment.init();
    initCheckoutForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CascadeApt4           = window.CascadeApt4 || {};
  window.CascadeApt4.StripePayment = StripePayment;
})();
