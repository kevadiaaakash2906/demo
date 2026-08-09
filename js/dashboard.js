/* ============================================
   VINÉRE — Dashboard / KPI Cards
   ============================================ */

function renderKPIs() {
  var sold = ORDERS.filter(function(r) { return String(r[DK.salePrice] || '').trim() !== ''; });
  var notSold = ORDERS.filter(function(r) { return String(r[DK.salePrice] || '').trim() === ''; });

  var totalRevenue = sold.reduce(function(s, r) { return s + (parseFloat(r[DK.salePrice]) || 0); }, 0);
  var totalCost = sold.reduce(function(s, r) { return s + (parseFloat(r[DK.usd]) || 0); }, 0);
  var profit = totalRevenue - totalCost;

  var totalCollected = ORDERS.reduce(function(s, r) { return s + (parseFloat(r[DK.amountPaid]) || 0); }, 0);
  var totalOutstanding = ORDERS.reduce(function(s, r) { return s + (parseFloat(r[DK.balanceDue]) || 0); }, 0);

  var stockCount = notSold.length;
  var stockCost = notSold.reduce(function(s, r) { return s + (parseFloat(r[DK.usd]) || 0); }, 0);

  // Header stats — same 3-slot layout for coherence
  $('hstat_1_label').textContent = 'Profit / Loss';
  $('hstat_1').textContent = (profit >= 0 ? '+' : '-') + '$' + Math.abs(profit).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  $('hstat_2_label').textContent = 'Remaining Stock';
  $('hstat_2').textContent = stockCount;
  $('hstat_3_label').textContent = 'Stock Cost';
  $('hstat_3').textContent = '$' + stockCost.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  // Reset colors from trading view
  $('hstat_1').style.color = 'var(--accent)';
  $('hstat_2').style.color = 'var(--accent)';
  $('hstat_3').style.color = 'var(--accent)';

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
    '<div class="kpi-sub">unsold items worth $' + fmtMoney(stockCost) + '</div></div>';
}

function renderTradeKPIs() {
  var K = SHEET_KEYS;
  var sold = TRADING.filter(function(r) { return String(r[K.salePrice] || '').trim() !== ''; });
  var totalInvested = TRADING.reduce(function(s, r) { return s + (parseFloat(r[K.purchasePrice]) || 0); }, 0);
  var totalSales = sold.reduce(function(s, r) { return s + (parseFloat(r[K.salePrice]) || 0); }, 0);
  var netPL = sold.reduce(function(s, r) { return s + ((parseFloat(r[K.salePrice]) || 0) - (parseFloat(r[K.purchasePrice]) || 0)); }, 0);
  var collected = TRADING.reduce(function(s, r) { return s + (parseFloat(r[K.amountPaid]) || 0); }, 0);
  var outstanding = TRADING.reduce(function(s, r) { return s + (parseFloat(r[K.balanceDue]) || 0); }, 0);

  // Header stats — same 3-slot layout for coherence
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
}

window.renderKPIs = renderKPIs;
window.renderTradeKPIs = renderTradeKPIs;
