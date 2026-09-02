/* ============================================
   VINÉRE — Table Renderers
   ============================================ */

function renderTable() {
  var srIcon = sortCol === 'sr' ? (sortDesc ? '↓' : '↑') : '↕';
  var ctIcon = sortCol === 'inCt' ? (sortDesc ? '↓' : '↑') : '↕';

  // Restore original orders table header
  var theadTr = $('ordersTable').querySelector('thead tr');
  if (theadTr) {
    theadTr.innerHTML =
      '<th class="num sortable" onclick="window.sortByColumn(\'sr\')" style="cursor:pointer;">Sr. <span class="sort-icon">' + srIcon + '</span></th>' +
      '<th>Customer</th><th>Style No.</th><th>Jewelry Type</th><th>Diamond Shape</th><th>Date</th>' +
      '<th class="num">Gross Wt</th><th class="num">Net Wt</th>' +
      '<th class="num sortable" onclick="window.sortByColumn(\'inCt\')" style="cursor:pointer;">Carat <span class="sort-icon">' + ctIcon + '</span></th>' +
      '<th class="num">Sub Total</th><th class="num">$</th><th>Memo No.</th><th>Sold To</th>' +
      '<th class="num">Sale Price</th><th>Status</th>';
  }
  // ... keep everything below this exactly as-is ...
  // Restore 15-column colgroup
  var colgroup = $('ordersTable').querySelector('colgroup');
  if (colgroup) {
    colgroup.innerHTML = '<col style="width:4%"><col style="width:7%"><col style="width:9%"><col style="width:6%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:9%"><col style="width:5%"><col style="width:6%"><col style="width:9%"><col style="width:7%"><col style="width:8%">';
  }

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
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;padding:40px;color:var(--text-dim)">' + msg + '</td></tr>';
    renderCards([]);
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
      '<td>' + escapeHtml(r[DK.jewelryType] || '') + '</td>' +
      '<td>' + escapeHtml(r[DK.diamondShape] || '') + '</td>' +
      '<td>' + fmtDate(r[DK.date]) + '</td>' +
      '<td class="num">' + (r[DK.grossWt] || '') + '</td>' +
      '<td class="num">' + (r[DK.netWt] || '') + '</td>' +
      '<td class="num">' + (r[DK.inCt] || '') + '</td>' +
      '<td class="num">' + (function() {
      var status = (r[DK.paymentStatus] || 'Not Sold').trim();
      var isUnsold = status === 'Not Sold';
      var sub;
      if (isUnsold) {
        var net = parseFloat(r[DK.netWt]) || 0;
        var mult = parseFloat(r[DK.multiplier]) || 0.595;
        var pgWt = net * mult;
        var goldRate = window.GOLD_RATE || 16000;
        var gold = pgWt * goldRate;
        var labor = parseFloat(r[DK.laborAmt]) || 0;
        var diam = parseFloat(r[DK.diamAmount]) || 0;
        sub = gold + labor + diam;
      } else {
        var gold = parseFloat(r[DK.goldAmt]) || 0;
        var labor = parseFloat(r[DK.laborAmt]) || 0;
        var diam = parseFloat(r[DK.diamAmount]) || 0;
        sub = gold + labor + diam;
      }
      return sub ? '₹' + Math.round(sub).toLocaleString('en-IN') : '';
    })() + '</td>' +
      '<td class="num">' + (function() {
      var status = (r[DK.paymentStatus] || 'Not Sold').trim();
      if (status === 'Not Sold') {
        var net = parseFloat(r[DK.netWt]) || 0;
        var mult = parseFloat(r[DK.multiplier]) || 0.595;
        var pgWt = net * mult;
        var goldRate = window.GOLD_RATE || 16000;
        var gold = pgWt * goldRate;
        var labor = parseFloat(r[DK.laborAmt]) || 0;
        var diam = parseFloat(r[DK.diamAmount]) || 0;
        var sub = gold + labor + diam;
        var usd = sub / 94;
        return usd ? '$' + usd.toFixed(2) : '';
      }
      return r[DK.usd] ? '$' + parseFloat(r[DK.usd]).toFixed(2) : '';
    })() + '</td>' +
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

/* ============ CARD SWIPE (mobile) ============ */
function setupCardSwipe(card) {
  if (!card) return;
  var startX = 0, currentX = 0, swiped = false;
  var threshold = 60;

  card.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', function(e) {
    currentX = e.touches[0].clientX;
    var diff = currentX - startX;
    if (diff < 0 && diff > -120) {
      card.style.transform = 'translateX(' + diff + 'px)';
    }
  }, { passive: true });

  card.addEventListener('touchend', function() {
    var diff = currentX - startX;
    card.style.transition = 'transform 0.25s cubic-bezier(0.4, 0.0, 0.2, 1)';
    if (diff < -threshold) {
      card.style.transform = 'translateX(-80px)';
      swiped = true;
    } else {
      card.style.transform = 'translateX(0)';
      swiped = false;
    }
  });

  card.addEventListener('click', function(e) {
    if (swiped && !e.target.closest('.card-actions')) {
      card.style.transform = 'translateX(0)';
      swiped = false;
    }
  });
}

