const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Launching browser to check map...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900 });

  page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', err => console.log(`BROWSER PAGEERROR: ${err.toString()}`));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  await new Promise(r => setTimeout(r, 2000));

  try {
    // Click Sign In on landing page header
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

  const mapDetails = await page.evaluate(() => {
    const container = document.getElementById('map-container');
    if (!container) return { error: 'No map container found!' };
    
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    
    const leafletMap = document.querySelector('.leaflet-container');
    const tiles = Array.from(document.querySelectorAll('.leaflet-tile')).map(t => ({
      src: t.src,
      style: t.getAttribute('style'),
      complete: t.complete,
      naturalWidth: t.naturalWidth
    }));
    
    const markers = Array.from(document.querySelectorAll('.leaflet-marker-icon')).map(m => m.outerHTML);
    const popups = Array.from(document.querySelectorAll('.leaflet-popup')).map(p => p.outerHTML);
    
    return {
      id: container.id,
      className: container.className,
      rect: { width: rect.width, height: rect.height },
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
      leafletContainerFound: !!leafletMap,
      numTiles: tiles.length,
      tilesDetails: tiles,
      numMarkers: markers.length,
      markers,
      popups
    };
  });

  console.log('Map details:', JSON.stringify(mapDetails, null, 2));

  await browser.close();
})();
