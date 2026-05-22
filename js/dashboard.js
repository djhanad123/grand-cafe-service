/**
 * GRAND CAFÉ - Staff Dashboard client script
 * Full real-time dashboard featuring Socket.io sync, BroadcastChannel local fallback,
 * Web Audio API bell synthesis, printable QR Code Table generator,
 * AND Staff Session Login & Waiter Assignment tracking.
 */

// 1. Core State variables
let requests = [];
let generatedTables = [];
let socket = null;
let broadcastChannel = null;
let isMuted = false;
let audioContext = null;
let currentFilter = 'all';

// Waiter Identity States
let loggedInStaff = null;
let loggedInRole = null;
let activeStaffRoster = [];
let activeKeypadUser = null;
let typedPIN = '';

// Menu State Variables
let activeMenuItems = [];
let menuCategoryFilter = 'all';
let editingItemName = null;

// 2. Staff Database Seeding
function seedStaffDatabase() {
  const existing = localStorage.getItem('grand_cafe_staff_users');
  if (!existing) {
    const defaultStaff = [
      { username: 'Admin', pin: '4450', role: 'admin' }
    ];
    localStorage.setItem('grand_cafe_staff_users', JSON.stringify(defaultStaff));
    activeStaffRoster = defaultStaff;
  } else {
    try {
      activeStaffRoster = JSON.parse(existing);
    } catch (e) {
      console.error('Failed to parse staff users database.', e);
      activeStaffRoster = [{ username: 'Admin', pin: '4450', role: 'admin' }];
    }
  }
}

// 3. Staff Identity Management & Session Check
function checkStaffSession() {
  seedStaffDatabase();
  
  const session = localStorage.getItem('logged_in_staff');
  const role = localStorage.getItem('logged_in_role');
  const loginOverlay = document.getElementById('loginOverlay');
  
  if (session && role) {
    loggedInStaff = session;
    loggedInRole = role;
    if (loginOverlay) loginOverlay.classList.add('hidden');
    setupStaffUI();
  } else {
    loggedInStaff = null;
    loggedInRole = null;
    if (loginOverlay) loginOverlay.classList.remove('hidden');
    renderStaffGrid();
  }
}

function renderStaffGrid() {
  const grid = document.getElementById('staffListGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  activeStaffRoster.forEach(staff => {
    const card = document.createElement('div');
    card.className = 'staff-profile-card';
    card.onclick = () => openKeypad(staff);
    
    let avatarIcon = '👤';
    if (staff.role === 'admin') avatarIcon = '👑';
    else if (staff.role === 'cashier') avatarIcon = '💼';
    
    const badgeClass = staff.role === 'admin' ? 'badge-admin' : staff.role === 'cashier' ? 'badge-cashier' : 'badge-waiter';
    
    card.innerHTML = `
      <div class="staff-avatar-circle">${avatarIcon}</div>
      <div class="staff-profile-name">${staff.username}</div>
      <div class="staff-profile-role-badge ${badgeClass}">${staff.role}</div>
    `;
    grid.appendChild(card);
  });
}

function openKeypad(staff) {
  activeKeypadUser = staff;
  typedPIN = '';
  
  const nameEl = document.getElementById('selectedStaffName');
  const badgeEl = document.getElementById('selectedStaffRoleBadge');
  if (nameEl) nameEl.innerText = staff.username;
  if (badgeEl) {
    badgeEl.innerText = staff.role;
    badgeEl.className = `staff-profile-role-badge badge-${staff.role}`;
  }
  
  updatePINIndicators();
  
  const slider = document.getElementById('loginSlider');
  if (slider) slider.classList.add('show-keypad');
  lazyInitAudio();
}

function goBackToStaffSelect() {
  activeKeypadUser = null;
  typedPIN = '';
  const slider = document.getElementById('loginSlider');
  if (slider) slider.classList.remove('show-keypad');
}

function updatePINIndicators() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      if (i < typedPIN.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
      dot.classList.remove('error');
    }
  }
}

function lazyInitAudio() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  } catch (e) {
    console.warn('Audio Context lazy initialize failed.', e);
  }
}

function playKeypadBeep(freq = 600, duration = 0.08) {
  if (isMuted) return;
  try {
    lazyInitAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    console.warn('Beep synthesis failed', e);
  }
}

function playFailureBuzz() {
  if (isMuted) return;
  try {
    lazyInitAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(120, now);
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(123, now);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    
    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  } catch (e) {
    console.warn('Failure buzzer synthesis failed', e);
  }
}

function pressKeypad(num) {
  if (typedPIN.length >= 4) return;
  
  typedPIN += num;
  updatePINIndicators();
  playKeypadBeep();
  
  if (typedPIN.length === 4) {
    setTimeout(verifyPIN, 200);
  }
}

function clearKeypad() {
  typedPIN = '';
  updatePINIndicators();
  playKeypadBeep(300, 0.05);
}

function backspaceKeypad() {
  if (typedPIN.length > 0) {
    typedPIN = typedPIN.slice(0, -1);
    updatePINIndicators();
    playKeypadBeep(450, 0.05);
  }
}

function verifyPIN() {
  if (!activeKeypadUser) return;
  
  if (typedPIN === activeKeypadUser.pin) {
    localStorage.setItem('logged_in_staff', activeKeypadUser.username);
    localStorage.setItem('logged_in_role', activeKeypadUser.role);
    
    loggedInStaff = activeKeypadUser.username;
    loggedInRole = activeKeypadUser.role;
    
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.classList.add('hidden');
    setupStaffUI();
    playNotificationChime();
    
    setTimeout(goBackToStaffSelect, 400);
  } else {
    playFailureBuzz();
    
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`dot-${i}`);
      if (dot) dot.classList.add('error');
    }
    
    const card = document.getElementById('loginCard');
    if (card) card.classList.add('shake-animation');
    
    setTimeout(() => {
      if (card) card.classList.remove('shake-animation');
      typedPIN = '';
      updatePINIndicators();
    }, 450);
  }
}

