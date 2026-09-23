// Shared JS for all pages

const SUPABASE_URL = 'http://127.0.0.1:54421';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function enforceAuth() {
    const path = window.location.pathname;
    
    // Skip enforcement on login page
    if (path.endsWith('login.html') || path.endsWith('/')) {
        return;
    }

    const sessionToken = localStorage.getItem('session_token');
    const loginPath = (path.includes('/admin/') || path.includes('/faculty/') || path.includes('/assistant/')) ? '../login.html' : 'login.html';

    if (!sessionToken) {
        window.location.href = loginPath;
        return;
    }

    // Verify session server-side via RPC
    const { data: user, error } = await supabaseClient
        .rpc('validate_session', { p_token: sessionToken });

    if (error || !user) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_id');
        window.location.href = loginPath;
        return;
    }

    // Role mapping: 1 = Faculty, 2 = Lab Assistant, 3 = Admin
    let requiredRole = null;
    if (path.includes('/faculty/')) requiredRole = 1;
    else if (path.includes('/assistant/')) requiredRole = 2;
    else if (path.includes('/admin/')) requiredRole = 3;

    if (requiredRole && user.role_id !== requiredRole) {
        alert('Unauthorized access. Please login with correct role.');
        window.location.href = loginPath;
    }
}

async function logout() {
    const sessionToken = localStorage.getItem('session_token');
    if (sessionToken) {
        await supabaseClient.rpc('invalidate_session', { p_token: sessionToken });
    }
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_id');
    const path = window.location.pathname;
    const loginPath = (path.includes('/admin/') || path.includes('/faculty/') || path.includes('/assistant/')) ? '../login.html' : 'login.html';
    window.location.href = loginPath;
}

document.addEventListener('DOMContentLoaded', () => {
    enforceAuth();

    const pathName = window.location.pathname;
    
    // Page-specific initializations
    if (pathName.includes('faculty/resources.html')) {
        renderResourceCards('resourceCardsContainer');
    }
    if (pathName.includes('admin/labs.html')) {
        renderResourceTable('labsTableBody', 'Lab');
    }
    if (pathName.includes('admin/classrooms.html')) {
        renderResourceTable('classroomsTableBody', 'Classroom');
    }
    if (pathName.includes('faculty/timeslots.html')) {
        renderTimeSlots('timeSlotsContainer');
    }
    if (pathName.includes('faculty/booking.html')) {
        populateBookingForm();
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            bookingForm.addEventListener('submit', handleBookingSubmit);
        }
    }
    if (pathName.includes('assistant/requests.html')) {
        renderPendingBookings('requestsTableBody');
    }

    // Highlight current page link
    const path = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav a').forEach(link => {
        if(link.getAttribute('href') === path){
            link.classList.add('active');
        }
    });

    // Add logout handler for nav links
    const logoutLinks = document.querySelectorAll('a[href$="login.html"]');
    logoutLinks.forEach(link => {
        if(link.textContent.trim().toLowerCase() === 'logout') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }
    });
});

// --- Phase 2: Resource Browsing Functions ---

async function fetchResources(type = null) {
    let query = supabaseClient.from('resources').select('*').order('room_code', { ascending: true });
    if (type) {
        query = query.eq('resource_type', type);
    }
    const { data: resources, error } = await query;
    if (error) {
        console.error('Error fetching resources:', error);
        return [];
    }
    return resources;
}

function getStatusSpan(status) {
    const s = status.toLowerCase();
    if (s === 'active' || s === 'available') return `<span class="status available">Available</span>`;
    if (s === 'maintenance') return `<span class="status pending">Maintenance</span>`;
    if (s === 'occupied' || s === 'booked') return `<span class="status booked">Occupied</span>`;
    return `<span class="status">${status}</span>`;
}

async function renderResourceCards(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const resources = await fetchResources(); // Show both Labs and Classrooms for Faculty
    container.innerHTML = '';
    
    if (resources.length === 0) {
        container.innerHTML = '<p>No resources available.</p>';
        return;
    }

    const now = new Date().toISOString();
    const { data: activeBookings } = await supabaseClient
        .from('bookings')
        .select('resource_id')
        .in('status', ['APPROVED', 'PENDING'])
        .lte('start_at', now)
        .gt('end_at', now);
        
    const activeResourceIds = new Set((activeBookings || []).map(b => b.resource_id));

    resources.forEach(res => {
        const capacityText = res.capacity ? `Capacity: ${res.capacity} students` : 'Capacity: N/A';
        const notesText = res.notes ? `<p style="font-size: 13px; color: #555; margin-bottom: 8px;">${res.notes}</p>` : '';
        
        const isOccupied = activeResourceIds.has(res.resource_id);
        const displayStatus = isOccupied ? 'Occupied' : res.status;

        const card = document.createElement('div');
        card.className = 'resource-card card';
        card.innerHTML = `
            <h3>${res.room_code} <span style="font-size: 14px; font-weight: normal; color: #666;">(${res.resource_type})</span></h3>
            <p>${capacityText}</p>
            ${notesText}
            <p style="margin-bottom: 12px;">Status: ${getStatusSpan(displayStatus)}</p>
            <a class="btn" href="timeslots.html?resource_id=${res.resource_id}">View Slots</a>
        `;
        container.appendChild(card);
    });
}

