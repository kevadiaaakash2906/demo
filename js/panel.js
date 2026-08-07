// ============================================================
// panel.js — Orders add/edit panel with configurable SHEET_KEYS
// ============================================================

const K = window.ORDERS_KEYS;

function getFirebaseAPI() {
  return Promise.resolve({
    addOrder: window.addOrder,
    updateOrder: window.updateOrder,
    deleteOrder: window.deleteOrder,
    syncMemoPayments: window.syncMemoPayments,
    restoreOrder: window.restoreOrder
  });
}

// ============ UNDO DELETE (60-second window) ============
let undoTimer = null;
let undoCountdownTimer = null;
let lastDeletedOrder = null;

function showUndoToast(docId) {
  if (!docId) { showToast('Order deleted'); return; }
  clearTimeout(undoTimer);
  clearInterval(undoCountdownTimer);
  const toast = $('undoToast');
  const countEl = $('undoCount');
  let secondsLeft = 60;
  countEl.textContent = secondsLeft;
  toast.classList.add('show');
  undoCountdownTimer = setInterval(() => {
    secondsLeft -= 1;
    countEl.textContent = Math.max(secondsLeft, 0);
    if (secondsLeft <= 0) clearInterval(undoCountdownTimer);
  }, 1000);
  undoTimer = setTimeout(() => {
    toast.classList.remove('show');
    clearInterval(undoCountdownTimer);
    lastDeletedOrder = null;
  }, 60000);

  $('undoBtn').onclick = async () => {
    clearTimeout(undoTimer);
    clearInterval(undoCountdownTimer);
    toast.classList.remove('show');
    if (!lastDeletedOrder) return;
    try {
      const { restoreOrder } = await getFirebaseAPI();
      await restoreOrder(lastDeletedOrder.id, lastDeletedOrder.data);
      lastDeletedOrder = null;
      showToast('Order restored');
      await loadOrders();
    } catch (err) {
      showToast(err.message || 'Could not undo — window may have expired', 'bad');
    }
  };
}

// ============ FORMULAS ============
function computeOrder(fields) {
  const netWt = parseFloat(fields.netWt) || 0;
  const multiplier = parseFloat(fields.multiplier) || 0.595;
  const lCharges = parseFloat(fields.lCharges) || 0;
  const diamAmount = parseFloat(fields.diamAmount) || 0;

  const pgWt = netWt * multiplier;
  const goldAmount = pgWt * GOLD_RATE_PER_10G;
  const laborAmount = netWt * lCharges;
  const subTotal = goldAmount + diamAmount + laborAmount;
  const usd = subTotal / USD_RATE;

  return { pgWt, goldAmount, laborAmount, subTotal, usd };
}

function updatePreview() {
  const fields = collectFields();
  const comp = computeOrder(fields);
  $('prev_pgWt').textContent = fmtNum(comp.pgWt, 3) + ' g';
  $('prev_goldAmt').textContent = fmtMoney(comp.goldAmount);
  $('prev_laborAmt').textContent = fmtMoney(comp.laborAmount);
  $('prev_subTotal').textContent = fmtMoney(comp.subTotal);
  $('prev_usd').textContent = '$' + fmtNum(comp.usd, 2);

  const sale = computeSale(fields);
  const fmtPay = fmtUSD;
  $('prev_amountPaid').textContent = sale.amountPaid > 0 ? fmtPay(sale.amountPaid) : '—';
  $('prev_balanceDue').textContent = sale.salePrice === null ? '—' : fmtPay(sale.balanceDue);
  $('prev_paymentStatus').textContent = sale.status || '—';

  const siblings = getMemoSiblings(fields.memoNo, editingRow);
  const summaryEl = $('memoSummary');
  const instLabel = $('instScopeLabel');
  if (siblings.length) {
    summaryEl.style.display = '';
    const names = siblings.map(r => r[K.styleNo] || 'item').join(', ');
    summaryEl.textContent = `Also in this memo: ${names} — ${siblings.length + 1} item(s) total.`;
    instLabel.textContent = '(applies to the whole memo)';
    $('row_memoTotal').style.display = '';
    $('prev_memoTotal').textContent = fmtUSD(sale.memoTotal);
  } else {
    summaryEl.style.display = 'none';
    instLabel.textContent = '';
    $('row_memoTotal').style.display = 'none';
  }
}

