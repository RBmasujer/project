/**
 * Dear Self - Nails, Salon & Spa
 * Express.js Server Configuration
 * Complete with security middleware, rate limiting, and real-time features
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Import modules
const auth = require('./auth');
const middleware = require('./middleware');
const dashboardController = require('./dashboard-controller');
const oauth = require('./oauth');

const app = express();
const server = http.createServer(app);

// =====================================================
// CORE MIDDLEWARE
// =====================================================
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser for OAuth
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Security headers
app.use(middleware.securityHeadersMiddleware);

// Input sanitization
app.use(middleware.sanitizationMiddleware);

// General API rate limiting
app.use('/api/', middleware.apiLimiter);

// Static files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// =====================================================
// AUTHENTICATION ROUTES (with rate limiting and brute force protection)
// =====================================================
app.post('/api/auth/login',
    middleware.loginLimiter,
    middleware.bruteForceMiddleware,
    middleware.validateLoginInput,
    async (req, res) => {
        const { email, password } = req.body;
        const identifier = req.ip;

        try {
            // Attempt authentication
            const result = await auth.handleLoginDirect(email, password);

            if (result.error) {
                // Record failed attempt
                middleware.bruteForceProtection.recordFailedAttempt(identifier);
                return res.status(401).json(result);
            }

            // Clear failed attempts on success
            middleware.bruteForceProtection.recordSuccess(identifier);

            // Generate CSRF token
            const csrfToken = middleware.generateCsrfToken(result.user.id);

            res.json({
                ...result,
                csrfToken
            });
        } catch (error) {
            middleware.bruteForceProtection.recordFailedAttempt(identifier);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

app.post('/api/auth/register',
    middleware.registerLimiter,
    middleware.validateRegistrationInput,
    async (req, res) => {
        try {
            const { email, password, full_name, phone, role } = req.body;

            // Encrypt sensitive data
            const encryptedPhone = phone ? middleware.EncryptionUtils.encrypt(phone) : null;

            const result = await auth.handleRegisterDirect({
                email,
                password,
                full_name,
                phone: encryptedPhone,
                role
            });

            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

app.post('/api/auth/logout', auth.authMiddleware, auth.handleLogout);
app.get('/api/auth/me', auth.authMiddleware, auth.handleGetCurrentUser);
app.put('/api/auth/password', auth.authMiddleware, middleware.validateLoginInput, auth.handleUpdatePassword);
app.post('/api/auth/reset-request', middleware.handlePasswordResetRequest);
app.post('/api/auth/reset-complete', middleware.handlePasswordResetComplete);

// =====================================================
// OAUTH ROUTES (Google & Facebook)
// =====================================================
// Get OAuth configuration
app.get('/api/auth/oauth/config', oauth.getOAuthConfig);

// Token-based OAuth login (for frontend SDK)
app.post('/api/auth/oauth/token',
    middleware.loginLimiter,
    oauth.handleOAuthTokenLogin
);

// Demo OAuth (for testing)
app.post('/api/auth/oauth/demo', oauth.handleDemoOAuth);

// Google OAuth flow
app.get('/api/auth/google', oauth.handleGoogleAuth);
app.get('/api/auth/google/callback', oauth.handleGoogleCallback);

// Facebook OAuth flow
app.get('/api/auth/facebook', oauth.handleFacebookAuth);
app.get('/api/auth/facebook/callback', oauth.handleFacebookCallback);

// =====================================================
// BOOKING ROUTES (with double-booking prevention)
// =====================================================
app.post('/api/appointments',
    auth.authMiddleware,
    middleware.bookingLimiter,
    middleware.validateBookingInput,
    middleware.preventDoubleBooking,
    async (req, res) => {
        try {
            const { serviceId, staffId, appointmentDate, startTime, notes } = req.body;
            const userId = req.user.id;

            // In production, save to database
            const appointment = {
                id: `apt-${Date.now()}`,
                customerId: userId,
                serviceId,
                staffId,
                appointmentDate,
                startTime,
                status: 'pending',
                notes,
                createdAt: new Date()
            };

            // Release the booking lock
            if (req.bookingLock && req.bookingLock.releaseLock) {
                req.bookingLock.releaseLock();
            }

            // Invalidate relevant caches
            dashboardController.dashboardAggregator.invalidateAppointment(userId);

            res.status(201).json({
                success: true,
                message: 'Appointment booked successfully',
                appointment
            });
        } catch (error) {
            console.error('Booking error:', error);
            res.status(500).json({ error: 'Failed to create appointment' });
        }
    }
);

app.put('/api/appointments/:id/cancel',
    auth.authMiddleware,
    async (req, res) => {
        try {
            const { id } = req.params;
            // In production, update in database

            dashboardController.dashboardAggregator.invalidateAppointment(req.user.id);

            res.json({ success: true, message: 'Appointment cancelled' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to cancel appointment' });
        }
    }
);

app.get('/api/appointments',
    auth.authMiddleware,
    async (req, res) => {
        try {
            const appointments = await dashboardController.dashboardAggregator
                .getUpcomingAppointments(req.user.id);
            res.json({ appointments });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get appointments' });
        }
    }
);

app.get('/api/appointments/:id', auth.authMiddleware, async (req, res) => {
    try {
        // In production, fetch from database
        res.json({ appointment: { id: req.params.id, status: 'pending' } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get appointment' });
    }
});

// =====================================================
// PAYMENT ROUTES (with encryption)
// =====================================================
app.post('/api/payments',
    auth.authMiddleware,
    middleware.paymentMiddleware,
    async (req, res) => {
        try {
            const { appointmentId, amount, paymentMethod } = req.body;
            const paymentToken = req.paymentToken;

            // Validate payment details
            const validation = middleware.PaymentValidator.validatePaymentDetails({
                amount,
                cardNumber: paymentMethod?.cardNumber
            });

            if (!validation.valid) {
                return res.status(400).json({ errors: validation.errors });
            }

            // In production, process with payment gateway
            const payment = {
                id: `pay-${Date.now()}`,
                appointmentId,
                amount,
                status: 'completed',
                paymentToken,
                processedAt: new Date()
            };

            // Clear appointment cache
            dashboardController.dashboardAggregator.invalidateAppointment(req.user.id);

            res.json({
                success: true,
                message: 'Payment processed successfully',
                payment: {
                    id: payment.id,
                    status: payment.status,
                    amount: payment.amount
                }
            });
        } catch (error) {
            console.error('Payment error:', error);
            res.status(500).json({ error: 'Payment processing failed' });
        }
    }
);

// =====================================================
// SERVICES & STAFF ROUTES
// =====================================================
app.get('/api/services', dashboardController.handleGetServices);
app.get('/api/staff', auth.authMiddleware, dashboardController.handleGetStaff);

// Admin-only routes
app.post('/api/services',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    async (req, res) => {
        try {
            const { name, description, category, duration_minutes, price } = req.body;
            // In production, save to database

            // Clear services cache
            dashboardController.serviceCache.delete('services:all');

            res.status(201).json({ success: true, service: req.body });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create service' });
        }
    }
);

app.put('/api/services/:id',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    async (req, res) => {
        try {
            // In production, update in database
            dashboardController.serviceCache.delete('services:all');
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update service' });
        }
    }
);

app.delete('/api/services/:id',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    async (req, res) => {
        try {
            // In production, delete from database
            dashboardController.serviceCache.delete('services:all');
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete service' });
        }
    }
);

// =====================================================
// DASHBOARD ROUTES
// =====================================================
app.get('/api/dashboard/customer',
    auth.authMiddleware,
    dashboardController.handleGetCustomerDashboard
);

app.get('/api/dashboard/staff',
    auth.authMiddleware,
    dashboardController.handleGetStaffDashboard
);

app.get('/api/dashboard/receptionist',
    auth.authMiddleware,
    auth.requireRole(['receptionist', 'admin']),
    dashboardController.handleGetReceptionistDashboard
);

app.get('/api/dashboard/admin',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    dashboardController.handleGetAdminDashboard
);

// Refresh dashboard on visibility change
app.post('/api/dashboard/refresh', auth.authMiddleware, dashboardController.handleVisibilityRefresh);

// =====================================================
// CHAT ROUTES
// =====================================================
app.get('/api/chat/:roomId/messages',
    auth.authMiddleware,
    middleware.chatLimiter,
    dashboardController.handleGetMessages
);

app.post('/api/chat/:roomId/messages',
    auth.authMiddleware,
    middleware.chatLimiter,
    dashboardController.handleSendMessage
);

app.post('/api/chat/:roomId/typing',
    auth.authMiddleware,
    dashboardController.handleTypingIndicator
);

app.post('/api/chat/:roomId/join',
    auth.authMiddleware,
    (req, res) => {
        const { roomId } = req.params;
        const userId = req.user.id;
        const userName = req.user.full_name;

        const result = dashboardController.chatRoomSystem.joinRoom(roomId, userId, userName);
        dashboardController.connectionManager.joinRoom(userId, roomId);

        res.json(result);
    }
);

app.post('/api/chat/:roomId/leave',
    auth.authMiddleware,
    (req, res) => {
        const { roomId } = req.params;
        const userId = req.user.id;
        const userName = req.user.full_name;

        dashboardController.chatRoomSystem.leaveRoom(roomId, userId, userName);
        dashboardController.connectionManager.leaveRoom(userId, roomId);

        res.json({ success: true });
    }
);

app.get('/api/chat/:roomId/info',
    auth.authMiddleware,
    (req, res) => {
        const info = dashboardController.chatRoomSystem.getRoomInfo(req.params.roomId);
        res.json(info);
    }
);

app.get('/api/chat/unread',
    auth.authMiddleware,
    (req, res) => {
        const counts = dashboardController.chatRoomSystem.getUnreadCounts(req.user.id);
        res.json(counts);
    }
);

// =====================================================
// ADMIN & MONITORING ROUTES
// =====================================================
app.get('/api/admin/stats',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    dashboardController.handleGetCacheStats
);

app.get('/api/admin/rate-limits',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    (req, res) => {
        const { loginLimiter, registerLimiter, bookingLimiter, apiLimiter, chatLimiter } = middleware;
        res.json({
            login: { window: '15 min', max: 5 },
            register: { window: '1 hour', max: 3 },
            booking: { window: '1 min', max: 10 },
            api: { window: '1 min', max: 100 },
            chat: { window: '1 min', max: 50 }
        });
    }
);

app.post('/api/admin/cache/clear',
    auth.authMiddleware,
    auth.requireRole(['admin']),
    (req, res) => {
        dashboardController.cache.clear();
        dashboardController.userCache.clear();
        dashboardController.appointmentCache.clear();
        dashboardController.serviceCache.clear();
        dashboardController.chatCache.clear();
        res.json({ success: true, message: 'All caches cleared' });
    }
);

// =====================================================
// FEEDBACK/REVIEWS ROUTES
// =====================================================
app.post('/api/feedback',
    auth.authMiddleware,
    async (req, res) => {
        try {
            const { appointmentId, rating, comment } = req.body;
            const customerId = req.user.id;

            if (!rating || rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Rating must be between 1 and 5' });
            }

            // In production, save to database
            const feedback = {
                id: `fb-${Date.now()}`,
                customerId,
                appointmentId,
                rating,
                comment: middleware.Sanitizer.sanitizeInput(comment),
                createdAt: new Date()
            };

            res.status(201).json({ success: true, feedback });
        } catch (error) {
            res.status(500).json({ error: 'Failed to submit feedback' });
        }
    }
);

app.get('/api/feedback',
    async (req, res) => {
        try {
            // In production, fetch from database
            res.json({ feedback: [] });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get feedback' });
        }
    }
);

// =====================================================
// HEALTH CHECK & MONITORING
// =====================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// =====================================================
// SERVE HTML PAGES
// =====================================================
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

// =====================================================
// ERROR HANDLING
// =====================================================
app.use((err, req, res, next) => {
    console.error('Server error:', err);

    // Don't leak error details in production
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(500).json({
        error: isProduction ? 'Internal server error' : err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ✿ Dear Self - Nails, Salon & Spa                        ║
║                                                           ║
║   Server running on port ${PORT}                            ║
║   Visit: http://localhost:${PORT}                           ║
║                                                           ║
║   Security Features Enabled:                              ║
║   ✓ Rate Limiting (Login, Register, Booking, API)        ║
║   ✓ Brute Force Protection                                ║
║   ✓ Data Encryption (AES-256-CBC)                         ║
║   ✓ Input Sanitization                                    ║
║   ✓ Double Booking Prevention                             ║
║   ✓ Security Headers                                      ║
║   ✓ In-Memory Caching with TTL                            ║
║   ✓ Real-time Chat System                                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;