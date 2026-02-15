/**
 * HandEvaluator.js - 德州扑克手牌评估器
 * 
 * 从 7 张牌（2 手牌 + 5 公共牌）中选出最优 5 张组合
 * 牌型从高到低：
 *   9 - 皇家同花顺 Royal Flush
 *   8 - 同花顺 Straight Flush
 *   7 - 四条 Four of a Kind
 *   6 - 葫芦 Full House
 *   5 - 同花 Flush
 *   4 - 顺子 Straight
 *   3 - 三条 Three of a Kind
 *   2 - 两对 Two Pair
 *   1 - 一对 One Pair
 *   0 - 高牌 High Card
 */

const { RANK_VALUES } = require('./Deck');

const HAND_RANKS = {
  ROYAL_FLUSH: 9,
  STRAIGHT_FLUSH: 8,
  FOUR_OF_A_KIND: 7,
  FULL_HOUSE: 6,
  FLUSH: 5,
  STRAIGHT: 4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR: 2,
  ONE_PAIR: 1,
  HIGH_CARD: 0
};

const HAND_NAMES = {
  9: 'Royal Flush',
  8: 'Straight Flush',
  7: 'Four of a Kind',
  6: 'Full House',
  5: 'Flush',
  4: 'Straight',
  3: 'Three of a Kind',
  2: 'Two Pair',
  1: 'One Pair',
  0: 'High Card'
};

/**
 * 从 n 张牌中生成所有 C(n, k) 组合
 */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const results = [];
  const [first, ...rest] = arr;
  // 包含 first 的组合
  for (const combo of combinations(rest, k - 1)) {
    results.push([first, ...combo]);
  }
  // 不包含 first 的组合
  for (const combo of combinations(rest, k)) {
    results.push(combo);
  }
  return results;
}

/**
 * 评估 5 张牌的牌型
 * @param {Array} cards - 恰好 5 张牌
 * @returns {{ handRank: number, kickers: number[], name: string }}
 */
function evaluate5(cards) {
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  // 检查同花
  const isFlush = suits.every(s => s === suits[0]);

  // 检查顺子
  let isStraight = false;
  let straightHigh = 0;

  // 普通顺子
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  // A-2-3-4-5 低顺（Wheel）
  if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // A 当 1 用，最高牌是 5
  }

  // 统计每个点数出现次数
  const countMap = {};
  for (const v of values) {
    countMap[v] = (countMap[v] || 0) + 1;
  }
  const counts = Object.entries(countMap)
    .map(([val, cnt]) => ({ val: parseInt(val), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

  // 判断牌型
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { handRank: HAND_RANKS.ROYAL_FLUSH, kickers: [14], name: HAND_NAMES[9] };
    }
    return { handRank: HAND_RANKS.STRAIGHT_FLUSH, kickers: [straightHigh], name: HAND_NAMES[8] };
  }

  if (counts[0].cnt === 4) {
    const quad = counts[0].val;
    const kicker = counts[1].val;
    return { handRank: HAND_RANKS.FOUR_OF_A_KIND, kickers: [quad, kicker], name: HAND_NAMES[7] };
  }

  if (counts[0].cnt === 3 && counts[1].cnt === 2) {
    return { handRank: HAND_RANKS.FULL_HOUSE, kickers: [counts[0].val, counts[1].val], name: HAND_NAMES[6] };
  }

  if (isFlush) {
    return { handRank: HAND_RANKS.FLUSH, kickers: values, name: HAND_NAMES[5] };
  }

  if (isStraight) {
    return { handRank: HAND_RANKS.STRAIGHT, kickers: [straightHigh], name: HAND_NAMES[4] };
  }

  if (counts[0].cnt === 3) {
    const trip = counts[0].val;
    const kickers = counts.filter(c => c.cnt === 1).map(c => c.val).sort((a, b) => b - a);
    return { handRank: HAND_RANKS.THREE_OF_A_KIND, kickers: [trip, ...kickers], name: HAND_NAMES[3] };
  }

  if (counts[0].cnt === 2 && counts[1].cnt === 2) {
    const pairs = [counts[0].val, counts[1].val].sort((a, b) => b - a);
    const kicker = counts[2].val;
    return { handRank: HAND_RANKS.TWO_PAIR, kickers: [...pairs, kicker], name: HAND_NAMES[2] };
  }

  if (counts[0].cnt === 2) {
    const pair = counts[0].val;
    const kickers = counts.filter(c => c.cnt === 1).map(c => c.val).sort((a, b) => b - a);
    return { handRank: HAND_RANKS.ONE_PAIR, kickers: [pair, ...kickers], name: HAND_NAMES[1] };
  }

  return { handRank: HAND_RANKS.HIGH_CARD, kickers: values, name: HAND_NAMES[0] };
}

