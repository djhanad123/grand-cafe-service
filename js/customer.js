/**
 * GRAND CAFÉ - Customer App tableside script
 * Real-time synchronization with Local BroadcastChannel fallback + server Socket.io support.
 * Enhanced with Live Status Tracker displaying which waiter is serving the table.
 */

// 1. Parse URL Parameter to identify Table
function getTableNumber() {
  const urlParams = new URLSearchParams(window.location.search);
  const tableParam = urlParams.get('table');
  return tableParam ? tableParam.trim() : null;
}

const tableNumber = getTableNumber() || "Demo Table 1";
document.getElementById('tableText').innerText = `Table ${tableNumber}`;

// 2. State & Cooldown Variables
const COOLDOWN_DURATION_MS = 45000; // 45 seconds spam prevention
let socket = null;
let broadcastChannel = null;

// Guest-side active requests cache
let activeTableRequests = [];

// Digital Menu State Variables
let menuItems = [];
let activeCategory = 'all';

// Initialize Network Transports
function initNetwork() {
  // Try Socket.io
  if (typeof io !== 'undefined') {
    try {
      socket = io();
      console.log('Socket.io connection established.');
      
      socket.on('request:success', (data) => {
        showSuccessModal(data.message);
      });
      
      socket.on('request:error', (data) => {
        alert(data.message);
      });

      // Listen for updates from the server
      socket.on('request:updated', (updatedReq) => {
        if (updatedReq.table === tableNumber) {
          processRequestUpdate(updatedReq);
        }
      });

      // Listen for menu items updates
      socket.on('menu:list', (data) => {
        console.log('Received synced menu list from server:', data);
        menuItems = data;
        localStorage.setItem('grand_cafe_menu_items', JSON.stringify(menuItems));
        renderCustomerMenu();
      });
    } catch (e) {
      console.warn('Socket.io initialization failed, falling back to BroadcastChannel.', e);
      initBroadcastFallback();
    }
  } else {
    initBroadcastFallback();
  }
}

// Fallback to HTML5 BroadcastChannel for zero-server real-time demos
function initBroadcastFallback() {
  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel('grand_cafe_service');
    broadcastChannel.onmessage = (event) => {
      const { event: evType, data } = event.data;
      if (evType === 'request:updated' && data.table === tableNumber) {
        processRequestUpdate(data);
      }
    };
    console.log('BroadcastChannel transport initialized.');
  }

  // Load initial active states and menu from localStorage
  loadActiveRequestsFromStorage();
  loadMenuFromLocal();

  // Listen to cross-tab storage changes
  window.addEventListener('storage', (event) => {
    loadActiveRequestsFromStorage();
    if (!event.key || event.key === 'grand_cafe_menu_items') {
      loadMenuFromLocal();
    }
  });
}

// 3. Request Update processor, UI re-renderer, Notification Sound Synthesizer, & Accordion Toggle
let customerAudioCtx = null;

function playCustomerChime(type) {
  try {
    if (!customerAudioCtx) {
      customerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (customerAudioCtx.state === 'suspended') {
      customerAudioCtx.resume();
    }
    
    const now = customerAudioCtx.currentTime;
    
    if (type === 'seen') {
      // Elegant ascending perfect fourth (E6 -> A6) for staff acceptance
      const osc1 = customerAudioCtx.createOscillator();
      const gain1 = customerAudioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.51, now); // E6 Note
      
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.20, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
      
      osc1.connect(gain1);
      gain1.connect(customerAudioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);
      
      setTimeout(() => {
        if (!customerAudioCtx) return;
        const osc2 = customerAudioCtx.createOscillator();
        const gain2 = customerAudioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1760.00, customerAudioCtx.currentTime); // A6 Note
        
        gain2.gain.setValueAtTime(0, customerAudioCtx.currentTime);
        gain2.gain.linearRampToValueAtTime(0.25, customerAudioCtx.currentTime + 0.02);
        gain2.gain.exponentialRampToValueAtTime(0.001, customerAudioCtx.currentTime + 0.60);
        
        osc2.connect(gain2);
        gain2.connect(customerAudioCtx.destination);
        osc2.start(customerAudioCtx.currentTime);
        osc2.stop(customerAudioCtx.currentTime + 0.7);
      }, 100);
      
    } else if (type === 'completed') {
      // Sparkling success arpeggio (C6 -> E6 -> G6 -> C7)
      const notes = [1046.50, 1318.51, 1567.98, 2093.00]; // C6, E6, G6, C7
      notes.forEach((freq, index) => {
        setTimeout(() => {
          if (!customerAudioCtx) return;
          const osc = customerAudioCtx.createOscillator();
          const gain = customerAudioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, customerAudioCtx.currentTime);
          
          gain.gain.setValueAtTime(0, customerAudioCtx.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, customerAudioCtx.currentTime + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, customerAudioCtx.currentTime + 0.50);
          
          osc.connect(gain);
          gain.connect(customerAudioCtx.destination);
          osc.start(customerAudioCtx.currentTime);
          osc.stop(customerAudioCtx.currentTime + 0.6);
        }, index * 85);
      });
    }
  } catch (e) {
    console.warn('Customer audio synthesis blocked or failed.', e);
  }
}

