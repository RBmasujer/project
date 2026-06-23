/**
 * Dear Self - Middleware (Rate Limiting, Security)
 */

const config = require('./config');

// Rate Limiter
class RateLimiter {
    constructor(windowMs, max) {
        this.windowMs = windowMs;
        this.max = max;
        this.requests = new Map();
    }

    isAllowed(identifier) {
        const now = Date.now();
        const timestamps = this.requests.get(identifier) || [];
        const valid = timestamps.filter(t => now - t < this.windowMs);

        if (valid.length >= this.max) {
            return { allowed: false, retryAfter: Math.ceil((valid[0] + this.windowMs - now) / 1000) };
        }

        valid.push(now);
        this.requests.set(identifier, valid);
        return { allowed: true, remaining: this.max - valid.length };
    }
}

const limiters = {
    login: new RateLimiter(config.security.rateLimits.login.window, config.security.rateLimits.login.max),
    register: new RateLimiter(config.security.rateLimits.register.window, config.security.rateLimits.register.max),
    api: new RateLimiter(config.security.rateLimits.api.window, config.security.rateLimits.api.max)
};

// Cleanup every minute
setInterval(() => Object.values(limiters).forEach(l => {
    const now = Date.now();
    for (const [k, v] of l.requests) {
        const valid = v.filter(t => now - t < l.windowMs);
        if (valid.length === 0) l.requests.delete(k);
        else l.requests.set(k, valid);
    }
}), 60000);

function rateLimit(type) {
    return (req, res, next) => {
        const limiter = limiters[type] || limiters.api;
        const identifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const result = limiter.isAllowed(identifier);

        res.setHeader('X-RateLimit-Limit', limiter.max);
        res.setHeader('X-RateLimit-Remaining', result.remaining || 0);

        if (!result.allowed) {
            res.setHeader('Retry-After', result.retryAfter);
            return res.status(429).json({ error: 'Too many requests', retryAfter: result.retryAfter });
        }

        next();
    };
}

// Security headers
function securityHeaders(req, res, next) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
}

// Input sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>]/g, '').replace(/javascript:/gi, '').trim();
}

function sanitizeObject(obj) {
    const sanitized = {};
    for (const key in obj) {
        if (typeof obj[key] === 'string') sanitized[key] = sanitizeInput(obj[key]);
        else if (typeof obj[key] === 'object' && obj[key] !== null) sanitized[key] = sanitizeObject(obj[key]);
        else sanitized[key] = obj[key];
    }
    return sanitized;
}

function sanitizeMiddleware(req, res, next) {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    next();
}

// Validation
function validateRegistration(req, res, next) {
    const { email, password, full_name } = req.body;
    const errors = [];

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email required');
    if (!password || password.length < 8) errors.push('Password must be 8+ characters');
    if (!full_name || full_name.length < 2) errors.push('Name must be 2+ characters');

    if (errors.length > 0) return res.status(400).json({ errors });
    next();
}

function validateBooking(req, res, next) {
    const { serviceId, appointmentDate, startTime } = req.body;
    const errors = [];

    if (!serviceId) errors.push('Service required');
    if (!appointmentDate) errors.push('Date required');
    else if (new Date(appointmentDate) < new Date().setHours(0, 0, 0, 0)) errors.push('Past dates not allowed');
    if (!startTime) errors.push('Time required');

    if (errors.length > 0) return res.status(400).json({ errors });
    next();
}

module.exports = {
    rateLimit,
    securityHeaders,
    sanitizeMiddleware,
    validateRegistration,
    validateBooking
};