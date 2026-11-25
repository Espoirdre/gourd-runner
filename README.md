# Gourd Runner · 黄胖快跑

A short browser-based 3D endless runner built with **Three.js** (no framework, no build step).

You play a round yellow mascot sprinting down a temple corridor. Switch lanes, jump the low
wooden barriers, slide under the stone lintels, and collect gold shards. The run ends when you
reach the glowing gate at **900 m** — or when your four hearts are gone.

---

## 0. Playable site (GitHub Pages)

**Play now — no GitHub account needed:** https://espoirdre.github.io/gourd-runner/

This is the single shared build for the whole team. It is published straight from `main` /
repository root, so whatever is merged into `main` is what players get. Do not publish a fork.

**Run it locally (two ways, both work):**

1. Double-click `index.html` — no server, no install, no network.
2. Optional local server, if your browser blocks local file scripts:
   ```
   python -m http.server 8000     # then open http://localhost:8000
   ```

**How the site is published:**

1. Repository **Settings → Pages**.
2. Source: **Deploy from a branch**; branch **`main`**, folder **`/` (root)**.
3. GitHub builds and deploys within a minute; the URL above is the result. Every push to `main`
   triggers a new deployment, visible under the **Actions** tab.

Pages only serves static files — there is no backend, and this game needs none.

---

## 0.5 CI/CD exploration

