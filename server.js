const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = fs.readFileSync(path.join(__dirname, 'unreal-connect.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(file);
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server });
const rooms = {}; // { code: { host: ws, joiner: ws|null } }

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on('connection', (ws) => {
  ws._room = null;
  ws._role = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    switch(msg.type) {

      case 'create_room':
        rooms[msg.code] = { host: ws, joiner: null };
        ws._room = msg.code;
        ws._role = 'host';
        send(ws, { type: 'room_created', code: msg.code });
        break;

      case 'join_room':
        var room = rooms[msg.code];
        if (!room) {
          send(ws, { type: 'join_fail', reason: 'Oda bulunamadı' });
          return;
        }
        if (room.joiner) {
          send(ws, { type: 'join_fail', reason: 'Oda dolu' });
          return;
        }
        room.joiner = ws;
        ws._room = msg.code;
        ws._role = 'joiner';
        send(ws, { type: 'join_ok', code: msg.code });
        send(room.host, { type: 'p2_connected' });
        break;

      case 'chat':
      case 'typing':
      case 'game_start':
      case 'round_end':
      case 'replay':
      case 'exit_game':
      case 'move':
        // Relay to the other player
        var r2 = rooms[ws._room];
        if (!r2) return;
        var target = ws._role === 'host' ? r2.joiner : r2.host;
        send(target, msg);
        break;
    }
  });

  ws.on('close', () => {
    var r3 = rooms[ws._room];
    if (!r3) return;
    var other = ws._role === 'host' ? r3.joiner : r3.host;
    send(other, { type: 'player_left' });
    if (ws._role === 'host') delete rooms[ws._room];
    else r3.joiner = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('UNREAL CONNECT sunucusu: http://localhost:' + PORT));