function processRequestUpdate(updatedReq) {
  const idx = activeTableRequests.findIndex(r => r.id === updatedReq.id);
  const oldReq = idx !== -1 ? { ...activeTableRequests[idx] } : null;
  
  if (idx !== -1) {
    activeTableRequests[idx] = updatedReq;
  } else {
    activeTableRequests.unshift(updatedReq);
  }

  // Trigger real-time sound updates if request status changes
  if (oldReq) {
    if (oldReq.status === 'new' && updatedReq.status === 'seen') {
      playCustomerChime('seen');
    } else if (oldReq.status !== 'completed' && updatedReq.status === 'completed') {
      playCustomerChime('completed');
    }
  }

  // If a request is marked seen or completed, schedule its removal from customer view in 5 seconds
  if (updatedReq.status === 'seen' || updatedReq.status === 'completed') {
    setTimeout(() => {
      activeTableRequests = activeTableRequests.filter(r => r.id !== updatedReq.id);
      renderTracker();
    }, 5000);
  }

  renderTracker();
}

function loadActiveRequestsFromStorage() {
  try {
    const raw = localStorage.getItem('grand_cafe_requests');
    const allRequests = raw ? JSON.parse(raw) : [];
    
    // Save old state map for status change comparison
    const oldStatusMap = {};
    activeTableRequests.forEach(req => {
      oldStatusMap[req.id] = req.status;
    });

    // Filter requests for our specific table
    // Keep active ones (new) or very recently responded/completed ones (within 5s ago)
    const fiveSecondsAgo = Date.now() - 5000;
    const newRequests = allRequests.filter(req => {
      if (req.table !== tableNumber) return false;
      if (req.status === 'new') return true;
      const updatedAt = req.seenAt || req.completedAt || req.createdAt;
      return new Date(updatedAt).getTime() > fiveSecondsAgo;
    });

    // Compare new requests with old status map to trigger chimes in fallback mode
    newRequests.forEach(req => {
      const oldStatus = oldStatusMap[req.id];
      if (oldStatus) {
        if (oldStatus === 'new' && req.status === 'seen') {
          playCustomerChime('seen');
        } else if (oldStatus !== 'completed' && req.status === 'completed') {
          playCustomerChime('completed');
        }
      }
    });

    activeTableRequests = newRequests;
    renderTracker();
  } catch(e) {
    console.error('Failed loading storage requests inside customer.', e);
  }
}

// 4. Accordion Toggle for Placeholders Section
function toggleMoreFeatures() {
  const content = document.getElementById('more-features-content');
  const chevron = document.getElementById('chevron-more-features');
  const section = document.getElementById('more-features-section');
  
  if (content.classList.contains('open')) {
    content.classList.remove('open');
    chevron.classList.remove('rotated');
    section.classList.remove('expanded');
  } else {
    content.classList.add('open');
    chevron.classList.add('rotated');
    section.classList.add('expanded');
  }
}

function getRequestLabel(type) {
  switch (type) {
    case 'call_waiter': return 'Call Waiter';
    case 'bring_water': return 'Bring Water';
    case 'ask_bill': return 'Ask for Bill';
    default: return 'Service Call';
  }
}

