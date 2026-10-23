/* ============================================================
   gamma.js — Gamma: generador de paletas con rueda de color
   Reglas de armonía, edición sobre la rueda, códigos en varios
   formatos, accesibilidad y exportación.
   ============================================================ */
(function (global) {
  'use strict';

  var PC = global.PC;

  function T(key, vars) {
    return global.I18N ? global.I18N.t(key, vars) : key;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function normHue(h) { h = h % 360; return h < 0 ? h + 360 : h; }

  /* ============================================================
     Reglas de armonía (5 colores, el base siempre en el índice 2)
     dh = giro de tono, dl = ajuste de luminosidad, ds = factor de saturación
     ============================================================ */
  var RULES = [
    { id: 'analog', dh: [-60, -30, 0, 30, 60], dl: [0, 0, 0, 0, 0], ds: [1, 1, 1, 1, 1] },
    { id: 'mono', dh: [0, 0, 0, 0, 0], dl: [0.3, 0.15, 0, -0.15, -0.3], ds: [0.45, 0.62, 1, 0.8, 0.55] },
    { id: 'triad', dh: [120, 240, 0, 120, 240], dl: [0, 0, 0, -0.16, 0.16], ds: [1, 1, 1, 0.75, 0.75] },
    { id: 'complement', dh: [180, 180, 0, 0, 0], dl: [0.1, -0.1, 0, 0.18, -0.18], ds: [0.6, 1, 1, 0.7, 0.4] },
    { id: 'split', dh: [150, 210, 0, 150, 210], dl: [0, 0, 0, 0.16, -0.16], ds: [1, 1, 1, 0.55, 0.55] },
    { id: 'double', dh: [30, 210, 0, 180, 0], dl: [0, 0, 0, 0, 0.18], ds: [1, 1, 1, 1, 0.55] },
    { id: 'square', dh: [90, 270, 0, 180, 0], dl: [0, 0, 0, 0, 0.18], ds: [1, 1, 1, 1, 0.55] },
    { id: 'compound', dh: [30, 330, 0, 180, 90], dl: [0, 0, 0, 0, 0], ds: [1, 1, 1, 1, 1] },
    { id: 'shades', dh: [0, 0, 0, 0, 0], dl: [0.3, 0.15, 0, -0.15, -0.3], ds: [0.45, 0.7, 1, 0.8, 0.55] },
    { id: 'custom', dh: [0, 0, 0, 0, 0], dl: [0, 0, 0, 0, 0], ds: [1, 1, 1, 1, 1] }
  ];

  var G = {
    rule: 'analog',
    base: { h: 265, s: 0.64, l: 0.55 },
    colors: [],
    sel: 2,
    mode: 'hex',
    blind: 'none',
    tab: 'wheel',
    k: 5,
    imgCanvas: null,
    imgW: 0,
    imgH: 0,
    imgName: '',
    imgView: { zoom: 1, panX: 0, panY: 0 },
    imgViewW: 0,
    imgViewH: 0,
    markers: [],
    imgDrag: null,
    wheelSize: 0,
    wheelCache: null,
    drag: null,
    ready: false
  };

  var el = {};

  function ruleDef(id) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].id === id) return RULES[i];
    return RULES[0];
  }

  function generate() {
    if (G.rule === 'custom' && G.colors.length) return;
    var def = ruleDef(G.rule);
    var b = G.base;
    G.colors = [];
    for (var i = 0; i < 5; i++) {
      G.colors.push({
        h: normHue(b.h + (def.dh[i] || 0)),
        s: clamp(b.s * (def.ds[i] == null ? 1 : def.ds[i]), 0, 1),
        l: clamp(b.l + (def.dl[i] || 0), 0.08, 0.95)
      });
    }
    if (G.sel >= G.colors.length) G.sel = G.colors.length - 1;
  }

  /* ============================================================
     Utilidades de color
     ============================================================ */
  function rgbOf(c) { return PC.hslToRgb(c.h, c.s, c.l); }

  // un blanco o negro puro no cambia de tono al moverlo: le damos luminosidad util
  function usableLightness(l) {
    return (l > 0.97 || l < 0.03) ? 0.55 : l;
  }

  function blinded(rgb) {
    if (G.blind === 'none') return rgb;
    return PC.simulateBlindness(rgb, G.blind);
  }

  function hexOf(c) {
    var rgb = rgbOf(c);
    return PC.rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
  }

  function formatColor(rgb, mode) {
    var hsl = PC.rgbToHsl(rgb.r, rgb.g, rgb.b);
    switch (mode) {
      case 'rgb': return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
      case 'hsl': return 'hsl(' + Math.round(hsl.h) + ', ' + Math.round(hsl.s * 100) + '%, ' + Math.round(hsl.l * 100) + '%)';
      case 'hsv': {
        var hsv = PC.rgbToHsv(rgb.r, rgb.g, rgb.b);
        return 'hsv(' + Math.round(hsv.h) + ', ' + Math.round(hsv.s * 100) + '%, ' + Math.round(hsv.v * 100) + '%)';
      }
      case 'cmyk': {
        var cmyk = PC.rgbToCmyk(rgb.r, rgb.g, rgb.b);
        return 'cmyk(' + Math.round(cmyk.c * 100) + ', ' + Math.round(cmyk.m * 100) + ', ' +
          Math.round(cmyk.y * 100) + ', ' + Math.round(cmyk.k * 100) + ')';
      }
      case 'lab': {
        var lab = PC.rgbToLab(rgb.r, rgb.g, rgb.b);
        return 'lab(' + lab.L.toFixed(1) + ', ' + lab.a.toFixed(1) + ', ' + lab.b.toFixed(1) + ')';
      }
      default:
        return PC.rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
    }
  }

  function ruleName(id) {
    return T('rule.' + id);
  }

  /* ============================================================
     Rueda de color
     ============================================================ */
  function buildWheelCache(size, dpr) {
    var px = Math.max(80, Math.round(size * dpr));
    var c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(px, px);
    var data = img.data;
    var R = px / 2;
    var cx = R, cy = R;

    for (var y = 0; y < px; y++) {
      var dy = y - cy + 0.5;
      for (var x = 0; x < px; x++) {
        var dx = x - cx + 0.5;
        var d = Math.sqrt(dx * dx + dy * dy);
        var i = (y * px + x) * 4;
        if (d > R + 1) continue;
        var a = d > R ? 0 : (d > R - 1.2 ? (R - d) / 1.2 * 255 : 255);
        var h = normHue(Math.atan2(dy, dx) * 180 / Math.PI);
        var s = Math.min(1, d / R);
        var rgb = PC.hsvToRgb(h, s, 1);
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
        data[i + 3] = a | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function layoutWheel() {
    if (!el.wheel) return;
    var box = el.wheel.parentElement.getBoundingClientRect();
    var size = Math.max(220, Math.min(box.width, box.height, 520));
    if (!size) size = 420;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (Math.abs(size - G.wheelSize) > 1 || !G.wheelCache) {
      G.wheelSize = size;
      G.wheelCache = buildWheelCache(size, dpr);
    }
    el.wheel.width = Math.round(size * dpr);
    el.wheel.height = Math.round(size * dpr);
    el.wheel.style.width = size + 'px';
    el.wheel.style.height = size + 'px';
    G.wheelDpr = dpr;
    G.wheelCss = size;
    drawWheel();
  }

  function markerPos(c, size) {
    var R = size / 2 - 10;
    var rad = normHue(c.h) * Math.PI / 180;
    var r = clamp(c.s, 0, 1) * R;
    return {
      x: size / 2 + Math.cos(rad) * r,
      y: size / 2 + Math.sin(rad) * r
    };
  }

  function drawWheel() {
    if (!el.wheel || !G.wheelCache) return;
    var size = G.wheelCss;
    var dpr = G.wheelDpr;
    var ctx = el.wheel.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(G.wheelCache, 0, 0, size, size);

    // anillo exterior
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (var i = 0; i < G.colors.length; i++) {
      var p = markerPos(G.colors[i], size);
      var selected = i === G.sel;
      var base = G.rule !== 'custom' && i === 2;
      var rad = selected ? 11 : 8;

      ctx.beginPath();
      ctx.arc(p.x, p.y, rad + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,10,14,.55)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = hexOf(G.colors[i]);
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (base) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad + 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244,184,96,.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function pointToColor(x, y) {
    var size = G.wheelCss;
    var R = size / 2;
    var dx = x - R, dy = y - R;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) return null;
    return {
      h: normHue(Math.atan2(dy, dx) * 180 / Math.PI),
      s: Math.min(1, d / R)
    };
  }

  function onWheelDown(e) {
    if (!G.ready) return;
    var rect = el.wheel.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var size = G.wheelCss;

    var best = -1, bestD = 20;
    for (var i = 0; i < G.colors.length; i++) {
      var p = markerPos(G.colors[i], size);
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    }

    if (best >= 0) {
      G.sel = best;
      G.drag = { index: best };
    } else {
      var c = pointToColor(x, y);
      if (!c) return;
      if (G.rule === 'custom') {
        var idx = Math.min(G.sel, G.colors.length - 1);
        G.colors[idx].h = c.h;
        G.colors[idx].s = c.s;
        G.colors[idx].l = usableLightness(G.colors[idx].l);
        if (idx === 2 || G.colors.length < 3) {
          G.base = { h: c.h, s: c.s, l: G.colors[idx].l };
        }
        G.sel = idx;
        G.drag = { index: idx };
        applyDrag(x, y);
        renderAll();
        e.preventDefault();
        return;
      }
      G.base.h = c.h;
      G.base.s = c.s;
      G.sel = 2;
      generate();
      G.drag = { index: 2 };
    }

    try { el.wheel.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    applyDrag(x, y);
    renderAll();
    e.preventDefault();
  }

  function applyDrag(x, y) {
    if (!G.drag) return;
    var c = pointToColor(x, y);
    if (!c) return;
    var i = G.drag.index;
    if (i === 2 && G.rule !== 'custom') {
      G.base.h = c.h;
      G.base.s = c.s;
      generate();
    } else {
      G.colors[i].h = c.h;
      G.colors[i].s = c.s;
      G.colors[i].l = usableLightness(G.colors[i].l);
      if (i === 2) G.base = { h: c.h, s: c.s, l: G.colors[i].l };
      if (G.rule !== 'custom') {
        G.rule = 'custom';
        renderRules();
      }
    }
  }

  function onWheelMove(e) {
    if (!G.drag) return;
    var rect = el.wheel.getBoundingClientRect();
    applyDrag(e.clientX - rect.left, e.clientY - rect.top);
    drawWheel();
    renderPalette();
    renderDetail();
  }

  function onWheelUp() {
    if (!G.drag) return;
    G.drag = null;
    renderAll();
  }

  /* ============================================================
     Paneles
     ============================================================ */
  function buildRules() {
    el.rules.innerHTML = '';
    RULES.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-rule';
      b.setAttribute('data-rule', r.id);
      b.innerHTML = '<span class="g-rule-dot"></span><span>' + ruleName(r.id) + '</span>';
      b.addEventListener('click', function () {
        if (G.rule === r.id) return;
        G.rule = r.id;
        if (r.id !== 'custom') {
          if (G.colors.length === 1 && G.colors[0].s < 0.01) {
            G.base = { h: 265, s: 0.64, l: 0.55 };
          }
          G.sel = 2;
          generate();
        } else if (!G.colors.length) {
          generate();
        }
        renderRules();
        renderAll();
        drawImage();
      });
      el.rules.appendChild(b);
    });
    renderRules();
  }

  function renderRules() {
    var items = el.rules.querySelectorAll('.g-rule');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-active', items[i].getAttribute('data-rule') === G.rule);
    }
    if (el.ruleTag) el.ruleTag.textContent = ruleName(G.rule);
  }

  function renderPalette() {
    el.palette.innerHTML = '';
    el.palette.style.gridTemplateColumns = 'repeat(' + G.colors.length + ', minmax(0, 1fr))';
    el.palette.style.maxWidth = (G.colors.length * 170) + 'px';

    for (var i = 0; i < G.colors.length; i++) {
      (function (index) {
        var c = G.colors[index];
        var rgb = rgbOf(c);
        var shown = blinded(rgb);
        var ink = PC.contrastInk(shown);
        var isBase = G.rule !== 'custom' && index === 2;

        var wrap = document.createElement('div');
        wrap.className = 'g-swatch-wrap';

        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'g-swatch' + (index === G.sel ? ' is-sel' : '') + (isBase ? ' is-base' : '');
        b.style.background = PC.rgbToHex(shown.r, shown.g, shown.b);
        b.style.color = ink;
        b.innerHTML =
          '<span class="g-swatch-code">' + formatColor(rgb, G.mode) + '</span>' +
          '<span class="g-swatch-name">' + PC.describe(PC.rgbToHsl(rgb.r, rgb.g, rgb.b)) + '</span>';
        b.addEventListener('click', function () {
          G.sel = index;
          renderPalette();
          renderDetail();
          drawWheel();
          drawImage();
        });
        wrap.appendChild(b);

        if (G.colors.length > 1) {
          var x = document.createElement('button');
          x.type = 'button';
          x.className = 'g-swatch-x';
          x.textContent = '×';
          x.title = T('g.removeColor');
          x.setAttribute('aria-label', T('g.removeColor'));
          x.addEventListener('click', function (ev) {
            ev.stopPropagation();
            removeColor(index);
          });
          wrap.appendChild(x);
        }

        el.palette.appendChild(wrap);
      })(i);
    }
  }

  function removeColor(index) {
    if (G.colors.length <= 1) {
      toast(T('g.minOne'));
      return;
    }
    G.colors.splice(index, 1);
    G.markers = G.markers
      .filter(function (m) { return m.index !== index; })
      .map(function (m) {
        return m.index > index ? { index: m.index - 1, x: m.x, y: m.y } : m;
      });
    if (G.sel > index) G.sel--;
    else if (G.sel >= G.colors.length) G.sel = G.colors.length - 1;
    if (G.rule !== 'custom') {
      G.rule = 'custom';
      renderRules();
    }
    renderAll();
    drawImage();
  }
  function codeRow(label, value, copyValue) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'g-code-row';
    row.innerHTML = '<span class="g-code-label">' + label + '</span><span class="g-code-value">' + value + '</span>';
    row.title = T('g.copy');
    row.addEventListener('click', function () {
      PC.copyText(copyValue || value).then(function () {
        toast(T('toast.copied', { hex: copyValue || value }));
      });
    });
    return row;
  }

  function renderDetail() {
    var c = G.colors[G.sel];
    if (!c) return;
    var rgb = rgbOf(c);
    var shown = blinded(rgb);
    var hex = PC.rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
    var name = PC.describe(PC.rgbToHsl(rgb.r, rgb.g, rgb.b));
    var ink = PC.contrastInk(shown);
    var white = PC.contrastRatio(rgb, { r: 255, g: 255, b: 255 });
    var black = PC.contrastRatio(rgb, { r: 0, g: 0, b: 0 });
    var hsl = PC.rgbToHsl(rgb.r, rgb.g, rgb.b);
    var hsv = PC.rgbToHsv(rgb.r, rgb.g, rgb.b);
    var cmyk = PC.rgbToCmyk(rgb.r, rgb.g, rgb.b);
    var lab = PC.rgbToLab(rgb.r, rgb.g, rgb.b);

    el.detail.innerHTML = '';

    var head = document.createElement('div');
    head.className = 'g-detail-head';
    head.style.background = PC.rgbToHex(shown.r, shown.g, shown.b);
    head.style.color = ink;
    head.innerHTML = '<strong>' + hex + '</strong><span>' + name + '</span>';
    el.detail.appendChild(head);

    var rows = document.createElement('div');
    rows.className = 'g-code-rows';
    rows.appendChild(codeRow('HEX', hex, hex));
    rows.appendChild(codeRow('RGB', 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')' +
      ' · ' + rgb.r + ', ' + rgb.g + ', ' + rgb.b, rgb.r + ', ' + rgb.g + ', ' + rgb.b));
    rows.appendChild(codeRow('HSL', Math.round(hsl.h) + '°, ' + Math.round(hsl.s * 100) + '%, ' + Math.round(hsl.l * 100) + '%',
      'hsl(' + Math.round(hsl.h) + ', ' + Math.round(hsl.s * 100) + '%, ' + Math.round(hsl.l * 100) + '%)'));
    rows.appendChild(codeRow('HSV', Math.round(hsv.h) + '°, ' + Math.round(hsv.s * 100) + '%, ' + Math.round(hsv.v * 100) + '%',
      'hsv(' + Math.round(hsv.h) + ', ' + Math.round(hsv.s * 100) + '%, ' + Math.round(hsv.v * 100) + '%)'));
    rows.appendChild(codeRow('CMYK', Math.round(cmyk.c * 100) + ' / ' + Math.round(cmyk.m * 100) + ' / ' +
      Math.round(cmyk.y * 100) + ' / ' + Math.round(cmyk.k * 100) + '%',
      'cmyk(' + Math.round(cmyk.c * 100) + ', ' + Math.round(cmyk.m * 100) + ', ' + Math.round(cmyk.y * 100) + ', ' + Math.round(cmyk.k * 100) + ')'));
    rows.appendChild(codeRow('LAB', lab.L.toFixed(1) + ' / ' + lab.a.toFixed(1) + ' / ' + lab.b.toFixed(1),
      'lab(' + lab.L.toFixed(1) + ', ' + lab.a.toFixed(1) + ', ' + lab.b.toFixed(1) + ')'));
    el.detail.appendChild(rows);

    var contrast = document.createElement('div');
    contrast.className = 'g-contrast';
    contrast.innerHTML =
      '<div class="g-contrast-title">' + T('g.contrast') + '</div>' +
      '<div class="g-contrast-row"><span>' + T('g.onWhite') + '</span><b>' + white.toFixed(2) + ':1</b>' +
      '<span class="g-badge ' + (white >= 4.5 ? 'is-ok' : (white >= 3 ? 'is-mid' : 'is-bad')) + '">' +
      (white >= 7 ? 'AAA' : (white >= 4.5 ? 'AA' : (white >= 3 ? 'AA·L' : '—'))) + '</span></div>' +
      '<div class="g-contrast-row"><span>' + T('g.onBlack') + '</span><b>' + black.toFixed(2) + ':1</b>' +
      '<span class="g-badge ' + (black >= 4.5 ? 'is-ok' : (black >= 3 ? 'is-mid' : 'is-bad')) + '">' +
      (black >= 7 ? 'AAA' : (black >= 4.5 ? 'AA' : (black >= 3 ? 'AA·L' : '—'))) + '</span></div>';
    el.detail.appendChild(contrast);

    if (G.blind !== 'none') {
      var note = document.createElement('p');
      note.className = 'hint';
      note.textContent = T('g.blindActive');
      el.detail.appendChild(note);
    }
  }

  function renderAll() {
    renderBase();
    drawWheel();
    renderPalette();
    renderDetail();
    renderRules();
    el.light.value = Math.round(G.base.l * 100);
    el.lightVal.textContent = Math.round(G.base.l * 100);
    el.sat.value = Math.round(G.base.s * 100);
    el.satVal.textContent = Math.round(G.base.s * 100);
    syncRange(el.light);
    syncRange(el.sat);
  }

  function syncRange(input) {
    var min = parseFloat(input.min) || 0;
    var max = parseFloat(input.max) || 100;
    var v = parseFloat(input.value) || 0;
    input.style.setProperty('--fill', (((v - min) / (max - min)) * 100) + '%');
  }

  function toast(msg) {
    if (global.App && global.App.toast) { global.App.toast(msg); return; }
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 2200);
  }

  /* ============================================================
     Exportación
     ============================================================ */
  function cssText() {
    var lines = [':root {'];
    G.colors.forEach(function (c, i) {
      lines.push('  --gamma-' + (i + 1) + ': ' + hexOf(c) + ';');
    });
    lines.push('}');
    return lines.join('\n');
  }

  function jsonText() {
    return JSON.stringify({
      tool: 'ColorCat · Gamma',
      rule: G.rule,
      base: { hex: hexOf(G.base), h: Math.round(G.base.h), s: +(G.base.s * 100).toFixed(1), l: +(G.base.l * 100).toFixed(1) },
      colors: G.colors.map(function (c) {
        var rgb = rgbOf(c);
        var hsl = PC.rgbToHsl(rgb.r, rgb.g, rgb.b);
        var hsv = PC.rgbToHsv(rgb.r, rgb.g, rgb.b);
        var cmyk = PC.rgbToCmyk(rgb.r, rgb.g, rgb.b);
        var lab = PC.rgbToLab(rgb.r, rgb.g, rgb.b);
        return {
          hex: hexOf(c),
          rgb: [rgb.r, rgb.g, rgb.b],
          hsl: [Math.round(hsl.h), Math.round(hsl.s * 100), Math.round(hsl.l * 100)],
          hsv: [Math.round(hsv.h), Math.round(hsv.s * 100), Math.round(hsv.v * 100)],
          cmyk: [Math.round(cmyk.c * 100), Math.round(cmyk.m * 100), Math.round(cmyk.y * 100), Math.round(cmyk.k * 100)],
          lab: [+lab.L.toFixed(1), +lab.a.toFixed(1), +lab.b.toFixed(1)]
        };
      })
    }, null, 2);
  }

  function downloadText(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ---------- hoja PNG ---------- */
  function buildPng() {
    var W = 1600, H = 745, SCALE = 2;
    var c = document.createElement('canvas');
    c.width = W * SCALE;
    c.height = H * SCALE;
    var ctx = c.getContext('2d');
    ctx.scale(SCALE, SCALE);

    var PAPER = '#F5F1E7', INK = '#191510', INK2 = '#5B5347', INK3 = '#8B8274', ACCENT = '#A8502E';
    var SANS = '"Segoe UI", system-ui, sans-serif';
    var SERIF = 'Georgia, "Times New Roman", serif';
    var MONO = '"Cascadia Mono", Consolas, monospace';

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    // tira superior
    var seg = W / G.colors.length;
    G.colors.forEach(function (col, i) {
      ctx.fillStyle = hexOf(col);
      ctx.fillRect(i * seg, 0, seg + 1, 12);
    });

    var M = 80;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK3;
    ctx.font = '600 12px ' + SANS;
    ctx.fillText('COLORCAT · GAMMA', M, 74);

    ctx.fillStyle = INK;
    ctx.font = '600 46px ' + SERIF;
    ctx.fillText(ruleName(G.rule), M, 128);

    ctx.fillStyle = INK2;
    ctx.font = '400 15px ' + SANS;
    var dateStr = new Date().toLocaleDateString(
      global.I18N ? global.I18N.locale() : 'es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillText(G.rule === 'custom'
      ? T('g.pngSubCustom', { n: G.colors.length, date: dateStr })
      : T('g.pngSub', { hex: hexOf(G.base), date: dateStr }), M, 158);

    var top = 210;
    var gap = 26;
    var cw = (W - M * 2 - gap * (G.colors.length - 1)) / G.colors.length;
    var blockH = 250;

    G.colors.forEach(function (col, i) {
      var x = M + i * (cw + gap);
      var rgb = rgbOf(col);
      var hex = hexOf(col);

      ctx.fillStyle = hex;
      ctx.fillRect(x, top, cw, blockH);

      ctx.fillStyle = 'rgba(255,255,255,.92)';
      if (i === 2 && G.rule !== 'custom') {
        ctx.fillRect(x + 14, top + 14, 58, 22);
        ctx.fillStyle = INK;
        ctx.font = '700 9px ' + SANS;
        ctx.fillText('BASE', x + 22, top + 29);
      }

      var y = top + blockH + 40;
      ctx.fillStyle = INK;
      var hexSize = G.colors.length <= 5 ? 26 : (G.colors.length <= 7 ? 20 : 14);
      ctx.font = '600 ' + hexSize + 'px ' + MONO;
      ctx.fillText(hex, x, y);

      var hsl = PC.rgbToHsl(rgb.r, rgb.g, rgb.b);
      var hsv = PC.rgbToHsv(rgb.r, rgb.g, rgb.b);
      var cmyk = PC.rgbToCmyk(rgb.r, rgb.g, rgb.b);
      var lab = PC.rgbToLab(rgb.r, rgb.g, rgb.b);

      var codeSize = G.colors.length <= 6 ? 12 : (G.colors.length <= 9 ? 10 : 8.5);
      ctx.font = '400 ' + codeSize + 'px ' + MONO;
      ctx.fillStyle = INK3;
      var lines = [
        'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')',
        'hsl(' + Math.round(hsl.h) + ', ' + Math.round(hsl.s * 100) + '%, ' + Math.round(hsl.l * 100) + '%)',
        'hsv(' + Math.round(hsv.h) + ', ' + Math.round(hsv.s * 100) + '%, ' + Math.round(hsv.v * 100) + '%)',
        'cmyk(' + Math.round(cmyk.c * 100) + ', ' + Math.round(cmyk.m * 100) + ', ' + Math.round(cmyk.y * 100) + ', ' + Math.round(cmyk.k * 100) + ')',
        'lab(' + lab.L.toFixed(1) + ', ' + lab.a.toFixed(1) + ', ' + lab.b.toFixed(1) + ')'
      ];
      for (var k = 0; k < lines.length; k++) {
        ctx.fillText(lines[k], x, y + 26 + k * 20);
      }

      var nCol = G.colors.length;
      if (nCol <= 9) {
        var yc = y + 26 + lines.length * 20 + 18;
        var wRatio = PC.contrastRatio(rgb, { r: 255, g: 255, b: 255 }).toFixed(2) + ':1';
        var bRatio = PC.contrastRatio(rgb, { r: 0, g: 0, b: 0 }).toFixed(2) + ':1';
        ctx.fillStyle = INK2;
        ctx.font = '400 ' + (nCol <= 6 ? 11 : 10) + 'px ' + SANS;
        if (nCol <= 6) {
          ctx.fillText(T('g.onWhite') + ' ' + wRatio + '  ·  ' + T('g.onBlack') + ' ' + bRatio, x, yc);
        } else {
          ctx.fillText(T('g.onWhite') + ' ' + wRatio, x, yc);
          ctx.fillText(T('g.onBlack') + ' ' + bRatio, x, yc + 13);
        }
      }

      // muestra de accesibilidad
      if (G.blind !== 'none') {
        var sim = PC.simulateBlindness(rgb, G.blind);
        ctx.fillStyle = 'rgba(25,21,16,.06)';
        ctx.fillRect(x, y + 26 + lines.length * 20 + 34, cw, 40);
        ctx.fillStyle = PC.rgbToHex(sim.r, sim.g, sim.b);
        ctx.fillRect(x, y + 26 + lines.length * 20 + 34, 40, 40);
        ctx.fillStyle = INK3;
        ctx.font = '400 10px ' + SANS;
        ctx.fillText(T('g.blind' + (G.blind === 'protan' ? 'Protan' : G.blind === 'deutan' ? 'Deutan' : 'Tritan')), x + 50, y + 26 + lines.length * 20 + 58);
      }
    });

    var footY = H - 44;
    ctx.fillStyle = INK3;
    ctx.font = '400 11px ' + SANS;
    ctx.fillText(T('g.pngFoot'), M, footY);
    ctx.textAlign = 'right';
    ctx.fillText('ColorCat', W - M, footY);

    return c;
  }

  function exportPng() {
    try {
      var c = buildPng();
      c.toBlob(function (blob) {
        if (!blob) { toast(T('toast.sheetError')); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'gamma-' + G.rule + '-' + stamp() + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast(T('g.pngDone'));
      }, 'image/png');
    } catch (e) {
      console.error(e);
      toast(T('toast.sheetError'));
    }
  }

  /* ============================================================
     Eventos
     ============================================================ */
  function bind() {
    el.wheel.addEventListener('pointerdown', onWheelDown);
    el.wheel.addEventListener('pointermove', onWheelMove);
    el.wheel.addEventListener('pointerup', onWheelUp);
    el.wheel.addEventListener('pointercancel', onWheelUp);

    el.light.addEventListener('input', function () {
      var newL = parseInt(this.value, 10) / 100;
      var delta = newL - G.base.l;
      G.base.l = newL;
      if (G.rule === 'custom') {
        G.colors.forEach(function (c) { c.l = clamp(c.l + delta, 0.08, 0.95); });
      } else {
        generate();
      }
      el.lightVal.textContent = Math.round(newL * 100);
      syncRange(el.light);
      drawWheel();
      renderPalette();
      renderDetail();
    });

    el.sat.addEventListener('input', function () {
      var newS = parseInt(this.value, 10) / 100;
      var delta = newS - G.base.s;
      G.base.s = newS;
      if (G.rule === 'custom') {
        G.colors.forEach(function (c) { c.s = clamp(c.s + delta, 0, 1); });
      } else {
        generate();
      }
      el.satVal.textContent = Math.round(newS * 100);
      syncRange(el.sat);
      drawWheel();
      renderPalette();
      renderDetail();
    });

    el.modes.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      G.mode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(el.modes.children, function (x) {
        x.classList.toggle('is-active', x === b);
      });
      renderPalette();
    });

    el.blind.addEventListener('change', function () {
      G.blind = this.value;
      renderPalette();
      renderDetail();
    });

    el.copyCss.addEventListener('click', function () {
      PC.copyText(cssText()).then(function () { toast(T('toast.cssCopied')); });
    });
    el.copyHex.addEventListener('click', function () {
      var hexes = G.colors.map(function (c) { return hexOf(c); }).join(', ');
      PC.copyText(hexes).then(function () { toast(T('toast.copied', { hex: hexes })); });
    });
    el.dlCss.addEventListener('click', function () {
      downloadText('gamma-' + G.rule + '-' + stamp() + '.css', cssText(), 'text/css;charset=utf-8');
    });
    el.dlJson.addEventListener('click', function () {
      downloadText('gamma-' + G.rule + '-' + stamp() + '.json', jsonText(), 'application/json');
    });
    el.exportBtn.addEventListener('click', exportPng);

    if (el.tabs) {
      el.tabs.addEventListener('click', function (e) {
        var b = e.target.closest('.g-tab');
        if (b) setTab(b.getAttribute('data-tab'));
      });
    }

    if (el.hue) {
      el.hue.addEventListener('input', function () {
        G.base.h = parseInt(this.value, 10);
        generate();
        renderAll();
      });
    }

    if (el.baseHex) {
      el.baseHex.addEventListener('change', applyHex);
      el.baseHex.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyHex(); this.blur(); }
      });
    }

    if (el.baseCopy) {
      el.baseCopy.addEventListener('click', function () {
        var hex = hexOf(G.base);
        PC.copyText(hex).then(function () { toast(T('toast.copied', { hex: hex })); });
      });
    }

    if (el.imagePick) {
      el.imagePick.addEventListener('click', function () {
        el.fileInput.value = '';
        el.fileInput.click();
      });
      el.fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) loadImageFile(this.files[0]);
      });
      el.imageExtract.addEventListener('click', extractFromImage);
      el.imageCanvas.addEventListener('pointerdown', onImageDown);
      el.imageCanvas.addEventListener('pointermove', onImageMove);
      el.imageCanvas.addEventListener('pointerup', onImageUp);
      el.imageCanvas.addEventListener('pointercancel', function () { G.imgDrag = null; });
      el.imageCanvas.addEventListener('wheel', onImageWheel, { passive: false });

      el.zoomIn.addEventListener('click', function () { zoomImage(1.25); });
      el.zoomOut.addEventListener('click', function () { zoomImage(1 / 1.25); });
      el.zoomFit.addEventListener('click', function () { resetImageView(); drawImage(); });
      if (el.kDown) {
        el.kDown.addEventListener('click', function () { setK(G.k - 1); });
        el.kUp.addEventListener('click', function () { setK(G.k + 1); });
      }

      ['dragover', 'dragenter'].forEach(function (ev) {
        el.imageWrap.addEventListener(ev, function (e) {
          e.preventDefault();
          el.imageWrap.classList.add('is-over');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        el.imageWrap.addEventListener(ev, function (e) {
          e.preventDefault();
          e.stopPropagation();
          el.imageWrap.classList.remove('is-over');
          if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            loadImageFile(e.dataTransfer.files[0]);
          }
        });
      });
    }
    window.addEventListener('resize', function () {
      if (!G.ready) return;
      layoutWheel();
    });
  }

  /* ============================================================
     Color base (código HEX + matiz)
     ============================================================ */
  function renderBase() {
    if (!el.baseCard) return;
    var rgb = rgbOf(G.base);
    var shown = blinded(rgb);
    var hex = PC.rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
    el.baseCard.style.background = PC.rgbToHex(shown.r, shown.g, shown.b);
    el.baseCard.style.color = PC.contrastInk(shown);
    el.baseHexLabel.textContent = hex;
    el.baseName.textContent = PC.describe(PC.rgbToHsl(rgb.r, rgb.g, rgb.b));
    if (document.activeElement !== el.baseHex) el.baseHex.value = hex;
    if (document.activeElement !== el.hue) el.hue.value = Math.round(G.base.h);
  }

  function applyHex() {
    var v = (el.baseHex.value || '').trim();
    if (!v) { renderBase(); return; }
    if (v.charAt(0) !== '#') v = '#' + v;
    var rgb = PC.hexToRgb(v);
    if (!rgb) {
      toast(T('g.invalidHex'));
      renderBase();
      return;
    }
    var hsl = PC.rgbToHsl(rgb.r, rgb.g, rgb.b);
    G.base = { h: hsl.h, s: hsl.s, l: hsl.l };
    if (G.rule === 'custom') { G.rule = 'analog'; renderRules(); }
    generate();
    renderAll();
  }

  /* ============================================================
     Imagen: extraer la paleta de una foto o tomar un color
     ============================================================ */
  function imgTransform() {
    var fit = Math.min(G.imgViewW / G.imgW, G.imgViewH / G.imgH);
    var s = fit * G.imgView.zoom;
    var maxX = Math.max(0, (G.imgW * s - G.imgViewW) / 2);
    var maxY = Math.max(0, (G.imgH * s - G.imgViewH) / 2);
    G.imgView.panX = clamp(G.imgView.panX, -maxX, maxX);
    G.imgView.panY = clamp(G.imgView.panY, -maxY, maxY);
    return {
      s: s,
      ox: (G.imgViewW - G.imgW * s) / 2 + G.imgView.panX,
      oy: (G.imgViewH - G.imgH * s) / 2 + G.imgView.panY
    };
  }

  function drawImage() {
    if (!G.imgCanvas || !G.imgViewW) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ctx = el.imageCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, G.imgViewW, G.imgViewH);

    var t = imgTransform();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(G.imgCanvas, t.ox, t.oy, G.imgW * t.s, G.imgH * t.s);

    for (var i = 0; i < G.markers.length; i++) {
      var m = G.markers[i];
      var col = G.colors[m.index];
      if (!col) continue;
      var shown = blinded(rgbOf(col));
      var x = t.ox + m.x * t.s;
      var y = t.oy + m.y * t.s;
      if (x < -24 || y < -24 || x > G.imgViewW + 24 || y > G.imgViewH + 24) continue;

      var sel = m.index === G.sel;
      var rad = sel ? 11 : 8;

      ctx.beginPath();
      ctx.arc(x, y, rad + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(8,10,14,.45)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = PC.rgbToHex(shown.r, shown.g, shown.b);
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    if (el.zoomLevel) el.zoomLevel.textContent = Math.round(G.imgView.zoom * 100) + '%';
  }

  function layoutImage() {
    if (!el.imageWrap) return;
    var box = el.imageWrap.getBoundingClientRect();
    if (!box.width || !box.height) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    G.imgViewW = box.width;
    G.imgViewH = box.height;
    el.imageCanvas.width = Math.round(box.width * dpr);
    el.imageCanvas.height = Math.round(box.height * dpr);
    el.imageCanvas.style.width = box.width + 'px';
    el.imageCanvas.style.height = box.height + 'px';
    drawImage();
  }

  function zoomImage(factor, cx, cy) {
    if (!G.imgCanvas || !G.imgViewW) return;
    var t0 = imgTransform();
    if (cx == null) { cx = G.imgViewW / 2; cy = G.imgViewH / 2; }
    var ix = (cx - t0.ox) / t0.s;
    var iy = (cy - t0.oy) / t0.s;
    var z = clamp(G.imgView.zoom * factor, 1, 10);
    if (Math.abs(z - G.imgView.zoom) < 0.001) return;
    G.imgView.zoom = z;
    if (z === 1) {
      G.imgView.panX = 0;
      G.imgView.panY = 0;
    } else {
      var t1 = imgTransform();
      G.imgView.panX += cx - (t1.ox + ix * t1.s);
      G.imgView.panY += cy - (t1.oy + iy * t1.s);
    }
    drawImage();
  }

  function resetImageView() {
    G.imgView = { zoom: 1, panX: 0, panY: 0 };
  }

  function onImageDown(e) {
    if (!G.imgCanvas) return;
    var rect = el.imageCanvas.getBoundingClientRect();
    G.imgDrag = {
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
      px: G.imgView.panX,
      py: G.imgView.panY,
      moved: false
    };
    try { el.imageCanvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    e.preventDefault();
  }

  function onImageMove(e) {
    if (!G.imgDrag) return;
    var rect = el.imageCanvas.getBoundingClientRect();
    var dx = (e.clientX - rect.left) - G.imgDrag.sx;
    var dy = (e.clientY - rect.top) - G.imgDrag.sy;
    if (!G.imgDrag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    G.imgDrag.moved = true;
    if (G.imgView.zoom > 1) {
      G.imgView.panX = G.imgDrag.px + dx;
      G.imgView.panY = G.imgDrag.py + dy;
      drawImage();
    }
  }

  function onImageUp(e) {
    if (!G.imgDrag) return;
    var moved = G.imgDrag.moved;
    G.imgDrag = null;
    if (!moved) pickFromImage(e);
  }

  function onImageWheel(e) {
    if (!G.imgCanvas) return;
    e.preventDefault();
    var rect = el.imageCanvas.getBoundingClientRect();
    zoomImage(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - rect.left, e.clientY - rect.top);
  }

  function loadImageFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image') !== 0) {
      toast(T('toast.notImage'));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var max = 1600;
      var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * s));
      var h = Math.max(1, Math.round(img.naturalHeight * s));
      var cnv = document.createElement('canvas');
      cnv.width = w;
      cnv.height = h;
      var cx = cnv.getContext('2d', { willReadFrequently: true });
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, w, h);

      G.imgCanvas = cnv;
      G.imgW = w;
      G.imgH = h;
      G.imgName = file.name || T('file.image');
      G.markers = [];
      resetImageView();

      el.imageEmpty.style.display = 'none';
      el.imageWrap.classList.add('has-image');
      el.imageName.textContent = G.imgName;
      el.imageExtract.disabled = false;
      if (el.zoom) el.zoom.hidden = false;
      layoutImage();
      toast(T('g.imageLoaded'));
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast(T('toast.decodeError'));
    };
    img.src = url;
  }

  function extractFromImage() {
    if (!G.imgCanvas) { toast(T('g.imageFirst')); return; }
    var ctx = G.imgCanvas.getContext('2d');
    var data = ctx.getImageData(0, 0, G.imgW, G.imgH);
    var mask = new Uint8ClampedArray(G.imgW * G.imgH * 4);
    for (var i = 3; i < mask.length; i += 4) mask[i] = 255;

    var res = global.PaletteEngine.extract({
      width: G.imgW,
      height: G.imgH,
      pixels: data.data,
      mask: mask,
      k: G.k,
      bbox: { x: 0, y: 0, w: G.imgW, h: G.imgH }
    });

    if (!res || !res.colors.length) { toast(T('toast.noPixels')); return; }

    var colors = res.colors.slice(0, G.k).map(function (e) {
      return { h: e.hsl.h, s: e.hsl.s, l: e.hsl.l };
    });
    while (colors.length < G.k) {
      var last = colors[colors.length - 1] || G.base;
      colors.push({ h: last.h, s: last.s, l: clamp(last.l + 0.12, 0.08, 0.95) });
    }
    if (!colors.length) colors.push({ h: 0, s: 0, l: 1 });

    G.colors = colors;
    var bi = Math.min(2, colors.length - 1);
    G.base = { h: colors[bi].h, s: colors[bi].s, l: colors[bi].l };
    G.rule = 'custom';
    G.sel = 0;
    G.markers = [];
    renderRules();
    renderAll();
    drawImage();
    toast(T('g.imageExtracted', { n: colors.length }));
  }

  function pickFromImage(e) {
    if (!G.imgCanvas || !G.imgViewW) return;
    var rect = el.imageCanvas.getBoundingClientRect();
    var t = imgTransform();
    var x = (e.clientX - rect.left - t.ox) / t.s;
    var y = (e.clientY - rect.top - t.oy) / t.s;
    var px = Math.floor(x), py = Math.floor(y);
    if (px < 0 || py < 0 || px >= G.imgW || py >= G.imgH) return;

    var d = G.imgCanvas.getContext('2d').getImageData(px, py, 1, 1).data;
    var rgb = { r: d[0], g: d[1], b: d[2] };
    var hsl = PC.rgbToHsl(rgb.r, rgb.g, rgb.b);
    G.colors[G.sel] = { h: hsl.h, s: hsl.s, l: hsl.l };
    G.base = { h: hsl.h, s: hsl.s, l: hsl.l };
    if (G.rule !== 'custom') { G.rule = 'custom'; renderRules(); }

    var found = false;
    for (var i = 0; i < G.markers.length; i++) {
      if (G.markers[i].index === G.sel) {
        G.markers[i].x = px;
        G.markers[i].y = py;
        found = true;
        break;
      }
    }
    if (!found) G.markers.push({ index: G.sel, x: px, y: py });

    renderAll();
    drawImage();
    toast(T('g.picked') + ' · ' + PC.rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase());
  }
  function setTab(name) {
    G.tab = (name === 'image') ? 'image' : 'wheel';
    if (el.tabs) {
      for (var i = 0; i < el.tabs.children.length; i++) {
        var b = el.tabs.children[i];
        b.classList.toggle('is-active', b.getAttribute('data-tab') === G.tab);
      }
    }
    if (el.paneBase) el.paneBase.hidden = G.tab !== 'base';
    if (el.paneImage) el.paneImage.hidden = G.tab !== 'image';
    if (el.paneWheel) el.paneWheel.hidden = G.tab !== 'wheel';

    if (el.ruleBlock) el.ruleBlock.hidden = (G.tab === 'image');
    if (G.tab === 'wheel') layoutWheel();
    if (G.tab === 'image') layoutImage();
    var lp = document.querySelector('#viewGamma .panel-left');
    if (lp) lp.scrollTop = 0;
    renderBase();
  }
  function setK(n) {
    G.k = Math.round(clamp(n, 2, 12));
    if (el.kVal) el.kVal.textContent = G.k;
  }

  function cache() {
    el.rules = document.getElementById('gRules');
    el.wheel = document.getElementById('gWheel');
    el.palette = document.getElementById('gPalette');
    el.detail = document.getElementById('gDetail');
    el.ruleTag = document.getElementById('gRuleTag');
    el.light = document.getElementById('gLight');
    el.lightVal = document.getElementById('gLightVal');
    el.sat = document.getElementById('gSat');
    el.satVal = document.getElementById('gSatVal');
    el.modes = document.getElementById('gModes');
    el.blind = document.getElementById('gBlind');
    el.copyCss = document.getElementById('gCopyCss');
    el.copyHex = document.getElementById('gCopyHex');
    el.dlCss = document.getElementById('gDownloadCss');
    el.dlJson = document.getElementById('gDownloadJson');
    el.exportBtn = document.getElementById('gExport');
    el.tabs = document.getElementById('gTabs');
    el.paneBase = document.getElementById('gPaneBase');
    el.paneImage = document.getElementById('gPaneImage');
    el.paneWheel = document.getElementById('gPaneWheel');
    el.ruleBlock = document.getElementById('gRuleBlock');
    el.adjustBlock = document.getElementById('gAdjustBlock');
    el.baseCard = document.getElementById('gBaseCard');
    el.baseHexLabel = document.getElementById('gBaseHexLabel');
    el.baseName = document.getElementById('gBaseName');
    el.baseHex = document.getElementById('gBaseHexInput');
    el.kDown = document.getElementById('gKDown');
    el.kUp = document.getElementById('gKUp');
    el.kVal = document.getElementById('gKVal');
    el.baseCopy = document.getElementById('gBaseCopy');
    el.hue = document.getElementById('gHue');
    el.imageWrap = document.getElementById('gImageWrap');
    el.imageCanvas = document.getElementById('gImageCanvas');
    el.imageEmpty = document.getElementById('gImageEmpty');
    el.imagePick = document.getElementById('gImagePick');
    el.imageExtract = document.getElementById('gImageExtract');
    el.imageName = document.getElementById('gImageName');
    el.fileInput = document.getElementById('gFileInput');
    el.zoom = document.getElementById('gZoom');
    el.zoomIn = document.getElementById('gZoomIn');
    el.zoomOut = document.getElementById('gZoomOut');
    el.zoomLevel = document.getElementById('gZoomLevel');
    el.zoomFit = document.getElementById('gZoomFit');
  }

  function init() {
    cache();
    bind();
    G.base = { h: 0, s: 0, l: 1 };
    G.colors = [{ h: 0, s: 0, l: 1 }];
    G.sel = 0;
    G.rule = 'custom';
    G.markers = [];
    generate();
    buildRules();
    renderAll();
    if (el.kVal) el.kVal.textContent = G.k;
    G.ready = true;
  }

  function activate() {
    if (!G.ready) init();
    setTab(G.tab);
    renderAll();
  }

  function onLangChange() {
    if (!G.ready) return;
    buildRules();
    renderAll();
  }

  function random() {
    G.base = {
      h: Math.random() * 360,
      s: 0.45 + Math.random() * 0.45,
      l: 0.4 + Math.random() * 0.28
    };
    if (G.rule === 'custom') G.rule = 'analog';
    generate();
    renderAll();
  }

  global.Gamma = {
    init: init,
    activate: activate,
    onLangChange: onLangChange,
    random: random,
    exportPng: exportPng,
    buildPng: buildPng,
    loadFile: loadImageFile,
    state: G
  };
})(window);
