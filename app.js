// --- STATE MANAGEMENT ---
let transactions = JSON.parse(localStorage.getItem('umkm_transactions')) || [];
const defaultInventory = {
    'Nasi': { cogs: 3000, price: 5000, qty: 50, minStock: 10 },
    'Tahu': { cogs: 1000, price: 2000, qty: 100, minStock: 20 },
    'Tempe':{ cogs: 1500, price: 3000, qty: 80, minStock: 15 }
};
let inventory = JSON.parse(localStorage.getItem('umkm_inventory')) || defaultInventory;

const BEP_TARGET = 5000000;

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    populateItemDropdowns();
    renderDashboard();
    
    // Bug Fix 1: Attach Event Listeners for Auto Calculation
    document.getElementById('entry-type').addEventListener('change', calculateTotalAmount);
    document.getElementById('entry-item').addEventListener('change', calculateTotalAmount);
    document.getElementById('entry-qty').addEventListener('input', calculateTotalAmount);
});

// --- HELPER FUNCTIONS ---
const formatRupiah = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
const getTodayStr = () => new Date().toISOString().split('T')[0];

// BUG FIX 1: The missing function from original code
function calculateTotalAmount() {
    const type = document.getElementById('entry-type').value;
    const itemName = document.getElementById('entry-item').value;
    const qty = parseInt(document.getElementById('entry-qty').value, 10) || 0;
    
    if (inventory[itemName]) {
        // Jika income (jual) gunakan price, jika expense (restock) gunakan cogs
        const unitValue = type === 'income' ? inventory[itemName].price : inventory[itemName].cogs;
        document.getElementById('entry-amount').value = unitValue * qty;
    }
}

function populateItemDropdowns() {
    const select = document.getElementById('entry-item');
    select.innerHTML = '';
    Object.keys(inventory).forEach(item => {
        select.innerHTML += `<option value="${item}">${item} (Stock: ${inventory[item].qty})</option>`;
    });
}

// --- NAVIGATION LOGIC ---
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            views.forEach(view => view.classList.add('hidden'));

            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
            
            // Set Title & Render specific view
            pageTitle.innerText = item.innerText.trim();
            if(targetId === 'view-dashboard') renderDashboard();
            if(targetId === 'view-transactions') renderTransactions();
            if(targetId === 'view-inventory') renderInventory();
        });
    });
}

// --- CORE: DASHBOARD LOGIC (PAGE 1) ---
function renderDashboard() {
    populateItemDropdowns(); // Refresh dropdown
    
    let currentRevenue = 0;
    let salesCount = 0;
    let totalCapital = 0;
    const todayStr = getTodayStr();
    
    // Capital Valuation
    for (const [itemName, details] of Object.entries(inventory)) {
        totalCapital += (details.cogs * details.qty);
    }

    // Filter Today's Transactions for Feed
    const feedContainer = document.getElementById('dashboard-feed');
    feedContainer.innerHTML = '';
    
    // Only current month for BEP logic
    const currentMonthStr = todayStr.substring(0, 7); 

    transactions.forEach(t => {
        // Hitung BEP & Revenue (Bulanan & Harian)
        if (t.type === 'income') {
            if(t.date && t.date.startsWith(currentMonthStr)) {
                currentRevenue += t.amount; // Monthly BEP calculation
            }
        }
    });

    // Today's specific metrics
    let todayRevenue = 0;
    let todaySales = 0;
    
    const todaysTransactions = transactions.filter(t => t.date === todayStr).reverse();
    
    if (todaysTransactions.length === 0) {
        feedContainer.innerHTML = `<div class="text-muted" style="text-align:center; padding:20px;">No transactions recorded today.</div>`;
    } else {
        todaysTransactions.forEach(t => {
            if (t.type === 'income') {
                todayRevenue += t.amount;
                todaySales += 1;
            }
            
            const isIncome = t.type === 'income';
            feedContainer.innerHTML += `
                <div class="stream-item">
                    <div class="stream-info">
                        <h4>${isIncome ? 'Sold' : 'Restocked'} ${t.qty}x ${t.item}</h4>
                        <p>${t.time} • ${t.channel}</p>
                    </div>
                    <div class="${isIncome ? 'text-success' : 'text-danger'}" style="font-weight: 600;">
                        ${isIncome ? '+' : '-'}${formatRupiah(t.amount)}
                    </div>
                </div>
            `;
        });
    }

    // Update UI
    document.getElementById('daily-revenue-metric').innerText = formatRupiah(todayRevenue);
    document.getElementById('daily-sales-count').innerHTML = `<i class='bx bx-check-circle'></i> ${todaySales} Sales Today`;
    document.getElementById('capital-valuation-metric').innerText = formatRupiah(totalCapital);
    
    // BEP UI
    let bepPercent = (currentRevenue / BEP_TARGET) * 100;
    document.getElementById('bep-text').innerText = `${bepPercent.toFixed(1)}%`;
    document.getElementById('bep-bar').style.width = `${Math.min(bepPercent, 100)}%`;
    document.getElementById('bep-bar').style.backgroundColor = bepPercent >= 100 ? 'var(--success)' : 'var(--brand)';
    document.getElementById('bep-current-text').innerText = formatRupiah(currentRevenue);
}

