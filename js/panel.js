// ============================================================
// panel.js — the add/edit side panel: live preview formulas,
// installments, open/close/dirty handling, field validation,
// save, and hold-to-delete (+ undo)
// ============================================================

  // ============ UNDO DELETE (60-second window) ============
  let undoTimer = null;
  let undoCountdownTimer = null;

  function showUndoToast(token) {
    if (!token) { showToast('Order deleted'); return; }

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
    }, 60000);

    $('undoBtn').onclick = async () => {
      clearTimeout(undoTimer);
      clearInterval(undoCountdownTimer);
      toast.classList.remove('show');
      try {
        const data = await jsonp({ pass: PASS, action: 'undo', token: token });
        if (data.ok) {
          showToast('Order restored');
          await refreshOrders();
        } else {
          showToast(data.error || 'Could not undo — window may have expired', 'bad');
        }
      } catch (err) {
        showToast(err.userMessage || 'Network error — could not undo', 'bad');
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
    const subTotal = goldAmount + diamAmount + lCharges + laborAmount;
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
    const fmtPay = ROLE === 'seller' ? fmtUSD : fmtMoney;
    $('prev_amountPaid').textContent = sale.amountPaid > 0 ? fmtPay(sale.amountPaid) : '—';
    $('prev_balanceDue').textContent = sale.salePrice === null ? '—' : fmtPay(sale.balanceDue);
    $('prev_paymentStatus').textContent = sale.status || '—';

    // Memo grouping: show the other items sharing this memo number, and
    // switch the preview/labels over to memo-wide totals once there's more
    // than one item involved.
    const siblings = getMemoSiblings(fields.memoNo, editingRow);
    const summaryEl = $('memoSummary');
    const instLabel = $('instScopeLabel');
    if (siblings.length) {
      summaryEl.style.display = '';
      const names = siblings.map(r => r['Style No.'] || 'item').join(', ');
      summaryEl.textContent = `Also in this memo: ${names} — ${siblings.length + 1} item(s) total.`;
      instLabel.textContent = '(applies to the whole memo)';
      $('row_memoTotal').style.display = '';
      $('prev_memoTotal').textContent = (ROLE === 'seller' ? fmtUSD : fmtMoney)(sale.memoTotal);
    } else {
      summaryEl.style.display = 'none';
      instLabel.textContent = '';
      $('row_memoTotal').style.display = 'none';
    }
  }

  // Finds other orders sharing the same Memo No. (case/whitespace-insensitive),
  // excluding the row currently open in the panel.
  function getMemoSiblings(memoNo, excludeRow) {
    const key = String(memoNo || '').trim().toLowerCase();
    if (!key) return [];
    return ORDERS.filter(r => r._row !== excludeRow && String(getField(r, 'Memo No.') ?? '').trim().toLowerCase() === key);
  }

  // Mirrors the backend's Amount Paid / Balance Due / Payment Status logic,
  // purely for the live preview — the sheet is still the source of truth
  // once saved. Amount Paid is always the sum of the installment list. When
  // this item shares a Memo No. with others, the balance/status are judged
  // against the combined memo total rather than just this item's price.
  function computeSale(fields) {
    const paid = currentInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const priceStr = String(fields.salePrice ?? '').trim();
    const siblings = getMemoSiblings(fields.memoNo, editingRow);
    const siblingsTotal = siblings.reduce((s, r) => s + (parseFloat(r['Sale Price']) || 0), 0);

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
      const fmtInst = ROLE === 'seller' ? fmtUSD : fmtMoney;
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

  // Warns before discarding a form the person has actually started typing
  // into, so an accidental tap on the backdrop or X doesn't silently lose
  // their work. Only wired to the user-facing close controls — internal
  // calls to closePanelFn() after a successful save/delete skip this.
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

  function openEdit(rowNum) {
    const order = ORDERS.find(r => r._row === rowNum);
    if (!order) return;
    editingRow = rowNum;
    const isStaff = ROLE === 'staff';
    const isSeller = ROLE === 'seller';
    const canEditSale = isStaff || isSeller;
    $('panelTitle').textContent = `${canEditSale ? 'Edit' : 'View'} — ${order['Style No.'] ?? ''}`;
    $('f_customer').value = order['CUSTOMER '] ?? order['CUSTOMER'] ?? '';
    $('f_style').value = order['Style No.'] ?? '';
    $('f_date').value = order['Date'] ? String(order['Date']).split('T')[0] : '';
    $('f_grossWt').value = order['Gross Wt'] ?? '';
    $('f_netWt').value = order['Net Wt'] ?? '';
    $('f_diaQty').value = order['Dia Qty'] ?? '';
    $('f_inCt').value = order['IN CT'] ?? '';
    $('f_colourStone').value = order['COLOUR STONE'] ?? '';
    $('f_multiplier').value = order['Multiplier'] ?? '0.595';
    $('f_diamAmount').value = order['Diam Amount'] ?? '';
    $('f_lCharges').value = order['L CHARGES'] ?? '';
    $('f_soldTo').value = order['Sold To'] ?? '';
    $('f_salePrice').value = order['Sale Price'] ?? '';
    $('f_dateSold').value = order['Date Sold'] ? String(order['Date Sold']).split('T')[0] : '';
    $('f_memoNo').value = getField(order, 'Memo No.') ?? '';

    // Load installments from the structured Payment Log JSON. If the sheet
    // has an older freeform note there instead (or nothing), fall back to
    // seeding one installment from the existing Amount Paid total, so a
    // previously-recorded payment isn't lost the first time this order is
    // reopened under the new installment tracking.
    let loadedInstallments = [];
    const rawLog = order['Payment Log'];
    if (rawLog) {
      try {
        const parsed = JSON.parse(rawLog);
        if (Array.isArray(parsed)) {
          loadedInstallments = parsed
            .filter(x => x && !isNaN(parseFloat(x.amount)))
            .map(x => ({ date: x.date || '', amount: parseFloat(x.amount) }));
        }
      } catch (e) { /* legacy freeform note — ignored, handled by the fallback below */ }
    }
    if (!loadedInstallments.length) {
      const existingPaid = parseFloat(order['Amount Paid']);
      if (existingPaid > 0) {
        loadedInstallments = [{ date: order['Date Sold'] ? String(order['Date Sold']).split('T')[0] : '', amount: existingPaid }];
      }
    }
    currentInstallments = loadedInstallments;
    $('f_instAmount').value = '';
    $('f_instDate').value = '';
    $('err_f_installment').textContent = '';
    renderInstallments();

    // Manufacturing details: only the manufacturer (staff) can edit these.
    const manufacturingIds = ['f_customer','f_style','f_date','f_grossWt','f_netWt','f_diaQty','f_inCt','f_colourStone','f_multiplier','f_diamAmount','f_lCharges'];
    manufacturingIds.forEach(id => { $(id).readOnly = !isStaff; });
    // Sale & payment details: the manufacturer AND the seller can edit these.
    const saleIds = ['f_memoNo','f_soldTo','f_salePrice','f_dateSold','f_instAmount','f_instDate'];
    saleIds.forEach(id => { $(id).readOnly = !canEditSale; });
    $('addInstallmentBtn').style.display = canEditSale ? '' : 'none';
    $('deleteBtn').style.display = isStaff ? 'inline-block' : 'none';
    $('deleteText').textContent = 'Delete';
    $('deleteBtn').classList.remove('holding');
    $('deleteProgress').style.width = '0%';
    // Currency labels: seller works in USD, staff in INR
    $('lbl_salePrice').textContent = isSeller ? 'Sale Price ($)' : 'Sale Price (₹)';
    $('f_instAmount').placeholder = isSeller ? 'Amount $' : 'Amount ₹';
    updatePreview();
    openPanel();
  }

  // Opens the normal edit panel for an order, then jumps straight to the
  // Sale & Payment section and focuses the amount box — the entry point
  // used by the quick-pay row icon and the "Receive Payment" search modal.
  // Deliberately reuses openEdit()/renderInstallments()/validateFields()
  // rather than a separate payment path, so memo syncing, role checks, and
  // save/undo behavior stay exactly as they already are for every order.
  function openEditForPayment(rowNum) {
    openEdit(rowNum);
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
    $('lbl_salePrice').textContent = ROLE === 'seller' ? 'Sale Price ($)' : 'Sale Price (₹)';
    $('f_instAmount').placeholder = ROLE === 'seller' ? 'Amount $' : 'Amount ₹';
    updatePreview();
    openPanel();
  });

  ['f_netWt','f_multiplier','f_diamAmount','f_lCharges','f_salePrice','f_memoNo'].forEach(id => {
    $(id).addEventListener('input', updatePreview);
  });
  // Auto-fill buyer + existing payment history when memo number matches
  // an existing order. Without this, a brand-new item linked to an
  // existing memo would start "blank" and — since the backend treats the
  // group's payment log as shared — could look like the memo has never
  // been paid even though sibling items already have recorded payments.
  $('f_memoNo').addEventListener('input', () => {
    const memoVal = $('f_memoNo').value.trim();
    if (!memoVal) return;
    const siblings = getMemoSiblings(memoVal, editingRow);
    if (!siblings.length) return;

    if (!$('f_soldTo').value.trim() && siblings[0]['Sold To']) {
      $('f_soldTo').value = siblings[0]['Sold To'];
      formDirty = true;
    }

    if (!currentInstallments.length) {
      const withLog = siblings.find(r => r['Payment Log']);
      if (withLog) {
        try {
          const parsed = JSON.parse(withLog['Payment Log']);
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

  // Live-clear a field's error as soon as the person edits it, rather than
  // making them hit Save again just to see if it's fixed.
  ['f_customer','f_style','f_grossWt','f_netWt','f_diaQty','f_inCt','f_colourStone','f_multiplier','f_diamAmount','f_lCharges','f_salePrice']
    .forEach(id => $(id).addEventListener('input', () => setFieldError(id, '')));

  function validateFields(fields) {
    clearAllFieldErrors();
    let valid = true;
    const fail = (id, msg) => { setFieldError(id, msg); valid = false; };

    if (!fields.customer) fail('f_customer', 'Customer is required.');
    if (!fields.style) fail('f_style', 'Style No. is required.');

    // Net Wt is required and must be a real positive number — everything
    // downstream (gold amount, sub total, $) is derived from it.
    if (!String(fields.netWt).trim()) {
      fail('f_netWt', 'Net Wt is required.');
    } else if (isNaN(parseFloat(fields.netWt)) || parseFloat(fields.netWt) <= 0) {
      fail('f_netWt', 'Net Wt must be a positive number.');
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

    // Sale & payment fields are optional (a piece may not be sold yet), but
    // if provided, they need to hold together.
    const priceStr = String(fields.salePrice).trim();
    if (priceStr !== '') {
      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0) fail('f_salePrice', 'Sale Price must be a positive number.');
    }
    const totalPaid = currentInstallments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const siblings = getMemoSiblings(fields.memoNo, editingRow);
    const memoTotal = (priceStr === '' ? 0 : parseFloat(priceStr) || 0) + siblings.reduce((s, r) => s + (parseFloat(r['Sale Price']) || 0), 0);
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
    const payload = {
      pass: PASS,
      action: editingRow ? 'edit' : 'add',
      row: editingRow,
      fields: {
        ...fields,
        pgWt: computed.pgWt,
        goldAmount: computed.goldAmount,
        laborAmount: computed.laborAmount,
        subTotal: computed.subTotal,
        usd: computed.usd
      }
    };

    $('saveMsg').textContent = 'Saving…';
    $('saveMsg').className = '';
    $('saveBtn').textContent = 'Saving…';
    $('saveBtn').disabled = true;

    try {
      const data = await jsonp(payload);
      $('saveBtn').textContent = 'Save';
      $('saveBtn').disabled = false;
      if (!data.ok) {
        $('saveMsg').textContent = data.error || 'Could not save.';
        $('saveMsg').className = 'bad';
        return;
      }
      $('saveMsg').textContent = 'Saved successfully.';
      $('saveMsg').className = 'good';
      if (payload.action === 'add') playScreenFx('add');
      await refreshOrders();
      setTimeout(closePanelFn, 600);
    } catch (err) {
      $('saveBtn').textContent = 'Save';
      $('saveBtn').disabled = false;
      $('saveMsg').textContent = err.userMessage || 'Network error — could not save.';
      $('saveMsg').className = 'bad';
    }
  });

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
    const duration = 300; // ms — same total hold time as before
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
      const data = await jsonp({ pass: PASS, action: 'delete', row: editingRow });
      if (data.ok) {
        playScreenFx('delete');
        showUndoToast(data.undoToken);
        await refreshOrders();
        closePanelFn();
      } else {
        $('saveMsg').textContent = data.error || 'Could not delete.';
        $('saveMsg').className = 'bad';
        $('deleteText').textContent = 'Delete';
        $('deleteBtn').classList.remove('holding');
      }
    } catch (err) {
      $('saveMsg').textContent = err.userMessage || 'Network error — could not delete.';
      $('saveMsg').className = 'bad';
      $('deleteText').textContent = 'Delete';
      $('deleteBtn').classList.remove('holding');
    }
  }

