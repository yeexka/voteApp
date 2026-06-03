require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new sqlite3.Database(path.join(__dirname, 'db', 'database.sqlite'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    name TEXT DEFAULT '',
    has_performed INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    voter_token TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, voter_token)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS event_state (
    id INTEGER PRIMARY KEY,
    current_group_id INTEGER,
    phase TEXT DEFAULT 'idle',
    voting_open INTEGER DEFAULT 0,
    voting_start_time TEXT,
    canvassing_end_time TEXT,
    voting_end_time TEXT,
    show_ranking INTEGER DEFAULT 0
  )`);

  for (let i = 1; i <= 10; i++) {
    await run(`INSERT OR IGNORE INTO groups (id, name, has_performed) VALUES (?, '', 0)`, [i]);
  }

  await run(`INSERT OR IGNORE INTO event_state (
    id, current_group_id, phase, voting_open, show_ranking
  ) VALUES (1, NULL, 'idle', 0, 0)`);
}

function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'] || req.body.adminPassword;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin password.' });
  }
  next();
}

function isoAfter(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function secondsLeft(dateString) {
  if (!dateString) return 0;
  return Math.max(0, Math.ceil((new Date(dateString).getTime() - Date.now()) / 1000));
}

async function getComputedState() {
  const state = await get(`SELECT * FROM event_state WHERE id = 1`);
  if (!state) return null;

  const now = Date.now();
  let phase = state.phase;
  let votingOpen = Number(state.voting_open) === 1;

  if (state.show_ranking) {
    phase = 'ranking';
    votingOpen = false;
  } else if (state.voting_end_time && now >= new Date(state.voting_end_time).getTime() && state.phase !== 'closed' && state.phase !== 'idle') {
    phase = 'closed';
    votingOpen = false;
    await run(`UPDATE event_state SET phase = 'closed', voting_open = 0 WHERE id = 1`);
  } else if (state.canvassing_end_time && state.voting_end_time && votingOpen) {
    if (now < new Date(state.canvassing_end_time).getTime()) phase = 'canvassing';
    else if (now < new Date(state.voting_end_time).getTime()) phase = 'thinking';
  }

  const currentGroup = state.current_group_id
    ? await get(`SELECT * FROM groups WHERE id = ?`, [state.current_group_id])
    : null;

  const voteCount = state.current_group_id
    ? (await get(`SELECT COUNT(*) AS count FROM votes WHERE group_id = ?`, [state.current_group_id])).count
    : 0;

  const remainingSeconds = phase === 'canvassing'
    ? secondsLeft(state.canvassing_end_time)
    : (phase === 'thinking' ? secondsLeft(state.voting_end_time) : 0);

  const totalRemainingSeconds = votingOpen ? secondsLeft(state.voting_end_time) : 0;

  return {
    currentGroupId: state.current_group_id,
    currentGroupName: currentGroup ? (currentGroup.name || `Group ${currentGroup.id}`) : '',
    phase,
    votingOpen,
    showRanking: Number(state.show_ranking) === 1,
    votingStartTime: state.voting_start_time,
    canvassingEndTime: state.canvassing_end_time,
    votingEndTime: state.voting_end_time,
    remainingSeconds,
    totalRemainingSeconds,
    voteCount,
    voteUrl: `${PUBLIC_BASE_URL}/vote`
  };
}

async function getResults() {
  const rows = await all(`
    SELECT
      g.id,
      CASE WHEN g.name IS NULL OR g.name = '' THEN 'Group ' || g.id ELSE g.name END AS name,
      COUNT(v.id) AS vote_count,
      ROUND(AVG(v.score), 2) AS average_score
    FROM groups g
    LEFT JOIN votes v ON g.id = v.group_id
    GROUP BY g.id, g.name
    ORDER BY
      CASE WHEN AVG(v.score) IS NULL THEN 1 ELSE 0 END,
      AVG(v.score) DESC,
      COUNT(v.id) DESC,
      g.id ASC
  `);

  return rows.map((row, index) => ({
    rank: row.vote_count > 0 ? index + 1 : '-',
    id: row.id,
    name: row.name,
    voteCount: row.vote_count,
    averageScore: row.average_score === null ? null : Number(row.average_score).toFixed(2)
  }));
}

async function broadcastState() {
  const state = await getComputedState();
  const results = state && state.showRanking ? await getResults() : [];
  io.emit('state:update', { state, results });
}

app.get('/', (req, res) => res.redirect('/screen'));
app.get('/screen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/vote', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vote.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/state', async (req, res) => {
  res.json({ success: true, state: await getComputedState() });
});

app.get('/api/groups', async (req, res) => {
  const groups = await all(`SELECT * FROM groups ORDER BY id`);
  res.json({ success: true, groups: groups.map(g => ({ id: g.id, name: g.name, displayName: g.name || `Group ${g.id}`, hasPerformed: !!g.has_performed })) });
});

app.get('/api/results', async (req, res) => {
  res.json({ success: true, results: await getResults() });
});

app.get('/api/qr', async (req, res) => {
  const qr = await QRCode.toDataURL(`${PUBLIC_BASE_URL}/vote`, { margin: 1, width: 360 });
  res.json({ success: true, qr, voteUrl: `${PUBLIC_BASE_URL}/vote` });
});

app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) return res.json({ success: true });
  return res.status(401).json({ success: false, message: 'Wrong password.' });
});

app.post('/api/admin/groups', requireAdmin, async (req, res) => {
  const groups = Array.isArray(req.body.groups) ? req.body.groups : [];
  for (const group of groups) {
    if (group.id >= 1 && group.id <= 10) {
      await run(`UPDATE groups SET name = ? WHERE id = ?`, [String(group.name || '').trim(), group.id]);
    }
  }
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/admin/start', requireAdmin, async (req, res) => {
  const groupId = Number(req.body.groupId);
  if (!groupId || groupId < 1 || groupId > 10) {
    return res.status(400).json({ success: false, message: 'Please select a valid group.' });
  }
  await run(`UPDATE event_state SET
    current_group_id = ?,
    phase = 'canvassing',
    voting_open = 1,
    voting_start_time = ?,
    canvassing_end_time = ?,
    voting_end_time = ?,
    show_ranking = 0
    WHERE id = 1`, [groupId, new Date().toISOString(), isoAfter(60 * 1000), isoAfter(120 * 1000)]);
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/admin/close', requireAdmin, async (req, res) => {
  await run(`UPDATE event_state SET phase = 'closed', voting_open = 0, voting_end_time = ? WHERE id = 1`, [new Date().toISOString()]);
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/admin/idle', requireAdmin, async (req, res) => {
  await run(`UPDATE event_state SET current_group_id = NULL, phase = 'idle', voting_open = 0, show_ranking = 0 WHERE id = 1`);
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/admin/ranking', requireAdmin, async (req, res) => {
  await run(`UPDATE event_state SET phase = 'ranking', voting_open = 0, show_ranking = 1 WHERE id = 1`);
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/admin/reset-group', requireAdmin, async (req, res) => {
  const groupId = Number(req.body.groupId);
  if (!groupId || groupId < 1 || groupId > 10) return res.status(400).json({ success: false, message: 'Invalid group.' });
  await run(`DELETE FROM votes WHERE group_id = ?`, [groupId]);
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/admin/reset-all', requireAdmin, async (req, res) => {
  await run(`DELETE FROM votes`);
  await run(`UPDATE groups SET has_performed = 0`);
  await run(`UPDATE event_state SET current_group_id = NULL, phase = 'idle', voting_open = 0, voting_start_time = NULL, canvassing_end_time = NULL, voting_end_time = NULL, show_ranking = 0 WHERE id = 1`);
  await broadcastState();
  res.json({ success: true });
});

app.post('/api/vote', async (req, res) => {
  const score = Number(req.body.score);
  const voterToken = String(req.body.voterToken || '').trim();

  if (!voterToken || voterToken.length < 12) return res.status(400).json({ success: false, message: 'Invalid device token.' });
  if (!Number.isInteger(score) || score < 1 || score > 10) return res.status(400).json({ success: false, message: 'Score must be from 1 to 10.' });

  const state = await getComputedState();
  if (!state || !state.currentGroupId || !state.votingOpen || state.phase === 'closed' || state.phase === 'ranking') {
    return res.status(400).json({ success: false, message: 'Voting is not open now.' });
  }

  try {
    await run(`INSERT INTO votes (group_id, voter_token, score) VALUES (?, ?, ?)`, [state.currentGroupId, voterToken, score]);
    await broadcastState();
    res.json({ success: true, message: 'Vote submitted.', groupId: state.currentGroupId, score });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ success: false, alreadyVoted: true, message: 'You have already voted for this group.' });
    }
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/my-vote/:token/:groupId', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const groupId = Number(req.params.groupId);
  if (!token || !groupId) return res.json({ success: true, voted: false });
  const row = await get(`SELECT score FROM votes WHERE voter_token = ? AND group_id = ?`, [token, groupId]);
  res.json({ success: true, voted: !!row, score: row ? row.score : null });
});

io.on('connection', async (socket) => {
  socket.emit('state:update', { state: await getComputedState(), results: await getResults() });
});

setInterval(() => {
  broadcastState().catch(console.error);
}, 1000);

initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Dubbing Vote App running at http://localhost:${PORT}`);
    console.log(`Vote QR points to: ${PUBLIC_BASE_URL}/vote`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
