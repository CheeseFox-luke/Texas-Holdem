/**
 * Room.js - 房间管理
 * 
 * 职责：
 * - 创建房间，生成唯一 room ID
 * - 为每个人类玩家生成专属 token 链接
 * - 管理 WebSocket 连接（玩家加入/断开）
 * - 驱动机器人自动行动
 * - 控制游戏开始/下一手牌
 */

const crypto = require('crypto');
const { Game, PHASES, ACTIONS } = require('./Game');
const { Bot } = require('./Bot');

// 生成短随机 ID
function generateId(length = 6) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

class Room {
  /**
   * @param {Object} options
   * @param {number} options.humanCount - 人类玩家数量
   * @param {number} options.botCount - 机器人数量
   * @param {number} options.smallBlind
   * @param {number} options.bigBlind
   * @param {number} options.startingChips
   */
  constructor(options) {
    this.id = generateId(6);
    this.humanCount = options.humanCount || 1;
    this.botCount = options.botCount || 1;
    this.createdAt = Date.now();

    // 初始化游戏引擎
    this.game = new Game({
      smallBlind: options.smallBlind || 1,
      bigBlind: options.bigBlind || 2,
      startingChips: options.startingChips || 100
    });

    // 人类玩家 token → player ID 的映射
    this.playerTokens = {};  // { token: playerId }
    this.playerSockets = {}; // { playerId: ws }

    // 生成人类玩家的 token
    this.humanSlots = [];
    for (let i = 0; i < this.humanCount; i++) {
      const token = generateId(12);
      const playerId = `human_${i + 1}`;
      const name = `Player ${i + 1}`;
      this.playerTokens[token] = playerId;
      this.humanSlots.push({ playerId, name, token, connected: false });
    }

    // 添加机器人
    const botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta',
                       'Bot Epsilon', 'Bot Zeta', 'Bot Eta', 'Bot Theta'];
    for (let i = 0; i < this.botCount; i++) {
      const botId = `bot_${i + 1}`;
      const botName = botNames[i] || `Bot ${i + 1}`;
      this.game.addPlayer(botId, botName, true);
    }

