/**
 * Dear Self - Redis Cache Manager
 */

const config = require('./config');

let redisClient = null;
let redisConnected = false;
const memoryCache = new Map();
const stats = { hits: 0, misses: 0 };

async function initRedis() {
    if (!config.redis.enabled) {
        console.log('Redis disabled, using in-memory cache');
        return false;
    }

    try {
        const { createClient } = require('redis');
        redisClient = createClient({ url: config.redis.url });

        redisClient.on('connect', () => { redisConnected = true; console.log('Redis connected'); });
        redisClient.on('disconnect', () => { redisConnected = false; console.log('Redis disconnected'); });
        redisClient.on('error', (err) => { console.error('Redis error:', err); redisConnected = false; });

        await redisClient.connect();
        return true;
    } catch (error) {
        console.error('Redis init error:', error.message);
        return false;
    }
}

async function get(key) {
    if (redisConnected && redisClient) {
        try {
            const value = await redisClient.get(key);
            if (value !== null) {
                stats.hits++;
                return JSON.parse(value);
            }
        } catch (e) { console.error('Redis get error:', e.message); }
    }

    const entry = memoryCache.get(key);
    if (entry && entry.expires > Date.now()) {
        stats.hits++;
        return entry.value;
    }

    if (entry) memoryCache.delete(key);
    stats.misses++;
    return null;
}

async function set(key, value, ttl = 60000) {
    if (redisConnected && redisClient) {
        try {
            await redisClient.setEx(key, Math.ceil(ttl / 1000), JSON.stringify(value));
            return;
        } catch (e) { console.error('Redis set error:', e.message); }
    }

    memoryCache.set(key, { value, expires: Date.now() + ttl });
}

async function del(key) {
    if (redisConnected && redisClient) {
        try { await redisClient.del(key); } catch (e) {}
    }
    memoryCache.delete(key);
}

async function delPattern(pattern) {
    if (redisConnected && redisClient) {
        try {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) await redisClient.del(keys);
        } catch (e) {}
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of memoryCache.keys()) {
        if (regex.test(key)) memoryCache.delete(key);
    }
}

async function getOrSet(key, fetchFn, ttl = 60000) {
    const cached = await get(key);
    if (cached !== null) return cached;

    const value = await fetchFn();
    if (value !== null && value !== undefined) await set(key, value, ttl);
    return value;
}

function getStats() {
    return {
        ...stats,
        hitRate: stats.hits + stats.misses > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%' : '0%',
        backend: redisConnected ? 'redis' : 'memory',
        memoryCacheSize: memoryCache.size
    };
}

async function close() {
    if (redisClient) {
        try { await redisClient.quit(); } catch (e) {}
    }
    redisConnected = false;
}

module.exports = { initRedis, get, set, del, delPattern, getOrSet, getStats, close };