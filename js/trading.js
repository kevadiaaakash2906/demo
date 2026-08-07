// ============================================================
// trading.js — Trading module: buy/sell tracking, P/L, payments
// ============================================================

// ============ CONFIG: Match these to your Trading sheet headers ============
const SHEET_KEYS = {
  srNo: 'Sr. No.',
  date: 'Date',
  item: 'Item',
  vendor: 'Vendor',
  purchasePrice: 'Purchase Price',
  salePrice: 'Sale Price',
  dateSold: 'Date Sold',
  soldTo: 'Sold To',
  amountPaid: 'Amount Paid',
  balanceDue: 'Balance Due',
  paymentStatus: 'Payment Status',
  paymentLog: 'Payment Log',
  notes: 'Notes'
};
// ===========================================================================

let TRADING = [];
let editingTrade = null;
let currentTradeInstallments = [];
let tradeSortKey = null;
let tradeSortDir = 'asc';
let tradeCurrentPage = 1;
let tradeDeleteHoldRAF = null;
let lastDeletedTrade = null;
let tradeUndoTimer = null;
let tradeUndoCountdownTimer = null;
let tradeFormDirty = false;

function getTradingAPI() {
  return Promise.resolve({
    addTrading: window.addTrading,
    updateTrading: window.updateTrading,
    deleteTrading: window.deleteTrading,
    restoreOrder: window.restoreOrder
  });
}

// ==================== FORMULAS ====================
function computeTrade(fields) {
  const purchase = parseFloat(fields.purchasePrice) || 0;
  const saleStr = String(fields.salePrice ?? '').trim();
  const sale = saleStr !== '' ? parseFloat(fields.salePrice) || 0 : null;
  const paid = currentTradeInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const balance = sale !== null ? Math.max(0, sale - paid) : 0;
  const status = sale === null ? '' : (paid <= 0 ? 'Unpaid' : (paid >= sale ? 'Paid' : 'Partial'));
  const profit = (sale !== null && purchase > 0) ? sale - purchase : null;
  return { purchase, sale, paid, balance, status, profit };
}

function updateTradePreview() {
  const fields = collectTradeFields();
  const comp = computeTrade(fields);
  const profitEl = $('t_prev_profit');
  if (comp.profit !== null) {
    profitEl.textContent = (comp.profit >= 0 ? '+$' : '−$') + fmtNum(Math.abs(comp.profit), 2);
    profitEl.style.color = comp.profit >= 0 ? 'var(--good)' : 'var(--bad)';
  } else {
    profitEl.textContent = '—';
    profitEl.style.color = 'var(--text-dim)';
  }
  $('t_prev_amountPaid').textContent = comp.paid > 0 ? fmtUSD(comp.paid) : '—';
  $('t_prev_balanceDue').textContent = comp.status ? fmtUSD(comp.balance) : '—';
  $('t_prev_paymentStatus').textContent = comp.status || '—';
}

// ==================== INSTALLMENTS ====================
function renderTradeInstallments() {
  const list = $('tradeInstallmentsList');
  if (!currentTradeInstallments.length) {
    list.innerHTML = `<div class="installments-empty">No payments recorded yet.</div>`;
  } else {
    list.innerHTML = currentTradeInstallments.map((inst, i) => `
      <div class="installment-item">
        <span class="inst-date">${inst.date ? fmtDate(inst.date) : '—'}</span>
        <span class="inst-amount">${fmtUSD(inst.amount)}</span>
        <button type="button" class="inst-remove" data-idx="${i}" title="Remove this payment">&times;</button>
      </div>
    `).join('');
    list.querySelectorAll('.inst-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTradeInstallments.splice(parseInt(btn.dataset.idx, 10), 1);
        tradeFormDirty = true;
        renderTradeInstallments();
      });
    });
  }
  updateTradePreview();
}

$('addTradeInstallmentBtn').addEventListener('click', () => {
  const amtStr = $('t_instAmount').value;
  const amt = parseFloat(amtStr);
  if (!amtStr || isNaN(amt) || amt <= 0) {
    $('err_t_installment').textContent = 'Enter a valid amount to add a payment.';
    return;
  }
  $('err_t_installment').textContent = '';
  const date = $('t_instDate').value || new Date().toISOString().split('T')[0];
  currentTradeInstallments.push({ date, amount: amt });
  currentTradeInstallments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  $('t_instAmount').value = '';
  $('t_instDate').value = '';
  tradeFormDirty = true;
  renderTradeInstallments();
});

