/* ============================================
   VINÉRE — Customer Profile & Business Insights
   ============================================ */

/* ============ SHARED: memo payment splitting ============
   Same idea as dashboard.js's getMemoOwnShareCollectedOutstanding,
   generalized to any "own bill" amount (here: one customer's slice
   of a memo, rather than one tab's slice). Splits whatever has
   actually been paid on the memo proportionally by how much of the
   memo's total bill belongs to `ownBill`. */
function getMemoShareForBill(memo, ownBill) {
  var orders = getMemoOrders(memo);
  var trades = getMemoTrades(memo);
  var totalBill = orders.reduce(function(s, o) { return s + (parseFloat(o[DK.salePrice]) || 0); }, 0) +
                  trades.reduce(function(s, t) { return s + (parseFloat(t[SHEET_KEYS.salePrice]) || 0); }, 0);
  var totalPaid = getAggregatedPaymentLog(memo).reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);

  if (totalBill <= 0) return { collected: 0, outstanding: 0 };
  var ratio = ownBill / totalBill;
  var collected = Math.min(ownBill, totalPaid * ratio);
  return { collected: collected, outstanding: Math.max(0, ownBill - collected) };
}

/* ============ CUSTOMER PROFILE ============ */

window.openCustomerProfile = function(name) {
  if (!name) return;
  var overlay = $('customerProfileOverlay');
  var modal = $('customerProfileModal');
  if (!overlay || !modal) return;

  var orders = ORDERS.filter(function(o) { return normalizeBuyerName(o[DK.soldTo]) === normalizeBuyerName(name); });
  var trades = TRADING.filter(function(t) { return normalizeBuyerName(t[SHEET_KEYS.soldTo]) === normalizeBuyerName(name); });

  var totalBill = 0, totalCollected = 0, totalOutstanding = 0;
  var items = [];

  function processItem(row, keys, typeLabel, descFn) {
    var price = parseFloat(row[keys.salePrice]) || 0;
    var memo = row[keys.memoNo];
    var share;
    if (memo) {
      share = getMemoShareForBill(memo, price);
    } else {
      share = {
        collected: parseFloat(row[keys.amountPaid]) || 0,
        outstanding: parseFloat(row[keys.balanceDue]) || 0
      };
    }
    totalBill += price;
    totalCollected += share.collected;
    totalOutstanding += share.outstanding;
    items.push({
      type: typeLabel,
      date: row[keys.date],
      desc: descFn(row),
      memo: memo,
      price: price,
      status: (row[keys.paymentStatus] || 'Not Sold').trim()
    });
  }

  orders.forEach(function(o) {
    processItem(o, DK, 'Order', function(r) { return r[DK.jewelryType] || r[DK.style] || 'Item'; });
  });
  trades.forEach(function(t) {
    processItem(t, SHEET_KEYS, 'Trade', function(r) { return r[SHEET_KEYS.item] || 'Item'; });
  });

  items.sort(function(a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });

  $('customerProfileName').textContent = name;
  $('customerProfileKPIs').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Total Items</div><div class="kpi-value">' + items.length + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Billed</div><div class="kpi-value">$' + fmtMoney(totalBill) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Collected</div><div class="kpi-value" style="color:var(--success)">$' + fmtMoney(totalCollected) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Outstanding</div><div class="kpi-value" style="color:var(--warning)">$' + fmtMoney(totalOutstanding) + '</div></div>';

  $('customerProfileItems').innerHTML = items.length
    ? items.map(function(it) {
        var statusClass = 'status-' + it.status.toLowerCase().replace(/\s+/g, '-');
        return '<div class="customer-item-row">' +
          '<span>' + fmtDate(it.date) + ' &middot; ' + escapeHtml(it.desc) +
          (it.memo ? ' &middot; <span class="memo-link" data-memo="' + escapeHtml(it.memo) + '">Memo ' + escapeHtml(it.memo) + '</span>' : '') + '</span>' +
          '<span><span class="status-badge ' + statusClass + '">' + it.status + '</span>&nbsp; $' + fmtMoney(it.price) + '</span>' +
          '</div>';
      }).join('')
    : '<div style="padding:20px;text-align:center;color:var(--text-dim);">No records found</div>';

  wireMemoLinks($('customerProfileItems'));

  overlay.classList.add('open');
  modal.classList.add('open');
};

function closeCustomerProfile() {
  $('customerProfileOverlay').classList.remove('open');
  $('customerProfileModal').classList.remove('open');
}
$('closeCustomerProfile').addEventListener('click', closeCustomerProfile);
$('customerProfileOverlay').addEventListener('click', closeCustomerProfile);

/* ============ MEMO DETAIL (opens on top of Customer Profile, etc.) ============ */