function getMemoSiblings(memoNo, excludeRow) {
  const key = String(memoNo || '').trim().toLowerCase();
  if (!key) return [];
  return ORDERS.filter(r => r._row !== excludeRow && String(getField(r, K.memoNo) ?? '').trim().toLowerCase() === key);
}

function computeSale(fields) {
  const paid = currentInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const priceStr = String(fields.salePrice ?? '').trim();
  const siblings = getMemoSiblings(fields.memoNo, editingRow);
  const siblingsTotal = siblings.reduce((s, r) => s + (parseFloat(r[K.salePrice]) || 0), 0);

  if (priceStr === '' && !siblings.length) return { salePrice: null, amountPaid: paid, balanceDue: 0, status: '', memoTotal: 0 };
  const itemPrice = parseFloat(priceStr) || 0;
  const memoTotal = itemPrice + siblingsTotal;
  const balanceDue = memoTotal - paid;
  const status = paid <= 0 ? 'Unpaid' : (paid >= memoTotal ? 'Paid' : 'Partial');
  return { salePrice: priceStr === '' ? null : itemPrice, amountPaid: paid, balanceDue, status, memoTotal };
}

// ============ INSTALLMENTS ============
function renderInstallments() {
  const list = $('installmentsList');
  if (!currentInstallments.length) {
    list.innerHTML = `<div class="installments-empty">No payments recorded yet.</div>`;
  } else {
    const fmtInst = fmtUSD;
    list.innerHTML = currentInstallments.map((inst, i) => `
      <div class="installment-item">
        <span class="inst-date">${inst.date ? fmtDate(inst.date) : '—'}</span>
        <span class="inst-amount">${fmtInst(inst.amount)}</span>
        <button type="button" class="inst-remove" data-idx="${i}" title="Remove this payment">&times;</button>
      </div>
    `).join('');
    list.querySelectorAll('.inst-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        currentInstallments.splice(parseInt(btn.dataset.idx, 10), 1);
        formDirty = true;
        renderInstallments();
      });
    });
  }
  updatePreview();
}

$('addInstallmentBtn').addEventListener('click', () => {
  const amtStr = $('f_instAmount').value;
  const amt = parseFloat(amtStr);
  if (!amtStr || isNaN(amt) || amt <= 0) {
    $('err_f_installment').textContent = 'Enter a valid amount to add a payment.';
    return;
  }
  $('err_f_installment').textContent = '';
  const date = $('f_instDate').value || new Date().toISOString().split('T')[0];
  currentInstallments.push({ date, amount: amt });
  currentInstallments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  $('f_instAmount').value = '';
  $('f_instDate').value = '';
  formDirty = true;
  renderInstallments();
});

// ============ PANEL ============
function openPanel() {
  $('overlay').classList.add('open');
  $('panel').classList.add('open');
  $('saveMsg').textContent = '';
  $('saveMsg').className = '';
  clearAllFieldErrors();
  formDirty = false;
  updatePreview();
}
function closePanelFn() {
  $('overlay').classList.remove('open');
  $('panel').classList.remove('open');
  document.querySelectorAll('tbody tr').forEach(r => r.classList.remove('selected'));
}

let formDirty = false;
document.querySelectorAll('#panel .field input, #panel .field textarea').forEach(inp => {
  inp.addEventListener('input', () => { formDirty = true; });
});
function requestClosePanel() {
  if (formDirty && !document.body.classList.contains('view-only')) {
    if (!confirm('Discard unsaved changes to this order?')) return;
  }
  closePanelFn();
}
$('closePanel').addEventListener('click', requestClosePanel);
$('overlay').addEventListener('click', requestClosePanel);

