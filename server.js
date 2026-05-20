/**
 * EPHEMERA — Real-time ephemeral chat server
 * 
 * Stack: Node.js + Express + Socket.io
 * 
 * Install:  npm install
 * Run:      node server.js
 * 
 * Rules enforced:
 *  - Max 10 users per room
 *  - No message history sent on join (you only see messages from when you arrived)
 *  - All messages & rooms deleted after 24 hours of inactivity
 *  - No file/image support — text only
 *  - Anonymous usernames assigned on connect
 *  - Duplicate rooms allowed (same topic, different room)
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const crypto     = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

const PORT = process.env.PORT || 3000;

// ── Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

// ── In-memory state (no DB — ephemeral by design)
// rooms: Map<roomId, Room>
// Room: { id, topic, location, createdAt, lastActivity, users: Set<socketId>, msgCount }
const rooms = new Map();

// Trending topics per location (refreshed every 6 hours in production)
// In this demo, seeded with realistic topics
const TRENDING = {
  'ZA': [
    'Load shedding stage 4 today','Budget speech reactions',
    'Bafana Bafana last night','Cape Town water crisis',
    'Rand dollar exchange','Matric results 2025',
    'Eskom updates','SA politics','Joburg protests',
    'Cape Town nightlife','Durban floods','SA tech scene'
  ],
  'US': [
    'Fed rate decision today','NBA playoffs','AI regulation bill',
    'Gaza ceasefire talks','Tesla earnings','US election 2026',
    'TikTok ban update','Inflation numbers','Hollywood strike',
    'Super Bowl 2026','Silicon Valley layoffs','Climate bill vote'
  ],
  'GB': [
    'UK election polls','Premier League results','NHS strike',
    'Cost of living update','Royal family news','Brexit aftermath',
    'Rishi Sunak latest','London housing','UK tech layoffs',
    'Climate protest London','Channel migrants','UK inflation'
  ],
  'NG': [
    'Naira exchange rate','ASUU strike update','Nigerian elections',
    'Lagos traffic today','Dangote refinery','CBN policy update',
    'Nigerian music awards','Fuel subsidy removal','Lagos flooding',
    'EFCC latest','Nigerian startups','Power cuts Abuja'
  ],
  'KE': [
    'Nairobi traffic jam','Kenya elections','M-Pesa outage',
    'Matatu fare increase','Kenya vs Ethiopia','Safaricom update',
    'Nairobi flooding','Kenya startup scene','Gen Z protests',
    'KRA tax deadline','Kenya cricket','Nairobi nightlife'
  ],
  'GLOBAL': [
    'AI taking jobs','Climate change 2025','Space exploration',
    'World Cup 2026 predictions','Crypto market crash',
    'TikTok vs YouTube','Mental health awareness',
    'Electric vehicles','Remote work debate',
    'Housing crisis worldwide','Late-night thoughts','Random conversations'
  ]
};

// Anonymous name pools
const ADJECTIVES = ['Silent','Curious','Wandering','Restless','Bright','Quiet','Bold','Swift','Calm','Wild','Sharp','Warm','Cool','Deep','Rare'];
const NOUNS      = ['Fox','Wave','Cloud','River','Stone','Ember','Drift','Spark','Tide','Echo','Flare','Shade','Mist','Glow','Arc'];

function randomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const d = Math.floor(Math.random() * 90) + 10;
  return `${a}${n}${d}`;
}

function makeRoomId() {
  return crypto.randomBytes(6).toString('hex');
}

function getRoomsForLocation(loc) {
  const topics = TRENDING[loc] || TRENDING['GLOBAL'];
  const global  = TRENDING['GLOBAL'];
  // Return rooms list with counts — include all active rooms
  const list = [];
  rooms.forEach((room, id) => {
    if (room.location === loc || room.location === 'GLOBAL') {
      list.push({
        id: room.id,
        topic: room.topic,
        location: room.location,
        count: room.users.size,
        full: room.users.size >= 10
      });
    }
  });
  return list;
}

function getTrendingTopics(loc) {
  const local  = TRENDING[loc]  || [];
  const global = TRENDING['GLOBAL'];
  return [...new Set([...local, ...global])].slice(0, 20);
}

// ── Room cleanup: delete rooms with no users & last activity > 24h
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  rooms.forEach((room, id) => {
    if (room.users.size === 0 && room.lastActivity < cutoff) {
      rooms.delete(id);
      console.log(`[cleanup] Deleted room ${id} (${room.topic})`);
    }
  });
}, 60 * 60 * 1000); // check every hour

// ── Socket.io events
io.on('connection', (socket) => {
  const username = randomName();
  socket.data.username  = username;
  socket.data.roomId    = null;
  socket.data.location  = 'GLOBAL';

  console.log(`[connect] ${username} (${socket.id})`);

  // Client sends their location code on connect
  socket.on('set_location', (locCode) => {
    const valid = Object.keys(TRENDING);
    socket.data.location = valid.includes(locCode) ? locCode : 'GLOBAL';

    // Send them their username + trending topics + room list
    socket.emit('init', {
      username: socket.data.username,
      location: socket.data.location,
      topics:   getTrendingTopics(socket.data.location),
      rooms:    getRoomsForLocation(socket.data.location)
    });
  });

  // Create a new room
  socket.on('create_room', ({ topic, location }) => {
    const loc = location || socket.data.location || 'GLOBAL';
    const roomId = makeRoomId();
    rooms.set(roomId, {
      id:           roomId,
      topic:        topic.slice(0, 80),
      location:     loc,
      createdAt:    Date.now(),
      lastActivity: Date.now(),
      users:        new Set(),
      msgCount:     0
    });
    console.log(`[room] Created "${topic}" (${roomId}) for ${loc}`);
    socket.emit('room_created', { roomId, topic, location: loc });
    // Broadcast updated room list to everyone in that location
    broadcastRoomList(loc);
  });

  // Join a room
  socket.on('join_room', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) { socket.emit('error_msg', 'Room not found.'); return; }
    if (room.users.size >= 10) { socket.emit('error_msg', 'Room is full (10/10).'); return; }

    // Leave old room if in one
    if (socket.data.roomId) {
      leaveRoom(socket);
    }

    socket.join(roomId);
    room.users.add(socket.id);
    room.lastActivity = Date.now();
    socket.data.roomId = roomId;

    // Tell user they joined (NO history — by design)
    socket.emit('joined_room', {
      roomId,
      topic:    room.topic,
      location: room.location,
      count:    room.users.size
    });

    // Tell others in room
    socket.to(roomId).emit('user_joined', {
      username: socket.data.username,
      count:    room.users.size
    });

    broadcastRoomList(room.location);
    console.log(`[join] ${username} → ${room.topic} (${roomId}) — ${room.users.size}/10`);
  });

  // Send a message
  socket.on('send_message', (text) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // Text only — strip any HTML/markup
    const clean = String(text)
      .replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .trim().slice(0, 500);
    if (!clean) return;

    room.lastActivity = Date.now();
    room.msgCount++;

    const msg = {
      id:       crypto.randomBytes(4).toString('hex'),
      username: socket.data.username,
      text:     clean,
      ts:       Date.now()
    };

    // Broadcast to everyone in room INCLUDING sender
    io.to(roomId).emit('message', msg);
  });

  // Leave room explicitly
  socket.on('leave_room', () => {
    leaveRoom(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    leaveRoom(socket);
    console.log(`[disconnect] ${username}`);
  });

  // Refresh room list
  socket.on('get_rooms', () => {
    socket.emit('room_list', getRoomsForLocation(socket.data.location));
  });

  // ── Helpers
  function leaveRoom(sock) {
    const rid = sock.data.roomId;
    if (!rid) return;
    const room = rooms.get(rid);
    if (room) {
      room.users.delete(sock.id);
      room.lastActivity = Date.now();
      sock.to(rid).emit('user_left', {
        username: sock.data.username,
        count:    room.users.size
      });
      broadcastRoomList(room.location);
    }
    sock.leave(rid);
    sock.data.roomId = null;
  }

  function broadcastRoomList(loc) {
    // Send updated list to all connected sockets with that location
    io.sockets.sockets.forEach((s) => {
      if (s.data.location === loc || loc === 'GLOBAL') {
        s.emit('room_list', getRoomsForLocation(s.data.location));
      }
    });
  }
});

server.listen(PORT, () => {
  console.log(`\n  EPHEMERA running → http://localhost:${PORT}\n`);
});
