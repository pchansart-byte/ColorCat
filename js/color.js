/* ============================================================
   color.js — matemática de color y rueda artística de 12 tonos
   Sin dependencias. Se expone como window.PC
   Los nombres se localizan con window.I18N (español por defecto).
   ============================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function normHue(h) {
    h = h % 360;
    return h < 0 ? h + 360 : h;
  }

  function t(key, vars) {
    if (global.I18N) return global.I18N.t(key, vars);
    return key;
  }

  function lang() {
    return (global.I18N && global.I18N.lang) || 'es';
  }

  function cap(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  /* ---------------- sRGB <-> HEX ---------------- */
  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    var m = hex.trim().replace(/^#/, '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
    var n = parseInt(m, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    function p(v) {
      v = clamp(Math.round(v), 0, 255).toString(16);
      return v.length === 1 ? '0' + v : v;
    }
    return '#' + p(r) + p(g) + p(b);
  }

  /* ---------------- sRGB <-> HSL ---------------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0, d = max - min;

    if (d > 1e-6) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, l: l };
  }

  function hue2rgb(p, q, x) {
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  }

  function hslToRgb(h, s, l) {
    h = normHue(h) / 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    if (s < 1e-6) {
      var v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    };
  }

  /* ---------------- sRGB <-> HSV ---------------- */
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d > 1e-6) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  function hsvToRgb(h, s, v) {
    h = normHue(h) / 60;
    s = clamp(s, 0, 1);
    v = clamp(v, 0, 1);
    var c = v * s;
    var x = c * (1 - Math.abs((h % 2) - 1));
    var m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 1) { r = c; g = x; }
    else if (h < 2) { r = x; g = c; }
    else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; }
    else if (h < 5) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  /* ---------------- sRGB <-> CMYK ---------------- */
  function rgbToCmyk(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
    var d = 1 - k;
    return {
      c: (1 - r - k) / d,
      m: (1 - g - k) / d,
      y: (1 - b - k) / d,
      k: k
    };
  }

  /* ---------------- sRGB -> CIE Lab (D65) ---------------- */
  function rgbToLab(r, g, b) {
    var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);

    var x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    var y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / 1.00000;
    var z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;

    function f(t) {
      return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    }
    var fx = f(x), fy = f(y), fz = f(z);

    return {
      L: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  /* ---------------- contraste y daltonismo ---------------- */
  function contrastRatio(rgb1, rgb2) {
    var l1 = relativeLuminance(rgb1);
    var l2 = relativeLuminance(rgb2);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  var BLIND_MATRICES = {
    protan: [[0.567, 0.433, 0.000], [0.558, 0.442, 0.000], [0.000, 0.242, 0.758]],
    deutan: [[0.625, 0.375, 0.000], [0.700, 0.300, 0.000], [0.000, 0.300, 0.700]],
    tritan: [[0.950, 0.050, 0.000], [0.000, 0.433, 0.567], [0.000, 0.475, 0.525]]
  };

  function simulateBlindness(rgb, type) {
    var m = BLIND_MATRICES[type];
    if (!m) return { r: rgb.r, g: rgb.g, b: rgb.b };
    var r = m[0][0] * rgb.r + m[0][1] * rgb.g + m[0][2] * rgb.b;
    var g = m[1][0] * rgb.r + m[1][1] * rgb.g + m[1][2] * rgb.b;
    var b = m[2][0] * rgb.r + m[2][1] * rgb.g + m[2][2] * rgb.b;
    return {
      r: clamp(Math.round(r), 0, 255),
      g: clamp(Math.round(g), 0, 255),
      b: clamp(Math.round(b), 0, 255)
    };
  }
  /* ---------------- sRGB <-> OKLab ---------------- */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    var v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clamp(Math.round(v * 255), 0, 255);
  }

  function rgbToOklab(r, g, b) {
    var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);

    var l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
    var m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
    var s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;

    var l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);

    return {
      L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
  }

  function oklabToRgb(L, a, b) {
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;

    return {
      r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    };
  }

  function oklchFromRgb(r, g, b) {
    var o = rgbToOklab(r, g, b);
    return {
      L: o.L,
      C: Math.sqrt(o.a * o.a + o.b * o.b),
      h: normHue(Math.atan2(o.b, o.a) * 180 / Math.PI)
    };
  }

  /* ============================================================
     Rueda artística (modelo RYB)
     Cada parada mapea un ángulo artístico (0–360) al tono HSL que
     mejor lo representa en pantalla, de modo que el complementario
     de un rojo sea un verde y el de un amarillo un violeta.
     ============================================================ */
  var ARTIST_STOPS = [
    { a: 0, h: 0 },
    { a: 30, h: 15 },
    { a: 60, h: 32 },
    { a: 90, h: 45 },
    { a: 120, h: 55 },
    { a: 150, h: 90 },
    { a: 180, h: 125 },
    { a: 210, h: 175 },
    { a: 240, h: 225 },
    { a: 270, h: 255 },
    { a: 300, h: 285 },
    { a: 330, h: 325 }
  ];

  /** Ángulo artístico (0–360) -> tono HSL (0–360) */
  function hueFromArtist(angle) {
    var a = normHue(angle);
    for (var i = 0; i < ARTIST_STOPS.length; i++) {
      var p = ARTIST_STOPS[i];
      var n = ARTIST_STOPS[i + 1] || { a: 360, h: 360 };
      if (a >= p.a && a <= n.a) {
        var tt = n.a === p.a ? 0 : (a - p.a) / (n.a - p.a);
        return normHue(lerp(p.h, n.h, tt));
      }
    }
    return normHue(a);
  }

  /** Tono HSL (0–360) -> ángulo artístico (0–360) */
  function artistFromHue(hue) {
    var h = normHue(hue);
    for (var i = 0; i < ARTIST_STOPS.length; i++) {
      var p = ARTIST_STOPS[i];
      var n = ARTIST_STOPS[i + 1] || { a: 360, h: 360 };
      if (h >= p.h && h <= n.h) {
        var tt = n.h === p.h ? 0 : (h - p.h) / (n.h - p.h);
        return normHue(lerp(p.a, n.a, tt));
      }
    }
    return normHue(h);
  }

  /* ============================================================
     Familias básicas de color
     ============================================================ */
  var FAMILIES = [
    { key: 'rojo', a: 0 },
    { key: 'naranja', a: 60 },
    { key: 'amarillo', a: 120 },
    { key: 'verde', a: 180 },
    { key: 'turquesa', a: 210 },
    { key: 'azul', a: 240 },
    { key: 'violeta', a: 285 },
    { key: 'magenta', a: 330 }
  ];

  function basicFamily(h, s, l) {
    var angle = typeof h === 'number' ? artistFromHue(h) : 0;
    var key = 'rojo';

    if (l > 0.945 && s < 0.2) key = 'blanco';
    else if (l < 0.065) key = 'negro';
    else if (s < 0.085) key = 'gris';
    else if (l < 0.36 && angle > 8 && angle < 58 && s < 0.85) key = 'marron';
    else {
      var best = FAMILIES[0], bestD = 999;
      for (var i = 0; i < FAMILIES.length; i++) {
        var d = Math.abs(normHue(angle - FAMILIES[i].a) + 540) % 360 - 180;
        d = Math.abs(d);
        if (d < bestD) { bestD = d; best = FAMILIES[i]; }
      }
      key = best.key;
    }
    return { key: key, name: t('fam.' + key) };
  }

  /* ============================================================
     Nombres descriptivos
     ============================================================ */
  function describe(hsl) {
    var fam = basicFamily(hsl.h, hsl.s, hsl.l);
    var en = lang() === 'en';

    if (fam.key === 'blanco' || fam.key === 'negro') return t('fam.' + fam.key);

    var toneIdx = hsl.l < 0.12 ? 0 : hsl.l < 0.24 ? 1 : hsl.l < 0.36 ? 2 :
      hsl.l < 0.5 ? 3 : hsl.l < 0.64 ? 4 : hsl.l < 0.78 ? 5 : hsl.l < 0.9 ? 6 : 7;
    var satIdx = hsl.s < 0.12 ? 0 : hsl.s < 0.3 ? 1 : hsl.s < 0.55 ? 2 : hsl.s < 0.78 ? 3 : 4;

    if (fam.key === 'gris') {
      var lvl = toneIdx <= 2 ? 'dark' : (toneIdx >= 6 ? 'light' : 'mid');
      return en
        ? cap(t('gris.' + lvl) + ' ' + t('fam.gris'))
        : t('fam.gris') + ' ' + t('gris.' + lvl);
    }

    if (fam.key === 'marron') {
      return en
        ? cap((toneIdx <= 1 ? t('tone.' + toneIdx) + ' ' : '') + t('fam.marron'))
        : t('fam.marron') + (toneIdx <= 1 ? ' ' + t('gris.dark') : '');
    }

    var angle = artistFromHue(hsl.h);
    if (hsl.l > 0.8 && hsl.s < 0.42 && angle > 25 && angle < 110) return t('fam.crema');

    if (en) {
      var parts = [];
      if (toneIdx <= 3 || toneIdx >= 6) parts.push(t('tone.' + toneIdx));
      if (satIdx === 0 || satIdx === 1 || satIdx >= 3) parts.push(t('sat.' + satIdx));
      parts.push(t('fam.' + fam.key).toLowerCase());
      return cap(parts.join(' '));
    }

    var name = t('fam.' + fam.key);
    if (satIdx === 1 || satIdx >= 3) name += ' ' + t('sat.' + satIdx);
    if (toneIdx === 0) name += ' ' + t('tone.1');
    else if (toneIdx <= 2) name += ' ' + t('gris.dark');
    else if (toneIdx >= 6) name += ' ' + t('gris.light');
    return name;
  }

  /* ============================================================
     Formato de códigos
     ============================================================ */
  function fmtRgb(rgb) {
    return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
  }

  function fmtHsl(hsl) {
    return 'hsl(' + Math.round(hsl.h) + ', ' + Math.round(hsl.s * 100) + '%, ' + Math.round(hsl.l * 100) + '%)';
  }

  function fmtOklch(rgb) {
    var o = oklchFromRgb(rgb.r, rgb.g, rgb.b);
    return 'oklch(' + (o.L * 100).toFixed(1) + '% ' + o.C.toFixed(3) + ' ' + o.h.toFixed(1) + ')';
  }

  function relativeLuminance(rgb) {
    var r = srgbToLinear(rgb.r), g = srgbToLinear(rgb.g), b = srgbToLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastInk(rgb) {
    return relativeLuminance(rgb) > 0.42 ? '#17130c' : '#fdfbf6';
  }

  /* ============================================================
     Armonías
     ============================================================ */
  var HARMONY_S_MIN = 0.14;
  var HARMONY_L_MIN = 0.2;
  var HARMONY_L_MAX = 0.88;

  function shiftHue(hsl, deltaArtist) {
    var a = artistFromHue(hsl.h) + deltaArtist;
    var h = hueFromArtist(a);
    var s = clamp(hsl.s, HARMONY_S_MIN, 1);
    var l = clamp(hsl.l, HARMONY_L_MIN, HARMONY_L_MAX);
    var rgb = hslToRgb(h, s, l);
    return {
      rgb: rgb,
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      hsl: { h: h, s: s, l: l },
      artistAngle: normHue(a)
    };
  }

  /**
   * Giro directo en el tono HSL: se usa para los análogos, donde lo que
   * importa es que los colores queden perceptualmente contiguos.
   */
  function shiftHueHsl(hsl, delta) {
    var h = normHue(hsl.h + delta);
    var s = clamp(hsl.s, HARMONY_S_MIN, 1);
    var l = clamp(hsl.l, HARMONY_L_MIN, HARMONY_L_MAX);
    var rgb = hslToRgb(h, s, l);
    return {
      rgb: rgb,
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      hsl: { h: h, s: s, l: l },
      artistAngle: artistFromHue(h)
    };
  }

  var SCHEMES = [
    { id: 'complement', deltas: [0, 180] },
    { id: 'split', deltas: [0, 150, 210] },
    { id: 'analog', deltas: [-26, 0, 26], space: 'hsl' },
    { id: 'triad', deltas: [0, 120, 240] },
    { id: 'tetrad', deltas: [0, 90, 180, 270] },
    { id: 'tertiary', deltas: [-30, 30, 90, 150, 210, 270] }
  ];

  function schemeList(baseHsl) {
    var out = SCHEMES.map(function (def) {
      return {
        id: def.id,
        name: t('scheme.' + def.id),
        note: t('note.' + def.id),
        colors: def.deltas.map(function (delta) {
          var c = (def.space === 'hsl') ? shiftHueHsl(baseHsl, delta) : shiftHue(baseHsl, delta);
          c.isBase = delta === 0;
          c.delta = delta;
          return c;
        })
      };
    });

    // Escala monocromática
    var monoSteps = [0.9, 0.76, 0.62, baseHsl.l, 0.34, 0.2];
    var seen = {};
    var monoColors = [];
    monoSteps.forEach(function (l) {
      var key = Math.round(l * 100);
      if (seen[key]) return;
      seen[key] = 1;
      var rgb = hslToRgb(baseHsl.h, clamp(baseHsl.s, 0.12, 1), l);
      monoColors.push({
        rgb: rgb,
        hex: rgbToHex(rgb.r, rgb.g, rgb.b),
        hsl: { h: baseHsl.h, s: clamp(baseHsl.s, 0.12, 1), l: l },
        isBase: Math.abs(l - baseHsl.l) < 0.001
      });
    });
    monoColors.sort(function (a, b) { return b.hsl.l - a.hsl.l; });

    out.push({
      id: 'mono',
      name: t('scheme.mono'),
      note: t('note.mono'),
      colors: monoColors
    });
    return out;
  }

  /* ---------------- utilidades varias ---------------- */
  function entryFromRgb(rgb) {
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    return {
      r: rgb.r, g: rgb.g, b: rgb.b,
      hex: hex,
      hsl: hsl,
      oklch: oklchFromRgb(rgb.r, rgb.g, rgb.b),
      name: describe(hsl),
      family: basicFamily(hsl.h, hsl.s, hsl.l),
      ink: contrastInk(rgb),
      artistAngle: artistFromHue(hsl.h)
    };
  }

  /** Recalcula los textos de una entrada cuando cambia el idioma. */
  function localize(entry) {
    if (!entry || !entry.hsl) return entry;
    entry.name = describe(entry.hsl);
    entry.family = basicFamily(entry.hsl.h, entry.hsl.s, entry.hsl.l);
    return entry;
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  global.PC = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    normHue: normHue,
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
    rgbToCmyk: rgbToCmyk,
    rgbToLab: rgbToLab,
    contrastRatio: contrastRatio,
    simulateBlindness: simulateBlindness,
    rgbToOklab: rgbToOklab,
    oklabToRgb: oklabToRgb,
    oklchFromRgb: oklchFromRgb,
    hueFromArtist: hueFromArtist,
    artistFromHue: artistFromHue,
    basicFamily: basicFamily,
    describe: describe,
    fmtRgb: fmtRgb,
    fmtHsl: fmtHsl,
    fmtOklch: fmtOklch,
    relativeLuminance: relativeLuminance,
    contrastInk: contrastInk,
    schemeList: schemeList,
    shiftHue: shiftHue,
    shiftHueHsl: shiftHueHsl,
    entryFromRgb: entryFromRgb,
    localize: localize,
    copyText: copyText
  };
})(window);
