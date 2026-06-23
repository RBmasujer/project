/**
 * Dear Self - Supabase Server Client
 * Provides Supabase client for server-side operations
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL || 'https://bygpoxyhxaixzshmecan.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Z3BveHloeGFpeHpzaG1lY2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDk4NTEsImV4cCI6MjA5NzQ4NTg1MX0.CQiNqreQbiSCv2QAOiY87SM7TN7vPJMuSc54CJV1k9M';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

// Regular client (respect RLS policies)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (bypasses RLS - use carefully)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

/**
 * Get user by ID
 */
async function getUserById(userId) {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Get user error:', error);
        return null;
    }
    return data;
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (error) {
        console.error('Get user by email error:', error);
        return null;
    }
    return data;
}

/**
 * Create user profile
 */
async function createUserProfile(userId, profileData) {
    const { data, error } = await supabaseAdmin
        .from('users')
        .insert([{
            id: userId,
            ...profileData,
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        console.error('Create user profile error:', error);
        return null;
    }
    return data;
}

/**
 * Update user profile
 */
async function updateUserProfile(userId, updates) {
    const { data, error } = await supabaseAdmin
        .from('users')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

    if (error) {
        console.error('Update user profile error:', error);
        return null;
    }
    return data;
}

/**
 * Get all services
 */
async function getServices(filters = {}) {
    let query = supabaseAdmin
        .from('services')
        .select('*')
        .eq('is_active', true);

    if (filters.category) {
        query = query.eq('category', filters.category);
    }

    const { data, error } = await query.order('name');

    if (error) {
        console.error('Get services error:', error);
        return [];
    }
    return data;
}

/**
 * Get service by ID
 */
async function getServiceById(serviceId) {
    const { data, error } = await supabaseAdmin
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single();

    if (error) {
        console.error('Get service error:', error);
        return null;
    }
    return data;
}

/**
 * Create appointment
 */
async function createAppointment(appointmentData) {
    const { data, error } = await supabaseAdmin
        .from('appointments')
        .insert([{
            ...appointmentData,
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        console.error('Create appointment error:', error);
        return null;
    }
    return data;
}

/**
 * Get appointments
 */
async function getAppointments(filters = {}) {
    let query = supabaseAdmin
        .from('appointments')
        .select(`
            *,
            services(id, name, price, duration_minutes),
            staff:users!appointments_staff_id_fkey(id, full_name, avatar_url),
            customer:users!appointments_customer_id_fkey(id, full_name, email, phone)
        `);

    if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId);
    }
    if (filters.staffId) {
        query = query.eq('staff_id', filters.staffId);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }
    if (filters.date) {
        query = query.eq('appointment_date', filters.date);
    }

    const { data, error } = await query.order('appointment_date', { ascending: true });

    if (error) {
        console.error('Get appointments error:', error);
        return [];
    }
    return data;
}

/**
 * Update appointment
 */
async function updateAppointment(appointmentId, updates) {
    const { data, error } = await supabaseAdmin
        .from('appointments')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .select()
        .single();

    if (error) {
        console.error('Update appointment error:', error);
        return null;
    }
    return data;
}

/**
 * Get staff members
 */
async function getStaff() {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('role', 'staff');

    if (error) {
        console.error('Get staff error:', error);
        return [];
    }
    return data;
}

/**
 * Create feedback
 */
async function createFeedback(feedbackData) {
    const { data, error } = await supabaseAdmin
        .from('feedback')
        .insert([{
            ...feedbackData,
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        console.error('Create feedback error:', error);
        return null;
    }
    return data;
}

/**
 * Get feedback
 */
async function getFeedback(limit = 10) {
    const { data, error } = await supabaseAdmin
        .from('feedback')
        .select(`
            *,
            customer:users!feedback_customer_id_fkey(full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Get feedback error:', error);
        return [];
    }
    return data;
}

/**
 * Get chat messages
 */
async function getChatMessages(roomType = 'general', limit = 100) {
    const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .select(`
            *,
            sender:users!chat_messages_sender_id_fkey(id, full_name, avatar_url)
        `)
        .eq('room_type', roomType)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Get chat messages error:', error);
        return [];
    }
    return data;
}

/**
 * Send chat message
 */
async function sendChatMessage(senderId, message, roomType = 'general') {
    const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .insert([{
            sender_id: senderId,
            room_type: roomType,
            message,
            created_at: new Date().toISOString()
        }])
        .select()
        .single();

    if (error) {
        console.error('Send chat message error:', error);
        return null;
    }
    return data;
}

/**
 * Get dashboard stats
 */
async function getDashboardStats() {
    try {
        const [appointments, users, feedback] = await Promise.all([
            supabaseAdmin.from('appointments').select('id, status'),
            supabaseAdmin.from('users').select('id, role'),
            supabaseAdmin.from('feedback').select('rating')
        ]);

        const totalAppointments = appointments.data?.length || 0;
        const customers = users.data?.filter(u => u.role === 'customer').length || 0;
        const avgRating = feedback.data?.length ?
            (feedback.data.reduce((sum, f) => sum + (f.rating || 0), 0) / feedback.data.length).toFixed(1) : 0;

        return {
            totalAppointments,
            totalCustomers: customers,
            avgRating
        };
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        return { totalAppointments: 0, totalCustomers: 0, avgRating: 0 };
    }
}

module.exports = {
    supabase,
    supabaseAdmin,
    getUserById,
    getUserByEmail,
    createUserProfile,
    updateUserProfile,
    getServices,
    getServiceById,
    createAppointment,
    getAppointments,
    updateAppointment,
    getStaff,
    createFeedback,
    getFeedback,
    getChatMessages,
    sendChatMessage,
    getDashboardStats
};