const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

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

// MongoDB Schemas and Models
const staffSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  pin: { type: String, required: true },
  role: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const serviceRequestSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  table: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, required: true, enum: ['new', 'seen', 'completed'] },
  createdAt: { type: Date, required: true },
  seenAt: { type: Date },
  seenBy: { type: String },
  completedAt: { type: Date }
});

const Staff = mongoose.model('Staff', staffSchema);
const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);

// In-memory volatile fallbacks
let serviceRequests = [];
let staffRoster = [
  { username: 'Admin', pin: '4450', role: 'admin' }
];

let isMongoConnected = false;

function isDbConnected() {
  return isMongoConnected && mongoose.connection && mongoose.connection.readyState === 1;
}

// Seed admin helper for MongoDB
async function seedAdminUser() {
  try {
    const adminExists = await Staff.findOne({ username: 'Admin' });
    if (!adminExists) {
      const defaultAdmin = new Staff({
        username: 'Admin',
        pin: '4450',
        role: 'admin'
      });
      await defaultAdmin.save();
      console.log('👑 Default Admin user seeded successfully in MongoDB.');
    }
  } catch (err) {
    console.error('Error seeding default Admin user:', err);
  }
}

// Database Connection
const mongoUri = process.env.MONGODB_URI;
if (mongoUri) {
  console.log('Connecting to MongoDB Atlas...');
  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('✅ Connected to MongoDB Atlas successfully.');
      isMongoConnected = true;
      await seedAdminUser();
    })
    .catch((err) => {
      console.error('❌ Failed to connect to MongoDB Atlas. Falling back to volatile in-memory storage.', err);
      isMongoConnected = false;
    });
} else {
  console.log('⚠️ WARNING: MONGODB_URI is not defined. Falling back to volatile in-memory storage.');
  isMongoConnected = false;
}

// Helpers for fallback handling
async function getRequests() {
  if (isDbConnected()) {
    try {
      const docs = await ServiceRequest.find().sort({ createdAt: -1 });
      return docs.map(doc => ({
        id: doc.id,
        table: doc.table,
        type: doc.type,
        status: doc.status,
        createdAt: doc.createdAt.toISOString(),
        seenAt: doc.seenAt ? doc.seenAt.toISOString() : undefined,
        seenBy: doc.seenBy,
        completedAt: doc.completedAt ? doc.completedAt.toISOString() : undefined
      }));
    } catch (err) {
      console.error('Error fetching requests from MongoDB, using memory fallback:', err);
    }
  }
  return serviceRequests;
}

async function getStaff() {
  if (isDbConnected()) {
    try {
      const docs = await Staff.find().sort({ createdAt: 1 });
      return docs.map(doc => ({
        username: doc.username,
        pin: doc.pin,
        role: doc.role
      }));
    } catch (err) {
      console.error('Error fetching staff from MongoDB, using memory fallback:', err);
    }
  }
  return staffRoster;
}

