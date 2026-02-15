/**
 * Game.js - Texas Hold'em Game Engine
 *
 * Flow: WAITING → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN → next hand
 *
 * Rules:
 * - Starting chips: 100
 * - Small blind = 1, Big blind = 2
 * - First hand: Player 1 (index 0) is dealer
 * - 3+ players: dealer+1 = SB, dealer+2 = BB
 * - Heads-up: dealer = SB, other = BB
 * - Preflop: UTG (left of BB) acts first
 * - Postflop: SB (or next active after dealer) acts first, dealer acts last
 * - If someone raises, they become temporary last actor
 * - All-in players skip future actions, do NOT change last-actor
 * - After each hand, dealer rotates one seat clockwise
 */

const { Deck, cardToString } = require('./Deck');
const { evaluateBest, determineWinners, HAND_NAMES } = require('./HandEvaluator');

const PHASES = {
  WAITING: 'waiting',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown'
};

const ACTIONS = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  RAISE: 'raise',
  ALL_IN: 'allin'
};

class Game {
  constructor(options = {}) {
    this.smallBlind = options.smallBlind || 1;
    this.bigBlind = options.bigBlind || 2;
    this.startingChips = options.startingChips || 100;

    this.players = [];
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.phase = PHASES.WAITING;

    // Dealer starts at -1 so first startHand() advances to index 0 (Player 1)
    this.dealerIndex = -1;
    this.sbIndex = -1;
    this.bbIndex = -1;

    this.currentPlayerIndex = -1;
    this.currentBet = 0;
    this.minRaise = 0;
    this.lastRaiserIndex = -1;
    this.roundStartIndex = -1;

    this.handNumber = 0;
    this.log = [];
    this.lastHandResult = null;
  }

  // ==================== Player Management ====================

  addPlayer(id, name, isBot = false) {
    if (this.players.length >= 9) {
      throw new Error('Table is full (max 9 players)');
    }
    const player = {
      id, name, isBot,
      chips: this.startingChips,
      cards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      sittingOut: false,
      connected: !isBot
    };
    this.players.push(player);
    this.addLog(`${name} joined the table`);
    return player;
  }

  /** Players still in the hand (not folded, not sitting out) */
  getActivePlayers() {
    return this.players.filter(p => !p.folded && !p.sittingOut);
  }

  /** Players who can still act (not folded, not all-in, have chips) */
  getActionablePlayers() {
    return this.players.filter(p => !p.folded && !p.allIn && !p.sittingOut && p.chips > 0);
  }

