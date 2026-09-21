/* ============================================
   VINÉRE — Buyer Directory & Sold-To Linking
   ============================================ */

/* ============ DATALIST (suggestions on Sold To fields) ============ */
window.refreshBuyerDatalist = function() {
  var list = $('buyersDatalist');
  if (!list) return;
  var names = BUYERS.map(function(b) { return b[BUYER_KEYS.name] || ''; }).filter(Boolean);
  var unique = Array.from(new Set(names)).sort();
  list.innerHTML = unique.map(function(n) { return '<option value="' + escapeHtml(n) + '">'; }).join('');
};

function findBuyerByName(name) {
  if (!name) return null;
  var norm = name.trim().toLowerCase();
  return BUYERS.find(function(b) { return (b[BUYER_KEYS.name] || '').trim().toLowerCase() === norm; }) || null;
}

// Called when a Sold To field loses focus: link to an existing buyer by
// exact name match, or silently create a new buyer record so every
// customer typed into an order/trade ends up as a real Buyer document
// going forward (this is what "proper linking" means here — a buyerId
// gets stored alongside the name, rather than the name being the only
// record of who bought it).
async function linkSoldToBuyer(nameInputId, buyerIdInputId) {
  var nameInput = $(nameInputId);
  var idInput = $(buyerIdInputId);
  if (!nameInput || !idInput) return;

  var name = nameInput.value.trim();
  if (!name) { idInput.value = ''; return; }

  var existing = findBuyerByName(name);
  if (existing) {
    idInput.value = existing._id;
    // Keep the casing/spelling already on file, so "cali jewelers" typed
    // loosely still displays consistently as however it was first saved.
    nameInput.value = existing[BUYER_KEYS.name];
    return;
  }

  try {
    var data = {};
    data[BUYER_KEYS.name] = name;
    var id = await window.addBuyer(data);
    BUYERS.push(Object.assign({ _id: id }, data));
    window.refreshBuyerDatalist();
    idInput.value = id;
  } catch (err) {
    console.error('Auto-create buyer failed', err);
    // Non-fatal: the order/trade can still save with just the typed name.
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var fSoldTo = $('f_soldTo');
  var tSoldTo = $('t_soldTo');
  if (fSoldTo) fSoldTo.addEventListener('blur', function() { linkSoldToBuyer('f_soldTo', 'f_soldToBuyerId'); });
  if (tSoldTo) tSoldTo.addEventListener('blur', function() { linkSoldToBuyer('t_soldTo', 't_soldToBuyerId'); });
});
// In case buyers.js loads after DOMContentLoaded already fired (script is at
// the end of <body>, so this is mostly a safety net).
if (document.readyState !== 'loading') {
  var fSoldToNow = $('f_soldTo');
  var tSoldToNow = $('t_soldTo');
  if (fSoldToNow) fSoldToNow.addEventListener('blur', function() { linkSoldToBuyer('f_soldTo', 'f_soldToBuyerId'); });
  if (tSoldToNow) tSoldToNow.addEventListener('blur', function() { linkSoldToBuyer('t_soldTo', 't_soldToBuyerId'); });
}

/* ============ BUYER STATS (reuses insights.js's memo-share helper) ============ */
function getBuyerStats(name) {
  var orders = ORDERS.filter(function(o) { return (o[DK.soldTo] || '').trim().toLowerCase() === name.trim().toLowerCase(); });
  var trades = TRADING.filter(function(t) { return (t[SHEET_KEYS.soldTo] || '').trim().toLowerCase() === name.trim().toLowerCase(); });

  var totalBill = 0, totalCollected = 0, totalOutstanding = 0, lastDate = null;

  function process(row, keys) {
    var price = parseFloat(row[keys.salePrice]) || 0;
    var memo = row[keys.memoNo];
    var share = memo
      ? getMemoShareForBill(memo, price)
      : { collected: parseFloat(row[keys.amountPaid]) || 0, outstanding: parseFloat(row[keys.balanceDue]) || 0 };
    totalBill += price;
    totalCollected += share.collected;
    totalOutstanding += share.outstanding;
    var d = row[keys.date] ? new Date(row[keys.date]) : null;
    if (d && (!lastDate || d > lastDate)) lastDate = d;
  }

  orders.forEach(function(o) { process(o, DK); });
  trades.forEach(function(t) { process(t, SHEET_KEYS); });

  return {
    itemCount: orders.length + trades.length,
    totalBill: totalBill,
    totalCollected: totalCollected,
    totalOutstanding: totalOutstanding,
    lastDate: lastDate
  };
}

