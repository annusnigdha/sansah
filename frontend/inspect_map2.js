import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 900 });

  const logFile = fs.createWriteStream('map_inspection_log2.txt');
  function log(msg) {
    console.log(msg);
    logFile.write(msg + '\n');
  }

  page.on('console', msg => log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`));
  page.on('pageerror', err => log(`BROWSER PAGEERROR: ${err.toString()}`));

  const networkRequests = [];
  page.on('request', req => {
    if (req.url().includes('cartocdn') || req.url().includes('google.com/vt') || req.url().includes('leaflet')) {
      networkRequests.push({ url: req.url(), status: 'pending' });
    }
  });
  page.on('response', res => {
    if (res.url().includes('cartocdn') || res.url().includes('google.com/vt') || res.url().includes('leaflet')) {
      log(`TILE RESPONSE: ${res.url()} -> ${res.status()}`);
    }
  });

  log('Navigating to http://localhost:3001...');
  await page.goto('http://localhost:3001');

  try {
    await page.waitForSelector('input[type="email"]', { timeout: 3000 });
    await page.type('input[type="email"]', 'admin@sansah.com');
    await page.type('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
  } catch(e) {
    log('Already logged in or no login required.');
  }

  log('Clicking Map tab...');
  // Find the exact button for GPS tracking
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    // In App.jsx: onClick={() => setActiveTab('gps')}
    // The text might be just inside the button.
    const mapTab = buttons.find(b => b.textContent && b.textContent.toLowerCase().includes('gps'));
    if(mapTab) {
      mapTab.click();
      console.log("GPS TAB CLICKED");
    } else {
      console.error("COULD NOT FIND GPS TAB");
    }
  });

  log('Waiting 5s for map rendering...');
  await new Promise(r => setTimeout(r, 5000));

  // Inspect Map DOM
  const mapData = await page.evaluate(() => {
    const container = document.getElementById('map-container');
    if (!container) return { error: 'No map container found!' };
    const rect = container.getBoundingClientRect();
    
    const mapPanes = document.querySelector('.leaflet-pane.leaflet-map-pane');
    let hasTransform = false;
    if (mapPanes) {
      hasTransform = mapPanes.style.transform;
    }
    
    const tileImages = document.querySelectorAll('.leaflet-tile');
    const markers = document.querySelectorAll('.leaflet-marker-icon');
    
    return {
      rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      numTiles: tileImages.length,
      numMarkers: markers.length,
      hasTransform,
      containerClasses: container.className,
      computedZIndex: window.getComputedStyle(container).zIndex,
    };
  });

  log(`MAP DOM INSPECTION: ${JSON.stringify(mapData, null, 2)}`);

  const outPath = 'C:/Users/jaiso/.gemini/antigravity-ide/brain/25fb5341-ad39-467c-8153-d4fe6e7d3a61/map_inspection_screenshot2.png';
  await page.screenshot({ path: outPath });
  log('Screenshot saved to ' + outPath);

  await browser.close();
})();
