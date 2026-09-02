/* ============================================
   VINÉRE — Dashboard / KPI Cards
   ============================================ */

function renderKPIs() {
  var sold = ORDERS.filter(function(r) { return String(r[DK.salePrice] || '').trim() !== ''; });
  var notSold = ORDERS.filter(function(r) { return String(r[DK.salePrice] || '').trim() === ''; });

  var totalRevenue = sold.reduce(function(s, r) { return s + (parseFloat(r[DK.salePrice]) || 0); }, 0);
  var totalCost = sold.reduce(function(s, r) { return s + (parseFloat(r[DK.usd]) || 0); }, 0);
  var profit = totalRevenue - totalCost;

  // ── MEMO-AWARE COLLECTED / OUTSTANDING ──
  var memoPaids = {};
  ORDERS.forEach(function(r) {
    var memo = r[DK.memoNo];
    if (memo && !memoPaids[memo]) {
      var log = [];
      try { log = JSON.parse(r[DK.paymentLog] || '[]'); } catch(e) {}
      memoPaids[memo] = log.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
    }
  });

  var totalCollected = 0;
  var totalOutstanding = 0;
  var seenMemos = {};

  ORDERS.forEach(function(r) {
    var memo = r[DK.memoNo];
    if (memo) {
      if (!seenMemos[memo]) {
        seenMemos[memo] = true;
        var memoBill = ORDERS.reduce(function(s, o) { return s + (o[DK.memoNo] === memo ? (parseFloat(o[DK.salePrice]) || 0) : 0); }, 0);
        var paid = memoPaids[memo] || 0;
        totalCollected += paid;
        totalOutstanding += Math.max(0, memoBill - paid);
      }
    } else {
      totalCollected += parseFloat(r[DK.amountPaid]) || 0;
      totalOutstanding += parseFloat(r[DK.balanceDue]) || 0;
    }
  });
  // ── END ──

  var stockCount = notSold.length;
  var stockCost = notSold.reduce(function(s, r) {
    var net = parseFloat(r[DK.netWt]) || 0;
    var mult = parseFloat(r[DK.multiplier]) || 0.595;
    var pgWt = net * mult;
    var goldRate = window.GOLD_RATE || 16000;
    var gold = pgWt * goldRate;
    var labor = parseFloat(r[DK.laborAmt]) || 0;
    var diam = parseFloat(r[DK.diamAmount]) || 0;
    var sub = gold + labor + diam;
    return s + (sub / 94);
  }, 0);

  $('hstat_1_label').textContent = 'Profit / Loss';
  $('hstat_1').textContent = (profit >= 0 ? '+' : '-') + '$' + Math.abs(profit).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  $('hstat_2_label').textContent = 'Remaining Stock';
  $('hstat_2').textContent = stockCount;
  $('hstat_3_label').textContent = 'Stock Cost';
  $('hstat_3').textContent = '$' + stockCost.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  $('hstat_1').style.color = profit >= 0 ? 'var(--success)' : 'var(--error)';
  $('hstat_2').style.color = 'var(--accent)';
  $('hstat_3').style.color = 'var(--warning)';

  $('kpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Total Revenue</div>' +
    '<div class="kpi-value">$' + fmtMoney(totalRevenue) + '</div>' +
    '<div class="kpi-sub">from ' + sold.length + ' sold items</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Cost</div>' +
    '<div class="kpi-value">$' + fmtMoney(totalCost) + '</div>' +
    '<div class="kpi-sub">manufacturing + labor</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Gross Profit / Loss</div>' +
    '<div class="kpi-value" style="color:' + (profit >= 0 ? 'var(--success)' : 'var(--error)') + '">' +
    (profit >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(profit)) + '</div>' +
    '<div class="kpi-sub">revenue minus cost</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Amount Collected</div>' +
    '<div class="kpi-value">$' + fmtMoney(totalCollected) + '</div>' +
    '<div class="kpi-sub">payments received</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Outstanding Balance</div>' +
    '<div class="kpi-value" style="color:var(--warning)">$' + fmtMoney(totalOutstanding) + '</div>' +
    '<div class="kpi-sub">across all orders</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Stock on Hand</div>' +
    '<div class="kpi-value">' + stockCount + '</div>' +
    '<div class="kpi-sub">unsold items worth $' + fmtMoney(stockCost) + ' <span style="font-size:11px;color:var(--text-dim)">(@ ₹' + (window.GOLD_RATE || 16000).toLocaleString('en-IN') + '/gm)</span></div></div>';
}

function renderTradeKPIs() {
  var K = SHEET_KEYS;
  var sold = TRADING.filter(function(r) { return String(r[K.salePrice] || '').trim() !== ''; });
  var totalInvested = TRADING.reduce(function(s, r) { return s + (parseFloat(r[K.purchasePrice]) || 0); }, 0);
  var totalSales = sold.reduce(function(s, r) { return s + (parseFloat(r[K.salePrice]) || 0); }, 0);
  var netPL = sold.reduce(function(s, r) { return s + ((parseFloat(r[K.salePrice]) || 0) - (parseFloat(r[K.purchasePrice]) || 0)); }, 0);

  // ── MEMO-AWARE COLLECTED / OUTSTANDING ──
  var memoPaids = {};
  TRADING.forEach(function(r) {
    var memo = r[K.memoNo];
    if (memo && !memoPaids[memo]) {
      var log = [];
      try { log = JSON.parse(r[K.paymentLog] || '[]'); } catch(e) {}
      memoPaids[memo] = log.reduce(function(s, p) { return s + (parseFloat(p.amount) || 0); }, 0);
    }
  });

  var collected = 0;
  var outstanding = 0;
  var seenMemos = {};

  TRADING.forEach(function(r) {
    var memo = r[K.memoNo];
    if (memo) {
      if (!seenMemos[memo]) {
        seenMemos[memo] = true;
        var memoBill = TRADING.reduce(function(s, t) { return s + (t[K.memoNo] === memo ? (parseFloat(t[K.salePrice]) || 0) : 0); }, 0);
        var paid = memoPaids[memo] || 0;
        collected += paid;
        outstanding += Math.max(0, memoBill - paid);
      }
    } else {
      collected += parseFloat(r[K.amountPaid]) || 0;
      outstanding += parseFloat(r[K.balanceDue]) || 0;
    }
  });
  // ── END ──

  $('hstat_1_label').textContent = 'Net P/L';
  $('hstat_1').textContent = (netPL >= 0 ? '+' : '-') + '$' + Math.abs(netPL).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  $('hstat_1').style.color = netPL >= 0 ? 'var(--success)' : 'var(--error)';
  $('hstat_2_label').textContent = 'Total Trades';
  $('hstat_2').textContent = TRADING.length;
  $('hstat_2').style.color = 'var(--accent)';
  $('hstat_3_label').textContent = 'Outstanding';
  $('hstat_3').textContent = '$' + outstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  $('hstat_3').style.color = 'var(--warning)';

  $('tradeKpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Total Trades</div>' +
    '<div class="kpi-value">' + TRADING.length + '</div>' +
    '<div class="kpi-sub">buy & sell records</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Invested</div>' +
    '<div class="kpi-value">$' + fmtMoney(totalInvested) + '</div>' +
    '<div class="kpi-sub">capital deployed</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Total Sales</div>' +
    '<div class="kpi-value">$' + fmtMoney(totalSales) + '</div>' +
    '<div class="kpi-sub">revenue from sold items</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Net P/L</div>' +
    '<div class="kpi-value" style="color:' + (netPL >= 0 ? 'var(--success)' : 'var(--error)') + '">' +
    (netPL >= 0 ? '+' : '-') + '$' + fmtMoney(Math.abs(netPL)) + '</div>' +
    '<div class="kpi-sub">closed trades only</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Collected</div>' +
    '<div class="kpi-value">$' + fmtMoney(collected) + '</div>' +
    '<div class="kpi-sub">payments received</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Outstanding</div>' +
    '<div class="kpi-value" style="color:var(--warning)">$' + fmtMoney(outstanding) + '</div>' +
    '<div class="kpi-sub">balance due across all</div></div>';
}function renderExpenseKPIs() {
  var K = EXPENSE_KEYS;
  var total = EXPENSES.reduce(function(s, r) { return s + (parseFloat(r[K.amount]) || 0); }, 0);

  var catCounts = {};
  EXPENSES.forEach(function(r) {
    var cat = r[K.category] || 'Misc';
    catCounts[cat] = (catCounts[cat] || 0) + (parseFloat(r[K.amount]) || 0);
  });
  var topCat = Object.keys(catCounts).sort(function(a, b) { return catCounts[b] - catCounts[a]; })[0] || '\u2014';

  $('hstat_1_label').textContent = 'Total Expenses';
  $('hstat_1').textContent = '$' + total.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  $('hstat_1').style.color = 'var(--error)';
  $('hstat_2_label').textContent = 'Record Count';
  $('hstat_2').textContent = EXPENSES.length.toString();
  $('hstat_2').style.color = 'var(--text)';
  $('hstat_3_label').textContent = 'Top Category';
  $('hstat_3').textContent = topCat;
  $('hstat_3').style.color = 'var(--accent)';

  $('expenseKpiGrid').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Total Expenses</div>' +
    '<div class="kpi-value">$' + fmtMoney(total) + '</div>' +
    '<div class="kpi-sub">all time spend</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Record Count</div>' +
    '<div class="kpi-value">' + EXPENSES.length + '</div>' +
    '<div class="kpi-sub">expense entries</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Top Category</div>' +
    '<div class="kpi-value">' + escapeHtml(topCat) + '</div>' +
    '<div class="kpi-sub">highest spend area</div></div>' +
    '<div class="kpi-card"><div class="kpi-label">Avg per Entry</div>' +
    '<div class="kpi-value">$' + fmtMoney(EXPENSES.length ? total / EXPENSES.length : 0) + '</div>' +
    '<div class="kpi-sub">mean expense size</div></div>';
}

window.renderExpenseKPIs = renderExpenseKPIs;

window.renderKPIs = renderKPIs;
window.renderTradeKPIs = renderTradeKPIs;