function renderCards(rows) {
  var container = $('cardList');
  var q = window.currentSearchQuery || '';

  if (!rows.length) {
    var msg = q ? 'No orders match "' + escapeHtml(q) + '"' : 'No orders found';
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:14px;">' + msg + '</div>';
    return;
  }

  var viewClass = '';
  if (ROLE === 'seller') viewClass = 'seller-view';
  else if (ROLE === 'staff') viewClass = 'staff-view';
  else if (ROLE === 'customer') viewClass = 'customer-view';

  var isSeller = ROLE === 'seller';

  container.innerHTML = rows.map(function(r) {
    var status = (r[DK.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    var sr = r[DK.sr];
    var style = r[DK.style] || '';
    var customer = r[DK.customer] || '';
    var date = fmtDate(r[DK.date]);
    var inCt = r[DK.inCt] || '—';
    var memoNo = r[DK.memoNo] || '';
    var soldTo = r[DK.soldTo] || '';
    var salePrice = parseFloat(r[DK.salePrice]) || 0;

    // USD calculation
    var usdVal;
    if (status === 'Not Sold') {
      var net = parseFloat(r[DK.netWt]) || 0;
      var mult = parseFloat(r[DK.multiplier]) || 0.595;
      var pgWt = net * mult;
      var goldRate = window.GOLD_RATE || 16000;
      var gold = pgWt * goldRate;
      var labor = parseFloat(r[DK.laborAmt]) || 0;
      var diam = parseFloat(r[DK.diamAmount]) || 0;
      var sub = gold + labor + diam;
      usdVal = sub ? '$' + (sub / 94).toFixed(2) : '—';
    } else {
      usdVal = r[DK.usd] ? '$' + parseFloat(r[DK.usd]).toFixed(2) : '—';
    }

    // P/L calculation
    var plVal = '—';
    var plColor = 'var(--text-dim)';
    if (salePrice) {
      var cost = parseFloat(r[DK.usd]) || 0;
      var pl = salePrice - cost;
      plVal = (pl >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(pl));
      plColor = pl >= 0 ? 'var(--success)' : 'var(--error)';
    }

    if (isSeller) {
      // ===== COMPACT SELLER VIEW =====
      return '<div class="order-card ' + viewClass + '" data-id="' + r._id + '" style="margin-bottom:6px;">' +
        '<div class="card-header" onclick="window.toggleCard(this)" style="padding:10px 14px;">' +
        '<div class="card-header-left" style="gap:2px;">' +
        '<span style="display:flex;align-items:center;gap:6px;">' +
        '<span class="card-sr-badge" style="min-width:28px;height:24px;padding:0 8px;font-size:12px;">#' + sr + '</span>' +
        '<span class="card-title" style="font-size:15px;">' + highlightText(style, q) + '</span>' +
        '</span>' +
        '<span class="card-meta" style="font-size:12px;">' + escapeHtml(customer) + ' · ' + date + '</span>' +
        '</div>' +
        '<div class="card-header-right" style="gap:6px;">' +
        '<span class="status-badge ' + statusClass + '" style="font-size:11px;padding:2px 8px;">' + status + '</span>' +
        '<span class="card-chevron" style="font-size:10px;">▼</span>' +
        '</div>' +
        '</div>' +
        '<div class="card-summary" style="grid-template-columns:repeat(3,1fr);gap:4px 8px;padding:8px 14px;background:var(--md-surface-1);">' +
        '<div class="card-sum-row" style="gap:0;"><span style="font-size:10px;">Type</span><span style="font-size:13px;">' + escapeHtml(r[DK.jewelryType] || '—') + '</span></div>' +
        '<div class="card-sum-row" style="gap:0;"><span style="font-size:10px;">IN CT</span><span style="font-size:13px;">' + inCt + '</span></div>' +
        '<div class="card-sum-row" style="gap:0;"><span style="font-size:10px;">USD</span><span style="font-size:13px;">' + usdVal + '</span></div>' +
        '<div class="card-sum-row" style="gap:0;"><span style="font-size:10px;">P / L</span><span style="font-size:13px;color:' + plColor + '">' + plVal + '</span></div>' +
        '<div class="card-sum-row" style="gap:0;"><span style="font-size:10px;">Memo</span><span style="font-size:13px;">' + (memoNo ? escapeHtml(memoNo) : '—') + '</span></div>' +
        '<div class="card-sum-row" style="gap:0;grid-column:span 2;"><span style="font-size:10px;">Sold To</span><span style="font-size:13px;">' + (soldTo ? escapeHtml(soldTo) : '—') + '</span></div>' +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Gross Wt</span><span class="card-value">' + (r[DK.grossWt] || '—') + 'g</span></div>' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Net Wt</span><span class="card-value">' + (r[DK.netWt] || '—') + 'g</span></div>' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Dia Qty</span><span class="card-value">' + (r[DK.diaQty] || '—') + '</span></div>' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Diamond Shape</span><span class="card-value">' + (r[DK.diamondShape] || '—') + '</span></div>' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Colour Stone</span><span class="card-value">' + (r[DK.colourStone] || '—') + '</span></div>' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Sale Price</span><span class="card-value">' + (salePrice ? '$' + fmtMoney(salePrice) : '—') + '</span></div>' +
        '<div class="card-row" style="padding:6px 0;"><span class="card-label">Balance</span><span class="card-value">$' + (r[DK.balanceDue] || '0') + '</span></div>' +
        '</div>' +
        '<div class="card-actions" onclick="event.stopPropagation();if(window.openOrderPanel)window.openOrderPanel(String(r._id))">Open</div>' +
        '</div>';
    }

    // ===== DEFAULT VIEW (staff / customer) =====
    var summaryRows = '';
    if (ROLE !== 'seller') {
      summaryRows += '<div class="card-sum-row"><span>Net Wt</span><span>' + (r[DK.netWt] || '—') + 'g</span></div>';
    }
    if (ROLE !== 'seller') {
      summaryRows += '<div class="card-sum-row"><span>Sub Total</span><span>' + (function() {
        var st = (r[DK.paymentStatus] || 'Not Sold').trim();
        var sub;
        if (st === 'Not Sold') {
          var net = parseFloat(r[DK.netWt]) || 0;
          var mult = parseFloat(r[DK.multiplier]) || 0.595;
          var pgWt = net * mult;
          var goldRate = window.GOLD_RATE || 16000;
          var gold = pgWt * goldRate;
          var labor = parseFloat(r[DK.laborAmt]) || 0;
          var diam = parseFloat(r[DK.diamAmount]) || 0;
          sub = gold + labor + diam;
        } else {
          var gold = parseFloat(r[DK.goldAmt]) || 0;
          var labor = parseFloat(r[DK.laborAmt]) || 0;
          var diam = parseFloat(r[DK.diamAmount]) || 0;
          sub = gold + labor + diam;
        }
        return sub ? '₹' + Math.round(sub).toLocaleString('en-IN') : '—';
      })() + '</span></div>';
    }
    var usdValDefault;
    if ((r[DK.paymentStatus] || 'Not Sold').trim() === 'Not Sold') {
      var net = parseFloat(r[DK.netWt]) || 0;
      var mult = parseFloat(r[DK.multiplier]) || 0.595;
      var pgWt = net * mult;
      var goldRate = window.GOLD_RATE || 16000;
      var gold = pgWt * goldRate;
      var labor = parseFloat(r[DK.laborAmt]) || 0;
      var diam = parseFloat(r[DK.diamAmount]) || 0;
      var sub = gold + labor + diam;
      usdValDefault = sub ? '$' + (sub / 94).toFixed(2) : '—';
    } else {
      usdValDefault = r[DK.usd] ? '$' + parseFloat(r[DK.usd]).toFixed(2) : '—';
    }
    summaryRows += '<div class="card-sum-row"><span>USD</span><span>' + usdValDefault + '</span></div>';

    var salePriceDefault = parseFloat(r[DK.salePrice]) || 0;
    var stDefault = (r[DK.paymentStatus] || 'Not Sold').trim();
    var subTotalVal;
    if (stDefault === 'Not Sold') {
      var net = parseFloat(r[DK.netWt]) || 0;
      var mult = parseFloat(r[DK.multiplier]) || 0.595;
      var pgWt = net * mult;
      var goldRate = window.GOLD_RATE || 16000;
      var gold = pgWt * goldRate;
      var labor = parseFloat(r[DK.laborAmt]) || 0;
      var diam = parseFloat(r[DK.diamAmount]) || 0;
      subTotalVal = gold + labor + diam;
    } else {
      subTotalVal = parseFloat(r[DK.subTotal]) || 0;
    }
    var plDefault = salePriceDefault && subTotalVal ? salePriceDefault - (subTotalVal / 94) : 0;
    if (salePriceDefault) {
      summaryRows += '<div class="card-sum-row"><span>P/L</span><span style="color:' + (plDefault >= 0 ? 'var(--success)' : 'var(--error)') + '">' + (plDefault >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(plDefault)) + '</span></div>';
    }

    var bodyRows = '';
    bodyRows += '<div class="card-row"><span class="card-label">Gross Wt</span><span class="card-value">' + (r[DK.grossWt] || '—') + 'g</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Dia Qty</span><span class="card-value">' + (r[DK.diaQty] || '—') + '</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Diamond Shape</span><span class="card-value">' + (r[DK.diamondShape] || '—') + '</span></div>';
    bodyRows += '<div class="card-row"><span class="card-label">Jewelry Type</span><span class="card-value">' + escapeHtml(r[DK.jewelryType] || '—') + '</span></div>';
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
      '<div class="card-actions" onclick="event.stopPropagation();if(window.openOrderPanel)window.openOrderPanel(String(r._id))">Open</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.order-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.card-header')) return;
      if (window.openOrderPanel) window.openOrderPanel(card.dataset.id);
    });
    setupCardSwipe(card);
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
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-dim)">' + msg + '</td></tr>';
    renderTradeCards([]);
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
      '<td class="vendor-wrap">' + highlightText(r[K.vendor] || '', q) + '</td>' +
      '<td class="num">$' + fmtMoney(purchase) + '</td>' +
      '<td>' + highlightText(r[K.memoNo] || '', q) + '</td>' +
      '<td class="num">' + (sale ? '$' + fmtMoney(sale) : '') + '</td>' +
      '<td>' + highlightText(r[K.soldTo] || '', q) + '</td>' +
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
    var memoNo = r[K.memoNo] || '';

    return '<div class="order-card trade-card" data-id="' + r._id + '">' +
      '<div class="card-header">' +
      '<div class="card-header-left">' +
      '<span class="card-title">' + highlightText(r[K.item] || '', q) + '</span>' +
      '<span class="card-meta">' + (r[K.vendor] || '') + (memoNo ? ' · Memo ' + memoNo : '') + ' · ' + fmtDate(r[K.date]) + '</span>' +
      '</div>' +
      '<div class="card-header-right">' +
      '<span class="card-sr-badge">#' + r[K.sr] + '</span>' +
      '<span class="card-value" style="color:' + profitColor + '">' + profitStr + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + status + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="card-actions" onclick="event.stopPropagation();if(ROLE!==\'customer\'&&window.openEditTrade)window.openEditTrade(String(r._id))">Open</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.trade-card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (ROLE === 'customer') {
        showToast('View only — you do not have permission to edit trades', 'warning');
        return;
      }
      if (window.openEditTrade) window.openEditTrade(card.dataset.id);
    });
    setupCardSwipe(card);
  });
}

