# Setup & Local Development Guide — DeliveryOS

## Prerequisites
- Node.js >= 18.x (tested on v24.21.0)
- npm >= 9.x
- PostgreSQL database instance (local PostgreSQL or Supabase / Neon cloud database)

## Quickstart

1. **Clone and Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your PostgreSQL connection string:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/deliveryos?schema=public"
   ```

3. **Initialize Database**
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Push schema to database
   npm run db:push

   # Seed database with demo agency data
   npm run db:seed
   ```

4. **Run Development Servers**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:4000`
   - API Health Check: `http://localhost:4000/api/health`

5. **Demo Accounts Seeded**:
   - Super Admin: `superadmin@deliveryos.local`
   - Admin: `admin@deliveryos.local`
   - Project Manager: `pm@deliveryos.local`
   - Developer: `dev@deliveryos.local`
   - QA Engineer: `qa@deliveryos.local`
   - Client User: `client@acmecorp.local`
   (Password for seeded test accounts in development: `DeliveryOS@2026`)
