/* ============================================================
   app.js — Paleteador
   Interfaz, lienzo, selección editable y orquestación.
   ============================================================ */
(function () {
  'use strict';

  var PC = window.PC;
  var PE = window.PaletteEngine;
  var Sheet = window.Sheet;

  function T(key, vars) {
    return window.I18N ? window.I18N.t(key, vars) : key;
  }

  function isEN() {
    return !!(window.I18N && window.I18N.lang === 'en');
  }

  function fmtPct1(p) {
    var s = p.toFixed(1);
    return isEN() ? s : s.replace('.', ',');
  }

  var MAX_DIM = 2600;
  var MIN_SCALE = 0.02;
  var MAX_SCALE = 24;
  var K_MIN = 2;
  var K_MAX = 16;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var TAU = Math.PI * 2;

  /* ============================================================
     Estado
     ============================================================ */
  var S = {
    img: null,
    fileName: '',
    fileSize: 0,
    W: 0,
    H: 0,
    work: null,
    wctx: null,
    mask: null,
    mctx: null,

    view: { scale: 1, x: 0, y: 0 },
    dpr: 1,
    cssW: 0,
    cssH: 0,

    tool: 'rect',
    mode: 'add',
    brush: 46,
    wandTol: 20,
    wandContig: true,

    ops: [],
    redo: [],
    selCount: 0,
    selBox: null,

    drag: null,
    pan: null,
    pinch: null,
    pointers: new Map(),
    space: false,
    cursor: null,

    palette: [],
    base: null,
    sortMode: 'coverage',
    k: 6,
    auto: true,
    extracting: false,

    schemes: [],
    basics: [],
    samples: [],

    /* armonías marcadas para la hoja de estilos */
    schemeOn: {
      complement: true,
      split: false,
      analog: true,
      triad: true,
      tetrad: false,
      tertiary: false,
      mono: false
    }
  };

  var maskVersion = 0;
  var autoTimer = null;

  /* ============================================================
     Elementos
     ============================================================ */
  var el = {};
  var canvas, ctx;
  var dimCanvas, dimCtx, tintCanvas, tintCtx;
  var antsCtx = null;

  function cacheElements() {
    el.app = $('#app');
    el.btnOpen = $('#btnOpen');
    el.btnDemo = $('#btnDemo');
    el.btnHelp = $('#btnHelp');
    el.btnExport = $('#btnExport');
    el.btnCutout = $('#btnCutout');
    el.ants = $('#ants');
    el.btnBrand = $('#btnBrand');
    el.btnMenu = $('#btnMenu');
    el.homeCards = $('#homeCards');
    el.actionsEspectro = $('#actionsEspectro');
    el.actionsGamma = $('#actionsGamma');
    el.gRandom = $('#gRandom');
    el.gExportTop = $('#gExportTop');
    el.fileInput = $('#fileInput');

    el.fileCard = $('#fileCard');
    el.fileThumb = $('#fileThumb');
    el.fileName = $('#fileName');
    el.fileDims = $('#fileDims');

    el.toolList = $('#toolList');
    el.brushField = $('#brushField');
    el.brushSize = $('#brushSize');
    el.brushSizeVal = $('#brushSizeVal');
    el.wandField = $('#wandField');
    el.wandTol = $('#wandTol');
    el.wandTolVal = $('#wandTolVal');
    el.wandContig = $('#wandContig');
    el.modeField = $('#modeField');
    el.modeGroup = $('#modeGroup');
    el.langSelect = $('#langSelect');

    el.btnUndo = $('#btnUndo');
    el.btnRedo = $('#btnRedo');
    el.btnInvert = $('#btnInvert');
    el.btnAll = $('#btnAll');
    el.btnClear = $('#btnClear');

    el.kDown = $('#kDown');
    el.kUp = $('#kUp');
    el.kVal = $('#kVal');
    el.sortSelect = $('#sortSelect');
    el.chkAuto = $('#chkAuto');
    el.btnExtract = $('#btnExtract');

    el.samplesList = $('#samplesList');
    el.samplesHint = $('#samplesHint');

    el.canvasWrap = $('#canvasWrap');
    el.emptyState = $('#emptyState');
    el.dropZone = $('#dropZone');
    el.btnEmptyPick = $('#btnEmptyPick');

    el.zoomOut = $('#zoomOut');
    el.zoomLevel = $('#zoomLevel');
    el.zoomIn = $('#zoomIn');
    el.zoomFit = $('#zoomFit');
    el.zoomOne = $('#zoomOne');
    el.selStats = $('#selStats');
    el.busy = $('#busy');

    el.paletteList = $('#paletteList');
    el.paletteMeta = $('#paletteMeta');
    el.paletteEmpty = $('#paletteEmpty');

    el.basicsList = $('#basicsList');
    el.basicsEmpty = $('#basicsEmpty');

    el.baseTag = $('#baseTag');
    el.schemeList = $('#schemeList');
    el.schemeEmpty = $('#schemeEmpty');
    el.schemeHint = $('#schemeHint');
    el.schemeExportHint = $('#schemeExportHint');

    el.helpModal = $('#helpModal');
    el.btnCloseHelp = $('#btnCloseHelp');
    el.toast = $('#toast');
  }

  /* ============================================================
     Utilidades
     ============================================================ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function fmtNum(n) {
    try {
      return n.toLocaleString(window.I18N ? window.I18N.locale() : 'es-CO');
    } catch (e) {
      return String(n);
    }
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 2200);
  }

  function busy(on) {
    el.busy.classList.toggle('is-on', !!on);
  }

  /* ============================================================
     Vistas: menú principal, Espectro y Gamma
     ============================================================ */
  var currentView = 'home';

  function viewId(name) {
    return 'view' + name.charAt(0).toUpperCase() + name.slice(1);
  }

  function setHash(name) {
    try {
      if (name === 'home') {
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      } else if (location.hash !== '#/' + name) {
        location.hash = '#/' + name;
      }
    } catch (e) { /* file:// sin history */ }
  }

  function showView(name, updateHash) {
    if (name !== 'espectro' && name !== 'gamma') name = 'home';
    currentView = name;

    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
      views[i].hidden = views[i].id !== viewId(name);
    }

    el.app.setAttribute('data-view', name);
    if (el.actionsEspectro) el.actionsEspectro.hidden = (name !== 'espectro');
    if (el.actionsGamma) el.actionsGamma.hidden = (name !== 'gamma');

    if (updateHash) setHash(name);

    if (name === 'espectro') {
      resize();
      invalidate();
      ensureAnts();
    } else if (name === 'gamma' && window.Gamma) {
      window.Gamma.activate();
    }
  }

  function slugify(text) {
    var s = (text || 'paleta').replace(/\.[^.]+$/, '');
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
    s = s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return (s || 'paleta').slice(0, 48);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function dateText() {
    try {
      return new Date().toLocaleDateString(window.I18N ? window.I18N.locale() : 'es-CO',
        { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return new Date().toLocaleDateString();
    }
  }

  /* ============================================================
     Lienzo principal
     ============================================================ */
  function setupCanvas() {
    canvas = $('#view');
    ctx = canvas.getContext('2d');
    if (el.ants) antsCtx = el.ants.getContext('2d');

    dimCanvas = document.createElement('canvas');
    dimCtx = dimCanvas.getContext('2d');
    tintCanvas = document.createElement('canvas');
    tintCtx = tintCanvas.getContext('2d');

    resize();
    var ro = new ResizeObserver(function () { resize(); });
    ro.observe(el.canvasWrap);
  }

  function resize() {
    if (!canvas) return;
    var rect = el.canvasWrap.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === S.cssW && h === S.cssH && canvas.width) return;

    var oldW = S.cssW, oldH = S.cssH;
    S.cssW = w;
    S.cssH = h;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);

    var sized = [canvas, dimCanvas, tintCanvas];
    if (el.ants) sized.push(el.ants);
    sized.forEach(function (c) {
      c.width = Math.round(w * S.dpr);
      c.height = Math.round(h * S.dpr);
    });
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    if (oldW && oldH) {
      S.view.x *= w / oldW;
      S.view.y *= h / oldH;
    }
    lastOverlayKey = '';
    invalidate();
  }

  var frameQueued = false;
  var lastOverlayKey = '';

  function invalidate() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(function () {
      frameQueued = false;
      draw();
    });
  }

  function toScreen(x, y) {
    return { x: S.view.x + x * S.view.scale, y: S.view.y + y * S.view.scale };
  }

  function toImagePoint(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var sx = clientX - r.left, sy = clientY - r.top;
    return {
      x: (sx - S.view.x) / S.view.scale,
      y: (sy - S.view.y) / S.view.scale,
      sx: sx,
      sy: sy
    };
  }

  var checkerPattern = null;
  function getChecker() {
    if (!checkerPattern) {
      var c = document.createElement('canvas');
      c.width = 20; c.height = 20;
      var x = c.getContext('2d');
      x.fillStyle = '#141920';
      x.fillRect(0, 0, 20, 20);
      x.fillStyle = '#1b212a';
      x.fillRect(0, 0, 10, 10);
      x.fillRect(10, 10, 10, 10);
      checkerPattern = ctx.createPattern(c, 'repeat');
    }
    return checkerPattern;
  }

  function draw() {
    if (!ctx) return;
    var dpr = S.dpr, w = S.cssW, h = S.cssH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!S.W || !S.work) {
      lastOverlayKey = '';
      drawZoomLabel();
      drawAnts();
      return;
    }

    var key = [
      S.view.x.toFixed(2), S.view.y.toFixed(2), S.view.scale.toFixed(5),
      maskVersion, w, h, S.selCount
    ].join('|');

    if (key !== lastOverlayKey) {
      renderOverlay();
      lastOverlayKey = key;
    }

    // 1. transparencia
    ctx.save();
    ctx.beginPath();
    ctx.rect(S.view.x, S.view.y, S.W * S.view.scale, S.H * S.view.scale);
    ctx.clip();
    ctx.fillStyle = getChecker();
    ctx.fillRect(S.view.x, S.view.y, S.W * S.view.scale, S.H * S.view.scale);
    ctx.restore();

    // 2. imagen
    ctx.save();
    ctx.translate(S.view.x, S.view.y);
    ctx.scale(S.view.scale, S.view.scale);
    ctx.imageSmoothingEnabled = S.view.scale < 2.2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.work, 0, 0);
    ctx.restore();

    // 3. velo fuera de la selección + tinte interior
    ctx.drawImage(dimCanvas, 0, 0, dimCanvas.width, dimCanvas.height, 0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.drawImage(tintCanvas, 0, 0, tintCanvas.width, tintCanvas.height, 0, 0, w, h);
    ctx.restore();

    // 4. borde del área de imagen
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(S.view.x + .5, S.view.y + .5, S.W * S.view.scale - 1, S.H * S.view.scale - 1);
    ctx.restore();

    drawPreview();
    drawCursor();
    drawZoomLabel();
    drawAnts();
  }

  function renderOverlay() {
    if (!dimCtx || !S.W) return;
    var dpr = S.dpr, w = S.cssW, h = S.cssH;

    dimCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dimCtx.clearRect(0, 0, w, h);
    dimCtx.save();
    dimCtx.translate(S.view.x, S.view.y);
    dimCtx.scale(S.view.scale, S.view.scale);
    dimCtx.fillStyle = 'rgba(9, 11, 15, 0.62)';
    dimCtx.fillRect(0, 0, S.W, S.H);
    dimCtx.globalCompositeOperation = 'destination-out';
    dimCtx.drawImage(S.mask, 0, 0);
    dimCtx.restore();

    tintCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tintCtx.clearRect(0, 0, w, h);
    tintCtx.save();
    tintCtx.translate(S.view.x, S.view.y);
    tintCtx.scale(S.view.scale, S.view.scale);
    tintCtx.drawImage(S.mask, 0, 0);
    tintCtx.globalCompositeOperation = 'source-in';
    tintCtx.fillStyle = '#f4b860';
    tintCtx.fillRect(0, 0, S.W, S.H);
    tintCtx.restore();
  }

  function drawPreview() {
    var d = S.drag;
    if (!d || d.kind !== 'shape' || !d.pts) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(244,184,96,.95)';
    ctx.fillStyle = 'rgba(244,184,96,.10)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);

    if (d.tool === 'rect') {
      var a = toScreen(d.start.x, d.start.y);
      var b = toScreen(d.cur.x, d.cur.y);
      var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + .5, y + .5, w, h);
    } else if (d.tool === 'lasso' && d.pts.length > 1) {
      ctx.beginPath();
      d.pts.forEach(function (p, i) {
        var q = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCursor() {
    if (!S.cursor || !S.cursor.inside) return;
    if (S.tool !== 'brush' && S.tool !== 'eraser') return;
    var r = Math.max(2, S.brush / 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S.cursor.sx, S.cursor.sy, r, 0, TAU);
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = S.tool === 'eraser' ? 'rgba(255,180,160,.95)' : 'rgba(255,255,255,.95)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawZoomLabel() {
    if (!el.zoomLevel) return;
    var pct = Math.round(S.view.scale * 100);
    el.zoomLevel.textContent = pct + '%';
  }

  /* ============================================================
     Vista
     ============================================================ */
  function fitView() {
    if (!S.W || !S.cssW) return;
    var pad = 44;
    var s = Math.min((S.cssW - pad * 2) / S.W, (S.cssH - pad * 2) / S.H);
    s = Math.min(s, 4);
    S.view.scale = Math.max(s, MIN_SCALE);
    S.view.x = (S.cssW - S.W * S.view.scale) / 2;
    S.view.y = (S.cssH - S.H * S.view.scale) / 2;
    invalidate();
  }

  function actualSize() {
    if (!S.W) return;
    S.view.scale = 1;
    S.view.x = (S.cssW - S.W) / 2;
    S.view.y = (S.cssH - S.H) / 2;
    invalidate();
  }

  function zoomAt(factor, sx, sy) {
    if (!S.W) return;
    var ns = clamp(S.view.scale * factor, MIN_SCALE, MAX_SCALE);
    var k = ns / S.view.scale;
    S.view.x = sx - (sx - S.view.x) * k;
    S.view.y = sy - (sy - S.view.y) * k;
    S.view.scale = ns;
    invalidate();
  }

  function zoomCenter(factor) {
    zoomAt(factor, S.cssW / 2, S.cssH / 2);
  }

  /* ============================================================
     Máscara / operaciones de selección
     ============================================================ */
  function newMaskCanvas() {
    S.mask = document.createElement('canvas');
    S.mask.width = S.W;
    S.mask.height = S.H;
    S.mctx = S.mask.getContext('2d', { willReadFrequently: true });
    maskVersion++;
  }

  var tmpCanvas = null, tmpCtx = null;
  function getTmp() {
    if (!tmpCanvas || tmpCanvas.width !== S.W || tmpCanvas.height !== S.H) {
      tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = S.W;
      tmpCanvas.height = S.H;
      tmpCtx = tmpCanvas.getContext('2d');
    }
    return tmpCanvas;
  }

  /* ---------- varita mágica ----------
     Crecimiento de región por camino mínimo (Dijkstra minimax).
     Cada paso entre vecinos cuesta la diferencia de color (0–255) sobre una
     copia suavizada. El coste de un píxel es el MAYOR salto del mejor camino
     hasta él, es decir: "el borde más fuerte que hay que cruzar para llegar".
     - Un degradado suave cuesta casi 0 aunque recorra media imagen.
     - Una arruga o textura no corta la selección.
     - Un contorno fuerte (salto grande) queda fuera si el límite es menor.
     Al procesar los costes en orden creciente solo hacen falta 256 cubos,
     así que el algoritmo es lineal en píxeles.
     ------------------------------------------------------------------ */
  var wandCanvas = null, wandCtx = null, wandImage = null, wandSeen = null;
  var wandBlur = null, wandGrad = null, wandAlpha = null;
  var wandOpaque = true, wandW = 0, wandH = 0;
  var wandLut = null;

  function resetWandCache() {
    wandCanvas = null; wandCtx = null; wandImage = null; wandSeen = null;
    wandBlur = null; wandGrad = null; wandAlpha = null;
    wandOpaque = true; wandW = 0; wandH = 0;
  }

  function wandSqrtTable() {
    if (!wandLut) {
      wandLut = new Uint8Array(65026);
      for (var i = 0; i < 65026; i++) {
        var v = Math.sqrt(i);
        wandLut[i] = v > 255 ? 255 : (v + 0.5) | 0;
      }
    }
    return wandLut;
  }

  function ensureWandBuffers() {
    if (wandBlur && wandW === S.W && wandH === S.H) return;
    var W = S.W, H = S.H, N = W * H;
    wandW = W; wandH = H;

    // transparencia original
    var src = S.wctx.getImageData(0, 0, W, H).data;
    wandAlpha = new Uint8Array(N);
    wandOpaque = true;
    for (var i = 0; i < N; i++) {
      var a = src[i * 4 + 3];
      wandAlpha[i] = a;
      if (a < 250) wandOpaque = false;
    }
    // copia apenas suavizada: quita ruido sin difuminar los bordes
    var bc = document.createElement('canvas');
    bc.width = W; bc.height = H;
    var bx = bc.getContext('2d', { willReadFrequently: true });
    try { bx.filter = 'blur(0.5px)'; } catch (e) { /* sin filtro */ }
    bx.drawImage(S.work, 0, 0);
    try { bx.filter = 'none'; } catch (e) { /* sin filtro */ }
    var soft = bx.getImageData(0, 0, W, H).data;

    // mapa de bordes: magnitud del salto máximo con los 4 vecinos
    var lut = wandSqrtTable();
    wandGrad = new Uint8Array(N);
    var gr = wandGrad;
    for (var y = 0; y < H; y++) {
      var row = y * W;
      for (var x = 0; x < W; x++) {
        var p = row + x;
        var ii = p * 4;
        var r = soft[ii], gg = soft[ii + 1], bb = soft[ii + 2];
        var best0 = 0;
        var j, dr, dg, db, raw, v;
        if (x > 0) {
          j = ii - 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        if (x < W - 1) {
          j = ii + 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        if (y > 0) {
          j = ii - W * 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        if (y < H - 1) {
          j = ii + W * 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 9;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        // diagonales (distancia √2): se normalizan a la mitad
        if (x > 0 && y > 0) {
          j = ii - W * 4 - 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 18;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        if (x < W - 1 && y > 0) {
          j = ii - W * 4 + 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 18;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        if (x > 0 && y < H - 1) {
          j = ii + W * 4 - 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 18;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        if (x < W - 1 && y < H - 1) {
          j = ii + W * 4 + 4;
          dr = r - soft[j]; dg = gg - soft[j + 1]; db = bb - soft[j + 2];
          v = (2 * dr * dr + 4 * dg * dg + 3 * db * db) / 18;
          raw = v > 65025 ? 65025 : (v | 0);
          if (raw > best0) best0 = raw;
        }
        gr[p] = lut[best0];
      }
    }
    // suavizado 3×3 separable del mapa de bordes: elimina picos de ruido
    // aislados y mantiene los contornos (que son líneas continuas)
    var gtmp = new Uint8Array(N);
    var gtmp2 = new Uint8Array(N);
    var acc, a, b, c2;
    for (var yy = 0; yy < H; yy++) {
      var r0 = yy * W;
      for (var xx = 0; xx < W; xx++) {
        var pp = r0 + xx;
        a = xx > 0 ? gr[pp - 1] : gr[pp];
        b = gr[pp];
        c2 = xx < W - 1 ? gr[pp + 1] : gr[pp];
        gtmp[pp] = (a + b + c2 + 1) / 3 | 0;
      }
    }
    for (var yy2 = 0; yy2 < H; yy2++) {
      var r2 = yy2 * W;
      for (var xx2 = 0; xx2 < W; xx2++) {
        var q = r2 + xx2;
        a = yy2 > 0 ? gtmp[q - W] : gtmp[q];
        b = gtmp[q];
        c2 = yy2 < H - 1 ? gtmp[q + W] : gtmp[q];
        gtmp2[q] = (a + b + c2 + 1) / 3 | 0;
      }
    }
    wandGrad = gtmp2;

    soft = null;
    wandBlur = src;

    wandCanvas = document.createElement('canvas');
    wandCanvas.width = W;
    wandCanvas.height = H;
    wandCtx = wandCanvas.getContext('2d');
    wandImage = wandCtx.createImageData(W, H);
    wandSeen = new Uint8Array(N);
  }

  /**
   * Selecciona la forma que contiene al punto indicado.
   * @param {Object} o {x, y, tol, contiguous, mode}
   * @returns {boolean} true si ha marcado algún píxel
   */
  function applyWand(o) {
    if (!S.W) return false;
    ensureWandBuffers();
    var lut = wandSqrtTable();

    var W = S.W, H = S.H, N = W * H;
    var d = wandBlur, gmap = wandGrad, alpha = wandAlpha, opaque = wandOpaque;
    var out = wandImage.data;
    out.fill(0);

    var sx = Math.floor(o.x);
    var sy = Math.floor(o.y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return false;

    var T = clamp(o.tol, 1, 100) / 100;
    var limit = Math.round(5 + T * 65);            // borde máximo admisible
    if (limit < 2) limit = 2;
    if (limit > 200) limit = 200;

    var si = (sy * W + sx) * 4;
    var sr = d[si], sg = d[si + 1], sb = d[si + 2];
    var seedAlpha = alpha[sy * W + sx];
    var transparentSeed = seedAlpha < 40;

    var marked = 0;

    function mark(p) {
      var i = p * 4;
      out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255;
      marked++;
    }

    if (!o.contiguous) {
      // mismos colores en toda la imagen, sin importar dónde estén
      var gt = Math.min(255, 12 + T * 250);
      var gt2 = gt * gt;
      for (var p0 = 0; p0 < N; p0++) {
        var a0 = alpha[p0];
        if (transparentSeed) {
          if (a0 < 40) mark(p0);
        } else if (a0 >= 40) {
          var i0 = p0 * 4;
          var dr0 = d[i0] - sr, dg0 = d[i0 + 1] - sg, db0 = d[i0 + 2] - sb;
          if ((2 * dr0 * dr0 + 4 * dg0 * dg0 + 3 * db0 * db0) / 9 <= gt2) mark(p0);
        }
      }
    } else {
      if (!transparentSeed && seedAlpha < 40) return false;

      var best = new Uint8Array(N);
      best.fill(255);
      var buckets = new Array(limit + 1);
      for (var b = 0; b <= limit; b++) buckets[b] = [];
      var seen = wandSeen;
      seen.fill(0);

      var start = sy * W + sx;
      best[start] = 0;
      buckets[0].push(start);

      var cur = 0;
      while (cur <= limit) {
        var bucket = buckets[cur];
        if (bucket.length === 0) { cur++; continue; }

        var p = bucket.pop();
        if (seen[p]) continue;
        var pcost = best[p];
        if (pcost !== cur) continue;
        seen[p] = 1;

        // marcar
        var oi = p * 4;
        out[oi] = 255; out[oi + 1] = 255; out[oi + 2] = 255; out[oi + 3] = 255;
        marked++;

        var px = p % W;
        var py = (p - px) / W;
        var pi = p * 4;

        for (var k = 0; k < 4; k++) {
          var n;
          if (k === 0) { if (px === 0) continue; n = p - 1; }
          else if (k === 1) { if (px === W - 1) continue; n = p + 1; }
          else if (k === 2) { if (py === 0) continue; n = p - W; }
          else { if (py === H - 1) continue; n = p + W; }

          if (seen[n]) continue;
          if (!opaque) {
            var an = alpha[n];
            if (transparentSeed) {
              if (an >= 40) continue;
            } else if (an < 40) continue;
          }
          if (best[n] <= cur) continue;                 // ya hay un camino mejor
          var e = gmap[n];                              // borde del píxel de entrada
          var nc = e > cur ? e : cur;
          if (nc > limit) continue;
          if (nc < best[n]) {
            best[n] = nc;
            buckets[nc].push(n);
          }
        }
      }
    }

    if (!marked) return false;

    // limpieza 3×3: quita píxeles sueltos y cierra huecos de un píxel
    if (marked > 4) {
      var bits = new Uint8Array(N);
      for (var q = 0, qi = 3; q < N; q++, qi += 4) bits[q] = out[qi] >= 128 ? 1 : 0;

      var rowSum = new Uint8Array(N);
      for (var ry = 0; ry < H; ry++) {
        var rbase = ry * W;
        for (var rx = 0; rx < W; rx++) {
          var rv = bits[rbase + rx];
          if (rx > 0) rv += bits[rbase + rx - 1];
          if (rx < W - 1) rv += bits[rbase + rx + 1];
          rowSum[rbase + rx] = rv;
        }
      }

      marked = 0;
      for (var cy = 0; cy < H; cy++) {
        var cbase = cy * W;
        for (var cx = 0; cx < W; cx++) {
          var sum = rowSum[cbase + cx];
          if (cy > 0) sum += rowSum[cbase - W + cx];
          if (cy < H - 1) sum += rowSum[cbase + W + cx];
          var on = sum >= 5 ? 1 : 0;
          var oi3 = (cbase + cx) * 4;
          out[oi3] = 255; out[oi3 + 1] = 255; out[oi3 + 2] = 255;
          out[oi3 + 3] = on ? 255 : 0;
          if (on) marked++;
        }
      }
      if (!marked) return false;
    }

    wandCtx.putImageData(wandImage, 0, 0);
    S.mctx.save();
    S.mctx.globalCompositeOperation = (o.mode === 'sub') ? 'destination-out' : 'source-over';
    try { S.mctx.filter = 'blur(0.6px)'; } catch (e) { /* sin filtro */ }
    S.mctx.drawImage(wandCanvas, 0, 0);
    try { S.mctx.filter = 'none'; } catch (e) { /* sin filtro */ }
    S.mctx.restore();
    return true;
  }
  function lassoPath(c, pts) {
    c.beginPath();
    pts.forEach(function (p, i) {
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    });
    c.closePath();
  }

  function widthAt(size, pt) {
    if (pt.p == null) return size;
    return size * (0.35 + 0.65 * pt.p);
  }

  /** Dibuja los segmentos del trazo desde `from` (0 = incluye el punto inicial). */
  function paintSegments(c, pts, size, mode, from) {
    c.save();
    c.globalCompositeOperation = (mode === 'sub') ? 'destination-out' : 'source-over';
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (pts.length === 1) {
      c.beginPath();
      c.arc(pts[0].x, pts[0].y, Math.max(0.5, widthAt(size, pts[0]) / 2), 0, TAU);
      c.fill();
      c.restore();
      return;
    }

    var start = Math.max(1, from || 0);
    for (var i = start; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var wa = widthAt(size, a), wb = widthAt(size, b);
      var dx = b.x - a.x, dy = b.y - a.y;

      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
        c.beginPath();
        c.arc(b.x, b.y, Math.max(0.5, wb / 2), 0, TAU);
        c.fill();
        continue;
      }

      for (var k = 1; k <= 3; k++) {
        var t0 = (k - 1) / 3, t1 = k / 3;
        c.beginPath();
        c.lineWidth = Math.max(0.4, wa + (wb - wa) * ((t0 + t1) / 2));
        c.moveTo(a.x + dx * t0, a.y + dy * t0);
        c.lineTo(a.x + dx * t1, a.y + dy * t1);
        c.stroke();
      }
    }
    c.restore();
  }

  function invertMask() {
    var tmp = getTmp();
    tmpCtx.setTransform(1, 0, 0, 1, 0, 0);
    tmpCtx.clearRect(0, 0, S.W, S.H);
    tmpCtx.globalCompositeOperation = 'source-over';
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillRect(0, 0, S.W, S.H);
    tmpCtx.globalCompositeOperation = 'destination-out';
    tmpCtx.drawImage(S.mask, 0, 0);
    tmpCtx.globalCompositeOperation = 'source-over';

    S.mctx.setTransform(1, 0, 0, 1, 0, 0);
    S.mctx.clearRect(0, 0, S.W, S.H);
    S.mctx.drawImage(tmp, 0, 0);
  }

  function applyOp(o) {
    var c = S.mctx;
    switch (o.type) {
      case 'rect':
        c.save();
        c.globalCompositeOperation = o.mode === 'sub' ? 'destination-out' : 'source-over';
        c.fillStyle = '#ffffff';
        c.fillRect(o.x, o.y, o.w, o.h);
        c.restore();
        break;
      case 'lasso':
        c.save();
        c.globalCompositeOperation = o.mode === 'sub' ? 'destination-out' : 'source-over';
        c.fillStyle = '#ffffff';
        lassoPath(c, o.pts);
        c.fill();
        c.restore();
        break;
      case 'brush':
        paintSegments(c, o.pts, o.size, o.mode, 0);
        break;
      case 'wand':
        applyWand(o);
        break;
      case 'clear':
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, S.W, S.H);
        break;
      case 'all':
        c.save();
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, S.W, S.H);
        c.restore();
        break;
      case 'invert':
        invertMask();
        break;
    }
  }

  function replay() {
    S.mctx.setTransform(1, 0, 0, 1, 0, 0);
    S.mctx.clearRect(0, 0, S.W, S.H);
    S.ops.forEach(applyOp);
    maskVersion++;
    lastOverlayKey = '';
    invalidate();
  }

  function pushOp(o) {
    S.ops.push(o);
    S.redo.length = 0;
    applyOp(o);
    maskVersion++;
    lastOverlayKey = '';
    commitMask();
  }

  function undo() {
    if (!S.ops.length) return;
    S.redo.push(S.ops.pop());
    replay();
    commitMask();
  }

  function redo() {
    if (!S.redo.length) return;
    S.ops.push(S.redo.pop());
    replay();
    commitMask();
  }

  function clearSelection(silent) {
    if (!S.W || !S.ops.length) return;
    pushOp({ type: 'clear' });
    if (!silent) toast(T('toast.cleared'));
  }

  function selectAll() {
    if (!S.W) return;
    pushOp({ type: 'all' });
  }

  function invertSelection() {
    if (!S.W || !S.ops.length) return;
    pushOp({ type: 'invert' });
  }

  /* ---------- estadísticas de la máscara ---------- */
  function computeStats() {
    if (!S.W) { S.selCount = 0; S.selBox = null; return; }
    var step = Math.max(1, Math.floor(Math.sqrt((S.W * S.H) / 1200000)));
    var d = S.mctx.getImageData(0, 0, S.W, S.H).data;
    var count = 0;
    var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;

    for (var y = 0; y < S.H; y += step) {
      var row = y * S.W * 4;
      for (var x = 0; x < S.W; x += step) {
        if (d[row + x * 4 + 3] > 127) {
          count++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }

    S.selCount = count * step * step;
    if (count) {
      S.selBox = {
        x: x0,
        y: y0,
        w: Math.min(S.W, x1 + step) - x0,
        h: Math.min(S.H, y1 + step) - y0
      };
    } else {
      S.selBox = null;
    }
    updateSelStats();
    lastOverlayKey = '';
  }

  function updateSelStats() {
    if (!S.W || !S.selCount) {
      el.selStats.textContent = T('stats.none');
      return;
    }
    var total = S.W * S.H;
    var p = (S.selCount / total) * 100;
    el.selStats.textContent = fmtPct1(p) + '% · ' + fmtNum(S.selCount) + ' px';
  }

  /* ---------- contorno animado de la selección ---------- */
  var antsPhase = 0;
  var antsRaf = 0;
  var antsLast = 0;
  var antsPatCanvas = null;
  var antsPatCache = {};

  function buildAntsEdge() {
    if (!S.W || !S.H || !S.mctx) { S.edgeCanvas = null; return; }
    var W = S.W, H = S.H;
    if (!S.edgeCanvas) S.edgeCanvas = document.createElement('canvas');
    var ec = S.edgeCanvas;
    if (ec.width !== W || ec.height !== H) { ec.width = W; ec.height = H; }
    var ectx = ec.getContext('2d');
    var md = S.mctx.getImageData(0, 0, W, H).data;
    var out = ectx.createImageData(W, H);
    var od = out.data;
    var stride = W * 4;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * stride + x * 4;
        if (md[i + 3] < 128) continue;
        var edge = (x === 0 || md[i - 1] < 128) ||
                   (x === W - 1 || md[i + 7] < 128) ||
                   (y === 0 || md[i - stride + 3] < 128) ||
                   (y === H - 1 || md[i + stride + 3] < 128);
        if (edge) {
          od[i] = 255; od[i + 1] = 255; od[i + 2] = 255; od[i + 3] = 255;
        }
      }
    }
    ectx.putImageData(out, 0, 0);
  }

  function antsPattern(phase) {
    if (!antsPatCanvas) {
      antsPatCanvas = document.createElement('canvas');
      antsPatCanvas.width = 8;
      antsPatCanvas.height = 8;
    }
    var p = antsPatCanvas.getContext('2d');
    p.clearRect(0, 0, 8, 8);
    p.fillStyle = '#ffffff';
    p.fillRect(0, 0, 8, 8);
    p.fillStyle = '#0a0c10';
    var o = phase % 8;
    [o - 8, o, o + 8].forEach(function (ox) {
      p.fillRect(ox, 0, 4, 4);
      p.fillRect(ox + 4, 4, 4, 4);
    });
    return antsPatCanvas;
  }

  function getAntsPattern() {
    var key = antsPhase % 8;
    if (!antsPatCache[key] && antsCtx) {
      antsPatCache[key] = antsCtx.createPattern(antsPattern(key), 'repeat');
    }
    return antsPatCache[key];
  }

  function drawAnts() {
    if (!antsCtx || !el.ants) return;
    var w = S.cssW, h = S.cssH, dpr = S.dpr;
    antsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    antsCtx.clearRect(0, 0, w, h);
    if (!S.edgeCanvas || !S.selCount || !S.W) return;

    var x0 = Math.max(0, Math.floor(-S.view.x / S.view.scale));
    var y0 = Math.max(0, Math.floor(-S.view.y / S.view.scale));
    var x1 = Math.min(S.W, Math.ceil((w - S.view.x) / S.view.scale));
    var y1 = Math.min(S.H, Math.ceil((h - S.view.y) / S.view.scale));
    if (x1 <= x0 || y1 <= y0) return;

    var dx = S.view.x + x0 * S.view.scale;
    var dy = S.view.y + y0 * S.view.scale;
    var dw = (x1 - x0) * S.view.scale;
    var dh = (y1 - y0) * S.view.scale;

    antsCtx.imageSmoothingEnabled = S.view.scale < 2.2;
    antsCtx.drawImage(S.edgeCanvas, x0, y0, x1 - x0, y1 - y0, dx, dy, dw, dh);

    antsCtx.globalCompositeOperation = 'source-in';
    var pat = getAntsPattern();
    if (pat) {
      antsCtx.fillStyle = pat;
      antsCtx.fillRect(0, 0, w, h);
    }
    antsCtx.globalCompositeOperation = 'source-over';
  }

  function antsLoop(ts) {
    antsRaf = 0;
    if (currentView !== 'espectro' || !S.selCount || document.hidden) return;
    if (!antsLast || ts - antsLast > 90) {
      antsLast = ts;
      antsPhase = (antsPhase + 1) % 8;
      drawAnts();
    }
    antsRaf = requestAnimationFrame(antsLoop);
  }

  function ensureAnts() {
    if (antsRaf || !S.selCount || currentView !== 'espectro') return;
    antsLast = 0;
    antsRaf = requestAnimationFrame(antsLoop);
  }
  function commitMask() {
    computeStats();
    syncUndoButtons();
    updateExportState();
    buildAntsEdge();
    ensureAnts();
    if (S.auto) scheduleExtract(320);
    invalidate();
  }

  function syncUndoButtons() {
    el.btnUndo.disabled = !S.ops.length;
    el.btnRedo.disabled = !S.redo.length;
  }

  /* ============================================================
     Imagen
     ============================================================ */
  function loadBlob(blob) {
    if (!blob) return;
    if (blob.type && blob.type.indexOf('image') !== 0) {
      toast(T('toast.notImage'));
      return;
    }
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      setImage(img, blob.name || T('file.pasted'), blob.size);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast(T('toast.decodeError'));
    };
    img.src = url;
  }

  function setImage(img, name, size) {
    var nw = img.naturalWidth || img.width;
    var nh = img.naturalHeight || img.height;
    if (!nw || !nh) { toast(T('toast.invalidImage')); return; }

    var scale = Math.min(1, MAX_DIM / Math.max(nw, nh));
    S.W = Math.max(1, Math.round(nw * scale));
    S.H = Math.max(1, Math.round(nh * scale));

    S.work = document.createElement('canvas');
    S.work.width = S.W;
    S.work.height = S.H;
    S.wctx = S.work.getContext('2d', { willReadFrequently: true });
    S.wctx.imageSmoothingQuality = 'high';
    S.wctx.drawImage(img, 0, 0, S.W, S.H);

    newMaskCanvas();
    tmpCanvas = null; tmpCtx = null;
    resetWandCache();

    S.img = img;
    S.fileName = name || T('file.image');
    S.fileSize = size || 0;
    S.ops = [];
    S.redo = [];
    S.palette = [];
    S.base = null;
    S.samples = [];
    S.schemes = [];
    S.basics = [];
    S.selCount = 0;
    S.selBox = null;
    S.drag = null;
    S.pan = null;
    S.pinch = null;
    lastOverlayKey = '';

    updateFileInfo();

    try {
      var t = document.createElement('canvas');
      t.width = 84; t.height = 84;
      var tx = t.getContext('2d');
      var f = Math.min(84 / S.W, 84 / S.H);
      var tw = S.W * f, th = S.H * f;
      tx.fillStyle = '#0b0d11';
      tx.fillRect(0, 0, 84, 84);
      tx.drawImage(S.work, (84 - tw) / 2, (84 - th) / 2, tw, th);
      el.fileThumb.style.backgroundImage = 'url(' + t.toDataURL('image/jpeg', 0.82) + ')';
    } catch (e) { /* sin miniatura */ }

    el.app.classList.add('has-image');
    el.emptyState.classList.add('is-hidden');

    resize();
    fitView();
    renderAll();
    syncControls();
    toast(T('toast.imageLoaded', { w: fmtNum(nw), h: fmtNum(nh) }));
  }

  function openFileDialog() {
    el.fileInput.value = '';
    el.fileInput.click();
  }

  function makeDemoImage() {
    var c = document.createElement('canvas');
    c.width = 1800;
    c.height = 1200;
    var g = c.getContext('2d');

    var sky = g.createLinearGradient(0, 0, 0, 760);
    sky.addColorStop(0, '#1b2a4a');
    sky.addColorStop(0.38, '#4a5178');
    sky.addColorStop(0.62, '#a06a72');
    sky.addColorStop(0.82, '#e0955f');
    sky.addColorStop(1, '#f3c07a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1800, 1200);

    var halo = g.createRadialGradient(1180, 640, 20, 1180, 640, 460);
    halo.addColorStop(0, 'rgba(255,214,150,.85)');
    halo.addColorStop(0.4, 'rgba(238,160,96,.35)');
    halo.addColorStop(1, 'rgba(238,160,96,0)');
    g.fillStyle = halo;
    g.fillRect(600, 100, 1180, 1000);

    g.fillStyle = '#ffe3b0';
    g.beginPath();
    g.arc(1180, 640, 66, 0, TAU);
    g.fill();

    // montañas lejanas
    function ridge(points, color) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 1200);
      points.forEach(function (p) { g.lineTo(p[0], p[1]); });
      g.lineTo(1800, 1200);
      g.closePath();
      g.fill();
    }

    ridge([[0, 760], [180, 640], [330, 720], [520, 590], [700, 700], [860, 640], [1020, 730], [1230, 660], [1420, 720], [1620, 640], [1800, 700]], '#5b6a86');
    ridge([[0, 820], [200, 730], [420, 800], [640, 700], [820, 790], [1010, 720], [1210, 810], [1450, 730], [1650, 800], [1800, 745]], '#3d4a63');
    ridge([[0, 900], [260, 820], [470, 880], [700, 800], [950, 870], [1180, 810], [1420, 880], [1700, 820], [1800, 850]], '#2a3346');

    // agua
    var water = g.createLinearGradient(0, 860, 0, 1200);
    water.addColorStop(0, '#3b4d61');
    water.addColorStop(0.45, '#2d3d50');
    water.addColorStop(1, '#1d2735');
    g.fillStyle = water;
    g.fillRect(0, 860, 1800, 340);

    // reflejo
    g.save();
    g.globalAlpha = 0.75;
    for (var i = 0; i < 44; i++) {
      var yy = 880 + i * 7.4;
      var wdt = 70 + Math.random() * 190;
      var xx = 1180 - wdt / 2 + (Math.random() - 0.5) * 130;
      g.fillStyle = i % 3 === 0 ? 'rgba(255,206,140,.55)' : (i % 3 === 1 ? 'rgba(226,146,88,.45)' : 'rgba(122,140,160,.35)');
      g.fillRect(xx, yy, wdt, 2.2 + Math.random() * 2.4);
    }
    g.restore();

    // primer plano
    g.fillStyle = '#151a21';
    g.beginPath();
    g.moveTo(0, 1200);
    g.lineTo(0, 1010);
    g.bezierCurveTo(120, 980, 240, 1050, 380, 1035);
    g.bezierCurveTo(520, 1020, 560, 1120, 700, 1200);
    g.closePath();
    g.fill();

    g.fillStyle = '#243528';
    g.beginPath();
    g.moveTo(1360, 1200);
    g.lineTo(1420, 1010);
    g.lineTo(1470, 1000);
    g.lineTo(1500, 1010);
    g.lineTo(1560, 1200);
    g.closePath();
    g.fill();

    g.fillStyle = '#2f4a3a';
    g.beginPath();
    g.arc(1430, 990, 46, 0, TAU);
    g.arc(1480, 1000, 34, 0, TAU);
    g.fill();

    return c.toDataURL('image/png');
  }

  function loadDemo() {
    var url = makeDemoImage();
    var img = new Image();
    img.onload = function () {
      setImage(img, 'ejemplo-atardecer.png', 0);
      // selección de ejemplo y paleta automática
      setTimeout(function () {
        applyRectOp(120, 140, 1560, 940, 'add');
      }, 120);
    };
    img.src = url;
  }

  /* ============================================================
     Interacción con el lienzo
     ============================================================ */
  function hasImage() { return !!S.W; }

  function startPan(e) {
    S.pan = { x: e.clientX, y: e.clientY, ox: S.view.x, oy: S.view.y };
    canvas.classList.add('is-panning');
  }

  function startPinch() {
    var arr = Array.from(S.pointers.values());
    if (arr.length < 2) return;
    var a = arr[0], b = arr[1];
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    var d = Math.hypot(a.x - b.x, a.y - b.y);
    var p = toImagePoint(cx, cy);
    S.pinch = {
      d0: Math.max(1, d),
      cx: cx, cy: cy,
      ax: p.x, ay: p.y,
      scale0: S.view.scale
    };
  }

  function updatePinch() {
    var arr = Array.from(S.pointers.values());
    if (arr.length < 2 || !S.pinch) return;
    var a = arr[0], b = arr[1];
    var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    var d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    var ns = clamp(S.pinch.scale0 * (d / S.pinch.d0), MIN_SCALE, MAX_SCALE);
    var r = canvas.getBoundingClientRect();
    S.view.scale = ns;
    S.view.x = (cx - r.left) - S.pinch.ax * ns;
    S.view.y = (cy - r.top) - S.pinch.ay * ns;
    invalidate();
  }

  function cancelInteraction() {
    if (S.drag) {
      var hadStroke = S.drag.kind === 'stroke';
      S.drag = null;
      if (hadStroke) replay();
    }
    S.pan = null;
    canvas.classList.remove('is-panning');
    invalidate();
  }

  function onPointerDown(e) {
    if (!hasImage()) return;

    if (e.pointerType !== 'mouse') {
      S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (S.pointers.size === 2) {
        cancelInteraction();
        startPinch();
        return;
      }
    }

    if (e.button === 2 || e.button === 1 || S.space) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;

    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }

    var p = toImagePoint(e.clientX, e.clientY);
    S.cursor = { sx: p.sx, sy: p.sy, inside: true };

    if (S.tool === 'picker') {
      pickColor(p);
      invalidate();
      return;
    }

    if (S.tool === 'wand') {
      var wandMode = S.mode;
      if (e.altKey) wandMode = wandMode === 'add' ? 'sub' : 'add';
      var op = {
        type: 'wand',
        x: p.x, y: p.y,
        tol: S.wandTol,
        contiguous: S.wandContig,
        mode: wandMode
      };
      if (!applyWand(op)) {
        toast(T('toast.wandEmpty'));
        return;
      }
      S.wandSeed = { x: p.x, y: p.y };
      S.ops.push(op);
      S.redo.length = 0;
      maskVersion++;
      lastOverlayKey = '';
      commitMask();
      return;
    }

    if (S.tool === 'brush' || S.tool === 'eraser') {
      var size = S.brush / S.view.scale;
      var press = (e.pointerType === 'pen' && e.pressure > 0.001) ? e.pressure : null;
      S.drag = {
        kind: 'stroke',
        size: size,
        mode: S.tool === 'eraser' ? 'sub' : 'add',
        pts: [{ x: p.x, y: p.y, p: press }]
      };
      paintSegments(S.mctx, S.drag.pts, size, S.drag.mode, 0);
      maskVersion++;
      invalidate();
      return;
    }

    // formas: rect / lasso
    var mode = S.mode;
    if (e.altKey) mode = mode === 'add' ? 'sub' : 'add';
    S.drag = {
      kind: 'shape',
      tool: S.tool,
      mode: mode,
      start: { x: p.x, y: p.y },
      cur: { x: p.x, y: p.y },
      pts: [{ x: p.x, y: p.y }]
    };
    invalidate();
  }

  function addStrokePoints(e) {
    var d = S.drag;
    if (!d) return;
    var from = d.pts.length - 1;

    var events = [];
    if (e.getCoalescedEvents && e.pointerType === 'pen') {
      var co = e.getCoalescedEvents();
      if (co && co.length) events = co;
    }
    if (!events.length) events = [e];

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var p = toImagePoint(ev.clientX, ev.clientY);
      var press = (ev.pointerType === 'pen' && ev.pressure > 0.001) ? ev.pressure : null;
      d.pts.push({ x: p.x, y: p.y, p: press });
    }

    paintSegments(S.mctx, d.pts, d.size, d.mode, from);
    maskVersion++;
    invalidate();
  }

  function onPointerMove(e) {
    if (!hasImage()) return;

    var p = toImagePoint(e.clientX, e.clientY);
    S.cursor = { sx: p.sx, sy: p.sy, inside: p.sx >= 0 && p.sy >= 0 && p.sx <= S.cssW && p.sy <= S.cssH };

    if (S.pointers.has(e.pointerId)) {
      S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    }

    if (S.pinch) { updatePinch(); return; }

    if (S.pan) {
      S.view.x = S.pan.ox + (e.clientX - S.pan.x);
      S.view.y = S.pan.oy + (e.clientY - S.pan.y);
      invalidate();
      return;
    }

    if (!S.drag) {
      if (S.tool === 'brush' || S.tool === 'eraser' || S.tool === 'picker') invalidate();
      return;
    }

    if (S.drag.kind === 'stroke') {
      addStrokePoints(e);
      return;
    }

    if (S.drag.kind === 'shape') {
      if (S.drag.tool === 'rect') {
        S.drag.cur = { x: p.x, y: p.y };
      } else {
        var last = S.drag.pts[S.drag.pts.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.8 / S.view.scale) {
          S.drag.pts.push({ x: p.x, y: p.y });
        }
      }
      invalidate();
    }
  }

  function onPointerUp(e) {
    S.pointers.delete(e.pointerId);

    if (S.pinch) {
      if (S.pointers.size < 2) S.pinch = null;
      return;
    }

    if (S.pan) {
      S.pan = null;
      canvas.classList.remove('is-panning');
      return;
    }

    var d = S.drag;
    if (!d) return;
    S.drag = null;

    if (d.kind === 'stroke') {
      S.ops.push({ type: 'brush', pts: d.pts, size: d.size, mode: d.mode });
      S.redo.length = 0;
      maskVersion++;
      lastOverlayKey = '';
      commitMask();
      return;
    }

    if (d.kind === 'shape') {
      var op = null;
      if (d.tool === 'rect') {
        var x = Math.min(d.start.x, d.cur.x);
        var y = Math.min(d.start.y, d.cur.y);
        var w = Math.abs(d.cur.x - d.start.x);
        var h = Math.abs(d.cur.y - d.start.y);
        if (w >= 1 && h >= 1) op = { type: 'rect', x: x, y: y, w: w, h: h, mode: d.mode };
      } else {
        if (d.pts.length >= 3) op = { type: 'lasso', pts: d.pts, mode: d.mode };
      }

      if (op) {
        pushOp(op);
      } else {
        invalidate();
      }
    }
  }

  function onPointerCancel(e) {
    S.pointers.delete(e.pointerId);
    S.pinch = null;
    cancelInteraction();
  }

  function pickColor(p) {
    var x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= S.W || y >= S.H) return;
    var d = S.wctx.getImageData(x, y, 1, 1).data;
    if (d[3] < 40) { toast(T('toast.transparent')); return; }
    var hex = PC.rgbToHex(d[0], d[1], d[2]).toUpperCase();
    if (S.samples.indexOf(hex) === -1) {
      S.samples.push(hex);
      if (S.samples.length > 24) S.samples.shift();
    }
    renderSamples();
    toast(T('toast.sampleAdded', { hex: hex }));
  }

  function onWheel(e) {
    if (!hasImage()) return;
    e.preventDefault();
    var mode = e.deltaMode === 1 ? 0.05 : 0.0016;
    var factor = Math.exp(-e.deltaY * mode);
    var r = canvas.getBoundingClientRect();
    zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
  }

  /* ============================================================
     Extracción de paleta
     ============================================================ */
  function scheduleExtract(delay) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (!S.auto) return;
      if (S.selCount > 0 && !S.extracting) extractNow({ silent: true });
    }, delay || 320);
  }

  /* ---------- ajuste en vivo: al mover la tolerancia se recalcula el último clic ---------- */
  var wandRetuneTimer = null;

  function scheduleWandRetune() {
    if (!S.wandSeed) return;
    clearTimeout(wandRetuneTimer);
    wandRetuneTimer = setTimeout(retuneWand, 140);
  }

  function retuneWand() {
    if (!S.wandSeed) return;
    var last = S.ops[S.ops.length - 1];
    if (!last || last.type !== 'wand') return;
    if (Math.round(last.x) !== Math.round(S.wandSeed.x) ||
        Math.round(last.y) !== Math.round(S.wandSeed.y)) return;

    S.ops.pop();
    replay();
    pushOp({
      type: 'wand',
      x: last.x, y: last.y,
      tol: S.wandTol,
      contiguous: S.wandContig,
      mode: last.mode
    });
  }
  function extractNow(opts) {
    opts = opts || {};
    if (!hasImage() || S.extracting) return;
    if (!S.selCount) {
      if (!opts.silent) toast(T('toast.selectFirst'));
      return;
    }

    S.extracting = true;
    var showBusy = !opts.silent;
    var started = performance.now();
    if (showBusy) busy(true);

    function run() {
      try {
        var md = S.mctx.getImageData(0, 0, S.W, S.H);
        var im = S.wctx.getImageData(0, 0, S.W, S.H);
        var res = PE.extract({
          width: S.W,
          height: S.H,
          pixels: im.data,
          mask: md.data,
          k: S.k,
          bbox: S.selBox
        });

        if (!res.colors.length) {
          toast(T('toast.noPixels'));
          return;
        }

        var prevHex = S.base ? S.base.hex : null;

        S.palette = PE.sort(res.colors, S.sortMode);
        S.base = null;
        if (prevHex) {
          for (var i = 0; i < S.palette.length; i++) {
            if (S.palette[i].hex === prevHex) { S.base = S.palette[i]; break; }
          }
        }
        if (!S.base) S.base = S.palette[0];

        buildDerived();
        renderPalette();
        renderSchemes();
        renderBasics();
        updateExportState();

        if (!opts.silent) {
          toast(T('toast.extracted', { n: S.palette.length, ms: Math.round(performance.now() - started) }));
        }
      } catch (err) {
        console.error(err);
        toast(T('toast.extractError'));
      } finally {
        S.extracting = false;
        if (showBusy) busy(false);
      }
    }

    if (showBusy) {
      requestAnimationFrame(function () { setTimeout(run, 24); });
    } else {
      run();
    }
  }

  function buildDerived() {
    S.schemes = S.base ? PC.schemeList(S.base.hsl) : [];
    S.schemes.forEach(function (sc) {
      sc.on = S.schemeOn[sc.id] !== false;
    });
    S.basics = PE.basics(S.palette);
  }

  /* ============================================================
     Render de paneles
     ============================================================ */
  function renderAll() {
    renderPalette();
    renderSchemes();
    renderBasics();
    renderSamples();
    updateFileInfo();
    updateSelStats();
    updateExportState();
    syncUndoButtons();
  }

  function updateFileInfo() {
    if (!S.fileName) {
      el.fileName.textContent = T('file.none');
      el.fileDims.textContent = '—';
      el.fileThumb.style.backgroundImage = '';
      return;
    }
    el.fileName.textContent = S.fileName;
    var reduced = S.img && S.img.naturalWidth !== S.W;
    el.fileDims.textContent = S.W + ' × ' + S.H + ' px' + (reduced ? ' · ' + T('file.reduced') : '');
  }

  function renderPalette() {
    if (!el.paletteList) return;
    el.paletteList.innerHTML = '';

    if (!S.palette.length) {
      el.paletteEmpty.style.display = '';
      el.paletteMeta.textContent = '';
      return;
    }

    el.paletteEmpty.style.display = 'none';
    el.paletteMeta.textContent = S.palette.length === 1
      ? T('palette.countOne')
      : T('palette.count', { n: S.palette.length });

    S.palette.forEach(function (c) {
      var isBase = S.base && S.base.hex === c.hex;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (isBase ? ' is-base' : '');
      b.setAttribute('data-hex', c.hex);
      b.title = c.hex.toUpperCase() + ' · ' + c.name + ' · ' + (c.coverage * 100).toFixed(1) + '%';

      b.innerHTML =
        '<span class="chip" style="background:' + c.hex + '"></span>' +
        '<span class="body">' +
          '<span class="hex">' + c.hex.toUpperCase() + '</span>' +
          '<span class="sub">' + PC.fmtRgb(c) + '</span>' +
          '<span class="cname">' + c.name + '</span>' +
        '</span>' +
        '<span class="pct">' + (c.coverage * 100).toFixed(1) + '%</span>' +
        '<span class="bar" style="width:' + (c.coverage * 100).toFixed(2) + '%;background:' + c.hex + '"></span>';

      el.paletteList.appendChild(b);
    });
  }

  function renderSchemes() {
    if (!el.schemeList) return;
    el.schemeList.innerHTML = '';

    if (!S.base || !S.schemes.length) {
      el.schemeEmpty.style.display = '';
      el.baseTag.hidden = true;
      el.schemeHint.hidden = true;
      el.schemeExportHint.style.display = 'none';
      return;
    }

    el.schemeEmpty.style.display = 'none';
    el.baseTag.hidden = false;
    el.baseTag.textContent = S.base.hex.toUpperCase();
    el.schemeHint.hidden = false;
    el.schemeExportHint.style.display = '';

    S.schemes.forEach(function (sc) {
      var wrap = document.createElement('div');
      wrap.className = 'scheme' + (sc.on ? ' is-on' : ' is-off');

      var head = document.createElement('div');
      head.className = 'scheme-head';

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'scheme-toggle';
      toggle.setAttribute('role', 'checkbox');
      toggle.setAttribute('aria-checked', sc.on ? 'true' : 'false');
      toggle.title = T('harm.toggleTitle');

      var name = document.createElement('span');
      name.className = 'scheme-name';
      name.textContent = sc.name;

      var meta = document.createElement('span');
      meta.className = 'scheme-meta';
      meta.textContent = sc.note;

      head.appendChild(toggle);
      head.appendChild(name);
      head.appendChild(meta);

      head.addEventListener('click', function (ev) {
        ev.preventDefault();
        sc.on = !sc.on;
        S.schemeOn[sc.id] = sc.on;
        wrap.classList.toggle('is-on', sc.on);
        wrap.classList.toggle('is-off', !sc.on);
        toggle.setAttribute('aria-checked', sc.on ? 'true' : 'false');
      });

      wrap.appendChild(head);

      var row = document.createElement('div');
      row.className = 'scheme-row';

      sc.colors.forEach(function (c) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scheme-chip' + (c.isBase ? ' is-base' : '');
        btn.style.background = c.hex;
        btn.style.color = PC.contrastInk(c.rgb);
        btn.textContent = c.hex.toUpperCase();
        btn.title = c.hex.toUpperCase();
        btn.setAttribute('data-hex', c.hex);
        row.appendChild(btn);
      });

      wrap.appendChild(row);
      el.schemeList.appendChild(wrap);
    });
  }

  function renderBasics() {
    if (!el.basicsList) return;
    el.basicsList.innerHTML = '';

    if (!S.basics.length) {
      el.basicsEmpty.style.display = '';
      return;
    }

    el.basicsEmpty.style.display = 'none';

    S.basics.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'basic';
      btn.title = b.name + ' · ' + b.hex.toUpperCase() + ' · ' + (b.coverage * 100).toFixed(0) + '%';
      btn.innerHTML =
        '<i style="background:' + b.hex + '"></i>' +
        '<span>' + b.name + '</span>' +
        '<b>' + b.hex.toUpperCase() + '</b>';
      btn.addEventListener('click', function () {
        S.base = b.best;
        buildDerived();
        renderPalette();
        renderSchemes();
        updateExportState();
      });
      el.basicsList.appendChild(btn);
    });
  }

  function renderSamples() {
    if (!el.samplesList) return;
    el.samplesList.innerHTML = '';

    S.samples.forEach(function (hex) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sample';
      b.style.background = hex;
      b.setAttribute('data-hex', hex);
      b.title = hex + ' · ' + T('sample.title');
      b.innerHTML = '<span class="sample-x" aria-hidden="true">×</span>';
      b.addEventListener('click', function (ev) {
        if (ev.altKey) {
          S.samples = S.samples.filter(function (x) { return x !== hex; });
          renderSamples();
          return;
        }
        PC.copyText(hex).then(function () { toast(T('toast.copied', { hex: hex })); });
      });
      el.samplesList.appendChild(b);
    });

    el.samplesHint.style.display = S.samples.length ? 'none' : '';
  }

  function updateExportState() {
    el.btnExport.disabled = !S.palette.length;
    el.btnCutout.disabled = !S.selCount;
  }

  /* ============================================================
     Controles
     ============================================================ */
  function setTool(tool) {
    S.tool = tool;
    $$('.tool', el.toolList).forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tool') === tool);
    });
    canvas.setAttribute('data-tool', tool);
    el.modeField.style.display = (tool === 'rect' || tool === 'lasso' || tool === 'wand') ? '' : 'none';
    el.brushField.style.display = (tool === 'brush' || tool === 'eraser') ? '' : 'none';
    el.wandField.style.display = (tool === 'wand') ? '' : 'none';
    invalidate();
  }

  function setMode(mode) {
    S.mode = mode;
    $$('button', el.modeGroup).forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-mode') === mode);
    });
  }

  function setK(k) {
    S.k = clamp(Math.round(k), K_MIN, K_MAX);
    el.kVal.textContent = S.k;
  }

  function syncRangeFill(input) {
    var min = parseFloat(input.min) || 0;
    var max = parseFloat(input.max) || 100;
    var val = parseFloat(input.value) || 0;
    input.style.setProperty('--fill', (((val - min) / (max - min)) * 100) + '%');
  }

  function syncBrushFill() {
    el.brushSize.value = S.brush;
    syncRangeFill(el.brushSize);
    el.brushSizeVal.textContent = S.brush + ' px';
    el.wandTol.value = S.wandTol;
    syncRangeFill(el.wandTol);
    el.wandTolVal.textContent = S.wandTol;
    el.wandContig.checked = S.wandContig;
  }

  function syncControls() {
    var has = !!S.W;
    el.btnExtract.disabled = !has;
    el.btnInvert.disabled = !has;
    el.btnAll.disabled = !has;
    el.btnClear.disabled = !has;
    el.brushSize.disabled = !has;
    el.wandTol.disabled = !has;
    el.wandContig.disabled = !has;
    el.kDown.disabled = !has;
    el.kUp.disabled = !has;
    $$('.tool', el.toolList).forEach(function (b) { b.disabled = !has; });
    syncUndoButtons();
    updateExportState();
  }

  /* ============================================================
     Exportación de la hoja de estilos
     ============================================================ */
  function buildThumb(maxW, maxH) {
    var s = Math.min(maxW / S.W, maxH / S.H);
    var w = Math.max(1, Math.round(S.W * s));
    var h = Math.max(1, Math.round(S.H * s));

    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.drawImage(S.work, 0, 0, w, h);

    if (S.selCount) {
      var o = document.createElement('canvas');
      o.width = w; o.height = h;
      var ox = o.getContext('2d');
      ox.fillStyle = 'rgba(12, 10, 8, 0.55)';
      ox.fillRect(0, 0, w, h);
      ox.globalCompositeOperation = 'destination-out';
      ox.drawImage(S.mask, 0, 0, w, h);
      x.drawImage(o, 0, 0);

      if (S.selBox) {
        var b = S.selBox;
        x.strokeStyle = 'rgba(244,184,96,.95)';
        x.lineWidth = 1.6;
        x.strokeRect(b.x * s + 0.8, b.y * s + 0.8, Math.max(1, b.w * s - 1.6), Math.max(1, b.h * s - 1.6));
      }
    }
    return c;
  }

  function buildCrop(maxW, maxH) {
    if (!S.selBox) return null;
    var b = S.selBox;
    if (b.w < 2 || b.h < 2) return null;

    var c0 = document.createElement('canvas');
    c0.width = b.w;
    c0.height = b.h;
    var c0x = c0.getContext('2d');
    c0x.drawImage(S.work, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);

    try {
      var id = c0x.getImageData(0, 0, b.w, b.h);
      var md = S.mctx.getImageData(b.x, b.y, b.w, b.h);
      for (var i = 3; i < id.data.length; i += 4) {
        id.data[i] = Math.min(id.data[i], md.data[i]);
      }
      c0x.putImageData(id, 0, 0);
    } catch (e) { /* sin máscara */ }

    var s = Math.min(maxW / b.w, maxH / b.h, 1);
    var w = Math.max(1, Math.round(b.w * s));
    var h = Math.max(1, Math.round(b.h * s));

    var out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    var ox = out.getContext('2d');

    // damero de transparencia
    var sq = 10;
    for (var yy = 0; yy < h; yy += sq) {
      for (var xx = 0; xx < w; xx += sq) {
        ox.fillStyle = ((xx / sq + yy / sq) % 2 === 0) ? '#efe9dd' : '#e0d7c6';
        ox.fillRect(xx, yy, sq, sq);
      }
    }
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(c0, 0, 0, w, h);

    return out;
  }

  function buildSheet() {
    if (!S.palette.length) return null;

    var selText = '';
    if (S.selCount) {
      var p = (S.selCount / (S.W * S.H)) * 100;
      selText = T('sheet.ofImage', { p: fmtPct1(p) });
    }

    var thumb = buildThumb(520, 360);
    var crop = buildCrop(560, 400);

    // solo las armonías marcadas; la paleta y los básicos van siempre
    var schemes = S.schemes.filter(function (sc) { return sc.on; });

    return Sheet.render({
      title: S.fileName.replace(/\.[^.]+$/, '') || 'Paleta',
      fileName: S.fileName,
      dateText: dateText(),
      selText: selText,
      thumb: thumb,
      crop: crop,
      palette: S.palette,
      base: S.base,
      schemes: schemes,
      basics: S.basics,
      pixelsText: fmtNum(S.selCount),
      footerRight: T('sheet.meta', { w: S.W, h: S.H, n: S.palette.length })
    });
  }

  /* ============================================================
     Recorte PNG con fondo transparente
     ============================================================ */
  function maskBoundsExact() {
    if (!S.W) return null;
    var d = S.mctx.getImageData(0, 0, S.W, S.H).data;
    var x0 = S.W, y0 = S.H, x1 = -1, y1 = -1;
    for (var y = 0; y < S.H; y++) {
      var row = y * S.W * 4;
      for (var x = 0; x < S.W; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function buildCutout() {
    if (!S.selCount) return null;
    var b = maskBoundsExact();
    if (!b || b.w < 1 || b.h < 1) return null;

    var scale = (S.img && S.img.naturalWidth) ? (S.img.naturalWidth / S.W) : 1;
    var maxSide = 4096;
    var outW = Math.max(1, Math.round(b.w * scale));
    var outH = Math.max(1, Math.round(b.h * scale));
    if (outW > maxSide || outH > maxSide) {
      var k = Math.min(maxSide / outW, maxSide / outH);
      outW = Math.max(1, Math.round(outW * k));
      outH = Math.max(1, Math.round(outH * k));
    }

    var c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    if (S.img) {
      ctx.drawImage(S.img, b.x * scale, b.y * scale, b.w * scale, b.h * scale, 0, 0, outW, outH);
    } else {
      ctx.drawImage(S.work, b.x, b.y, b.w, b.h, 0, 0, outW, outH);
    }

    var m = document.createElement('canvas');
    m.width = outW;
    m.height = outH;
    var mx = m.getContext('2d');
    mx.imageSmoothingEnabled = true;
    mx.imageSmoothingQuality = 'high';
    mx.drawImage(S.mask, b.x, b.y, b.w, b.h, 0, 0, outW, outH);

    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    return c;
  }

  function downloadCutout() {
    if (!S.selCount) {
      toast(T('toast.selectFirst'));
      return;
    }
    busy(true);
    requestAnimationFrame(function () {
      setTimeout(function () {
        try {
          var c = buildCutout();
          if (!c) {
            busy(false);
            toast(T('toast.cutoutEmpty'));
            return;
          }
          c.toBlob(function (blob) {
            busy(false);
            if (!blob) { toast(T('toast.cutoutError')); return; }
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'recorte-' + slugify(S.fileName) + '-' + stamp() + '.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
            toast(T('toast.cutoutDone', { w: c.width, h: c.height }));
          }, 'image/png');
        } catch (err) {
          console.error(err);
          busy(false);
          toast(T('toast.cutoutError'));
        }
      }, 30);
    });
  }
  function exportSheet() {
    if (!S.palette.length) {
      toast(T('toast.extractFirst'));
      return;
    }
    busy(true);
    requestAnimationFrame(function () {
      setTimeout(function () {
        try {
          var sheet = buildSheet();
          if (!sheet) throw new Error('sheet');

          sheet.toBlob(function (blob) {
            busy(false);
            if (!blob) { toast(T('toast.sheetError')); return; }
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'hoja-estilos-' + slugify(S.fileName) + '-' + stamp() + '.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
            toast(T('toast.sheetDone', { w: sheet.width, h: sheet.height }));
          }, 'image/png');
        } catch (err) {
          console.error(err);
          busy(false);
          toast(T('toast.sheetFail'));
        }
      }, 30);
    });
  }

  /* ============================================================
     Eventos
     ============================================================ */
  function bindEvents() {
    el.btnBrand.addEventListener('click', function () { showView('home', true); });
    el.btnMenu.addEventListener('click', function () { showView('home', true); });
    el.homeCards.addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-go]');
      if (card) showView(card.getAttribute('data-go'), true);
    });
    el.gRandom.addEventListener('click', function () { if (window.Gamma) window.Gamma.random(); });
    el.gExportTop.addEventListener('click', function () { if (window.Gamma) window.Gamma.exportPng(); });
    window.addEventListener('hashchange', function () {
      var h = location.hash.replace(/^#\/?/, '');
      showView(h === 'gamma' ? 'gamma' : (h === 'espectro' ? 'espectro' : 'home'), false);
    });
    el.btnOpen.addEventListener('click', openFileDialog);
    el.btnEmptyPick.addEventListener('click', openFileDialog);
    el.fileCard.addEventListener('click', openFileDialog);
    el.btnDemo.addEventListener('click', loadDemo);

    el.fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) loadBlob(this.files[0]);
    });

    el.toolList.addEventListener('click', function (e) {
      var b = e.target.closest('.tool');
      if (b && !b.disabled) setTool(b.getAttribute('data-tool'));
    });

    el.modeGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setMode(b.getAttribute('data-mode'));
    });

    el.brushSize.addEventListener('input', function () {
      S.brush = parseInt(this.value, 10);
      syncBrushFill();
      invalidate();
    });

    el.wandTol.addEventListener('input', function () {
      S.wandTol = parseInt(this.value, 10);
      el.wandTolVal.textContent = S.wandTol;
      syncRangeFill(el.wandTol);
      scheduleWandRetune();
    });

    el.wandContig.addEventListener('change', function () {
      S.wandContig = this.checked;
      scheduleWandRetune();
    });

    el.langSelect.addEventListener('change', function () {
      if (window.I18N) window.I18N.setLang(this.value);
    });
    document.addEventListener('i18n:change', function () {
      refreshLocalized();
    });

    el.btnUndo.addEventListener('click', undo);
    el.btnRedo.addEventListener('click', redo);
    el.btnInvert.addEventListener('click', invertSelection);
    el.btnAll.addEventListener('click', selectAll);
    el.btnClear.addEventListener('click', function () { clearSelection(); });

    el.kDown.addEventListener('click', function () {
      setK(S.k - 1);
      extractNow({ silent: false });
    });
    el.kUp.addEventListener('click', function () {
      setK(S.k + 1);
      extractNow({ silent: false });
    });

    el.sortSelect.addEventListener('change', function () {
      S.sortMode = this.value;
      if (S.palette.length) {
        S.palette = PE.sort(S.palette, S.sortMode);
        renderPalette();
      }
    });

    el.chkAuto.addEventListener('change', function () {
      S.auto = this.checked;
      if (S.auto && S.selCount) scheduleExtract(120);
    });

    el.btnExtract.addEventListener('click', function () { extractNow({ silent: false }); });
    el.btnExport.addEventListener('click', exportSheet);
    el.btnCutout.addEventListener('click', downloadCutout);

    el.zoomIn.addEventListener('click', function () { zoomCenter(1.3); });
    el.zoomOut.addEventListener('click', function () { zoomCenter(1 / 1.3); });
    el.zoomFit.addEventListener('click', fitView);
    el.zoomOne.addEventListener('click', actualSize);
    el.zoomLevel.addEventListener('click', fitView);

    el.paletteList.addEventListener('click', function (e) {
      var b = e.target.closest('.swatch');
      if (!b) return;
      var hex = b.getAttribute('data-hex');
      var found = null;
      for (var i = 0; i < S.palette.length; i++) {
        if (S.palette[i].hex === hex) { found = S.palette[i]; break; }
      }
      if (!found) return;
      S.base = found;
      buildDerived();
      renderPalette();
      renderSchemes();
      updateExportState();
    });

    el.paletteList.addEventListener('dblclick', function (e) {
      var b = e.target.closest('.swatch');
      if (!b) return;
      var hex = b.getAttribute('data-hex');
      PC.copyText(hex).then(function () { toast(T('toast.copied', { hex: hex.toUpperCase() })); });
    });

    el.schemeList.addEventListener('click', function (e) {
      var b = e.target.closest('.scheme-chip');
      if (!b) return;
      var hex = b.getAttribute('data-hex');
      PC.copyText(hex).then(function () { toast(T('toast.copied', { hex: hex.toUpperCase() })); });
    });

    // lienzo
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', function () {
      S.cursor = null;
      invalidate();
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // drag & drop
    ['dragenter', 'dragover'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (!e.dataTransfer) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.dropZone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (ev === 'dragleave' && e.relatedTarget) return;
        el.dropZone.classList.remove('is-over');
      });
    });
    window.addEventListener('drop', function (e) {
      if (currentView !== 'espectro') return;
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        loadBlob(f);
      } else if (e.dataTransfer && e.dataTransfer.getData) {
        var txt = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (txt && /^https?:\/\//.test(txt.trim())) {
          toast(T('toast.webImage'));
        }
      }
    });

    // portapapeles
    window.addEventListener('paste', function (e) {
      if (currentView !== 'espectro') return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); loadBlob(f); return; }
        }
      }
    });

    // teclado
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ayuda
    el.btnHelp.addEventListener('click', function () { el.helpModal.hidden = false; });
    el.btnCloseHelp.addEventListener('click', function () { el.helpModal.hidden = true; });
    el.helpModal.addEventListener('click', function (e) {
      if (e.target === el.helpModal) el.helpModal.hidden = true;
    });
  }

  /** Solo los campos donde se escribe texto bloquean los atajos. */
  function isTextInput(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    var tag = (t.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag !== 'input') return false;
    var type = (t.type || 'text').toLowerCase();
    return ['text', 'search', 'url', 'tel', 'email', 'password', 'number',
      'date', 'datetime-local', 'month', 'week', 'time'].indexOf(type) !== -1;
  }

  /** Controles de formulario que no deben capturar las teclas de una sola letra. */
  function isFormControl(t) {
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button';
  }

  function onKeyDown(e) {
    var typing = isTextInput(e.target);
    var form = isFormControl(e.target);

    if (e.key === 'Escape') {
      if (!el.helpModal.hidden) { el.helpModal.hidden = true; return; }
      if (S.drag) { cancelInteraction(); return; }
      if (currentView !== 'home') { showView('home', true); return; }
      return;
    }

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      if (!typing) { el.helpModal.hidden = !el.helpModal.hidden; e.preventDefault(); }
      return;
    }

    if (typing) return;

    var mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (currentView === 'gamma' && window.Gamma) window.Gamma.exportPng();
      else if (currentView === 'espectro') exportSheet();
      return;
    }

    if (currentView !== 'espectro') return;

    // Deshacer / rehacer funcionan siempre, aunque el foco esté en un control
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFileDialog(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); extractNow({ silent: false }); return; }
    if (mod) return;

    // el resto de atajos no deben pisar el uso normal de un control
    if (form) return;

    if (e.code === 'Space') {
      S.space = true;
      canvas.classList.add('is-pan');
      e.preventDefault();
      return;
    }

    if (e.key === '[' || e.key === ']') {
      S.brush = clamp(S.brush + (e.key === ']' ? 6 : -6), 4, 180);
      el.brushSize.value = S.brush;
      syncBrushFill();
      invalidate();
      e.preventDefault();
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'r': setTool('rect'); break;
      case 'l': setTool('lasso'); break;
      case 'w': setTool('wand'); break;
      case 'b': setTool('brush'); break;
      case 'e': setTool('eraser'); break;
      case 'i': setTool('picker'); break;
      case '0': fitView(); break;
      case '1': actualSize(); break;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (S.ops.length) clearSelection();
    }

    if (e.key === '+' || e.key === '=') { zoomCenter(1.3); e.preventDefault(); }
    if (e.key === '-' || e.key === '_') { zoomCenter(1 / 1.3); e.preventDefault(); }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      S.space = false;
      canvas.classList.remove('is-pan');
    }
  }

  /* ============================================================
     Idioma
     ============================================================ */
  function refreshLocalized() {
    if (window.I18N) el.langSelect.value = window.I18N.lang;

    S.palette.forEach(function (c) { PC.localize(c); });
    buildDerived();
    renderAll();
    if (window.Gamma) window.Gamma.onLangChange();

    syncBrushFill();
    setK(S.k);
    el.sortSelect.value = S.sortMode;
    el.chkAuto.checked = S.auto;
  }

  /* ============================================================
     Arranque
     ============================================================ */
  function init() {
    cacheElements();

    if (window.I18N) {
      window.I18N.init();
      el.langSelect.value = window.I18N.lang;
    }

    setupCanvas();
    bindEvents();

    setTool('rect');
    setMode('add');
    setK(6);
    S.auto = el.chkAuto.checked;
    syncBrushFill();
    renderAll();
    syncControls();
    updateFileInfo();

    if (window.Gamma) window.Gamma.init();
    window.App = { toast: toast, showView: showView };

    var initial = location.hash.replace(/^#\/?/, '');
    showView(initial === 'gamma' ? 'gamma' : (initial === 'espectro' ? 'espectro' : 'home'), false);

    // API de automatización / depuración
    window.Paleteador = {
      state: S,
      load: function (dataUrl, name) {
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { setImage(img, name || T('file.image'), 0); resolve(true); };
          img.onerror = reject;
          img.src = dataUrl;
        });
      },
      rect: function (x, y, w, h, mode) {
        applyRectOp(x, y, w, h, mode || 'add');
        return true;
      },
      lasso: function (pts, mode) {
        if (!hasImage() || !pts || pts.length < 3) return false;
        pushOp({ type: 'lasso', pts: pts, mode: mode || 'add' });
        return true;
      },
      wand: function (x, y, tol, contiguous, mode) {
        if (!hasImage()) return false;
        var op = {
          type: 'wand', x: x, y: y,
          tol: tol == null ? S.wandTol : tol,
          contiguous: contiguous !== false,
          mode: mode || 'add'
        };
        var ok = applyWand(op);
        if (ok) {
          S.wandSeed = { x: op.x, y: op.y };
          S.ops.push(op);
          S.redo.length = 0;
          maskVersion++;
          lastOverlayKey = '';
          commitMask();
        }
        return ok;
      },
      extract: function () { extractNow({ silent: false }); },
      setK: function (k) { setK(k); },
      cutout: function () { return buildCutout(); },
      sheet: function () { return buildSheet(); },
      export: function () { exportSheet(); },
      setLang: function (l) { if (window.I18N) window.I18N.setLang(l); },
      tools: { setTool: setTool, setMode: setMode, fit: fitView }
    };
  }

  /** Aplica un rectángulo de selección (usado por la demo y la API). */
  function applyRectOp(x, y, w, h, mode) {
    if (!hasImage()) return;
    x = clamp(x, 0, S.W);
    y = clamp(y, 0, S.H);
    w = clamp(w, 1, S.W - x);
    h = clamp(h, 1, S.H - y);
    pushOp({ type: 'rect', x: x, y: y, w: w, h: h, mode: mode || 'add' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
