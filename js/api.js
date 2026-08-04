// ============================================================
// api.js — talks to the Google Apps Script backend via JSONP
// ============================================================

// ---------- Configure this ----------
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwxQnFkH4C9nLK3KraxY5QEnK7PeDvHuA-qBbuIXWBtCAdqQP3Xu5rSatQqT2sT2p2F/exec';
// -------------------------------------

  // ---------- JSONP helper ----------
  // Loads data via a <script> tag instead of fetch(). Script tags are not
  // subject to CORS, which sidesteps Apps Script's unreliable CORS headers
  // that were blocking fetch() from this GitHub Pages domain.
  let jsonpCounter = 0;
  function jsonp(payload) {
    return new Promise((resolve, reject) => {
      const cbName = '__jsonp_cb_' + (jsonpCounter++);
      const qs = Object.entries(payload)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
        .join('&');

      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('Request timed out')); }, 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        script.remove();
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('Could not reach the script')); };
      script.src = `${APPS_SCRIPT_URL}?${qs}&callback=${cbName}`;
      document.body.appendChild(script);
    });
  }
