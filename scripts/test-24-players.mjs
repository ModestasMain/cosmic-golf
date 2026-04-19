// ============================================================
// 24-player multiplayer load test
// Usage: node scripts/test-24-players.mjs [roomCode] [host]
//
// Connects 24 simulated players to a room, runs a full game
// cycle (join → shoot → ball_state stream → hole_complete),
// and reports pass/fail for every scenario we care about.
// ============================================================

const ROOM_CODE = process.argv[2] ?? `LOADTEST${Date.now()}`;
const HOST      = process.argv[3] ?? 'cosmic-golf-mp.cosmicgolf.workers.dev';
const NUM_PLAYERS = 24;
const isLocal   = HOST.startsWith('localhost') || HOST.startsWith('127.');
const WS_URL    = (room) => `${isLocal ? 'ws' : 'wss'}://${HOST}/party/${room}`;

// ── Helpers ───────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const colors = [
  '\x1b[32m', // green
  '\x1b[31m', // red
  '\x1b[33m', // yellow
  '\x1b[36m', // cyan
  '\x1b[0m',  // reset
];
const [GREEN, RED, YELLOW, CYAN, RESET] = colors;

function pass(msg)  { console.log(`  ${GREEN}✔${RESET} ${msg}`); }
function fail(msg)  { console.log(`  ${RED}✖${RESET} ${msg}`); }
function info(msg)  { console.log(`  ${CYAN}→${RESET} ${msg}`); }
function warn(msg)  { console.log(`  ${YELLOW}!${RESET} ${msg}`); }
function header(msg){ console.log(`\n${CYAN}━━ ${msg} ━━${RESET}`); }

let passCount = 0, failCount = 0;
function assert(condition, label) {
  if (condition) { pass(label); passCount++; }
  else           { fail(label); failCount++; }
}

// ── Player sim ────────────────────────────────────────────────

class SimPlayer {
  constructor(index, roomCode) {
    this.index     = index;
    this.playerId  = `test_player_${index}_${Date.now()}`;
    this.name      = `BOT_${String(index).padStart(2, '0')}`;
    this.color     = 0xff0000 + index * 0x001000;
    this.roomCode  = roomCode;
    this.ws        = null;
    this.connected = false;
    this.received  = [];         // all messages received
    this.joinsSeen = new Set();  // playerIds we saw join
    this.latencies = [];         // round-trip ping times
    this._pingTs   = null;
    this._openTime = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`P${this.index}: connection timeout`)), 8000);
      this.ws = new WebSocket(WS_URL(this.roomCode));

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this._openTime = Date.now();
        this._send({ type: 'join', playerId: this.playerId, name: this.name, color: this.color });
        resolve();
      };

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this.received.push(msg);
        if (msg.type === 'join') this.joinsSeen.add(msg.playerId);
        // Measure message round-trip via a custom pong check
        if (msg.type === 'pong_echo' && msg.from === this.playerId && this._pingTs) {
          this.latencies.push(Date.now() - this._pingTs);
          this._pingTs = null;
        }
      };

      this.ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(`P${this.index}: WebSocket error`));
      };

      this.ws.onclose = () => {
        this.connected = false;
      };
    });
  }

  _send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendBallState(holeIndex = 0) {
    const t = (Date.now() / 1000) + this.index;
    this._send({
      type: 'ball_state',
      playerId: this.playerId,
      holeIndex,
      ts: Date.now(),
      pos: { x: Math.sin(t) * 100, y: Math.cos(t) * 50, z: Math.sin(t * 0.7) * 80 },
      vel: { x: Math.cos(t) * 20,  y: Math.sin(t) * 15,  z: Math.cos(t * 0.7) * 10 },
    });
  }

  sendShot(holeIndex = 0) {
    const angle = (this.index / NUM_PLAYERS) * Math.PI * 2;
    this._send({
      type:      'shot',
      playerId:  this.playerId,
      holeIndex,
      direction: { x: Math.cos(angle), y: 0.3, z: Math.sin(angle) },
      power:     400 + this.index * 10,
    });
  }

  sendHoleComplete(holeIndex = 0) {
    this._send({
      type:     'hole_complete',
      playerId: this.playerId,
      strokes:  3 + (this.index % 5),
      timeMs:   15000 + this.index * 500,
    });
  }

  submitLeaderboard(holeIndex = 0) {
    this._send({
      type: 'leaderboard_submit',
      entry: {
        sessionId:      this.playerId,
        name:           this.name,
        totalStrokes:   3 + (this.index % 5),
        holesCompleted: holeIndex + 1,
        totalTime:      15000 + this.index * 500,
        strokes:        [3 + (this.index % 5)],
      },
    });
  }

  countReceived(type) {
    return this.received.filter(m => m.type === type).length;
  }

  disconnect() {
    if (this.ws) this.ws.close();
  }
}

