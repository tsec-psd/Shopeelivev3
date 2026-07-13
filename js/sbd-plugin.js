/*!
 * sbd-plugin.js
 * ────────────────────────────────────────────────────────────
 * SBD 構圖模式外掛：
 *   1. 側欄注入「構圖模式」切換（公版 / SBD）
 *   2. SBD 模式下顯示「上傳視覺底圖(KV)」按鈕
 *   3. KV 上傳後自動取色（四角+中心採樣，合成白底避免透明誤判）
 *      → 呼叫既有 BNColorTheme.applyBg() 產生全套配色，
 *        不重造配色邏輯，沿用 color-theme-plugin.js 的對比度防呆
 *   4. 保留手動色碼輸入覆蓋自動取色結果（既有機制，不需改動）
 *   5. 廣播 bn-layout-mode / bn-kv-image 給所有 iframe（layout-runtime.js 接收）
 *
 * 設計原則：只新增，不覆寫既有 broadcastColors / renderComposePicker 等函式，
 *          與 color-theme-plugin.js 完全平行、互不干擾。
 * ────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  var MAX_KV_PX = 1400; /* KV 底圖最長邊上限，避免大圖佔用過多記憶體 */

  /* 目前模式狀態，供新 iframe 就緒時補送（比照 color-theme-plugin 的 _ctAutoGenBg 模式）*/
  var _sbdMode = 'normal';      /* 'normal' | 'sbd' */
  var _sbdKvSrc = null;         /* 目前套用的 KV 底圖 dataURL，尚未上傳則為 null */

  /* ── 個別版位 KV 定位滑桿 ──
     _kvReadyIds：哪些版位的 KV 底圖已經成功載入、可以互動
       （只有回報過的版位，畫布右側才會長出個別調整滑桿，
        避免對著還沒真的套用成功的底圖顯示一組操作不了任何東西的滑桿）
     _kvTransformPerId：每個版位最後一次套用的 {tx,ty,tz}，
       用途是版位因為勾選/取消勾選被整個重建（iframe 重新載入）時，
       能把使用者之前個別調整過的構圖還原回去，而不是彈回置中 */
  var _kvReadyIds = {};
  var _kvTransformPerId = {};
  var _kvSidePanels = {};
  /* 哪些版位已經被「畫布右側的個別滑桿」手動調整過——
     一旦手動調過，這個版位就跟全域滑桿脫鉤，全域滑桿廣播時要跳過它，
     不能因為使用者後來又動了全域滑桿，就把個別調整的成果覆蓋掉。
     只有「換新圖」或使用者主動點面板上的「恢復跟隨全域」才會清除。*/
  var _kvManuallyAdjusted = {};
  var _globalKvSliders = null; /* {x,y,z} 全域滑桿的 range input 參照，insertSbdUI 建立後才會賦值 */

  /* ★ 供暫存還原用：保留 insertSbdUI 建立的按鈕/區塊參照與樣式刷新函式，
     這樣外部呼叫 _bnSetSbdState() 時可以直接重用 setMode()/refreshBtnStyle()
     既有邏輯（切換按鈕外觀、顯示/隱藏 KV 上傳區），不用另外重寫一份。
     insertSbdUI 尚未執行完成前皆為 null，_bnSetSbdState 會做防呆檢查。*/
  var _uiBtnNormal = null, _uiBtnSbd = null, _uiKvSection = null, _uiRefreshBtnStyle = null;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ── 檔案讀取工具（自成一格，不依賴其他 plugin 的私有函式）── */
  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function (e) { res(e.target.result); };
      r.onerror = function () { rej(new Error('讀取檔案失敗')); };
      r.readAsDataURL(file);
    });
  }
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error('圖片載入失敗')); };
      i.src = src;
    });
  }

  /* ── 防呆①：大圖等比縮小，避免記憶體暴衝 ──
     不論原圖多大，最長邊限制在 MAX_KV_PX 內才進行後續取色與傳輸 */
  function resizeIfNeeded(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var longest = Math.max(w, h);
    var scale = longest > MAX_KV_PX ? (MAX_KV_PX / longest) : 1;
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    return { canvas: canvas, w: cw, h: ch, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
  }

  /* ── 防呆②：從 KV 圖片取色 ──
     取「最左上角 1px」的顏色作為基準色。
     採樣前「合成白色背景」再取色：若原圖是帶透明的 PNG，
     直接讀 rgba 會把透明像素算成黑色，誤判成深色主題。 */
  function extractDominantColor(canvas) {
    var w = canvas.width, h = canvas.height;
    if (w === 0 || h === 0) return null; /* 防呆：空畫布直接回傳 null，呼叫端保留手動色 */

    var sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = w; sampleCanvas.height = h;
    var sctx = sampleCanvas.getContext('2d');
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, w, h);      /* 先鋪白底 */
    sctx.drawImage(canvas, 0, 0);   /* 再疊上原圖，透明區會透出白底而非黑色 */

    try {
      var d = sctx.getImageData(0, 0, 1, 1).data; /* 最左上角 (0,0) 那一顆像素 */
      var r = d[0], g = d[1], b = d[2];
      return '#' + [r, g, b].map(function (v) {
        return v.toString(16).padStart(2, '0');
      }).join('').toUpperCase();
    } catch (err) {
      /* 防呆：canvas 若因跨網域污染(tainted)導致 getImageData 拋錯，
         安靜回傳 null，呼叫端會保留使用者原本手動設定的顏色 */
      return null;
    }
  }

  /* ── 廣播工具 ── */
  function broadcastToAll(msg) {
    document.querySelectorAll('.preview-block iframe').forEach(function (f) {
      try { f.contentWindow.postMessage(msg, '*'); } catch (_) {}
    });
  }
  function broadcastToId(id, msg) {
    var f = document.getElementById('iframe-' + id);
    if (f) { try { f.contentWindow.postMessage(msg, '*'); } catch (_) {} }
  }

  /* ── 個別版位 KV 定位滑桿（顯示在畫布右側）──
     掛載點：#pbody-{id}（.preview-block-body，position:relative、
     overflow:visible），用 left:100% 貼齊該版位畫布的右邊界，
     借用既有版面「畫版垂直排列、左右本來就有留白」的空間，
     不需要另外改版面配置。 */
  function ensureKvSidePanel(id) {
    if (_kvSidePanels[id] && _kvSidePanels[id].isConnected) return _kvSidePanels[id]; /* 防止重複建立；若舊節點已被移除(版位重建)則往下重新建立 */
    var pbody = document.getElementById('pbody-' + id);
    if (!pbody) return null; /* 版位還沒渲染出來，晚點靠 bn-kv-ready 訊息再重試 */

    var panel = document.createElement('div');
    panel.dataset.bnKvSide = String(id);
    panel.style.cssText = [
      'position:absolute;left:100%;top:0;margin-left:12px;width:140px;',
      'padding:10px;border-radius:8px;background:var(--bg2,#1c1c1c);',
      'border:1px solid var(--border,#3d3d3d);display:none;z-index:5;',
    ].join('');

    var title = document.createElement('div');
    title.style.cssText = 'font-size:11px;font-weight:600;color:var(--text2,#aaa);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:6px;';
    var titleLabel = document.createElement('span');
    titleLabel.textContent = '個別調整';
    var revertLink = document.createElement('a');
    revertLink.href = 'javascript:void(0)';
    revertLink.textContent = '恢復跟隨全域';
    revertLink.style.cssText = 'font-size:10px;font-weight:400;color:var(--accent,#ee4d2d);text-decoration:none;display:none;white-space:nowrap;';
    title.appendChild(titleLabel);
    title.appendChild(revertLink);
    panel.appendChild(title);

    function makeRow(label) {
      var row = document.createElement('div');
      row.style.marginBottom = '8px';
      var lab = document.createElement('div');
      lab.textContent = label;
      lab.style.cssText = 'font-size:10px;color:var(--text3,#888);margin-bottom:2px;';
      var input = document.createElement('input');
      input.type = 'range'; input.min = '0'; input.max = '100';
      input.style.cssText = 'width:100%;';
      row.appendChild(lab); row.appendChild(input);
      panel.appendChild(row);
      return input;
    }
    var sx = makeRow('水平位置');
    var sy = makeRow('垂直位置');
    var sz = makeRow('縮放');

    /* 初始數值：有快取（曾經個別調整過，或曾套用過全域滑桿）就還原，
       沒有的話預設置中/最小縮放，跟上傳當下的初始狀態一致 */
    var cached = _kvTransformPerId[id] || { tx: 0.5, ty: 0.5, tz: 0 };
    sx.value = Math.round(cached.tx * 100);
    sy.value = Math.round(cached.ty * 100);
    sz.value = Math.round(cached.tz * 100);
    revertLink.style.display = _kvManuallyAdjusted[id] ? 'inline' : 'none';

    function broadcastThis() {
      var tx = (+sx.value) / 100, ty = (+sy.value) / 100, tz = (+sz.value) / 100;
      _kvTransformPerId[id] = { tx: tx, ty: ty, tz: tz }; /* 更新快取，供版位重建後還原 */
      _kvManuallyAdjusted[id] = true; /* 一旦手動拖過，這個版位就跟全域滑桿脫鉤 */
      revertLink.style.display = 'inline';
      broadcastToId(id, { type: 'bn-kv-transform', tx: tx, ty: ty, tz: tz });
    }
    [sx, sy, sz].forEach(function (s) { s.addEventListener('input', broadcastThis); });

    /* 「恢復跟隨全域」：清除手動標記，並立刻把這個版位同步成
       側欄全域滑桿目前的數值——不是憑空重置，而是接回「現在全域
       正在顯示的構圖」，體感上比較符合「恢復跟隨」的預期 */
    revertLink.addEventListener('click', function () {
      delete _kvManuallyAdjusted[id];
      revertLink.style.display = 'none';
      if (!_globalKvSliders) return; /* 防呆：理論上全域滑桿一定先建立過，這裡只是保險 */
      sx.value = _globalKvSliders.x.value;
      sy.value = _globalKvSliders.y.value;
      sz.value = _globalKvSliders.z.value;
      var gtx = (+sx.value) / 100, gty = (+sy.value) / 100, gtz = (+sz.value) / 100;
      _kvTransformPerId[id] = { tx: gtx, ty: gty, tz: gtz };
      broadcastToId(id, { type: 'bn-kv-transform', tx: gtx, ty: gty, tz: gtz });
    });

    pbody.appendChild(panel);
    _kvSidePanels[id] = panel;
    return panel;
  }

  /* 依「目前是否 SBD 模式」+「這個版位是否已回報 KV 就緒」決定面板顯示/隱藏。
     只隱藏不刪除 DOM，保留滑桿數值，切回 SBD 模式時不用重新調整。 */
  function updateKvSidePanelVisibility() {
    Object.keys(_kvSidePanels).forEach(function (id) {
      var panel = _kvSidePanels[id];
      if (!panel || !panel.isConnected) { delete _kvSidePanels[id]; return; } /* 版位重建導致舊節點被移除，清掉失效參照 */
      panel.style.display = (_sbdMode === 'sbd' && _kvReadyIds[id]) ? 'block' : 'none';
    });
  }

  /* ── 核心：處理 KV 上傳 ──
     sliders 為選填的 {x,y,z,wrap} 參照（wrap 為滑桿外層容器）：
       - 讀取中／上傳失敗：整組隱藏（display:none），不是顯示但disabled，
         呼應「沒圖就整組不見」——避免對著不存在/失敗的底圖顯示一組
         看起來能操作、實際上什麼都不會發生的滑桿
       - 上傳成功：重置為置中(50)/縮放最小(0)並顯示 */
  function handleKvFile(file, statusEl, sliders) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      if (statusEl) statusEl.textContent = '⚠️ 請上傳圖片格式的檔案';
      return;
    }
    if (statusEl) statusEl.textContent = '讀取中…';
    if (sliders) {
      sliders.x.disabled = sliders.y.disabled = sliders.z.disabled = true;
      sliders.wrap.style.display = 'none';
    }

    readFile(file)
      .then(loadImg)
      .then(function (img) {
        var resized = resizeIfNeeded(img);
        _sbdKvSrc = resized.dataUrl;

        /* 1. 送出 KV 底圖給所有畫布 */
        broadcastToAll({ type: 'bn-kv-image', src: _sbdKvSrc });

        /* 2. 自動取色 → 沿用既有配色引擎產生全套文字/Bar/陰影色
              （BNColorTheme 由 color-theme-plugin.js 掛在 window 上，
               此處先防呆檢查是否存在，避免載入順序問題導致報錯）*/
        var hex = extractDominantColor(resized.canvas);
        if (hex && global.BNColorTheme && typeof global.BNColorTheme.applyBg === 'function') {
          global.BNColorTheme.applyBg(hex);
        }

        /* 3. 新圖片上傳成功：滑桿重置為置中/最小縮放並顯示、啟用 */
        if (sliders) {
          sliders.x.value = 50; sliders.y.value = 50; sliders.z.value = 0;
          sliders.x.disabled = sliders.y.disabled = sliders.z.disabled = false;
          sliders.wrap.style.display = 'flex';
        }

        /* 4. 換了一張新圖 = 全部重置：清掉「已就緒」狀態與每個版位的個別定位快取，
              畫布右側的個別調整面板先隱藏，等各版位重新載入新圖、回報
              bn-kv-ready 後才會用「置中/最小縮放」的預設值重新出現，
              不會沿用上一張圖的個別調整結果（跟全域滑桿的重置行為一致）*/
        _kvReadyIds = {};
        _kvTransformPerId = {};
        _kvManuallyAdjusted = {}; /* 換新圖：所有版位重新跟全域滑桿同步，個別調整的脫鉤狀態一併清除 */
        updateKvSidePanelVisibility();
        /* 面板 DOM 直接移除而非只隱藏：滑桿裡的舊數值也要清掉，
           避免下次面板重新出現時，殘留的 input.value 跟已清空的快取對不上 */
        Object.keys(_kvSidePanels).forEach(function (pid) {
          var p = _kvSidePanels[pid];
          if (p && p.parentElement) p.parentElement.removeChild(p);
        });
        _kvSidePanels = {};

        if (statusEl) statusEl.textContent = '✅ 已套用視覺底圖' + (hex ? '（自動配色 ' + hex + '）' : '（取色失敗，保留目前配色）');
      })
      .catch(function (err) {
        /* 防呆③：圖片讀取/載入失敗，不讓畫布卡在半殘狀態，明確告知使用者 */
        console.error('[SBDPlugin] KV 上傳失敗：', err);
        if (statusEl) statusEl.textContent = '❌ 圖片讀取失敗，請換一張再試';
        /* 失敗時滑桿維持隱藏＋停用，避免操作一張沒有成功套用的底圖 */
      });
  }

  /* ── 模式切換 ── */
  function setMode(mode, btnNormal, btnSbd, kvSection, force) {
    var next = (mode === 'sbd') ? 'sbd' : 'normal';

    /* ★ 同模式重複點擊：直接 no-op —— 不重送 bn-layout-mode、不重套構圖。
       原本無論模式有沒有變都會重跑一次 _switchSbdMode + applyComposeBroadcast，
       把使用者選好、甚至手動微調過的位置複寫回該模式的預設座標（就是「再點一次
       SBD 就亂跳」的來源）。座標改為單一來源後，重送本應冪等，但仍會造成一次
       重算閃動，因此同模式直接短路。
       force=true（暫存還原 _bnSetSbdState）時仍需完整套用一次，即使模式沒變。*/
    if (!force && next === _sbdMode) {
      if (btnNormal && btnSbd) {
        btnNormal.dataset.active = (next === 'normal') ? '1' : '0';
        btnSbd.dataset.active    = (next === 'sbd')    ? '1' : '0';
      }
      if (kvSection) kvSection.style.display = (next === 'sbd') ? 'block' : 'none';
      return;
    }

    _sbdMode = next;
    broadcastToAll({ type: 'bn-layout-mode', mode: _sbdMode });
    updateKvSidePanelVisibility(); /* 切回公版模式：全部隱藏；切到SBD：已就緒的版位才顯示 */

    /* ★ 進入 SBD：雙人構圖(2人 id2 / 2人2品 id3)不適用白框，若當前正選著它，
       按鈕會被 renderComposePicker 隱藏，選取狀態就變孤兒、且畫面會擺出
       白框內不該有的雙人座標。這裡自動改選「1人2品」(id1) 收斂回去。
       依產品決定：切回公版「不還原」原本的雙人選擇（避免二次跳動）。
       防呆：找不到 id1 時（理論上不會）不動作，維持原選取，不硬塞 null。 */
    if (_sbdMode === 'sbd' && global._bnComposePreset &&
        (global._bnComposePreset.id === 2 || global._bnComposePreset.id === 3)) {
      var _presets = global.COMPOSE_PRESETS || [];
      var _fallback = _presets.filter(function (p) { return p.id === 1; })[0];
      if (_fallback) {
        global._bnComposePreset     = _fallback;
        global._bnSelectedComposeId = _fallback.id; /* 同步高亮，讓 renderComposePicker 重繪時橘框落在 1人2品 */
      }
    }

    /* 重繪構圖選擇器：SBD 隱藏雙人、公版顯示全部（由 renderComposePicker 內判斷模式）。
       防呆：頂層函式雖可經 window 取用，仍做 typeof 檢查，避免載入順序極端狀況報錯。 */
    if (typeof global.renderComposePicker === 'function') global.renderComposePicker();

    /* 模式切換後，立刻重新套用（可能已被收斂過的）構圖，讓商品位置馬上改用
       這個模式對應的座標（例如 preset.overrides['FB_POST_SBD']）。
       ★ postMessage 對同一個 iframe 保證依發送順序處理，緊接在
         broadcastToAll(bn-layout-mode) 之後呼叫是安全的——iframe 端一定
         會先處理完模式切換，才處理接下來的構圖套用。*/
    if (global._bnComposePreset && typeof global.applyComposeBroadcast === 'function') {
      global.applyComposeBroadcast(global._bnComposePreset);
    }

    if (btnNormal && btnSbd) {
      btnNormal.dataset.active = (_sbdMode === 'normal') ? '1' : '0';
      btnSbd.dataset.active    = (_sbdMode === 'sbd')    ? '1' : '0';
    }
    if (kvSection) kvSection.style.display = (_sbdMode === 'sbd') ? 'block' : 'none';
  }

  /* ── UI 注入：插在「構圖預設」與「背景色」之間 ── */
  function insertSbdUI() {
    if (document.getElementById('_bn_sbd_section')) return; /* 防止重複注入 */
    var colorSection = document.getElementById('color-rows');
    if (!colorSection) return; /* DOM 還沒就緒，交給外層輪詢重試 */

    /* 找到「背景色」的標題 div，插在它前面 */
    var anchor = colorSection.previousElementSibling; /* 「背景色」s-section */
    if (!anchor) return;

    var wrap = document.createElement('div');
    wrap.id = '_bn_sbd_section';

    var title = document.createElement('div');
    title.className = 's-section';
    title.style.marginTop = '14px';
    title.textContent = '構圖模式';
    wrap.appendChild(title);

    var box = document.createElement('div');
    box.className = 'bn-section';
    box.style.cssText = 'padding:8px 14px 12px';

    /* 模式切換按鈕列 */
    var switchRow = document.createElement('div');
    switchRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;';

    function makeModeBtn(label) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = [
        'flex:1;padding:7px 0;border-radius:6px;cursor:pointer;',
        'font-size:12px;font-weight:600;border:1px solid var(--border,#3d3d3d);',
        'background:var(--bg3,#242424);color:var(--text2,#aaa);transition:.12s;',
      ].join('');
      return b;
    }
    var btnNormal = makeModeBtn('公版模式');
    var btnSbd    = makeModeBtn('SBD模式');
    switchRow.appendChild(btnNormal);
    switchRow.appendChild(btnSbd);
    box.appendChild(switchRow);

    /* KV 上傳區（只在 SBD 模式顯示）
       ★ 樣式比照人物圖上傳的 .bn-drop（橘色虛線框），視覺統一，
         不要另外發明一套灰底樣式 */
    var kvSection = document.createElement('div');
    kvSection.style.display = 'none';

    var dropZone = document.createElement('div');
    dropZone.className = 'bn-drop';
    dropZone.id = '_bn_sbd_kv_drop';
    dropZone.textContent = '＋ 點擊或拖曳上傳視覺底圖 (KV)';
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    dropZone.appendChild(fileInput);
    kvSection.appendChild(dropZone);

    var statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:11px;color:var(--text3,#888);margin-top:6px;min-height:14px;';
    kvSection.appendChild(statusEl);

    /* ── KV 定位滑桿（水平/垂直/縮放）──
       取代滑鼠拖曳+滾輪縮放：畫布上的 KV 底圖常被商品/人物擋住，
       直接在畫布上拖曳很難點準，改成側欄的數值滑桿統一操作。
       三條都用 0~100 的正規化數值，實際像素換算交給 layout-runtime.js
       依「各版位自己的裁切窗口尺寸」在畫布端計算，這樣同一組滑桿
       才能同時正確驅動 IG/FB/直播時縮圖…等窗口尺寸互不相同的版位。
       上傳成功前一律 disabled，避免對著不存在的底圖操作。 */
    var kvSliderWrap = document.createElement('div');
    kvSliderWrap.style.cssText = 'margin-top:10px;display:none;flex-direction:column;gap:8px;'; /* 預設隱藏：沒圖就整組不見，不是顯示但disabled */

    function makeKvSlider(label) {
      var row = document.createElement('div');
      var lab = document.createElement('div');
      lab.textContent = label;
      lab.style.cssText = 'font-size:11px;color:var(--text3,#888);margin-bottom:2px;';
      var input = document.createElement('input');
      input.type = 'range';
      input.min = '0'; input.max = '100'; input.value = '50';
      input.style.cssText = 'width:100%;';
      input.disabled = true; /* 防呆：尚未上傳 KV 底圖前不可操作 */
      row.appendChild(lab);
      row.appendChild(input);
      kvSliderWrap.appendChild(row);
      return input;
    }
    var kvSliderX = makeKvSlider('水平位置');
    var kvSliderY = makeKvSlider('垂直位置');
    var kvSliderZ = makeKvSlider('縮放');
    kvSliderZ.value = '0'; /* 縮放預設在最小值（剛好鋪滿窗口，不留白）*/
    _globalKvSliders = { x: kvSliderX, y: kvSliderY, z: kvSliderZ, wrap: kvSliderWrap };

    kvSection.appendChild(kvSliderWrap);

    /* 把 0~100 的滑桿值換算成 layout-runtime.js 需要的 0~1 正規化值後廣播。
       ★ 已被「畫布右側個別滑桿」手動調整過的版位會被跳過，不送訊息、
         不覆蓋其快取——這是這次新增的行為：個別調整過的版位要跟全域
         滑桿脫鉤，除非使用者自己點該面板的「恢復跟隨全域」。*/
    function broadcastKvTransform() {
      var tx = (+kvSliderX.value) / 100, ty = (+kvSliderY.value) / 100, tz = (+kvSliderZ.value) / 100;

      document.querySelectorAll('.preview-block[data-id]').forEach(function (block) {
        var id = block.dataset.id;
        if (_kvManuallyAdjusted[id]) return; /* 這個版位已經脫鉤，全域滑桿不動它 */
        _kvTransformPerId[id] = { tx: tx, ty: ty, tz: tz };
        broadcastToId(id, { type: 'bn-kv-transform', tx: tx, ty: ty, tz: tz });
        var panel = _kvSidePanels[id];
        if (panel) {
          var inputs = panel.querySelectorAll('input[type=range]');
          if (inputs[0]) inputs[0].value = kvSliderX.value;
          if (inputs[1]) inputs[1].value = kvSliderY.value;
          if (inputs[2]) inputs[2].value = kvSliderZ.value;
        }
      });
    }
    [kvSliderX, kvSliderY, kvSliderZ].forEach(function (s) {
      s.addEventListener('input', broadcastKvTransform);
    });

    box.appendChild(kvSection);
    wrap.appendChild(box);

    colorSection.parentElement.insertBefore(wrap, anchor);

    /* 事件綁定 */
    function refreshBtnStyle() {
      [btnNormal, btnSbd].forEach(function (b) {
        var active = b.dataset.active === '1';
        b.style.background = active ? 'var(--accent,#ee4d2d)' : 'var(--bg3,#242424)';
        b.style.color      = active ? '#fff' : 'var(--text2,#aaa)';
        b.style.borderColor = active ? 'var(--accent,#ee4d2d)' : 'var(--border,#3d3d3d)';
      });
    }
    btnNormal.addEventListener('click', function () { setMode('normal', btnNormal, btnSbd, kvSection); refreshBtnStyle(); });
    btnSbd.addEventListener('click',    function () { setMode('sbd',    btnNormal, btnSbd, kvSection); refreshBtnStyle(); });

    /* ★ 保存參照供 _bnSetSbdState 還原暫存時重用 */
    _uiBtnNormal = btnNormal; _uiBtnSbd = btnSbd; _uiKvSection = kvSection; _uiRefreshBtnStyle = refreshBtnStyle;
    fileInput.addEventListener('change', function (e) {
      handleKvFile(e.target.files && e.target.files[0], statusEl, { x: kvSliderX, y: kvSliderY, z: kvSliderZ, wrap: kvSliderWrap });
      fileInput.value = ''; /* 允許重複選同一檔案再次觸發 change */
    });
    /* 拖曳上傳：比照人物圖上傳的 dragover/dragleave/drop 互動 */
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('drag'); });
    dropZone.addEventListener('dragleave', function () { this.classList.remove('drag'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      this.classList.remove('drag');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      handleKvFile(f, statusEl, { x: kvSliderX, y: kvSliderY, z: kvSliderZ, wrap: kvSliderWrap });
    });

    setMode('normal', btnNormal, btnSbd, kvSection);
    refreshBtnStyle();
  }

  ready(function () {
    /* 暴露給 bn.html 的 applyComposeBroadcast 查詢：目前是否處於 SBD 模式，
       用來決定要不要優先找 preset.overrides['xxx_SBD'] 這組專屬座標。 */
    global._bnIsSbdMode = function () { return _sbdMode === 'sbd'; };

    /* ══════════════════════════════════════════════════════════
       ★ 對外開放完整 SBD 狀態存取，供 bn.html 的下載暫存/上傳暫存
       （_bnCaptureFullState / _bnRestoreFullState）共用，補上先前
       完全沒被存到的那一塊：模式(公版/SBD)、KV 底圖、全域滑桿數值、
       各版位個別調整過的位移/縮放與脫鉤標記。
       ────────────────────────────────────────────────────────
       ★ 誠實註記：KV 底圖 dataURL 可能不小（已經過 MAX_KV_PX 壓縮，
       但仍可能到幾百 KB），會讓下載暫存的 JSON 檔變大，這是必要的
       取捨——不存底圖本身，SBD 模式還原後畫面就是空的，沒有意義。
       ══════════════════════════════════════════════════════════ */
    global._bnGetSbdState = function () {
      return {
        mode: _sbdMode,
        kvSrc: _sbdKvSrc,
        kvGlobal: _globalKvSliders
          ? { x: +_globalKvSliders.x.value, y: +_globalKvSliders.y.value, z: +_globalKvSliders.z.value }
          : { x: 50, y: 50, z: 0 },
        kvTransformPerId: JSON.parse(JSON.stringify(_kvTransformPerId)),
        kvManuallyAdjusted: JSON.parse(JSON.stringify(_kvManuallyAdjusted)),
      };
    };

    global._bnSetSbdState = function (state) {
      if (!state) return;
      _sbdKvSrc           = state.kvSrc || null;
      _kvTransformPerId    = state.kvTransformPerId    ? JSON.parse(JSON.stringify(state.kvTransformPerId))    : {};
      _kvManuallyAdjusted  = state.kvManuallyAdjusted  ? JSON.parse(JSON.stringify(state.kvManuallyAdjusted))  : {};
      /* 版位重新收到 KV 圖時（bn-kv-ready）才會重建個別調整面板，
         這裡先清空舊面板快取，避免殘留上一份暫存的 DOM 節點參照 */
      _kvReadyIds = {};
      Object.keys(_kvSidePanels).forEach(function (pid) {
        var p = _kvSidePanels[pid];
        if (p && p.parentElement) p.parentElement.removeChild(p);
      });
      _kvSidePanels = {};

      /* 還原全域滑桿的顯示數值與啟用狀態（防呆：insertSbdUI 若因載入
         順序問題還沒建立完成，_globalKvSliders 會是 null，直接跳過，
         等使用者手動點開構圖模式面板時，會維持預設置中值，不會報錯）*/
      if (_globalKvSliders && state.kvGlobal) {
        _globalKvSliders.x.value = state.kvGlobal.x;
        _globalKvSliders.y.value = state.kvGlobal.y;
        _globalKvSliders.z.value = state.kvGlobal.z;
        var hasKv = !!_sbdKvSrc;
        _globalKvSliders.x.disabled = _globalKvSliders.y.disabled = _globalKvSliders.z.disabled = !hasKv;
        _globalKvSliders.wrap.style.display = hasKv ? 'flex' : 'none';
      }

      /* 套用模式：重用既有 setMode()，會自動處理按鈕外觀、KV 區塊顯示、
         並廣播 bn-layout-mode + 重新套用目前構圖預設給所有 iframe */
      setMode(state.mode === 'sbd' ? 'sbd' : 'normal', _uiBtnNormal, _uiBtnSbd, _uiKvSection, true);
      if (typeof _uiRefreshBtnStyle === 'function') _uiRefreshBtnStyle();

      /* SBD 模式且有 KV 底圖 → 補送底圖本身 + 每個版位各自的定位變換，
         setMode() 只負責切模式，不包含這兩塊資料 */
      if (_sbdMode === 'sbd' && _sbdKvSrc) {
        broadcastToAll({ type: 'bn-kv-image', src: _sbdKvSrc });
        Object.keys(_kvTransformPerId).forEach(function (id) {
          var t = _kvTransformPerId[id];
          if (t) broadcastToId(id, { type: 'bn-kv-transform', tx: t.tx, ty: t.ty, tz: t.tz });
        });
      }
    };

    var tries = 0;
    (function tryInit() {
      tries++;
      insertSbdUI();
      if (!document.getElementById('_bn_sbd_section') && tries < 30) {
        setTimeout(tryInit, 400); /* 防呆：側欄 DOM 還沒渲染完成，輪詢重試，不無限重試 */
      }
    })();

    /* 接收各版位「KV 底圖已成功載入」的回報，建立/顯示該版位畫布右側的
       個別調整滑桿面板。此時機才建立，確保面板一定對應著已經真的能
       互動的底圖，不會出現操作不了任何東西的滑桿。 */
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'bn-kv-ready') return;
      var id = e.data.id;
      if (id === undefined || id === null) return;
      _kvReadyIds[id] = true;
      ensureKvSidePanel(id);
      updateKvSidePanelVisibility();
    });

    /* 新 iframe 就緒時，補送目前的模式與 KV 底圖，
       避免使用者先切到 SBD 模式，之後又勾選新版位時新版位仍停在公版 */
    var origOnReady = global._bnOnIframeReady;
    global._bnOnIframeReady = function (id) {
      if (typeof origOnReady === 'function') origOnReady(id);
      /* 版位重新載入（例如勾選開關導致整個 iframe 重建）：
         舊的「已就緒」狀態跟著舊 DOM 一起消失，要等新一輪
         bn-kv-ready 回報才能確認新畫面真的能互動了 */
      delete _kvReadyIds[id];
      if (_sbdMode === 'sbd') {
        broadcastToId(id, { type: 'bn-layout-mode', mode: 'sbd' });
        if (_sbdKvSrc) {
          broadcastToId(id, { type: 'bn-kv-image', src: _sbdKvSrc });
          /* 這個版位如果之前個別調整過構圖，重新套圖後一併補送回去，
             不然畫面會先重置回置中，使用者的調整成果無故消失 */
          var cached = _kvTransformPerId[id];
          if (cached) broadcastToId(id, { type: 'bn-kv-transform', tx: cached.tx, ty: cached.ty, tz: cached.tz });
        }
      }
    };
  });

})(window);
