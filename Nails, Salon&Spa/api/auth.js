/**
 * Dear Self - Authentication Module
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('./config');
const db = require('./db');

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, config.jwt.secret);
    } catch (e) {
        return null;
    }
}

async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// Middleware
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });

    req.user = decoded;
    next();
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

// Handlers
async function handleLogin(req, res) {
    const { email, password } = req.body;

    try {
        const user = await db.getUserByEmail(email);
        if (!user || !user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await comparePassword(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = generateToken(user);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                avatar_url: user.avatar_url
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function handleRegister(req, res) {
    const { email, password, full_name, phone, role = 'customer' } = req.body;

    try {
        const existing = await db.getUserByEmail(email);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const passwordHash = await hashPassword(password);
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const user = await db.createUserProfile(userId, {
            email, full_name, phone, role, password_hash: passwordHash
        });

        if (!user) return res.status(500).json({ error: 'Failed to create user' });

        const token = generateToken(user);

        res.status(201).json({
            success: true,
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
            token
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function handleGetCurrentUser(req, res) {
    try {
        const user = await db.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                avatar_url: user.avatar_url
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Demo handlers
const demoUsers = [
    { id: 'demo-admin', email: 'admin@dearself.spa', password: 'admin123', name: 'Admin User', role: 'admin' },
    { id: 'demo-staff', email: 'staff@dearself.spa', password: 'staff123', name: 'Staff User', role: 'staff' },
    { id: 'demo-receptionist', email: 'receptionist@dearself.spa', password: 'reception123', name: 'Receptionist', role: 'receptionist' },
    { id: 'demo-customer', email: 'customer@dearself.spa', password: 'customer123', name: 'Customer User', role: 'customer' }
];

function handleDemoLogin(req, res) {
    const { email, password } = req.body;
    const user = demoUsers.find(u => u.email === email && u.password === password);

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken(user);

    res.json({
        success: true,
        user: { id: user.id, email: user.email, full_name: user.name, role: user.role },
        token
    });
}

function getDemoCredentials(req, res) {
    res.json({
        credentials: demoUsers.map(u => ({ email: u.email, password: u.password, role: u.role }))
    });
}

module.exports = {
    generateToken, verifyToken, hashPassword, comparePassword,
    authMiddleware, requireRole,
    handleLogin, handleRegister, handleGetCurrentUser,
    handleDemoLogin, getDemoCredentials
};