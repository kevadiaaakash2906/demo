/* ============================================
   VINÉRE — Receive Payment Modal
   ============================================ */

window.openPaymentSearch = function() {
  $('paymentSearchOverlay').style.display = 'block';
  $('paymentSearchModal').classList.add('open');
  $('paySearchInput').value = '';
  $('paySearchInput').focus();
  renderPayResults('');
};

// Payment button click handler (defined here since payments.js loads after app.js)
$('receivePaymentBtn').addEventListener('click', function() {
  window.openPaymentSearch();
});

$('closePaymentSearch').addEventListener('click', closePaymentSearch);
$('paymentSearchOverlay').addEventListener('click', closePaymentSearch);

function closePaymentSearch() {
  $('paymentSearchModal').classList.remove('open');
  $('paymentSearchOverlay').style.display = 'none';
}

$('paySearchInput').addEventListener('input', function(e) {
  renderPayResults(e.target.value.trim().toLowerCase());
});

function renderPayResults(query) {
  var container = $('payResults');

  var orderRows = ORDERS.filter(function(r) {
    var status = (r[DK.paymentStatus] || 'Not Sold').trim();
    return status !== 'Paid' && status !== 'Not Sold';
  });

  var tradeRows = TRADING.filter(function(r) {
    var status = (r[SHEET_KEYS.paymentStatus] || 'Not Sold').trim();
    return status !== 'Paid' && status !== 'Not Sold';
  });

  var allRows = orderRows.map(function(r) { return { type: 'order', data: r }; })
    .concat(tradeRows.map(function(r) { return { type: 'trade', data: r }; }));

  if (query) {
    allRows = allRows.filter(function(item) {
      return Object.values(item.data).some(function(v) { return String(v).toLowerCase().includes(query); });
    });
  }

  if (!allRows.length) {
    container.innerHTML = '<div class="pay-empty">No pending payments found</div>';
    return;
  }

  container.innerHTML = allRows.map(function(item) {
    var r = item.data;
    var isTrade = item.type === 'trade';
    var K = isTrade ? SHEET_KEYS : DK;
    var balance = parseFloat(r[K.balanceDue]) || 0;
    var status = (r[K.paymentStatus] || 'Unpaid').trim();
    var statusClass = status === 'Partial' ? 'status-partial' : 'status-unpaid';
    var title = isTrade ? r[K.item] : r[K.style];
    var subtitle = isTrade ? r[K.vendor] : r[K.customer];
    var soldTo = r[K.soldTo] || '—';
    var sr = r[K.sr];
    var typeLabel = isTrade ? 'TRADE' : 'ORDER';

    return '<div class="pay-result-item" data-id="' + r._id + '" data-type="' + item.type + '">' +
      '<div class="pay-result-main">' +
      '<div class="pay-result-left">' +
      '<span class="pay-result-style">' + escapeHtml(title || '') + '</span>' +
      '<span class="pay-result-sr">#' + sr + '</span>' +
      '<span class="pay-result-type" style="font-size:10px;background:var(--md-surface-2);padding:2px 6px;border-radius:100px;margin-left:4px;">' + typeLabel + '</span>' +
      '</div>' +
      '<div class="pay-result-balance">$' + fmtMoney(balance) + '</div>' +
      '</div>' +
      '<div class="pay-result-details">' +
      '<span class="pay-result-customer">' + escapeHtml(subtitle || '') + '</span>' +
      '<span class="pay-result-soldto">Sold to ' + escapeHtml(soldTo) + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + status + '</span>' +
      '</div>' +
      '<div class="pay-result-action">Tap to receive payment →</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.pay-result-item').forEach(function(item) {
    item.addEventListener('click', function() { openPaymentForm(item.dataset.id, item.dataset.type); });
  });
}

function openPaymentForm(id, type) {
  closePaymentSearch();
  type = type || 'order';
  var collection = type === 'trade' ? TRADING : ORDERS;
  var K = type === 'trade' ? SHEET_KEYS : DK;
  var updateFn = type === 'trade' ? window.updateTrading : window.updateOrder;
  var fetchFn = type === 'trade' ? doFetchTrading : doFetchOrders;
  var label = type === 'trade' ? 'Trade' : 'Order';

  var item = collection.find(function(r) { return r._id === id; });
  if (!item) return;

  var memoNo = item[K.memoNo];

  var amount = prompt('Record payment for ' + label + ' #' + item[K.sr] + ' — ' + (item[K.style] || item[K.item]) + '\nBalance Due: $' + fmtMoney(item[K.balanceDue]) + '\n\nEnter amount received:');
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return;

  var date = prompt('Payment date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
  if (!date) return;

  // IMPORTANT: for a memo item, start from the memo-wide aggregated log
  // (every payment recorded against ANY item in this memo), not just this
  // item's own log. Otherwise syncMemoPayments below overwrites every
  // sibling item with an incomplete list and erases their payment history.
  var installments;
  if (memoNo && typeof getAggregatedPaymentLog === 'function') {
    installments = getAggregatedPaymentLog(memoNo);
  } else {
    try { installments = JSON.parse(item[K.paymentLog] || '[]'); } catch(e) { installments = []; }
  }
  installments.push({ amount: parseFloat(amount), date: date });

  var totalPaid = installments.reduce(function(s, i) { return s + i.amount; }, 0);

  // For a memo item, compare against the memo's combined bill, not this
  // single item's own sale price.
  var billTotal = parseFloat(item[K.salePrice]) || 0;
  if (memoNo && typeof getMemoOrders === 'function' && typeof getMemoTrades === 'function') {
    var mOrders = getMemoOrders(memoNo);
    var mTrades = getMemoTrades(memoNo);
    billTotal = mOrders.reduce(function(s, o) { return s + (parseFloat(o[DK.salePrice]) || 0); }, 0) +
                mTrades.reduce(function(s, t) { return s + (parseFloat(t[SHEET_KEYS.salePrice]) || 0); }, 0);
  }

  var balance = billTotal - totalPaid;

  var status = 'Unpaid';
  if (totalPaid >= billTotal) status = 'Paid';
  else if (totalPaid > 0) status = 'Partial';

  var data = {};
  for (var k in item) data[k] = item[k];
  data[K.amountPaid] = totalPaid.toString();
  data[K.balanceDue] = balance.toString();
  data[K.paymentStatus] = status;
  data[K.paymentLog] = JSON.stringify(installments);

  updateFn(id, data).then(async function() {
    showToast('Payment of $' + fmtMoney(amount) + ' recorded for ' + label.toLowerCase() + ' #' + item[K.sr], 'success');

    // Sync payment across other memo items
    var memoNo = item[K.memoNo];
    if (memoNo && window.syncMemoPayments) {
      await window.syncMemoPayments(memoNo, installments, id);
    }

    return fetchFn();
  }).then(function() { renderAll(); }).catch(function(err) {
    console.error(err);
    showToast('Failed to record payment', 'error');
  });
}
