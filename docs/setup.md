# Setup & Local Development Guide — DeliveryOS

## Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- PostgreSQL database instance (local PostgreSQL or cloud database)

## Quickstart

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your PostgreSQL connection string and environment settings:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/deliveryos?schema=public"
   JWT_SECRET="dev-insecure-jwt-secret-min-32-chars-change-in-prod"
   PORT=4000
   NODE_ENV="development"
   CLIENT_URL="http://localhost:5173"
   ```

3. **Initialize Database**
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Push schema to database
   npm run db:push

   # Seed database with the 7 authoritative development role accounts
   npm run db:seed
   ```

4. **Run Development Servers**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:4000`
   - API Health Check: `http://localhost:4000/health`

5. **Authoritative Development Accounts (Seeded)**:
   - Super Admin: `haider1.euroshub@gmail.com`
   - Admin: `haider2.euroshub@gmail.com`
   - BD: `haider4.euroshub@gmail.com`
   - QA Engineer: `haider5.euroshub@gmail.com`
   - Client User: `haider6.euroshub@gmail.com`
   - Developer: `haider7.euroshub@gmail.com`
   - Project Manager: `haider8.euroshub@gmail.com`

   *(See `.env.example` comments for development seed credentials).*

6. **Running Test Suites**
   ```bash
   # Run all backend unit, security, and access-control tests
   npm test -w backend

   # Run typechecks
   npm run typecheck -w backend
   npm run typecheck -w frontend

   # Run Playwright E2E tests
   npx playwright test
   ```
