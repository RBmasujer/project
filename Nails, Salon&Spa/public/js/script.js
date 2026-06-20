/**
 * Dear Self - Nails, Salon & Spa
 * Complete JavaScript Application
 */

// =====================================================
// SUPABASE CONFIGURATION
// =====================================================
const SUPABASE_URL = window.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'your-anon-key';

let supabase = null;
let currentUser = null;

// Initialize Supabase
function initSupabase() {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized');
        checkAuth();
    } catch (error) {
        console.error('Supabase init error:', error);
        initDemoMode();
    }
}

// Demo mode for when Supabase is not configured
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
// AUTHENTICATION
// =====================================================
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const { data: user } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();
            currentUser = user || {
                id: session.user.id,
                email: session.user.email,
                full_name: session.user.email.split('@')[0],
                role: 'customer'
            };
        }
    } catch (error) {
        console.log('Auth check error:', error);
    }
    initApp();
}

async function login(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;

        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

        currentUser = user;
        showToast('Login successful!', 'success');
        redirectBasedOnRole(user.role);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function register(email, password, name, phone, role) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });
        if (error) throw error;

        const { error: profileError } = await supabase
            .from('users')
            .insert([{
                id: data.user.id,
                email,
                full_name: name,
                phone,
                role
            }]);

        if (profileError) throw profileError;

        showToast('Account created successfully!', 'success');
        closeModal('registerModal');

        currentUser = { id: data.user.id, email, full_name: name, role };
        redirectBasedOnRole(role);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function logout() {
    try {
        await supabase?.auth.signOut();
    } catch (e) {}
    currentUser = null;
    window.location.href = 'landing-page.html';
}

// =====================================================
// OAUTH AUTHENTICATION (Google & Facebook)
// =====================================================

// Google OAuth
async function loginWithGoogle() {
    try {
        // Check if Supabase is configured
        if (supabase) {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/customer-dashboard.html'
                }
            });
            if (error) throw error;
            return;
        }

        // Fallback: Demo OAuth or redirect to server OAuth
        const useDemo = !window.OAUTH_CONFIG || window.OAUTH_CONFIG.google?.clientId === 'your-google-client-id';

        if (useDemo) {
            // Demo mode
            const response = await fetch('/api/auth/oauth/demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'google' })
            });

            const result = await response.json();
            if (result.success) {
                localStorage.setItem('auth_token', result.token);
                currentUser = result.user;
                showToast('Logged in with Google!', 'success');
                closeModal('loginModal');
                redirectBasedOnRole(result.user.role);
            } else {
                throw new Error(result.error);
            }
        } else {
            // Redirect to server OAuth flow
            window.location.href = '/api/auth/google?redirect=/customer';
        }
    } catch (error) {
        console.error('Google login error:', error);
        showToast(error.message || 'Google login failed', 'error');
    }
}

// Facebook OAuth
async function loginWithFacebook() {
    try {
        // Check if Supabase is configured
        if (supabase) {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'facebook',
                options: {
                    redirectTo: window.location.origin + '/customer-dashboard.html'
                }
            });
            if (error) throw error;
            return;
        }

        // Fallback: Demo OAuth or redirect to server OAuth
        const useDemo = !window.OAUTH_CONFIG || window.OAUTH_CONFIG.facebook?.appId === 'your-facebook-app-id';

        if (useDemo) {
            // Demo mode
            const response = await fetch('/api/auth/oauth/demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'facebook' })
            });

            const result = await response.json();
            if (result.success) {
                localStorage.setItem('auth_token', result.token);
                currentUser = result.user;
                showToast('Logged in with Facebook!', 'success');
                closeModal('loginModal');
                redirectBasedOnRole(result.user.role);
            } else {
                throw new Error(result.error);
            }
        } else {
            // Redirect to server OAuth flow
            window.location.href = '/api/auth/facebook?redirect=/customer';
        }
    } catch (error) {
        console.error('Facebook login error:', error);
        showToast(error.message || 'Facebook login failed', 'error');
    }
}

// Handle OAuth callback (when returning from OAuth provider)
async function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const oauth = urlParams.get('oauth');

    if (token && oauth) {
        localStorage.setItem('auth_token', token);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);

        showToast(`Logged in with ${oauth.charAt(0).toUpperCase() + oauth.slice(1)}!`, 'success');

        // Check if Supabase session needs to be set
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // Set session from token
                const decoded = parseJwt(token);
                currentUser = {
                    id: decoded.id,
                    email: decoded.email,
                    role: decoded.role
                };
            }
        }

        return true;
    }
    return false;
}

