const fs = require('fs');
const path = require('path');

// Zero-dependency local .env file loader for seamless multi-computer setup
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      
      const matched = trimmed.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (matched) {
        const key = matched[1];
        let value = matched[2] || '';
        // Strip quotes if present
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1);
        } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value.trim();
      }
    });
    console.log('✅ Local .env configuration loaded successfully.');
  }
} catch (e) {
  console.warn('⚠️ Warning: Failed to parse local .env file:', e.message);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
  completedAt: { type: Date },
  clearedFromBoard: { type: Boolean, default: false } // Soft-clear for live board request visibility
});

const tableSchema = new mongoose.Schema({
  number: { type: Number, unique: true, required: true },
  createdAt: { type: Date, default: Date.now }
});

const menuItemSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  category: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  imageUrl: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  isSignature: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Staff = mongoose.model('Staff', staffSchema);
const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);
const Table = mongoose.model('Table', tableSchema);
const MenuItem = mongoose.model('MenuItem', menuItemSchema);

// Suggested menu items seed list
const defaultMenuItems = [
  // Hot Coffee
  { name: 'Espresso', category: 'Hot Coffee', description: 'Pure, concentrated coffee with a rich finish.', price: 3.50, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Americano', category: 'Hot Coffee', description: 'Bold espresso softened with hot water.', price: 4.00, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Cappuccino', category: 'Hot Coffee', description: 'Espresso with steamed milk and a thick milk foam crown.', price: 4.50, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Café Latte', category: 'Hot Coffee', description: 'Smooth espresso blended with creamy steamed milk.', price: 4.50, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Flat White', category: 'Hot Coffee', description: 'Strong espresso with silky milk and a light texture.', price: 4.75, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Cortado', category: 'Hot Coffee', description: 'A balanced espresso cut with just enough warm milk.', price: 4.25, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Mocha Latte', category: 'Hot Coffee', description: 'Espresso with chocolate and milk for a smooth, rich taste.', price: 5.00, imageUrl: 'assets/images/hot_coffee_premium.png', isSignature: false },
  { name: 'Spanish Latte', category: 'Hot Coffee', description: 'Espresso sweetened with condensed milk and creamy milk.', price: 5.25, imageUrl: 'assets/images/spanish_latte.png', isSignature: true },
  
  // Iced Coffee
  { name: 'Iced Latte', category: 'Iced Coffee', description: 'Chilled espresso with cold milk over ice.', price: 4.75, imageUrl: 'assets/images/iced_coffee_premium.png', isSignature: false },
  { name: 'Iced Spanish Latte', category: 'Iced Coffee', description: 'Sweet condensed milk, espresso, and cold milk over ice.', price: 5.50, imageUrl: 'assets/images/iced_spanish_latte.png', isSignature: true },
  { name: 'Iced Mocha', category: 'Iced Coffee', description: 'Cold espresso with chocolate and milk for a smooth finish.', price: 5.25, imageUrl: 'assets/images/iced_coffee_premium.png', isSignature: false },
  { name: 'Iced Americano', category: 'Iced Coffee', description: 'Strong espresso cooled with water and ice.', price: 4.25, imageUrl: 'assets/images/iced_coffee_premium.png', isSignature: false },
  
  // Matcha
  { name: 'Hot Matcha Latte', category: 'Matcha', description: 'Smooth matcha whisked with steamed milk.', price: 5.00, imageUrl: 'assets/images/matcha_premium.png', isSignature: false },
  { name: 'Cold Matcha Latte', category: 'Matcha', description: 'Refreshing matcha with milk served over ice.', price: 5.25, imageUrl: 'assets/images/matcha_premium.png', isSignature: false },
  { name: 'Flavored Matcha Latte', category: 'Matcha', description: 'Classic matcha finished with a soft syrup twist.', price: 5.50, imageUrl: 'assets/images/matcha_premium.png', isSignature: false },
  
  // Iced Tea
  { name: 'Blueberry Iced Tea', category: 'Iced Tea', description: 'Fruity tea with a bright blueberry finish.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Raspberry Iced Tea', category: 'Iced Tea', description: 'Fresh tea with a sweet raspberry touch.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Mango Iced Tea', category: 'Iced Tea', description: 'Tropical mango flavor blended into chilled tea.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Peach Iced Tea', category: 'Iced Tea', description: 'Soft peach sweetness with a refreshing tea base.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Grape Iced Tea', category: 'Iced Tea', description: 'Smooth grape flavor layered into cold tea.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Pineapple Iced Tea', category: 'Iced Tea', description: 'Bright pineapple notes with a refreshing lift.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Strawberry Iced Tea', category: 'Iced Tea', description: 'Sweet strawberry flavor with chilled tea.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Passion Iced Tea', category: 'Iced Tea', description: 'Tropical passion fruit with a crisp tea finish.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  { name: 'Kiwi Iced Tea', category: 'Iced Tea', description: 'Fresh kiwi flavor with a light citrus edge.', price: 4.75, imageUrl: 'assets/images/iced_tea_premium.png', isSignature: false },
  
  // Milkshakes
  { name: 'Vanilla Shake', category: 'Milkshakes', description: 'Classic creamy vanilla with a smooth texture.', price: 6.00, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Strawberry Shake', category: 'Milkshakes', description: 'Sweet strawberry blended into a rich shake.', price: 6.00, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Mango Shake', category: 'Milkshakes', description: 'Tropical mango flavor with a creamy finish.', price: 6.00, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Banana Shake', category: 'Milkshakes', description: 'Smooth banana blended with vanilla ice cream.', price: 6.00, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Blueberry Shake', category: 'Milkshakes', description: 'Rich blueberry flavor with a cool creamy body.', price: 6.25, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Chocolate Shake', category: 'Milkshakes', description: 'A thick, classic chocolate milkshake.', price: 6.00, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Caramel Shake', category: 'Milkshakes', description: 'Sweet caramel blended into a creamy shake.', price: 6.25, imageUrl: 'assets/images/milkshake_premium.png', isSignature: false },
  { name: 'Lotus Shake', category: 'Milkshakes', description: 'Creamy shake with the signature Lotus biscuit flavor.', price: 6.50, imageUrl: 'assets/images/lotus_shake.png', isSignature: true },
  { name: 'Oreo Shake', category: 'Milkshakes', description: 'Rich milkshake blended with crushed Oreo biscuits.', price: 6.50, imageUrl: 'assets/images/oreo_shake.png', isSignature: true },
  
  // Mojitos
  { name: 'Strawberry Mojito', category: 'Mojitos', description: 'Fresh mint and strawberry with a sparkling finish.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Blueberry Mojito', category: 'Mojitos', description: 'Blueberry flavor lifted with mint and soda.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Mango Mojito', category: 'Mojitos', description: 'Tropical mango with refreshing mint and fizz.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Kiwi Mojito', category: 'Mojitos', description: 'Bright kiwi flavor with a crisp mint finish.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Passion Mojito', category: 'Mojitos', description: 'Sweet passion fruit with refreshing sparkle.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Raspberry Mojito', category: 'Mojitos', description: 'Fruity raspberry balanced with mint and soda.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Green Apple Mojito', category: 'Mojitos', description: 'Crisp green apple with a fresh citrus lift.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Pineapple Mojito', category: 'Mojitos', description: 'Tropical pineapple with a bright, refreshing edge.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Grape Mojito', category: 'Mojitos', description: 'Sweet grape flavor with a cool fizzy finish.', price: 5.75, imageUrl: 'assets/images/mojito_premium.png', isSignature: false },
  { name: 'Indian Ocean Mojito', category: 'Mojitos', description: 'Signature blue curaçao mojito with a tropical feel.', price: 6.25, imageUrl: 'assets/images/indian_ocean_mojito.png', isSignature: true },
  
  // Lemonades
  { name: 'Brazilian Lemonade', category: 'Lemonades', description: 'Creamy lime lemonade with a smooth sweet finish.', price: 5.50, imageUrl: 'assets/images/brazilian_lemonade.png', isSignature: true },
  { name: 'Hibiscus Lemonade', category: 'Lemonades', description: 'Bright hibiscus tea lemonade with a floral touch.', price: 5.50, imageUrl: 'assets/images/hibiscus_lemonade.png', isSignature: true },
  
  // Hot Chocolate
  { name: 'Classic Hot Chocolate', category: 'Hot Chocolate', description: 'Rich chocolate drink with a smooth, warm body.', price: 4.50, imageUrl: 'assets/images/hot_chocolate_premium.png', isSignature: false },
  { name: 'Oreo Hot Chocolate', category: 'Hot Chocolate', description: 'Classic hot chocolate finished with Oreo flavor.', price: 5.00, imageUrl: 'assets/images/hot_chocolate_premium.png', isSignature: false },
  { name: 'Caramel Hot Chocolate', category: 'Hot Chocolate', description: 'Warm chocolate with a soft caramel sweetness.', price: 5.00, imageUrl: 'assets/images/hot_chocolate_premium.png', isSignature: false },
  { name: 'Hazelnut Hot Chocolate', category: 'Hot Chocolate', description: 'Chocolate blended with a roasted hazelnut note.', price: 5.00, imageUrl: 'assets/images/hot_chocolate_premium.png', isSignature: false }
];

// In-memory volatile fallbacks
let serviceRequests = [];
let staffRoster = [
  { username: 'Admin', pin: '4450', role: 'admin' }
];
let generatedTables = [
  { number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }, { number: 5 }
];
let menuItems = [...defaultMenuItems]; // Pre-populate in-memory menu fallback with our signature recipes!

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

// Seed tables helper for MongoDB
async function seedDefaultTables() {
  try {
    const count = await Table.countDocuments();
    if (count === 0) {
      const defaultNumbers = [1, 2, 3, 4, 5];
      const docs = defaultNumbers.map(n => ({ number: n }));
      await Table.insertMany(docs);
      console.log('📋 Default Table QR codes (1 to 5) seeded in MongoDB.');
    }
  } catch (err) {
    console.error('Error seeding default tables:', err);
  }
}

// Seed menu items helper for MongoDB
async function seedMenuItems() {
  try {
    const count = await MenuItem.countDocuments();
    if (count === 0) {
      await MenuItem.insertMany(defaultMenuItems);
      console.log(`🍵 Default Menu items seeded successfully in MongoDB (Loaded ${defaultMenuItems.length} premium beverages).`);
    } else {
      // Auto-update check: update image URLs of default menu items to match our new premium paths
      console.log('🔄 Existing menu items found in MongoDB. Checking and upgrading image assets...');
      let updatedCount = 0;
      for (const item of defaultMenuItems) {
        // If the item exists and its imageUrl still points to an old sketch placeholder, update it!
        const result = await MenuItem.updateOne(
          { name: item.name, imageUrl: { $regex: /_sketch\.png$/ } },
          { $set: { imageUrl: item.imageUrl } }
        );
        if (result.modifiedCount > 0) {
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`✅ Seamlessly upgraded ${updatedCount} menu item assets to new premium paths in MongoDB.`);
      } else {
        console.log('✨ All MongoDB menu item image assets are already up-to-date.');
      }
    }
  } catch (err) {
    console.error('Error seeding/upgrading default menu items:', err);
  }
}

// Database Connection Options with strict timeouts
const mongooseOptions = {
  serverSelectionTimeoutMS: 15000, // Timeout after 15s to be safe
  socketTimeoutMS: 45000,
  family: 4, // Force IPv4 to bypass the Node.js 18+ DNS SRV resolution issue with MongoDB Atlas
};

const mongoUri = process.env.MONGODB_URI;
if (mongoUri) {
  console.log('Connecting to MongoDB Atlas...');
  mongoose.connect(mongoUri, mongooseOptions)
    .then(async () => {
      console.log('✅ Connected to MongoDB Atlas successfully.');
      isMongoConnected = true;
      await seedAdminUser();
      await seedDefaultTables();
      await seedMenuItems();
    })
    .catch((err) => {
      console.error('❌ Failed to connect to MongoDB Atlas. Falling back to volatile in-memory storage:', err.message);
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
        completedAt: doc.completedAt ? doc.completedAt.toISOString() : undefined,
        clearedFromBoard: doc.clearedFromBoard || false
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

async function getMenuItems() {
  if (isDbConnected()) {
    try {
      const docs = await MenuItem.find().sort({ createdAt: 1 });
      return docs.map(doc => ({
        name: doc.name,
        category: doc.category,
        description: doc.description,
        price: doc.price,
        imageUrl: doc.imageUrl,
        isAvailable: doc.isAvailable !== false,
        isSignature: doc.isSignature === true
      }));
    } catch (err) {
      console.error('Error fetching menu items from MongoDB, using memory fallback:', err);
    }
  }
  return menuItems;
}

async function getTables() {
  if (isDbConnected()) {
    try {
      const docs = await Table.find().sort({ number: 1 });
      return docs.map(doc => ({ number: doc.number }));
    } catch (err) {
      console.error('Error fetching tables from MongoDB, using memory fallback:', err);
    }
  }
  return generatedTables;
}

// Clean up old completed requests (older than 24 hours) to avoid memory growth and store history for one day
setInterval(async () => {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (isDbConnected()) {
    try {
      const result = await ServiceRequest.deleteMany({
        status: 'completed',
        createdAt: { $lt: twentyFourHoursAgo }
      });
      if (result.deletedCount > 0) {
        console.log(`Auto-cleaned ${result.deletedCount} completed requests older than 24 hours from MongoDB.`);
      }
    } catch (err) {
      console.error('Error auto-cleaning completed requests in MongoDB:', err);
    }
  }

  // Always clean up in-memory store in case of fallback or switch
  serviceRequests = serviceRequests.filter(req => {
    if (req.status === 'completed') {
      return new Date(req.createdAt).getTime() > twentyFourHoursAgo.getTime();
    }
    return true;
  });
}, 15 * 60 * 1000); // Run every 15 minutes

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Emit dynamic database connectivity status immediately
  socket.emit('db:status', { isConnected: isDbConnected() });

  // Send menu list on connection so customer and staff both get it instantly
  (async () => {
    try {
      const menu = await getMenuItems();
      socket.emit('menu:list', menu);
    } catch(e) {
      console.error('Error emitting menu on connection:', e);
    }
  })();

  // When a dashboard connects, immediately send all active requests
  socket.on('dashboard:init', async () => {
    socket.join('dashboard-room');
    const reqs = await getRequests();
    const staff = await getStaff();
    const tables = await getTables();
    const menu = await getMenuItems();
    socket.emit('request:list', reqs);
    socket.emit('staff:list', staff);
    socket.emit('table:list', tables);
    socket.emit('menu:list', menu);
    console.log(`Dashboard joined room: requests=${reqs.length}, staff=${staff.length}, tables=${tables.length}, menu=${menu.length}`);
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

  // Admin capability: clear all completed requests from the active dashboard (soft-clear)
  socket.on('request:clear_completed', async () => {
    let clearedCount = 0;
    if (isDbConnected()) {
      try {
        const result = await ServiceRequest.updateMany(
          { status: 'completed', clearedFromBoard: false },
          { $set: { clearedFromBoard: true } }
        );
        clearedCount = result.modifiedCount;
        console.log(`Soft-cleared ${clearedCount} completed requests in MongoDB.`);
      } catch (err) {
        console.error('Error soft-clearing completed requests from MongoDB:', err);
      }
    } else {
      serviceRequests.forEach(req => {
        if (req.status === 'completed') {
          req.clearedFromBoard = true;
          clearedCount++;
        }
      });
      console.log(`Soft-cleared ${clearedCount} completed requests in Memory.`);
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

  // Admin capability: create/add new table QR codes
  socket.on('table:create', async (data) => {
    const { start, end } = data;
    if (start === undefined) return;
    
    const startNum = parseInt(start);
    const endNum = end !== undefined ? parseInt(end) : startNum;
    
    if (isNaN(startNum) || startNum < 1 || endNum < startNum) {
      socket.emit('table:error', { message: 'Invalid table range.' });
      return;
    }
    
    const numbersToAdd = [];
    for (let n = startNum; n <= endNum; n++) {
      numbersToAdd.push(n);
    }
    
    if (isDbConnected()) {
      try {
        const existingDocs = await Table.find({ number: { $in: numbersToAdd } });
        const existingNums = new Set(existingDocs.map(d => d.number));
        
        const newDocs = numbersToAdd
          .filter(n => !existingNums.has(n))
          .map(n => ({ number: n }));
          
        if (newDocs.length > 0) {
          await Table.insertMany(newDocs);
          console.log(`Added ${newDocs.length} new tables to MongoDB:`, newDocs.map(d => d.number));
        }
      } catch (err) {
        console.error('Error saving tables to MongoDB:', err);
      }
    } else {
      // Memory fallback
      numbersToAdd.forEach(n => {
        if (!generatedTables.some(t => t.number === n)) {
          generatedTables.push({ number: n });
        }
      });
      generatedTables.sort((a, b) => a.number - b.number);
      console.log(`Added tables to Memory:`, numbersToAdd);
    }
    
    const currentTables = await getTables();
    io.to('dashboard-room').emit('table:list', currentTables);
  });

  // Admin capability: delete a table QR code
  socket.on('table:delete', async (number) => {
    const tableNum = parseInt(number);
    if (isNaN(tableNum)) return;
    
    if (isDbConnected()) {
      try {
        const res = await Table.deleteOne({ number: tableNum });
        console.log(`Deleted table ${tableNum} from MongoDB: deletedCount=${res.deletedCount}`);
      } catch (err) {
        console.error('Error deleting table from MongoDB:', err);
      }
    } else {
      generatedTables = generatedTables.filter(t => t.number !== tableNum);
      console.log(`Deleted table ${tableNum} from Memory`);
    }
    
    const currentTables = await getTables();
    io.to('dashboard-room').emit('table:list', currentTables);
  });

  // Admin capability: create/add new menu items
  socket.on('menu:create', async (newItem) => {
    let savedItem = null;
    if (isDbConnected()) {
      try {
        const itemDoc = new MenuItem(newItem);
        const saved = await itemDoc.save();
        savedItem = saved;
      } catch (err) {
        console.error('Error saving menu item to MongoDB:', err);
      }
    }
    
    if (!savedItem) {
      savedItem = { ...newItem, createdAt: new Date() };
      menuItems.push(savedItem);
    }
    
    const refreshedMenu = await getMenuItems();
    io.emit('menu:list', refreshedMenu);
    console.log(`Menu item created: ${newItem.name}`);
  });

  // Admin capability: update a menu item
  socket.on('menu:update', async (updatedItem) => {
    let savedItem = null;
    if (isDbConnected()) {
      try {
        const doc = await MenuItem.findOneAndUpdate(
          { name: updatedItem.name },
          { $set: updatedItem },
          { new: true }
        );
        savedItem = doc;
      } catch (err) {
        console.error('Error updating menu item in MongoDB:', err);
      }
    }
    
    if (!savedItem) {
      const idx = menuItems.findIndex(i => i.name === updatedItem.name);
      if (idx !== -1) {
        menuItems[idx] = { ...menuItems[idx], ...updatedItem };
        savedItem = menuItems[idx];
      }
    }
    
    const refreshedMenu = await getMenuItems();
    io.emit('menu:list', refreshedMenu);
    console.log(`Menu item updated: ${updatedItem.name}`);
  });

  // Admin capability: delete a menu item
  socket.on('menu:delete', async (name) => {
    if (isDbConnected()) {
      try {
        await MenuItem.deleteOne({ name: name });
      } catch (err) {
        console.error('Error deleting menu item in MongoDB:', err);
      }
    } else {
      menuItems = menuItems.filter(i => i.name !== name);
    }
    
    const refreshedMenu = await getMenuItems();
    io.emit('menu:list', refreshedMenu);
    console.log(`Menu item deleted: ${name}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Database Status API
app.get('/api/db-status', (req, res) => {
  res.json({ isConnected: isDbConnected() });
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