// ==================== PANEL ====================
function openTradePanel() {
  $('tradeOverlay').style.display = 'block';
  $('tradePanel').classList.add('open');
  $('tradeSaveMsg').textContent = '';
  $('tradeSaveMsg').className = '';
  clearTradeFieldErrors();
  tradeFormDirty = false;
  updateTradePreview();
}

function closeTradePanelFn() {
  $('tradeOverlay').style.display = 'none';
  $('tradePanel').classList.remove('open');
}

function requestCloseTradePanel() {
  if (tradeFormDirty && !document.body.classList.contains('view-only')) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  closeTradePanelFn();
}

$('closeTradePanel').addEventListener('click', requestCloseTradePanel);
$('tradeOverlay').addEventListener('click', requestCloseTradePanel);

document.querySelectorAll('#tradePanel .field input').forEach(inp => {
  inp.addEventListener('input', () => { tradeFormDirty = true; updateTradePreview(); });
});

function openEditTrade(rowId) {
  const trade = TRADING.find(r => r._row === rowId);
  if (!trade) return;
  editingTrade = rowId;
  const canEdit = ROLE === 'staff' || ROLE === 'seller';
  const K = SHEET_KEYS;
  $('tradePanelTitle').textContent = `${canEdit ? 'Edit' : 'View'} — ${trade[K.item] ?? ''}`;
  $('t_item').value = trade[K.item] ?? '';
  $('t_vendor').value = trade[K.vendor] ?? '';
  $('t_date').value = trade[K.date] ? String(trade[K.date]).split('T')[0] : '';
  $('t_purchasePrice').value = trade[K.purchasePrice] ?? '';
  $('t_salePrice').value = trade[K.salePrice] ?? '';
  $('t_dateSold').value = trade[K.dateSold] ? String(trade[K.dateSold]).split('T')[0] : '';
  $('t_soldTo').value = trade[K.soldTo] ?? '';
  $('t_notes').value = trade[K.notes] ?? '';

  let loaded = [];
  const rawLog = trade[K.paymentLog];
  if (rawLog) {
    try {
      const parsed = JSON.parse(rawLog);
      if (Array.isArray(parsed)) {
        loaded = parsed.filter(x => x && !isNaN(parseFloat(x.amount)))
          .map(x => ({ date: x.date || '', amount: parseFloat(x.amount) }));
      }
    } catch (e) {}
  }
  if (!loaded.length) {
    const existingPaid = parseFloat(trade[K.amountPaid]);
    if (existingPaid > 0) {
      loaded = [{ date: trade[K.dateSold] ? String(trade[K.dateSold]).split('T')[0] : '', amount: existingPaid }];
    }
  }
  currentTradeInstallments = loaded;
  $('t_instAmount').value = '';
  $('t_instDate').value = '';
  $('err_t_installment').textContent = '';
  renderTradeInstallments();

  const allIds = ['t_item','t_vendor','t_date','t_purchasePrice','t_salePrice','t_dateSold','t_soldTo','t_notes','t_instAmount','t_instDate'];
  allIds.forEach(id => { $(id).readOnly = !canEdit; });
  $('addTradeInstallmentBtn').style.display = canEdit ? '' : 'none';
  $('deleteTradeBtn').style.display = (ROLE === 'staff' || ROLE === 'seller') ? 'inline-block' : 'none';
  $('deleteTradeText').textContent = 'Delete';
  $('deleteTradeBtn').classList.remove('holding');
  $('deleteTradeProgress').style.width = '0%';
  updateTradePreview();
  openTradePanel();
}

$('newTradeBtn').addEventListener('click', () => {
  editingTrade = null;
  $('tradePanelTitle').textContent = 'New Trade';
  ['t_item','t_vendor','t_date','t_purchasePrice','t_salePrice','t_dateSold','t_soldTo','t_notes','t_instAmount','t_instDate']
    .forEach(id => $(id).value = '');
  currentTradeInstallments = [];
  $('err_t_installment').textContent = '';
  renderTradeInstallments();
  $('deleteTradeBtn').style.display = 'none';
  updateTradePreview();
  openTradePanel();
});

