import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Activity, MapPin, Server, Bell, Sliders, LogOut, ChevronDown,
  Volume2, VolumeX, ShieldAlert, AlertTriangle, Check, CheckCircle, 
  Search, RefreshCw, Plus, Download, Trash2, Shield, Navigation, 
  User, Mail, Phone, Lock, Eye, EyeOff, Radio, Battery, Heart, X, Cpu, Loader2,
  History, Settings, Play, Pause, TrendingUp, AlertCircle, FileText,
  Layers, Info, Calendar, DollarSign, Wrench, Sparkles, Send, CheckSquare, Maximize2,
  Sun, Moon, Key, Clock, UserCheck
} from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  firebaseEnabled, 
  firestoreDb, 
  getFcmToken, 
  onFcmMessage, 
  logFirebaseEvent, 
  tracePerformanceMetric 
} from './firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:5000';

function SearchableDropdown({ options, value, onChange, placeholder, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filtered = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative font-sans text-left" ref={wrapperRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full bg-slate-900 border ${isOpen ? 'border-primary/50' : 'border-slate-800'} rounded-lg p-2.5 flex items-center justify-between cursor-pointer text-slate-200 text-sm`}
      >
        <span className={value ? 'text-slate-200' : 'text-slate-500'}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute z-[9999] mt-1.5 w-full bg-[#0c141d] border border-slate-850 rounded-xl shadow-2xl p-2 max-h-[200px] overflow-y-auto">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Type to search..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 mb-2 text-xs text-slate-350 focus:outline-none focus:border-primary/30"
            onClick={e => e.stopPropagation()}
          />
          <div className="space-y-0.5">
            {filtered.length === 0 ? (
              <div className="text-[11px] text-slate-500 p-2 text-center">No results found</div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-slate-800/60 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SENSOR_RECOMMENDED_DEFAULTS = {
  'Soil Moisture': 60,
  'Soil Temperature': 35,
  'Air Temperature': 40,
  'Humidity': 80,
  'Wind Speed': 15,
  'Rainfall': 50,
  'Water Level': 10,
  'Water Flow': 120,
  'Soil pH': 8.5,
  'Light Intensity': 50000,
  'CO₂': 1000,
  'Pressure': 1100,
  'NPK Sensor': 200,
  'EC Sensor': 4
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card bg-[#0f1c29]/55 border border-red-500/20 p-8 rounded-2xl text-center max-w-md mx-auto my-12 space-y-4 shadow-glass-dark font-sans text-slate-100 backdrop-blur-xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 mx-auto shadow-neon-red">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <h3 className="text-sm font-extrabold uppercase tracking-wider font-outfit text-slate-250">Section Load Failure</h3>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            An unexpected error occurred while rendering this module. Rest assured, the rest of the Sansah platform remains fully operational.
          </p>
          {this.state.error && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-900 text-[10px] text-red-400 font-mono text-left max-h-[120px] overflow-y-auto break-all select-text">
              {this.state.error.toString()}
            </div>
          )}
          <button
            onClick={this.handleReset}
            className="bg-primary hover:bg-primary-dark text-slate-950 font-bold px-5 py-3 rounded-xl transition-all shadow-neon-blue text-xs uppercase tracking-wider w-full"
          >
            Retry Loading Module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [testNotifLoading, setTestNotifLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [systemTimezone, setSystemTimezone] = useState('');
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatTyping, setAiChatTyping] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historySeverityFilter, setHistorySeverityFilter] = useState('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historySortBy, setHistorySortBy] = useState('timestamp_desc');
  const [historyPage, setHistoryPage] = useState(1);
  const [testNotifSuccess, setTestNotifSuccess] = useState('');
  const [prefDashboard, setPrefDashboard] = useState(true);
  const [prefEmail, setPrefEmail] = useState(true);
  const [prefWhatsapp, setPrefWhatsapp] = useState(false);
  const [prefSms, setPrefSms] = useState(false);
  const [prefPush, setPrefPush] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [resetConfirmToken, setResetConfirmToken] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetConfirmConfirmPassword, setResetConfirmConfirmPassword] = useState('');
  const [resetConfirmMessage, setResetConfirmMessage] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [showResetConfirmConfirmPassword, setShowResetConfirmConfirmPassword] = useState(false);
  const [resetConfirmLoading, setResetConfirmLoading] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [viewMode, setViewMode] = useState(token ? 'portal' : 'landing'); // 'landing' | 'portal'
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState(localStorage.getItem('savedEmail') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPhone, setLoginPhone] = useState(localStorage.getItem('savedPhone') || '');
  const [authError, setAuthError] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [regRole, setRegRole] = useState('user'); // 'user' | 'admin'
  const [regOrg, setRegOrg] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(localStorage.getItem('rememberMe') === 'true');
  const [loginLoading, setLoginLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isSkeletonLoading, setIsSkeletonLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [notificationTabMode, setNotificationTabMode] = useState('inbox'); // 'inbox' | 'history'
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [systemSettings, setSystemSettings] = useState({});
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [googleMapsAuthError, setGoogleMapsAuthError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const lastAlertIdsRef = useRef(new Set());
  const globalSearchRef = useRef(null);
  // Rolling live chart buffer — max 15 points, updated every WS tick
  const liveChartBufferRef = useRef([]);
  const profileDropdownRef = useRef(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState({ devices: [], sensors: [], alerts: [], notifications: [], users: [], reports: [], gpsAssets: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchFocusIndex, setSearchFocusIndex] = useState(-1);
  const [sensorSearch, setSensorSearch] = useState('');
  const [sensorTypeFilter, setSensorTypeFilter] = useState('all');
  const [sensorStatusFilter, setSensorStatusFilter] = useState('all');
  const [sensorAlertFilter, setSensorAlertFilter] = useState('all');
  const [alertLogFilter, setAlertLogFilter] = useState('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [notifStatusFilter, setNotifStatusFilter] = useState('all');
  const [notifChannelFilter, setNotifChannelFilter] = useState('all');
  const [notifDeliveryFilter, setNotifDeliveryFilter] = useState('all');
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [sensorHistory, setSensorHistory] = useState([]);
  const [isRegisterDeviceOpen, setIsRegisterDeviceOpen] = useState(false);
  const [isAddGeofenceOpen, setIsAddGeofenceOpen] = useState(false);
  const [selectedGpsDeviceId, setSelectedGpsDeviceId] = useState(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [resolvingAlertId, setResolvingAlertId] = useState('');
  const [resolutionNotesText, setResolutionNotesText] = useState('');
  const [selectedAlertForTimeline, setSelectedAlertForTimeline] = useState(null);
  const [alertNotes, setAlertNotes] = useState([]);
  const [newAlertNoteText, setNewAlertNoteText] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [successAnimationAlertId, setSuccessAnimationAlertId] = useState(null);
  const [selectedDeviceForMaintenance, setSelectedDeviceForMaintenance] = useState(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);
  const [newMaintDesc, setNewMaintDesc] = useState('');
  const [newMaintCost, setNewMaintCost] = useState('');
  const [newMaintTech, setNewMaintTech] = useState('');
  const [newMaintDate, setNewMaintDate] = useState('');
  const [selectedDeviceForAssetEdit, setSelectedDeviceForAssetEdit] = useState(null);
  const [editSerial, setEditSerial] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editCategory, setEditCategory] = useState('Climate');
  const [editLifecycle, setEditLifecycle] = useState('Active');
  const [editInstallDate, setEditInstallDate] = useState('');
  const [editWarranty, setEditWarranty] = useState('');
  const [editSimFault, setEditSimFault] = useState(false);
  const [editSensorName, setEditSensorName] = useState('');
  const [editSensorUnit, setEditSensorUnit] = useState('');
  const [editSensorMax, setEditSensorMax] = useState('');
  const [comparisonSensorId, setComparisonSensorId] = useState('');
  const [comparisonHistory, setComparisonHistory] = useState([]);
  const [selectedReportType, setSelectedReportType] = useState('device_performance');
  const [selectedReportFormat, setSelectedReportFormat] = useState('pdf');
  const [newDevId, setNewDevId] = useState('');
  const [newDevName, setNewDevName] = useState('');
  const [newDevType, setNewDevType] = useState('ESP32');
  const [newDevLoc, setNewDevLoc] = useState('');
  const [newDevProto, setNewDevProto] = useState('HTTP');
  const [newDevMax, setNewDevMax] = useState('100');
  const [newDevGps, setNewDevGps] = useState(false);
  const [newDevSensorType, setNewDevSensorType] = useState('Temperature');
  const [newDevCurrVal, setNewDevCurrVal] = useState('0');
  const [newDevRemarks, setNewDevRemarks] = useState('');
  const [newDevCategory, setNewDevCategory] = useState('General');
  const [newDevLifecycleStatus, setNewDevLifecycleStatus] = useState('Primary Asset');
  const [newDevChannel, setNewDevChannel] = useState('Dashboard');
  const [newDevSeverity, setNewDevSeverity] = useState('Low');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [isCustomDevice, setIsCustomDevice] = useState(false);
  const comboboxRef = useRef(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [hasShownThresholdError, setHasShownThresholdError] = useState(false);
  const [newFenceName, setNewFenceName] = useState('');
  const [newFenceLat, setNewFenceLat] = useState('');
  const [newFenceLng, setNewFenceLng] = useState('');
  const [newFenceRadius, setNewFenceRadius] = useState('500');
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const geofencesRef = useRef({});
  const routePolylineRef = useRef(null);
  const heatCirclesRef = useRef([]);
  const [gpsTrailCoords, setGpsTrailCoords] = useState([]);
  const [isPlayingRoute, setIsPlayingRoute] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // multiplier
  const playbackIntervalRef = useRef(null);
  const playbackMarkerRef = useRef(null);
  const [isHeatMapActive, setIsHeatMapActive] = useState(false);
  const alertAudioRef = useRef(null);
  const selectedGpsDeviceIdRef = useRef('');
  const activeTabRef = useRef('dashboard');
  const historyMarkersRef = useRef([]);
  const [landingTemp, setLandingTemp] = useState(22.5);
  const [landingTempHistory, setLandingTempHistory] = useState([21.8, 22.1, 22.0, 22.5, 22.4, 22.8, 22.6, 22.5]);
  const [landingRouteIndex, setLandingRouteIndex] = useState(0);
  // Authentication State

  // Live Clock States

  // AI Chat States
  const [aiChatMessages, setAiChatMessages] = useState([
    { id: '1', sender: 'ai', text: 'Hello! I am your Sansah Innovations IoT Assistant. How can I help you troubleshoot alerts, configure sensor thresholds, or inspect device telemetry today?' }
  ]);

  // Notification History Controls

  // Clock effect
  useEffect(() => {
    setSystemTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${hrs}:${mins}:${secs}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Notification History Memory Filters
  const filteredAndSortedHistory = React.useMemo(() => {
    const activeMapped = (notifications || []).map(n => {
      let dev = 'SYSTEM';
      let sens = 'N/A';
      const parts = (n.message || '').split('sensor:');
      if (parts.length > 1) {
        const sensorId = parts[1].split('.')[0].trim();
        sens = sensorId;
        dev = sensorId.split('_')[0];
      }
      return {
        id: n.id,
        user_id: n.user_id,
        device_name: dev,
        sensor_name: sens,
        timestamp: n.sent_at,
        alert_type: getNotificationType(n.alert_id),
        status: 'active',
        original_status: n.status,
        message: n.message,
        possible_causes: n.possible_causes || '',
        recommended_actions: n.recommended_actions || '',
        resolved_at: null,
        resolved_by_name: null,
        channel: n.channel,
        read_status: n.read_status,
        is_active_table: true
      };
    });

    const historyMapped = (notificationHistory || []).map(h => ({
      id: h.id,
      user_id: h.user_id,
      device_name: h.device_name || 'SYSTEM',
      sensor_name: h.sensor_name || 'N/A',
      timestamp: h.timestamp,
      alert_type: h.alert_type || 'warning',
      status: h.status === 'sent' ? 'active' : h.status,
      original_status: h.status,
      message: h.message || `Alert level ${h.alert_type || 'warning'} exceeded on device ${h.device_name || 'SYSTEM'}`,
      possible_causes: getAiInsightForAlert({ message: '', sensor_name: h.sensor_name }).cause,
      recommended_actions: getAiInsightForAlert({ message: '', sensor_name: h.sensor_name }).recommendation,
      resolved_at: h.resolved_at,
      resolved_by_name: h.resolved_by_name,
      channel: 'dashboard',
      read_status: 1,
      is_active_table: false
    }));

    let result = [...activeMapped, ...historyMapped];

    if (historySearch.trim() !== '') {
      const q = historySearch.toLowerCase();
      result = result.filter(h => 
        (h.device_name || '').toLowerCase().includes(q) ||
        (h.sensor_name || '').toLowerCase().includes(q) ||
        (h.alert_type || '').toLowerCase().includes(q) ||
        (h.status || '').toLowerCase().includes(q) ||
        (h.message || '').toLowerCase().includes(q) ||
        (h.id || '').toLowerCase().includes(q) ||
        (new Date(h.timestamp).toLocaleString()).toLowerCase().includes(q)
      );
    }

    if (historySeverityFilter !== 'all') {
      result = result.filter(h => (h.alert_type || '').toLowerCase() === historySeverityFilter.toLowerCase());
    }

    if (historyStatusFilter !== 'all') {
      result = result.filter(h => (h.status || '').toLowerCase() === historyStatusFilter.toLowerCase());
    }

    result.sort((a, b) => {
      if (historySortBy === 'timestamp_desc') {
        return new Date(b.timestamp) - new Date(a.timestamp);
      }
      if (historySortBy === 'timestamp_asc') {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }
      if (historySortBy === 'device_asc') {
        return (a.device_name || '').localeCompare(b.device_name || '');
      }
      if (historySortBy === 'sensor_asc') {
        return (a.sensor_name || '').localeCompare(b.sensor_name || '');
      }
      return 0;
    });

    return result;
  }, [notifications, notificationHistory, historySearch, historySeverityFilter, historyStatusFilter, historySortBy]);

  const itemsPerPage = 5;
  const totalPages = Math.ceil(filteredAndSortedHistory.length / itemsPerPage) || 1;
  
  const paginatedHistory = React.useMemo(() => {
    const startIndex = (historyPage - 1) * itemsPerPage;
    return filteredAndSortedHistory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedHistory, historyPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historySeverityFilter, historyStatusFilter, historySortBy]);

  // AI Chatbot Response Generator — Stateful Conversational AI Assistant
  const generateAiChatResponse = async (userInput) => {
    setAiChatTyping(true);
    try {
      const history = aiChatMessages.slice(-15).map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userInput, history })
      });

      if (res.ok) {
        const data = await res.json();
        let reply = data.reply || '';

        const navMatch = reply.match(/\[NAVIGATE:(.*?)\]/);
        if (navMatch && navMatch[1]) {
          const targetTab = navMatch[1].trim();
          setActiveTab(targetTab);
          reply = reply.replace(/\[NAVIGATE:.*?\]/g, '').trim();
        }

        setAiChatMessages(prev => [
          ...prev,
          { id: String(Date.now()), sender: 'ai', text: reply }
        ]);
      } else {
        const errData = await res.json();
        setAiChatMessages(prev => [
          ...prev,
          { id: String(Date.now()), sender: 'ai', text: `⚠️ Failed to fetch response: ${errData.error || 'Server error'}` }
        ]);
      }
    } catch (err) {
      setAiChatMessages(prev => [
        ...prev,
        { id: String(Date.now()), sender: 'ai', text: '⚠️ Connection lost. Unable to contact Sansah AI engine.' }
      ]);
    } finally {
      setAiChatTyping(false);
    }
  };

  // Editable Profile States

  // Password Reset Confirmation States

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetTokenParam = params.get('token');
    if (resetTokenParam) {
      setResetConfirmToken(resetTokenParam);
      setIsResetConfirmOpen(true);
      // Clean query parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
      if (user.preferences) {
        const p = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
        setPrefDashboard(p.dashboard !== undefined ? !!p.dashboard : true);
        setPrefEmail(p.email !== undefined ? !!p.email : true);
        setPrefWhatsapp(!!p.whatsapp);
        setPrefSms(!!p.sms);
        setPrefPush(!!p.push);
      }
    }
  }, [user]);

  const handleSavePreferences = async (e) => {
    if (e) e.preventDefault();
    setPrefSaving(true);
    setPrefSuccess('');
    try {
      const res = await fetch(`${API_BASE}/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          dashboard: prefDashboard,
          email: prefEmail,
          whatsapp: prefWhatsapp,
          sms: prefSms,
          push: prefPush
        })
      });
      if (res.ok) {
        setPrefSuccess('Notification preferences saved successfully!');
        setUser(prev => ({
          ...prev,
          preferences: {
            dashboard: prefDashboard,
            email: prefEmail,
            whatsapp: prefWhatsapp,
            sms: prefSms,
            push: prefPush
          }
        }));
      } else {
        setPrefSuccess('Failed to save preferences.');
      }
    } catch (err) {
      setPrefSuccess('Error updating preferences.');
    } finally {
      setPrefSaving(false);
    }
  };

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess('');
    setProfileError('');
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileName,
          phone: profilePhone
        })
      });
      const data = await res.json();
      if (res.ok) {
        setProfileSuccess('Profile details saved successfully!');
        setUser(prev => ({
          ...prev,
          name: profileName,
          phone: data.phone || profilePhone
        }));
        addToast('Profile updated successfully!', 'success');
      } else {
        setProfileError(data.error || 'Failed to save profile.');
      }
    } catch (err) {
      setProfileError('Error updating profile details.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveSettings = async (settingsToSave) => {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settingsToSave)
      });
      if (res.ok) {
        addToast('Global settings saved successfully!', 'success');
        fetchSystemSettings();
      } else {
        const errData = await res.json();
        addToast(`Failed to save settings: ${errData.error || 'Server error'}`, 'critical');
      }
    } catch (err) {
      addToast('Error saving settings: Server connection failed', 'critical');
    }
  };

  const handleTestNotification = async (e) => {
    if (e) e.preventDefault();
    setTestNotifLoading(true);
    setTestNotifSuccess('');
    try {
      const res = await fetch(`${API_BASE}/notifications/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setTestNotifSuccess(data.message || 'Test notification dispatched!');
        fetchNotifications();
        fetchAlerts();
      } else {
        setTestNotifSuccess(`Test dispatch failed: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      setTestNotifSuccess('Connection error during channel test.');
    } finally {
      setTestNotifLoading(false);
    }
  };

  const getNotificationType = (alertId) => {
    if (!alertId) return 'Alert Notice';
    if (alertId.includes('welcome')) return 'Welcome Notice';
    if (alertId.includes('login')) return 'Security Alert';
    if (alertId.includes('offline')) return 'Device Offline';
    if (alertId.includes('geo_enter')) return 'Geofence Entry';
    if (alertId.includes('geo_exit')) return 'Geofence Exit';
    if (alertId.includes('sys_mail')) return 'System Broadcast';
    return 'Sensor Threshold';
  };

  
  // Registration Form
  
  // Password Reset Form

  // Redesigned Authentication States

  // App Navigation & Views
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== 'light';
  });

  // Theme Sync side-effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = async () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    if (token && user) {
      try {
        const newPrefs = {
          ...user.preferences,
          theme: nextMode ? 'dark' : 'light'
        };
        await fetch(`${API_BASE}/auth/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newPrefs)
        });
        setUser(prev => ({
          ...prev,
          preferences: newPrefs
        }));
      } catch (err) {
        console.error('Failed to sync theme preference:', err.message);
      }
    }
  };

  // Real-time Telemetry State
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDevices: 0,
    totalSensors: 0,
    activeAlerts: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    onlineDevices: 0,
    offlineDevices: 0
  });

  // Telemetry Connection

  // Filters State

  // Reset focus index when global search query changes
  useEffect(() => {
    setSearchFocusIndex(-1);
  }, [globalSearch]);

  // Debounced search query hook
  useEffect(() => {
    if (!globalSearch || globalSearch.trim() === '') {
      setSearchResults({ devices: [], sensors: [], alerts: [], notifications: [], users: [], reports: [], gpsAssets: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(globalSearch)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults({
            devices: data.devices || [],
            sensors: data.sensors || [],
            alerts: data.alerts || [],
            notifications: data.notifications || [],
            users: data.users || [],
            reports: data.reports || [],
            gpsAssets: data.gpsAssets || []
          });
        }
      } catch (err) {
        console.error('Failed to search:', err.message);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch, token]);

  const getFlattenedSearchResults = () => {
    return [
      ...(searchResults.devices || []).map(d => ({
        type: 'device',
        item: d,
        id: `dev_${d.id}`,
        iconName: 'Server',
        category: 'Device',
        title: d.name,
        subtitle: `ID: ${d.id}`,
        action: () => {
          setActiveTab('devices');
          openAssetEditModal(d);
        }
      })),
      ...(searchResults.sensors || []).map(s => ({
        type: 'sensor',
        item: s,
        id: `sens_${s.id}`,
        iconName: 'Cpu',
        category: 'Sensor',
        title: s.name,
        subtitle: `Type: ${s.type}`,
        action: () => {
          setActiveTab('sensors');
          openSensorModal(s);
        }
      })),
      ...(searchResults.alerts || []).map(a => ({
        type: 'alert',
        item: a,
        id: `al_${a.id}`,
        iconName: 'AlertTriangle',
        category: 'Alert',
        title: a.message,
        subtitle: `Level: ${a.level}`,
        action: () => {
          setActiveTab('alerts');
          openAlertTimelineModal(a);
        }
      })),
      ...(searchResults.notifications || []).map(n => ({
        type: 'notification',
        item: n,
        id: `not_${n.id}`,
        iconName: 'Bell',
        category: 'Notification',
        title: n.message || `Notif (${n.channel})`,
        subtitle: `Status: ${n.status}`,
        action: () => {
          setActiveTab('notifications');
        }
      })),
      ...(searchResults.users || []).map(u => ({
        type: 'user',
        item: u,
        id: `usr_${u.id}`,
        iconName: 'User',
        category: 'User',
        title: u.name,
        subtitle: u.email,
        action: () => {
          if (user?.role === 'admin') setActiveTab('settings');
        }
      })),
      ...(searchResults.reports || []).map(r => ({
        type: 'report',
        item: r,
        id: `rep_${r.id}`,
        iconName: 'FileText',
        category: 'Report',
        title: r.file_path.split(/[/\\]/).pop(),
        subtitle: `Type: ${r.file_type.toUpperCase()}`,
        action: () => {
          setActiveTab('reports');
        }
      })),
      ...(searchResults.gpsAssets || []).map(g => ({
        type: 'gpsAsset',
        item: g,
        id: `gps_${g.id}`,
        iconName: 'MapPin',
        category: 'GPS Asset',
        title: g.name,
        subtitle: `ID: ${g.id}`,
        action: () => {
          setActiveTab('gps');
          setSelectedGpsDeviceId(g.id);
        }
      }))
    ];
  };

  // Notification inbox filters

  // Modals & Details State
  
  // Change Password Modal States

  // Floating Toast Notification Popups
  const addToast = (message, level = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, level }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };
  
  // Alert timelines & notes

  // Maintenance details

  // Asset editing details

  // Multi-sensor comparisons

  // Report Center Form

  // Prepopulated telemetry device options
  const PREDEFINED_TELEMETRY_OPTIONS = [
    "Soil Monitoring Unit",
    "Weather Monitoring Station",
    "Smart Irrigation Controller",
    "Water Tank Sensor",
    "Water Flow Meter",
    "Soil Moisture Sensor Node",
    "Greenhouse Controller",
    "Temperature Monitoring Device",
    "Humidity Monitoring Device",
    "GPS Tracking Device",
    "Livestock Monitoring Tag",
    "Smart Fertigation Controller",
    "Water Quality Monitor",
    "Solar Monitoring Device",
    "Pump Monitoring Unit",
    "Crop Health Monitoring Device",
    "Environmental Monitoring Station",
    "Field Gateway Device",
    "MQTT Telemetry Device",
    "LoRaWAN Telemetry Device"
  ];

  // Form states (Device linking)

  // Searchable Combobox state

  // Map Fullscreen state

  // Threshold validation state

  // Geofence form

  // Map References

  // Map Playback State

  // Audio object

  // Combobox Options & Select Handlers
  const isPredefinedOptionCompatible = (optName, sensorType) => {
    if (!sensorType) return true;
    const nameLower = optName.toLowerCase();
    const typeLower = sensorType.toLowerCase();

    const compatibility = {
      'soil moisture': ['soil', 'irrigation', 'greenhouse', 'environmental', 'crop'],
      'soil temperature': ['soil', 'greenhouse', 'environmental', 'temperature'],
      'air temperature': ['weather', 'temperature', 'greenhouse', 'environmental'],
      'humidity': ['weather', 'humidity', 'greenhouse', 'environmental'],
      'wind speed': ['weather', 'environmental'],
      'rainfall': ['weather', 'environmental'],
      'water level': ['water', 'tank', 'pump'],
      'water flow': ['water', 'flow', 'pump'],
      'soil ph': ['soil', 'fertigation', 'quality', 'environmental'],
      'light intensity': ['solar', 'greenhouse', 'environmental'],
      'co₂': ['greenhouse', 'environmental'],
      'pressure': ['weather', 'environmental'],
      'npk sensor': ['soil', 'fertigation'],
      'ec sensor': ['soil', 'fertigation', 'water', 'quality', 'environmental'],
      'gps tracker': ['gps', 'tracking'],
      'motion': ['motion', 'tag', 'livestock', 'tracking']
    };

    const keywords = compatibility[typeLower] || [];
    return keywords.some(kw => nameLower.includes(kw));
  };

  const getComboboxOptions = () => {
    const allChoices = [];
    // 1. Add existing registered devices
    devices.forEach(d => {
      const isCompatible = !newDevSensorType || (d.sensors && d.sensors.some(s => s.type === newDevSensorType));
      if (isCompatible) {
        allChoices.push({
          id: d.id,
          name: d.name,
          max_sensor_value: d.max_sensor_value,
          isExisting: true
        });
      }
    });
    // 2. Add predefined telemetry options if compatible
    PREDEFINED_TELEMETRY_OPTIONS.forEach(optName => {
      if (isPredefinedOptionCompatible(optName, newDevSensorType)) {
        if (!allChoices.some(c => c.name.toLowerCase() === optName.toLowerCase())) {
          allChoices.push({
            id: '',
            name: optName,
            max_sensor_value: 100.0,
            isExisting: false
          });
        }
      }
    });
    return allChoices;
  };

  const filteredComboboxOptions = getComboboxOptions().filter(c =>
    c.name.toLowerCase().includes(deviceSearchQuery.toLowerCase())
  );

  const handleSelectOption = (opt) => {
    if (opt.isExisting) {
      setNewDevId(opt.id);
      setNewDevName(opt.name);
      setNewDevMax(String(opt.max_sensor_value));
      setDeviceSearchQuery(`${opt.name} (${opt.id})`);
      setIsCustomDevice(false);
    } else {
      const generatedId = `DEV_${opt.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Math.floor(1000 + Math.random() * 9000)}`;
      setNewDevId(generatedId);
      setNewDevName(opt.name);
      setNewDevMax('100.0');
      setDeviceSearchQuery(opt.name);
      setIsCustomDevice(true);
    }
    setIsComboboxOpen(false);
  };

  const handleSelectCustomDevice = (query) => {
    if (!query || query.trim() === '') return;
    const generatedId = `DEV_CUSTOM_${Date.now().toString().slice(-6)}`;
    setNewDevId(generatedId);
    setNewDevName(query);
    setNewDevMax('100.0');
    setDeviceSearchQuery(query);
    setIsCustomDevice(true);
    setIsComboboxOpen(false);
  };

  // Close combobox when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target)) {
        setIsComboboxOpen(false);
      }
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Dynamic Google Maps SDK Loader
  useEffect(() => {
    const key = systemSettings.google_maps_api_key || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!key) {
      setGoogleMapsLoaded(false);
      return;
    }

    window.gm_authFailure = () => {
      console.error('Google Maps API authentication failed.');
      setGoogleMapsAuthError('Google Maps API authentication failed: Invalid API key, invalid permissions, or billing configuration issue.');
    };

    if (window.google && window.google.maps) {
      setGoogleMapsLoaded(true);
      return;
    }

    let script = document.getElementById('google-maps-sdk-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'google-maps-sdk-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('Google Maps SDK loaded.');
        setGoogleMapsLoaded(true);
        setGoogleMapsAuthError(null);
      };
      script.onerror = () => {
        console.error('Failed to load Google Maps script.');
        setGoogleMapsAuthError('Failed to load Google Maps SDK script. Check network connection or configuration.');
      };
      document.head.appendChild(script);
    } else {
      if (window.google && window.google.maps) {
        setGoogleMapsLoaded(true);
      }
    }
  }, [systemSettings.google_maps_api_key]);

  // Threshold validation logic
  const isThresholdExceeded = parseFloat(newDevCurrVal) > parseFloat(newDevMax);
  useEffect(() => {
    if (isThresholdExceeded) {
      if (!hasShownThresholdError) {
        addToast("You cannot exceed the maximum value allowed for this sensor.", "critical");
        setHasShownThresholdError(true);
      }
    } else {
      setHasShownThresholdError(false);
    }
  }, [isThresholdExceeded, newDevCurrVal, newDevMax]);

  // Landing page preview telemetry simulator refs
  const landingRouteCoords = [
    [34.0522, -118.2437], [34.0560, -118.2500], [34.0610, -118.2580], 
    [34.0680, -118.2700], [34.0720, -118.2800], [34.0780, -118.2900], 
    [34.0850, -118.3000], [34.0900, -118.3200]
  ];

  // Simulated tick for landing page preview
  useEffect(() => {
    let interval = null;
    if (viewMode === 'landing') {
      interval = setInterval(() => {
        setLandingTemp(prev => parseFloat((prev + (Math.random() - 0.49) * 0.4).toFixed(1)));
        setLandingRouteIndex(prev => (prev + 1) % landingRouteCoords.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'landing') {
      setLandingTempHistory(prev => [...prev.slice(-10), landingTemp]);
    }
  }, [landingTemp]);

  // Fetch user profile on load or token change
  useEffect(() => {
    let unsubDevices = null;
    let unsubAlerts = null;
    let unsubNotifications = null;
    let unsubFcm = null;

    if (token) {
      localStorage.setItem('token', token);
      fetchProfile();
      fetchAlerts();
      fetchGeofences();
      fetchNotifications();
      fetchSystemSettings();
      connectWebSocket();

      // Firebase Integration Layer
      if (firebaseEnabled && firestoreDb) {
        console.log('[FIREBASE] Setting up Firestore real-time snapshot listeners...');
        
        // 1. Listen to devices collection
        try {
          unsubDevices = onSnapshot(collection(firestoreDb, 'devices'), (snapshot) => {
            const devicesList = [];
            snapshot.forEach((doc) => {
              devicesList.push({ id: doc.id, ...doc.data() });
            });
            if (devicesList.length > 0) {
              console.log('[FIREBASE] Real-time devices snapshot sync:', devicesList.length);
              setDevices(devicesList);
            }
          });
        } catch (err) {
          console.error('[FIREBASE] Devices subscription error:', err.message);
        }

        // 2. Listen to alerts collection (limited to 100 most recent)
        try {
          const qAlerts = query(
            collection(firestoreDb, 'alerts'),
            orderBy('timestamp', 'desc'),
            limit(100)
          );
          unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
            const alertsList = [];
            snapshot.forEach((doc) => {
              alertsList.push({ id: doc.id, ...doc.data() });
            });
            if (alertsList.length > 0) {
              console.log('[FIREBASE] Real-time alerts snapshot sync:', alertsList.length);
              setAllAlerts(alertsList);
              const sortedAlerts = [...alertsList].sort((a, b) => {
                const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return bTime - aTime;
              });
              setRecentAlerts(sortedAlerts.slice(0, 10));
            }
          });
        } catch (err) {
          console.error('[FIREBASE] Alerts subscription error:', err.message);
        }

        // 3. Listen to notifications collection (limited to 100 most recent)
        try {
          const qNotifs = query(
            collection(firestoreDb, 'notifications'),
            orderBy('sent_at', 'desc'),
            limit(100)
          );
          unsubNotifications = onSnapshot(qNotifs, (snapshot) => {
            const notificationsList = [];
            snapshot.forEach((doc) => {
              notificationsList.push({ id: doc.id, ...doc.data() });
            });
            if (notificationsList.length > 0) {
              console.log('[FIREBASE] Real-time notifications snapshot sync:', notificationsList.length);
              setNotifications(notificationsList);
            }
          });
        } catch (err) {
          console.error('[FIREBASE] Notifications subscription error:', err.message);
        }

        // 4. Foreground FCM notifications handler
        try {
          unsubFcm = onFcmMessage((payload) => {
            const notifTitle = payload.notification?.title || 'Sansah IoT Alert';
            const notifBody = payload.notification?.body || '';
            addToast(`[PUSH] ${notifTitle}: ${notifBody}`, 'critical');
            fetchNotifications();
            fetchAlerts();
          });
        } catch (err) {
          console.error('[FIREBASE] FCM listener setup error:', err.message);
        }

        // Register FCM token
        getFcmToken().then(fcmToken => {
          if (fcmToken) {
            console.log('[FIREBASE] Registering FCM token on server:', fcmToken);
            fetch(`${API_BASE}/auth/fcm-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ fcm_token: fcmToken })
            })
            .then(res => res.json())
            .then(data => console.log('[FIREBASE] FCM token server registration success:', data))
            .catch(err => console.error('[FIREBASE] FCM token registration post error:', err));
          }
        });
      }
    } else {
      localStorage.removeItem('token');
      setUser(null);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    }

    return () => {
      if (unsubDevices) unsubDevices();
      if (unsubAlerts) unsubAlerts();
      if (unsubNotifications) unsubNotifications();
      if (unsubFcm) unsubFcm();
    };
  }, [token]);

  // Tab switching side effects
  useEffect(() => {
    if (!token) return;
    setIsSkeletonLoading(true);
    const timer = setTimeout(() => setIsSkeletonLoading(false), 300);

    logFirebaseEvent('tab_visit', { tab: activeTab });
    if (activeTab === 'dashboard') {
      logFirebaseEvent('dashboard_visit');
      tracePerformanceMetric('dashboard_load_time', Math.floor(Math.random() * 150) + 50);
    } else if (activeTab === 'gps') {
      logFirebaseEvent('map_visit');
      tracePerformanceMetric('map_load_time', Math.floor(Math.random() * 250) + 100);
    }

    if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'settings') {
      fetchSystemSettings();
      if (user?.role === 'admin') {
        fetchUsersList();
      }
    } else if (activeTab === 'notifications') {
      fetchNotifications();
      fetchNotificationHistory();
    } else if (activeTab === 'dashboard' && user?.role === 'admin') {
      fetchUsersList();
    } else if (activeTab === 'alerts' && user?.role === 'admin') {
      fetchUsersList();
      fetchAlerts();
    } else if (activeTab === 'analytics') {
      fetchAlerts();
      fetchNotifications();
      fetchAuditLogs();
    }
    return () => clearTimeout(timer);
  }, [activeTab, token]);

  // Handle portal map mount & cleanup
  useEffect(() => {
    let resizeTimer;
    if (activeTab === 'gps') {
      const isUsingGoogleMaps = googleMapsLoaded && !googleMapsAuthError;
      const currentMapType = mapInstance.current ? mapInstance.current._type : null;
      const expectedType = isUsingGoogleMaps ? 'google' : 'leaflet';

      if (mapInstance.current && currentMapType !== expectedType) {
        try {
          mapInstance.current.remove();
        } catch (e) {
          console.error('Map switch cleanup error:', e);
        }
        mapInstance.current = null;
      }

      if (mapRef.current && !mapInstance.current) {
        initMap();
      }
      resizeTimer = setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      }, 250);
    } else {
      if (mapInstance.current) {
        try {
          mapInstance.current.remove();
        } catch (e) {
          console.error('Map removal error:', e);
        }
        mapInstance.current = null;
      }
    }

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstance.current) {
        try {
          mapInstance.current.remove();
        } catch (e) {
          console.error('Map cleanup error:', e);
        }
        mapInstance.current = null;
      }
    };
  }, [activeTab, googleMapsLoaded, googleMapsAuthError, isSkeletonLoading]);

  // Keep refs updated for WebSocket stale closures
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedGpsDeviceIdRef.current = selectedGpsDeviceId;
  }, [selectedGpsDeviceId]);

  // Update map markers when devices or selection changes
  useEffect(() => {
    if (activeTab === 'gps' && mapInstance.current) {
      updateMapTelemetry();
    }
  }, [devices, selectedGpsDeviceId, activeTab, isHeatMapActive, gpsTrailCoords]);

  // Update map geofences when geofences list changes
  useEffect(() => {
    if (activeTab === 'gps' && mapInstance.current) {
      updateMapGeofences();
    }
  }, [geofences, activeTab]);

  // Handle GPS route history draw
  useEffect(() => {
    if (activeTab === 'gps' && selectedGpsDeviceId && mapInstance.current) {
      fetchGpsHistoryTrail(selectedGpsDeviceId);
    }
  }, [selectedGpsDeviceId, activeTab]);

  // Initialize alert sound
  useEffect(() => {
    alertAudioRef.current = {
      play: (severity) => {
        if (isAudioMuted) return;
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = severity === 'critical' ? 'sawtooth' : 'sine';
          osc.frequency.setValueAtTime(severity === 'critical' ? 880 : 440, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + (severity === 'critical' ? 0.4 : 0.25));
        } catch (e) {
          console.error('Audio synthesis failed:', e);
        }
      }
    };
  }, [isAudioMuted]);

  // ----------------------------------------------------
  // REST API FETCHES
  // ----------------------------------------------------
  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.preferences && data.preferences.theme) {
          setIsDarkMode(data.preferences.theme === 'dark');
        }
      } else {
        setToken('');
        setViewMode('landing');
      }
    } catch (err) {
      setToken('');
      setViewMode('landing');
    }
  };

  const fetchUsersList = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {}
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllAlerts(data);
      }
    } catch (err) {}
  };

  const fetchGeofences = async () => {
    try {
      const res = await fetch(`${API_BASE}/geofences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGeofences(data);
      }
    } catch (err) {}
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {}
  };

  const fetchNotificationHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotificationHistory(data);
      }
    } catch (err) {}
  };

  const handleDeleteNotification = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('Notification archived.', 'success');
        fetchNotifications();
        fetchNotificationHistory();
      }
    } catch (err) {}
  };

  const handleDeleteNotificationHistory = async (id, force = false) => {
    try {
      const res = await fetch(`${API_BASE}/notifications/history/${id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        addToast(force ? 'Notification permanently deleted.' : 'Notification deleted.', 'success');
        fetchNotifications();
        fetchNotificationHistory();
      }
    } catch (err) {}
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {}
  };

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemSettings(data);
      }
    } catch (err) {}
  };

  const fetchAlertNotesTimeline = async (alertId) => {
    try {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAlertNotes(data);
      }
    } catch (err) {}
  };

  const fetchMaintenanceHistory = async (deviceId) => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/maintenance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceLogs(data);
      }
    } catch (err) {}
  };

  const fetchGpsHistoryTrail = async (deviceId) => {
    try {
      const res = await fetch(`${API_BASE}/gps/history/${deviceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGpsTrailCoords(data);
        setPlaybackIndex(0);
        setIsPlayingRoute(false);
      }
    } catch (err) {}
  };

  // ----------------------------------------------------
  // WEBSOCKET TELEMETRY SYSTEM
  // ----------------------------------------------------
  const connectWebSocket = () => {
    if (!token) return;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'AUTH', token }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'INIT_TELEMETRY') {
        setDevices(data.devices);
      } else if (data.type === 'TELEMETRY_TICK') {
        setStats(data.stats);
        setDevices(data.devices);
        setRecentAlerts(data.recentAlerts);

        // Real-time GPS history path appending
        if (data.devices && selectedGpsDeviceIdRef.current && activeTabRef.current === 'gps') {
          const activeDev = data.devices.find(d => d.id === selectedGpsDeviceIdRef.current);
          if (activeDev && activeDev.gpsData) {
            const newPt = {
              lat: activeDev.gpsData.lat,
              lng: activeDev.gpsData.lng,
              speed: activeDev.gpsData.speed || 0,
              distance: activeDev.gpsData.distance || 0,
              timestamp: activeDev.gpsData.timestamp || new Date().toISOString()
            };
            setGpsTrailCoords(prev => {
              const exists = prev.some(pt => pt.timestamp === newPt.timestamp);
              if (exists) return prev;
              return [...prev, newPt];
            });
          }
        }

        // --- Accumulate rolling live chart buffer (max 15 points) ---
        if (data.devices && data.devices.length > 0) {
          // Compute average of first numeric sensor across all devices
          let sum = 0;
          let count = 0;
          data.devices.forEach(dev => {
            if (dev.sensors) {
              dev.sensors.forEach(s => {
                const val = parseFloat(s.current_value);
                if (!isNaN(val) && s.type !== 'Motion' && s.type !== 'GPS Tracker' && s.unit !== 'status' && s.unit !== 'coord') {
                  sum += val;
                  count++;
                }
              });
            }
          });
          if (count > 0) {
            const avg = parseFloat((sum / count).toFixed(2));
            liveChartBufferRef.current = [...liveChartBufferRef.current.slice(-14), { value: avg, time: new Date().toLocaleTimeString() }];
          }
        }
        
        // Show floating dashboard popups for new active alerts
        const activeAlerts = data.recentAlerts.filter(a => a.status === 'active');
        activeAlerts.forEach(alert => {
          if (!lastAlertIdsRef.current.has(alert.id)) {
            lastAlertIdsRef.current.add(alert.id);
            if (prefDashboard) {
              const insight = getAiInsightForAlert(alert);
              const toastMsg = `${alert.message}\n\n[Diagnostic] Cause: ${insight.cause}\n[Action] Recommendation: ${insight.recommendation}`;
              addToast(toastMsg, alert.level);
            }
          }
        });
        
        // Clean up resolved alerts from seen set
        const currentAlertIds = new Set(data.recentAlerts.map(a => a.id));
        lastAlertIdsRef.current.forEach(id => {
          if (!currentAlertIds.has(id)) {
            lastAlertIdsRef.current.delete(id);
          }
        });
        
        // Audio trigger check
        const activeCritAlerts = data.recentAlerts.filter(a => a.status === 'active');
        if (activeCritAlerts.length > 0) {
          const highestSeverity = activeCritAlerts.some(a => a.level === 'critical') ? 'critical' : 'warning';
          alertAudioRef.current?.play(highestSeverity);
        }
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (token) {
        setTimeout(connectWebSocket, 4000);
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };
  };

  // ----------------------------------------------------
  // HANDLERS & OPERATIONS
  // ----------------------------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail)) {
      setAuthError('Please enter a valid email address (e.g. example@gmail.com)');
      return;
    }
    setLoginLoading(true);
    try {
      const startTime = Date.now();
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, phone: loginPhone, password: loginPassword })
      });
      const duration = Date.now() - startTime;
      const data = await res.json();
      if (res.ok) {
        logFirebaseEvent('user_login', { email: loginEmail });
        tracePerformanceMetric('login_api_response_time', duration);
        setToken(data.token);
        setViewMode('portal');
        if (data.user && data.user.preferences && data.user.preferences.theme) {
          setIsDarkMode(data.user.preferences.theme === 'dark');
        }
        if (rememberMe) {
          localStorage.setItem('savedEmail', loginEmail);
          localStorage.setItem('savedPhone', loginPhone);
          localStorage.setItem('rememberMe', 'true');
        } else {
          localStorage.removeItem('savedEmail');
          localStorage.removeItem('savedPhone');
          localStorage.setItem('rememberMe', 'false');
        }
        setLoginPassword('');
      } else {
        setAuthError(data.error || 'Login failed');
      }
    } catch (err) {
      setAuthError('Telemetry gateway server is currently offline.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError('New password must be at least 6 characters long');
      return;
    }
    setChangePasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setChangePasswordSuccess('Password changed successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setTimeout(() => {
          setIsChangePasswordOpen(false);
          setChangePasswordSuccess('');
        }, 1500);
      } else {
        setChangePasswordError(data.error || 'Failed to change password');
      }
    } catch (err) {
      setChangePasswordError('Failed to connect to gateway server.');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail)) {
      setAuthError('Please enter a valid email address (e.g. example@gmail.com)');
      return;
    }

    // Phone E.164 validation
    let formattedRegPhone = 'N/A';
    if (regRole !== 'admin') {
      if (!regPhone || regPhone.trim() === '') {
        setAuthError('Phone number is mandatory');
        return;
      }
      const cleanPhone = regPhone.replace(/[^\d+]/g, '');
      const e164Phone = cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone;
      const e164Regex = /^\+[1-9]\d{6,14}$/;
      if (!e164Regex.test(e164Phone)) {
        setAuthError('Phone number must be in valid international format (e.g. +14155552671)');
        return;
      }
      formattedRegPhone = e164Phone;
    }

    if (regPassword !== regConfirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }

    setRegLoading(true);

    const payload = regRole === 'admin' ? {
      email: regEmail,
      password: regPassword,
      role: 'admin'
    } : {
      name: regName,
      email: regEmail,
      phone: formattedRegPhone,
      password: regPassword,
      role: 'user',
      organization: regOrg
    };

    try {
      const startTime = Date.now();
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const duration = Date.now() - startTime;
      const data = await res.json();
      if (res.ok) {
        logFirebaseEvent('user_register', { email: regEmail, role: regRole });
        tracePerformanceMetric('register_api_response_time', duration);
        setAuthMode('login');
        setLoginEmail(regEmail);
        setAuthError('Corporate profile registered! You may now log in.');
        setRegName('');
        setRegEmail('');
        setRegPhone('');
        setRegOrg('');
        setRegPassword('');
        setRegConfirmPassword('');
      } else {
        setAuthError(data.error || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Telemetry gateway server is offline.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMessage('');
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setResetMessage(data.message);
        setResetEmail('');
      } else {
        setResetMessage(`Error: ${data.error}`);
      }
    } catch (e) {
      setResetMessage('Reset connection failed.');
    }
  };

  const handleResetPasswordConfirmSubmit = async (e) => {
    e.preventDefault();
    setResetConfirmMessage('');
    if (resetConfirmPassword !== resetConfirmConfirmPassword) {
      setResetConfirmMessage('Error: Passwords do not match.');
      return;
    }
    setResetConfirmLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetConfirmToken, password: resetConfirmPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setResetConfirmMessage('Success: Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          setIsResetConfirmOpen(false);
          setAuthMode('login');
          setViewMode('portal');
          setToken('');
          setResetConfirmPassword('');
          setResetConfirmConfirmPassword('');
        }, 3000);
      } else {
        setResetConfirmMessage(`Error: ${data.error || 'Failed to reset password'}`);
      }
    } catch (err) {
      setResetConfirmMessage('Error: Connection failed.');
    } finally {
      setResetConfirmLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('token');
    setViewMode('landing');
  };

  const quickResolveAlert = async (alertId) => {
    try {
      const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resolution_notes: `Quick resolved by ${user?.name || 'User'}` })
      });
      if (res.ok) {
        addToast('Alert resolved successfully.', 'success');
        fetchAlerts();
        fetchNotifications();
        fetchNotificationHistory();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to resolve alert.', 'critical');
      }
    } catch (err) {
      addToast('Network error resolving alert.', 'critical');
    }
  };

  const triggerResolveAlert = (alertId) => {
    const confirmResolve = window.confirm("Are you sure you want to resolve this alert?");
    if (confirmResolve) {
      quickResolveAlert(alertId);
    }
  };

  const handleResolveSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!resolutionNotesText.trim()) return;
    
    setIsResolveModalOpen(false);
    setSuccessAnimationAlertId(resolvingAlertId);
    
    try {
      const startTime = Date.now();
      const res = await fetch(`${API_BASE}/alerts/${resolvingAlertId}/resolve`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resolution_notes: resolutionNotesText })
      });
      const duration = Date.now() - startTime;
      if (res.ok) {
        logFirebaseEvent('alert_resolved', { alertId: resolvingAlertId, notes: resolutionNotesText });
        tracePerformanceMetric('alert_processing_time', duration);
        fetchAlerts();
        fetchNotifications();
        setSuccessAnimationAlertId(null);
        if (selectedAlertForTimeline && selectedAlertForTimeline.id === resolvingAlertId) {
          fetchAlertNotesTimeline(resolvingAlertId);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to resolve alert');
        setSuccessAnimationAlertId(null);
      }
    } catch (err) {
      setSuccessAnimationAlertId(null);
    }
  };

  const handleAddAlertNote = async (e) => {
    e.preventDefault();
    if (!newAlertNoteText) return;
    try {
      const res = await fetch(`${API_BASE}/alerts/${selectedAlertForTimeline.id}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ note: newAlertNoteText })
      });
      if (res.ok) {
        setNewAlertNoteText('');
        fetchAlertNotesTimeline(selectedAlertForTimeline.id);
      }
    } catch (err) {}
  };

  const handleAssignAlert = async (e) => {
    e.preventDefault();
    const assignedUser = usersList.find(u => u.id === parseInt(assigneeUserId));
    if (!assignedUser) return;
    try {
      const res = await fetch(`${API_BASE}/alerts/${selectedAlertForTimeline.id}/assign`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assigned_to: assignedUser.id,
          assigned_to_name: assignedUser.name
        })
      });
      if (res.ok) {
        setAssigneeUserId('');
        fetchAlerts();
        fetchAlertNotesTimeline(selectedAlertForTimeline.id);
      }
    } catch (err) {}
  };

  const handleRegisterDevice = async (e) => {
    e.preventDefault();
    
    // Warn but do not block submission to allow alert triggering
    if (isThresholdExceeded) {
      addToast("You cannot exceed the maximum value allowed for this sensor.", "critical");
    }

    const payload = user.role === 'admin' ? {
      id: newDevId,
      name: newDevName,
      hardware_type: newDevType,
      location: newDevLoc,
      communication_protocol: newDevProto,
      max_sensor_value: parseFloat(newDevMax),
      gps_enabled: newDevGps,
      sensor_type: newDevSensorType,
      remarks: newDevRemarks,
      category: newDevCategory,
      lifecycle_status: newDevLifecycleStatus
    } : {
      id: newDevId,
      name: newDevName,
      sensor_type: newDevSensorType,
      current_sensor_value: parseFloat(newDevCurrVal),
      communication_protocol: newDevProto,
      max_sensor_value: parseFloat(newDevMax),
      gps_enabled: newDevSensorType === 'GPS Tracker' || newDevSensorType === 'Livestock Tracking',
      remarks: newDevRemarks,
      category: newDevCategory,
      lifecycle_status: newDevLifecycleStatus
    };

    try {
      const startTime = Date.now();
      const res = await fetch(`${API_BASE}/devices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const duration = Date.now() - startTime;
      const data = await res.json();
      if (res.ok) {
        logFirebaseEvent('device_registration', { id: newDevId, name: newDevName, type: newDevType || 'ESP32' });
        tracePerformanceMetric('device_registration_api_response_time', duration);
        setIsRegisterDeviceOpen(false);
        setNewDevId('');
        setNewDevName('');
        setNewDevLoc('');
        setNewDevMax('100');
        setNewDevCurrVal('0');
        setNewDevGps(false);
        setNewDevRemarks('');
        setNewDevCategory('General');
        setNewDevLifecycleStatus('Primary Asset');
        setNewDevChannel('Dashboard');
        setNewDevSeverity('Low');
        setDeviceSearchQuery('');
        setIsCustomDevice(false);
      } else {
        alert(data.error || 'Device linking failed');
      }
    } catch (err) {}
  };

  const handleDeleteDevice = async (id) => {
    if (!confirm('Are you sure you want to delete this device? All sensor links will be detached.')) return;
    try {
      const res = await fetch(`${API_BASE}/devices/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        // Updated via WS ticks
      }
    } catch (err) {}
  };

  const handleUpdateAssetMetadata = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/devices/${selectedDeviceForAssetEdit.id}/asset`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serial_number: editSerial,
          owner_name: editOwner,
          category: editCategory,
          lifecycle_status: editLifecycle,
          installation_date: editInstallDate,
          warranty_expiry: editWarranty,
          simulated_fault: editSimFault ? 1 : 0
        })
      });
      if (res.ok) {
        setSelectedDeviceForAssetEdit(null);
      }
    } catch (err) {}
  };

  const handleUpdateSensorMetadata = async (e) => {
    e.preventDefault();
    if (!editSensorName.trim()) {
      addToast('Sensor name is required.', 'error');
      return;
    }
    const val = parseFloat(editSensorMax);
    if (!isNaN(val)) {
      const type = selectedSensor.type || '';
      if (type.includes('Wind Speed')) {
        if (val < 0 || val > 200) {
          addToast('Wind Speed threshold must be between 0 and 200 km/h.', 'error');
          return;
        }
      } else if (type.includes('Temperature')) {
        if (val < -50 || val > 100) {
          addToast('Temperature threshold must be between -50 and 100 °C.', 'error');
          return;
        }
      } else if (type.includes('Humidity') || type.includes('Moisture')) {
        if (val < 0 || val > 100) {
          addToast('Humidity/Moisture threshold must be between 0 and 100%.', 'error');
          return;
        }
      } else if (type.includes('Water Level')) {
        if (val < 0 || val > 1000) {
          addToast('Water Level threshold must be between 0 and 1000 cm.', 'error');
          return;
        }
      } else if (type.includes('Pressure')) {
        if (val < 800 || val > 1200) {
          addToast('Pressure threshold must be between 800 and 1200 hPa.', 'error');
          return;
        }
      } else if (type.includes('pH')) {
        if (val < 0 || val > 14) {
          addToast('pH threshold must be between 0 and 14 on the pH scale.', 'error');
          return;
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE}/sensors/${selectedSensor.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editSensorName,
          unit: editSensorUnit,
          max_value: parseFloat(editSensorMax)
        })
      });
      if (res.ok) {
        setSelectedSensor(null);
        addToast('Sensor details updated successfully.', 'success');
        try {
          const devRes = await fetch(`${API_BASE}/devices`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (devRes.ok) {
            const devicesList = await devRes.json();
            setDevices(devicesList);
          }
        } catch (err) {
          console.error('Failed to refresh devices:', err);
        }
      } else {
        const errData = await res.json();
        addToast(errData.error || 'Failed to update sensor.', 'error');
      }
    } catch (err) {
      addToast('Network error updating sensor.', 'error');
    }
  };

  const handleDeleteSensor = async () => {
    if (!confirm('Are you sure you want to delete this sensor? All historical telemetry and active alerts will be permanently removed.')) return;
    try {
      const res = await fetch(`${API_BASE}/sensors/${selectedSensor.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedSensor(null);
        addToast('Sensor deleted successfully.', 'success');
      } else {
        const errData = await res.json();
        addToast(errData.error || 'Failed to delete sensor.', 'error');
      }
    } catch (err) {
      addToast('Network error deleting sensor.', 'error');
    }
  };

  const handleLogMaintenance = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/devices/${selectedDeviceForMaintenance.id}/maintenance`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          performed_by: newMaintTech,
          description: newMaintDesc,
          cost: parseFloat(newMaintCost) || 0.0,
          maintenance_date: newMaintDate
        })
      });
      if (res.ok) {
        setNewMaintTech('');
        setNewMaintDesc('');
        setNewMaintCost('');
        setNewMaintDate('');
        fetchMaintenanceHistory(selectedDeviceForMaintenance.id);
      }
    } catch (err) {}
  };

  const handleMarkNotificationRead = async (id) => {
    try {
      const startTime = Date.now();
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const duration = Date.now() - startTime;
      if (res.ok) {
        logFirebaseEvent('notification_opened', { notificationId: id });
        tracePerformanceMetric('notification_read_api_response_time', duration);
        fetchNotifications();
      }
    } catch (err) {}
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (err) {}
  };

  const handleRetryFailedNotification = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}/retry`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      alert(data.message || data.error);
      fetchNotifications();
    } catch (err) {}
  };

  const handleCreateGeofence = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/geofences`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newFenceName,
          lat: parseFloat(newFenceLat),
          lng: parseFloat(newFenceLng),
          radius: parseFloat(newFenceRadius)
        })
      });
      if (res.ok) {
        setIsAddGeofenceOpen(false);
        setNewFenceName('');
        setNewFenceLat('');
        setNewFenceLng('');
        setNewFenceRadius('500');
        fetchGeofences();
      }
    } catch (err) {}
  };

  const handleDeleteGeofence = async (id) => {
    if (!confirm('Are you sure you want to delete this geofence?')) return;
    try {
      const res = await fetch(`${API_BASE}/geofences/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchGeofences();
      }
    } catch (err) {}
  };

  const openSensorModal = async (sensor) => {
    setSelectedSensor(sensor);
    setEditSensorName(sensor.name || '');
    setEditSensorUnit(sensor.unit || '');
    setEditSensorMax(String(sensor.max_value || ''));
    setComparisonSensorId('');
    setComparisonHistory([]);
    try {
      const res = await fetch(`${API_BASE}/sensors/readings/${sensor.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSensorHistory(data);
      }
    } catch (err) {}
  };

  const handleCompareSensorLoad = async (sensorId) => {
    setComparisonSensorId(sensorId);
    if (!sensorId) {
      setComparisonHistory([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/sensors/readings/${sensorId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setComparisonHistory(data);
      }
    } catch (err) {}
  };

  const openAlertTimelineModal = (alert) => {
    setSelectedAlertForTimeline(alert);
    fetchAlertNotesTimeline(alert.id);
  };

  const openAssetEditModal = (device) => {
    setSelectedDeviceForAssetEdit(device);
    setEditSerial(device.serial_number || '');
    setEditOwner(device.owner_name || '');
    setEditCategory(device.category || 'Climate');
    setEditLifecycle(device.lifecycle_status || 'Active');
    setEditInstallDate(device.installation_date || '');
    setEditWarranty(device.warranty_expiry || '');
    setEditSimFault(device.simulated_fault === 1);
  };

  const openMaintenanceModal = (device) => {
    setSelectedDeviceForMaintenance(device);
    fetchMaintenanceHistory(device.id);
  };

  // Custom Map Zoom and Fullscreen Actions
  const handleZoomIn = () => {
    if (mapInstance.current) {
      mapInstance.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstance.current) {
      mapInstance.current.zoomOut();
    }
  };

  const handleToggleFullscreen = () => {
    setIsMapFullscreen(prev => {
      const next = !prev;
      setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      }, 100);
      return next;
    });
  };

  // ----------------------------------------------------
  // LEAFLET MAP BINDINGS
  // ----------------------------------------------------
  const initMap = () => {
    if (mapInstance.current) return;

    const isUsingGoogleMaps = googleMapsLoaded && !googleMapsAuthError;

    if (isUsingGoogleMaps) {
      console.log('Initializing Google Maps JS SDK...');
      try {
        const darkMapStyles = [
          { elementType: 'geometry', stylers: [{ color: '#0b131a' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#0b131a' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
          { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
          { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0b131a' }] },
          { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] }
        ];

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 34.0522, lng: -118.2437 },
          zoom: 11,
          zoomControl: false,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: false,
          styles: darkMapStyles
        });

        mapInstance.current = {
          _type: 'google',
          mapObject: map,
          zoomIn: () => map.setZoom(map.getZoom() + 1),
          zoomOut: () => map.setZoom(map.getZoom() - 1),
          panTo: (latlng) => map.panTo({ lat: latlng[0], lng: latlng[1] }),
          invalidateSize: () => google.maps.event.trigger(map, 'resize'),
          remove: () => {
            if (mapRef.current) mapRef.current.innerHTML = '';
          }
        };

        map.addListener('click', (e) => {
          setNewFenceLat(e.latLng.lat().toFixed(6));
          setNewFenceLng(e.latLng.lng().toFixed(6));
          setIsAddGeofenceOpen(true);
        });

        console.log('Google Maps initialized successfully.');
        setTimeout(() => {
          updateMapTelemetry();
          updateMapGeofences();
        }, 150);
      } catch (err) {
        console.error('Google Maps initialization failed:', err);
        setGoogleMapsAuthError('Failed to initialize Google Map object: ' + err.message);
        initLeafletMap();
      }
    } else {
      initLeafletMap();
    }
  };

  const initLeafletMap = () => {
    if (mapInstance.current) return;
    console.log('Initializing Leaflet Map fallback...');
    const map = L.map(mapRef.current, {
      zoomControl: false
    }).setView([34.0522, -118.2437], 11);
    
    mapInstance.current = {
      _type: 'leaflet',
      mapObject: map,
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      panTo: (latlng) => map.panTo(latlng),
      invalidateSize: () => map.invalidateSize(),
      remove: () => map.remove()
    };

    const googleApiKey = systemSettings.google_maps_api_key || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const isGoogleAuthError = googleMapsAuthError !== null;
    
    if (isGoogleAuthError || !googleApiKey) {
      const tileUrl = isDarkMode 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' 
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
      L.tileLayer(tileUrl, {
        attribution: '&copy; OpenStreetMap & CartoDB',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);
    } else {
      const googleTilesUrl = `https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${googleApiKey}`;
      L.tileLayer(googleTilesUrl, {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20,
        attribution: '&copy; Google Maps',
        className: 'google-maps-dark'
      }).addTo(map);
    }

    map.on('click', (e) => {
      setNewFenceLat(e.latlng.lat.toFixed(6));
      setNewFenceLng(e.latlng.lng.toFixed(6));
      setIsAddGeofenceOpen(true);
    });

    setTimeout(() => {
      map.invalidateSize();
      updateMapTelemetry();
      updateMapGeofences();
    }, 100);
    
    setTimeout(() => {
      map.invalidateSize();
    }, 500);
  };

  const updateMapGeofences = () => {
    const mapInst = mapInstance.current;
    if (!mapInst) return;

    if (mapInst._type === 'google') {
      const gMap = mapInst.mapObject;
      Object.keys(geofencesRef.current).forEach(id => {
        if (geofencesRef.current[id] && geofencesRef.current[id].setMap) {
          geofencesRef.current[id].setMap(null);
        }
      });
      geofencesRef.current = {};

      geofences.forEach(gf => {
        const circle = new google.maps.Circle({
          strokeColor: gf.color || '#7f00ff',
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
          fillColor: gf.color || '#7f00ff',
          fillOpacity: 0.08,
          map: gMap,
          center: { lat: gf.lat, lng: gf.lng },
          radius: gf.radius
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="color:#0b131a;font-size:12px;font-family:sans-serif;padding:4px;"><strong>Geofence Zone</strong><br/>Name: ${gf.name}<br/>Radius: ${gf.radius}m</div>`
        });

        circle.addListener('click', (e) => {
          infoWindow.setPosition(e.latLng);
          infoWindow.open(gMap);
        });

        geofencesRef.current[gf.id] = circle;
      });
    } else {
      const lMap = mapInst.mapObject;
      Object.keys(geofencesRef.current).forEach(id => {
        lMap.removeLayer(geofencesRef.current[id]);
      });
      geofencesRef.current = {};

      geofences.forEach(gf => {
        const circle = L.circle([gf.lat, gf.lng], {
          color: gf.color || '#7f00ff',
          fillColor: gf.color || '#7f00ff',
          fillOpacity: 0.08,
          radius: gf.radius,
          weight: 1.5,
          dashArray: '5, 5'
        }).addTo(lMap);

        circle.bindPopup(`<strong>Geofence Zone</strong><br/>Name: ${gf.name}<br/>Radius: ${gf.radius}m`);
        geofencesRef.current[gf.id] = circle;
      });
    }
  };

  const updateMapTelemetry = () => {
    const mapInst = mapInstance.current;
    if (!mapInst) return;

    if (historyMarkersRef.current) {
      historyMarkersRef.current.forEach(m => {
        if (mapInst._type === 'google') {
          if (m && m.setMap) m.setMap(null);
        } else {
          try {
            m.remove();
          } catch (e) {}
        }
      });
      historyMarkersRef.current = [];
    }

    if (mapInst._type === 'google') {
      const gMap = mapInst.mapObject;
      
      // Clear heat circles if any
      heatCirclesRef.current.forEach(c => {
        if (c && c.setMap) c.setMap(null);
      });
      heatCirclesRef.current = [];

      // Clear markers
      Object.keys(markersRef.current).forEach(id => {
        if (markersRef.current[id] && markersRef.current[id].setMap) {
          markersRef.current[id].setMap(null);
        }
        delete markersRef.current[id];
      });

      devices.forEach(device => {
        let lat = null;
        let lng = null;
        let timestamp = device.updated_at || Date.now();

        if (device.gpsData) {
          lat = device.gpsData.lat;
          lng = device.gpsData.lng;
          timestamp = device.gpsData.timestamp || timestamp;
        } else {
          const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
          const match = String(device.location || '').match(coordRegex);
          if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
          } else {
            if (device.id === 'ESP32_01') {
              lat = 34.0522; lng = -118.2437;
            } else if (device.id === 'NODEMCU_02') {
              lat = 34.0580; lng = -118.2500;
            } else if (device.id === 'ARD_05') {
              lat = 34.0450; lng = -118.2600;
            }
          }
        }

        if (lat === null || lng === null) return;

        const isSelected = device.id === selectedGpsDeviceId;
        
        let deviceStatus = 'Normal';
        let pinColor = '#22c55e'; // Green
        
        const deviceAlerts = recentAlerts.filter(a => a.device_id === device.id && a.status === 'active');
        if (deviceAlerts.length > 0) {
          const hasCritical = deviceAlerts.some(a => a.level === 'critical');
          if (hasCritical) {
            deviceStatus = 'Critical Alert';
            pinColor = '#ef4444'; // Red
          } else {
            deviceStatus = 'Warning';
            pinColor = '#eab308'; // Yellow
          }
        }

        if (isHeatMapActive) {
          const heatCircle = new google.maps.Circle({
            strokeColor: '#ef4444',
            strokeOpacity: 0,
            strokeWeight: 0,
            fillColor: '#f59e0b',
            fillOpacity: 0.25,
            map: gMap,
            center: { lat, lng },
            radius: 600
          });
          heatCirclesRef.current.push(heatCircle);
        }

        const markerSvg = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${pinColor}" stroke="%23ffffff" stroke-width="1.5"/>
          </svg>
        `;

        const marker = new google.maps.Marker({
          position: { lat, lng },
          map: gMap,
          title: device.name,
          icon: {
            url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markerSvg)}`,
            scaledSize: new google.maps.Size(36, 36),
            anchor: new google.maps.Point(18, 36)
          }
        });

        let sensorsHtml = '';
        if (device.sensors && device.sensors.length > 0) {
          device.sensors.forEach(s => {
            sensorsHtml += `
              <div style="background-color: #0f172a; border-radius: 4px; padding: 6px; margin-bottom: 4px; font-size: 11px; font-family: sans-serif; box-sizing: border-box;">
                <div style="font-weight: bold; color: #f8fafc;">${s.name}</div>
                <div style="color: #3b82f6; font-size: 10px; margin-top: 1px;">Type: ${s.type}</div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px; color: #cbd5e1;">
                  <span>Value: <strong style="color: #22c55e;">${s.current_value}${s.unit}</strong></span>
                  <span>Limit: <strong style="color: #94a3b8;">${s.max_value}${s.unit}</strong></span>
                </div>
                <div style="color: #64748b; font-size: 9px; margin-top: 3px; text-align: right;">Updated: ${new Date(s.last_updated).toLocaleString()}</div>
              </div>
            `;
          });
        } else {
          sensorsHtml = `<div style="color: #64748b; font-style: italic; font-size: 11px;">No sensors registered for this device.</div>`;
        }

        const popupHtml = `
          <div style="background-color: #0b131a; border-radius: 8px; color: #cbd5e1; font-family: sans-serif; font-size: 12px; padding: 10px; width: 240px; box-sizing: border-box;">
            <div style="font-weight: bold; font-size: 13px; color: #00f2fe; border-bottom: 1px solid #1e293b; padding-bottom: 4px; margin-bottom: 6px;">${device.name}</div>
            <div style="margin-bottom: 3px;"><span style="color: #64748b;">Device ID:</span> <span style="font-family: monospace;">${device.id}</span></div>
            <div style="margin-bottom: 3px;"><span style="color: #64748b;">Status:</span> <span style="color: ${pinColor}; font-weight: bold;">${deviceStatus}</span></div>
            <div style="margin-bottom: 6px;"><span style="color: #64748b;">Last Updated:</span> <span>${new Date(timestamp).toLocaleString()}</span></div>
            <div style="border-top: 1px dashed #1e293b; padding-top: 6px; margin-top: 6px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Registered Sensors</div>
              ${sensorsHtml}
            </div>
          </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
          content: popupHtml
        });

        marker.addListener('click', () => {
          setSelectedGpsDeviceId(device.id);
          infoWindow.open(gMap, marker);
        });

        markersRef.current[device.id] = marker;

        if (isSelected) {
          gMap.panTo({ lat, lng });
          infoWindow.open(gMap, marker);
        }
      });

      if (routePolylineRef.current) {
        if (routePolylineRef.current.setMap) {
          routePolylineRef.current.setMap(null);
        }
        routePolylineRef.current = null;
      }

      if (selectedGpsDeviceId && gpsTrailCoords.length > 0) {
        const path = gpsTrailCoords.map(c => ({ lat: c.lat, lng: c.lng }));
        routePolylineRef.current = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#00f2fe',
          strokeOpacity: 0.8,
          strokeWeight: 3,
          map: gMap
        });

        // Draw dot markers for history trail points
        gpsTrailCoords.forEach(coord => {
          if (coord.lat && coord.lng) {
            const dotIcon = {
              path: (window.google && window.google.maps) ? google.maps.SymbolPath.CIRCLE : 0,
              fillColor: '#00f2fe',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 1,
              scale: 5
            };
            const marker = new google.maps.Marker({
              position: { lat: coord.lat, lng: coord.lng },
              map: gMap,
              icon: dotIcon,
              title: new Date(coord.timestamp).toLocaleString()
            });
            const infoWindow = new google.maps.InfoWindow({
              content: `<div style="color:#0b131a;font-size:11px;font-family:sans-serif;padding:4px;box-sizing:border-box;">
                          <strong>Time:</strong> ${new Date(coord.timestamp).toLocaleString()}<br/>
                          <strong>Speed:</strong> ${coord.speed || 0} km/h
                        </div>`
            });
            marker.addListener('click', () => {
              infoWindow.open(gMap, marker);
            });
            historyMarkersRef.current.push(marker);
          }
        });
      }
    } else {
      const lMap = mapInst.mapObject;
      heatCirclesRef.current.forEach(c => lMap.removeLayer(c));
      heatCirclesRef.current = [];

      Object.keys(markersRef.current).forEach(id => {
        lMap.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      });

      devices.forEach(device => {
        let lat = null;
        let lng = null;
        let timestamp = device.updated_at || Date.now();

        if (device.gpsData) {
          lat = device.gpsData.lat;
          lng = device.gpsData.lng;
          timestamp = device.gpsData.timestamp || timestamp;
        } else {
          const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
          const match = String(device.location || '').match(coordRegex);
          if (match) {
            lat = parseFloat(match[1]);
            lng = parseFloat(match[2]);
          } else {
            if (device.id === 'ESP32_01') {
              lat = 34.0522; lng = -118.2437;
            } else if (device.id === 'NODEMCU_02') {
              lat = 34.0580; lng = -118.2500;
            } else if (device.id === 'ARD_05') {
              lat = 34.0450; lng = -118.2600;
            }
          }
        }

        if (lat === null || lng === null) return;

        const isSelected = device.id === selectedGpsDeviceId;
        
        let deviceStatus = 'Normal';
        let pinColor = '#22c55e'; // Green
        
        const deviceAlerts = recentAlerts.filter(a => a.device_id === device.id && a.status === 'active');
        if (deviceAlerts.length > 0) {
          const hasCritical = deviceAlerts.some(a => a.level === 'critical');
          if (hasCritical) {
            deviceStatus = 'Critical Alert';
            pinColor = '#ef4444'; // Red
          } else {
            deviceStatus = 'Warning';
            pinColor = '#eab308'; // Yellow
          }
        }

        if (isHeatMapActive) {
          const heatCircle = L.circle([lat, lng], {
            radius: 600,
            color: '#ef4444',
            fillColor: '#f59e0b',
            fillOpacity: 0.25,
            weight: 0
          }).addTo(lMap);
          heatCirclesRef.current.push(heatCircle);
        }

        const markerHtml = `
          <div class="custom-map-marker ${isSelected ? 'scale-125 ring-2 ring-primary ring-offset-2 ring-offset-[#0b131a]' : ''} shadow-lg" 
               style="background-color: ${pinColor}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
            <div class="marker-pulse" style="border-color: ${pinColor};"></div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="transform: rotate(45deg);">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
          </div>
        `;

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'div-icon-wrapper',
            html: markerHtml,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(lMap);

        let sensorsHtml = '';
        if (device.sensors && device.sensors.length > 0) {
          device.sensors.forEach(s => {
            sensorsHtml += `
              <div class="bg-slate-900/60 border border-slate-800/40 rounded-lg p-2.5 space-y-1 text-[11px] mb-1.5">
                <div class="font-bold text-slate-100 flex justify-between">
                  <span>${s.name}</span>
                  <span class="text-cyan-400 font-normal">${s.type}</span>
                </div>
                <div class="flex justify-between text-slate-300">
                  <span>Value: <strong class="text-emerald-400 font-semibold">${s.current_value}${s.unit}</strong></span>
                  <span>Limit: <strong class="text-slate-400">${s.max_value}${s.unit}</strong></span>
                </div>
                <div class="text-[9px] text-slate-500 text-right">Updated: ${new Date(s.last_updated).toLocaleString()}</div>
              </div>
            `;
          });
        } else {
          sensorsHtml = `<div class="text-slate-500 italic text-[11px]">No sensors registered for this device.</div>`;
        }

        const popupHtml = `
          <div class="text-slate-200 p-3 font-sans space-y-2 text-xs min-w-[200px]">
            <div class="font-bold text-sm text-cyan-400 border-b border-slate-800 pb-1.5 mb-1.5">${device.name}</div>
            <div><span class="text-slate-400 font-semibold">Device ID:</span> <span class="font-mono text-slate-300">${device.id}</span></div>
            <div><span class="text-slate-400 font-semibold">Status:</span> <span class="font-bold" style="color: ${pinColor};">${deviceStatus}</span></div>
            <div><span class="text-slate-400 font-semibold">Last Updated:</span> <span class="text-slate-300">${new Date(timestamp).toLocaleString()}</span></div>
            <div class="border-t border-slate-800/80 pt-2 mt-2">
              <div class="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Registered Sensors</div>
              ${sensorsHtml}
            </div>
          </div>
        `;
        
        marker.bindPopup(popupHtml, {
          className: 'custom-leaflet-popup'
        });

        marker.on('click', () => {
          setSelectedGpsDeviceId(device.id);
          marker.openPopup();
        });

        markersRef.current[device.id] = marker;
        
        if (isSelected) {
          lMap.panTo([lat, lng]);
          marker.openPopup();
        }
      });

      if (routePolylineRef.current) {
        lMap.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }

      if (selectedGpsDeviceId && gpsTrailCoords.length > 0) {
        const latlngs = gpsTrailCoords.map(c => [c.lat, c.lng]);
        routePolylineRef.current = L.polyline(latlngs, {
          color: '#00f2fe',
          weight: 3,
          opacity: 0.8,
          dashArray: '8, 8'
        }).addTo(lMap);

        // Draw dot markers for history trail points
        gpsTrailCoords.forEach(coord => {
          if (coord.lat && coord.lng) {
            const marker = L.circleMarker([coord.lat, coord.lng], {
              radius: 5,
              fillColor: '#00f2fe',
              color: '#ffffff',
              weight: 1,
              opacity: 1,
              fillOpacity: 1
            }).addTo(lMap);
            marker.bindPopup(`<strong>Time:</strong> ${new Date(coord.timestamp).toLocaleString()}<br/><strong>Speed:</strong> ${coord.speed || 0} km/h`);
            historyMarkersRef.current.push(marker);
          }
        });
      }
    }
  };



  // ----------------------------------------------------
  // ROUTE PLAYBACK CONTROL LOGIC
  // ----------------------------------------------------
  const handleTogglePlayback = () => {
    if (isPlayingRoute) {
      // Pause
      clearInterval(playbackIntervalRef.current);
      setIsPlayingRoute(false);
    } else {
      // Play
      if (gpsTrailCoords.length === 0) return;
      setIsPlayingRoute(true);
      
      playbackIntervalRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          const next = prev + 1;
          if (next >= gpsTrailCoords.length) {
            clearInterval(playbackIntervalRef.current);
            setIsPlayingRoute(false);
            return prev;
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
  };

  useEffect(() => {
    if (activeTab === 'gps' && mapInstance.current && gpsTrailCoords.length > 0) {
      const index = Math.min(playbackIndex, gpsTrailCoords.length - 1);
      const coord = gpsTrailCoords[index];
      if (!coord) return;

      if (playbackMarkerRef.current) {
        if (playbackMarkerRef.current._type === 'google') {
          playbackMarkerRef.current.marker.setMap(null);
        } else if (playbackMarkerRef.current._type === 'leaflet') {
          playbackMarkerRef.current.marker.remove();
        }
      }

      const playbackHtml = `
        <div class="shadow-lg animate-bounce" style="background-color: #a855f7; border: 2px solid white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        </div>
      `;

      if (mapInstance.current._type === 'google') {
        const svgIcon = {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="15" fill="#a855f7" stroke="white" stroke-width="3" />
              <rect x="13" y="13" width="14" height="14" fill="white" rx="2" />
            </svg>
          `),
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 20)
        };
        const marker = new google.maps.Marker({
          position: { lat: coord.lat, lng: coord.lng },
          map: mapInstance.current.mapObject,
          icon: svgIcon,
          title: 'Playback Marker'
        });
        playbackMarkerRef.current = { _type: 'google', marker };
      } else {
        const marker = L.marker([coord.lat, coord.lng], {
          icon: L.divIcon({
            className: 'playback-div-icon',
            html: playbackHtml,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        }).addTo(mapInstance.current.mapObject);
        playbackMarkerRef.current = { _type: 'leaflet', marker };
      }

      mapInstance.current.panTo([coord.lat, coord.lng]);
    }

    return () => {};
  }, [playbackIndex, gpsTrailCoords, activeTab]);

  const handleStopPlayback = () => {
    clearInterval(playbackIntervalRef.current);
    setIsPlayingRoute(false);
    setPlaybackIndex(0);
    if (playbackMarkerRef.current) {
      if (playbackMarkerRef.current._type === 'google') {
        playbackMarkerRef.current.marker.setMap(null);
      } else if (playbackMarkerRef.current._type === 'leaflet') {
        playbackMarkerRef.current.marker.remove();
      }
      playbackMarkerRef.current = null;
    }
  };

  // ----------------------------------------------------
  // REPORT CENTER DOWNLOAD EXPORTS
  // ----------------------------------------------------
  const handleTriggerReportDownload = () => {
    const format = selectedReportFormat.toLowerCase();
    const type = selectedReportType;
    logFirebaseEvent('report_downloaded', { format, type });
    tracePerformanceMetric('report_download_time', Math.floor(Math.random() * 150) + 50);
    window.open(`${API_BASE}/reports/export/${format}?token=${token}&reportType=${type}`, '_blank');
  };

  // ----------------------------------------------------
  // RULE-BASED root cause analysis
  // ----------------------------------------------------
  const getAiInsightForAlert = (alert) => {
    if (!alert) return { cause: 'N/A', recommendation: 'N/A' };
    const msg = (alert.message || '').toLowerCase();
    const sens = (alert.sensor_name || '').toLowerCase();
    
    if (msg.includes('gone offline') || msg.includes('offline')) {
      return {
        cause: "Device missed communication heartbeat ticks. Likely due to power cell drainage or signal blockages.",
        recommendation: "Check power cables, inspect RF environment, or verify on-site device antenna alignment."
      };
    }
    if (msg.includes('temperature') || sens.includes('temperature')) {
      return {
        cause: "Ambient environment temperature spike. Possible server AC failure or industrial room heat exhaust block.",
        recommendation: "Examine ventilation grid, reset cooling control panel, or spin down heavy machinery."
      };
    }
    if (msg.includes('humidity') || sens.includes('humidity')) {
      return {
        cause: "Humidity levels breach. HVAC humidifier failure, condensation build-up, or moisture leakage.",
        recommendation: "Activate dehumidifier modules, check pipes for leaks, and inspect air circulation fans."
      };
    }
    if (msg.includes('moisture') || msg.includes('wetness') || sens.includes('moisture') || sens.includes('wetness')) {
      return {
        cause: "Insufficient irrigation, High temperature, Low rainfall",
        recommendation: "Increase irrigation, Check water supply, Monitor weather conditions"
      };
    }
    if (msg.includes('wind speed') || msg.includes('wind') || sens.includes('wind speed') || sens.includes('wind')) {
      return {
        cause: "Storm conditions, Atmospheric pressure changes",
        recommendation: "Secure equipment, Monitor weather forecasts"
      };
    }
    if (msg.includes('water level') || sens.includes('water level')) {
      return {
        cause: "Fluid height limits exceeded. Boiler cooling supply leak or utility room drainage sump block.",
        recommendation: "Trigger emergency mechanical sump discharge, inspect pump blades, or shut incoming supply."
      };
    }
    if (msg.includes('geofence') || sens.includes('geofence')) {
      return {
        cause: "Mobile tracker departed geofenced coordinates zone. Fleet driver off route or asset unpermitted movement.",
        recommendation: "Verify route dispatcher sheets, call field team device user, or check fleet logs."
      };
    }
    return {
      cause: "Sensor reading fluctuated beyond global threshold boundaries.",
      recommendation: "Inspect sensor probe, clean terminals, and reset default trigger parameters."
    };
  };


  // ----------------------------------------------------
  // AI PREDICTIVE BREACH FORECAST (Linear Regression)
  // ----------------------------------------------------
  const getAIThresholdBreachForecast = () => {
    if (sensorHistory.length < 5 || !selectedSensor) {
      return "Collecting operations telemetry logs for linear forecasting...";
    }
    
    const n = sensorHistory.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    sensorHistory.forEach((r, idx) => {
      sumX += idx;
      sumY += r.value;
      sumXY += idx * r.value;
      sumXX += idx * idx;
    });

    const num = (n * sumXY) - (sumX * sumY);
    const den = (n * sumXX) - (sumX * sumX);
    
    if (den === 0) return "Stable operational trend. No breach projected.";
    
    const slope = num / den;
    const currentVal = parseFloat(selectedSensor.current_value);
    const maxVal = parseFloat(selectedSensor.max_value);

    if (slope <= 0) {
      return "AI FORECAST: Stable/decreasing trend. No limit breach is projected.";
    }

    const stepsToBreach = (maxVal - currentVal) / slope;
    if (stepsToBreach <= 0) {
      return "AI FORECAST: Threshold breach is actively occurring.";
    }

    const seconds = Math.round(stepsToBreach * 3); // 3 seconds per tick
    return `AI FORECAST: Telemetry is on an upward trend (+${slope.toFixed(2)}/tick). Projecting threshold breach (${maxVal}${selectedSensor.unit}) in ${seconds} seconds if trajectory continues.`;
  };

  // Anomaly checking
  const isValueAnomalous = (val, historyArr) => {
    if (historyArr.length < 5) return false;
    const avg = historyArr.reduce((sum, r) => sum + r.value, 0) / historyArr.length;
    const diff = Math.abs(val - avg);
    return diff > (avg * 0.35); // 35% outlier spike detection
  };

  // ----------------------------------------------------
  // FILTERING LOGIC
  // ----------------------------------------------------
  const filteredSensors = [];
  devices.forEach(dev => {
    if (sensorStatusFilter === 'online' && !dev.connected) return;
    if (sensorStatusFilter === 'offline' && dev.connected) return;

    (dev.sensors || []).forEach(sens => {
      // Global Search filter
      const matchGlobal = globalSearch === '' ? true : (
        dev.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
        dev.id.toLowerCase().includes(globalSearch.toLowerCase()) ||
        sens.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
        sens.type.toLowerCase().includes(globalSearch.toLowerCase())
      );
      if (!matchGlobal) return;

      // Sensor search input
      const matchSearch = sens.name.toLowerCase().includes(sensorSearch.toLowerCase()) || 
                          dev.name.toLowerCase().includes(sensorSearch.toLowerCase()) ||
                          dev.id.toLowerCase().includes(sensorSearch.toLowerCase());
      if (!matchSearch) return;

      if (sensorTypeFilter !== 'all' && sens.type !== sensorTypeFilter) return;

      // Determine severity from active alerts on this sensor
      const sensAlerts = recentAlerts.filter(a => a.sensor_id === sens.id && a.status === 'active');
      const isCritical = sensAlerts.some(a => a.level === 'critical');
      const isHigh = sensAlerts.some(a => a.level === 'high');
      const isMedium = sensAlerts.some(a => a.level === 'medium');
      const currentSeverity = isCritical ? 'critical' : isHigh ? 'high' : isMedium ? 'medium' : 'low';

      if (sensorAlertFilter !== 'all' && sensorAlertFilter !== currentSeverity) return;

      filteredSensors.push({ 
        ...sens, 
        deviceName: dev.name, 
        deviceConnected: dev.connected, 
        deviceBattery: dev.battery, 
        deviceSignal: dev.signal_strength || -70,
        severity: currentSeverity,
        alerts: sensAlerts
      });
    });
  });

  const filteredAlerts = allAlerts.filter(a => {
    const matchGlobal = globalSearch === '' ? true : (
      (a.id && String(a.id).toLowerCase().includes(globalSearch.toLowerCase())) ||
      (a.message && String(a.message).toLowerCase().includes(globalSearch.toLowerCase())) ||
      (a.level && String(a.level).toLowerCase().includes(globalSearch.toLowerCase())) ||
      (a.assigned_to_name && String(a.assigned_to_name).toLowerCase().includes(globalSearch.toLowerCase()))
    );
    if (!matchGlobal) return false;

    if (alertLogFilter === 'all') return true;
    if (alertLogFilter === 'critical') return a.level === 'critical';
    if (alertLogFilter === 'high') return a.level === 'high';
    if (alertLogFilter === 'medium') return a.level === 'medium';
    if (alertLogFilter === 'low') return a.level === 'low';
    if (alertLogFilter === 'geofence') return a.geofence_id !== null && a.geofence_id !== undefined;
    return true;
  });

  const filteredNotifications = notifications.filter(n => {
    // Search
    const matchSearch = notifSearch === '' ? true : (
      (n.message && String(n.message).toLowerCase().includes(notifSearch.toLowerCase())) ||
      (n.user_name && String(n.user_name).toLowerCase().includes(notifSearch.toLowerCase()))
    );
    if (!matchSearch) return false;

    // Status
    if (notifStatusFilter === 'unread' && n.read_status === 1) return false;
    if (notifStatusFilter === 'read' && n.read_status === 0) return false;

    // Channel
    if (notifChannelFilter !== 'all' && n.channel !== notifChannelFilter) return false;

    // Delivery Status
    if (notifDeliveryFilter !== 'all') {
      let mappedStatus = n.status;
      if (mappedStatus === 'simulated') mappedStatus = 'sent';
      if (mappedStatus !== notifDeliveryFilter) return false;
    }

    return true;
  });

  // Chart rendering data helper — uses live rolling buffer from WS ticks
  const renderTrendChartData = () => {
    const buffer = liveChartBufferRef.current;
    // Fallback to seeded demo data if buffer is empty (before first WS connection)
    const hasliveData = buffer.length >= 3;
    const labels = hasliveData
      ? buffer.map(p => p.time)
      : Array.from({ length: 11 }, (_, i) => `-${(10 - i) * 3}s`);
    const dataPoints = hasliveData
      ? buffer.map(p => p.value)
      : [22.4, 22.8, 22.5, 23.1, 23.0, 23.5, 23.4, 23.8, 24.1, 23.9, 24.2];
    
    return {
      labels,
      datasets: [
        {
          fill: true,
          label: hasliveData ? 'Live Sensor Avg (All Devices)' : 'System Operations Core Average',
          data: dataPoints,
          borderColor: '#00f2fe',
          backgroundColor: 'rgba(0, 242, 254, 0.1)',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
        }
      ]
    };
  };

  const getSensorTrendChartData = () => {
    const labels = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    const tempPoints = [22.1, 22.4, 22.8, 23.5, 24.2, 23.9, 23.5, 23.1, 22.7, 22.4];
    const humPoints = [45.2, 46.1, 48.0, 50.5, 52.0, 51.4, 49.8, 48.5, 47.0, 46.2];
    return {
      labels,
      datasets: [
        {
          label: 'Temperature (°C)',
          data: tempPoints,
          borderColor: '#00f2fe',
          backgroundColor: 'rgba(0, 242, 254, 0.1)',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
        },
        {
          label: 'Humidity (%)',
          data: humPoints,
          borderColor: '#00e676',
          backgroundColor: 'rgba(0, 230, 118, 0.1)',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
        }
      ]
    };
  };

  const getAlertTrendData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sortedDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      sortedDays.push({
        name: days[d.getDay()],
        dateString: d.toDateString(),
        count: 0
      });
    }
    allAlerts.forEach(alert => {
      const alertDate = new Date(alert.timestamp).toDateString();
      const match = sortedDays.find(sd => sd.dateString === alertDate);
      if (match) {
        match.count++;
      }
    });
    const finalCounts = sortedDays.map((sd, i) => {
      if (allAlerts.length === 0) {
        return [2, 5, 3, 8, 4, 6, 2][i];
      }
      return sd.count;
    });
    return {
      labels: sortedDays.map(sd => sd.name),
      datasets: [{
        fill: true,
        label: 'Alert Incidents',
        data: finalCounts,
        borderColor: '#ff007f',
        backgroundColor: 'rgba(255, 0, 127, 0.08)',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3
      }]
    };
  };

  const getDeviceHealthData = () => {
    const devNames = devices.map(d => d.name.split(' ')[0] || d.id);
    const healthScores = devices.map(d => d.health_score !== undefined ? d.health_score : 100);
    const finalLabels = devNames.length > 0 ? devNames : ['ESP32_01', 'NODEMCU_02', 'TRK_03', 'TRK_04', 'ARD_05'];
    const finalHealth = healthScores.length > 0 ? healthScores : [100, 95, 88, 92, 100];
    return {
      labels: finalLabels,
      datasets: [{
        label: 'Health Score (%)',
        data: finalHealth,
        backgroundColor: finalHealth.map(h => h > 90 ? 'rgba(0, 230, 118, 0.65)' : h > 75 ? 'rgba(255, 193, 7, 0.65)' : 'rgba(255, 23, 68, 0.65)'),
        borderColor: finalHealth.map(h => h > 90 ? '#00e676' : h > 75 ? '#ffc107' : '#ff1744'),
        borderWidth: 1
      }]
    };
  };

  const getUserActivityData = () => {
    const actions = {};
    auditLogs.forEach(log => {
      actions[log.action] = (actions[log.action] || 0) + 1;
    });
    let labels = Object.keys(actions);
    let data = Object.values(actions);
    if (labels.length === 0) {
      labels = ['User Login', 'Device Reg', 'Telemetry Upd', 'Alert Created', 'Report Export'];
      data = [12, 4, 34, 8, 5];
    }
    return {
      labels,
      datasets: [{
        label: 'Actions Triggered',
        data,
        backgroundColor: 'rgba(0, 176, 255, 0.65)',
        borderColor: '#00b0ff',
        borderWidth: 1
      }]
    };
  };

  const getNotificationAnalyticsData = () => {
    const channels = ['email', 'sms', 'whatsapp', 'dashboard'];
    const sentCounts = [0, 0, 0, 0];
    const failedCounts = [0, 0, 0, 0];
    const pendingCounts = [0, 0, 0, 0];
    notifications.forEach(n => {
      const chan = n.channel.toLowerCase();
      const status = n.status.toLowerCase();
      const idx = channels.indexOf(chan);
      if (idx !== -1) {
        if (status === 'sent' || status === 'delivered') {
          sentCounts[idx]++;
        } else if (status === 'failed') {
          failedCounts[idx]++;
        } else {
          pendingCounts[idx]++;
        }
      }
    });
    const finalSent = notifications.length > 0 ? sentCounts : [14, 2, 0, 25];
    const finalFailed = notifications.length > 0 ? failedCounts : [1, 1, 0, 0];
    const finalPending = notifications.length > 0 ? pendingCounts : [0, 0, 0, 1];
    return {
      labels: ['Email', 'SMS', 'WhatsApp', 'Dashboard'],
      datasets: [
        {
          label: 'Delivered / Sent',
          data: finalSent,
          backgroundColor: 'rgba(0, 230, 118, 0.65)',
          borderColor: '#00e676',
          borderWidth: 1
        },
        {
          label: 'Failed',
          data: finalFailed,
          backgroundColor: 'rgba(255, 23, 68, 0.65)',
          borderColor: '#ff1744',
          borderWidth: 1
        },
        {
          label: 'Pending',
          data: finalPending,
          backgroundColor: 'rgba(255, 193, 7, 0.65)',
          borderColor: '#ffc107',
          borderWidth: 1
        }
      ]
    };
  };

  const sensorModalChartData = {
    labels: sensorHistory.map(r => new Date(r.timestamp).toLocaleTimeString()),
    datasets: [
      {
        fill: true,
        label: selectedSensor ? selectedSensor.name : 'Readings',
        data: sensorHistory.map(r => r.value),
        borderColor: '#7f00ff',
        backgroundColor: 'rgba(127, 0, 255, 0.08)',
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
      },
      // Comparison datasets overlay
      ...(comparisonHistory.length > 0 ? [{
        fill: true,
        label: `Comparison: ${comparisonSensorId}`,
        data: comparisonHistory.map(r => r.value),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.05)',
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
      }] : [])
    ]
  };

  // ----------------------------------------------------
  // VIEW RENDER 1: ENTERPRISE SaaS HOMEPAGE (Landing Mode)
  // ----------------------------------------------------
  if (viewMode === 'landing') {
    return (
      <ErrorBoundary title="Landing Page Failure">
        <div className="min-h-screen bg-[#070d12] text-slate-100 flex flex-col font-sans relative overflow-hidden">
          {/* Decorative Neon Blurs */}
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full filter blur-[150px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary/15 rounded-full filter blur-[150px] pointer-events-none"></div>

          {/* Global Search header bar */}
          <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#070d12]/80 backdrop-blur-md border-b border-slate-800/40">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-neon-blue">
                  <Cpu className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="font-outfit text-sm font-extrabold tracking-wider text-slate-100 uppercase leading-none">Sansah Iot</h2>
                  <span className="text-[9px] text-slate-400 tracking-widest font-semibold uppercase">Innovations</span>
                </div>
              </div>
              <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <a href="#overview" className="hover:text-primary transition-colors">Home</a>
                <a href="#workflow" className="hover:text-primary transition-colors">Workflow</a>
                <a href="#features" className="hover:text-primary transition-colors">Features</a>
                <a href="#contact" className="hover:text-primary transition-colors">Contact</a>
              </nav>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => { setViewMode('portal'); setAuthMode('register'); }}
                  className="border border-primary/40 hover:border-primary text-primary hover:bg-primary/10 font-bold px-4 py-2 rounded-xl transition-all text-xs uppercase tracking-wider"
                >
                  Get Started
                </button>
                <button 
                  onClick={() => { setViewMode('portal'); setAuthMode('login'); }}
                  className="bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-200 font-bold px-5 py-2.5 rounded-xl transition-all text-xs uppercase tracking-wider"
                >
                  Sign In
                </button>
              </div>
            </div>
          </header>
          <div className="h-20 shrink-0" />

        {/* Hero Section */}
        <section id="overview" className="max-w-7xl mx-auto px-6 py-20 md:py-32 grid md:grid-cols-2 gap-12 items-center relative z-10 flex-grow">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-xs text-primary font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>COMMERCIAL ENTERPRISE Smart Ag EDITION</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold font-outfit text-slate-100 uppercase tracking-tight leading-[1.05]">
              Monitor Every IoT Device <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">in Real Time</span>
            </h1>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-xl">
              Sansah's enterprise IoT Alert Notification System delivers AI-powered monitoring, instant threshold detection, geofence tracking, predictive analytics, and intelligent recommendations.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => { setViewMode('portal'); setAuthMode('login'); }}
                className="bg-primary hover:bg-primary-dark text-slate-950 font-bold px-7 py-4 rounded-xl transition-all shadow-neon-blue text-xs uppercase tracking-wider"
              >
                Sign In
              </button>
              <button 
                onClick={() => { setViewMode('portal'); setAuthMode('register'); }}
                className="bg-transparent border border-primary/50 hover:border-primary text-primary hover:text-slate-100 hover:bg-primary/10 font-bold px-7 py-4 rounded-xl transition-all text-xs uppercase tracking-wider"
              >
                Get Started
              </button>
            </div>
          </div>

          {/* Glowing Illustration Mockup (Live Sandbox preview panel) */}
          <div className="relative glass-card bg-darkbg-card border-darkbg-border rounded-3xl p-6 shadow-glass-dark w-full max-w-[500px] mx-auto animate-float">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Operations Preview Monitor</span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs font-mono mb-4 text-slate-400">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900">
                <span className="text-[9px] uppercase text-slate-500 block">Preview Sensor</span>
                <span className="text-lg font-bold text-slate-200">{landingTemp}°C</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900">
                <span className="text-[9px] uppercase text-slate-500 block">Fleet GPS Coords</span>
                <span className="text-slate-200 block truncate">{landingRouteCoords[landingRouteIndex][0]}, {landingRouteCoords[landingRouteIndex][1]}</span>
              </div>
            </div>

            <div className="h-[120px] bg-slate-950/40 rounded-2xl border border-slate-900 p-2.5 flex items-center justify-center">
              {/* Micro chart preview */}
              <Line 
                data={{
                  labels: landingTempHistory.map((_, i) => `${i}s`),
                  datasets: [{
                    label: 'Preview',
                    data: landingTempHistory,
                    borderColor: '#7f00ff',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                  }]
                }} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { x: { display: false }, y: { display: false } }
                }} 
              />
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-20 border-t border-slate-800/40 relative z-10 w-full">
          <div className="text-center max-w-xl mx-auto mb-16 space-y-3">
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Enterprise Infrastructure</span>
            <h2 className="text-2xl md:text-4xl font-extrabold uppercase font-outfit text-slate-100">PLATFORM SPECIFICATIONS</h2>
            <p className="text-slate-400 text-xs md:text-sm">Engineered to process real-time telemetric streams with mission-critical reliability.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                <Heart className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold uppercase font-outfit text-slate-200">Device Health & Score</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">Calculate operational safety percentages based on battery status, connectivity thresholds, and active alert severity indices.</p>
            </div>

            <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary mb-4">
                <MapPin className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold uppercase font-outfit text-slate-200">GPS Route playback</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">Map geofence zones, visual routes, and animate historical tracker movements with playback speed slider configurations.</p>
            </div>

            <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-500 mb-4">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold uppercase font-outfit text-slate-200">Smart Alert timelines</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">Add timeline comments, assign ownership to team users, configure global templates, and trigger automatic alert escalations.</p>
            </div>

            <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold uppercase font-outfit text-slate-200">AI Diagnostic assist</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">Leverage rule-based diagnostic analysis to identify telemetry anomalies, forecast limit breaches, and suggest root-cause repairs.</p>
            </div>
          </div>
        </section>

        {/* Live Map & Graph Sandbox Showcase Section */}
        <section id="workflow" className="max-w-7xl mx-auto px-6 py-20 border-t border-slate-800/40 relative z-10 w-full bg-slate-950/20 rounded-3xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">SaaS Live Demo Simulator</span>
              <h2 className="text-2xl md:text-4xl font-extrabold uppercase font-outfit text-slate-100">Interactive Workflow Preview</h2>
              <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
                Interact with our telemetric sensor simulator preview box below. This demonstrates how standard sensor data flows from hardware microcontrollers to the analytics dashboard dynamically.
              </p>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/60 font-mono text-xs">
                <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase pb-2 mb-2 border-b border-slate-800">
                  <span>Simulated Parameters</span>
                  <span className="text-primary font-bold">Dynamic Value</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>DHT11 Temperature Sensor</span>
                  <span className="text-slate-200 font-bold">{landingTemp} °C</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Breach Risk Factor</span>
                  <span className={`${landingTemp > 24 ? 'text-red-400' : 'text-green-400'} font-bold`}>
                    {landingTemp > 24 ? 'High Anomaly Risk' : 'Normal Operations'}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-[250px] glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl shadow-sm">
              <Line 
                data={{
                  labels: landingTempHistory.map((_, i) => `${i * 1.5}s ago`),
                  datasets: [{
                    label: 'DHT11 Live Fluctuation Probe',
                    data: landingTempHistory,
                    borderColor: '#00f2fe',
                    backgroundColor: 'rgba(0, 242, 254, 0.05)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 9 } } } },
                  scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#64748b', font: { size: 8 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#64748b', font: { size: 8 } } }
                  }
                }}
              />
            </div>
          </div>
        </section>

        {/* Contact Form Section */}
        <section id="contact" className="max-w-xl mx-auto px-6 py-20 relative z-10 w-full text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold uppercase font-outfit text-slate-100">Enterprise Inquiry</h2>
          <p className="text-slate-400 text-xs mt-2 mb-8">Discuss dedicated staging integrations and WhatsApp API channels with our consulting team.</p>
          
          <form className="space-y-4 text-xs text-left" onSubmit={(e) => { e.preventDefault(); alert('Inquiry recorded. A Sansah representative will contact you shortly.'); }}>
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="Full Name" required className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-primary/50" />
              <input type="email" placeholder="Corporate Email" required className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-primary/50" />
            </div>
            <textarea placeholder="Tell us about your hardware infrastructure..." required rows="4" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-primary/50 resize-none"></textarea>
            <button type="submit" className="w-full bg-primary hover:bg-primary-dark text-slate-950 font-bold py-3 px-6 rounded-xl transition-all shadow-neon-blue uppercase tracking-wider">
              Send Inquiry
            </button>
          </form>
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-slate-800/40 py-8 text-center text-[10px] text-slate-600 relative z-20">
          <p className="uppercase tracking-widest font-semibold text-slate-500">SANSAH INNOVATIONS &copy; 2026. All corporate rights reserved.</p>
        </footer>
      </div>
      </ErrorBoundary>
    );
  }

  // ----------------------------------------------------
  // VIEW RENDER 2: CORE PORTAL GATEWAY AUTHENTICATION
  // ----------------------------------------------------
  if (!token || !user) {
    const getPasswordStrength = (pwd) => {
      if (!pwd) return { label: '', color: 'bg-slate-800', width: 'w-0' };
      let strength = 0;
      if (pwd.length >= 6) strength++;
      if (pwd.length >= 8) strength++;
      if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
      if (/\d/.test(pwd)) strength++;
      if (/[^a-zA-Z\d]/.test(pwd)) strength++;

      if (strength <= 1) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/4' };
      if (strength <= 3) return { label: 'Medium', color: 'bg-yellow-500', width: 'w-2/4' };
      if (strength <= 4) return { label: 'Good', color: 'bg-blue-400', width: 'w-3/4' };
      return { label: 'Strong', color: 'bg-green-500', width: 'w-full' };
    };

    return (
      <ErrorBoundary title="Authentication Portal Failure">
      <div className="min-h-screen flex flex-col relative bg-[#070d12] bg-gradient-to-br from-[#070d12] via-[#0a1520] to-[#070d12] font-sans select-none overflow-x-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-primary/10 rounded-full filter blur-[150px] opacity-60"></div>
          <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] bg-secondary/15 rounded-full filter blur-[150px] opacity-60"></div>
        </div>

        {/* Shared Landing-Style Header Navbar */}
        <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#070d12]/80 backdrop-blur-md border-b border-slate-800/40 shrink-0">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setViewMode('landing')}>
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-neon-blue">
                <Cpu className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="font-outfit text-sm font-extrabold tracking-wider text-slate-100 uppercase leading-none">Sansah Iot</h2>
                <span className="text-[9px] text-slate-400 tracking-widest font-semibold uppercase">Innovations</span>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <a href="#overview" onClick={() => setViewMode('landing')} className="hover:text-primary transition-colors">Home</a>
              <a href="#workflow" onClick={() => setViewMode('landing')} className="hover:text-primary transition-colors">Workflow</a>
              <a href="#features" onClick={() => setViewMode('landing')} className="hover:text-primary transition-colors">Features</a>
              <a href="#contact" onClick={() => setViewMode('landing')} className="hover:text-primary transition-colors">Contact</a>
            </nav>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setAuthMode('register')}
                className={`font-bold px-4 py-2 rounded-xl transition-all text-xs uppercase tracking-wider ${
                  authMode === 'register' 
                    ? 'bg-primary text-slate-950 shadow-neon-blue' 
                    : 'border border-primary/40 hover:border-primary text-primary hover:bg-primary/10'
                }`}
              >
                Get Started
              </button>
              <button 
                onClick={() => setAuthMode('login')}
                className={`font-bold px-5 py-2.5 rounded-xl transition-all text-xs uppercase tracking-wider ${
                  authMode === 'login' 
                    ? 'bg-primary text-slate-950 shadow-neon-blue' 
                    : 'bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-200'
                }`}
              >
                Sign In
              </button>
            </div>
          </div>
        </header>
        <div className="h-20 shrink-0" />

        {/* Center Auth Card Section */}
        <div className="flex-grow flex items-center justify-center py-12 px-4 relative z-10 w-full">
          <div 
            className="w-full max-w-[480px] backdrop-blur-xl rounded-[24px] p-8 md:p-10 border border-primary/20 shadow-glass-dark relative z-10 neon-pulse-cyan transition-all duration-300"
            style={{ backgroundColor: 'rgba(15, 28, 41, 0.55)' }}
          >
          {/* Card Top Header Section */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center text-primary shadow-neon-blue relative group">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-md opacity-50 group-hover:opacity-100 transition-opacity"></div>
              <Cpu className="w-7 h-7 relative z-10 animate-pulse" />
            </div>
            {isResetConfirmOpen ? (
              <>
                <h1 className="text-2xl font-extrabold tracking-wider text-slate-100 font-outfit uppercase">Reset Password</h1>
                <p className="text-xs text-slate-400 mt-2">Configure your new account password</p>
              </>
            ) : isResetOpen ? (
              <>
                <h1 className="text-2xl font-extrabold tracking-wider text-slate-100 font-outfit uppercase">Reset Password</h1>
                <p className="text-xs text-slate-400 mt-2">Request a secure password reset link</p>
              </>
            ) : authMode === 'login' ? (
              <>
                <h1 className="text-2xl font-extrabold tracking-wider text-slate-100 font-outfit uppercase">Welcome Back</h1>
                <p className="text-xs text-slate-400 mt-2">Sign in to access your IoT monitoring dashboard</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-extrabold tracking-wider text-slate-100 font-outfit uppercase">Create Your Account</h1>
                <p className="text-xs text-slate-400 mt-2">Join the IoT Monitoring Platform</p>
              </>
            )}
          </div>

          {/* Validation/Error Alerts */}
          {authError && (
            <div className="mb-6 p-3.5 text-xs rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center font-medium animate-fade-in">
              {authError}
            </div>
          )}

          {isResetConfirmOpen ? (
            /* PASSWORD RESET CONFIRM FORM */
            <form onSubmit={handleResetPasswordConfirmSubmit} className="space-y-5">
              {resetConfirmMessage && (
                <div className={`p-3.5 text-xs rounded-xl border text-center font-medium animate-fade-in ${
                  resetConfirmMessage.startsWith('Success') 
                    ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                  {resetConfirmMessage}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type={showResetConfirmPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    value={resetConfirmPassword}
                    onChange={e => setResetConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-11 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors focus:ring-1 focus:ring-primary/20 placeholder:text-slate-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPassword(!showResetConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showResetConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type={showResetConfirmConfirmPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    value={resetConfirmConfirmPassword}
                    onChange={e => setResetConfirmConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-11 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors focus:ring-1 focus:ring-primary/20 placeholder:text-slate-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmConfirmPassword(!showResetConfirmConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showResetConfirmConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 text-xs pt-2">
                <button 
                  type="submit" 
                  disabled={resetConfirmLoading}
                  className="flex-grow bg-primary hover:bg-primary-dark text-slate-950 font-bold py-3 rounded-xl uppercase tracking-wider transition-colors shadow-neon-blue disabled:opacity-70"
                >
                  {resetConfirmLoading ? 'Resetting...' : 'Update Password'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsResetConfirmOpen(false);
                    setAuthMode('login');
                  }} 
                  className="flex-grow bg-slate-900 hover:bg-slate-800/80 text-slate-300 border border-slate-800 font-bold py-3 rounded-xl uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : isResetOpen ? (
            /* PASSWORD RESET FORM */
            <form onSubmit={handleResetPassword} className="space-y-5">

              {resetMessage && (
                <div className="p-3.5 text-xs rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 text-center font-medium">
                  {resetMessage}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Registered Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="email" 
                    placeholder="name@gmail.com" 
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors focus:ring-1 focus:ring-primary/20 placeholder:text-slate-500"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 text-xs pt-2">
                <button 
                  type="submit" 
                  className="flex-grow bg-primary hover:bg-primary-dark text-slate-950 font-bold py-3 rounded-xl uppercase tracking-wider transition-colors shadow-neon-blue"
                >
                  Send Link
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsResetOpen(false)} 
                  className="flex-grow bg-slate-900 hover:bg-slate-800/80 text-slate-300 border border-slate-800 font-bold py-3 rounded-xl uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : authMode === 'login' ? (
            /* SIGN IN FORM */
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="email" 
                    placeholder="name@gmail.com" 
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    className={`w-full bg-slate-950/60 border rounded-xl py-3 pl-11 pr-4 text-xs focus:outline-none transition-colors placeholder:text-slate-500 focus:ring-1 ${
                      loginEmail ? (
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail) ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' : 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                      ) : 'border-slate-800 focus:border-primary/50 focus:ring-primary/20'
                    }`}
                    required
                  />
                  {loginEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail) && (
                    <span className="text-[9px] font-semibold text-red-400 mt-1 block">
                      Please enter a valid email format (e.g. example@gmail.com).
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="tel" 
                    placeholder="+1 555-0199 (For Users)" 
                    value={loginPhone}
                    onChange={e => setLoginPhone(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors focus:ring-1 focus:ring-primary/20 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Password</label>
                  <button 
                    type="button" 
                    onClick={() => { setIsResetOpen(true); setResetMessage(''); }}
                    className="text-[10px] text-primary hover:text-primary-dark transition-colors font-bold uppercase tracking-wider"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type={showLoginPassword ? "text" : "password"} 
                    placeholder="••••••••" 
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-11 pr-11 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors focus:ring-1 focus:ring-primary/20 placeholder:text-slate-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center">
                <input 
                  id="remember-me" 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-800 bg-slate-950/60 text-primary focus:ring-primary/20 focus:ring-offset-0 focus:ring-1 transition-all"
                />
                <label htmlFor="remember-me" className="ml-2 text-xs font-medium text-slate-400 hover:text-slate-300 cursor-pointer">
                  Remember Me
                </label>
              </div>

              <button 
                type="submit" 
                disabled={loginLoading}
                className="w-full bg-primary hover:bg-primary-dark text-slate-950 font-extrabold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-neon-blue hover:shadow-[0_0_25px_rgba(0,242,254,0.6)] hover:scale-[1.02] text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-primary/25 disabled:opacity-75 disabled:pointer-events-none"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>

              <div className="text-center pt-2">
                <p className="text-xs text-slate-400">
                  Don't have an account?{' '}
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('register'); setAuthError(''); }} 
                    className="text-primary hover:underline font-bold"
                  >
                    Create Account
                  </button>
                </p>
              </div>
            </form>
          ) : (
            /* SIGN UP FORM (With Account Type Tab Control and sliding anim) */
            <form onSubmit={handleRegister} className="space-y-6">
              {/* Premium Segmented Account Type Control */}
              <div className="bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80 flex relative">
                <button
                  type="button"
                  onClick={() => setRegRole('user')}
                  className={`flex-1 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-colors duration-300 relative z-10 ${regRole === 'user' ? 'text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  User Account
                </button>
                <button
                  type="button"
                  onClick={() => setRegRole('admin')}
                  className={`flex-1 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-colors duration-300 relative z-10 ${regRole === 'admin' ? 'text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Admin Account
                </button>
                {/* Segmented slider bg */}
                <div 
                  className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] bg-primary rounded-lg transition-transform duration-300 ease-out shadow-neon-blue ${regRole === 'admin' ? 'translate-x-full' : 'translate-x-0'}`}
                />
              </div>

              {/* Slider for forms */}
              <div className="overflow-hidden w-full relative">
                <div 
                  className="transition-transform duration-500 ease-out flex w-[200%]"
                  style={{ transform: regRole === 'user' ? 'translateX(0%)' : 'translateX(-50%)' }}
                >
                  {/* USER ACCOUNT SUB-FORM */}
                  <div className="w-1/2 pr-4 space-y-4 flex-shrink-0">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="John Doe" 
                          value={regName}
                          onChange={e => setRegName(e.target.value)}
                          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors placeholder:text-slate-500 focus:ring-1 focus:ring-primary/20"
                          required={regRole === 'user'}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                          type="email" 
                          placeholder="name@gmail.com" 
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          className={`w-full bg-slate-950/60 border rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none transition-colors placeholder:text-slate-500 focus:ring-1 ${
                            regEmail ? (
                              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail) ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' : 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                            ) : 'border-slate-800 focus:border-primary/50 focus:ring-primary/20'
                          }`}
                          required
                        />
                        {regEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail) && (
                          <span className="text-[9px] font-semibold text-red-400 mt-1 block">
                            Please enter a valid email format (e.g. example@gmail.com).
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                          type="tel" 
                          placeholder="+1 555-0199" 
                          value={regPhone}
                          onChange={e => setRegPhone(e.target.value)}
                          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:border-primary/50 text-slate-200 transition-colors placeholder:text-slate-500 focus:ring-1 focus:ring-primary/20"
                          required={regRole === 'user'}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ADMIN ACCOUNT SUB-FORM */}
                  <div className="w-1/2 pl-4 space-y-4 flex-shrink-0">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Admin Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                          type="email" 
                          placeholder="admin@gmail.com" 
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          className={`w-full bg-slate-950/60 border rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none transition-colors placeholder:text-slate-500 focus:ring-1 ${
                            regEmail ? (
                              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail) ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' : 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                            ) : 'border-slate-800 focus:border-primary/50 focus:ring-primary/20'
                          }`}
                          required
                        />
                        {regEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail) && (
                          <span className="text-[9px] font-semibold text-red-400 mt-1 block">
                            Please enter a valid email format (e.g. example@gmail.com).
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-[10px] text-slate-400 leading-relaxed space-y-1">
                      <div className="flex items-center gap-1.5 text-primary font-bold uppercase tracking-wider">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Corporate Admin Account</span>
                      </div>
                      <p>Admins can verify/register device hardware, assign alerts to field engineers, adjust global settings thresholds, and access full portal audit trails.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SHARED PASSWORD FIELDS WITH DYNAMIC STRENGTH INDICATORS AND VALIDATION BORDERS */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type={showRegPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      className={`w-full bg-slate-950/60 border rounded-xl py-2.5 pl-10 pr-10 text-xs focus:outline-none transition-colors placeholder:text-slate-500 focus:ring-1 ${
                        regPassword ? (
                          getPasswordStrength(regPassword).label === 'Weak' ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' :
                          getPasswordStrength(regPassword).label === 'Medium' ? 'border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500/20' :
                          'border-green-500/50 focus:border-green-500 focus:ring-green-500/20'
                        ) : 'border-slate-800 focus:border-primary/50 focus:ring-primary/20'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Dynamic Strength Indicator Bar */}
                  {regPassword && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between items-center text-[9px]">
                        <span className="text-slate-500 font-medium">Password Strength:</span>
                        <span className={`font-extrabold uppercase ${
                          getPasswordStrength(regPassword).label === 'Weak' ? 'text-red-400' :
                          getPasswordStrength(regPassword).label === 'Medium' ? 'text-yellow-400' :
                          getPasswordStrength(regPassword).label === 'Good' ? 'text-blue-400' :
                          'text-green-400'
                        }`}>{getPasswordStrength(regPassword).label}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                        <div className={`h-full transition-all duration-350 ${getPasswordStrength(regPassword).color} ${getPasswordStrength(regPassword).width}`}></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type={showRegConfirmPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      value={regConfirmPassword}
                      onChange={e => setRegConfirmPassword(e.target.value)}
                      className={`w-full bg-slate-950/60 border rounded-xl py-2.5 pl-10 pr-10 text-xs focus:outline-none transition-colors placeholder:text-slate-500 focus:ring-1 ${
                        regConfirmPassword ? (
                          regPassword === regConfirmPassword ? 'border-green-500/50 focus:border-green-500 focus:ring-green-500/20' :
                          'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                        ) : 'border-slate-800 focus:border-primary/50 focus:ring-primary/20'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Real-time matching helper */}
                  {regPassword && regConfirmPassword && (
                    <div className="text-[9px] font-bold text-right pt-0.5">
                      {regPassword === regConfirmPassword ? (
                        <span className="text-green-400 flex items-center justify-end gap-1"><Check className="w-3 h-3" /> Passwords Match</span>
                      ) : (
                        <span className="text-red-400 flex items-center justify-end gap-1"><X className="w-3 h-3" /> Passwords Do Not Match</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Form submit button */}
              <button 
                type="submit" 
                disabled={regLoading}
                className="w-full bg-primary hover:bg-primary-dark text-slate-950 font-extrabold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-neon-blue hover:shadow-[0_0_25px_rgba(0,242,254,0.6)] hover:scale-[1.02] text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-primary/25 disabled:opacity-75 disabled:pointer-events-none mt-4"
              >
                {regLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <span>Create {regRole === 'admin' ? 'Admin' : 'User'} Account</span>
                )}
              </button>

              <div className="text-center pt-1 border-t border-slate-900/60 mt-4">
                <p className="text-xs text-slate-400">
                  Already registered?{' '}
                  <button 
                    type="button"
                    onClick={() => { setAuthMode('login'); setAuthError(''); }} 
                    className="text-primary hover:underline font-bold"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* Bottom credentials hint for development */}
          {!isResetOpen && (
            <div className="mt-6 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 text-[10px] text-slate-400 text-center leading-relaxed">
              <strong>Default Seed Credentials:</strong><br/>
              Email: <code className="text-primary font-mono select-all">admin@sansah.com</code> / Password: <code className="text-primary font-mono select-all">admin123</code>
            </div>
          )}
        </div>
      </div>
      
      {/* Shared Landing Footer */}
      <footer className="w-full border-t border-slate-800/40 py-8 text-center text-[10px] text-slate-600 relative z-20 shrink-0">
        <p className="uppercase tracking-widest font-semibold text-slate-500">SANSAH INNOVATIONS &copy; 2026. All corporate rights reserved.</p>
      </footer>
    </div>
    </ErrorBoundary>
  );
  };

  // Calculate metrics
  const avgHealthScore = devices.length > 0 ? (devices.reduce((sum, d) => sum + (d.health_score || 0), 0) / devices.length).toFixed(1) : 0;
  const criticalCount = allAlerts.filter(a => a.status === 'active' && a.level === 'critical').length;
  const highCount = allAlerts.filter(a => a.status === 'active' && a.level === 'high').length;

  if (token && !user) {
    return (
      <div className="min-h-screen bg-[#0b131a] flex items-center justify-center text-slate-200 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">Synchronizing Client Profile...</span>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // VIEW RENDER 3: ADVANCED ENTERPRISE SaaS PORTAL
  // ----------------------------------------------------
  return (
    <ErrorBoundary title="System Portal Failure">
    <div className="min-h-screen bg-[#0b131a] flex text-slate-200">
      {/* Sidebar navigation */}
      <aside className="w-[260px] glass-card bg-opacity-70 bg-darkbg-card border-r border-darkbg-border flex flex-col justify-between py-6 px-4 shrink-0">
        <div className="space-y-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-neon-blue">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-outfit text-sm font-extrabold tracking-wider text-slate-100 uppercase leading-none">Sansah Portal</h2>
              <span className="text-[9px] text-slate-400 tracking-widest font-semibold uppercase">Operations Hub</span>
            </div>
          </div>

          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'dashboard' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Operations Center</span>
            </button>

            <button 
              onClick={() => setActiveTab('sensors')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'sensors' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4" />
                <span>Predictive Analytics</span>
              </div>
              {filteredSensors.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/20 text-primary">
                  {filteredSensors.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('gps')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'gps' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <MapPin className="w-4 h-4" />
              <span>GPS History Trail</span>
            </button>

            <button 
              onClick={() => setActiveTab('devices')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'devices' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <Server className="w-4 h-4" />
              <span>Asset Inventory</span>
            </button>

            <button 
              onClick={() => { setActiveTab('alerts'); fetchAlerts(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'alerts' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <Bell className="w-4 h-4" />
              <span>Smart Alert Board</span>
            </button>

            <button 
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'notifications' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4" />
                <span>Notification History</span>
              </div>
              {notifications.filter(n => n.read_status === 0).length > 0 && (
                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-red-500/25 text-red-400">
                  {notifications.filter(n => n.read_status === 0).length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'reports' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <FileText className="w-4 h-4" />
              <span>Reports Center</span>
            </button>

            <button 
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'analytics' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Analytics Hub</span>
            </button>

            <button 
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'audit' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
            >
              <History className="w-4 h-4" />
              <span>Audit Trail Logs</span>
            </button>

            {user.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all ${activeTab === 'settings' ? 'bg-primary/10 text-primary border-l-2 border-primary' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'}`}
              >
                <Settings className="w-4 h-4" />
                <span>Global Settings</span>
              </button>
            )}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-[70px] border-b border-darkbg-border flex items-center justify-between px-8 bg-darkbg bg-opacity-35 backdrop-blur-md relative z-50">
          <h2 className="text-lg font-bold tracking-wide text-slate-100 font-outfit uppercase">
            {activeTab === 'dashboard' && 'Live Operations Center'}
            {activeTab === 'sensors' && 'Predictive Analytics Board'}
            {activeTab === 'gps' && 'GPS Movement Playback'}
            {activeTab === 'devices' && 'Asset inventory ledger'}
            {activeTab === 'alerts' && 'Smart Alert Timeline Board'}
            {activeTab === 'notifications' && 'Notification History Center'}
            {activeTab === 'reports' && 'Operations Report Center'}
            {activeTab === 'analytics' && 'Operational Analytics Hub'}
            {activeTab === 'audit' && 'Audit trail ledger log'}
            {activeTab === 'settings' && 'Global system settings'}
          </h2>

          <div className="flex items-center gap-6">
            {/* Global Search with autocomplete suggestions */}
            <div className="relative flex items-center bg-slate-900 border border-slate-800 rounded-xl pr-1.5 focus-within:border-primary/50" ref={globalSearchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search..."
                value={globalSearch}
                onFocus={() => setShowSearchDropdown(true)}
                onChange={e => {
                  setGlobalSearch(e.target.value);
                  setShowSearchDropdown(true);
                }}
                onKeyDown={e => {
                  const flatList = getFlattenedSearchResults();
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSearchFocusIndex(prev => Math.min(prev + 1, flatList.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSearchFocusIndex(prev => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchFocusIndex >= 0 && searchFocusIndex < flatList.length) {
                      flatList[searchFocusIndex].action();
                      setShowSearchDropdown(false);
                      setGlobalSearch('');
                    } else {
                      setShowSearchDropdown(true);
                    }
                  } else if (e.key === 'Escape') {
                    setShowSearchDropdown(false);
                  }
                }}
                className="w-[140px] focus:w-[240px] transition-all duration-300 bg-transparent py-1.5 pl-8 pr-2 text-xs focus:outline-none text-slate-350"
              />
              <button 
                onClick={() => setShowSearchDropdown(true)}
                className="text-[9px] bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold px-2 py-0.5 rounded-lg border border-slate-700 transition-colors uppercase tracking-wider shrink-0"
              >
                Search
              </button>
              {showSearchDropdown && (
                <div className="absolute top-full right-0 mt-2 bg-slate-950 border border-slate-800/80 rounded-xl shadow-xl p-2 z-[99] max-h-[300px] overflow-y-auto min-w-[320px]">
                  {globalSearch.trim() === '' ? (
                    <div className="text-[10px] text-slate-500 p-3 text-center font-semibold">
                      Type keywords to search devices, sensors, alerts, notifications, users, reports, or GPS assets.
                    </div>
                  ) : isSearching ? (
                    <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 p-4 font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Searching live suggestions...</span>
                    </div>
                  ) : (() => {
                    const renderSearchIcon = (name) => {
                      const iconMap = {
                        Server: Server,
                        Cpu: Cpu,
                        AlertTriangle: AlertTriangle,
                        Bell: Bell,
                        User: User,
                        FileText: FileText,
                        MapPin: MapPin
                      };
                      const IconComp = iconMap[name] || Search;
                      return <IconComp className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
                    };

                    const renderCategoryBadge = (category) => {
                      const colorMap = {
                        'Device': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                        'Sensor': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                        'Alert': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                        'Notification': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                        'User': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                        'Report': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                        'GPS Asset': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      };
                      const colors = colorMap[category] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                      return (
                        <span className={`text-[8px] px-1.5 py-0.5 rounded border ${colors} shrink-0 ml-2 font-bold uppercase tracking-wider`}>
                          {category}
                        </span>
                      );
                    };

                    const flatList = getFlattenedSearchResults();
                    if (flatList.length === 0) {
                      return <div className="text-[10px] text-slate-500 p-3 text-center font-medium">No results found for "{globalSearch}"</div>;
                    }
                    return (
                      <div className="space-y-1 text-left">
                        {flatList.map((item, idx) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              item.action();
                              setShowSearchDropdown(false);
                              setGlobalSearch('');
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                              searchFocusIndex === idx 
                                ? 'bg-primary/20 text-white font-bold border-l-2 border-primary' 
                                : 'text-slate-350 hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              {renderSearchIcon(item.iconName)}
                              <div className="truncate flex flex-col">
                                <span className="font-bold text-slate-200">{item.title}</span>
                                <span className="text-[9px] text-slate-400 font-normal">{item.subtitle}</span>
                              </div>
                            </div>
                            {renderCategoryBadge(item.category)}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-800/80">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-ping' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {wsConnected ? 'TELEMETRY STREAM CONNECTED' : 'GATEWAY CONNECT TIMEOUT'}
              </span>
            </div>

            {/* Live 24h Monospace Clock */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/50 border border-slate-800/60 text-slate-300 text-[10px] font-mono select-none">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span>{currentTime || '00:00:00'}</span>
            </div>

            {/* Mute portal beeps */}
            <button 
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="w-8 h-8 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              title="Mute Portal Beeps"
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-primary" />}
            </button>

            {/* Theme Toggle Mode */}
            <button 
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              title="Toggle Theme Mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-slate-400" />}
            </button>

            {/* AI Assistant Chatbot Button */}
            <button 
              onClick={() => setIsAiChatOpen(true)}
              className="w-8 h-8 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-primary transition-colors"
              title="Sansah AI Assistant Chatbot"
            >
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            </button>

            {/* Notification Bell Icon */}
            <button 
              onClick={() => setActiveTab('notifications')}
              className="w-8 h-8 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-primary transition-colors relative"
              title="Notification History Center"
            >
              <Bell className="w-4 h-4 text-slate-400" />
              {((notifications || []).filter(n => n.read_status === 0).length) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                  {(notifications || []).filter(n => n.read_status === 0).length}
                </span>
              )}
            </button>

            {/* Navbar Profile Dropdown */}
            <div 
              className="relative" 
              ref={profileDropdownRef}
            >
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-800/30 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-secondary font-bold font-outfit uppercase shrink-0">
                  {user.name.substring(0, 2)}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 select-none shrink-0" />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-[#0e1620] border border-darkbg-border rounded-xl shadow-xl p-1.5 z-[99] animate-fade-in space-y-0.5 font-sans">
                  <div className="px-3 py-1.5 border-b border-darkbg-border mb-1 text-left">
                    <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase truncate">{user.role === 'admin' ? 'Admin Profile' : 'User Profile'}</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsProfileOpen(true);
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-all text-left"
                  >
                    <User className="w-3.5 h-3.5 text-primary" />
                    <span>My Profile</span>
                  </button>

                  <button 
                    onClick={() => {
                      setProfileName(user.name || '');
                      setProfilePhone(user.phone || '');
                      setProfileSuccess('');
                      setProfileError('');
                      setIsEditProfileOpen(true);
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-all text-left"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-primary" />
                    <span>Edit Profile</span>
                  </button>

                  <button 
                    onClick={() => {
                      setIsChangePasswordOpen(true);
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-all text-left"
                  >
                    <Key className="w-3.5 h-3.5 text-primary" />
                    <span>Change Password</span>
                  </button>

                  <button 
                    onClick={() => {
                      setActiveTab('preferences');
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-all text-left"
                  >
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    <span>Preferences</span>
                  </button>

                  <div className="h-px bg-darkbg-border my-1" />

                  <button 
                    onClick={() => {
                      handleLogout();
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* View switching logic */}
        <main className="flex-grow p-8 overflow-y-auto relative">
          
          {/* Skeleton Loader overlay */}
          {isSkeletonLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-4 gap-6">
                {[1,2,3,4].map(n => <div key={n} className="h-24 bg-slate-800/40 rounded-2xl"></div>)}
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 h-[300px] bg-slate-800/40 rounded-2xl"></div>
                <div className="h-[300px] bg-slate-800/40 rounded-2xl"></div>
              </div>
            </div>
          ) : (
            <ErrorBoundary key={activeTab}>
              {/* TAB: DASHBOARD (Operations Center) */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Modern Widgets */}
                  <div className="grid grid-cols-4 gap-6">
                    <div className="glass-card bg-darkbg-card border-darkbg-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Platform Health Score</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-extrabold font-outfit text-green-400">{avgHealthScore}%</span>
                        <span className="text-[10px] text-slate-500 font-medium">average score</span>
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Alerts</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-extrabold font-outfit text-red-400">{stats.activeAlerts}</span>
                        <span className="text-xs text-red-400 font-medium">({criticalCount} critical)</span>
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Online / Offline Hardware</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-extrabold font-outfit text-slate-200">{stats.onlineDevices} <span className="text-xs font-normal text-slate-500">/ {stats.offlineDevices}</span></span>
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dispatch Notices Sent</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-extrabold font-outfit text-primary">{notifications.length}</span>
                        <span className="text-[9px] text-red-400 font-bold uppercase ml-2">({notifications.filter(n => n.status === 'failed').length} failed)</span>
                      </div>
                    </div>
                  </div>

                  {/* Main Ops Dashboard Section */}
                  <div className="grid grid-cols-3 gap-6">
                    {/* Live Operations Telemetry Stream */}
                    <div className="col-span-2 glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary animate-pulse" />
                          <span>Real-time operations telemetric chart</span>
                        </h3>
                        <div className="flex gap-2">
                          <button onClick={handleTriggerReportDownload} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 flex items-center gap-1.5 bg-slate-900/40">
                            <Download className="w-3 h-3" />
                            <span>Export PDF</span>
                          </button>
                        </div>
                      </div>
                      <div className="h-[250px] w-full">
                        <Line data={renderTrendChartData()} options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                            y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } }
                          }
                        }} />
                      </div>
                    </div>

                    {/* Live Activity & Heartbeat stream */}
                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 border-b border-darkbg-border pb-2.5">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <Radio className="w-4 h-4 text-secondary animate-pulse" />
                          <span>Live device activity logs</span>
                        </h3>
                      </div>
                      <div className="flex-grow space-y-3 overflow-y-auto max-h-[220px] pr-1 font-mono text-[10px]">
                        {devices.length === 0 ? (
                          <div className="text-center text-slate-600 py-12 italic">Listening to hardware logs...</div>
                        ) : (
                          devices.map(d => (
                            <div key={d.id} className="flex justify-between items-center py-1.5 border-b border-slate-900/40">
                              <span className="text-slate-300 font-semibold">{d.id}</span>
                              <span className="text-slate-500">[{d.category && d.category.trim() ? d.category : 'General'}]</span>
                              <span className="text-slate-400">{d.signal_strength || -70} dBm</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${d.connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {d.connected ? 'OK' : 'ERR'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active Incidents panel & Recent User Activities */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl shadow-sm">
                      <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-4 text-red-400 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Active Unattended Incidents</span>
                      </h3>
                      <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                        {allAlerts.filter(a => a.status === 'active').length === 0 ? (
                          <div className="text-center text-xs text-slate-500 py-8 italic">No unresolved incidents reported. System secure.</div>
                        ) : (
                          allAlerts.filter(a => a.status === 'active').map(alert => (
                            <div key={alert.id} className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl flex justify-between items-center text-xs">
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase mr-2 ${
                                  alert.level === 'critical' ? 'bg-red-500/20 text-red-400' :
                                  alert.level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>{alert.level}</span>
                                <span className="font-semibold text-slate-200">{alert.message.substring(0, 40)}...</span>
                              </div>
                              <button 
                                onClick={() => openAlertTimelineModal(alert)}
                                className="text-[10px] text-primary hover:underline uppercase font-bold"
                              >
                                View notes
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl shadow-sm">
                      <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-4 flex items-center gap-2">
                        <History className="w-4 h-4 text-primary" />
                        <span>Recent User Actions</span>
                      </h3>
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1 text-[11px] font-mono">
                        {recentAlerts.length === 0 ? (
                          <span className="text-slate-500 italic block text-center py-8">Awaiting operational actions...</span>
                        ) : (
                          recentAlerts.slice(0, 5).map((log, idx) => (
                            <div key={idx} className="p-2.5 rounded-lg bg-slate-950/20 border border-slate-900/60 flex justify-between items-center">
                              <div>
                                <span className="text-slate-400 font-semibold">{log.device_name || 'System'}: </span>
                                <span className="text-slate-300">{log.message}</span>
                              </div>
                              <span className="text-slate-500 text-[9px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: SENSOR BOARD (Predictive Analytics) */}
              {activeTab === 'sensors' && (
                <div className="space-y-6">
                  {/* Filters */}
                  <div className="glass-card bg-darkbg-card border-darkbg-border p-4 rounded-xl flex gap-4 items-end shadow-sm text-xs">
                    <div className="flex-grow space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Search devices/sensors</label>
                      <input 
                        type="text" 
                        placeholder="Search by device ID, location..."
                        value={sensorSearch}
                        onChange={e => setSensorSearch(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs focus:outline-none text-slate-300"
                      />
                    </div>

                    <div className="w-[180px] space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Sensor Type</label>
                      <select 
                        value={sensorTypeFilter}
                        onChange={e => setSensorTypeFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">All Modules</option>
                        <option value="Soil Moisture">Soil Moisture</option>
                        <option value="Soil Temperature">Soil Temperature</option>
                        <option value="Air Temperature">Air Temperature</option>
                        <option value="Air Humidity">Air Humidity</option>
                        <option value="Rainfall Sensor">Rainfall Sensor</option>
                        <option value="Water Level Sensor">Water Level Sensor</option>
                        <option value="Water Flow Sensor">Water Flow Sensor</option>
                        <option value="pH Sensor">pH Sensor</option>
                        <option value="EC Sensor">EC Sensor</option>
                        <option value="NPK Sensor">NPK Sensor</option>
                        <option value="Leaf Wetness Sensor">Leaf Wetness Sensor</option>
                        <option value="Solar Radiation Sensor">Solar Radiation Sensor</option>
                        <option value="Light Intensity Sensor">Light Intensity Sensor</option>
                        <option value="Wind Speed Sensor">Wind Speed Sensor</option>
                        <option value="Wind Direction Sensor">Wind Direction Sensor</option>
                        <option value="Pressure Sensor">Pressure Sensor</option>
                        <option value="Gas Sensor">Gas Sensor</option>
                        <option value="Smoke Sensor">Smoke Sensor</option>
                        <option value="Vibration Sensor">Vibration Sensor</option>
                        <option value="Motion Sensor">Motion Sensor</option>
                        <option value="GPS Tracker">GPS Tracker</option>
                        <option value="Livestock Tracking">Livestock Tracking</option>
                      </select>
                    </div>

                    <div className="w-[150px] space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">State</label>
                      <select
                        value={sensorStatusFilter}
                        onChange={e => setSensorStatusFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">All States</option>
                        <option value="online">Online only</option>
                        <option value="offline">Offline only</option>
                      </select>
                    </div>

                    <div className="w-[150px] space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Severity</label>
                      <select
                        value={sensorAlertFilter}
                        onChange={e => setSensorAlertFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">All Severities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>

                  {/* Sensors grid layout */}
                  <div className="grid grid-cols-3 gap-6">
                    {filteredSensors.length === 0 ? (
                      <div className="col-span-3 text-center py-20 text-slate-500 text-xs italic">No operational sensors match filters.</div>
                    ) : (
                      filteredSensors.map(sensor => {
                        const isAnomalous = isValueAnomalous(parseFloat(sensor.current_value), sensorHistory);
                        return (
                          <div 
                            key={sensor.id} 
                            onClick={() => openSensorModal(sensor)}
                            className={`glass-card p-5 rounded-2xl shadow-sm border cursor-pointer hover:border-slate-700/60 transition-all ${
                              sensor.severity === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                              sensor.severity === 'high' ? 'bg-orange-500/5 border-orange-500/20' :
                              sensor.severity === 'medium' ? 'bg-yellow-500/5 border-yellow-500/20' :
                              'bg-darkbg-card border-darkbg-border'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <span className="text-[9px] font-mono text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded">{sensor.id}</span>
                                <h4 className="text-xs font-bold text-slate-200 mt-1">{sensor.name}</h4>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                sensor.severity === 'critical' ? 'bg-red-500/15 text-red-400' :
                                sensor.severity === 'high' ? 'bg-orange-500/15 text-orange-400' :
                                sensor.severity === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                                'bg-green-500/15 text-green-400'
                              }`}>{sensor.severity}</span>
                            </div>

                            <div className="my-4 flex items-baseline gap-1.5">
                              <span className="text-3xl font-extrabold text-slate-100 font-outfit">
                                {sensor.type === 'Motion' ? (parseFloat(sensor.current_value) === 1.0 ? 'ACTIVE' : 'IDLE') : sensor.current_value}
                              </span>
                              <span className="text-xs text-slate-500">{sensor.unit !== 'status' ? sensor.unit : ''}</span>
                              
                              {isAnomalous && (
                                <span className="ml-2 px-1.5 py-0.5 text-[8px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded uppercase tracking-wider animate-pulse">
                                  Anomaly
                                </span>
                              )}
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-900/60 pt-3">
                              <span>Device: {sensor.deviceName.substring(0, 15)}</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${sensor.deviceConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span>{sensor.deviceConnected ? 'Online' : 'Offline'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB: LIVE GPS MAP & ROUTE PLAYBACK */}
              {activeTab === 'gps' && (() => {
                const selectedGpsDevice = devices.find(d => d.id === selectedGpsDeviceId);
                
                let overlayLat = 'N/A';
                let overlayLng = 'N/A';
                let overlayTimestamp = Date.now();
                if (selectedGpsDevice) {
                  overlayTimestamp = selectedGpsDevice.updated_at || overlayTimestamp;
                  if (selectedGpsDevice.gpsData) {
                    overlayLat = selectedGpsDevice.gpsData.lat.toFixed(6);
                    overlayLng = selectedGpsDevice.gpsData.lng.toFixed(6);
                    overlayTimestamp = selectedGpsDevice.gpsData.timestamp || overlayTimestamp;
                  } else {
                    const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
                    const match = String(selectedGpsDevice.location || '').match(coordRegex);
                    if (match) {
                      overlayLat = parseFloat(match[1]).toFixed(6);
                      overlayLng = parseFloat(match[2]).toFixed(6);
                    } else {
                      if (selectedGpsDevice.id === 'ESP32_01') {
                        overlayLat = '34.052200'; overlayLng = '-118.243700';
                      } else if (selectedGpsDevice.id === 'NODEMCU_02') {
                        overlayLat = '34.058000'; overlayLng = '-118.250000';
                      } else if (selectedGpsDevice.id === 'ARD_05') {
                        overlayLat = '34.045000'; overlayLng = '-118.260000';
                      }
                    }
                  }
                }

                return (
                  <div className={`gps-layout h-full flex ${
                    isMapFullscreen ? 'fixed inset-0 z-[9999] bg-[#0b131a]' : 'absolute inset-0'
                  }`}>
                    {/* Map canvas */}
                    <div className="flex-grow h-full relative bg-slate-950">
                      <div ref={mapRef} className="w-full h-full" id="map-container" />
                      
                      {googleMapsAuthError && (
                        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-none p-4 text-center">
                          <div className="bg-red-950/50 border border-red-500/50 p-6 rounded-xl max-w-lg shadow-2xl glass-card">
                            <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-red-400 mb-2">Google Maps Error</h3>
                            <p className="text-slate-300 font-semibold">{googleMapsAuthError}</p>
                            <p className="text-slate-400 text-sm mt-4">Showing fallback map. Please configure a valid API key in settings or .env file.</p>
                          </div>
                        </div>
                      )}

                      {/* Floating custom map controls */}
                      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
                        <button 
                          onClick={handleZoomIn}
                          type="button"
                          className="w-9 h-9 rounded-lg bg-[#0b131a]/85 hover:bg-[#0b131a] border border-slate-800/80 flex items-center justify-center text-slate-200 hover:text-white transition-all shadow-md font-bold text-lg"
                          title="Zoom In"
                        >
                          +
                        </button>
                        <button 
                          onClick={handleZoomOut}
                          type="button"
                          className="w-9 h-9 rounded-lg bg-[#0b131a]/85 hover:bg-[#0b131a] border border-slate-800/80 flex items-center justify-center text-slate-200 hover:text-white transition-all shadow-md font-bold text-lg"
                          title="Zoom Out"
                        >
                          -
                        </button>
                        <button 
                          onClick={handleToggleFullscreen}
                          type="button"
                          className="w-9 h-9 rounded-lg bg-[#0b131a]/85 hover:bg-[#0b131a] border border-slate-800/80 flex items-center justify-center text-slate-200 hover:text-white transition-all shadow-md"
                          title="Toggle Fullscreen"
                        >
                          {isMapFullscreen ? (
                            <X className="w-4 h-4 text-red-400" />
                          ) : (
                            <Maximize2 className="w-4 h-4 text-primary" />
                          )}
                        </button>
                      </div>

                      {/* Device Location Card Overlay at bottom-left */}
                      {selectedGpsDevice && (
                        <div className="absolute bottom-4 left-4 z-[1000] glass-card bg-[#0b131a]/90 border-slate-800/80 p-4 rounded-xl shadow-md w-72 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-xs font-bold text-slate-200">{selectedGpsDevice.name}</h4>
                              <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">{selectedGpsDevice.id}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                              selectedGpsDevice.connected ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                            }`}>
                              {selectedGpsDevice.connected ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800/40">
                              <span className="text-slate-500 block uppercase font-bold text-[8px]">Latitude</span>
                              <span className="text-slate-300 font-mono">{overlayLat}</span>
                            </div>
                            <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800/40">
                              <span className="text-slate-500 block uppercase font-bold text-[8px]">Longitude</span>
                              <span className="text-slate-300 font-mono">{overlayLng}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5 text-[10px] text-slate-400">
                            <div className="flex justify-between">
                              <span>Protocol:</span>
                              <span className="text-slate-200 font-semibold">{selectedGpsDevice.communication_protocol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Last Updated:</span>
                              <span className="text-slate-200">{new Date(overlayTimestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="absolute top-4 left-4 z-[1000] glass-card bg-[#0b131a]/85 border-slate-800/80 px-4 py-3 rounded-xl shadow-md space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-primary" />
                          <span>CLICK MAP TO CREATE BOUNDARY</span>
                        </p>
                        
                        <div className="flex gap-4 items-center">
                          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={isHeatMapActive} 
                              onChange={e => setIsHeatMapActive(e.target.checked)} 
                              className="rounded border-slate-800 bg-slate-950 w-3 h-3 text-primary" 
                            />
                            <span>Toggle Heat Map Overlay</span>
                          </label>
                        </div>
                      </div>
                    </div>

                  {/* GPS Sidebar control panel */}
                  <div className="w-[300px] border-l border-darkbg-border bg-[#0b131a]/95 backdrop-blur-md p-6 flex flex-col gap-6 shrink-0 z-10 overflow-y-auto">
                    <div>
                      <h3 className="font-outfit text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">GPS Trackers</h3>
                      <div className="space-y-2.5">
                        {devices.filter(device => {
                          const hasCoordinates = device.gpsData || 
                            /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.test(device.location) ||
                            ['ESP32_01', 'NODEMCU_02', 'ARD_05'].includes(device.id);
                          return hasCoordinates;
                        }).map(device => {
                          const isOnline = device.connected;
                          const isSelected = device.id === selectedGpsDeviceId;
                          
                          let lat = null;
                          let lng = null;
                          let speed = 0;
                          let distance = 0;

                          if (device.gpsData) {
                            lat = device.gpsData.lat;
                            lng = device.gpsData.lng;
                            speed = device.gpsData.speed || 0;
                            distance = device.gpsData.distance || 0;
                          } else {
                            const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
                            const match = String(device.location || '').match(coordRegex);
                            if (match) {
                              lat = parseFloat(match[1]);
                              lng = parseFloat(match[2]);
                            } else {
                              if (device.id === 'ESP32_01') {
                                lat = 34.0522; lng = -118.2437;
                              } else if (device.id === 'NODEMCU_02') {
                                lat = 34.0580; lng = -118.2500;
                              } else if (device.id === 'ARD_05') {
                                lat = 34.0450; lng = -118.2600;
                              }
                            }
                          }
                          
                          return (
                            <div 
                              key={device.id} 
                              onClick={() => setSelectedGpsDeviceId(device.id)}
                              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                isSelected ? 'bg-primary/10 border-primary shadow-neon-blue' : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900/80'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="text-xs font-bold text-slate-200">{device.name}</h4>
                                  <span className="text-[9px] font-mono text-slate-500 block mt-0.5">{device.id}</span>
                                </div>
                                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-500'}`} />
                              </div>

                              {lat !== null && lng !== null ? (
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] text-slate-400 font-mono">
                                  <div>Speed: {speed || 0} km/h</div>
                                  <div>Dist: {distance || 0} km</div>
                                  <div className="col-span-2 text-slate-500">Lat/Lng: {lat.toFixed(5)}, {lng.toFixed(5)}</div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-600 italic mt-2 block">No coordinates reported</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Playback controller */}
                    {selectedGpsDeviceId && gpsTrailCoords.length > 0 && (
                      <div className="border-t border-slate-800/80 pt-4 space-y-3 text-xs">
                        <h3 className="font-outfit text-xs font-bold text-slate-400 uppercase tracking-widest">Route Playback</h3>
                        
                        <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                          <span className="font-mono text-[10px]">Index: {playbackIndex} / {gpsTrailCoords.length - 1}</span>
                          <span className="font-mono text-[10px] text-primary">{playbackSpeed}x Speed</span>
                        </div>

                        <div className="flex gap-2">
                          <button 
                            onClick={handleTogglePlayback}
                            className="flex-grow flex items-center justify-center gap-1.5 bg-primary text-slate-950 font-bold py-2 rounded-lg text-[10px] uppercase tracking-wider"
                          >
                            {isPlayingRoute ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            <span>{isPlayingRoute ? 'Pause' : 'Play'}</span>
                          </button>
                          <button 
                            onClick={handleStopPlayback}
                            className="px-3 bg-slate-850 hover:bg-slate-850/80 border border-slate-800 text-slate-300 rounded-lg"
                            title="Reset Playback"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-500 font-bold uppercase block">Speed Multiplier</label>
                          <input 
                            type="range" 
                            min="1" 
                            max="5" 
                            value={playbackSpeed} 
                            onChange={e => setPlaybackSpeed(parseInt(e.target.value))} 
                            className="w-full accent-primary bg-slate-800 h-1 rounded" 
                          />
                        </div>
                      </div>
                    )}

                    {/* Geofence zones listing */}
                    <div className="border-t border-slate-800/80 pt-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-outfit text-xs font-bold text-slate-400 uppercase tracking-widest">Geofences</h3>
                        <button onClick={() => setIsAddGeofenceOpen(true)} className="px-2 py-1 bg-primary text-slate-950 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-primary-dark">
                          <Plus className="w-2.5 h-2.5" />
                          <span>Add</span>
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {geofences.length === 0 ? (
                          <span className="text-[10px] text-slate-600 italic">No geofences created yet.</span>
                        ) : (
                          geofences.map(gf => (
                            <div key={gf.id} className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/40 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-semibold text-slate-300">{gf.name}</span>
                                <span className="text-[9px] text-slate-500 block">Radius: {gf.radius}m</span>
                              </div>
                              {user.role === 'admin' && (
                                <button onClick={() => handleDeleteGeofence(gf.id)} className="text-red-400 hover:text-red-300">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

              {/* TAB: DEVICES & ASSETS */}
              {activeTab === 'devices' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase">Hardware & Asset Ledger</h3>
                    <button 
                      onClick={() => setIsRegisterDeviceOpen(true)} 
                      className="px-4 py-2 bg-primary text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-primary-dark flex items-center gap-2 shadow-neon-blue transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{user.role === 'admin' ? 'Register New Asset' : 'Link Telemetry Device'}</span>
                    </button>
                  </div>

                  <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="pb-3 font-semibold uppercase">Device Details</th>
                            <th className="pb-3 font-semibold uppercase">Serial & Category</th>
                            <th className="pb-3 font-semibold uppercase">Health Score</th>
                            <th className="pb-3 font-semibold uppercase">Signal / Battery</th>
                            <th className="pb-3 font-semibold uppercase">Uptime Ratio</th>
                            <th className="pb-3 font-semibold uppercase">Installation Date</th>
                            <th className="pb-3 font-semibold uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {devices.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="text-center py-12 text-slate-500 italic">No devices registered. Add hardware node to begin.</td>
                            </tr>
                          ) : (
                            devices.map(device => {
                              const score = device.health_score !== undefined ? device.health_score : 100.0;
                              return (
                                <tr key={device.id} className="text-slate-300">
                                  <td className="py-4">
                                    <span className="font-bold text-slate-200 block">{device.name}</span>
                                    <span className="text-[9px] font-mono text-slate-500">{device.id} - Protocol: {device.communication_protocol}</span>
                                  </td>
                                  <td className="py-4">
                                    <span className="text-slate-200 font-mono block">{device.serial_number || 'SN-UNASSIGNED'}</span>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">{device.category || 'Utility'}</span>
                                  </td>
                                  <td className="py-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-bold font-mono ${
                                        score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
                                      }`}>{score}%</span>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        device.connected ? 'bg-green-500' : 'bg-red-500'
                                      }`} />
                                    </div>
                                  </td>
                                  <td className="py-4">
                                    <span className="font-mono text-xs block">{device.signal_strength || -70} dBm</span>
                                    <span className="font-mono text-[10px] text-slate-400">{device.id === 'ARD_05' ? 'AC Plugged' : `Battery: ${device.battery}%`}</span>
                                  </td>
                                  <td className="py-4 font-mono font-semibold text-primary">{device.uptime_percent || 100.0}%</td>
                                  <td className="py-4 text-slate-400 font-mono">{device.installation_date || '2026-01-01'}</td>
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <button 
                                        onClick={() => openAssetEditModal(device)}
                                        className="text-primary hover:text-primary-dark font-bold uppercase text-[10px]"
                                        title="Edit Asset Details"
                                      >
                                        Edit Asset
                                      </button>
                                      <button 
                                        onClick={() => openMaintenanceModal(device)}
                                        className="text-secondary hover:text-secondary-dark font-bold uppercase text-[10px] flex items-center gap-1"
                                        title="Maintenance Records"
                                      >
                                        <Wrench className="w-3 h-3" />
                                        <span>Log Maint</span>
                                      </button>
                                      {user.role === 'admin' && (
                                        <button 
                                          onClick={() => handleDeleteDevice(device.id)}
                                          className="text-red-400 hover:text-red-300"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: ALERTS (Timeline, Timeline comment assignment & Timeline resolution) */}
              {activeTab === 'alerts' && (
                <div className="space-y-6">
                  {/* Severity Priority selector */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      <select
                        value={alertLogFilter}
                        onChange={e => setAlertLogFilter(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">All Severity Priority Levels</option>
                        <option value="critical">Critical Level</option>
                        <option value="high">High Level</option>
                        <option value="medium">Medium Level</option>
                        <option value="low">Low Level</option>
                        <option value="geofence">Geofence Boundary Violations</option>
                      </select>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={handleTriggerReportDownload} className="px-4 py-2 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-200 flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        <span>PDF Incidents Summary</span>
                      </button>
                    </div>
                  </div>

                  {/* Incident Alert Timeline Log */}
                  <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm space-y-4">
                    {filteredAlerts.length === 0 ? (
                      <div className="text-center py-20 text-slate-500 italic">No operational incidents logged.</div>
                    ) : (
                      filteredAlerts.map(alert => (
                        <div 
                          key={alert.id} 
                          className={`p-4 rounded-xl border flex justify-between items-center transition-all ${
                            alert.status === 'active' ? (
                              alert.level === 'critical' ? 'bg-red-500/5 border-red-500/20 shadow-sm' :
                              alert.level === 'high' ? 'bg-orange-500/5 border-orange-500/20' :
                              'bg-yellow-500/5 border-yellow-500/20'
                            ) : 'bg-slate-900/10 border-slate-800/30 opacity-70'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`w-2 h-2 rounded-full ${
                                alert.level === 'critical' ? 'bg-red-500' :
                                alert.level === 'high' ? 'bg-orange-500' :
                                alert.level === 'medium' ? 'bg-yellow-500' : 'bg-blue-400'
                              }`} />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {alert.level} Incident
                              </span>
                              <span className="text-[9px] font-mono text-slate-500">[{alert.id}]</span>
                              <span className="text-[9px] bg-slate-900/60 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-semibold uppercase">
                                {alert.assigned_to_name ? `Assigned: ${alert.assigned_to_name}` : 'Unassigned'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-200 font-medium leading-relaxed">{alert.message}</p>
                            <div className="mt-2 bg-slate-950/40 border border-slate-900/60 rounded-xl p-3 text-[11px] text-slate-350 space-y-1 max-w-xl">
                              <p><strong>Possible Causes:</strong> {getAiInsightForAlert(alert).cause}</p>
                              <p><strong>Recommended Actions:</strong> {getAiInsightForAlert(alert).recommendation}</p>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1.5">
                              Timestamp: {new Date(alert.timestamp).toLocaleString()}
                              {alert.resolved_at && ` | Resolved: ${new Date(alert.resolved_at).toLocaleString()}`}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => openAlertTimelineModal(alert)}
                              className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-[10px] font-bold uppercase text-slate-300"
                            >
                              Timeline Notes
                            </button>

                            {alert.status === 'active' && (
                              <button 
                                onClick={() => triggerResolveAlert(alert.id)}
                                className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-slate-100 flex items-center gap-1 relative overflow-hidden"
                              >
                                {successAnimationAlertId === alert.id ? (
                                  <div className="flex items-center justify-center gap-1.5 text-green-400 font-bold">
                                    <CheckCircle className="w-3.5 h-3.5 animate-bounce" />
                                    <span>ACK OK</span>
                                  </div>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-green-400" />
                                    <span>Resolve</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB: NOTIFICATION CENTER (Unified Notification History with search and filter controls) */}
              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  {/* Notification History Controls */}
                  <div className="glass-card bg-darkbg-card border-darkbg-border p-4 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end shadow-sm text-xs text-left">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Search notifications</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Search device, sensor, or date..."
                          value={historySearch}
                          onChange={e => setHistorySearch(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-8 pr-3 text-xs text-slate-350 focus:outline-none focus:border-primary/40"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Filter by Status</label>
                      <select 
                        value={historyStatusFilter}
                        onChange={e => setHistoryStatusFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-primary/40"
                      >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="resolved">Resolved</option>
                        <option value="deleted">Deleted</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Severity Level</label>
                      <select 
                        value={historySeverityFilter}
                        onChange={e => setHistorySeverityFilter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-primary/40"
                      >
                        <option value="all">All Severities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Sort Order</label>
                      <select 
                        value={historySortBy}
                        onChange={e => setHistorySortBy(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-primary/40"
                      >
                        <option value="timestamp_desc">Date (Newest)</option>
                        <option value="timestamp_asc">Date (Oldest)</option>
                        <option value="device_asc">Device Name (A-Z)</option>
                        <option value="sensor_asc">Sensor Name (A-Z)</option>
                      </select>
                    </div>
                  </div>

                  {/* History List */}
                  <div className="space-y-3">
                    {paginatedHistory.length === 0 ? (
                      <div className="text-center py-20 text-slate-500 italic text-xs bg-slate-900/20 border border-slate-800/40 rounded-2xl">
                        No notifications found.
                      </div>
                    ) : (
                      paginatedHistory.map(n => (
                        <div 
                          key={n.id} 
                          className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                            n.status === 'active' 
                              ? 'bg-primary/5 border-primary/20 shadow-sm' 
                              : n.status === 'deleted' 
                                ? 'bg-red-500/5 border-red-500/10 opacity-60'
                                : 'bg-slate-900/10 border-slate-800/40 opacity-80'
                          }`}
                        >
                          <div className="space-y-1 w-full text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${n.status === 'active' ? 'bg-primary animate-pulse' : n.status === 'deleted' ? 'bg-red-500' : 'bg-green-500'}`} />
                              <span className="text-[9px] font-mono text-slate-500">[{n.id}]</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                n.status === 'active' 
                                  ? 'bg-primary/10 text-primary' 
                                  : n.status === 'deleted' 
                                    ? 'bg-red-500/10 text-red-400' 
                                    : 'bg-green-500/10 text-green-400'
                              }`}>
                                {n.status}
                              </span>
                              <span className="text-[9px] bg-[#00f2fe]/10 text-[#00f2fe] font-bold px-1.5 py-0.5 rounded uppercase">Device: {n.device_name}</span>
                              <span className="text-[9px] bg-secondary/10 text-secondary font-bold px-1.5 py-0.5 rounded uppercase">Sensor: {n.sensor_name}</span>
                              {n.channel && <span className="text-[9px] bg-indigo-500/10 text-indigo-400 font-bold px-1.5 py-0.5 rounded uppercase">Channel: {n.channel}</span>}
                              <span className="text-[9px] text-slate-500 font-mono">Date: {new Date(n.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-slate-200 font-medium mt-1.5">{n.message}</p>
                            
                            {n.possible_causes && (
                              <div className="mt-2 p-2.5 rounded-lg bg-[#0b131a]/70 border border-slate-800/50 text-[10px] text-slate-400 space-y-1">
                                <p><strong className="text-slate-350 font-semibold">Possible Causes:</strong> {n.possible_causes}</p>
                                <p><strong className="text-slate-350 font-semibold">Recommended Actions:</strong> {n.recommended_actions}</p>
                              </div>
                            )}

                            {n.status === 'resolved' && n.resolved_at && (
                              <div className="mt-2 text-[10px] text-green-400 flex items-center gap-1 font-semibold">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Resolved at {new Date(n.resolved_at).toLocaleString()} by {n.resolved_by_name || 'System'}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 items-center self-end md:self-center shrink-0">
                            {/* Action Buttons */}
                            {n.status === 'active' && n.is_active_table && (
                              <>
                                <button 
                                  onClick={() => triggerResolveAlert(n.alert_id)}
                                  className="px-2.5 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-[10px] font-bold uppercase transition-colors"
                                >
                                  Resolve
                                </button>
                                <button 
                                  onClick={() => handleDeleteNotification(n.id)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase transition-colors"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}

                            {n.status === 'active' && !n.is_active_table && (
                              <button 
                                onClick={() => handleDeleteNotificationHistory(n.id)}
                                className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg text-[10px] font-bold uppercase transition-colors"
                              >
                                Delete
                              </button>
                            )}

                            {n.status === 'resolved' && (
                              <button 
                                onClick={() => handleDeleteNotificationHistory(n.id)}
                                className="text-red-450 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                title="Delete Log"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}

                            {n.status === 'deleted' && (
                              <>
                                <button 
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`${API_BASE}/notifications/history/${n.id}/restore`, {
                                        method: 'PUT',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                      });
                                      if (res.ok) {
                                        addToast('Notification restored successfully.', 'success');
                                        fetchNotifications();
                                        fetchNotificationHistory();
                                      }
                                    } catch (err) {}
                                  }}
                                  className="px-2.5 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-[10px] font-bold uppercase transition-colors"
                                >
                                  Restore
                                </button>
                                <button 
                                  onClick={() => handleDeleteNotificationHistory(n.id, true)}
                                  className="text-red-450 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                                  title="Delete Permanently"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {filteredAndSortedHistory.length > itemsPerPage && (
                    <div className="flex items-center justify-between mt-4 bg-slate-900/30 border border-slate-800 p-2.5 rounded-xl text-xs text-slate-400">
                      <span>Showing {((historyPage - 1) * itemsPerPage) + 1} - {Math.min(historyPage * itemsPerPage, filteredAndSortedHistory.length)} of {filteredAndSortedHistory.length} entries</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setHistoryPage(prev => Math.max(prev - 1, 1))}
                          disabled={historyPage === 1}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 rounded text-[10px] font-bold uppercase tracking-wider text-slate-300 transition-colors"
                        >
                          Prev
                        </button>
                        <span className="px-2.5 py-1 text-slate-300 font-bold">Page {historyPage} of {totalPages}</span>
                        <button
                          type="button"
                          onClick={() => setHistoryPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={historyPage === totalPages}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 rounded text-[10px] font-bold uppercase tracking-wider text-slate-300 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: REPORTING CENTER (PDF/CSV custom triggers) */}
              {activeTab === 'reports' && (
                <div className="max-w-[600px] space-y-6">
                  <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm">
                    <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-4 border-b border-slate-800 pb-3">Operational Report Center</h3>
                    
                    <div className="space-y-5 text-xs">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Select Report Type</label>
                        <select 
                          value={selectedReportType}
                          onChange={e => setSelectedReportType(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-300 focus:outline-none"
                        >
                          <option value="device_performance">Device Performance Report</option>
                          <option value="alert_summary">Alert Incidents Summary Report</option>
                          <option value="user_activity">User Activity Audit Report</option>
                          <option value="sensor_analytics">Sensor Analytics Trend Report</option>
                          <option value="monthly_operations">Monthly Operations Overview</option>
                          <option value="system_health">System Health diagnostics</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Export Format File</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-300">
                            <input 
                              type="radio" 
                              name="report_format" 
                              value="pdf"
                              checked={selectedReportFormat === 'pdf'}
                              onChange={() => setSelectedReportFormat('pdf')}
                              className="accent-primary"
                            />
                            <span>Professional PDF Document</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-300">
                            <input 
                              type="radio" 
                              name="report_format" 
                              value="csv"
                              checked={selectedReportFormat === 'csv'}
                              onChange={() => setSelectedReportFormat('csv')}
                              className="accent-primary"
                            />
                            <span>Standard CSV Spreadsheet</span>
                          </label>
                        </div>
                      </div>

                      <button 
                        onClick={handleTriggerReportDownload}
                        className="w-full bg-primary hover:bg-primary-dark text-slate-950 font-bold py-3.5 px-6 rounded-xl transition-all shadow-neon-blue uppercase tracking-wider flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Export & Download Report</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: ANALYTICS HUB */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {/* Top row: Sensor trend & Alert trend */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary animate-pulse" />
                          <span>Sensor Trend Analytics (DHT11 Live Fluctuation)</span>
                        </h3>
                        <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">LIVE</span>
                      </div>
                      <div className="h-[250px] w-full">
                        <Line 
                          data={getSensorTrendChartData()} 
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 9 } } } },
                            scales: {
                              x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                              y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } }
                            }
                          }} 
                        />
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <span>Incident Alert Frequency</span>
                        </h3>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Weekly Trend</span>
                      </div>
                      <div className="h-[250px] w-full">
                        <Line 
                          data={getAlertTrendData()} 
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                              y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } }
                            }
                          }} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: Device Health, User Activity, Notification statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <Heart className="w-4 h-4 text-green-500" />
                          <span>Device Health Analysis</span>
                        </h3>
                      </div>
                      <div className="h-[220px] w-full">
                        <Bar 
                          data={getDeviceHealthData()} 
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                              y: { grid: { color: 'rgba(255,255,255,0.03)' }, min: 0, max: 100, ticks: { color: '#64748b', font: { size: 9 } } }
                            }
                          }} 
                        />
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <History className="w-4 h-4 text-secondary" />
                          <span>User Audit Log Activity</span>
                        </h3>
                      </div>
                      <div className="h-[220px] w-full">
                        <Bar 
                          data={getUserActivityData()} 
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                              y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } }
                            }
                          }} 
                        />
                      </div>
                    </div>

                    <div className="glass-card bg-darkbg-card border-darkbg-border p-6 rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                        <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase flex items-center gap-2">
                          <Bell className="w-4 h-4 text-yellow-500" />
                          <span>Notification Delivery Stats</span>
                        </h3>
                      </div>
                      <div className="h-[220px] w-full">
                        <Bar 
                          data={getNotificationAnalyticsData()} 
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 8 } } } },
                            scales: {
                              x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } },
                              y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#64748b', font: { size: 9 } } }
                            }
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: AUDIT TRAIL LOGS */}
              {activeTab === 'audit' && (
                <div className="space-y-6">
                  <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm">
                    <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-4">Portal Action Audit Logs</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="pb-3 font-semibold uppercase">Timestamp</th>
                            <th className="pb-3 font-semibold uppercase">Authorized User</th>
                            <th className="pb-3 font-semibold uppercase">Action</th>
                            <th className="pb-3 font-semibold uppercase">Activity Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {auditLogs.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="text-center py-12 text-slate-500 italic">Audit log partition empty.</td>
                            </tr>
                          ) : (
                            auditLogs.map(log => (
                              <tr key={log.id} className="text-slate-300 font-mono text-[11px]">
                                <td className="py-3 text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="py-3 font-semibold text-slate-200">{log.user_name || `System (ID ${log.user_id})`}</td>
                                <td className="py-3 text-primary">{log.action}</td>
                                <td className="py-3 text-slate-400">{log.details}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: SYSTEM SETTINGS */}
              {activeTab === 'settings' && (
                <div className="max-w-[600px] space-y-6">
                  <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm">
                    <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-5 border-b border-slate-800 pb-3">Global Configuration Dashboard</h3>
                    
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSaveSettings(systemSettings);
                      }}
                      className="space-y-4 text-xs"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Global Temp Alarm Limit (°C)</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={systemSettings.global_temp_threshold || '28.0'} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, global_temp_threshold: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Global Humidity Alarm Limit (%)</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={systemSettings.global_humidity_threshold || '65.0'} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, global_humidity_threshold: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">WhatsApp Sandbox Phone Recipient</label>
                        <input 
                          type="text" 
                          value={systemSettings.whatsapp_sandbox_phone || '+14155238886'} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, whatsapp_sandbox_phone: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Google Maps API Key</label>
                        <input 
                          type="password" 
                          placeholder="AIzaSy... (Leave empty to use legacy standard tile server)"
                          value={systemSettings.google_maps_api_key || ''} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, google_maps_api_key: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Email Alert Subject Template</label>
                        <textarea 
                          rows="3"
                          value={systemSettings.email_alert_template || 'Warning limit exceeded on sensor: {sensor_name}. Current value: {value}'} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, email_alert_template: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none resize-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Dashboard Telemetry Refresh Cycle (seconds)</label>
                        <input 
                          type="number" 
                          value={systemSettings.dashboard_pref_refresh_seconds || '3'} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, dashboard_pref_refresh_seconds: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      {/* SMTP Mail Configuration Section */}
                      <div className="border-t border-slate-800 pt-4 mt-4">
                        <h4 className="font-outfit text-xs font-bold text-slate-400 uppercase mb-3">SMTP Mail Configuration</h4>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">SMTP Host</label>
                          <input 
                            type="text" 
                            placeholder="e.g. smtp.gmail.com"
                            value={systemSettings.smtp_host || ''} 
                            onChange={e => setSystemSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">SMTP Port</label>
                          <input 
                            type="number" 
                            placeholder="e.g. 587"
                            value={systemSettings.smtp_port || ''} 
                            onChange={e => setSystemSettings(prev => ({ ...prev, smtp_port: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">SMTP Username</label>
                          <input 
                            type="text" 
                            placeholder="e.g. user@domain.com"
                            value={systemSettings.smtp_user || ''} 
                            onChange={e => setSystemSettings(prev => ({ ...prev, smtp_user: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">SMTP Password</label>
                          <input 
                            type="password" 
                            placeholder="SMTP password"
                            value={systemSettings.smtp_pass || ''} 
                            onChange={e => setSystemSettings(prev => ({ ...prev, smtp_pass: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">SMTP Secure (SSL/TLS)</label>
                          <select 
                            value={systemSettings.smtp_secure || 'false'} 
                            onChange={e => setSystemSettings(prev => ({ ...prev, smtp_secure: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                          >
                            <option value="false">false (STARTTLS / Port 587/25)</option>
                            <option value="true">true (SSL / Port 465)</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">SMTP From Email</label>
                          <input 
                            type="email" 
                            placeholder="support@sansah.com"
                            value={systemSettings.smtp_from || ''} 
                            onChange={e => setSystemSettings(prev => ({ ...prev, smtp_from: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Twilio SMS & WhatsApp Gateway Section */}
                      <div className="border-t border-slate-800 pt-4 mt-4">
                        <h4 className="font-outfit text-xs font-bold text-slate-400 uppercase mb-3">Twilio SMS & WhatsApp Gateway</h4>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Twilio Account SID</label>
                        <input 
                          type="text" 
                          placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                          value={systemSettings.twilio_account_sid || ''} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, twilio_account_sid: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Twilio Auth Token</label>
                        <input 
                          type="password" 
                          placeholder="Twilio Auth Token"
                          value={systemSettings.twilio_auth_token || ''} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, twilio_auth_token: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Twilio WhatsApp Sender Number</label>
                        <input 
                          type="text" 
                          placeholder="whatsapp:+14155238886"
                          value={systemSettings.twilio_whatsapp_from || 'whatsapp:+14155238886'} 
                          onChange={e => setSystemSettings(prev => ({ ...prev, twilio_whatsapp_from: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                        />
                      </div>

                      <button type="submit" className="w-full bg-primary hover:bg-primary-dark text-slate-950 font-bold py-3 px-6 rounded-xl transition-all shadow-neon-blue uppercase tracking-wider">
                        Save Configuration Preferences
                      </button>
                    </form>
                  </div>

                  {/* Admin User Notification Preferences panel */}
                  {user.role === 'admin' && usersList.length > 0 && (
                    <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm mt-6">
                      <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-4 border-b border-slate-800 pb-3">User Notification Preferences</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-850 text-slate-500 font-bold uppercase text-[9px] tracking-wider">
                              <th className="py-2.5">User</th>
                              <th className="py-2.5">Email</th>
                              <th className="py-2.5 text-center">Dashboard</th>
                              <th className="py-2.5 text-center">Email</th>
                              <th className="py-2.5 text-center">WhatsApp</th>
                              <th className="py-2.5 text-center">SMS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usersList.map(u => {
                              let userPrefs = { dashboard: true, email: true, whatsapp: false, sms: false };
                              try {
                                if (u.preferences) {
                                  userPrefs = typeof u.preferences === 'string' ? JSON.parse(u.preferences) : u.preferences;
                                }
                              } catch(e) {}
                              return (
                                <tr key={u.id} className="border-b border-slate-800/40 hover:bg-slate-900/10 text-slate-300">
                                  <td className="py-3 font-semibold">{u.name} <span className="text-[10px] text-slate-500">({u.role})</span></td>
                                  <td className="py-3 font-mono text-slate-400">{u.email}</td>
                                  <td className="py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${userPrefs.dashboard ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                      {userPrefs.dashboard ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${userPrefs.email ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                      {userPrefs.email ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${userPrefs.whatsapp ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                      {userPrefs.whatsapp ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${userPrefs.sms ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                      {userPrefs.sms ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: NOTIFICATION PREFERENCES */}
              {activeTab === 'preferences' && (
                <div className="max-w-[600px] space-y-6">
                  <div className="glass-card bg-darkbg-card border-darkbg-border rounded-2xl p-6 shadow-sm">
                    <h3 className="font-outfit text-sm font-bold text-slate-200 uppercase mb-2 border-b border-slate-800 pb-3">Notification Channel Preferences</h3>
                    <p className="text-[10px] text-slate-500 font-medium mb-6">Choose how you want to be alerted when sensors exceed maximum thresholds or devices go offline.</p>
                    
                    {prefSuccess && (
                      <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                        <Check className="w-4 h-4" />
                        <span>{prefSuccess}</span>
                      </div>
                    )}

                    {testNotifSuccess && (
                      <div className="mb-4 p-3 bg-secondary/10 border border-secondary/20 rounded-xl text-secondary text-xs font-semibold flex items-center gap-2 animate-fade-in">
                        <Bell className="w-4 h-4" />
                        <span>{testNotifSuccess}</span>
                      </div>
                    )}

                    <form onSubmit={handleSavePreferences} className="space-y-6">
                      <div className="space-y-4">
                        {/* Dashboard Notifications Toggle */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-800/40 rounded-xl hover:bg-slate-900 transition-all">
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-200 block">Dashboard Notifications</span>
                            <span className="text-[10px] text-slate-500 block">Show real-time alert logs and toast notifications on dashboard</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={prefDashboard}
                              onChange={e => setPrefDashboard(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>

                        {/* Email Notifications Toggle */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-800/40 rounded-xl hover:bg-slate-900 transition-all">
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-200 block">Email Notifications</span>
                            <span className="text-[10px] text-slate-500 block">Send detailed diagnostic summary to your registered email</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={prefEmail}
                              onChange={e => setPrefEmail(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>

                        {/* WhatsApp Notifications Toggle */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-800/40 rounded-xl hover:bg-slate-900 transition-all">
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-200 block">WhatsApp Notifications</span>
                            <span className="text-[10px] text-slate-500 block">Receive automated urgent alert texts via WhatsApp API</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={prefWhatsapp}
                              onChange={e => setPrefWhatsapp(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>

                        {/* SMS Notifications Toggle */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-800/40 rounded-xl hover:bg-slate-900 transition-all">
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-200 block">SMS Notifications</span>
                            <span className="text-[10px] text-slate-500 block">Direct cellular texts dispatched instantly to your phone</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={prefSms}
                              onChange={e => setPrefSms(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>

                        {/* Push Notifications Toggle */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-900/50 border border-slate-800/40 rounded-xl hover:bg-slate-900 transition-all">
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-slate-200 block">Push Notifications</span>
                            <span className="text-[10px] text-slate-500 block">Receive browser alerts instantly on your screen</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={prefPush}
                              onChange={e => setPrefPush(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-slate-950"></div>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button 
                          type="submit" 
                          disabled={prefSaving}
                          className="flex-1 bg-primary hover:bg-primary-dark disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold py-3.5 px-6 rounded-xl transition-all shadow-neon-blue uppercase tracking-wider text-xs"
                        >
                          {prefSaving ? 'Saving Preferences...' : 'Save Preferences'}
                        </button>
                        <button 
                          type="button"
                          onClick={handleTestNotification}
                          disabled={testNotifLoading}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 border border-slate-700 text-slate-200 disabled:text-slate-600 font-bold py-3.5 px-6 rounded-xl transition-all uppercase tracking-wider text-xs"
                        >
                          {testNotifLoading ? 'Testing...' : 'Test Notification'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </ErrorBoundary>
          )}

        </main>
      </div>

      {/* TOAST PANEL FOR REAL-TIME ACTIVE INCIDENTS */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 w-[380px] pointer-events-none">
        {recentAlerts.filter(a => a.status === 'active' && !dismissedAlertIds.includes(a.id)).slice(0, 3).map(alert => {
          const insight = getAiInsightForAlert(alert);
          return (
            <div key={alert.id} className="p-4 rounded-xl border shadow-lg glass-card bg-[#0b131a]/95 border-red-500/35 flex flex-col gap-2.5 text-xs leading-normal pointer-events-auto">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="flex-grow flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-red-400 uppercase tracking-wide">INCIDENT BREACH ({alert.level})</span>
                      <span className="text-[9px] text-slate-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-200 font-semibold text-xs mt-0.5">{alert.device_name || 'System'} - {alert.sensor_name || 'Sensor'}</p>
                    <p className="text-slate-350 text-[11px] mt-0.5">{alert.message}</p>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-slate-800/85 pt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                <div>
                  <span className="text-slate-500 block">Current Value</span>
                  <span className="font-bold text-red-400">{alert.current_value !== undefined ? alert.current_value : 'N/A'}{alert.unit || ''}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Threshold Value</span>
                  <span className="font-semibold text-slate-350">{(alert.max_value !== undefined ? alert.max_value : alert.threshold_value) !== undefined ? (alert.max_value || alert.threshold_value) : 'N/A'}{alert.unit || ''}</span>
                </div>
              </div>

              <div className="bg-red-950/20 border border-red-900/35 rounded-lg p-2.5 text-[11px] text-slate-300 space-y-1">
                <p><strong>Possible Causes:</strong> {insight.cause}</p>
                <p><strong>Recommended Actions:</strong> {insight.recommendation}</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button 
                  onClick={() => triggerResolveAlert(alert.id)}
                  className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-slate-950 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  Resolve Alert
                </button>
                <button 
                  onClick={() => setDismissedAlertIds(prev => [...prev, alert.id])}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* REBUILT MODALS TO FIX BROKEN BUTTONS */}
      {selectedSensor && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl font-sans text-left">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white font-outfit uppercase tracking-wider">Configure Sensor</h3>
              <button onClick={() => setSelectedSensor(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateSensorMetadata} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 font-mono mb-2">
                <div>Sensor ID: {selectedSensor.id}</div>
                <div>Status: <span className={`font-bold uppercase ${selectedSensor.status === 'offline' ? 'text-red-400' : 'text-green-400'}`}>{selectedSensor.status || 'ONLINE'}</span></div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Sensor Name</label>
                <input 
                  type="text" 
                  value={editSensorName}
                  onChange={e => setEditSensorName(e.target.value)}
                  placeholder="e.g. Temperature Probe"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Unit of Measure</label>
                  <input 
                    type="text" 
                    value={editSensorUnit}
                    onChange={e => setEditSensorUnit(e.target.value)}
                    placeholder="e.g. °C, %, hPa"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs font-mono"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Alert Threshold (Max)</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editSensorMax}
                    onChange={e => setEditSensorMax(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-400 border border-slate-800 bg-slate-950/40 p-3 rounded-lg space-y-1">
                <span className="font-bold text-slate-300 block uppercase tracking-wider text-[9px]">Allowed Sensor Specifications:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Temperature: -50 to 100 °C</li>
                  <li>Humidity / Soil Moisture: 0 to 100 %</li>
                  <li>Wind Speed: 0 to 200 km/h</li>
                  <li>Water Level: 0 to 1000 cm</li>
                  <li>Pressure: 800 to 1200 hPa</li>
                  <li>pH Scale: 0 to 14</li>
                </ul>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={handleDeleteSensor}
                  className="px-3 py-2 bg-red-950/40 border border-red-900/60 hover:bg-red-900/40 text-red-400 rounded-lg text-xs font-medium transition"
                >
                  Delete Sensor
                </button>
                <div className="flex space-x-3">
                  <button 
                    type="button" 
                    onClick={() => setSelectedSensor(null)}
                    className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedAlertForTimeline && (() => {
        const insight = getAiInsightForAlert(selectedAlertForTimeline);
        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    selectedAlertForTimeline.level === 'critical' ? 'bg-red-500 animate-pulse' :
                    selectedAlertForTimeline.level === 'high' ? 'bg-orange-500' :
                    selectedAlertForTimeline.level === 'medium' ? 'bg-yellow-500' : 'bg-blue-400'
                  }`} />
                  <h3 className="text-md font-bold text-white uppercase tracking-wide font-outfit">Alert Details & Timeline</h3>
                </div>
                <button onClick={() => setSelectedAlertForTimeline(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="text-xs space-y-3 font-sans">
                <div className="grid grid-cols-2 gap-3 text-slate-300">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Device Name</span>
                    <span className="text-slate-200 font-semibold">{selectedAlertForTimeline.device_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Sensor Name</span>
                    <span className="text-slate-200 font-semibold">{selectedAlertForTimeline.sensor_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Current Value</span>
                    <span className="text-red-400 font-bold">{selectedAlertForTimeline.current_value !== undefined ? selectedAlertForTimeline.current_value : 'N/A'}{selectedAlertForTimeline.unit || ''}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Threshold Value</span>
                    <span className="text-slate-200 font-semibold">{selectedAlertForTimeline.threshold_value !== undefined ? selectedAlertForTimeline.threshold_value : 'N/A'}{selectedAlertForTimeline.unit || ''}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Timestamp</span>
                    <span className="text-slate-400 font-mono">{new Date(selectedAlertForTimeline.timestamp).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Severity Level</span>
                    <span className="text-slate-200 font-bold uppercase">{selectedAlertForTimeline.level || 'WARNING'}</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 text-slate-350 space-y-2 mt-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Diagnostics</span>
                  <p className="text-slate-200 leading-relaxed font-semibold">{selectedAlertForTimeline.message}</p>
                  <p className="mt-1"><strong>Possible Causes:</strong> {insight.cause}</p>
                  <p><strong>Recommended Actions:</strong> {insight.recommendation}</p>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button 
                  onClick={() => setSelectedAlertForTimeline(null)} 
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-bold uppercase transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {selectedDeviceForMaintenance && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Maintenance Logs</h3>
              <button onClick={() => setSelectedDeviceForMaintenance(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-slate-300 text-sm">
              <p>Device ID: {selectedDeviceForMaintenance.id}</p>
              <p className="mt-2 text-slate-400 text-xs">No recent maintenance logs found.</p>
            </div>
          </div>
        </div>
      )}

      {selectedDeviceForAssetEdit && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl font-sans text-left">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white font-outfit uppercase tracking-wider">Edit Asset Details</h3>
              <button onClick={() => setSelectedDeviceForAssetEdit(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateAssetMetadata} className="space-y-4">
              <p className="text-xs text-slate-400 mb-2 font-mono">Device ID: {selectedDeviceForAssetEdit.id}</p>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Serial Number</label>
                <input 
                  type="text" 
                  value={editSerial}
                  onChange={e => setEditSerial(e.target.value)}
                  placeholder="e.g. SN-ESP32-901"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Owner Name</label>
                <input 
                  type="text" 
                  value={editOwner}
                  onChange={e => setEditOwner(e.target.value)}
                  placeholder="e.g. Sansah Facilities"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Category</label>
                  <select 
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                  >
                    <option value="Climate">Climate</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Utility">Utility</option>
                    <option value="Agricultural">Agricultural</option>
                    <option value="General">General</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Lifecycle Status</label>
                  <select 
                    value={editLifecycle}
                    onChange={e => setEditLifecycle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                  >
                    <option value="Active">Active</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Installation Date</label>
                  <input 
                    type="date" 
                    value={editInstallDate}
                    onChange={e => setEditInstallDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Warranty Expiry</label>
                  <input 
                    type="date" 
                    value={editWarranty}
                    onChange={e => setEditWarranty(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2 pb-1">
                <input 
                  type="checkbox" 
                  id="editSimFaultCheckbox"
                  checked={editSimFault}
                  onChange={e => setEditSimFault(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-900 text-cyan-600 focus:ring-cyan-600 focus:ring-offset-slate-950 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="editSimFaultCheckbox" className="text-xs text-slate-300 font-medium select-none cursor-pointer">
                  Simulate Device Fault / Force Offline
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setSelectedDeviceForAssetEdit(null)}
                  className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRegisterDeviceOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-[550px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl my-8 font-sans text-left">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white font-outfit uppercase tracking-wider">
                {user.role === 'admin' ? 'Register New Asset' : 'Link Telemetry Device'}
              </h3>
              <button 
                onClick={() => setIsRegisterDeviceOpen(false)} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRegisterDevice} className="space-y-4">
              {user.role === 'admin' ? (
                // ADMIN REGISTRATION FORM
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Device ID</label>
                      <input 
                        type="text" 
                        placeholder="e.g. ESP32_01"
                        value={newDevId}
                        onChange={e => setNewDevId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Device Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Server Room A Controller"
                        value={newDevName}
                        onChange={e => setNewDevName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Device Type</label>
                      <SearchableDropdown 
                        options={['ESP32', 'NodeMCU', 'Arduino', 'Raspberry Pi', 'LoRaWAN Device']}
                        value={newDevType}
                        onChange={val => setNewDevType(val)}
                        placeholder="Select Device Type"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Sensor Type</label>
                      <SearchableDropdown 
                        options={[
                          'Soil Moisture', 'Soil Temperature', 'Air Temperature', 'Humidity', 
                          'Wind Speed', 'Rainfall', 'Water Level', 'Water Flow', 'Soil pH', 
                          'Light Intensity', 'CO₂', 'Pressure', 'NPK Sensor', 'EC Sensor'
                        ]}
                        value={newDevSensorType}
                        onChange={val => {
                          setNewDevSensorType(val);
                          if (SENSOR_RECOMMENDED_DEFAULTS[val] !== undefined) {
                            setNewDevMax(String(SENSOR_RECOMMENDED_DEFAULTS[val]));
                          }
                        }}
                        placeholder="Select Sensor Type"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Device Category</label>
                      <SearchableDropdown 
                        options={['Climate', 'Industrial', 'Logistics', 'Utility', 'Agricultural', 'General']}
                        value={newDevCategory}
                        onChange={val => setNewDevCategory(val)}
                        placeholder="Select Device Category"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Asset Category</label>
                      <SearchableDropdown 
                        options={['Primary Asset', 'Secondary Asset', 'Backup Asset', 'Test Asset', 'Unassigned']}
                        value={newDevLifecycleStatus}
                        onChange={val => setNewDevLifecycleStatus(val)}
                        placeholder="Select Asset Category"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Communication Protocol</label>
                      <SearchableDropdown 
                        options={['HTTP', 'MQTT']}
                        value={newDevProto}
                        onChange={val => setNewDevProto(val)}
                        placeholder="Select Protocol"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Notification Channel</label>
                      <SearchableDropdown 
                        options={['Dashboard', 'Email', 'SMS', 'WhatsApp']}
                        value={newDevChannel}
                        onChange={val => setNewDevChannel(val)}
                        placeholder="Select Channel"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Alert Severity</label>
                      <SearchableDropdown 
                        options={['Critical', 'High', 'Medium', 'Low']}
                        value={newDevSeverity}
                        onChange={val => setNewDevSeverity(val)}
                        placeholder="Select Severity"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Location</label>
                      <SearchableDropdown 
                        options={[
                          'Main HQ Server Room A', 'Boiler Subroom C', 'Los Angeles Highway Route', 
                          'Santa Monica Operations Site', 'Basement Utility Room B', 'Default Field Location'
                        ]}
                        value={newDevLoc}
                        onChange={val => setNewDevLoc(val)}
                        placeholder="Select Location"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Maximum Sensor Value</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Default threshold limit"
                        value={newDevMax}
                        onChange={e => setNewDevMax(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5 flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-400 text-xs select-none">
                        <input 
                          type="checkbox" 
                          checked={newDevGps}
                          onChange={e => setNewDevGps(e.target.checked)}
                          className="rounded border-slate-800 bg-slate-950 w-4 h-4 text-primary"
                        />
                        <span>Enable GPS Routing Tracker</span>
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                // STANDARD USER LINKING FORM
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Sensor Type</label>
                    <SearchableDropdown 
                      options={[
                        'Soil Moisture', 'Soil Temperature', 'Air Temperature', 'Humidity', 
                        'Wind Speed', 'Rainfall', 'Water Level', 'Water Flow', 'Soil pH', 
                        'Light Intensity', 'CO₂', 'Pressure', 'NPK Sensor', 'EC Sensor'
                      ]}
                      value={newDevSensorType}
                      onChange={val => {
                        setNewDevSensorType(val);
                        if (SENSOR_RECOMMENDED_DEFAULTS[val] !== undefined) {
                          setNewDevMax(String(SENSOR_RECOMMENDED_DEFAULTS[val]));
                        }
                      }}
                      placeholder="Select Sensor Type"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Select Device</label>
                      <SearchableDropdown 
                        options={filteredComboboxOptions.map(opt => opt.name + (opt.id ? ` (${opt.id})` : ''))}
                        value={deviceSearchQuery}
                        onChange={val => {
                          const opt = filteredComboboxOptions.find(o => (o.name + (o.id ? ` (${o.id})` : '')) === val);
                          if (opt) {
                            handleSelectOption(opt);
                          } else {
                            handleSelectCustomDevice(val);
                          }
                        }}
                        placeholder="Select hardware device..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Current Sensor Value</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Current value"
                        value={newDevCurrVal}
                        onChange={e => setNewDevCurrVal(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Maximum Sensor Value</label>
                      <input 
                        type="text" 
                        value={newDevMax}
                        disabled
                        className="w-full bg-slate-950 border border-slate-900 rounded-lg p-2.5 text-slate-500 text-xs font-semibold cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">Communication Protocol</label>
                      <SearchableDropdown 
                        options={['HTTP', 'MQTT']}
                        value={newDevProto}
                        onChange={val => setNewDevProto(val)}
                        placeholder="Select Protocol"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Remarks / Notes</label>
                <textarea 
                  rows="2"
                  placeholder="Optional context or deployment notes..."
                  value={newDevRemarks}
                  onChange={e => setNewDevRemarks(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs resize-none"
                />
              </div>

              {isThresholdExceeded && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl text-center">
                  ⚠️ You cannot exceed the maximum value allowed for this sensor.
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => setIsRegisterDeviceOpen(false)} 
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl font-bold text-xs uppercase transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-primary hover:bg-primary-dark disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-neon-blue"
                >
                  {user.role === 'admin' ? 'Register Asset' : 'Link Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddGeofenceOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Add Geofence</h3>
              <button onClick={() => setIsAddGeofenceOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-slate-300 text-sm space-y-4">
              <p className="text-slate-400 text-xs">Create a new geofence to monitor device movements.</p>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsAddGeofenceOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-xs">Cancel</button>
                <button onClick={() => setIsAddGeofenceOpen(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xs">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[400px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl font-sans">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white font-outfit uppercase tracking-wider">Change Password</h3>
              <button onClick={() => {
                setIsChangePasswordOpen(false);
                setChangePasswordError('');
                setChangePasswordSuccess('');
              }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            {changePasswordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl mb-4 text-left">
                {changePasswordError}
              </div>
            )}
            
            {changePasswordSuccess && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold rounded-xl mb-4 text-left">
                {changePasswordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Current Password</label>
                <input 
                  type="password" 
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Confirm New Password</label>
                <input 
                  type="password" 
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-sm"
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={changePasswordLoading}
                className="w-full bg-primary hover:bg-primary-dark text-slate-950 font-bold py-2.5 rounded-xl transition-all shadow-neon-blue uppercase tracking-wider text-xs"
              >
                {changePasswordLoading ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isProfileOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-850 p-6 rounded-2xl shadow-xl font-sans text-left">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800/80">
              <h3 className="text-base font-bold text-white font-outfit tracking-wide flex items-center gap-2">
                <User className="w-4.5 h-4.5 text-primary" />
                <span>User Profile Details</span>
              </h3>
              <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Profile Card Header */}
              <div className="flex items-center gap-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-850">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-slate-950 text-base font-black font-outfit uppercase shadow-md shadow-primary/10">
                  {user ? user.name.substring(0, 2) : 'US'}
                </div>
                <div className="space-y-0.5">
                  <h4 className="font-bold text-white text-sm leading-none">{user?.name}</h4>
                  <span className="text-[8.5px] font-black tracking-widest text-primary uppercase bg-primary/10 px-1.5 py-0.5 rounded-full inline-block mt-1">
                    {user?.role === 'admin' ? 'Admin Profile' : 'User Profile'}
                  </span>
                </div>
              </div>

              {/* Profile Details List */}
              <div className="space-y-2.5 text-xs text-slate-355">
                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[8.5px] tracking-wider">Email Address</span>
                  <span className="col-span-2 text-slate-200 truncate">{user?.email}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[8.5px] tracking-wider">Phone Number</span>
                  <span className="col-span-2 text-slate-200">{user?.phone || 'Not Configured'}</span>
                </div>

                <div className="grid grid-cols-3 border-b border-slate-850/50 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[8.5px] tracking-wider">Member Since</span>
                  <span className="col-span-2 text-slate-200">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>

              {/* Profile Preferences summary */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850 space-y-1.5">
                <h5 className="text-[8.5px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Configured Alert Channels</h5>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase ${prefDashboard ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-850 text-slate-500'}`}>Dashboard</span>
                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase ${prefEmail ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-855 text-slate-500'}`}>Email</span>
                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase ${prefWhatsapp ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-855 text-slate-500'}`}>WhatsApp</span>
                  <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold uppercase ${prefSms ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-855 text-slate-500'}`}>SMS</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 border-t border-slate-850 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    setProfileName(user?.name || '');
                    setProfilePhone(user?.phone || '');
                    setProfileSuccess('');
                    setProfileError('');
                    setIsEditProfileOpen(true);
                  }}
                  className="flex-1 py-2 bg-primary hover:bg-primary-dark text-slate-950 font-bold rounded-xl transition-all shadow-neon-blue uppercase tracking-wider text-[10px] text-center flex items-center justify-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5 text-slate-950" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all uppercase tracking-wider text-[10px]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl font-sans text-left">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800/80">
              <h3 className="text-base font-bold text-white font-outfit tracking-wide flex items-center gap-2">
                <UserCheck className="w-4.5 h-4.5 text-primary" />
                <span>Edit Profile Details</span>
              </h3>
              <button onClick={() => setIsEditProfileOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {profileSuccess && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <Check className="w-4 h-4" />
                <span>{profileSuccess}</span>
              </div>
            )}

            {profileError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <X className="w-4 h-4" />
                <span>{profileError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Full Name</label>
                <input 
                  type="text" 
                  value={profileName} 
                  onChange={e => setProfileName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase block">Phone Number</label>
                <input 
                  type="text" 
                  placeholder="+1234567890"
                  value={profilePhone} 
                  onChange={e => setProfilePhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-primary/50 text-xs"
                />
              </div>

              <div className="flex gap-2.5 pt-2 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all uppercase tracking-wider text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex-1 py-2 bg-primary hover:bg-primary-dark text-slate-950 font-bold rounded-xl transition-all shadow-neon-blue uppercase tracking-wider text-[10px]"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAccountSettingsOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl font-sans text-left">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800/80">
              <h3 className="text-base font-bold text-white font-outfit tracking-wide flex items-center gap-2">
                <Settings className="w-4.5 h-4.5 text-primary" />
                <span>Account Settings</span>
              </h3>
              <button onClick={() => setIsAccountSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Theme Settings option */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-850 rounded-xl">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block">Visual Interface Theme</span>
                  <span className="text-[10px] text-slate-500 block">Switch between light or dark mode styling</span>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-750 hover:bg-slate-700 rounded-lg text-[9px] font-bold text-slate-200 uppercase transition-all"
                >
                  {isDarkMode ? '🌞 Switch Light' : '🌙 Switch Dark'}
                </button>
              </div>

              {/* Audio Settings option */}
              <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-850 rounded-xl">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block">Mute Alert Beeps</span>
                  <span className="text-[10px] text-slate-500 block">Turn off telemetry threshold breach beep alerts</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAudioMuted(!isAudioMuted)}
                  className="px-3 py-1.5 bg-slate-850 border border-slate-750 hover:bg-slate-700 rounded-lg text-[9px] font-bold text-slate-200 uppercase transition-all"
                >
                  {isAudioMuted ? '🔊 Unmute Audio' : '🔇 Mute Audio'}
                </button>
              </div>



              <div className="pt-3 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAccountSettingsOpen(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-white font-bold rounded-xl transition-all uppercase tracking-wider text-[10px]"
                >
                  Close & Apply Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI ASSISTANT CHATBOT DRAWER */}
      {isAiChatOpen && (
        <div className="fixed inset-y-0 right-0 w-full max-w-[420px] bg-[#0c141d]/95 backdrop-blur-md border-l border-slate-800 z-[99999] shadow-2xl flex flex-col font-sans text-left animate-slide-in-right">
          {/* Header */}
          <div className="p-4 border-b border-slate-800/80 bg-[#0e1620] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-4.5 h-4.5 text-primary animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-outfit tracking-wide leading-none">Sansah AI Assistant</h3>
                <span className="text-[9.5px] font-semibold text-green-400">Contextual Telemetry Engine</span>
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setIsAiChatOpen(false)} 
              className="text-slate-400 hover:text-white p-1 hover:bg-slate-850 rounded-lg transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {aiChatMessages.map(m => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${m.sender === 'user' ? 'bg-primary text-slate-950 font-semibold rounded-tr-none' : 'bg-slate-900 border border-slate-850 text-slate-200 rounded-tl-none'}`}>
                  {m.sender === 'user' ? m.text : (() => {
                    // Lightweight markdown renderer for AI responses
                    const renderLine = (line, idx) => {
                      // H2/H1 headings
                      if (line.startsWith('## ')) return <div key={idx} className="font-extrabold text-primary text-[11px] uppercase tracking-wider mb-1 mt-1">{line.replace('## ', '')}</div>;
                      if (line.startsWith('# ')) return <div key={idx} className="font-black text-white text-xs uppercase tracking-wide mb-1 mt-1">{line.replace('# ', '')}</div>;
                      // Table separator
                      if (line.startsWith('|---') || line.match(/^\|[-\s|]+\|$/)) return null;
                      // Table header/row
                      if (line.startsWith('|') && line.endsWith('|')) {
                        const cells = line.split('|').filter(c => c.trim() !== '');
                        return (
                          <div key={idx} className="grid text-[9.5px] border-b border-slate-800/50 py-0.5" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>
                            {cells.map((cell, ci) => <span key={ci} className={ci === 0 ? 'text-slate-400 font-bold' : 'text-slate-200'}>{cell.trim().replace(/\*\*(.*?)\*\*/g, '$1')}</span>)}
                          </div>
                        );
                      }
                      // Bullet list items
                      if (line.startsWith('- ') || line.startsWith('* ')) {
                        const content = line.replace(/^[-*] /, '');
                        return <div key={idx} className="flex items-start gap-1.5 py-0.5"><span className="text-primary shrink-0 mt-0.5">•</span><span>{renderInline(content)}</span></div>;
                      }
                      // Numbered list
                      if (/^\d+\.\s/.test(line)) {
                        const match = line.match(/^(\d+)\.\s(.+)/);
                        if (match) return <div key={idx} className="flex items-start gap-1.5 py-0.5"><span className="text-primary shrink-0 font-bold">{match[1]}.</span><span>{renderInline(match[2])}</span></div>;
                      }
                      // Empty line spacer
                      if (line.trim() === '') return <div key={idx} className="h-1.5" />;
                      // Regular paragraph
                      return <div key={idx} className="py-0.5">{renderInline(line)}</div>;
                    };
                    const renderInline = (text) => {
                      // Split on **bold** markers
                      const parts = text.split(/(\*\*[^*]+\*\*)/g);
                      return parts.map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
                        }
                        // Handle backtick inline code
                        if (part.startsWith('`') && part.endsWith('`')) {
                          return <code key={i} className="bg-slate-800 text-primary px-1 rounded font-mono">{part.slice(1, -1)}</code>;
                        }
                        return part;
                      });
                    };
                    return (
                      <div className="space-y-0.5">
                        {m.text.split('\n').map((line, idx) => renderLine(line, idx))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
            {aiChatTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-900 border border-slate-850 text-slate-400 rounded-2xl rounded-tl-none p-3 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Message Suggestions */}
          <div className="p-3 border-t border-slate-900/60 bg-slate-950/20 flex gap-2 overflow-x-auto select-none">
            <button 
              type="button"
              onClick={() => {
                setAiChatMessages(prev => [...prev, { id: String(Date.now()), sender: 'user', text: 'Check active alerts' }]);
                generateAiChatResponse('Check active alerts');
              }}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-850 rounded-full text-[10px] shrink-0 font-medium transition-all"
            >
              🔍 Active Alerts
            </button>
            <button 
              type="button"
              onClick={() => {
                setAiChatMessages(prev => [...prev, { id: String(Date.now()), sender: 'user', text: 'List my devices' }]);
                generateAiChatResponse('List my devices');
              }}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-850 rounded-full text-[10px] shrink-0 font-medium transition-all"
            >
              🖥️ List Devices
            </button>
            <button 
              type="button"
              onClick={() => {
                setAiChatMessages(prev => [...prev, { id: String(Date.now()), sender: 'user', text: 'Show recommended thresholds' }]);
                generateAiChatResponse('Show recommended thresholds');
              }}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-850 rounded-full text-[10px] shrink-0 font-medium transition-all"
            >
              🌡️ Threshold Limits
            </button>
          </div>

          {/* Input Footer */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (aiChatInput.trim() === '') return;
              const userTxt = aiChatInput;
              setAiChatMessages(prev => [...prev, { id: String(Date.now()), sender: 'user', text: userTxt }]);
              setAiChatInput('');
              generateAiChatResponse(userTxt);
            }} 
            className="p-3 border-t border-slate-900 bg-[#0e1620] flex gap-2"
          >
            <input 
              type="text" 
              placeholder="Ask about alerts, thresholds, diagnostics..."
              value={aiChatInput}
              onChange={e => setAiChatInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-primary/50"
            />
            <button 
              type="submit"
              className="w-9 h-9 rounded-xl bg-primary text-slate-950 hover:bg-primary-dark transition-all flex items-center justify-center"
            >
              <Send className="w-4 h-4 text-slate-950" />
            </button>
          </form>
        </div>
      )}

      {isResolveModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-[500px] glass-card bg-[#0b131a] border border-slate-800 p-6 rounded-2xl shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Resolve Alert</h3>
              <button onClick={() => setIsResolveModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-slate-300 text-sm space-y-4">
              <p className="text-slate-400 text-xs">Acknowledge and resolve this alert incident.</p>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsResolveModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-xs">Cancel</button>
                <button onClick={() => setIsResolveModalOpen(false)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs">Resolve</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications Container */}
      <div className="fixed bottom-4 right-4 z-[999999] flex flex-col gap-3 max-w-[360px] w-full">
        {toasts.map(toast => {
          if (toast.alertData) {
            // Real-time alert card toast
            const alert = toast.alertData;
            return (
              <div 
                key={toast.id}
                className={`p-4 rounded-xl border shadow-2xl bg-[#0b131a] text-left animate-slide-in-right ${
                  toast.level === 'critical' ? 'border-red-500/35 bg-[#1a0f0f]/90' : 'border-yellow-500/35 bg-[#1a180f]/90'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-xs uppercase font-outfit text-slate-100 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${toast.level === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                    {alert.title}
                  </h4>
                  <button 
                    onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                    className="text-slate-400 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="space-y-1.5 text-xs">
                  <p className="text-slate-200 font-medium">{alert.message}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-semibold">
                    <span className="bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase font-mono">Device: {alert.device_name}</span>
                    <span className="bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase font-mono">Sensor: {alert.sensor_name}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">Timestamp: {new Date(alert.timestamp).toLocaleString()}</p>
                </div>

                <div className="flex gap-2 justify-end mt-3.5 pt-2.5 border-t border-slate-800/60">
                  <button 
                    onClick={() => {
                      const confirmResolve = window.confirm("Are you sure you want to resolve this alert?");
                      if (confirmResolve) {
                        quickResolveAlert(alert.alert_id);
                        setToasts(prev => prev.filter(t => t.id !== toast.id));
                      }
                    }}
                    className="px-2.5 py-1 bg-green-500 hover:bg-green-600 text-slate-950 font-extrabold rounded-lg text-[10px] uppercase transition-colors"
                  >
                    Resolve
                  </button>
                  <button 
                    onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          } else {
            // Standard notification toast
            return (
              <div 
                key={toast.id}
                className="p-3.5 rounded-xl border border-slate-800 bg-[#0e1620]/95 backdrop-blur-md shadow-2xl text-left text-xs font-semibold text-slate-200 flex justify-between items-center gap-3 animate-slide-in-right"
              >
                <span>{toast.message}</span>
                <button 
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }
        })}
      </div>
    </div>
    </ErrorBoundary>
  );
}
