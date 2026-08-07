// ============================================================
// payments.js — Receive Payment search modal with ORDERS_KEYS
// ============================================================

const PK = window.ORDERS_KEYS;

function buildPayableGroups() {
  const seenMemo = new Set();
  const groups = [];
  const hasBalance = (row) => (parseFloat(row[PK.balanceDue]) || 0) > 0.005;

  ORDERS.forEach(r => {
    const memoKey = String(getField(r, PK.memoNo) || '').trim();

    if (memoKey) {
      const lower = memoKey.toLowerCase();
      if (seenMemo.has(lower)) return;
      seenMemo.add(lower);

      const siblings = ORDERS.filter(x => String(getField(x, PK.memoNo) || '').trim().toLowerCase() === lower);
      const priced = siblings.find(x => String(x[PK.salePrice] ?? '').trim() !== '');
      if (!priced) return;
      if (!hasBalance(priced)) return;

      groups.push({
        repId: priced._row,
        memoNo: memoKey,
        buyer: priced[PK.soldTo] || '',
        customer: priced[PK.customer] ?? priced[PK.customerAlt] ?? '',
        styles: siblings.map(x => x[PK.styleNo]).filter(Boolean),
        amountPaid: parseFloat(priced[PK.amountPaid]) || 0,
        balanceDue: parseFloat(priced[PK.balanceDue]) || 0,
        status: String(priced[PK.paymentStatus] || '').trim() || 'Unpaid',
      });
    } else {
      if (String(r[PK.salePrice] ?? '').trim() === '') return;
      if (!hasBalance(r)) return;
      groups.push({
        repId: r._row,
        memoNo: '',
        buyer: r[PK.soldTo] || '',
        customer: r[PK.customer] ?? r[PK.customerAlt] ?? '',
        styles: [r[PK.styleNo]].filter(Boolean),
        amountPaid: parseFloat(r[PK.amountPaid]) || 0,
        balanceDue: parseFloat(r[PK.balanceDue]) || 0,
        status: String(r[PK.paymentStatus] || '').trim() || 'Unpaid',
      });
    }
  });

  return groups;
}

function filterPayableGroups(query) {
  const groups = buildPayableGroups();
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter(g =>
    g.memoNo.toLowerCase().includes(q) ||
    g.buyer.toLowerCase().includes(q) ||
    g.customer.toLowerCase().includes(q) ||
    g.styles.join(' ').toLowerCase().includes(q)
  );
}

function renderPayResults(query) {
  const groups = filterPayableGroups(query);
  const list = $('payResults');

  if (!groups.length) {
    list.innerHTML = `<div class="pay-empty">No outstanding balances match that search.</div>`;
    return;
  }

  groups.sort((a, b) => b.balanceDue - a.balanceDue);

  list.innerHTML = groups.map(g => {
    const cls = g.status === 'Paid' ? 'badge-paid' : g.status === 'Partial' ? 'badge-partial' : 'badge-unpaid';
    return `
      <div class="pay-result" data-row="${g.repId}">
        <div class="pay-result-main">
          <div class="pay-result-buyer">${g.buyer || 'No buyer set'}</div>
          <div class="pay-result-sub">${getCustomerBadge(g.customer)} · ${g.styles.join(', ')}${g.memoNo ? ' · Memo ' + g.memoNo : ''}</div>
        </div>
        <div class="pay-result-side">
          <div class="pay-result-balance">${fmtUSD(g.balanceDue)}</div>
          <span class="badge ${cls}">${g.status}</span>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.pay-result').forEach(el => {
    el.addEventListener('click', () => {
      closePaymentSearch();
      openEditForPayment(el.dataset.row);
    });
  });
}

function openPaymentSearch() {
  $('paymentSearchOverlay').classList.add('open');
  $('paymentSearchModal').classList.add('open');
  $('paySearchInput').value = '';
  renderPayResults('');
  setTimeout(() => $('paySearchInput').focus(), 50);
}

function closePaymentSearch() {
  $('paymentSearchOverlay').classList.remove('open');
  $('paymentSearchModal').classList.remove('open');
}

$('receivePaymentBtn').addEventListener('click', openPaymentSearch);
$('closePaymentSearch').addEventListener('click', closePaymentSearch);
$('paymentSearchOverlay').addEventListener('click', closePaymentSearch);

let paySearchDebounceTimer = null;
$('paySearchInput').addEventListener('input', () => {
  clearTimeout(paySearchDebounceTimer);
  paySearchDebounceTimer = setTimeout(() => renderPayResults($('paySearchInput').value), 120);
});
