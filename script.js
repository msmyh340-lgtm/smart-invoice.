// ===== STATE MANAGEMENT =====
const MAX_FREE_INVOICES = 3;
let invoices = JSON.parse(localStorage.getItem('smart_invoices_en')) || [];
let clients = JSON.parse(localStorage.getItem('smart_clients_en')) || [];
let settings = JSON.parse(localStorage.getItem('smart_settings_en')) || {
    name: 'My Company', email: '', phone: '', address: ''
};

const currencySymbols = { 'USD': '$', 'SAR': 'SAR', 'AED': 'AED', 'EUR': '€', 'GBP': '£' };
const formatMoney = (amount, currency = 'USD') => {
    const symbol = currencySymbols[currency] || '$';
    return `${symbol}${parseFloat(amount).toFixed(2)}`;
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    const hasVisited = localStorage.getItem('smart_visited_en');
    if (hasVisited) {
        document.getElementById('landingPage').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
    } else {
        document.getElementById('appContainer').style.display = 'none';
    }

    initNavigation();
    initDateInputs();
    loadSettings();
    updateDashboardStats();
    renderRecentInvoices();
    renderAllInvoices();
    renderClients();
    updateSidebarUser();
    updateLimits();
    
    if(document.querySelectorAll('#invoiceItems tr').length === 0) addItem();
});

function enterApp() {
    localStorage.setItem('smart_visited_en', 'true');
    const landing = document.getElementById('landingPage');
    const app = document.getElementById('appContainer');
    landing.style.opacity = '0';
    setTimeout(() => {
        landing.style.display = 'none';
        app.style.display = 'flex';
        app.style.animation = 'fadeIn 0.5s ease';
    }, 300);
}

// ===== NAV =====
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            showPage(item.getAttribute('data-page'));
            if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
        });
    });
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
}

function showPage(pageId) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
    document.getElementById('pageTitle').textContent = document.querySelector(`[data-page="${pageId}"] .nav-label`).textContent;
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');

    if(pageId === 'invoices') renderAllInvoices();
    if(pageId === 'clients') renderClients();
    if(pageId === 'dashboard') { updateDashboardStats(); renderRecentInvoices(); }
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    document.getElementById('invoiceDate').value = today;
    document.getElementById('dueDate').value = nextWeek;
}

// ===== INVOICE LOGIC =====
function updateLimits() {
    const left = Math.max(0, MAX_FREE_INVOICES - invoices.length);
    document.getElementById('freeInvoicesLeft').textContent = left;
    return left;
}