function collectTradeFields() {
  return {
    item: $('t_item').value.trim(),
    vendor: $('t_vendor').value.trim(),
    date: $('t_date').value,
    purchasePrice: $('t_purchasePrice').value,
    salePrice: $('t_salePrice').value,
    dateSold: $('t_dateSold').value,
    soldTo: $('t_soldTo').value.trim(),
    notes: $('t_notes').value.trim(),
    paymentLog: JSON.stringify(currentTradeInstallments)
  };
}

function setTradeFieldError(id, msg) {
  const field = $(id).closest('.field');
  const errEl = $('err_' + id);
  if (msg) {
    field.classList.add('has-error');
    $(id).classList.add('error');
    if (errEl) errEl.textContent = msg;
  } else {
    field.classList.remove('has-error');
    $(id).classList.remove('error');
    if (errEl) errEl.textContent = '';
  }
}

function clearTradeFieldErrors() {
  ['t_item','t_vendor','t_purchasePrice','t_salePrice'].forEach(id => setTradeFieldError(id, ''));
  $('err_t_installment').textContent = '';
}

['t_item','t_vendor','t_purchasePrice','t_salePrice'].forEach(id => {
  $(id).addEventListener('input', () => setTradeFieldError(id, ''));
});

function validateTradeFields(fields) {
  clearTradeFieldErrors();
  let valid = true;
  const fail = (id, msg) => { setTradeFieldError(id, msg); valid = false; };

  if (!fields.item) fail('t_item', 'Item is required.');
  if (!fields.vendor) fail('t_vendor', 'Vendor is required.');

  const purchaseStr = String(fields.purchasePrice).trim();
  if (purchaseStr === '' || isNaN(parseFloat(purchaseStr)) || parseFloat(purchaseStr) < 0) {
    fail('t_purchasePrice', 'Enter a valid purchase price.');
  }

  const saleStr = String(fields.salePrice).trim();
  if (saleStr !== '' && (isNaN(parseFloat(saleStr)) || parseFloat(saleStr) < 0)) {
    fail('t_salePrice', 'Sale Price must be positive.');
  }

  const totalPaid = currentTradeInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const salePrice = saleStr === '' ? 0 : parseFloat(saleStr) || 0;
  if (totalPaid > 0 && saleStr === '') {
    fail('t_salePrice', 'Enter a Sale Price before recording payments.');
  } else if (saleStr !== '' && totalPaid > salePrice) {
    $('err_t_installment').textContent = "Total payments can't exceed the Sale Price.";
    valid = false;
  }

  return valid;
}

// ==================== SAVE ====================
$('saveTradeBtn').addEventListener('click', async () => {
  const fields = collectTradeFields();
  if (!validateTradeFields(fields)) {
    $('tradeSaveMsg').textContent = 'Please fix the highlighted fields.';
    $('tradeSaveMsg').className = 'bad';
    return;
  }

  const comp = computeTrade(fields);
  const K = SHEET_KEYS;
  const payload = {
    [K.srNo]: editingTrade ? TRADING.find(r => r._row === editingTrade)?.[K.srNo] : undefined,
    [K.date]: fields.date,
    [K.item]: fields.item,
    [K.vendor]: fields.vendor,
    [K.purchasePrice]: fields.purchasePrice,
    [K.salePrice]: fields.salePrice,
    [K.dateSold]: fields.dateSold,
    [K.soldTo]: fields.soldTo,
    [K.amountPaid]: comp.paid,
    [K.balanceDue]: comp.balance,
    [K.paymentStatus]: comp.status,
    [K.paymentLog]: fields.paymentLog,
    [K.notes]: fields.notes
  };

  $('tradeSaveMsg').textContent = 'Saving…';
  $('tradeSaveMsg').className = '';
  $('saveTradeBtn').textContent = 'Saving…';
  $('saveTradeBtn').disabled = true;

  try {
    const { addTrading, updateTrading } = await getTradingAPI();
    let result, docId;

    if (editingTrade) {
      result = await updateTrading(editingTrade, payload);
      docId = editingTrade;
    } else {
      result = await addTrading(payload);
      docId = result.id;
    }

    $('saveTradeBtn').textContent = 'Save';
    $('saveTradeBtn').disabled = false;

    if (!result.ok) {
      $('tradeSaveMsg').textContent = 'Could not save.';
      $('tradeSaveMsg').className = 'bad';
      return;
    }

    const saved = {
      _row: docId, _id: docId,
      [K.srNo]: result.srNo || payload[K.srNo] || (Math.max(0, ...TRADING.map(r => parseInt(r[K.srNo]) || 0)) + 1),
      ...payload
    };
    if (editingTrade) {
      const idx = TRADING.findIndex(r => r._row === editingTrade);
      if (idx !== -1) TRADING[idx] = saved;
    } else {
      TRADING.push(saved);
    }

    renderTradingKPIs();
    renderTradingResults(applyTradingFilter());

    $('tradeSaveMsg').textContent = 'Saved successfully.';
    $('tradeSaveMsg').className = 'good';
    setTimeout(closeTradePanelFn, 300);
    setTimeout(() => loadTrading().catch(() => {}), 2000);

  } catch (err) {
    $('saveTradeBtn').textContent = 'Save';
    $('saveTradeBtn').disabled = false;
    $('tradeSaveMsg').textContent = err.message || 'Network error.';
    $('tradeSaveMsg').className = 'bad';
  }
});

