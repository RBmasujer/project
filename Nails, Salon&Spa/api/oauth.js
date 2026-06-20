/**
 * Dear Self - OAuth Authentication Module
 * Handles Google and Facebook OAuth integration
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// OAuth Provider Configuration
const OAUTH_CONFIG = {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
        scope: 'openid email profile'
    },
    facebook: {
        clientId: process.env.FACEBOOK_APP_ID || 'your-facebook-app-id',
        clientSecret: process.env.FACEBOOK_APP_SECRET || 'your-facebook-app-secret',
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/auth/facebook/callback',
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        userInfoUrl: 'https://graph.facebook.com/me',
        scope: 'email,public_profile'
    }
};

// State tokens for CSRF protection
const stateTokens = new Map();

/**
 * Generate state token for OAuth flow
 */
function generateStateToken(provider, redirect = '/') {
    const state = crypto.randomBytes(32).toString('hex');
    stateTokens.set(state, {
        provider,
        redirect,
        createdAt: Date.now()
    });

    // Clean up old tokens (older than 10 minutes)
    for (const [key, value] of stateTokens) {
        if (Date.now() - value.createdAt > 600000) {
            stateTokens.delete(key);
        }
    }

    return state;
}

/**
 * Verify state token
 */
function verifyStateToken(state) {
    const token = stateTokens.get(state);
    if (!token) return null;
    if (Date.now() - token.createdAt > 600000) {
        stateTokens.delete(state);
        return null;
    }
    stateTokens.delete(state);
    return token;
}

/**
 * Generate JWT token for user
 */
function generateToken(user) {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role || 'customer'
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Get authorization URL for OAuth provider
 * @param {string} provider - 'google' or 'facebook'
 * @param {string} redirect - Where to redirect after auth
 * @returns {string} Authorization URL
 */
function getAuthorizationUrl(provider, redirect = '/') {
    const config = OAUTH_CONFIG[provider];
    if (!config) {
        throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    const state = generateStateToken(provider, redirect);
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scope,
        state: state
    });

    return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(provider, code) {
    const config = OAUTH_CONFIG[provider];
    if (!config) {
        throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code: code,
        grant_type: 'authorization_code'
    });

    try {
        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Token exchange failed:', error);
            throw new Error('Failed to exchange authorization code');
        }

        return await response.json();
    } catch (error) {
        console.error('Token exchange error:', error);
        throw error;
    }
}

/**
 * Get user info from OAuth provider
 */
