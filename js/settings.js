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

/* ============ CHANGE PASSWORD (Security) ============
   The account password is the ONLY secret in this app, and it lives in
   Firebase Auth — never in code, Firestore, or the Sheet. Firebase lets a
   signed-in user change their own password after re-proving they know the
   current one (reauthenticateWithCredential), so staff/sellers can rotate
   passwords themselves without touching the Firebase Console. */
$('changePwBtn').addEventListener('click', async function() {
  var msgEl = $('pwMsg');
  var current = $('pwCurrent').value;
  var next = $('pwNew').value;
  var confirmPw = $('pwConfirm').value;

  function setMsg(text, ok) {
    msgEl.textContent = text;
    msgEl.className = 'pw-msg' + (ok ? ' ok' : '');
  }

  if (!current || !next || !confirmPw) return setMsg('Fill in all three fields.');
  if (next.length < 6) return setMsg('New password must be at least 6 characters.');
  if (next === current) return setMsg('New password must be different from the current one.');
  if (next !== confirmPw) return setMsg('New passwords do not match.');

  var btn = $('changePwBtn');
  btn.disabled = true;
  btn.textContent = 'Changing\u2026';
  setMsg('');

  try {
    var user = window.firebase.auth().currentUser;
    if (!user) throw { code: 'auth/no-user' };

    // Re-prove identity with the current password, then apply the new one.
    var cred = window.firebase.auth.EmailAuthProvider.credential(user.email, current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(next);

    $('pwCurrent').value = '';
    $('pwNew').value = '';
    $('pwConfirm').value = '';
    setMsg('Password changed.', true);
    showToast('Password updated', 'success', 2500);
  } catch (err) {
    // Always log the full error; also surface the raw code in the UI so
    // the exact failure mode is visible without opening DevTools.
    console.error('Password change failed', err);
    var code = err && err.code ? err.code : 'unknown';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
      setMsg('Current password is incorrect.');
    } else if (code === 'auth/too-many-requests') {
      setMsg('Too many attempts \u2014 wait a minute and try again.');
    } else if (code === 'auth/weak-password') {
      setMsg('Password too weak: ' + (err.message || 'choose a longer one.'));
    } else if (code === 'auth/requires-recent-login' || code === 'auth/user-token-expired') {
      setMsg('For security, log out and back in, then try again.');
    } else if (code === 'auth/network-request-failed') {
      setMsg('Network error \u2014 check your connection or disable ad-blocker for this site.');
    } else if (code === 'auth/no-user') {
      setMsg('You are not signed in \u2014 log out and back in, then try again.');
    } else {
      setMsg('Could not change password (' + code + ').');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Change Password';
  }
});
