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
    
    // Auto-Calculate Listeners (Safely Binded)
    const entryType = document.getElementById('entry-type');
    const entryItem = document.getElementById('entry-item');
    const entryQty = document.getElementById('entry-qty');

    if (entryType) entryType.addEventListener('change', calculateTotalAmount);
    if (entryItem) entryItem.addEventListener('change', calculateTotalAmount);
    if (entryQty) entryQty.addEventListener('input', calculateTotalAmount);
});

// --- HELPER FUNCTIONS ---
const formatRupiah = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
const getTodayStr = () => new Date().toISOString().split('T')[0];

function calculateTotalAmount() {
    const type = document.getElementById('entry-type').value;
    const itemName = document.getElementById('entry-item').value;
    const qty = parseInt(document.getElementById('entry-qty').value, 10) || 0;
    
    if (inventory[itemName]) {
        const unitValue = type === 'income' ? inventory[itemName].price : inventory[itemName].cogs;
        document.getElementById('entry-amount').value = unitValue * qty;
    }
}

function populateItemDropdowns() {
    const select = document.getElementById('entry-item');
    if(!select) return;
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
            
            // Set Title from span inside nav-item
            pageTitle.innerText = item.querySelector('span').innerText;
            
            if(targetId === 'view-dashboard') renderDashboard();
            if(targetId === 'view-transactions') renderTransactions();
            if(targetId === 'view-inventory') renderInventory();
        });
    });
}