// ==================== DELETE ====================
$('deleteTradeBtn').addEventListener('mousedown', startTradeDeleteHold);
$('deleteTradeBtn').addEventListener('touchstart', startTradeDeleteHold);
$('deleteTradeBtn').addEventListener('mouseup', cancelTradeDeleteHold);
$('deleteTradeBtn').addEventListener('mouseleave', cancelTradeDeleteHold);
$('deleteTradeBtn').addEventListener('touchend', cancelTradeDeleteHold);

function startTradeDeleteHold(e) {
  e.preventDefault();
  if (editingTrade === null) return;
  $('deleteTradeBtn').classList.add('holding');
  $('deleteTradeProgress').style.width = '0%';
  const duration = 3000, start = performance.now();
  function tick(now) {
    const progress = Math.min(((now - start) / duration) * 100, 100);
    $('deleteTradeProgress').style.width = progress + '%';
    if (progress >= 100) { tradeDeleteHoldRAF = null; executeTradeDelete(); }
    else { tradeDeleteHoldRAF = requestAnimationFrame(tick); }
  }
  tradeDeleteHoldRAF = requestAnimationFrame(tick);
}

function cancelTradeDeleteHold() {
  if (tradeDeleteHoldRAF) { cancelAnimationFrame(tradeDeleteHoldRAF); tradeDeleteHoldRAF = null; }
  $('deleteTradeBtn').classList.remove('holding');
  $('deleteTradeProgress').style.width = '0%';
}

async function executeTradeDelete() {
  $('deleteTradeText').textContent = 'Deleting…';
  try {
    const { deleteTrading } = await getTradingAPI();
    const trade = TRADING.find(r => r._row === editingTrade);
    if (!trade) throw new Error('Trade not found');
    const K = SHEET_KEYS;
    lastDeletedTrade = { id: editingTrade, data: { ...trade }, collection: 'trading' };
    await deleteTrading(editingTrade, trade[K.srNo]);
    playScreenFx('delete');
    showTradeUndoToast(editingTrade);

    TRADING = TRADING.filter(r => r._row !== editingTrade);
    renderTradingKPIs();
    renderTradingResults(applyTradingFilter());
    closeTradePanelFn();
  } catch (err) {
    $('tradeSaveMsg').textContent = err.message || 'Could not delete.';
    $('tradeSaveMsg').className = 'bad';
    $('deleteTradeText').textContent = 'Delete';
    $('deleteTradeBtn').classList.remove('holding');
  }
}

// ==================== UNDO ====================
function showTradeUndoToast(docId) {
  if (!docId) { showToast('Trade deleted'); return; }
  clearTimeout(tradeUndoTimer);
  clearInterval(tradeUndoCountdownTimer);
  const toast = $('undoToast');
  const countEl = $('undoCount');
  let secondsLeft = 60;
  countEl.textContent = secondsLeft;
  toast.classList.add('show');
  tradeUndoCountdownTimer = setInterval(() => {
    secondsLeft -= 1;
    countEl.textContent = Math.max(secondsLeft, 0);
    if (secondsLeft <= 0) clearInterval(tradeUndoCountdownTimer);
  }, 1000);
  tradeUndoTimer = setTimeout(() => {
    toast.classList.remove('show');
    clearInterval(tradeUndoCountdownTimer);
    lastDeletedTrade = null;
  }, 60000);

  $('undoBtn').onclick = async () => {
    clearTimeout(tradeUndoTimer);
    clearInterval(tradeUndoCountdownTimer);
    toast.classList.remove('show');
    if (!lastDeletedTrade) return;
    try {
      if (lastDeletedTrade.collection === 'trading') {
        const { restoreOrder } = await getTradingAPI();
        await restoreOrder(lastDeletedTrade.id, lastDeletedTrade.data);
        lastDeletedTrade = null;
        showToast('Trade restored');
        await loadTrading();
      }
    } catch (err) {
      showToast(err.message || 'Could not undo', 'bad');
    }
  };
}

