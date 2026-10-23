/* ============================================================
   palette.js — extracción de paleta (k-means en OKLab)
   Sin dependencias. Se expone como window.PaletteEngine
   ============================================================ */
(function (global) {
  'use strict';

  var PC = global.PC;

  /* ---------- generador pseudoaleatorio determinista ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- k-means++ ---------- */
  function initCenters(lab, n, k, rnd) {
    var k3 = k * 3;
    var centers = new Float32Array(k3);
    var first = Math.floor(rnd() * n);
    centers[0] = lab[first * 3];
    centers[1] = lab[first * 3 + 1];
    centers[2] = lab[first * 3 + 2];

    var dist = new Float32Array(n);
    for (var i = 0; i < n; i++) dist[i] = Infinity;

    for (var c = 1; c < k; c++) {
      var sum = 0;
      var lc = centers[(c - 1) * 3], ac = centers[(c - 1) * 3 + 1], bc = centers[(c - 1) * 3 + 2];
      for (var j = 0; j < n; j++) {
        var dl = lab[j * 3] - lc, da = lab[j * 3 + 1] - ac, db = lab[j * 3 + 2] - bc;
        var d = dl * dl + da * da + db * db;
        if (d < dist[j]) dist[j] = d;
        sum += dist[j];
      }
      var target = rnd() * sum;
      var idx = 0;
      while (idx < n - 1 && target > 0) {
        target -= dist[idx];
        idx++;
      }
      centers[c * 3] = lab[idx * 3];
      centers[c * 3 + 1] = lab[idx * 3 + 1];
      centers[c * 3 + 2] = lab[idx * 3 + 2];
    }
    return centers;
  }

  function nearest(lab, i, centers, k) {
    var l = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
    var best = 0, bestD = Infinity;
    for (var c = 0; c < k; c++) {
      var dl = l - centers[c * 3];
      var da = a - centers[c * 3 + 1];
      var db = b - centers[c * 3 + 2];
      var d = dl * dl + da * da + db * db;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /**
   * Agrupa una lista de colores en k grupos perceptualmente.
   * @param {Float32Array} lab  muestras [L,a,b,...]
   * @param {Uint8ClampedArray} rgb  muestras [r,g,b,...]
   * @param {number} n
   * @param {number} k
   */
  function kmeans(lab, rgb, n, k, iterations) {
    k = Math.max(1, Math.min(k, n));
    var rnd = mulberry32(20240517);
    var centers = initCenters(lab, n, k, rnd);
    var assign = new Int32Array(n);
    var counts = new Int32Array(k);
    var iters = iterations || 24;
    var shift = 0;

    for (var it = 0; it < iters; it++) {
      var changed = 0;
      counts.fill(0);
      for (var i = 0; i < n; i++) {
        var c = nearest(lab, i, centers, k);
        if (assign[i] !== c) { assign[i] = c; changed++; }
        counts[c]++;
      }
      if (changed === 0 && it > 0) break;

      var sums = new Float32Array(k * 3);
      for (var j = 0; j < n; j++) {
        var cj = assign[j];
        sums[cj * 3] += lab[j * 3];
        sums[cj * 3 + 1] += lab[j * 3 + 1];
        sums[cj * 3 + 2] += lab[j * 3 + 2];
      }

      shift = 0;
      for (var m = 0; m < k; m++) {
        if (counts[m] === 0) continue;
        var nl = sums[m * 3] / counts[m];
        var na = sums[m * 3 + 1] / counts[m];
        var nb = sums[m * 3 + 2] / counts[m];
        var dl = nl - centers[m * 3];
        var da = na - centers[m * 3 + 1];
        var db = nb - centers[m * 3 + 2];
        shift = Math.max(shift, Math.sqrt(dl * dl + da * da + db * db));
        centers[m * 3] = nl;
        centers[m * 3 + 1] = na;
        centers[m * 3 + 2] = nb;
      }
      if (shift < 8e-4) break;
    }

    // último reparto con los centros definitivos
    counts.fill(0);
    for (var p = 0; p < n; p++) {
      assign[p] = nearest(lab, p, centers, k);
      counts[assign[p]]++;
    }

    // color medio real (en sRGB) de cada grupo
    var sumR = new Float64Array(k), sumG = new Float64Array(k), sumB = new Float64Array(k);
    for (var q = 0; q < n; q++) {
      var cq = assign[q];
      sumR[cq] += rgb[q * 3];
      sumG[cq] += rgb[q * 3 + 1];
      sumB[cq] += rgb[q * 3 + 2];
    }

    var groups = [];
    for (var g = 0; g < k; g++) {
      if (!counts[g]) continue;
      groups.push({
        r: sumR[g] / counts[g],
        g: sumG[g] / counts[g],
        b: sumB[g] / counts[g],
        count: counts[g],
        L: centers[g * 3],
        a: centers[g * 3 + 1],
        bLab: centers[g * 3 + 2]
      });
    }

    return mergeClose(groups, n);
  }

  /** Une grupos casi idénticos para no repetir colores */
  function mergeClose(groups, total) {
    var merged = [];
    groups.sort(function (x, y) { return y.count - x.count; });

    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var target = null;
      for (var j = 0; j < merged.length; j++) {
        var m = merged[j];
        var dl = g.L - m.L, da = g.a - m.a, db = g.bLab - m.bLab;
        if (Math.sqrt(dl * dl + da * da + db * db) < 0.022) { target = m; break; }
      }
      if (target) {
        var w1 = target.count, w2 = g.count, w = w1 + w2;
        target.r = (target.r * w1 + g.r * w2) / w;
        target.g = (target.g * w1 + g.g * w2) / w;
        target.b = (target.b * w1 + g.b * w2) / w;
        target.L = (target.L * w1 + g.L * w2) / w;
        target.a = (target.a * w1 + g.a * w2) / w;
        target.bLab = (target.bLab * w1 + g.bLab * w2) / w;
        target.count = w;
      } else {
        merged.push({
          r: g.r, g: g.g, b: g.b, count: g.count,
          L: g.L, a: g.a, bLab: g.bLab
        });
      }
    }

    merged.forEach(function (m) {
      m.r = Math.round(m.r);
      m.g = Math.round(m.g);
      m.b = Math.round(m.b);
      m.coverage = m.count / total;
    });
    return merged;
  }

  /**
   * Extrae la paleta de la zona seleccionada.
   * @param {Object} o
   * @param {number} o.width
   * @param {number} o.height
   * @param {Uint8ClampedArray} o.pixels   RGBA de la imagen de trabajo
   * @param {Uint8ClampedArray} o.mask     RGBA de la máscara (usa alfa)
   * @param {number} o.k
   * @param {Object} o.bbox                {x,y,w,h} de la selección
   * @param {number} [o.maxSamples=90000]
   */
  function extract(o) {
    var w = o.width, h = o.height;
    var px = o.pixels, mk = o.mask;
    var k = Math.max(1, Math.round(o.k || 6));
    var maxSamples = o.maxSamples || 90000;
    var box = o.bbox || { x: 0, y: 0, w: w, h: h };

    // 1) tamaño de paso para no pasar del máximo de muestras
    var boxArea = Math.max(1, box.w * box.h);
    var step = Math.max(1, Math.floor(Math.sqrt(boxArea / maxSamples)));

    var cap = maxSamples * 6;
    var tmpRgb = new Uint8ClampedArray(cap * 3);
    var tmpLab = new Float32Array(cap * 3);
    var n = 0;

    for (var y = box.y; y < box.y + box.h; y += step) {
      var row = y * w;
      for (var x = box.x; x < box.x + box.w; x += step) {
        var i = (row + x) * 4;
        if (mk[i + 3] < 128) continue;       // fuera de la selección
        if (px[i + 3] < 200) continue;       // píxel transparente de la imagen
        if (n >= cap) break;
        var r = px[i], g = px[i + 1], b = px[i + 2];
        tmpRgb[n * 3] = r; tmpRgb[n * 3 + 1] = g; tmpRgb[n * 3 + 2] = b;
        var lab = PC.rgbToOklab(r, g, b);
        tmpLab[n * 3] = lab.L; tmpLab[n * 3 + 1] = lab.a; tmpLab[n * 3 + 2] = lab.b;
        n++;
      }
      if (n >= cap) break;
    }

    if (n === 0) return { colors: [], sampled: 0 };

    var groups = kmeans(tmpLab, tmpRgb, n, Math.min(k, n));

    var colors = groups.map(function (g) {
      var e = PC.entryFromRgb({ r: g.r, g: g.g, b: g.b });
      e.coverage = g.coverage;
      e.count = g.count;
      return e;
    });

    return { colors: colors, sampled: n, step: step };
  }

  /* ---------------- orden ---------------- */
  function sort(colors, mode) {
    var list = colors.slice();

    if (mode === 'hue') {
      list.sort(function (a, b) {
        var aNeutral = a.hsl.s < 0.1, bNeutral = b.hsl.s < 0.1;
        if (aNeutral !== bNeutral) return aNeutral ? 1 : -1;
        if (aNeutral) return b.hsl.l - a.hsl.l;
        var aa = a.artistAngle, bb = b.artistAngle;
        return aa - bb;
      });
    } else if (mode === 'light') {
      list.sort(function (a, b) { return b.hsl.l - a.hsl.l; });
    } else if (mode === 'sat') {
      list.sort(function (a, b) { return b.hsl.s - a.hsl.s || b.coverage - a.coverage; });
    } else {
      list.sort(function (a, b) { return b.coverage - a.coverage; });
    }
    return list;
  }

  /* ---------------- familias básicas presentes ---------------- */
  function basics(colors) {
    var map = Object.create(null);
    colors.forEach(function (c) {
      var f = c.family || PC.basicFamily(c.hsl.h, c.hsl.s, c.hsl.l);
      if (!map[f.key]) {
        map[f.key] = { key: f.key, name: f.name, coverage: 0, best: c, count: 0 };
      }
      var g = map[f.key];
      g.coverage += c.coverage;
      g.count += 1;
      if (c.coverage > g.best.coverage) g.best = c;
    });

    var list = Object.keys(map).map(function (key) {
      var g = map[key];
      g.hex = g.best.hex;
      g.rgb = { r: g.best.r, g: g.best.g, b: g.best.b };
      return g;
    });

    return list.sort(function (a, b) { return b.coverage - a.coverage; });
  }

  /* ---------------- exportaciones de texto ---------------- */
  function toCss(colors) {
    var lines = [':root {'];
    colors.forEach(function (c, i) {
      lines.push('  --color-' + (i + 1) + ': ' + c.hex + '; /* ' + c.name + ' · ' + Math.round(c.coverage * 100) + '% */');
    });
    lines.push('}');
    return lines.join('\n');
  }

  function toJson(data) {
    return JSON.stringify(data, null, 2);
  }

  global.PaletteEngine = {
    extract: extract,
    sort: sort,
    basics: basics,
    toCss: toCss,
    toJson: toJson
  };
})(window);