function renderTracker() {
  const panel = document.getElementById('trackerPanel');
  const list = document.getElementById('trackerList');

  if (activeTableRequests.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  list.innerHTML = '';

  activeTableRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = `tracker-card tracker-${req.status}`;
    
    // Icon
    let icon = '🛎️';
    if (req.type === 'bring_water') icon = '💧';
    if (req.type === 'ask_bill') icon = '💵';

    // Status Texts
    let statusText = 'Waiting for staff response...';
    if (req.status === 'seen') {
      statusText = `☕ <strong>${req.seenBy || 'Staff'}</strong> is coming to serve you!`;
    } else if (req.status === 'completed') {
      statusText = `✨ Request completed. Thank you!`;
    }

    card.innerHTML = `
      <div class="tracker-card-header">
        <div class="tracker-card-title">${icon} ${getRequestLabel(req.type)}</div>
        <div class="tracker-card-time">Active</div>
      </div>
      <div class="tracker-status-line">
        <span class="tracker-status-bullet"></span>
        <span class="tracker-status-text">${statusText}</span>
      </div>
    `;

    list.appendChild(card);
  });
}

// 4. Cooldown Persistent States
function checkActiveCooldowns() {
  const requestTypes = ['call_waiter', 'bring_water', 'ask_bill'];
  const now = Date.now();

  requestTypes.forEach(type => {
    const cooldownEnd = localStorage.getItem(`cooldown_end_${type}`);
    if (cooldownEnd && parseInt(cooldownEnd) > now) {
      const remainingTime = parseInt(cooldownEnd) - now;
      startCooldownTimer(type, remainingTime);
    }
  });
}

function startCooldownTimer(type, duration) {
  const button = document.getElementById(`btn-${type}`);
  const spinner = document.getElementById(`spinner-${type}`);
  const descriptionText = button.querySelector('.btn-texts p');
  const originalDescription = descriptionText.innerText;
  
  button.disabled = true;
  button.classList.add('cooldown-active');
  
  const endTimestamp = Date.now() + duration;
  localStorage.setItem(`cooldown_end_${type}`, endTimestamp);

  const interval = setInterval(() => {
    const now = Date.now();
    const remaining = Math.ceil((endTimestamp - now) / 1000);

    if (remaining <= 0) {
      clearInterval(interval);
      button.disabled = false;
      button.classList.remove('cooldown-active');
      descriptionText.innerText = originalDescription;
      localStorage.removeItem(`cooldown_end_${type}`);
    } else {
      descriptionText.innerText = `Request sent! Re-enabling in ${remaining}s...`;
    }
  }, 1000);
}

// 5. Submit Service Request
function submitServiceRequest(type) {
  // Lazy-initialize and unlock audio context to bypass browser autoplay blocks on user interaction
  try {
    if (!customerAudioCtx) {
      customerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (customerAudioCtx.state === 'suspended') {
      customerAudioCtx.resume();
    }
  } catch (e) {
    console.warn('Audio context unlock failed:', e);
  }

  const cooldownEnd = localStorage.getItem(`cooldown_end_${type}`);
  if (cooldownEnd && parseInt(cooldownEnd) > Date.now()) {
    return;
  }

  if (navigator.vibrate) {
    navigator.vibrate(80);
  }

  const requestData = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    table: tableNumber,
    type: type,
    status: 'new',
    createdAt: new Date().toISOString()
  };

  // Add locally first for instant guest responsiveness
  activeTableRequests.unshift(requestData);
  renderTracker();

  // Transmit Request
  if (socket && socket.connected) {
    socket.emit('request:create', { id: requestData.id, table: tableNumber, type: type });
  } else {
    // Via Broadcast Fallback
    let localRequests = [];
    try {
      localRequests = JSON.parse(localStorage.getItem('grand_cafe_requests')) || [];
    } catch(e) {
      localRequests = [];
    }
    
    localRequests.unshift(requestData);
    localStorage.setItem('grand_cafe_requests', JSON.stringify(localRequests));

    if (broadcastChannel) {
      broadcastChannel.postMessage({
        event: 'request:new',
        data: requestData
      });
    }

    window.dispatchEvent(new Event('storage'));
    showSuccessModal();
  }

  startCooldownTimer(type, COOLDOWN_DURATION_MS);
}

// 6. Modal Visual Triggers
function showSuccessModal(customMessage) {
  const toast = document.getElementById('successToast');
  if (customMessage) {
    document.getElementById('successMessage').innerText = customMessage;
  }
  toast.classList.add('active');
}