/* ============ BUYER DIRECTORY (list panel) ============ */
function renderBuyerList(filterQuery) {
  var q = (filterQuery || '').trim().toLowerCase();
  var rows = BUYERS.filter(function(b) {
    if (!q) return true;
    return (b[BUYER_KEYS.name] || '').toLowerCase().indexOf(q) !== -1 ||
           (b[BUYER_KEYS.phone] || '').toLowerCase().indexOf(q) !== -1;
  });

  rows = rows.slice().sort(function(a, b) {
    return (a[BUYER_KEYS.name] || '').localeCompare(b[BUYER_KEYS.name] || '');
  });

  var container = $('buyerListContainer');
  if (!rows.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);">No buyers found</div>';
    return;
  }

  container.innerHTML = rows.map(function(b) {
    var name = b[BUYER_KEYS.name] || '(unnamed)';
    var stats = getBuyerStats(name);
    var dueHtml = stats.totalOutstanding > 0.01
      ? '<div class="buyer-row-stat"><span class="label">Due</span><span class="value due">$' + fmtMoney(stats.totalOutstanding) + '</span></div>'
      : '';
    return '<div class="buyer-row">' +
      '<div class="buyer-row-identity">' +
        '<span class="soldto-link buyer-row-name" data-customer="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span>' +
        '<span class="buyer-row-phone">' + escapeHtml(b[BUYER_KEYS.phone] || 'No phone on file') + '</span>' +
      '</div>' +
      '<div class="buyer-row-stats">' +
        '<div class="buyer-row-stat"><span class="label">Items</span><span class="value">' + stats.itemCount + '</span></div>' +
        '<div class="buyer-row-stat"><span class="label">Billed</span><span class="value">$' + fmtMoney(stats.totalBill) + '</span></div>' +
        dueHtml +
      '</div>' +
      '<button class="btn secondary small" data-edit-buyer="' + b._id + '">Edit</button>' +
      '</div>';
  }).join('');

  container.querySelectorAll('.soldto-link').forEach(function(el) {
    el.addEventListener('click', function() { window.openCustomerProfile(el.dataset.customer); });
  });
  container.querySelectorAll('[data-edit-buyer]').forEach(function(el) {
    el.addEventListener('click', function() { window.openBuyerForm(el.dataset.editBuyer); });
  });
}

window.openBuyers = function() {
  $('buyerSearchInput').value = '';
  renderBuyerList('');
  $('buyersOverlay').style.display = 'block';
  $('buyersModal').classList.add('open');
};

function closeBuyers() {
  $('buyersOverlay').style.display = 'none';
  $('buyersModal').classList.remove('open');
}
$('closeBuyers').addEventListener('click', closeBuyers);
$('buyersOverlay').addEventListener('click', closeBuyers);
$('buyersBtn').addEventListener('click', window.openBuyers);
$('buyerSearchInput').addEventListener('input', function(e) { renderBuyerList(e.target.value); });

/* ============ BUYER EDIT FORM ============ */
var editingBuyerId = null;

window.openBuyerForm = function(id) {
  editingBuyerId = id || null;
  ['b_name', 'b_phone', 'b_email', 'b_address', 'b_notes'].forEach(function(fid) { $(fid).value = ''; });
  $('err_b_name').textContent = '';

  if (id) {
    var buyer = BUYERS.find(function(b) { return b._id === id; });
    if (!buyer) return;
    $('buyerFormTitle').textContent = 'Edit Buyer';
    $('b_name').value = buyer[BUYER_KEYS.name] || '';
    $('b_phone').value = buyer[BUYER_KEYS.phone] || '';
    $('b_email').value = buyer[BUYER_KEYS.email] || '';
    $('b_address').value = buyer[BUYER_KEYS.address] || '';
    $('b_notes').value = buyer[BUYER_KEYS.notes] || '';
    $('deleteBuyerBtn').style.display = 'inline-flex';
  } else {
    $('buyerFormTitle').textContent = 'New Buyer';
    $('deleteBuyerBtn').style.display = 'none';
  }

  $('buyerFormOverlay').style.display = 'block';
  $('buyerFormModal').classList.add('open');
};

function closeBuyerForm() {
  $('buyerFormOverlay').style.display = 'none';
  $('buyerFormModal').classList.remove('open');
  editingBuyerId = null;
}
$('closeBuyerForm').addEventListener('click', closeBuyerForm);
$('buyerFormOverlay').addEventListener('click', closeBuyerForm);
$('newBuyerBtn').addEventListener('click', function() { window.openBuyerForm(null); });

$('saveBuyerBtn').addEventListener('click', async function() {
  var name = $('b_name').value.trim();
  $('err_b_name').textContent = '';
  if (!name) { $('err_b_name').textContent = 'Required'; return; }

  // Guard against creating a duplicate when renaming/adding to match an
  // existing buyer's name exactly (case-insensitive).
  var dupe = findBuyerByName(name);
  if (dupe && dupe._id !== editingBuyerId) {
    $('err_b_name').textContent = 'A buyer with this name already exists';
    return;
  }

  var data = {};
  data[BUYER_KEYS.name] = name;
  data[BUYER_KEYS.phone] = $('b_phone').value.trim();
  data[BUYER_KEYS.email] = $('b_email').value.trim();
  data[BUYER_KEYS.address] = $('b_address').value.trim();
  data[BUYER_KEYS.notes] = $('b_notes').value.trim();

  try {
    if (editingBuyerId) {
      await window.updateBuyer(editingBuyerId, data);
      var idx = BUYERS.findIndex(function(b) { return b._id === editingBuyerId; });
      if (idx !== -1) BUYERS[idx] = Object.assign({ _id: editingBuyerId }, data);
      showToast('Buyer updated', 'success');
    } else {
      var id = await window.addBuyer(data);
      BUYERS.push(Object.assign({ _id: id }, data));
      showToast('Buyer added', 'success');
    }
    window.refreshBuyerDatalist();
    closeBuyerForm();
    renderBuyerList($('buyerSearchInput').value);
  } catch (err) {
    console.error(err);
    showToast('Failed to save buyer', 'error');
  }
});

$('deleteBuyerBtn').addEventListener('click', async function() {
  if (!editingBuyerId) return;
  if (!confirm('Delete this buyer? This does not delete their past orders/trades — it only removes their directory entry.')) return;
  try {
    await window.deleteBuyer(editingBuyerId);
    BUYERS = BUYERS.filter(function(b) { return b._id !== editingBuyerId; });
    window.refreshBuyerDatalist();
    showToast('Buyer deleted', 'success');
    closeBuyerForm();
    renderBuyerList($('buyerSearchInput').value);
  } catch (err) {
    console.error(err);
    showToast('Failed to delete buyer', 'error');
  }
});
