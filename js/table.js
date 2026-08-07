// ============================================================
// table.js — desktop table + mobile card rendering with ORDERS_KEYS
// ============================================================

const OK = window.ORDERS_KEYS;

function renderSkeleton(count = 6) {
  const tbody = $('tbody');
  tbody.innerHTML = Array.from({ length: count }).map(() => `
    <tr class="skel-row">
      <td><span class="skel" style="width:24px">•</span></td>
      <td><span class="skel" style="width:70px">•</span></td>
      <td><span class="skel" style="width:90px">•</span></td>
      <td><span class="skel" style="width:80px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td><span class="skel" style="width:60px">•</span></td>
      <td><span class="skel" style="width:70px">•</span></td>
      <td><span class="skel" style="width:60px">•</span></td>
      <td><span class="skel" style="width:60px">•</span></td>
    </tr>
  `).join('');

  const list = $('cardList');
  list.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skel-card">
      <div><span class="skel w1">•</span><span class="skel w2">•</span></div>
      <span class="skel w3">•</span>
    </div>
  `).join('');
}

function renderErrorState(msg) {
  const errorHtml = `
    <div class="empty-state">
      <h3>Couldn't load orders</h3>
      <p>${msg}</p>
      <button class="btn secondary small" id="retryLoadBtn" style="margin-top:14px;">Retry</button>
    </div>
  `;
  $('tbody').innerHTML = `<tr><td colspan="14">${errorHtml}</td></tr>`;
  $('cardList').innerHTML = errorHtml;
  $('paginationBar').innerHTML = '';
  const bind = (el) => el && el.addEventListener('click', loadOrders);
  bind(document.querySelector('#tbody #retryLoadBtn'));
  bind(document.querySelector('#cardList #retryLoadBtn'));
}

function getCustomerBadge(customer) {
  const c = (customer || '').trim().toUpperCase();
  if (c === 'HET') return '<span class="badge badge-het">HET</span>';
  if (c.includes('CVD')) return '<span class="badge badge-cvd">CVD</span>';
  return '<span class="badge badge-other">' + (customer || '—') + '</span>';
}

function getPaymentBadge(row) {
  const price = String(row[OK.salePrice] ?? '').trim();
  if (price === '') return '<span class="badge badge-notsold">Not sold</span>';
  const status = String(row[OK.paymentStatus] ?? '').trim() || 'Unpaid';
  const cls = status === 'Paid' ? 'badge-paid' : status === 'Partial' ? 'badge-partial' : 'badge-unpaid';
  return `<span class="badge ${cls}">${status}</span>`;
}

function getRowStatusClass(r) {
  const price = String(r[OK.salePrice] ?? '').trim();
  if (price === '') return 'notsold-row';
  const status = String(r[OK.paymentStatus] ?? '').trim() || 'Unpaid';
  if (status === 'Paid') return 'paid-row';
  if (status === 'Partial') return 'partial-row';
  return 'unpaid-row';
}

function isPayable(row) {
  const priced = String(row[OK.salePrice] ?? '').trim() !== '' || (() => {
    const memoKey = String(getField(row, OK.memoNo) || '').trim().toLowerCase();
    if (!memoKey) return false;
    return ORDERS.some(x => x._row !== row._row &&
      String(getField(x, OK.memoNo) || '').trim().toLowerCase() === memoKey &&
      String(x[OK.salePrice] ?? '').trim() !== '');
  })();
  if (!priced) return false;
  return (parseFloat(row[OK.balanceDue]) || 0) > 0.005;
}

function quickPayBtn(row) {
  if (!isPayable(row)) return '';
  return `<button type="button" class="quick-pay-btn" data-row="${row._row}" title="Receive payment">$</button>`;
}

function wireQuickPayButtons(container) {
  container.querySelectorAll('.quick-pay-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditForPayment(btn.dataset.row);
    });
  });
}

function renderTable(rows) {
  const tbody = $('tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="14"><div class="empty-state"><h3>No orders found</h3><p>Try a different search, or add a new order.</p></div></td></tr>`;
    renderCards(rows);
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr data-row="${r._row}" class="${getRowStatusClass(r)}">
      <td class="num">${r[OK.srNo] ?? ''}</td>
      <td class="customer-cell">${getCustomerBadge(r[OK.customer] ?? r[OK.customerAlt])}</td>
      <td><span class="style-tag">${r[OK.styleNo] ?? ''}</span></td>
      <td>${fmtDate(r[OK.date])}</td>
      <td class="num col-grossWt">${fmtNum(r[OK.grossWt], 3)}</td>
      <td class="num col-netWt">${fmtNum(r[OK.netWt], 3)}</td>
      <td class="num col-ctWt">${fmtNum(gramsToCarats(r[OK.grossWt]), 3)}</td>
      <td class="num col-diaCt">${fmtNum(r[OK.inCt], 2)}</td>
      <td class="num col-subTotal" style="font-weight:600">${fmtMoney(r[OK.subTotal])}</td>
      <td class="num col-usd">${fmtNum(r[OK.usd], 2)}</td>
      <td class="col-memoNo">${getField(r, OK.memoNo) || '—'}</td>
      <td class="col-soldTo">${r[OK.soldTo] ?? '—'}</td>
      <td class="num col-salePrice">${String(getField(r, OK.salePrice) ?? '').trim() === '' ? '—' : fmtUSD(getField(r, OK.salePrice))}</td>
      <td class="status-cell">${getPaymentBadge(r)}${quickPayBtn(r)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr[data-row]').forEach(tr => {
    tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      openEdit(tr.dataset.row);
    });
  });
  wireQuickPayButtons(tbody);
  renderCards(rows);
}

