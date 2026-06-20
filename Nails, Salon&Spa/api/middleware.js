/**
 * Dear Self - Security & Rate Limiting Middleware
 * Protects against cyber attacks and abuse
 */

const crypto = require('crypto');

// Encryption key (should be in environment variables)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key';
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

// =====================================================
// RATE LIMITER CLASS
// =====================================================
class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 10) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.requests = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), windowMs);
    }

    cleanup() {
        const now = Date.now();
        for (const [key, timestamps] of this.requests) {
            const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
            if (validTimestamps.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, validTimestamps);
            }
        }
    }

    isAllowed(identifier) {
        const now = Date.now();
        const timestamps = this.requests.get(identifier) || [];
        const validTimestamps = timestamps.filter(t => now - t < this.windowMs);

        if (validTimestamps.length >= this.maxRequests) {
            return {
                allowed: false,
                retryAfter: Math.ceil((validTimestamps[0] + this.windowMs - now) / 1000)
            };
        }

        validTimestamps.push(now);
        this.requests.set(identifier, validTimestamps);
        return { allowed: true };
    }

    getRemainingRequests(identifier) {
        const timestamps = this.requests.get(identifier) || [];
        const now = Date.now();
        const validTimestamps = timestamps.filter(t => now - t < this.windowMs);
        return Math.max(0, this.maxRequests - validTimestamps.length);
    }
}

// Different rate limiters for different endpoints
const loginLimiter = new RateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
const registerLimiter = new RateLimiter(60 * 60 * 1000, 3); // 3 registrations per hour
const bookingLimiter = new RateLimiter(60 * 1000, 10); // 10 bookings per minute
const apiLimiter = new RateLimiter(60 * 1000, 100); // 100 API calls per minute
const chatLimiter = new RateLimiter(60 * 1000, 50); // 50 messages per minute

// =====================================================
// RATE LIMITING MIDDLEWARE
// =====================================================
function createRateLimitMiddleware(limiter, identifierFn = (req) => req.ip) {
    return (req, res, next) => {
        const identifier = identifierFn(req);
        const result = limiter.isAllowed(identifier);

        res.setHeader('X-RateLimit-Limit', limiter.maxRequests);
        res.setHeader('X-RateLimit-Remaining', limiter.getRemainingRequests(identifier));

        if (!result.allowed) {
            res.setHeader('Retry-After', result.retryAfter);
            return res.status(429).json({
                error: 'Too many requests',
                message: `Please wait ${result.retryAfter} seconds before trying again.`,
                retryAfter: result.retryAfter
            });
        }

        next();
    };
}

// =====================================================
// BRUTE FORCE PROTECTION
// =====================================================
class BruteForceProtection {
    constructor() {
        this.failedAttempts = new Map();
        this.blockedIPs = new Map();
        this.maxFailedAttempts = 5;
        this.blockDuration = 30 * 60 * 1000; // 30 minutes
        this.progressiveDelay = true;
    }

    recordFailedAttempt(identifier) {
        const attempts = this.failedAttempts.get(identifier) || { count: 0, firstAttempt: Date.now() };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        this.failedAttempts.set(identifier, attempts);

        if (attempts.count >= this.maxFailedAttempts) {
            this.blockedIPs.set(identifier, {
                blockedAt: Date.now(),
                duration: this.blockDuration * Math.ceil(attempts.count / this.maxFailedAttempts)
            });
        }

        return attempts.count;
    }

    recordSuccess(identifier) {
        this.failedAttempts.delete(identifier);
    }

    isBlocked(identifier) {
        const block = this.blockedIPs.get(identifier);
        if (!block) return false;

        if (Date.now() - block.blockedAt > block.duration) {
            this.blockedIPs.delete(identifier);
            this.failedAttempts.delete(identifier);
            return false;
        }

        return true;
    }

    getRemainingBlockTime(identifier) {
        const block = this.blockedIPs.get(identifier);
        if (!block) return 0;
        return Math.ceil((block.blockedAt + block.duration - Date.now()) / 1000);
    }

    getDelay(identifier) {
        const attempts = this.failedAttempts.get(identifier);
        if (!attempts) return 0;
        // Progressive delay: 0s, 1s, 2s, 4s, 8s, 16s...
        return Math.min(16000, Math.pow(2, Math.max(0, attempts.count - 1)) * 1000);
    }
}

const bruteForceProtection = new BruteForceProtection();

// Brute force protection middleware
function bruteForceMiddleware(req, res, next) {
    const identifier = req.ip;

    if (bruteForceProtection.isBlocked(identifier)) {
        const remainingTime = bruteForceProtection.getRemainingBlockTime(identifier);
        return res.status(403).json({
            error: 'Account temporarily locked',
            message: `Too many failed attempts. Please try again in ${remainingTime} seconds.`,
            unlockIn: remainingTime
        });
    }

    const delay = bruteForceProtection.getDelay(identifier);
    if (delay > 0) {
        return setTimeout(next, delay);
    }

    next();
}

