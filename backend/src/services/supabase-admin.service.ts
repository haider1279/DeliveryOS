import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return null;
  }
  if (!adminClient) {
    adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

export function resetSupabaseAdminClient(): void {
  adminClient = null;
}
