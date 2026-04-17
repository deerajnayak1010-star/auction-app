// ─────────────────────────────────────────────
// server.js — Auction Server with WebSocket
// ─────────────────────────────────────────────

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3000;

// ── Database Setup ─────────────────────────────
const dbPath = path.join(__dirname, 'auction.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('[DB] Error opening database:', err);
  else console.log('[DB] SQLite database connected');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, state_json TEXT)`);
});

// ── Helpers ────────────────────────────────────

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// ── Session Management ─────────────────────────

let activeSession = null;

function createSession(teams) {
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  activeSession = {
    token,
    expiry,
    teams,
    createdAt: Date.now(),
  };
  return activeSession;
}

function validateSession(token) {
  if (!activeSession) return { valid: false, error: 'No active session' };
  if (activeSession.token !== token) return { valid: false, error: 'Invalid session' };
  if (Date.now() > activeSession.expiry) return { valid: false, error: 'Session expired. Please contact organizer.' };
  return { valid: true, session: activeSession };
}

function validateTeamCode(teamCode) {
  if (!activeSession) return null;
  const code = teamCode.toUpperCase().trim();
  return activeSession.teams.find(t => t.shortName.toUpperCase() === code);
}

// ── HTTP Server (static files & API) ───────────

// Basic body parser helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // API: Login
  if (req.method === 'POST' && req.url === '/api/login') {
    const body = await parseBody(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if ((body.username || '').toUpperCase() === 'RCB' && body.password === 'RCB2.0') {
      res.end(JSON.stringify({ success: true, token: 'npl-auth-token' }));
    } else {
      res.end(JSON.stringify({ success: false }));
    }
    return;
  }

  // API: State Get/Set
  if (req.url === '/api/state') {
    if (req.method === 'GET') {
      db.get("SELECT state_json FROM app_state WHERE id = 1", (err, row) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (err || !row) {
          res.end(JSON.stringify(null));
        } else {
          res.end(row.state_json);
        }
      });
      return;
    }
    
    if (req.method === 'POST') {
      const authHeader = req.headers.authorization;
      if (authHeader !== 'Bearer npl-auth-token') {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
        return;
      }
      const body = await parseBody(req);
      const jsonStr = JSON.stringify(body);
      db.run("INSERT OR REPLACE INTO app_state (id, state_json) VALUES (1, ?)", [jsonStr], (err) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (err) res.end(JSON.stringify({ success: false }));
        else res.end(JSON.stringify({ success: true }));
      });
      return;
    }
  }

  // API: server info
  if (req.method === 'GET' && req.url === '/api/server-info') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ ip: getLocalIP(), port: PORT }));
    return;
  }

  // API: generate QR code image
  if (req.url.startsWith('/api/qr?')) {
    const urlParams = new URL(req.url, `http://localhost:${PORT}`);
    const data = urlParams.searchParams.get('data');
    if (!data) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing data parameter');
      return;
    }
    try {
      const qrBuffer = await QRCode.toBuffer(data, {
        width: 280,
        margin: 2,
        color: {
          dark: '#f1f5f9',
          light: '#131940',
        },
        errorCorrectionLevel: 'M',
      });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      });
      res.end(qrBuffer);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('QR generation failed');
    }
    return;
  }

  // Static files
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';

  // Decode URL-encoded characters (e.g. %20 → space)
  filePath = decodeURIComponent(filePath);

  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ── WebSocket Server ───────────────────────────

const wss = new WebSocketServer({ server });

let hostSocket = null;
const mobileClients = new Map(); // ws -> { teamId, teamName, ... }
const projectorClients = new Set(); // set of ws clients
let latestState = null;

function broadcastToProjectors(state) {
  for (const client of projectorClients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'state-update',
        state: filterStateForProjector(state),
      }));
    }
  }
}

function broadcastToMobiles(state) {
  broadcastToProjectors(state); // Ensure projectors also get every state update
  for (const [client, info] of mobileClients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'state-update',
        state: filterStateForMobile(state, info.teamId),
      }));
    }
  }
}

function filterStateForMobile(state, teamId) {
  return {
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    currentBid: state.currentBid,
    currentBidder: state.currentBidder,
    currentBidderTeam: state.currentBidderTeam ? {
      shortName: state.currentBidderTeam.shortName,
      name: state.currentBidderTeam.name,
      color: state.currentBidderTeam.color,
    } : null,
    nextBidAmount: state.nextBidAmount,
    increment: state.increment,
    playerIndex: state.playerIndex,
    totalPlayers: state.totalPlayers,
    remainingPlayers: state.remainingPlayers,
    soldCount: state.soldCount,
    unsoldCount: state.unsoldCount,
    myTeamId: teamId,
    bidHistory: (state.bidHistory || []).slice(-5),
    myTeam: state.teams ? state.teams.find(t => t.id === teamId) : null,
  };
}

function filterStateForProjector(state) {
  return {
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    currentBid: state.currentBid,
    currentBidder: state.currentBidder,
    currentBidderTeam: state.currentBidderTeam ? {
      shortName: state.currentBidderTeam.shortName,
      name: state.currentBidderTeam.name,
      color: state.currentBidderTeam.color,
      logo: state.currentBidderTeam.logo
    } : null,
    nextBidAmount: state.nextBidAmount,
    playerIndex: state.playerIndex,
    totalPlayers: state.totalPlayers,
    remainingPlayers: state.remainingPlayers,
    soldCount: state.soldCount,
    unsoldCount: state.unsoldCount,
    bidHistory: (state.bidHistory || []).slice(-5),
    timerRemaining: state.timerRemaining,
    timerStartTime: state.timerStartTime || null,
    timerDuration: state.timerDuration || 30,
    timerEnabled: state.timerEnabled || false,
    // Bidder team financial info (for projector warning)
    currentBidderPurse: state.currentBidderTeam ? state.currentBidderTeam.purse : null,
    currentBidderSquadCount: state.currentBidderTeam ? (state.currentBidderTeam.squad?.length ?? 0) : 0
  };
}