/* ============================================
   UNIFIED VIEW (Orders + Trading combined)
   ============================================ */

function renderUnifiedTable() {
  var tbody = $('tbody');
  var results = getUnifiedResults();
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageRows = results.slice(start, start + PAGE_SIZE);
  var q = window.currentSearchQuery || '';

  $('ordersTable').style.display = 'table';
  $('tradingTable').style.display = 'none';

  // Fix colgroup for 8 unified columns
  var colgroup = $('ordersTable').querySelector('colgroup');
  if (colgroup) {
    colgroup.innerHTML = '<col style="width:6%"><col style="width:8%"><col style="width:10%"><col style="width:20%"><col style="width:24%"><col style="width:10%"><col style="width:10%"><col style="width:12%">';
  }

  $('ordersTable').querySelector('thead tr').innerHTML =
    '<th class="num">Sr.</th><th>Type</th><th>Date</th><th>Buyer</th><th>Item</th>' +
    '<th class="num">Sale Price</th><th>Status</th><th class="num">P / L</th>';

  if (!pageRows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-dim)">No orders or trades match the current filters</td></tr>';
    return;
  }

  tbody.innerHTML = pageRows.map(function(r) {
    var isOrder = r._type === 'order';
    var K = isOrder ? DK : SHEET_KEYS;
    var sr = r[K.sr];
    var status = (r[K.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    var buyer = isOrder ? (r[DK.soldTo] || r[DK.customer] || '') : (r[SHEET_KEYS.soldTo] || r[SHEET_KEYS.vendor] || '');
    var item = isOrder ? r[DK.style] : r[SHEET_KEYS.item];
    var salePrice = parseFloat(r[K.salePrice]) || 0;

    var metric = '';
    var metricColor = 'var(--text-dim)';
    if (isOrder) {
      var cost = parseFloat(r[DK.usd]) || 0;
      if (salePrice) {
        var pl = salePrice - cost;
        metric = (pl >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(pl));
        metricColor = pl >= 0 ? 'var(--success)' : 'var(--error)';
      } else {
        metric = cost ? '$' + fmtMoney(cost) + ' cost' : '';
      }
    } else {
      var purchase = parseFloat(r[SHEET_KEYS.purchasePrice]) || 0;
      var profit = salePrice ? salePrice - purchase : 0;
      metric = salePrice ? (profit >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(profit)) : '';
      metricColor = salePrice ? (profit >= 0 ? 'var(--success)' : 'var(--error)') : 'var(--text-dim)';
    }

    var badge = isOrder
      ? '<span class="type-badge order-badge">ORDER</span>'
      : '<span class="type-badge trade-badge">TRADE</span>';
    var rowClass = isOrder ? 'unified-row-order' : 'unified-row-trade';

    return '<tr data-id="' + r._id + '" data-type="' + r._type + '" class="' + rowClass + '">' +
      '<td class="num">' + sr + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + fmtDate(r[K.date]) + '</td>' +
      '<td>' + highlightText(buyer, q) + '</td>' +
      '<td><strong>' + highlightText(item || '', q) + '</strong></td>' +
      '<td class="num">' + (salePrice ? '$' + fmtMoney(salePrice) : '') + '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + status + '</span></td>' +
      '<td class="num" style="color:' + metricColor + '">' + metric + '</td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(function(tr) {
    tr.addEventListener('click', function() {
      if (tr.dataset.type === 'order') {
        if (window.openOrderPanel) window.openOrderPanel(tr.dataset.id);
      } else {
        if (window.openEditTrade) window.openEditTrade(tr.dataset.id);
      }
    });
  });
}

function renderUnifiedCards() {
  var container = $('cardList');
  var results = getUnifiedResults();
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageRows = results.slice(start, start + PAGE_SIZE);
  var q = window.currentSearchQuery || '';

  $('cardList').classList.add('active');
  $('tradeCardList').classList.remove('active');

  if (!pageRows.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:14px;">No results found</div>';
    return;
  }

  container.innerHTML = pageRows.map(function(r) {
    var isOrder = r._type === 'order';
    var K = isOrder ? DK : SHEET_KEYS;
    var status = (r[K.paymentStatus] || 'Not Sold').trim();
    var statusClass = {
      'Not Sold': 'status-not-sold',
      'Unpaid': 'status-unpaid',
      'Partial': 'status-partial',
      'Paid': 'status-paid'
    }[status] || 'status-not-sold';

    var buyer = isOrder ? (r[DK.soldTo] || r[DK.customer] || '') : (r[SHEET_KEYS.soldTo] || r[SHEET_KEYS.vendor] || '');
    var item = isOrder ? r[DK.style] : r[SHEET_KEYS.item];
    var salePrice = parseFloat(r[K.salePrice]) || 0;

    var badge = isOrder
      ? '<span class="type-badge order-badge">ORDER</span>'
      : '<span class="type-badge trade-badge">TRADE</span>';
    var cardClass = isOrder ? 'unified-card-order' : 'unified-card-trade';

    var extraLabel = 'P / L';
    var extraVal = '';
    var extraColor = 'var(--text-dim)';
    if (isOrder) {
      var cost = parseFloat(r[DK.usd]) || 0;
      if (salePrice) {
        var pl = salePrice - cost;
        extraVal = (pl >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(pl));
        extraColor = pl >= 0 ? 'var(--success)' : 'var(--error)';
      } else {
        extraVal = cost ? '$' + fmtMoney(cost) + ' cost' : '—';
      }
    } else {
      var purchase = parseFloat(r[SHEET_KEYS.purchasePrice]) || 0;
      var profit = salePrice ? salePrice - purchase : 0;
      extraVal = salePrice ? (profit >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(profit)) : '—';
      extraColor = salePrice ? (profit >= 0 ? 'var(--success)' : 'var(--error)') : 'var(--text-dim)';
    }

    return '<div class="order-card ' + cardClass + '" data-id="' + r._id + '" data-type="' + r._type + '">' +
      '<div class="card-header">' +
      '<div class="card-header-left">' +
      '<span class="card-title">' + highlightText(item || '', q) + ' ' + badge + '</span>' +
      '<span class="card-meta">' + escapeHtml(buyer) + ' · ' + fmtDate(r[K.date]) + '</span>' +
      '</div>' +
      '<div class="card-header-right">' +
      '<span class="card-sr-badge">#' + r[K.sr] + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + status + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="card-summary" style="grid-template-columns: repeat(3, 1fr);">' +
      '<div class="card-sum-row"><span>Type</span><span>' + (isOrder ? 'Order' : 'Trade') + '</span></div>' +
      '<div class="card-sum-row"><span>Sale Price</span><span>' + (salePrice ? '$' + fmtMoney(salePrice) : '—') + '</span></div>' +
      '<div class="card-sum-row"><span>' + extraLabel + '</span><span style="color:' + extraColor + '">' + extraVal + '</span></div>' +
      '</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.order-card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (card.dataset.type === 'order') {
        if (window.openOrderPanel) window.openOrderPanel(card.dataset.id);
      } else {
        if (window.openEditTrade) window.openEditTrade(card.dataset.id);
      }
    });
  });
}
function renderExpenseTable() {
  var tbody = $('expenseTbody');
  var filtered = getFilteredExpenses();
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageRows = filtered.slice(start, start + PAGE_SIZE);
  var K = EXPENSE_KEYS;
  var q = window.currentSearchQuery || '';

  if (!pageRows.length) {
    var msg = window.currentSearchQuery
      ? 'No expenses match "' + escapeHtml(window.currentSearchQuery) + '"'
      : 'No expenses found';
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim)">' + msg + '</td></tr>';
    renderExpenseCards([]);
    return;
  }

  tbody.innerHTML = pageRows.map(function(r) {
    var amount = parseFloat(r[K.amount]) || 0;

    return '<tr data-id="' + r._id + '" style="cursor:pointer">' +
      '<td class="num">' + r[K.sr] + '</td>' +
      '<td>' + fmtDate(r[K.date]) + '</td>' +
      '<td><span class="type-badge" style="background:var(--md-surface-variant);color:var(--md-on-surface);">' + escapeHtml(r[K.category] || 'Misc') + '</span></td>' +
      '<td>' + highlightText(r[K.description] || '', q) + '</td>' +
      '<td class="num">$' + fmtMoney(amount) + '</td>' +
      '<td>' + highlightText(r[K.seller] || '', q) + '</td>' +
      '<td>' + escapeHtml(r[K.notes] || '') + '</td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(function(tr) {
    tr.addEventListener('click', function() {
      if (window.openExpensePanel) window.openExpensePanel(tr.dataset.id);
    });
  });

  renderExpenseCards(pageRows);
}

