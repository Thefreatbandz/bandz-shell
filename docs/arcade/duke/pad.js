/* pad.js — gamepad → keyboard for the Bandz Arcade (DUKE NUKEM 3D).
   Plug in any controller (Xbox/PS/MFi) and it just works:
   left stick / d-pad = move+strafe (WASD), right stick = turn,
   RT or A = fire, LB or B = jump, X = run, Y = open/use,
   Start = enter, Select = menu. */
(function () {
  var padIdx = null, prev = {};
  var turnL = false, turnR = false;
  var move = { f: false, b: false, l: false, r: false };
  var DEAD = 0.35;
  var BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  var keyMap = {};
  keyMap[BTN.RT] = 'ControlRight'; // fire (EDuke32 default)
  keyMap[BTN.A] = 'ControlRight';  // fire (alt)
  keyMap[BTN.LB] = 'Space';        // jump
  keyMap[BTN.B] = 'Space';         // jump (alt)
  keyMap[BTN.X] = 'ShiftLeft';     // run
  keyMap[BTN.Y] = 'KeyE';          // open / use
  keyMap[BTN.START] = 'Enter';
  keyMap[BTN.SELECT] = 'Escape';
  function key(code, down) {
    try { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: code })); } catch (e) {}
  }
  function setMove(k, on) {
    if (move[k] !== on) { move[k] = on; key({ f: 'KeyW', b: 'KeyS', l: 'KeyA', r: 'KeyD' }[k], on); }
  }
  function setTurn(l, r) {
    if (l !== turnL) { turnL = l; key('ArrowLeft', l); }
    if (r !== turnR) { turnR = r; key('ArrowRight', r); }
  }
  function releaseAll() {
    ['f', 'b', 'l', 'r'].forEach(function (k) { setMove(k, false); });
    setTurn(false, false);
    Object.keys(keyMap).forEach(function (i) { if (prev[i]) key(keyMap[i], false); });
    prev = {};
  }
  function show(on) {
    var el = document.getElementById('padstat');
    if (el) { el.textContent = on ? '· 🎮 controller' : ''; el.style.display = on ? '' : 'none'; }
  }
  window.addEventListener('gamepadconnected', function (e) { padIdx = e.gamepad.index; show(true); });
  window.addEventListener('gamepaddisconnected', function (e) {
    if (e.gamepad.index === padIdx) { padIdx = null; releaseAll(); show(false); }
  });
  function poll() {
    requestAnimationFrame(poll);
    if (padIdx == null || !navigator.getGamepads) return;
    var gp = null;
    try { gp = navigator.getGamepads()[padIdx]; } catch (e) {}
    if (!gp || !gp.connected) { padIdx = null; releaseAll(); show(false); return; }
    var ax = gp.axes || [], b = gp.buttons || [];
    var sx = ax.length > 0 ? ax[0] : 0, sy = ax.length > 1 ? ax[1] : 0;
    var P = function (i) { return !!(b[i] && b[i].pressed); };
    if (P(BTN.LEFT)) sx -= 1;
    if (P(BTN.RIGHT)) sx += 1;
    if (P(BTN.UP)) sy -= 1;
    if (P(BTN.DOWN)) sy += 1;
    setMove('f', sy < -DEAD); setMove('b', sy > DEAD);
    setMove('l', sx < -DEAD); setMove('r', sx > DEAD);
    var rx = ax.length > 2 ? ax[2] : 0;
    setTurn(rx < -DEAD, rx > DEAD);
    var cur = {};
    Object.keys(keyMap).forEach(function (i) {
      var p = P(+i); cur[i] = p;
      if (p !== !!prev[i]) key(keyMap[i], p);
    });
    prev = cur;
  }
  requestAnimationFrame(poll);
})();