function setupStaffUI() {
  const welcomeWidget = document.getElementById('staffWelcomeWidget');
  const staffNameDisplay = document.getElementById('staffNameDisplay');
  if (welcomeWidget && staffNameDisplay) {
    welcomeWidget.style.display = 'flex';
    staffNameDisplay.innerHTML = `👤 ${loggedInStaff} <small style="opacity:0.75; font-size:0.75rem; font-weight:normal; margin-left: 5px;">(${loggedInRole})</small>`;
  }
  applyRoleGates();
  
  if (loggedInRole === 'admin') {
    renderStaffRoster();
  }

  // Instantly re-render lists for the new staff role workload
  renderBoard();
  recalculateStats();
  renderHistory();
}

function applyRoleGates() {
  const tabUsers = document.getElementById('tab-users');
  const tabQr = document.getElementById('tab-qr');
  const clearCompletedBtn = document.querySelector('.clear-completed-btn');
  const menuForm = document.getElementById('menuFormCard');
  const adminOnlyHeaders = document.querySelectorAll('.admin-only-header');
  
  if (loggedInRole === 'admin') {
    if (tabUsers) tabUsers.style.display = 'flex';
    if (tabQr) tabQr.style.display = 'flex';
    if (clearCompletedBtn) {
      clearCompletedBtn.style.display = 'flex';
      clearCompletedBtn.disabled = false;
    }
    if (menuForm) menuForm.style.display = 'block';
    adminOnlyHeaders.forEach(el => el.style.display = '');
  } else if (loggedInRole === 'cashier') {
    if (tabUsers) tabUsers.style.display = 'none';
    if (tabQr) tabQr.style.display = 'flex';
    if (clearCompletedBtn) {
      clearCompletedBtn.style.display = 'flex';
      clearCompletedBtn.disabled = false;
    }
    if (menuForm) menuForm.style.display = 'block';
    adminOnlyHeaders.forEach(el => el.style.display = '');
    if (document.getElementById('pane-users') && document.getElementById('pane-users').classList.contains('active')) {
      switchTab('requests');
    }
  } else {
    // Waiter
    if (tabUsers) tabUsers.style.display = 'none';
    if (tabQr) tabQr.style.display = 'none';
    if (clearCompletedBtn) {
      clearCompletedBtn.style.display = 'none';
    }
    if (menuForm) menuForm.style.display = 'none';
    adminOnlyHeaders.forEach(el => el.style.display = 'none');
    if (document.getElementById('pane-users') && document.getElementById('pane-users').classList.contains('active')) {
      switchTab('requests');
    }
    if (document.getElementById('pane-qr') && document.getElementById('pane-qr').classList.contains('active')) {
      switchTab('requests');
    }
  }
  
  // Re-render menu to apply new role constraints (interactive toggles vs plain text)
  renderMenuManager();
}

function handleStaffLogout() {
  localStorage.removeItem('logged_in_staff');
  localStorage.removeItem('logged_in_role');
  loggedInStaff = null;
  loggedInRole = null;
  checkStaffSession();
}

// 3. Tab Navigation
function switchTab(tabName) {
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.dashboard-pane').forEach(pane => pane.classList.remove('active'));
  
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.getElementById(`pane-${tabName}`).classList.add('active');

  if (tabName === 'history') {
    renderHistory();
  }

  if (tabName === 'qr') {
    // Populate base URL automatically if blank
    const baseUrlInput = document.getElementById('qr-base-url');
    if (baseUrlInput && !baseUrlInput.value) {
      // Get current folder URL minus the filename
      const currentPath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      baseUrlInput.value = currentPath;
    }
    renderQRGallery();
  }
}

// 4. Audio Synthesizer (Web Audio API)
// Synthesizes a luxury, high-fidelity café bell chime (Ding-Dong!)
function playNotificationChime() {
  if (isMuted) return;

  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;

    // Ding (First Tone - high chime C6)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.50, now); // C6 Note
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.6);

    // Dong (Second Tone - warm bell G5, offset by 120ms)
    setTimeout(() => {
      if (!audioContext) return;
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, audioContext.currentTime); // G5 Note
      
      gain2.gain.setValueAtTime(0, audioContext.currentTime);
      gain2.gain.linearRampToValueAtTime(0.30, audioContext.currentTime + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.75);

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.8);
    }, 120);

  } catch (e) {
    console.warn('Audio synthesis failed or blocked by browser settings.', e);
  }
}

