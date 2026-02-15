/**
 * Deck.js - 扑克牌组
 * 负责创建52张标准扑克牌、洗牌、发牌
 */

const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

// 数值映射，用于比较大小
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const SUIT_NAMES = {
  's': '♠', 'h': '♥', 'd': '♦', 'c': '♣'
};

class Deck {
  constructor() {
    this.reset();
  }

  /**
   * 重置并洗牌
   */
  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push({ rank, suit });
      }
    }
    this.shuffle();
  }

  /**
   * Fisher-Yates 洗牌算法
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * 发一张牌
   */
  deal() {
    if (this.cards.length === 0) {
      throw new Error('Deck is empty');
    }
    return this.cards.pop();
  }

  /**
   * 发多张牌
   */
  dealMultiple(count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
      cards.push(this.deal());
    }
    return cards;
  }

  /**
   * 剩余牌数
   */
  remaining() {
    return this.cards.length;
  }
}

/**
 * 工具函数：把牌对象转为可读字符串，如 { rank: 'A', suit: 's' } => "A♠"
 */
function cardToString(card) {
  return `${card.rank}${SUIT_NAMES[card.suit]}`;
}

/**
 * 工具函数：获取牌的数值
 */
function rankValue(rank) {
  return RANK_VALUES[rank];
}

module.exports = { Deck, SUITS, RANKS, RANK_VALUES, SUIT_NAMES, cardToString, rankValue };