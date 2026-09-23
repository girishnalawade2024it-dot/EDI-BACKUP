const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const SUPABASE_URL = 'http://127.0.0.1:54421';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

async function test() {
    const { data: users, error: err1 } = await supabase.from('users').select('*');
    if (err1) {
        console.error("Error fetching users:", err1);
    } else {
        console.log("Users:", users.map(u => ({ email: u.email, pass: u.password_hash })));
    }

    const { data, error } = await supabase.rpc('authenticate_user', {
        p_email: 'admin@college.edu',
        p_password: 'test_hash_admin'
    });
    console.log("RPC Data:", data);
    console.log("RPC Error:", error);
}
test();