function openEdit(rowId) {
  const order = ORDERS.find(r => r._row === rowId);
  if (!order) return;
  editingRow = rowId;
  const isStaff = ROLE === 'staff';
  const isSeller = ROLE === 'seller';
  const canEditSale = isStaff || isSeller;
  $('panelTitle').textContent = `${canEditSale ? 'Edit' : 'View'} — ${order[K.styleNo] ?? ''}`;
  $('f_customer').value = order[K.customer] ?? order[K.customerAlt] ?? '';
  $('f_style').value = order[K.styleNo] ?? '';
  $('f_date').value = order[K.date] ? String(order[K.date]).split('T')[0] : '';
  $('f_grossWt').value = order[K.grossWt] ?? '';
  $('f_netWt').value = order[K.netWt] ?? '';
  $('f_diaQty').value = order[K.diaQty] ?? '';
  $('f_inCt').value = order[K.inCt] ?? '';
  $('f_colourStone').value = order[K.colourStone] ?? '';
  $('f_multiplier').value = order[K.multiplier] ?? '0.595';
  $('f_diamAmount').value = order[K.diamAmount] ?? '';
  $('f_lCharges').value = order[K.lCharges] ?? '';
  $('f_soldTo').value = order[K.soldTo] ?? '';
  $('f_salePrice').value = order[K.salePrice] ?? '';
  $('f_dateSold').value = order[K.dateSold] ? String(order[K.dateSold]).split('T')[0] : '';
  $('f_memoNo').value = getField(order, K.memoNo) ?? '';

  let loadedInstallments = [];
  const rawLog = order[K.paymentLog];
  if (rawLog) {
    try {
      const parsed = JSON.parse(rawLog);
      if (Array.isArray(parsed)) {
        loadedInstallments = parsed
          .filter(x => x && !isNaN(parseFloat(x.amount)))
          .map(x => ({ date: x.date || '', amount: parseFloat(x.amount) }));
      }
    } catch (e) { /* legacy freeform note */ }
  }
  if (!loadedInstallments.length) {
    const existingPaid = parseFloat(order[K.amountPaid]);
    if (existingPaid > 0) {
      loadedInstallments = [{ date: order[K.dateSold] ? String(order[K.dateSold]).split('T')[0] : '', amount: existingPaid }];
    }
  }
  currentInstallments = loadedInstallments;
  $('f_instAmount').value = '';
  $('f_instDate').value = '';
  $('err_f_installment').textContent = '';
  renderInstallments();

  const manufacturingIds = ['f_customer','f_style','f_date','f_grossWt','f_netWt','f_diaQty','f_inCt','f_colourStone','f_multiplier','f_diamAmount','f_lCharges'];
  manufacturingIds.forEach(id => { $(id).readOnly = !isStaff; });
  const saleIds = ['f_memoNo','f_soldTo','f_salePrice','f_dateSold','f_instAmount','f_instDate'];
  saleIds.forEach(id => { $(id).readOnly = !canEditSale; });
  $('addInstallmentBtn').style.display = canEditSale ? '' : 'none';
  $('deleteBtn').style.display = isStaff ? 'inline-block' : 'none';
  $('deleteText').textContent = 'Delete';
  $('deleteBtn').classList.remove('holding');
  $('deleteProgress').style.width = '0%';
  $('lbl_salePrice').textContent = 'Sale Price ($)';
  $('f_instAmount').placeholder = 'Amount $';
  updatePreview();
  openPanel();
}

function openEditForPayment(rowId) {
  openEdit(rowId);
  requestAnimationFrame(() => {
    const divider = document.querySelector('#panel .section-divider');
    if (divider) divider.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f_instAmount').focus();
  });
}

$('newOrderBtn').addEventListener('click', () => {
  editingRow = null;
  $('panelTitle').textContent = 'New order';
  ['f_customer','f_style','f_date','f_grossWt','f_netWt','f_diaQty','f_inCt','f_colourStone','f_multiplier','f_diamAmount','f_lCharges',
   'f_memoNo','f_soldTo','f_salePrice','f_dateSold','f_instAmount','f_instDate']
    .forEach(id => $(id).value = '');
  $('f_multiplier').value = '0.595';
  currentInstallments = [];
  $('err_f_installment').textContent = '';
  renderInstallments();
  $('deleteBtn').style.display = 'none';
  $('lbl_salePrice').textContent = 'Sale Price ($)';
  $('f_instAmount').placeholder = 'Amount $';
  updatePreview();
  openPanel();
});

