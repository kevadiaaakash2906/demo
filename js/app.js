// ============================================================
// app.js — shared config/state, header sync, login, roles,
// and the refresh/reload flow. Loaded after utils.js and api.js.
// ============================================================

// ---------- Configure this ----------
const GOLD_RATE_PER_10G = 16000;
const USD_RATE = 94;
// -------------------------------------

// ============ APP STATE ============
  let PASS = '';
  let ROLE = 'staff';
  let ORDERS = [];
  let editingRow = null;
  let sortKey = null;
  let sortDir = 'asc';
  let deleteHoldRAF = null;
  let currentInstallments = []; // [{date, amount}] for the order currently open in the panel

  $('rateNote').textContent = `Gold: ₹${GOLD_RATE_PER_10G.toLocaleString('en-IN')}/10g · $1 = ₹${USD_RATE} (fixed rates)`;

  // Keep the sticky table-header offset in sync with the real topbar
  // height, since it wraps to a taller block on narrow screens.
  function syncHeaderHeight() {
    const topbar = document.querySelector('header.topbar');
    if (topbar) document.documentElement.style.setProperty('--header-h', topbar.offsetHeight + 'px');
    updateStuckHeader();
    document.querySelectorAll('.order-card.open .order-card-body').forEach(body => {
      body.style.maxHeight = body.scrollHeight + 'px';
    });
  }
  let resizeDebounceTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(syncHeaderHeight, 100);
  });
  window.addEventListener('load', syncHeaderHeight);

  // Adds a drop shadow under the table header only once it's actually
  // pinned in place, so it doesn't look like it's floating at rest.
  function updateStuckHeader() {
    const theadEl = document.querySelector('#app thead');
    if (!theadEl) return;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
    const rect = theadEl.getBoundingClientRect();
    theadEl.classList.toggle('is-stuck', rect.top <= headerH + 1);
  }
  window.addEventListener('scroll', updateStuckHeader, { passive: true });

  // ============ LOGIN ============
  $('loginBtn').addEventListener('click', login);
  $('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });


  async function login() {
    const pass = $('passInput').value.trim();
    if (!pass) return;
    $('loginError').textContent = '';
    $('loginBtn').textContent = 'Checking…';

    try {
      const data = await jsonp({ action: 'auth', pass: pass });
      if (!data.ok) {
        $('loginError').textContent = data.error || 'Wrong password';
        $('loginBtn').textContent = 'Unlock';
        return;
      }
      PASS = pass;
      ROLE = data.role || 'staff';
      ORDERS = (data.rows || []).filter(r => r['Style No.'] && String(r['Style No.']).trim() !== '');
      ORDERS.forEach(r => {
        if (r['Date'] && typeof r['Date'] === 'number') {
          r['Date'] = excelDateToJSDate(r['Date']);
        }
      });
      $('login').style.display = 'none';
      $('app').style.display = 'block';
      syncHeaderHeight();
      applyRoleRestrictions();
      renderKPIs();
      renderHeaderStats();
      populateCustomerFilter();
      currentPage = 1;
      renderResults(applyFilter());
      showToast(`Welcome. ${ORDERS.length} orders loaded.`);
    } catch (err) {
      // jsonp() already retried a couple of times internally before this
      // ever fires, so a real error here means it's worth a targeted
      // message rather than a generic "check your connection."
      $('loginError').textContent = err.userMessage || 'Could not reach the sheet. Check the Apps Script URL and your connection.';
      $('loginBtn').textContent = 'Unlock';
    }
  }

  // Three roles: 'staff' (manufacturer — full access), 'seller' (your
  // brother — can view everything, but only edit Sold To / Sale Price /
  // Date Sold / payments), 'customer' (view-only). The backend enforces
  // all of this independently — this just keeps the UI honest.

  function applyRoleRestrictions() {
    const isStaff = ROLE === 'staff';
    const canEditSale = ROLE === 'staff' || ROLE === 'seller';
    const newOrderBtn = $('newOrderBtn');
    if (newOrderBtn) newOrderBtn.style.display = isStaff ? '' : 'none';
    const receivePaymentBtn = $('receivePaymentBtn');
    if (receivePaymentBtn) receivePaymentBtn.style.display = canEditSale ? '' : 'none';
    // 'view-only' hides the Save button and dims controls entirely — only
    // applies to pure viewers (customers), since sellers can still save.
    document.body.classList.toggle('view-only', !canEditSale);
    // role-staff / role-seller / role-customer drives which columns show
    // (INR manufacturing figures for staff, USD + carat weight for seller).
    document.body.classList.remove('role-staff', 'role-seller', 'role-customer');
    document.body.classList.add('role-' + ROLE);
    equalizeColumnWidths();
  }

  // visibility:collapse hides a column, but doesn't reliably make the
  // *remaining* columns stretch to fill the freed space in every browser —
  // some just leave a blank gap where the hidden columns used to be. This
  // computes an exact equal share for whichever columns are actually
  // visible for the current role, so the table always fills the full
  // width no matter how many columns that role happens to see.
  function equalizeColumnWidths() {
    const cols = document.querySelectorAll('.table-wrap col');
    if (!cols.length) return;
    const visibleCols = Array.from(cols).filter(col => getComputedStyle(col).visibility !== 'collapse');
    if (!visibleCols.length) return;
    const widthPct = (100 / visibleCols.length) + '%';
    cols.forEach(col => {
      col.style.width = getComputedStyle(col).visibility !== 'collapse' ? widthPct : '0%';
    });
  }


  // ============ REFRESH ============
  async function refreshOrders() {
    renderSkeleton();
    try {
      const data = await jsonp({ action: 'auth', pass: PASS });
      if (data.ok) {
        ORDERS = (data.rows || []).filter(r => r['Style No.'] && String(r['Style No.']).trim() !== '');
        ORDERS.forEach(r => {
          if (r['Date'] && typeof r['Date'] === 'number') r['Date'] = excelDateToJSDate(r['Date']);
        });
        renderKPIs();
        renderHeaderStats();
        populateCustomerFilter();
        renderResults(applyFilter());
        showToast('Orders refreshed');
      } else {
        renderErrorState(data.error || 'The sheet returned an error.');
        showToast('Refresh failed', 'bad');
      }
    } catch (err) {
      renderErrorState(err.userMessage || 'Check your connection and try again.');
      showToast('Refresh failed', 'bad');
    }
  }
  $('refreshBtn').addEventListener('click', refreshOrders);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('paymentSearchModal').classList.contains('open')) closePaymentSearch();
      else requestClosePanel();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      $('search').focus();
    }
  });
