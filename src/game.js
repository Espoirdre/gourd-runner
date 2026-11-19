/* ==========================================================
 * game.js — 主逻辑
 * ----------------------------------------------------------
 * 结构：
 *   1. 场景 / 灯光 / 布景
 *   2. 三种障碍 + 碎片
 *   3. 玩家状态与输入
 *   4. 关卡生成（读 patterns.js）
 *   5. 碰撞判定
 *   6. Demo 自动演示（一个规则小机器人，用的是真实游戏逻辑）
 *   7. HUD / 界面切换 / 主循环
 * ========================================================== */

(function () {
  'use strict';

  // -------------------------------------------------------
  // 依赖完整性检查
  // game.js / patterns.js / audio.js 三个文件必须配套。
  // 如果 patterns.js 被换成字段名不同的版本（laneX / slideDuration /
  // difficultyBands），或者 audio.js 不再导出 GameAudio，游戏会
  // 静默打不开、点开始没反应。这里直接把人话写进错误面板。
  // -------------------------------------------------------
  var depProblems = [];

  if (!window.GameAudio || typeof window.GameAudio.sfx !== 'function') {
    depProblems.push('src/audio.js：找不到 window.GameAudio（被换成了别的音频实现）');
  }

  var rawCfg = window.GAME_CONFIG;
  if (!rawCfg) {
    depProblems.push('src/patterns.js：找不到 GAME_CONFIG');
  } else {
    if (!Array.isArray(rawCfg.lanes)) {
      depProblems.push('src/patterns.js：GAME_CONFIG 里没有 lanes（被换成了 laneX？）');
    }
    if (!Array.isArray(rawCfg.bands)) {
      depProblems.push('src/patterns.js：GAME_CONFIG 里没有 bands（被换成了 difficultyBands？）');
    }
    if (typeof rawCfg.slideTime !== 'number') {
      depProblems.push('src/patterns.js：GAME_CONFIG 里没有 slideTime（被换成了 slideDuration？）');
    }
    if (typeof rawCfg.finishDistance !== 'number') {
      depProblems.push('src/patterns.js：GAME_CONFIG 里没有 finishDistance');
    }
  }

  if (!window.LEVEL_PATTERNS) {
    depProblems.push('src/patterns.js：找不到 LEVEL_PATTERNS');
  }

  if (depProblems.length) {
    var depBox = document.getElementById('errBox');
    if (depBox) {
      depBox.style.display = 'block';
      depBox.textContent =
        '依赖文件不配套，游戏无法启动。\n\n' +
        depProblems.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n') +
        '\n\n怎么修：把 src/patterns.js 和 src/audio.js 还原成与 src/game.js 配套的版本。\n' +
        '注意：patterns.js 只能改表格里的数据（每行的字符串），GAME_CONFIG 的字段名不能改；\n' +
        'audio.js 不能整体替换，game.js 依赖它导出的 window.GameAudio。';
    }
    document.title = '依赖不配套 — 游戏无法启动';
    return;
  }

  var CFG = window.GAME_CONFIG;
  var PAT = window.LEVEL_PATTERNS;
  var audio = window.GameAudio;

  // ---------------- DOM ----------------
  var canvas = document.getElementById('scene');
  var hud = document.getElementById('hud');
  var screenMenu = document.getElementById('screenMenu');
  var screenPause = document.getElementById('screenPause');
  var screenResult = document.getElementById('screenResult');
  var demoBadge = document.getElementById('demoBadge');
  var toastEl = document.getElementById('toast');
  var fadeHit = document.getElementById('fadeHit');
  var heartsEl = document.getElementById('hearts');
  var distText = document.getElementById('distText');
  var finishText = document.getElementById('finishText');
  var progressFill = document.getElementById('progressFill');
  var shardText = document.getElementById('shardText');
  var volRange = document.getElementById('volRange');
  var volText = document.getElementById('volText');
  var menuHint = document.getElementById('menuHint');

  // ---------------- 全局状态 ----------------
  var G = {
    state: 'menu',        // menu | playing | paused | over
    demo: false,
    time: 0,
    distance: 0,
    speed: CFG.startSpeed,
    speedMul: 1,
    shards: 0,
    lives: CFG.lives,
    finishZ: -CFG.finishDistance,
    shake: 0,
    hitFlash: 0,
    chaserZ: 5.6,
    lastRow: null,
    lastPassable: 3,
    finished: false
  };

  var P = {
    lane: 1,
    x: 0, y: 0, vy: 0,
    jumping: false,
    sliding: false,
    slideT: 0,
    invuln: 0,
    tilt: 0
  };

  var LANE_X = CFG.lanes;
  var SPAWN_Z = -132;
  var ROWS = [];
  var ROW_POOL = [];
  var PILLARS = [];
  var DASHES = [];
  var SCENERY_LEN = 0;

  var renderer, scene, camera, racer, racerShadow, gate, chaser;
  var clockLast = 0;
  var camGoal = new THREE.Vector3();
  var lookGoal = new THREE.Vector3();

  // ---------------- 纹理 ----------------
  function makeStoneTexture() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var g = c.getContext('2d');

    g.fillStyle = '#c2a377';
    g.fillRect(0, 0, 256, 256);

    for (var i = 0; i < 900; i++) {
      var x = Math.random() * 256;
      var y = Math.random() * 256;
      var r = Math.random() * 2.2 + 0.4;
      var dark = Math.random() < 0.55;
      g.fillStyle = dark
        ? 'rgba(120,96,64,' + (0.05 + Math.random() * 0.1) + ')'
        : 'rgba(220,196,156,' + (0.05 + Math.random() * 0.12) + ')';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }

    g.strokeStyle = 'rgba(96,74,48,0.32)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 128); g.stroke();
    g.beginPath(); g.moveTo(64, 128); g.lineTo(64, 256); g.stroke();
    g.beginPath(); g.moveTo(192, 128); g.lineTo(192, 256); g.stroke();

    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 64);
    return tex;
  }

  function makeSkyTexture() {
    var c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#f9e6b8');
    grad.addColorStop(0.55, '#eecb92');
    grad.addColorStop(1, '#d3a067');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    return new THREE.CanvasTexture(c);
  }

  // ---------------- 布景 ----------------
  function buildWorld() {
    var floorMat = new THREE.MeshLambertMaterial({ map: makeStoneTexture() });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 340), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -140);
    scene.add(floor);

    var verge = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 360),
      new THREE.MeshLambertMaterial({ color: 0x5a452d })
    );
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(0, -0.09, -140);
    scene.add(verge);

    // 两侧石柱
    var pillarGeo = new THREE.CylinderGeometry(0.42, 0.5, 5.2, 10);
    var capGeo = new THREE.BoxGeometry(1.15, 0.28, 1.15);
    var pillarMat = new THREE.MeshLambertMaterial({ color: 0xc9a276 });
    var capMat = new THREE.MeshLambertMaterial({ color: 0xdcbb90 });

    var perSide = 14;
    var spacing = 22;
    SCENERY_LEN = perSide * spacing;

    for (var s = -1; s <= 1; s += 2) {
      for (var i = 0; i < perSide; i++) {
        var p = new THREE.Group();
        var body = new THREE.Mesh(pillarGeo, pillarMat);
        body.position.y = 2.6;
        p.add(body);
        var cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 5.3;
        p.add(cap);
        p.position.set(s * 5.6, 0, 14 - i * spacing);
        scene.add(p);
        PILLARS.push(p);
      }
    }

    // 车道分隔虚线
    var dashGeo = new THREE.BoxGeometry(0.12, 0.04, 1.2);
    var dashMat = new THREE.MeshLambertMaterial({ color: 0x9c7c50 });
    var dashCount = 24;
    var dashGap = 6;

    for (var d = 0; d < dashCount; d++) {
      for (var lane = -1; lane <= 1; lane += 2) {
        var dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(lane * 1.2, 0.03, 12 - d * dashGap);
        scene.add(dash);
        DASHES.push(dash);
      }
    }

    // 终点门
    gate = new THREE.Group();
    var gateMat = new THREE.MeshLambertMaterial({ color: 0x2f7d6c, emissive: 0x1a4c40 });
    var gateCapMat = new THREE.MeshLambertMaterial({ color: 0x4fbf9f, emissive: 0x1f5a4d });

    [-1, 1].forEach(function (side) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.4, 0.55), gateMat);
      post.position.set(side * 4.0, 2.7, 0);
      gate.add(post);
    });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.7, 0.55), gateCapMat);
    beam.position.set(0, 5.2, 0);
    gate.add(beam);

    gate.position.z = G.finishZ;
    scene.add(gate);

    // 主角与地面影子
    racer = window.createRacer(THREE);
    racer.group.rotation.y = Math.PI;   // 面朝 -z，也就是朝跑动方向
    scene.add(racer.group);

    racerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 20),
      new THREE.MeshBasicMaterial({ color: 0x2a1d0e, transparent: true, opacity: 0.3 })
    );
    racerShadow.rotation.x = -Math.PI / 2;
    racerShadow.position.y = 0.02;
    scene.add(racerShadow);

    // 追在后面的东西：只在掉心之后才出现，越接近越近
    chaser = buildChaser();
    scene.add(chaser);
  }

  // 追逐者：一只正对镜头扑过来的橘猫，全部用基础几何体拼
  function buildChaser() {
    var g = new THREE.Group();

    var matFur = new THREE.MeshLambertMaterial({ color: 0xe8b878 });
    var matFurDark = new THREE.MeshLambertMaterial({ color: 0xd1975a });
    var matMuzzle = new THREE.MeshLambertMaterial({ color: 0xf7e6c8 });
    var matDark = new THREE.MeshLambertMaterial({ color: 0x2b2118 });
    var matNose = new THREE.MeshLambertMaterial({ color: 0xd98c86 });
    var matWhisker = new THREE.MeshBasicMaterial({ color: 0xf9f0dd });

    // 头
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.60, 22, 18), matFur);
    head.scale.set(1.04, 0.98, 0.96);
    head.position.set(0, 0.74, 0);
    g.add(head);

    // 折耳：两只扁球压在前额两侧
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), matFurDark);
      ear.scale.set(1.0, 0.42, 0.85);
      ear.position.set(s * 0.42, 1.14, 0.04);
      ear.rotation.z = s * 0.5;
      g.add(ear);
    });

    // 嘴部浅色块
    var muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), matMuzzle);
    muzzle.scale.set(1.18, 0.78, 0.55);
    muzzle.position.set(0, 0.52, 0.44);
    g.add(muzzle);

    // 眼睛 + 高光
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), matDark);
      eye.position.set(s * 0.21, 0.80, 0.44);
      g.add(eye);

      var glint = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), matWhisker);
      glint.position.set(s * 0.21 + 0.04, 0.845, 0.545);
      g.add(glint);
    });

    // 鼻子
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), matNose);
    nose.scale.set(1.35, 0.75, 0.8);
    nose.position.set(0, 0.615, 0.625);
    g.add(nose);

    // 不高兴的嘴：一条横线加两道向下的短竖线
    var mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.02), matDark);
    mouth.position.set(0, 0.505, 0.622);
    g.add(mouth);

    [-1, 1].forEach(function (s) {
      var lip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.075, 0.02), matDark);
      lip.position.set(s * 0.075, 0.468, 0.618);
      g.add(lip);
    });

    // 胡须
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 2; i++) {
        var w = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.012), matWhisker);
        w.position.set(s * 0.36, 0.55 - i * 0.055, 0.55);
        w.rotation.z = s * (0.10 + i * 0.13);
        w.rotation.y = s * -0.32;
        g.add(w);
      }
    });

    // 两只前爪
    [-1, 1].forEach(function (s) {
      var paw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), matMuzzle);
      paw.scale.set(1.0, 0.7, 1.2);
      paw.position.set(s * 0.26, 0.14, 0.5);
      g.add(paw);
    });

    g.scale.setScalar(0.86);
    g.visible = false;
    return g;
  }

  // ---------------- 障碍物 ----------------
  var GEO = {
    low: new THREE.BoxGeometry(2.05, 1.0, 0.42),
    lowTop: new THREE.BoxGeometry(2.16, 0.13, 0.54),
    beam: new THREE.BoxGeometry(2.16, 0.42, 0.5),
    post: new THREE.BoxGeometry(0.16, 3.3, 0.42),
    pillar: new THREE.CylinderGeometry(0.58, 0.66, 2.9, 12),
    pillarCap: new THREE.BoxGeometry(1.35, 0.22, 1.35),
    shard: new THREE.OctahedronGeometry(0.3, 0)
  };

  var MAT = {
    wood: new THREE.MeshLambertMaterial({ color: 0xb4613c }),
    woodTop: new THREE.MeshLambertMaterial({ color: 0xdc8f5e }),
    stone: new THREE.MeshLambertMaterial({ color: 0x35706a }),
    sand: new THREE.MeshLambertMaterial({ color: 0xc49a5a }),
    sandCap: new THREE.MeshLambertMaterial({ color: 0xd9b678 }),
    shard: new THREE.MeshLambertMaterial({ color: 0xf7c948, emissive: 0x7a5500 })
  };

  function buildCell(type) {
    var g = new THREE.Group();

    if (type === 'low') {
      var box = new THREE.Mesh(GEO.low, MAT.wood);
      box.position.y = 0.5;
      g.add(box);
      var top = new THREE.Mesh(GEO.lowTop, MAT.woodTop);
      top.position.y = 1.02;
      g.add(top);

    } else if (type === 'high') {
      [-1, 1].forEach(function (s) {
        var post = new THREE.Mesh(GEO.post, MAT.stone);
        post.position.set(s * 1.0, 1.65, 0);
        g.add(post);
      });
      var beam = new THREE.Mesh(GEO.beam, MAT.stone);
      beam.position.y = 1.45;
      g.add(beam);

    } else if (type === 'pillar') {
      var col = new THREE.Mesh(GEO.pillar, MAT.sand);
      col.position.y = 1.45;
      g.add(col);
      var cap = new THREE.Mesh(GEO.pillarCap, MAT.sandCap);
      cap.position.y = 2.95;
      g.add(cap);

    } else if (type === 'shard') {
      var shard = new THREE.Mesh(GEO.shard, MAT.shard);
      shard.position.y = 1.0;
      shard.rotation.y = 0.6;
      g.add(shard);
      g.userData.spin = true;
    }

    return g;
  }

  function takeRow() {
    var row = ROW_POOL.pop();
    if (!row) {
      row = {
        grp: new THREE.Group(),
        cells: ['', '', ''],
        objs: [null, null, null],
        taken: [false, false, false],
        scored: false,
        z: 0
      };
      scene.add(row.grp);
    }
    return row;
  }

  function clearRow(row) {
    while (row.grp.children.length) {
      row.grp.remove(row.grp.children[0]);
    }
    row.objs = [null, null, null];
  }

  // 一排里"不用换道就能过"的车道数量（跳/滑都算能过）
  function passableCount(cells) {
    var n = 0;
    for (var i = 0; i < 3; i++) {
      if (cells[i] !== 'pillar') n++;
    }
    return n;
  }

  // 两排之间至少要有同一条道都能过，否则玩家会被逼死
  function sharesPassable(a, b) {
    for (var i = 0; i < 3; i++) {
      if (a[i] !== 'pillar' && b[i] !== 'pillar') return true;
    }
    return false;
  }

  function pickPattern(bandKey) {
    var set = PAT[bandKey] || PAT.easy;
    var pool = [];

    for (var i = 0; i < set.length; i++) {
      var row = set[i];
      if (row === G.lastRow) continue;               // 不连着放同一种排法
      if (passableCount(row) < 1) continue;          // 无解的排法直接丢弃
      if (G.lastPassable <= 1 && passableCount(row) < 2) continue;  // 上一排太窄，这一排给宽一点
      if (G.lastRow && !sharesPassable(G.lastRow, row)) continue;   // 必须能一路跑下去
      pool.push(row);
    }

    if (!pool.length) return ['', '', ''];           // 兜底：放一排空的，绝不卡死

    var chosen = pool[Math.floor(Math.random() * pool.length)];
    G.lastRow = chosen;
    G.lastPassable = passableCount(chosen);
    return chosen;
  }

  function bandFor(distance) {
    for (var i = 0; i < CFG.bands.length; i++) {
      if (distance < CFG.bands[i].until) return CFG.bands[i];
    }
    return CFG.bands[CFG.bands.length - 1];
  }

  function spawnRow(cells, z) {
    var row = takeRow();
    clearRow(row);

    row.cells = cells.slice();
    row.objs = [null, null, null];
    row.taken = [false, false, false];
    row.scored = false;
    row.z = z;
    row.grp.position.z = z;

    for (var i = 0; i < 3; i++) {
      if (!row.cells[i]) continue;
      var cell = buildCell(row.cells[i]);
      cell.position.x = LANE_X[i];
      row.grp.add(cell);
      row.objs[i] = cell;
    }

    ROWS.push(row);
    G.lastRowObj = row;
    return row;
  }

  function spawnAhead() {
    var band = bandFor(G.distance);
    var last = G.lastRowObj;

    if (!last) {
      spawnRow(pickPattern(band.set), -22);
      return;
    }

    // 上一次生成的那一排往前跑了多少，就补多少
    if (last.z > SPAWN_Z + band.gap) {
      spawnRow(pickPattern(band.set), last.z - band.gap);
    }
  }

  // ---------------- 玩家动作 ----------------
  function moveLane(dir) {
    if (G.state !== 'playing') return;
    var next = P.lane + dir;
    if (next < 0 || next > 2) return;
    P.lane = next;
    audio.sfx('lane');
  }

  function jump() {
    if (G.state !== 'playing') return;
    if (P.jumping && P.y > 0.6) return;   // 快落地时可以补一次跳
    P.jumping = true;
    P.sliding = false;
    P.vy = CFG.jumpVelocity;
    audio.sfx('jump');
  }

  function slide() {
    if (G.state !== 'playing') return;
    if (P.jumping) P.vy = Math.min(P.vy, -7);
    P.sliding = true;
    P.slideT = CFG.slideTime;
    audio.sfx('slide');
  }

  function hit(hitType) {
    if (P.invuln > 0 || G.state !== 'playing') return;

    G.lives--;
    P.invuln = 1.5;
    G.shake = 0.5;
    G.hitFlash = 1;
    G.speedMul = 0.5;
    if (!G.hitLog) G.hitLog = [];
    G.hitLog.push({ d: Math.round(G.distance), type: hitType, lane: P.lane, y: Math.round(P.y * 100) / 100, sliding: P.sliding });
    audio.sfx('hit');
    paintHearts(G.lives);

    if (G.lives <= 0) endGame(false);
  }

  // ---------------- 碰撞 ----------------
  function checkRows() {
    for (var i = 0; i < ROWS.length; i++) {
      var row = ROWS[i];

      // 碎片：进入范围就吃到
      if (row.z > -1.5 && row.z < 1.5) {
        if (row.cells[P.lane] === 'shard' && !row.taken[P.lane]) {
          row.taken[P.lane] = true;
          if (row.objs[P.lane]) row.objs[P.lane].visible = false;
          G.shards++;
          audio.sfx('pickup');
        }
      }

      // 障碍：只判定一次，就在它跟玩家重叠的那一帧
      if (!row.scored && row.z >= -0.45) {
        row.scored = true;
        var type = row.cells[P.lane];

        if (type === 'low') {
          if (P.y < 0.8) hit('low');
        } else if (type === 'high') {
          if (!P.sliding) hit('high');
        } else if (type === 'pillar') {
          hit('pillar');
        }
      }
    }
  }

  // ---------------- Demo 机器人 ----------------
  // 用的就是玩家那套 moveLane/jump/slide，不是录像回放
  function botPickLane(ahead) {
    var best = -1;
    var bestCost = -1e9;

    for (var l = 0; l < 3; l++) {
      if (l === P.lane) continue;                    // 当前道上有柱子，必须换
      var cost = -Math.abs(l - P.lane) * 1.5;
      for (var i = 0; i < ahead.length && i < 3; i++) {
        var c = ahead[i].cells[l];
        if (c === 'pillar') cost -= 20;
        else if (c === 'low' || c === 'high') cost -= 0.6;
      }
      if (cost > bestCost) { bestCost = cost; best = l; }
    }
    return best;
  }

  function botThink(dt) {
    if (G.botCool > 0) G.botCool -= dt;
    var ahead = [];
    for (var i = 0; i < ROWS.length; i++) {
      var r = ROWS[i];
      if (r.z > -1.0) continue;
      if (r.z < -34) break;
      ahead.push(r);
    }
    if (!ahead.length) return;

    var blocker = null;
    for (var j = 0; j < ahead.length; j++) {
      var c = ahead[j].cells[P.lane];
      if (c && c !== 'shard') { blocker = ahead[j]; break; }
    }
    if (!blocker) return;

    var dist = -blocker.z;
    var type = blocker.cells[P.lane];

    if (type === 'pillar') {
      var best = botPickLane(ahead);
      if (best >= 0 && best !== P.lane) moveLane(best > P.lane ? 1 : -1);
      return;
    }
    var k = G.speed / 18;  // 速度越快越要提前起跳

    // 已经太近了，来不及做动作：找一条干净的道侧闪
    var tooLate = (type === 'low' && dist < 2.2 * k && !P.jumping) ||
                  (type === 'high' && dist < 2.0 * k && !P.sliding);
    if (tooLate) {
      var dodge = botPickLane(ahead);
      if (dodge >= 0) {
        var dc = ahead[0].cells[dodge];
        if (!dc || dc === 'shard') { moveLane(dodge > P.lane ? 1 : -1); return; }
      }
    }

    if (type === 'low' && dist < 5.2 * k && !P.jumping) jump();
    if (type === 'high' && dist < 4.4 * k && !P.sliding) slide();
  }

  // ---------------- 更新 ----------------
  function updatePlayer(dt) {
    var targetX = LANE_X[P.lane];
    P.x += (targetX - P.x) * Math.min(1, dt * 15);
    P.tilt = Math.max(-0.22, Math.min(0.22, (P.x - targetX) * 0.34));

    if (P.jumping) {
      P.vy -= CFG.gravity * dt;
      P.y += P.vy * dt;
      if (P.y <= 0) {
        P.y = 0;
        P.vy = 0;
        P.jumping = false;
        audio.sfx('land');
      }
    }

    if (P.sliding) {
      P.slideT -= dt;
      if (P.slideT <= 0) P.sliding = false;
    }

    if (P.invuln > 0) P.invuln -= dt;
  }

  function scrollWorld(dt) {
    var dz = G.speed * dt;

    for (var i = ROWS.length - 1; i >= 0; i--) {
      var row = ROWS[i];
      row.z += dz;
      row.grp.position.z = row.z;

      // 碎片转一转
      if (row.z > -40 && row.z < 12) {
        for (var k = 0; k < 3; k++) {
          var obj = row.objs[k];
          if (obj && obj.userData.spin && obj.visible) {
            obj.rotation.y += dt * 3;
          }
        }
      }

      if (row.z > 20) {
        ROWS.splice(i, 1);
        clearRow(row);
        ROW_POOL.push(row);
      }
    }

    G.finishZ += dz;
    gate.position.z = G.finishZ;

    if (!G.finished && G.finishZ > -1.0) {
      endGame(true);
      return;
    }

    for (var p = 0; p < PILLARS.length; p++) {
      PILLARS[p].position.z += dz;
      if (PILLARS[p].position.z > 16) PILLARS[p].position.z -= SCENERY_LEN;
    }

    var dashLen = DASHES.length ? 24 * 6 : 0;
    for (var d = 0; d < DASHES.length; d++) {
      DASHES[d].position.z += dz;
      if (DASHES[d].position.z > 14) DASHES[d].position.z -= dashLen;
    }
  }

  function updateCamera(dt) {
    var goalX = P.x * 0.42;
    var goalY = 4.05 + P.y * 0.12;

    if (G.state === 'menu') {
      // 菜单里绕到正面，让主角露脸
      goalX = Math.sin(G.time * 0.4) * 0.9;
      goalY = 2.35;
      camGoal.set(goalX, goalY, -5.2);
      camera.position.lerp(camGoal, 1 - Math.pow(0.0015, dt));
      lookGoal.set(1.9, 1.05, 0.3);
      camera.lookAt(lookGoal);
      return;
    }

    camGoal.set(goalX, goalY, 8.9);
    camera.position.lerp(camGoal, 1 - Math.pow(0.0015, dt));

    if (G.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * G.shake;
      camera.position.y += (Math.random() - 0.5) * G.shake;
      G.shake = Math.max(0, G.shake - dt * 1.8);
    }

    lookGoal.set(P.x * 0.28, 1.62 + P.y * 0.28, -8.5);
    camera.lookAt(lookGoal);
  }

  function updateRacer(dt) {
    var running = G.state === 'playing' && !P.jumping && !P.sliding;

    racer.animate(dt, {
      running: running,
      jumping: P.jumping,
      sliding: P.sliding,
      tilt: P.tilt,
      y: P.y
    });

    racer.group.position.x = P.x;
    racer.group.position.z = 0.2;

    // 无敌时间闪烁
    if (P.invuln > 0) {
      racer.group.visible = Math.floor(G.time * 14) % 2 === 0;
      racer.setTint(0.5 + 0.5 * Math.sin(G.time * 22));
    } else {
      racer.group.visible = true;
      racer.setTint(0);
    }

    racerShadow.position.x = P.x;
    var shrink = Math.max(0.55, 1 - P.y * 0.3);
    racerShadow.scale.setScalar(shrink);
    racerShadow.material.opacity = 0.3 * Math.max(0.25, 1 - P.y * 0.35);
  }

  function updateChaser(dt) {
    if (!chaser) return;

    var show = G.lives < CFG.lives && G.state !== 'menu' && G.state !== 'paused' && !G.win;
    chaser.visible = show;
    if (!show) {
      G.chaserZ = 5.6;
      return;
    }

    // 心越少贴得越近：3 心刚露头，1 心几乎扑到脸上
    var target = G.lives >= 3 ? 4.1 : (G.lives === 2 ? 3.55 : 3.05);
    G.chaserZ += (target - G.chaserZ) * Math.min(1, dt * 2.4);

    chaser.position.x = P.x * 0.55;
    chaser.position.z = G.chaserZ;
    chaser.position.y = 0.42 + Math.abs(Math.sin(G.time * 7.5)) * 0.10;
    chaser.rotation.z = Math.sin(G.time * 5.2) * 0.09;
  }

  var lastHud = { dist: -1, shards: -1, progress: -1 };

  function updateHud() {
    var d = Math.floor(G.distance);
    if (d !== lastHud.dist) {
      lastHud.dist = d;
      distText.textContent = d + ' m';
    }

    var prog = Math.min(100, Math.round(G.distance / CFG.finishDistance * 1000) / 10);
    if (prog !== lastHud.progress) {
      lastHud.progress = prog;
      progressFill.style.width = prog + '%';
    }

    if (G.shards !== lastHud.shards) {
      lastHud.shards = G.shards;
      shardText.textContent = G.shards;
    }
  }

  function paintHearts(pulseIndex) {
    var hearts = heartsEl.querySelectorAll('.heart');
    for (var i = 0; i < hearts.length; i++) {
      if (i < G.lives) {
        hearts[i].classList.remove('off');
      } else {
        hearts[i].classList.add('off');
      }
      hearts[i].classList.remove('pulse');
    }
    if (typeof pulseIndex === 'number' && hearts[pulseIndex]) {
      hearts[pulseIndex].classList.add('pulse');
    }
  }

  function updateFlash(dt) {
    if (G.hitFlash > 0) {
      G.hitFlash = Math.max(0, G.hitFlash - dt * 2.2);
      fadeHit.style.opacity = G.hitFlash * 0.8;
    } else if (fadeHit.style.opacity !== '0') {
      fadeHit.style.opacity = 0;
    }
  }

  // ---------------- 界面 ----------------
  function showScreen(name) {
    screenMenu.classList.add('hidden');
    screenPause.classList.add('hidden');
    screenResult.classList.add('hidden');
    if (name === 'menu') screenMenu.classList.remove('hidden');
    if (name === 'pause') screenPause.classList.remove('hidden');
    if (name === 'result') screenResult.classList.remove('hidden');
  }

  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, ms || 2800);
  }

  function goMenu(msg) {
    G.state = 'menu';
    G.demo = false;
    audio.stopBgm();
    hud.classList.add('hidden');
    demoBadge.classList.add('hidden');

    // 清场：回菜单时把走廊恢复成一条空走廊
    while (ROWS.length) {
      var r = ROWS.pop();
      clearRow(r);
      ROW_POOL.push(r);
    }
    G.lastRowObj = null;
    G.finishZ = -CFG.finishDistance;
    gate.position.z = G.finishZ;
    P.lane = 1;
    P.x = 0;
    P.y = 0;
    P.vy = 0;
    P.jumping = false;
    P.sliding = false;
    P.invuln = 0;
    P.tilt = 0;
    racer.group.visible = true;
    racer.setTint(0);
    if (chaser) chaser.visible = false;

    showScreen('menu');
    if (msg) toast(msg, 3400);
  }

  function startGame(isDemo) {
    audio.init();
    audio.sfx('ui');

    G.state = 'playing';
    G.demo = !!isDemo;
    G.time = 0;
    G.distance = 0;
    G.speed = CFG.startSpeed;
    G.speedMul = 1;
    G.shards = 0;
    G.lives = CFG.lives;
    G.finishZ = -CFG.finishDistance;
    G.shake = 0;
    G.hitFlash = 0;
    G.lastRow = null;
    G.lastPassable = 3;
    G.lastRowObj = null;
    G.finished = false;
    G.win = false;
    G.chaserZ = 5.6;
    G.botCool = 0;
    G.hitLog = [];

    P.lane = 1;
    P.x = 0;
    P.y = 0;
    P.vy = 0;
    P.jumping = false;
    P.sliding = false;
    P.slideT = 0;
    P.invuln = 0;
    P.tilt = 0;

    while (ROWS.length) {
      var r = ROWS.pop();
      clearRow(r);
      ROW_POOL.push(r);
    }

    gate.position.z = G.finishZ;
    camera.position.set(0, 4.05, 8.9);   // 开局直接把镜头切到背后

    // 预铺一段走廊。开局先给约 3 秒空跑道，第一排是碎片，不吓人
    spawnRow(['shard', 'shard', 'shard'], -45);
    G.lastPassable = 3;
    var z = -45 - bandFor(0).gap;
    while (z > SPAWN_Z) {
      var band = bandFor(Math.max(0, -z));
      spawnRow(pickPattern(band.set), z);
      z -= band.gap;
    }

    lastHud = { dist: -1, shards: -1, progress: -1 };
    finishText.textContent = CFG.finishDistance + ' m';
    paintHearts();
    updateHud();

    hud.classList.remove('hidden');
    showScreen(null);
    if (G.demo) {
      demoBadge.classList.remove('hidden');
      audio.sfx('demo');
    } else {
      demoBadge.classList.add('hidden');
    }

    audio.startBgm();
  }

  function endGame(win) {
    if (G.state !== 'playing') return;

    G.state = 'over';
    G.finished = true;
    G.win = win;

    racer.setTint(0);
    racer.group.visible = true;

    if (G.demo) {
      audio.stopBgm();
      audio.sfx(win ? 'win' : 'lose');
      demoBadge.classList.add('hidden');
      hud.classList.add('hidden');
      setTimeout(function () {
        goMenu(win
          ? '演示结束：成功跑到终点。想自己试一次吗？'
          : '演示结束：被障碍拦下来了。换你来跑一次？');
      }, 1600);
      return;
    }

    audio.stopBgm();
    audio.sfx(win ? 'win' : 'lose');

    var score = Math.floor(G.distance) + G.shards * 10;
    document.getElementById('resultEyebrow').textContent = win ? 'Run complete' : 'Run failed';
    document.getElementById('resultTitle').textContent = win ? '冲过终点门' : '被拦下来了';
    document.getElementById('resultNote').textContent = win
      ? '整条长廊跑完了。要不要试试把碎片全吃满？'
      : '还有 ' + Math.max(0, Math.round(CFG.finishDistance - G.distance)) + ' 米就到终点了，再试一次。';
    document.getElementById('statDist').textContent = Math.floor(G.distance) + ' m';
    document.getElementById('statShards').textContent = G.shards;
    document.getElementById('statScore').textContent = score;

    showScreen('result');
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    if (G.demo) { goMenu('已退出演示'); return; }
    G.state = 'paused';
    audio.stopBgm();
    showScreen('pause');
  }

  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    showScreen(null);
    audio.startBgm();
  }

  // ---------------- 主循环 ----------------
  function update(dt) {
    G.time += dt;

    if (G.state === 'playing') {
      var t = Math.min(1, G.distance / 520);
      var base = CFG.startSpeed + (CFG.maxSpeed - CFG.startSpeed) * t;
      G.speedMul = Math.min(1, G.speedMul + dt * 0.6);
      G.speed = base * G.speedMul;
      G.distance += G.speed * dt;

      if (G.demo) botThink(dt);
      updatePlayer(dt);

      scrollWorld(dt);
      if (G.state !== 'playing') return;

      // 终点附近不再生成新障碍
      if (G.finishZ < -48) spawnAhead();
      checkRows();
      updateHud();
    }

    updateRacer(dt);
    updateChaser(dt);
    updateCamera(dt);
    updateFlash(dt);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = (now - clockLast) / 1000;
    clockLast = now;
    if (!isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.06);

    update(dt);
    renderer.render(scene, camera);
  }

  // ---------------- 启动 ----------------
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(0xe2be86, 55, 165);

    camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(0, 2.35, -5.2);
    camera.lookAt(0, 1.05, 0.3);

    scene.add(new THREE.HemisphereLight(0xfff2d6, 0x8a6a45, 0.55));
    var dir = new THREE.DirectionalLight(0xfff6e2, 0.45);
    dir.position.set(7, 14, 6);
    scene.add(dir);
    var fill = new THREE.DirectionalLight(0xffd9a8, 0.14);
    fill.position.set(-6, 8, -10);
    scene.add(fill);

    buildWorld();
    paintHearts();

    // ---- 输入 ----
    window.addEventListener('keydown', function (e) {
      var k = e.key;

      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { moveLane(-1); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { moveLane(1); e.preventDefault(); }
      else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        if (G.state === 'playing') { jump(); e.preventDefault(); }
      }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { slide(); e.preventDefault(); }
      else if (k === 'Escape') {
        if (G.state === 'playing') pauseGame();
        else if (G.state === 'paused') resumeGame();
      }
      else if (k === 'm' || k === 'M') { toggleMute(); }
    });

    // ---- 按钮 ----
    document.getElementById('btnStart').addEventListener('click', function () { startGame(false); });
    document.getElementById('btnDemo').addEventListener('click', function () { startGame(true); });
    document.getElementById('btnRetry').addEventListener('click', function () { startGame(false); });
    document.getElementById('btnMenu').addEventListener('click', function () { goMenu(); });
    document.getElementById('btnResume').addEventListener('click', resumeGame);
    document.getElementById('btnQuit').addEventListener('click', function () { goMenu(); });
    document.getElementById('btnPause').addEventListener('click', pauseGame);

    var muteBtns = [
      document.getElementById('btnMuteMenu'),
      document.getElementById('btnMuteHud')
    ];
    muteBtns.forEach(function (b) { b.addEventListener('click', toggleMute); });

    volRange.addEventListener('input', function () {
      var v = parseInt(volRange.value, 10) / 100;
      audio.init();
      audio.setVolume(v);
      volText.textContent = volRange.value + '%';
    });

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.state === 'playing' && !G.demo) pauseGame();
    });

    // 空格不会滚动页面
    window.addEventListener('keyup', function (e) {
      if (e.key === ' ') e.preventDefault();
    });

    // 提示语：如果是从演示回来的，菜单上给个说明
    menuHint.textContent = '按 M 随时静音';

    clockLast = performance.now();
    requestAnimationFrame(loop);
  }

  function toggleMute() {
    audio.init();
    var muted = audio.toggleMute();
    ['btnMuteMenu', 'btnMuteHud'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('is-muted', muted);
    });
    if (G.state === 'playing' || G.state === 'paused') {
      // 静音状态下 BGM 也在跑，只是音量为 0，不需要停
    }
    return muted;
  }

  // 暴露给自动化测试用（不影响正常游玩）
  window.W05Game = {
    start: function () { startGame(false); },
    startDemo: function () { startGame(true); },
    menu: function () { goMenu(); },
    state: function () { return G.state; },
    // 不渲染、只按固定步长推进逻辑，用于自动检查机器人能不能跑完全程
    advance: function (seconds) {
      var step = 1 / 60;
      var frames = Math.round(seconds / step);
      for (var i = 0; i < frames; i++) {
        if (G.state !== 'playing') break;
        update(step);
      }
      return G.state;
    },
    snapshot: function () {
      return {
        state: G.state,
        demo: G.demo,
        distance: Math.round(G.distance),
        shards: G.shards,
        lives: G.lives,
        speed: Math.round(G.speed * 10) / 10,
        lane: P.lane,
        y: Math.round(P.y * 100) / 100,
        sliding: P.sliding,
        rows: ROWS.length,
        hits: G.hitLog || [],
        win: !!G.win
      };
    }
  };

  try {
    init();
  } catch (err) {
    var box = document.getElementById('errBox');
    box.style.display = 'block';
    box.textContent = 'INIT FAILED: ' + (err && err.stack ? err.stack : err);
  }
})();
