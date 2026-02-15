/**
 * Bot.js - 机器人决策逻辑
 * 
 * 当前版本：纯随机，三选一 (fold / check / call)，各 1/3 概率
 */

const { ACTIONS } = require('./Game');

class Bot {
  /**
   * 机器人做决策
   * @param {Array} validActions - 当前可执行的操作列表
   * @returns {{ action: string, amount?: number }}
   */
  static decide(validActions) {
    const roll = Math.random();

    if (roll < 1 / 3) {
      if (validActions.includes(ACTIONS.FOLD)) {
        return { action: ACTIONS.FOLD };
      }
    } else if (roll < 2 / 3) {
      if (validActions.includes(ACTIONS.CHECK)) {
        return { action: ACTIONS.CHECK };
      }
      if (validActions.includes(ACTIONS.CALL)) {
        return { action: ACTIONS.CALL };
      }
    } else {
      if (validActions.includes(ACTIONS.CALL)) {
        return { action: ACTIONS.CALL };
      }
      if (validActions.includes(ACTIONS.CHECK)) {
        return { action: ACTIONS.CHECK };
      }
    }

    // Fallback
    return { action: validActions[0] };
  }
}

module.exports = { Bot };