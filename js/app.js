/* ============================================
   VINÉRE — App Core
   ============================================ */

/* ============ AUTH / ROLE ============ */
var PASSWORDS = {
  staff:   '25f885fa451c3c6b024fe23dbf834ceb2be6361316010ef348e7777faa78634c',
  seller:  'c60a26e1e8094121dae3acccdfdb1fffeb616bcb2e3ae68f6b18c336e6e031d7',
  customer:'9a900403ac313ba27a1bc81f0932652b8020dac92c234d98fa0b06bf0040ecfd'
};

var ROLE = null;
var USER_HASH = null;

async function sha256(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

/* ---------- Auto-login on load ---------- */
window.showApp = function(role) {
  ROLE = role;
  var loginEl = document.getElementById('login');
  var appEl = document.getElementById('app');
  if (loginEl) loginEl.style.display = 'none';
  if (appEl) {
    appEl.style.display = 'block';
    document.body.style.background = 'var(--bg)';
  }
  var userBadge = document.getElementById('userBadge');
  if (userBadge) userBadge.textContent = ROLE;
  var isStaff = ROLE === 'staff';
  var isSeller = ROLE === 'seller';
  var isCustomer = ROLE === 'customer';
  var newOrderBtn = document.getElementById('newOrderBtn');
  var receivePaymentBtn = document.getElementById('receivePaymentBtn');
  var newTradeBtn = document.getElementById('newTradeBtn');
  var newExpenseBtn = document.getElementById('newExpenseBtn');
  if (newOrderBtn) newOrderBtn.style.display = (isStaff || isSeller) ? 'inline-flex' : 'none';
  if (receivePaymentBtn) receivePaymentBtn.style.display = (isStaff || isSeller) ? 'inline-flex' : 'none';
  if (newTradeBtn) newTradeBtn.style.display = (isStaff || isSeller) ? 'inline-flex' : 'none';
  if (newExpenseBtn) newExpenseBtn.style.display = (isStaff || isSeller) ? 'inline-flex' : 'none';

  document.body.classList.remove('staff-role', 'seller-role', 'customer-role');
  if (isStaff) document.body.classList.add('staff-role');
  else if (isSeller) document.body.classList.add('seller-role');
  else if (isCustomer) document.body.classList.add('customer-role');
};

window.checkStoredAuth = function() {
  var savedRole = localStorage.getItem('vinere_role');
  if (!savedRole || !PASSWORDS[savedRole]) return;

  window.firebase.auth().onAuthStateChanged(async function(user) {
    if (user) {
      ROLE = savedRole;
      showApp(savedRole);
      if (typeof initApp === 'function') {
        await initApp();
        switchView('orders');  // Initialize view - show only Orders buttons
      }
    }
  });
};

window.login = async function() {
  var input = $('passInput').value.trim();
  if (!input) return;
  var hash = await sha256(input);

  for (var role in PASSWORDS) {
    if (hash === PASSWORDS[role]) {
      ROLE = role;
      USER_HASH = hash;
      localStorage.setItem('vinere_role', role);

      try {
        var email = role + '@vinere.local';
        await window.firebase.auth().signInWithEmailAndPassword(email, input);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          try {
            await window.firebase.auth().createUserWithEmailAndPassword(email, input);
          } catch (createErr) {
            console.error('Firebase create failed', createErr);
            $('loginError').textContent = 'Auth error — check console';
            showToast('Firebase auth failed: ' + createErr.message, 'error');
            return;
          }
        } else if (err.code === 'auth/too-many-requests') {
          $('loginError').textContent = 'Too many attempts — wait 1 minute and try again';
          showToast('Too many login attempts. Please wait.', 'error', 4000);
          return;
        } else {
          console.error('Firebase auth failed', err);
          $('loginError').textContent = 'Auth error — check console';
          showToast('Firebase auth failed: ' + err.message, 'error');
          return;
        }
      }

      showApp(role);
      await initApp();
      switchView('orders');  // Initialize view - show only Orders buttons
      showToast('Welcome, ' + role, 'success', 2000);
      return;
    }
  }

  $('loginError').textContent = 'Invalid access code';
  showToast('Invalid access code', 'error');
};

/* ---------- Logout ---------- */
window.logout = function() {
  localStorage.removeItem('vinere_role');
  ROLE = null;
  USER_HASH = null;
  if (window.firebase && window.firebase.auth) {
    window.firebase.auth().signOut().catch(function() {});
  }
  location.reload();
};

$('loginBtn').addEventListener('click', window.login);
$('passInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') window.login(); });