function toggleAudioMute() {
  isMuted = !isMuted;
  const toggleBtn = document.getElementById('audioToggle');
  const statusText = document.getElementById('audioStatusText');
  const icon = document.getElementById('audio-icon');

  if (isMuted) {
    toggleBtn.classList.add('muted');
    statusText.innerText = 'Sound Muted';
    icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else {
    toggleBtn.classList.remove('muted');
    statusText.innerText = 'Sound On';
    icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    
    playNotificationChime();
  }
}

// 5. Real-time Communications Layer (Socket.io vs BroadcastChannel Fallback)
function initNetwork() {
  if (typeof io !== 'undefined') {
    try {
      socket = io();
      console.log('Dashboard connected to server socket.');

      socket.on('connect', () => {
        console.log('Dashboard socket connected successfully. Registering with backend...');
        socket.emit('dashboard:init');
      });

      socket.on('request:list', (data) => {
        requests = data;
        renderBoard();
        recalculateStats();
        renderHistory();
      });

      socket.on('request:new', (newReq) => {
        if (!requests.some(r => r.id === newReq.id)) {
          requests.unshift(newReq);
          playNotificationChime();
          renderBoard();
          recalculateStats();
          renderHistory();
        }
      });

      socket.on('request:updated', (updatedReq) => {
        const idx = requests.findIndex(r => r.id === updatedReq.id);
        if (idx !== -1) {
          requests[idx] = updatedReq;
          renderBoard();
          recalculateStats();
          renderHistory();
        }
      });

      socket.on('staff:list', (data) => {
        console.log('Received synced staff list from server:', data);
        activeStaffRoster = data;
        
        // Sync local storage as fallback cache in case we go offline!
        localStorage.setItem('grand_cafe_staff_users', JSON.stringify(activeStaffRoster));
        
        // Render login grid and administrative roster table
        renderStaffGrid();
        if (loggedInRole === 'admin') {
          renderStaffRoster();
        }
      });

      socket.on('staff:error', (err) => {
        alert(`Staff Error: ${err.message}`);
      });

      socket.on('table:list', (data) => {
        console.log('Received synced tables list from server:', data);
        generatedTables = data;
        
        // Cache table lists locally
        localStorage.setItem('grand_cafe_generated_tables', JSON.stringify(generatedTables));
        renderQRGallery();
      });

      socket.on('table:error', (err) => {
        alert(`Table Error: ${err.message}`);
      });

      // Listen for menu items updates
      socket.on('menu:list', (data) => {
        console.log('Received synced menu list from server:', data);
        activeMenuItems = data;
        localStorage.setItem('grand_cafe_menu_items', JSON.stringify(activeMenuItems));
        renderMenuManager();
      });

    } catch (e) {
      console.warn('Dashboard socket setup failed. Launching Broadcast fallback.', e);
      initBroadcastFallback();
    }
  } else {
    initBroadcastFallback();
  }
}

function initBroadcastFallback() {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('grand_cafe_service');
    broadcastChannel.onmessage = (event) => {
      const { event: evType, data } = event.data;
      console.log(`Broadcast message received: ${evType}`, data);

      if (evType === 'request:new') {
        if (!requests.some(r => r.id === data.id)) {
          requests.unshift(data);
          playNotificationChime();
          syncLocalDB();
          renderBoard();
          recalculateStats();
        }
      } else if (evType === 'request:updated') {
        const idx = requests.findIndex(r => r.id === data.id);
        if (idx !== -1) {
          requests[idx] = data;
          syncLocalDB();
          renderBoard();
          recalculateStats();
        }
      }
    };
  }

  loadFromLocalDB();
  loadTablesFromLocal();
  loadMenuFromLocal();

  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === 'grand_cafe_requests') {
      loadFromLocalDB();
    }
    if (!event.key || event.key === 'grand_cafe_generated_tables') {
      loadTablesFromLocal();
    }
    if (!event.key || event.key === 'grand_cafe_menu_items') {
      loadMenuFromLocal();
    }
    if (!event.key || event.key === 'grand_cafe_staff_users') {
      try {
        const raw = localStorage.getItem('grand_cafe_staff_users');
        activeStaffRoster = raw ? JSON.parse(raw) : [{ username: 'Admin', pin: '4450', role: 'admin' }];
        renderStaffGrid();
        if (loggedInRole === 'admin') {
          renderStaffRoster();
        }
      } catch (e) {
        console.error('Failed to sync staff roster storage event.', e);
      }
    }
  });
}

function loadFromLocalDB() {
  try {
    const raw = localStorage.getItem('grand_cafe_requests');
    const prevCount = requests.length;
    requests = raw ? JSON.parse(raw) : [];
    
    // Play chime if new requests arrived externally
    if (requests.length > prevCount && requests.some(r => r.status === 'new')) {
      playNotificationChime();
    }
    
    renderBoard();
    recalculateStats();
  } catch (e) {
    console.error('Failed to parse requests from local storage.', e);
  }
}

function loadTablesFromLocal() {
  try {
    const raw = localStorage.getItem('grand_cafe_generated_tables');
    generatedTables = raw ? JSON.parse(raw) : [
      { number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }, { number: 5 }
    ];
    renderQRGallery();
  } catch (e) {
    console.error('Failed to parse tables from storage', e);
  }
}

function syncLocalDB() {
  localStorage.setItem('grand_cafe_requests', JSON.stringify(requests));
}

// 6. Operations & Actions
function updateRequestStatus(id, newStatus) {
  const req = requests.find(r => r.id === id);
  if (!req) return;

  const now = new Date().toISOString();
  req.status = newStatus;
  
  if (newStatus === 'seen') {
    req.seenAt = now;
    // Attach Waiter accountability data on seen transition!
    req.seenBy = loggedInStaff || 'Staff Member';
  } else if (newStatus === 'completed') {
    req.completedAt = now;
    if (!req.seenAt) {
      req.seenAt = now;
      req.seenBy = loggedInStaff || 'Staff Member';
    }
  }

  if (socket && socket.connected) {
    socket.emit('request:update_status', { 
      id: id, 
      status: newStatus,
      seenBy: req.seenBy 
    });
  } else {
    // Local updates
    syncLocalDB();
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        event: 'request:updated',
        data: req
      });
    }
    renderBoard();
    recalculateStats();
  }
}

function clearCompletedRequests() {
  if (socket && socket.connected) {
    socket.emit('request:clear_completed');
  } else {
    requests = requests.filter(r => r.status !== 'completed');
    syncLocalDB();
    renderBoard();
    recalculateStats();
  }
}

// 7. UI Rendering Board Engine
function getRequestLabel(type) {
  switch (type) {
    case 'call_waiter': return 'Call Waiter';
    case 'bring_water': return 'Bring Water';
    case 'ask_bill': return 'Ask for Bill';
    default: return 'Service Call';
  }
}

function getRequestBadgeClass(type) {
  switch (type) {
    case 'call_waiter': return 'req-waiter';
    case 'bring_water': return 'req-water';
    case 'ask_bill': return 'req-bill';
    default: return '';
  }
}

