// ===== CONFIG & STATE =====
let currentUser = JSON.parse(localStorage.getItem('smart_user')) || null;
let token = localStorage.getItem('smart_token') || null;
let invoices = [];
let clients = [];
let settings = JSON.parse(localStorage.getItem('smart_settings_en')) || { name: '', email: '', phone: '', address: '' };

const currencySymbols = { 'USD': '$', 'SAR': 'SAR', 'AED': 'AED', 'EUR': '€', 'GBP': '£' };
const formatMoney = (amount, currency = 'USD') => {
    const symbol = currencySymbols[currency] || '$';
    return `${symbol}${parseFloat(amount).toFixed(2)}`;
};

// ===== AUTH LOGIC =====
let isLoginMode = true;

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').textContent = isLoginMode ? 'Welcome Back' : 'Create Account';
    document.getElementById('authSubtitle').textContent = isLoginMode ? 'Please enter your details to continue' : 'Join us to start managing invoices';
    document.getElementById('nameGroup').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('authBtn').textContent = isLoginMode ? 'Login' : 'Register';
    document.getElementById('authSwitchText').innerHTML = isLoginMode ? 
        "Don't have an account? <a href='#' onclick='toggleAuthMode()'>Register</a>" :
        "Already have an account? <a href='#' onclick='toggleAuthMode()'>Login</a>";
}

async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value;

    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    const body = isLoginMode ? { email, password } : { email, password, name };

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.error) return alert(data.error);

        token = data.token;
        currentUser = data.user;
        localStorage.setItem('smart_token', token);
        localStorage.setItem('smart_user', JSON.stringify(currentUser));
        
        document.getElementById('authModal').style.display = 'none';
        initApp();
        showToast('Successfully logged in!');
    } catch (err) {
        showToast('Connection error');
    }
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('smart_token');
    localStorage.removeItem('smart_user');
    window.location.reload();
}

function checkAuth() {
    if (!token) {
        document.getElementById('authModal').style.display = 'flex';
        return false;
    }
    return true;
}

// ===== API CALLS =====
async function fetchInvoices() {
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}/api/invoices`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        invoices = await res.json();
        updateDashboardStats();
        renderRecentInvoices();
        renderAllInvoices();
        updateLimits();
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

async function apiSaveInvoice(invoiceData) {
    try {
        const res = await fetch(`${API_URL}/api/invoices`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(invoiceData)
        });
        const data = await res.json();
        if (data.error === 'PAYWALL') {
            showUpgradeModal();
            return false;
        }
        if (data.error) {
            alert(data.error);
            return false;
        }
        return true;
    } catch (err) {
        showToast('Failed to connect to server');
        return false;
    }
}

// ===== INIT & NAVIGATION =====
document.addEventListener('DOMContentLoaded', () => {
    if (checkAuth()) {
        initApp();
    }
    initNavigation();
    initDateInputs();
});

function initApp() {
    updateSidebarUser();
    fetchInvoices();
    if(document.querySelectorAll('#invoiceItems tr').length === 0) addItem();
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            if (page) showPage(page);
        });
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    
    document.getElementById(pageId + 'Page').classList.add('active');
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
}

// ===== INVOICE MANAGEMENT =====
function addItem() {
    const tbody = document.getElementById('invoiceItems');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" placeholder="Description" class="item-desc"></td>
        <td><input type="number" value="1" min="1" class="item-qty" onchange="calculateTotals()"></td>
        <td><input type="number" value="0" min="0" class="item-price" onchange="calculateTotals()"></td>
        <td class="item-total">$0.00</td>
        <td><button class="btn-icon delete-btn" onclick="this.parentElement.parentElement.remove(); calculateTotals();">🗑️</button></td>
    `;
    tbody.appendChild(tr);
}

function calculateTotals() {
    let subtotal = 0;
    document.querySelectorAll('#invoiceItems tr').forEach(tr => {
        const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
        const price = parseFloat(tr.querySelector('.item-price').value) || 0;
        const total = qty * price;
        tr.querySelector('.item-total').textContent = formatMoney(total, document.getElementById('currency').value);
        subtotal += total;
    });

    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount;

    document.getElementById('subtotalLabel').textContent = formatMoney(subtotal, document.getElementById('currency').value);
    document.getElementById('taxLabel').textContent = formatMoney(taxAmount, document.getElementById('currency').value);
    document.getElementById('grandTotalLabel').textContent = formatMoney(grandTotal, document.getElementById('currency').value);

    return { subtotal, taxAmount, grandTotal };
}

