/* ==========================================================
 * character.js — 用基础几何体拼出主角"黄胖"
 * ----------------------------------------------------------
 * 没有外部模型文件，全部是 Three.js 内置几何体：
 *   身体  = LatheGeometry（一条轮廓线旋转出来的葫芦形）
 *   头    = SphereGeometry
 *   肚皮  = 压扁的 SphereGeometry
 *   眼睛  = 三颗小球（眼白 / 青绿虹膜 / 瞳孔）
 *   嘴    = 半圈 TorusGeometry
 *   手臂  = 两根交叉的 CapsuleGeometry（抱胸）
 *
 * createRacer() 返回 { group, parts, animate(t, state) }
 * ========================================================== */

window.createRacer = function (THREE) {
  'use strict';

  var group = new THREE.Group();

  var matBody = new THREE.MeshLambertMaterial({ color: 0xf2ce4a });
  var matBelly = new THREE.MeshLambertMaterial({ color: 0xfcefc4 });
  var matWhite = new THREE.MeshLambertMaterial({ color: 0xffffff });
  var matIris = new THREE.MeshLambertMaterial({ color: 0x46b79a });
  var matPupil = new THREE.MeshLambertMaterial({ color: 0x16211f });
  var matMouth = new THREE.MeshLambertMaterial({ color: 0x7a5a24 });

  // ---- 身体：葫芦形轮廓 ----
  var profile = [
    [0.10, 0.00],
    [0.32, 0.06],
    [0.50, 0.16],
    [0.61, 0.30],
    [0.655, 0.46],
    [0.635, 0.62],
    [0.57, 0.78],
    [0.48, 0.92],
    [0.42, 1.00],
    [0.38, 1.06]
  ].map(function (p) { return new THREE.Vector2(p[0], p[1]); });

  var torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), matBody);
  group.add(torso);

  // ---- 肚皮：用同一套轮廓放大 2% 再切出正前方的一段，
  //      这样奶油色是贴在身体表面上的，不会鼓成一个球 ----
  var bellyProfile = [
    [0.508, 0.17],
    [0.618, 0.31],
    [0.664, 0.46],
    [0.644, 0.62],
    [0.578, 0.78]
  ].map(function (p) { return new THREE.Vector2(p[0], p[1]); });

  var belly = new THREE.Mesh(
    new THREE.LatheGeometry(bellyProfile, 18, -0.72, 1.44),
    matBelly
  );
  group.add(belly);

  // ---- 头 ----
  var headGroup = new THREE.Group();
  headGroup.position.set(0, 1.02, 0);
  group.add(headGroup);

  var head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 18), matBody);
  head.position.set(0, 0.22, 0);
  head.scale.set(1, 0.97, 0.96);
  headGroup.add(head);

  // ---- 眼睛 ----
  [-1, 1].forEach(function (side) {
    var eye = new THREE.Group();
    eye.position.set(side * 0.16, 0.28, 0.36);

    var white = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 12), matWhite);
    eye.add(white);

    var iris = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), matIris);
    iris.position.set(0, 0, 0.070);
    eye.add(iris);

    var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.020, 12, 10), matPupil);
    pupil.position.set(0, 0, 0.103);
    eye.add(pupil);

    headGroup.add(eye);
  });

  // ---- 嘴：半圈圆环当微笑（要露在脸的表面之外，不然会被头球埋掉）----
  var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.019, 8, 16, Math.PI), matMouth);
  mouth.position.set(0, 0.115, 0.432);
  mouth.rotation.z = Math.PI;
  headGroup.add(mouth);

  // ---- 抱胸的手臂：两根几乎水平、上下错开的胶囊 ----
  var armGeo = new THREE.CapsuleGeometry(0.105, 0.36, 6, 12);

  var armA = new THREE.Mesh(armGeo, matBody);
  armA.position.set(-0.01, 0.86, 0.40);
  armA.rotation.z = Math.PI / 2 + 0.10;
  armA.rotation.y = 0.08;
  group.add(armA);

  var armB = new THREE.Mesh(armGeo, matBody);
  armB.position.set(0.01, 0.73, 0.48);
  armB.rotation.z = Math.PI / 2 - 0.10;
  armB.rotation.y = -0.08;
  group.add(armB);

  var handGeo = new THREE.SphereGeometry(0.108, 12, 10);
  var handA = new THREE.Mesh(handGeo, matBody);
  handA.position.set(-0.31, 0.84, 0.42);
  group.add(handA);

  var handB = new THREE.Mesh(handGeo, matBody);
  handB.position.set(0.31, 0.70, 0.50);
  group.add(handB);

  // -------------------------------------------------------
  // 动画：一个 state 对象决定当前姿态
  //   state = { running, jumping, sliding, tilt, speed }
  // -------------------------------------------------------
  var anim = {
    t: 0,
    squash: 0,     // 压扁量，冲向 1
    jumpStretch: 0
  };

  function animate(dt, state) {
    anim.t += dt;

    var running = state.running !== false;
    var cycle = running ? Math.sin(anim.t * 11) : Math.sin(anim.t * 2.2);
    var bounce = running ? Math.abs(Math.sin(anim.t * 11)) * 0.085 : Math.sin(anim.t * 2.2) * 0.04;

    var targetSquash = state.sliding ? 1 : 0;
    anim.squash += (targetSquash - anim.squash) * Math.min(1, dt * 14);

    var targetStretch = state.jumping ? 1 : 0;
    anim.jumpStretch += (targetStretch - anim.jumpStretch) * Math.min(1, dt * 10);

    // 滑铲时整体压低并前倾
    var sq = anim.squash;
    group.scale.set(1 + sq * 0.18, 1 - sq * 0.42 + anim.jumpStretch * 0.06, 1 + sq * 0.10);

    // 头部在滑铲时跟着压低一点
    headGroup.position.y = 1.02 - sq * 0.30;
    headGroup.rotation.x = sq * 0.35;

    // 跑动时的上下起伏 + 左右轻晃
    group.position.y = (state.y || 0) + bounce * (1 - sq);
    group.rotation.z = (state.tilt || 0) + cycle * 0.045 * (1 - sq);
    group.rotation.x = -sq * 0.22;

    // 手臂随节奏轻微起伏
    armA.position.y = 0.86 + cycle * 0.012;
    armB.position.y = 0.73 - cycle * 0.012;
  }

  function setTint(value) {
    // value: 0..1，撞到时整体发红
    matBody.emissive.setRGB(value * 0.55, 0, 0);
    matBelly.emissive.setRGB(value * 0.45, 0, 0);
  }

  return {
    group: group,
    parts: { torso: torso, head: head, headGroup: headGroup, belly: belly },
    animate: animate,
    setTint: setTint
  };
};