// =====================================================
// DATA ENCRYPTION UTILITIES
// =====================================================
const EncryptionUtils = {
    encrypt(text) {
        if (!text) return null;
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('Encryption error:', error);
            return null;
        }
    },

    decrypt(encryptedData) {
        if (!encryptedData) return null;
        try {
            const parts = encryptedData.split(':');
            if (parts.length !== 2) return null;
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    },

    hash(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    },

    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    },

    secureCompare(a, b) {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    }
};

// =====================================================
// DATA SANITIZATION
// =====================================================
const Sanitizer = {
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
    },

    sanitizeEmail(email) {
        if (!email) return '';
        const sanitized = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(sanitized) ? sanitized : '';
    },

    sanitizePhone(phone) {
        if (!phone) return '';
        return phone.replace(/[^\d+\-()\s]/g, '');
    },

    sanitizeObject(obj) {
        const sanitized = {};
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                sanitized[key] = this.sanitizeInput(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitized[key] = this.sanitizeObject(obj[key]);
            } else {
                sanitized[key] = obj[key];
            }
        }
        return sanitized;
    },

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
};

// Sanitization middleware
function sanitizationMiddleware(req, res, next) {
    if (req.body) {
        req.body = Sanitizer.sanitizeObject(req.body);
    }
    if (req.query) {
        req.query = Sanitizer.sanitizeObject(req.query);
    }
    if (req.params) {
        req.params = Sanitizer.sanitizeObject(req.params);
    }
    next();
}

// =====================================================
// PAYMENT VALIDATION & PROCESSING MIDDLEWARE
// =====================================================
const PaymentValidator = {
    validateCardNumber(cardNumber) {
        // Remove spaces and dashes
        const cleaned = cardNumber.replace(/[\s-]/g, '');

        // Check if contains only digits and is valid length
        if (!/^\d{13,19}$/.test(cleaned)) {
            return { valid: false, error: 'Invalid card number format' };
        }

        // Luhn algorithm validation
        let sum = 0;
        let isEven = false;
        for (let i = cleaned.length - 1; i >= 0; i--) {
            let digit = parseInt(cleaned[i], 10);
            if (isEven) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            isEven = !isEven;
        }

        if (sum % 10 !== 0) {
            return { valid: false, error: 'Invalid card number' };
        }

        return { valid: true, cardType: this.getCardType(cleaned) };
    },

    getCardType(cardNumber) {
        const patterns = {
            visa: /^4/,
            mastercard: /^5[1-5]/,
            amex: /^3[47]/,
            discover: /^6(?:011|5)/
        };

        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(cardNumber)) return type;
        }
        return 'unknown';
    },

    validateExpiry(month, year) {
        const now = new Date();
        const expiry = new Date(year, month - 1);
        return expiry > now;
    },

    validateCVV(cvv, cardType) {
        const length = cardType === 'amex' ? 4 : 3;
        return new RegExp(`^\\d{${length}}$`).test(cvv);
    },

    validatePaymentDetails(details) {
        const errors = [];

        if (!details.amount || details.amount <= 0) {
            errors.push('Invalid payment amount');
        }

        if (details.cardNumber) {
            const cardValidation = this.validateCardNumber(details.cardNumber);
            if (!cardValidation.valid) {
                errors.push(cardValidation.error);
            }
        }

        if (details.expiryMonth && details.expiryYear) {
            if (!this.validateExpiry(details.expiryMonth, details.expiryYear)) {
                errors.push('Card has expired');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
};

// Payment processing middleware with double-booking prevention
function paymentMiddleware(req, res, next) {
    const { appointmentId, amount, paymentMethodId } = req.body;

    // Validate payment details
    if (!appointmentId || !amount) {
        return res.status(400).json({ error: 'Missing payment details' });
    }

    if (amount <= 0) {
        return res.status(400).json({ error: 'Invalid payment amount' });
    }

    // Generate payment token to prevent double processing
    const paymentToken = EncryptionUtils.generateToken();
    req.paymentToken = paymentToken;

    next();
}

// Double booking prevention
class DoubleBookingPrevention {
    constructor() {
        this.pendingBookings = new Map();
        this.lockDuration = 5 * 60 * 1000; // 5 minutes
    }

    acquireLock(appointmentId, userId) {
        const key = `${appointmentId}:${userId}`;
        const lock = this.pendingBookings.get(key);

        if (lock && Date.now() - lock.timestamp < this.lockDuration) {
            return { locked: false, message: 'Booking is already being processed' };
        }

        this.pendingBookings.set(key, {
            timestamp: Date.now(),
            status: 'pending'
        });

        return { locked: true, releaseLock: () => this.releaseLock(appointmentId, userId) };
    }

    releaseLock(appointmentId, userId) {
        const key = `${appointmentId}:${userId}`;
        this.pendingBookings.delete(key);
    }

    isSlotBeingBooked(date, time, staffId) {
        const slotKey = `${date}:${time}:${staffId}`;
        for (const [key, lock] of this.pendingBookings) {
            if (key.includes(slotKey) && Date.now() - lock.timestamp < this.lockDuration) {
                return true;
            }
        }
        return false;
    }
}

const doubleBookingPrevention = new DoubleBookingPrevention();

// Double booking prevention middleware
function preventDoubleBooking(req, res, next) {
    const { appointmentDate, startTime, staffId } = req.body;

    if (doubleBookingPrevention.isSlotBeingBooked(appointmentDate, startTime, staffId)) {
        return res.status(409).json({
            error: 'Time slot is currently being booked',
            message: 'This time slot is being processed. Please try another slot or wait a moment.'
        });
    }

    const lock = doubleBookingPrevention.acquireLock(
        `${appointmentDate}:${startTime}`,
        req.user?.id || req.ip
    );

    if (!lock.locked) {
        return res.status(409).json({
            error: 'Booking in progress',
            message: lock.message
        });
    }

    req.bookingLock = lock;
    next();
}

// =====================================================
// SECURITY HEADERS MIDDLEWARE
// =====================================================
function securityHeadersMiddleware(req, res, next) {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Content Security Policy
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
        "img-src 'self' data: https://images.pexels.com https://*.supabase.co; " +
        "connect-src 'self' https://*.supabase.co;"
    );

    // HTTPS only
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
}

// =====================================================
// INPUT VALIDATION
// =====================================================
function validateRegistrationInput(req, res, next) {
    const { email, password, full_name, phone, role } = req.body;
    const errors = [];

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push('Valid email is required');
    }

    // Password strength validation
    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    // Name validation
    if (!full_name || full_name.length < 2) {
        errors.push('Full name is required (minimum 2 characters)');
    }

    // Role validation
    const validRoles = ['customer', 'staff', 'receptionist', 'admin'];
    if (role && !validRoles.includes(role)) {
        errors.push('Invalid role selected');
    }

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    next();
}

