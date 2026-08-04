// ============================================================
// api.js — talks to the Google Apps Script backend via JSONP
// ============================================================

// ---------- Configure this ----------
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby6EY9PbCkjukEltyuAIF9qIh1rVQoYDOin2q18RX2e1vEEvz9wdebkVQVnSYlkpyjR/exec';
// -------------------------------------

  // ---------- JSONP helper ----------
  // Loads data via a <script> tag instead of fetch(). Script tags are not
  // subject to CORS, which sidesteps Apps Script's unreliable CORS headers
  // that were blocking fetch() from this GitHub Pages domain.
  let jsonpCounter = 0;

  // A single attempt — no retry logic in here, that lives in jsonp() below.
  function jsonpOnce(payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cbName = '__jsonp_cb_' + (jsonpCounter++);
      const qs = Object.entries(payload)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
        .join('&');

      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        script.remove();
      }

      window[cbName] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('network')); };
      script.src = `${APPS_SCRIPT_URL}?${qs}&callback=${cbName}`;
      document.body.appendChild(script);
    });
  }

  // Apps Script has real cold-start delays — the first request after it's
  // been idle can occasionally take 15-20+ seconds, and the odd request
  // just drops on flaky mobile connections. A single attempt with no retry
  // was bound to fail sometimes even though nothing was actually broken.
  // So: try up to 3 times total, with a short backoff between attempts,
  // before ever surfacing an error to the person using the app.
  function jsonp(payload, { retries = 2, timeoutMs = 15000 } = {}) {
    return (async () => {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await jsonpOnce(payload, timeoutMs);
        } catch (err) {
          lastErr = err;
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 1s, then 2s
          }
        }
      }
      // Give the UI a message it can tell apart, without exposing internals.
      lastErr.userMessage = lastErr.message === 'timeout'
        ? 'The sheet is taking too long to respond. Check your connection and try again.'
        : 'Could not reach the Apps Script. Check your connection, or confirm the deployment URL in api.js is still valid.';
      throw lastErr;
    })();
  }
