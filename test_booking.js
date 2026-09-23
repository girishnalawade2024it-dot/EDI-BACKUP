const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  let alertMessage = '';
  page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      console.log('ALERT TRIGGERED:', alertMessage);
      await dialog.accept();
  });
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // 1. Login as Faculty
  await page.goto('http://localhost:8000/login.html');
  await page.type('#email', 'anjali.deshmukh@college.edu');
  await page.type('#password', 'test_hash_faculty_1');
  await page.click('button');
  await page.waitForNavigation();
  
  // 2. Navigate to Booking Page
  await page.goto('http://localhost:8000/faculty/booking.html');
  await page.waitForSelector('#resourceSelect option:not([disabled])');
  
  // Select first available resource
  const resourceValue = await page.$eval('#resourceSelect option:not([disabled])', el => el.value);
  await page.select('#resourceSelect', resourceValue);
  
  // Fill other fields
  await page.type('#bookingDate', '2026-10-15');
  await page.select('#timeSlotSelect', '10:30 - 11:30');
  await page.type('#purposeInput', 'Test Booking via Puppeteer');
  await page.type('#headcountInput', '40');
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for redirect to history or alert
  await new Promise(r => setTimeout(r, 2000));
  
  const currentUrl = page.url();
  console.log('CURRENT URL AFTER SUBMIT:', currentUrl);
  
  // Check if conflict prevents a second booking
  await page.goto('http://localhost:8000/faculty/booking.html');
  await page.waitForSelector('#resourceSelect option:not([disabled])');
  await page.select('#resourceSelect', resourceValue);
  await page.type('#bookingDate', '2026-10-15');
  await page.select('#timeSlotSelect', '10:30 - 11:30');
  await page.type('#purposeInput', 'Test Overlap');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 2000));
  console.log('SECOND SUBMIT URL:', page.url());

  await browser.close();
})();