// Parse JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Initialize Google Sign-In SDK
function initGoogleSignIn() {
    if (window.google && window.google.accounts) {
        google.accounts.id.initialize({
            client_id: window.OAUTH_CONFIG?.google?.clientId,
            callback: async (response) => {
                if (response.credential) {
                    try {
                        const result = await fetch('/api/auth/oauth/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                provider: 'google',
                                idToken: response.credential
                            })
                        });

                        const data = await result.json();
                        if (data.success) {
                            localStorage.setItem('auth_token', data.token);
                            currentUser = data.user;
                            showToast('Logged in with Google!', 'success');
                            closeModal('loginModal');
                            redirectBasedOnRole(data.user.role);
                        }
                    } catch (error) {
                        showToast('Google login failed', 'error');
                    }
                }
            }
        });
    }
}

// Facebook SDK initialization
function initFacebookSDK() {
    if (window.FB) {
        FB.init({
            appId: window.OAUTH_CONFIG?.facebook?.appId,
            cookie: true,
            xfbml: true,
            version: 'v18.0'
        });
    }
}

// Facebook login with SDK
async function facebookLoginWithSDK() {
    if (!window.FB) {
        return loginWithFacebook(); // Fallback to server OAuth
    }

    return new Promise((resolve, reject) => {
        FB.login(async (response) => {
            if (response.authResponse) {
                try {
                    const result = await fetch('/api/auth/oauth/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            provider: 'facebook',
                            accessToken: response.authResponse.accessToken
                        })
                    });

                    const data = await result.json();
                    if (data.success) {
                        localStorage.setItem('auth_token', data.token);
                        currentUser = data.user;
                        showToast('Logged in with Facebook!', 'success');
                        closeModal('loginModal');
                        redirectBasedOnRole(data.user.role);
                        resolve(data);
                    } else {
                        reject(new Error(data.error));
                    }
                } catch (error) {
                    reject(error);
                }
            } else {
                reject(new Error('Facebook login cancelled'));
            }
        }, { scope: 'email,public_profile' });
    });
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
// APP INITIALIZATION
// =====================================================
function initApp() {
    // Update UI based on current page
    const page = getCurrentPage();
    console.log('Current page:', page);

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

    setupCommonEvents();
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
function initLandingPage() {
    loadServices();
    loadTestimonials();
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
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

async function loadServices(category = 'all') {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    try {
        let query = supabase?.from('services').select('*').eq('is_active', true);
        if (category !== 'all' && supabase) {
            query = query.eq('category', category);
        }

        let services = [];
        if (supabase) {
            const { data } = await query;
            services = data || [];
        }

        if (services.length === 0) {
            services = getDemoServices();
        }

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

        // Setup tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadServices(btn.dataset.category);
            });
        });
    } catch (error) {
        console.error('Load services error:', error);
        grid.innerHTML = '<p>Unable to load services</p>';
    }
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

function getCategoryImage(category) {
    const images = {
        hair: 'https://images.pexels.com/photos/3993429/pexels-photo-3993429.jpeg',
        nails: 'https://images.pexels.com/photos/3993427/pexels-photo-3993427.jpeg',
        spa: 'https://images.pexels.com/photos/3993430/pexels-photo-3993430.jpeg',
        massage: 'https://images.pexels.com/photos/3993432/pexels-photo-3993432.jpeg'
    };
    return images[category] || images.spa;
}

