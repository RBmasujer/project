/**
 * Dear Self - Dashboard Controller
 * Handles chatroom connections, real-time updates, and in-memory caching
 */

const { EncryptionUtils } = require('./middleware');

// =====================================================
// IN-MEMORY CACHE SYSTEM
// =====================================================
class InMemoryCache {
    constructor(defaultTTL = 60000) {
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.hitCount = 0;
        this.missCount = 0;

        // Cleanup expired entries every minute
        setInterval(() => this.cleanup(), 60000);
    }

    set(key, value, ttl = this.defaultTTL) {
        this.cache.set(key, {
            value,
            expires: Date.now() + ttl,
            lastAccessed: Date.now()
        });
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.missCount++;
            return null;
        }

        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            this.missCount++;
            return null;
        }

        entry.lastAccessed = Date.now();
        this.hitCount++;
        return entry.value;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    has(key) {
        const entry = this.cache.get(key);
        if (!entry || Date.now() > entry.expires) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    clear() {
        this.cache.clear();
    }

    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now > entry.expires) {
                this.cache.delete(key);
            }
        }
    }

    getStats() {
        return {
            entries: this.cache.size,
            hits: this.hitCount,
            misses: this.missCount,
            hitRate: this.hitCount + this.missCount > 0
                ? (this.hitCount / (this.hitCount + this.missCount) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    // Cache invalidation patterns
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }
}

// Initialize cache with different TTLs for different data types
const cache = new InMemoryCache();
const userCache = new InMemoryCache(300000); // 5 minutes for user data
const appointmentCache = new InMemoryCache(60000); // 1 minute for appointments
const serviceCache = new InMemoryCache(600000); // 10 minutes for services
const chatCache = new InMemoryCache(30000); // 30 seconds for chat messages

// =====================================================
// WEBSOCKET/LIVE CONNECTION MANAGER
// =====================================================
class ConnectionManager {
    constructor() {
        this.connections = new Map(); // userId -> Set of connections
        this.rooms = new Map(); // roomId -> Set of userIds
        this.userRooms = new Map(); // userId -> Set of roomIds
        this.heartbeatInterval = 30000; // 30 seconds
        this.connectionTimeout = 60000; // 60 seconds
    }

    addConnection(userId, connection) {
        if (!this.connections.has(userId)) {
            this.connections.set(userId, new Set());
        }
        this.connections.get(userId).add({
            connection,
            lastHeartbeat: Date.now()
        });

        connection.on('close', () => this.removeConnection(userId, connection));
    }

    removeConnection(userId, connection) {
        const connections = this.connections.get(userId);
        if (connections) {
            for (const conn of connections) {
                if (conn.connection === connection) {
                    connections.delete(conn);
                    break;
                }
            }
            if (connections.size === 0) {
                this.connections.delete(userId);
                this.removeFromAllRooms(userId);
            }
        }
    }

    joinRoom(userId, roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(userId);

        if (!this.userRooms.has(userId)) {
            this.userRooms.set(userId, new Set());
        }
        this.userRooms.get(userId).add(roomId);
    }

    leaveRoom(userId, roomId) {
        const room = this.rooms.get(roomId);
        if (room) room.delete(userId);

        const userRooms = this.userRooms.get(userId);
        if (userRooms) userRooms.delete(roomId);
    }

    removeFromAllRooms(userId) {
        const userRooms = this.userRooms.get(userId);
        if (userRooms) {
            for (const roomId of userRooms) {
                const room = this.rooms.get(roomId);
                if (room) room.delete(userId);
            }
            this.userRooms.delete(userId);
        }
    }

    getRoomMembers(roomId) {
        return Array.from(this.rooms.get(roomId) || []);
    }

    getOnlineUsers(roomId) {
        const members = this.rooms.get(roomId);
        if (!members) return [];
        return Array.from(members).filter(userId =>
            this.connections.has(userId) && this.connections.get(userId).size > 0
        );
    }

    broadcastToRoom(roomId, message, excludeUserId = null) {
        const members = this.rooms.get(roomId);
        if (!members) return;

        for (const userId of members) {
            if (excludeUserId && userId === excludeUserId) continue;
            this.sendToUser(userId, message);
        }
    }

    sendToUser(userId, message) {
        const connections = this.connections.get(userId);
        if (!connections) return;

        const messageStr = JSON.stringify(message);
        const now = Date.now();

        for (const conn of connections) {
            if (now - conn.lastHeartbeat < this.connectionTimeout) {
                try {
                    conn.connection.send(messageStr);
                } catch (error) {
                    console.error('Send error:', error);
                }
            }
        }
    }

    updateHeartbeat(userId) {
        const connections = this.connections.get(userId);
        if (connections) {
            for (const conn of connections) {
                conn.lastHeartbeat = Date.now();
            }
        }
    }

    getStats() {
        return {
            totalConnections: Array.from(this.connections.values())
                .reduce((sum, set) => sum + set.size, 0),
            uniqueUsers: this.connections.size,
            activeRooms: this.rooms.size,
            roomDetails: Object.fromEntries(
                Array.from(this.rooms.entries()).map(([id, users]) => [id, users.size])
            )
        };
    }
}

const connectionManager = new ConnectionManager();

// =====================================================
// CHATROOM SYSTEM
// =====================================================
class ChatRoomSystem {
    constructor() {
        this.rooms = new Map([
            ['general', { name: 'General', type: 'public', members: new Set() }],
            ['staff', { name: 'Staff', type: 'private', allowedRoles: ['staff', 'receptionist', 'admin'], members: new Set() }],
            ['support', { name: 'Support', type: 'support', members: new Set() }]
        ]);
        this.messageHistory = new Map(); // roomId -> Array of messages
        this.maxHistorySize = 100;
        this.typingUsers = new Map(); // roomId -> Set of typing userIds
    }

    async addMessage(roomId, userId, message, userName, userAvatar) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        // Check permissions for private rooms
        if (room.type === 'private' && room.allowedRoles) {
            return { error: 'Access denied', code: 403 };
        }

        const messageObj = {
            id: EncryptionUtils.generateToken(16),
            roomId,
            senderId: userId,
            senderName: userName,
            senderAvatar: userAvatar,
            message: this.sanitizeMessage(message),
            timestamp: Date.now(),
            type: 'text'
        };

        // Add to history
        if (!this.messageHistory.has(roomId)) {
            this.messageHistory.set(roomId, []);
        }
        const history = this.messageHistory.get(roomId);
        history.push(messageObj);

        // Limit history size
        if (history.length > this.maxHistorySize) {
            history.shift();
        }

        // Update cache
        chatCache.set(`history:${roomId}`, history, 60000);

        return messageObj;
    }

    getMessages(roomId, limit = 50, before = null) {
        // Check cache first
        const cacheKey = `messages:${roomId}:${limit}:${before || 'latest'}`;
        const cached = chatCache.get(cacheKey);
        if (cached) return cached;

        let messages = this.messageHistory.get(roomId) || [];

        if (before) {
            const beforeIndex = messages.findIndex(m => m.id === before);
            if (beforeIndex > 0) {
                messages = messages.slice(0, beforeIndex);
            }
        }

        const result = messages.slice(-limit);
        chatCache.set(cacheKey, result, 30000);

        return result;
    }

    sanitizeMessage(message) {
        if (typeof message !== 'string') return '';
        return message
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .trim()
            .substring(0, 1000); // Max 1000 characters
    }

    setTyping(roomId, userId, userName, isTyping) {
        if (!this.typingUsers.has(roomId)) {
            this.typingUsers.set(roomId, new Map());
        }

        const typers = this.typingUsers.get(roomId);
        if (isTyping) {
            typers.set(userId, { userName, timestamp: Date.now() });
        } else {
            typers.delete(userId);
        }

        return Array.from(typers.entries()).map(([id, data]) => ({
            userId: id,
            userName: data.userName
        }));
    }

    joinRoom(roomId, userId, userName) {
        const room = this.rooms.get(roomId);
        if (!room) return { error: 'Room not found' };

        room.members.add(userId);

        // Add system message
        this.addSystemMessage(roomId, `${userName} joined the room`);

        return { success: true, room };
    }

    leaveRoom(roomId, userId, userName) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.members.delete(userId);

        // Add system message
        this.addSystemMessage(roomId, `${userName} left the room`);
    }

    addSystemMessage(roomId, text) {
        const messageObj = {
            id: EncryptionUtils.generateToken(16),
            roomId,
            senderId: 'system',
            senderName: 'System',
            message: text,
            timestamp: Date.now(),
            type: 'system'
        };

        if (!this.messageHistory.has(roomId)) {
            this.messageHistory.set(roomId, []);
        }
        this.messageHistory.get(roomId).push(messageObj);
    }

    getRoomInfo(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        return {
            id: roomId,
            name: room.name,
            type: room.type,
            memberCount: room.members.size,
            onlineCount: connectionManager.getOnlineUsers(roomId).length
        };
    }

    getUnreadCounts(userId) {
        // In production, this would track last read timestamps per user/room
        const counts = {};
        for (const [roomId, room] of this.rooms) {
            counts[roomId] = Math.floor(Math.random() * 5); // Demo: random unread counts
        }
        return counts;
    }
}

