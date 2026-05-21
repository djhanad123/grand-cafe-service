const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the root directory
app.use(express.static(__dirname));

// In-memory data store for service requests
// A request object structure:
// {
//   id: string (timestamp + random),
//   table: string,
//   type: 'call_waiter' | 'bring_water' | 'ask_bill',
//   status: 'new' | 'seen' | 'completed',
//   createdAt: string (ISO timestamp)
// }
let serviceRequests = [];

// Clean up old completed requests (older than 2 hours) to avoid memory growth
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  serviceRequests = serviceRequests.filter(req => {
    if (req.status === 'completed') {
      return new Date(req.createdAt).getTime() > twoHoursAgo;
    }
    return true;
  });
}, 15 * 60 * 1000); // Run every 15 minutes

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // When a dashboard connects, immediately send all active requests
  socket.on('dashboard:init', () => {
    socket.join('dashboard-room');
    socket.emit('request:list', serviceRequests);
    console.log(`Dashboard joined room and received request list: ${serviceRequests.length} requests`);
  });

  // When a customer makes a service request
  socket.on('request:create', (data) => {
    const { table, type } = data;
    
    if (!table || !type) {
      socket.emit('request:error', { message: 'Table number and request type are required.' });
      return;
    }

    // Anti-spam verification on server-side
    // Check if the same table has made the exact same request in the last 30 seconds
    const thirtySecondsAgo = Date.now() - 30 * 1000;
    const isSpam = serviceRequests.some(req => 
      req.table === table && 
      req.type === type && 
      req.status !== 'completed' &&
      new Date(req.createdAt).getTime() > thirtySecondsAgo
    );

    if (isSpam) {
      socket.emit('request:error', { message: 'Request already sent. Please wait before submitting again.' });
      return;
    }

    const newRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      table: String(table),
      type: type,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    serviceRequests.unshift(newRequest); // Add to the beginning of the list
    console.log(`New request created:`, newRequest);

    // Broadcast to all dashboard listeners
    io.to('dashboard-room').emit('request:new', newRequest);
    
    // Acknowledge to customer client
    socket.emit('request:success', { id: newRequest.id, message: 'Your request has been sent successfully.' });
  });

  // When a staff member updates a request status (new -> seen -> completed)
  socket.on('request:update_status', (data) => {
    const { id, status, seenBy } = data;
    
    if (!id || !['new', 'seen', 'completed'].includes(status)) {
      console.log(`Invalid update request:`, data);
      return;
    }

    const requestIndex = serviceRequests.findIndex(req => req.id === id);
    
    if (requestIndex !== -1) {
      const now = new Date().toISOString();
      serviceRequests[requestIndex].status = status;
      
      if (status === 'seen') {
        serviceRequests[requestIndex].seenAt = now;
        if (seenBy) {
          serviceRequests[requestIndex].seenBy = seenBy;
        }
      } else if (status === 'completed') {
        serviceRequests[requestIndex].completedAt = now;
        if (!serviceRequests[requestIndex].seenAt) {
          serviceRequests[requestIndex].seenAt = now;
          if (seenBy) {
            serviceRequests[requestIndex].seenBy = seenBy;
          }
        }
      }

      console.log(`Request ${id} status updated to: ${status} by ${serviceRequests[requestIndex].seenBy || 'System'}`);

      // Broadcast update to all connected clients (dashboards and customers)
      io.emit('request:updated', serviceRequests[requestIndex]);
    }
  });

  // Admin capability: clear all completed requests from the active dashboard
  socket.on('request:clear_completed', () => {
    const originalCount = serviceRequests.length;
    serviceRequests = serviceRequests.filter(req => req.status !== 'completed');
    const clearedCount = originalCount - serviceRequests.length;
    console.log(`Cleared ${clearedCount} completed requests.`);
    
    // Broadcast refreshed list to dashboards
    io.to('dashboard-room').emit('request:list', serviceRequests);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Serve index page or redirect to customer view
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'customer.html'));
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`☕ Grand Café Customer Service Web App Is Running!`);
  console.log(`   - Local Server: http://localhost:${PORT}`);
  console.log(`   - Customer Mobile View: http://localhost:${PORT}/customer.html?table=12`);
  console.log(`   - Staff Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`==================================================`);
});
