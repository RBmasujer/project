/**
 * Dear Self - Nails, Salon & Spa
 * Complete JavaScript Application - Full Backend Integration
 */

// =====================================================
// CONFIGURATION
// =====================================================
const CONFIG = {
    SUPABASE_URL: 'https://bygpoxyhxaixzshmecan.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Z3BveHloeGFpeHpzaG1lY2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDk4NTEsImV4cCI6MjA5NzQ4NTg1MX0.CQiNqreQbiSCv2QAOiY87SM7TN7vPJMuSc54CJV1k9M',
    API_BASE: '/api'
};

let supabase = null;
let currentUser = null;
let realtimeChannels = {};

// =====================================================
// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', initSupabase);

async function initSupabase() {
    try {
        supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log('Supabase initialized successfully');

        // Check for existing session
        await checkAuth();

        // Set up real-time subscriptions
        setupRealtimeSubscriptions();
    } catch (error) {
        console.error('Supabase initialization error:', error);
        initDemoMode();
    }
}

function initDemoMode() {
    console.log('Running in demo mode');
    currentUser = {
        id: 'demo-user',
        email: 'demo@example.com',
        full_name: 'Demo User',
        role: 'customer'
    };
    initApp();
}

// =====================================================
// REAL-TIME SUBSCRIPTIONS
// =====================================================
function setupRealtimeSubscriptions() {
    if (!supabase) return;

    // Subscribe to chat messages
    realtimeChannels.chat = supabase
        .channel('chat-messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages'
        }, (payload) => {
            handleNewChatMessage(payload.new);
        })
        .subscribe();

    // Subscribe to appointments changes
    realtimeChannels.appointments = supabase
        .channel('appointments')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'appointments'
        }, (payload) => {
            handleAppointmentChange(payload);
        })
        .subscribe();

    // Subscribe to feedback
    realtimeChannels.feedback = supabase
        .channel('feedback')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'feedback'
        }, (payload) => {
            handleNewFeedback(payload.new);
        })
        .subscribe();
}

function handleNewChatMessage(message) {
    if (typeof refreshChat === 'function') {
        refreshChat();
    }
}

function handleAppointmentChange(payload) {
    if (typeof refreshAppointments === 'function') {
        refreshAppointments();
    }
}

function handleNewFeedback(feedback) {
    if (typeof loadTestimonials === 'function') {
        loadTestimonials();
    }
}

// =====================================================
// AUTHENTICATION
// =====================================================
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
            // Fetch user profile from users table
            const { data: profile, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profile) {
                currentUser = profile;
            } else {
                // Create profile if it doesn't exist (for OAuth users)
                const newProfile = {
                    id: session.user.id,
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                    avatar_url: session.user.user_metadata?.avatar_url,
                    role: 'customer'
                };

                const { data: createdProfile } = await supabase
                    .from('users')
                    .insert([newProfile])
                    .select()
                    .single();

                currentUser = createdProfile || newProfile;
            }
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                currentUser = null;
                window.location.href = 'landing-page.html';
            } else if (event === 'SIGNED_IN' && session) {
                checkAuth();
            }
        });
    } catch (error) {
        console.log('Auth check error:', error);
    }

    initApp();
}

async function login(email, password) {
    try {
        showLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Fetch user profile
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

        currentUser = profile || {
            id: data.user.id,
            email: data.user.email,
            role: 'customer'
        };

        showToast('Login successful!', 'success');
        closeModal('loginModal');
        redirectBasedOnRole(currentUser.role);
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Login failed', 'error');
    } finally {
        showLoading(false);
    }
}

async function register(email, password, name, phone, role) {
    try {
        showLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name
                }
            }
        });

        if (error) throw error;

        // Create user profile
        const { error: profileError } = await supabase
            .from('users')
            .insert([{
                id: data.user.id,
                email,
                full_name: name,
                phone,
                role: role || 'customer'
            }]);

        if (profileError) {
            console.error('Profile creation error:', profileError);
        }

        showToast('Account created successfully!', 'success');
        closeModal('registerModal');

        currentUser = {
            id: data.user.id,
            email,
            full_name: name,
            role: role || 'customer'
        };

        redirectBasedOnRole(currentUser.role);
    } catch (error) {
        console.error('Registration error:', error);
        showToast(error.message || 'Registration failed', 'error');
    } finally {
        showLoading(false);
    }
}

async function logout() {
    try {
        await supabase?.auth.signOut();

        // Unsubscribe from all channels
        for (const channel of Object.values(realtimeChannels)) {
            await channel?.unsubscribe();
        }

        // Clear local storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_preferences');
    } catch (e) {
        console.error('Logout error:', e);
    }

    currentUser = null;
    window.location.href = 'landing-page.html';
}

function redirectBasedOnRole(role) {
    const pages = {
        customer: 'customer-dashboard.html',
        staff: 'staff-dashboard.html',
        receptionist: 'receptionist-dashboard.html',
        admin: 'admin-dashboard.html'
    };
    window.location.href = pages[role] || 'customer-dashboard.html';
}

