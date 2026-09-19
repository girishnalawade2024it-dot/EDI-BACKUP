// ============================================================
// Team 3 — Shared Supabase Client (Read-Only)
// Owner: Girish (Team 3)
// ============================================================
// TODO: Replace the two placeholder strings below with your
//       actual Supabase project values.
//       Find them at:
//         Supabase Dashboard → Your Project → Settings → API
//           • Project URL      → SUPABASE_URL
//           • anon public key  → SUPABASE_ANON_KEY
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = 'YOUR_SUPABASE_URL';       // TODO: fill in
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // TODO: fill in

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && !SUPABASE_URL.includes('YOUR_'));
const safeUrl = isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co';
const safeKey = isConfigured ? SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

export const supabase = createClient(safeUrl, safeKey);