Deployment run: [pages build and deployment #1](https://github.com/Espoirdre/gourd-runner/actions/runs/44711908787)

Deployment inspected: "pages build and deployment #1" of Espoirdre/gourd-runner on branch main, from commit aa89a56. The Summary showed trigger event "dynamic" and overall result Success; "dynamic" cannot be interpreted as "push" from the logs alone.

The pipeline ran automatically: Checkout, Build with Jekyll (source ./, output ./_site), Upload artifact (github-pages, reported valid and successfully uploaded), then deployment via actions/deploy-pages@v5 reading that same artifact, creating a Pages deployment for the source commit and reporting success; report-build-status also succeeded. Steps outside automation include setting the Pages publish source, initiating the first run, and browser-based gameplay acceptance.

The logs show build, upload, and deployment succeeded, but cannot prove the game works: no gameplay testing appears in the inspected steps, which does not rule out tests elsewhere in the repository. A useful missing check (candidate suggestion, not personal judgment): an automated post-deploy smoke test loading the page and verifying key assets.

## 1. Run it (no install, no server, no network)

1. Unzip the folder (or open it as delivered).
2. Double-click **`index.html`**.
3. The menu appears. Click **开始游戏 / Start** or **观看演示 Demo**.

That is the whole setup. There is nothing to install and nothing to download: Three.js is
vendored inside `lib/`, and every script is a classic `<script>` tag, so the game runs straight
from `file://`. No local web server is required, and the game never contacts the network.

If your browser blocks local file scripts for some reason, an optional fallback is:

```
cd w05_3d_game
python -m http.server 8000
# then open http://localhost:8000
```

## 2. Controls

| Action | Keys |
| --- | --- |
| Switch lane left / right | `←` `→` or `A` `D` |
| Jump over a low barrier | `Space` or `W` or `↑` |
| Slide under a lintel | `↓` or `S` |
| Mute / unmute | `M` |
| Pause | `Esc` |

**Keyboard only** — there is no touch or gamepad support.

### Tips & combos

- **Jump + lane switch:** while in the air you can still change lanes. Use this to dodge a pillar
  that appears right in front of you.
- **Slide cancel:** pressing `↓` / `S` during a landing recovery cancels the brief cooldown and
  lets you slide earlier — useful when a lintel follows a low barrier.
- **Double threat:** when you see a low barrier and a lintel in quick succession, jump over the
  first and immediately slide (hold `↓` / `S` before landing) to duck the second.
- **Stay central:** the middle lane gives you the most reaction time for obstacles appearing on
  either side. Only switch when you must.
- **Wait at the start:** the first few rows come at a moderate pace; use them to settle into a
  rhythm before the speed picks up.

## 3. Rules and feedback

- **Goal:** reach the gate at 900 m. A progress bar at the top shows how far you are.
- **Lives:** 4 hearts. Hitting anything costs one heart and briefly makes you invulnerable (you blink).
- **The cat:** once you lose a heart, a grumpy orange cat appears behind you and closes in. At one heart it is almost on top of you. Losing the last heart ends the run.
- **Shards:** each gold shard is +10 score. Score = floor(distance) + shards × 10.
- **Speed:** the corridor accelerates from 15 to 21 units/s as you advance, and every band of the
  level draws from a different obstacle table (see `src/patterns.js`).
- **Restart:** after finishing or failing, the result panel offers *再跑一次* (retry) and
  *回主菜单* (menu).

Three obstacle types, each with a different answer:

| Obstacle | Look | Answer |
| --- | --- | --- |
| Low barrier | brown wooden fence | jump, or change lane |
| Lintel | teal stone beam with two posts | slide, or change lane |
| Pillar | sandstone column | change lane — jumping will not help |

## 4. Demo mode (automated)

On the start screen, click **观看演示 Demo**.

- One click starts a fully automatic run — no further input from the player.
- It uses the real game: the same scene, the same collision checks, the same sound. A small
  rule-based bot (in `src/game.js`, `botThink`) decides lane changes, jumps and slides from the
  upcoming obstacle rows. Nothing is pre-recorded.
- The `DEMO 自动演示` badge stays on screen while it plays. Sound is on.
- Press `Esc` at any time to leave the demo.
- When the run ends the demo returns to the start menu by itself, and you can start a normal
  human game from there.

## 5. Sound and volume

All audio is **synthesized at runtime with the Web Audio API** in `src/audio.js` — there are no
audio files in this project, so there are no third-party audio licences to clear.

Sound events: footstep-free running pulse, lane-change blip, jump, landing thud, slide noise,
shard pickup, hit, win fanfare, fail sting, plus a looping background bass/arpeggio track.

Controls:

- **Volume slider** on the start screen (0–100 %).
- **Speaker button** in the menu and in the HUD.
- **`M` key** to mute/unmute at any time.

> ⚠️ **Browsers block autoplay**, so sound only starts after your first click — tap **开始游戏 / Start**,
> **观看演示 Demo**, or adjust the volume slider to enable audio. On some laptops the volume starts
> low; raise the slider if you cannot hear anything.

## 6. Tested browsers

**How it was tested:** `index.html` opened straight from disk (`file://`), with no server and no
network. The run went to the 900 m gate, the demo was played once, and sound was checked with
both the `M` key and the volume slider.

| Browser | Version | OS | Played to 900 m | Demo | Sound |
| --- | --- | --- | --- | --- | --- |
| Microsoft Edge (Chromium) | 157.0.4341.60 | Windows 11 25H2 (build 26200) | yes | yes | yes |

**Requires WebGL.** The renderer is `THREE.WebGLRenderer` with no 2D fallback, so a browser that
cannot create a WebGL context has no way to draw the scene.

**Not tested:** Google Chrome, Safari, Firefox. Phones are out of scope for play: no touch or
gamepad input is implemented (see §8 for what a phone actually does).

## 7. Files

```
w05_3d_game/
├─ index.html          menu / HUD / styles + script tags
├─ README.md
├─ package.json        dependency manifest (no runtime dependencies)
├─ lib/
│  └─ three.min.js     Three.js r147, MIT, vendored for offline use
└─ src/
   ├─ patterns.js      LEVEL DATA — obstacle tables, gaps, speed, finish distance
   ├─ character.js     the mascot, built only from Three.js primitives
   ├─ audio.js         Web Audio sound synthesis
   └─ game.js          scene, camera, player, collision, demo bot, HUD
```

`src/patterns.js` is plain data: each row is `[left lane, middle lane, right lane]` and each cell
is `''`, `'shard'`, `'low'`, `'high'` or `'pillar'`. Edit that table to change the level; no other
file needs to change.
> Checked: 8 files match submission package, all descriptions accurate.

## 8. Known limits

**Affects play**

- **Keyboard only.** No touch or swipe input is implemented. On a phone the page loads and the
  game runs, but swiping does nothing: the character cannot be steered, so the game cannot be
  played there. The pause and volume buttons still work because they are ordinary buttons.
- **No persistence.** Nothing is stored in the browser: the score lives only for the current run,
  and the volume slider returns to its 65% default on reload. There is no save, continue or
  best-score record.
- **One level only**, about 48–49 seconds per run: three human runs and one demo run, timed, all
  finished in 48–49 s. Reaching 900 m ends the game; there is no endless mode and no second
  stage.

**Deliberate trade-offs**

- **Procedural obstacles.** Rows are generated from a table with a fairness filter, so two runs
  are never identical; you may occasionally see an easy stretch repeat.
- **No shadows or post-processing.** Flat-shaded and low-poly on purpose so it stays smooth on
  integrated graphics; the character casts a painted circle shadow instead of a real one.
- **Rendering resolution is capped** at 1.6× device pixel ratio to protect frame rate.
- **Approximate mascot.** The character is built from spheres and capsules, so it is an
  approximation of the reference design, not a sculpted model.

## 9. Credits

- Three.js r147 — MIT licence, vendored at `lib/three.min.js`.
- Character, level geometry, textures and all audio: made by this group, generated in code at
  runtime. No external models, textures, fonts or sound files are used.

## 10. Debug hooks (for testing only)

`window.W05Game` exposes `start()`, `startDemo()`, `menu()`, `state()`, `snapshot()` and
`advance(seconds)`. They are used by the group's automated checks and do not affect normal play.

---

## Contributors

Each person wrote their own row; nobody edited a teammate's line.

| Contributor | What they did | Week 05 | Week 07 |
| --- | --- | --- | --- |
| 张铖轩 | Set the game concept and scope (three-lane runner, geometric mascot, one 900 m level), drove the build in the harness, and checked every build in the browser; in Week 07 published the site and wrote §0. | concept, scope, build, browser checks | publishing, README §0, merge |
| 陈思峥 | _to be written by this member_ | game | README §2, §5 |
| 高斌雄 | _to be written by this member_ | game | README §6, §8 |
| 嵇翰林 | _to be written by this member_ | game | README §0.5 (CI/CD) |
| 马桢豪 | _to be written by this member_ | game | README §7, §9 |