wss.on('connection', (ws) => {
  console.log('[WS] New connection');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch (e) { return; }

    switch (msg.type) {
      
      // ── Projector Registration ──
      case 'projector-register':
        projectorClients.add(ws);
        console.log('[WS] Projector connected');
        if (latestState) {
          ws.send(JSON.stringify({
            type: 'state-update',
            state: filterStateForProjector(latestState)
          }));
        }
        break;

      // ── Host registers ──
      case 'host-register':
        hostSocket = ws;
        console.log('[WS] Host registered');
        ws.send(JSON.stringify({ type: 'host-registered' }));
        break;

      // ── Host creates session for mobile access ──
      case 'create-session':
        const session = createSession(msg.teams);
        const localIP = getLocalIP();
        const mobileUrl = `http://${localIP}:${PORT}/mobile.html?session=${session.token}`;
        ws.send(JSON.stringify({
          type: 'session-created',
          token: session.token,
          expiry: session.expiry,
          url: mobileUrl,
          ip: localIP,
        }));
        console.log(`[WS] Session created: ${session.token}`);
        console.log(`[WS] Mobile URL: ${mobileUrl}`);
        break;

      // ── Host broadcasts auction state ──
      case 'state-update':
        latestState = msg.state;
        broadcastToMobiles(msg.state);
        break;

      // ── Host sends bid result back to mobile ──
      case 'bid-result':
        for (const [client, info] of mobileClients) {
          if (info.teamId === msg.teamId && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'bid-result',
              success: msg.success,
              error: msg.error || '',
            }));
          }
        }
        break;

      // ── Mobile authenticates ──
      case 'mobile-auth': {
        const validation = validateSession(msg.sessionToken);
        if (!validation.valid) {
          ws.send(JSON.stringify({
            type: 'auth-result',
            success: false,
            error: validation.error,
          }));
          break;
        }

        const team = validateTeamCode(msg.teamCode);
        if (!team) {
          ws.send(JSON.stringify({
            type: 'auth-result',
            success: false,
            error: 'Invalid team code. Please try again.',
          }));
          break;
        }

        // Disconnect previous session for this team
        for (const [client, info] of mobileClients) {
          if (info.teamId === team.id && client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'kicked',
              error: 'Another device connected with your team code.',
            }));
            mobileClients.delete(client);
          }
        }

        mobileClients.set(ws, {
          teamId: team.id,
          teamName: team.name,
          teamShortName: team.shortName,
          teamColor: team.color,
          teamTextColor: team.textColor,
        });

        ws.send(JSON.stringify({
          type: 'auth-result',
          success: true,
          teamId: team.id,
          teamName: team.name,
          teamShortName: team.shortName,
          teamColor: team.color,
          teamTextColor: team.textColor,
        }));

        // Send current state immediately
        if (latestState) {
          ws.send(JSON.stringify({
            type: 'state-update',
            state: filterStateForMobile(latestState, team.id),
          }));
        }

        console.log(`[WS] Mobile authenticated: ${team.shortName}`);

        // Notify host
        if (hostSocket && hostSocket.readyState === 1) {
          hostSocket.send(JSON.stringify({
            type: 'mobile-connected',
            teamId: team.id,
            teamName: team.name,
            teamShortName: team.shortName,
          }));
        }
        break;
      }

      // ── Mobile places a bid ──
      case 'mobile-bid': {
        const clientInfo = mobileClients.get(ws);
        if (!clientInfo) {
          ws.send(JSON.stringify({
            type: 'bid-result',
            success: false,
            error: 'Not authenticated',
          }));
          break;
        }

        console.log(`[WS] Mobile bid from ${clientInfo.teamShortName}`);

        // Relay bid to host for processing
        if (hostSocket && hostSocket.readyState === 1) {
          hostSocket.send(JSON.stringify({
            type: 'mobile-bid',
            teamId: clientInfo.teamId,
            teamName: clientInfo.teamName,
            teamShortName: clientInfo.teamShortName,
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'bid-result',
            success: false,
            error: 'Auction host not connected',
          }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws === hostSocket) {
      hostSocket = null;
      console.log('[WS] Host disconnected');
      for (const [client] of mobileClients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'host-disconnected' }));
        }
      }
    }

    if (mobileClients.has(ws)) {
      const info = mobileClients.get(ws);
      console.log(`[WS] Mobile disconnected: ${info.teamShortName}`);
      mobileClients.delete(ws);
      if (hostSocket && hostSocket.readyState === 1) {
        hostSocket.send(JSON.stringify({
          type: 'mobile-disconnected',
          teamId: info.teamId,
          teamShortName: info.teamShortName,
        }));
      }
    }

    if (projectorClients.has(ws)) {
      console.log('[WS] Projector disconnected');
      projectorClients.delete(ws);
    }
  });
});

// ── Start ──────────────────────────────────────

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║      NAKRE PREMIER LEAGUE AUCTION         ║');
  console.log('  ╠═══════════════════════════════════════════╣');
  console.log(`  ║  Local:   http://localhost:${PORT}           ║`);
  console.log(`  ║  Network: http://${localIP.padEnd(15)}:${PORT}  ║`);
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
});
