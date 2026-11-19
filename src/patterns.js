/* ==========================================================
 * patterns.js — 关卡数据表
 * ----------------------------------------------------------
 * 这个文件是给"关卡设计"用的，只有表格，没有逻辑。
 * 改这里就能改关卡的难度和节奏，不需要动 game.js。
 *
 * 每一行代表"横排在跑道上的一排东西"，从玩家视角看是 3 条车道：
 *   [ 左道, 中道, 右道 ]
 *
 * 每一格可以是下面 5 种写法（大小写要一致，用英文引号）：
 *   ''        空，什么都没有
 *   'shard'   金色碎片（吃到 +10 分）
 *   'low'     矮木栏 —— 必须跳过去（或换道）
 *   'high'    石吊梁 —— 必须滑铲钻过去（或换道）
 *   'pillar'  石柱 —— 只能换道躲开，跳和滑都没用
 *
 * 硬性规则（程序里会检查，违反的行会被跳过）：
 *   一排里至少要有 1 条道不是 'pillar'，否则这排无解。
 * ========================================================== */

window.GAME_CONFIG = {
  lanes: [-2.4, 0, 2.4],     // 三条车道的 x 坐标，一般不用改
  finishDistance: 900,       // 终点距离（米）。想改长一点就调大
  lives: 4,                  // 生命数
  startSpeed: 15,            // 起跑速度
  maxSpeed: 21,              // 最高速度
  gravity: 34,               // 重力（越大跳得越"沉"）
  jumpVelocity: 9.6,         // 起跳初速度（越大跳得越高）
  slideTime: 0.62,           // 滑铲持续时间（秒）

  // 难度分段：跑到对应距离后切换这一段的"行距"和"用哪张表"
  bands: [
    { until: 180, gap: 14, set: 'easy' },
    { until: 420, gap: 13, set: 'mid' },
    { until: 99999, gap: 17, set: 'hard' }
  ]
};

window.LEVEL_PATTERNS = {

  /* 前 180 米：一次基本只有一件事，熟悉三个动作 */
  easy: [
    ['low', '', ''],
    ['', 'low', ''],
    ['', '', 'low'],
    ['high', '', ''],
    ['', 'high', ''],
    ['', '', 'high'],
    ['pillar', '', ''],
    ['', '', 'pillar'],
    ['shard', 'shard', 'shard'],
    ['', 'shard', ''],
    ['shard', '', 'shard'],
    ['low', 'shard', ''],
    ['', 'shard', 'high'],
    ['pillar', 'shard', ''],
    ['', '', '']
  ],

  /* 180–420 米：两条道被占，需要选路 */
  mid: [
    ['low', '', 'high'],
    ['high', '', 'low'],
    ['pillar', 'low', ''],
    ['', 'low', 'pillar'],
    ['low', 'low', ''],
    ['', 'high', 'high'],
    ['low', 'shard', 'low'],
    ['pillar', '', 'pillar'],
    ['high', 'shard', ''],
    ['', 'pillar', 'low'],
    ['low', '', 'pillar'],
    ['shard', 'pillar', 'shard'],
    ['high', '', ''],
    ['', '', ''],
    ['', 'shard', '']
  ],

  /* 420 米以后：三条道全都占，容错很低 */
  hard: [
    ['low', 'pillar', 'low'],
    ['high', 'low', 'high'],
    ['pillar', 'low', 'pillar'],
    ['low', 'high', 'pillar'],
    ['pillar', 'high', 'pillar'],
    ['low', 'low', 'pillar'],
    ['high', 'high', ''],
    ['low', 'shard', 'low'],
    ['', 'low', 'high'],
    ['pillar', 'pillar', ''], 
    ['shard', 'pillar', 'shard'],
    ['low', '', 'pillar'],
    ['', '', ''],
    ['', '', '']
  ]
};
