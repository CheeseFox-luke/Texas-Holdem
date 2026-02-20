/**
 * index.js - 服务器入口
 * 
 * - Express 提供静态文件 (public/)
 * - POST /api/create-room 创建房间
 * - GET /api/room/:id 查询房间信息
 * - WebSocket 处理玩家实时连接和操作
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { RoomManager } = require('./Room');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const roomManager = new RoomManager();

// JSON body parsing
app.use(express.json());

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==================== REST API ====================

/**
 * POST /api/create-room
 * Body: { humanCount, botCount, smallBlind?, bigBlind?, startingChips? }
 * Returns: { roomId, playerLinks }
 */
app.post('/api/create-room', (req, res) => {
  const { humanCount, botCount, smallBlind, bigBlind, startingChips, debugMode } = req.body;

  // 验证
  const humans = parseInt(humanCount) || 1;
  const bots = parseInt(botCount) || 1;
  const total = humans + bots;

  if (total < 2 || total > 9) {
    return res.status(400).json({ error: 'Total players must be between 2 and 9' });
  }
  if (humans < 1) {
    return res.status(400).json({ error: 'At least 1 human player required' });
  }

  const room = roomManager.createRoom({
    humanCount: humans,
    botCount: bots,
    smallBlind: parseInt(smallBlind) || 1,
    bigBlind: parseInt(bigBlind) || 2,
    startingChips: parseInt(startingChips) || 100,
    debugMode: !!debugMode
  });

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const playerLinks = room.getPlayerLinks(baseUrl);

  console.log(`Room created: ${room.id} (${humans} humans, ${bots} bots)`);

  res.json({
    roomId: room.id,
    playerLinks,
    roomInfo: room.getInfo()
  });
});

/**
 * GET /api/room/:id
 * Returns room info
 */
app.get('/api/room/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.getInfo());
});

// ==================== WebSocket ====================

wss.on('connection', (ws, req) => {
  // 从 URL 参数获取 room 和 token
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');
  const token = url.searchParams.get('token');

  if (!roomId || !token) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing room or token' }));
    ws.close();
    return;
  }

  const room = roomManager.getRoom(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    ws.close();
    return;
  }

  // 玩家加入房间
  const joinResult = room.joinPlayer(token, ws);
  if (!joinResult.success) {
    ws.send(JSON.stringify({ type: 'error', message: joinResult.error }));
    ws.close();
    return;
  }

  const playerId = joinResult.playerId;
  console.log(`Player ${playerId} connected to room ${roomId}`);

  // 发送欢迎消息 + 当前状态
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId,
    roomId,
    debugMode: room.debugMode || false,
    state: room.game.getState(playerId)
  }));

  // 处理玩家消息
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'action':
          // Player action: { type: 'action', action: 'fold'|'call'|'raise'|'check'|'allin', amount?: number }
          const result = room.handlePlayerAction(playerId, msg.action, msg.amount);
          if (!result.success) {
            ws.send(JSON.stringify({ type: 'error', message: result.error }));
          }
          break;

        case 'debug_set_cards':
          // { type: 'debug_set_cards', assignments: { playerId: [card, card], community: [card...] } }
          if (room.debugMode) {
            room.debugSetCards(msg.assignments);
          }
          break;

        case 'debug_bot_action':
          // { type: 'debug_bot_action', botId: 'bot_1', action: 'fold'|'call'|'check' }
          if (room.debugMode) {
            room.debugBotAction(msg.botId, msg.action, msg.amount);
          }
          break;

        case 'debug_start_hand':
          // Start a new hand in debug mode
          if (room.debugMode) {
            room.startNewHand();
          }
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // 断开连接
  ws.on('close', () => {
    console.log(`Player ${playerId} disconnected from room ${roomId}`);
    room.disconnectPlayer(playerId);
  });
});

// ==================== 启动 ====================

// 定期清理过期房间（每 10 分钟）
setInterval(() => {
  roomManager.cleanup(3600000); // 1 小时
}, 600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Texas Hold'em server running on http://localhost:${PORT}`);
});