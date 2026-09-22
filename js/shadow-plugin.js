/*
  ShadowPlugin(v13 商品陰影引擎)
  移植自海若_影子/陰影/shadow-system/shadow-plugin.js,只保留「商品貼地陰影」這一半：
  即時算出商品去背 PNG 的輪廓陰影(斜切/擠壓/多層 stampLayer/漸層淡出)，顏色跟光源角度
  都是參數，不是烤進圖片的靜態素材。

  跟原版的差異(刻意精簡，配合 v13 的使用方式)：
  - 不含代言人/主播(person)的光暈陰影分支——v13 陰影只套用在商品上。
  - 不含 setBackground()/取樣背景圖算色——v13 顏色一律由父層 colorState.shadowColor
    透過 bn-color-ext 廣播進來，直接呼叫 setShadowColorRGB() 即可。
  - renderScene() 永遠以 skipPhoto=true 呼叫(商品照片本體仍由既有 <img> DOM 顯示，
    這個引擎只負責在照片下方畫一張陰影 canvas)，所以拿掉了只給「畫照片本體」用的
    withRotation()/pivotX/pivotY。
*/
window.ShadowPlugin = (function () {
  'use strict';

  // 固定死的預設值(不對外開放調整，比照原版)
  var FIXED = {
    soft: 16,
    softNear: 1,
    softFar: 25,
    softSteps: 12,
    fade: 120,
    occlude: 80,
    squash: 0.32
  };
  var ANGLE_PRESETS = { left: -35, top: 0, right: 35 };

  var opts = { angle: ANGLE_PRESETS.left, presetName: 'left' };
  var products = {}; // id -> { img, silhouette, tinted, trim }
  var shadowRGB = '90,90,90'; // 備用預設值，正式值由 layout-runtime.js 收到 bn-color-ext 後呼叫 setShadowColorRGB() 覆蓋

  function setAngle(preset) {
    if (typeof preset === 'number') { opts.angle = preset; opts.presetName = null; return; }
    if (ANGLE_PRESETS[preset] != null) { opts.angle = ANGLE_PRESETS[preset]; opts.presetName = preset; }
  }

  function setShadowColorRGB(rgbStr) {
    shadowRGB = rgbStr;
    Object.keys(products).forEach(function (id) { tintProduct(id); });
  }
  function getShadowColorRGB() { return shadowRGB; }

  function buildSilhouette(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function tintProduct(id) {
    var p = products[id];
    if (!p || !p.silhouette) return;
    var tinted = document.createElement('canvas');
    tinted.width = p.silhouette.width; tinted.height = p.silhouette.height;
    var tctx = tinted.getContext('2d');
    tctx.drawImage(p.silhouette, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = 'rgb(' + shadowRGB + ')';
    tctx.fillRect(0, 0, tinted.width, tinted.height);
    p.tinted = tinted;
  }

  function detectAlphaTrim(img) {
    var c = document.createElement('canvas');
    var maxDim = 300;
    var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    c.width = w; c.height = h;
    var cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0, w, h);
    var top = 0, bottom = 0, left = 0, right = 0;
    try {
      var d = cctx.getImageData(0, 0, w, h).data;
      var minY = h, maxY = -1, minX = w, maxX = -1;
      var alphaThresh = 10;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var a = d[(y * w + x) * 4 + 3];
          if (a > alphaThresh) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }
      if (maxY >= 0) {
        top = minY / h; bottom = (h - 1 - maxY) / h;
        left = minX / w; right = (w - 1 - maxX) / w;
      }
    } catch (e) {
      console.warn('ShadowPlugin: 無法偵測透明留白，影子支點改用圖片原始邊界', e);
    }
    return { top: top, bottom: bottom, left: left, right: right };
  }

  function registerProduct(id, imgEl) {
    return new Promise(function (resolve) {
      function build() {
        var silhouette = buildSilhouette(imgEl);
        var trim = detectAlphaTrim(imgEl);
        products[id] = { img: imgEl, silhouette: silhouette, tinted: null, trim: trim };
        tintProduct(id);
        resolve(products[id]);
      }
      if (imgEl.complete && imgEl.naturalWidth) { build(); return; }
      /* ★ 用 addEventListener({once:true}) 而非 imgEl.onload=build:
         直接賦值會覆蓋掉別人掛在同一張 img 上的 onload,而且用完不會自己清掉。
         ★ 必須一併處理 onerror:呼叫端是 registerProduct(...).then(_bnRedrawShadowScene),
         載入失敗若不 settle,這個 promise 就永遠掛著 → 陰影再也不會重繪 = 永久殘影。
         失敗時 resolve(null),讓呼叫端照常跑重繪(該商品沿用上一次的輪廓或不畫)。 */
      imgEl.addEventListener('load',  build, { once: true });
      imgEl.addEventListener('error', function () { resolve(null); }, { once: true });
    });
  }

  function removeProduct(id) { delete products[id]; }

  /* rotRad：商品自轉角度(弧度)。畫面上旋轉的是商品的 <img>(transform-origin:center
     center，見 rotate-plugin.js)，外層 box 維持軸對齊，所以 state.w/h 不會跟著變 ——
     陰影必須自己把這個旋轉補回去，否則轉了商品、影子還是原來的形狀(回報問題)。
     順序：先自轉(商品在直立空間裡轉)，再套 shear/squash 的貼地投影 —— canvas 的
     transform 是後套用的先作用於圖元，所以 rotate 要寫在 transform(投影) 之後。 */
  function stampLayer(targetCtx, tinted, ox, oy, pw, ph, shear, squash, spread, totalAlpha, samples, rotRad) {
    if (!tinted) return;
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'multiply';
    targetCtx.globalAlpha = totalAlpha / samples;
    for (var i = 0; i < samples; i++) {
      var ang = (i / samples) * Math.PI * 2 * 2.4;
      var rad = spread * Math.sqrt((i + 0.5) / samples);
      var dx = Math.cos(ang) * rad;
      var dy = Math.sin(ang) * rad * 0.4;
      targetCtx.save();
      targetCtx.translate(ox + dx, oy + dy);
      targetCtx.transform(1, 0, shear, squash, 0, 0);
      /* 錨點在「底部中心」→ 商品自己的中心在 (0, -ph/2)，繞它轉才跟畫面一致 */
      if (rotRad) {
        targetCtx.translate(0, -ph / 2);
        targetCtx.rotate(rotRad);
        targetCtx.translate(0, ph / 2);
      }
      targetCtx.drawImage(tinted, -pw / 2, -ph, pw, ph);
      targetCtx.restore();
    }
    targetCtx.restore();
  }

  /* 將一張已模糊的投影限制在「距離帶」內。
     帶與帶之間以三角權重交疊，在任意距離上的總權重都是 1，
     因此可以平滑混合不同 blur 半徑，不會出現一節一節的接縫。 */
  function applyDistanceBandMask(layerCtx, w, h, ox, oy, tipDx, tipDy, index, count) {
    var centerT = index / (count - 1);
    var prevT = Math.max(0, (index - 1) / (count - 1));
    var nextT = Math.min(1, (index + 1) / (count - 1));
    var grad;

    layerCtx.save();
    layerCtx.globalCompositeOperation = 'destination-in';

    if (index === 0) {
      grad = layerCtx.createLinearGradient(
        ox, oy,
        ox + tipDx * nextT, oy + tipDy * nextT
      );
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else if (index === count - 1) {
      grad = layerCtx.createLinearGradient(
        ox + tipDx * prevT, oy + tipDy * prevT,
        ox + tipDx, oy + tipDy
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
    } else {
      grad = layerCtx.createLinearGradient(
        ox + tipDx * prevT, oy + tipDy * prevT,
        ox + tipDx * nextT, oy + tipDy * nextT
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop((centerT - prevT) / (nextT - prevT), 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    }

    layerCtx.fillStyle = grad;
    layerCtx.fillRect(0, 0, w, h);
    layerCtx.restore();
  }

  /* 商品主斜影：靠近接地點保持較清晰，沿投射向量越遠越模糊。
     先畫一次銳利投影，再將多個 Gaussian blur 版本以距離遮罩混合。
     Canvas filter 的結果會烘入像素，後續 html2canvas 匯出可正常保留。 */
  function drawProgressiveShadow(targetCtx, tinted, ox, oy, pw, ph, shear, squash, rotRad) {
    var w = targetCtx.canvas.width;
    var h = targetCtx.canvas.height;
    var base = document.createElement('canvas');
    base.width = w; base.height = h;
    var bctx = base.getContext('2d');

    /* 單一銳利投影作為各模糊層共用的來源。 */
    stampLayer(bctx, tinted, ox, oy, pw, ph, shear, squash, 0, 0.62, 1, rotRad);

    var scratch = document.createElement('canvas');
    scratch.width = w; scratch.height = h;
    var sctx = scratch.getContext('2d');
    var canBlur = typeof sctx.filter !== 'undefined';

    /* 舊環境若不支援 Canvas filter，維持原本三層 stamp 效果。 */
    if (!canBlur) {
      stampLayer(targetCtx, tinted, ox, oy, pw, ph, shear, squash, FIXED.soft * 1.8, 0.2, 12, rotRad);
      stampLayer(targetCtx, tinted, ox, oy, pw, ph, shear, squash, FIXED.soft * 0.8, 0.28, 10, rotRad);
      stampLayer(targetCtx, tinted, ox, oy, pw, ph, shear, squash, FIXED.soft * 0.25, 0.25, 6, rotRad);
      return;
    }

    var steps = Math.max(2, FIXED.softSteps);
    var tipDx = -shear * ph;
    var tipDy = -squash * ph;

    targetCtx.save();
    /* 每個距離帶的遮罩權重總和為 1。用 lighter 累加 premultiplied alpha，
       才能在交疊區維持一致的濃度；若用 multiply 會重複變深而產生層紋。 */
    targetCtx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < steps; i++) {
      var t = i / (steps - 1);
      /* 二次曲線：前半段維持較小 blur，後半段再加速擴散到原本尾端強度。 */
      var eased = t * t;
      var radius = FIXED.softNear + (FIXED.softFar - FIXED.softNear) * eased;

      sctx.clearRect(0, 0, w, h);
      sctx.globalCompositeOperation = 'source-over';
      sctx.filter = radius > 0 ? 'blur(' + radius + 'px)' : 'none';
      sctx.drawImage(base, 0, 0);
      sctx.filter = 'none';
      applyDistanceBandMask(sctx, w, h, ox, oy, tipDx, tipDy, i, steps);
      targetCtx.drawImage(scratch, 0, 0);
    }
    targetCtx.restore();
  }

  // 商品貼地陰影(斜切/擠壓/多層 stamp)，state: {x(中心), y(底部), w, h, rot, shadowScaleX, shadowScaleY}
  function drawGroundShadow(ctx, id, state, occluderMask) {
    var p = products[id];
    if (!p || !p.tinted) return;

    var pw = state.w, ph = state.h;
    var cx = state.x;
    var squash = FIXED.squash;
    var trimBottomPad = p.trim ? p.trim.bottom * ph : 0;
    var shadowGroundY = state.y + trimBottomPad * squash;

    var trimCenterOffsetX = p.trim ? (p.trim.left - p.trim.right) * pw / 2 : 0;
    var shadowCx = cx + trimCenterOffsetX;

    var rot = state.rot || 0;

    var shadowScaleX = state.shadowScaleX || 1;
    var shadowScaleY = state.shadowScaleY || 1;
    var spw = pw * shadowScaleX;
    var sph = ph * shadowScaleY;

    // 接地補強陰影：商品旋轉時跳過(貼著未旋轉的原始輪廓算，旋轉後角度對不上)
    if (!rot) {
      var CONTACT_GROW_PX = 3;
      var contactH = ph + CONTACT_GROW_PX;
      var py = state.y + trimBottomPad;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.4;
      ctx.drawImage(p.tinted, cx - pw / 2, py - ph, pw, contactH);
      ctx.restore();
    }

    var angle = opts.angle * Math.PI / 180;
    var soft = FIXED.soft;
    var fadeMul = FIXED.fade / 100;
    var occludeStrength = FIXED.occlude / 100;
    var shear = Math.tan(angle * 0.55);
    /* Canvas blur 有約 3倍半徑的可見外擴，預留足夠空間，
       避免遠端大 blur 被離屏 canvas 邊界裁成硬邊。 */
    var maxSpread = Math.max(soft * 1.8, FIXED.softFar * 3) + 20;

    // 光源「中」(angle=0)：只留接地補強陰影，不疊主斜切陰影(直直往下的模糊陰影疊加反而厚重)
    if (opts.presetName === 'top') return;

    /* ★ 旋轉後的外接矩形會變大，暫存畫布要跟著放大，否則影子的邊角會被裁掉 */
    var rotRad = rot * Math.PI / 180;
    var rw = spw, rh = sph;
    if (rot) {
      var ac = Math.abs(Math.cos(rotRad)), as = Math.abs(Math.sin(rotRad));
      rw = spw * ac + sph * as;
      rh = spw * as + sph * ac;
    }
    var extH = Math.max(sph, rh);
    var halfW = rw / 2 + Math.abs(shear) * extH + maxSpread;
    var tempW = Math.ceil(halfW * 2);
    var projectedH = extH * squash;
    var tempH = Math.ceil(projectedH + maxSpread * 2);
    var anchorX = halfW;
    var anchorY = Math.ceil(maxSpread + projectedH);

    var tmp = document.createElement('canvas');
    tmp.width = tempW; tmp.height = tempH;
    var tctx = tmp.getContext('2d');

    drawProgressiveShadow(tctx, p.tinted, anchorX, anchorY, spw, sph, shear, squash, rotRad);

    if (occludeStrength > 0 && occluderMask) {
      tctx.save();
      tctx.globalCompositeOperation = 'destination-out';
      tctx.globalAlpha = occludeStrength;
      tctx.drawImage(occluderMask, -(shadowCx - anchorX), -(shadowGroundY - anchorY));
      tctx.restore();
    }

    var tipX = -shear * sph * fadeMul;
    var tipY = -squash * sph * fadeMul - soft * 0.6;
    tctx.globalCompositeOperation = 'destination-in';
    var grad = tctx.createLinearGradient(anchorX, anchorY, anchorX + tipX, anchorY + tipY);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = grad;
    tctx.fillRect(0, 0, tempW, tempH);
    tctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.beginPath();
    var clipMarginBelow = 5;
    var clipSpanX = ctx.canvas.width * 3;
    ctx.rect(shadowCx - clipSpanX, shadowGroundY - clipSpanX, clipSpanX * 2, clipSpanX + clipMarginBelow);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(tmp, shadowCx - anchorX, shadowGroundY - anchorY);
    ctx.restore();
  }

  // items: 由後到前排序的 [{id,x,y,w,h,rot,shadowScaleX,shadowScaleY}, ...]
  function renderScene(ctx, items) {
    var runningMask = document.createElement('canvas');
    runningMask.width = ctx.canvas.width;
    runningMask.height = ctx.canvas.height;
    var rmctx = runningMask.getContext('2d');

    items.forEach(function (state) {
      var p = products[state.id];
      drawGroundShadow(ctx, state.id, state, runningMask);
      if (p && p.silhouette) {
        var pad = p.trim ? p.trim.bottom * state.h : 0;
        var py = state.y + pad;
        /* ★ 遮擋遮罩也要跟著商品自轉，否則旋轉後會在「舊的方向」把後方商品的影子挖掉 */
        var r = (state.rot || 0) * Math.PI / 180;
        if (r) {
          rmctx.save();
          rmctx.translate(state.x, py - state.h / 2);   /* 商品中心 */
          rmctx.rotate(r);
          rmctx.drawImage(p.silhouette, -state.w / 2, -state.h / 2, state.w, state.h);
          rmctx.restore();
        } else {
          rmctx.drawImage(p.silhouette, state.x - state.w / 2, py - state.h, state.w, state.h);
        }
      }
    });
  }

  return {
    ANGLE_PRESETS: ANGLE_PRESETS,
    setAngle: setAngle,
    setShadowColorRGB: setShadowColorRGB,
    getShadowColorRGB: getShadowColorRGB,
    registerProduct: registerProduct,
    removeProduct: removeProduct,
    renderScene: renderScene,
    _products: products
  };
})();
