/**
 * Dear Self - Nails, Salon & Spa
 * Express.js Server Configuration
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const auth = require('./auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// API Routes
// Auth routes
app.post('/api/auth/login', auth.handleLogin);
app.post('/api/auth/register', auth.handleRegister);
app.post('/api/auth/logout', auth.handleLogout);
app.get('/api/auth/me', auth.authMiddleware, auth.handleGetCurrentUser);
app.put('/api/auth/password', auth.authMiddleware, auth.handleUpdatePassword);
app.post('/api/auth/reset-request', auth.handlePasswordResetRequest);
app.post('/api/auth/reset-complete', auth.handlePasswordResetComplete);

// Protected API routes example
// app.get('/api/appointments', auth.authMiddleware, appointmentsController.list);
// app.get('/api/services', servicesController.list);
// app.get('/api/staff', auth.authMiddleware, staffController.list);
// app.get('/api/users', auth.authMiddleware, auth.requireRole(['admin']), usersController.list);

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'html/landing-page.html'));
});

app.get('/customer', (req, res) => {
    res.sendFile(path.join(publicPath, 'html/customer-dashboard.html'));
});

app.get('/staff', (req, res) => {
    res.sendFile(path.join(publicPath, 'html/staff-dashboard.html'));
});

app.get('/receptionist', (req, res) => {
    res.sendFile(path.join(publicPath, 'html/receptionist-dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicPath, 'html/admin-dashboard.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(publicPath, 'html/chatroom.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Dear Self Salon & Spa server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}`);
});

module.exports = app;