async function saveInvoice() {
    if (!checkAuth()) return;

    const clientName = document.getElementById('clientName').value;
    if (!clientName) return alert('Please enter client name');

    const items = [];
    document.querySelectorAll('#invoiceItems tr').forEach(tr => {
        items.push({
            desc: tr.querySelector('.item-desc').value,
            qty: parseFloat(tr.querySelector('.item-qty').value),
            price: parseFloat(tr.querySelector('.item-price').value)
        });
    });

    const totals = calculateTotals();
    const inv = {
        id: 'INV-' + Date.now(),
        invoiceNumber: document.getElementById('invoiceNumber').value,
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

    const success = await apiSaveInvoice(inv);
    if (success) {
        showToast('Invoice saved successfully');
        fetchInvoices();
        document.getElementById('invoiceForm').reset();
        document.getElementById('invoiceItems').innerHTML = '';
        addItem();
        showPage('invoices');
        return inv;
    }
}

function saveAndPreview() { 
    const clientName = document.getElementById('clientName').value;
    if (!clientName) return alert('Please enter client name');
    
    const items = [];
    document.querySelectorAll('#invoiceItems tr').forEach(tr => {
        items.push({
            desc: tr.querySelector('.item-desc').value,
            qty: parseFloat(tr.querySelector('.item-qty').value),
            price: parseFloat(tr.querySelector('.item-price').value)
        });
    });
    
    const totals = calculateTotals();
    const inv = {
        id: 'TEMP-' + Date.now(),
        invoiceNumber: document.getElementById('invoiceNumber').value,
        date: document.getElementById('invoiceDate').value,
        dueDate: document.getElementById('dueDate').value,
        currency: document.getElementById('currency').value,
        client: { name: clientName, email: document.getElementById('clientEmail').value, phone: document.getElementById('clientPhone').value },
        items, ...totals,
        taxRate: parseFloat(document.getElementById('taxRate').value)||0,
        notes: document.getElementById('notes').value
    };
    showPreviewModal(inv);
}

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
    const name = currentUser ? currentUser.name : (settings.name || 'User');
    document.getElementById('userNameSidebar').textContent = name;
    document.getElementById('userAvatarSidebar').textContent = name.charAt(0).toUpperCase();
}

// ===== RENDER =====
function updateDashboardStats() {
    let rev = 0, pend = 0, paid = 0;
    const today = new Date().toISOString().split('T')[0];
    invoices.forEach(i => {
        if(i.status === 'paid') { paid++; rev += i.grandTotal; }
        else { pend++; }
    });
    document.getElementById('totalRevenue').textContent = formatMoney(rev);
    document.getElementById('pendingInvoices').textContent = pend;
    document.getElementById('paidInvoices').textContent = paid;
}

function renderRecentInvoices() {
    const tbody = document.getElementById('recentInvoicesList');
    tbody.innerHTML = '';
    invoices.slice(0, 5).forEach(inv => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${inv.invoiceNumber}</td>
            <td>${inv.client.name}</td>
            <td>${formatMoney(inv.grandTotal, inv.currency)}</td>
            <td><span class="status-badge status-${inv.status}">${inv.status}</span></td>
            <td><button class="btn btn-sm" onclick="viewInvoice('${inv.id}')">View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAllInvoices() {
    const tbody = document.getElementById('allInvoicesList');
    tbody.innerHTML = '';
    invoices.forEach(inv => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${inv.invoiceNumber}</td>
            <td>${inv.client.name}</td>
            <td>${inv.date}</td>
            <td>${formatMoney(inv.grandTotal, inv.currency)}</td>
            <td><span class="status-badge status-${inv.status}">${inv.status}</span></td>
            <td>
                <button class="btn-icon" onclick="viewInvoice('${inv.id}')">👁️</button>
                <button class="btn-icon" onclick="downloadPDF('${inv.id}')">📥</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateLimits() {
    const count = invoices.length;
    const left = Math.max(0, 3 - count);
    document.getElementById('freeInvoicesLeft').textContent = left;
}

// ===== MODALS & UI =====
function showUpgradeModal() { document.getElementById('upgradeModal').style.display = 'flex'; }
function hideUpgradeModal() { document.getElementById('upgradeModal').style.display = 'none'; }

function viewInvoice(id) {
    const inv = invoices.find(i => i.id === id);
    if (inv) showPreviewModal(inv);
}

function showPreviewModal(inv) {
    const modal = document.getElementById('previewModal');
    const content = document.getElementById('previewContent');
    
    let itemsHtml = inv.items.map(item => `
        <tr>
            <td>${item.desc}</td>
            <td>${item.qty}</td>
            <td>${formatMoney(item.price, inv.currency)}</td>
            <td>${formatMoney(item.qty * item.price, inv.currency)}</td>
        </tr>
    `).join('');

    content.innerHTML = `
        <div class="preview-header">
            <div>
                <h2>INVOICE</h2>
                <p>#${inv.invoiceNumber}</p>
            </div>
            <div style="text-align:right">
                <h3>${settings.name}</h3>
                <p>${settings.address}</p>
            </div>
        </div>
        <hr>
        <div class="preview-body">
            <p><strong>Bill To:</strong> ${inv.client.name}</p>
            <p><strong>Email:</strong> ${inv.client.email}</p>
            <p><strong>Date:</strong> ${inv.date} | <strong>Due:</strong> ${inv.dueDate}</p>
            <table class="data-table" style="margin-top:20px;">
                <thead><tr><th>Desc</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <div style="text-align:right; margin-top:20px;">
                <p>Subtotal: ${formatMoney(inv.subtotal, inv.currency)}</p>
                <p>Tax: ${formatMoney(inv.taxAmount, inv.currency)}</p>
                <h3 style="color:#6366f1">Total: ${formatMoney(inv.grandTotal, inv.currency)}</h3>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function hidePreviewModal() { document.getElementById('previewModal').style.display = 'none'; }

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceDate').value = today;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    document.getElementById('dueDate').value = nextMonth.toISOString().split('T')[0];
}

window.onclick = (event) => {
    if (event.target.className === 'modal') {
        event.target.style.display = 'none';
    }
};
