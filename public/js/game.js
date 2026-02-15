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

  /**
   * Initialize: parse URL params and connect WebSocket
   */
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

  /**
   * Establish WebSocket connection
   */
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

  /**
   * Handle incoming messages from the server
   */
  handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this.playerId = msg.playerId;
        this.roomId = msg.roomId;
        console.log(`Joined as ${this.playerId}`);
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

  /**
   * Update the rendered game state
   */
  updateState(state) {
    this.lastState = state;
    Renderer.render(state, this.playerId);
  },

  /**
   * Send a player action to the server
   */
  sendAction(action, amount) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    const msg = { type: 'action', action };
    if (amount !== undefined) {
      msg.amount = parseInt(amount);
    }

    this.ws.send(JSON.stringify(msg));
  },

  /**
   * Send a raise action with the slider value
   */
  sendRaise() {
    const slider = document.getElementById('raiseSlider');
    if (slider) {
      this.sendAction('raise', slider.value);
    }
  },

  /**
   * Show an error message on screen
   */
  showError(text) {
    const bar = document.getElementById('actionBar');
    bar.innerHTML = `<div class="waiting-msg" style="color:var(--red);">${text}</div>`;
  }
};

// Start when page loads
window.addEventListener('DOMContentLoaded', () => {
  GameClient.init();
});