const chatRoomSystem = new ChatRoomSystem();

// =====================================================
// REAL-TIME DATA SYNC
// =====================================================
class RealTimeSync {
    constructor() {
        this.subscribers = new Map(); // eventType -> Set of callbacks
        this.pollInterval = null;
        this.visibilityHandler = null;
    }

    subscribe(eventType, callback) {
        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, new Set());
        }
        this.subscribers.get(eventType).add(callback);

        return () => {
            this.subscribers.get(eventType)?.delete(callback);
        };
    }

    emit(eventType, data) {
        const callbacks = this.subscribers.get(eventType);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Subscriber callback error:', error);
                }
            }
        }
    }

    // Start polling with visibility change detection
    startPolling(fetchFn, interval = 5000) {
        let isActive = true;

        const poll = async () => {
            if (!isActive) return;

            try {
                const data = await fetchFn();
                this.emit('data', data);
            } catch (error) {
                this.emit('error', error);
            }
        };

        // Initial poll
        poll();

        // Setup interval
        this.pollInterval = setInterval(poll, interval);

        // Handle visibility change
        this.visibilityHandler = () => {
            if (document.hidden) {
                isActive = false;
            } else {
                isActive = true;
                poll(); // Immediate refresh when tab becomes visible
            }
        };

        document.addEventListener('visibilitychange', this.visibilityHandler);

        return () => this.stopPolling();
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
    }
}