/* ============ DATA KEYS ============ */
var DK = {
  sr: 'Sr. No.', customer: 'CUSTOMER', style: 'Style No.', date: 'Date',
  grossWt: 'Gross Wt', diaQty: 'Dia Qty', inCt: 'IN CT', colourStone: 'COLOUR STONE',
  netWt: 'Net Wt', multiplier: 'Multiplier', pgWt: 'Pg Wt', goldAmt: 'Gold Amount',
  diamAmount: 'Diam Amount', lCharges: 'L CHARGES', laborAmt: 'Labor Amount',
  subTotal: 'SUB TOTAL', usd: '$', soldTo: 'Sold To', salePrice: 'Sale Price',
  dateSold: 'Date Sold', amountPaid: 'Amount Paid', balanceDue: 'Balance Due',
  paymentStatus: 'Payment Status', paymentLog: 'Payment Log', memoNo: 'Memo No.'
};

function getField(row, key) {
  if (row[key] !== undefined) return row[key];
  if (row[key + ' '] !== undefined) return row[key + ' '];
  var lower = key.toLowerCase();
  if (row[lower] !== undefined) return row[lower];
  var title = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  if (row[title] !== undefined) return row[title];
  return undefined;
}

var SHEET_KEYS = {
  sr: 'Sr. No.', date: 'Date', item: 'Item', vendor: 'Vendor',
  purchasePrice: 'Purchase Price', salePrice: 'Sale Price', dateSold: 'Date Sold',
  soldTo: 'Sold To', amountPaid: 'Amount Paid', balanceDue: 'Balance Due',
  paymentStatus: 'Payment Status', paymentLog: 'Payment Log', profit: 'Profit / Loss', notes: 'Notes',
  memoNo: 'Memo No.'
};

var EXPENSE_KEYS = {
  sr: 'Sr. No.', date: 'Date', category: 'Category', description: 'Description',
  amount: 'Amount', seller: 'Seller', reimbursed: 'Reimbursed',
  reimbursementDate: 'Reimbursement Date', notes: 'Notes'
};

/* ============ GLOBAL STATE ============ */
var ORDERS = [];
var TRADING = [];
var EXPENSES = [];
var currentSearchQuery = '';
var GOLD_RATE = 16000;
window.GOLD_RATE = GOLD_RATE;
window.batchUpdateGoldRate = batchUpdateGoldRate;
window.loadGoldRate = loadGoldRate;

var currentView = 'orders';
var sortCol = null;
var sortDesc = false;
var currentPage = 1;
var PAGE_SIZE = 50;

/* ============ INIT ============ */
async function initApp() {
  await doFetchOrders();
  await doFetchTrading();
  await doFetchExpenses();
  await loadGoldRate();
  renderAll();
  initSwipeGestures();
  initPullToRefresh();
}

async function loadGoldRate() {
  var unsold = ORDERS.filter(function(r) {
    return (r[DK.paymentStatus] || 'Not Sold').trim() === 'Not Sold';
  });
  var withRate = unsold.find(function(r) { return r['Gold Rate']; });
  if (withRate) {
    var rate = parseFloat(withRate['Gold Rate']);
    if (!isNaN(rate) && rate > 0) {
      GOLD_RATE = rate;
      window.GOLD_RATE = rate;
      localStorage.setItem('vinere_gold_rate', rate);
      var input = $('goldRateInput');
      if (input) input.value = rate;
      return;
    }
  }

  var saved = localStorage.getItem('vinere_gold_rate');
  if (saved) {
    var val = parseFloat(saved);
    if (!isNaN(val) && val > 0) {
      GOLD_RATE = val;
      window.GOLD_RATE = val;
      var input = $('goldRateInput');
      if (input) input.value = val;
      return;
    }
  }

  GOLD_RATE = 16000;
  window.GOLD_RATE = 16000;
  var input = $('goldRateInput');
  if (input) input.value = 16000;
}

/* ============ FETCH ============ */
function normalizeRow(row) {
  var normalized = {};
  for (var key in row) {
    var cleanKey = key.trim();
    normalized[cleanKey] = row[key];
  }
  return normalized;
}

async function doFetchOrders() {
  try {
    var result = await window.fetchOrders();
    ORDERS = result.rows.map(normalizeRow);
    console.log('Loaded', ORDERS.length, 'orders');
  } catch (err) {
    console.error('Fetch orders failed', err);
    showToast('Failed to load orders', 'error');
  }
}

async function doFetchTrading() {
  try {
    var result = await window.fetchTrading();
    TRADING = result.rows.map(normalizeRow);
  } catch (err) {
    console.error('Fetch trading failed', err);
    showToast('Failed to load trading', 'error');
  }
}

async function doFetchExpenses() {
  try {
    var result = await window.fetchExpenses();
    EXPENSES = result.rows.map(normalizeRow);
  } catch (err) {
    console.error('Fetch expenses failed', err);
    showToast('Failed to load expenses', 'error');
  }
}