async function loadTestimonials() {
    const grid = document.getElementById('testimonialsGrid');
    if (!grid) return;

    try {
        const { data: reviews } = await supabase?.from('feedback')
            .select('*, users(full_name)')
            .order('created_at', { ascending: false })
            .limit(6) || { data: null };

        let testimonials = reviews || getDemoTestimonials();

        grid.innerHTML = testimonials.map(t => `
            <div class="testimonial-card">
                <div class="testimonial-header">
                    <img src="https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg" alt="Avatar" class="testimonial-avatar">
                    <div class="testimonial-info">
                        <h4>${t.users?.full_name || t.customer_name || 'Happy Customer'}</h4>
                        <span class="date">${formatDate(t.created_at)}</span>
                    </div>
                </div>
                <div class="testimonial-rating">
                    ${renderStars(t.rating)}
                </div>
                <p class="testimonial-text">"${t.comment || 'Great experience!'}"</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load testimonials error:', error);
        grid.innerHTML = getDemoTestimonials().map(t => `
            <div class="testimonial-card">
                <div class="testimonial-header">
                    <img src="https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg" alt="Avatar" class="testimonial-avatar">
                    <div class="testimonial-info">
                        <h4>${t.customer_name || 'Happy Customer'}</h4>
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
}

function getDemoTestimonials() {
    return [
        { id: '1', rating: 5, comment: 'Absolutely love this place! The staff is so friendly and professional. My hair has never looked better!', customer_name: 'Sarah M.', created_at: new Date() },
        { id: '2', rating: 5, comment: 'Best spa experience ever. The massage was heavenly and the ambiance was so relaxing.', customer_name: 'Jennifer L.', created_at: new Date() },
        { id: '3', rating: 4, comment: 'Great nail services! The nail artist was very talented and patient with my design requests.', customer_name: 'Amanda K.', created_at: new Date() },
        { id: '4', rating: 5, comment: 'My go-to salon for all beauty needs. Consistently excellent service every time!', customer_name: 'Michelle R.', created_at: new Date() }
    ];
}

function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += '<i class="fas fa-star"></i>';
        } else {
            stars += '<i class="fas fa-star empty"></i>';
        }
    }
    return stars;
}

// =====================================================
// BOOKING SYSTEM
// =====================================================
let bookingData = {
    step: 1,
    service: null,
    staff: null,
    date: null,
    time: null,
    notes: ''
};

function openBookingModal() {
    if (!currentUser) {
        openModal('loginModal');
        return;
    }
    openModal('bookingModal');
    loadServicesForBooking();
}

async function loadServicesForBooking() {
    const container = document.getElementById('serviceSelection');
    if (!container) return;

    const services = getDemoServices();

    container.innerHTML = services.map(s => `
        <div class="service-option" data-id="${s.id}" onclick="selectBookingService('${s.id}')">
            <h4>${s.name}</h4>
            <p>${s.category}</p>
            <div class="service-card-meta">
                <span>${s.duration_minutes} min</span>
                <span>$${s.price}</span>
            </div>
        </div>
    `).join('');
}

function selectBookingService(id) {
    const services = getDemoServices();
    bookingData.service = services.find(s => s.id == id);
    document.querySelectorAll('.service-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id == id);
    });
}

async function loadStaffForBooking() {
    const container = document.getElementById('staffSelection');
    if (!container) return;

    const staff = getDemoStaff();

    container.innerHTML = staff.map(s => `
        <div class="staff-option" data-id="${s.id}" onclick="selectBookingStaff('${s.id}')">
            <img src="${s.avatar_url}" alt="${s.full_name}">
            <h4>${s.full_name}</h4>
            <p>${s.specialty}</p>
        </div>
    `).join('');
}

function getDemoStaff() {
    return [
        { id: 's1', full_name: 'Emma Johnson', specialty: 'Hair Stylist', avatar_url: 'https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg' },
        { id: 's2', full_name: 'Sophie Williams', specialty: 'Nail Artist', avatar_url: 'https://images.pexels.com/photos/3992659/pexels-photo-3992659.jpeg' },
        { id: 's3', full_name: 'Olivia Brown', specialty: 'Massage Therapist', avatar_url: 'https://images.pexels.com/photos/3992660/pexels-photo-3992660.jpeg' },
        { id: 's4', full_name: 'Any Available', specialty: 'First Available', avatar_url: 'https://images.pexels.com/photos/3992661/pexels-photo-3992661.jpeg' }
    ];
}

function selectBookingStaff(id) {
    const staff = getDemoStaff();
    bookingData.staff = staff.find(s => s.id == id);
    document.querySelectorAll('.staff-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id == id);
    });
}

function generateTimeSlots() {
    const container = document.getElementById('timeSlots');
    if (!container) return;

    const slots = [];
    for (let h = 9; h < 20; h++) {
        slots.push(`${h}:00`);
        if (h < 19) slots.push(`${h}:30`);
    }

    container.innerHTML = slots.map(time => `
        <div class="time-slot ${Math.random() > 0.7 ? 'unavailable' : ''}"
             onclick="selectTimeSlot('${time}')"
             data-time="${time}">
            ${time}
        </div>
    `).join('');
}

