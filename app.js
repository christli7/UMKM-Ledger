// Register Service Worker for Offline Capabilities
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('Service Worker failed: ', err));
    });
}

// 1. Initialize State
let transactions = JSON.parse(localStorage.getItem('umkm_transactions')) || [];

// Default Inventory Data (Initializes if nothing is in local storage)
const defaultInventory = {
    'Nasi': { cogs: 3000, price: 5000, qty: 50, minStock: 10 },
    'Tahu': { cogs: 1000, price: 2000, qty: 100, minStock: 20 },
    'Tempe':{ cogs: 1500, price: 3000, qty: 80, minStock: 15 }
};
let inventory = JSON.parse(localStorage.getItem('umkm_inventory')) || defaultInventory;

let currentRevenue = 0;
let salesCount = 0;
let totalCapitalValuation = 0;
const BEP_TARGET = 5000000;

// 2. On Load
window.addEventListener('DOMContentLoaded', () => {
    renderApp();
});

// Helper: Format Currency
function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number).replace('Rp', 'Rp '); 
}

// Helper: Update BEP Bar
function updateBEPUI() {
    let percentage = (currentRevenue / BEP_TARGET) * 100;
    let barWidth = percentage > 100 ? 100 : percentage;

    document.getElementById('bep-text').innerText = `${percentage.toFixed(1)}% Realized`;
    const bepBar = document.getElementById('bep-bar');
    bepBar.style.width = `${barWidth}%`;
    bepBar.style.backgroundColor = percentage >= 100 ? 'var(--success)' : 'var(--brand)';
    document.getElementById('bep-current-text').innerText = formatRupiah(currentRevenue);
}

// 3. CORE: Render the Application
function renderApp() {
    currentRevenue = 0;
    salesCount = 0;
    totalCapitalValuation = 0;
    
    // Render Ledger Feed
    const feedContainer = document.getElementById('ledger-feed');
    feedContainer.innerHTML = ''; 

    if (transactions.length === 0) {
        feedContainer.innerHTML = `<div class="empty-state">No transactions recorded yet. Add an entry to begin tracking.</div>`;
    } else {
        transactions.slice().reverse().forEach(t => {
            if (t.type === 'income') {
                currentRevenue += t.amount;
                salesCount += 1;
            }

            const sign = t.type === 'income' ? '+' : '-';
            const colorClass = t.type === 'income' ? 'amt-pos' : 'amt-neg';
            const actionText = t.type === 'income' ? 'Sold' : 'Restocked';
            const notesText = t.notes ? `• ${t.notes}` : '';
            
            const html = `
                <div class="stream-item" data-id="${t.id}">
                    <div class="stream-details">
                        <strong>${actionText} ${t.qty}x ${t.item}</strong>
                        <span style="font-size: 11px; color: var(--text-muted);">${notesText}</span>
                        <span class="stream-time">${t.timestamp} • ${t.channel}</span>
                    </div>
                    <span class="${colorClass}">${sign}${formatRupiah(t.amount)}</span>
                </div>
            `;
            feedContainer.insertAdjacentHTML('beforeend', html);
        });
    }

    // Render Inventory Table
    const invBody = document.getElementById('inventory-table-body');
    invBody.innerHTML = '';
    
    for (const [itemName, details] of Object.entries(inventory)) {
        const margin = ((details.price - details.cogs) / details.price) * 100;
        const assetValue = details.cogs * details.qty;
        totalCapitalValuation += assetValue; 

        let badgeHtml = `<span class="badge badge-success">Optimized</span>`;
        if (details.qty <= 0) {
            badgeHtml = `<span class="badge badge-danger">Out of Stock</span>`;
        } else if (details.qty <= details.minStock) {
            badgeHtml = `<span class="badge badge-warning">Low Stock (Min: ${details.minStock})</span>`;
        }

        const rowHtml = `
            <tr>
                <td><strong>${itemName}</strong></td>
                <td>${details.qty} units</td>
                <td>${formatRupiah(details.cogs)}</td>
                <td>${formatRupiah(details.price)}</td>
                <td><span style="color: var(--success);">${margin.toFixed(1)}%</span></td>
                <td>${formatRupiah(assetValue)}</td>
                <td>${badgeHtml}</td>
            </tr>
        `;
        invBody.insertAdjacentHTML('beforeend', rowHtml);
    }

    // Update Top Dashboard Metrics
    document.getElementById('daily-revenue-metric').innerText = formatRupiah(currentRevenue);
    document.getElementById('daily-sales-count').innerText = `✓ ${salesCount} Checked-out sales`;
    document.getElementById('capital-valuation-metric').innerText = formatRupiah(totalCapitalValuation);
    updateBEPUI();
}

