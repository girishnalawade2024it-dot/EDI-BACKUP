const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const SUPABASE_URL = 'http://127.0.0.1:54421';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
});

async function testAtomicAdminDecision() {
    console.log("--- Testing Atomic Admin Decision ---");
    
    // 1. Get an existing booking to test with or create one
    // We will just find one that is PENDING or set it to PENDING for the test
    const { data: bookingData } = await supabase.from('bookings').select('booking_id').limit(1);
    
    if (!bookingData || bookingData.length === 0) {
        console.log("No bookings found to test with.");
        return;
    }
    
    const testBookingId = bookingData[0].booking_id;
    console.log(`Using Booking ID: ${testBookingId}`);
    
    // Set to PENDING
    await supabase.from('bookings').update({ status: 'PENDING' }).eq('booking_id', testBookingId);
    
    // 2. Simulate two concurrent admin approvals
    console.log("Simulating concurrent admin requests...");
    const admin1 = supabase.rpc('admin_process_request', {
        p_booking_id: testBookingId,
        p_new_status: 'APPROVED',
        p_admin_user_id: 1, // assume admin user 1
        p_reason: 'Admin 1 approved this'
    });
    
    const admin2 = supabase.rpc('admin_process_request', {
        p_booking_id: testBookingId,
        p_new_status: 'DENIED',
        p_admin_user_id: 2, // assume admin user 2
        p_reason: 'Admin 2 rejected this'
    });
    
    // Await both simultaneously
    const results = await Promise.all([admin1, admin2]);
    
    console.log("Result for Admin 1: ", results[0].data);
    console.log("Result for Admin 2: ", results[1].data);
    
    if ((results[0].data && !results[1].data) || (!results[0].data && results[1].data)) {
        console.log("SUCCESS: Only one admin operation succeeded.");
    } else {
        console.log("FAILURE: Both operations succeeded or both failed unexpectedly.");
    }
}

testAtomicAdminDecision();
