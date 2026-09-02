/* ============================================
   VINÉRE — Expenses Panel (Create / Edit)
   ============================================ */

var editingExpenseId = null;

window.openExpensePanel = function(id) {
  if (ROLE === 'customer') {
    showToast('View only — you do not have permission to edit expenses', 'warning');
    return;
  }
  editingExpenseId = id || null;
  resetExpensePanel();

  if (id) {
    var exp = EXPENSES.find(function(r) { return r._id === id; });
    if (!exp) return;

    $('expensePanelTitle').textContent = 'Edit Expense #' + exp[EXPENSE_KEYS.sr];
    $('e_date').value = exp[EXPENSE_KEYS.date] || '';
    $('e_category').value = exp[EXPENSE_KEYS.category] || 'Travel';
    $('e_description').value = exp[EXPENSE_KEYS.description] || '';
    $('e_amount').value = exp[EXPENSE_KEYS.amount] || '';
    $('e_seller').value = exp[EXPENSE_KEYS.seller] || '';
    $('e_notes').value = exp[EXPENSE_KEYS.notes] || '';

    $('deleteExpenseBtn').style.display = (ROLE === 'staff') ? 'inline-flex' : 'none';
  } else {
    $('expensePanelTitle').textContent = 'New Expense';
    $('e_date').value = new Date().toISOString().split('T')[0];
    $('e_seller').value = '';
    $('deleteExpenseBtn').style.display = 'none';
  }

  $('expenseOverlay').style.display = 'block';
  $('expensePanel').classList.add('open');
  document.body.classList.add('panel-open');
};

function resetExpensePanel() {
  ['e_date','e_description','e_amount','e_seller','e_notes'].forEach(function(id) { $(id).value = ''; });
  $('e_category').value = 'Travel';
  $('expenseSaveMsg').textContent = '';
  document.querySelectorAll('[id^="err_e_"]').forEach(function(el) { el.textContent = ''; });
}

$('closeExpensePanel').addEventListener('click', closeExpensePanel);
$('expenseOverlay').addEventListener('click', closeExpensePanel);

function closeExpensePanel() {
  $('expensePanel').classList.remove('open');
  $('expenseOverlay').style.display = 'none';
  editingExpenseId = null;
  document.body.classList.remove('panel-open');
}

/* ============ SAVE ============ */
$('saveExpenseBtn').addEventListener('click', async function() {
  if (ROLE === 'customer') return;

  document.querySelectorAll('[id^="err_e_"]').forEach(function(el) { el.textContent = ''; });

  var valid = true;
  if (!$('e_category').value) { $('err_e_category').textContent = 'Required'; valid = false; }
  if (!$('e_amount').value.trim() || isNaN(parseFloat($('e_amount').value)) || parseFloat($('e_amount').value) < 0) {
    $('err_e_amount').textContent = 'Enter valid amount'; valid = false;
  }
  if (!$('e_date').value) { $('err_e_date').textContent = 'Required'; valid = false; }

  if (!valid) {
    $('expenseSaveMsg').textContent = 'Please fix the highlighted fields.';
    showToast('Please fix the highlighted fields before saving.', 'warning');
    return;
  }

  $('expenseSaveMsg').textContent = '';

  var data = {};
  data[EXPENSE_KEYS.date] = $('e_date').value;
  data[EXPENSE_KEYS.category] = $('e_category').value;
  data[EXPENSE_KEYS.description] = $('e_description').value.trim();
  data[EXPENSE_KEYS.amount] = parseFloat($('e_amount').value).toString();
  data[EXPENSE_KEYS.seller] = $('e_seller').value.trim();
  data[EXPENSE_KEYS.notes] = $('e_notes').value.trim();

  try {
    if (editingExpenseId) {
      var existing = EXPENSES.find(function(r) { return r._id === editingExpenseId; });
      data[EXPENSE_KEYS.sr] = existing[EXPENSE_KEYS.sr];
      await window.updateExpense(editingExpenseId, data);
      showToast('Expense #' + data[EXPENSE_KEYS.sr] + ' updated successfully', 'success');
    } else {
      var nextSr = EXPENSES.length > 0 ? Math.max.apply(null, EXPENSES.map(function(r) { return parseInt(r[EXPENSE_KEYS.sr]) || 0; })) + 1 : 1;
      data[EXPENSE_KEYS.sr] = nextSr.toString();
      await window.addExpense(data);
      showToast('Expense #' + nextSr + ' created successfully', 'success');
    }
    closeExpensePanel();
    await doFetchExpenses();
    renderAll();
  } catch (err) {
    console.error(err);
    $('expenseSaveMsg').textContent = 'Error saving. Try again.';
    showToast('Failed to save expense. Please try again.', 'error');
  }
});