// 4. CORE: Add Transaction & Update Inventory
function addLedgerEntry(event) {
    event.preventDefault(); 

    const type = document.getElementById('entry-type').value;
    const item = document.getElementById('entry-item').value;
    const qty = parseInt(document.getElementById('entry-qty').value, 10);
    const amount = parseInt(document.getElementById('entry-amount').value, 10);
    const channel = document.getElementById('entry-channel').value;
    const notes = document.getElementById('entry-notes').value;
    const now = new Date();

    // Guardrail: Prevent selling more stock than available
    if (type === 'income' && inventory[item].qty < qty) {
        alert(`Transaction Failed: You cannot sell ${qty} ${item}. You only have ${inventory[item].qty} units in stock.`);
        return; 
    }

    // Update Inventory State
    if (type === 'income') {
        inventory[item].qty -= qty;
    } else if (type === 'expense') {
        inventory[item].qty += qty;
    }

    // Save updated inventory to LocalStorage
    localStorage.setItem('umkm_inventory', JSON.stringify(inventory));

    // Record Transaction
    const newTransaction = {
        id: Date.now(),
        type: type,
        item: item,
        qty: qty,
        amount: amount,
        channel: channel,
        notes: notes,
        timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    transactions.push(newTransaction);
    localStorage.setItem('umkm_transactions', JSON.stringify(transactions));

    // Redraw the UI
    renderApp();

    // Reset Form
    document.getElementById('ledger-form').reset();
    document.getElementById('entry-type').focus(); 
}

// 5. EXPORT FUNCTIONALITY
function exportFinancialReport(templateOnly = false) {
    const selectedMonth = document.getElementById('report-window').value;
    let filename = `TokoKita_Template_${selectedMonth}.xlsx`;
    const wb = XLSX.utils.book_new();
    
    if (templateOnly) {
        const templateHeaders = [["Product Specification", "Stock Level", "Capital Cost (COGS)", "Retail Base Price"]];
        const ws = XLSX.utils.aoa_to_sheet(templateHeaders);
        XLSX.utils.book_append_sheet(wb, ws, "Blank Inventory Input");
    } else {
        filename = `TokoKita_Financial_Report_${selectedMonth}.xlsx`;
        let bepPercentage = ((currentRevenue / BEP_TARGET) * 100).toFixed(1) + "%";

        const summaryData = [
            ["TokoKita Business Performance Summary", "", ""],
            ["Reporting Window", selectedMonth.replace('_', ' '), ""],
            [],
            ["Metric Parameter", "Value", "Operational Status Context"],
            ["Daily Cash Revenue", formatRupiah(currentRevenue), `${salesCount} Checked-out transactions`],
            ["Active Capital Valuation", formatRupiah(totalCapitalValuation), "Assets tied in operational storage"],
            ["Monthly BEP Realization", bepPercentage, "Target: Rp 5.000.000"]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Dashboard Overview");

        const tableElement = document.getElementById('inventory-table');
        const wsInventory = XLSX.utils.table_to_sheet(tableElement);
        XLSX.utils.book_append_sheet(wb, wsInventory, "Active Stock Inventory");
    }
    XLSX.writeFile(wb, filename);
}