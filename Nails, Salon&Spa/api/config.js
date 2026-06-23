/**
 * Dear Self - Server Configuration
 */

module.exports = {
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0',
        https: {
            enabled: process.env.HTTPS_ENABLED === 'true',
            key: process.env.HTTPS_KEY_PATH || './ssl/server.key',
            cert: process.env.HTTPS_CERT_PATH || './ssl/server.crt'
        },
        cors: {
            origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
            credentials: true
        }
    },

    supabase: {
        url: process.env.SUPABASE_URL || 'https://bygpoxyhxaixzshmecan.supabase.co',
        anonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Z3BveHloeGFpeHpzaG1lY2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDk4NTEsImV4cCI6MjA5NzQ4NTg1MX0.CQiNqreQbiSCv2QAOiY87SM7TN7vPJMuSc54CJV1k9M',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    },

    redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        defaultTTL: {
            services: 600,
            staff: 300,
            appointments: 60,
            dashboard: 30
        }
    },

    paymongo: {
        enabled: process.env.PAYMONGO_ENABLED === 'true',
        publicKey: process.env.PAYMONGO_PUBLIC_KEY || null,
        secretKey: process.env.PAYMONGO_SECRET_KEY || null,
        webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || null,
        apiBase: 'https://api.paymongo.com/v1'
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
        expiresIn: '7d'
    },

    security: {
        encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key!!',
        rateLimits: {
            login: { window: 15 * 60 * 1000, max: 5 },
            register: { window: 60 * 60 * 1000, max: 3 },
            api: { window: 60 * 1000, max: 100 }
        }
    }
};