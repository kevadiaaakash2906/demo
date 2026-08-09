/* ============================================
   VINÉRE — Order Panel (Create / Edit)
   ============================================ */

var editingId = null;
var currentInstallments = [];
var readOnly = false;

window.openOrderPanel = function(id) {
  editingId = id || null;
  currentInstallments = [];

  var panel = $('panel');
  var overlay = $('overlay');

  // Reset fields
  ['f_customer','f_style','f_date','f_grossWt','f_netWt','f_diaQty','f_inCt',
   'f_colourStone','f_multiplier','f_diamAmount','f_lCharges','f_memoNo',
   'f_soldTo','f_salePrice','f_dateSold'].forEach(function(fid) { $(fid).value = ''; });
  $('f_multiplier').value = '0.595';
  $('f_lCharges').value = '900';

  currentInstallments = [];
  renderInstallments();
  updatePreview();

  $('saveMsg').textContent = '';
  $('saveMsg').style.color = '';

  document.querySelectorAll('.field-error').forEach(function(el) { el.textContent = ''; });

  if (id) {
    var order = ORDERS.find(function(r) { return r._id === id; });
    if (!order) return;

    $('panelTitle').textContent = 'Edit Order #' + order[DK.sr];
    $('f_customer').value = order[DK.customer] || '';
    $('f_style').value = order[DK.style] || '';
    $('f_date').value = order[DK.date] || '';
    $('f_grossWt').value = order[DK.grossWt] || '';
    $('f_netWt').value = order[DK.netWt] || '';
    $('f_diaQty').value = order[DK.diaQty] || '';
    $('f_inCt').value = order[DK.inCt] || '';
    $('f_colourStone').value = order[DK.colourStone] || '';
    $('f_multiplier').value = order[DK.multiplier] || '0.595';
    $('f_diamAmount').value = order[DK.diamAmount] || '';
    $('f_lCharges').value = order[DK.lCharges] || '900';
    $('f_memoNo').value = order[DK.memoNo] || '';
    $('f_soldTo').value = order[DK.soldTo] || '';
    $('f_salePrice').value = order[DK.salePrice] || '';
    $('f_dateSold').value = order[DK.dateSold] || '';

    try { currentInstallments = JSON.parse(order[DK.paymentLog] || '[]'); } catch(e) { currentInstallments = []; }
    renderInstallments();

    $('deleteBtn').style.display = (ROLE === 'staff') ? 'inline-flex' : 'none';
    readOnly = ROLE === 'customer';
  } else {
    $('panelTitle').textContent = 'New Order';
    $('f_date').value = new Date().toISOString().split('T')[0];
    $('deleteBtn').style.display = 'none';
    readOnly = false;
  }

  setReadOnly(readOnly);
  updatePreview();

  overlay.style.display = 'block';
  panel.classList.add('open');
};

function setReadOnly(ro) {
  var inputs = panel.querySelectorAll('input, select');
  inputs.forEach(function(inp) { inp.disabled = ro; });
  $('saveBtn').style.display = ro ? 'none' : 'block';
  $('addInstallmentBtn').style.display = ro ? 'none' : 'block';
}

$('closePanel').addEventListener('click', closePanel);
$('overlay').addEventListener('click', closePanel);

function closePanel() {
  $('panel').classList.remove('open');
  $('overlay').style.display = 'none';
  editingId = null;
}

/* ============ LIVE PREVIEW ============ */
['f_netWt','f_multiplier','f_lCharges','f_diamAmount','f_salePrice'].forEach(function(id) {
  $(id).addEventListener('input', updatePreview);
});