function selectTimeSlot(time) {
    if (event.target.classList.contains('unavailable')) return;
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

    // Load content for current step
    if (step === 2) loadStaffForBooking();
    if (step === 3) generateTimeSlots();
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
            <label>Stylist</label>
            <span>${bookingData.staff?.full_name || 'Any Available'}</span>
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

    try {
        const appointment = {
            customer_id: currentUser?.id,
            staff_id: bookingData.staff?.id === 's4' ? null : bookingData.staff?.id,
            service_id: bookingData.service?.id,
            appointment_date: bookingData.date,
            start_time: bookingData.time,
            end_time: calculateEndTime(bookingData.time, bookingData.service?.duration_minutes),
            status: 'pending',
            notes: bookingData.notes
        };

        if (supabase) {
            const { error } = await supabase.from('appointments').insert([appointment]);
            if (error) throw error;
        }

        showToast('Appointment booked successfully!', 'success');
        closeModal('bookingModal');
        bookingData = { step: 1, service: null, staff: null, date: null, time: null, notes: '' };
    } catch (error) {
        console.error('Booking error:', error);
        showToast('Booking saved! (Demo Mode)', 'success');
        closeModal('bookingModal');
    }
}

function calculateEndTime(startTime, duration) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    return `${endHours}:${endMins.toString().padStart(2, '0')}`;
}

// =====================================================
// CUSTOMER DASHBOARD
// =====================================================
function initCustomerDashboard() {
    updateUserInfo();
    loadCustomerStats();
    loadCustomerAppointments();
    loadPopularServices();
}

function updateUserInfo() {
    const userName = document.getElementById('userName');
    const welcomeName = document.getElementById('welcomeName');
    const userRole = document.getElementById('userRole');

    if (userName) userName.textContent = currentUser?.full_name || 'Guest';
    if (welcomeName) welcomeName.textContent = currentUser?.full_name?.split(' ')[0] || 'Guest';
    if (userRole) userRole.textContent = currentUser?.role || 'Customer';
}

async function loadCustomerStats() {
    try {
        // Use demo data
        document.getElementById('totalAppointments').textContent = '5';
        document.getElementById('upcomingAppointments').textContent = '2';
        document.getElementById('totalReviews').textContent = '3';
        document.getElementById('totalSpent').textContent = '$285';
    } catch (error) {
        console.error('Stats error:', error);
    }
}

