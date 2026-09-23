const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  // 1. Login as Admin
  await page.goto('http://localhost:8000/login.html');
  await page.type('#email', 'admin@college.edu');
  await page.type('#password', 'test_hash_admin');
  await page.click('button');
  await page.waitForNavigation();
  
  // 2. Check Admin Labs
  await page.goto('http://localhost:8000/admin/labs.html');
  await page.waitForSelector('#labsTableBody tr');
  const labsHTML = await page.$eval('#labsTableBody', el => el.innerHTML);
  console.log('--- ADMIN LABS HTML ---');
  console.log(labsHTML.trim().substring(0, 200) + '...');
  
  // 3. Check Admin Classrooms
  await page.goto('http://localhost:8000/admin/classrooms.html');
  await page.waitForSelector('#classroomsTableBody tr');
  const classroomsHTML = await page.$eval('#classroomsTableBody', el => el.innerHTML);
  console.log('--- ADMIN CLASSROOMS HTML ---');
  console.log(classroomsHTML.trim().substring(0, 200) + '...');
  
  // 4. Logout and Login as Faculty
  await page.goto('http://localhost:8000/login.html');
  // Wait, navigating to login.html while logged in should just show login, but wait, enforceAuth doesn't redirect if logged in.
  // I need to clear localStorage or click logout.
  await page.evaluate(() => localStorage.clear());
  
  await page.goto('http://localhost:8000/login.html');
  await page.type('#email', 'anjali.deshmukh@college.edu');
  await page.type('#password', 'test_hash_faculty_1');
  await page.click('button');
  await page.waitForNavigation();

  // 5. Check Faculty Resources
  await page.goto('http://localhost:8000/faculty/resources.html');
  await page.waitForSelector('#resourceCardsContainer .resource-card');
  const facultyHTML = await page.$eval('#resourceCardsContainer', el => el.innerHTML);
  console.log('--- FACULTY RESOURCES HTML ---');
  console.log(facultyHTML.trim().substring(0, 300) + '...');

  await browser.close();
})();