['f_netWt','f_multiplier','f_diamAmount','f_lCharges','f_salePrice','f_memoNo'].forEach(id => {
  $(id).addEventListener('input', updatePreview);
});

$('f_memoNo').addEventListener('input', () => {
  const memoVal = $('f_memoNo').value.trim();
  if (!memoVal) return;
  const siblings = getMemoSiblings(memoVal, editingRow);
  if (!siblings.length) return;

  if (!$('f_soldTo').value.trim() && siblings[0][K.soldTo]) {
    $('f_soldTo').value = siblings[0][K.soldTo];
    formDirty = true;
  }

  if (!currentInstallments.length) {
    const withLog = siblings.find(r => r[K.paymentLog]);
    if (withLog) {
      try {
        const parsed = JSON.parse(withLog[K.paymentLog]);
        if (Array.isArray(parsed)) {
          currentInstallments = parsed
            .filter(x => x && !isNaN(parseFloat(x.amount)))
            .map(x => ({ date: x.date || '', amount: parseFloat(x.amount) }));
          renderInstallments();
          formDirty = true;
        }
      } catch (e) { /* ignore unparsable legacy log */ }
    }
  }
});

function collectFields() {
  return {
    customer: $('f_customer').value.trim(),
    style: $('f_style').value.trim(),
    date: $('f_date').value,
    grossWt: $('f_grossWt').value,
    netWt: $('f_netWt').value,
    diaQty: $('f_diaQty').value,
    inCt: $('f_inCt').value,
    colourStone: $('f_colourStone').value,
    multiplier: $('f_multiplier').value,
    diamAmount: $('f_diamAmount').value,
    lCharges: $('f_lCharges').value,
    soldTo: $('f_soldTo').value.trim(),
    salePrice: $('f_salePrice').value,
    dateSold: $('f_dateSold').value,
    paymentLog: JSON.stringify(currentInstallments),
    memoNo: $('f_memoNo').value.trim(),
  };
}

function setFieldError(id, msg) {
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

function clearAllFieldErrors() {
  ['f_customer','f_style','f_grossWt','f_netWt','f_diaQty','f_inCt','f_colourStone','f_multiplier','f_diamAmount','f_lCharges','f_salePrice']
    .forEach(id => setFieldError(id, ''));
  $('err_f_installment').textContent = '';
}

['f_customer','f_style','f_grossWt','f_netWt','f_diaQty','f_inCt','f_colourStone','f_multiplier','f_diamAmount','f_lCharges','f_salePrice']
  .forEach(id => $(id).addEventListener('input', () => setFieldError(id, '')));

function validateFields(fields) {
  clearAllFieldErrors();
  let valid = true;
  const fail = (id, msg) => { setFieldError(id, msg); valid = false; };

  if (!fields.customer) fail('f_customer', 'Customer is required.');
  if (!fields.style) fail('f_style', 'Style No. is required.');

  if (String(fields.netWt).trim() !== '') {
    if (isNaN(parseFloat(fields.netWt)) || parseFloat(fields.netWt) < 0) {
      fail('f_netWt', 'Net Wt must be a positive number.');
    }
  }

  if (String(fields.grossWt).trim() !== '') {
    const gross = parseFloat(fields.grossWt);
    if (isNaN(gross) || gross < 0) {
      fail('f_grossWt', 'Gross Wt must be a positive number.');
    } else if (!isNaN(parseFloat(fields.netWt)) && gross < parseFloat(fields.netWt)) {
      fail('f_grossWt', 'Gross Wt can\'t be less than Net Wt.');
    }
  }

  [['f_diaQty', fields.diaQty, 'Dia Qty'], ['f_inCt', fields.inCt, 'IN CT'],
   ['f_colourStone', fields.colourStone, 'Colour Stone'], ['f_diamAmount', fields.diamAmount, 'Diamond Amount'],
   ['f_lCharges', fields.lCharges, 'L Charges']].forEach(([id, val, label]) => {
    if (String(val).trim() !== '' && (isNaN(parseFloat(val)) || parseFloat(val) < 0)) {
      fail(id, `${label} can't be negative.`);
    }
  });

  if (String(fields.multiplier).trim() !== '') {
    const m = parseFloat(fields.multiplier);
    if (isNaN(m) || m <= 0) fail('f_multiplier', 'Multiplier must be a positive number.');
  }

  const priceStr = String(fields.salePrice).trim();
  if (priceStr !== '') {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) fail('f_salePrice', 'Sale Price must be a positive number.');
  }
  const totalPaid = currentInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const siblings = getMemoSiblings(fields.memoNo, editingRow);
  const memoTotal = (priceStr === '' ? 0 : parseFloat(priceStr) || 0) + siblings.reduce((s, r) => s + (parseFloat(r[K.salePrice]) || 0), 0);
  if (totalPaid > 0 && priceStr === '' && !siblings.length) {
    fail('f_salePrice', 'Enter a Sale Price before recording payments.');
  } else if ((priceStr !== '' || siblings.length) && totalPaid > memoTotal) {
    $('err_f_installment').textContent = siblings.length
      ? "Total payments can't exceed the memo's combined total."
      : "Total payments can't exceed the Sale Price.";
    valid = false;
  }

  return valid;
}