/* ============ RENDER ALL ============ */
function renderAll() {
  var banner = $('unifiedBanner');
  if (banner) banner.style.display = 'none';
  var summary = $('unifiedSummary');
  if (summary) summary.style.display = 'none';

  if (isUnifiedMode()) {
    renderUnifiedView();
    equalizeColumnWidths();
    updateSearchUI();
    return;
  }

  // ── RESTORE NORMAL VIEW (after leaving unified mode) ──
  $('headerStats').style.display = 'flex';

  // Re-activate correct tab button
  $('ordersViewBtn').classList.toggle('active', currentView === 'orders');
  $('tradingViewBtn').classList.toggle('active', currentView === 'trading');
  $('expensesViewBtn').classList.toggle('active', currentView === 'expenses');

  // Hide everything first, then show only current view
  ['ordersTable','tradingTable','expensesTable'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });
  ['kpiGrid','tradeKpiGrid','expenseKpiGrid'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });
  ['paginationBar','tradePaginationBar','expensePaginationBar'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });
  ['cardList','tradeCardList','expenseCardList'].forEach(function(id) {
    var el = $(id); if (el) el.classList.remove('active');
  });

  if (currentView === 'orders') {
    $('ordersTable').style.display = 'table';
    $('kpiGrid').style.display = 'grid';
    $('paginationBar').style.display = 'flex';
    $('cardList').classList.add('active');
    renderKPIs();
    renderTable();
    renderPagination();
    populateFilters();
  } else if (currentView === 'trading') {
    $('tradingTable').style.display = 'table';
    $('tradeKpiGrid').style.display = 'grid';
    $('tradePaginationBar').style.display = 'flex';
    $('tradeCardList').classList.add('active');
    renderTradeKPIs();
    renderTradeTable();
    renderTradePagination();
  } else if (currentView === 'expenses') {
    $('expensesTable').style.display = 'table';
    $('expenseKpiGrid').style.display = 'grid';
    $('expensePaginationBar').style.display = 'flex';
    $('expenseCardList').classList.add('active');
    renderExpenseKPIs();
    renderExpenseTable();
    renderExpensePagination();
  }

  // Filter bar visibility
  var goldWrap = $('goldRateInput');
  if (goldWrap && goldWrap.parentElement) {
    goldWrap.parentElement.style.display = (currentView === 'orders') ? 'flex' : 'none';
  }
  var rateNote = $('rateNote');
  if (rateNote) rateNote.style.display = (currentView === 'orders') ? '' : 'none';

  ['filterSoldTo','filterMemoNo','filterPaymentStatus'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = (currentView === 'expenses') ? 'none' : '';
  });
  ['filterExpenseCategory','filterExpenseSeller'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = (currentView === 'expenses') ? '' : 'none';
  });

  $('receivePaymentBtn').style.display = (ROLE !== 'customer' && currentView !== 'expenses') ? 'inline-flex' : 'none';

  equalizeColumnWidths();
  updateSearchUI();
}

/* ============ COLUMN WIDTHS ============ */
function equalizeColumnWidths() {
  var table = document.getElementById('ordersTable');
  if (!table) return;
  var cols = table.querySelectorAll('colgroup col');
  if (!cols.length) return;

  var baseWidths = [5, 7, 10, 8, 6, 6, 6, 9, 5, 7, 11, 8, 12];
  var total = baseWidths.reduce(function(s, w) { return s + w; }, 0);

  cols.forEach(function(col, i) {
    var w = baseWidths[i] || 0;
    col.style.width = ((w / total) * 100) + '%';
  });
}

/* ============ VIEW TOGGLE ============ */
$('ordersViewBtn').addEventListener('click', function() { switchView('orders'); });
$('tradingViewBtn').addEventListener('click', function() { switchView('trading'); });
$('expensesViewBtn').addEventListener('click', function() { switchView('expenses'); });

