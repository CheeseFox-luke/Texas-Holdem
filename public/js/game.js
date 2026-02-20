/**
 * game.js - Game client
 *
 * Connects to the server via WebSocket, receives game state updates,
 * and sends player actions.
 */

const GameClient = {

  ws: null,
  playerId: null,
  roomId: null,
  token: null,
  lastState: null,
  debugMode: false,

  init() {
    const params = new URLSearchParams(window.location.search);
    this.roomId = params.get('room');
    this.token = params.get('token');

    if (!this.roomId || !this.token) {
      this.showError('Invalid link — missing room or token.');
      return;
    }

    document.getElementById('roomLabel').textContent = this.roomId;
    this.connect();
  },

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}?room=${this.roomId}&token=${this.token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      setTimeout(() => {
        console.log('Attempting reconnect...');
        this.connect();
      }, 3000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  },

  handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this.playerId = msg.playerId;
        this.roomId = msg.roomId;
        this.debugMode = msg.debugMode || false;
        console.log(`Joined as ${this.playerId}${this.debugMode ? ' [DEBUG]' : ''}`);
        if (msg.state) {
          this.updateState(msg.state);
        }
        break;

      case 'game_state':
        this.updateState(msg.state);
        break;

      case 'error':
        console.error('Server error:', msg.message);
        break;

      default:
        console.log('Unknown message:', msg);
    }
  },

  updateState(state) {
    this.lastState = state;
    Renderer.render(state, this.playerId, this.debugMode);
  },

  sendAction(action, amount) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = { type: 'action', action };
    if (amount !== undefined) msg.amount = parseInt(amount);
    this.ws.send(JSON.stringify(msg));
  },

  sendRaise() {
    const slider = document.getElementById('raiseSlider');
    if (slider) this.sendAction('raise', slider.value);
  },

  // Debug methods
  sendDebugBotAction(botId, action) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'debug_bot_action', botId, action }));
  },

  sendDebugSetCards(assignments) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'debug_set_cards', assignments }));
  },

  showError(text) {
    const bar = document.getElementById('actionBar');
    bar.innerHTML = `<div class="waiting-msg" style="color:var(--red);">${text}</div>`;
  }
};

// Start when page loads
window.addEventListener('DOMContentLoaded', () => {
  GameClient.init();
});