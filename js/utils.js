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

/* ============ EXPOSE GLOBALLY ============ */
window.$ = $;
window.fmtDate = fmtDate;
window.fmtMoney = fmtMoney;
window.sortBy = sortBy;
window.escapeHtml = escapeHtml;
window.highlightText = highlightText;
window.showToast = showToast;
window.dismissToast = dismissToast;