  /** Next active player clockwise (not folded, not sitting out) */
  nextActiveIndex(fromIndex) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n;
      const p = this.players[idx];
      if (!p.folded && !p.sittingOut) return idx;
    }
    return -1;
  }

  /** Next actionable player clockwise (can still bet) */
  nextActionableIndex(fromIndex) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n;
      const p = this.players[idx];
      if (!p.folded && !p.allIn && !p.sittingOut && p.chips > 0) return idx;
    }
    return -1;
  }

  // ==================== Game Flow ====================

  startHand() {
    const eligible = this.players.filter(p => !p.sittingOut && p.chips > 0);
    if (eligible.length < 2) {
      this.addLog('Not enough players to start');
      return false;
    }

    this.handNumber++;
    this.addLog(`=== Hand #${this.handNumber} ===`);

    // Reset
    this.deck.reset();
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastHandResult = null;

    for (const p of this.players) {
      p.cards = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = p.sittingOut || p.chips <= 0;
      p.allIn = false;
    }

    // Rotate dealer clockwise (first hand: -1 → 0 = Player 1)
    this.dealerIndex = this.nextActiveIndex(this.dealerIndex);
    this.assignBlinds();

    // Deal 2 cards to each active player
    const active = this.getActivePlayers();
    for (let round = 0; round < 2; round++) {
      for (const p of active) {
        p.cards.push(this.deck.deal());
      }
    }

    // Post forced blinds
    this.postBlinds();

    // Start preflop betting
    this.phase = PHASES.PREFLOP;
    this.setupPreflopBetting();

    return true;
  }

  assignBlinds() {
    const active = this.getActivePlayers();
    if (active.length === 2) {
      // Heads-up: dealer = SB, other = BB
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this.nextActiveIndex(this.dealerIndex);
    } else {
      // 3+: dealer+1 = SB, dealer+2 = BB
      this.sbIndex = this.nextActiveIndex(this.dealerIndex);
      this.bbIndex = this.nextActiveIndex(this.sbIndex);
    }
  }

  postBlinds() {
    const sbPlayer = this.players[this.sbIndex];
    const bbPlayer = this.players[this.bbIndex];

    const sbAmount = Math.min(this.smallBlind, sbPlayer.chips);
    this.placeBet(this.sbIndex, sbAmount);
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;
    this.addLog(`${sbPlayer.name} posts small blind ${sbAmount}`);

    const bbAmount = Math.min(this.bigBlind, bbPlayer.chips);
    this.placeBet(this.bbIndex, bbAmount);
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;
    this.addLog(`${bbPlayer.name} posts big blind ${bbAmount}`);

    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
  }

  /** Preflop: UTG (left of BB) acts first */
  setupPreflopBetting() {
    const utgIndex = this.nextActionableIndex(this.bbIndex);
    if (utgIndex === -1) {
      this.advancePhase();
      return;
    }
    this.currentPlayerIndex = utgIndex;
    this.roundStartIndex = utgIndex;
    this.lastRaiserIndex = -1;
  }

  /** Postflop: first actionable player after dealer acts first */
  setupPostflopBetting() {
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiserIndex = -1;

    const actionable = this.getActionablePlayers();
    if (actionable.length <= 1) {
      this.advancePhase();
      return;
    }

    const firstActor = this.nextActionableIndex(this.dealerIndex);
    if (firstActor === -1) {
      this.advancePhase();
      return;
    }

    this.currentPlayerIndex = firstActor;
    this.roundStartIndex = firstActor;
  }

  // ==================== Player Actions ====================

  handleAction(playerId, action, amount = 0) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, error: 'Player not found' };
    }
    if (playerIndex !== this.currentPlayerIndex) {
      return { success: false, error: 'Not your turn' };
    }
    if (this.phase === PHASES.WAITING || this.phase === PHASES.SHOWDOWN) {
      return { success: false, error: 'Cannot act in current phase' };
    }

    const validActions = this.getValidActions(playerId);
    if (!validActions.includes(action)) {
      return { success: false, error: `Invalid action: ${action}` };
    }

    switch (action) {
      case ACTIONS.FOLD:  this.doFold(playerIndex); break;
      case ACTIONS.CHECK: this.doCheck(playerIndex); break;
      case ACTIONS.CALL:  this.doCall(playerIndex); break;
      case ACTIONS.RAISE:
        const r = this.doRaise(playerIndex, amount);
        if (!r.success) return r;
        break;
      case ACTIONS.ALL_IN: this.doAllIn(playerIndex); break;
    }

    // Only 1 player left → wins by fold
    if (this.getActivePlayers().length === 1) {
      this.endHandByFold();
      return { success: true, gameUpdate: this.getState() };
    }

    this.moveToNextPlayer();
    return { success: true, gameUpdate: this.getState() };
  }

  getValidActions(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.folded || player.allIn) return [];

    const actions = [ACTIONS.FOLD];
    const toCall = this.currentBet - player.bet;

    if (toCall <= 0) {
      actions.push(ACTIONS.CHECK);
    } else if (toCall < player.chips) {
      actions.push(ACTIONS.CALL);
    }

    if (player.chips > toCall && player.chips > 0) {
      actions.push(ACTIONS.RAISE);
    }

    if (player.chips > 0) {
      actions.push(ACTIONS.ALL_IN);
    }

    return actions;
  }

  doFold(idx) {
    this.players[idx].folded = true;
    this.addLog(`${this.players[idx].name} folds`);
  }

  doCheck(idx) {
    this.addLog(`${this.players[idx].name} checks`);
  }

  doCall(idx) {
    const p = this.players[idx];
    const toCall = Math.min(this.currentBet - p.bet, p.chips);
    this.placeBet(idx, p.bet + toCall);
    if (p.chips === 0) {
      p.allIn = true;
      this.addLog(`${p.name} calls ${toCall} (ALL IN)`);
    } else {
      this.addLog(`${p.name} calls ${toCall}`);
    }
  }

  doRaise(idx, amount) {
    const p = this.players[idx];
    if (amount < this.currentBet + this.minRaise && amount < p.bet + p.chips) {
      return { success: false, error: `Minimum raise is ${this.currentBet + this.minRaise}` };
    }

    const totalBet = Math.min(amount, p.bet + p.chips);
    this.placeBet(idx, totalBet);

    if (totalBet > this.currentBet) {
      this.minRaise = Math.max(this.minRaise, totalBet - this.currentBet);
      this.currentBet = totalBet;
      // Raiser becomes last actor — but NOT if they went all-in
      if (p.chips > 0) {
        this.lastRaiserIndex = idx;
      }
    }

    if (p.chips === 0) {
      p.allIn = true;
      this.addLog(`${p.name} raises to ${totalBet} (ALL IN)`);
    } else {
      this.addLog(`${p.name} raises to ${totalBet}`);
    }
    return { success: true };
  }

  doAllIn(idx) {
    const p = this.players[idx];
    const allInAmount = p.bet + p.chips;
    this.placeBet(idx, allInAmount);
    p.allIn = true;

    if (allInAmount > this.currentBet) {
      this.minRaise = Math.max(this.minRaise, allInAmount - this.currentBet);
      this.currentBet = allInAmount;
      // All-in does NOT affect last-actor
    }

    this.addLog(`${p.name} ALL IN ${allInAmount}`);
  }

  placeBet(idx, totalBet) {
    const p = this.players[idx];
    const diff = totalBet - p.bet;
    const actual = Math.min(diff, p.chips);
    p.chips -= actual;
    p.bet += actual;
    p.totalBet += actual;
  }

  // ==================== Round Progression ====================

  moveToNextPlayer() {
    const nextIdx = this.nextActionableIndex(this.currentPlayerIndex);

    // No one can act
    if (nextIdx === -1) {
      this.endBettingRound();
      return;
    }

    // Came back to raiser → round over
    if (this.lastRaiserIndex !== -1 && nextIdx === this.lastRaiserIndex) {
      this.endBettingRound();
      return;
    }

    // No raise happened: round ends when we loop back to start and all bets match
    if (this.lastRaiserIndex === -1) {
      const allMatched = this.getActionablePlayers().every(p => p.bet === this.currentBet);

      if (allMatched && nextIdx === this.roundStartIndex) {
        // Preflop special: BB gets option to check/raise
        if (this.phase === PHASES.PREFLOP) {
          const bb = this.players[this.bbIndex];
          if (!bb.folded && !bb.allIn && bb.chips > 0 && nextIdx === this.bbIndex) {
            // Give BB one action, then end
            this.currentPlayerIndex = nextIdx;
            this.roundStartIndex = -999; // ensure next pass ends the round
            return;
          }
        }
        this.endBettingRound();
        return;
      }
    }

    this.currentPlayerIndex = nextIdx;
  }

  endBettingRound() {
    this.collectBets();
    this.advancePhase();
  }

  collectBets() {
    for (const p of this.players) {
      this.pot += p.bet;
      p.bet = 0;
    }
    this.currentBet = 0;
  }

  advancePhase() {
    switch (this.phase) {
      case PHASES.PREFLOP:
        this.phase = PHASES.FLOP;
        this.communityCards.push(...this.deck.dealMultiple(3));
        this.addLog(`--- Flop: ${this.communityCards.map(cardToString).join(' ')} ---`);
        break;
      case PHASES.FLOP:
        this.phase = PHASES.TURN;
        this.communityCards.push(this.deck.deal());
        this.addLog(`--- Turn: ${cardToString(this.communityCards[3])} ---`);
        break;
      case PHASES.TURN:
        this.phase = PHASES.RIVER;
        this.communityCards.push(this.deck.deal());
        this.addLog(`--- River: ${cardToString(this.communityCards[4])} ---`);
        break;
      case PHASES.RIVER:
        this.showdown();
        return;
    }

    const actionable = this.getActionablePlayers();
    if (actionable.length <= 1) {
      // All-in runout: deal remaining community cards
      this.advancePhase();
    } else {
      this.setupPostflopBetting();
    }
  }

  // ==================== Showdown & Settlement ====================

  showdown() {
    this.collectBets();
    this.phase = PHASES.SHOWDOWN;

    const activePlayers = this.getActivePlayers();
    const playerData = activePlayers.map(p => ({ id: p.id, cards: p.cards }));
    const { winners, evaluations } = determineWinners(playerData, this.communityCards);

    for (const p of activePlayers) {
      const eval_ = evaluations[p.id];
      this.addLog(`${p.name}: ${p.cards.map(cardToString).join(' ')} - ${eval_.name}`);
    }

    const winAmount = Math.floor(this.pot / winners.length);
    const remainder = this.pot - winAmount * winners.length;

    for (const winnerId of winners) {
      this.players.find(p => p.id === winnerId).chips += winAmount;
    }
    if (remainder > 0) {
      this.players.find(p => p.id === winners[0]).chips += remainder;
    }

    const winnerNames = winners.map(id => this.players.find(p => p.id === id).name);
    this.addLog(`Winner: ${winnerNames.join(', ')} wins ${this.pot} chips`);

    this.pot = 0;
    // Serialize evaluations with just the hand name for frontend
    const serializedEvals = {};
    for (const [id, eval_] of Object.entries(evaluations)) {
      serializedEvals[id] = { name: eval_.name, handRank: eval_.handRank };
    }
    this.lastHandResult = { winners, evaluations: serializedEvals, winAmount };
  }

  endHandByFold() {
    this.collectBets();
    this.phase = PHASES.SHOWDOWN;

    const winner = this.getActivePlayers()[0];
    winner.chips += this.pot;
    this.addLog(`Winner: ${winner.name} wins ${this.pot} chips (all others folded)`);

    this.lastHandResult = {
      winners: [winner.id],
      evaluations: {},
      winAmount: this.pot,
      foldWin: true
    };
    this.pot = 0;
  }

  // ==================== State ====================

  getState(forPlayerId = null) {
    return {
      phase: this.phase,
      handNumber: this.handNumber,
      pot: this.pot,
      communityCards: this.communityCards.map(c => ({
        rank: c.rank, suit: c.suit, display: cardToString(c)
      })),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      dealerIndex: this.dealerIndex,
      sbIndex: this.sbIndex,
      bbIndex: this.bbIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.currentPlayerIndex >= 0 ? this.players[this.currentPlayerIndex]?.id : null,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        sittingOut: p.sittingOut,
        connected: p.connected,
        isDealer: idx === this.dealerIndex,
        isSB: idx === this.sbIndex,
        isBB: idx === this.bbIndex,
        cards: (forPlayerId === p.id || this.phase === PHASES.SHOWDOWN)
          ? p.cards.map(c => ({ rank: c.rank, suit: c.suit, display: cardToString(c) }))
          : p.cards.map(() => ({ hidden: true })),
        isCurrentPlayer: idx === this.currentPlayerIndex,
        validActions: (forPlayerId === p.id && idx === this.currentPlayerIndex)
          ? this.getValidActions(p.id) : []
      })),
      log: this.log.slice(-20),
      lastHandResult: this.lastHandResult || null,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind
    };
  }

  addLog(message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    this.log.push({ time: timestamp, message });
  }
}

module.exports = { Game, PHASES, ACTIONS };