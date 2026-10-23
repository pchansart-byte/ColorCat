/* ============================================================
   export.js — hoja de estilos en PNG (canvas 2D)
   Sin dependencias. Se expone como window.Sheet
   Los textos se localizan con window.I18N.
   ============================================================ */
(function (global) {
  'use strict';

  var PC = global.PC;

  function T(key, vars) {
    return global.I18N ? global.I18N.t(key, vars) : key;
  }

  /* ---------- paleta de la hoja (papel) ---------- */
  var PAPER = '#F5F1E7';
  var INK   = '#191510';
  var INK2  = '#5B5347';
  var INK3  = '#8B8274';
  var RULE  = '#DCD3C1';
  var CARD  = '#FFFDF8';
  var ACCENT = '#A8502E';

  var SANS  = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif';
  var SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
  var MONO  = '"Cascadia Mono", "Consolas", "SF Mono", monospace';

  var W = 2000;
  var M = 100;
  var CW = W - M * 2;

  function font(weight, size, family) { return weight + ' ' + size + 'px ' + family; }


  function pct(v) {
    var p = v * 100;
    var txt;
    if (p >= 10) txt = String(Math.round(p));
    else if (p >= 1) txt = p.toFixed(1);
    else txt = p.toFixed(2);
    if (global.I18N && global.I18N.lang === 'en') return txt + '%';
    return txt.replace('.', ',') + '%';
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function tracked(ctx, text, x, y, spacing) {
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cx, y);
      cx += ctx.measureText(text[i]).width + spacing;
    }
    return cx - x;
  }

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function fitRect(srcW, srcH, boxW, boxH) {
    var s = Math.min(boxW / srcW, boxH / srcH);
    var w = srcW * s, h = srcH * s;
    return { w: w, h: h, x: (boxW - w) / 2, y: (boxH - h) / 2, s: s };
  }

  /* ---------- cabecera de sección ---------- */
  function section(ctx, y, numText, title, right) {
    ctx.textAlign = 'left';
    ctx.fillStyle = ACCENT;
    ctx.font = font(600, 12, MONO);
    ctx.fillText(numText, M, y);

    ctx.fillStyle = INK;
    ctx.font = font(600, 31, SERIF);
    ctx.fillText(title, M + 48, y + 1);

    if (right) {
      ctx.textAlign = 'right';
      ctx.fillStyle = INK3;
      ctx.font = font(400, 12.5, SANS);
      ctx.fillText(right, W - M, y);
      ctx.textAlign = 'left';
    }

    var ruleY = y + 25;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    line(ctx, M, ruleY, W - M, ruleY);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(M, ruleY - 1, 54, 2);

    return ruleY + 36;
  }

  /* ============================================================
     Miniaturas
     ============================================================ */
  function drawImageCard(ctx, img, x, y, w, h, caption) {
    ctx.textAlign = 'left';
    ctx.fillStyle = INK3;
    ctx.font = font(500, 10, SANS);
    tracked(ctx, caption.toUpperCase(), x, y - 10, 1.6);

    ctx.save();
    ctx.shadowColor = 'rgba(60,45,25,.14)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = CARD;
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    rr(ctx, x, y, w, h, 10);
    ctx.clip();
    ctx.fillStyle = '#E9E2D4';
    ctx.fillRect(x, y, w, h);
    if (img) {
      var f = fitRect(img.width, img.height, w, h);
      ctx.drawImage(img, x + f.x, y + f.y, f.w, f.h);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(25,21,16,.12)';
    ctx.lineWidth = 1;
    rr(ctx, x + .5, y + .5, w - 1, h - 1, 10);
    ctx.stroke();
  }

  /* ============================================================
     Barra de composición superior
     ============================================================ */
  function drawTopBar(ctx, palette) {
    var total = 0;
    palette.forEach(function (c) { total += c.coverage; });
    if (!total) total = 1;

    var widths = palette.map(function (c) { return Math.max(c.coverage / total, 0.02); });
    var sum = widths.reduce(function (a, b) { return a + b; }, 0);

    var x = 0;
    for (var i = 0; i < palette.length; i++) {
      var wSeg = (widths[i] / sum) * W;
      ctx.fillStyle = palette[i].hex;
      ctx.fillRect(x, 0, wSeg + 1, 10);
      x += wSeg;
    }
  }

  /* ============================================================
     Tarjeta de color grande
     ============================================================ */
  function drawSwatchCard(ctx, x, y, w, h, c, isBase) {
    var colorH = 200;

    ctx.save();
    ctx.shadowColor = 'rgba(60,45,25,.11)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = CARD;
    rr(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.restore();

    ctx.save();
    rr(ctx, x, y, w, h, 14);
    ctx.clip();
    ctx.fillStyle = c.hex;
    ctx.fillRect(x, y, w, colorH);
    var grad = ctx.createLinearGradient(0, y + colorH - 46, 0, y + colorH);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + colorH - 46, w, 46);
    ctx.restore();

    ctx.strokeStyle = 'rgba(25,21,16,.10)';
    ctx.lineWidth = 1;
    rr(ctx, x + .5, y + .5, w - 1, h - 1, 14);
    ctx.stroke();

    if (isBase) {
      ctx.fillStyle = 'rgba(255,253,248,.94)';
      rr(ctx, x + 16, y + 16, 58, 22, 4);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = font(700, 9, SANS);
      ctx.textAlign = 'center';
      tracked(ctx, 'BASE', x + 24, y + 31, 1.4);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = INK;
    ctx.font = font(600, 31, MONO);
    ctx.fillText(c.hex.toUpperCase(), x + 20, y + colorH + 44);

    ctx.textAlign = 'right';
    ctx.fillStyle = INK3;
    ctx.font = font(500, 14, MONO);
    ctx.fillText(pct(c.coverage), x + w - 20, y + colorH + 44);
    ctx.textAlign = 'left';

    ctx.fillStyle = INK2;
    ctx.font = font(500, 15.5, SANS);
    ctx.fillText(ellipsize(ctx, c.name || '', w - 40), x + 20, y + colorH + 74);

    ctx.fillStyle = INK3;
    ctx.font = font(400, 12, MONO);
    ctx.fillText(PC.fmtRgb(c), x + 20, y + colorH + 100);
    ctx.fillText(PC.fmtHsl(c.hsl), x + 20, y + colorH + 118);

    var barY = y + h - 20;
    var barW = w - 40;
    ctx.fillStyle = '#E7DFD0';
    rr(ctx, x + 20, barY, barW, 4, 2);
    ctx.fill();
    ctx.fillStyle = c.hex;
    rr(ctx, x + 20, barY, Math.max(3, barW * Math.min(1, c.coverage)), 4, 2);
    ctx.fill();
  }

  /* ============================================================
     Chip de familia básica
     ============================================================ */
  function drawBasicChip(ctx, x, y, w, h, b) {
    ctx.fillStyle = CARD;
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(25,21,16,.10)';
    ctx.lineWidth = 1;
    rr(ctx, x + .5, y + .5, w - 1, h - 1, 10);
    ctx.stroke();

    ctx.fillStyle = b.hex;
    ctx.beginPath();
    ctx.arc(x + 34, y + h / 2, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(25,21,16,.18)';
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = font(550, 14.5, SANS);
    ctx.fillText(ellipsize(ctx, b.name, w - 120), x + 62, y + h / 2 - 2);

    ctx.fillStyle = INK3;
    ctx.font = font(400, 11, MONO);
    ctx.fillText(b.hex.toUpperCase(), x + 62, y + h / 2 + 16);

    ctx.textAlign = 'right';
    ctx.fillStyle = INK3;
    ctx.font = font(400, 10.5, MONO);
    ctx.fillText(pct(b.coverage), x + w - 16, y + h / 2 + 4);
    ctx.textAlign = 'left';
  }

  /* ============================================================
     Chip pequeño de armonía
     ============================================================ */
  function drawHarmonyChip(ctx, x, y, w, h, c, isBase) {
    ctx.fillStyle = c.hex;
    rr(ctx, x, y, w, h, 10);
    ctx.fill();

    if (isBase) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      rr(ctx, x - 5, y - 5, w + 10, h + 10, 13);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(25,21,16,.12)';
      ctx.lineWidth = 1;
      rr(ctx, x + .5, y + .5, w - 1, h - 1, 10);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = INK3;
    ctx.font = font(500, 11, MONO);
    ctx.fillText(c.hex.toUpperCase(), x + w / 2, y + h + 18);
    ctx.textAlign = 'left';
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function render(data) {
    var palette = data.palette || [];
    var schemes = data.schemes || [];
    var basics = data.basics || [];
    var base = data.base || null;

    var canvas = document.createElement('canvas');
    var SCALE = 2;
    canvas.width = W * SCALE;
    canvas.height = 5600 * SCALE;
    var ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, canvas.height);
    drawTopBar(ctx, palette);

    var y = 96;

    /* ---------- marca ---------- */
    ctx.textAlign = 'left';
    ctx.fillStyle = INK3;
    ctx.font = font(600, 10, SANS);
    tracked(ctx, T('sheet.brand'), M, y, 2.2);

    /* ---------- miniaturas ---------- */
    var thumbW = 216, thumbH = 150;
    var tx = W - M - thumbW * 2 - 20;
    drawImageCard(ctx, data.thumb, tx, y + 26, thumbW, thumbH, T('sheet.original'));
    if (data.crop) {
      drawImageCard(ctx, data.crop, tx + thumbW + 20, y + 26, thumbW, thumbH, T('sheet.crop'));
    }

    /* ---------- título ---------- */
    ctx.fillStyle = INK3;
    ctx.font = font(600, 11, SANS);
    tracked(ctx, T('sheet.sheet'), M, y + 74, 5.5);

    ctx.fillStyle = INK;
    ctx.font = font(600, 62, SERIF);
    var titleMax = tx - M - 30;
    ctx.fillText(ellipsize(ctx, data.title || 'Paleta', titleMax), M, y + 140);

    ctx.fillStyle = INK2;
    ctx.font = font(400, 15, SANS);
    var metaBits = [
      T('sheet.colors', { n: palette.length }),
      data.dateText || '',
      data.selText || ''
    ].filter(Boolean);
    ctx.fillText(metaBits.join('   ·   '), M, y + 178);

    /* ---------- 01 paleta ---------- */
    y = section(ctx, y + 236, '01', T('sheet.palette'),
      data.pixelsText ? T('sheet.analyzed', { n: data.pixelsText }) : '');

    var gap = 26;
    var cols = Math.min(4, Math.max(2, palette.length));
    var cardW = (CW - gap * (cols - 1)) / cols;
    var cardH = 356;

    for (var i = 0; i < palette.length; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      drawSwatchCard(
        ctx,
        M + col * (cardW + gap),
        y + row * (cardH + gap),
        cardW, cardH,
        palette[i],
        base && palette[i].hex === base.hex
      );
    }
    var paletteRows = Math.ceil(palette.length / cols);
    y += paletteRows * cardH + (paletteRows - 1) * gap;

    /* ---------- 02 básicos ---------- */
    if (basics.length) {
      y = section(ctx, y + 62, '02', T('sheet.basics'), T('sheet.basicsSub'));

      var bGap = 20;
      var bCols = 6;
      var bW = (CW - bGap * (bCols - 1)) / bCols;
      var bH = 76;

      for (var j = 0; j < basics.length; j++) {
        var br = Math.floor(j / bCols);
        var bc = j % bCols;
        drawBasicChip(ctx, M + bc * (bW + bGap), y + br * (bH + 14), bW, bH, basics[j]);
      }
      var bRows = Math.ceil(basics.length / bCols);
      y += bRows * bH + (bRows - 1) * 14;
    }

    /* ---------- 03 armonías (solo las marcadas) ---------- */
    if (schemes.length) {
      var baseLabel = base
        ? T('sheet.base') + ' ' + base.hex.toUpperCase() + ' · ' + (base.name || '')
        : '';
      y = section(ctx, y + 70, '03', T('sheet.harmonies'), baseLabel);

      var chipW = 168, chipH = 168, chipGap = 16;
      var labelW = 292;
      var rowH = chipH + 46;

      for (var s = 0; s < schemes.length; s++) {
        var sc = schemes[s];
        var ry = y + s * (rowH + 20);

        ctx.textAlign = 'left';
        ctx.fillStyle = INK;
        ctx.font = font(600, 12, SANS);
        tracked(ctx, sc.name.toUpperCase(), M, ry + 18, 1.5);

        ctx.fillStyle = INK3;
        ctx.font = font(400, 11, MONO);
        ctx.fillText(sc.note || '', M, ry + 40);

        for (var k = 0; k < sc.colors.length; k++) {
          var cx = M + labelW + k * (chipW + chipGap);
          if (cx + chipW > W - M) break;
          drawHarmonyChip(ctx, cx, ry, chipW, chipH, sc.colors[k], !!sc.colors[k].isBase);
        }
      }

      y += schemes.length * (rowH + 20);
    }

    /* ---------- pie ---------- */
    y += 46;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    line(ctx, M, y, W - M, y);

    ctx.fillStyle = INK3;
    ctx.font = font(400, 11, SANS);
    ctx.fillText(T('sheet.foot'), M, y + 26);

    if (data.footerRight) {
      ctx.textAlign = 'right';
      ctx.fillText(data.footerRight, W - M, y + 26);
      ctx.textAlign = 'left';
    }

    var finalH = Math.ceil(y + 60);

    var out = document.createElement('canvas');
    out.width = W * SCALE;
    out.height = finalH * SCALE;
    var octx = out.getContext('2d');
    octx.fillStyle = PAPER;
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);

    return out;
  }

  global.Sheet = { render: render };
})(window);
