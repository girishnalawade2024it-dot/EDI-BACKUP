// Shared JS for all pages

document.addEventListener('DOMContentLoaded', () => {
    // Highlight current page link
    const path = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav a').forEach(link => {
        if(link.getAttribute('href') === path){
            link.classList.add('active');
        }
    });

    // Booking form demo
    const bookingForm = document.getElementById('bookingForm');
    if(bookingForm){
        bookingForm.addEventListener('submit', function(e){
            e.preventDefault();
            alert('Booking submitted successfully!');
            window.location.href = 'confirmation.html';
        });
    }
});