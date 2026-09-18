# Production Deployment Guide — DeliveryOS

## Free-Tier Target Architecture
DeliveryOS is optimized to run on reliable, free-tier cloud platforms:
- **Database & Auth & Storage**: Supabase (Free tier provides 500MB PostgreSQL, 50,000 monthly active users Auth, and 1GB Storage).
- **Backend API**: Render.com, Railway, or Fly.io (Node.js runtime container).
- **Frontend SPA**: Vercel, Cloudflare Pages, or Netlify (Global CDN edge network).

## Step-by-Step Deployment

### 1. Database & Supabase Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. Note your database URI, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET`.
3. In Supabase Storage, create a bucket named `deliveryos-files` marked **Private**.
4. Run migrations against your Supabase database:
   ```bash
   DATABASE_URL="your-supabase-db-url" npm run db:push
   ```

### 2. Backend Deployment (e.g. Render / Railway)
1. Link your Git repository.
2. Build command: `npm install && npm run build -w shared && npm run build -w backend`
3. Start command: `node backend/dist/server.js`
4. Set Environment Variables:
   - `DATABASE_URL`
   - `PORT=4000`
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://your-deliveryos-app.vercel.app`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `SUPABASE_STORAGE_BUCKET=deliveryos-files`

### 3. Frontend Deployment (e.g. Vercel)
1. Link your Git repository.
2. Root directory: `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set Environment Variables:
   - `VITE_API_BASE_URL=https://your-api.onrender.com/api`
   - `VITE_SUPABASE_URL=https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key`