// ============ SAVE ============
$('saveBtn').addEventListener('click', async () => {
  const fields = collectFields();
  if (!validateFields(fields)) {
    $('saveMsg').textContent = 'Please fix the highlighted fields before saving.';
    $('saveMsg').className = 'bad';
    return;
  }

  const computed = computeOrder(fields);
  const sale = computeSale(fields);

  const payload = {
    [K.customer]: fields.customer,
    [K.customerAlt]: fields.customer,
    [K.styleNo]: fields.style,
    [K.date]: fields.date,
    [K.grossWt]: fields.grossWt,
    [K.netWt]: fields.netWt,
    [K.diaQty]: fields.diaQty,
    [K.inCt]: fields.inCt,
    [K.colourStone]: fields.colourStone,
    [K.multiplier]: fields.multiplier,
    [K.diamAmount]: fields.diamAmount,
    [K.lCharges]: fields.lCharges,
    [K.soldTo]: fields.soldTo,
    [K.salePrice]: fields.salePrice,
    [K.dateSold]: fields.dateSold,
    [K.paymentLog]: fields.paymentLog,
    [K.memoNo]: fields.memoNo,
    [K.pgWt]: computed.pgWt,
    [K.goldAmount]: computed.goldAmount,
    [K.laborAmount]: computed.laborAmount,
    [K.subTotal]: computed.subTotal,
    [K.usd]: computed.usd,
    [K.amountPaid]: sale.amountPaid,
    [K.balanceDue]: sale.balanceDue,
    [K.paymentStatus]: sale.status
  };

  $('saveMsg').textContent = 'Saving…';
  $('saveMsg').className = '';
  $('saveBtn').textContent = 'Saving…';
  $('saveBtn').disabled = true;

  try {
    const { addOrder, updateOrder, syncMemoPayments } = await getFirebaseAPI();
    let result;
    let docId;

    if (editingRow) {
      result = await updateOrder(editingRow, payload);
      docId = editingRow;
    } else {
      result = await addOrder(payload);
      docId = result.id;
    }

    $('saveBtn').textContent = 'Save';
    $('saveBtn').disabled = false;

    if (!result.ok) {
      $('saveMsg').textContent = 'Could not save.';
      $('saveMsg').className = 'bad';
      return;
    }

    const savedOrder = buildLocalOrder(fields, computed, docId, result.srNo);
    if (editingRow) {
      const idx = ORDERS.findIndex(r => r._row === editingRow);
      if (idx !== -1) ORDERS[idx] = savedOrder;
    } else {
      ORDERS.push(savedOrder);
    }

    if (fields.memoNo) {
      syncMemoPayments(fields.memoNo, fields.paymentLog, sale.amountPaid, sale.balanceDue, sale.status)
        .catch(() => {});
    }

    renderKPIs();
    renderHeaderStats();
    populateCustomerFilter();
    renderResults(applyFilter());

    $('saveMsg').textContent = 'Saved successfully.';
    $('saveMsg').className = 'good';
    if (!editingRow) playScreenFx('add');

    setTimeout(closePanelFn, 300);
    setTimeout(() => loadOrders().catch(() => {}), 2000);

  } catch (err) {
    $('saveBtn').textContent = 'Save';
    $('saveBtn').disabled = false;
    $('saveMsg').textContent = err.message || 'Network error — could not save.';
    $('saveMsg').className = 'bad';
  }
});

