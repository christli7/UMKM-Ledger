'use strict';

const STORAGE_KEYS = {
    transactions: 'umkm_transactions',
    inventory: 'umkm_inventory'
};

const BEP_TARGET = 5000000;
const DEFAULT_INVENTORY = {
    'Nasi': { cogs: 3000, price: 5000, qty: 50, minStock: 10 },
    'Tahu': { cogs: 1000, price: 2000, qty: 100, minStock: 20 },
    'Tempe': { cogs: 1500, price: 3000, qty: 80, minStock: 15 }
};

const PAYMENT_CHANNELS = [
    'QRIS / Digital Pay',
    'Cash Account',
    'Customer Debt Ledger'
];

let state = {
    transactions: [],
    inventory: {},
    activePage: 'dashboard',
    transactionFilters: {
        search: '',
        startDate: '',
        endDate: '',
        type: 'all',
        item: 'all',
        channel: 'all'
    },
    inventoryFilters: {
        search: '',
        status: 'all'
    }
};

function loadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Failed to parse ${key}`, error);
        return fallback;
    }
}

function loadInventory() {
    const stored = loadJSON(STORAGE_KEYS.inventory, null);
    const merged = { ...DEFAULT_INVENTORY };

    if (stored && typeof stored === 'object') {
        for (const [name, details] of Object.entries(stored)) {
            merged[name] = normalizeInventoryRecord(name, details);
        }
    }

    persistInventory(merged);
    return merged;
}

function loadTransactions() {
    const stored = loadJSON(STORAGE_KEYS.transactions, []);
    if (!Array.isArray(stored)) return [];

    const normalized = stored.map((tx) => normalizeTransactionRecord(tx)).filter(Boolean);
    persistTransactions(normalized);
    return normalized;
}

function normalizeTransactionRecord(tx) {
    if (!tx || typeof tx !== 'object') return null;

    const date = tx.transactionDate || tx.date || todayKey();
    const createdAt = tx.createdAt || `${date}T${tx.timestamp || '00:00'}:00`;

    return {
        id: Number(tx.id) || Date.now() + Math.floor(Math.random() * 1000),
        type: tx.type === 'expense' ? 'expense' : 'income',
        item: String(tx.item || '').trim() || 'Unknown item',
        qty: Math.max(1, Number(tx.qty) || 1),
        amount: Math.max(0, Number(tx.amount) || 0),
        channel: PAYMENT_CHANNELS.includes(tx.channel) ? tx.channel : PAYMENT_CHANNELS[0],
        notes: String(tx.notes || '').trim(),
        transactionDate: isValidDateKey(date) ? date : todayKey(),
        createdAt,
        updatedAt: tx.updatedAt || createdAt
    };
}

function normalizeInventoryRecord(name, details) {
    const safe = details && typeof details === 'object' ? details : {};
    return {
        cogs: Math.max(0, Number(safe.cogs) || 0),
        price: Math.max(0, Number(safe.price) || 0),
        qty: Math.max(0, Number(safe.qty) || 0),
        minStock: Math.max(0, Number(safe.minStock) || 0),
        archived: Boolean(safe.archived)
    };
}

function persistTransactions(nextTransactions) {
    state.transactions = nextTransactions;
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(nextTransactions));
}

function persistInventory(nextInventory) {
    state.inventory = nextInventory;
    localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(nextInventory));
}

function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(value) || 0).replace('Rp', 'Rp ');
}

function todayKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function isValidDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function toJakartaDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
}

function toJakartaDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'medium'
    }).format(date);
}

function normalizeSearch(value) {
    return String(value || '').toLowerCase().trim();
}

function cloneInventory(source) {
    return JSON.parse(JSON.stringify(source));
}

function getInventoryNames(includeArchivedTxItem = null) {
    const names = new Set(Object.entries(state.inventory).filter(([, item]) => !item.archived).map(([name]) => name));
    if (includeArchivedTxItem) names.add(includeArchivedTxItem);
    return [...names].sort((a, b) => a.localeCompare(b, 'id'));
}

function getUnifiedTransactionItems() {
    const names = new Set(Object.keys(state.inventory));
    state.transactions.forEach((tx) => names.add(tx.item));
    return [...names].sort((a, b) => a.localeCompare(b, 'id'));
}

function getFilteredTransactions() {
    const { search, startDate, endDate, type, item, channel } = state.transactionFilters;
    const query = normalizeSearch(search);

    return [...state.transactions]
        .filter((tx) => {
            if (type !== 'all' && tx.type !== type) return false;
            if (item !== 'all' && tx.item !== item) return false;
            if (channel !== 'all' && tx.channel !== channel) return false;
            if (startDate && tx.transactionDate < startDate) return false;
            if (endDate && tx.transactionDate > endDate) return false;

            if (!query) return true;
            const haystack = normalizeSearch([
                tx.item,
                tx.notes,
                tx.channel,
                tx.type,
                tx.amount,
                tx.qty,
                tx.transactionDate
            ].join(' '));
            return haystack.includes(query);
        })
        .sort((a, b) => {
            if (a.transactionDate !== b.transactionDate) return b.transactionDate.localeCompare(a.transactionDate);
            return Number(b.id) - Number(a.id);
        });
}

function getFilteredInventory() {
    const { search, status } = state.inventoryFilters;
    const query = normalizeSearch(search);

    return Object.entries(state.inventory)
        .map(([name, details]) => ({ name, ...details }))
        .filter((item) => {
            const low = item.qty > 0 && item.qty <= item.minStock;
            const out = item.qty <= 0;
            if (status === 'active' && item.archived) return false;
            if (status === 'archived' && !item.archived) return false;
            if (status === 'low' && (item.archived || !low)) return false;
            if (status === 'out' && (item.archived || !out)) return false;
            if (status === 'healthy' && (item.archived || low || out)) return false;
            if (!query) return true;
            const haystack = normalizeSearch([item.name, item.qty, item.cogs, item.price, item.minStock, item.archived ? 'archived' : 'active'].join(' '));
            return haystack.includes(query);
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

function getTransactionEffect(tx) {
    const deltaQty = tx.type === 'income' ? -tx.qty : tx.qty;
    return { item: tx.item, deltaQty };
}

function applyTransactionEffect(inventorySnapshot, tx, direction = 1) {
    const effect = getTransactionEffect(tx);
    const item = inventorySnapshot[effect.item];
    if (!item) return { ok: false, reason: `Item "${effect.item}" tidak ada di inventory.` };

    const nextQty = item.qty + (effect.deltaQty * direction);
    if (nextQty < 0) return { ok: false, reason: `Stok ${effect.item} tidak cukup untuk menyimpan perubahan.` };

    item.qty = nextQty;
    return { ok: true };
}

function calculateDailyMetrics() {
    const today = todayKey();
    const todayTransactions = state.transactions.filter((tx) => tx.transactionDate === today);
    const dailyRevenue = todayTransactions
        .filter((tx) => tx.type === 'income')
        .reduce((sum, tx) => sum + tx.amount, 0);
    const salesCount = todayTransactions.filter((tx) => tx.type === 'income').length;
    const capitalValuation = Object.values(state.inventory)
        .filter((item) => !item.archived)
        .reduce((sum, item) => sum + (item.cogs * item.qty), 0);

    return { todayTransactions, dailyRevenue, salesCount, capitalValuation };
}

function setTodayLabel() {
    document.getElementById('today-label').textContent = toJakartaDate(new Date());
    document.getElementById('entry-date').value = todayKey();
}

function populateItemSelects() {
    const activeNames = Object.keys(state.inventory).sort((a, b) => a.localeCompare(b, 'id'));
    const transactionItems = getUnifiedTransactionItems();

    const quickSelect = document.getElementById('entry-item');
    quickSelect.innerHTML = activeNames.length
        ? activeNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')
        : '<option value="" disabled selected>No active inventory item</option>';

    const filterSelect = document.getElementById('tx-item');
    filterSelect.innerHTML = ['<option value="all">All Items</option>']
        .concat(transactionItems.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`))
        .join('');
}