function renderCards(rows) {
  const list = $('cardList');
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state"><h3>No orders found</h3><p>Try a different search, or add a new order.</p></div>`;
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="order-card ${getRowStatusClass(r)}" data-row="${r._row}">
      <div class="order-card-head">
        <div class="head-main">
          <div class="head-top">
            <span class="head-sr">#${r[OK.srNo] ?? ''}</span>
            <span class="style-tag">${r[OK.styleNo] ?? ''}</span>
          </div>
          <span class="head-sub">${getCustomerBadge(r[OK.customer] ?? r[OK.customerAlt])} · ${fmtDate(r[OK.date])}</span>
        </div>
        <div class="head-total">${ROLE === 'seller' ? '$' + fmtNum(r[OK.usd], 2) : fmtMoney(r[OK.subTotal])}</div>
        <svg class="order-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="order-card-body">
        <div class="order-card-grid">
          <div class="field-item col-grossWt"><div class="k">Gross Wt</div><div class="v">${fmtNum(r[OK.grossWt], 3)}</div></div>
          <div class="field-item col-netWt"><div class="k">Net Wt</div><div class="v">${fmtNum(r[OK.netWt], 3)}</div></div>
          <div class="field-item col-ctWt"><div class="k">Carat</div><div class="v">${fmtNum(gramsToCarats(r[OK.grossWt]), 3)}</div></div>
          <div class="field-item col-diaCt"><div class="k">diamond ct</div><div class="v">${fmtNum(r[OK.inCt], 2)}</div></div>
          <div class="field-item col-usd"><div class="k">$</div><div class="v">${fmtNum(r[OK.usd], 2)}</div></div>
          <div class="field-item col-memoNo"><div class="k">Memo No.</div><div class="v">${getField(r, OK.memoNo) || '—'}</div></div>
          <div class="field-item"><div class="k">Sold To</div><div class="v">${r[OK.soldTo] || '—'}</div></div>
          <div class="field-item col-salePrice"><div class="k">Sale Price</div><div class="v">${String(r[OK.salePrice] ?? '').trim() === '' ? '—' : fmtUSD(r[OK.salePrice])}</div></div>
          <div class="field-item"><div class="k">Status</div><div class="v">${getPaymentBadge(r)}${quickPayBtn(r)}</div></div>
          <div class="field-item col-balanceDue"><div class="k">Balance Due</div><div class="v">${String(r[OK.salePrice] ?? '').trim() === '' ? '—' : fmtUSD(r[OK.balanceDue])}</div></div>
        </div>
      </div>
    </div>
  `).join('');

  wireQuickPayButtons(list);

  list.querySelectorAll('.order-card').forEach(card => {
    const head = card.querySelector('.order-card-head');
    head.addEventListener('click', (e) => {
      const onChevron = !!e.target.closest('.order-card-chevron');
      if (card.classList.contains('open')) {
        if (onChevron) {
          closeCard(card);
        } else {
          openEdit(parseInt(card.dataset.row));
        }
        return;
      }
      openCard(card);
    });
  });
}

function openCard(card) {
  $('cardList').querySelectorAll('.order-card.open').forEach(c => { if (c !== card) closeCard(c); });
  card.classList.add('open');
  const body = card.querySelector('.order-card-body');
  body.style.maxHeight = body.scrollHeight + 'px';
}

function closeCard(card) {
  const body = card.querySelector('.order-card-body');
  body.style.maxHeight = body.scrollHeight + 'px';
  requestAnimationFrame(() => {
    card.classList.remove('open');
    body.style.maxHeight = '0px';
  });
}

document.querySelectorAll('thead th[data-key]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    document.querySelectorAll('thead th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    currentPage = 1;
    renderResults(applyFilter());
  });
});

function sortRows(rows) {
  if (!sortKey) return rows;
  const map = {
    sr: OK.srNo, customer: OK.customer, style: OK.styleNo, date: OK.date,
    grossWt: OK.grossWt, netWt: OK.netWt, carat: OK.grossWt, inCt: OK.inCt,
    subTotal: OK.subTotal, usd: OK.usd,
    memoNo: OK.memoNo, soldTo: OK.soldTo, salePrice: OK.salePrice, paymentStatus: OK.paymentStatus
  };
  const col = map[sortKey];
  return [...rows].sort((a, b) => {
    let av = a[col] ?? a[col.replace(' ', '')] ?? '';
    let bv = b[col] ?? b[col.replace(' ', '')] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (!isNaN(parseFloat(av)) && !isNaN(parseFloat(bv))) {
      av = parseFloat(av); bv = parseFloat(bv);
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}