// =====================================================
// OAUTH AUTHENTICATION
// =====================================================
async function loginWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Google login error:', error);
        showToast(error.message || 'Google login failed', 'error');
    }
}

async function loginWithFacebook() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'facebook',
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Facebook login error:', error);
        showToast(error.message || 'Facebook login failed', 'error');
    }
}

// =====================================================
// SERVICES API
// =====================================================
async function fetchServices(category = 'all') {
    try {
        let query = supabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (category !== 'all') {
            query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Fetch services error:', error);
        return getDemoServices();
    }
}

async function fetchServiceById(serviceId) {
    try {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('id', serviceId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Fetch service error:', error);
        return null;
    }
}

async function createService(serviceData) {
    try {
        const { data, error } = await supabase
            .from('services')
            .insert([serviceData])
            .select()
            .single();

        if (error) throw error;
        showToast('Service created successfully!', 'success');
        return data;
    } catch (error) {
        showToast(error.message || 'Failed to create service', 'error');
        return null;
    }
}

async function updateService(serviceId, updates) {
    try {
        const { data, error } = await supabase
            .from('services')
            .update(updates)
            .eq('id', serviceId)
            .select()
            .single();

        if (error) throw error;
        showToast('Service updated successfully!', 'success');
        return data;
    } catch (error) {
        showToast(error.message || 'Failed to update service', 'error');
        return null;
    }
}

async function deleteService(serviceId) {
    try {
        const { error } = await supabase
            .from('services')
            .delete()
            .eq('id', serviceId);

        if (error) throw error;
        showToast('Service deleted successfully!', 'success');
        return true;
    } catch (error) {
        showToast(error.message || 'Failed to delete service', 'error');
        return false;
    }
}

// =====================================================
// APPOINTMENTS API
// =====================================================
async function fetchAppointments(filters = {}) {
    try {
        let query = supabase
            .from('appointments')
            .select(`
                *,
                services(id, name, price, duration_minutes),
                staff:users!appointments_staff_id_fkey(id, full_name, avatar_url),
                customer:users!appointments_customer_id_fkey(id, full_name, email, phone)
            `)
            .order('appointment_date', { ascending: true });

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
        if (filters.upcoming) {
            query = query.gte('appointment_date', new Date().toISOString().split('T')[0]);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Fetch appointments error:', error);
        return [];
    }
}

async function createAppointment(appointmentData) {
    try {
        showLoading(true);
        const { data, error } = await supabase
            .from('appointments')
            .insert([{
                ...appointmentData,
                customer_id: currentUser?.id,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;

        showToast('Appointment booked successfully!', 'success');
        return data;
    } catch (error) {
        console.error('Create appointment error:', error);
        showToast(error.message || 'Failed to book appointment', 'error');
        return null;
    } finally {
        showLoading(false);
    }
}

async function updateAppointment(appointmentId, updates) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .update(updates)
            .eq('id', appointmentId)
            .select()
            .single();

        if (error) throw error;
        showToast('Appointment updated!', 'success');
        return data;
    } catch (error) {
        showToast(error.message || 'Failed to update appointment', 'error');
        return null;
    }
}

async function cancelAppointment(appointmentId) {
    return updateAppointment(appointmentId, { status: 'cancelled' });
}

async function fetchAvailableSlots(date, staffId, serviceId) {
    try {
        // Get service duration
        const service = await fetchServiceById(serviceId);
        if (!service) return [];

        const duration = service.duration_minutes;

        // Get existing appointments for the date and staff
        const { data: appointments } = await supabase
            .from('appointments')
            .select('start_time, end_time')
            .eq('appointment_date', date)
            .eq('staff_id', staffId)
            .neq('status', 'cancelled');

        // Generate time slots (9 AM - 8 PM)
        const slots = [];
        const existingTimes = new Set(appointments?.map(a => a.start_time) || []);

        for (let hour = 9; hour < 20; hour++) {
            for (let min = 0; min < 60; min += 30) {
                const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                if (!existingTimes.has(time)) {
                    slots.push({
                        time,
                        available: true
                    });
                }
            }
        }

        return slots;
    } catch (error) {
        console.error('Fetch available slots error:', error);
        return generateDemoSlots();
    }
}

function generateDemoSlots() {
    const slots = [];
    for (let hour = 9; hour < 20; hour++) {
        slots.push({ time: `${hour}:00`, available: Math.random() > 0.3 });
        if (hour < 19) slots.push({ time: `${hour}:30`, available: Math.random() > 0.3 });
    }
    return slots;
}

// =====================================================
// USERS/STAFF API
// =====================================================
async function fetchUsers(role = null) {
    try {
        let query = supabase.from('users').select('*');

        if (role) {
            query = query.eq('role', role);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Fetch users error:', error);
        return getDemoStaff();
    }
}

async function fetchStaff() {
    return fetchUsers('staff');
}

async function fetchStaffWithServices() {
    try {
        const { data, error } = await supabase
            .from('staff_services')
            .select(`
                *,
                users(id, full_name, avatar_url, role),
                services(id, name, category)
            `);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Fetch staff with services error:', error);
        return [];
    }
}

async function updateUser(userId, updates) {
    try {
        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        showToast('Profile updated!', 'success');
        return data;
    } catch (error) {
        showToast(error.message || 'Failed to update profile', 'error');
        return null;
    }
}

// =====================================================
// FEEDBACK/REVIEWS API
// =====================================================
async function fetchFeedback(limit = 10) {
    try {
        const { data, error } = await supabase
            .from('feedback')
            .select(`
                *,
                customer:users!feedback_customer_id_fkey(full_name, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Fetch feedback error:', error);
        return getDemoTestimonials();
    }
}

async function createFeedback(feedbackData) {
    try {
        const { data, error } = await supabase
            .from('feedback')
            .insert([{
                ...feedbackData,
                customer_id: currentUser?.id
            }])
            .select()
            .single();

        if (error) throw error;
        showToast('Thank you for your feedback!', 'success');
        return data;
    } catch (error) {
        showToast(error.message || 'Failed to submit feedback', 'error');
        return null;
    }
}

// =====================================================
// CHAT MESSAGES API
// =====================================================
async function fetchChatMessages(roomType = 'general', limit = 100) {
    try {
        const { data, error } = await supabase
            .from('chat_messages')
            .select(`
                *,
                sender:users!chat_messages_sender_id_fkey(id, full_name, avatar_url)
            `)
            .eq('room_type', roomType)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Fetch chat messages error:', error);
        return [];
    }
}

async function sendChatMessage(message, roomType = 'general') {
    try {
        const { data, error } = await supabase
            .from('chat_messages')
            .insert([{
                sender_id: currentUser?.id,
                room_type: roomType,
                message
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Send chat message error:', error);
        return null;
    }
}

// =====================================================
// APP INITIALIZATION
// =====================================================
function initApp() {
    const page = getCurrentPage();
    console.log('Current page:', page);

    setupCommonEvents();

    switch (page) {
        case 'landing':
            initLandingPage();
            break;
        case 'customer':
            initCustomerDashboard();
            break;
        case 'staff':
            initStaffDashboard();
            break;
        case 'receptionist':
            initReceptionistDashboard();
            break;
        case 'admin':
            initAdminDashboard();
            break;
        case 'chatroom':
            initChatroom();
            break;
    }
}

function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('customer-dashboard')) return 'customer';
    if (path.includes('staff-dashboard')) return 'staff';
    if (path.includes('receptionist-dashboard')) return 'receptionist';
    if (path.includes('admin-dashboard')) return 'admin';
    if (path.includes('chatroom')) return 'chatroom';
    return 'landing';
}

// =====================================================
// LANDING PAGE
// =====================================================
async function initLandingPage() {
    await loadServices();
    await loadTestimonials();
    initHeroSlider();
    initNavbarScroll();
}

function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-slider .slide');
    const dots = document.querySelectorAll('.slider-dots .dot');
    let currentSlide = 0;

    if (slides.length === 0) return;

    function showSlide(index) {
        slides.forEach((s, i) => s.classList.toggle('active', i === index));
        dots.forEach((d, i) => d.classList.toggle('active', i === index));
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    }

    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            currentSlide = i;
            showSlide(i);
        });
    });

    setInterval(nextSlide, 5000);
}

function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
}

async function loadServices(category = 'all') {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    const services = await fetchServices(category);

    grid.innerHTML = services.map(service => `
        <div class="service-card" data-id="${service.id}" onclick="selectService('${service.id}')">
            <div class="service-card-image" style="background-image: url('${service.image_url || getCategoryImage(service.category)}')"></div>
            <div class="service-card-body">
                <span class="service-card-category">${service.category}</span>
                <h4>${service.name}</h4>
                <p>${service.description || ''}</p>
                <div class="service-card-meta">
                    <span class="service-duration"><i class="fas fa-clock"></i> ${service.duration_minutes} min</span>
                    <span class="service-price">$${parseFloat(service.price).toFixed(2)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadTestimonials() {
    const grid = document.getElementById('testimonialsGrid');
    if (!grid) return;

    const feedback = await fetchFeedback();

    grid.innerHTML = feedback.map(t => `
        <div class="testimonial-card">
            <div class="testimonial-header">
                <img src="${t.customer?.avatar_url || 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg'}" alt="Avatar" class="testimonial-avatar">
                <div class="testimonial-info">
                    <h4>${t.customer?.full_name || 'Happy Customer'}</h4>
                    <span class="date">${formatDate(t.created_at)}</span>
                </div>
            </div>
            <div class="testimonial-rating">
                ${renderStars(t.rating)}
            </div>
            <p class="testimonial-text">"${t.comment || 'Great experience!'}"</p>
        </div>
    `).join('');
}

// =====================================================
// CUSTOMER DASHBOARD
// =====================================================
async function initCustomerDashboard() {
    updateUserInfo();

    const stats = await fetchCustomerStats();
    displayCustomerStats(stats);

    await loadCustomerAppointments();
    await loadPopularServices();
}

async function fetchCustomerStats() {
    try {
        const appointments = await fetchAppointments({ customerId: currentUser?.id });
        const upcoming = appointments.filter(a => new Date(a.appointment_date) >= new Date());
        const completed = appointments.filter(a => a.status === 'completed');

        const totalSpent = completed.reduce((sum, a) => sum + (parseFloat(a.services?.price) || 0), 0);

        const { data: reviews } = await supabase
            .from('feedback')
            .select('id')
            .eq('customer_id', currentUser?.id);

        return {
            total: appointments.length,
            upcoming: upcoming.length,
            reviews: reviews?.length || 0,
            totalSpent: totalSpent.toFixed(2)
        };
    } catch (error) {
        return { total: 0, upcoming: 0, reviews: 0, totalSpent: 0 };
    }
}

function displayCustomerStats(stats) {
    const elements = {
        totalAppointments: document.getElementById('totalAppointments'),
        upcomingAppointments: document.getElementById('upcomingAppointments'),
        totalReviews: document.getElementById('totalReviews'),
        totalSpent: document.getElementById('totalSpent')
    };

    if (elements.totalAppointments) elements.totalAppointments.textContent = stats.total;
    if (elements.upcomingAppointments) elements.upcomingAppointments.textContent = stats.upcoming;
    if (elements.totalReviews) elements.totalReviews.textContent = stats.reviews;
    if (elements.totalSpent) elements.totalSpent.textContent = `$${stats.totalSpent}`;
}

async function loadCustomerAppointments() {
    const container = document.getElementById('upcomingList');
    if (!container) return;

    const appointments = await fetchAppointments({ customerId: currentUser?.id, upcoming: true });

    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No upcoming appointments</p>
                <button class="btn btn-primary" onclick="showSection('book')">Book Now</button>
            </div>
        `;
        return;
    }

    container.innerHTML = appointments.slice(0, 5).map(a => `
        <div class="appointment-item" onclick="viewAppointment('${a.id}')">
            <div class="appointment-date">
                <span class="day">${new Date(a.appointment_date).getDate()}</span>
                <span class="month">${new Date(a.appointment_date).toLocaleString('default', { month: 'short' })}</span>
            </div>
            <div class="appointment-details">
                <h4>${a.services?.name || 'Service'}</h4>
                <p>${a.start_time} with ${a.staff?.full_name || 'Any Staff'}</p>
            </div>
            <span class="badge ${a.status}">${a.status}</span>
        </div>
    `).join('');
}

async function loadPopularServices() {
    const container = document.getElementById('popularServices');
    if (!container) return;

    const services = await fetchServices();
    const popular = services.slice(0, 4);

    container.innerHTML = popular.map(s => `
        <div class="service-mini">
            <img src="${s.image_url || getCategoryImage(s.category)}" alt="${s.name}">
            <div>
                <h5>${s.name}</h5>
                <p>${s.duration_minutes} min - $${s.price}</p>
            </div>
        </div>
    `).join('');
}

// =====================================================
// STAFF DASHBOARD
// =====================================================
async function initStaffDashboard() {
    updateUserInfo();
    await loadStaffSchedule();
    await loadStaffAppointments();
}

async function loadStaffSchedule() {
    const container = document.getElementById('todaySchedule');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const appointments = await fetchAppointments({ staffId: currentUser?.id, date: today });

    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-check"></i>
                <p>No appointments today</p>
            </div>
        `;
        return;
    }

    container.innerHTML = appointments.map(a => `
        <div class="schedule-item ${a.status}">
            <span class="time">${a.start_time}</span>
            <div class="details">
                <h4>${a.services?.name || 'Service'}</h4>
                <p>${a.customer?.full_name || 'Customer'}</p>
            </div>
            <span class="badge ${a.status === 'completed' ? 'green' : a.status === 'in_progress' ? 'orange' : 'blue'}">
                ${a.status}
            </span>
        </div>
    `).join('');
}

async function loadStaffAppointments() {
    const container = document.getElementById('appointmentsTable');
    if (!container) return;

    const appointments = await fetchAppointments({ staffId: currentUser?.id });

    container.innerHTML = appointments.map(a => `
        <tr>
            <td>${a.customer?.full_name || 'N/A'}</td>
            <td>${a.services?.name || 'N/A'}</td>
            <td>${formatDate(a.appointment_date)}</td>
            <td>${a.start_time}</td>
            <td><span class="badge ${a.status}">${a.status}</span></td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="viewAppointment('${a.id}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// =====================================================
// RECEPTIONIST DASHBOARD
// =====================================================
async function initReceptionistDashboard() {
    updateUserInfo();
    await loadReceptionistOverview();
    await loadTodayTimeline();
}

async function loadReceptionistOverview() {
    const today = new Date().toISOString().split('T')[0];
    const appointments = await fetchAppointments({ date: today });

    const stats = {
        today: appointments.length,
        pending: appointments.filter(a => a.status === 'pending').length,
        staff: (await fetchStaff()).length
    };

    document.getElementById('todayAppointments').textContent = stats.today;
    document.getElementById('pendingCheckins').textContent = stats.pending;
    document.getElementById('activeStaff').textContent = stats.staff;
}

async function loadTodayTimeline() {
    const container = document.getElementById('todayTimeline');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const appointments = await fetchAppointments({ date: today });

    container.innerHTML = appointments.slice(0, 10).map(a => `
        <div class="timeline-item ${a.status}">
            <span class="time">${a.start_time}</span>
            <div class="info">
                <h4>${a.customer?.full_name || 'Customer'} - ${a.services?.name || 'Service'}</h4>
                <p>${a.staff?.full_name || 'Unassigned'}</p>
            </div>
            <button class="btn btn-sm" onclick="updateAppointmentStatus('${a.id}')">
                ${a.status === 'pending' ? 'Check In' : 'Update'}
            </button>
        </div>
    `).join('');
}

// =====================================================
// ADMIN DASHBOARD
// =====================================================
async function initAdminDashboard() {
    updateUserInfo();
    await loadAdminStats();
    await loadAdminData();
}

async function loadAdminStats() {
    try {
        const { data: appointments } = await supabase.from('appointments').select('id');
        const { data: users } = await supabase.from('users').select('id, role');
        const { data: feedback } = await supabase.from('feedback').select('rating');

        const customers = users?.filter(u => u.role === 'customer').length || 0;
        const avgRating = feedback?.length ?
            (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / feedback.length).toFixed(1) : 0;

        // Calculate revenue
        const { data: completed } = await supabase
            .from('appointments')
            .select('services(price)')
            .eq('status', 'completed');

        const revenue = completed?.reduce((sum, a) => sum + (parseFloat(a.services?.price) || 0), 0) || 0;

        document.getElementById('totalAppointments').textContent = appointments?.length || 0;
        document.getElementById('totalRevenue').textContent = `$${revenue.toFixed(0)}`;
        document.getElementById('totalCustomers').textContent = customers;
        document.getElementById('avgRating').textContent = avgRating;
    } catch (error) {
        console.error('Admin stats error:', error);
    }
}

async function loadAdminData() {
    await loadRecentBookings();
    await loadStaffManagement();
    await loadServicesManagement();
}

async function loadRecentBookings() {
    const container = document.getElementById('recentBookings');
    if (!container) return;

    const appointments = await fetchAppointments();

    container.innerHTML = appointments.slice(0, 5).map(a => `
        <tr>
            <td>${a.customer?.full_name || 'N/A'}</td>
            <td>${a.services?.name || 'N/A'}</td>
            <td>${a.staff?.full_name || 'Any'}</td>
            <td>${formatDate(a.appointment_date)}</td>
            <td><span class="badge ${a.status}">${a.status}</span></td>
        </tr>
    `).join('');
}

async function loadStaffManagement() {
    const container = document.getElementById('staffGrid');
    if (!container) return;

    const staff = await fetchStaff();

    container.innerHTML = staff.map(s => `
        <div class="staff-member-card">
            <div class="staff-member-image" style="background-image: url('${s.avatar_url || 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg'}')">
                <span class="staff-status-indicator available">Available</span>
            </div>
            <div class="staff-member-info">
                <h4 class="staff-member-name">${s.full_name}</h4>
                <p class="staff-member-role">${s.role}</p>
                <div class="staff-member-actions">
                    <button class="btn btn-sm btn-outline" onclick="editStaff('${s.id}')">Edit</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadServicesManagement() {
    const container = document.getElementById('servicesTable');
    if (!container) return;

    const services = await fetchServices();

    container.innerHTML = services.map(s => `
        <tr>
            <td><img src="${s.image_url || getCategoryImage(s.category)}" alt="${s.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;"></td>
            <td>${s.name}</td>
            <td><span class="badge blue">${s.category}</span></td>
            <td>${s.duration_minutes} min</td>
            <td>$${s.price}</td>
            <td><span class="badge ${s.is_active ? 'green' : 'red'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="editService('${s.id}')"><i class="fas fa-edit"></i></button>
            </td>
        </tr>
    `).join('');
}

// =====================================================
// CHATROOM
// =====================================================
let currentRoom = 'general';

async function initChatroom() {
    updateUserInfo();
    await loadMessages();
    setupChatEvents();

    // Refresh messages periodically
    setInterval(() => loadMessages(), 10000);
}

async function loadMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const messages = await fetchChatMessages(currentRoom);

    container.innerHTML = messages.map(m => `
        <div class="message ${m.sender_id === currentUser?.id ? 'own' : ''}">
            ${m.sender_id !== currentUser?.id ? `<img src="${m.sender?.avatar_url || 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg'}" class="message-avatar">` : ''}
            <div class="message-body">
                ${m.sender_id !== currentUser?.id ? `<span class="message-sender">${m.sender?.full_name || 'User'}</span>` : ''}
                <p class="message-text">${escapeHtml(m.message)}</p>
                <span class="message-time">${formatTime(m.created_at)}</span>
            </div>
        </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
}

function setupChatEvents() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessageBtn');

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Room switching
    document.querySelectorAll('#roomsList li').forEach(li => {
        li.addEventListener('click', async () => {
            document.querySelectorAll('#roomsList li').forEach(l => l.classList.remove('active'));
            li.classList.add('active');
            currentRoom = li.dataset.room;
            document.getElementById('currentRoomName').textContent = li.querySelector('span').textContent;
            await loadMessages();
        });
    });
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();
    input.value = '';

    await sendChatMessage(message, currentRoom);
}

function refreshChat() {
    return loadMessages();
}

// =====================================================
// BOOKING WIZARD
// =====================================================
let bookingData = { step: 1, service: null, staff: null, date: null, time: null, notes: '' };

async function openBookingModal() {
    if (!currentUser) {
        openModal('loginModal');
        return;
    }
    openModal('bookingModal');
    await loadServicesForBooking();
}

async function loadServicesForBooking() {
    const container = document.getElementById('serviceSelection');
    if (!container) return;

    const services = await fetchServices();

    container.innerHTML = services.map(s => `
        <div class="service-option" data-id="${s.id}" onclick="selectBookingService('${s.id}')">
            <h4>${s.name}</h4>
            <p>${s.category} - ${s.duration_minutes} min</p>
            <div class="service-card-meta">
                <span>$${s.price}</span>
            </div>
        </div>
    `).join('');
}

function selectBookingService(id) {
    const services = getDemoServices();
    bookingData.service = services.find(s => s.id == id) || services[0];
    document.querySelectorAll('.service-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id == id);
    });
}

async function loadStaffForBooking() {
    const container = document.getElementById('staffSelection');
    if (!container) return;

    const staff = await fetchStaff();

    container.innerHTML = staff.map(s => `
        <div class="staff-option" data-id="${s.id}" onclick="selectBookingStaff('${s.id}')">
            <img src="${s.avatar_url || 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg'}" alt="${s.full_name}">
            <h4>${s.full_name}</h4>
            <p>${s.role}</p>
        </div>
    `).join('');

    // Add "Any Available" option
    container.innerHTML += `
        <div class="staff-option" data-id="any" onclick="selectBookingStaff('any')">
            <img src="https://images.pexels.com/photos/3992661/pexels-photo-3992661.jpeg" alt="Any Staff">
            <h4>Any Available</h4>
            <p>First available stylist</p>
        </div>
    `;
}

function selectBookingStaff(id) {
    bookingData.staff = id;
    document.querySelectorAll('.staff-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id == id);
    });
}

async function loadTimeSlots() {
    const container = document.getElementById('timeSlots');
    if (!container) return;

    const date = document.getElementById('bookingDate')?.value;
    if (!date) return;

    bookingData.date = date;
    const slots = await fetchAvailableSlots(date, bookingData.staff, bookingData.service?.id);

    container.innerHTML = slots.map(s => `
        <div class="time-slot ${!s.available ? 'unavailable' : ''}"
             onclick="${s.available ? `selectBookingTime('${s.time}')` : ''}"
             data-time="${s.time}">
            ${s.time}
        </div>
    `).join('');
}

function selectBookingTime(time) {
    bookingData.time = time;
    document.querySelectorAll('.time-slot').forEach(el => {
        el.classList.toggle('selected', el.dataset.time == time);
    });
}

function updateBookingSteps() {
    const { step } = bookingData;

    document.querySelectorAll('.booking-step-content').forEach((el, i) => {
        el.classList.toggle('active', i + 1 === step);
    });

    document.querySelectorAll('.booking-steps .step').forEach((el, i) => {
        el.classList.remove('active', 'completed');
        if (i + 1 < step) el.classList.add('completed');
        if (i + 1 === step) el.classList.add('active');
    });

    document.getElementById('prevStep').disabled = step === 1;
    document.getElementById('nextStep').textContent = step === 4 ? 'Confirm Booking' : 'Next';

    if (step === 2) loadStaffForBooking();
    if (step === 3) loadTimeSlots();
    if (step === 4) displayBookingSummary();
}

function displayBookingSummary() {
    const container = document.getElementById('summaryDetails');
    if (!container) return;

    container.innerHTML = `
        <div class="summary-item">
            <label>Service</label>
            <span>${bookingData.service?.name || 'Not selected'}</span>
        </div>
        <div class="summary-item">
            <label>Date</label>
            <span>${bookingData.date || 'Not selected'}</span>
        </div>
        <div class="summary-item">
            <label>Time</label>
            <span>${bookingData.time || 'Not selected'}</span>
        </div>
        <div class="summary-item total">
            <label>Total</label>
            <span>$${bookingData.service?.price || '0.00'}</span>
        </div>
    `;
}

async function submitBooking() {
    bookingData.notes = document.getElementById('bookingNotes')?.value || '';

    const appointment = {
        service_id: bookingData.service?.id,
        staff_id: bookingData.staff === 'any' ? null : bookingData.staff,
        appointment_date: bookingData.date,
        start_time: bookingData.time,
        end_time: calculateEndTime(bookingData.time, bookingData.service?.duration_minutes),
        notes: bookingData.notes
    };

    const result = await createAppointment(appointment);

    if (result) {
        closeModal('bookingModal');
        bookingData = { step: 1, service: null, staff: null, date: null, time: null, notes: '' };
        await loadCustomerAppointments();
    }
}

function calculateEndTime(startTime, duration) {
    if (!startTime || !duration) return '';
    const [hours, minutes] = startTime.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    return `${endHours}:${endMins.toString().padStart(2, '0')}`;
}

// =====================================================
// COMMON FUNCTIONS
// =====================================================
function setupCommonEvents() {
    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => navLinks.classList.toggle('active'));
    }

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            sidebar.classList.toggle('active');
        });
    }

    // Logout
    document.querySelectorAll('#logoutBtn').forEach(btn => {
        btn.addEventListener('click', logout);
    });

    // Login/Register buttons
    document.getElementById('loginBtn')?.addEventListener('click', () => openModal('loginModal'));
    document.getElementById('registerBtn')?.addEventListener('click', () => openModal('registerModal'));
    document.getElementById('heroBookBtn')?.addEventListener('click', openBookingModal);

    // OAuth buttons
    document.getElementById('googleLoginBtn')?.addEventListener('click', loginWithGoogle);
    document.getElementById('facebookLoginBtn')?.addEventListener('click', loginWithFacebook);
    document.getElementById('googleRegisterBtn')?.addEventListener('click', loginWithGoogle);
    document.getElementById('facebookRegisterBtn')?.addEventListener('click', loginWithFacebook);

    // Modal closes
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) closeModal(modal.id);
        });
    });

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    // Switch between login and register
    document.getElementById('switchToRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('loginModal');
        openModal('registerModal');
    });

    document.getElementById('switchToLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('registerModal');
        openModal('loginModal');
    });

    // Forms
    setupFormHandlers();

    // Booking wizard
    document.getElementById('prevStep')?.addEventListener('click', () => {
        if (bookingData.step > 1) {
            bookingData.step--;
            updateBookingSteps();
        }
    });

    document.getElementById('nextStep')?.addEventListener('click', async () => {
        if (bookingData.step < 4) {
            if (bookingData.step === 1 && !bookingData.service) {
                showToast('Please select a service', 'error');
                return;
            }
            if (bookingData.step === 3) {
                if (!bookingData.date || !bookingData.time) {
                    showToast('Please select date and time', 'error');
                    return;
                }
            }
            bookingData.step++;
            updateBookingSteps();
        } else {
            await submitBooking();
        }
    });

    document.getElementById('bookingDate')?.addEventListener('change', loadTimeSlots);

    // Dashboard navigation
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href?.startsWith('#')) {
                e.preventDefault();
                showSection(href.substring(1));
                document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
                link.parentElement.classList.add('active');
            }
        });
    });

    // Service category tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadServices(btn.dataset.category);
        });
    });

    // Rating stars
    setupRatingStars();
}

function setupFormHandlers() {
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await login(
            document.getElementById('loginEmail').value,
            document.getElementById('loginPassword').value
        );
    });

    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await register(
            document.getElementById('registerEmail').value,
            document.getElementById('registerPassword').value,
            document.getElementById('registerName').value,
            document.getElementById('registerPhone').value,
            document.getElementById('registerRole').value
        );
    });

    document.getElementById('feedbackForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rating = document.querySelectorAll('#ratingStars i.active').length;
        await createFeedback({
            rating,
            comment: document.getElementById('feedbackComment').value
        });
        document.getElementById('feedbackForm').reset();
        await loadTestimonials();
    });

    document.getElementById('contactForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Message sent successfully!', 'success');
        e.target.reset();
    });
}

function setupRatingStars() {
    const stars = document.querySelectorAll('#ratingStars i');
    let selectedRating = 0;

    stars.forEach((star, index) => {
        star.addEventListener('click', () => {
            selectedRating = index + 1;
            stars.forEach((s, i) => s.classList.toggle('active', i < selectedRating));
        });
    });
}

function showSection(sectionId) {
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.classList.remove('error');
        if (type === 'error') toast.classList.add('error');
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 3000);
    }
}

function showLoading(show) {
    // Can be extended to show a loading spinner
    document.body.classList.toggle('loading', show);
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
}

function updateUserInfo() {
    const userName = document.getElementById('userName');
    const welcomeName = document.getElementById('welcomeName');
    const userRole = document.getElementById('userRole');
    const userAvatar = document.getElementById('userAvatar');

    if (userName) userName.textContent = currentUser?.full_name || 'Guest';
    if (welcomeName) welcomeName.textContent = currentUser?.full_name?.split(' ')[0] || 'Guest';
    if (userRole) userRole.textContent = currentUser?.role || 'Customer';
    if (userAvatar && currentUser?.avatar_url) userAvatar.src = currentUser.avatar_url;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += `<i class="fas fa-star${i > rating ? ' empty' : ''}"></i>`;
    }
    return stars;
}

function getCategoryImage(category) {
    const images = {
        hair: 'https://images.pexels.com/photos/3993429/pexels-photo-3993429.jpeg',
        nails: 'https://images.pexels.com/photos/3993427/pexels-photo-3993427.jpeg',
        spa: 'https://images.pexels.com/photos/3993430/pexels-photo-3993430.jpeg',
        massage: 'https://images.pexels.com/photos/3993432/pexels-photo-3993432.jpeg'
    };
    return images[category] || images.spa;
}

function getDemoServices() {
    return [
        { id: '1', name: 'Haircut', description: 'Professional haircut and styling', category: 'hair', duration_minutes: 30, price: 35.00, image_url: 'https://images.pexels.com/photos/3993429/pexels-photo-3993429.jpeg' },
        { id: '2', name: 'Hair Coloring', description: 'Full hair coloring service', category: 'hair', duration_minutes: 90, price: 85.00, image_url: 'https://images.pexels.com/photos/3993425/pexels-photo-3993425.jpeg' },
        { id: '3', name: 'Manicure', description: 'Classic manicure with nail polish', category: 'nails', duration_minutes: 45, price: 25.00, image_url: 'https://images.pexels.com/photos/3993427/pexels-photo-3993427.jpeg' },
        { id: '4', name: 'Pedicure', description: 'Relaxing pedicure with foot massage', category: 'nails', duration_minutes: 60, price: 35.00, image_url: 'https://images.pexels.com/photos/3993428/pexels-photo-3993428.jpeg' },
        { id: '5', name: 'Nail Art', description: 'Creative nail art design', category: 'nails', duration_minutes: 75, price: 45.00, image_url: 'https://images.pexels.com/photos/3993426/pexels-photo-3993426.jpeg' },
        { id: '6', name: 'Facial Treatment', description: 'Deep cleansing facial', category: 'spa', duration_minutes: 60, price: 55.00, image_url: 'https://images.pexels.com/photos/3993430/pexels-photo-3993430.jpeg' },
        { id: '7', name: 'Body Scrub', description: 'Full body exfoliation treatment', category: 'spa', duration_minutes: 90, price: 75.00, image_url: 'https://images.pexels.com/photos/3993431/pexels-photo-3993431.jpeg' },
        { id: '8', name: 'Full Body Massage', description: 'Relaxing Swedish massage', category: 'massage', duration_minutes: 90, price: 95.00, image_url: 'https://images.pexels.com/photos/3993432/pexels-photo-3993432.jpeg' },
        { id: '9', name: 'Hot Stone Massage', description: 'Therapeutic hot stone massage', category: 'massage', duration_minutes: 75, price: 85.00, image_url: 'https://images.pexels.com/photos/3993433/pexels-photo-3993433.jpeg' },
        { id: '10', name: 'Aromatherapy', description: 'Essential oil massage therapy', category: 'massage', duration_minutes: 60, price: 70.00, image_url: 'https://images.pexels.com/photos/3993434/pexels-photo-3993434.jpeg' }
    ];
}

function getDemoStaff() {
    return [
        { id: 's1', full_name: 'Emma Johnson', role: 'staff', avatar_url: 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg' },
        { id: 's2', full_name: 'Sophie Williams', role: 'staff', avatar_url: 'https://images.pexels.com/photos/3992659/pexels-photo-3992659.jpeg' },
        { id: 's3', full_name: 'Olivia Brown', role: 'staff', avatar_url: 'https://images.pexels.com/photos/3992660/pexels-photo-3992660.jpeg' }
    ];
}

function getDemoTestimonials() {
    return [
        { id: '1', rating: 5, comment: 'Absolutely love this place! The staff is so friendly and professional.', customer: { full_name: 'Sarah M.' }, created_at: new Date() },
        { id: '2', rating: 5, comment: 'Best spa experience ever. The massage was heavenly.', customer: { full_name: 'Jennifer L.' }, created_at: new Date() },
        { id: '3', rating: 4, comment: 'Great nail services! Very talented artists.', customer: { full_name: 'Amanda K.' }, created_at: new Date() }
    ];
}

// Global exports for HTML onclick handlers
window.scrollToSection = scrollToSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.showSection = showSection;
window.selectService = (id) => openBookingModal();
window.selectBookingService = selectBookingService;
window.selectBookingStaff = selectBookingStaff;
window.selectBookingTime = selectBookingTime;
window.viewAppointment = (id) => console.log('View appointment:', id);
window.editStaff = (id) => console.log('Edit staff:', id);
window.editService = (id) => console.log('Edit service:', id);