function getRequestIcon(type) {
  switch (type) {
    case 'call_waiter': 
      return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:6px;"><path d="M6 18H18L16 10H8L6 18Z"/><path d="M12 2v2"/><path d="M2 22h20"/><path d="M12 4c-3.3 0-6 2.7-6 6v8h12v-8c0-3.3-2.7-6-6-6z"/></svg>';
    case 'bring_water': 
      return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:6px;"><path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-13-7-13S5 10.7 5 15a7 7 0 0 0 7 7z"/></svg>';
    case 'ask_bill': 
      return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:6px;"><rect x="2" height="14" width="20" y="5" rx="2"/><path d="M12 9a2.5 2.5 0 0 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';
    default: 
      return '';
  }
}

function getRelativeTimeStr(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  const remainingSec = diffSec % 60;
  return `${diffMin}m ${remainingSec}s ago`;
}

function renderBoard() {
  const containers = {
    new: document.getElementById('container-new'),
    seen: document.getElementById('container-seen'),
    completed: document.getElementById('container-completed')
  };

  const counts = {
    new: 0,
    seen: 0,
    completed: 0
  };

  // Clear containers
  Object.keys(containers).forEach(k => {
    containers[k].innerHTML = '';
  });

  // Filter requests
  const filteredRequests = requests.filter(req => {
    // Hide soft-cleared completed requests from the active workboard columns
    if (req.status === 'completed' && req.clearedFromBoard) return false;

    // Apply category filter (All / Waiter Calls / Water / Bills)
    if (currentFilter !== 'all' && req.type !== currentFilter) return false;
    
    // Apply Waiter workload isolation filter
    if (loggedInRole === 'waiter') {
      if (req.status === 'seen' || req.status === 'completed') {
        return req.seenBy === loggedInStaff;
      }
    }
    return true;
  });

  filteredRequests.forEach(req => {
    if (!containers[req.status]) return;
    
    counts[req.status]++;
    
    const card = document.createElement('div');
    card.className = `request-card status-${req.status}`;
    card.id = `card-${req.id}`;
    
    const relativeTime = getRelativeTimeStr(req.createdAt);
    const badgeClass = getRequestBadgeClass(req.type);
    const label = getRequestLabel(req.type);
    const icon = getRequestIcon(req.type);

    // Build Staff Assignment Badge HTML
    let staffBadgeHtml = '';
    if (req.seenBy) {
      staffBadgeHtml = `
        <div class="assigned-staff-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Assigned: <strong>${req.seenBy}</strong>
        </div>
      `;
    }

    // Build controls depending on status
    let actionHtml = '';
    if (req.status === 'new') {
      actionHtml = `
        <div class="card-actions">
          <button class="btn-card-action btn-seen-action" onclick="updateRequestStatus('${req.id}', 'seen')">
            Mark Seen
          </button>
          <button class="btn-card-action btn-done-action" onclick="updateRequestStatus('${req.id}', 'completed')">
            Complete
          </button>
        </div>
      `;
    } else if (req.status === 'seen') {
      actionHtml = `
        <div class="card-actions">
          <button class="btn-card-action btn-done-action" onclick="updateRequestStatus('${req.id}', 'completed')" style="width: 100%;">
            Complete
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-top">
        <span class="card-table"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; color: var(--color-gold);"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Table ${req.table}</span>
        <span class="card-time" data-timestamp="${req.createdAt}">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${relativeTime}
        </span>
      </div>
      <div class="card-body" style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
        <div class="request-badge ${badgeClass}" style="width:100%;">
          ${icon} ${label}
        </div>
        ${staffBadgeHtml}
      </div>
      ${actionHtml}
    `;
    
    containers[req.status].appendChild(card);
  });

  // Update counts in UI
  document.getElementById('count-new').innerText = counts.new;
  document.getElementById('count-seen').innerText = counts.seen;
  document.getElementById('count-completed').innerText = counts.completed;

  // Render empty states
  Object.keys(containers).forEach(k => {
    if (counts[k] === 0) {
      let message = 'Column is empty.';
      let icon = '✓';
      if (k === 'new') {
        message = 'No active new requests.<br>Tables are currently relaxed.';
        icon = '☕';
      } else if (k === 'seen') {
        message = 'No active tasks in progress.';
        icon = '🤝';
      } else if (k === 'completed') {
        message = 'Completed archive is empty.';
        icon = '📦';
      }
      
      containers[k].innerHTML = `
        <div class="empty-state">
          <i style="font-style: normal; font-size: 2.2rem; display: block; margin-bottom: 0.5rem;">${icon}</i>
          <p>${message}</p>
        </div>
      `;
    }
  });
}

function filterRequests(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`filter-${filterType === 'call_waiter' ? 'waiter' : filterType === 'bring_water' ? 'water' : filterType === 'ask_bill' ? 'bill' : 'all'}`).classList.add('active');
  renderBoard();
}

// 8. Statistics recalculation
function recalculateStats() {
  // Filter requests according to role visibility
  const visibleRequests = requests.filter(req => {
    if (loggedInRole === 'waiter') {
      if (req.status === 'seen' || req.status === 'completed') {
        return req.seenBy === loggedInStaff;
      }
    }
    return true;
  });

  const activeCount = visibleRequests.filter(r => r.status === 'new' || r.status === 'seen').length;
  document.getElementById('stat-active').innerText = activeCount;
  
  const newRequestsCard = document.querySelector('.stat-urgent');
  const hasNew = visibleRequests.some(r => r.status === 'new');
  if (hasNew && newRequestsCard) {
    newRequestsCard.style.boxShadow = '0 0 20px rgba(231, 76, 60, 0.3)';
    newRequestsCard.style.borderColor = 'rgba(231, 76, 60, 0.4)';
  } else if (newRequestsCard) {
    newRequestsCard.style.boxShadow = '';
    newRequestsCard.style.borderColor = '';
  }

  document.getElementById('stat-total').innerText = visibleRequests.length;

  const respondedRequests = visibleRequests.filter(r => r.seenAt);
  if (respondedRequests.length === 0) {
    document.getElementById('stat-avg-time').innerText = '0m 0s';
    return;
  }

  let totalDurationMs = 0;
  respondedRequests.forEach(r => {
    const start = new Date(r.createdAt).getTime();
    const end = new Date(r.seenAt).getTime();
    totalDurationMs += Math.max(0, end - start);
  });

  const avgMs = totalDurationMs / respondedRequests.length;
  const avgSec = Math.floor(avgMs / 1000);
  const avgMin = Math.floor(avgSec / 60);
  const remainingSec = avgSec % 60;

  document.getElementById('stat-avg-time').innerText = `${avgMin}m ${remainingSec}s`;
}