function buildLocalOrder(fields, computed, docId, srNo) {
  const isEdit = !!editingRow;
  const existing = isEdit ? ORDERS.find(r => r._row === editingRow) : null;
  const finalSr = srNo || (existing ? existing[K.srNo] : (Math.max(0, ...ORDERS.map(r => parseInt(r[K.srNo]) || 0)) + 1));

  const sale = computeSale(fields);

  return {
    _row: docId,
    _id: docId,
    [K.srNo]: finalSr,
    [K.customer]: fields.customer,
    [K.customerAlt]: fields.customer,
    [K.styleNo]: fields.style,
    [K.date]: fields.date,
    [K.grossWt]: fields.grossWt,
    [K.netWt]: fields.netWt,
    [K.diaQty]: fields.diaQty,
    [K.inCt]: fields.inCt,
    [K.colourStone]: fields.colourStone,
    [K.multiplier]: fields.multiplier,
    [K.pgWt]: computed.pgWt,
    [K.goldAmount]: computed.goldAmount,
    [K.diamAmount]: fields.diamAmount,
    [K.lCharges]: fields.lCharges,
    [K.laborAmount]: computed.laborAmount,
    [K.subTotal]: computed.subTotal,
    [K.usd]: computed.usd,
    [K.soldTo]: fields.soldTo,
    [K.salePrice]: fields.salePrice,
    [K.dateSold]: fields.dateSold,
    [K.amountPaid]: sale.amountPaid,
    [K.balanceDue]: sale.balanceDue,
    [K.paymentStatus]: sale.status,
    [K.paymentLog]: fields.paymentLog,
    [K.memoNo]: fields.memoNo
  };
}

// ============ DELETE (Hold 3s) ============
$('deleteBtn').addEventListener('mousedown', startDeleteHold);
$('deleteBtn').addEventListener('touchstart', startDeleteHold);
$('deleteBtn').addEventListener('mouseup', cancelDeleteHold);
$('deleteBtn').addEventListener('mouseleave', cancelDeleteHold);
$('deleteBtn').addEventListener('touchend', cancelDeleteHold);

function startDeleteHold(e) {
  e.preventDefault();
  if (editingRow === null) return;
  $('deleteBtn').classList.add('holding');
  $('deleteProgress').style.width = '0%';
  const duration = 3000;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(((now - start) / duration) * 100, 100);
    $('deleteProgress').style.width = progress + '%';
    if (progress >= 100) {
      deleteHoldRAF = null;
      executeDelete();
    } else {
      deleteHoldRAF = requestAnimationFrame(tick);
    }
  }
  deleteHoldRAF = requestAnimationFrame(tick);
}

function cancelDeleteHold() {
  if (deleteHoldRAF) {
    cancelAnimationFrame(deleteHoldRAF);
    deleteHoldRAF = null;
  }
  $('deleteBtn').classList.remove('holding');
  $('deleteProgress').style.width = '0%';
}

async function executeDelete() {
  $('deleteText').textContent = 'Deleting…';
  try {
    const { deleteOrder } = await getFirebaseAPI();
    const order = ORDERS.find(r => r._row === editingRow);
    if (!order) throw new Error('Order not found');

    lastDeletedOrder = { id: editingRow, data: { ...order } };

    await deleteOrder(editingRow, order[K.srNo]);
    playScreenFx('delete');
    showUndoToast(editingRow);

    ORDERS = ORDERS.filter(r => r._row !== editingRow);
    renderKPIs();
    renderHeaderStats();
    populateCustomerFilter();
    renderResults(applyFilter());

    closePanelFn();
  } catch (err) {
    $('saveMsg').textContent = err.message || 'Could not delete.';
    $('saveMsg').className = 'bad';
    $('deleteText').textContent = 'Delete';
    $('deleteBtn').classList.remove('holding');
  }
}