    this.started = false;
    this.debugMode = options.debugMode || false;
    this.botActionDelay = this.debugMode ? 0 : 1500; // No auto-delay in debug
  }

  /**
   * 获取所有人类玩家的链接信息
   */
  getPlayerLinks(baseUrl) {
    return this.humanSlots.map(slot => ({
      playerId: slot.playerId,
      name: slot.name,
      token: slot.token,
      url: `${baseUrl}/game.html?room=${this.id}&token=${slot.token}`,
      connected: slot.connected
    }));
  }

  /**
   * 玩家通过 token 加入房间
   * @returns {{ success: boolean, playerId?: string, error?: string }}
   */
  joinPlayer(token, ws) {
    const playerId = this.playerTokens[token];
    if (!playerId) {
      return { success: false, error: 'Invalid token' };
    }

    const slot = this.humanSlots.find(s => s.playerId === playerId);
    if (!slot) {
      return { success: false, error: 'Player slot not found' };
    }

    // 如果玩家还没被添加到游戏中，添加
    const existingPlayer = this.game.players.find(p => p.id === playerId);
    if (!existingPlayer) {
      this.game.addPlayer(playerId, slot.name, false);
    } else {
      existingPlayer.connected = true;
      existingPlayer.sittingOut = false;
    }

    slot.connected = true;
    this.playerSockets[playerId] = ws;

    // 检查是否所有人类都已连接，自动开始
    this.checkAutoStart();

    return { success: true, playerId };
  }

  /**
   * 玩家断开连接
   */
  disconnectPlayer(playerId) {
    const slot = this.humanSlots.find(s => s.playerId === playerId);
    if (slot) {
      slot.connected = false;
    }

    const player = this.game.players.find(p => p.id === playerId);
    if (player) {
      player.connected = false;
    }

    delete this.playerSockets[playerId];
  }

  /**
   * 检查是否可以自动开始游戏
   */
  checkAutoStart() {
    if (this.started) return;

    const allConnected = this.humanSlots.every(s => s.connected);
    if (allConnected) {
      this.started = true;
      this.startNewHand();
    }
  }

  /**
   * 开始新一手牌
   */
  startNewHand() {
    const success = this.game.startHand();
    if (!success) return;

    this.broadcastState();

    // 如果当前行动的是机器人，触发机器人行动
    this.checkBotAction();
  }

  /**
   * 处理人类玩家的操作
   */
  handlePlayerAction(playerId, action, amount) {
    const player = this.game.players.find(p => p.id === playerId);
    if (!player || player.isBot) {
      return { success: false, error: 'Invalid player' };
    }

    const result = this.game.handleAction(playerId, action, amount);
    if (!result.success) return result;

    this.broadcastState();

    // 如果游戏结束了（showdown），延迟后开始下一手
    if (this.game.phase === PHASES.SHOWDOWN) {
      this.scheduleNextHand();
      return result;
    }

    // 检查下一个是否是机器人
    this.checkBotAction();
    return result;
  }

  /**
   * 检查当前是否轮到机器人行动，如果是则自动执行
   */
  checkBotAction() {
    if (this.game.phase === PHASES.WAITING || this.game.phase === PHASES.SHOWDOWN) {
      return;
    }

    const currentIndex = this.game.currentPlayerIndex;
    if (currentIndex < 0) return;

    const currentPlayer = this.game.players[currentIndex];
    if (!currentPlayer || !currentPlayer.isBot) return;

    // In debug mode: don't auto-act, wait for debug_bot_action from player
    if (this.debugMode) {
      // Broadcast state so the debug player sees it's the bot's turn
      this.broadcastState();
      return;
    }

    // Normal mode: auto-act after delay
    setTimeout(() => {
      this.executeBotAction(currentPlayer);
    }, this.botActionDelay);
  }

  /**
   * 执行机器人的行动
   */
  executeBotAction(botPlayer) {
    if (this.game.phase === PHASES.WAITING || this.game.phase === PHASES.SHOWDOWN) {
      return;
    }

    const validActions = this.game.getValidActions(botPlayer.id);
    if (validActions.length === 0) return;

    const decision = Bot.decide(validActions);
    const result = this.game.handleAction(botPlayer.id, decision.action, decision.amount);

    if (result.success) {
      this.broadcastState();

      if (this.game.phase === PHASES.SHOWDOWN) {
        this.scheduleNextHand();
        return;
      }

      // 继续检查下一个是否也是机器人
      this.checkBotAction();
    }
  }

  /**
   * 延迟后开始下一手牌
   */
  scheduleNextHand() {
    setTimeout(() => {
      // 移除没筹码的玩家
      for (const p of this.game.players) {
        if (p.chips <= 0) {
          p.sittingOut = true;
        }
      }

      const activePlayers = this.game.players.filter(p => !p.sittingOut && p.chips > 0);
      if (activePlayers.length >= 2) {
        this.startNewHand();
      } else {
        // 游戏结束，只剩一个玩家
        this.game.addLog('Game over!');
        this.broadcastState();
      }
    }, 4000); // 4秒后开始下一手
  }

  // ==================== Debug Methods ====================

  /**
   * Debug: manually assign cards to players and community
   * @param {Object} assignments - { playerId: [{rank,suit},{rank,suit}], community: [{rank,suit},...] }
   */
  debugSetCards(assignments) {
    if (!this.debugMode) return;

    const game = this.game;

    // Set player cards
    for (const [playerId, cards] of Object.entries(assignments)) {
      if (playerId === 'community') continue;
      const player = game.players.find(p => p.id === playerId);
      if (player && cards && cards.length === 2) {
        player.cards = cards.map(c => ({ rank: c.rank, suit: c.suit }));
      }
    }

    // Set community cards (will be revealed phase by phase)
    if (assignments.community) {
      game.debugCommunityCards = assignments.community.map(c => ({ rank: c.rank, suit: c.suit }));
    }

    this.broadcastState();
  }

  /**
   * Debug: manually execute a bot's action
   */
  debugBotAction(botId, action, amount) {
    if (!this.debugMode) return;

    const bot = this.game.players.find(p => p.id === botId && p.isBot);
    if (!bot) return;

    const result = this.game.handleAction(botId, action, amount);
    if (result.success) {
      this.broadcastState();

      if (this.game.phase === PHASES.SHOWDOWN) {
        this.scheduleNextHand();
        return;
      }

      // Check if next player is also a bot (still need debug player to control)
      this.checkBotAction();
    }
  }

  // ==================== Network ====================

  /**
   * 向所有已连接的人类玩家广播游戏状态
   */
  broadcastState() {
    for (const [playerId, ws] of Object.entries(this.playerSockets)) {
      if (ws.readyState === 1) {
        const state = this.game.getState(playerId, this.debugMode);
        ws.send(JSON.stringify({
          type: 'game_state',
          state
        }));
      }
    }
  }

  /**
   * 向单个玩家发送消息
   */
  sendToPlayer(playerId, message) {
    const ws = this.playerSockets[playerId];
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 获取房间基本信息（用于大厅展示）
   */
  getInfo() {
    return {
      id: this.id,
      humanCount: this.humanCount,
      botCount: this.botCount,
      totalPlayers: this.humanCount + this.botCount,
      connectedPlayers: this.humanSlots.filter(s => s.connected).length,
      started: this.started,
      debugMode: this.debugMode,
      phase: this.game.phase,
      handNumber: this.game.handNumber
    };
  }
}

// 房间管理器：管理所有房间
class RoomManager {
  constructor() {
    this.rooms = {}; // { roomId: Room }
  }

  createRoom(options) {
    const room = new Room(options);
    this.rooms[room.id] = room;
    return room;
  }

  getRoom(roomId) {
    return this.rooms[roomId] || null;
  }

  removeRoom(roomId) {
    delete this.rooms[roomId];
  }

  /**
   * 清理超过一定时间没活动的房间
   */
  cleanup(maxAgeMs = 3600000) { // 默认 1 小时
    const now = Date.now();
    for (const [id, room] of Object.entries(this.rooms)) {
      if (now - room.createdAt > maxAgeMs) {
        this.removeRoom(id);
      }
    }
  }
}

module.exports = { Room, RoomManager };