/**
 * IoT Alert Notification System - Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global App State
  let devicesList = [];
  let alertLog = [];
  let geofencesList = [];
  let currentActivePage = 'page-dashboard';
  let mapInstance = null;
  let mapMarkers = {};
  let mapGeofences = {};
  let mapTrails = {};
  let selectedMapDeviceId = null;
  
  // Chart Instances
  let dashboardChart = null;
  let sensorDetailChart = null;
  let selectedSensorId = null;

  // Cache DOM Elements
  const navLinks = document.querySelectorAll('.nav-link');
  const pages = document.querySelectorAll('.page-content');
  const pageTitleDisplay = document.getElementById('page-title-display');
  const simToggle = document.getElementById('simulator-toggle');
  const systemStatusDot = document.getElementById('system-status-dot');
  const systemStatusText = document.getElementById('system-status-text');
  
  // Dashboard Widget Elements
  const widgetTotalDevices = document.getElementById('widget-total-devices');
  const widgetActiveSensors = document.getElementById('widget-active-sensors');
  const widgetGpsDevices = document.getElementById('widget-gps-devices');
  const widgetActiveAlerts = document.getElementById('widget-active-alerts');
  const widgetCriticalAlertsLabel = document.getElementById('widget-critical-alerts-label');
  const widgetTotalAlertsCount = document.getElementById('widget-total-alerts-count');
  const widgetGeofenceEvents = document.getElementById('widget-geofence-events');
  const widgetHealthScore = document.getElementById('widget-health-score');
  const widgetAvgBattery = document.getElementById('widget-avg-battery');
  const uptimeDisplay = document.getElementById('uptime-display');
  const healthDisplay = document.getElementById('health-display');
  const dashboardChartSelect = document.getElementById('dashboard-chart-sensor-select');
  const dashboardActivityFeed = document.getElementById('dashboard-activity-feed');
  const clearActivityBtn = document.getElementById('clear-activity-btn');
  
  // Sensor Board Elements
  const sensorsGridContainer = document.getElementById('sensors-grid-container');
  const filterSearch = document.getElementById('filter-search');
  const filterType = document.getElementById('filter-type');
  const filterStatus = document.getElementById('filter-status');
  const filterAlert = document.getElementById('filter-alert');
  const btnResetFilters = document.getElementById('btn-reset-filters');
  const sidebarActiveSensorsBadge = document.getElementById('sidebar-active-sensors-badge');

  // GPS Map Elements
  const gpsDeviceListContainer = document.getElementById('gps-device-list-container');
  const gpsGeofenceList = document.getElementById('gps-geofence-list');
  const btnAddGeofence = document.getElementById('btn-add-geofence');

  // Device Manager Elements
  const deviceTableBody = document.getElementById('device-table-body');
  const btnRegisterDevice = document.getElementById('btn-register-device');

  // Alert Log Elements
  const fullAlertLog = document.getElementById('full-alert-log');
  const alertLogFilter = document.getElementById('alert-log-filter');
  const clearAlertsBtn = document.getElementById('clear-alerts-btn');
  const sidebarAlertBadge = document.getElementById('sidebar-alert-badge');

  // Modal overlays
  const modalSensorDetails = document.getElementById('modal-sensor-details');
  const modalRegisterDevice = document.getElementById('modal-register-device');
  const modalAddGeofence = document.getElementById('modal-add-geofence');

  // ----------------------------------------------------
  // ROUTING & VIEW CONTROLS
  // ----------------------------------------------------
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPageId = link.getAttribute('data-target');
      switchPage(targetPageId);
      
      // Update sidebar visual active state
      navLinks.forEach(nl => nl.classList.remove('active'));
      link.classList.add('active');
    });
  });

  function switchPage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
      currentActivePage = pageId;
      
      // Set Header Title
      const titles = {
        'page-dashboard': 'Dashboard Overview',
        'page-sensors': 'Sensor Telemetry Board',
        'page-gps': 'Live GPS Tracking Map',
        'page-devices': 'Device Hardware Manager',
        'page-alerts': 'Alert & Event Logs',
        'page-rules': 'Notification Rules Matrix'
      };
      pageTitleDisplay.textContent = titles[pageId] || 'IoT Monitor';

      // Special Initialization Hooks
      if (pageId === 'page-gps') {
        setTimeout(initLeafletMap, 100);
      } else if (pageId === 'page-rules') {
        renderRulesPage();
      }
    }
  }

  // ----------------------------------------------------
  // SIMULATOR INTERFACE & BINDINGS
  // ----------------------------------------------------
  simToggle.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    window.simulator.toggleSimulation(isChecked);
    
    if (isChecked) {
      systemStatusDot.classList.add('simulating');
      systemStatusText.textContent = 'Simulator Active';
    } else {
      systemStatusDot.classList.remove('simulating');
      systemStatusText.textContent = 'Telemetry Paused';
    }
  });

  // Uptime formatting utility
  function formatUptime(seconds) {
    const hrs = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  // Handle incoming simulation ticks
  window.simulator.setUpdateListener((payload) => {
    devicesList = payload.devices;
    alertLog = payload.alerts;
    
    // Update basic stats
    uptimeDisplay.textContent = formatUptime(payload.uptime);
    healthDisplay.textContent = `${payload.health}%`;
    widgetHealthScore.textContent = `${payload.health}%`;
    
    // Colorize health displays
    if (payload.health > 80) {
      widgetHealthScore.style.color = 'var(--color-success)';
      healthDisplay.style.color = 'var(--text-main)';
    } else if (payload.health > 50) {
      widgetHealthScore.style.color = 'var(--color-warning)';
      healthDisplay.style.color = 'var(--color-warning)';
    } else {
      widgetHealthScore.style.color = 'var(--color-danger)';
      healthDisplay.style.color = 'var(--color-danger)';
    }

    // Refresh current UI view based on active page
    updateGlobalWidgets();
    if (typeof updateRuleDevicesSelect === 'function') {
      updateRuleDevicesSelect();
    }
    refreshActiveView();
  });

  // Set hook for critical alert triggers
  window.simulator.setAlertListener((newAlert) => {
    // Generate popup toast notification
    createToastNotification(newAlert);
    // Auto-update stats and sidebar alerts
    updateAlertSidebarBadge();
  });

  // Set hook for general system log entries
  window.simulator.setActivityListener((activity) => {
    addActivityToFeed(activity);
  });

  // ----------------------------------------------------
  // GLOBAL WIDGETS RENDERING
  // ----------------------------------------------------
  function updateGlobalWidgets() {
    // Total Devices count
    widgetTotalDevices.textContent = devicesList.length;

    // Total online sensors count
    let totalSensors = 0;
    let activeSensors = 0;
    let totalBattery = 0;
    let batteryCount = 0;

    devicesList.forEach(dev => {
      if (dev.connected) {
        activeSensors += dev.sensors.length;
      }
      totalSensors += dev.sensors.length;
      
      // Arduino sumppump doesn't report battery
      if (dev.id !== 'ARD_05') {
        totalBattery += dev.battery;
        batteryCount++;
      }
    });

    widgetActiveSensors.textContent = `${activeSensors}/${totalSensors}`;
    if (activeSensors > 0) {
      sidebarActiveSensorsBadge.textContent = activeSensors;
      sidebarActiveSensorsBadge.style.display = 'inline-block';
    } else {
      sidebarActiveSensorsBadge.style.display = 'none';
    }

    // GPS tracked devices
    const gpsDevices = devicesList.filter(d => d.gpsEnabled && d.connected);
    widgetGpsDevices.textContent = gpsDevices.length;

    // Battery average
    if (batteryCount > 0) {
      const avgBattery = Math.round(totalBattery / batteryCount);
      widgetAvgBattery.textContent = `${avgBattery}%`;
      if (avgBattery < 30) {
        widgetAvgBattery.style.color = 'var(--color-danger)';
      } else if (avgBattery < 60) {
        widgetAvgBattery.style.color = 'var(--color-warning)';
      } else {
        widgetAvgBattery.style.color = 'var(--color-success)';
      }
    }

    // Alerts count
    const activeAlerts = alertLog.filter(a => a.status === 'active');
    const criticalCount = activeAlerts.filter(a => a.level === 'critical').length;
    const warningCount = activeAlerts.filter(a => a.level === 'warning').length;
    
    widgetActiveAlerts.textContent = activeAlerts.length;
    widgetCriticalAlertsLabel.textContent = `${criticalCount} Critical | ${warningCount} Warnings`;

    const alertCard = document.getElementById('widget-alert-card');
    if (activeAlerts.length > 0) {
      alertCard.classList.remove('card-primary');
      alertCard.classList.add('card-danger');
      alertCard.style.boxShadow = 'var(--shadow-neon-danger)';
    } else {
      alertCard.classList.remove('card-danger');
      alertCard.classList.add('card-primary');
      alertCard.style.boxShadow = 'none';
    }

    // Geofence count & Uptime count
    const geofenceAlerts = alertLog.filter(a => a.sourceType === 'geofence');
    widgetGeofenceEvents.textContent = geofenceAlerts.length;
    widgetTotalAlertsCount.textContent = alertLog.length;

    updateAlertSidebarBadge();
  }

  function updateAlertSidebarBadge() {
    const activeAlertsCount = alertLog.filter(a => a.status === 'active').length;
    if (activeAlertsCount > 0) {
      sidebarAlertBadge.textContent = activeAlertsCount;
      sidebarAlertBadge.style.display = 'inline-block';
    } else {
      sidebarAlertBadge.style.display = 'none';
    }
  }

  // Toast notifications creator
  function createToastNotification(alert) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Play warning sound
    playAlertSound(alert.level);

    const toast = document.createElement('div');
    toast.className = `toast-item ${alert.level}`;
    
    const iconMap = {
      critical: 'shield-alert',
      warning: 'alert-triangle',
      geofence: 'navigation',
      success: 'check-circle'
    };
    
    const iconName = iconMap[alert.level] || 'bell';
    
    toast.innerHTML = `
      <button class="toast-close">&times;</button>
      <div class="toast-icon ${alert.level}">
        <i data-lucide="${iconName}" style="width:16px;"></i>
      </div>
      <div class="toast-body">
        <div class="toast-title">${alert.level.toUpperCase()} ALERT</div>
        <div class="toast-message">${alert.message}</div>
        <div class="toast-actions">
          <button class="custom-btn toast-btn ack-btn" style="padding: 2px 6px; font-size: 0.65rem;">Acknowledge</button>
        </div>
      </div>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();

    // Bind acknowledge action
    toast.querySelector('.ack-btn').addEventListener('click', () => {
      const targetAlert = alertLog.find(a => a.id === alert.id);
      if (targetAlert) {
        targetAlert.status = 'resolved';
        targetAlert.resolvedTime = Date.now();
        window.simulator.logActivity(
          'sensor',
          'Alert Acknowledged',
          `Alert for ${alert.deviceName} resolved by operator.`,
          'success'
        );
      }
      dismissToast(toast);
    });

    // Bind close action
    toast.querySelector('.toast-close').addEventListener('click', () => {
      dismissToast(toast);
    });

    // Auto dismiss after 7 seconds
    setTimeout(() => {
      dismissToast(toast);
    }, 7000);
    
    // Check notification dispatch rules
    checkNotificationRules(alert);
  }

  function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('dismissed');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // Add system activities into dashboard feed
  function addActivityToFeed(activity) {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-icon-container ${activity.alertLevel}">
        <i data-lucide="${getActivityIcon(activity.type)}"></i>
      </div>
      <div class="activity-details">
        <p class="activity-text"><strong>${activity.title}:</strong> ${activity.message}</p>
        <span class="activity-time">${new Date(activity.timestamp).toLocaleTimeString()}</span>
      </div>
    `;
    
    dashboardActivityFeed.prepend(item);
    lucide.createIcons();

    // Keep dashboard feed small
    while (dashboardActivityFeed.children.length > 15) {
      dashboardActivityFeed.removeChild(dashboardActivityFeed.lastChild);
    }
  }

  function getActivityIcon(type) {
    switch (type) {
      case 'system': return 'cpu';
      case 'sensor': return 'activity';
      case 'geofence': return 'shield-alert';
      default: return 'radio';
    }
  }

  clearActivityBtn.addEventListener('click', () => {
    dashboardActivityFeed.innerHTML = `
      <div class="activity-item">
        <div class="activity-icon-container info">
          <i data-lucide="info" style="width:16px;"></i>
        </div>
        <div class="activity-details">
          <p class="activity-text">Logs cleared by user.</p>
          <span class="activity-time">${new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    `;
    lucide.createIcons();
  });

  // ----------------------------------------------------
  // SWITCHED VIEW REFRESH LOGIC
  // ----------------------------------------------------
  function refreshActiveView() {
    switch (currentActivePage) {
      case 'page-dashboard':
        updateDashboardChart();
        break;
      case 'page-sensors':
        renderSensorBoard();
        break;
      case 'page-gps':
        updateLeafletGPSMap();
        break;
      case 'page-devices':
        renderDeviceManager();
        break;
      case 'page-alerts':
        renderFullAlertLog();
        break;
    }

    // If sensor modal is open, refresh its graphs / values
    if (modalSensorDetails.classList.contains('active') && selectedSensorId) {
      refreshSensorModalContent(selectedSensorId);
    }
  }

  // ----------------------------------------------------
  // VIEW 1: DASHBOARD LINE CHART
  // ----------------------------------------------------
  function initDashboardChart() {
    const ctx = document.getElementById('dashboardTrendChart').getContext('2d');
    
    // Set custom neon gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

    dashboardChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({length: 15}, (_, i) => `-${(15 - i) * 2}s`),
        datasets: [{
          label: 'System Temperature Avg (°C)',
          data: Array.from({length: 15}, () => 20),
          borderColor: '#00f2fe',
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#00f2fe',
          pointBorderColor: '#fff',
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'var(--text-muted)', font: { family: 'JetBrains Mono' } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'var(--text-muted)', font: { family: 'JetBrains Mono' } }
          }
        }
      }
    });
  }

  function updateDashboardChart() {
    if (!dashboardChart) {
      initDashboardChart();
    }

    const mode = dashboardChartSelect.value;
    let chartData = [];
    let label = '';
    let color = '#00f2fe';

    // Compute metrics
    if (mode === 'all' || mode === 'temperature') {
      label = 'Avg Temperature (°C)';
      color = '#00f2fe';
      // Sum up temperatures across all devices
      const histories = [];
      devicesList.forEach(dev => {
        if (!dev.connected) return;
        dev.sensors.forEach(sens => {
          if (sens.type.includes('Temperature')) {
            histories.push(sens.history);
          }
        });
      });

      if (histories.length > 0) {
        chartData = histories[0].map((_, idx) => {
          const sum = histories.reduce((acc, h) => acc + h[idx], 0);
          return parseFloat((sum / histories.length).toFixed(2));
        });
      }
    } else if (mode === 'humidity') {
      label = 'Avg Humidity (%)';
      color = '#7f00ff';
      const histories = [];
      devicesList.forEach(dev => {
        if (!dev.connected) return;
        dev.sensors.forEach(sens => {
          if (sens.type.includes('Humidity')) {
            histories.push(sens.history);
          }
        });
      });

      if (histories.length > 0) {
        chartData = histories[0].map((_, idx) => {
          const sum = histories.reduce((acc, h) => acc + h[idx], 0);
          return parseFloat((sum / histories.length).toFixed(2));
        });
      }
    } else if (mode === 'water_level') {
      label = 'Max Water Depth (mm)';
      color = '#00b0ff';
      const histories = [];
      devicesList.forEach(dev => {
        if (!dev.connected) return;
        dev.sensors.forEach(sens => {
          if (sens.type.includes('Water')) {
            histories.push(sens.history);
          }
        });
      });

      if (histories.length > 0) {
        chartData = histories[0].map((_, idx) => {
          return Math.max(...histories.map(h => h[idx]));
        });
      }
    }

    if (chartData.length > 0) {
      dashboardChart.data.datasets[0].data = chartData;
      dashboardChart.data.datasets[0].label = label;
      dashboardChart.data.datasets[0].borderColor = color;
      dashboardChart.data.datasets[0].pointBackgroundColor = color;
      
      const ctx = document.getElementById('dashboardTrendChart').getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 300);
      gradient.addColorStop(0, hexToRgbA(color, 0.4));
      gradient.addColorStop(1, hexToRgbA(color, 0.0));
      dashboardChart.data.datasets[0].backgroundColor = gradient;
      
      dashboardChart.update('none'); // Update without full layout recalculations for speed
    }
  }

  function hexToRgbA(hex, alpha) {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x' + c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return 'rgba(0,0,0,0.5)';
  }

  dashboardChartSelect.addEventListener('change', updateDashboardChart);

  // ----------------------------------------------------
  // VIEW 2: SENSOR Telemetry BOARD & FILTERS
  // ----------------------------------------------------
  function renderSensorBoard() {
    const query = filterSearch.value.toLowerCase();
    const typeFilter = filterType.value;
    const statusFilter = filterStatus.value;
    const alertFilter = filterAlert.value;

    sensorsGridContainer.innerHTML = '';

    devicesList.forEach(dev => {
      // Status filter check
      const isOnline = dev.connected;
      if (statusFilter === 'online' && !isOnline) return;
      if (statusFilter === 'offline' && isOnline) return;

      dev.sensors.forEach(sens => {
        // Search filter check (matches sensor name, device name, or device ID)
        const matchesQuery = sens.name.toLowerCase().includes(query) ||
                             dev.name.toLowerCase().includes(query) ||
                             dev.id.toLowerCase().includes(query);
        if (!matchesQuery) return;

        // Type filter check
        if (typeFilter !== 'all' && sens.type !== typeFilter) return;

        // Alert Level filter check
        const activeAlert = alertLog.find(a => a.id === `alert_${sens.id}` && a.status === 'active');
        const alertLevel = activeAlert ? activeAlert.level : 'normal';
        if (alertFilter !== 'all' && alertFilter !== alertLevel) return;

        // Create Sensor Card HTML
        const card = document.createElement('div');
        card.className = `glass-card sensor-card ${alertLevel === 'critical' ? 'card-danger' : alertLevel === 'warning' ? 'card-warning' : ''}`;
        
        let batteryColorClass = 'full';
        if (dev.battery < 20) batteryColorClass = 'low';
        else if (dev.battery < 60) batteryColorClass = 'mid';

        let readingColor = 'var(--text-main)';
        if (alertLevel === 'critical') readingColor = 'var(--color-danger)';
        else if (alertLevel === 'warning') readingColor = 'var(--color-warning)';

        let displayValue = sens.value;
        if (sens.type === 'Motion Sensor') {
          displayValue = sens.value === 1 ? 'MOTION' : 'IDLE';
          readingColor = sens.value === 1 ? 'var(--color-primary)' : 'var(--text-muted)';
        }

        card.innerHTML = `
          <div class="sensor-card-header">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <span class="sensor-id-tag">${sens.id}</span>
              <span style="font-size:0.85rem; font-weight:600; color:#fff;">${sens.name}</span>
            </div>
            <span class="device-model-badge">${dev.type}</span>
          </div>
          
          <div class="sensor-metric-display">
            <span class="sensor-metric-val" style="color: ${readingColor};">${displayValue}</span>
            <span class="sensor-metric-unit">${sens.unit === 'status' ? '' : sens.unit}</span>
          </div>
          
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px;">
            <i data-lucide="map-pin" style="width:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>
            <span>${dev.location}</span>
          </div>
          
          <div class="sensor-footer-meta">
            <div class="sensor-battery ${batteryColorClass}">
              <i data-lucide="${dev.battery < 10 ? 'battery-warning' : dev.battery < 30 ? 'battery-low' : dev.battery < 70 ? 'battery-medium' : 'battery'}"></i>
              <span>${dev.id === 'ARD_05' ? 'AC' : dev.battery + '%'}</span>
            </div>
            
            <div class="sensor-status-indicator ${isOnline ? 'online' : 'offline'}">
              <span class="status-dot" style="background-color:${isOnline ? 'var(--color-success)' : 'var(--text-dark)'}; box-shadow:none; width:6px; height:6px;"></span>
              <span>${isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        `;

        card.addEventListener('click', () => {
          openSensorDetailsModal(sens.id);
        });

        sensorsGridContainer.appendChild(card);
      });
    });

    lucide.createIcons();

    if (sensorsGridContainer.children.length === 0) {
      sensorsGridContainer.innerHTML = `
        <div class="glass-card" style="grid-column: 1/-1; text-align:center; padding:48px; color:var(--text-muted);">
          <i data-lucide="search-code" style="width:40px; height:40px; margin-bottom:12px; color:var(--text-dark);"></i>
          <p>No active sensors matched your filter criteria.</p>
        </div>
      `;
      lucide.createIcons();
    }
  }

  // Filter input listeners
  filterSearch.addEventListener('input', renderSensorBoard);
  filterType.addEventListener('change', renderSensorBoard);
  filterStatus.addEventListener('change', renderSensorBoard);
  filterAlert.addEventListener('change', renderSensorBoard);
  
  btnResetFilters.addEventListener('click', () => {
    filterSearch.value = '';
    filterType.value = 'all';
    filterStatus.value = 'all';
    filterAlert.value = 'all';
    renderSensorBoard();
  });

  // ----------------------------------------------------
  // VIEW 3: GPS LEAFLET MAP & GEOFENCING
  // ----------------------------------------------------
  function initLeafletMap() {
    if (mapInstance) return; // Map already initialized

    // Center map around Downtown LA
    mapInstance = L.map('leaflet-gps-map').setView([34.0522, -118.2437], 11);

    // Dark theme tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(mapInstance);

    // Map click utility: fill geofence form coordinates dynamically!
    mapInstance.on('click', (e) => {
      const lat = e.latlng.lat.toFixed(6);
      const lng = e.latlng.lng.toFixed(6);
      
      // If modal is active, prefill the lat/lng coords
      if (modalAddGeofence.classList.contains('active')) {
        document.getElementById('fence-lat').value = lat;
        document.getElementById('fence-lng').value = lng;
      }
    });

    // Populate initial geofences
    geofencesList = window.simulator.geofences;
    renderGeofencesOnMap();
  }

  function renderGeofencesOnMap() {
    if (!mapInstance) return;

    // Clear existing map geofences
    for (let fid in mapGeofences) {
      mapInstance.removeLayer(mapGeofences[fid]);
    }
    mapGeofences = {};

    geofencesList.forEach(fence => {
      // Circular geofence boundary
      const circle = L.circle([fence.lat, fence.lng], {
        color: fence.color,
        fillColor: fence.color,
        fillOpacity: 0.1,
        radius: fence.radius,
        weight: 1.5,
        dashArray: '5, 5'
      }).addTo(mapInstance);
      
      // Bind popup
      circle.bindPopup(`<strong>Geofence:</strong> ${fence.name}<br>Radius: ${fence.radius}m`);
      
      mapGeofences[fence.id] = circle;
    });
  }

  function updateLeafletGPSMap() {
    if (!mapInstance) return;

    const gpsDevices = devicesList.filter(d => d.gpsEnabled);

    gpsDevices.forEach(device => {
      const gps = device.gpsData;
      if (!gps) return;

      const isOnline = device.connected;
      const isActive = device.id === selectedMapDeviceId;

      // 1. Render/Update Map Markers
      if (!mapMarkers[device.id]) {
        // Create new marker with pulsing div icon
        const markerIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="custom-map-marker ${isActive ? 'active' : ''} ${isOnline ? 'online' : 'offline'}" 
                 style="background-color: ${isOnline ? '#00f2fe' : '#4e5d78'};" 
                 id="marker-circle-${device.id}">
              <div class="marker-pulse" style="border-color:${isOnline ? '#00f2fe' : '#4e5d78'}"></div>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-navigation" style="transform: rotate(45deg);"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });

        const marker = L.marker([gps.lat, gps.lng], { icon: markerIcon }).addTo(mapInstance);
        
        // Marker click updates selected sidebar device details
        marker.on('click', () => {
          selectGPSDevice(device.id);
        });

        mapMarkers[device.id] = marker;
      } else {
        // Update marker position
        mapMarkers[device.id].setLatLng([gps.lat, gps.lng]);
        
        // Update rotation or styling if selection changes
        const markerEl = document.getElementById(`marker-circle-${device.id}`);
        if (markerEl) {
          if (isActive) {
            markerEl.classList.add('active');
          } else {
            markerEl.classList.remove('active');
          }
          if (isOnline) {
            markerEl.classList.remove('offline');
            markerEl.classList.add('online');
            markerEl.style.backgroundColor = '#00f2fe';
          } else {
            markerEl.classList.remove('online');
            markerEl.classList.add('offline');
            markerEl.style.backgroundColor = '#4e5d78';
          }
        }
      }

      // Update popup information
      const activeAlerts = alertLog.filter(a => a.deviceId === device.id && a.status === 'active');
      const alertBadge = activeAlerts.length > 0 
        ? `<span class="alert-pill critical" style="padding:2px 6px; font-size:0.65rem; display:inline-block;">${activeAlerts.length} ALERTS</span>` 
        : `<span class="alert-pill info" style="padding:2px 6px; font-size:0.65rem; display:inline-block; background-color:rgba(0,230,118,0.15); color:var(--color-success); border-color:var(--color-success);">NORMAL</span>`;

      mapMarkers[device.id].bindPopup(`
        <div style="font-family:var(--font-sans); color:var(--text-main);">
          <strong style="font-size:0.9rem;">${device.name}</strong><br>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${device.id}</span>
          <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
          <table style="width:100%; font-size:0.75rem;">
            <tr><td style="color:var(--text-muted);">Speed:</td><td style="font-weight:600;">${gps.speed} km/h</td></tr>
            <tr><td style="color:var(--text-muted);">Distance:</td><td style="font-weight:600;">${gps.distance} km</td></tr>
            <tr><td style="color:var(--text-muted);">Status:</td><td>${alertBadge}</td></tr>
            <tr><td style="color:var(--text-muted);">Location:</td><td>${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}</td></tr>
          </table>
        </div>
      `);

      // 2. Render Travel History Line (Polyline)
      if (gps.history && gps.history.length > 1) {
        if (!mapTrails[device.id]) {
          mapTrails[device.id] = L.polyline(gps.history, {
            color: isOnline ? '#7f00ff' : '#4e5d78',
            weight: 2,
            opacity: 0.6,
            dashArray: '4, 4'
          }).addTo(mapInstance);
        } else {
          mapTrails[device.id].setLatLngs(gps.history);
          mapTrails[device.id].setStyle({
            color: isOnline ? '#7f00ff' : '#4e5d78'
          });
        }
      }
    });

    // Populate sidebar list of GPS trackers
    renderGPSDeviceSidebarList();
    renderGeofenceSidebarList();
  }

  function renderGPSDeviceSidebarList() {
    const gpsDevices = devicesList.filter(d => d.gpsEnabled);
    gpsDeviceListContainer.innerHTML = '';

    gpsDevices.forEach(device => {
      const gps = device.gpsData;
      if (!gps) return;

      const isOnline = device.connected;
      const isActive = device.id === selectedMapDeviceId;
      const deviceAlerts = alertLog.filter(a => a.deviceId === device.id && a.status === 'active');
      
      const item = document.createElement('div');
      item.className = `gps-device-item ${isActive ? 'active' : ''}`;
      
      let borderGlow = '';
      if (deviceAlerts.length > 0) {
        borderGlow = 'border-left: 3px solid var(--color-danger);';
      }

      item.style = borderGlow;
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:0.85rem; color:#fff;">${device.id}</strong>
          <span style="font-size:0.7rem; font-weight:600; text-transform:uppercase; color:${isOnline ? 'var(--color-success)' : 'var(--text-muted)'};">
            ${isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${device.name}</div>
        
        <div class="gps-device-info-row">
          <span class="gps-speed-badge">${gps.speed} km/h</span>
          <span>Dist: ${gps.distance} km</span>
        </div>
        
        ${deviceAlerts.length > 0 ? `
          <div style="margin-top:8px; font-size:0.7rem; color:var(--color-danger); font-weight:600;">
            <i data-lucide="alert-octagon" style="width:12px; display:inline-block; vertical-align:middle;"></i>
            ${deviceAlerts.length} Active Warnings
          </div>
        ` : ''}
      `;

      item.addEventListener('click', () => {
        selectGPSDevice(device.id);
        
        // Center map on marker position
        if (mapInstance && mapMarkers[device.id]) {
          mapInstance.setView([gps.lat, gps.lng], 13);
          mapMarkers[device.id].openPopup();
        }
      });

      gpsDeviceListContainer.appendChild(item);
    });

    lucide.createIcons();
  }

  function selectGPSDevice(deviceId) {
    selectedMapDeviceId = deviceId;
    renderGPSDeviceSidebarList();
    
    // Highlight marker active outline
    devicesList.forEach(dev => {
      const el = document.getElementById(`marker-circle-${dev.id}`);
      if (el) {
        if (dev.id === deviceId) el.classList.add('active');
        else el.classList.remove('active');
      }
    });
  }

  function renderGeofenceSidebarList() {
    gpsGeofenceList.innerHTML = '';
    geofencesList.forEach(fence => {
      const item = document.createElement('div');
      item.className = 'geofence-item';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:0.85rem; color:#fff;">${fence.name}</strong>
          <button class="delete-fence-btn" data-id="${fence.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.85rem;">
            &times;
          </button>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-top:6px;">
          <span>Coords: ${fence.lat.toFixed(4)}, ${fence.lng.toFixed(4)}</span>
          <span>Rad: ${fence.radius}m</span>
        </div>
      `;

      // Click center map on geofence
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-fence-btn')) return;
        if (mapInstance) {
          mapInstance.setView([fence.lat, fence.lng], 14);
          if (mapGeofences[fence.id]) {
            mapGeofences[fence.id].openPopup();
          }
        }
      });

      // Delete geofence handler
      item.querySelector('.delete-fence-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteGeofence(fence.id);
      });

      gpsGeofenceList.appendChild(item);
    });

    if (geofencesList.length === 0) {
      gpsGeofenceList.innerHTML = `<span style="font-size:0.75rem; color:var(--text-dark); text-align:center; display:block; padding:10px;">No custom geofences configured.</span>`;
    }
  }

  function deleteGeofence(fenceId) {
    // Remove from simulation state
    const index = window.simulator.geofences.findIndex(f => f.id === fenceId);
    if (index !== -1) {
      window.simulator.geofences.splice(index, 1);
      geofencesList = window.simulator.geofences;
      
      // Log event
      window.simulator.logActivity('system', 'Geofence Removed', `Geofence block was removed.`, 'info');
      
      // Remove from map layer
      if (mapGeofences[fenceId]) {
        mapInstance.removeLayer(mapGeofences[fenceId]);
        delete mapGeofences[fenceId];
      }
      
      renderGeofenceSidebarList();
    }
  }

  // Geofence creators modal control
  btnAddGeofence.addEventListener('click', () => {
    // Prefill coordinates with map center coordinates
    if (mapInstance) {
      const center = mapInstance.getCenter();
      document.getElementById('fence-lat').value = center.lat.toFixed(6);
      document.getElementById('fence-lng').value = center.lng.toFixed(6);
    }
    openModal(modalAddGeofence);
  });

  document.getElementById('close-geofence-modal').addEventListener('click', () => closeModal(modalAddGeofence));
  document.getElementById('btn-cancel-geofence').addEventListener('click', () => closeModal(modalAddGeofence));
  
  document.getElementById('form-create-geofence').addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('fence-name').value,
      lat: document.getElementById('fence-lat').value,
      lng: document.getElementById('fence-lng').value,
      radius: document.getElementById('fence-radius').value
    };

    const newFence = window.simulator.addGeofence(payload);
    geofencesList = window.simulator.geofences;
    
    // Add to map layer
    renderGeofencesOnMap();
    renderGeofenceSidebarList();
    
    closeModal(modalAddGeofence);
    document.getElementById('form-create-geofence').reset();
  });

  // ----------------------------------------------------
  // VIEW 4: DEVICE MANAGER TABLE
  // ----------------------------------------------------
  function renderDeviceManager() {
    deviceTableBody.innerHTML = '';

    devicesList.forEach(device => {
      const isOnline = device.connected;
      const activeAlerts = alertLog.filter(a => a.deviceId === device.id && a.status === 'active');
      
      // Sensors list joined
      const sensorListString = device.sensors.map(s => {
        let shortName = s.type.replace('DHT11 ', '');
        return `<span style="font-family:var(--font-mono); font-size:0.75rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:2px 4px; border-radius:4px; margin-right:4px; margin-bottom:4px; display:inline-block;">
          ${shortName}: ${s.value}${s.unit === 'status' ? '' : s.unit}
        </span>`;
      }).join(' ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <strong style="color:#fff;">${device.name}</strong>
            <span class="sensor-id-tag" style="align-self:flex-start;">${device.id}</span>
            <span style="font-size:0.75rem; color:var(--text-muted);"><i data-lucide="map-pin" style="width:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>${device.location}</span>
          </div>
        </td>
        <td>
          <span class="device-model-badge">${device.type}</span>
        </td>
        <td style="max-width: 250px;">
          ${sensorListString}
        </td>
        <td>
          ${device.gpsEnabled ? `
            <span style="color:var(--color-primary); font-size:0.8rem; font-weight:600; display:flex; align-items:center; gap:6px;">
              <i data-lucide="navigation" style="width:12px;"></i> GPS Enabled
            </span>
          ` : `
            <span style="color:var(--text-dark); font-size:0.8rem;">No GPS</span>
          `}
        </td>
        <td>
          <div class="sensor-status-indicator ${isOnline ? 'online' : 'offline'}">
            <span class="status-dot" style="background-color:${isOnline ? 'var(--color-success)' : 'var(--text-dark)'}; box-shadow:none; width:6px; height:6px;"></span>
            <span style="font-weight:600;">${isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem;">
            <div>Health: <span style="font-weight:600; color:${device.health > 85 ? 'var(--color-success)' : 'var(--color-warning)'}">${device.health}%</span></div>
            <div>Battery: <span style="font-weight:600;">${device.id === 'ARD_05' ? 'AC Connected' : device.battery + '%'}</span></div>
          </div>
        </td>
        <td>
          <div style="display:flex; gap:8px;">
            <button class="custom-btn toggle-con-btn" data-id="${device.id}" style="padding: 4px 8px; font-size: 0.75rem;">
              ${isOnline ? 'Disconnect' : 'Connect'}
            </button>
            ${device.id !== 'ARD_05' ? `
              <button class="custom-btn custom-btn-secondary recharge-btn" data-id="${device.id}" style="padding: 4px 8px; font-size: 0.75rem;">
                Recharge
              </button>
            ` : ''}
          </div>
        </td>
      `;

      // Bind dynamic actions
      tr.querySelector('.toggle-con-btn').addEventListener('click', () => {
        window.simulator.toggleDeviceConnection(device.id);
        renderDeviceManager();
      });

      if (device.id !== 'ARD_05') {
        tr.querySelector('.recharge-btn').addEventListener('click', () => {
          window.simulator.rechargeDevice(device.id);
          renderDeviceManager();
        });
      }

      deviceTableBody.appendChild(tr);
    });

    lucide.createIcons();
  }

  // Register Device Modal handles
  btnRegisterDevice.addEventListener('click', () => openModal(modalRegisterDevice));
  document.getElementById('close-register-modal').addEventListener('click', () => closeModal(modalRegisterDevice));
  document.getElementById('btn-cancel-register').addEventListener('click', () => closeModal(modalRegisterDevice));

  document.getElementById('form-register-device').addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      id: document.getElementById('reg-device-id').value,
      name: document.getElementById('reg-device-name').value,
      type: document.getElementById('reg-device-type').value,
      location: document.getElementById('reg-location').value,
      hasTemp: document.getElementById('reg-sensor-temp').checked,
      hasHum: document.getElementById('reg-sensor-hum').checked,
      hasMotion: document.getElementById('reg-sensor-motion').checked,
      hasWater: document.getElementById('reg-sensor-water').checked,
      gpsEnabled: document.getElementById('reg-gps-enabled').checked
    };

    try {
      window.simulator.registerDevice(payload);
      renderDeviceManager();
      closeModal(modalRegisterDevice);
      document.getElementById('form-register-device').reset();
    } catch (err) {
      alert(err.message);
    }
  });

  // ----------------------------------------------------
  // VIEW 5: FULL ALERT SYSTEM LOGS
  // ----------------------------------------------------
  function renderFullAlertLog() {
    const filter = alertLogFilter.value;
    fullAlertLog.innerHTML = '';

    const filteredAlerts = alertLog.filter(alert => {
      if (filter === 'all') return true;
      if (filter === 'critical' && alert.level === 'critical') return true;
      if (filter === 'warning' && alert.level === 'warning') return true;
      if (filter === 'geofence' && alert.sourceType === 'geofence') return true;
      if (filter === 'system' && alert.sourceType === 'system') return true;
      return false;
    });

    filteredAlerts.forEach(alert => {
      const isResolved = alert.status === 'resolved';
      const item = document.createElement('div');
      item.className = 'activity-item';
      
      let levelBadge = `<span class="alert-pill critical">${alert.level.toUpperCase()}</span>`;
      if (alert.level === 'warning') levelBadge = `<span class="alert-pill warning">WARNING</span>`;
      
      if (isResolved) {
        levelBadge = `<span class="alert-pill info" style="background-color:rgba(0,230,118,0.1); border-color:var(--color-success); color:var(--color-success);">RESOLVED</span>`;
      }

      let devicePath = `[${alert.deviceId}]`;

      item.innerHTML = `
        <div class="activity-icon-container ${isResolved ? 'success' : alert.level}">
          <i data-lucide="${isResolved ? 'check-circle' : alert.sourceType === 'geofence' ? 'shield-alert' : 'alert-circle'}"></i>
        </div>
        <div class="activity-details" style="flex-direction:row; align-items:center; justify-content:space-between; flex-wrap:wrap; width:100%;">
          <div style="flex-grow:1; min-width:250px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
              ${levelBadge}
              <strong style="color:#fff;">${alert.sourceName}</strong>
              <span class="sensor-id-tag">${devicePath}</span>
            </div>
            <p class="activity-text" style="font-size:0.85rem; color:var(--text-main);">${alert.message}</p>
          </div>
          <div style="text-align:right; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">
            <div>Triggered: ${new Date(alert.timestamp).toLocaleTimeString()}</div>
            ${isResolved ? `<div style="color:var(--color-success);">Resolved: ${new Date(alert.resolvedTime).toLocaleTimeString()}</div>` : ''}
          </div>
        </div>
      `;

      fullAlertLog.appendChild(item);
    });

    lucide.createIcons();

    if (filteredAlerts.length === 0) {
      fullAlertLog.innerHTML = `
        <div style="text-align:center; padding:48px; color:var(--text-muted);">
          <i data-lucide="bell-off" style="width:36px; height:36px; margin-bottom:8px; color:var(--text-dark);"></i>
          <p>No logged events match the selected filter category.</p>
        </div>
      `;
      lucide.createIcons();
    }
  }

  alertLogFilter.addEventListener('change', renderFullAlertLog);
  
  clearAlertsBtn.addEventListener('click', () => {
    window.simulator.alerts = [];
    alertLog = [];
    updateGlobalWidgets();
    renderFullAlertLog();
    window.simulator.logActivity('system', 'Alert Database Clear', 'Full alert event database purged by administrator.', 'warning');
  });

  // ----------------------------------------------------
  // SENSOR / DEVICE DETAILS MODAL & CHARTS
  // ----------------------------------------------------
  function initSensorDetailChart() {
    const ctx = document.getElementById('sensorDetailChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

    sensorDetailChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({length: 15}, (_, i) => `-${15 - i}`),
        datasets: [{
          label: 'Live Telemetry',
          data: [],
          borderColor: '#00f2fe',
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'var(--text-muted)' }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'var(--text-muted)' }
          }
        }
      }
    });
  }

  function openSensorDetailsModal(sensorId) {
    selectedSensorId = sensorId;
    
    // Lazy initialize chart
    if (!sensorDetailChart) {
      initSensorDetailChart();
    }

    refreshSensorModalContent(sensorId);
    openModal(modalSensorDetails);
  }

  function refreshSensorModalContent(sensorId) {
    let sensorData = null;
    let deviceData = null;

    devicesList.forEach(dev => {
      dev.sensors.forEach(sens => {
        if (sens.id === sensorId) {
          sensorData = sens;
          deviceData = dev;
        }
      });
    });

    if (!sensorData || !deviceData) return;

    // Fill textual fields
    document.getElementById('sensor-modal-title').textContent = `${sensorData.name} Board Analysis`;
    document.getElementById('sensor-modal-value').textContent = sensorData.value;
    document.getElementById('sensor-modal-unit').textContent = sensorData.unit === 'status' ? '' : sensorData.unit;
    document.getElementById('sensor-modal-device-id').textContent = deviceData.id;
    document.getElementById('sensor-modal-hardware').textContent = deviceData.type;
    document.getElementById('sensor-modal-location').textContent = deviceData.location;
    document.getElementById('sensor-modal-health').textContent = `${deviceData.health}%`;
    document.getElementById('sensor-modal-battery').textContent = deviceData.id === 'ARD_05' ? 'AC Grid Powered' : `${deviceData.battery}%`;
    document.getElementById('sensor-modal-last-updated').textContent = new Date(deviceData.lastUpdated).toLocaleTimeString();

    // Colorize health
    const healthEl = document.getElementById('sensor-modal-health');
    if (deviceData.health > 80) healthEl.style.color = 'var(--color-success)';
    else if (deviceData.health > 50) healthEl.style.color = 'var(--color-warning)';
    else healthEl.style.color = 'var(--color-danger)';

    // Threshold inputs handling
    const thresholdValDisplay = document.getElementById('threshold-val-display');
    const thresholdRangeInput = document.getElementById('threshold-range-input');
    const thresholdContainer = document.getElementById('sensor-modal-threshold-container');

    if (sensorData.thresholdType === 'change') {
      // PIR motion sensor threshold doesn't need slider (it's binary event)
      thresholdContainer.style.display = 'none';
    } else {
      thresholdContainer.style.display = 'block';
      thresholdValDisplay.textContent = `${sensorData.threshold}${sensorData.unit}`;
      
      // Unbind and rebind slider inputs
      thresholdRangeInput.min = sensorData.type.includes('Temperature') ? '0' : sensorData.type.includes('Humidity') ? '10' : '50';
      thresholdRangeInput.max = sensorData.type.includes('Temperature') ? '120' : sensorData.type.includes('Humidity') ? '100' : '1500';
      thresholdRangeInput.value = sensorData.threshold;
      
      // Single event binder to avoid multiple binds
      thresholdRangeInput.oninput = (e) => {
        const val = parseFloat(e.target.value);
        sensorData.threshold = val;
        thresholdValDisplay.textContent = `${val}${sensorData.unit}`;
        
        // Push notification on threshold modifications
        window.simulator.logActivity(
          'system', 
          'Threshold Changed', 
          `Critical alert limit for ${sensorData.id} set to ${val}${sensorData.unit}.`, 
          'info'
        );
      };
    }

    // Refresh Modal Trend Chart
    sensorDetailChart.data.datasets[0].data = [...sensorData.history];
    sensorDetailChart.data.datasets[0].label = sensorData.name;
    
    // Choose neon color based on status or alert state
    const activeAlert = alertLog.find(a => a.id === `alert_${sensorData.id}` && a.status === 'active');
    const chartColor = activeAlert ? 'var(--color-danger)' : 'var(--color-primary)';
    
    sensorDetailChart.data.datasets[0].borderColor = chartColor;
    
    const ctx = document.getElementById('sensorDetailChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, hexToRgbA(chartColor.startsWith('var') ? (activeAlert ? '#ff4b5c' : '#00f2fe') : chartColor, 0.3));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    
    sensorDetailChart.data.datasets[0].backgroundColor = gradient;
    sensorDetailChart.update('none');

    // Populate modal alert history (filtering logs related to this sensor)
    const modalHistoryFeed = document.getElementById('sensor-modal-history-feed');
    modalHistoryFeed.innerHTML = '';

    const sensorAlerts = alertLog.filter(a => a.deviceId === deviceData.id && (a.id === `alert_${sensorData.id}` || a.id === `alert_bat_${deviceData.id}`));
    sensorAlerts.forEach(al => {
      const activeEl = document.createElement('div');
      activeEl.className = 'activity-item';
      activeEl.style.padding = '8px';
      activeEl.style.fontSize = '0.75rem';
      activeEl.innerHTML = `
        <span class="alert-pill ${al.status === 'active' ? al.level : 'info'}" style="padding: 1px 4px; font-size:0.6rem; margin-right:6px;">
          ${al.status === 'active' ? al.level.toUpperCase() : 'RESOLVED'}
        </span>
        <span style="color:var(--text-main);">${al.message}</span>
      `;
      modalHistoryFeed.appendChild(activeEl);
    });

    if (sensorAlerts.length === 0) {
      modalHistoryFeed.innerHTML = `<span style="font-size:0.75rem; color:var(--text-dark); display:block; text-align:center;">No alarm triggers for this sensor.</span>`;
    }
  }

  document.getElementById('close-sensor-modal').addEventListener('click', () => closeModal(modalSensorDetails));

  // ----------------------------------------------------
  // GENERAL MODAL HELPERS
  // ----------------------------------------------------
  function openModal(modalEl) {
    modalEl.classList.add('active');
  }

  function closeModal(modalEl) {
    modalEl.classList.remove('active');
    if (modalEl === modalSensorDetails) {
      selectedSensorId = null;
    }
  }

  // Close modals on clicking backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  });

  // ----------------------------------------------------
  // AUDIO ALARM ALERTS (Web Audio API)
  // ----------------------------------------------------
  let isMuted = localStorage.getItem('audioMuted') === 'true';
  const btnMuteAudio = document.getElementById('btn-mute-audio');
  const muteIcon = document.getElementById('mute-icon');

  function updateMuteButtonUI() {
    if (!btnMuteAudio || !muteIcon) return;
    if (isMuted) {
      btnMuteAudio.classList.add('muted');
      muteIcon.setAttribute('data-lucide', 'volume-x');
    } else {
      btnMuteAudio.classList.remove('muted');
      muteIcon.setAttribute('data-lucide', 'volume-2');
    }
    lucide.createIcons();
  }

  updateMuteButtonUI();

  if (btnMuteAudio) {
    btnMuteAudio.addEventListener('click', () => {
      isMuted = !isMuted;
      localStorage.setItem('audioMuted', isMuted);
      updateMuteButtonUI();
      
      window.simulator.logActivity(
        'system',
        'Settings Changed',
        `Audio alarm alerts ${isMuted ? 'muted' : 'unmuted'}.`,
        isMuted ? 'warning' : 'info'
      );
    });
  }

  function playAlertSound(level) {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      if (level === 'critical') {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      } else {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      }
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Web Audio API not supported or blocked by browser policy:', e);
    }
  }

  // ----------------------------------------------------
  // NOTIFICATION DISPATCH RULES SYSTEM
  // ----------------------------------------------------
  let notificationRules = JSON.parse(localStorage.getItem('notificationRules')) || [
    {
      id: 'rule_1',
      device: 'all',
      sensorType: 'DHT11 Temperature',
      level: 'critical',
      channel: 'email',
      recipient: 'operator@sansah.com',
      enabled: true
    },
    {
      id: 'rule_2',
      device: 'NODEMCU_02',
      sensorType: 'all',
      level: 'warning',
      channel: 'sms',
      recipient: '+15550199',
      enabled: true
    }
  ];

  function saveRules() {
    localStorage.setItem('notificationRules', JSON.stringify(notificationRules));
  }

  function checkNotificationRules(alert) {
    notificationRules.forEach(rule => {
      if (!rule.enabled) return;
      const matchDevice = (rule.device === 'all' || rule.device === alert.deviceId);
      const matchSensor = (rule.sensorType === 'all' || rule.sensorType === alert.sensorType);
      
      let matchLevel = false;
      if (rule.level === 'warning') {
        matchLevel = (alert.level === 'warning' || alert.level === 'critical');
      } else if (rule.level === 'critical') {
        matchLevel = (alert.level === 'critical');
      }
      
      if (matchDevice && matchSensor && matchLevel) {
        window.simulator.logActivity(
          'system',
          'Notification Dispatched',
          `Simulated ${rule.channel.toUpperCase()} notification sent to <strong>${rule.recipient}</strong>.`,
          'success'
        );
        createDispatchToast(rule, alert);
      }
    });
  }

  function createDispatchToast(rule, alert) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-item success';
    
    toast.innerHTML = `
      <button class="toast-close">&times;</button>
      <div class="toast-icon success">
        <i data-lucide="check" style="width:16px;"></i>
      </div>
      <div class="toast-body">
        <div class="toast-title">NOTIFICATION DISPATCHED</div>
        <div class="toast-message">Simulated <strong>${rule.channel.toUpperCase()}</strong> sent to <em>${rule.recipient}</em>.</div>
      </div>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();

    toast.querySelector('.toast-close').addEventListener('click', () => {
      dismissToast(toast);
    });

    setTimeout(() => {
      dismissToast(toast);
    }, 6000);
  }

  function updateRuleDevicesSelect() {
    const ruleDeviceSelect = document.getElementById('rule-device');
    if (!ruleDeviceSelect) return;
    
    const currentValue = ruleDeviceSelect.value;
    ruleDeviceSelect.innerHTML = '<option value="all">All Registered Devices</option>';
    
    devicesList.forEach(device => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.name} (${device.id})`;
      ruleDeviceSelect.appendChild(option);
    });
    
    if ([...ruleDeviceSelect.options].some(opt => opt.value === currentValue)) {
      ruleDeviceSelect.value = currentValue;
    }
  }

  function renderRulesPage() {
    const container = document.getElementById('rules-list-container');
    const badge = document.getElementById('rules-count-badge');
    if (!container) return;
    
    container.innerHTML = '';
    badge.textContent = `${notificationRules.length} Active Rules`;
    
    if (notificationRules.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <i data-lucide="info" style="width:32px; height:32px; margin-bottom:12px;"></i>
          <p>No active notification rules configured. Alerts will display in-app only.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    notificationRules.forEach(rule => {
      const card = document.createElement('div');
      card.className = 'rule-card';
      
      let targetName = 'All Devices';
      if (rule.device !== 'all') {
        const dev = devicesList.find(d => d.id === rule.device);
        targetName = dev ? dev.name : rule.device;
      }
      
      let targetSensor = 'All Sensors';
      if (rule.sensorType !== 'all') {
        targetSensor = rule.sensorType.replace('DHT11 ', '');
      }
      
      const ruleDescText = `Triggers on <strong>${rule.level.toUpperCase()}</strong> alerts from <strong>${targetSensor}</strong> on <strong>${targetName}</strong>.`;
      
      card.innerHTML = `
        <div class="rule-info">
          <span class="rule-name">${rule.recipient}</span>
          <span class="rule-desc">${ruleDescText}</span>
          <div class="rule-channel">
            <i data-lucide="${rule.channel === 'email' ? 'mail' : rule.channel === 'sms' ? 'message-square' : 'phone'}" style="width:12px;"></i>
            <span>${rule.channel}</span>
          </div>
        </div>
        <div class="rule-actions">
          <button class="custom-btn custom-btn-danger btn-delete-rule" data-id="${rule.id}" style="padding: 4px 8px; font-size: 0.75rem;">
            <i data-lucide="trash-2" style="width:12px;"></i>
          </button>
        </div>
      `;
      
      card.querySelector('.btn-delete-rule').addEventListener('click', () => {
        notificationRules = notificationRules.filter(r => r.id !== rule.id);
        saveRules();
        renderRulesPage();
        
        window.simulator.logActivity(
          'system',
          'Rule Deleted',
          `Notification rule for ${rule.recipient} was removed.`,
          'warning'
        );
      });
      
      container.appendChild(card);
    });
    
    lucide.createIcons();
  }

  const formCreateRule = document.getElementById('form-create-rule');
  if (formCreateRule) {
    formCreateRule.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const device = document.getElementById('rule-device').value;
      const sensorType = document.getElementById('rule-sensor-type').value;
      const level = document.getElementById('rule-level').value;
      const channel = document.getElementById('rule-channel').value;
      const recipient = document.getElementById('rule-recipient').value.trim();
      
      const newRule = {
        id: 'rule_' + Date.now(),
        device,
        sensorType,
        level,
        channel,
        recipient,
        enabled: true
      };
      
      notificationRules.push(newRule);
      saveRules();
      formCreateRule.reset();
      renderRulesPage();
      
      window.simulator.logActivity(
        'system',
        'Rule Configured',
        `New alert rule added for <strong>${recipient}</strong> via ${channel.toUpperCase()}.`,
        'success'
      );
    });
  }

  // ----------------------------------------------------
  // LOGIN SCREEN & USER SESSION ACCESS CONTROL
  // ----------------------------------------------------
  const loginOverlay = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginUsernameInput = document.getElementById('login-username');
  const loginPasswordInput = document.getElementById('login-password');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const btnLogout = document.getElementById('btn-logout');

  function checkAuthentication() {
    if (!loginOverlay) return;
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (isAuthenticated) {
      loginOverlay.classList.add('hidden');
    } else {
      loginOverlay.classList.remove('hidden');
    }
  }

  checkAuthentication();

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = loginUsernameInput.value.trim();
      const password = loginPasswordInput.value.trim();

      if (username === 'admin' && password === 'admin') {
        localStorage.setItem('isAuthenticated', 'true');
        loginErrorMsg.style.display = 'none';
        loginForm.reset();
        
        loginOverlay.classList.add('hidden');
        
        window.simulator.logActivity(
          'system',
          'User Login',
          'System Operator logged in successfully.',
          'success'
        );
        
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          audioCtx.resume();
        } catch(e) {}
      } else {
        loginErrorMsg.style.display = 'block';
        loginErrorMsg.textContent = 'Invalid username or password.';
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('isAuthenticated');
      checkAuthentication();
      
      window.simulator.logActivity(
        'system',
        'User Logout',
        'System Operator logged out.',
        'info'
      );
    });
  }

  // ----------------------------------------------------
  // CSV EXPORTS (DATA LOGS & STATISTICS)
  // ----------------------------------------------------
  function downloadCSV(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  function exportTrendsToCSV() {
    if (devicesList.length === 0) {
      alert('No device telemetry available.');
      return;
    }
    let csv = 'Timestamp,Device ID,Device Name,Location,Sensor Name,Sensor Type,Value,Unit\n';
    const now = new Date().toLocaleString().replace(/,/g, '');
    
    devicesList.forEach(device => {
      device.sensors.forEach(sensor => {
        csv += `"${now}","${device.id}","${device.name}","${device.location}","${sensor.name}","${sensor.type}","${sensor.value}","${sensor.unit}"\n`;
      });
    });
    
    downloadCSV(csv, `sansah_innovation_telemetry_${Date.now()}.csv`);
    
    window.simulator.logActivity(
      'system',
      'Data Exported',
      'Device sensor telemetry successfully exported to CSV.',
      'success'
    );
  }

  function exportAlertsToCSV() {
    if (alertLog.length === 0) {
      alert('No alerts logged yet.');
      return;
    }
    let csv = 'Alert ID,Device ID,Device Name,Level,Source,Message,Timestamp,Status\n';
    alertLog.forEach(a => {
      const timestamp = new Date(a.timestamp).toLocaleString().replace(/,/g, '');
      const msg = a.message.replace(/"/g, '""');
      csv += `"${a.id}","${a.deviceId}","${a.deviceName}","${a.level}","${a.sourceType}","${msg}","${timestamp}","${a.status}"\n`;
    });
    
    downloadCSV(csv, `sansah_innovation_alerts_${Date.now()}.csv`);
    
    window.simulator.logActivity(
      'system',
      'Data Exported',
      'Alert logs successfully exported to CSV.',
      'success'
    );
  }

  const btnExportTrends = document.getElementById('btn-export-trends');
  const btnExportAlerts = document.getElementById('btn-export-alerts');

  if (btnExportTrends) {
    btnExportTrends.addEventListener('click', exportTrendsToCSV);
  }
  if (btnExportAlerts) {
    btnExportAlerts.addEventListener('click', exportAlertsToCSV);
  }

  // ----------------------------------------------------
  // APPLICATION INIT
  // ----------------------------------------------------
  // Pre-load Lucide icons
  lucide.createIcons();
  
  // Build initial view datasets
  updateGlobalWidgets();
  renderSensorBoard();
  
  // Lazy trigger default page loading
  switchPage('page-dashboard');
});