// --- DASHBOARD LOGIC ---
function renderDashboard() {
    populateItemDropdowns();
    
    let currentRevenue = 0;
    let salesCount = 0;
    let totalCapital = 0;
    const todayStr = getTodayStr();
    const currentMonthStr = todayStr.substring(0, 7); 
    
    for (const [itemName, details] of Object.entries(inventory)) {
        totalCapital += (details.cogs * details.qty);
    }

    const feedContainer = document.getElementById('dashboard-feed');
    if(!feedContainer) return;
    feedContainer.innerHTML = '';
    
    transactions.forEach(t => {
        if (t.type === 'income' && t.date && t.date.startsWith(currentMonthStr)) {
            currentRevenue += t.amount;
        }
    });

    let todayRevenue = 0;
    let todaySales = 0;
    const todaysTransactions = transactions.filter(t => t.date === todayStr).reverse();
    
    if (todaysTransactions.length === 0) {
        feedContainer.innerHTML = `<div class="text-muted" style="text-align:center; padding:30px;">No transactions today. Take a break or start selling!</div>`;
    } else {
        todaysTransactions.forEach(t => {
            if (t.type === 'income') {
                todayRevenue += t.amount;
                todaySales += 1;
            }
            const isIncome = t.type === 'income';
            feedContainer.innerHTML += `
                <div class="stream-item">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <div style="width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${isIncome ? 'rgba(1,181,116,0.1)' : 'rgba(238,93,80,0.1)'}; color:${isIncome ? 'var(--secondary)' : 'var(--danger)'}; font-size:1.2rem;">
                            <i class='bx ${isIncome ? 'bx-trending-up' : 'bx-trending-down'}'></i>
                        </div>
                        <div class="stream-info">
                            <h4>${isIncome ? 'Sold' : 'Restocked'} ${t.qty}x ${t.item}</h4>
                            <p><i class='bx bx-time'></i> ${t.time} • ${t.channel}</p>
                        </div>
                    </div>
                    <div class="${isIncome ? 'text-success' : 'text-danger'}">
                        ${isIncome ? '+' : '-'}${formatRupiah(t.amount)}
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('daily-revenue-metric').innerText = formatRupiah(todayRevenue);
    document.getElementById('daily-sales-count').innerText = `${todaySales} Sales Today`;
    document.getElementById('capital-valuation-metric').innerText = formatRupiah(totalCapital);
    
    let bepPercent = (currentRevenue / BEP_TARGET) * 100;
    document.getElementById('bep-text').innerText = `${bepPercent.toFixed(1)}%`;
    document.getElementById('bep-bar').style.width = `${Math.min(bepPercent, 100)}%`;
    document.getElementById('bep-bar').style.backgroundColor = bepPercent >= 100 ? 'var(--secondary)' : 'var(--primary)';
    document.getElementById('bep-current-text').innerText = formatRupiah(currentRevenue);
}

function addLedgerEntry(event) {
    event.preventDefault();
    const type = document.getElementById('entry-type').value;
    const item = document.getElementById('entry-item').value;
    const qty = parseInt(document.getElementById('entry-qty').value, 10);
    const amount = parseInt(document.getElementById('entry-amount').value, 10);
    const channel = document.getElementById('entry-channel').value;
    const now = new Date();
    
    if (type === 'income' && inventory[item].qty < qty) {
        alert(`Failed: Not enough stock! You only have ${inventory[item].qty} ${item}.`);
        return;
    }

    if (type === 'income') inventory[item].qty -= qty;
    else inventory[item].qty += qty;
    
    localStorage.setItem('umkm_inventory', JSON.stringify(inventory));

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

// --- TRANSACTIONS LOGIC ---
function renderTransactions() {
    const tbody = document.getElementById('tx-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const typeFilter = document.getElementById('filter-type').value;

    let filtered = transactions.slice().reverse();

    if (startDate) filtered = filtered.filter(t => t.date >= startDate);
    if (endDate) filtered = filtered.filter(t => t.date <= endDate);
    if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;" class="text-muted">No transactions found.</td></tr>`;
        return;
    }

    filtered.forEach(t => {
        const isIncome = t.type === 'income';
        const badgeClass = isIncome ? 'badge-success' : 'badge-danger';
        tbody.innerHTML += `
            <tr>
                <td>${t.date} <br><span class="text-muted" style="font-size:0.8rem;">${t.time}</span></td>
                <td><span class="badge ${badgeClass}">${t.type.toUpperCase()}</span></td>
                <td>${t.item}</td>
                <td>${t.qty}</td>
                <td style="font-weight:600;">${formatRupiah(t.amount)}</td>
                <td>${t.channel}</td>
                <td>
                    <button class="btn btn-danger" onclick="deleteTransaction(${t.id})">
                        <i class='bx bx-trash'></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

function deleteTransaction(id) {
    if(!confirm('Delete transaction? Stock will be reverted.')) return;
    const txIndex = transactions.findIndex(t => t.id === id);
    if(txIndex > -1) {
        const tx = transactions[txIndex];
        if(inventory[tx.item]) {
            if(tx.type === 'income') inventory[tx.item].qty += tx.qty; 
            else inventory[tx.item].qty -= tx.qty; 
        }
        transactions.splice(txIndex, 1);
        localStorage.setItem('umkm_transactions', JSON.stringify(transactions));
        localStorage.setItem('umkm_inventory', JSON.stringify(inventory));
        renderTransactions();
    }
}

// --- INVENTORY LOGIC ---
function renderInventory() {
    const tbody = document.getElementById('inv-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const search = document.getElementById('inv-search').value.toLowerCase();
    const statusFilter = document.getElementById('inv-filter-status').value;
    
    let items = Object.keys(inventory);

    if (search) items = items.filter(name => name.toLowerCase().includes(search));
    
    items.forEach(itemName => {
        const details = inventory[itemName];
        const isLow = details.qty <= details.minStock;
        
        if (statusFilter === 'low' && !isLow) return; 
        
        const margin = ((details.price - details.cogs) / details.price) * 100;
        let badgeHtml = `<span class="badge badge-success">Sufficient</span>`;
        if (details.qty <= 0) badgeHtml = `<span class="badge badge-danger">Empty</span>`;
        else if (isLow) badgeHtml = `<span class="badge badge-warning">Low (Min: ${details.minStock})</span>`;

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:600;">${itemName}</td>
                <td>${details.qty}</td>
                <td>${formatRupiah(details.cogs)}</td>
                <td>${formatRupiah(details.price)}</td>
                <td class="text-success" style="font-weight:600;">${margin.toFixed(1)}%</td>
                <td>${badgeHtml}</td>
                <td>
                    <button class="btn icon-btn" onclick="editInventoryItem('${itemName}')" style="color:var(--primary);"><i class='bx bx-edit'></i></button>
                    <button class="btn icon-btn" onclick="deleteInventoryItem('${itemName}')" style="color:var(--danger);"><i class='bx bx-trash'></i></button>
                </td>
            </tr>
        `;
    });
}

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
        delete inventory[originalName];
    }
    
    inventory[newName] = newData;
    localStorage.setItem('umkm_inventory', JSON.stringify(inventory));
    
    closeModal('modal-inventory');
    renderInventory();
    populateItemDropdowns(); 
}

function deleteInventoryItem(itemName) {
    if(confirm(`Are you sure you want to delete ${itemName}?`)) {
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
    XLSX.writeFile(wb, `Transactions_${getTodayStr()}.xlsx`);
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
    XLSX.writeFile(wb, `Inventory_${getTodayStr()}.xlsx`);
}
