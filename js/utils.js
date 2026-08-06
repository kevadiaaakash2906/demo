// ============================================================
// utils.js — small DOM/formatting helpers shared across modules
// ============================================================

  const $ = (id) => document.getElementById(id);

  // ============ UTILITIES ============
  function fmtMoney(n) {
    n = parseFloat(n) || 0;
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  function fmtUSD(n) {
    n = parseFloat(n) || 0;
    return '$' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function fmtNum(n, d=3) {
    n = parseFloat(n) || 0;
    return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  // 1 gram = 5 carats — used to show the seller a carat weight instead of
  // the manufacturing gram weight.
  function gramsToCarats(grams) {
    return (parseFloat(grams) || 0) * 5;
  }

  // Looks up a field by name, ignoring case and stray whitespace in the
  // sheet's actual header text. Used for fields (like the memo column)
  // where the exact header string on the live sheet might not match what
  // was assumed in code — this way a small header difference doesn't
  // silently show as blank data.
  function getField(row, wantedKey) {
    if (!row) return undefined;
    const target = wantedKey.trim().toLowerCase();
    for (const k in row) {
      if (k.trim().toLowerCase() === target) return row[k];
    }
    return undefined;
  }

  // Handles dates whether the backend sends a plain 'yyyy-MM-dd' string
  // or a full ISO timestamp like '2026-06-03T07:00:00.000Z' — displays
  // just the date, in a readable dd-Mon-yyyy form.
  function fmtDate(d) {
    if (!d) return '';
    const datePart = String(d).split('T')[0]; // strip any time/timezone portion
    const parsed = new Date(datePart + 'T00:00:00');
    if (isNaN(parsed)) return datePart;
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function excelDateToJSDate(serial) {
    if (!serial) return '';
    const n = parseFloat(serial);
    if (isNaN(n)) return serial;
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + n * 86400000);
    return date.toISOString().split('T')[0];
  }

  // Brief full-screen flash shown after a successful add or delete, so the
  // change feels felt across the whole screen, not just in the toast.
  function playScreenFx(kind) {
    const el = $('screenFx');
    if (!el) return;
    if (kind === 'delete') {
      el.style.setProperty('--fx-color', 'rgba(192,112,90,0.28)');
      el.style.setProperty('--fx-border', 'var(--bad)');
    } else {
      el.style.setProperty('--fx-color', 'rgba(184,147,90,0.28)');
      el.style.setProperty('--fx-border', 'var(--gold)');
    }
    el.classList.remove('play-add', 'play-delete');
    void el.offsetWidth; // force reflow so the animation restarts every time
    el.classList.add(kind === 'delete' ? 'play-delete' : 'play-add');
  }

  function showToast(msg, type='good') {
    const t = $('toast');
    t.textContent = msg;
    t.className = type;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  // Expose everything to window so deferred regular scripts can access them
  Object.assign(window, {
    $, fmtMoney, fmtUSD, fmtNum, gramsToCarats, getField, fmtDate, excelDateToJSDate, playScreenFx, showToast
  });
