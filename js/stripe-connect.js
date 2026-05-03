/**
 * Cascade Apartment 4 — Stripe Payment Integration
 *
 * Requires: <script src="https://js.stripe.com/v3/"></script> in the page head.
 * Publishable key is fetched from /api/config (Vercel env var STRIPE_PUBLISHABLE_KEY).
 * PaymentIntents are created server-side via /api/create-payment-intent.
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     Stripe Payment Object
  ───────────────────────────────────────────── */
  var StripePayment = {
    stripe:       null,
    elements:     null,
    cardElement:  null,
    cardComplete: false,
    cardError:    null,

    config: {
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary:    '#0f2744',
          colorBackground: '#ffffff',
          colorText:       '#2d2926',
          colorDanger:     '#dc2626',
          fontFamily:      'Inter, sans-serif',
          spacingUnit:     '4px',
          borderRadius:    '8px'
        }
      }
    },

    init: async function () {
      if (typeof Stripe === 'undefined') {
        console.warn('Stripe.js not loaded — payment processing unavailable.');
        this.showPlaceholder('Stripe.js could not be loaded. Please check your internet connection and refresh.');
        return;
      }

      var publishableKey = '';
      try {
        var resp = await fetch('/api/config');
        var data = await resp.json();
        publishableKey = data.publishableKey || '';
      } catch (e) {
        console.warn('Could not fetch Stripe config:', e.message);
      }

      if (!publishableKey) {
        console.warn('Stripe publishable key not configured.');
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
            fontSize:        '16px',
            color:           '#2d2926',
            fontFamily:      'Inter, sans-serif',
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
        if (errorEl) errorEl.textContent = self.cardError || '';

        var cardWrapper = document.getElementById('stripe-card-element');
        if (cardWrapper) {
          if (event.error) {
            cardWrapper.classList.add('is-invalid');
          } else {
            cardWrapper.classList.remove('is-invalid');
          }
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

      // Create PaymentIntent server-side
      var piResp = await fetch('/api/create-payment-intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amountCents: bookingData.amountCents, currency: 'aud' })
      });

      if (!piResp.ok) {
        var piErr = {};
        try { piErr = await piResp.json(); } catch (_) {}
        throw new Error(piErr.error || 'Could not initiate payment. Please try again.');
      }

      var piData = await piResp.json();

      // Confirm card payment client-side
      var result = await this.stripe.confirmCardPayment(piData.clientSecret, {
        payment_method: {
          card:            this.cardElement,
          billing_details: billingDetails
        }
      });

      if (result.error) {
        throw new Error(result.error.message || 'Payment failed. Please check your card details and try again.');
      }

      return {
        success:         result.paymentIntent.status === 'succeeded',
        paymentIntentId: result.paymentIntent.id,
        status:          result.paymentIntent.status
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
    if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearFormError() {
    var banner = document.getElementById('formErrorBanner');
    if (banner) banner.classList.remove('visible');
  }

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
      country.addEventListener('change', function () { clearFormError(); });
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
      var stripeReady  = StripePayment.stripe && StripePayment.cardElement;
      var cardOk       = false;

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
        // Stripe not configured — skip card check
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
        payNowBtn.disabled  = true;
        payNowBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">' +
          '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4' +
          'M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Processing…';
      }

      try {
        var amountCents = parseInt(form.dataset.amountCents, 10) || 0;

        var data = {
          cardholderName: document.getElementById('cardHolderName').value.trim(),
          address:        document.getElementById('billingStreet').value.trim(),
          city:           document.getElementById('billingCity').value.trim(),
          state:          document.getElementById('billingState').value.trim(),
          postcode:       document.getElementById('billingPostcode').value.trim(),
          country:        (document.getElementById('billingCountry') || {}).value || 'AU',
          amountCents:    amountCents
        };

        var result = await StripePayment.processPayment(data);

        if (result.success) {
          window.location.href = 'confirmation.html?ref=TRA-' +
            new Date().getFullYear() + '-' +
            String(Math.floor(Math.random() * 90000) + 10000) +
            '&pi=' + result.paymentIntentId;
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
    StripePayment.init(); // async — mounts card element once key is fetched
    initCheckoutForm();   // sync — attaches submit listener immediately
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CascadeApt4               = window.CascadeApt4 || {};
  window.CascadeApt4.StripePayment = StripePayment;
})();
