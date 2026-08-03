const PROPERTY_TIMEZONE = 'Australia/Melbourne';

/** Returns today's date as YYYY-MM-DD in the property's local timezone. */
function todayInPropertyTz() {
  return new Date().toLocaleDateString('en-CA', { timeZone: PROPERTY_TIMEZONE });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pure YYYY-MM-DD string comparison (works because the format is lexically ordered). */
function isBefore(a, b) { return a < b; }
function isSameOrAfter(a, b) { return a >= b; }

/**
 * Decides whether `rule` is due to fire for `booking` on `todayStr`
 * (YYYY-MM-DD, property-local). Pure function — same logic is used by the
 * admin "Due Emails" preview and the actual cron/webhook senders, so the
 * preview can never show something different from what will really happen.
 */
function isDue(booking, rule, todayStr) {
  if (!rule || !rule.enabled) return false;
  if (booking.cancelled && rule.trigger !== 'on_cancel') return false;
  if (!booking.cancelled && rule.trigger === 'on_cancel') return false;
  if (!booking.checkin || !booking.checkout) return false;

  switch (rule.trigger) {
    case 'on_booking':
      return true;
    case 'days_before_checkin': {
      const due = addDays(booking.checkin, -(rule.offset || 0));
      return isSameOrAfter(todayStr, due) && isBefore(todayStr, booking.checkin);
    }
    case 'on_checkin_day':
      return todayStr === booking.checkin;
    case 'day_before_checkout': {
      const prev = addDays(booking.checkout, -1);
      return todayStr === prev;
    }
    case 'days_after_checkout': {
      const due = addDays(booking.checkout, rule.offset || 0);
      return isSameOrAfter(todayStr, due);
    }
    case 'on_cancel':
      return !!booking.cancelled;
    default:
      return false;
  }
}

/**
 * Computes every (booking, template) pair that's currently due to send,
 * skipping anything already recorded in booking.emailsSent.
 */
function computeDueItems(bookings, config, todayStr) {
  todayStr = todayStr || todayInPropertyTz();
  const templates = (config && config.templates) || [];
  const rules = (config && config.automationRules) || {};
  const due = [];

  templates.forEach(function (t) {
    const rule = rules[t.id];
    if (!rule) return;
    bookings.forEach(function (b) {
      if (!b.email) return;
      if ((b.emailsSent || []).indexOf(t.id) !== -1) return;
      if (isDue(b, rule, todayStr)) due.push({ booking: b, template: t, rule: rule });
    });
  });

  return due;
}

module.exports = { PROPERTY_TIMEZONE, todayInPropertyTz, isDue, computeDueItems };