// Periodic ticker
setInterval(() => {
  document.querySelectorAll('.card-time').forEach(el => {
    const timestamp = el.getAttribute('data-timestamp');
    if (timestamp) {
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${getRelativeTimeStr(timestamp)}`;
    }
  });
}, 10000);

// 9. Printable QR Cards Generation Station Engine
function renderQRGallery() {
  const baseUrl = document.getElementById('qr-base-url').value.trim();
  const container = document.getElementById('qrCardsContainer');
  if (!container) return;
  container.innerHTML = ''; 

  if (generatedTables.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; opacity: 0.5; padding: 3rem;">
        <p>No table QR codes generated yet. Enter a range above and click Generate to save them.</p>
      </div>
    `;
    return;
  }

  generatedTables.forEach(t => {
    let customerUrl = '';
    if (baseUrl) {
      customerUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}customer.html?table=${t.number}`;
    } else {
      const currentPath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      customerUrl = `${currentPath}customer.html?table=${t.number}`;
    }

    const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(customerUrl)}&color=1a100a&margin=10`;

    const card = document.createElement('div');
    card.className = 'qr-table-card';
    card.innerHTML = `
      <img src="grand-logo.png" alt="Grand Café Logo" class="qr-card-logo" onerror="this.src='https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=150&q=80';">
      <div class="qr-card-title">Grand Café</div>
      <div class="qr-card-subtitle">Tableside Service</div>
      
      <div class="qr-code-box">
        <img src="${qrImgSrc}" alt="Table ${t.number} QR Code" loading="lazy">
      </div>
      
      <div class="qr-card-table-num">TABLE ${t.number}</div>
      <div class="qr-card-instruction">Scan with your phone's camera to call a waiter, get water, or ask for the bill instantly.</div>
      
      <div class="qr-card-actions no-print" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: center; width: 100%;">
        <button class="btn-card-action btn-seen-action" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; margin: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" onclick="printSingleQRCard(${t.number}, '${qrImgSrc}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print
        </button>
        <button class="btn-card-action btn-delete-user" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; margin: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" onclick="deleteTableQR(${t.number})">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function addTableQR() {
  const startNum = parseInt(document.getElementById('qr-start-table').value);
  const endNum = parseInt(document.getElementById('qr-end-table').value);
  
  if (isNaN(startNum) || isNaN(endNum) || startNum < 1 || endNum < startNum) {
    alert('Invalid table range. Please enter valid start and end numbers.');
    return;
  }
  
  if (socket && socket.connected) {
    socket.emit('table:create', { start: startNum, end: endNum });
  } else {
    // Fallback mode: add to generatedTables in-memory & save
    for (let n = startNum; n <= endNum; n++) {
      if (!generatedTables.some(t => t.number === n)) {
        generatedTables.push({ number: n });
      }
    }
    generatedTables.sort((a, b) => a.number - b.number);
    localStorage.setItem('grand_cafe_generated_tables', JSON.stringify(generatedTables));
    renderQRGallery();
  }
}

function deleteTableQR(number) {
  const confirmDelete = confirm(`Are you sure you want to delete Table ${number} QR code?`);
  if (!confirmDelete) return;
  
  if (socket && socket.connected) {
    socket.emit('table:delete', number);
  } else {
    generatedTables = generatedTables.filter(t => t.number !== number);
    localStorage.setItem('grand_cafe_generated_tables', JSON.stringify(generatedTables));
    renderQRGallery();
  }
}

function printSingleQRCard(tableNumber, qrSrc) {
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('Popup blocker is preventing printing. Please allow popups for this site.');
    return;
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Table ${tableNumber} QR Code</title>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
      <style>
        @media print {
          body {
            background: #ffffff !important;
            color: #22170f !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        body {
          font-family: 'Outfit', sans-serif;
          background: #fbf5e6;
          color: #22170f;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 0;
        }
        .qr-card {
          width: 380px;
          border: 2px solid #c5a059;
          background: #ffffff;
          border-radius: 24px;
          padding: 2.5rem 2rem;
          text-align: center;
          box-shadow: 0 10px 30px rgba(34, 23, 15, 0.15);
          box-sizing: border-box;
        }
        .qr-logo {
          max-width: 140px;
          height: auto;
          margin-bottom: 0.5rem;
        }
        .qr-title {
          font-family: 'Cinzel', serif;
          font-size: 1.8rem;
          font-weight: 700;
          color: #362517;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }
        .qr-subtitle {
          font-size: 0.85rem;
          text-transform: uppercase;
          color: #c5a059;
          font-weight: 600;
          letter-spacing: 0.15em;
          margin-bottom: 1.5rem;
        }
        .qr-code-box {
          background: #fbf5e6;
          border: 1px solid rgba(197, 160, 89, 0.2);
          padding: 1.5rem;
          border-radius: 16px;
          display: inline-block;
          margin-bottom: 1.5rem;
        }
        .qr-code-box img {
          width: 200px;
          height: 200px;
          display: block;
        }
        .qr-table-num {
          font-family: 'Cinzel', serif;
          font-size: 1.6rem;
          color: #362517;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin-bottom: 0.5rem;
        }
        .qr-instruction {
          font-size: 0.8rem;
          color: #4c321f;
          line-height: 1.5;
          font-weight: 300;
        }
      </style>
    </head>
    <body>
      <div class="qr-card">
        <img src="grand-logo.png" alt="Grand Café Logo" class="qr-logo" onerror="this.src='https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=150&q=80';">
        <div class="qr-title">Grand Café</div>
        <div class="qr-subtitle">Tableside Service</div>
        <div class="qr-code-box">
          <img src="${qrSrc}" alt="Table ${tableNumber} QR Code">
        </div>
        <div class="qr-table-num">TABLE ${tableNumber}</div>
        <div class="qr-instruction">Scan with your phone's camera to call a waiter, get water, or ask for the bill instantly.</div>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 500);
        };
      </script>
    </body>
    </html>
  `;
  
  printWindow.document.write(html);
  printWindow.document.close();
}

function renderHistory() {
  const historyBody = document.getElementById('historyTableBody');
  const totalCountEl = document.getElementById('history-total-count');
  if (!historyBody) return;
  
  // Filter for completed requests only
  const completedRequests = requests.filter(req => req.status === 'completed');
  
  // Filter by role visibility
  const visibleHistory = completedRequests.filter(req => {
    if (loggedInRole === 'waiter') {
      return req.seenBy === loggedInStaff;
    }
    return true; // Admin/Cashier can see all
  });
  
  if (totalCountEl) {
    totalCountEl.innerText = visibleHistory.length;
  }
  
  if (visibleHistory.length === 0) {
    historyBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; opacity: 0.5;">
          <p>No completed serving history recorded for today.</p>
        </td>
      </tr>
    `;
    return;
  }
  
  // Sort by completedAt descending
  const sortedHistory = [...visibleHistory].sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
  
  historyBody.innerHTML = '';
  sortedHistory.forEach(req => {
    const tr = document.createElement('tr');
    
    const created = new Date(req.createdAt);
    const completed = req.completedAt ? new Date(req.completedAt) : null;
    
    const createdTimeStr = created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const completedTimeStr = completed ? completed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
    
    // Response Duration calculation
    let durationStr = 'N/A';
    if (completed) {
      const diffMs = completed.getTime() - created.getTime();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      if (diffSec < 60) {
        durationStr = `${diffSec}s`;
      } else {
        const diffMin = Math.floor(diffSec / 60);
        const remainingSec = diffSec % 60;
        durationStr = `${diffMin}m ${remainingSec}s`;
      }
    }
    
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--color-gold);">Table ${req.table}</td>
      <td><span class="request-badge ${getRequestBadgeClass(req.type)}" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; display: inline-flex; border-radius: 4px;">${getRequestIcon(req.type)} ${getRequestLabel(req.type)}</span></td>
      <td style="font-weight: 500;">👤 ${req.seenBy || 'System'}</td>
      <td style="color: var(--color-cream-dim);">${createdTimeStr}</td>
      <td style="color: var(--color-cream-dim);">${completedTimeStr}</td>
      <td style="font-family: monospace; font-weight: bold; color: var(--color-success);">${durationStr}</td>
    `;
    historyBody.appendChild(tr);
  });
}

// 9.5 User Management Operations (Admin Panel)
function renderStaffRoster() {
  const rosterBody = document.getElementById('staffRosterBody');
  if (!rosterBody) return;
  rosterBody.innerHTML = '';
  
  activeStaffRoster.forEach(staff => {
    const tr = document.createElement('tr');
    
    const badgeClass = staff.role === 'admin' ? 'badge-admin' : staff.role === 'cashier' ? 'badge-cashier' : 'badge-waiter';
    let roleText = staff.role;
    if (staff.role === 'admin') roleText = '👑 Admin';
    else if (staff.role === 'cashier') roleText = '💼 Cashier';
    else roleText = '👤 Waiter';
    
    const isSelf = staff.username === loggedInStaff;
    const isPrimaryAdmin = staff.username === 'Admin';
    const disableDelete = isSelf || isPrimaryAdmin;
    
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--color-cream);">${staff.username}</td>
      <td><span class="staff-profile-role-badge ${badgeClass}" style="font-size:0.7rem;">${roleText}</span></td>
      <td style="font-family: monospace; letter-spacing: 0.1em; color: var(--color-gold-hover); font-weight: bold;">${staff.pin}</td>
      <td style="text-align: right;">
        <button class="btn-delete-user" ${disableDelete ? 'disabled' : ''} onclick="deleteStaffUser('${staff.username}')" title="${isSelf ? 'Cannot delete your active session' : isPrimaryAdmin ? 'Primary Admin cannot be deleted' : 'Delete user profile'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete
        </button>
      </td>
    `;
    rosterBody.appendChild(tr);
  });
}

function registerNewStaff() {
  const nameInput = document.getElementById('new-user-name');
  const roleSelect = document.getElementById('new-user-role');
  const pinInput = document.getElementById('new-user-pin');
  
  if (!nameInput || !roleSelect || !pinInput) return;
  
  const name = nameInput.value.trim();
  const role = roleSelect.value;
  const pin = pinInput.value.trim();
  
  if (!name) {
    alert('Please enter a valid staff name.');
    return;
  }
  
  const isDuplicate = activeStaffRoster.some(s => s.username.toLowerCase() === name.toLowerCase());
  if (isDuplicate) {
    alert('A staff member with this name already exists. Please choose a unique name.');
    return;
  }
  
  if (!/^\d{4}$/.test(pin)) {
    alert('Passcode PIN must be exactly 4 digits.');
    return;
  }
  
  if (socket && socket.connected) {
    socket.emit('staff:create', { username: name, pin: pin, role: role });
    document.getElementById('new-user-form').reset();
    playNotificationChime();
    return;
  }
  
  const newUser = { username: name, pin: pin, role: role };
  activeStaffRoster.push(newUser);
  
  localStorage.setItem('grand_cafe_staff_users', JSON.stringify(activeStaffRoster));
  
  document.getElementById('new-user-form').reset();
  
  renderStaffRoster();
  renderStaffGrid();
  playNotificationChime();
  
  alert(`Successfully registered ${name} (${role})!`);
}

function deleteStaffUser(username) {
  if (username === loggedInStaff) {
    alert('Safety Block: You cannot delete your own logged-in account.');
    return;
  }
  if (username === 'Admin') {
    alert('Safety Block: The primary default Admin account cannot be deleted to prevent lockouts.');
    return;
  }
  
  const confirmDelete = confirm(`Are you sure you want to delete staff profile "${username}"?`);
  if (!confirmDelete) return;
  
  if (socket && socket.connected) {
    socket.emit('staff:delete', username);
    playFailureBuzz();
    return;
  }
  
  activeStaffRoster = activeStaffRoster.filter(s => s.username !== username);
  
  localStorage.setItem('grand_cafe_staff_users', JSON.stringify(activeStaffRoster));
  
  renderStaffRoster();
  renderStaffGrid();
  playFailureBuzz();
}

// 10. Startup Initialization
window.addEventListener('DOMContentLoaded', () => {
  checkStaffSession();
  initNetwork();
  
  if (!socket || !socket.connected) {
    loadMenuFromLocal();
  }
});

// ==========================================================================
// STAFF PORTAL DIGITAL MENU OPERATIONS ENGINE
// ==========================================================================

function loadMenuFromLocal() {
  try {
    const raw = localStorage.getItem('grand_cafe_menu_items');
    activeMenuItems = raw ? JSON.parse(raw) : [];
    renderMenuManager();
  } catch (e) {
    console.error('Failed to parse menu items from storage:', e);
  }
}

function renderMenuManager() {
  const tbody = document.getElementById('menuRosterBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const searchVal = document.getElementById('menu-search-input').value.trim().toLowerCase();
  
  const filtered = activeMenuItems.filter(item => {
    if (menuCategoryFilter !== 'all' && item.category !== menuCategoryFilter) return false;
    if (searchVal) {
      const matchName = item.name.toLowerCase().includes(searchVal);
      const matchDesc = (item.description || '').toLowerCase().includes(searchVal);
      const matchCategory = item.category.toLowerCase().includes(searchVal);
      if (!matchName && !matchDesc && !matchCategory) return false;
    }
    return true;
  });
  
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; opacity: 0.5;">
          <p>No matching menu items found.</p>
        </td>
      </tr>
    `;
    return;
  }
  
  const isAuthorized = (loggedInRole === 'admin' || loggedInRole === 'cashier');
  
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    
    // Price formatting
    const priceFormatted = typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : `$${item.price}`;
    
    // Signature Switch or Badge
    let sigCell = '';
    if (isAuthorized) {
      sigCell = `
        <label class="switch" style="width: 40px; height: 20px; display: block; margin: 0 auto;">
          <input type="checkbox" ${item.isSignature ? 'checked' : ''} onchange="toggleMenuItemSignature('${item.name.replace(/'/g, "\\'")}', this.checked)" style="opacity: 0; width: 0; height: 0;">
          <span class="slider" style="background-color: ${item.isSignature ? 'var(--color-gold)' : 'rgba(255,255,255,0.1)'}; border: 1px solid rgba(197, 160, 89, 0.3);"></span>
        </label>
      `;
    } else {
      sigCell = item.isSignature ? '<span style="color: var(--color-gold);">✨ Yes</span>' : 'No';
    }
    
    // Availability Switch or Badge
    let availCell = '';
    if (isAuthorized) {
      availCell = `
        <label class="switch" style="width: 40px; height: 20px; display: block; margin: 0 auto;">
          <input type="checkbox" ${item.isAvailable !== false ? 'checked' : ''} onchange="toggleMenuItemAvailability('${item.name.replace(/'/g, "\\'")}', this.checked)" style="opacity: 0; width: 0; height: 0;">
          <span class="slider" style="background-color: ${item.isAvailable !== false ? 'var(--color-success)' : 'rgba(255,255,255,0.1)'}; border: 1px solid rgba(46, 204, 113, 0.3);"></span>
        </label>
      `;
    } else {
      availCell = item.isAvailable !== false ? '<span style="color: var(--color-success);">✅ Available</span>' : '<span style="color: var(--color-alert);">❌ Sold Out</span>';
    }
    
    // Actions cell
    let actionCell = '';
    if (isAuthorized) {
      actionCell = `
        <td style="text-align: right;" class="admin-only-header">
          <button class="btn-card-action btn-seen-action" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin: 0 0.25rem 0 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" onclick="editMenuItem('${item.name.replace(/'/g, "\\'")}')">
            Edit
          </button>
          <button class="btn-delete-user" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" onclick="deleteMenuItem('${item.name.replace(/'/g, "\\'")}')">
            Delete
          </button>
        </td>
      `;
    }
    
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--color-cream);">${item.name}</td>
      <td style="color: var(--color-cream-dim);">${item.category}</td>
      <td style="font-family: monospace; font-weight: bold; color: var(--color-gold);">${priceFormatted}</td>
      <td style="text-align: center;">${sigCell}</td>
      <td style="text-align: center;">${availCell}</td>
      ${actionCell}
    `;
    tbody.appendChild(tr);
  });
}

function filterManagerByCategory(category) {
  menuCategoryFilter = category;
  
  // Clear active button filter class
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.id.startsWith('btn-mcat-')) {
      btn.classList.remove('active');
    }
  });
  
  // Set targeted active filter
  let btnId = 'btn-mcat-all';
  if (category === 'Hot Coffee') btnId = 'btn-mcat-hotcoffee';
  else if (category === 'Iced Coffee') btnId = 'btn-mcat-icedcoffee';
  else if (category === 'Matcha') btnId = 'btn-mcat-matcha';
  else if (category === 'Iced Tea') btnId = 'btn-mcat-icedtea';
  else if (category === 'Milkshakes') btnId = 'btn-mcat-milkshakes';
  else if (category === 'Mojitos') btnId = 'btn-mcat-mojitos';
  else if (category === 'Lemonades') btnId = 'btn-mcat-lemonades';
  else if (category === 'Hot Chocolate') btnId = 'btn-mcat-hotchocolate';
  
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add('active');
  
  renderMenuManager();
}

function filterManagerMenuTable() {
  renderMenuManager();
}

function resetMenuForm() {
  editingItemName = null;
  document.getElementById('new-menu-form').reset();
  
  const submitText = document.getElementById('menu-submit-text');
  if (submitText) submitText.innerText = 'Add to Menu';
  
  const cancelBtn = document.getElementById('btn-menu-cancel');
  if (cancelBtn) cancelBtn.style.display = 'none';
  
  const nameInput = document.getElementById('menu-item-name');
  if (nameInput) nameInput.disabled = false;
}

function editMenuItem(name) {
  const item = activeMenuItems.find(i => i.name === name);
  if (!item) return;
  
  editingItemName = item.name;
  
  const nameInput = document.getElementById('menu-item-name');
  if (nameInput) {
    nameInput.value = item.name;
    nameInput.disabled = true; // Disable key name changes to maintain persistence
  }
  
  const categoryInput = document.getElementById('menu-item-category');
  if (categoryInput) categoryInput.value = item.category;
  
  const descriptionInput = document.getElementById('menu-item-description');
  if (descriptionInput) descriptionInput.value = item.description || '';
  
  const priceInput = document.getElementById('menu-item-price');
  if (priceInput) priceInput.value = item.price;
  
  const sigInput = document.getElementById('menu-item-signature');
  if (sigInput) sigInput.checked = !!item.isSignature;
  
  const submitText = document.getElementById('menu-submit-text');
  if (submitText) submitText.innerText = 'Save Changes';
  
  const cancelBtn = document.getElementById('btn-menu-cancel');
  if (cancelBtn) cancelBtn.style.display = 'flex';
  
  // Scroll form into view
  const menuForm = document.getElementById('menuFormCard');
  if (menuForm) menuForm.scrollIntoView({ behavior: 'smooth' });
}

function saveMenuItem() {
  const nameInput = document.getElementById('menu-item-name');
  const categoryInput = document.getElementById('menu-item-category');
  const descriptionInput = document.getElementById('menu-item-description');
  const priceInput = document.getElementById('menu-item-price');
  const sigInput = document.getElementById('menu-item-signature');
  
  if (!nameInput || !categoryInput || !priceInput) return;
  
  const name = nameInput.value.trim();
  const category = categoryInput.value;
  const description = descriptionInput ? descriptionInput.value.trim() : '';
  const price = parseFloat(priceInput.value);
  const isSignature = sigInput ? sigInput.checked : false;
  
  if (!name || isNaN(price)) {
    alert('Please enter a valid name and price.');
    return;
  }
  
  const isEdit = !!editingItemName;
  const menuItemPayload = {
    name: name,
    category: category,
    description: description,
    price: price,
    isSignature: isSignature,
    isAvailable: true // Defaults to true on new item creation
  };
  
  if (isEdit) {
    // Keep availability of editing item
    const existing = activeMenuItems.find(i => i.name === editingItemName);
    if (existing) {
      menuItemPayload.isAvailable = existing.isAvailable;
    }
  }
  
  if (socket && socket.connected) {
    if (isEdit) {
      socket.emit('menu:update', menuItemPayload);
    } else {
      socket.emit('menu:create', menuItemPayload);
    }
    resetMenuForm();
    playNotificationChime();
    return;
  }
  
  // Offline fallback logic
  if (isEdit) {
    const idx = activeMenuItems.findIndex(i => i.name === editingItemName);
    if (idx !== -1) {
      activeMenuItems[idx] = { ...activeMenuItems[idx], ...menuItemPayload };
    }
  } else {
    // Check duplication on offline fallback
    const isDuplicate = activeMenuItems.some(i => i.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      alert('A menu item with this name already exists.');
      return;
    }
    activeMenuItems.push(menuItemPayload);
  }
  
  localStorage.setItem('grand_cafe_menu_items', JSON.stringify(activeMenuItems));
  
  // Broadcast changes offline
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      event: 'menu:updated',
      data: activeMenuItems
    });
  }
  
  window.dispatchEvent(new Event('storage'));
  
  resetMenuForm();
  renderMenuManager();
  playNotificationChime();
}

function deleteMenuItem(name) {
  const confirmDelete = confirm(`Are you sure you want to delete "${name}" from the menu?`);
  if (!confirmDelete) return;
  
  if (socket && socket.connected) {
    socket.emit('menu:delete', name);
    playFailureBuzz();
    return;
  }
  
  // Offline fallback
  activeMenuItems = activeMenuItems.filter(i => i.name !== name);
  localStorage.setItem('grand_cafe_menu_items', JSON.stringify(activeMenuItems));
  
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      event: 'menu:updated',
      data: activeMenuItems
    });
  }
  window.dispatchEvent(new Event('storage'));
  
  renderMenuManager();
  playFailureBuzz();
}

function toggleMenuItemSignature(name, isSignature) {
  const item = activeMenuItems.find(i => i.name === name);
  if (!item) return;
  
  item.isSignature = isSignature;
  
  if (socket && socket.connected) {
    socket.emit('menu:update', { name: name, isSignature: isSignature });
    return;
  }
  
  // Offline fallback
  localStorage.setItem('grand_cafe_menu_items', JSON.stringify(activeMenuItems));
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      event: 'menu:updated',
      data: activeMenuItems
    });
  }
  window.dispatchEvent(new Event('storage'));
  renderMenuManager();
}

function toggleMenuItemAvailability(name, isAvailable) {
  const item = activeMenuItems.find(i => i.name === name);
  if (!item) return;
  
  item.isAvailable = isAvailable;
  
  if (socket && socket.connected) {
    socket.emit('menu:update', { name: name, isAvailable: isAvailable });
    return;
  }
  
  // Offline fallback
  localStorage.setItem('grand_cafe_menu_items', JSON.stringify(activeMenuItems));
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      event: 'menu:updated',
      data: activeMenuItems
    });
  }
  window.dispatchEvent(new Event('storage'));
  renderMenuManager();
}
