// ============================================================
// app.js — shared config/state, header sync, login, roles,
// and the refresh/reload flow. Loaded after utils.js and firebase.js.
// ============================================================

// NOTE: utils.js and firebase.js are loaded as modules before this script
// and expose all their exports on window.  We use those globals here.

// ---------- Configure this ----------
const GOLD_RATE_PER_10G = 16000;
const USD_RATE = 94;
// -------------------------------------

// ============ APP STATE ============
// Use var (not let) so these are attached to window and visible to other
// deferred scripts (dashboard.js, filters.js, panel.js, etc.)
var PASS = '';
var ROLE = 'staff';
var ORDERS = [];
var editingRow = null;
var sortKey = null;
var sortDir = 'asc';
var deleteHoldRAF = null;
var currentInstallments = []; // [{date, amount}] for the order currently open in the panel
// ============ SHEET KEY MAPPINGS ============
// Change these if your Google Sheet headers ever change
var ORDERS_KEYS = {
  srNo: 'Sr. No.',
  customer: 'CUSTOMER ',
  customerAlt: 'CUSTOMER',
  styleNo: 'Style No.',
  date: 'Date',
  grossWt: 'Gross Wt',
  diaQty: 'Dia Qty',
  inCt: 'IN CT',
  colourStone: 'COLOUR STONE',
  netWt: 'Net Wt',
  multiplier: 'Multiplier',
  pgWt: 'Pg Wt',
  goldAmount: 'Gold Amount',
  diamAmount: 'Diam Amount',
  lCharges: 'L CHARGES',
  laborAmount: 'Labor Amount',
  subTotal: 'SUB TOTAL',
  usd: '$',
  soldTo: 'Sold To',
  salePrice: 'Sale Price',
  dateSold: 'Date Sold',
  amountPaid: 'Amount Paid',
  balanceDue: 'Balance Due',
  paymentStatus: 'Payment Status',
  paymentLog: 'Payment Log',
  memoNo: 'Memo No.'
};

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
$('loginBtn').addEventListener('click', doLogin);
$('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const pass = $('passInput').value.trim();
  if (!pass) return;
  $('loginError').textContent = '';
  $('loginBtn').textContent = 'Checking…';

  try {
    const data = await window.login(pass);
    PASS = pass;
    ROLE = data.role || 'staff';
    await loadOrders();
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
    $('loginError').textContent = err.message || 'Wrong password';
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
  const table = document.getElementById('ordersTable');
  if (!table) return;
  const cols = table.querySelectorAll('colgroup col');
  if (!cols.length) return;

  // Base widths matching the inline styles above
  const baseWidths = [5, 7, 10, 8, 6, 6, 6, 6, 9, 6, 7, 9, 7, 8];

  const visibleIndices = [];
  cols.forEach((col, i) => {
    if (getComputedStyle(col).visibility === 'collapse') {
      col.style.width = '0%';
    } else {
      visibleIndices.push(i);
    }
  });

  if (!visibleIndices.length) return;

  const visibleTotal = visibleIndices.reduce((sum, i) => sum + baseWidths[i], 0);
  visibleIndices.forEach(i => {
    const proportional = (baseWidths[i] / visibleTotal) * 100;
    cols[i].style.width = proportional + '%';
  });
}


// ============ LOAD / REFRESH ============
async function loadOrders() {
  renderSkeleton();
  try {
    const data = await window.fetchOrders();
    ORDERS = (data.rows || []).filter(r => r['Style No.'] && String(r['Style No.']).trim() !== '');
    // Firestore returns ISO date strings already — no Excel serial conversion needed
    renderKPIs();
    renderHeaderStats();
    populateCustomerFilter();
    currentPage = 1;
    renderResults(applyFilter());
    showToast('Orders loaded');
  } catch (err) {
    renderErrorState(err.message || 'Could not load orders.');
    showToast('Load failed', 'bad');
  }
}
$('refreshBtn').addEventListener('click', loadOrders);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('paymentSearchModal').classList.contains('open')) closePaymentSearch();
    else if (typeof requestClosePanel === 'function') requestClosePanel();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    $('search').focus();
  }
});
