const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // We will move frontend to public folder later

const PORT = 3000;
const SECRET_KEY = 'smart_invoice_super_secret_key_123'; // In production, this goes to .env

// ===== DATABASE SETUP =====
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database opening error: ', err);
});

db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Invoices Table
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        client_name TEXT,
        client_email TEXT,
        client_phone TEXT,
        amount REAL,
        currency TEXT,
        status TEXT,
        data JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Expenses Table
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        title TEXT,
        category TEXT,
        amount REAL,
        currency TEXT,
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

// ===== AUTH MIDDLEWARE =====
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ===== AUTH ROUTES =====
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', [email, hashedPassword, name], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already exists' });
                return res.status(500).json({ error: 'Database error' });
            }
            const token = jwt.sign({ id: this.lastID, email }, SECRET_KEY);
            res.json({ token, user: { id: this.lastID, email, name } });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(400).json({ error: 'User not found' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });
        
        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY);
        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    });
});

// ===== INVOICE ROUTES =====
app.post('/api/invoices', authenticateToken, (req, res) => {
    const invoice = req.body;
    const userId = req.user.id;
    
    // Check if user exceeded free limit (for MVP, hardcoded to 3)
    db.get('SELECT COUNT(*) as count FROM invoices WHERE user_id = ?', [userId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        if (row.count >= 3) {
            return res.status(403).json({ error: 'PAYWALL', message: 'Upgrade to PRO to create more invoices.' });
        }
        
        db.run('INSERT INTO invoices (id, user_id, client_name, client_email, client_phone, amount, currency, status, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [invoice.id, userId, invoice.client.name, invoice.client.email, invoice.client.phone, invoice.grandTotal, invoice.currency, invoice.status, JSON.stringify(invoice)],
            (err) => {
                if (err) return res.status(500).json({ error: 'Failed to save invoice' });
                res.json({ success: true, message: 'Invoice saved' });
            }
        );
    });
});

app.get('/api/invoices', authenticateToken, (req, res) => {
    db.all('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        // Parse the JSON data string back into an object
        const invoices = rows.map(r => JSON.parse(r.data));
        res.json(invoices);
    });
});

// ===== EXPENSE ROUTES =====
app.post('/api/expenses', authenticateToken, (req, res) => {
    const exp = req.body;
    const userId = req.user.id;
    
    db.run('INSERT INTO expenses (id, user_id, title, category, amount, currency, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [exp.id, userId, exp.title, exp.category, exp.amount, exp.currency, exp.date],
        (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save expense' });
            res.json({ success: true, message: 'Expense saved' });
        }
    );
});

app.get('/api/expenses', authenticateToken, (req, res) => {
    db.all('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Smart Invoice Backend running on http://localhost:${PORT}`);
});
