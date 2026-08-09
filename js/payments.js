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
  var rows = ORDERS.filter(function(r) {
    var status = (r[DK.paymentStatus] || 'Not Sold').trim();
    return status !== 'Paid' && status !== 'Not Sold';
  });

  if (query) {
    rows = rows.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(query); });
    });
  }

  if (!rows.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim)">No pending payments found</div>';
    return;
  }

  container.innerHTML = rows.map(function(r) {
    var balance = parseFloat(r[DK.balanceDue]) || 0;
    return '<div class="pay-result-item" data-id="' + r._id + '">' +
      '<div class="pay-result-header">' +
      '<span class="pay-result-title">' + r[DK.style] + ' · ' + r[DK.customer] + '</span>' +
      '<span style="color:var(--warning);font-family:var(--font-mono)">$' + fmtMoney(balance) + '</span>' +
      '</div>' +
      '<div class="pay-result-meta">Sr. ' + r[DK.sr] + ' · Sold To: ' + (r[DK.soldTo] || '—') + ' · Status: ' + r[DK.paymentStatus] + '</div>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.pay-result-item').forEach(function(item) {
    item.addEventListener('click', function() { openPaymentForm(item.dataset.id); });
  });
}

function openPaymentForm(id) {
  closePaymentSearch();
  var order = ORDERS.find(function(r) { return r._id === id; });
  if (!order) return;

  var amount = prompt('Record payment for Order #' + order[DK.sr] + ' — ' + order[DK.style] + '\nBalance Due: $' + fmtMoney(order[DK.balanceDue]) + '\n\nEnter amount received:');
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return;

  var date = prompt('Payment date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
  if (!date) return;

  var installments = [];
  try { installments = JSON.parse(order[DK.paymentLog] || '[]'); } catch(e) { installments = []; }
  installments.push({ amount: parseFloat(amount), date: date });

  var totalPaid = installments.reduce(function(s, i) { return s + i.amount; }, 0);
  var salePrice = parseFloat(order[DK.salePrice]) || 0;
  var balance = salePrice - totalPaid;

  var status = 'Unpaid';
  if (totalPaid >= salePrice) status = 'Paid';
  else if (totalPaid > 0) status = 'Partial';

  var data = {};
  for (var k in order) data[k] = order[k];
  data[DK.amountPaid] = totalPaid.toString();
  data[DK.balanceDue] = balance.toString();
  data[DK.paymentStatus] = status;
  data[DK.paymentLog] = JSON.stringify(installments);

  window.updateOrder(id, data).then(function() {
    showToast('Payment of $' + fmtMoney(amount) + ' recorded for order #' + order[DK.sr], 'success');
    return doFetchOrders();
  }).then(function() { renderAll(); }).catch(function(err) {
    console.error(err);
    showToast('Failed to record payment', 'error');
  });
}