// Builds everything needed to show a memo: its bill, what's been paid
// (via the same aggregated log used throughout the app), and each item
// in it — orders and trades together.
function getMemoSummary(memoNo) {
  var orders = getMemoOrders(memoNo);
  var trades = getMemoTrades(memoNo);

  var items = orders.map(function(o) {
    return {
      type: 'Order', date: o[DK.date], desc: o[DK.jewelryType] || o[DK.style] || 'Item',
      price: parseFloat(o[DK.salePrice]) || 0, status: (o[DK.paymentStatus] || 'Not Sold').trim()
    };
  }).concat(trades.map(function(t) {
    return {
      type: 'Trade', date: t[SHEET_KEYS.date], desc: t[SHEET_KEYS.item] || 'Item',
      price: parseFloat(t[SHEET_KEYS.salePrice]) || 0, status: (t[SHEET_KEYS.paymentStatus] || 'Not Sold').trim()
    };
  }));
  items.sort(function(a, b) { return new Date(a.date || 0) - new Date(b.date || 0); });

  var bill = items.reduce(function(s, it) { return s + it.price; }, 0);
  var paid = getAggregatedPaymentLog(memoNo).reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
  var balance = bill - paid;
  var status = bill === 0 ? 'Not Sold' : (paid >= bill ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid'));

  return { items: items, bill: bill, paid: paid, balance: balance, status: status };
}

window.openMemoDetail = function(memoNo) {
  if (!memoNo) return;
  var summary = getMemoSummary(memoNo);

  $('memoDetailTitle').textContent = 'Memo ' + memoNo;
  $('memoDetailKPIs').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Total Bill</div><div class="kpi-value">$' + fmtMoney(summary.bill) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Paid</div><div class="kpi-value" style="color:var(--success)">$' + fmtMoney(summary.paid) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Balance Due</div><div class="kpi-value" style="color:' + (summary.balance > 0.01 ? 'var(--warning)' : 'var(--success)') + '">$' + fmtMoney(Math.abs(summary.balance)) + '</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Status</div><div class="kpi-value">' + summary.status + '</div></div>';

  $('memoDetailItems').innerHTML = summary.items.length
    ? summary.items.map(function(it) {
        var statusClass = 'status-' + it.status.toLowerCase().replace(/\s+/g, '-');
        return '<div class="customer-item-row">' +
          '<span>' + fmtDate(it.date) + ' &middot; ' + escapeHtml(it.type) + ' &middot; ' + escapeHtml(it.desc) + '</span>' +
          '<span><span class="status-badge ' + statusClass + '">' + it.status + '</span>&nbsp; $' + fmtMoney(it.price) + '</span>' +
          '</div>';
      }).join('')
    : '<div style="padding:20px;text-align:center;color:var(--text-dim);">No items found for this memo</div>';

  hideMemoHoverPreview();
  $('memoDetailOverlay').classList.add('open');
  $('memoDetailModal').classList.add('open');
};

function closeMemoDetail() {
  $('memoDetailOverlay').classList.remove('open');
  $('memoDetailModal').classList.remove('open');
}
$('closeMemoDetail').addEventListener('click', closeMemoDetail);
$('memoDetailOverlay').addEventListener('click', closeMemoDetail);

/* ============ MEMO HOVER PREVIEW ============ */

function showMemoHoverPreview(el, memoNo) {
  var box = $('memoHoverPreview');
  if (!box) return;
  var summary = getMemoSummary(memoNo);

  box.innerHTML =
    '<div class="title">Memo ' + escapeHtml(memoNo) + '</div>' +
    '<div class="row"><span>Items</span><span class="val">' + summary.items.length + '</span></div>' +
    '<div class="row"><span>Bill</span><span class="val">$' + fmtMoney(summary.bill) + '</span></div>' +
    '<div class="row"><span>Paid</span><span class="val">$' + fmtMoney(summary.paid) + '</span></div>' +
    '<div class="row"><span>Balance</span><span class="val">$' + fmtMoney(Math.abs(summary.balance)) + '</span></div>';

  var rect = el.getBoundingClientRect();
  box.classList.add('show');
  var boxRect = box.getBoundingClientRect();
  var top = rect.bottom + 6;
  var left = rect.left;
  if (left + boxRect.width > window.innerWidth - 8) left = window.innerWidth - boxRect.width - 8;
  if (top + boxRect.height > window.innerHeight - 8) top = rect.top - boxRect.height - 6;
  box.style.top = top + 'px';
  box.style.left = left + 'px';
}

function hideMemoHoverPreview() {
  var box = $('memoHoverPreview');
  if (box) box.classList.remove('show');
}

// Attaches click (open full Memo Detail) and hover (quick preview) behavior
// to every .memo-link[data-memo] element inside a given container. Call
// this again any time new memo links are rendered into the page.
function wireMemoLinks(container) {
  if (!container) return;
  container.querySelectorAll('.memo-link').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      window.openMemoDetail(el.dataset.memo);
    });
    el.addEventListener('mouseenter', function() { showMemoHoverPreview(el, el.dataset.memo); });
    el.addEventListener('mouseleave', hideMemoHoverPreview);
  });
}
window.wireMemoLinks = wireMemoLinks;

