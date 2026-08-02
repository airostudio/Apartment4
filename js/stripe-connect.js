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
        hidePostalCode: true,
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
          line1:   bookingData.address,
          city:    bookingData.city,
          state:   bookingData.state,
          country: bookingData.country || 'AU'
        }
      };

      // Create PaymentIntent server-side with booking metadata so it persists in Stripe
      var piResp = await fetch('/api/create-payment-intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          amountCents: bookingData.amountCents,
          currency: 'aud',
          booking: {
            ref:          bookingData.ref,
            name:         bookingData.cardholderName,
            email:        bookingData.email,
            phone:        bookingData.phone,
            checkin:      bookingData.checkin,
            checkout:     bookingData.checkout,
            guests:       bookingData.guests,
            earlyCheckin: bookingData.earlyCheckin,
            lateCheckout: bookingData.lateCheckout,
          }
        })
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
      { id: 'billingCity',  errId: 'err-billingCity'  },
      { id: 'billingState', errId: 'err-billingState' }
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
        { id: 'billingCity',  errId: 'err-billingCity'  },
        { id: 'billingState', errId: 'err-billingState' }
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

        // Pre-generate ref so it can be stored in Stripe metadata
        var ref = 'TRA-' + new Date().getFullYear() + '-' +
          String(Math.floor(Math.random() * 90000) + 10000);

        // Read booking context from URL params
        var pageParams   = new URLSearchParams(window.location.search);
        var checkin      = pageParams.get('checkin')      || '';
        var checkout     = pageParams.get('checkout')     || '';
        var guests       = pageParams.get('guests')       || '';
        var earlyCheckin = pageParams.get('earlyCheckin') || '0';
        var lateCheckout = pageParams.get('lateCheckout') || '0';

        // Read guest contact details saved by booking.html
        var guestEmail = '';
        var guestPhone = '';
        try {
          var savedGuests = JSON.parse(localStorage.getItem('guestData') || '[]');
          if (savedGuests.length) {
            var lastGuest = savedGuests[savedGuests.length - 1];
            guestEmail = lastGuest.email || '';
            guestPhone = lastGuest.phone || '';
          }
        } catch (_) {}

        var data = {
          cardholderName: document.getElementById('cardHolderName').value.trim(),
          address:        document.getElementById('billingStreet').value.trim(),
          city:    document.getElementById('billingCity').value.trim(),
          state:   document.getElementById('billingState').value.trim(),
          country: (document.getElementById('billingCountry') || {}).value || 'AU',
          amountCents:    amountCents,
          ref:            ref,
          email:          guestEmail,
          phone:          guestPhone,
          checkin:        checkin,
          checkout:       checkout,
          guests:         guests,
          earlyCheckin:   earlyCheckin,
          lateCheckout:   lateCheckout,
        };

        var result = await StripePayment.processPayment(data);

        if (result.success) {
          // (ref and pageParams already defined above)

          try {
            localStorage.setItem('lastBookingSummary', JSON.stringify({
              ref:             ref,
              paymentIntentId: result.paymentIntentId,
              checkin:         checkin,
              checkout:        checkout,
              guests:          guests,
              amountCents:     amountCents,
              cardholderName:  data.cardholderName,
              paidAt:          new Date().toISOString()
            }));
          } catch (_) {}

          // Push to adminBookings so calendar and bookings list reflect this payment
          try {
            var adminBookings = JSON.parse(localStorage.getItem('adminBookings') || '[]');
            adminBookings.push({
              id:          ref,
              stripeId:    result.paymentIntentId,
              name:        data.cardholderName,
              email:       guestEmail,
              phone:       '',
              checkin:     checkin,
              checkout:    checkout,
              guests:      parseInt(guests) || 1,
              rate:        855,
              status:      'Confirmed',
              source:      'stripe',
              amountCents: amountCents,
              createdAt:   new Date().toISOString(),
              paidAt:      new Date().toISOString(),
              notes:       'Paid online via Stripe. Payment ID: ' + result.paymentIntentId
            });
            localStorage.setItem('adminBookings', JSON.stringify(adminBookings));
          } catch (_) {}

          // Booking confirmation / payment-receipt emails are sent reliably
          // server-side via the Stripe webhook (api/webhooks/stripe.js) once
          // payment_intent.succeeded is confirmed — not from here. A client-side
          // fetch this late in the flow is easily lost if the guest closes the
          // tab, and duplicates the automation system's own send.

          window.location.href = 'confirmation.html?ref=' + encodeURIComponent(ref) +
            '&pi=' + encodeURIComponent(result.paymentIntentId);
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
