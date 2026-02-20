/**
 * renderer.js - Table renderer
 *
 * Takes a game state object and renders:
 *  - Player seats positioned around the oval table
 *  - Community cards
 *  - Pot, hand number, action buttons
 *  - Game log
 */

const Renderer = {

    /**
     * Seat positions (%) around the table ellipse.
     * Index maps to seat count → array of {top, left} percentages.
     * Positions go clockwise starting from bottom-center (the "hero" seat).
     */
    seatPositions: {
      2: [
        { top: '100%', left: '50%' },
        { top: '-10%', left: '50%' }
      ],
      3: [
        { top: '100%', left: '50%' },
        { top: '15%', left: '-5%' },
        { top: '15%', left: '105%' }
      ],
      4: [
        { top: '100%', left: '50%' },
        { top: '50%', left: '-5%' },
        { top: '-10%', left: '50%' },
        { top: '50%', left: '105%' }
      ],
      5: [
        { top: '100%', left: '50%' },
        { top: '70%', left: '-5%' },
        { top: '-5%', left: '20%' },
        { top: '-5%', left: '80%' },
        { top: '70%', left: '105%' }
      ],
      6: [
        { top: '100%', left: '50%' },
        { top: '70%', left: '-5%' },
        { top: '5%', left: '5%' },
        { top: '-10%', left: '50%' },
        { top: '5%', left: '95%' },
        { top: '70%', left: '105%' }
      ],
      7: [
        { top: '100%', left: '50%' },
        { top: '80%', left: '-2%' },
        { top: '25%', left: '-5%' },
        { top: '-10%', left: '25%' },
        { top: '-10%', left: '75%' },
        { top: '25%', left: '105%' },
        { top: '80%', left: '102%' }
      ],
      8: [
        { top: '100%', left: '50%' },
        { top: '85%', left: '2%' },
        { top: '40%', left: '-5%' },
        { top: '-5%', left: '15%' },
        { top: '-10%', left: '50%' },
        { top: '-5%', left: '85%' },
        { top: '40%', left: '105%' },
        { top: '85%', left: '98%' }
      ],
      9: [
        { top: '100%', left: '50%' },
        { top: '88%', left: '5%' },
        { top: '50%', left: '-5%' },
        { top: '5%', left: '8%' },
        { top: '-10%', left: '35%' },
        { top: '-10%', left: '65%' },
        { top: '5%', left: '92%' },
        { top: '50%', left: '105%' },
        { top: '88%', left: '95%' }
      ]
    },
  
    /**
     * Reorder players so that the current human player (myId) sits at index 0
     * (bottom center = "hero" position), keeping relative order intact.
     */
    reorderPlayers(players, myId) {
      const myIndex = players.findIndex(p => p.id === myId);
      if (myIndex <= 0) return [...players];
      return [...players.slice(myIndex), ...players.slice(0, myIndex)];
    },
  
    /**
     * Full render of the game state
     */
    render(state, myId, debugMode) {
      this.renderTopBar(state);
      this.renderCommunityCards(state);
      this.renderSeats(state, myId);
      this.renderActionBar(state, myId);
      this.renderLog(state.log);
      if (debugMode) {
        this.renderDebugPanel(state, myId);
      }
    },
  
    renderTopBar(state) {
      document.getElementById('handNum').textContent = `#${state.handNumber}`;
    },
  
    renderCommunityCards(state) {
      const el = document.getElementById('communityCards');
      const potHtml = `<div class="table-pot">Pot: ${state.pot}</div>`;
      const cardsHtml = `<div class="community-row">${Cards.renderCommunityCards(state.communityCards)}</div>`;
      el.innerHTML = potHtml + cardsHtml;
    },
  
    renderSeats(state, myId) {
      const layer = document.getElementById('seatsLayer');
      const ordered = this.reorderPlayers(state.players, myId);
      const count = ordered.length;
      const positions = this.seatPositions[count] || this.seatPositions[9];
  
      // Find dealer in reordered list
      const originalDealer = state.players[state.dealerIndex];
      const dealerReorderedIdx = ordered.findIndex(p => p.id === originalDealer?.id);
  
      let html = '';
  
      ordered.forEach((player, i) => {
        const pos = positions[i] || { top: '50%', left: '50%' };
        const isActive = player.isCurrentPlayer && state.phase !== 'showdown' && state.phase !== 'waiting';
        const isFolded = player.folded;
  
        let classes = 'player-seat';
        if (isActive) classes += ' active';
        if (isFolded) classes += ' folded';
  
        // Cards
        let cardsHtml = '';
        if (player.cards && player.cards.length > 0 && !player.folded) {
          cardsHtml = '<div class="seat-cards">' +
            player.cards.map(c => Cards.renderMiniCard(c)).join('') +
            '</div>';
        }
  
        // Bet — shows current round bet (clears each round automatically from server)
        let betHtml = '';
        if (player.bet > 0) {
          betHtml = `<div class="seat-bet">Bet: ${player.bet}</div>`;
        }
  
        // Status text / showdown hand name
        let statusHtml = '';
        if (state.phase === 'showdown' && !player.folded && state.lastHandResult) {
          // Show hand name at showdown
          const eval_ = state.lastHandResult.evaluations?.[player.id];
          const isWinner = state.lastHandResult.winners?.includes(player.id);
          if (eval_) {
            if (isWinner) {
              statusHtml = `<div class="seat-hand-name winner">Wins with ${eval_.name}</div>`;
            } else {
              statusHtml = `<div class="seat-hand-name">${eval_.name}</div>`;
            }
          }
        } else if (player.folded) {
          statusHtml = '<div class="seat-status">Folded</div>';
        } else if (player.allIn) {
          statusHtml = '<div class="seat-status">All In</div>';
        } else if (player.sittingOut) {
          statusHtml = '<div class="seat-status">Sitting Out</div>';
        }
  
        const avatarClass = player.isBot ? 'is-bot' : 'is-human';
        const avatarLabel = player.isBot ? 'B' : (i + 1);
  
        html += `
          <div class="${classes}" style="top:${pos.top}; left:${pos.left}; transform:translate(-50%,-50%);">
            <div class="seat-avatar ${avatarClass}">${avatarLabel}</div>
            <div class="seat-name">${player.name}</div>
            <div class="seat-chips">${player.chips}</div>
            ${cardsHtml}
            ${betHtml}
            ${statusHtml}
          </div>
        `;
      });
  
      // Dealer chip
      if (dealerReorderedIdx >= 0 && positions[dealerReorderedIdx]) {
        const dPos = positions[dealerReorderedIdx];
        // Offset dealer chip slightly toward center
        html += `<div class="dealer-chip" style="top:calc(${dPos.top} - 30px); left:calc(${dPos.left} + 28px); transform:translate(-50%,-50%);">D</div>`;
      }
  
      layer.innerHTML = html;
    },
  
    renderActionBar(state, myId) {
      const bar = document.getElementById('actionBar');
      const me = state.players.find(p => p.id === myId);
  
      if (!me) {
        bar.innerHTML = '<div class="waiting-msg">Connecting...</div>';
        return;
      }
  
      if (state.phase === 'waiting') {
        bar.innerHTML = '<div class="waiting-msg">Waiting for all players to connect...</div>';
        return;
      }
  
      if (state.phase === 'showdown') {
        const result = state.lastHandResult;
        let msg = 'Showdown!';
        if (result && result.winners) {
          const names = result.winners.map(id => {
            const p = state.players.find(pp => pp.id === id);
            return p ? p.name : id;
          });
          // Get winning hand name
          const firstWinnerId = result.winners[0];
          const eval_ = result.evaluations?.[firstWinnerId];
          const handName = eval_ ? eval_.name : '';
          msg = handName
            ? `${names.join(' & ')} wins with ${handName}!`
            : `${names.join(' & ')} wins!`;
        }
        bar.innerHTML = `<div class="waiting-msg">${msg} — Next hand starting soon...</div>`;
        return;
      }
  
      if (!me.isCurrentPlayer || me.validActions.length === 0) {
        const current = state.players.find(p => p.isCurrentPlayer);
        const who = current ? current.name : '...';
        bar.innerHTML = `<div class="waiting-msg">Waiting for ${who}...</div>`;
        return;
      }
  
      // Render action buttons
      const actions = me.validActions;
      const toCall = state.currentBet - me.bet;
      let html = '';
  
      if (actions.includes('fold')) {
        html += `<button class="action-btn fold" onclick="GameClient.sendAction('fold')">Fold</button>`;
      }
      if (actions.includes('check')) {
        html += `<button class="action-btn check" onclick="GameClient.sendAction('check')">Check</button>`;
      }
      if (actions.includes('call')) {
        html += `<button class="action-btn call" onclick="GameClient.sendAction('call')">Call ${toCall}</button>`;
      }
      if (actions.includes('raise')) {
        const minRaise = state.currentBet + state.minRaise;
        const maxRaise = me.bet + me.chips;
        html += `
          <div class="raise-group">
            <button class="action-btn raise" onclick="GameClient.sendRaise()">Raise</button>
            <input type="range" id="raiseSlider" min="${minRaise}" max="${maxRaise}" value="${minRaise}"
              oninput="document.getElementById('raiseVal').textContent = this.value">
            <span class="raise-amount" id="raiseVal">${minRaise}</span>
          </div>
        `;
      }
      if (actions.includes('allin')) {
        html += `<button class="action-btn allin" onclick="GameClient.sendAction('allin')">All In</button>`;
      }
  
      bar.innerHTML = html;
    },
  
    renderLog(logEntries) {
      const container = document.getElementById('logEntries');
      if (!logEntries) return;
  
      container.innerHTML = logEntries.map(entry =>
        `<div class="log-entry">${entry.message}</div>`
      ).join('');
  
      const logBox = document.getElementById('gameLog');
      logBox.scrollTop = logBox.scrollHeight;
    },
  
    // ==================== Debug Panel ====================
  
    renderDebugPanel(state, myId) {
      let panel = document.getElementById('debugPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'debugPanel';
        panel.className = 'debug-panel';
        document.getElementById('game-screen').appendChild(panel);
      }
  
      const currentPlayer = state.currentPlayerIndex >= 0 ? state.players[state.currentPlayerIndex] : null;
      const isBotTurn = currentPlayer && currentPlayer.isBot;
      const isPreflop = state.phase === 'preflop';
      const isWaiting = state.phase === 'waiting';
      const isShowdown = state.phase === 'showdown';
  
      let html = '<div class="debug-title">⚙ Debug Mode</div>';
  
      // Section 1: Card assignment (show during preflop or waiting)
      if (isPreflop || isWaiting) {
        html += this.renderCardPicker(state);
      }
  
      // Section 2: Bot action control (when it's a bot's turn)
      if (isBotTurn && !isShowdown) {
        html += `<div class="debug-section">`;
        html += `<div class="debug-section-title">${currentPlayer.name}'s Turn — Choose Action:</div>`;
        html += `<div class="debug-bot-actions">`;
  
        const validActions = ['fold', 'check', 'call'];
        // Determine which actions make sense
        const toCall = state.currentBet - currentPlayer.bet;
        if (toCall <= 0) {
          html += `<button class="debug-bot-btn check" onclick="GameClient.sendDebugBotAction('${currentPlayer.id}','check')">Check</button>`;
        } else {
          html += `<button class="debug-bot-btn call" onclick="GameClient.sendDebugBotAction('${currentPlayer.id}','call')">Call ${toCall}</button>`;
        }
        html += `<button class="debug-bot-btn fold" onclick="GameClient.sendDebugBotAction('${currentPlayer.id}','fold')">Fold</button>`;
  
        html += `</div></div>`;
      }
  
      // Section 3: Current state info
      html += `<div class="debug-section">`;
      html += `<div class="debug-section-title">State</div>`;
      html += `<div style="font-size:0.65rem;color:var(--text-dim);line-height:1.6;">`;
      html += `Phase: ${state.phase}<br>`;
      html += `Pot: ${state.pot}<br>`;
      html += `Current Bet: ${state.currentBet}<br>`;
      if (currentPlayer) html += `Acting: ${currentPlayer.name}`;
      html += `</div></div>`;
  
      panel.innerHTML = html;
    },
  
    renderCardPicker(state) {
      const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
      const SUITS = [
        { key: 's', sym: '♠', red: false },
        { key: 'h', sym: '♥', red: true },
        { key: 'd', sym: '♦', red: true },
        { key: 'c', sym: '♣', red: false }
      ];
      const DISPLAY = { 'T': '10' };
  
      // Track which cards are already assigned
      const usedCards = new Set();
      state.players.forEach(p => {
        if (p.cards) p.cards.forEach(c => {
          if (!c.hidden) usedCards.add(c.rank + c.suit);
        });
      });
  
      // Build a grid of all 52 cards
      let html = '<div class="debug-section">';
      html += '<div class="debug-section-title">Card Picker — click to select, then assign</div>';
      html += '<div class="debug-card-grid">';
  
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          const key = rank + suit.key;
          const display = (DISPLAY[rank] || rank) + suit.sym;
          const used = usedCards.has(key) ? ' used' : '';
          const redClass = suit.red ? ' card-red' : '';
          const selected = (window._debugSelectedCards || []).includes(key) ? ' selected' : '';
          html += `<button class="debug-card-btn${redClass}${used}${selected}" onclick="Renderer.debugSelectCard('${key}')">${display}</button>`;
        }
      }
      html += '</div></div>';
  
      // Show selected cards and assign buttons
      const selected = window._debugSelectedCards || [];
      if (selected.length > 0) {
        html += '<div class="debug-section">';
        html += '<div class="debug-section-title">Selected: ';
        html += selected.map(k => {
          const r = k[0], s = k.slice(1);
          const sym = { s:'♠', h:'♥', d:'♦', c:'♣' }[s];
          const dr = DISPLAY[r] || r;
          return `<span class="debug-assigned-card">${dr}${sym}</span>`;
        }).join(' ');
        html += '</div>';
  
        // Assign to player buttons
        html += '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">';
        state.players.forEach(p => {
          if (selected.length === 2) {
            html += `<button class="debug-btn confirm" style="width:auto;padding:4px 10px;font-size:0.65rem;" onclick="Renderer.debugAssignCards('${p.id}')">${p.name}</button>`;
          }
        });
        if (selected.length >= 3 && selected.length <= 5) {
          html += `<button class="debug-btn confirm" style="width:auto;padding:4px 10px;font-size:0.65rem;" onclick="Renderer.debugAssignCommunity()">Community</button>`;
        }
        html += `<button class="debug-btn" style="width:auto;padding:4px 10px;font-size:0.65rem;background:rgba(255,255,255,0.05);color:var(--text-dim);" onclick="Renderer.debugClearSelection()">Clear</button>`;
        html += '</div></div>';
      }
  
      return html;
    },
  
    // Debug helper methods
    debugSelectCard(cardKey) {
      if (!window._debugSelectedCards) window._debugSelectedCards = [];
      const idx = window._debugSelectedCards.indexOf(cardKey);
      if (idx >= 0) {
        window._debugSelectedCards.splice(idx, 1);
      } else {
        if (window._debugSelectedCards.length < 5) {
          window._debugSelectedCards.push(cardKey);
        }
      }
      // Re-render debug panel
      if (GameClient.lastState) {
        this.renderDebugPanel(GameClient.lastState, GameClient.playerId);
      }
    },
  
    debugAssignCards(playerId) {
      const selected = window._debugSelectedCards || [];
      if (selected.length !== 2) return;
  
      const cards = selected.map(k => ({ rank: k[0], suit: k.slice(1) }));
  
      if (!window._debugAssignments) window._debugAssignments = {};
      window._debugAssignments[playerId] = cards;
  
      // Send to server
      GameClient.sendDebugSetCards(window._debugAssignments);
  
      window._debugSelectedCards = [];
      if (GameClient.lastState) {
        this.renderDebugPanel(GameClient.lastState, GameClient.playerId);
      }
    },
  
    debugAssignCommunity() {
      const selected = window._debugSelectedCards || [];
      if (selected.length < 3 || selected.length > 5) return;
  
      const cards = selected.map(k => ({ rank: k[0], suit: k.slice(1) }));
  
      if (!window._debugAssignments) window._debugAssignments = {};
      window._debugAssignments.community = cards;
  
      GameClient.sendDebugSetCards(window._debugAssignments);
  
      window._debugSelectedCards = [];
      if (GameClient.lastState) {
        this.renderDebugPanel(GameClient.lastState, GameClient.playerId);
      }
    },
  
    debugClearSelection() {
      window._debugSelectedCards = [];
      if (GameClient.lastState) {
        this.renderDebugPanel(GameClient.lastState, GameClient.playerId);
      }
    }
  };