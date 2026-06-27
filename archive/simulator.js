/**
 * IoT Alert Notification System - Real-time Live Simulator
 */

// Define simulation routes for GPS devices (centered around Los Angeles, California)
const GPS_ROUTES = {
  route_delivery_truck: [
    [34.052234, -118.243684], // Downtown LA
    [34.056000, -118.250000],
    [34.061000, -118.258000],
    [34.068000, -118.270000],
    [34.072000, -118.280000], // Near Echo Park
    [34.078000, -118.290000],
    [34.085000, -118.300000],
    [34.090000, -118.320000], // Hollywood area
    [34.095000, -118.340000],
    [34.098000, -118.360000],
    [34.095000, -118.380000],
    [34.085000, -118.400000], // Beverly Hills area
    [34.070000, -118.410000],
    [34.055000, -118.420000],
    [34.040000, -118.430000], // Westwood area
    [34.025000, -118.450000],
    [34.015000, -118.470000],
    [34.008000, -118.490000], // Santa Monica
    [34.015000, -118.470000],
    [34.025000, -118.450000],
    [34.040000, -118.430000],
    [34.050000, -118.400000],
    [34.058000, -118.360000],
    [34.060000, -118.320000],
    [34.055000, -118.280000],
    [34.052234, -118.243684]  // Back to Start
  ],
  route_field_engineer: [
    [34.0194, -118.4912], // Santa Monica Pier
    [34.0150, -118.4850],
    [34.0050, -118.4750],
    [33.9900, -118.4600], // Venice Beach
    [33.9850, -118.4500],
    [33.9800, -118.4400], // Marina Del Rey
    [33.9820, -118.4300],
    [33.9900, -118.4200],
    [34.0000, -118.4300],
    [34.0100, -118.4500],
    [34.0220, -118.4750],
    [34.0194, -118.4912]  // Back to Start
  ],
  route_cargo_drone: [
    [34.0522, -118.2437], // Downtown LA Heliport
    [34.0400, -118.2200], // Boyle Heights
    [34.0200, -118.2100],
    [34.0000, -118.2300], // Vernon Industrial Zone
    [34.0200, -118.2500],
    [34.0350, -118.2600],
    [34.0522, -118.2437]  // Back to Start
  ]
};