function closeSuccessToast() {
  const toast = document.getElementById('successToast');
  toast.classList.remove('active');
}

// 7. Startup Initialization
window.addEventListener('DOMContentLoaded', () => {
  initNetwork();
  checkActiveCooldowns();
  
  // Try loading once on start (safeguard)
  if (!socket || !socket.connected) {
    loadActiveRequestsFromStorage();
    loadMenuFromLocal();
  }
});

// ==========================================================================
// CUSTOMER PORTAL DIGITAL MENU ENGINE
// ==========================================================================

function loadMenuFromLocal() {
  try {
    const raw = localStorage.getItem('grand_cafe_menu_items');
    menuItems = raw ? JSON.parse(raw) : [];
    
    // Check if the cache contains outdated sketch placeholder assets
    const hasSketches = menuItems.some(item => item.imageUrl && item.imageUrl.includes('_sketch.png'));
    if (hasSketches) {
      console.log('🧹 Outdated sketch assets found in cached menu items. Clearing localStorage cache...');
      localStorage.removeItem('grand_cafe_menu_items');
      menuItems = [];
    }
    
    renderCustomerMenu();
  } catch (e) {
    console.error('Failed to parse menu items from storage:', e);
  }
}

function openMenuDrawer() {
  const drawer = document.getElementById('menuDrawer');
  if (drawer) {
    drawer.classList.add('open');
    // Block background scroll when view-only menu drawer is open
    document.body.style.overflow = 'hidden';
    renderCustomerMenu();
  }
}

