# FreightLink Africa

**AI-Powered Freight Marketplace for Africa**

FreightLink Africa is an enterprise SaaS platform connecting freight brokers, shippers, transport companies, fleet owners, and drivers across Zimbabwe, South Africa, Botswana, Zambia, and Mozambique.

## Features

### Core Platform
- **Load Marketplace**: Browse and post freight loads for free
- **AI-Parsed WhatsApp Messages**: Automatic parsing using Google Gemini AI
- **Contact Unlocks**: Paid access to broker contact details
- **Multi-Payment Support**: Paynow integration (EcoCash, OneMoney, ZIPIT, Cards)
- **Wallet System**: Pre-paid credits for quick unlocks

### Technical Architecture
- **Backend**: Node.js 20, Express 5, PostgreSQL 15 (raw SQL with pg library)
- **Frontend**: React 18, TypeScript, Vite
- **Caching/Sessions**: Redis
- **Queues**: BullMQ for background jobs
- **AI**: Google Gemini for message parsing and price suggestions

## Quick Start

### Prerequisites
- Node.js 20 LTS
- PostgreSQL 15
- Redis 7
- Docker (optional)

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/your-org/freightlink-africa.git
cd freightlink-africa
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

4. Set up environment variables:
```bash
cp ../.env.example ../.env
# Edit .env with your configuration
```

5. Run database migrations:
```bash
cd ../backend
npm run migrate
```

6. Start development servers:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Docker Deployment

1. Copy production environment file:
```bash
cp .env.production.example .env.production
# Edit .env.production with your values
```

2. Deploy with Docker Compose:
```bash
docker-compose up -d
```

## Project Structure

```
freightlink-africa/
├── backend/
│   ├── config/           # Configuration and environment
│   ├── controllers/      # HTTP request handlers
│   ├── database/
│   │   ├── pool.js       # PostgreSQL connection pool
│   │   ├── migrate.js    # Migration runner
│   │   └── sql/          # SQL migrations
│   ├── middleware/       # Express middleware
│   ├── models/           # Database models (raw SQL)
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Utilities and helpers
│   ├── validators/       # Zod schemas for validation
│   ├── app.js           # Express app setup
│   └── server.js        # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable React components
│   │   ├── contexts/     # React contexts (Auth, etc.)
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   ├── styles/       # CSS modules and global styles
│   │   └── types/        # TypeScript types
│   └── public/           # Static assets
├── docker-compose.yml
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Email/password login
- `GET /api/v1/auth/google` - Google OAuth redirect
- `POST /api/v1/auth/refresh` - Refresh tokens
- `POST /api/v1/auth/logout` - Logout session(s)
- `POST /api/v1/auth/forgot-password` - Request password reset

### Loads
- `GET /api/v1/loads` - Browse public loads
- `GET /api/v1/loads/:id` - Get load details
- `POST /api/v1/loads` - Create new load
- `GET /api/v1/loads/my` - User's own loads
- `POST /api/v1/loads/:id/moderate` - Moderate load (admin)

### Unlock
- `GET /api/v1/unlock/pricing` - Get unlock pricing
- `POST /api/v1/unlock/:loadId` - Unlock contact
- `GET /api/v1/unlock/:loadId/status` - Check unlock status
- `GET /api/v1/unlock/my` - User's unlocks

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | JWT signing secret (32+ chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `GEMINI_API_KEY` | Google Gemini API key |
| `PAYNOW_INTEGRATION_ID` | Paynow integration ID |
| `PAYNOW_INTEGRATION_KEY` | Paynow integration key |

### Optional Environment Variables

| Variable | Default |
|----------|---------|
| `PORT` | `5000` |
| `NODE_ENV` | `development` |
| `FRONTEND_URL` | `http://localhost:5173` |
| `REDIS_HOST` | `localhost` |

## Pricing Model

### Unlock Pricing (Cost Floor Calculation)

The unlock price is calculated based on:
- WhatsApp Business API conversation cost: $0.04
- Gemini parsing cost: $0.001
- Paynow transaction fee: 3.5%
- Infrastructure allocation: $0.10

**Base unlock price: $2.00**

## Security Features

- OWASP Top 10 protection
- Parameterized SQL queries (no ORM)
- Rate limiting per endpoint
- Helmet security headers
- CORS with whitelist
- JWT with refresh token rotation
- Device fingerprinting for anti-leakage
- Audit logging

## License

Proprietary - All rights reserved.

## Support

For support, email support@freightlink.africa