function switchView(view) {
  if (view === currentView) return;
  currentView = view;
  currentPage = 1;

  // Close all open panels
  if (typeof closePanel === 'function') closePanel();
  if (typeof closeTradePanel === 'function') closeTradePanel();
  if (typeof closeExpensePanel === 'function') closeExpensePanel();

  $('ordersViewBtn').classList.toggle('active', view === 'orders');
  $('tradingViewBtn').classList.toggle('active', view === 'trading');
  $('expensesViewBtn').classList.toggle('active', view === 'expenses');

  // Hide all tables
  ['ordersTable','tradingTable','expensesTable'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });
  // Hide all KPI grids
  ['kpiGrid','tradeKpiGrid','expenseKpiGrid'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });
  // Hide all pagination bars
  ['paginationBar','tradePaginationBar','expensePaginationBar'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });
  // Hide all card lists
  ['cardList','tradeCardList','expenseCardList'].forEach(function(id) {
    var el = $(id); if (el) el.classList.remove('active');
  });
  // Hide all action buttons
  ['newOrderBtn','newTradeBtn','newExpenseBtn'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = 'none';
  });

  // Show selected view
  if (view === 'orders') {
    $('ordersTable').style.display = 'table';
    $('kpiGrid').style.display = 'grid';
    $('paginationBar').style.display = 'flex';
    $('cardList').classList.add('active');
    $('newOrderBtn').style.display = (ROLE !== 'customer') ? 'inline-flex' : 'none';
  } else if (view === 'trading') {
    $('tradingTable').style.display = 'table';
    $('tradeKpiGrid').style.display = 'grid';
    $('tradePaginationBar').style.display = 'flex';
    $('tradeCardList').classList.add('active');
    $('newTradeBtn').style.display = (ROLE !== 'customer') ? 'inline-flex' : 'none';
  } else if (view === 'expenses') {
    $('expensesTable').style.display = 'table';
    $('expenseKpiGrid').style.display = 'grid';
    $('expensePaginationBar').style.display = 'flex';
    $('expenseCardList').classList.add('active');
    $('newExpenseBtn').style.display = (ROLE !== 'customer') ? 'inline-flex' : 'none';
  }

  // Filter bar visibility
  var goldWrap = $('goldRateInput');
  if (goldWrap && goldWrap.parentElement) {
    goldWrap.parentElement.style.display = (view === 'orders') ? 'flex' : 'none';
  }
  var rateNote = $('rateNote');
  if (rateNote) rateNote.style.display = (view === 'orders') ? '' : 'none';

  ['filterSoldTo','filterMemoNo','filterPaymentStatus'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = (view === 'expenses') ? 'none' : '';
  });
  ['filterExpenseCategory','filterExpenseSeller'].forEach(function(id) {
    var el = $(id); if (el) el.style.display = (view === 'expenses') ? '' : 'none';
  });

  $('receivePaymentBtn').style.display = (ROLE !== 'customer' && view !== 'expenses') ? 'inline-flex' : 'none';
  $('headerStats').style.display = 'flex';

  // Mobile FAB wiring
  var fab = $('mobileFab');
  if (fab) {
    fab.style.display = (window.innerWidth <= 900 && ROLE !== 'customer') ? 'flex' : 'none';
    fab.onclick = function() {
      if (currentView === 'orders' && window.openOrderPanel) window.openOrderPanel();
      else if (currentView === 'trading' && window.openTradePanel) window.openTradePanel();
      else if (currentView === 'expenses' && window.openExpensePanel) window.openExpensePanel();
    };
  }

  renderAll();
}

/* ============ SEARCH ============ */
$('search').addEventListener('input', function(e) {
  currentSearchQuery = e.target.value.trim().toLowerCase();
  currentPage = 1;
  updateSearchUI();
  renderAll();
});

function updateSearchUI() {
  var clearBtn = $('searchClear');
  var countEl = $('resultCount');
  if (clearBtn) clearBtn.style.display = currentSearchQuery ? 'flex' : 'none';

  var count;
  if (currentView === 'orders') count = getFilteredOrders().length;
  else if (currentView === 'trading') count = getFilteredTrading().length;
  else count = getFilteredExpenses().length;

  if (countEl) {
    if (currentSearchQuery) {
      countEl.textContent = count + ' result' + (count !== 1 ? 's' : '');
      countEl.style.display = 'inline-flex';
    } else {
      countEl.style.display = 'none';
    }
  }
}

$('searchClear').addEventListener('click', function() {
  $('search').value = '';
  currentSearchQuery = '';
  currentPage = 1;
  updateSearchUI();
  renderAll();
  $('search').focus();
});

/* ============ REFRESH ============ */
$('refreshBtn').addEventListener('click', async function() {
  showToast('Refreshing data...', 'info', 1500);
  await doFetchOrders();
  await doFetchTrading();
  await doFetchExpenses();
  renderAll();
  showToast('Data refreshed', 'success', 2000);
});

/* ============ NEW ORDER / TRADE / EXPENSE / PAYMENT ============ */
$('newOrderBtn').addEventListener('click', function() {
  if (window.openOrderPanel) window.openOrderPanel();
});

$('newTradeBtn').addEventListener('click', function() {
  if (window.openTradePanel) window.openTradePanel();
});

$('newExpenseBtn').addEventListener('click', function() {
  if (window.openExpensePanel) window.openExpensePanel();
});

$('receivePaymentBtn').addEventListener('click', function() {
  if (window.openPaymentSearch) window.openPaymentSearch();
});

/* ============ FILTERS ============ */
function populateFilters() {
  // Customer dropdown removed — no-op
}

