/**
 * Dear Self - Database Operations (Supabase)
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const cache = require('./redis');

const supabase = createClient(config.supabase.url, config.supabase.anonKey);
const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Users
async function getUserById(userId) {
    return cache.getOrSet(`user:${userId}`, async () => {
        const { data, error } = await supabaseAdmin.from('users').select('*').eq('id', userId).single();
        return error ? null : data;
    }, 300000);
}

async function getUserByEmail(email) {
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('email', email).single();
    return error ? null : data;
}

async function createUserProfile(userId, profileData) {
    const { data, error } = await supabaseAdmin.from('users').insert([{
        id: userId,
        ...profileData,
        created_at: new Date().toISOString()
    }]).select().single();

    if (data) await cache.set(`user:${userId}`, data, 300000);
    return error ? null : data;
}

async function updateUserProfile(userId, updates) {
    const { data, error } = await supabaseAdmin.from('users').update({
        ...updates,
        updated_at: new Date().toISOString()
    }).eq('id', userId).select().single();

    if (data) await cache.del(`user:${userId}`);
    return error ? null : data;
}

// Services
async function getServices(filters = {}) {
    const cacheKey = `services:${filters.category || 'all'}`;
    return cache.getOrSet(cacheKey, async () => {
        let query = supabaseAdmin.from('services').select('*').eq('is_active', true);
        if (filters.category) query = query.eq('category', filters.category);
        const { data, error } = await query.order('name');
        return error ? [] : data;
    }, config.redis.defaultTTL.services * 1000);
}

async function createService(serviceData) {
    const { data, error } = await supabaseAdmin.from('services').insert([serviceData]).select().single();
    if (data) await cache.delPattern('services:*');
    return error ? null : data;
}

// Appointments
async function getAppointments(filters = {}) {
    let query = supabaseAdmin.from('appointments').select(`
        *,
        services(id, name, price, duration_minutes),
        staff:users!appointments_staff_id_fkey(id, full_name, avatar_url),
        customer:users!appointments_customer_id_fkey(id, full_name, email, phone)
    `);

    if (filters.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters.staffId) query = query.eq('staff_id', filters.staffId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.date) query = query.eq('appointment_date', filters.date);
    if (filters.upcoming) query = query.gte('appointment_date', new Date().toISOString().split('T')[0]);

    const { data, error } = await query.order('appointment_date', { ascending: true });
    return error ? [] : data;
}

async function createAppointment(appointmentData) {
    const { data, error } = await supabaseAdmin.from('appointments').insert([{
        ...appointmentData,
        created_at: new Date().toISOString()
    }]).select().single();

    if (data) await cache.delPattern('appointments:*');
    return error ? null : data;
}

async function updateAppointment(appointmentId, updates) {
    const { data, error } = await supabaseAdmin.from('appointments').update({
        ...updates,
        updated_at: new Date().toISOString()
    }).eq('id', appointmentId).select().single();

    if (data) await cache.delPattern('appointments:*');
    return error ? null : data;
}

// Staff
async function getStaff() {
    return cache.getOrSet('staff:all', async () => {
        const { data, error } = await supabaseAdmin.from('users').select('*').eq('role', 'staff');
        return error ? [] : data;
    }, config.redis.defaultTTL.staff * 1000);
}

// Feedback
async function getFeedback(limit = 10) {
    const { data, error } = await supabaseAdmin.from('feedback').select(`
        *,
        customer:users!feedback_customer_id_fkey(full_name, avatar_url)
    `).order('created_at', { ascending: false }).limit(limit);
    return error ? [] : data;
}

async function createFeedback(feedbackData) {
    const { data, error } = await supabaseAdmin.from('feedback').insert([{
        ...feedbackData,
        created_at: new Date().toISOString()
    }]).select().single();
    return error ? null : data;
}

// Chat
async function getChatMessages(roomType = 'general', limit = 100) {
    const { data, error } = await supabaseAdmin.from('chat_messages').select(`
        *,
        sender:users!chat_messages_sender_id_fkey(id, full_name, avatar_url)
    `).eq('room_type', roomType).order('created_at', { ascending: true }).limit(limit);
    return error ? [] : data;
}

async function sendChatMessage(senderId, message, roomType = 'general') {
    const { data, error } = await supabaseAdmin.from('chat_messages').insert([{
        sender_id: senderId,
        room_type: roomType,
        message,
        created_at: new Date().toISOString()
    }]).select().single();
    return error ? null : data;
}

// Payments
async function createPayment(paymentData) {
    const { data, error } = await supabaseAdmin.from('payments').insert([{
        ...paymentData,
        created_at: new Date().toISOString()
    }]).select().single();
    return error ? null : data;
}

async function updatePaymentStatus(paymentId, status, metadata = {}) {
    const { data, error } = await supabaseAdmin.from('payments').update({
        status,
        ...metadata,
        updated_at: new Date().toISOString()
    }).eq('id', paymentId).select().single();
    return error ? null : data;
}

// Dashboard
async function getDashboardStats() {
    return cache.getOrSet('dashboard:stats', async () => {
        try {
            const [appointments, users, feedback] = await Promise.all([
                supabaseAdmin.from('appointments').select('id, status'),
                supabaseAdmin.from('users').select('id, role'),
                supabaseAdmin.from('feedback').select('rating')
            ]);

            const total = appointments.data?.length || 0;
            const customers = users.data?.filter(u => u.role === 'customer').length || 0;
            const avgRating = feedback.data?.length ?
                (feedback.data.reduce((sum, f) => sum + (f.rating || 0), 0) / feedback.data.length).toFixed(1) : 0;

            return { totalAppointments: total, customers, avgRating };
        } catch (e) {
            return { totalAppointments: 0, customers: 0, avgRating: 0 };
        }
    }, config.redis.defaultTTL.dashboard * 1000);
}

module.exports = {
    supabase, supabaseAdmin,
    getUserById, getUserByEmail, createUserProfile, updateUserProfile,
    getServices, createService,
    getAppointments, createAppointment, updateAppointment,
    getStaff,
    getFeedback, createFeedback,
    getChatMessages, sendChatMessage,
    createPayment, updatePaymentStatus,
    getDashboardStats
};