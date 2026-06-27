const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900 });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.toString());
  });

  console.log('Navigating to http://localhost:3001...');
  await page.goto('http://localhost:3001');

  try {
    // Fill login form
    console.log('Logging in...');
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'admin@sansah.com');
    await page.type('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
  } catch(e) {
    console.log('Already logged in or no login required.');
  }

  console.log('Clicking Map tab...');
  // Find the button that has 'Map' or 'GPS' in it
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const mapTab = buttons.find(b => b.textContent.includes('GPS') || b.textContent.includes('Map'));
    if(mapTab) mapTab.click();
  });

  // Wait for map and markers to render
  console.log('Waiting 5s for map rendering...');
  await new Promise(r => setTimeout(r, 5000));

  console.log('Clicking on the first map marker...');
  await page.evaluate(() => {
    const marker = document.querySelector('.leaflet-marker-icon');
    if (marker) marker.click();
  });
  
  await new Promise(r => setTimeout(r, 1500));

  console.log('Taking screenshot...');
  const outPath = 'C:/Users/jaiso/.gemini/antigravity-ide/brain/25fb5341-ad39-467c-8153-d4fe6e7d3a61/gps_map_live_verification.png';
  await page.screenshot({ path: outPath });

  fs.writeFileSync('C:/Users/jaiso/.gemini/antigravity-ide/brain/25fb5341-ad39-467c-8153-d4fe6e7d3a61/browser_errors.txt', errors.join('\n'));

  console.log('Saved to', outPath);
  await browser.close();
})();