function addItem() {
    const tbody = document.getElementById('invoiceItems');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="item-desc" placeholder="Service description"></td>
        <td><input type="number" class="item-qty" value="1" min="1" onchange="calculateTotals()"></td>
        <td><input type="number" class="item-price" value="0" min="0" step="0.01" onchange="calculateTotals()"></td>
        <td class="item-total">$0.00</td>
        <td><button type="button" class="btn-remove" onclick="removeItem(this)">✕</button></td>
    `;
    tbody.appendChild(tr);
    calculateTotals();
}

function removeItem(btn) {
    if(document.querySelectorAll('#invoiceItems tr').length > 1) {
        btn.closest('tr').remove();
        calculateTotals();
    } else {
        showToast('At least one item is required', 'error');
    }
}

function calculateTotals() {
    let subtotal = 0;
    const currency = document.getElementById('currency').value;
    document.querySelectorAll('#invoiceItems tr').forEach(row => {
        const total = (parseFloat(row.querySelector('.item-qty').value)||0) * (parseFloat(row.querySelector('.item-price').value)||0);
        subtotal += total;
        row.querySelector('.item-total').textContent = formatMoney(total, currency);
    });
    const taxAmount = subtotal * ((parseFloat(document.getElementById('taxRate').value)||0) / 100);
    const grandTotal = subtotal + taxAmount;
    
    document.getElementById('subtotal').textContent = formatMoney(subtotal, currency);
    document.getElementById('taxAmount').textContent = formatMoney(taxAmount, currency);
    document.getElementById('grandTotal').textContent = formatMoney(grandTotal, currency);
    return { subtotal, taxAmount, grandTotal };
}

function saveInvoice() {
    if (invoices.length >= MAX_FREE_INVOICES) {
        showUpgradeModal();
        return null;
    }

    const clientName = document.getElementById('clientName').value.trim();
    if(!clientName) { showToast('Client name required', 'error'); return null; }

    const items = [];
    document.querySelectorAll('#invoiceItems tr').forEach(row => {
        const desc = row.querySelector('.item-desc').value.trim();
        const qty = parseFloat(row.querySelector('.item-qty').value)||0;
        const price = parseFloat(row.querySelector('.item-price').value)||0;
        if(desc) items.push({ desc, qty, price, total: qty*price });
    });
    if(items.length === 0) { showToast('Add at least one item description', 'error'); return null; }

    const totals = calculateTotals();
    const inv = {
        id: 'INV-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        date: document.getElementById('invoiceDate').value,
        dueDate: document.getElementById('dueDate').value,
        currency: document.getElementById('currency').value,
        client: { name: clientName, email: document.getElementById('clientEmail').value, phone: document.getElementById('clientPhone').value },
        items, ...totals,
        taxRate: parseFloat(document.getElementById('taxRate').value)||0,
        notes: document.getElementById('notes').value,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    invoices.unshift(inv);
    localStorage.setItem('smart_invoices_en', JSON.stringify(invoices));
    
    if(!clients.find(c => c.name.toLowerCase() === clientName.toLowerCase())) {
        clients.push({ name: clientName, email: inv.client.email, phone: inv.client.phone });
        localStorage.setItem('smart_clients_en', JSON.stringify(clients));
    }

    showToast('Invoice saved successfully');
    updateLimits();
    document.getElementById('invoiceForm').reset();
    document.getElementById('invoiceItems').innerHTML = '';
    addItem();
    initDateInputs();
    showPage('invoices');
    return inv;
}

function saveAndPreview() { const inv = saveInvoice(); if(inv) showPreviewModal(inv); }

// ===== SETTINGS =====
function saveSettings() {
    settings = {
        name: document.getElementById('businessName').value || 'My Company',
        email: document.getElementById('businessEmail').value,
        phone: document.getElementById('businessPhone').value,
        address: document.getElementById('businessAddress').value
    };
    localStorage.setItem('smart_settings_en', JSON.stringify(settings));
    showToast('Settings saved');
    updateSidebarUser();
}
function loadSettings() {
    document.getElementById('businessName').value = settings.name || '';
    document.getElementById('businessEmail').value = settings.email || '';
    document.getElementById('businessPhone').value = settings.phone || '';
    document.getElementById('businessAddress').value = settings.address || '';
}
function updateSidebarUser() {
    document.getElementById('userNameSidebar').textContent = settings.name || 'User';
    document.getElementById('userAvatarSidebar').textContent = (settings.name || 'U').charAt(0).toUpperCase();
}

// ===== RENDER =====
function updateDashboardStats() {
    let rev = 0, pend = 0, paid = 0;
    const today = new Date().toISOString().split('T')[0];
    invoices.forEach(i => {
        if(i.status === 'pending' && i.dueDate < today) i.status = 'overdue';
        if(i.status === 'paid') { paid += i.grandTotal; rev += i.grandTotal; }
        else if(i.status === 'pending') pend += i.grandTotal;
    });
    document.getElementById('totalRevenue').textContent = formatMoney(rev);
    document.getElementById('pendingAmount').textContent = formatMoney(pend);
    document.getElementById('paidAmount').textContent = formatMoney(paid);
    document.getElementById('totalClients').textContent = clients.length;
}

function createInvoiceHTML(inv) {
    return `<div class="invoice-card" onclick="showPreviewModalById('${inv.id}')">
        <div class="invoice-info"><span class="invoice-id">${inv.id}</span><span class="invoice-client">${inv.client.name}</span><span style="font-size:12px;color:var(--text-secondary)">${inv.date}</span></div>
        <div class="invoice-meta"><span class="status-badge status-${inv.status}">${inv.status}</span><span class="invoice-amount">${formatMoney(inv.grandTotal, inv.currency)}</span></div>
    </div>`;
}

function renderRecentInvoices() {
    const c = document.getElementById('recentInvoices');
    if(!invoices.length) return;
    c.innerHTML = invoices.slice(0,4).map(createInvoiceHTML).join('');
}

function renderAllInvoices(filter = 'all') {
    const c = document.getElementById('invoicesList');
    const f = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);
    if(!f.length) { c.innerHTML = `<div class="empty-state"><span class="empty-icon">📄</span><p>No invoices found</p></div>`; return; }
    c.innerHTML = f.map(createInvoiceHTML).join('');
}

document.querySelectorAll('.filter-tab').forEach(t => t.addEventListener('click', e => {
    document.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
    e.target.classList.add('active');
    renderAllInvoices(e.target.getAttribute('data-filter'));
}));

function renderClients() {
    const c = document.getElementById('clientsList');
    if(!clients.length) return;
    c.innerHTML = clients.map(client => {
        const invs = invoices.filter(i => i.client.name === client.name);
        const total = invs.reduce((s, i) => s + i.grandTotal, 0);
        return `<div class="client-card">
            <div class="client-avatar-lg">${client.name.charAt(0)}</div>
            <h3>${client.name}</h3><p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">${client.email||'No email'}</p>
            <div style="font-size:12px;color:var(--text-muted)">Invoices: <strong>${invs.length}</strong> | Total: <strong>${formatMoney(total)}</strong></div>
        </div>`;
    }).join('');
}

// ===== MODALS =====
function showPreviewModalById(id) { const i = invoices.find(x => x.id === id); if(i) showPreviewModal(i); }
function showPreviewModal(inv) {
    const b = document.getElementById('invoicePreview');
    b.innerHTML = `
        <div class="preview-invoice" id="printableArea">
            <div class="preview-header">
                <div class="preview-brand"><h1>${settings.name||'Company'}</h1><p>${settings.address||''}</p><p>${settings.phone||''}</p><p>${settings.email||''}</p></div>
                <div class="preview-invoice-info"><h2>INVOICE</h2><p><strong>${inv.id}</strong></p><p>Date: ${inv.date}</p><p>Due: ${inv.dueDate}</p><p>Status: ${inv.status.toUpperCase()}</p></div>
            </div>
            <div class="preview-parties">
                <div class="preview-party"><h3>Bill To:</h3><p><strong>${inv.client.name}</strong></p><p>${inv.client.email||''}</p></div>
            </div>
            <table class="preview-table">
                <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th style="text-align:right">Total</th></tr></thead>
                <tbody>${inv.items.map(i => `<tr><td>${i.desc}</td><td>${i.qty}</td><td>${formatMoney(i.price, inv.currency)}</td><td style="text-align:right">${formatMoney(i.total, inv.currency)}</td></tr>`).join('')}</tbody>
            </table>
            <div class="preview-totals">
                <table>
                    <tr><td style="text-align:right">Subtotal:</td><td style="text-align:right">${formatMoney(inv.subtotal, inv.currency)}</td></tr>
                    <tr><td style="text-align:right">Tax (${inv.taxRate}%):</td><td style="text-align:right">${formatMoney(inv.taxAmount, inv.currency)}</td></tr>
                    <tr class="grand-total"><td style="text-align:right">Total Due:</td><td style="text-align:right">${formatMoney(inv.grandTotal, inv.currency)}</td></tr>
                </table>
            </div>
            ${inv.notes ? `<div class="preview-notes"><p>${inv.notes}</p></div>` : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
            ${inv.status !== 'paid' ? `<button class="btn btn-primary" onclick="markPaid('${inv.id}')">Mark as Paid</button>` : ''}
            <button class="btn btn-danger" onclick="deleteInv('${inv.id}')">Delete</button>
        </div>
    `;
    document.getElementById('previewModal').classList.add('active');
}

function showUpgradeModal() { document.getElementById('upgradeModal').classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function markPaid(id) {
    const i = invoices.find(x => x.id === id);
    if(i) { i.status = 'paid'; localStorage.setItem('smart_invoices_en', JSON.stringify(invoices)); showToast('Marked as paid'); renderAll(); closeModal('previewModal'); }
}
function deleteInv(id) {
    if(confirm('Delete this invoice?')) { invoices = invoices.filter(i => i.id !== id); localStorage.setItem('smart_invoices_en', JSON.stringify(invoices)); updateLimits(); showToast('Deleted'); renderAll(); closeModal('previewModal'); }
}
function renderAll() { updateDashboardStats(); renderRecentInvoices(); renderAllInvoices(document.querySelector('.filter-tab.active')?.getAttribute('data-filter')||'all'); }

function printInvoice() {
    const p = document.getElementById('printableArea').innerHTML;
    const o = document.body.innerHTML;
    document.body.innerHTML = `<div style="padding:40px;background:white;font-family:Inter,sans-serif;">${p}</div>`;
    window.print();
    document.body.innerHTML = o;
    location.reload();
}

function showToast(msg, type='success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}