// ==================== LOAD ====================
async function loadTrading() {
  renderTradeSkeleton();
  try {
    const data = await window.fetchTrading();
    const K = SHEET_KEYS;
    TRADING = (data.rows || []).filter(r => r[K.item] && String(r[K.item]).trim() !== '');
    renderTradingKPIs();
    tradeCurrentPage = 1;
    renderTradingResults(applyTradingFilter());
    showToast('Trading loaded');
  } catch (err) {
    renderTradeErrorState(err.message || 'Could not load trading.');
    showToast('Trading load failed', 'bad');
  }
}

// ==================== RENDERING ====================
function renderTradeSkeleton(count = 6) {
  const tbody = $('tradeTbody');
  tbody.innerHTML = Array.from({ length: count }).map(() => `
    <tr class="skel-row">
      <td><span class="skel" style="width:24px">•</span></td>
      <td><span class="skel" style="width:70px">•</span></td>
      <td><span class="skel" style="width:120px">•</span></td>
      <td><span class="skel" style="width:90px">•</span></td>
      <td class="num"><span class="skel" style="width:60px">•</span></td>
      <td class="num"><span class="skel" style="width:60px">•</span></td>
      <td><span class="skel" style="width:80px">•</span></td>
      <td><span class="skel" style="width:80px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
      <td><span class="skel" style="width:60px">•</span></td>
      <td class="num"><span class="skel" style="width:50px">•</span></td>
    </tr>
  `).join('');
}

function renderTradeErrorState(msg) {
  const html = `
    <div class="empty-state">
      <h3>Couldn't load trades</h3>
      <p>${msg}</p>
      <button class="btn secondary small" id="retryTradeBtn" style="margin-top:14px;">Retry</button>
    </div>
  `;
  $('tradeTbody').innerHTML = `<tr><td colspan="12">${html}</td></tr>`;
  $('tradeCardList').innerHTML = html;
  const btn = document.getElementById('retryTradeBtn');
  if (btn) btn.addEventListener('click', loadTrading);
}

function getTradeStatusClass(r) {
  const K = SHEET_KEYS;
  const price = String(r[K.salePrice] ?? '').trim();
  if (price === '') return 'notsold-row';
  const status = String(r[K.paymentStatus] ?? '').trim() || 'Unpaid';
  if (status === 'Paid') return 'paid-row';
  if (status === 'Partial') return 'partial-row';
  return 'unpaid-row';
}

function getTradePaymentBadge(row) {
  const K = SHEET_KEYS;
  const price = String(row[K.salePrice] ?? '').trim();
  if (price === '') return '<span class="badge badge-notsold">Not sold</span>';
  const status = String(row[K.paymentStatus] ?? '').trim() || 'Unpaid';
  const cls = status === 'Paid' ? 'badge-paid' : status === 'Partial' ? 'badge-partial' : 'badge-unpaid';
  return `<span class="badge ${cls}">${status}</span>`;
}

function isTradePayable(row) {
  const K = SHEET_KEYS;
  const priced = String(row[K.salePrice] ?? '').trim() !== '';
  if (!priced) return false;
  return (parseFloat(row[K.balanceDue]) || 0) > 0.005;
}

function quickTradePayBtn(row) {
  if (!isTradePayable(row)) return '';
  return `<button type="button" class="quick-pay-btn" data-row="${row._row}" title="Receive payment">$</button>`;
}

function wireTradeQuickPay(container) {
  container.querySelectorAll('.quick-pay-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditTrade(btn.dataset.row);
      requestAnimationFrame(() => {
        const divider = document.querySelector('#tradePanel .section-divider');
        if (divider) divider.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('t_instAmount').focus();
      });
    });
  });
}