/**
 * 从 7 张牌中找出最优的 5 张组合
 * @param {Array} cards - 7 张牌（手牌 + 公共牌）
 * @returns {{ handRank: number, kickers: number[], name: string, bestCards: Array }}
 */
function evaluateBest(cards) {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards, got ${cards.length}`);
  }

  const allCombos = combinations(cards, 5);
  let best = null;

  for (const combo of allCombos) {
    const result = evaluate5(combo);
    if (!best || compareHands(result, best) > 0) {
      best = { ...result, bestCards: combo };
    }
  }

  return best;
}

/**
 * 比较两手牌的大小
 * @returns {number} 正数 = a 赢，负数 = b 赢，0 = 平局
 */
function compareHands(a, b) {
  if (a.handRank !== b.handRank) {
    return a.handRank - b.handRank;
  }
  // 同牌型，比较 kickers
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) {
      return a.kickers[i] - b.kickers[i];
    }
  }
  return 0; // 完全平局
}

/**
 * 判定多个玩家中的赢家（支持平分底池）
 * @param {Array} players - [{ id, cards }]，cards 是 2 张手牌
 * @param {Array} communityCards - 5 张公共牌
 * @returns {{ winners: Array, evaluations: Object }}
 */
function determineWinners(players, communityCards) {
  const evaluations = {};

  for (const player of players) {
    const allCards = [...player.cards, ...communityCards];
    evaluations[player.id] = evaluateBest(allCards);
  }

  // 找出最强的手牌
  let bestResult = null;
  for (const id of Object.keys(evaluations)) {
    if (!bestResult || compareHands(evaluations[id], bestResult) > 0) {
      bestResult = evaluations[id];
    }
  }

  // 找出所有持有最强手牌的玩家（可能平分）
  const winners = [];
  for (const id of Object.keys(evaluations)) {
    if (compareHands(evaluations[id], bestResult) === 0) {
      winners.push(id);
    }
  }

  return { winners, evaluations };
}

/**
 * 计算手牌的大致强度 (0~1)
 * 用于机器人决策，这是一个简化的启发式评估
 * @param {Array} holeCards - 2 张手牌
 * @param {Array} communityCards - 0~5 张公共牌
 * @returns {number} 0~1 之间的强度值
 */
function handStrength(holeCards, communityCards = []) {
  if (communityCards.length === 0) {
    // 翻牌前：基于手牌本身的强度评估
    return preflopStrength(holeCards);
  }

  // 翻牌后：用当前牌评估
  const allCards = [...holeCards, ...communityCards];
  const eval_ = evaluateBest(allCards);

  // 将 handRank (0-9) 和 kickers 转为 0~1 的分数
  let score = eval_.handRank / 9;

  // 微调：根据 kicker 加分
  if (eval_.kickers.length > 0) {
    score += (eval_.kickers[0] / 14) * 0.05;
  }

  return Math.min(score, 1);
}

/**
 * 翻牌前手牌强度估算
 * 考虑：对子、同花、连牌、高牌
 */
function preflopStrength(cards) {
  const v1 = RANK_VALUES[cards[0].rank];
  const v2 = RANK_VALUES[cards[1].rank];
  const high = Math.max(v1, v2);
  const low = Math.min(v1, v2);
  const isPair = v1 === v2;
  const isSuited = cards[0].suit === cards[1].suit;
  const gap = high - low;

  let score = 0;

  if (isPair) {
    // 对子：22=0.5, AA=0.95
    score = 0.5 + (high - 2) * 0.0375;
  } else {
    // 基于高牌
    score = (high - 2) / 24 + (low - 2) / 48;

    // 同花加分
    if (isSuited) score += 0.05;

    // 连牌加分（差距越小越好）
    if (gap <= 2) score += 0.04;
    else if (gap <= 4) score += 0.02;

    // 两张都是大牌（T 以上）
    if (high >= 10 && low >= 10) score += 0.08;
  }

  return Math.max(0, Math.min(score, 1));
}

module.exports = {
  HAND_RANKS,
  HAND_NAMES,
  evaluate5,
  evaluateBest,
  compareHands,
  determineWinners,
  handStrength,
  preflopStrength
};