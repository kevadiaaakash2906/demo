// ============================================================
// filters.js — search box, filter dropdowns, and pagination with ORDERS_KEYS
// ============================================================

const FK = window.ORDERS_KEYS;

function populateCustomerFilter() {
  const sel = $('filterCustomer');
  const current = sel.value;
  const customers = [...new Set(
    ORDERS.map(r => String(r[FK.customer] ?? r[FK.customerAlt] ?? '').trim()).filter(Boolean)
  )].sort();
  sel.innerHTML = '<option value="">All customers</option>' +
    customers.map(c => `<option value="${c}">${c}</option>`).join('');
  if (customers.includes(current)) sel.value = current;
}

function applyFilter() {
  const q = $('search').value.trim().toLowerCase();
  const customer = $('filterCustomer').value;
  const dateFrom = $('filterDateFrom').value;
  const dateTo = $('filterDateTo').value;

  let filtered = ORDERS;
  if (q) {
    filtered = filtered.filter(r =>
      String(r[FK.customer] ?? r[FK.customerAlt] ?? '').toLowerCase().includes(q) ||
      String(r[FK.styleNo] ?? '').toLowerCase().includes(q) ||
      String(r[FK.date] ?? '').includes(q) ||
      String(getField(r, FK.memoNo) ?? '').toLowerCase().includes(q) ||
      String(r[FK.soldTo] ?? '').toLowerCase().includes(q) ||
      String(fmtNum(gramsToCarats(r[FK.grossWt]), 2)).includes(q) ||
      String(fmtNum(r[FK.inCt] ?? '', 2)).includes(q)
    );
  }
  if (customer) {
    filtered = filtered.filter(r => String(r[FK.customer] ?? r[FK.customerAlt] ?? '').trim() === customer);
  }
  if (dateFrom) {
    filtered = filtered.filter(r => String(r[FK.date] ?? '').split('T')[0] >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter(r => String(r[FK.date] ?? '').split('T')[0] <= dateTo);
  }
  const saleStatus = $('filterSaleStatus').value;
  if (saleStatus) {
    filtered = filtered.filter(r => {
      const soldFlag = String(r[FK.salePrice] ?? '').trim() !== '';
      if (saleStatus === 'Not Sold') return !soldFlag;
      if (!soldFlag) return false;
      return (String(r[FK.paymentStatus] ?? '').trim() || 'Unpaid') === saleStatus;
    });
  }
  return sortRows(filtered);
}

let searchDebounceTimer = null;
$('search').addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => { currentPage = 1; renderResults(applyFilter()); }, 150);
});

['filterCustomer','filterDateFrom','filterDateTo','filterSaleStatus'].forEach(id => {
  $(id).addEventListener('change', () => { currentPage = 1; renderResults(applyFilter()); });
});

$('clearFiltersBtn').addEventListener('click', () => {
  $('search').value = '';
  $('filterCustomer').value = '';
  $('filterDateFrom').value = '';
  $('filterDateTo').value = '';
  $('filterSaleStatus').value = '';
  currentPage = 1;
  renderResults(applyFilter());
});

const PAGE_SIZE = 25;
var currentPage = 1;

function renderResults(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  renderTable(pageRows);
  renderPagination(rows.length, start, pageRows.length);
}

function renderPagination(total, start, pageCount) {
  const bar = $('paginationBar');
  if (!bar) return;
  if (total === 0) { bar.innerHTML = ''; return; }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  bar.innerHTML = `
    <span class="page-info">Showing ${start + 1}–${start + pageCount} of ${total} orders</span>
    <div class="page-controls">
      <button class="btn secondary small" id="prevPageBtn" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="page-num">Page ${currentPage} of ${totalPages}</span>
      <button class="btn secondary small" id="nextPageBtn" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
  $('prevPageBtn').addEventListener('click', () => { currentPage--; renderResults(applyFilter()); });
  $('nextPageBtn').addEventListener('click', () => { currentPage++; renderResults(applyFilter()); });
}