function syncFilterControls() {
    document.getElementById('tx-search').value = state.transactionFilters.search;
    document.getElementById('tx-start-date').value = state.transactionFilters.startDate;
    document.getElementById('tx-end-date').value = state.transactionFilters.endDate;
    document.getElementById('tx-type').value = state.transactionFilters.type;
    document.getElementById('tx-item').value = state.transactionFilters.item;
    document.getElementById('tx-channel').value = state.transactionFilters.channel;
    document.getElementById('inventory-search').value = state.inventoryFilters.search;
    document.getElementById('inventory-status-filter').value = state.inventoryFilters.status;
}

function renderApp() {
    setTodayLabel();
    populateItemSelects();
    syncFilterControls();
    renderDashboard();
    renderTransactions();
    renderInventory();
    updatePageVisibility(state.activePage);
}

function renderDashboard() {
    const { todayTransactions, dailyRevenue, salesCount, capitalValuation } = calculateDailyMetrics();
    const feed = document.getElementById('ledger-feed');

    document.getElementById('daily-revenue-metric').textContent = formatCurrency(dailyRevenue);
    document.getElementById('daily-sales-count').textContent = `${salesCount} transaksi penjualan hari ini`;
    document.getElementById('capital-valuation-metric').textContent = formatCurrency(capitalValuation);
    document.getElementById('today-count-badge').textContent = `${todayTransactions.length} records`;

    const percentage = (dailyRevenue / BEP_TARGET) * 100;
    const barWidth = Math.min(100, Math.max(0, percentage));
    document.getElementById('bep-text').textContent = `${percentage.toFixed(1)}%`;
    document.getElementById('bep-bar').style.width = `${barWidth}%`;
    document.getElementById('bep-current-text').textContent = formatCurrency(dailyRevenue);

    if (!todayTransactions.length) {
        feed.innerHTML = '<div class="empty-state">Belum ada transaksi hari ini. Tambahkan transaksi untuk mulai melacak ledger.</div>';
        return;
    }

    const sorted = [...todayTransactions].sort((a, b) => Number(b.id) - Number(a.id));
    feed.innerHTML = sorted.map((tx) => renderStreamItem(tx)).join('');
}