async function loadCustomerAppointments() {
    const container = document.getElementById('upcomingList');
    if (!container) return;

    // Demo appointments
    const appointments = [
        { id: '1', service: 'Haircut', date: '2024-01-15', time: '10:00', staff: 'Emma Johnson', status: 'confirmed' },
        { id: '2', service: 'Manicure', date: '2024-01-18', time: '14:30', staff: 'Sophie Williams', status: 'pending' }
    ];

    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No upcoming appointments</p>
            </div>
        `;
        return;
    }

    container.innerHTML = appointments.map(a => `
        <div class="appointment-item">
            <div class="appointment-date">
                <span class="day">${new Date(a.date).getDate()}</span>
                <span class="month">${new Date(a.date).toLocaleString('default', { month: 'short' })}</span>
            </div>
            <div class="appointment-details">
                <h4>${a.service}</h4>
                <p>${a.time} with ${a.staff}</p>
            </div>
            <span class="badge ${a.status}">${a.status}</span>
        </div>
    `).join('');
}

function loadPopularServices() {
    const container = document.getElementById('popularServices');
    if (!container) return;

    const services = getDemoServices().slice(0, 4);

    container.innerHTML = services.map(s => `
        <div class="service-mini">
            <img src="${s.image_url}" alt="${s.name}">
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
function initStaffDashboard() {
    updateUserInfo();
    loadStaffStats();
    loadTodaySchedule();
}

function loadStaffStats() {
    document.getElementById('todayAppointments').textContent = '4';
    document.getElementById('weekAppointments').textContent = '18';
    document.getElementById('monthEarnings').textContent = '$1,250';
    document.getElementById('avgRating').textContent = '4.8';
}

function loadTodaySchedule() {
    const container = document.getElementById('todaySchedule');
    if (!container) return;

    const appointments = [
        { time: '09:00', service: 'Haircut', customer: 'Sarah M.', status: 'completed' },
        { time: '10:30', service: 'Hair Coloring', customer: 'John D.', status: 'in_progress' },
        { time: '13:00', service: 'Haircut', customer: 'Lisa K.', status: 'pending' },
        { time: '15:00', service: 'Haircut & Style', customer: 'Mike R.', status: 'pending' }
    ];

    container.innerHTML = appointments.map(a => `
        <div class="schedule-item ${a.status}">
            <span class="time">${a.time}</span>
            <div class="details">
                <h4>${a.service}</h4>
                <p>${a.customer}</p>
            </div>
            <span class="badge ${a.status === 'completed' ? 'green' : a.status === 'in_progress' ? 'orange' : 'blue'}">${a.status}</span>
        </div>
    `).join('');
}

// =====================================================
// RECEPTIONIST DASHBOARD
// =====================================================
function initReceptionistDashboard() {
    updateUserInfo();
    loadReceptionistStats();
    loadTodayAppointments();
    loadWaitingList();
}

function loadReceptionistStats() {
    document.getElementById('todayAppointments').textContent = '12';
    document.getElementById('todayWalkins').textContent = '3';
    document.getElementById('pendingCheckins').textContent = '2';
    document.getElementById('activeStaff').textContent = '6';
}

function loadTodayAppointments() {
    const container = document.getElementById('todayTimeline');
    if (!container) return;

    // Demo timeline
    container.innerHTML = `
        <div class="timeline-item">
            <span class="time">09:00</span>
            <div class="info">
                <h4>Sarah M. - Haircut</h4>
                <p>Emma Johnson</p>
            </div>
        </div>
        <div class="timeline-item">
            <span class="time">10:30</span>
            <div class="info">
                <h4>John D. - Massage</h4>
                <p>Olivia Brown</p>
            </div>
        </div>
        <div class="timeline-item active">
            <span class="time">11:00</span>
            <div class="info">
                <h4>Lisa K. - Manicure</h4>
                <p>Sophie Williams</p>
            </div>
        </div>
    `;
}

function loadWaitingList() {
    const container = document.getElementById('waitingList');
    if (!container) return;

    container.innerHTML = `
        <div class="waiting-item">
            <span class="position">#1</span>
            <div class="info">
                <h4>Walk-in Guest</h4>
                <p>Waiting for: Haircut</p>
                <small>Waiting for 15 min</small>
            </div>
        </div>
    `;
}

// =====================================================
// ADMIN DASHBOARD
// =====================================================
function initAdminDashboard() {
    updateUserInfo();
    loadAdminStats();
    loadRecentBookings();
    loadStaffManagement();
    loadServicesManagement();
}

function loadAdminStats() {
    document.getElementById('totalAppointments').textContent = '156';
    document.getElementById('totalRevenue').textContent = '$8,450';
    document.getElementById('totalCustomers').textContent = '89';
    document.getElementById('avgRating').textContent = '4.7';
}

function loadRecentBookings() {
    const container = document.getElementById('recentBookings');
    if (!container) return;

    const bookings = [
        { customer: 'Sarah M.', service: 'Haircut', staff: 'Emma Johnson', date: 'Today', status: 'confirmed' },
        { customer: 'John D.', service: 'Massage', staff: 'Olivia Brown', date: 'Today', status: 'completed' },
        { customer: 'Lisa K.', service: 'Manicure', staff: 'Sophie Williams', date: 'Tomorrow', status: 'pending' },
        { customer: 'Mike R.', service: 'Haircut', staff: 'Emma Johnson', date: 'Tomorrow', status: 'pending' }
    ];

    container.innerHTML = bookings.map(b => `
        <tr>
            <td>${b.customer}</td>
            <td>${b.service}</td>
            <td>${b.staff}</td>
            <td>${b.date}</td>
            <td><span class="badge ${b.status === 'completed' ? 'green' : b.status === 'confirmed' ? 'blue' : 'orange'}">${b.status}</span></td>
        </tr>
    `).join('');
}

function loadStaffManagement() {
    const container = document.getElementById('staffGrid');
    if (!container) return;

    const staff = getDemoStaff();

    container.innerHTML = staff.slice(0, -1).map(s => `
        <div class="staff-member-card">
            <div class="staff-member-image" style="background-image: url('${s.avatar_url}')">
                <span class="staff-status-indicator available">Available</span>
            </div>
            <div class="staff-member-info">
                <h4 class="staff-member-name">${s.full_name}</h4>
                <p class="staff-member-role">${s.specialty}</p>
                <div class="staff-member-actions">
                    <button class="btn btn-sm btn-outline" onclick="editStaff('${s.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteStaff('${s.id}')">Remove</button>
                </div>
            </div>
        </div>
    `).join('');
}

function loadServicesManagement() {
    const container = document.getElementById('servicesTable');
    if (!container) return;

    const services = getDemoServices();

    container.innerHTML = services.map(s => `
        <tr>
            <td><img src="${s.image_url}" alt="${s.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;"></td>
            <td>${s.name}</td>
            <td><span class="badge blue">${s.category}</span></td>
            <td>${s.duration_minutes} min</td>
            <td>$${s.price}</td>
            <td><span class="badge green">Active</span></td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="editService('${s.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-icon" onclick="deleteService('${s.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

// =====================================================
// CHATROOM
// =====================================================
function initChatroom() {
    updateUserInfo();
    loadMessages();
    setupChatEvents();
}

let currentRoom = 'general';

function loadMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // Demo messages
    const messages = [
        { id: '1', sender: 'Emma Johnson', text: 'Good morning everyone!', time: '09:00', own: false },
        { id: '2', sender: 'You', text: 'Morning! Ready for the day?', time: '09:05', own: true },
        { id: '3', sender: 'Sophie Williams', text: 'All set! First appointment at 10.', time: '09:10', own: false }
    ];

    container.innerHTML = messages.map(m => `
        <div class="message ${m.own ? 'own' : ''}">
            ${!m.own ? `<img src="https://images.pexels.com/photos/3992658/pexels-photo-3992658.jpeg" class="message-avatar">` : ''}
            <div class="message-body">
                ${!m.own ? `<span class="message-sender">${m.sender}</span>` : ''}
                <p class="message-text">${m.text}</p>
                <span class="message-time">${m.time}</span>
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
        li.addEventListener('click', () => {
            document.querySelectorAll('#roomsList li').forEach(l => l.classList.remove('active'));
            li.classList.add('active');
            currentRoom = li.dataset.room;
            document.getElementById('currentRoomName').textContent = li.querySelector('span').textContent;
            loadMessages();
        });
    });
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim()) return;

    const container = document.getElementById('chatMessages');
    const message = document.createElement('div');
    message.className = 'message own';
    message.innerHTML = `
        <div class="message-body">
            <p class="message-text">${input.value}</p>
            <span class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
    input.value = '';

    // Save to Supabase if available
    if (supabase && currentUser) {
        supabase.from('chat_messages').insert([{
            sender_id: currentUser.id,
            room_type: currentRoom,
            message: input.value
        }]);
    }
}

// =====================================================
// COMMON FUNCTIONS
// =====================================================
function setupCommonEvents() {
    // Handle OAuth callback if present
    handleOAuthCallback();

    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
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
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Login/Register buttons
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const heroBookBtn = document.getElementById('heroBookBtn');

    if (loginBtn) loginBtn.addEventListener('click', () => openModal('loginModal'));
    if (registerBtn) registerBtn.addEventListener('click', () => openModal('registerModal'));
    if (heroBookBtn) heroBookBtn.addEventListener('click', openBookingModal);

    // OAuth buttons
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const facebookLoginBtn = document.getElementById('facebookLoginBtn');
    const googleRegisterBtn = document.getElementById('googleRegisterBtn');
    const facebookRegisterBtn = document.getElementById('facebookRegisterBtn');

    if (googleLoginBtn) googleLoginBtn.addEventListener('click', loginWithGoogle);
    if (facebookLoginBtn) facebookLoginBtn.addEventListener('click', loginWithFacebook);
    if (googleRegisterBtn) googleRegisterBtn.addEventListener('click', loginWithGoogle);
    if (facebookRegisterBtn) facebookRegisterBtn.addEventListener('click', loginWithFacebook);

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
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    if (switchToRegister) {
        switchToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('loginModal');
            openModal('registerModal');
        });
    }
    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('registerModal');
            openModal('loginModal');
        });
    }

    // Forms
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const feedbackForm = document.getElementById('feedbackForm');
    const contactForm = document.getElementById('contactForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            await login(email, password);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('registerName').value;
            const email = document.getElementById('registerEmail').value;
            const phone = document.getElementById('registerPhone').value;
            const password = document.getElementById('registerPassword').value;
            const role = document.getElementById('registerRole').value;
            await register(email, password, name, phone, role);
        });
    }

    if (feedbackForm) {
        setupRatingStars();
        feedbackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitFeedback();
        });
    }

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Message sent successfully!', 'success');
            contactForm.reset();
        });
    }

    // Booking wizard
    const prevStep = document.getElementById('prevStep');
    const nextStep = document.getElementById('nextStep');
    const bookingDate = document.getElementById('bookingDate');

    if (prevStep) {
        prevStep.addEventListener('click', () => {
            if (bookingData.step > 1) {
                bookingData.step--;
                updateBookingSteps();
            }
        });
    }

    if (nextStep) {
        nextStep.addEventListener('click', () => {
            if (bookingData.step < 4) {
                // Validate current step
                if (bookingData.step === 1 && !bookingData.service) {
                    showToast('Please select a service', 'error');
                    return;
                }
                if (bookingData.step === 3) {
                    bookingData.date = bookingDate?.value;
                    if (!bookingData.date || !bookingData.time) {
                        showToast('Please select date and time', 'error');
                        return;
                    }
                }
                bookingData.step++;
                updateBookingSteps();
            } else {
                submitBooking();
            }
        });
    }

    // Modal close buttons
    const loginModalClose = document.getElementById('loginModalClose');
    const registerModalClose = document.getElementById('registerModalClose');
    const bookingModalClose = document.getElementById('bookingModalClose');

    if (loginModalClose) loginModalClose.addEventListener('click', () => closeModal('loginModal'));
    if (registerModalClose) registerModalClose.addEventListener('click', () => closeModal('registerModal'));
    if (bookingModalClose) bookingModalClose.addEventListener('click', () => closeModal('bookingModal'));

    // Dashboard navigation
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                showSection(href.substring(1));
                document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
                link.parentElement.classList.add('active');
            }
        });
    });
}

function showSection(sectionId) {
    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.classList.remove('active');
    });
    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
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

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function setupRatingStars() {
    const stars = document.querySelectorAll('#ratingStars i');
    let selectedRating = 0;

    stars.forEach((star, index) => {
        star.addEventListener('click', () => {
            selectedRating = index + 1;
            stars.forEach((s, i) => {
                s.classList.toggle('active', i < selectedRating);
            });
        });

        star.addEventListener('mouseenter', () => {
            stars.forEach((s, i) => {
                s.style.color = i <= index ? '#f39c12' : '#ddd';
            });
        });

        star.addEventListener('mouseleave', () => {
            stars.forEach((s, i) => {
                s.style.color = i < selectedRating ? '#f39c12' : '#ddd';
            });
        });
    });
}

async function submitFeedback() {
    const name = document.getElementById('feedbackName')?.value;
    const email = document.getElementById('feedbackEmail')?.value;
    const comment = document.getElementById('feedbackComment')?.value;
    const rating = document.querySelectorAll('#ratingStars i.active').length;

    if (!name || !email || !comment || rating === 0) {
        showToast('Please fill all fields and select a rating', 'error');
        return;
    }

    try {
        if (supabase && currentUser) {
            await supabase.from('feedback').insert([{
                customer_id: currentUser.id,
                rating,
                comment
            }]);
        }
        showToast('Thank you for your feedback!', 'success');
        document.getElementById('feedbackForm')?.reset();
        loadTestimonials();
    } catch (error) {
        console.error('Feedback error:', error);
        showToast('Feedback submitted! (Demo Mode)', 'success');
    }
}

// Admin functions
function editStaff(id) {
    showToast('Edit staff feature - Demo mode', 'success');
}

function deleteStaff(id) {
    showToast('Staff removed - Demo mode', 'success');
}

function editService(id) {
    showToast('Edit service feature - Demo mode', 'success');
}

function deleteService(id) {
    showToast('Service removed - Demo mode', 'success');
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});

// Export functions for global access
window.scrollToSection = scrollToSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.showSection = showSection;
window.selectService = (id) => {
    window.location.href = `customer-dashboard.html#book`;
};
window.selectBookingService = selectBookingService;
window.selectBookingStaff = selectBookingStaff;
window.selectTimeSlot = selectTimeSlot;
window.editStaff = editStaff;
window.deleteStaff = deleteStaff;
window.editService = editService;
window.deleteService = deleteService;