/**
 * cards.js - Poker card UI utilities
 *
 * Provides helpers to render card elements as HTML strings.
 */

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

const Cards = {

  /**
   * Is this suit red?
   */
  isRed(suit) {
    return RED_SUITS.has(suit);
  },

  /**
   * Render a community-sized card (50×70)
   * @param {Object} card - { rank, suit } or { hidden: true } or null (placeholder)
   */
  renderCard(card) {
    if (!card) {
      return '<div class="card placeholder"></div>';
    }
    if (card.hidden) {
      return '<div class="card face-down"></div>';
    }
    const red = this.isRed(card.suit) ? ' red' : '';
    const symbol = SUIT_SYMBOLS[card.suit] || '';
    return `<div class="card face-up${red}">
      <span class="rank">${card.rank}</span>
      <span class="suit-icon">${symbol}</span>
    </div>`;
  },

  /**
   * Render a mini card (for player seats, 26×34)
   */
  renderMiniCard(card) {
    if (!card) return '';
    if (card.hidden) {
      return '<div class="mini-card face-down"></div>';
    }
    const red = this.isRed(card.suit) ? ' red' : '';
    const symbol = SUIT_SYMBOLS[card.suit] || '';
    return `<div class="mini-card face-up${red}">
      <span class="mini-rank">${card.rank}</span>
      <span class="mini-suit">${symbol}</span>
    </div>`;
  },

  /**
   * Render 5 community cards (with placeholders for unrevealed)
   */
  renderCommunityCards(cards) {
    const html = [];
    for (let i = 0; i < 5; i++) {
      html.push(this.renderCard(cards[i] || null));
    }
    return html.join('');
  }
};