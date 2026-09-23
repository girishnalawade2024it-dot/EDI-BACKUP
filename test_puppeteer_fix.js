const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('http://localhost:8000/login.html');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Typing credentials...");
  await page.type('#email', 'admin@college.edu');
  await page.type('#password', 'test_hash_admin');
  
  console.log("Evaluating loginUser directly...");
  await page.evaluate(() => loginUser());
  
  await new Promise(r => setTimeout(r, 2000));
  console.log("Current URL after login:", page.url());
  
  await browser.close();
})();