function renderStreamItem(tx) {
    const isIncome = tx.type === 'income';
    const sign = isIncome ? '+' : '-';
    const amountClass = isIncome ? 'amt-pos' : 'amt-neg';
    const badge = isIncome ? '<span class="badge badge-success">Sale</span>' : '<span class="badge badge-warning">Restock</span>';
    const notes = tx.notes ? escapeHtml(tx.notes) : 'No notes';

    return `
        <div class="stream-item">
            <div>
                <div class="stream-title">${badge} ${escapeHtml(tx.item)} · ${tx.qty} pcs</div>
                <div class="stream-meta">
                    <span>${escapeHtml(tx.transactionDate)}</span>
                    <span>${escapeHtml(tx.channel)}</span>
                    <span>${notes}</span>
                </div>
                <div class="stream-meta" style="margin-top:6px;">
                    <span>Created ${escapeHtml(toJakartaDateTime(tx.createdAt))}</span>
                </div>
            </div>
            <div class="stream-amount ${amountClass}">${sign}${formatCurrency(tx.amount)}</div>
        </div>
    `;
}

function renderTransactions() {
    const rows = getFilteredTransactions();
    const body = document.getElementById('transactions-table-body');
    const summary = document.getElementById('transaction-summary-strip');

    const totalIncome = rows.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const totalExpense = rows.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    const net = totalIncome - totalExpense;

    summary.innerHTML = [
        `Records: ${rows.length}`,
        `Income: ${formatCurrency(totalIncome)}`,
        `Expense: ${formatCurrency(totalExpense)}`,
        `Net: ${formatCurrency(net)}`
    ].map((text) => `<span class="summary-chip">${text}</span>`).join('');

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8"><div class="empty-state">Tidak ada transaksi yang cocok dengan filter saat ini.</div></td></tr>';
        return;
    }

    body.innerHTML = rows.map((tx) => {
        const notes = tx.notes ? escapeHtml(tx.notes) : '<span class="muted">—</span>';
        const typeBadge = tx.type === 'income'
            ? '<span class="badge badge-success">Sale</span>'
            : '<span class="badge badge-warning">Restock</span>';

        return `
            <tr>
                <td>${escapeHtml(tx.transactionDate)}<br><span class="muted">${escapeHtml(toJakartaDateTime(tx.createdAt))}</span></td>
                <td>${typeBadge}</td>
                <td><strong>${escapeHtml(tx.item)}</strong></td>
                <td>${tx.qty}</td>
                <td>${formatCurrency(tx.amount)}</td>
                <td>${escapeHtml(tx.channel)}</td>
                <td>${notes}</td>
                <td>
                    <div class="table-actions">
                        <button class="action-link" data-edit-transaction="${tx.id}">Edit</button>
                        <button class="action-link danger" data-delete-transaction="${tx.id}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderInventory() {
    const rows = getFilteredInventory();
    const body = document.getElementById('inventory-table-body');

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="8"><div class="empty-state">Tidak ada item yang cocok dengan filter inventory.</div></td></tr>';
        return;
    }

    body.innerHTML = rows.map((item) => {
        const margin = item.price > 0 ? ((item.price - item.cogs) / item.price) * 100 : 0;
        const asset = item.cogs * item.qty;
        let status = '<span class="badge badge-success">Healthy</span>';
        if (item.archived) status = '<span class="badge badge-danger">Archived</span>';
        else if (item.qty <= 0) status = '<span class="badge badge-danger">Out of stock</span>';
        else if (item.qty <= item.minStock) status = `<span class="badge badge-warning">Low stock</span>`;

        const actions = item.archived
            ? `<button class="action-link" data-edit-item="${escapeHtml(item.name)}">Edit</button><button class="action-link" data-restore-item="${escapeHtml(item.name)}">Restore</button>`
            : `<button class="action-link" data-edit-item="${escapeHtml(item.name)}">Edit</button><button class="action-link danger" data-delete-item="${escapeHtml(item.name)}">Delete</button>`;

        return `
            <tr>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${item.qty}</td>
                <td>${formatCurrency(item.cogs)}</td>
                <td>${formatCurrency(item.price)}</td>
                <td>${margin.toFixed(1)}%</td>
                <td>${formatCurrency(asset)}</td>
                <td>${status}</td>
                <td>
                    <div class="table-actions">
                        ${actions}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updatePageVisibility(page) {
    document.querySelectorAll('.page').forEach((section) => {
        section.classList.toggle('active', section.id === `page-${page}`);
    });
    document.querySelectorAll('.nav-pill').forEach((button) => {
        button.classList.toggle('active', button.dataset.page === page);
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function addTransaction(event) {
    event.preventDefault();

    const type = document.getElementById('entry-type').value;
    const item = document.getElementById('entry-item').value;
    const qty = Number(document.getElementById('entry-qty').value);
    const amount = Number(document.getElementById('entry-amount').value);
    const channel = document.getElementById('entry-channel').value;
    const notes = document.getElementById('entry-notes').value.trim();
    const transactionDate = document.getElementById('entry-date').value;

    if (!state.inventory[item] || state.inventory[item].archived) {
        alert(`Item "${item}" belum aktif di inventory. Aktifkan kembali di Page 3 terlebih dahulu.`);
        return;
    }

    if (!Number.isFinite(qty) || qty < 1 || !Number.isFinite(amount) || amount < 1 || !transactionDate) {
        alert('Lengkapi data transaksi dengan benar.');
        return;
    }

    const workingInventory = cloneInventory(state.inventory);
    const tempTx = { type, item, qty, amount, channel, notes, transactionDate };
    const result = applyTransactionEffect(workingInventory, tempTx, 1);
    if (!result.ok) {
        alert(result.reason);
        return;
    }

    const tx = {
        id: Date.now(),
        type,
        item,
        qty,
        amount,
        channel,
        notes,
        transactionDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    persistInventory(workingInventory);
    persistTransactions([...state.transactions, tx]);

    event.target.reset();
    document.getElementById('entry-date').value = todayKey();
    renderApp();
}

function openTransactionModal(txId) {
    const tx = state.transactions.find((entry) => String(entry.id) === String(txId));
    if (!tx) return;

    const itemSelect = document.getElementById('edit-transaction-item');
    const options = getInventoryNames(tx.item)
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join('');
    itemSelect.innerHTML = options;

    document.getElementById('edit-transaction-id').value = tx.id;
    document.getElementById('edit-transaction-type').value = tx.type;
    itemSelect.value = tx.item;
    document.getElementById('edit-transaction-qty').value = tx.qty;
    document.getElementById('edit-transaction-amount').value = tx.amount;
    document.getElementById('edit-transaction-channel').value = tx.channel;
    document.getElementById('edit-transaction-date').value = tx.transactionDate;
    document.getElementById('edit-transaction-notes').value = tx.notes || '';

    openModal('transaction-modal');
}

function saveEditedTransaction(event) {
    event.preventDefault();

    const txId = Number(document.getElementById('edit-transaction-id').value);
    const index = state.transactions.findIndex((entry) => Number(entry.id) === txId);
    if (index === -1) return;

    const oldTx = state.transactions[index];
    const nextTx = {
        ...oldTx,
        type: document.getElementById('edit-transaction-type').value,
        item: document.getElementById('edit-transaction-item').value,
        qty: Number(document.getElementById('edit-transaction-qty').value),
        amount: Number(document.getElementById('edit-transaction-amount').value),
        channel: document.getElementById('edit-transaction-channel').value,
        transactionDate: document.getElementById('edit-transaction-date').value,
        notes: document.getElementById('edit-transaction-notes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    if (!Number.isFinite(nextTx.qty) || nextTx.qty < 1 || !Number.isFinite(nextTx.amount) || nextTx.amount < 1 || !nextTx.transactionDate) {
        alert('Data transaksi tidak valid.');
        return;
    }

    const workingInventory = cloneInventory(state.inventory);
    const revertOld = applyTransactionEffect(workingInventory, oldTx, -1);
    if (!revertOld.ok) {
        alert(revertOld.reason);
        return;
    }

    const applyNew = applyTransactionEffect(workingInventory, nextTx, 1);
    if (!applyNew.ok) {
        alert(applyNew.reason);
        return;
    }

    const updatedTransactions = [...state.transactions];
    updatedTransactions[index] = nextTx;
    persistInventory(workingInventory);
    persistTransactions(updatedTransactions);
    closeModal('transaction-modal');
    renderApp();
}

function deleteTransaction(txId) {
    const tx = state.transactions.find((entry) => String(entry.id) === String(txId));
    if (!tx) return;

    const confirmed = confirm(`Hapus transaksi ${tx.item} (${tx.qty} pcs) pada ${tx.transactionDate}?`);
    if (!confirmed) return;

    const workingInventory = cloneInventory(state.inventory);
    const revert = applyTransactionEffect(workingInventory, tx, -1);
    if (!revert.ok) {
        alert(revert.reason);
        return;
    }

    persistInventory(workingInventory);
    persistTransactions(state.transactions.filter((entry) => String(entry.id) !== String(txId)));
    renderApp();
}

function saveInventoryItem(event) {
    event.preventDefault();

    const originalName = document.getElementById('inventory-original-name').value.trim();
    const name = document.getElementById('inventory-name').value.trim();
    const cogs = Number(document.getElementById('inventory-cogs').value);
    const price = Number(document.getElementById('inventory-price').value);
    const qty = Number(document.getElementById('inventory-qty').value);
    const minStock = Number(document.getElementById('inventory-min-stock').value);

    if (!name || !Number.isFinite(cogs) || !Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(minStock)) {
        alert('Lengkapi data inventory dengan benar.');
        return;
    }

    const nextInventory = cloneInventory(state.inventory);

    if (originalName && originalName !== name) {
        if (nextInventory[name]) {
            alert('Nama item baru sudah dipakai item lain.');
            return;
        }
        nextInventory[name] = { ...nextInventory[originalName], cogs, price, qty, minStock, archived: nextInventory[originalName]?.archived || false };
        delete nextInventory[originalName];
        state.transactions = state.transactions.map((tx) => tx.item === originalName ? { ...tx, item: name } : tx);
        persistTransactions(state.transactions);
    } else {
        nextInventory[name] = { cogs, price, qty, minStock, archived: nextInventory[name]?.archived || false };
    }

    persistInventory(nextInventory);
    resetInventoryForm();
    renderApp();
}

function editInventoryItem(name) {
    const item = state.inventory[name];
    if (!item) return;

    document.getElementById('inventory-original-name').value = name;
    document.getElementById('inventory-name').value = name;
    document.getElementById('inventory-cogs').value = item.cogs;
    document.getElementById('inventory-price').value = item.price;
    document.getElementById('inventory-qty').value = item.qty;
    document.getElementById('inventory-min-stock').value = item.minStock;
    document.getElementById('inventory-form-title').textContent = `Edit item: ${name}`;
    document.getElementById('inventory-save-btn').textContent = 'Update Item';
}

function deleteInventoryItem(name) {
    const confirmed = confirm(`Arsipkan item ${name} dari inventory aktif?`);
    if (!confirmed) return;

    const nextInventory = cloneInventory(state.inventory);
    if (!nextInventory[name]) return;
    nextInventory[name].archived = true;
    persistInventory(nextInventory);
    resetInventoryForm();
    renderApp();
}

function restoreInventoryItem(name) {
    const nextInventory = cloneInventory(state.inventory);
    if (!nextInventory[name]) return;
    nextInventory[name].archived = false;
    persistInventory(nextInventory);
    renderApp();
}

function resetInventoryForm() {
    document.getElementById('inventory-form').reset();
    document.getElementById('inventory-original-name').value = '';
    document.getElementById('inventory-form-title').textContent = 'Add item';
    document.getElementById('inventory-save-btn').textContent = 'Save Item';
}

function exportTransactions() {
    const rows = getFilteredTransactions();
    const wb = XLSX.utils.book_new();
    const sheetRows = [
        ['Date', 'Created At', 'Type', 'Item', 'Qty', 'Amount', 'Channel', 'Notes']
    ].concat(rows.map((tx) => [
        tx.transactionDate,
        toJakartaDateTime(tx.createdAt),
        tx.type,
        tx.item,
        tx.qty,
        tx.amount,
        tx.channel,
        tx.notes || ''
    ]));
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const filteredIncome = rows.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const filteredExpense = rows.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    const summarySheet = XLSX.utils.aoa_to_sheet([
        ['Filtered Transaction Export'],
        ['Records', rows.length],
        ['Income', filteredIncome],
        ['Expense', filteredExpense],
        ['Net', filteredIncome - filteredExpense]
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const filename = `UMKM_Transactions_${todayKey()}.xlsx`;
    XLSX.writeFile(wb, filename);
}

function exportInventory() {
    const wb = XLSX.utils.book_new();
    const rows = Object.entries(state.inventory)
        .map(([name, item]) => {
            const margin = item.price > 0 ? ((item.price - item.cogs) / item.price) * 100 : 0;
            const asset = item.cogs * item.qty;
            return {
                Item: name,
                COGS: item.cogs,
                Price: item.price,
                Qty: item.qty,
                MinStock: item.minStock,
                MarginPercent: Number(margin.toFixed(1)),
                AssetValue: asset,
                Status: item.qty <= 0 ? 'Out of stock' : item.qty <= item.minStock ? 'Low stock' : 'Healthy'
            };
        })
        .sort((a, b) => a.Item.localeCompare(b.Item, 'id'));

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

    const raw = XLSX.utils.aoa_to_sheet([
        ['Item', 'COGS', 'Price', 'Qty', 'Min Stock']
    ].concat(rows.map((row) => [row.Item, row.COGS, row.Price, row.Qty, row.MinStock])));
    XLSX.utils.book_append_sheet(wb, raw, 'Raw Storage');

    XLSX.writeFile(wb, `UMKM_Inventory_${todayKey()}.xlsx`);
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function wireEvents() {
    document.querySelectorAll('.nav-pill').forEach((button) => {
        button.addEventListener('click', () => {
            state.activePage = button.dataset.page;
            updatePageVisibility(state.activePage);
        });
    });

    document.getElementById('ledger-form').addEventListener('submit', addTransaction);
    document.getElementById('transaction-edit-form').addEventListener('submit', saveEditedTransaction);
    document.getElementById('inventory-form').addEventListener('submit', saveInventoryItem);
    document.getElementById('inventory-cancel-btn').addEventListener('click', resetInventoryForm);

    document.getElementById('tx-search').addEventListener('input', (event) => {
        state.transactionFilters.search = event.target.value;
        renderTransactions();
    });
    document.getElementById('tx-start-date').addEventListener('change', (event) => {
        state.transactionFilters.startDate = event.target.value;
        renderTransactions();
    });
    document.getElementById('tx-end-date').addEventListener('change', (event) => {
        state.transactionFilters.endDate = event.target.value;
        renderTransactions();
    });
    document.getElementById('tx-type').addEventListener('change', (event) => {
        state.transactionFilters.type = event.target.value;
        renderTransactions();
    });
    document.getElementById('tx-item').addEventListener('change', (event) => {
        state.transactionFilters.item = event.target.value;
        renderTransactions();
    });
    document.getElementById('tx-channel').addEventListener('change', (event) => {
        state.transactionFilters.channel = event.target.value;
        renderTransactions();
    });

    document.getElementById('reset-transaction-filters').addEventListener('click', () => {
        state.transactionFilters = {
            search: '',
            startDate: '',
            endDate: '',
            type: 'all',
            item: 'all',
            channel: 'all'
        };
        document.getElementById('tx-search').value = '';
        document.getElementById('tx-start-date').value = '';
        document.getElementById('tx-end-date').value = '';
        document.getElementById('tx-type').value = 'all';
        document.getElementById('tx-item').value = 'all';
        document.getElementById('tx-channel').value = 'all';
        renderTransactions();
    });

    document.getElementById('export-transactions-btn').addEventListener('click', exportTransactions);
    document.getElementById('export-inventory-btn').addEventListener('click', exportInventory);

    document.getElementById('inventory-search').addEventListener('input', (event) => {
        state.inventoryFilters.search = event.target.value;
        renderInventory();
    });
    document.getElementById('inventory-status-filter').addEventListener('change', (event) => {
        state.inventoryFilters.status = event.target.value;
        renderInventory();
    });

    document.getElementById('transactions-table-body').addEventListener('click', (event) => {
        const editId = event.target.closest('[data-edit-transaction]')?.dataset.editTransaction;
        const deleteId = event.target.closest('[data-delete-transaction]')?.dataset.deleteTransaction;
        if (editId) openTransactionModal(editId);
        if (deleteId) deleteTransaction(deleteId);
    });

    document.getElementById('inventory-table-body').addEventListener('click', (event) => {
        const editName = event.target.closest('[data-edit-item]')?.dataset.editItem;
        const deleteName = event.target.closest('[data-delete-item]')?.dataset.deleteItem;
        const restoreName = event.target.closest('[data-restore-item]')?.dataset.restoreItem;
        if (editName) editInventoryItem(editName);
        if (deleteName) deleteInventoryItem(deleteName);
        if (restoreName) restoreInventoryItem(restoreName);
    });

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.getElementById('transaction-modal').addEventListener('click', (event) => {
        if (event.target.id === 'transaction-modal') closeModal('transaction-modal');
    });

    document.getElementById('entry-type').addEventListener('change', updateEntryItemAvailability);
}

function updateEntryItemAvailability() {
    const type = document.getElementById('entry-type').value;
    const helper = document.getElementById('entry-item');
    if (!helper.options.length) return;

    if (type === 'expense') {
        helper.title = 'Pilih item untuk restock';
    } else {
        helper.title = 'Pilih item untuk penjualan';
    }
}

function init() {
    state.transactions = loadTransactions();
    state.inventory = loadInventory();
    wireEvents();
    renderApp();
    updateEntryItemAvailability();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((error) => {
                console.warn('Service worker registration failed', error);
            });
        });
    }

    document.getElementById('sync-badge').textContent = 'Ready';
}

window.addEventListener('DOMContentLoaded', init);
