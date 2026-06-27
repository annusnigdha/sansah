# IoT Alert Notification & Tracking Platform - Sansah Innovations

Enterprise-grade real-time IoT Device Monitoring, Geofencing, GPS Tracking, and Alarm Notification System.

## Technology Stack

- **Frontend**: React (Vite), Tailwind CSS, Leaflet Maps, Chart.js, Lucide Icons
- **Backend**: Node.js, Express, WebSockets (`ws`), SMTP Mail, SMS/WhatsApp simulation
- **Database**: PostgreSQL (with automatic SQLite fallback for zero-config local development)
- **Reporting**: PDF Export (un-corrupted via direct PDFKit buffer streams), CSV Export

## Features

1. **Dual Access Role Control**: Clean segmentation between `admin` (full hardware configuration, user viewing, metrics, exports) and `user` (restricted to own claimed devices, custom current readings setup, preference switches).
2. **Alert Threshold Engine**: Compares `current_value > max_value` real-time telemetry. Generates alert logs, dashboard banner toast alerts, SMTP email notifications, and simulated WhatsApp alerts.
3. **Pulsing GPS Tracks**: Standard Leaflet pins reflecting device speed, distance, connection status, and path trail tracks.
4. **Interactive Geofences**: Point-and-click to place circular boundaries. Entering or exiting boundaries immediately fires alerts and dispatches emails/WhatsApp notifications.
5. **PDF & CSV Exporter**: Custom PDFKit rendering to build styled incident logs.

## Setup & Running Instructions

### Prerequisites
A Node.js environment. If Node is not installed globally, we have packaged a portable Node.js environment directly under the `.node/` folder.

### 1. Run the Backend Server
Navigate to `backend` directory, install packages, and start the gateway:
```bash
cd backend
npm install
npm start
```
*Note: If NPM is missing on your path, use the bundled environment: `..\.node\node-v22.2.0-win-x64\node.exe ..\.node\node-v22.2.0-win-x64\node_modules\npm\bin\npm-cli.js install` and start with the local `node.exe`.*

### 2. Run the Frontend App
Navigate to `frontend` directory, install packages, and start the development server:
```bash
cd frontend
npm install
npm run dev
```

The frontend will run on [http://localhost:3000](http://localhost:3000).

---
*Developed by Sansah Innovations.*
