// ============================================================
// dashboard.js — the KPI summary cards at the top of the app
// ============================================================

  // ============ KPIs ============
  let kpiRawValues = {};
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animateKpiValue(el, from, to, formatter, duration = 500) {
    if (prefersReducedMotion || from === to) { el.textContent = formatter(to); return; }
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = formatter(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = formatter(to);
    }
    requestAnimationFrame(tick);
  }

  function renderKPIs() {
    const totalOrders = ORDERS.length;
    const totalRevenue = ORDERS.reduce((s, r) => s + (parseFloat(r['SUB TOTAL'])||0), 0);
    const totalGold = ORDERS.reduce((s, r) => s + (parseFloat(r['Gold Amount'])||0), 0);
    const totalDiam = ORDERS.reduce((s, r) => s + (parseFloat(r['Diam Amount'])||0), 0);
    const totalNetWt = ORDERS.reduce((s, r) => s + (parseFloat(r['Net Wt'])||0), 0);
    const totalDiaCt = ORDERS.reduce((s, r) => s + (parseFloat(r['IN CT'])||0), 0);

    const soldRows = ORDERS.filter(r => String(r['Sale Price'] ?? '').trim() !== '');
    // A memo's Balance Due is synced identically onto every item in that
    // memo (so each row looks correct on its own) — but that means naively
    // summing Balance Due across every row multiplies a shared balance by
    // however many items share that memo. Count each memo group's balance
    // exactly once instead; solo (non-memo) items still count individually.
    const seenMemoKeys = new Set();
    let totalOutstanding = 0;
    let unpaidOrPartialCount = 0;
    soldRows.forEach(r => {
      const memoKey = String(getField(r, 'Memo No.') || '').trim().toLowerCase();
      if (memoKey) {
        if (seenMemoKeys.has(memoKey)) return; // already counted this memo's balance once
        seenMemoKeys.add(memoKey);
      }
      const bal = parseFloat(r['Balance Due']) || 0;
      if (bal > 0) {
        totalOutstanding += bal;
        unpaidOrPartialCount++;
      }
    });

    const kpis = [
      { key:'orders', label: 'Total Orders', raw: totalOrders, fmt: v => Math.round(v).toLocaleString('en-IN'), sub: 'across all customers' },
      { key:'revenue', label: 'Sub Total', raw: totalRevenue, fmt: v => fmtMoney(v), sub: '₹' + fmtNum(totalRevenue/100000, 2) + ' Lakhs' },
      { key:'gold', label: 'Gold Amount', raw: totalGold, fmt: v => fmtMoney(v), sub: fmtNum((totalGold/totalRevenue)*100, 1) + '% of revenue' },
      { key:'diam', label: 'Diamond Amount', raw: totalDiam, fmt: v => fmtMoney(v), sub: fmtNum((totalDiam/totalRevenue)*100, 1) + '% of revenue' },
      { key:'netwt', label: 'Net Weight', raw: totalNetWt, fmt: v => fmtNum(v, 2) + ' g', sub: 'total gold weight' },
      { key:'diact', label: 'Diamonds', raw: totalDiaCt, fmt: v => fmtNum(v, 2) + ' ct', sub: 'total carat weight' },
      { key:'sold', label: 'Pieces Sold', raw: soldRows.length, fmt: v => Math.round(v).toLocaleString('en-IN'), sub: `of ${totalOrders} total pieces` },
      { key:'outstanding', label: 'Outstanding Balance', raw: totalOutstanding, fmt: v => fmtUSD(v), sub: `across ${unpaidOrPartialCount} unpaid/partial` },
    ];

    const grid = $('kpiGrid');
    const isFirstRender = grid.children.length === 0;

    grid.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" data-kpi="${k.key}">${k.fmt(isFirstRender ? k.raw : (kpiRawValues[k.key] ?? 0))}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    `).join('');

    kpis.forEach(k => {
      const el = grid.querySelector(`[data-kpi="${k.key}"]`);
      const from = isFirstRender ? k.raw : (kpiRawValues[k.key] ?? 0);
      if (!isFirstRender) animateKpiValue(el, from, k.raw, k.fmt);
      kpiRawValues[k.key] = k.raw;
    });
  }

  // ============ HEADER STATS (Profit/Loss + Remaining Stock) ============
  // Sale Price is stored/displayed in $ throughout the table (see
  // renderTable's fmtUSD), and the '$' column is each piece's manufacturing
  // cost converted to USD (Sub Total ÷ 94) — so both sides of this compare
  // apples to apples without needing any new backend fields.
  //   Profit/Loss = Σ Sale Price ($) − Σ manufacturing cost ($), sold pieces only
  //   Remaining Stock = pieces with no Sale Price yet
  //   Stock Cost = Σ manufacturing cost ($) of those unsold pieces
  function renderHeaderStats() {
    const soldRows = ORDERS.filter(r => String(r['Sale Price'] ?? '').trim() !== '');
    const unsoldRows = ORDERS.filter(r => String(r['Sale Price'] ?? '').trim() === '');

    const totalSaleUSD = soldRows.reduce((s, r) => s + (parseFloat(r['Sale Price']) || 0), 0);
    const totalMfgUSDSold = soldRows.reduce((s, r) => s + (parseFloat(r['$']) || 0), 0);
    const profitLoss = totalSaleUSD - totalMfgUSDSold;

    const stockCount = unsoldRows.length;
    const stockCostUSD = unsoldRows.reduce((s, r) => s + (parseFloat(r['$']) || 0), 0);

    const plEl = $('hstat_pl');
    plEl.textContent = (profitLoss >= 0 ? '+$' : '−$') + fmtNum(Math.abs(profitLoss), 2);
    plEl.classList.remove('good', 'bad');
    plEl.classList.add(profitLoss >= 0 ? 'good' : 'bad');

    $('hstat_stockCount').textContent = stockCount.toLocaleString('en-IN');
    $('hstat_stockCost').textContent = '$' + fmtNum(stockCostUSD, 2);
  }