// =====================================================
// DASHBOARD DATA AGGREGATOR
// =====================================================
class DashboardAggregator {
    constructor() {
        this.cacheKey = 'dashboard:overview';
        this.ttl = 60000; // 1 minute cache
    }

    async getCustomerDashboard(userId) {
        const cacheKey = `dashboard:customer:${userId}`;
        const cached = userCache.get(cacheKey);
        if (cached) return cached;

        // In production, fetch from database
        const data = {
            stats: {
                totalAppointments: 5,
                upcomingAppointments: 2,
                totalReviews: 3,
                totalSpent: 285
            },
            upcomingAppointments: await this.getUpcomingAppointments(userId),
            recentActivity: [],
            notifications: []
        };

        userCache.set(cacheKey, data, 60000);
        return data;
    }

    async getStaffDashboard(userId) {
        const cacheKey = `dashboard:staff:${userId}`;
        const cached = userCache.get(cacheKey);
        if (cached) return cached;

        const data = {
            stats: {
                todayAppointments: 4,
                weekAppointments: 18,
                monthEarnings: 1250,
                avgRating: 4.8
            },
            todaySchedule: [],
            weekSchedule: [],
            earnings: []
        };

        userCache.set(cacheKey, data, 60000);
        return data;
    }

    async getReceptionistDashboard() {
        const cacheKey = 'dashboard:receptionist';
        const cached = appointmentCache.get(cacheKey);
        if (cached) return cached;

        const data = {
            stats: {
                todayAppointments: 12,
                todayWalkins: 3,
                pendingCheckins: 2,
                activeStaff: 6
            },
            timeline: [],
            waitingList: [],
            staffStatus: []
        };

        appointmentCache.set(cacheKey, data, 30000);
        return data;
    }

    async getAdminDashboard() {
        const cacheKey = 'dashboard:admin';
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const data = {
            stats: {
                totalAppointments: 156,
                totalRevenue: 8450,
                totalCustomers: 89,
                avgRating: 4.7
            },
            recentBookings: [],
            recentReviews: [],
            topStaff: [],
            serviceBreakdown: []
        };

        cache.set(cacheKey, data, 60000);
        return data;
    }

    async getUpcomingAppointments(userId) {
        const cacheKey = `appointments:upcoming:${userId}`;
        const cached = appointmentCache.get(cacheKey);
        if (cached) return cached;

        // In production, query database
        const appointments = [
            { id: '1', service: 'Haircut', date: '2024-01-15', time: '10:00', staff: 'Emma Johnson', status: 'confirmed' },
            { id: '2', service: 'Manicure', date: '2024-01-18', time: '14:30', staff: 'Sophie Williams', status: 'pending' }
        ];

        appointmentCache.set(cacheKey, appointments, 60000);
        return appointments;
    }

    async getServices() {
        const cached = serviceCache.get('services:all');
        if (cached) return cached;

        const services = [
            { id: '1', name: 'Haircut', category: 'hair', duration_minutes: 30, price: 35.00 },
            { id: '2', name: 'Manicure', category: 'nails', duration_minutes: 45, price: 25.00 },
            { id: '3', name: 'Full Body Massage', category: 'massage', duration_minutes: 90, price: 95.00 }
        ];

        serviceCache.set('services:all', services, 300000);
        return services;
    }