function renderTradingTable(rows) {
  const tbody = $('tradeTbody');
  const K = SHEET_KEYS;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><h3>No trades found</h3><p>Try a different search, or add a new trade.</p></div></td></tr>`;
    renderTradeCards(rows);
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const profit = parseFloat(r[K.salePrice]) - parseFloat(r[K.purchasePrice]);
    const hasBoth = String(r[K.salePrice] ?? '').trim() !== '' && String(r[K.purchasePrice] ?? '').trim() !== '';
    const profitStr = hasBoth ? (profit >= 0 ? '+$' : '−$') + fmtNum(Math.abs(profit), 2) : '—';
    const profitColor = hasBoth ? (profit >= 0 ? 'style="color:var(--good)"' : 'style="color:var(--bad)"') : '';
    return `
      <tr data-trow="${r._row}" class="${getTradeStatusClass(r)}">
        <td class="num">${r[K.srNo] ?? ''}</td>
        <td>${fmtDate(r[K.date])}</td>
        <td><span class="style-tag">${r[K.item] ?? ''}</span></td>
        <td>${r[K.vendor] ?? '—'}</td>
        <td class="num">${fmtUSD(r[K.purchasePrice])}</td>
        <td class="num">${String(r[K.salePrice] ?? '').trim() === '' ? '—' : fmtUSD(r[K.salePrice])}</td>
        <td>${fmtDate(r[K.dateSold])}</td>
        <td>${r[K.soldTo] ?? '—'}</td>
        <td class="num">${fmtUSD(r[K.amountPaid])}</td>
        <td class="num">${String(r[K.salePrice] ?? '').trim() === '' ? '—' : fmtUSD(r[K.balanceDue])}</td>
        <td class="status-cell">${getTradePaymentBadge(r)}${quickTradePayBtn(r)}</td>
        <td class="num" ${profitColor}>${profitStr}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr[data-trow]').forEach(tr => {
    tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      openEditTrade(tr.dataset.trow);
    });
  });
  wireTradeQuickPay(tbody);
  renderTradeCards(rows);
}