function validateLoginInput(req, res, next) {
    const { email, password } = req.body;
    const errors = [];

    if (!email) errors.push('Email is required');
    if (!password) errors.push('Password is required');

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    next();
}

function validateBookingInput(req, res, next) {
    const { serviceId, appointmentDate, startTime } = req.body;
    const errors = [];

    if (!serviceId) errors.push('Service is required');

    if (!appointmentDate) {
        errors.push('Appointment date is required');
    } else {
        const date = new Date(appointmentDate);
        if (date < new Date().setHours(0, 0, 0, 0)) {
            errors.push('Cannot book for past dates');
        }
    }

    if (!startTime) errors.push('Start time is required');

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    next();
}

// =====================================================
// CSRF PROTECTION
// =====================================================
const csrfTokens = new Map();

function generateCsrfToken(sessionId) {
    const token = EncryptionUtils.generateToken();
    csrfTokens.set(sessionId, { token, expires: Date.now() + 3600000 }); // 1 hour
    return token;
}

function validateCsrfToken(sessionId, token) {
    const stored = csrfTokens.get(sessionId);
    if (!stored) return false;
    if (Date.now() > stored.expires) {
        csrfTokens.delete(sessionId);
        return false;
    }
    return EncryptionUtils.secureCompare(stored.token, token);
}

function csrfMiddleware(req, res, next) {
    // Skip for GET requests
    if (req.method === 'GET') return next();

    const sessionId = req.session?.id || req.ip;
    const token = req.headers['x-csrf-token'] || req.body._csrf;

    if (!token || !validateCsrfToken(sessionId, token)) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    // Rate limiting
    RateLimiter,
    loginLimiter: createRateLimitMiddleware(loginLimiter),
    registerLimiter: createRateLimitMiddleware(registerLimiter),
    bookingLimiter: createRateLimitMiddleware(bookingLimiter),
    apiLimiter: createRateLimitMiddleware(apiLimiter),
    chatLimiter: createRateLimitMiddleware(chatLimiter),
    createRateLimitMiddleware,

    // Brute force protection
    bruteForceMiddleware,
    bruteForceProtection,

    // Encryption
    EncryptionUtils,

    // Sanitization
    Sanitizer,
    sanitizationMiddleware,

    // Payment
    PaymentValidator,
    paymentMiddleware,
    preventDoubleBooking,
    DoubleBookingPrevention,

    // Security headers
    securityHeadersMiddleware,

    // Validation
    validateRegistrationInput,
    validateLoginInput,
    validateBookingInput,

    // CSRF
    generateCsrfToken,
    validateCsrfToken,
    csrfMiddleware
};