/* ============ GOLD RATE ============ */
var goldRateDebounce;
$('goldRateInput').addEventListener('input', function() {
  var val = parseFloat(this.value);
  if (!isNaN(val) && val > 0) {
    GOLD_RATE = val;
    window.GOLD_RATE = val;
    renderAll();
  }
  // Debounce the Firebase sync — only write after user stops typing
  clearTimeout(goldRateDebounce);
  goldRateDebounce = setTimeout(async function() {
    var finalVal = parseFloat($('goldRateInput').value);
    if (!isNaN(finalVal) && finalVal > 0) {
      GOLD_RATE = finalVal;
      window.GOLD_RATE = finalVal;
      localStorage.setItem('vinere_gold_rate', finalVal);
      try { await window.saveSettings(finalVal); } catch(e) { console.error('Failed to save gold rate setting', e); }
      await batchUpdateGoldRate(finalVal);
    }
  }, 800);
});

async function batchUpdateGoldRate(newRate) {
  var unsold = ORDERS.filter(function(r) {
    return (r[DK.paymentStatus] || 'Not Sold').trim() === 'Not Sold';
  });
  if (!unsold.length) {
    showToast('Gold rate set to \u20b9' + newRate.toLocaleString('en-IN'), 'info', 1500);
    return;
  }
  showToast('Syncing ' + unsold.length + ' unsold orders to new gold rate\u2026', 'info', 3000);
  for (var i = 0; i < unsold.length; i++) {
    var r = unsold[i];
    var net = parseFloat(r[DK.netWt]) || 0;
    var mult = parseFloat(r[DK.multiplier]) || 0.595;
    var pgWt = net * mult;
    var goldAmt = pgWt * newRate;
    var labor = parseFloat(r[DK.laborAmt]) || 0;
    var diam = parseFloat(r[DK.diamAmount]) || 0;
    var subTotal = goldAmt + labor + diam;
    var usd = subTotal / 94;
    var data = {};
    for (var k in r) data[k] = r[k];
    data[DK.pgWt] = pgWt.toFixed(3);
    data[DK.goldAmt] = Math.round(goldAmt).toString();
    data[DK.subTotal] = Math.round(subTotal).toString();
    data[DK.usd] = usd.toFixed(2);
    data['Gold Rate'] = newRate.toString();
    try { await window.updateOrder(r._id, data); } catch(e) { console.error('Gold sync failed for', r._id, e); }
  }
  await doFetchOrders();
  renderAll();
  showToast('Gold rate \u20b9' + newRate.toLocaleString('en-IN') + ' synced to ' + unsold.length + ' orders', 'success', 2500);
}

$('clearFiltersBtn').addEventListener('click', function() {
  $('filterSoldTo').value = '';
  $('filterMemoNo').value = '';
  $('filterPaymentStatus').value = '';
  $('filterExpenseCategory').value = '';
  $('filterExpenseSeller').value = '';
  sortCol = null;
  sortDesc = false;
  currentPage = 1;
  renderAll();
});

/* ============ PAGINATION ============ */
function renderPagination() {
  var filtered = getFilteredOrders();
  var totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;

  $('paginationBar').innerHTML =
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changePage(1)">First</button>' +
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changePage(' + (currentPage - 1) + ')">Prev</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changePage(' + (currentPage + 1) + ')">Next</button>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changePage(' + totalPages + ')">Last</button>';
}

function renderTradePagination() {
  var filtered = getFilteredTrading();
  var totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;

  $('tradePaginationBar').innerHTML =
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changeTradePage(1)">First</button>' +
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changeTradePage(' + (currentPage - 1) + ')">Prev</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changeTradePage(' + (currentPage + 1) + ')">Next</button>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changeTradePage(' + totalPages + ')">Last</button>';
}

function renderExpensePagination() {
  var filtered = getFilteredExpenses();
  var totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  $('expensePaginationBar').innerHTML =
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changeExpensePage(1)">First</button>' +
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changeExpensePage(' + (currentPage - 1) + ')">Prev</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + '</span>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changeExpensePage(' + (currentPage + 1) + ')">Next</button>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changeExpensePage(' + totalPages + ')">Last</button>';
}

window.changePage = function(p) { currentPage = p; renderTable(); renderPagination(); };
window.changeTradePage = function(p) { currentPage = p; renderTradeTable(); renderTradePagination(); };
window.changeExpensePage = function(p) { currentPage = p; renderExpenseTable(); renderExpensePagination(); };

