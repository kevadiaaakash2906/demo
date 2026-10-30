/* ============================================
   VINÉRE — Settings
   ============================================ */

/* ============ TEXT SIZE / ZOOM (persisted overrides on top of the CSS defaults) ============ */

function applyFontScale(value) {
  document.documentElement.style.setProperty('--font-scale', value);
  localStorage.setItem('vinere_font_scale', value);
}
function applyUiZoom(value) {
  document.documentElement.style.setProperty('--ui-zoom', value + '%');
  localStorage.setItem('vinere_ui_zoom', value);
}

// Re-apply any saved override as soon as this script loads, so a refresh
// keeps whatever the person last set rather than reverting to the CSS
// file's defaults (100 / 71).
(function restoreDisplaySettings() {
  var savedFontScale = localStorage.getItem('vinere_font_scale');
  if (savedFontScale) applyFontScale(savedFontScale);
  var savedZoom = localStorage.getItem('vinere_ui_zoom');
  if (savedZoom) applyUiZoom(savedZoom);
  if (APP_CONFIG.tableDensity === 'compact') document.body.classList.add('density-compact');
})();

/* ============ OPEN / CLOSE ============ */

window.openSettings = function() {
  var savedFontScale = localStorage.getItem('vinere_font_scale') || '100';
  var savedZoom = localStorage.getItem('vinere_ui_zoom') || '71';

  $('fontScaleSlider').value = savedFontScale;
  $('fontScaleValue').textContent = savedFontScale + '%';
  $('uiZoomSlider').value = savedZoom;
  $('uiZoomValue').textContent = savedZoom + '%';
  $('tableDensitySelect').value = APP_CONFIG.tableDensity;
  $('defaultMultiplierInput').value = APP_CONFIG.defaultMultiplier;
  $('defaultLaborInput').value = APP_CONFIG.defaultLabor;
  $('usdRateInput').value = APP_CONFIG.usdRate;
  // goldRateInput already reflects the live GOLD_RATE — it's the same
  // element app.js's own listener manages, just relocated into this panel.

  $('settingsOverlay').classList.add('open');
  $('settingsModal').classList.add('open');
};

function closeSettings() {
  $('settingsOverlay').classList.remove('open');
  $('settingsModal').classList.remove('open');
}
$('closeSettings').addEventListener('click', closeSettings);
$('settingsOverlay').addEventListener('click', closeSettings);
$('settingsBtn').addEventListener('click', window.openSettings);

/* ============ DISPLAY CONTROLS ============ */

$('fontScaleSlider').addEventListener('input', function() {
  $('fontScaleValue').textContent = this.value + '%';
  applyFontScale(this.value);
});
$('uiZoomSlider').addEventListener('input', function() {
  $('uiZoomValue').textContent = this.value + '%';
  applyUiZoom(this.value);
});
$('tableDensitySelect').addEventListener('change', function() {
  APP_CONFIG.tableDensity = this.value;
  saveAppConfig();
  document.body.classList.toggle('density-compact', this.value === 'compact');
});

/* ============ BUSINESS DEFAULTS ============ */

$('defaultMultiplierInput').addEventListener('change', function() {
  var v = parseFloat(this.value);
  if (!isNaN(v) && v > 0) { APP_CONFIG.defaultMultiplier = v; saveAppConfig(); }
});
$('defaultLaborInput').addEventListener('change', function() {
  var v = parseFloat(this.value);
  if (!isNaN(v) && v >= 0) { APP_CONFIG.defaultLabor = v; saveAppConfig(); }
});
$('usdRateInput').addEventListener('change', function() {
  var v = parseFloat(this.value);
  if (!isNaN(v) && v > 0) {
    APP_CONFIG.usdRate = v;
    saveAppConfig();
    if (typeof renderAll === 'function') renderAll(); // $ figures depend on this rate
  }
});

/* ============ EXPORT ============ */

function toCsv(rows, keys) {
  var lines = [keys.join(',')];
  rows.forEach(function(r) {
    lines.push(keys.map(function(k) {
      var val = r[k] == null ? '' : String(r[k]);
      if (val.indexOf(',') !== -1 || val.indexOf('"') !== -1 || val.indexOf('\n') !== -1) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(','));
  });
  return lines.join('\n');
}

function downloadCsv(filename, csvText) {
  var blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

$('exportDataBtn').addEventListener('click', function() {
  if (ORDERS.length) downloadCsv('orders.csv', toCsv(ORDERS, Object.values(DK)));
  if (TRADING.length) downloadCsv('trading.csv', toCsv(TRADING, Object.values(SHEET_KEYS)));
  if (EXPENSES.length) downloadCsv('expenses.csv', toCsv(EXPENSES, Object.values(EXPENSE_KEYS)));
  showToast('Export started — check your downloads', 'success');
});

/* ============ RESET ============ */

$('resetSettingsBtn').addEventListener('click', function() {
  if (!confirm('Reset text size, zoom, density and business defaults back to their original values? This does not affect your orders, trades, or expenses.')) return;

  localStorage.removeItem('vinere_font_scale');
  localStorage.removeItem('vinere_ui_zoom');
  localStorage.removeItem('vinere_usd_rate');
  localStorage.removeItem('vinere_default_multiplier');
  localStorage.removeItem('vinere_default_labor');
  localStorage.removeItem('vinere_table_density');

  location.reload();
});