// Tambah Transaksi
function addLedgerEntry(event) {
    event.preventDefault();
    const type = document.getElementById('entry-type').value;
    const item = document.getElementById('entry-item').value;
    const qty = parseInt(document.getElementById('entry-qty').value, 10);
    const amount = parseInt(document.getElementById('entry-amount').value, 10);
    const channel = document.getElementById('entry-channel').value;
    
    const now = new Date();
    
    // Guardrail stock
    if (type === 'income' && inventory[item].qty < qty) {
        alert(`Failed: Not enough stock! You only have ${inventory[item].qty} ${item}.`);
        return;
    }

    // Update Inventory
    if (type === 'income') inventory[item].qty -= qty;
    else inventory[item].qty += qty;
    
    localStorage.setItem('umkm_inventory', JSON.stringify(inventory));

    // Bug Fix 2: Menyimpan tanggal `date` agar bisa di-filter di Page 2
    transactions.push({
        id: Date.now(),
        type: type,
        item: item,
        qty: qty,
        amount: amount,
        channel: channel,
        date: getTodayStr(), 
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    localStorage.setItem('umkm_transactions', JSON.stringify(transactions));

    document.getElementById('ledger-form').reset();
    renderDashboard();
}

// --- CORE: TRANSACTIONS LOGIC (PAGE 2) ---
function renderTransactions() {
    const tbody = document.getElementById('tx-table-body');
    tbody.innerHTML = '';
    
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const typeFilter = document.getElementById('filter-type').value;

    let filtered = transactions.slice().reverse();

    if (startDate) filtered = filtered.filter(t => t.date >= startDate);
    if (endDate) filtered = filtered.filter(t => t.date <= endDate);
    if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No transactions found.</td></tr>`;
        return;
    }

    filtered.forEach(t => {
        const isIncome = t.type === 'income';
        const badgeClass = isIncome ? 'badge-success' : 'badge-danger';
        tbody.innerHTML += `
            <tr>
                <td>${t.date} <span class="text-muted text-sm">${t.time}</span></td>
                <td><span class="badge ${badgeClass}">${t.type.toUpperCase()}</span></td>
                <td><strong>${t.item}</strong></td>
                <td>${t.qty}</td>
                <td>${formatRupiah(t.amount)}</td>
                <td>${t.channel}</td>
                <td>
                    <button class="btn btn-danger" onclick="deleteTransaction(${t.id})">
                        <i class='bx bx-trash'></i> Delete
                    </button>
                </td>
            </tr>
        `;
    });
}

function deleteTransaction(id) {
    if(!confirm('Are you sure you want to delete this transaction? Stock will be reverted.')) return;
    
    const txIndex = transactions.findIndex(t => t.id === id);
    if(txIndex > -1) {
        const tx = transactions[txIndex];
        // Revert Inventory
        if(inventory[tx.item]) {
            if(tx.type === 'income') inventory[tx.item].qty += tx.qty; // cancel sale = add stock
            else inventory[tx.item].qty -= tx.qty; // cancel restock = min stock
        }
        
        transactions.splice(txIndex, 1);
        localStorage.setItem('umkm_transactions', JSON.stringify(transactions));
        localStorage.setItem('umkm_inventory', JSON.stringify(inventory));
        renderTransactions();
    }
}

// --- CORE: INVENTORY LOGIC (PAGE 3) ---
function renderInventory() {
    const tbody = document.getElementById('inv-table-body');
    tbody.innerHTML = '';
    
    const search = document.getElementById('inv-search').value.toLowerCase();
    const statusFilter = document.getElementById('inv-filter-status').value;
    
    let items = Object.keys(inventory);

    // Apply Filters
    if (search) items = items.filter(name => name.toLowerCase().includes(search));
    
    items.forEach(itemName => {
        const details = inventory[itemName];
        const isLow = details.qty <= details.minStock;
        
        if (statusFilter === 'low' && !isLow) return; // Skip if filter is low stock but item is fine
        
        const margin = ((details.price - details.cogs) / details.price) * 100;
        let badgeHtml = `<span class="badge badge-success">Good</span>`;
        if (details.qty <= 0) badgeHtml = `<span class="badge badge-danger">Out of Stock</span>`;
        else if (isLow) badgeHtml = `<span class="badge badge-warning">Low (Min ${details.minStock})</span>`;

        tbody.innerHTML += `
            <tr>
                <td><strong>${itemName}</strong></td>
                <td>${details.qty}</td>
                <td>${formatRupiah(details.cogs)}</td>
                <td>${formatRupiah(details.price)}</td>
                <td class="text-success">${margin.toFixed(1)}%</td>
                <td>${badgeHtml}</td>
                <td>
                    <button class="btn btn-secondary" onclick="editInventoryItem('${itemName}')"><i class='bx bx-edit'></i> Edit</button>
                    <button class="btn btn-danger" onclick="deleteInventoryItem('${itemName}')"><i class='bx bx-trash'></i></button>
                </td>
            </tr>
        `;
    });
}

// Modal Logic
function openInventoryModal() {
    document.getElementById('form-inventory').reset();
    document.getElementById('inv-original-name').value = '';
    document.getElementById('inv-modal-title').innerText = 'Add New Item';
    document.getElementById('modal-inventory').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function editInventoryItem(itemName) {
    const details = inventory[itemName];
    document.getElementById('inv-original-name').value = itemName;
    document.getElementById('inv-name').value = itemName;
    document.getElementById('inv-qty').value = details.qty;
    document.getElementById('inv-min').value = details.minStock;
    document.getElementById('inv-cogs').value = details.cogs;
    document.getElementById('inv-price').value = details.price;
    
    document.getElementById('inv-modal-title').innerText = 'Edit Item';
    document.getElementById('modal-inventory').classList.add('active');
}

function saveInventoryItem(event) {
    event.preventDefault();
    const originalName = document.getElementById('inv-original-name').value;
    const newName = document.getElementById('inv-name').value.trim();
    
    const newData = {
        qty: parseInt(document.getElementById('inv-qty').value),
        minStock: parseInt(document.getElementById('inv-min').value),
        cogs: parseInt(document.getElementById('inv-cogs').value),
        price: parseInt(document.getElementById('inv-price').value)
    };

    if (originalName && originalName !== newName) {
        // If renaming item
        delete inventory[originalName];
    }
    
    inventory[newName] = newData;
    localStorage.setItem('umkm_inventory', JSON.stringify(inventory));
    
    closeModal('modal-inventory');
    renderInventory();
    populateItemDropdowns(); // Update dashboard dropdown
}

function deleteInventoryItem(itemName) {
    if(confirm(`Are you sure you want to delete ${itemName} from inventory?`)) {
        delete inventory[itemName];
        localStorage.setItem('umkm_inventory', JSON.stringify(inventory));
        renderInventory();
    }
}

// --- EXPORT LOGIC ---
function exportTransactionsExcel() {
    const ws = XLSX.utils.json_to_sheet(transactions.map(t => ({
        Date: t.date, Time: t.time, Type: t.type.toUpperCase(), Item: t.item,
        Quantity: t.qty, Amount: t.amount, Channel: t.channel
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `Transactions_Export_${getTodayStr()}.xlsx`);
}

function exportInventoryExcel() {
    const flatInventory = Object.keys(inventory).map(key => ({
        Item_Name: key,
        Current_Stock: inventory[key].qty,
        Min_Stock_Limit: inventory[key].minStock,
        COGS: inventory[key].cogs,
        Selling_Price: inventory[key].price
    }));
    const ws = XLSX.utils.json_to_sheet(flatInventory);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `Inventory_Export_${getTodayStr()}.xlsx`);
}
