/*!
 * polaroid-plugin.js
 * ────────────────────────────────────────────────────────────
 * 拍立得構圖產生器（獨立外掛）
 *
 * 設計定位（與 PM 討論後定案）：
 *   拍立得「不是」一種佔據整張畫布的構圖模式，而是一個「商品圖前處理器」。
 *   使用者丟一張圖進來 → 在中空拍立得框內調整（水平/垂直/縮放/旋轉）→
 *   按「產生」→ 本外掛在自己的 <canvas> 上把「照片＋框」壓平成一張 PNG →
 *   這張 PNG 就當成一張「普通商品圖」交回 bn-editor-plugin.js 的既有管線。
 *   因此：吃構圖預設、可加影子、算進 MAX_PROD，且 layout-runtime.js 完全零改動。
 *
 * 對外接口（bn-editor-plugin.js 只依賴這一個全域物件）：
 *   window.bnPolaroid = {
 *     FRAME_URL : String,                       // 框圖路徑（可於載入前覆寫）
 *     open      : function(onComplete, recipe)  // 開啟產生器
 *   };
 *   onComplete(result) 會在使用者按「產生」後被呼叫，result = {
 *     flatSrc : dataURL,   // 壓平後的拍立得商品圖（框外四角為透明）
 *     ratio   : Number,    // 壓平圖的 寬/高（供預覽，實際會被 trimAlpha 覆算）
 *     recipe  : {          // 「乙方案」重編配方，會被塞進 product 物件隨 undo/暫存一起存
 *       origSrc, sx, sy, scale, rot, frame
 *     }
 *   };
 *   recipe（可選）：傳入時進入「重編模式」，還原上次的原圖與四個參數。
 *
 * 設計原則：只新增、不覆寫。比照 sbd-plugin.js，與其他外掛互不干擾。
 * 字體規範：本外掛不渲染任何文字，故不觸發 ShopeeNotoSans 預載鐵律（見糾錯報告）。
 * ────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  /* ── 可調設定 ── */
  var DEFAULT_FRAME_URL = 'img/拍立得.png'; /* 依 PM 指定：框圖放 img/ 資料夾帶入 */
  var MAX_ORIG_PX = 1400; /* 重編用原圖最長邊上限，控制暫存 JSON 體積（比照 SBD MAX_KV_PX）*/
  var ROT_RANGE   = 45;   /* 旋轉 bar 範圍：±deg */
  var SCALE_MIN   = 0.5;  /* 縮放 bar 下限（<1 會露出白相紙底）*/
  var SCALE_MAX   = 3;    /* 縮放 bar 上限（比照 SBD 的 3 倍）*/
  var SHIFT_FRAC  = 0.5;  /* 位移 bar：最大位移量 = 窗 bbox 邊長 × 此比例 */
  var Z_INDEX     = 100010; /* 需高於商品上傳 Modal 的 99999，疊在其上 */

  /* ── 框圖 / 遮罩快取（整個 session 只建一次）── */
  var _frameImg = null;      /* 框 Image 物件 */
  var _maskCanvas = null;    /* 內窗遮罩 canvas：窗內=不透明白，其他=透明 */
  var _win = null;           /* {cx,cy,bboxW,bboxH,W,H} 內窗幾何 */
  var _framePromise = null;  /* 載入+建遮罩的 Promise（去重）*/

  /* 目前彈窗狀態 */
  var _st = null;            /* { photo, sx, sy, scale, rot } */
  var _onComplete = null;
  var _els = null;           /* 常用 DOM 參照 */

  /* ══════════════════════════════════════════════════════
     一、框圖載入 + 內窗遮罩建立（洪水填充）
     ══════════════════════════════════════════════════════ */
  function ensureFrame() {
    if (_framePromise) return _framePromise;
    _framePromise = new Promise(function (resolve, reject) {
      var url = (global.bnPolaroid && global.bnPolaroid.FRAME_URL) || DEFAULT_FRAME_URL;
      var img = new Image();
      /* 若框圖與頁面同源（img/ 內），crossOrigin 無副作用；
         若日後改放 CDN，需對應開啟 CORS，否則 getImageData / toDataURL 會因畫布污染而失敗 */
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try { buildMask(img); _frameImg = img; resolve(); }
        catch (err) { _framePromise = null; reject(err); }
      };
      img.onerror = function () {
        _framePromise = null;
        reject(new Error('拍立得框載入失敗，請確認檔案存在：' + url));
      };
      img.src = url;
    });
    return _framePromise;
  }

  /* 從「中心」洪水填充，取出與中心連通的透明區＝內窗。
     這樣可精準排除「框外四角」那些同樣透明、但不該放照片的區域，
     並天然支援內圓角（逐像素判定，非四邊形近似）。 */
  function buildMask(img) {
    var W = img.naturalWidth, H = img.naturalHeight;
    var tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    var tctx = tmp.getContext('2d');
    tctx.drawImage(img, 0, 0);
    var data = tctx.getImageData(0, 0, W, H).data;
    var TRANS = 40; /* alpha 低於此視為透明 */

    var startIdx = (H >> 1) * W + (W >> 1);
    /* 防呆：中空框的中心必為透明；若為實心框則此法不成立，直接明確報錯 */
    if (data[startIdx * 4 + 3] >= TRANS) {
      throw new Error('框中心非透明，無法建立內窗遮罩（請使用中空拍立得框）');
    }

    var seen = new Uint8Array(W * H);
    var stack = [startIdx];
    var minX = W, minY = H, maxX = 0, maxY = 0;
    while (stack.length) {
      var idx = stack.pop();
      if (seen[idx]) continue;
      if (data[idx * 4 + 3] >= TRANS) continue; /* 碰到不透明的白框邊 → 停止 */
      seen[idx] = 1;
      var x = idx % W, y = (idx / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0)     stack.push(idx - 1);
      if (x < W - 1) stack.push(idx + 1);
      if (y > 0)     stack.push(idx - W);
      if (y < H - 1) stack.push(idx + W);
    }

    /* 把窗內畫成不透明白，做成遮罩 canvas */
    var mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    var mctx = mc.getContext('2d');
    var mimg = mctx.createImageData(W, H);
    var md = mimg.data;
    for (var i = 0; i < seen.length; i++) {
      if (seen[i]) { var p = i * 4; md[p] = 255; md[p + 1] = 255; md[p + 2] = 255; md[p + 3] = 255; }
    }
    mctx.putImageData(mimg, 0, 0);

    _maskCanvas = mc;
    _win = {
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      bboxW: maxX - minX, bboxH: maxY - minY, W: W, H: H
    };
  }

  /* ══════════════════════════════════════════════════════
     二、合成渲染（產生器預覽與最終壓平共用同一段）
     ══════════════════════════════════════════════════════ */
  function render(ctx) {
    var W = _win.W, H = _win.H;
    ctx.clearRect(0, 0, W, H);

    /* ① 白相紙底：只鋪在窗內（遮罩本身即白，直接畫上即可）
       → 照片是去背 PNG 時，透明處會透出白底，符合真實相紙質感 */
    ctx.drawImage(_maskCanvas, 0, 0);

    /* ② 照片：以「窗中心」為錨點，scale=1 時剛好覆蓋整個斜窗 bbox（cover）
       使用者的位移/縮放/旋轉都疊加在此基準上 */
    if (_st && _st.photo) {
      var pw = _st.photo.naturalWidth, ph = _st.photo.naturalHeight;
      var base = Math.max(_win.bboxW / pw, _win.bboxH / ph); /* cover 基準倍率 */
      var dw = pw * base * _st.scale, dh = ph * base * _st.scale;
      var shiftMax = _win.bboxW * SHIFT_FRAC;
      ctx.save();
      ctx.translate(_win.cx + _st.sx * shiftMax, _win.cy + _st.sy * shiftMax);
      ctx.rotate(_st.rot * Math.PI / 180);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(_st.photo, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    /* ③ destination-in：把「白底＋照片」裁進窗內，
       去掉旋轉/放大時溢出到白框邊、甚至框外四角的照片 */
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(_maskCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    /* ④ 疊上框：白邊蓋在最上層，框外四角維持透明 */
    ctx.drawImage(_frameImg, 0, 0);
  }

  /* 產生最終壓平圖（全框原生解析度，畫質最佳）*/
  function flatten() {
    var c = document.createElement('canvas');
    c.width = _win.W; c.height = _win.H;
    render(c.getContext('2d'));
    return c.toDataURL('image/png');
  }

  /* ══════════════════════════════════════════════════════
     三、工具：載圖、原圖壓縮
     ══════════════════════════════════════════════════════ */
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error('照片載入失敗')); };
      i.src = src;
    });
  }

  /* 原圖等比壓到最長邊 MAX_ORIG_PX，回傳 {src, img}；小圖不放大 */
  function shrinkForRecipe(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, MAX_ORIG_PX / Math.max(w, h));
    if (scale >= 1) {
      /* 已在上限內，直接沿用（但仍轉成 dataURL 以利暫存序列化）*/
      var c0 = document.createElement('canvas');
      c0.width = w; c0.height = h;
      c0.getContext('2d').drawImage(img, 0, 0);
      return { src: c0.toDataURL('image/png') };
    }
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    var cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL('image/png') };
  }

  /* ══════════════════════════════════════════════════════
     四、彈窗 UI
     ══════════════════════════════════════════════════════ */
  function injectStyle() {
    if (document.getElementById('bn-pl-style')) return;
    var s = document.createElement('style');
    s.id = 'bn-pl-style';
    s.textContent = [
      '#bn-pl-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:' + Z_INDEX + ';align-items:center;justify-content:center;backdrop-filter:blur(4px)}',
      '#bn-pl-modal.show{display:flex}',
      '.bn-pl-box{background:#1e1e1e;border:1px solid #333;border-radius:14px;width:min(560px,92vw);max-height:92vh;overflow:auto;padding:18px 20px;color:#e0e0e0;font-size:13px}',
      '.bn-pl-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
      '.bn-pl-head h3{margin:0;font-size:15px}',
      '.bn-pl-close{background:none;border:none;color:#999;font-size:22px;cursor:pointer;line-height:1}',
      '.bn-pl-drop{border:2px dashed #555;border-radius:12px;padding:22px;text-align:center;cursor:pointer;color:#999;transition:.15s}',
      '.bn-pl-drop.over{border-color:#ee4d2d;color:#ee4d2d}',
      '.bn-pl-drop input{display:none}',
      '.bn-pl-stage{margin-top:14px;display:none}',
      '.bn-pl-stage.show{display:block}',
      '.bn-pl-preview{background:conic-gradient(#2a2a2a 25%,#242424 0 50%,#2a2a2a 0 75%,#242424 0) 0/24px 24px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:10px}',
      '.bn-pl-preview canvas{max-width:100%;max-height:340px;height:auto;display:block}',
      '.bn-pl-row{display:flex;align-items:center;gap:10px;margin-top:10px}',
      '.bn-pl-row label{width:52px;flex-shrink:0;color:#bbb;font-size:12px}',
      '.bn-pl-row input[type=range]{flex:1;accent-color:#ee4d2d}',
      '.bn-pl-row .val{width:46px;text-align:right;color:#888;font-size:11px;font-variant-numeric:tabular-nums}',
      '.bn-pl-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}',
      '.bn-pl-foot button{padding:8px 16px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#ddd;cursor:pointer;font-size:13px}',
      '.bn-pl-foot .primary{background:#ee4d2d;border-color:#ee4d2d;color:#fff;font-weight:700}',
      '.bn-pl-foot .primary:disabled{opacity:.4;cursor:not-allowed}',
      '.bn-pl-reset{background:none;border:none;color:#ee4d2d;font-size:11px;cursor:pointer;margin-left:auto}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildModal() {
    if (document.getElementById('bn-pl-modal')) return;
    injectStyle();
    var el = document.createElement('div');
    el.id = 'bn-pl-modal';
    el.innerHTML = [
      '<div class="bn-pl-box">',
      '  <div class="bn-pl-head"><h3>🖼️ 拍立得構圖</h3><button class="bn-pl-close" id="bn-pl-x">×</button></div>',
      '  <div class="bn-pl-drop" id="bn-pl-drop">',
      '    <div style="font-size:20px">＋</div>',
      '    <div style="font-weight:700;color:#ddd">點擊或拖曳上傳一張商品圖</div>',
      '    <div style="font-size:11px;margin-top:4px">僅限一張，將嵌入拍立得框內</div>',
      '    <input type="file" id="bn-pl-inp" accept="image/*">',
      '  </div>',
      '  <div class="bn-pl-stage" id="bn-pl-stage">',
      '    <div class="bn-pl-preview"><canvas id="bn-pl-canvas"></canvas></div>',
      '    <div style="display:flex;align-items:center;margin-top:12px">',
      '      <span style="font-size:12px;color:#888">拖曳調整照片在框內的位置</span>',
      '      <button class="bn-pl-reset" id="bn-pl-reset">重設</button>',
      '    </div>',
      rangeRow('bn-pl-x-r', '水平', -100, 100, 0),
      rangeRow('bn-pl-y-r', '垂直', -100, 100, 0),
      rangeRow('bn-pl-s-r', '縮放', SCALE_MIN * 100, SCALE_MAX * 100, 100),
      rangeRow('bn-pl-r-r', '旋轉', -ROT_RANGE, ROT_RANGE, 0),
      '    <button style="width:100%;margin-top:12px;padding:8px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#ddd;cursor:pointer" id="bn-pl-rechoose">↺ 換一張圖</button>',
      '  </div>',
      '  <div class="bn-pl-foot">',
      '    <button id="bn-pl-cancel">取消</button>',
      '    <button class="primary" id="bn-pl-ok" disabled>產生</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);
    bindEvents(el);
  }

  function rangeRow(id, label, min, max, val) {
    return '<div class="bn-pl-row"><label>' + label + '</label>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '" step="1">' +
      '<span class="val" id="' + id + '-v"></span></div>';
  }

  function bindEvents(el) {
    _els = {
      modal: el,
      drop: el.querySelector('#bn-pl-drop'),
      inp: el.querySelector('#bn-pl-inp'),
      stage: el.querySelector('#bn-pl-stage'),
      canvas: el.querySelector('#bn-pl-canvas'),
      ok: el.querySelector('#bn-pl-ok'),
      sx: el.querySelector('#bn-pl-x-r'),
      sy: el.querySelector('#bn-pl-y-r'),
      ss: el.querySelector('#bn-pl-s-r'),
      sr: el.querySelector('#bn-pl-r-r')
    };

    el.querySelector('#bn-pl-x').addEventListener('click', close);
    el.querySelector('#bn-pl-cancel').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });

    _els.drop.addEventListener('click', function (e) { if (e.target !== _els.inp) _els.inp.click(); });
    _els.drop.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('over'); });
    _els.drop.addEventListener('dragleave', function () { this.classList.remove('over'); });
    _els.drop.addEventListener('drop', function (e) {
      e.preventDefault(); this.classList.remove('over');
      var f = Array.prototype.slice.call(e.dataTransfer.files).filter(function (x) { return x.type.indexOf('image/') === 0; })[0];
      if (f) readAndSet(f);
    });
    _els.inp.addEventListener('change', function () { if (this.files[0]) readAndSet(this.files[0]); this.value = ''; });

    el.querySelector('#bn-pl-rechoose').addEventListener('click', function () { _els.inp.click(); });
    el.querySelector('#bn-pl-reset').addEventListener('click', resetSliders);

    /* 四條 bar：即時重繪預覽 */
    [_els.sx, _els.sy, _els.ss, _els.sr].forEach(function (r) {
      r.addEventListener('input', syncFromSliders);
    });

    _els.ok.addEventListener('click', function () {
      if (!_st || !_st.photo) return;
      var recipe = {
        origSrc: _st.origSrc,
        sx: _st.sx, sy: _st.sy, scale: _st.scale, rot: _st.rot,
        frame: (global.bnPolaroid && global.bnPolaroid.FRAME_URL) || DEFAULT_FRAME_URL
      };
      var flatSrc = flatten();
      var ratio = _win.W / _win.H; /* 概略比例，實際會被 trimAlpha 覆算成斜方塊 bbox */
      var cb = _onComplete;
      close();
      if (typeof cb === 'function') cb({ flatSrc: flatSrc, ratio: ratio, recipe: recipe });
    });
  }

  /* 讀檔 → 壓縮存 origSrc → 載入為預覽照片 */
  function readAndSet(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      loadImg(e.target.result).then(function (img) {
        var shrunk = shrinkForRecipe(img);
        return loadImg(shrunk.src).then(function (small) {
          _st.origSrc = shrunk.src;
          _st.photo = small;
          _els.stage.classList.add('show');
          _els.ok.disabled = false;
          syncFromSliders();
        });
      }).catch(function (err) { alert(err.message || '照片處理失敗'); });
    };
    fr.onerror = function () { alert('檔案讀取失敗'); };
    fr.readAsDataURL(file);
  }

  function resetSliders() {
    _els.sx.value = 0; _els.sy.value = 0; _els.ss.value = 100; _els.sr.value = 0;
    syncFromSliders();
  }

  /* bar 值 → state → 重繪 */
  function syncFromSliders() {
    _st.sx = (+_els.sx.value) / 100;               /* -1..1 */
    _st.sy = (+_els.sy.value) / 100;               /* -1..1 */
    _st.scale = (+_els.ss.value) / 100;            /* 0.5..3 */
    _st.rot = (+_els.sr.value);                     /* deg */
    document.getElementById('bn-pl-x-r-v').textContent = _els.sx.value;
    document.getElementById('bn-pl-y-r-v').textContent = _els.sy.value;
    document.getElementById('bn-pl-s-r-v').textContent = Math.round(_st.scale * 100) + '%';
    document.getElementById('bn-pl-r-r-v').textContent = _els.sr.value + '°';
    if (_els.canvas.width !== _win.W) { _els.canvas.width = _win.W; _els.canvas.height = _win.H; }
    render(_els.canvas.getContext('2d'));
  }

  function close() {
    if (_els) _els.modal.classList.remove('show');
    _onComplete = null;
  }

  /* ══════════════════════════════════════════════════════
     五、對外入口
     ══════════════════════════════════════════════════════ */
  function open(onComplete, recipe) {
    buildModal();
    _onComplete = onComplete;
    _st = { photo: null, origSrc: null, sx: 0, sy: 0, scale: 1, rot: 0 };

    /* 先確保框與遮罩就緒（含防呆）*/
    ensureFrame().then(function () {
      _els.modal.classList.add('show');
      _els.stage.classList.remove('show');
      _els.ok.disabled = true;
      resetSliders();

      if (recipe && recipe.origSrc) {
        /* 重編模式：還原上次的原圖與四個參數 */
        loadImg(recipe.origSrc).then(function (img) {
          _st.origSrc = recipe.origSrc;
          _st.photo = img;
          _els.sx.value = Math.round((recipe.sx || 0) * 100);
          _els.sy.value = Math.round((recipe.sy || 0) * 100);
          _els.ss.value = Math.round((recipe.scale || 1) * 100);
          _els.sr.value = Math.round(recipe.rot || 0);
          _els.stage.classList.add('show');
          _els.ok.disabled = false;
          syncFromSliders();
        }).catch(function () { alert('原圖還原失敗，請重新上傳'); });
      }
    }).catch(function (err) {
      alert(err.message || '拍立得框載入失敗');
    });
  }

  /* 掛上對外物件；FRAME_URL 保留可於外部覆寫（載入本檔前後皆可）*/
  global.bnPolaroid = global.bnPolaroid || {};
  global.bnPolaroid.FRAME_URL = global.bnPolaroid.FRAME_URL || DEFAULT_FRAME_URL;
  global.bnPolaroid.open = open;

})(window);