/* ============ VENDOR PROFITABILITY ============ */

function renderVendorReport() {
  var vendors = {};
  TRADING.forEach(function(t) {
    var vendor = (t[SHEET_KEYS.vendor] || 'Unknown').trim() || 'Unknown';
    if (!vendors[vendor]) vendors[vendor] = { count: 0, sold: 0, invested: 0, sales: 0, profit: 0 };
    var purchase = parseFloat(t[SHEET_KEYS.purchasePrice]) || 0;
    var sale = parseFloat(t[SHEET_KEYS.salePrice]) || 0;
    vendors[vendor].count++;
    vendors[vendor].invested += purchase;
    if (sale) {
      vendors[vendor].sales += sale;
      vendors[vendor].profit += (sale - purchase);
      vendors[vendor].sold++;
    }
  });

  var rows = Object.keys(vendors).map(function(v) {
    var r = vendors[v];
    r.vendor = v;
    return r;
  });
  rows.sort(function(a, b) { return b.profit - a.profit; });

  var target = $('insightsVendorsTab');
  if (!rows.length) {
    target.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);">No trades recorded yet</div>';
    return;
  }

  target.innerHTML =
    '<table class="report-table"><thead><tr>' +
    '<th>Vendor</th><th class="num">Items</th><th class="num">Sold</th>' +
    '<th class="num">Invested</th><th class="num">Sales</th><th class="num">Profit</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.vendor) + '</td>' +
        '<td class="num">' + r.count + '</td>' +
        '<td class="num">' + r.sold + '</td>' +
        '<td class="num">$' + fmtMoney(r.invested) + '</td>' +
        '<td class="num">$' + fmtMoney(r.sales) + '</td>' +
        '<td class="num" style="color:' + (r.profit >= 0 ? 'var(--success)' : 'var(--error)') + '">' +
        (r.profit >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(r.profit)) + '</td>' +
        '</tr>';
    }).join('') +
    '</tbody></table>';
}

/* ============ BEST SELLERS: JEWELRY TYPE / DIAMOND SHAPE ============ */

function renderBestSellers() {
  var types = {};
  var shapes = {};

  ORDERS.forEach(function(o) {
    var sale = parseFloat(o[DK.salePrice]) || 0;
    if (!sale) return; // only count items that actually sold

    var type = (o[DK.jewelryType] || 'Unspecified').trim() || 'Unspecified';
    if (!types[type]) types[type] = { count: 0, revenue: 0 };
    types[type].count++;
    types[type].revenue += sale;

    var shape = (o[DK.diamondShape] || 'Unspecified').trim() || 'Unspecified';
    if (!shapes[shape]) shapes[shape] = { count: 0, revenue: 0 };
    shapes[shape].count++;
    shapes[shape].revenue += sale;
  });

  function buildTable(map, label) {
    var rows = Object.keys(map).map(function(k) {
      var r = map[k];
      r.name = k;
      return r;
    });
    rows.sort(function(a, b) { return b.count - a.count; });
    if (!rows.length) {
      return '<h4 style="margin:16px 0 8px;font-size:13px;color:var(--md-on-surface-variant);">' + label + '</h4>' +
        '<div style="padding:8px 0;color:var(--text-dim);">No sold orders yet</div>';
    }
    return '<h4 style="margin:16px 0 8px;font-size:13px;color:var(--md-on-surface-variant);">' + label + '</h4>' +
      '<table class="report-table"><thead><tr><th>' + label + '</th><th class="num">Sold</th><th class="num">Revenue</th></tr></thead><tbody>' +
      rows.map(function(r) {
        return '<tr><td>' + escapeHtml(r.name) + '</td><td class="num">' + r.count + '</td><td class="num">$' + fmtMoney(r.revenue) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  $('insightsBestSellersTab').innerHTML = buildTable(types, 'Jewelry Type') + buildTable(shapes, 'Diamond Shape');
}

/* ============ INSIGHTS MODAL (shared shell) ============ */

window.openInsights = function() {
  renderVendorReport();
  renderBestSellers();
  $('insightsOverlay').classList.add('open');
  $('insightsModal').classList.add('open');
};

function closeInsights() {
  $('insightsOverlay').classList.remove('open');
  $('insightsModal').classList.remove('open');
}
$('closeInsights').addEventListener('click', closeInsights);
$('insightsOverlay').addEventListener('click', closeInsights);
$('insightsBtn').addEventListener('click', window.openInsights);

document.querySelectorAll('.insights-tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.insights-tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.insights-tab-content').forEach(function(c) { c.classList.remove('active'); });
    btn.classList.add('active');
    $(btn.dataset.target).classList.add('active');
  });
});
