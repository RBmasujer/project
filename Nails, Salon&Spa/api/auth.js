/**
 * Dear Self - Authentication Module
 * Handles server-side authentication and session management
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} Match result
 */
async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 * @param {object} user - User object
 * @returns {string} JWT token
 */
function generateToken(user) {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {object|null} Decoded payload or null
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Authentication middleware for protected routes
 */
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
}

/**
 * Role-based authorization middleware
 * @param {string[]} roles - Allowed roles
 */
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        next();
    };
}

/**
 * Login handler
 */
async function handleLogin(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        // In production, fetch user from database
        // const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        // Demo user for testing
        const demoUser = {
            id: 'demo-123',
            email: email,
            full_name: 'Demo User',
            role: email.includes('admin') ? 'admin' :
                  email.includes('staff') ? 'staff' :
                  email.includes('reception') ? 'receptionist' : 'customer',
            password_hash: await hashPassword('demo123')
        };

        // In production: const validPassword = await comparePassword(password, user.password_hash);
        const validPassword = password === 'demo123';

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(demoUser);

        res.json({
            message: 'Login successful',
            user: {
                id: demoUser.id,
                email: demoUser.email,
                full_name: demoUser.full_name,
                role: demoUser.role
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Register handler
 */
async function handleRegister(req, res) {
    const { email, password, full_name, phone, role } = req.body;

    if (!email || !password || !full_name) {
        return res.status(400).json({ error: 'Email, password, and name required' });
    }

    try {
        const password_hash = await hashPassword(password);
        const userId = `user-${Date.now()}`;

        // In production, save to database
        // await db.query('INSERT INTO users (id, email, password_hash, full_name, phone, role) VALUES ...')

        const newUser = {
            id: userId,
            email,
            full_name,
            phone: phone || null,
            role: role || 'customer'
        };

        const token = generateToken(newUser);

        res.status(201).json({
            message: 'Registration successful',
            user: newUser,
            token
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Logout handler
 */
function handleLogout(req, res) {
    // In production, invalidate token (add to blacklist, etc.)
    res.json({ message: 'Logged out successfully' });
}

/**
 * Get current user
 */
function handleGetCurrentUser(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // In production, fetch full user from database
    res.json({ user: req.user });
}

/**
 * Update password
 */
async function handleUpdatePassword(req, res) {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        // In production:
        // 1. Fetch user's current password hash
        // 2. Verify current password
        // 3. Hash new password
        // 4. Update in database

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Password reset request
 */
async function handlePasswordResetRequest(req, res) {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email required' });
    }

    try {
        // In production:
        // 1. Check if user exists
        // 2. Generate reset token
        // 3. Send email with reset link

        res.json({ message: 'If email exists, reset instructions sent' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Password reset completion
 */
async function handlePasswordResetComplete(req, res) {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password required' });
    }

    try {
        // In production:
        // 1. Verify reset token
        // 2. Hash new password
        // 3. Update password in database
        // 4. Invalidate reset token

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Direct login handler (for use with middleware)
 */
async function handleLoginDirect(email, password) {
    if (!email || !password) {
        return { error: 'Email and password required' };
    }

    try {
        // Demo user for testing
        const demoUsers = {
            'admin@dearself.spa': { id: 'admin-1', email, full_name: 'Admin User', role: 'admin', password_hash: await hashPassword('admin123') },
            'staff@dearself.spa': { id: 'staff-1', email, full_name: 'Staff User', role: 'staff', password_hash: await hashPassword('staff123') },
            'receptionist@dearself.spa': { id: 'reception-1', email, full_name: 'Receptionist User', role: 'receptionist', password_hash: await hashPassword('reception123') },
            'customer@dearself.spa': { id: 'customer-1', email, full_name: 'Customer User', role: 'customer', password_hash: await hashPassword('customer123') },
            'demo@example.com': { id: 'demo-1', email, full_name: 'Demo User', role: 'customer', password_hash: await hashPassword('demo123') }
        };

        const user = demoUsers[email.toLowerCase()];

        if (!user) {
            return { error: 'Invalid credentials' };
        }

        // For demo, any password that includes '123' works
        const validPassword = password.includes('123');

        if (!validPassword) {
            return { error: 'Invalid credentials' };
        }

        const token = generateToken(user);

        return {
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            },
            token
        };
    } catch (error) {
        console.error('Login error:', error);
        return { error: 'Internal server error' };
    }
}

/**
 * Direct register handler (for use with middleware)
 */
async function handleRegisterDirect({ email, password, full_name, phone, role }) {
    if (!email || !password || !full_name) {
        return { error: 'Missing required fields' };
    }

    try {
        const userId = `user-${Date.now()}`;
        const password_hash = await hashPassword(password);

        const newUser = {
            id: userId,
            email: email.toLowerCase(),
            full_name,
            phone,
            role: role || 'customer',
            created_at: new Date()
        };

        const token = generateToken(newUser);

        return {
            success: true,
            message: 'Registration successful',
            user: {
                id: newUser.id,
                email: newUser.email,
                full_name: newUser.full_name,
                role: newUser.role
            },
            token
        };
    } catch (error) {
        console.error('Register error:', error);
        return { error: 'Internal server error' };
    }
}

// Export functions
module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    authMiddleware,
    requireRole,
    handleLogin,
    handleRegister,
    handleLoginDirect,
    handleRegisterDirect,
    handleLogout,
    handleGetCurrentUser,
    handleUpdatePassword,
    handlePasswordResetRequest,
    handlePasswordResetComplete
};