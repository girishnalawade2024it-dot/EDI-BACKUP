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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
