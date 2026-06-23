/**
 * Dear Self - Nails, Salon & Spa Server
 * Express.js with Redis, PayMongo, HTTPS support
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const config = require('./config');
const cache = require('./redis');
const db = require('./db');
const paymongo = require('./paymongo');
const auth = require('./auth');
const middleware = require('./middleware');

const app = express();

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors(config.server.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(middleware.securityHeaders);
app.use(middleware.sanitizeMiddleware);

// Rate limiting for API
app.use('/api/', middleware.rateLimit('api'));

// Static files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// =====================================================
// AUTH ROUTES
// =====================================================

app.post('/api/auth/login', middleware.rateLimit('login'), auth.handleLogin);
app.post('/api/auth/register', middleware.rateLimit('register'), middleware.validateRegistration, auth.handleRegister);
app.post('/api/auth/demo', middleware.rateLimit('login'), auth.handleDemoLogin);
app.get('/api/auth/demo/credentials', auth.getDemoCredentials);
app.get('/api/auth/me', auth.authMiddleware, auth.handleGetCurrentUser);

// =====================================================
// SERVICES ROUTES
// =====================================================

app.get('/api/services', async (req, res) => {
    try {
        const services = await db.getServices({ category: req.query.category });
        res.json({ services });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get services' });
    }
});

app.post('/api/services', auth.authMiddleware, auth.requireRole(['admin']), async (req, res) => {
    try {
        const service = await db.createService(req.body);
        res.status(201).json({ success: true, service });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create service' });
    }
});

// =====================================================
// APPOINTMENTS ROUTES
// =====================================================

app.get('/api/appointments', auth.authMiddleware, async (req, res) => {
    try {
        const filters = {
            customerId: req.query.customerId || (req.user.role === 'customer' ? req.user.id : undefined),
            staffId: req.query.staffId,
            date: req.query.date,
            status: req.query.status
        };
        const appointments = await db.getAppointments(filters);
        res.json({ appointments });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get appointments' });
    }
});

app.post('/api/appointments', auth.authMiddleware, middleware.validateBooking, async (req, res) => {
    try {
        const appointment = await db.createAppointment({
            ...req.body,
            customer_id: req.user.id,
            status: 'pending'
        });
        res.status(201).json({ success: true, appointment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create appointment' });
    }
});

app.put('/api/appointments/:id', auth.authMiddleware, async (req, res) => {
    try {
        const appointment = await db.updateAppointment(req.params.id, req.body);
        res.json({ success: true, appointment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.put('/api/appointments/:id/cancel', auth.authMiddleware, async (req, res) => {
    try {
        await db.updateAppointment(req.params.id, { status: 'cancelled' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel appointment' });
    }
});

// =====================================================
// PAYMENTS ROUTES (PayMongo)
// =====================================================

app.get('/api/payments/methods', (req, res) => {
    res.json(paymongo.getClientConfig());
});

app.post('/api/payments/create', auth.authMiddleware, async (req, res) => {
    try {
        const { method, amount, appointmentId, returnUrl, cardDetails } = req.body;
        let result;

        if (!paymongo.isConfigured()) {
            result = paymongo.createDemoPayment({ amount, appointmentId });
        } else {
            switch (method) {
                case 'gcash':
                    result = await paymongo.createGCashPayment({ amount, returnUrl });
                    break;
                case 'grab_pay':
                    result = await paymongo.createGrabPayPayment({ amount, returnUrl });
                    break;
                case 'paymaya':
                    result = await paymongo.createMayaPayment({ amount, returnUrl });
                    break;
                case 'card':
                    result = await paymongo.createCardPayment({ amount, cardDetails, returnUrl, description: `Appointment ${appointmentId}` });
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid payment method' });
            }
        }

        const payment = await db.createPayment({
            appointment_id: appointmentId,
            customer_id: req.user.id,
            amount,
            payment_method: method,
            gateway_payment_id: result.sourceId || result.paymentIntentId || result.id,
            status: 'pending'
        });

        res.json({ success: true, paymentId: payment.id, redirectUrl: result.redirectUrl, ...result });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ error: error.message || 'Payment failed' });
    }
});

app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['paymongo-signature'];
        const payload = JSON.parse(req.body);
        const event = await paymongo.processWebhook(payload, signature);

        const payment = await db.updatePaymentStatus(event.paymentId, event.status === 'paid' ? 'completed' : 'failed');
        if (event.status === 'paid' && payment) {
            await db.updateAppointment(payment.appointment_id, { status: 'confirmed', payment_status: 'paid' });
        }

        res.json({ received: true });
    } catch (error) {
        res.status(400).json({ error: 'Webhook failed' });
    }
});

// =====================================================
// STAFF & FEEDBACK
// =====================================================

app.get('/api/staff', async (req, res) => {
    try {
        const staff = await db.getStaff();
        res.json({ staff });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get staff' });
    }
});

app.get('/api/feedback', async (req, res) => {
    try {
        const feedback = await db.getFeedback(parseInt(req.query.limit) || 10);
        res.json({ feedback });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get feedback' });
    }
});

app.post('/api/feedback', auth.authMiddleware, async (req, res) => {
    try {
        const feedback = await db.createFeedback({ ...req.body, customer_id: req.user.id });
        res.status(201).json({ success: true, feedback });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create feedback' });
    }
});

// =====================================================
// DASHBOARD & CHAT
// =====================================================

app.get('/api/dashboard/stats', auth.authMiddleware, auth.requireRole(['admin', 'staff', 'receptionist']), async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

app.get('/api/chat/:room/messages', auth.authMiddleware, async (req, res) => {
    try {
        const messages = await db.getChatMessages(req.params.room);
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

app.post('/api/chat/:room/messages', auth.authMiddleware, async (req, res) => {
    try {
        const message = await db.sendChatMessage(req.user.id, req.body.message, req.params.room);
        res.json({ success: true, message });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// =====================================================
// ADMIN & HEALTH
// =====================================================

app.get('/api/admin/cache/stats', auth.authMiddleware, auth.requireRole(['admin']), (req, res) => {
    res.json(cache.getStats());
});

app.delete('/api/admin/cache', auth.authMiddleware, auth.requireRole(['admin']), async (req, res) => {
    await cache.close();
    res.json({ success: true, message: 'Cache cleared' });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cache: cache.getStats(),
        paymongo: paymongo.isConfigured() ? 'configured' : 'demo'
    });
});

// =====================================================
// SERVE PAGES
// =====================================================

app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'html/landing-page.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(publicPath, 'html/customer-dashboard.html')));
app.get('/staff', (req, res) => res.sendFile(path.join(publicPath, 'html/staff-dashboard.html')));
app.get('/receptionist', (req, res) => res.sendFile(path.join(publicPath, 'html/receptionist-dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(publicPath, 'html/admin-dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(publicPath, 'html/chatroom.html')));

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
    await cache.initRedis();

    const port = config.server.port;

    if (config.server.https.enabled) {
        try {
            const sslOptions = {
                key: fs.readFileSync(config.server.https.key),
                cert: fs.readFileSync(config.server.https.cert)
            };
            https.createServer(sslOptions, app).listen(port, () => {
                console.log(`\n🔒 HTTPS Server running on https://localhost:${port}`);
                printInfo();
            });
        } catch (error) {
            console.error('HTTPS failed:', error.message);
            startHttp(port);
        }
    } else {
        startHttp(port);
    }
}

function startHttp(port) {
    http.createServer(app).listen(port, () => {
        console.log(`\n🔓 HTTP Server running on http://localhost:${port}`);
        printInfo();
    });
}

function printInfo() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   ✿ Dear Self - Nails, Salon & Spa                        ║
║                                                           ║
║   Features: Redis (${config.redis.enabled ? 'ON' : 'OFF'}), PayMongo (${paymongo.isConfigured() ? 'ON' : 'DEMO'})      ║
║                                                           ║
║   Demo Credentials:                                       ║
║   • admin@dearself.spa / admin123                         ║
║   • staff@dearself.spa / staff123                         ║
║   • receptionist@dearself.spa / reception123              ║
║   • customer@dearself.spa / customer123                  ║
╚═══════════════════════════════════════════════════════════╝
    `);
}

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await cache.close();
    process.exit(0);
});

startServer();