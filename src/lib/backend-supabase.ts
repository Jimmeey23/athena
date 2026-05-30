import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://nujgmxqefoumhhreqzxm.supabase.co';
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51amdteHFlZm91bWhocmVxenhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDE5ODQsImV4cCI6MjA5MDYxNzk4NH0.XU1x6IKwqkkHvyA6pJV8UOhBMojNQ_E5DBxrtseqoJ0';

const backendSupabaseUrl = import.meta.env.VITE_TICKETING_SUPABASE_URL || fallbackUrl;
const backendSupabaseAnonKey = import.meta.env.VITE_TICKETING_SUPABASE_ANON_KEY || fallbackAnonKey;
const ticketingFunctionsSupabaseUrl =
  import.meta.env.VITE_TICKET_AI_SUPABASE_URL ||
  import.meta.env.VITE_TICKETING_FUNCTIONS_SUPABASE_URL ||
  backendSupabaseUrl;
const ticketingFunctionsSupabaseAnonKey =
  import.meta.env.VITE_TICKET_AI_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_TICKETING_FUNCTIONS_SUPABASE_ANON_KEY ||
  backendSupabaseAnonKey;

export const backendSupabase = createClient(backendSupabaseUrl, backendSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'p57-ticketing-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const ticketingFunctionsSupabase = createClient(
  ticketingFunctionsSupabaseUrl,
  ticketingFunctionsSupabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
