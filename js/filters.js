// ============================================================
// filters.js — search box, filter dropdowns, and pagination
// ============================================================

  // ============ SEARCH & FILTER ============
  function populateCustomerFilter() {
    const sel = $('filterCustomer');
    const current = sel.value;
    const customers = [...new Set(
      ORDERS.map(r => String(r['CUSTOMER '] ?? r['CUSTOMER'] ?? '').trim()).filter(Boolean)
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
        String(r['CUSTOMER '] ?? r['CUSTOMER'] ?? '').toLowerCase().includes(q) ||
        String(r['Style No.'] ?? '').toLowerCase().includes(q) ||
        String(r['Date'] ?? '').includes(q) ||
        String(getField(r, 'Memo No.') ?? '').toLowerCase().includes(q) ||
        String(r['Sold To'] ?? '').toLowerCase().includes(q) ||
        String(fmtNum(gramsToCarats(r['Gross Wt']), 2)).includes(q) ||
        String(fmtNum(r['IN CT'] ?? '', 2)).includes(q)
      );
    }
    if (customer) {
      filtered = filtered.filter(r => String(r['CUSTOMER '] ?? r['CUSTOMER'] ?? '').trim() === customer);
    }
    if (dateFrom) {
      filtered = filtered.filter(r => String(r['Date'] ?? '').split('T')[0] >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(r => String(r['Date'] ?? '').split('T')[0] <= dateTo);
    }
    const saleStatus = $('filterSaleStatus').value;
    if (saleStatus) {
      filtered = filtered.filter(r => {
        const soldFlag = String(r['Sale Price'] ?? '').trim() !== '';
        if (saleStatus === 'Not Sold') return !soldFlag;
        if (!soldFlag) return false;
        return (String(r['Payment Status'] ?? '').trim() || 'Unpaid') === saleStatus;
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

  // ============ PAGINATION ============
  const PAGE_SIZE = 25;
  let currentPage = 1;

  // The single entry point for showing a result set: pages it, renders the
  // table/cards for just that page, and updates the pagination controls.
  // Sorting and search/filter both flow back through here.
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