/* ============ SWIPE GESTURES (mobile) ============ */
function initSwipeGestures() {
  var touchStartX = 0;
  var touchEndX = 0;
  var minSwipe = 60;

  document.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    var diff = touchStartX - touchEndX;
    if (Math.abs(diff) < minSwipe) return;

    var filtered, totalPages;
    if (currentView === 'orders') {
      filtered = getFilteredOrders();
      totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
      if (diff > 0 && currentPage < totalPages) {
        changePage(currentPage + 1);
        showToast('Page ' + currentPage, 'info', 800);
      } else if (diff < 0 && currentPage > 1) {
        changePage(currentPage - 1);
        showToast('Page ' + currentPage, 'info', 800);
      }
    } else if (currentView === 'trading') {
      filtered = getFilteredTrading();
      totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
      if (diff > 0 && currentPage < totalPages) {
        changeTradePage(currentPage + 1);
        showToast('Page ' + currentPage, 'info', 800);
      } else if (diff < 0 && currentPage > 1) {
        changeTradePage(currentPage - 1);
        showToast('Page ' + currentPage, 'info', 800);
      }
    } else if (currentView === 'expenses') {
      filtered = getFilteredExpenses();
      totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
      if (diff > 0 && currentPage < totalPages) {
        changeExpensePage(currentPage + 1);
        showToast('Page ' + currentPage, 'info', 800);
      } else if (diff < 0 && currentPage > 1) {
        changeExpensePage(currentPage - 1);
        showToast('Page ' + currentPage, 'info', 800);
      }
    }
  }
}

/* ============ SORT ============ */
function sortByColumn(col) {
  if (sortCol === col) {
    if (sortDesc) {
      sortCol = null;   // third click = reset to default Sr. order
      sortDesc = false;
    } else {
      sortDesc = true;  // second click = descending
    }
  } else {
    sortCol = col;
    sortDesc = false;   // first click = ascending
  }
  currentPage = 1;
  renderAll();
}

/* ============ FILTER LOGIC ============ */
function getFilteredOrders() {
  var rows = [...ORDERS];
  var q = currentSearchQuery;
  var soldToFilter = $('filterSoldTo').value.trim().toLowerCase();
  var memoNoFilter = $('filterMemoNo').value.trim().toLowerCase();
  var paymentStatusFilter = $('filterPaymentStatus').value;

  if (q) {
    rows = rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }
  if (soldToFilter) rows = rows.filter(function(r) { return String(r[DK.soldTo] || '').toLowerCase().includes(soldToFilter); });
  if (memoNoFilter) rows = rows.filter(function(r) { return String(r[DK.memoNo] || '').toLowerCase() === memoNoFilter; });
  if (paymentStatusFilter) rows = rows.filter(function(r) { return (r[DK.paymentStatus] || 'Not Sold').trim() === paymentStatusFilter; });

  if (sortCol === 'inCt') {
    rows.sort(function(a, b) {
      var av = parseFloat(a[DK.inCt]) || 0;
      var bv = parseFloat(b[DK.inCt]) || 0;
      return sortDesc ? bv - av : av - bv;
    });
  } else if (sortCol === 'sr') {
    rows.sort(function(a, b) {
      var av = parseInt(a[DK.sr]) || 0;
      var bv = parseInt(b[DK.sr]) || 0;
      return sortDesc ? bv - av : av - bv;
    });
  }

  return rows;
}

function getFilteredTrading() {
  var rows = [...TRADING];
  var q = currentSearchQuery;
  if (q) {
    rows = rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }
  var memoNo = $('filterMemoNo').value.trim().toLowerCase();
  var soldTo = $('filterSoldTo').value.trim().toLowerCase();
  var paymentStatus = $('filterPaymentStatus').value;
  if (memoNo) rows = rows.filter(function(r) { return String(r[SHEET_KEYS.memoNo] || '').toLowerCase() === memoNo; });
  if (soldTo) rows = rows.filter(function(r) { return String(r[SHEET_KEYS.soldTo] || '').toLowerCase().includes(soldTo); });
  if (paymentStatus) rows = rows.filter(function(r) { return (r[SHEET_KEYS.paymentStatus] || 'Not Sold').trim() === paymentStatus; });
  return rows;
}

function getFilteredExpenses() {
  var rows = [...EXPENSES];
  var q = currentSearchQuery;
  if (q) {
    rows = rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); });
    });
  }
  var category = $('filterExpenseCategory').value;
  var seller = $('filterExpenseSeller').value.trim().toLowerCase();
  if (category) rows = rows.filter(function(r) { return (r[EXPENSE_KEYS.category] || '') === category; });
  if (seller) rows = rows.filter(function(r) { return String(r[EXPENSE_KEYS.seller] || '').toLowerCase().includes(seller); });
  return rows;
}

/* ============ UNIFIED VIEW ============ */
function isUnifiedMode() {
  var memoNo = $('filterMemoNo').value.trim();
  var soldTo = $('filterSoldTo').value.trim();
  return !!(memoNo || soldTo);
}

