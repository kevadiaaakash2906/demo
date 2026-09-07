/* ============================================
   VINÉRE — Diamond Shape Picker
   Splits the old 26-option dropdown into a
   "Shape" + "Style" pair of small dropdowns.
   The real value is still stored on the original
   hidden <select id="f_diamondShape"> so every
   other file (panel.js, table.js, app.js) keeps
   working unchanged.
   ============================================ */

var DIAMOND_SHAPE_CONFIG = {
  'Round': [
    { value: 'Round', label: 'Standard' },
    { value: 'Round Bezel', label: 'Bezel' }
  ],
  'Oval': [
    { value: 'Oval East/West', label: 'East/West' },
    { value: 'Oval North/South', label: 'North/South' },
    { value: 'Oval Bezel East/West', label: 'Bezel East/West' },
    { value: 'Oval Bezel North/South', label: 'Bezel North/South' }
  ],
  'Marquise': [
    { value: 'Marquise East/West', label: 'East/West' },
    { value: 'Marquise North/South', label: 'North/South' },
    { value: 'Marquise Bezel East/West', label: 'Bezel East/West' },
    { value: 'Marquise Bezel North/South', label: 'Bezel North/South' }
  ],
  'Emerald': [
    { value: 'Emerald East/West', label: 'East/West' },
    { value: 'Emerald North/South', label: 'North/South' },
    { value: 'Emerald Bezel East/West', label: 'Bezel East/West' },
    { value: 'Emerald Bezel North/South', label: 'Bezel North/South' }
  ],
  'Pear': [
    { value: 'Pear East/West', label: 'East/West' },
    { value: 'Pear North/South', label: 'North/South' },
    { value: 'Pear Bezel East/West', label: 'Bezel East/West' },
    { value: 'Pear Bezel North/South', label: 'Bezel North/South' }
  ],
  'Radiant': [
    { value: 'Radiant East/West', label: 'East/West' },
    { value: 'Radiant North/South', label: 'North/South' },
    { value: 'Radiant Bezel East/West', label: 'Bezel East/West' },
    { value: 'Radiant Bezel North/South', label: 'Bezel North/South' }
  ],
  'Cushion': [
    { value: 'Cushion', label: 'Standard' },
    { value: 'Cushion Bezel', label: 'Bezel' },
    { value: 'Cushion Half Bezel', label: 'Half Bezel' }
  ],
  'Fancy Mix': [
    { value: 'Fancy Mix', label: 'Standard' },
    { value: 'Fancy Mix Bezel', label: 'Bezel' }
  ]
};

function diamondShapeFindBase(value) {
  if (!value) return null;
  for (var base in DIAMOND_SHAPE_CONFIG) {
    var variants = DIAMOND_SHAPE_CONFIG[base];
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].value === value) return base;
    }
  }
  return null;
}

function diamondShapePopulateBase() {
  var sel = document.getElementById('f_diamondShapeBase');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select shape…</option>';
  Object.keys(DIAMOND_SHAPE_CONFIG).forEach(function(base) {
    var opt = document.createElement('option');
    opt.value = base;
    opt.textContent = base;
    sel.appendChild(opt);
  });
}

function diamondShapePopulateVariant(base, selectedValue) {
  var sel = document.getElementById('f_diamondShapeVariant');
  if (!sel) return;
  var variants = DIAMOND_SHAPE_CONFIG[base] || [];
  if (!variants.length) {
    sel.innerHTML = '<option value="">Select shape first…</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = '<option value="">Select style…</option>';
  variants.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.value;
    opt.textContent = v.label;
    if (v.value === selectedValue) opt.selected = true;
    sel.appendChild(opt);
  });
}

// Called by panel.js whenever the hidden f_diamondShape value is set
// programmatically (on reset, and when loading an order for edit) so
// the two visible dropdowns stay in sync with it.
window.syncDiamondShapePicker = function() {
  var hidden = document.getElementById('f_diamondShape');
  var baseSel = document.getElementById('f_diamondShapeBase');
  if (!hidden || !baseSel) return;
  var value = hidden.value || '';
  var base = diamondShapeFindBase(value);
  baseSel.value = base || '';
  diamondShapePopulateVariant(base || '', value);
};

(function initDiamondShapePicker() {
  diamondShapePopulateBase();
  diamondShapePopulateVariant('', '');

  var baseSel = document.getElementById('f_diamondShapeBase');
  var varSel = document.getElementById('f_diamondShapeVariant');
  var hidden = document.getElementById('f_diamondShape');
  if (!baseSel || !varSel || !hidden) return;

  baseSel.addEventListener('change', function() {
    diamondShapePopulateVariant(baseSel.value, '');
    hidden.value = '';
  });

  varSel.addEventListener('change', function() {
    hidden.value = varSel.value;
  });
})();