async function getUserInfo(provider, accessToken) {
    const config = OAUTH_CONFIG[provider];
    if (!config) {
        throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    try {
        let url = config.userInfoUrl;

        if (provider === 'google') {
            url = `${config.userInfoUrl}?access_token=${accessToken}`;
        } else if (provider === 'facebook') {
            url = `${config.userInfoUrl}?fields=id,name,email,picture&access_token=${accessToken}`;
        }

        const response = await fetch(url, {
            headers: provider === 'google' ? {
                'Authorization': `Bearer ${accessToken}`
            } : {}
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        const data = await response.json();

        // Normalize user data
        return normalizeUserInfo(provider, data);
    } catch (error) {
        console.error('Get user info error:', error);
        throw error;
    }
}

/**
 * Normalize user info from different providers
 */
function normalizeUserInfo(provider, data) {
    switch (provider) {
        case 'google':
            return {
                providerId: data.sub,
                provider: 'google',
                email: data.email,
                emailVerified: data.email_verified,
                name: data.name,
                firstName: data.given_name,
                lastName: data.family_name,
                picture: data.picture,
                locale: data.locale
            };

        case 'facebook':
            return {
                providerId: data.id,
                provider: 'facebook',
                email: data.email,
                emailVerified: !!data.email,
                name: data.name,
                firstName: data.first_name,
                lastName: data.last_name,
                picture: data.picture?.data?.url
            };

        default:
            return data;
    }
}

/**
 * Create or update user from OAuth info
 */
async function createUserFromOAuth(userInfo, supabase = null) {
    const userId = `${userInfo.provider}-${userInfo.providerId}`;
    const timestamp = new Date().toISOString();

    const user = {
        id: userId,
        email: userInfo.email,
        full_name: userInfo.name,
        avatar_url: userInfo.picture,
        role: 'customer',
        oauth_provider: userInfo.provider,
        oauth_id: userInfo.providerId,
        email_verified: userInfo.emailVerified,
        created_at: timestamp,
        updated_at: timestamp
    };

    // If Supabase is available, save to database
    if (supabase) {
        try {
            // Check if user exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (existingUser) {
                // Update existing user
                const { error } = await supabase
                    .from('users')
                    .update({
                        full_name: user.full_name,
                        avatar_url: user.avatar_url,
                        updated_at: timestamp
                    })
                    .eq('id', userId);

                return existingUser;
            } else {
                // Create new user
                const { error } = await supabase
                    .from('users')
                    .insert([user]);

                if (error) {
                    console.error('Error creating OAuth user:', error);
                }
            }
        } catch (error) {
            console.error('Database error:', error);
        }
    }

    return user;
}

/**
 * Handle OAuth callback
 */
async function handleOAuthCallback(provider, code, state) {
    // Verify state token
    const stateData = verifyStateToken(state);
    if (!stateData || stateData.provider !== provider) {
        throw new Error('Invalid state token');
    }

    try {
        // Exchange code for token
        const tokenData = await exchangeCodeForToken(provider, code);

        // Get user info
        const userInfo = await getUserInfo(provider, tokenData.access_token);

        // Create or get user
        const user = await createUserFromOAuth(userInfo);

        // Generate JWT
        const jwtToken = generateToken(user);

        return {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                avatar_url: user.avatar_url,
                oauth_provider: user.oauth_provider
            },
            token: jwtToken,
            redirect: stateData.redirect
        };
    } catch (error) {
        console.error('OAuth callback error:', error);
        throw error;
    }
}

/**
 * API Request Handlers
 */

// Initiate Google OAuth
function handleGoogleAuth(req, res) {
    const redirect = req.query.redirect || '/customer';
    const authUrl = getAuthorizationUrl('google', redirect);
    res.redirect(authUrl);
}

// Google OAuth callback
async function handleGoogleCallback(req, res) {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.redirect('/?error=oauth_failed');
    }

    try {
        const result = await handleOAuthCallback('google', code, state);

        // Set token as cookie and redirect
        res.cookie('auth_token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect with token in URL for client-side handling
        const redirectUrl = `${result.redirect}?token=${result.token}&oauth=google`;
        res.redirect(redirectUrl);
    } catch (error) {
        console.error('Google OAuth error:', error);
        res.redirect('/?error=oauth_error');
    }
}

// Initiate Facebook OAuth
function handleFacebookAuth(req, res) {
    const redirect = req.query.redirect || '/customer';
    const authUrl = getAuthorizationUrl('facebook', redirect);
    res.redirect(authUrl);
}

// Facebook OAuth callback
async function handleFacebookCallback(req, res) {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.redirect('/?error=oauth_failed');
    }

    try {
        const result = await handleOAuthCallback('facebook', code, state);

        // Set token as cookie and redirect
        res.cookie('auth_token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect with token in URL for client-side handling
        const redirectUrl = `${result.redirect}?token=${result.token}&oauth=facebook`;
        res.redirect(redirectUrl);
    } catch (error) {
        console.error('Facebook OAuth error:', error);
        res.redirect('/?error=oauth_error');
    }
}

// Handle OAuth login from frontend (token-based)
async function handleOAuthTokenLogin(req, res) {
    const { provider, idToken, accessToken } = req.body;

    try {
        let userInfo;

        if (provider === 'google') {
            // Verify Google ID token
            const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
            if (!response.ok) {
                throw new Error('Invalid Google token');
            }
            const data = await response.json();
            userInfo = normalizeUserInfo('google', {
                sub: data.sub,
                email: data.email,
                email_verified: data.email_verified,
                name: data.name,
                given_name: data.given_name,
                family_name: data.family_name,
                picture: data.picture
            });
        } else if (provider === 'facebook') {
            // Verify Facebook access token
            const response = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`);
            if (!response.ok) {
                throw new Error('Invalid Facebook token');
            }
            const data = await response.json();
            userInfo = normalizeUserInfo('facebook', data);
        } else {
            throw new Error('Unknown provider');
        }

        // Create or get user
        const user = await createUserFromOAuth(userInfo);
        const token = generateToken(user);

        res.json({
            success: true,
            message: 'OAuth login successful',
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
        console.error('OAuth token login error:', error);
        res.status(401).json({ error: 'OAuth authentication failed' });
    }
}

// Get OAuth configuration for frontend
function getOAuthConfig(req, res) {
    res.json({
        google: {
            clientId: OAUTH_CONFIG.google.clientId,
            enabled: OAUTH_CONFIG.google.clientId !== 'your-google-client-id'
        },
        facebook: {
            appId: OAUTH_CONFIG.facebook.clientId,
            enabled: OAUTH_CONFIG.facebook.clientId !== 'your-facebook-app-id'
        }
    });
}

// Demo OAuth handler (for testing without real OAuth)
async function handleDemoOAuth(req, res) {
    const { provider } = req.body;

    // Create demo user based on provider
    const demoUser = {
        google: {
            id: 'google-demo-123',
            email: 'google.user@gmail.com',
            full_name: 'Google Demo User',
            role: 'customer',
            avatar_url: 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg'
        },
        facebook: {
            id: 'facebook-demo-456',
            email: 'facebook.user@facebook.com',
            full_name: 'Facebook Demo User',
            role: 'customer',
            avatar_url: 'https://images.pexels.com/photos/3992659/pexels-photo-3992659.jpeg'
        }
    };

    const user = demoUser[provider];
    if (!user) {
        return res.status(400).json({ error: 'Invalid provider' });
    }

    const token = generateToken(user);

    res.json({
        success: true,
        message: `${provider} OAuth login successful (demo)`,
        user,
        token
    });
}

// Export functions
module.exports = {
    OAUTH_CONFIG,
    getAuthorizationUrl,
    generateStateToken,
    verifyStateToken,
    exchangeCodeForToken,
    getUserInfo,
    normalizeUserInfo,
    createUserFromOAuth,
    handleOAuthCallback,
    handleGoogleAuth,
    handleGoogleCallback,
    handleFacebookAuth,
    handleFacebookCallback,
    handleOAuthTokenLogin,
    getOAuthConfig,
    handleDemoOAuth
};