    async getStaffList() {
        const cached = userCache.get('staff:all');
        if (cached) return cached;

        const staff = [
            { id: 's1', name: 'Emma Johnson', role: 'stylist', rating: 4.9 },
            { id: 's2', name: 'Sophie Williams', role: 'nail artist', rating: 4.8 }
        ];

        userCache.set('staff:all', staff, 300000);
        return staff;
    }

    // Invalidate relevant caches when data changes
    invalidateAppointment(userId) {
        appointmentCache.delete(`appointments:upcoming:${userId}`);
        appointmentCache.invalidatePattern('dashboard:');
    }

    invalidateUser(userId) {
        userCache.delete(`dashboard:customer:${userId}`);
        userCache.delete(`dashboard:staff:${userId}`);
    }
}

const dashboardAggregator = new DashboardAggregator();

// =====================================================
// API REQUEST HANDLERS
// =====================================================

// Chat handlers
async function handleGetMessages(req, res) {
    const { roomId } = req.params;
    const { limit, before } = req.query;

    try {
        const messages = chatRoomSystem.getMessages(roomId, parseInt(limit) || 50, before);
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messages' });
    }
}

async function handleSendMessage(req, res) {
    const { roomId } = req.params;
    const { message } = req.body;
    const userId = req.user?.id || 'anonymous';
    const userName = req.user?.full_name || 'Guest';
    const userAvatar = req.user?.avatar_url;

    if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }

    try {
        const result = await chatRoomSystem.addMessage(roomId, userId, message, userName, userAvatar);

        if (result.error) {
            return res.status(result.code || 400).json({ error: result.error });
        }

        // Broadcast to other users in room
        connectionManager.broadcastToRoom(roomId, {
            type: 'new_message',
            data: result
        }, userId);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
}

function handleTypingIndicator(req, res) {
    const { roomId } = req.params;
    const { isTyping } = req.body;
    const userId = req.user?.id || 'anonymous';
    const userName = req.user?.full_name || 'Guest';

    const typers = chatRoomSystem.setTyping(roomId, userId, userName, isTyping);

    // Broadcast typing status
    connectionManager.broadcastToRoom(roomId, {
        type: 'typing',
        data: { typers }
    }, userId);

    res.json({ success: true });
}

// Dashboard handlers
async function handleGetCustomerDashboard(req, res) {
    try {
        const data = await dashboardAggregator.getCustomerDashboard(req.user?.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
}

async function handleGetStaffDashboard(req, res) {
    try {
        const data = await dashboardAggregator.getStaffDashboard(req.user?.id);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
}

async function handleGetReceptionistDashboard(req, res) {
    try {
        const data = await dashboardAggregator.getReceptionistDashboard();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
}

async function handleGetAdminDashboard(req, res) {
    try {
        const data = await dashboardAggregator.getAdminDashboard();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
}

async function handleGetServices(req, res) {
    try {
        const services = await dashboardAggregator.getServices();
        res.json({ services });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get services' });
    }
}

async function handleGetStaff(req, res) {
    try {
        const staff = await dashboardAggregator.getStaffList();
        res.json({ staff });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get staff list' });
    }
}

// Cache stats endpoint
function handleGetCacheStats(req, res) {
    res.json({
        mainCache: cache.getStats(),
        userCache: userCache.getStats(),
        appointmentCache: appointmentCache.getStats(),
        serviceCache: serviceCache.getStats(),
        chatCache: chatCache.getStats(),
        connections: connectionManager.getStats()
    });
}

// WebSocket upgrade handler for real-time connections
function handleWebSocketUpgrade(req, socket, head) {
    // This would integrate with the ws library in the main server
    // For now, this is a placeholder
    console.log('WebSocket upgrade request received');
}

// Visibility change refresh handler
function handleVisibilityRefresh(req, res) {
    const userId = req.user?.id;
    if (userId) {
        dashboardAggregator.invalidateUser(userId);
    }
    res.json({ refreshed: true });
}

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    // Cache systems
    InMemoryCache,
    cache,
    userCache,
    appointmentCache,
    serviceCache,
    chatCache,

    // Connection management
    ConnectionManager,
    connectionManager,

    // Chat system
    ChatRoomSystem,
    chatRoomSystem,

    // Real-time sync
    RealTimeSync,

    // Dashboard
    DashboardAggregator,
    dashboardAggregator,

    // API Handlers
    handleGetMessages,
    handleSendMessage,
    handleTypingIndicator,
    handleGetCustomerDashboard,
    handleGetStaffDashboard,
    handleGetReceptionistDashboard,
    handleGetAdminDashboard,
    handleGetServices,
    handleGetStaff,
    handleGetCacheStats,
    handleWebSocketUpgrade,
    handleVisibilityRefresh
};