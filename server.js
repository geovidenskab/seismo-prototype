const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const path = require('path');
const { version: APP_VERSION } = require('./package.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Sessions ───────────────────────────────────────────
const sessions = new Map();

function genCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (sessions.has(code));
  return code;
}

function getSession(code) {
  const s = sessions.get(code);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(code); return null; }
  return s;
}

function broadcastToRoom(code, msg, excludeWs) {
  const s = getSession(code);
  if (!s) return;
  const data = JSON.stringify(msg);
  [...s.stations.values(), ...s.dashboards].forEach(ws => {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(data);
  });
}

function stationList(session) {
  return [...session.stations.entries()].map(([id, ws]) => ({
    id,
    name: ws._info?.name || 'S' + id,
    lat: ws._info?.lat,
    lng: ws._info?.lng,
    hz: ws._info?.hz || 0,
    noise: ws._info?.noise || 0,
    offset: ws._info?.offset || 0,
    status: ws._info?.status || 'connecting'
  }));
}

// PUBLIC_BASE_URL: sættes i prod via PM2 (fx "https://geo.sg.dk/seismograf").
// Bruges til at konstruere korrekte URLer bag reverse-proxy med path-prefix.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

// ─── REST ───────────────────────────────────────────────
app.get('/api/info', (req, res) => {
  if (PUBLIC_BASE_URL) {
    return res.json({ host: PUBLIC_BASE_URL.replace(/^https?:\/\//, ''), version: APP_VERSION });
  }
  const nets = require('os').networkInterfaces();
  let ip = req.headers.host || 'localhost';
  for (const iface of Object.values(nets))
    for (const c of iface)
      if (c.family === 'IPv4' && !c.internal) { ip = c.address + ':' + (process.env.PORT || 3000); break; }
  res.json({ host: ip, version: APP_VERSION });
});

app.post('/api/session', (req, res) => {
  const mode = req.body?.mode === 'silent' ? 'silent' : 'wavespeed';
  const code = genCode();
  sessions.set(code, {
    code,
    mode,
    created: Date.now(),
    expires: Date.now() + 2 * 3600000,
    stations: new Map(),
    dashboards: [],
    nextStationId: 1,
    recording: false
  });
  console.log('Session oprettet: ' + code + ' (' + mode + ')');
  res.json({ code, mode });
});

app.get('/api/session/:code/qr', async (req, res) => {
  const s = getSession(req.params.code);
  if (!s) return res.status(404).json({ error: 'Ikke fundet' });
  let url;
  if (PUBLIC_BASE_URL) {
    url = PUBLIC_BASE_URL + '/station.html?code=' + s.code;
  } else {
    const host = req.query.host || req.headers.host;
    const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    const proto = isLocal ? 'http' : 'https';
    url = proto + '://' + host + '/station.html?code=' + s.code;
  }
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
    res.json({ svg, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/session/:code', (req, res) => {
  const s = getSession(req.params.code);
  if (!s) return res.status(404).json({ error: 'Ikke fundet' });
  res.json({ code: s.code, mode: s.mode, stations: stationList(s), recording: s.recording });
});

app.post('/api/session/:code/control', (req, res) => {
  const s = getSession(req.params.code);
  if (!s) return res.status(404).json({ error: 'Ikke fundet' });
  const { action, duration } = req.body;

  if (action === 'countdown') {
    const secs = duration || 3;
    broadcastToRoom(req.params.code, { type: 'countdown', duration: secs });
    setTimeout(() => {
      s.recording = true;
      broadcastToRoom(req.params.code, { type: 'recording:start' });
    }, secs * 1000);
  } else if (action === 'start' || action === 'silent:start') {
    s.recording = true;
    broadcastToRoom(req.params.code, { type: 'recording:start' });
  } else if (action === 'stop' || action === 'silent:stop') {
    s.recording = false;
    broadcastToRoom(req.params.code, { type: 'recording:stop' });
  } else if (action === 'reset') {
    s.recording = false;
    broadcastToRoom(req.params.code, { type: 'session:reset' });
  }

  res.json({ ok: true });
});

// ─── WebSocket ──────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  const role = url.searchParams.get('role') || 'station';
  ws._code = code;

  const session = getSession(code);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', msg: 'Session ikke fundet' }));
    ws.close(); return;
  }

  // ─── Dashboard ────────────────────────────────────
  if (role === 'dashboard') {
    session.dashboards.push(ws);
    ws.send(JSON.stringify({ type: 'init', mode: session.mode, version: APP_VERSION, stations: stationList(session), recording: session.recording }));

    ws.on('close', () => {
      session.dashboards = session.dashboards.filter(d => d !== ws);
    });
    ws.on('message', raw => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'start-recording') {
        session.recording = true;
        const secs = msg.seconds || 3;
        broadcastToRoom(code, { type: 'countdown', seconds: secs });
        setTimeout(() => broadcastToRoom(code, { type: 'recording-started' }), secs * 1000);
      }
      if (msg.type === 'stop-recording') {
        session.recording = false;
        broadcastToRoom(code, { type: 'recording-stopped' });
      }
      // Indstillinger fra dashboard videresendes til alle stationer
      if (msg.type === 'station:settings') {
        session.stations.forEach(stationWs => {
          if (stationWs.readyState === 1) stationWs.send(JSON.stringify(msg));
        });
      }
    });
    return;
  }

  // ─── Station ──────────────────────────────────────
  // Silent-mode tillader kun én station ad gangen
  if (session.mode === 'silent' && session.stations.size >= 1) {
    ws.send(JSON.stringify({
      type: 'error',
      msg: 'Denne øvelse bruger kun én telefon — der er allerede tilsluttet en station.'
    }));
    ws.close();
    return;
  }

  const stationId = session.nextStationId++;
  ws._info = { name: 'S' + stationId, status: 'connecting' };
  ws._stationId = stationId;
  session.stations.set(stationId, ws);

  ws.send(JSON.stringify({ type: 'welcome', stationId, name: 'S' + stationId, mode: session.mode, version: APP_VERSION, recording: session.recording }));
  broadcastToRoom(code, {
    type: 'station:joined',
    id: stationId, name: 'S' + stationId, status: 'connecting',
    count: session.stations.size
  }, ws);

  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'sync:ping') {
      const now = Date.now();
      ws.send(JSON.stringify({
        type: 'sync:pong',
        clientSend: msg.clientSend,
        serverRecv: now,
        serverSend: Date.now()
      }));
    }

    if (msg.type === 'station:ready') {
      ws._info = { ...ws._info, ...msg, status: 'ready' };
      broadcastToRoom(code, {
        type: 'station:ready',
        id: stationId, name: ws._info.name,
        lat: msg.lat, lng: msg.lng,
        hz: msg.hz, noise: msg.noise, offset: msg.offset,
        count: session.stations.size
      });
    }

    if (msg.type === 'data') {
      const packet = JSON.stringify({
        type: 'data', id: stationId,
        t: msg.t, z: msg.z, peak: msg.peak,
        samples: Array.isArray(msg.samples) ? msg.samples.slice(0, 50) : undefined
      });
      session.dashboards.forEach(d => {
        if (d.readyState === 1) d.send(packet);
      });
    }

    if (msg.type === 'trigger') {
      const packet = JSON.stringify({ type: 'trigger', id: stationId, t: msg.t, amplitude: msg.amplitude, threshold: msg.threshold });
      session.dashboards.forEach(d => { if (d.readyState === 1) d.send(packet); });
    }
  });

  ws.on('close', () => {
    session.stations.delete(stationId);
    broadcastToRoom(code, {
      type: 'station:left', id: stationId,
      count: session.stations.size
    });
  });
});

// ─── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  let ip = 'localhost';
  for (const iface of Object.values(nets))
    for (const c of iface)
      if (c.family === 'IPv4' && !c.internal) { ip = c.address; break; }
  console.log('\n  Seismisk server kører:');
  console.log('  Lokalt:    http://localhost:' + PORT);
  console.log('  Netværk:   http://' + ip + ':' + PORT);
  console.log('  Dashboard: http://' + ip + ':' + PORT + '/dashboard.html\n');
});
