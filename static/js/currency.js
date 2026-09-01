(function () {
  var STORAGE_KEY = 'display_currency';
  var RATE_CACHE_KEY = 'usd_to_kes_rate';
  var currency = localStorage.getItem(STORAGE_KEY) === 'KES' ? 'KES' : 'USD';
  var rate = Number(localStorage.getItem(RATE_CACHE_KEY)) || 0;

  function formatMoney(amount) {
    var value = Number(amount) || 0;
    if (currency === 'KES' && rate > 0) value = Math.round((value * rate + Number.EPSILON) * 100) / 100;
    return (currency === 'KES' ? 'KSh ' : '$') + new Intl.NumberFormat('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatSignedMoney(amount) {
    var value = Number(amount) || 0;
    return (value >= 0 ? '+' : '-') + formatMoney(Math.abs(value));
  }

  function render() {
    document.querySelectorAll('[data-usd-amount]').forEach(function (element) {
      element.textContent = formatMoney(element.getAttribute('data-usd-amount'));
    });
    document.querySelectorAll('[data-display-currency]').forEach(function (element) {
      element.textContent = currency;
    });
    document.querySelectorAll('[data-currency-label]').forEach(function (element) {
      element.textContent = element.getAttribute('data-currency-label') + ' (' + currency + ')';
    });
  }

  function setCurrency(nextCurrency) {
    currency = nextCurrency === 'KES' ? 'KES' : 'USD';
    localStorage.setItem(STORAGE_KEY, currency);
    fetch('/api/display-currency', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: currency })
    }).catch(function () {});
    document.querySelectorAll('#display-currency-select').forEach(function (select) {
      select.value = currency;
    });
    render();
    window.dispatchEvent(new CustomEvent('displaycurrencychange', { detail: { currency: currency, rate: rate } }));
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#display-currency-select').forEach(function (select) {
      select.value = currency;
      select.addEventListener('change', function () { setCurrency(select.value); });
    });
    render();
    fetch('/api/display-currency', { credentials: 'include' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) return;
        if (!data.hasPreference) {
          fetch('/api/display-currency', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currency: currency }) }).catch(function () {});
          return;
        }
        if (data.currency !== 'USD' && data.currency !== 'KES') return;
        if (data.currency !== currency) {
          currency = data.currency;
          localStorage.setItem(STORAGE_KEY, currency);
          document.querySelectorAll('#display-currency-select').forEach(function (select) { select.value = currency; });
          render();
        }
      })
      .catch(function () {});
    fetch('/api/exchange-rate', { credentials: 'include' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data || !Number.isFinite(Number(data.rate)) || Number(data.rate) <= 0) return;
        rate = Number(data.rate);
        localStorage.setItem(RATE_CACHE_KEY, String(rate));
        render();
      })
      .catch(function () { /* Keep the cached rate, if available. */ });
  });

  window.AutonixCurrency = {
    format: formatMoney,
    formatSigned: formatSignedMoney,
    get: function () { return currency; },
    getRate: function () { return rate; }
  };
})();
