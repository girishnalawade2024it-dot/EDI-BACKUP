const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:8000/login.html');
  
  await page.type('#email', 'admin@college.edu');
  await page.type('#password', 'test_hash_admin');
  
  await page.click('button');
  
  await page.waitForNavigation({ timeout: 5000 }).catch(e => console.log('No navigation happened'));
  console.log('Current URL:', page.url());
  
  await browser.close();
})();