function renderExpenseCards(rows) {
  var container = $('expenseCardList');
  var K = EXPENSE_KEYS;
  var q = window.currentSearchQuery || '';

  if (!rows.length) {
    var msg = q ? 'No expenses match "' + escapeHtml(q) + '"' : 'No expenses found';
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:14px;">' + msg + '</div>';
    return;
  }

  container.innerHTML = rows.map(function(r) {
    var amount = parseFloat(r[K.amount]) || 0;

    return '<div class="order-card expense-card" data-id="' + r._id + '">' +
      '<div class="card-header">' +
      '<div class="card-header-left">' +
      '<span class="card-title">' + escapeHtml(r[K.category] || 'Misc') + '</span>' +
      '<span class="card-meta">' + escapeHtml(r[K.description] || '') + ' · ' + fmtDate(r[K.date]) + '</span>' +
      '</div>' +
      '<div class="card-header-right">' +
      '<span class="card-sr-badge">#' + r[K.sr] + '</span>' +
      '<span class="card-value">$' + fmtMoney(amount) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="card-actions" onclick="event.stopPropagation();if(ROLE!==\'customer\'&&window.openExpensePanel)window.openExpensePanel(String(r._id))">Open</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.expense-card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (ROLE === 'customer') {
        showToast('View only — you do not have permission to edit expenses', 'warning');
        return;
      }
      if (window.openExpensePanel) window.openExpensePanel(card.dataset.id);
    });
    setupCardSwipe(card);
  });
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


/* ============ EXPOSE GLOBALLY ============ */
window.renderTable = renderTable;
window.renderTradeTable = renderTradeTable;
window.renderUnifiedTable = renderUnifiedTable;
window.renderUnifiedCards = renderUnifiedCards;
window.renderExpenseTable = renderExpenseTable;
window.renderExpenseCards = renderExpenseCards;
window.renderExpensePagination = renderExpensePagination;
