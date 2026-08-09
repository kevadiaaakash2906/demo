/* ============================================
   VINÉRE — Table Renderers
   ============================================ */

function renderTable() {
  var tbody = $('tbody');
  var filtered = getFilteredOrders();

  // Apply role-based view class to table
  var table = $('ordersTable');
  table.classList.remove('seller-view', 'staff-view', 'customer-view');
  if (ROLE === 'seller') table.classList.add('seller-view');
  else if (ROLE === 'staff') table.classList.add('staff-view');
  else if (ROLE === 'customer') table.classList.add('customer-view');
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageRows = filtered.slice(start, start + PAGE_SIZE);
  var q = window.currentSearchQuery || '';

  if (!pageRows.length) {
    var msg = window.currentSearchQuery 
      ? 'No orders match "' + escapeHtml(window.currentSearchQuery) + '"' 
      : 'No orders found';
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text-dim)">' + msg + '</td></tr>';
    return;
  }

  tbody.innerHTML = pageRows.map(function(r) {
    var sr = r[DK.sr];
    var status = (r[DK.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    return '<tr data-id="' + r._id + '" data-sr="' + sr + '" style="cursor:pointer">' +
      '<td class="num">' + sr + '</td>' +
      '<td>' + highlightText(r[DK.customer] || '', q) + '</td>' +
      '<td><strong>' + highlightText(r[DK.style] || '', q) + '</strong></td>' +
      '<td>' + fmtDate(r[DK.date]) + '</td>' +
      '<td class="num">' + (r[DK.grossWt] || '') + '</td>' +
      '<td class="num">' + (r[DK.netWt] || '') + '</td>' +
      '<td class="num">' + (r[DK.inCt] || '') + '</td>' +
      '<td class="num">' + (function() {
      var gold = parseFloat(r[DK.goldAmt]) || 0;
      var labor = parseFloat(r[DK.laborAmt]) || 0;
      var diam = parseFloat(r[DK.diamAmount]) || 0;
      var sub = gold + labor + diam;
      return sub ? '₹' + Math.round(sub).toLocaleString('en-IN') : '';
    })() + '</td>' +
      '<td class="num">' + (r[DK.usd] ? '$' + parseFloat(r[DK.usd]).toFixed(2) : '') + '</td>' +
      '<td>' + highlightText(r[DK.memoNo] || '', q) + '</td>' +
      '<td>' + highlightText(r[DK.soldTo] || '', q) + '</td>' +
      '<td class="num">' + (r[DK.salePrice] ? '$' + fmtMoney(r[DK.salePrice]) : '') + '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + status + '</span></td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(function(tr) {
    tr.addEventListener('click', function() {
      if (window.openOrderPanel) window.openOrderPanel(tr.dataset.id);
    });
  });

  renderCards(pageRows);
}

function renderCards(rows) {
  var container = $('cardList');
  var q = window.currentSearchQuery || '';

  if (!rows.length) {
    var msg = q ? 'No orders match "' + escapeHtml(q) + '"' : 'No orders found';
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:14px;">' + msg + '</div>';
    return;
  }

  // Determine role-based view class
  var viewClass = '';
  if (ROLE === 'seller') viewClass = 'seller-view';
  else if (ROLE === 'staff') viewClass = 'staff-view';
  else if (ROLE === 'customer') viewClass = 'customer-view';

  container.innerHTML = rows.map(function(r) {
    var status = (r[DK.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    var subTotal = r[DK.subTotal] ? '₹' + Math.round(parseFloat(r[DK.subTotal]) || 0).toLocaleString('en-IN') : '—';
    var usd = r[DK.usd] ? '$' + parseFloat(r[DK.usd]).toFixed(2) : '—';

    // Build card-summary rows based on role
    var summaryRows = '';
    if (ROLE !== 'seller') {
      summaryRows += '<div class="card-sum-row"><span>Net Wt</span><span>' + (r[DK.netWt] || '—') + 'g</span></div>';
    }
    if (ROLE !== 'seller') {
      summaryRows += '<div class="card-sum-row"><span>Sub Total</span><span>' + (function() {
        var gold = parseFloat(r[DK.goldAmt]) || 0;
        var labor = parseFloat(r[DK.laborAmt]) || 0;
        var diam = parseFloat(r[DK.diamAmount]) || 0;
        var sub = gold + labor + diam;
        return sub ? '₹' + Math.round(sub).toLocaleString('en-IN') : '—';
      })() + '</span></div>';
    }
    summaryRows += '<div class="card-sum-row"><span>USD</span><span>' + usd + '</span></div>';

    // Build card-body rows based on role
    var bodyRows = '';
    bodyRows += '<div class="card-row"><span class="card-label">Gross Wt</span><span class="card-value">' + (r[DK.grossWt] || '—') + 'g</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Dia Qty</span><span class="card-value">' + (r[DK.diaQty] || '—') + '</span></div>';
    if (ROLE !== 'staff') {
      bodyRows += '<div class="card-row"><span class="card-label">IN CT</span><span class="card-value">' + (r[DK.inCt] || '—') + '</span></div>';
    }
    bodyRows += '<div class="card-row"><span class="card-label">Colour Stone</span><span class="card-value">' + (r[DK.colourStone] || '—') + '</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Memo No.</span><span class="card-value">' + (r[DK.memoNo] || '—') + '</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Sold To</span><span class="card-value">' + (r[DK.soldTo] || '—') + '</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Sale Price</span><span class="card-value">' + (r[DK.salePrice] ? '$' + fmtMoney(r[DK.salePrice]) : '—') + '</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Balance</span><span class="card-value">$' + (r[DK.balanceDue] || '0') + '</span></div>';

    return '<div class="order-card ' + viewClass + '" data-id="' + r._id + '">' +
      '<div class="card-header" onclick="window.toggleCard(this)">' +
      '<div class="card-header-left">' +
      '<span class="card-title">' + highlightText(r[DK.style] || '', q) + '</span>' +
      '<span class="card-meta">' + (r[DK.customer] || '') + ' · ' + fmtDate(r[DK.date]) + '</span>' +
      '</div>' +
      '<div class="card-header-right">' +
      '<span class="card-sr-badge">#' + r[DK.sr] + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + status + '</span>' +
      '<span class="card-chevron">▼</span>' +
      '</div>' +
      '</div>' +
      '<div class="card-summary">' + summaryRows + '</div>' +
      '<div class="card-body">' + bodyRows + '</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.order-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.card-header')) return;
      if (window.openOrderPanel) window.openOrderPanel(card.dataset.id);
    });
  });
}

window.toggleCard = function(header) {
  var card = header.closest('.order-card');
  card.classList.toggle('expanded');
};

function renderTradeTable() {
  var tbody = $('tradeTbody');
  var filtered = getFilteredTrading();
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageRows = filtered.slice(start, start + PAGE_SIZE);
  var K = SHEET_KEYS;
  var q = window.currentSearchQuery || '';

  if (!pageRows.length) {
    var msg = window.currentSearchQuery 
      ? 'No trades match "' + escapeHtml(window.currentSearchQuery) + '"' 
      : 'No trades found';
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-dim)">' + msg + '</td></tr>';
    return;
  }

  tbody.innerHTML = pageRows.map(function(r) {
    var purchase = parseFloat(r[K.purchasePrice]) || 0;
    var sale = parseFloat(r[K.salePrice]) || 0;
    var profit = sale ? sale - purchase : 0;
    var status = (r[K.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    return '<tr data-id="' + r._id + '" style="cursor:pointer">' +
      '<td class="num">' + r[K.sr] + '</td>' +
      '<td>' + fmtDate(r[K.date]) + '</td>' +
      '<td><strong>' + highlightText(r[K.item] || '', q) + '</strong></td>' +
      '<td>' + highlightText(r[K.vendor] || '', q) + '</td>' +
      '<td class="num">$' + fmtMoney(purchase) + '</td>' +
      '<td class="num">' + (sale ? '$' + fmtMoney(sale) : '') + '</td>' +
      '<td>' + fmtDate(r[K.dateSold]) + '</td>' +
      '<td>' + highlightText(r[K.soldTo] || '', q) + '</td>' +
      '<td class="num">$' + fmtMoney(r[K.amountPaid]) + '</td>' +
      '<td class="num">$' + fmtMoney(r[K.balanceDue]) + '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + status + '</span></td>' +
      '<td class="num" style="color:' + (profit >= 0 ? 'var(--success)' : 'var(--error)') + '">' +
      (sale ? (profit >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(profit)) : '') + '</td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(function(tr) {
    tr.addEventListener('click', function() {
      if (window.openEditTrade) window.openEditTrade(tr.dataset.id);
    });
  });

  renderTradeCards(pageRows);
}

function renderTradeCards(rows) {
  var container = $('tradeCardList');
  var K = SHEET_KEYS;
  var q = window.currentSearchQuery || '';

  if (!rows.length) {
    var msg = q ? 'No trades match "' + escapeHtml(q) + '"' : 'No trades found';
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:14px;">' + msg + '</div>';
    return;
  }

  container.innerHTML = rows.map(function(r) {
    var purchase = parseFloat(r[K.purchasePrice]) || 0;
    var sale = parseFloat(r[K.salePrice]) || 0;
    var profit = sale ? sale - purchase : 0;
    var status = (r[K.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    var profitStr = sale ? (profit >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(profit)) : '—';
    var profitColor = sale ? (profit >= 0 ? 'var(--success)' : 'var(--error)') : 'var(--text-dim)';

    // Single-row trading card — no summary, no body, no expand
    return '<div class="order-card trade-card" data-id="' + r._id + '">' +
      '<div class="card-header">' +
      '<div class="card-header-left">' +
      '<span class="card-title">' + highlightText(r[K.item] || '', q) + '</span>' +
      '<span class="card-meta">' + (r[K.vendor] || '') + ' · ' + fmtDate(r[K.date]) + '</span>' +
      '</div>' +
      '<div class="card-header-right">' +
      '<span class="card-sr-badge">#' + r[K.sr] + '</span>' +
      '<span class="card-value" style="color:' + profitColor + '">' + profitStr + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + status + '</span>' +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  // Click anywhere on card to open edit panel
  container.querySelectorAll('.trade-card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (window.openEditTrade) window.openEditTrade(card.dataset.id);
    });
  });
}

window.renderTable = renderTable;
window.renderTradeTable = renderTradeTable;
