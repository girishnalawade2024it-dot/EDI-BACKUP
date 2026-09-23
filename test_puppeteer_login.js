const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:8000/login.html');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Clicking login...");
  await page.click('button');
  
  await new Promise(r => setTimeout(r, 2000));
  console.log("Current URL:", page.url());
  
  await browser.close();
})();