// Initial system state
const initialDevices = [
  {
    id: "ESP32_01",
    name: "Server Room A Climate Controller",
    type: "ESP32",
    location: "Main HQ Server Room A",
    connected: true,
    battery: 98,
    health: 100,
    lastUpdated: Date.now(),
    gpsEnabled: false,
    gpsData: null,
    sensors: [
      {
        id: "ESP32_01_temp",
        name: "DHT11 Temperature Sensor",
        type: "DHT11 Temperature",
        value: 22.4,
        unit: "°C",
        threshold: 28.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => (22.0 + Math.random() * 0.8))
      },
      {
        id: "ESP32_01_hum",
        name: "DHT11 Humidity Sensor",
        type: "DHT11 Humidity",
        value: 45.2,
        unit: "%",
        threshold: 65.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => (44.0 + Math.random() * 2))
      }
    ]
  },
  {
    id: "NODEMCU_02",
    name: "Industrial Boiler Watchdog",
    type: "NodeMCU",
    location: "Boiler Subroom C",
    connected: true,
    battery: 85,
    health: 96,
    lastUpdated: Date.now(),
    gpsEnabled: false,
    gpsData: null,
    sensors: [
      {
        id: "NOD_02_temp",
        name: "High-Temp Sensor",
        type: "DHT11 Temperature",
        value: 78.5,
        unit: "°C",
        threshold: 95.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => (75.0 + Math.random() * 4.0))
      },
      {
        id: "NOD_02_water",
        name: "Coolant Level Indicator",
        type: "Water Level Sensor",
        value: 450,
        unit: "mm",
        threshold: 150, // Minimum water level threshold
        thresholdType: "min",
        history: Array.from({length: 15}, () => Math.floor(400 + Math.random() * 80))
      }
    ]
  },
  {
    id: "TRK_03",
    name: "Delivery Fleet - Van A",
    type: "Smart IoT Tracker",
    location: "Los Angeles Highway Route",
    connected: true,
    battery: 74,
    health: 100,
    lastUpdated: Date.now(),
    gpsEnabled: true,
    gpsData: {
      lat: GPS_ROUTES.route_delivery_truck[0][0],
      lng: GPS_ROUTES.route_delivery_truck[0][1],
      speed: 45.0,
      distance: 0,
      routeIndex: 0,
      routeName: "route_delivery_truck",
      history: [GPS_ROUTES.route_delivery_truck[0]],
      lastGeofenceStatus: {}
    },
    sensors: [
      {
        id: "TRK_03_temp",
        name: "Cargo Temperature Sensor",
        type: "DHT11 Temperature",
        value: 5.4,
        unit: "°C",
        threshold: 8.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => (4.5 + Math.random() * 1.0))
      },
      {
        id: "TRK_03_motion",
        name: "Cargo Vibration Tracker",
        type: "Motion Sensor",
        value: 0, // 0 = Idle, 1 = Motion
        unit: "status",
        threshold: 1, // Alert on motion
        thresholdType: "change",
        history: Array.from({length: 15}, () => 0)
      }
    ]
  },
  {
    id: "TRK_04",
    name: "Field Operations - Engineer Mark",
    type: "Smart IoT Tracker",
    location: "Santa Monica Operations Site",
    connected: true,
    battery: 12, // Critical battery trigger
    health: 80,
    lastUpdated: Date.now(),
    gpsEnabled: true,
    gpsData: {
      lat: GPS_ROUTES.route_field_engineer[0][0],
      lng: GPS_ROUTES.route_field_engineer[0][1],
      speed: 4.5,
      distance: 0,
      routeIndex: 0,
      routeName: "route_field_engineer",
      history: [GPS_ROUTES.route_field_engineer[0]],
      lastGeofenceStatus: {}
    },
    sensors: [
      {
        id: "TRK_04_temp",
        name: "Wearable Temp Probe",
        type: "DHT11 Temperature",
        value: 36.8,
        unit: "°C",
        threshold: 40.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => (36.5 + Math.random() * 0.5))
      },
      {
        id: "TRK_04_motion",
        name: "Man-Down PIR Motion Sensor",
        type: "Motion Sensor",
        value: 1,
        unit: "status",
        threshold: 0, // Alert if no motion (0) for too long
        thresholdType: "change",
        history: Array.from({length: 15}, () => 1)
      }
    ]
  },
  {
    id: "ARD_05",
    name: "Basement Drainage Sump Pump",
    type: "Arduino",
    location: "Basement Utility Room B",
    connected: true,
    battery: 100, // Powered by AC adapter
    health: 98,
    lastUpdated: Date.now(),
    gpsEnabled: false,
    gpsData: null,
    sensors: [
      {
        id: "ARD_05_water",
        name: "Sump Level Sensor",
        type: "Water Level Sensor",
        value: 120,
        unit: "mm",
        threshold: 800, // Maximum level before overflow
        thresholdType: "max",
        history: Array.from({length: 15}, () => Math.floor(100 + Math.random() * 50))
      }
    ]
  },
  {
    id: "TRK_06",
    name: "Autonomous Cargo Drone D-01",
    type: "Smart IoT Tracker",
    location: "Sky corridor Boyle Heights",
    connected: true,
    battery: 92,
    health: 100,
    lastUpdated: Date.now(),
    gpsEnabled: true,
    gpsData: {
      lat: GPS_ROUTES.route_cargo_drone[0][0],
      lng: GPS_ROUTES.route_cargo_drone[0][1],
      speed: 85.0,
      distance: 0,
      routeIndex: 0,
      routeName: "route_cargo_drone",
      history: [GPS_ROUTES.route_cargo_drone[0]],
      lastGeofenceStatus: {}
    },
    sensors: [
      {
        id: "TRK_06_temp",
        name: "Battery Bay Temperature",
        type: "DHT11 Temperature",
        value: 32.1,
        unit: "°C",
        threshold: 45.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => (30.0 + Math.random() * 3.0))
      }
    ]
  }
];

// Initial Geofence boundaries
const initialGeofences = [
  {
    id: "fence_downtown",
    name: "HQ Downtown Core Geofence",
    lat: 34.0522,
    lng: -118.2437,
    radius: 1200, // meters
    color: "#00b0ff",
    alertsEnabled: true
  },
  {
    id: "fence_santa_monica",
    name: "Santa Monica Restricted Safe Zone",
    lat: 34.0150,
    lng: -118.4850,
    radius: 1000, // meters
    color: "#00e676",
    alertsEnabled: true
  }
];

