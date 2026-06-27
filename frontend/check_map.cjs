const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Launching browser to check map...');
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900 });

  page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', err => console.log(`BROWSER PAGEERROR: ${err.toString()}`));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  await new Promise(r => setTimeout(r, 2000));

  try {
    // Click Sign In
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const signInBtn = buttons.find(b => b.textContent && b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Type credentials
    await page.type('input[type="email"]', 'admin@sansah.com');
    await page.type('input[type="password"]', 'admin123');
    
    // Click submit
    await page.evaluate(() => {
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });

    await new Promise(r => setTimeout(r, 3000));
  } catch(e) {
    console.error('Login flow failed:', e.message);
  }

  console.log('Clicking GPS History tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const gpsTab = buttons.find(b => b.textContent && b.textContent.includes('GPS History'));
    if (gpsTab) gpsTab.click();
  });

  await new Promise(r => setTimeout(r, 4000));

  const manualInit = await page.evaluate(() => {
    try {
      const container = document.getElementById('map-container');
      if (!container) return { error: 'No map container found!' };
      
      // Attempt manual init
      const testMap = window.L.map(container, { zoomControl: false }).setView([34.0522, -118.2437], 11);
      return {
        success: true,
        innerHTML: container.innerHTML
      };
    } catch(e) {
      return {
        success: false,
        error: e.message,
        stack: e.stack
      };
    }
  });

  console.log('Manual initialization result:', JSON.stringify(manualInit, null, 2));

  await browser.close();
})();