/* ============ DELETE ============ */
var deleteExpenseTimer = null;
var deleteExpenseProgress = 0;

function startDeleteExpenseTimer() {
  if (!editingExpenseId || ROLE !== 'staff') return;
  var btn = $('deleteExpenseBtn');
  btn.classList.add('deleting');
  deleteExpenseProgress = 0;

  deleteExpenseTimer = setInterval(function() {
    deleteExpenseProgress += 50;
    var pct = (deleteExpenseProgress / 3000) * 100;
    btn.style.setProperty('--delete-progress', pct + '%');

    if (deleteExpenseProgress >= 3000) {
      clearInterval(deleteExpenseTimer);
      deleteExpenseTimer = null;
      btn.classList.remove('deleting');
      doDeleteExpense();
    }
  }, 50);
}

function cancelDeleteExpenseTimer() {
  if (deleteExpenseTimer) {
    clearInterval(deleteExpenseTimer);
    deleteExpenseTimer = null;
  }
  var btn = $('deleteExpenseBtn');
  btn.classList.remove('deleting');
  btn.style.setProperty('--delete-progress', '0%');
}

async function renumberExpensesAfterDelete(deletedSr) {
  var toUpdate = EXPENSES.filter(function(r) {
    return parseInt(r[EXPENSE_KEYS.sr]) > parseInt(deletedSr);
  }).sort(function(a, b) {
    return parseInt(a[EXPENSE_KEYS.sr]) - parseInt(b[EXPENSE_KEYS.sr]);
  });
  for (var i = 0; i < toUpdate.length; i++) {
    var r = toUpdate[i];
    var oldSr = r[EXPENSE_KEYS.sr];
    var newSr = (parseInt(oldSr) - 1).toString();
    var oldId = r._id;
    var newId = 'expense_' + newSr;

    r[EXPENSE_KEYS.sr] = newSr;
    r._id = newId;

    var data = {};
    for (var k in r) data[k] = r[k];
    data[EXPENSE_KEYS.sr] = newSr;

    try {
      await window.addExpense(data, newId);
      await window.deleteExpense(oldId, oldSr);
    } catch(e) {
      console.error('Renumber failed for expense', oldId, '\u2192', newId, e);
    }
  }
}

async function doDeleteExpense() {
  if (!editingExpenseId) return;
  var exp = EXPENSES.find(function(r) { return r._id === editingExpenseId; });
  var srNo = exp ? exp[EXPENSE_KEYS.sr] : '';

  try {
    await window.deleteExpense(editingExpenseId, srNo);
    EXPENSES = EXPENSES.filter(function(r) { return r._id !== editingExpenseId; });

    if (srNo) {
      await renumberExpensesAfterDelete(srNo);
    }

    showToast('Expense deleted', 'success');
    closeExpensePanel();
    await doFetchExpenses();
    renderAll();
  } catch (err) {
    console.error(err);
    showToast('Failed to delete expense', 'error');
  }
}

$('deleteExpenseBtn').addEventListener('mousedown', startDeleteExpenseTimer);
$('deleteExpenseBtn').addEventListener('touchstart', startDeleteExpenseTimer);
$('deleteExpenseBtn').addEventListener('mouseup', cancelDeleteExpenseTimer);
$('deleteExpenseBtn').addEventListener('mouseleave', cancelDeleteExpenseTimer);
$('deleteExpenseBtn').addEventListener('touchend', cancelDeleteExpenseTimer);