function getUnifiedResults() {
  var memoNo = $('filterMemoNo').value.trim().toLowerCase();
  var soldTo = $('filterSoldTo').value.trim().toLowerCase();
  var q = currentSearchQuery;
  var paymentStatus = $('filterPaymentStatus').value;

  var orderRows = [...ORDERS].filter(function(r) {
    if (q && !Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); })) return false;
    if (memoNo && String(r[DK.memoNo] || '').toLowerCase() !== memoNo) return false;
    if (soldTo && !String(r[DK.soldTo] || '').toLowerCase().includes(soldTo)) return false;
    if (paymentStatus && (r[DK.paymentStatus] || 'Not Sold').trim() !== paymentStatus) return false;
    return true;
  });
  orderRows.forEach(function(r) { r._type = 'order'; r._sortSr = parseInt(r[DK.sr]) || 0; r._sortMemo = String(r[DK.memoNo] || '').toLowerCase(); });

  var tradeRows = [...TRADING].filter(function(r) {
    if (q && !Object.values(r).some(function(v) { return String(v).toLowerCase().includes(q); })) return false;
    if (memoNo && String(r[SHEET_KEYS.memoNo] || '').toLowerCase() !== memoNo) return false;
    if (soldTo && !String(r[SHEET_KEYS.soldTo] || '').toLowerCase().includes(soldTo)) return false;
    if (paymentStatus && (r[SHEET_KEYS.paymentStatus] || 'Not Sold').trim() !== paymentStatus) return false;
    return true;
  });
  tradeRows.forEach(function(r) { r._type = 'trade'; r._sortSr = parseInt(r[SHEET_KEYS.sr]) || 0; r._sortMemo = String(r[SHEET_KEYS.memoNo] || '').toLowerCase(); });

  var results = orderRows.concat(tradeRows);
  results.sort(function(a, b) {
    if (a._sortMemo !== b._sortMemo) return a._sortMemo.localeCompare(b._sortMemo);
    if (a._type !== b._type) return a._type === 'order' ? -1 : 1;
    return a._sortSr - b._sortSr;
  });
  return results;
}

