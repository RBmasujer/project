# Dear Self - Nails, Salon & Spa Management System

A complete salon and spa management system with booking, payments, and real-time features.

## Features

- **Booking System** - Customers can book appointments with staff
- **Payment Integration** - GCash, GrabPay, Maya, Credit Cards via PayMongo
- **Role-based Access** - Customer, Staff, Receptionist, Admin dashboards
- **Real-time Chat** - Room-based messaging system
- **Redis Caching** - High-performance data caching (optional)
- **Security** - Rate limiting, brute force protection, encryption

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: Supabase (PostgreSQL)
- **Cache**: Redis (optional, falls back to in-memory)
- **Payments**: PayMongo (Philippines)
- **Auth**: JWT + Supabase Auth

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

The `.env` file contains all configuration. Update with your credentials:

```env
# Required
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your-jwt-secret

# Optional - Redis caching
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379

# Optional - PayMongo payments
PAYMONGO_ENABLED=true
PAYMONGO_SECRET_KEY=sk_test_xxx
```

### 3. Start Server

```bash
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/demo` | Demo login (testing) |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/services` | List all services |
| GET | `/api/services/:id` | Get service details |
| POST | `/api/services` | Create service (admin) |

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/appointments` | List appointments |
| POST | `/api/appointments` | Create appointment |
| PUT | `/api/appointments/:id` | Update appointment |
| PUT | `/api/appointments/:id/cancel` | Cancel appointment |

### Payments (PayMongo)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/methods` | Available payment methods |
| POST | `/api/payments/create` | Create payment |
| POST | `/api/payments/webhook` | PayMongo webhook |

### Staff & Feedback & Chat & Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/staff` | List staff members |
| GET | `/api/feedback` | Get reviews |
| POST | `/api/feedback` | Submit review |
| GET | `/api/chat/:room/messages` | Get chat messages |
| POST | `/api/chat/:room/messages` | Send message |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/admin/cache/stats` | Cache statistics |
| DELETE | `/api/admin/cache` | Clear cache |

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dearself.spa | admin123 |
| Staff | staff@dearself.spa | staff123 |
| Customer | customer@dearself.spa | customer123 |

## Configuration Options

### Redis Caching (Optional)

Redis improves performance by caching frequently accessed data.

```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

Without Redis, the system uses in-memory caching automatically.

### PayMongo Payments (Optional)

Enable Philippines payment methods (GCash, GrabPay, Maya, Cards):

```env
PAYMONGO_ENABLED=true
PAYMONGO_PUBLIC_KEY=pk_test_xxx
PAYMONGO_SECRET_KEY=sk_test_xxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxx
```

Get credentials at [paymongo.com](https://paymongo.com)

### HTTPS for Production

```env
HTTPS_ENABLED=true
HTTPS_KEY_PATH=./ssl/server.key
HTTPS_CERT_PATH=./ssl/server.crt
```

## Rate Limits

| Endpoint | Window | Max Requests |
|----------|--------|--------------|
| Login | 15 min | 5 |
| Register | 1 hour | 3 |
| Booking | 1 min | 10 |
| API | 1 min | 100 |
| Chat | 1 min | 50 |

## Security Features

- Rate limiting per IP
- Brute force protection (5 failures = 30 min block)
- Progressive delays (0s → 1s → 2s → 4s → 8s...)
- AES-256-CBC encryption
- JWT authentication
- Security headers (XSS, CSRF, Frame options)

## Project Structure

```
project/
├── Nails, Salon&Spa/
│   ├── api/
│   │   ├── config.js        # Central configuration
│   │   ├── server.js        # Express server
│   │   ├── auth.js          # Authentication logic
│   │   ├── db.js           # Supabase operations
│   │   ├── redis.js        # Cache layer
│   │   ├── paymongo.js     # Payment integration
│   │   └── middleware.js   # Security & validation
│   └── public/
│       ├── html/           # HTML pages
│       ├── css/            # Styles
│       └── js/             # Frontend scripts
├── supabase/migrations/    # Database schema
└── .env                    # Configuration
```

## Deployment

### Railway / Render / Docker

Standard Node.js deployment. Set environment variables in platform dashboard.

```bash
npm install --production
npm start
```

## License

MIT