// Clean up old completed requests (older than 2 hours) to avoid memory growth
setInterval(async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  if (isDbConnected()) {
    try {
      const result = await ServiceRequest.deleteMany({
        status: 'completed',
        createdAt: { $lt: twoHoursAgo }
      });
      if (result.deletedCount > 0) {
        console.log(`Auto-cleaned ${result.deletedCount} old completed requests from MongoDB.`);
      }
    } catch (err) {
      console.error('Error auto-cleaning completed requests in MongoDB:', err);
    }
  }

  // Always clean up in-memory store in case of fallback or switch
  serviceRequests = serviceRequests.filter(req => {
    if (req.status === 'completed') {
      return new Date(req.createdAt).getTime() > twoHoursAgo.getTime();
    }
    return true;
  });
}, 15 * 60 * 1000); // Run every 15 minutes

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // When a dashboard connects, immediately send all active requests
  socket.on('dashboard:init', async () => {
    socket.join('dashboard-room');
    const reqs = await getRequests();
    const staff = await getStaff();
    socket.emit('request:list', reqs);
    socket.emit('staff:list', staff);
    console.log(`Dashboard joined room and received request list: ${reqs.length} requests`);
  });

  // When a customer makes a service request
  socket.on('request:create', async (data) => {
    const { table, type } = data;
    
    if (!table || !type) {
      socket.emit('request:error', { message: 'Table number and request type are required.' });
      return;
    }

    // Anti-spam verification on server-side
    // Check if the same table has made the exact same request in the last 30 seconds
    let isSpam = false;
    const thirtySecondsAgo = Date.now() - 30 * 1000;

    if (isDbConnected()) {
      try {
        const spamCheck = await ServiceRequest.findOne({
          table: String(table),
          type: type,
          status: { $ne: 'completed' },
          createdAt: { $gt: new Date(thirtySecondsAgo) }
        });
        isSpam = !!spamCheck;
      } catch (err) {
        console.error('Error during MongoDB spam check, using memory check:', err);
        isSpam = serviceRequests.some(req => 
          req.table === table && 
          req.type === type && 
          req.status !== 'completed' &&
          new Date(req.createdAt).getTime() > thirtySecondsAgo
        );
      }
    } else {
      isSpam = serviceRequests.some(req => 
        req.table === table && 
        req.type === type && 
        req.status !== 'completed' &&
        new Date(req.createdAt).getTime() > thirtySecondsAgo
      );
    }

    if (isSpam) {
      socket.emit('request:error', { message: 'Request already sent. Please wait before submitting again.' });
      return;
    }

    const requestId = data.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const nowStr = new Date().toISOString();

    let newRequestObj = null;

    if (isDbConnected()) {
      try {
        const newReq = new ServiceRequest({
          id: requestId,
          table: String(table),
          type: type,
          status: 'new',
          createdAt: new Date()
        });
        const savedReq = await newReq.save();
        newRequestObj = {
          id: savedReq.id,
          table: savedReq.table,
          type: savedReq.type,
          status: savedReq.status,
          createdAt: savedReq.createdAt.toISOString()
        };
      } catch (err) {
        console.error('Error saving request to MongoDB, falling back to memory:', err);
      }
    }

    if (!newRequestObj) {
      newRequestObj = {
        id: requestId,
        table: String(table),
        type: type,
        status: 'new',
        createdAt: nowStr
      };
      serviceRequests.unshift(newRequestObj);
    }

    console.log(`New request created:`, newRequestObj);

    // Broadcast to all dashboard listeners
    io.to('dashboard-room').emit('request:new', newRequestObj);
    
    // Acknowledge to customer client
    socket.emit('request:success', { id: newRequestObj.id, message: 'Your request has been sent successfully.' });
  });

  // When a staff member updates a request status (new -> seen -> completed)
  socket.on('request:update_status', async (data) => {
    const { id, status, seenBy } = data;
    
    if (!id || !['new', 'seen', 'completed'].includes(status)) {
      console.log(`Invalid update request:`, data);
      return;
    }

    let updatedReqObj = null;

    if (isDbConnected()) {
      try {
        const reqDoc = await ServiceRequest.findOne({ id: id });
        if (reqDoc) {
          const now = new Date();
          reqDoc.status = status;
          if (status === 'seen') {
            reqDoc.seenAt = now;
            if (seenBy) reqDoc.seenBy = seenBy;
          } else if (status === 'completed') {
            reqDoc.completedAt = now;
            if (!reqDoc.seenAt) {
              reqDoc.seenAt = now;
              if (seenBy) reqDoc.seenBy = seenBy;
            }
          }
          const savedDoc = await reqDoc.save();
          updatedReqObj = {
            id: savedDoc.id,
            table: savedDoc.table,
            type: savedDoc.type,
            status: savedDoc.status,
            createdAt: savedDoc.createdAt.toISOString(),
            seenAt: savedDoc.seenAt ? savedDoc.seenAt.toISOString() : undefined,
            seenBy: savedDoc.seenBy,
            completedAt: savedDoc.completedAt ? savedDoc.completedAt.toISOString() : undefined
          };
          console.log(`Request ${id} status updated to: ${status} by ${savedDoc.seenBy || 'System'} (MongoDB)`);
        }
      } catch (err) {
        console.error('Error updating request status in MongoDB:', err);
      }
    }

    if (!updatedReqObj) {
      const requestIndex = serviceRequests.findIndex(req => req.id === id);
      if (requestIndex !== -1) {
        const now = new Date().toISOString();
        serviceRequests[requestIndex].status = status;
        
        if (status === 'seen') {
          serviceRequests[requestIndex].seenAt = now;
          if (seenBy) serviceRequests[requestIndex].seenBy = seenBy;
        } else if (status === 'completed') {
          serviceRequests[requestIndex].completedAt = now;
          if (!serviceRequests[requestIndex].seenAt) {
            serviceRequests[requestIndex].seenAt = now;
            if (seenBy) serviceRequests[requestIndex].seenBy = seenBy;
          }
        }
        updatedReqObj = serviceRequests[requestIndex];
        console.log(`Request ${id} status updated to: ${status} by ${updatedReqObj.seenBy || 'System'} (Memory)`);
      }
    }

    if (updatedReqObj) {
      // Broadcast update to all connected clients (dashboards and customers)
      io.emit('request:updated', updatedReqObj);
    }
  });

  // Admin capability: clear all completed requests from the active dashboard
  socket.on('request:clear_completed', async () => {
    let clearedCount = 0;
    if (isDbConnected()) {
      try {
        const result = await ServiceRequest.deleteMany({ status: 'completed' });
        clearedCount = result.deletedCount;
        console.log(`Cleared ${clearedCount} completed requests from MongoDB.`);
      } catch (err) {
        console.error('Error clearing completed requests from MongoDB:', err);
      }
    } else {
      const originalCount = serviceRequests.length;
      serviceRequests = serviceRequests.filter(req => req.status !== 'completed');
      clearedCount = originalCount - serviceRequests.length;
      console.log(`Cleared ${clearedCount} completed requests from Memory.`);
    }

    const currentRequests = await getRequests();
    // Broadcast refreshed list to dashboards
    io.to('dashboard-room').emit('request:list', currentRequests);
  });

  // Admin capability: create new staff profile and sync globally
  socket.on('staff:create', async (newStaff) => {
    const { username, pin, role } = newStaff;
    if (!username || !pin || !role) return;

    const name = username.trim();
    const pinStr = pin.trim();

    if (!/^\d{4}$/.test(pinStr)) {
      socket.emit('staff:error', { message: 'Passcode PIN must be exactly 4 digits.' });
      return;
    }

    let isDuplicate = false;
    if (isDbConnected()) {
      try {
        const dup = await Staff.findOne({ username: { $regex: new RegExp(`^${name}$`, 'i') } });
        isDuplicate = !!dup;
      } catch (err) {
        console.error('Error during MongoDB duplicate check:', err);
        isDuplicate = staffRoster.some(s => s.username.toLowerCase() === name.toLowerCase());
      }
    } else {
      isDuplicate = staffRoster.some(s => s.username.toLowerCase() === name.toLowerCase());
    }

    if (isDuplicate) {
      socket.emit('staff:error', { message: 'A staff member with this name already exists.' });
      return;
    }

    let savedStaff = null;
    if (isDbConnected()) {
      try {
        const newStaffDoc = new Staff({
          username: name,
          pin: pinStr,
          role: role
        });
        const savedDoc = await newStaffDoc.save();
        savedStaff = {
          username: savedDoc.username,
          pin: savedDoc.pin,
          role: savedDoc.role
        };
        console.log(`Staff registered on MongoDB: ${name} (${role})`);
      } catch (err) {
        console.error('Error saving staff to MongoDB, using memory fallback:', err);
      }
    }

    if (!savedStaff) {
      savedStaff = { username: name, pin: pinStr, role: role };
      staffRoster.push(savedStaff);
      console.log(`Staff registered on Memory: ${name} (${role})`);
    }

    const currentStaff = await getStaff();
    // Broadcast refreshed list to all dashboards
    io.to('dashboard-room').emit('staff:list', currentStaff);
  });

  // Admin capability: delete staff profile and sync globally
  socket.on('staff:delete', async (username) => {
    if (username === 'Admin') {
      socket.emit('staff:error', { message: 'Primary Admin cannot be deleted.' });
      return;
    }

    if (isDbConnected()) {
      try {
        const res = await Staff.deleteOne({ username: username });
        console.log(`Deleted staff ${username} from MongoDB: deletedCount=${res.deletedCount}`);
      } catch (err) {
        console.error('Error deleting staff from MongoDB:', err);
      }
    } else {
      staffRoster = staffRoster.filter(s => s.username !== username);
      console.log(`Staff deleted on Memory: ${username}`);
    }

    const currentStaff = await getStaff();
    // Broadcast refreshed list to all dashboards
    io.to('dashboard-room').emit('staff:list', currentStaff);
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
