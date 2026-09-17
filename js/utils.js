/* ============================================
   VINÉRE — Utilities + Toast System
   ============================================ */

function $(id) { return document.getElementById(id); }

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return String(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(n, currency) {
  const num = parseFloat(n);
  if (isNaN(num)) return '—';
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? currency + ' ' + formatted : formatted;
}

function sortBy(arr, key, desc) {
  return [...arr].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return desc ? bv - av : av - bv;
    }
    return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function highlightText(text, query) {
  if (!query || !text) return escapeHtml(String(text));
  const q = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(' + q + ')', 'gi');
  return escapeHtml(String(text)).replace(regex, '<mark class="search-highlight">$1</mark>');
}

/* ============ TOAST SYSTEM ============ */
var toastContainer = document.getElementById('toastContainer');

function showToast(message, type, duration) {
  if (!toastContainer) return;
  type = type || 'info';
  duration = duration || 4000;

  var titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<div class="toast-icon"></div>' +
    '<div class="toast-body"><div class="toast-title">' + titles[type] + '</div>' +
    '<div class="toast-message">' + escapeHtml(message) + '</div></div>' +
    '<button class="toast-close">&times;</button>' +
    '<div class="toast-progress" style="animation-duration:' + duration + 'ms;"></div>';

  var closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', function() { dismissToast(toast); });

  toastContainer.appendChild(toast);

  var autoDismiss = setTimeout(function() { dismissToast(toast); }, duration);

  toast.addEventListener('mouseenter', function() {
    clearTimeout(autoDismiss);
    var prog = toast.querySelector('.toast-progress');
    if (prog) prog.style.animationPlayState = 'paused';
  });
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains('toast-exit')) return;
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  });
}

/* ============ BUTTON BUSY STATE ============ */
// Disables a button and swaps its label while an async action runs,
// preventing double-submits and giving the user feedback that something is happening.
function setBusy(btn, busy, busyLabel) {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.busyOrigLabel == null) btn.dataset.busyOrigLabel = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.innerHTML = '<span>' + escapeHtml(busyLabel || 'Working…') + '</span>';
  } else {
    btn.disabled = false;
    btn.classList.remove('busy');
    if (btn.dataset.busyOrigLabel != null) {
      btn.innerHTML = btn.dataset.busyOrigLabel;
      delete btn.dataset.busyOrigLabel;
    }
  }
}

/* ============ FRIENDLY ERROR MESSAGES ============ */
// Translates raw Firebase/network errors into something a user can actually act on.
function describeError(err, fallback) {
  if (!navigator.onLine) return "You're offline — check your connection and try again.";
  var code = err && err.code;
  if (code === 'permission-denied') return "You don't have permission to do that.";
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Server is taking too long to respond. Please try again.';
  if (code === 'unauthenticated') return 'Your session expired — please log in again.';
  if (err && err.name === 'AbortError') return 'Request timed out. Please try again.';
  return fallback || 'Something went wrong. Please try again.';
}

/* ============ SOFT DELETE / UNDO ============ */
// A delete doesn't hit the server immediately: the row disappears from the UI right away,
// and an Undo toast gives the user a real window to reverse it before anything is written.
// If undo isn't clicked in time, `commit` performs the actual backend delete.
var _pendingDelete = null;

function scheduleSoftDelete(label, undoFn, commitFn, seconds) {
  seconds = seconds || 6;
  var toast = $('undoToast');
  if (!toast) { commitFn(); return; }

  // Only one undo window at a time — if another delete is already pending, finalize it now.
  if (_pendingDelete) _pendingDelete.finish(true);

  var remaining = seconds;

  function render() {
    toast.innerHTML = '<span class="undo-msg">' + escapeHtml(label) + ' — <span class="undo-count">' +
      remaining + '</span>s to undo</span><button id="undoBtn">Undo</button>';
    $('undoBtn').onclick = function() { finish(false); };
  }

  function finish(commit) {
    clearInterval(tick);
    toast.classList.remove('show');
    _pendingDelete = null;
    if (commit) return commitFn(); else undoFn();
  }

  render();
  toast.classList.add('show');

  var tick = setInterval(function() {
    remaining--;
    if (remaining <= 0) { finish(true); return; }
    render();
  }, 1000);

  _pendingDelete = { finish: finish };
}

// Forces any pending soft-delete to commit immediately. Call this before any
// full re-fetch of the underlying list (ORDERS/TRADING/EXPENSES) — otherwise
// a refetch would pull the not-yet-deleted record back from Firestore and
// make it reappear while its undo toast is still showing.
function flushPendingDelete() {
  if (_pendingDelete) return Promise.resolve(_pendingDelete.finish(true));
  return Promise.resolve();
}

/* ============ ONLINE / OFFLINE ============ */
function updateOnlineStatus() {
  var banner = document.getElementById('offlineBanner');
  if (!banner) return;
  banner.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', function() { updateOnlineStatus(); showToast('Back online', 'success', 2000); });
window.addEventListener('offline', function() { updateOnlineStatus(); showToast("You're offline", 'warning', 3000); });
updateOnlineStatus();

/* ============ HAPTIC FEEDBACK (mobile) ============ */
function haptic(type) {
  if (navigator.vibrate) {
    if (type === 'success') navigator.vibrate(40);
    else if (type === 'error') navigator.vibrate([50, 50, 50]);
    else if (type === 'light') navigator.vibrate(20);
  }
}

/* ============ EXPOSE GLOBALLY ============ */
window.$ = $;
window.fmtDate = fmtDate;
window.fmtMoney = fmtMoney;
window.sortBy = sortBy;
window.escapeHtml = escapeHtml;
window.highlightText = highlightText;
window.showToast = showToast;
window.dismissToast = dismissToast;
window.haptic = haptic;
window.setBusy = setBusy;
window.describeError = describeError;
window.scheduleSoftDelete = scheduleSoftDelete;
window.flushPendingDelete = flushPendingDelete;
window.updateOnlineStatus = updateOnlineStatus;
