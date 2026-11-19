/* ==========================================================
 * audio.js — 全部音效由 Web Audio 实时合成
 * ----------------------------------------------------------
 * 不依赖任何外部音频文件，所以提交包里没有版权风险，
 * 也不需要联网。首次点击/按键时才创建 AudioContext（浏览器策略）。
 *
 * 对外接口：
 *   GameAudio.init()          首次用户操作时调用
 *   GameAudio.sfx(name)       播放一个音效
 *   GameAudio.startBgm()      开始循环背景音乐
 *   GameAudio.stopBgm()       停止背景音乐
 *   GameAudio.setVolume(0..1)
 *   GameAudio.toggleMute() -> 返回是否静音
 *   GameAudio.isMuted()
 * ========================================================== */

window.GameAudio = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var sfxBus = null;
  var bgmBus = null;
  var noiseBuf = null;

  var volume = 0.65;
  var muted = false;
  var bgmTimer = null;
  var bgmNext = 0;
  var bgmStep = 0;

  // 背景音乐：A 小调五声音阶的简单循环，每步 0.26 秒
  var BGM_STEP = 0.26;
  var BASS = [110.00, 110.00, 146.83, 110.00, 98.00, 98.00, 130.81, 98.00];
  var LEAD = [440.00, 523.25, 659.25, 523.25, 392.00, 493.88, 587.33, 493.88];

  function buildNoise() {
    var len = Math.floor(ctx.sampleRate * 0.4);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return buf;
  }

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0.5;
    bgmBus.connect(master);

    noiseBuf = buildNoise();
  }

  function tone(freq, dur, type, peak, freqTo, bus) {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
    }

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noiseHit(dur, peak, cutoff) {
    if (!ctx || !noiseBuf) return;
    var t0 = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff || 1200, t0);
    filter.frequency.exponentialRampToValueAtTime(220, t0 + dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function sfx(name) {
    if (!ctx || muted) return;

    switch (name) {
      case 'jump':
        tone(300, 0.16, 'sine', 0.22, 620);
        break;
      case 'land':
        noiseHit(0.1, 0.12, 700);
        break;
      case 'slide':
        noiseHit(0.22, 0.1, 2400);
        break;
      case 'lane':
        tone(520, 0.07, 'triangle', 0.07, 700);
        break;
      case 'pickup':
        tone(880, 0.07, 'square', 0.1);
        setTimeout(function () { tone(1320, 0.09, 'square', 0.08); }, 55);
        break;
      case 'hit':
        tone(140, 0.28, 'sawtooth', 0.26, 55);
        noiseHit(0.24, 0.22, 900);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
          setTimeout(function () { tone(f, 0.28, 'triangle', 0.16); }, i * 120);
        });
        break;
      case 'lose':
        [392.0, 329.63, 246.94].forEach(function (f, i) {
          setTimeout(function () { tone(f, 0.3, 'sawtooth', 0.12); }, i * 150);
        });
        break;
      case 'ui':
        tone(600, 0.05, 'square', 0.06);
        break;
      case 'demo':
        tone(440, 0.09, 'triangle', 0.1);
        setTimeout(function () { tone(660, 0.12, 'triangle', 0.1); }, 90);
        break;
    }
  }

  function scheduleStep(time, step) {
    var bass = BASS[step % BASS.length];
    var lead = LEAD[step % LEAD.length];

    var b = ctx.createOscillator();
    var bg = ctx.createGain();
    b.type = 'triangle';
    b.frequency.setValueAtTime(bass, time);
    bg.gain.setValueAtTime(0.0001, time);
    bg.gain.exponentialRampToValueAtTime(0.22, time + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, time + BGM_STEP * 0.9);
    b.connect(bg); bg.connect(bgmBus);
    b.start(time); b.stop(time + BGM_STEP);

    if (step % 2 === 0) {
      var l = ctx.createOscillator();
      var lg = ctx.createGain();
      l.type = 'sine';
      l.frequency.setValueAtTime(lead * 2, time);
      lg.gain.setValueAtTime(0.0001, time);
      lg.gain.exponentialRampToValueAtTime(0.055, time + 0.03);
      lg.gain.exponentialRampToValueAtTime(0.0001, time + BGM_STEP * 1.6);
      l.connect(lg); lg.connect(bgmBus);
      l.start(time); l.stop(time + BGM_STEP * 1.8);
    }
  }

  function startBgm() {
    if (!ctx) return;
    if (bgmTimer) return;
    bgmNext = ctx.currentTime + 0.1;
    bgmStep = 0;
    bgmTimer = setInterval(function () {
      if (!ctx) return;
      while (bgmNext < ctx.currentTime + 0.25) {
        scheduleStep(bgmNext, bgmStep);
        bgmStep++;
        bgmNext += BGM_STEP;
      }
    }, 60);
  }

  function stopBgm() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) {
      master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master && ctx) {
      master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
    }
    return muted;
  }

  function isMuted() { return muted; }
  function getVolume() { return volume; }

  return {
    init: init,
    sfx: sfx,
    startBgm: startBgm,
    stopBgm: stopBgm,
    setVolume: setVolume,
    getVolume: getVolume,
    toggleMute: toggleMute,
    isMuted: isMuted
  };
})();
