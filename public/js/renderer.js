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
    render(state, myId) {
      this.renderTopBar(state);
      this.renderCommunityCards(state);
      this.renderSeats(state, myId);
      this.renderActionBar(state, myId);
      this.renderLog(state.log);
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
  
      // Auto-scroll to bottom
      const logBox = document.getElementById('gameLog');
      logBox.scrollTop = logBox.scrollHeight;
    }
  };