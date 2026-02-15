/**
 * test.js - 核心引擎测试
 * 运行: node test.js
 */

const { Deck, cardToString } = require('./Deck');
const { evaluateBest, handStrength, determineWinners, preflopStrength } = require('./HandEvaluator');
const { Game, PHASES, ACTIONS } = require('./Game');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

// ========== 测试 Deck ==========
console.log('\n🃏 测试 Deck');

const deck = new Deck();
assert(deck.remaining() === 52, '新牌组有 52 张牌');

const card1 = deck.deal();
assert(deck.remaining() === 51, '发一张后剩 51 张');
assert(card1.rank && card1.suit, '发出的牌有 rank 和 suit');

const hand = deck.dealMultiple(5);
assert(hand.length === 5, '发 5 张牌');
assert(deck.remaining() === 46, '剩余 46 张');

deck.reset();
assert(deck.remaining() === 52, 'reset 后恢复 52 张');

// 检查无重复
const allCards = deck.dealMultiple(52);
const cardSet = new Set(allCards.map(c => `${c.rank}${c.suit}`));
assert(cardSet.size === 52, '52 张牌没有重复');

// ========== 测试 HandEvaluator ==========
console.log('\n🏆 测试 HandEvaluator');

// 构造测试牌
function makeCard(str) {
  return { rank: str[0], suit: str[1] };
}

// 皇家同花顺
const royalFlush = ['As', 'Ks', 'Qs', 'Js', 'Ts', '3h', '7d'].map(makeCard);
const rfResult = evaluateBest(royalFlush);
assert(rfResult.handRank === 9, `皇家同花顺: ${rfResult.name} (rank=${rfResult.handRank})`);

// 四条
const fourKind = ['Ah', 'Ad', 'Ac', 'As', '5h', '3d', '9c'].map(makeCard);
const fkResult = evaluateBest(fourKind);
assert(fkResult.handRank === 7, `四条: ${fkResult.name} (rank=${fkResult.handRank})`);

// 葫芦
const fullHouse = ['Kh', 'Kd', 'Kc', '7s', '7h', '2d', '9c'].map(makeCard);
const fhResult = evaluateBest(fullHouse);
assert(fhResult.handRank === 6, `葫芦: ${fhResult.name} (rank=${fhResult.handRank})`);

// 同花
const flush = ['2h', '5h', '8h', 'Jh', 'Ah', '3d', '9c'].map(makeCard);
const flResult = evaluateBest(flush);
assert(flResult.handRank === 5, `同花: ${flResult.name} (rank=${flResult.handRank})`);

// 顺子
const straight = ['5h', '6d', '7c', '8s', '9h', '2d', 'Kc'].map(makeCard);
const stResult = evaluateBest(straight);
assert(stResult.handRank === 4, `顺子: ${stResult.name} (rank=${stResult.handRank})`);

// A-2-3-4-5 低顺
const wheel = ['Ah', '2d', '3c', '4s', '5h', 'Td', 'Kc'].map(makeCard);
const whResult = evaluateBest(wheel);
assert(whResult.handRank === 4, `低顺(Wheel): ${whResult.name} (rank=${whResult.handRank})`);

// 高牌
const highCard = ['2h', '5d', '8c', 'Js', 'Ah', '3c', '9d'].map(makeCard);
const hcResult = evaluateBest(highCard);
assert(hcResult.handRank === 0, `高牌: ${hcResult.name} (rank=${hcResult.handRank})`);

// 赢家判定
console.log('\n🥇 测试 determineWinners');
const community = ['Th', 'Jh', 'Qh', '2d', '5c'].map(makeCard);
const players = [
  { id: 'p1', cards: [makeCard('Ah'), makeCard('Kh')] },  // 皇家同花顺
  { id: 'p2', cards: [makeCard('Ks'), makeCard('9s')] },  // 顺子
];
const result = determineWinners(players, community);
assert(result.winners.length === 1 && result.winners[0] === 'p1', 'p1 皇家同花顺赢 p2 顺子');

// 翻牌前强度
console.log('\n💪 测试 preflopStrength');
const aaStrength = preflopStrength([makeCard('Ah'), makeCard('As')]);
const t2Strength = preflopStrength([makeCard('Th'), makeCard('2c')]);
assert(aaStrength > t2Strength, `AA (${aaStrength.toFixed(3)}) > T2o (${t2Strength.toFixed(3)})`);

const akSuited = preflopStrength([makeCard('Ah'), makeCard('Kh')]);
const akOff = preflopStrength([makeCard('Ah'), makeCard('Kd')]);
assert(akSuited > akOff, `AKs (${akSuited.toFixed(3)}) > AKo (${akOff.toFixed(3)})`);

// ========== 测试 Game ==========
console.log('\n🎮 测试 Game');

const game = new Game({ smallBlind: 10, bigBlind: 20, startingChips: 1000 });
game.addPlayer('p1', 'Alice', false);
game.addPlayer('p2', 'Bob', true);
game.addPlayer('p3', 'Charlie', true);

assert(game.players.length === 3, '3 个玩家加入');

const started = game.startHand();
assert(started === true, '游戏成功开始');
assert(game.phase === PHASES.PREFLOP, `阶段: ${game.phase}`);
assert(game.communityCards.length === 0, '公共牌为空');

// 每人应有 2 张牌
for (const p of game.players) {
  assert(p.cards.length === 2, `${p.name} 有 ${p.cards.length} 张手牌`);
}

// 盲注已下
const totalBlinds = game.players.reduce((sum, p) => sum + p.bet, 0);
assert(totalBlinds === 30, `盲注总额: ${totalBlinds} (应为 30)`);
assert(game.pot === 0, `底池: ${game.pot} (盲注还在玩家 bet 中)`);

// 测试有效操作
const state = game.getState('p1');
assert(state.phase === 'preflop', '状态中的阶段正确');
assert(state.players.length === 3, '状态中有 3 个玩家');

// 当前玩家应该能看到自己的牌
const p1State = state.players.find(p => p.id === 'p1');
assert(!p1State.cards[0].hidden, 'p1 能看到自己的牌');

// 其他玩家的牌应该隐藏
const p2State = state.players.find(p => p.id === 'p2');
assert(p2State.cards[0].hidden, 'p2 的牌对 p1 隐藏');

// 模拟一轮：所有人 fold
console.log('\n🎯 测试操作流程');
const currentId = game.players[game.currentPlayerIndex].id;
console.log(`  当前行动: ${game.players[game.currentPlayerIndex].name}`);

// 让当前玩家 fold，然后下一个 fold，最后一个获胜
let actionCount = 0;
while (game.phase !== PHASES.SHOWDOWN && actionCount < 10) {
  const cp = game.players[game.currentPlayerIndex];
  const actions = game.getValidActions(cp.id);
  if (actions.includes(ACTIONS.FOLD)) {
    game.handleAction(cp.id, ACTIONS.FOLD);
    actionCount++;
  } else {
    break;
  }
}

assert(game.phase === PHASES.SHOWDOWN, `弃牌后进入摊牌: ${game.phase}`);
const winner = game.getActivePlayers()[0];
assert(winner !== undefined, `赢家: ${winner?.name}`);

// ========== 总结 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);