function updatePreview() {
  var netWt = parseFloat($('f_netWt').value) || 0;
  var multiplier = parseFloat($('f_multiplier').value) || 0.595;
  var lCharges = parseFloat($('f_lCharges').value) || 900;
  var diamAmount = parseFloat($('f_diamAmount').value) || 0;
  var salePrice = parseFloat($('f_salePrice').value) || 0;

  var pgWt = netWt * multiplier;
  var goldAmt = pgWt * 16000;
  var isFlatLabor = $('f_flatLabor') && $('f_flatLabor').checked;
  var laborAmt = isFlatLabor ? lCharges : netWt * lCharges;
  var subTotal = goldAmt + diamAmount + laborAmt;
  var usd = subTotal / 94;

  $('prev_pgWt').textContent = pgWt ? pgWt.toFixed(3) + ' g' : '—';
  $('prev_goldAmt').textContent = goldAmt ? '₹' + Math.round(goldAmt).toLocaleString('en-IN') : '—';
  $('prev_laborAmt').textContent = laborAmt ? '₹' + Math.round(laborAmt).toLocaleString('en-IN') : '—';
  $('prev_subTotal').textContent = subTotal ? '₹' + Math.round(subTotal).toLocaleString('en-IN') : '—';
  $('prev_usd').textContent = usd ? '$' + usd.toFixed(2) : '—';

  var totalPaid = currentInstallments.reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  var balance = salePrice ? salePrice - totalPaid : 0;
  var status = 'Not Sold';
  if (salePrice) {
    if (totalPaid >= salePrice) status = 'Paid';
    else if (totalPaid > 0) status = 'Partial';
    else status = 'Unpaid';
  }

  $('prev_amountPaid').textContent = totalPaid ? '$' + fmtMoney(totalPaid) : '$0';
  $('prev_balanceDue').textContent = salePrice ? '$' + fmtMoney(balance) : '—';
  $('prev_paymentStatus').textContent = status;
}

/* ============ INSTALLMENTS ============ */
$('addInstallmentBtn').addEventListener('click', function() {
  var amt = parseFloat($('f_instAmount').value);
  var date = $('f_instDate').value;
  if (!amt || amt <= 0 || !date) {
    $('err_f_installment').textContent = 'Enter valid amount and date';
    return;
  }
  currentInstallments.push({ amount: amt, date: date });
  $('f_instAmount').value = '';
  $('f_instDate').value = '';
  $('err_f_installment').textContent = '';
  renderInstallments();
  updatePreview();
});

function renderInstallments() {
  var list = $('installmentsList');
  if (!currentInstallments.length) { list.innerHTML = ''; return; }
  list.innerHTML = currentInstallments.map(function(inst, i) {
    return '<div class="installment-item">' +
      '<span>$' + fmtMoney(inst.amount) + ' · ' + inst.date + '</span>' +
      '<button onclick="window.removeInst(' + i + ')">&times;</button>' +
      '</div>';
  }).join('');
}

window.removeInst = function(idx) {
  currentInstallments.splice(idx, 1);
  renderInstallments();
  updatePreview();
};