// ── Test suite ────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${CYAN}╔══════════════════════════════════════╗`);
  console.log(`║   Cosmic Golf — 24-Player Load Test  ║`);
  console.log(`╚══════════════════════════════════════╝${RESET}`);
  info(`Room:   ${ROOM_CODE}`);
  info(`Host:   ${HOST}`);
  info(`Players: ${NUM_PLAYERS}`);

  const players = Array.from({ length: NUM_PLAYERS }, (_, i) => new SimPlayer(i, ROOM_CODE));

  // ── 1. Connection ─────────────────────────────────────────
  header('1. Connect all 24 players');

  const connectResults = await Promise.allSettled(players.map(p => p.connect()));
  const connected = players.filter(p => p.connected);

  assert(connected.length === NUM_PLAYERS, `All ${NUM_PLAYERS} players connected (got ${connected.length})`);

  if (connected.length === 0) {
    fail('No players connected — aborting (is the server running?)');
    process.exit(1);
  }

  // ── 2. Join propagation ───────────────────────────────────
  header('2. Join message propagation');

  // Give joins time to propagate
  await sleep(500);

  // Each player should have seen (N-1) other join messages
  const joinCounts = players.map(p => p.joinsSeen.size);
  const avgJoinsSeen = joinCounts.reduce((a, b) => a + b, 0) / joinCounts.length;
  const minJoinsSeen = Math.min(...joinCounts);

  assert(minJoinsSeen >= NUM_PLAYERS - 2,
    `Every player saw at least ${NUM_PLAYERS - 2} peer joins (min seen: ${minJoinsSeen})`);
  info(`Average joins seen per player: ${avgJoinsSeen.toFixed(1)} / ${NUM_PLAYERS - 1}`);

  // ── 3. Leaderboard delivery on join ───────────────────────
  header('3. Leaderboard delivered on join');

  const lbCount = players.filter(p => p.countReceived('leaderboard') >= 1).length;
  assert(lbCount === connected.length,
    `All ${connected.length} players received initial leaderboard (got ${lbCount})`);

  // ── 4. Ball state relay ───────────────────────────────────
  header('4. Ball state relay (30 Hz × 24 players, 1 second)');

  // Clear received buffers so we only count new messages
  players.forEach(p => p.received = []);

  const BALL_STATE_ROUNDS = 30; // 30 Hz for 1 second
  const ROUND_INTERVAL_MS = 33;

  for (let round = 0; round < BALL_STATE_ROUNDS; round++) {
    players.forEach(p => p.sendBallState(0));
    await sleep(ROUND_INTERVAL_MS);
  }

  await sleep(300); // let last batch arrive

  // Each player should have received ball_state from N-1 other players × 30 rounds
  // Allow 10% drop (network jitter)
  const expectedPerPlayer = (NUM_PLAYERS - 1) * BALL_STATE_ROUNDS;
  const ballStateCounts   = players.map(p => p.countReceived('ball_state'));
  const avgBallStates     = ballStateCounts.reduce((a, b) => a + b, 0) / ballStateCounts.length;
  const minBallStates     = Math.min(...ballStateCounts);
  const deliveryRate      = avgBallStates / expectedPerPlayer;

  info(`Expected per player: ${expectedPerPlayer} ball_state msgs`);
  info(`Average received:    ${avgBallStates.toFixed(0)}`);
  info(`Min received:        ${minBallStates}`);
  info(`Delivery rate:       ${(deliveryRate * 100).toFixed(1)}%`);

  assert(deliveryRate >= 0.85, `Ball state delivery ≥ 85% (got ${(deliveryRate * 100).toFixed(1)}%)`);

  if (deliveryRate < 0.95) {
    warn(`Delivery rate below 95% — may indicate server-side rate limiting or network drops`);
  }

  // ── 5. Shot relay ─────────────────────────────────────────
  header('5. Shot relay');

  players.forEach(p => p.received = []);
  players.forEach(p => p.sendShot(0));
  await sleep(500);

  const shotCounts    = players.map(p => p.countReceived('shot'));
  const avgShotsRecvd = shotCounts.reduce((a, b) => a + b, 0) / shotCounts.length;

  // Each player sent 1 shot → each other player should receive 1 shot from others
  assert(avgShotsRecvd >= NUM_PLAYERS * 0.9 - 1,
    `Shot relay: avg ${avgShotsRecvd.toFixed(1)} received / ${NUM_PLAYERS - 1} expected`);

  // ── 6. Leaderboard submit + broadcast ─────────────────────
  header('6. Leaderboard submit & broadcast to room');

  players.forEach(p => p.received = []);
  // Have player 0 submit a leaderboard entry
  players[0].submitLeaderboard(0);
  await sleep(600);

  const lbBroadcastCount = players.filter(p => p.countReceived('leaderboard') >= 1).length;
  assert(lbBroadcastCount >= connected.length - 1,
    `Leaderboard broadcast reached ${lbBroadcastCount}/${connected.length} players after submit`);

  // ── 7. Invalid data rejection (server-side) ───────────────
  header('7. Server rejects invalid data');

  // Player 1 sends a ball_state with NaN position
  players[1].received = [];
  (players[1].ws).send(JSON.stringify({
    type: 'ball_state',
    playerId: players[1].playerId,
    holeIndex: 0,
    ts: Date.now(),
    pos: { x: NaN, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
  }));

  await sleep(300);

  // No other player should have received this invalid message
  const gotInvalidPos = players
    .filter((p, i) => i !== 1)
    .some(p => p.received.some(m => m.type === 'ball_state' && isNaN(m.pos?.x)));
  assert(!gotInvalidPos, 'Server dropped ball_state with NaN position');

  // Player 2 sends a shot with out-of-range power
  players[2].received = [];
  (players[2].ws).send(JSON.stringify({
    type: 'shot',
    playerId: players[2].playerId,
    holeIndex: 0,
    direction: { x: 1, y: 0, z: 0 },
    power: 99999,
  }));

  await sleep(300);
  const gotInvalidShot = players
    .filter((p, i) => i !== 2)
    .some(p => p.received.some(m => m.type === 'shot' && m.power === 99999));
  assert(!gotInvalidShot, 'Server dropped shot with power=99999');

  // ── 8. Rate limit enforcement ─────────────────────────────
  header('8. Rate limiting (flood test)');

  // Player 3 sends 200 ball_state messages as fast as possible
  players.forEach(p => p.received = []);
  const FLOOD_COUNT = 200;
  for (let i = 0; i < FLOOD_COUNT; i++) {
    (players[3].ws).send(JSON.stringify({
      type: 'ball_state',
      playerId: players[3].playerId,
      holeIndex: 0,
      ts: Date.now(),
      pos: { x: i, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
    }));
  }

  await sleep(600);

  // Other players should receive far fewer than 200 (rate limiter in effect)
  const floodReceived = players
    .filter((p, i) => i !== 3)
    .map(p => p.countReceived('ball_state'));
  const avgFloodRecvd = floodReceived.reduce((a, b) => a + b, 0) / floodReceived.length;

  info(`Flood: ${FLOOD_COUNT} msgs sent, avg ${avgFloodRecvd.toFixed(0)} reached peers`);
  assert(avgFloodRecvd < FLOOD_COUNT * 0.5,
    `Rate limiter reduced flood: ${avgFloodRecvd.toFixed(0)} < ${FLOOD_COUNT * 0.5} msgs per peer`);

  // ── 9. Leave / disconnect cleanup ─────────────────────────
  header('9. Leave notification on disconnect');

  players.forEach(p => p.received = []);
  const leavingPlayer = players[NUM_PLAYERS - 1];
  const leavingId     = leavingPlayer.playerId;
  leavingPlayer.disconnect();

  await sleep(600);

  const leaveCount = players
    .filter((p, i) => i < NUM_PLAYERS - 1 && p.connected)
    .filter(p => p.received.some(m => m.type === 'leave' && m.playerId === leavingId))
    .length;

  const stillConnected = players.filter((p, i) => i < NUM_PLAYERS - 1 && p.connected).length;
  assert(leaveCount >= stillConnected - 1,
    `Leave broadcast reached ${leaveCount}/${stillConnected} remaining players`);

  // ── 10. Simultaneous shot burst (race condition check) ────
  header('10. Simultaneous shot burst (all 23 shoot at once)');

  const activePlayers = players.filter((p, i) => i < NUM_PLAYERS - 1 && p.connected);
  activePlayers.forEach(p => p.received = []);

  // Fire all shots at the exact same time
  activePlayers.forEach(p => p.sendShot(1));
  await sleep(800);

  const burstShotCounts = activePlayers.map(p => p.countReceived('shot'));
  const avgBurst        = burstShotCounts.reduce((a, b) => a + b, 0) / burstShotCounts.length;
  const expectedBurst   = activePlayers.length - 1;

  info(`Burst: each player expected ${expectedBurst} shots, got avg ${avgBurst.toFixed(1)}`);
  assert(avgBurst >= expectedBurst * 0.8,
    `Burst delivery ≥ 80%: avg ${avgBurst.toFixed(1)} / ${expectedBurst}`);

  // ── Cleanup ───────────────────────────────────────────────
  header('Cleanup');
  activePlayers.forEach(p => p.disconnect());
  await sleep(300);
  info('All connections closed');

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n${'─'.repeat(42)}`);
  console.log(`Results: ${GREEN}${passCount} passed${RESET}  ${failCount > 0 ? RED : ''}${failCount} failed${RESET}`);
  console.log(`${'─'.repeat(42)}\n`);

  if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(`\n${RED}Fatal error:${RESET}`, err.message);
  process.exit(1);
});