async function renderResourceTable(containerId, type) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;
    
    const resources = await fetchResources(type);
    tbody.innerHTML = '';
    
    if (resources.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">No ${type}s found.</td></tr>`;
        return;
    }

    const now = new Date().toISOString();
    const { data: activeBookings } = await supabaseClient
        .from('bookings')
        .select('resource_id')
        .in('status', ['APPROVED', 'PENDING'])
        .lte('start_at', now)
        .gt('end_at', now);
        
    const activeResourceIds = new Set((activeBookings || []).map(b => b.resource_id));

    resources.forEach(res => {
        const isOccupied = activeResourceIds.has(res.resource_id);
        const displayStatus = isOccupied ? 'Occupied' : res.status;

        const capacityText = res.capacity ? res.capacity : 'N/A';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${res.room_code}</td>
            <td>${capacityText}</td>
            <td>${getStatusSpan(displayStatus)}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function renderTimeSlots(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const resourceId = urlParams.get('resource_id');
    
    // Default to today if no date provided
    let date = urlParams.get('date');
    if (!date) {
        const d = new Date();
        date = d.toISOString().split('T')[0];
    }
    
    if (!resourceId) {
        container.innerHTML = '<p>No resource selected.</p>';
        return;
    }
    
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    
    const { data: bookings } = await supabaseClient
        .from('bookings')
        .select('start_at, end_at, status')
        .eq('resource_id', resourceId)
        .in('status', ['APPROVED', 'PENDING'])
        .gte('start_at', startOfDay)
        .lte('start_at', endOfDay);
        
    const standardSlots = [
        { label: "08:00 - 09:00", start: "08:00:00", end: "09:00:00" },
        { label: "09:15 - 10:15", start: "09:15:00", end: "10:15:00" },
        { label: "10:30 - 11:30", start: "10:30:00", end: "11:30:00" },
        { label: "11:45 - 12:45", start: "11:45:00", end: "12:45:00" },
        { label: "13:00 - 14:00", start: "13:00:00", end: "14:00:00" },
        { label: "14:00 - 15:00", start: "14:00:00", end: "15:00:00" }
    ];
    
    container.innerHTML = `<h3 style="margin-bottom:15px;">Slots for ${date}</h3>`;
    
    standardSlots.forEach(slot => {
        const slotStart = new Date(`${date}T${slot.start}`).getTime();
        const slotEnd = new Date(`${date}T${slot.end}`).getTime();
        
        let status = 'Available';
        if (bookings) {
            const overlap = bookings.find(b => {
                const bStart = new Date(b.start_at).getTime();
                const bEnd = new Date(b.end_at).getTime();
                return (bStart < slotEnd && bEnd > slotStart);
            });
            if (overlap) {
                status = overlap.status === 'PENDING' ? 'Pending' : 'Booked';
            }
        }
        
        const div = document.createElement('div');
        div.className = 'slot';
        div.innerHTML = `
            <span>${slot.label}</span>
            <span class="status ${status.toLowerCase()}">${status}</span>
        `;
        container.appendChild(div);
    });
    
    const bookBtn = document.getElementById('bookBtn');
    if (bookBtn) bookBtn.href = `booking.html?resource_id=${resourceId}&date=${date}`;
}

// --- Phase 3: Atomic Booking Core Functions ---

async function populateBookingForm() {
    const select = document.getElementById('resourceSelect');
    if (!select) return;
    
    const resources = await fetchResources();
    select.innerHTML = '<option value="" disabled selected>Select a Resource</option>';
    
    resources.forEach(res => {
        const option = document.createElement('option');
        option.value = res.resource_id;
        option.textContent = `${res.room_code} (${res.resource_type}) - ${res.capacity ? res.capacity + ' caps' : 'N/A'}`;
        select.appendChild(option);
    });

    const urlParams = new URLSearchParams(window.location.search);
    const resourceId = urlParams.get('resource_id');
    const date = urlParams.get('date');
    
    if (resourceId) select.value = resourceId;
    if (date) {
        const dateInput = document.getElementById('bookingDate');
        if (dateInput) dateInput.value = date;
    }
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    
    const resourceId = document.getElementById('resourceSelect').value;
    const bookingDate = document.getElementById('bookingDate').value; // YYYY-MM-DD
    const timeSlot = document.getElementById('timeSlotSelect').value; // "08:00 - 09:00"
    const purpose = document.getElementById('purposeInput').value;
    const headcountVal = document.getElementById('headcountInput').value;
    const headcount = headcountVal ? parseInt(headcountVal) : null;
    const prioritySelect = document.getElementById('prioritySelect');
    const priority = prioritySelect ? parseInt(prioritySelect.value) : 1;
    
    if (!resourceId || !bookingDate || !timeSlot || !purpose) {
        alert("Please fill all required fields.");
        return;
    }
    
    // Parse timeSlot "HH:MM - HH:MM" to UTC format strings. We use local time concept by assuming the DB stores the timestamp without timezone or local offset, but appending Z makes it UTC. For simplicity, we just use the ISO string without Z to let Postgres interpret it as local/timestamp without timezone.
    const [startStr, endStr] = timeSlot.split(' - ');
    const startAt = `${bookingDate}T${startStr}:00`; 
    const endAt = `${bookingDate}T${endStr}:00`;
    
    // Check if resource requires approval (Phase 5)
    let status = 'PENDING';
    const { data: resData } = await supabaseClient
        .from('resources')
        .select('requires_approval')
        .eq('resource_id', resourceId)
        .single();
    
    if (resData && resData.requires_approval === false) {
        status = 'APPROVED';
    }

    // Rely purely on the database's EXCLUDE constraint to prevent overlapping bookings.
    // This is a single, atomic operation that removes the client-side race condition.
    const userId = localStorage.getItem('user_id');
    const { error: insertErr } = await supabaseClient
        .from('bookings')
        .insert([{
            resource_id: resourceId,
            requested_by: userId,
            booking_type: 'Academic Session',
            start_at: startAt,
            end_at: endAt,
            purpose: purpose,
            headcount: headcount,
            priority: priority,
            status: status
        }]);
        
    if (insertErr) {
        console.error("Error inserting booking:", insertErr);
        // Postgres error code 23P01 is exclusion_violation
        if (insertErr.code === '23P01' || (insertErr.message && insertErr.message.includes('overlapping_bookings'))) {
            alert("Conflict detected! This resource is already booked or pending during the selected time slot.");
        } else if (insertErr.message && insertErr.message.includes('headcount_exceeds_capacity')) {
            alert("Capacity Error: Your requested headcount exceeds the maximum capacity of this resource.");
        } else if (insertErr.message && insertErr.message.includes('invalid_time_range')) {
            alert("Time Error: The selected end time must be after the start time.");
        } else {
            alert("Failed to submit booking: " + insertErr.message);
        }
        return;
    }
    
    alert("Booking submitted successfully! It is now pending approval.");
    window.location.href = "history.html";
}

// --- Phase 4: Booking Approval Workflow (Assistant/Admin) ---

async function fetchPendingBookings() {
    // We select bookings, and join with resources and users tables.
    // In Supabase, if foreign keys are set up, we can do nested selects.
    const { data: bookings, error } = await supabaseClient
        .from('bookings')
        .select(`
            booking_id,
            start_at,
            end_at,
            status,
            resources(room_code, resource_type),
            users!bookings_requested_by_fkey(name)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching bookings:', error);
        return [];
    }
    return bookings;
}

async function renderPendingBookings(containerId) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;

    const bookings = await fetchPendingBookings();
    tbody.innerHTML = '';

    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No booking requests found.</td></tr>';
        return;
    }

    bookings.forEach(b => {
        const tr = document.createElement('tr');
        
        // Format time properly (basic)
        const start = new Date(b.start_at).toLocaleString();
        const end = new Date(b.end_at).toLocaleString();
        const timeStr = `${start} - ${end}`;
        
        const resourceName = b.resources ? `${b.resources.room_code} (${b.resources.resource_type})` : 'N/A';
        const facultyName = b.users ? b.users.name : 'Unknown';

        let actionHtml = '';
        if (b.status === 'PENDING') {
            actionHtml = `
                <button class="btn" style="background-color: #28a745; padding: 5px 10px; margin-right: 5px; cursor:pointer;" onclick="updateBookingStatus(${b.booking_id}, 'APPROVED')">Approve</button>
                <button class="btn" style="background-color: #dc3545; padding: 5px 10px; cursor:pointer;" onclick="updateBookingStatus(${b.booking_id}, 'DENIED')">Reject</button>
            `;
        } else {
            actionHtml = `<span style="color: #666; font-size: 14px;">Resolved</span>`;
        }

        tr.innerHTML = `
            <td>REQ${b.booking_id}</td>
            <td>${facultyName}</td>
            <td>${resourceName}</td>
            <td>${timeStr}</td>
            <td>${getStatusSpan(b.status)}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Make the function available globally for inline onclick
window.updateBookingStatus = async function(bookingId, newStatus) {
    if (!confirm(`Are you sure you want to mark this booking as ${newStatus}?`)) return;

    const userId = localStorage.getItem('user_id');
    const now = new Date().toISOString();

    const { error } = await supabaseClient
        .from('bookings')
        .update({
            status: newStatus,
            approved_by: userId,
            decided_at: now
        })
        .eq('booking_id', bookingId);

    if (error) {
        console.error("Error updating booking:", error);
        alert("Failed to update booking.");
        return;
    }

    // Refresh the list
    renderPendingBookings('requestsTableBody');
};

// --- Phase 5: Admin Priority Queue for Approvals ---

async function fetchPriorityApprovals() {
    // Calls the RPC we created in Migration 006
    const { data, error } = await supabaseClient.rpc('get_priority_approvals');
    if (error) {
        console.error('Error fetching priority approvals:', error);
        return [];
    }
    return data;
}

async function renderPriorityApprovals(containerId) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;

    const approvals = await fetchPriorityApprovals();
    tbody.innerHTML = '';

    if (!approvals || approvals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No pending approvals in the queue.</td></tr>';
        return;
    }

    approvals.forEach(req => {
        const tr = document.createElement('tr');
        
        const start = new Date(req.start_at).toLocaleString();
        const end = new Date(req.end_at).toLocaleString();
        const timeStr = `${start} - ${end}`;
        
        let priorityLabel = 'Normal';
        let priorityColor = '#666';
        if (req.priority === 3) {
            priorityLabel = 'Critical';
            priorityColor = '#dc3545';
        } else if (req.priority === 2) {
            priorityLabel = 'High';
            priorityColor = '#fd7e14';
        }
        
        const priorityHtml = `<span style="color: ${priorityColor}; font-weight: bold;">${priorityLabel}</span>`;
        const actionHtml = `
            <button class="btn" style="background-color: #28a745; padding: 5px 10px; margin-right: 5px; cursor:pointer;" onclick="adminProcessRequest(${req.booking_id}, 'APPROVED')">Approve</button>
            <button class="btn" style="background-color: #dc3545; padding: 5px 10px; cursor:pointer;" onclick="adminProcessRequest(${req.booking_id}, 'DENIED')">Reject</button>
        `;

        tr.innerHTML = `
            <td>${priorityHtml}</td>
            <td>${req.faculty_name}</td>
            <td>${req.purpose || 'N/A'}</td>
            <td>${req.room_code} (${req.resource_type})</td>
            <td>${timeStr}</td>
            <td>${req.capacity || 'N/A'}</td>
            <td>${req.notes || 'None'}</td>
            <td>${new Date(req.requested_at).toLocaleString()}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.adminProcessRequest = async function(bookingId, newStatus) {
    // Require a reason for the override/decision
    const reason = prompt(`Enter reason for marking as ${newStatus} (Required if overriding priority):`);
    if (reason === null) return; // User cancelled

    const adminId = localStorage.getItem('user_id');
    
    // Call the RPC that enforces atomic conditional update
    const { data: success, error } = await supabaseClient.rpc('admin_process_request', {
        p_booking_id: bookingId,
        p_new_status: newStatus,
        p_admin_user_id: parseInt(adminId),
        p_reason: reason
    });

    if (error) {
        console.error("Error processing request:", error);
        alert("Failed to process request due to a server error.");
        return;
    }

    if (success) {
        alert(`Request successfully marked as ${newStatus}.`);
    } else {
        alert("This request has already been processed by another admin or was cancelled. Refresh to see the current status.");
    }

    // Refresh queue
    renderPriorityApprovals('approvalsTableBody');
};

// Hook rendering on approvals page
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('admin/approvals.html')) {
        renderPriorityApprovals('approvalsTableBody');
    }
});