class IoTSystemSimulator {
  constructor() {
    this.devices = [...initialDevices];
    this.geofences = [...initialGeofences];
    this.alerts = [];
    this.activities = [
      {
        id: "act_init",
        type: "system",
        title: "System Initialized",
        message: "Sansah Innovation IoT Monitoring System successfully started.",
        timestamp: Date.now(),
        alertLevel: "info"
      }
    ];
    this.isSimulating = true;
    this.timerId = null;
    this.uptimeSeconds = 0;
    
    // Callback functions when data updates
    this.onUpdateCallback = null;
    this.onAlertCallback = null;
    this.onActivityCallback = null;

    // Start background loops
    this.startSimulationLoop();
  }

  // Set listeners for frontend updates
  setUpdateListener(callback) { this.onUpdateCallback = callback; }
  setAlertListener(callback) { this.onAlertCallback = callback; }
  setActivityListener(callback) { this.onActivityCallback = callback; }

  startSimulationLoop() {
    if (this.timerId) return;
    this.timerId = setInterval(() => {
      this.uptimeSeconds++;
      if (this.isSimulating) {
        this.updateSensorStates();
        this.updateGPSPositions();
        this.evaluateThresholds();
      }
      
      // Dispatch updates
      if (this.onUpdateCallback) {
        this.onUpdateCallback({
          devices: this.devices,
          alerts: this.alerts,
          uptime: this.uptimeSeconds,
          health: this.calculateSystemHealth()
        });
      }
    }, 2000); // Trigger simulation update every 2 seconds
  }

  stopSimulationLoop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  toggleSimulation(enabled) {
    this.isSimulating = enabled;
    this.logActivity(
      "system",
      "Simulation Settings",
      `Telemetry simulation ${enabled ? "resumed" : "paused"}.`,
      enabled ? "info" : "warning"
    );
  }

  // Logic to simulate sensor fluctuations
  updateSensorStates() {
    this.devices.forEach(device => {
      if (!device.connected) return;

      // Battery Drain simulation
      if (device.battery > 0 && device.id !== "ARD_05") { // Arduino is grid-powered
        device.battery = Math.max(0, parseFloat((device.battery - 0.05).toFixed(2)));
      }

      device.sensors.forEach(sensor => {
        let change = 0;
        
        switch (sensor.type) {
          case "DHT11 Temperature":
            // Warm rooms / cold boxes drift
            if (device.id === "TRK_03") { // Delivery Van Cargo Cold Box
              change = (Math.random() - 0.45) * 0.3; // slightly drifts upward
              sensor.value = parseFloat((sensor.value + change).toFixed(1));
              // Random anomaly trigger
              if (Math.random() > 0.98) sensor.value += 1.5; // sudden spike
            } else if (device.id === "NODEMCU_02") { // Industrial Boiler
              change = (Math.random() - 0.5) * 1.5;
              sensor.value = parseFloat((sensor.value + change).toFixed(1));
              // Prevent values going too far out of standard boiler bounds
              if (sensor.value < 65) sensor.value = 65;
              if (sensor.value > 98) sensor.value = 88; // dynamic cooldown
            } else { // Standard room temperature
              change = (Math.random() - 0.5) * 0.2;
              sensor.value = parseFloat((sensor.value + change).toFixed(1));
              if (sensor.value < 18) sensor.value = 18;
              if (sensor.value > 26) sensor.value = 25;
            }
            break;
            
          case "DHT11 Humidity":
            change = (Math.random() - 0.5) * 1.0;
            sensor.value = parseFloat((sensor.value + change).toFixed(1));
            sensor.value = Math.max(10, Math.min(100, sensor.value));
            break;
            
          case "Motion Sensor":
            // PIR motion sensor is active on and off
            if (Math.random() > 0.92) { // 8% chance to switch state
              sensor.value = sensor.value === 1 ? 0 : 1;
              
              if (sensor.value === 1) {
                this.logActivity(
                  "sensor",
                  "Motion Detected",
                  `Intrusion or activity registered at ${device.location} (${device.id}).`,
                  "info"
                );
              }
            }
            break;
            
          case "Water Level Sensor":
            // Sump pump fills, then drains when it reaches threshold
            if (device.id === "ARD_05") { // Sump pump drain basin
              if (sensor.value >= 780) {
                // Pump starts draining
                sensor.value -= 120;
                this.logActivity(
                  "sensor",
                  "Sump Pump Active",
                  "Basement sump pump initiated drainage cycle.",
                  "success"
                );
              } else {
                // Slower baseline rise from simulation rain water
                sensor.value += Math.floor(Math.random() * 20) + 5;
              }
            } else if (device.id === "NODEMCU_02") { // Boiler coolant level
              // Coolant evaporates, then auto-tops off
              if (sensor.value <= 160) {
                sensor.value += 300; // Top off
                this.logActivity(
                  "sensor",
                  "Coolant Top-Off",
                  "Boiler level low. Solenoid valve opened to replenish coolant.",
                  "info"
                );
              } else {
                sensor.value -= Math.floor(Math.random() * 5); // Evaporation
              }
            }
            break;
        }

        // Keep a rolling buffer of 15 elements in history for graphs
        sensor.history.push(sensor.value);
        if (sensor.history.length > 15) {
          sensor.history.shift();
        }
      });

      device.lastUpdated = Date.now();
    });
  }

