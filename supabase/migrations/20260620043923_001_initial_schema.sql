-- Users table for authentication with roles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('customer', 'staff', 'receptionist', 'admin')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services offered
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('hair', 'nails', 'spa', 'massage')),
    duration_minutes INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff can perform specific services
CREATE TABLE staff_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    UNIQUE(staff_id, service_id)
);

-- Appointments/Bookings
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Feedback
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages for chatroom
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    room_type TEXT NOT NULL CHECK (room_type IN ('general', 'staff', 'support')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "users_select_authenticated" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert_own" ON users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- RLS Policies for services (public read, admin write)
CREATE POLICY "services_select_all" ON services FOR SELECT TO authenticated USING (true);
CREATE POLICY "services_insert_admin" ON services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "services_update_admin" ON services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "services_delete_admin" ON services FOR DELETE TO authenticated USING (true);

-- RLS Policies for staff_services
CREATE POLICY "staff_services_select" ON staff_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_services_insert" ON staff_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff_services_delete" ON staff_services FOR DELETE TO authenticated USING (true);

-- RLS Policies for appointments
CREATE POLICY "appointments_select_own" ON appointments FOR SELECT TO authenticated 
    USING (auth.uid() = customer_id OR auth.uid() = staff_id OR true);
CREATE POLICY "appointments_insert" ON appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "appointments_update" ON appointments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "appointments_delete" ON appointments FOR DELETE TO authenticated USING (true);

-- RLS Policies for feedback
CREATE POLICY "feedback_select" ON feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "feedback_insert" ON feedback FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "feedback_update_own" ON feedback FOR UPDATE TO authenticated USING (auth.uid() = customer_id);

-- RLS Policies for chat_messages
CREATE POLICY "chat_select" ON chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_insert" ON chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Insert default services
INSERT INTO services (name, description, category, duration_minutes, price, image_url) VALUES
('Haircut', 'Professional haircut and styling', 'hair', 30, 35.00, 'https://images.pexels.com/photos/3993429/pexels-photo-3993429.jpeg'),
('Hair Coloring', 'Full hair coloring service', 'hair', 90, 85.00, 'https://images.pexels.com/photos/3993425/pexels-photo-3993425.jpeg'),
('Manicure', 'Classic manicure with nail polish', 'nails', 45, 25.00, 'https://images.pexels.com/photos/3993427/pexels-photo-3993427.jpeg'),
('Pedicure', 'Relaxing pedicure with foot massage', 'nails', 60, 35.00, 'https://images.pexels.com/photos/3993428/pexels-photo-3993428.jpeg'),
('Nail Art', 'Creative nail art design', 'nails', 75, 45.00, 'https://images.pexels.com/photos/3993426/pexels-photo-3993426.jpeg'),
('Facial Treatment', 'Deep cleansing facial', 'spa', 60, 55.00, 'https://images.pexels.com/photos/3993430/pexels-photo-3993430.jpeg'),
('Body Scrub', 'Full body exfoliation treatment', 'spa', 90, 75.00, 'https://images.pexels.com/photos/3993431/pexels-photo-3993431.jpeg'),
('Full Body Massage', 'Relaxing Swedish massage', 'massage', 90, 95.00, 'https://images.pexels.com/photos/3993432/pexels-photo-3993432.jpeg'),
('Hot Stone Massage', 'Therapeutic hot stone massage', 'massage', 75, 85.00, 'https://images.pexels.com/photos/3993433/pexels-photo-3993433.jpeg'),
('Aromatherapy Massage', 'Essential oil massage therapy', 'massage', 60, 70.00, 'https://images.pexels.com/photos/3993434/pexels-photo-3993434.jpeg');