/* ============================================
   VINÉRE — Insights Charts
   Seasonal trend (top jewelry types/shapes by month) and
   Profit Trend (revenue/cost/profit over time), both drawn
   with Chart.js. Called from insights.js's tab-switch and
   dropdown-change handlers.
   ============================================ */

/* ============ DATE BUCKETING HELPERS (shared by both charts) ============ */

function getMonthKey(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function formatMonthLabel(key) {
  var parts = key.split('-');
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function getQuarterKey(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr);
  if (isNaN(d)) return null;
  var q = Math.floor(d.getMonth() / 3) + 1;
  return d.getFullYear() + '-Q' + q;
}
function formatQuarterLabel(key) {
  var parts = key.split('-');
  return parts[1] + ' \u2019' + parts[0].slice(2);
}

/* ============ SEASONAL TREND: TOP JEWELRY TYPES / SHAPES BY MONTH ============ */

var seasonalChartInstance = null;

function renderSeasonalChart(dimension) {
  dimension = dimension || 'type';
  var field = dimension === 'shape' ? DK.diamondShape : DK.jewelryType;
  var canvas = $('seasonalChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Find the top few categories overall, so the chart stays legible
  // instead of plotting every jewelry type/shape ever recorded.
  var totals = {};
  ORDERS.forEach(function(o) {
    if (!(parseFloat(o[DK.salePrice]) || 0)) return;
    var cat = (o[field] || 'Unspecified').trim() || 'Unspecified';
    totals[cat] = (totals[cat] || 0) + 1;
  });
  var topCats = Object.keys(totals).sort(function(a, b) { return totals[b] - totals[a]; }).slice(0, 4);

  var monthly = {};
  ORDERS.forEach(function(o) {
    var sale = parseFloat(o[DK.salePrice]) || 0;
    if (!sale) return;
    var cat = (o[field] || 'Unspecified').trim() || 'Unspecified';
    if (topCats.indexOf(cat) === -1) return;
    var key = getMonthKey(o[DK.dateSold] || o[DK.date]);
    if (!key) return;
    if (!monthly[key]) monthly[key] = {};
    monthly[key][cat] = (monthly[key][cat] || 0) + 1;
  });

  var months = Object.keys(monthly).sort();

  if (seasonalChartInstance) { seasonalChartInstance.destroy(); seasonalChartInstance = null; }
  var emptyMsg = $('seasonalChartEmpty');
  if (!months.length) {
    if (emptyMsg) emptyMsg.style.display = 'flex';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';

  var colors = ['#1a73e8', '#EA4335', '#34A853', '#FBBC04'];
  seasonalChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: months.map(formatMonthLabel),
      datasets: topCats.map(function(cat, i) {
        return {
          label: cat,
          data: months.map(function(m) { return (monthly[m] && monthly[m][cat]) || 0; }),
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length],
          tension: 0.3
        };
      })
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

/* ============ PROFIT TREND: REVENUE / COST / PROFIT OVER TIME ============ */

var profitTrendChartInstance = null;

function renderProfitTrend(granularity) {
  granularity = granularity || 'month';
  var canvas = $('profitTrendChart');
  if (!canvas || typeof Chart === 'undefined') return;

  var buckets = {};
  function addToBucket(dateStr, revenue, cost) {
    var key = granularity === 'quarter' ? getQuarterKey(dateStr) : getMonthKey(dateStr);
    if (!key) return;
    if (!buckets[key]) buckets[key] = { revenue: 0, cost: 0 };
    buckets[key].revenue += revenue;
    buckets[key].cost += cost;
  }

  ORDERS.forEach(function(o) {
    var sale = parseFloat(o[DK.salePrice]) || 0;
    if (!sale) return;
    addToBucket(o[DK.dateSold] || o[DK.date], sale, parseFloat(o[DK.usd]) || 0);
  });
  TRADING.forEach(function(t) {
    var sale = parseFloat(t[SHEET_KEYS.salePrice]) || 0;
    if (!sale) return;
    addToBucket(t[SHEET_KEYS.dateSold] || t[SHEET_KEYS.date], sale, parseFloat(t[SHEET_KEYS.purchasePrice]) || 0);
  });

  var keys = Object.keys(buckets).sort();
  var labelFn = granularity === 'quarter' ? formatQuarterLabel : formatMonthLabel;

  if (profitTrendChartInstance) { profitTrendChartInstance.destroy(); profitTrendChartInstance = null; }
  var trendEmptyMsg = $('profitTrendChartEmpty');
  if (!keys.length) {
    if (trendEmptyMsg) trendEmptyMsg.style.display = 'flex';
    return;
  }
  if (trendEmptyMsg) trendEmptyMsg.style.display = 'none';

  profitTrendChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: keys.map(labelFn),
      datasets: [
        { label: 'Revenue', data: keys.map(function(k) { return buckets[k].revenue; }), borderColor: '#1a73e8', backgroundColor: 'rgba(26,115,232,0.08)', fill: true, tension: 0.3 },
        { label: 'Cost', data: keys.map(function(k) { return buckets[k].cost; }), borderColor: '#EA4335', backgroundColor: 'rgba(234,67,53,0.06)', fill: true, tension: 0.3 },
        { label: 'Profit', data: keys.map(function(k) { return buckets[k].revenue - buckets[k].cost; }), borderColor: '#34A853', backgroundColor: 'rgba(52,168,83,0.08)', fill: true, tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } } } }
    }
  });
}
