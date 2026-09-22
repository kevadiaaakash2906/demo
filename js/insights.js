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

  var orders = ORDERS.filter(function(o) { return (o[DK.soldTo] || '').trim().toLowerCase() === name.trim().toLowerCase(); });
  var trades = TRADING.filter(function(t) { return (t[SHEET_KEYS.soldTo] || '').trim().toLowerCase() === name.trim().toLowerCase(); });

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
          (it.memo ? ' &middot; Memo ' + escapeHtml(it.memo) : '') + '</span>' +
          '<span><span class="status-badge ' + statusClass + '">' + it.status + '</span>&nbsp; $' + fmtMoney(it.price) + '</span>' +
          '</div>';
      }).join('')
    : '<div style="padding:20px;text-align:center;color:var(--text-dim);">No records found</div>';

  overlay.style.display = 'block';
  modal.classList.add('open');
};

function closeCustomerProfile() {
  $('customerProfileOverlay').style.display = 'none';
  $('customerProfileModal').classList.remove('open');
}
$('closeCustomerProfile').addEventListener('click', closeCustomerProfile);
$('customerProfileOverlay').addEventListener('click', closeCustomerProfile);

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
  $('insightsOverlay').style.display = 'block';
  $('insightsModal').classList.add('open');
};

function closeInsights() {
  $('insightsOverlay').style.display = 'none';
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
