// ============================================================
// payments.js — the topbar "Receive Payment" search modal.
// Lets you find an order/memo by memo no., buyer, style, or
// customer without scrolling through the table, then hands off
// to openEditForPayment() (in panel.js) to actually record it.
// ============================================================

  // Builds one result per *outstanding* memo (deduped) or standalone order —
  // i.e. something with an actual balance left to collect. A memo counts as
  // payable as soon as any item in it has a Sale Price — Amount Paid /
  // Balance Due / Payment Status are already synced identically across
  // every item in a memo by the backend, so any one representative row's
  // values already ARE the memo-wide totals. Anything already fully paid
  // (balance ≤ 0) is skipped, since there's nothing left to receive.
  function buildPayableGroups() {
    const seenMemo = new Set();
    const groups = [];
    const hasBalance = (row) => (parseFloat(row['Balance Due']) || 0) > 0.005;

    ORDERS.forEach(r => {
      const memoKey = String(getField(r, 'Memo No.') || '').trim();

      if (memoKey) {
        const lower = memoKey.toLowerCase();
        if (seenMemo.has(lower)) return;
        seenMemo.add(lower);

        const siblings = ORDERS.filter(x => String(getField(x, 'Memo No.') || '').trim().toLowerCase() === lower);
        const priced = siblings.find(x => String(x['Sale Price'] ?? '').trim() !== '');
        if (!priced) return; // nothing in this memo has a price yet — nothing to pay against
        if (!hasBalance(priced)) return; // memo's already settled in full

        groups.push({
          repRow: priced._row,
          memoNo: memoKey,
          buyer: priced['Sold To'] || '',
          customer: priced['CUSTOMER '] ?? priced['CUSTOMER'] ?? '',
          styles: siblings.map(x => x['Style No.']).filter(Boolean),
          amountPaid: parseFloat(priced['Amount Paid']) || 0,
          balanceDue: parseFloat(priced['Balance Due']) || 0,
          status: String(priced['Payment Status'] || '').trim() || 'Unpaid',
        });
      } else {
        if (String(r['Sale Price'] ?? '').trim() === '') return;
        if (!hasBalance(r)) return; // already paid in full
        groups.push({
          repRow: r._row,
          memoNo: '',
          buyer: r['Sold To'] || '',
          customer: r['CUSTOMER '] ?? r['CUSTOMER'] ?? '',
          styles: [r['Style No.']].filter(Boolean),
          amountPaid: parseFloat(r['Amount Paid']) || 0,
          balanceDue: parseFloat(r['Balance Due']) || 0,
          status: String(r['Payment Status'] || '').trim() || 'Unpaid',
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

    // Biggest outstanding balance first — everything in this list already
    // has money owed on it (fully-paid orders are filtered out upstream),
    // so this just surfaces the largest ones first.
    groups.sort((a, b) => b.balanceDue - a.balanceDue);

    list.innerHTML = groups.map(g => {
      const cls = g.status === 'Paid' ? 'badge-paid' : g.status === 'Partial' ? 'badge-partial' : 'badge-unpaid';
      return `
        <div class="pay-result" data-row="${g.repRow}">
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
        openEditForPayment(parseInt(el.dataset.row, 10));
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