function closeMenuDrawer() {
  const drawer = document.getElementById('menuDrawer');
  if (drawer) {
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function filterCustomerCategory(category) {
  activeCategory = category;
  
  // Clean active indicator classes off all category pills
  document.querySelectorAll('.cust-category-pill').forEach(pill => {
    pill.classList.remove('active');
  });
  
  // Add active indicator tag back to targeted pill
  let pillId = 'pill-all';
  if (category === 'Hot Coffee') pillId = 'pill-hot-coffee';
  else if (category === 'Iced Coffee') pillId = 'pill-iced-coffee';
  else if (category === 'Matcha') pillId = 'pill-matcha';
  else if (category === 'Iced Tea') pillId = 'pill-iced-tea';
  else if (category === 'Milkshakes') pillId = 'pill-milkshakes';
  else if (category === 'Mojitos') pillId = 'pill-mojitos';
  else if (category === 'Lemonades') pillId = 'pill-lemonades';
  else if (category === 'Hot Chocolate') pillId = 'pill-hot-chocolate';
  
  const activePill = document.getElementById(pillId);
  if (activePill) activePill.classList.add('active');
  
  renderCustomerMenu();
}

const categoryDetails = {
  'all': {
    title: '✨ Premium Selection',
    desc: 'Indulge in our curated selection of hot and cold beverages, crafted by artisan baristas for a luxurious café experience.',
    sketch: 'assets/images/hot_coffee_premium.png'
  },
  'Hot Coffee': {
    title: '☕ Hot Coffee',
    desc: 'Bold, rich, and aromatic espresso recipes balanced perfectly with textured milk for a velvety finish.',
    sketch: 'assets/images/hot_coffee_premium.png'
  },
  'Iced Coffee': {
    title: '🧊 Chilled Coffee',
    desc: 'Sweet, smooth, and refreshing espresso infusions poured cold over ice for a sophisticated cool-down.',
    sketch: 'assets/images/iced_coffee_premium.png'
  },
  'Matcha': {
    title: '🍵 Whisked Matcha',
    desc: 'Shade-grown, organic Japanese green tea, stone-ground and whisked with velvety steamed or iced milk.',
    sketch: 'assets/images/matcha_premium.png'
  },
  'Iced Tea': {
    title: '🍹 Infused Iced Tea',
    desc: 'Artisanal loose-leaf teas cold-brewed and shaken with fresh citrus, sweet herbs, and ice for maximum energy.',
    sketch: 'assets/images/iced_tea_premium.png'
  },
  'Milkshakes': {
    title: '🥤 Dessert Shakes',
    desc: 'Decadent, creamy milkshakes blended with house-made syrups, topped with fresh whipped cream and a cherry.',
    sketch: 'assets/images/milkshake_premium.png'
  },
  'Mojitos': {
    title: '🌱 Sparkling Mojitos',
    desc: 'Refreshing tall coolers crafted with muddled fresh garden mint, tart lime wedges, and sparkling sodas.',
    sketch: 'assets/images/mojito_premium.png'
  },
  'Lemonades': {
    title: '🍋 Crafted Lemonades',
    desc: 'Zesty, fresh-squeezed citrus concoctions and special cream combinations blended ice-cold for absolute purity.',
    sketch: 'assets/images/brazilian_lemonade.png'
  },
  'Hot Chocolate': {
    title: '🍫 Steaming Cocoa',
    desc: 'Gourmet melted Belgian chocolates blended into warm, creamy milk, topped with toasted mini marshmallows.',
    sketch: 'assets/images/hot_chocolate_premium.png'
  }
};

function getCategorySketch(category) {
  switch (category) {
    case 'Hot Coffee': return 'assets/images/hot_coffee_premium.png';
    case 'Iced Coffee': return 'assets/images/iced_coffee_premium.png';
    case 'Matcha': return 'assets/images/matcha_premium.png';
    case 'Iced Tea': return 'assets/images/iced_tea_premium.png';
    case 'Milkshakes': return 'assets/images/milkshake_premium.png';
    case 'Mojitos': return 'assets/images/mojito_premium.png';
    case 'Lemonades': return 'assets/images/brazilian_lemonade.png';
    case 'Hot Chocolate': return 'assets/images/hot_chocolate_premium.png';
    default: return 'assets/images/hot_coffee_premium.png';
  }
}

function renderCustomerMenu() {
  const grid = document.getElementById('customerMenuGrid');
  if (!grid) return;
  
  // Dynamically update the showcase hero image and text
  const heroCard = document.getElementById('menuHeroCard');
  if (heroCard) {
    const details = categoryDetails[activeCategory] || categoryDetails['all'];
    heroCard.innerHTML = `
      <div class="menu-hero-img-container" style="background-image: url('${details.sketch}');"></div>
      <div class="menu-hero-text-container">
        <h3>${details.title}</h3>
        <p>${details.desc}</p>
      </div>
    `;
  }
  
  grid.innerHTML = '';
  
  const searchVal = document.getElementById('cust-menu-search').value.trim().toLowerCase();
  
  // Perform search and category filtering
  const filtered = menuItems.filter(item => {
    // Filter by Category
    if (activeCategory !== 'all' && item.category !== activeCategory) return false;
    
    // Filter by Search text match
    if (searchVal) {
      const matchName = item.name.toLowerCase().includes(searchVal);
      const matchDesc = (item.description || '').toLowerCase().includes(searchVal);
      const matchCategory = item.category.toLowerCase().includes(searchVal);
      if (!matchName && !matchDesc && !matchCategory) return false;
    }
    return true;
  });
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; opacity: 0.5; padding: 3rem 1rem; color: var(--color-cream-dim);">
        <p>No delicious beverages found matching your search.</p>
      </div>
    `;
    return;
  }
  
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = `menu-item-card ${item.isAvailable === false ? 'sold-out' : ''}`;
    
    // Premium gold signature badge highlight tag
    const sigBadge = item.isSignature ? `<div class="menu-item-sig-badge">✨ Signature</div>` : '';
    
    // Elegant sold out overlay
    const soldOutOverlay = item.isAvailable === false ? `<div class="menu-item-soldout-overlay"><span>Sold Out</span></div>` : '';
    
    // Get warm charcoal/sepia sketch based on category
    const sketchPath = getCategorySketch(item.category);
    
    // Format price
    const priceFormatted = typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : `$${item.price}`;
    
    card.innerHTML = `
      <div class="menu-item-img-wrapper" style="background-image: url('${item.imageUrl || sketchPath}');">
        ${sigBadge}
        ${soldOutOverlay}
      </div>
      <div class="menu-item-info">
        <div class="menu-item-header">
          <h4 class="menu-item-title">${item.name}</h4>
          <span class="menu-item-price">${priceFormatted}</span>
        </div>
        <p class="menu-item-desc">${item.description || 'Crafted with premium ingredients for an exquisite, luxurious taste.'}</p>
        <div class="menu-item-meta">
          <span class="menu-item-category-tag">${item.category}</span>
        </div>
      </div>
    `;
    
    grid.appendChild(card);
  });
}