  // Calculate distance between coordinates in meters (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in meters
  }

  // Logic to simulate GPS movement and detect geofence breach
  updateGPSPositions() {
    this.devices.forEach(device => {
      if (!device.connected || !device.gpsEnabled || !device.gpsData) return;

      const gps = device.gpsData;
      const route = GPS_ROUTES[gps.routeName];
      if (!route) return;

      // Increment route index
      let nextIndex = gps.routeIndex + 1;
      if (nextIndex >= route.length) {
        nextIndex = 0;
      }

      const prevPos = [gps.lat, gps.lng];
      const newPos = route[nextIndex];

      // Calculate incremental distance travelled in km
      const distanceMeters = this.calculateDistance(prevPos[0], prevPos[1], newPos[0], newPos[1]);
      gps.distance = parseFloat((gps.distance + (distanceMeters / 1000)).toFixed(2));
      
      // Calculate speed based on distance and step interval (2s simulator)
      // Speed in m/s = distance / 2s. Speed in km/h = (distance / 2) * 3.6
      const speedKmh = parseFloat(((distanceMeters / 2) * 3.6).toFixed(1));
      gps.speed = speedKmh > 0 ? speedKmh : 0.0;

      // Update positions
      gps.lat = newPos[0];
      gps.lng = newPos[1];
      gps.routeIndex = nextIndex;

      // Store history (up to last 30 positions for route trails)
      gps.history.push([newPos[0], newPos[1]]);
      if (gps.history.length > 30) {
        gps.history.shift();
      }

      // Geofence status checks
      this.geofences.forEach(fence => {
        const fenceDist = this.calculateDistance(gps.lat, gps.lng, fence.lat, fence.lng);
        const isInside = fenceDist <= fence.radius;
        const lastStatus = gps.lastGeofenceStatus[fence.id] || "outside";

        if (isInside && lastStatus === "outside") {
          // Trigger Enter event
          gps.lastGeofenceStatus[fence.id] = "inside";
          this.triggerGeofenceEvent(device, fence, "ENTERED");
        } else if (!isInside && lastStatus === "inside") {
          // Trigger Exit event
          gps.lastGeofenceStatus[fence.id] = "outside";
          this.triggerGeofenceEvent(device, fence, "EXITED");
        }
      });
    });
  }

  triggerGeofenceEvent(device, geofence, type) {
    const alertLevel = type === "EXITED" && geofence.id === "fence_santa_monica" ? "critical" : "warning";
    const msg = `Device ${device.name} (${device.id}) ${type} geofence boundary: "${geofence.name}".`;

    this.logActivity("geofence", `Geofence ${type}`, msg, alertLevel);
    
    // Create actual system alert
    const newAlert = {
      id: `alert_geo_${Date.now()}_${Math.floor(Math.random()*100)}`,
      deviceId: device.id,
      deviceName: device.name,
      sourceType: "geofence",
      sourceName: geofence.name,
      message: msg,
      level: alertLevel,
      timestamp: Date.now(),
      status: "active"
    };

    this.alerts.unshift(newAlert);
    if (this.onAlertCallback) this.onAlertCallback(newAlert);
  }

  // Alarm engine checking values against thresholds
  evaluateThresholds() {
    this.devices.forEach(device => {
      if (!device.connected) return;

      // Check battery level first (critical if < 15%)
      if (device.battery < 15 && device.battery > 0) {
        const alertId = `alert_bat_${device.id}`;
        const existing = this.alerts.find(a => a.id === alertId && a.status === "active");
        if (!existing) {
          const newAlert = {
            id: alertId,
            deviceId: device.id,
            deviceName: device.name,
            sourceType: "battery",
            sourceName: "Battery level",
            message: `${device.name} is running critically low on battery (${device.battery}% remaining).`,
            level: "critical",
            timestamp: Date.now(),
            status: "active"
          };
          this.alerts.unshift(newAlert);
          this.logActivity("system", "Critical Battery", `${device.id} battery drops below 15%`, "critical");
          if (this.onAlertCallback) this.onAlertCallback(newAlert);
        }
      } else if (device.battery >= 15 || device.battery === 0) {
        // Resolve battery alert if recharged (0 means dead, doesn't resolve)
        const alertIndex = this.alerts.findIndex(a => a.id === `alert_bat_${device.id}` && a.status === "active");
        if (alertIndex !== -1 && device.battery >= 15) {
          this.alerts[alertIndex].status = "resolved";
          this.alerts[alertIndex].resolvedTime = Date.now();
          this.logActivity("system", "Battery Restored", `${device.id} recharged to ${device.battery}%.`, "success");
        }
      }

      // Check specific sensor bounds
      device.sensors.forEach(sensor => {
        let isExceeded = false;
        if (sensor.thresholdType === "max") {
          isExceeded = sensor.value >= sensor.threshold;
        } else if (sensor.thresholdType === "min") {
          isExceeded = sensor.value <= sensor.threshold;
        } else if (sensor.thresholdType === "change") {
          // For motion/binary switches, trigger warning if matches threshold (e.g. PIR motion active = 1)
          isExceeded = sensor.value === sensor.threshold;
        }

        const alertId = `alert_${sensor.id}`;
        const existingAlertIndex = this.alerts.findIndex(a => a.id === alertId && a.status === "active");

        if (isExceeded) {
          if (existingAlertIndex === -1) {
            // New alert trigger
            const direction = sensor.thresholdType === "max" ? "exceeded upper" : "fell below lower";
            const level = (sensor.type.includes("Temperature") && sensor.value > 85) || 
                          (sensor.type.includes("Water") && sensor.thresholdType === "min" && sensor.value < 200)
                          ? "critical" : "warning";

            const newAlert = {
              id: alertId,
              deviceId: device.id,
              deviceName: device.name,
              sourceType: "sensor",
              sensorType: sensor.type,
              sourceName: sensor.name,
              message: `${device.name} ${sensor.name} reading: ${sensor.value}${sensor.unit} (${direction} threshold limit ${sensor.threshold}${sensor.unit}).`,
              level: level,
              timestamp: Date.now(),
              status: "active"
            };

            this.alerts.unshift(newAlert);
            this.logActivity(
              "sensor", 
              level === "critical" ? "Critical Sensor Limit" : "Sensor Limit Exceeded", 
              newAlert.message, 
              level
            );
            if (this.onAlertCallback) this.onAlertCallback(newAlert);
          } else {
            // Update value of current active alert message
            const direction = sensor.thresholdType === "max" ? "exceeded upper" : "fell below lower";
            this.alerts[existingAlertIndex].message = `${device.name} ${sensor.name} reading: ${sensor.value}${sensor.unit} (${direction} threshold limit ${sensor.threshold}${sensor.unit}).`;
          }
        } else {
          // Reading is normal - check if we should resolve active alert
          if (existingAlertIndex !== -1) {
            const resolvedAlert = this.alerts[existingAlertIndex];
            resolvedAlert.status = "resolved";
            resolvedAlert.resolvedTime = Date.now();
            
            this.logActivity(
              "sensor",
              "Sensor Alert Resolved",
              `${device.name} ${sensor.name} returned to normal levels: ${sensor.value}${sensor.unit}.`,
              "success"
            );
          }
        }
      });

      // Calculate health score dynamically
      let deviceHealth = 100;
      // Battery deductions
      if (device.battery < 20) deviceHealth -= 20;
      if (device.battery < 5) deviceHealth -= 30;
      
      // Active alert deductions
      const deviceActiveAlertsCount = this.alerts.filter(a => a.deviceId === device.id && a.status === "active").length;
      deviceHealth -= deviceActiveAlertsCount * 25;
      
      device.health = Math.max(0, deviceHealth);
    });
  }

  // System Health calculation
  calculateSystemHealth() {
    if (this.devices.length === 0) return 100;
    const totalHealth = this.devices.reduce((sum, d) => sum + d.health, 0);
    return Math.round(totalHealth / this.devices.length);
  }

  // Log system activity feed
  logActivity(type, title, message, alertLevel = "info") {
    const newActivity = {
      id: `act_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
      alertLevel
    };
    
    this.activities.unshift(newActivity);
    
    // Cap activity list to latest 50 items
    if (this.activities.length > 50) {
      this.activities.pop();
    }

    if (this.onActivityCallback) {
      this.onActivityCallback(newActivity);
    }
  }

  // Register a new device through manual input
  registerDevice(devicePayload) {
    const { id, name, type, location, hasTemp, hasHum, hasMotion, hasWater, gpsEnabled } = devicePayload;
    
    // Check if ID is unique
    if (this.devices.find(d => d.id === id)) {
      throw new Error(`Device ID "${id}" is already registered.`);
    }

    const sensors = [];
    if (hasTemp) {
      sensors.push({
        id: `${id}_temp`,
        name: "DHT11 Temperature Sensor",
        type: "DHT11 Temperature",
        value: 23.0,
        unit: "°C",
        threshold: 30.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => 23.0)
      });
    }
    if (hasHum) {
      sensors.push({
        id: `${id}_hum`,
        name: "DHT11 Humidity Sensor",
        type: "DHT11 Humidity",
        value: 50.0,
        unit: "%",
        threshold: 70.0,
        thresholdType: "max",
        history: Array.from({length: 15}, () => 50.0)
      });
    }
    if (hasMotion) {
      sensors.push({
        id: `${id}_motion`,
        name: "PIR Motion Sensor",
        type: "Motion Sensor",
        value: 0,
        unit: "status",
        threshold: 1,
        thresholdType: "change",
        history: Array.from({length: 15}, () => 0)
      });
    }
    if (hasWater) {
      sensors.push({
        id: `${id}_water`,
        name: "Water Depth Sensor",
        type: "Water Level Sensor",
        value: 300,
        unit: "mm",
        threshold: 750,
        thresholdType: "max",
        history: Array.from({length: 15}, () => 300)
      });
    }

    let gpsData = null;
    if (gpsEnabled) {
      // Pick random path from templates
      const routesKeys = Object.keys(GPS_ROUTES);
      const chosenRoute = routesKeys[Math.floor(Math.random() * routesKeys.length)];
      gpsData = {
        lat: GPS_ROUTES[chosenRoute][0][0],
        lng: GPS_ROUTES[chosenRoute][0][1],
        speed: 0.0,
        distance: 0,
        routeIndex: 0,
        routeName: chosenRoute,
        history: [[GPS_ROUTES[chosenRoute][0][0], GPS_ROUTES[chosenRoute][0][1]]],
        lastGeofenceStatus: {}
      };
    }

    const newDevice = {
      id,
      name,
      type,
      location,
      connected: true,
      battery: 100,
      health: 100,
      lastUpdated: Date.now(),
      gpsEnabled,
      gpsData,
      sensors
    };

    this.devices.push(newDevice);

    this.logActivity(
      "system",
      "Device Registered",
      `New device ${name} (${id}) added to monitoring boards successfully.`,
      "success"
    );

    return newDevice;
  }

  // Register custom geofence
  addGeofence(fencePayload) {
    const { name, lat, lng, radius } = fencePayload;
    const id = `fence_${Date.now()}`;
    const newFence = {
      id,
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius: parseInt(radius),
      color: "#ffd54f",
      alertsEnabled: true
    };
    
    this.geofences.push(newFence);
    this.logActivity(
      "system",
      "Geofence Created",
      `Geofence boundary "${name}" configured with ${radius}m radius limit.`,
      "info"
    );
    return newFence;
  }

  // Action methods
  rechargeDevice(deviceId) {
    const device = this.devices.find(d => d.id === deviceId);
    if (device) {
      device.battery = 100;
      device.health = 100;
      this.logActivity("system", "Device Maintenance", `Device ${deviceId} battery packs hot-swapped / recharged.`, "success");
    }
  }

  toggleDeviceConnection(deviceId) {
    const device = this.devices.find(d => d.id === deviceId);
    if (device) {
      device.connected = !device.connected;
      this.logActivity(
        "system",
        device.connected ? "Device Online" : "Device Offline",
        `Device ${device.name} (${device.id}) is now ${device.connected ? "Online" : "Offline"}.`,
        device.connected ? "success" : "danger"
      );
      
      // If going offline, clean up active alerts on it
      if (!device.connected) {
        this.alerts.forEach(alert => {
          if (alert.deviceId === deviceId && alert.status === "active") {
            alert.status = "resolved";
            alert.resolvedTime = Date.now();
          }
        });
      }
    }
  }
}

// Make simulator globally available in browser environment
window.simulator = new IoTSystemSimulator();