/* ============ SAVE ============ */
$('saveBtn').addEventListener('click', async function() {
  if (readOnly) return;

  var valid = true;
  document.querySelectorAll('.field-error').forEach(function(el) { el.textContent = ''; });

  if (!$('f_customer').value.trim()) { $('err_f_customer').textContent = 'Required'; valid = false; }
  if (!$('f_style').value.trim()) { $('err_f_style').textContent = 'Required'; valid = false; }
  if (!$('f_netWt').value.trim()) { $('err_f_netWt').textContent = 'Required'; valid = false; }

  var netWt = parseFloat($('f_netWt').value) || 0;
  var grossWt = parseFloat($('f_grossWt').value) || 0;
  if (grossWt && netWt > grossWt) { $('err_f_netWt').textContent = 'Net Wt cannot exceed Gross Wt'; valid = false; }

  var salePrice = parseFloat($('f_salePrice').value) || 0;
  var totalPaid = currentInstallments.reduce(function(s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  if (salePrice && totalPaid > salePrice) { $('err_f_installment').textContent = 'Payments exceed sale price'; valid = false; }

  if (!valid) {
    $('saveMsg').textContent = 'Please fix the highlighted fields.';
    $('saveMsg').style.color = '#f87171';
    showToast('Please fix the highlighted fields before saving.', 'warning');
    return;
  }

  $('saveMsg').textContent = '';

  var net = parseFloat($('f_netWt').value) || 0;
  var mult = parseFloat($('f_multiplier').value) || 0.595;
  var lCharge = parseFloat($('f_lCharges').value) || 900;
  var diam = parseFloat($('f_diamAmount').value) || 0;
  var pgWt = net * mult;
  var goldAmt = pgWt * 16000;
  var isFlatLaborSave = $('f_flatLabor') && $('f_flatLabor').checked;
  var laborAmt = isFlatLaborSave ? lCharge : net * lCharge;
  var subTotal = goldAmt + diam + laborAmt;
  var usd = subTotal / 94;

  var status = 'Not Sold';
  if (salePrice) {
    if (totalPaid >= salePrice) status = 'Paid';
    else if (totalPaid > 0) status = 'Partial';
    else status = 'Unpaid';
  }

  var data = {};
  data[DK.customer] = $('f_customer').value.trim().toUpperCase();
  data[DK.style] = $('f_style').value.trim().toUpperCase();
  data[DK.date] = $('f_date').value;
  data[DK.grossWt] = $('f_grossWt').value || '';
  data[DK.netWt] = $('f_netWt').value;
  data[DK.diaQty] = $('f_diaQty').value || '';
  data[DK.inCt] = $('f_inCt').value || '';
  data[DK.colourStone] = $('f_colourStone').value || '';
  data[DK.multiplier] = mult.toString();
  data[DK.pgWt] = pgWt.toFixed(3);
  data[DK.goldAmt] = Math.round(goldAmt).toString();
  data[DK.diamAmount] = diam ? diam.toString() : '';
  data[DK.lCharges] = lCharge.toString();
  data[DK.laborAmt] = Math.round(laborAmt).toString();
  data[DK.subTotal] = Math.round(subTotal).toString();
  data[DK.usd] = usd.toFixed(2);
  data[DK.memoNo] = $('f_memoNo').value.trim().toUpperCase();
  data[DK.soldTo] = $('f_soldTo').value.trim();
  data[DK.salePrice] = salePrice ? salePrice.toString() : '';
  data[DK.dateSold] = $('f_dateSold').value || '';
  data[DK.amountPaid] = totalPaid.toString();
  data[DK.balanceDue] = (salePrice - totalPaid).toString();
  data[DK.paymentStatus] = status;
  data[DK.paymentLog] = JSON.stringify(currentInstallments);

  try {
    if (editingId) {
      var existing = ORDERS.find(function(r) { return r._id === editingId; });
      data[DK.sr] = existing[DK.sr];
      await window.updateOrder(editingId, data);
      showToast('Order #' + data[DK.sr] + ' updated successfully', 'success');
    } else {
      var nextSr = ORDERS.length > 0 ? Math.max.apply(null, ORDERS.map(function(r) { return parseInt(r[DK.sr]) || 0; })) + 1 : 1;
      data[DK.sr] = nextSr.toString();
      await window.addOrder(data);
      showToast('Order #' + nextSr + ' created successfully', 'success');
    }
    closePanel();
    await doFetchOrders();
    renderAll();
  } catch (err) {
    console.error(err);
    $('saveMsg').textContent = 'Error saving. Try again.';
    showToast('Failed to save order. Please try again.', 'error');
  }
});

/* ============ DELETE ============ */
var deleteTimer = null;
var deleteProgress = 0;

function startDeleteTimer() {
  if (!editingId || ROLE !== 'staff') return;
  var btn = $('deleteBtn');
  btn.classList.add('deleting');
  deleteProgress = 0;

  deleteTimer = setInterval(function() {
    deleteProgress += 50;
    var pct = (deleteProgress / 3000) * 100;
    btn.style.setProperty('--delete-progress', pct + '%');

    if (deleteProgress >= 3000) {
      clearInterval(deleteTimer);
      deleteTimer = null;
      btn.classList.remove('deleting');
      doDeleteOrder();
    }
  }, 50);
}

function cancelDeleteTimer() {
  if (deleteTimer) {
    clearInterval(deleteTimer);
    deleteTimer = null;
  }
  var btn = $('deleteBtn');
  btn.classList.remove('deleting');
  btn.style.setProperty('--delete-progress', '0%');
}

async function doDeleteOrder() {
  if (!editingId) return;
  var order = ORDERS.find(function(r) { return r._id === editingId; });
  var srNo = order ? order[DK.sr] : '';

  try {
    await window.deleteOrder(editingId, srNo);
    showToast('Order deleted', 'success');
    closePanel();
    await doFetchOrders();
    renderAll();
  } catch (err) {
    console.error(err);
    showToast('Failed to delete order', 'error');
  }
}

$('deleteBtn').addEventListener('mousedown', startDeleteTimer);
$('deleteBtn').addEventListener('touchstart', startDeleteTimer);
$('deleteBtn').addEventListener('mouseup', cancelDeleteTimer);
$('deleteBtn').addEventListener('mouseleave', cancelDeleteTimer);
$('deleteBtn').addEventListener('touchend', cancelDeleteTimer);