function renderUnifiedView() {
  $('ordersViewBtn').classList.remove('active');
  $('tradingViewBtn').classList.remove('active');
  $('expensesViewBtn').classList.remove('active');
  $('headerStats').style.display = 'none';
  $('kpiGrid').style.display = 'none';
  $('tradeKpiGrid').style.display = 'none';
  $('expenseKpiGrid').style.display = 'none';

  var banner = $('unifiedBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'unifiedBanner';
    banner.className = 'unified-banner';
    var ref = $('kpiGrid');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(banner, ref);
  }

  var memoNo = $('filterMemoNo').value.trim();
  var soldTo = $('filterSoldTo').value.trim();
  var parts = [];
  if (memoNo) parts.push('Memo <strong>' + escapeHtml(memoNo) + '</strong>');
  if (soldTo) parts.push('Buyer <strong>' + escapeHtml(soldTo) + '</strong>');
  banner.innerHTML = 'Combined results for ' + parts.join(' + ') +
    '<span style="margin-left:12px;font-size:12px;opacity:0.8;">Orders are blue \u00b7 Trades are green</span>' +
    '<button class="btn text small" style="margin-left:auto;" onclick="$(\'filterMemoNo\').value=\'\';$(\'filterSoldTo\').value=\'\';window.currentPage=1;renderAll();">Show tab view</button>';
  banner.style.display = 'flex';

  var summary = $('unifiedSummary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'unifiedSummary';
    summary.className = 'kpi-grid';
    summary.style.marginBottom = 'var(--space-4)';
    if (banner && banner.parentNode) banner.parentNode.insertBefore(summary, banner.nextSibling);
  }
  var results = getUnifiedResults();
  var totalBill = 0, totalPaid = 0;
  results.forEach(function(r) {
    var K = r._type === 'order' ? DK : SHEET_KEYS;
    totalBill += parseFloat(r[K.salePrice]) || 0;
    totalPaid += parseFloat(r[K.amountPaid]) || 0;
  });
  var balance = totalBill - totalPaid;
  var status = totalBill === 0 ? 'Not Sold' : (totalPaid >= totalBill ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Unpaid'));
  summary.innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Total Bill</div><div class="kpi-value">$' + fmtMoney(totalBill) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value">$' + fmtMoney(totalPaid) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Balance Due</div><div class="kpi-value" style="color:' + (balance > 0 ? 'var(--error)' : 'var(--success)') + '">$' + fmtMoney(balance) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Memo Status</div><div class="kpi-value">' + status + '</div></div>';
  summary.style.display = 'grid';

  renderUnifiedTable();
  renderUnifiedCards();
  renderUnifiedPagination();
}

function renderUnifiedPagination() {
  var results = getUnifiedResults();
  var totalPages = Math.ceil(results.length / PAGE_SIZE) || 1;
  $('paginationBar').style.display = 'flex';
  $('paginationBar').innerHTML =
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changeUnifiedPage(1)">First</button>' +
    '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="window.changeUnifiedPage(' + (currentPage - 1) + ')">Prev</button>' +
    '<span class="page-info">Page ' + currentPage + ' of ' + totalPages + ' \u00b7 ' + results.length + ' results</span>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changeUnifiedPage(' + (currentPage + 1) + ')">Next</button>' +
    '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="window.changeUnifiedPage(' + totalPages + ')">Last</button>';
  $('tradePaginationBar').style.display = 'none';
  $('expensePaginationBar').style.display = 'none';
}

window.changeUnifiedPage = function(p) {
  currentPage = p;
  renderUnifiedTable();
  renderUnifiedCards();
  renderUnifiedPagination();
};


/* ============ PULL TO REFRESH (mobile) ============ */
function initPullToRefresh() {
  var startY = 0;
  var threshold = 120;
  var refreshing = false;
  var indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<div class="ptr-spinner"></div>';
  indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-40px);z-index:120;opacity:0;transition:opacity 0.2s;pointer-events:none;';
  var spinner = indicator.querySelector('.ptr-spinner');
  if (spinner) spinner.style.cssText = 'width:28px;height:28px;border:3px solid var(--md-outline);border-top-color:var(--md-primary);border-radius:50%;animation:ptrSpin 0.8s linear infinite;';
  document.body.prepend(indicator);

  // inject keyframes if not present
  if (!document.getElementById('ptr-style')) {
    var s = document.createElement('style');
    s.id = 'ptr-style';
    s.textContent = '@keyframes ptrSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  document.addEventListener('touchstart', function(e) {
    if (window.scrollY === 0) startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (refreshing || window.scrollY > 0) return;
    var diff = e.touches[0].clientY - startY;
    if (diff > 0 && diff < threshold * 1.5) {
      indicator.style.transform = 'translateX(-50%) translateY(' + (diff - 40) + 'px)';
      indicator.style.opacity = Math.min(diff / threshold, 1);
    }
  }, { passive: true });

  document.addEventListener('touchend', function() {
    var diff = parseFloat(indicator.style.transform.replace('translateY(', '').replace('px)', '')) || 0;
    diff = Math.abs(diff);
    if (diff > threshold - 40 && !refreshing) {
      refreshing = true;
      indicator.querySelector('.ptr-spinner').style.animationDuration = '0.5s';
      showToast('Refreshing...', 'info', 1000);
      Promise.all([doFetchOrders(), doFetchTrading(), doFetchExpenses()]).then(function() {
        renderAll();
        refreshing = false;
        indicator.querySelector('.ptr-spinner').style.animationDuration = '0.8s';
        indicator.style.transform = 'translateX(-50%) translateY(-40px)';
        indicator.style.opacity = '0';
      });
    } else {
      indicator.style.transform = 'translateX(-50%) translateY(-40px)';
      indicator.style.opacity = '0';
    }
  }, { passive: true });
}

/* ============ EXPOSE GLOBALLY ============ */
window.ROLE = ROLE;
window.DK = DK;
window.SHEET_KEYS = SHEET_KEYS;
window.EXPENSE_KEYS = EXPENSE_KEYS;
window.ORDERS = ORDERS;
window.TRADING = TRADING;
window.EXPENSES = EXPENSES;
window.currentPage = currentPage;
window.PAGE_SIZE = PAGE_SIZE;
window.currentSearchQuery = currentSearchQuery;
window.getFilteredOrders = getFilteredOrders;
window.getFilteredTrading = getFilteredTrading;
window.getFilteredExpenses = getFilteredExpenses;
window.switchView = switchView;
window.renderAll = renderAll;
window.doFetchOrders = doFetchOrders;
window.doFetchTrading = doFetchTrading;
window.doFetchExpenses = doFetchExpenses;
window.equalizeColumnWidths = equalizeColumnWidths;
window.populateFilters = populateFilters;
window.GOLD_RATE = GOLD_RATE;
window.batchUpdateGoldRate = batchUpdateGoldRate;
window.loadGoldRate = loadGoldRate;
window.isUnifiedMode = isUnifiedMode;
window.getUnifiedResults = getUnifiedResults;
window.renderUnifiedView = renderUnifiedView;
window.sortByColumn = sortByColumn;
window.changeExpensePage = function(p) { currentPage = p; renderExpenseTable(); renderExpensePagination(); };

/* ============ FAB RESIZE LISTENER ============ */
window.addEventListener('resize', function() {
  var fab = $('mobileFab');
  if (fab) {
    fab.style.display = (window.innerWidth <= 900 && ROLE !== 'customer') ? 'flex' : 'none';
  }
});