function renderTradeCards(rows) {
  const list = $('tradeCardList');
  const K = SHEET_KEYS;
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state"><h3>No trades found</h3><p>Try a different search, or add a new trade.</p></div>`;
    return;
  }
  list.innerHTML = rows.map(r => {
    const profit = parseFloat(r[K.salePrice]) - parseFloat(r[K.purchasePrice]);
    const hasBoth = String(r[K.salePrice] ?? '').trim() !== '' && String(r[K.purchasePrice] ?? '').trim() !== '';
    const profitStr = hasBoth ? (profit >= 0 ? '+$' : '−$') + fmtNum(Math.abs(profit), 2) : '—';
    return `
      <div class="order-card ${getTradeStatusClass(r)}" data-trow="${r._row}">
        <div class="order-card-head">
          <div class="head-main">
            <div class="head-top">
              <span class="head-sr">#${r[K.srNo] ?? ''}</span>
              <span class="style-tag">${r[K.item] ?? ''}</span>
            </div>
            <span class="head-sub">${r[K.vendor] ?? '—'} · ${fmtDate(r[K.date])}</span>
          </div>
          <div class="head-total">${profitStr}</div>
          <svg class="order-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="order-card-body">
          <div class="order-card-grid">
            <div class="field-item"><div class="k">Purchase</div><div class="v">${fmtUSD(r[K.purchasePrice])}</div></div>
            <div class="field-item"><div class="k">Sale</div><div class="v">${String(r[K.salePrice] ?? '').trim() === '' ? '—' : fmtUSD(r[K.salePrice])}</div></div>
            <div class="field-item"><div class="k">Date Sold</div><div class="v">${fmtDate(r[K.dateSold])}</div></div>
            <div class="field-item"><div class="k">Sold To</div><div class="v">${r[K.soldTo] || '—'}</div></div>
            <div class="field-item"><div class="k">Paid</div><div class="v">${fmtUSD(r[K.amountPaid])}</div></div>
            <div class="field-item"><div class="k">Balance</div><div class="v">${String(r[K.salePrice] ?? '').trim() === '' ? '—' : fmtUSD(r[K.balanceDue])}</div></div>
            <div class="field-item"><div class="k">Status</div><div class="v">${getTradePaymentBadge(r)}${quickTradePayBtn(r)}</div></div>
            <div class="field-item"><div class="k">P/L</div><div class="v" style="color:${hasBoth ? (profit >= 0 ? 'var(--good)' : 'var(--bad)') : 'inherit'}">${profitStr}</div></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  wireTradeQuickPay(list);

  list.querySelectorAll('.order-card').forEach(card => {
    const head = card.querySelector('.order-card-head');
    head.addEventListener('click', (e) => {
      const onChevron = !!e.target.closest('.order-card-chevron');
      if (card.classList.contains('open')) {
        if (onChevron) {
          const body = card.querySelector('.order-card-body');
          body.style.maxHeight = body.scrollHeight + 'px';
          requestAnimationFrame(() => {
            card.classList.remove('open');
            body.style.maxHeight = '0px';
          });
        } else {
          openEditTrade(card.dataset.trow);
        }
        return;
      }
      list.querySelectorAll('.order-card.open').forEach(c => {
        if (c !== card) {
          const b = c.querySelector('.order-card-body');
          b.style.maxHeight = b.scrollHeight + 'px';
          requestAnimationFrame(() => { c.classList.remove('open'); b.style.maxHeight = '0px'; });
        }
      });
      card.classList.add('open');
      const body = card.querySelector('.order-card-body');
      body.style.maxHeight = body.scrollHeight + 'px';
    });
  });
}

// ==================== SORTING ====================
document.querySelectorAll('#tradingTable thead th[data-tkey]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.tkey;
    if (tradeSortKey === key) {
      tradeSortDir = tradeSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      tradeSortKey = key;
      tradeSortDir = 'asc';
    }
    document.querySelectorAll('#tradingTable thead th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
    th.classList.add(tradeSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    tradeCurrentPage = 1;
    renderTradingResults(applyTradingFilter());
  });
});

function sortTradingRows(rows) {
  if (!tradeSortKey) return rows;
  const K = SHEET_KEYS;
  const map = {
    sr: K.srNo, date: K.date, item: K.item, vendor: K.vendor,
    purchase: K.purchasePrice, sale: K.salePrice, dateSold: K.dateSold,
    soldTo: K.soldTo, paid: K.amountPaid, balance: K.balanceDue,
    status: K.paymentStatus, profit: K.salePrice
  };
  const col = map[tradeSortKey];
  return [...rows].sort((a, b) => {
    let av = a[col] ?? '';
    let bv = b[col] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (!isNaN(parseFloat(av)) && !isNaN(parseFloat(bv))) {
      av = parseFloat(av); bv = parseFloat(bv);
    }
    if (av < bv) return tradeSortDir === 'asc' ? -1 : 1;
    if (av > bv) return tradeSortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ==================== SEARCH & FILTER ====================
function applyTradingFilter() {
  const q = $('search').value.trim().toLowerCase();
  const K = SHEET_KEYS;
  let filtered = TRADING;
  if (q) {
    filtered = filtered.filter(r =>
      String(r[K.item] ?? '').toLowerCase().includes(q) ||
      String(r[K.vendor] ?? '').toLowerCase().includes(q) ||
      String(r[K.date] ?? '').includes(q) ||
      String(r[K.soldTo] ?? '').toLowerCase().includes(q)
    );
  }
  return sortTradingRows(filtered);
}

// ==================== PAGINATION ====================
const TRADE_PAGE_SIZE = 25;

function renderTradingResults(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / TRADE_PAGE_SIZE));
  if (tradeCurrentPage > totalPages) tradeCurrentPage = totalPages;
  if (tradeCurrentPage < 1) tradeCurrentPage = 1;
  const start = (tradeCurrentPage - 1) * TRADE_PAGE_SIZE;
  const pageRows = rows.slice(start, start + TRADE_PAGE_SIZE);
  renderTradingTable(pageRows);
  renderTradePagination(rows.length, start, pageRows.length);
}

function renderTradePagination(total, start, pageCount) {
  const bar = $('tradePaginationBar');
  if (!bar) return;
  if (total === 0) { bar.innerHTML = ''; return; }
  const totalPages = Math.max(1, Math.ceil(total / TRADE_PAGE_SIZE));
  bar.innerHTML = `
    <span class="page-info">Showing ${start + 1}–${start + pageCount} of ${total} trades</span>
    <div class="page-controls">
      <button class="btn secondary small" id="prevTradePageBtn" ${tradeCurrentPage <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="page-num">Page ${tradeCurrentPage} of ${totalPages}</span>
      <button class="btn secondary small" id="nextTradePageBtn" ${tradeCurrentPage >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
  const prev = $('prevTradePageBtn');
  const next = $('nextTradePageBtn');
  if (prev) prev.addEventListener('click', () => { tradeCurrentPage--; renderTradingResults(applyTradingFilter()); });
  if (next) next.addEventListener('click', () => { tradeCurrentPage++; renderTradingResults(applyTradingFilter()); });
}

// ==================== KPIs ====================
function renderTradingKPIs() {
  const K = SHEET_KEYS;
  const totalTrades = TRADING.length;
  const totalInvested = TRADING.reduce((s, r) => s + (parseFloat(r[K.purchasePrice]) || 0), 0);
  const soldTrades = TRADING.filter(r => String(r[K.salePrice] ?? '').trim() !== '');
  const totalSales = soldTrades.reduce((s, r) => s + (parseFloat(r[K.salePrice]) || 0), 0);
  const totalProfit = soldTrades.reduce((s, r) => s + ((parseFloat(r[K.salePrice]) || 0) - (parseFloat(r[K.purchasePrice]) || 0)), 0);
  const totalPaid = TRADING.reduce((s, r) => s + (parseFloat(r[K.amountPaid]) || 0), 0);
  const totalOutstanding = TRADING.reduce((s, r) => s + (parseFloat(r[K.balanceDue]) || 0), 0);

  const kpis = [
    { label: 'Total Trades', value: totalTrades.toLocaleString('en-IN'), sub: 'buy & sell records' },
    { label: 'Total Invested', value: fmtUSD(totalInvested), sub: 'capital deployed' },
    { label: 'Total Sales', value: fmtUSD(totalSales), sub: 'revenue from sold items' },
    { label: 'Net P/L', value: (totalProfit >= 0 ? '+$' : '−$') + fmtNum(Math.abs(totalProfit), 2), sub: 'closed trades only', good: totalProfit >= 0 },
    { label: 'Collected', value: fmtUSD(totalPaid), sub: 'payments received' },
    { label: 'Outstanding', value: fmtUSD(totalOutstanding), sub: 'balance due across all' },
  ];

  const grid = document.getElementById('tradeKpiGrid');
  if (!grid) return;
  grid.innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value" style="${k.good !== undefined ? `color:var(${k.good ? '--good' : '--bad'})` : ''}">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>
  `).join('');
}

// ==================== VIEW TOGGLE ====================
$('ordersViewBtn').addEventListener('click', () => switchView('orders'));
$('tradingViewBtn').addEventListener('click', () => switchView('trading'));

function switchView(view) {
  const isOrders = view === 'orders';
  $('ordersViewBtn').classList.toggle('active', isOrders);
  $('tradingViewBtn').classList.toggle('active', !isOrders);

  $('ordersTable').style.display = isOrders ? '' : 'none';
  $('tradingTable').style.display = isOrders ? 'none' : '';
  $('cardList').style.display = isOrders ? '' : 'none';
  $('tradeCardList').style.display = isOrders ? 'none' : '';
  $('kpiGrid').style.display = isOrders ? '' : 'none';
  $('tradeKpiGrid').style.display = isOrders ? 'none' : '';
  $('paginationBar').style.display = isOrders ? '' : 'none';
  $('tradePaginationBar').style.display = isOrders ? 'none' : '';

  $('newOrderBtn').style.display = (isOrders && ROLE === 'staff') ? '' : 'none';
  $('newTradeBtn').style.display = (!isOrders && (ROLE === 'staff' || ROLE === 'seller')) ? '' : 'none';
  $('receivePaymentBtn').style.display = isOrders ? ((ROLE === 'staff' || ROLE === 'seller') ? '' : 'none') : 'none';

  document.querySelector('.sub').textContent = isOrders ? 'Orders Delivered' : 'Trading Ledger';

  if (!isOrders && !TRADING.length) {
    loadTrading();
  }
}

// ==================== INIT ====================
let tradeSearchDebounceTimer = null;
$('search').addEventListener('input', () => {
  clearTimeout(tradeSearchDebounceTimer);
  tradeSearchDebounceTimer = setTimeout(() => {
    if ($('tradingViewBtn').classList.contains('active')) {
      tradeCurrentPage = 1;
      renderTradingResults(applyTradingFilter());
    }
  }, 150);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('tradePanel').classList.contains('open')) {
    requestCloseTradePanel();
  }
});
