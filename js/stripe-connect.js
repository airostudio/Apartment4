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
     Shared helpers
  ───────────────────────────────────────────── */
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
          city:           document.getElementById('billingCity').value.trim(),
          state:          document.getElementById('billingState').value.trim(),
          postcode:       document.getElementById('billingPostcode').value.trim(),
          country:        (document.getElementById('billingCountry') || {}).value || 'AU',
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
              notes:       'Paid online via Stripe. Payment ID: ' + result.paymentIntentId
            });
            localStorage.setItem('adminBookings', JSON.stringify(adminBookings));
          } catch (_) {}

          // Fire booking confirmation email (non-blocking)
          try {
            if (guestEmail) {
              var totalAUD = (amountCents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
              var fmtDate = function(str) {
                if (!str) return '—';
                var d = new Date(str + 'T12:00:00');
                return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
              };
              var confHtml = [
                '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">',
                '<div style="background:#0f2744;padding:32px 28px;border-radius:12px 12px 0 0;">',
                '<h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Booking Confirmed</h1>',
                '<p style="color:rgba(255,255,255,0.7);margin:0;font-size:14px;">Cascade Apartment 4 — Mt Baw Baw Alpine Resort</p>',
                '</div>',
                '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:28px;border-radius:0 0 12px 12px;">',
                '<p style="font-size:15px;margin:0 0 20px;">Hi ' + escHtml(data.cardholderName) + ',</p>',
                '<p style="font-size:15px;margin:0 0 24px;">Great news — your booking at Cascade Apartment 4 is confirmed!</p>',
                '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">',
                '<tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:13px;color:#64748b;width:38%;">Booking Reference</td><td style="padding:10px 14px;font-size:13px;font-weight:600;">' + escHtml(ref) + '</td></tr>',
                '<tr><td style="padding:10px 14px;font-size:13px;color:#64748b;">Check-in</td><td style="padding:10px 14px;font-size:13px;">' + escHtml(fmtDate(checkin)) + ' from 3:00 PM</td></tr>',
                '<tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:13px;color:#64748b;">Check-out</td><td style="padding:10px 14px;font-size:13px;">' + escHtml(fmtDate(checkout)) + ' by 10:00 AM</td></tr>',
                '<tr><td style="padding:10px 14px;font-size:13px;color:#64748b;">Guests</td><td style="padding:10px 14px;font-size:13px;">' + escHtml(guests) + ' adult' + (parseInt(guests) !== 1 ? 's' : '') + '</td></tr>',
                '<tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:13px;color:#64748b;">Total Paid</td><td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f2744;">' + escHtml(totalAUD) + '</td></tr>',
                '</table>',
                '<div style="background:#fff7ed;border:1.5px solid #f97316;border-radius:8px;padding:14px 16px;margin-bottom:20px;">',
                '<p style="font-size:13px;font-weight:700;color:#9a3412;margin:0 0 6px;">Linen &amp; Towels</p>',
                '<p style="font-size:13px;color:#7c2d12;margin:0;">Bed linen and bath towels are not included. Bring your own or hire: <strong>Queen/Double $40 · Single $20</strong>. Contact us to arrange hire before your stay.</p>',
                '</div>',
                '<p style="font-size:13px;color:#475569;margin:0 0 6px;">Questions? Reply to this email or contact us at <a href="mailto:hello@cascadeskiapartments.com" style="color:#0f2744;">hello@cascadeskiapartments.com</a></p>',
                '<p style="font-size:13px;color:#475569;margin:0;">We look forward to welcoming you!</p>',
                '<p style="font-size:13px;color:#475569;margin:20px 0 0;">Warm regards,<br><strong>Cascade Apartment 4</strong></p>',
                '</div></div>'
              ].join('');

              var confText = 'Hi ' + data.cardholderName + ',\n\nYour booking at Cascade Apartment 4 is confirmed!\n\n'
                + 'Reference:  ' + ref + '\n'
                + 'Check-in:   ' + fmtDate(checkin) + ' from 3:00 PM\n'
                + 'Check-out:  ' + fmtDate(checkout) + ' by 10:00 AM\n'
                + 'Guests:     ' + guests + '\n'
                + 'Total Paid: ' + totalAUD + '\n\n'
                + 'Linen & Towels: not included. Bring your own or hire (Queen/Double $40, Single $20).\n\n'
                + 'Questions? Email hello@cascadeskiapartments.com\n\nWarm regards,\nCascade Apartment 4';

              fetch('/api/send-email', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to:      guestEmail,
                  subject: 'Booking Confirmed — Cascade Apartment 4 (' + ref + ')',
                  text:    confText,
                  html:    confHtml
                })
              }).catch(function() {});
            }
          } catch (_) {}

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
