/* ============================================================================
 * coedit-plugin.js — 商品／人物跨版位共編介面（第一批：入口 + 介面 + 套用廣播）
 * ----------------------------------------------------------------------------
 * 職責：
 *   1) 在商品清單區插入「共編・套用各版位」入口按鈕（上傳商品後才顯示、琥珀金跳色）。
 *   2) 開啟共編 modal：正方形共編畫布（底色訂閱配色器 colorState）＋ 真實商品/人物
 *      （用去背後的真實 src 圖）＋ Shift 多選 ＋ 單選旋轉/大小 ＋ PS 式群組變形
 *      （繞群組中心）＋ 正方形安全區 ＋ 兩顆套用按鈕。
 *   3) 套用時廣播 bn-coedit-apply 給所有版位 iframe。
 *
 * 依賴（皆唯讀，不改動）：
 *   - window._bnProducts / window._bnPersons（商品/人物清單）
 *   - window.colorState（配色器輸出：canvasBg / shadowRgba）
 *   - 頁面上的 .preview-block iframe（各版位）
 *
 * 明確不做（交由後續批次 / 其他模組）：
 *   - 各版位「接收 bn-coedit-apply 並疊加」：下一批在 layout-runtime.js 實作。
 *   - 構圖邏輯（BN_POSITIONS / _applyCompose）：完全不碰。
 *   - 去背/裁切：維持商品既有「編輯」入口，本 plugin 不涉入。
 * ========================================================================== */
(function (global) {
  'use strict';

  var SAFE = 1.0;                  /* ★#2 安全區=整個畫布(0.86→1.0):物件可用範圍=視覺畫布邊界,
                                        消除「卡在比畫布小的框內」的錯覺。safeRect() 於 SAFE=1 時回傳
                                        {x:0,y:0,s:STAGE},下游 renderStage/onMove/selBBoxPx/apply 全部連動。 */
  var STAGE = 420;                 /* 共編畫布顯示邊長(px) */
  var FALLBACK_BG = '#EE4D2D';     /* 配色器未就緒時的底色 */
  var FALLBACK_SH = 'rgba(150,40,20,.5)';

  /* ★ 背景陰影(B 方案・非近似):同步「直播時縮圖」720×720 的 --shadow-* 值。
     共編 canvas 以 720 內部解析度繪製、再由 CSS 縮到 STAGE 顯示 →
     blur / left-fade 這些 px 值免換算,像素比例與版位 1:1。 */
  var SH720 = {
    size: 720,
    topY: 40, leftX: 50, slantX: 50, gradFrom: 55,
    bottomY: 100, blur: 3, bottomFade: 80, leftFade: 80, alpha: 0.4
  };

  var state = { objects: [], selection: null, dragging: null, anchor: null, aStart: null,
                undo: [], _pre: null, keyHandler: null };   /* ★Undo 堆疊 + 手勢起始快照 + Ctrl+Z 監聽 ref */
  var UNDO_MAX = 50;                                          /* 堆疊上限,防記憶體膨脹 */

  /* ---- 小工具 ---------------------------------------------------------- */
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function colorBg()  { return (global.colorState && global.colorState.canvasBg)   || FALLBACK_BG; }
  /* 陰影色來源:優先 shadowRgba,但配色器只把 shadowColor(hex)寫回 colorState、
     不寫 shadowRgba,故以 shadowColor 為可靠後備(withAlpha 會統一鎖成 --shadow-alpha)。 */
  function colorSh()  {
    var cs = global.colorState;
    return (cs && (cs.shadowRgba || cs.shadowColor)) || FALLBACK_SH;
  }
  function products() { return Array.isArray(global._bnProducts) ? global._bnProducts : []; }
  function persons()  { return Array.isArray(global._bnPersons)  ? global._bnPersons  : []; }

  /* 對所有版位 iframe 廣播（與 bn-editor 的 broadcast 同機制，避免耦合其內部函式） */
  function broadcast(msg) {
    document.querySelectorAll('.preview-block iframe').forEach(function (f) {
      try { f.contentWindow.postMessage(msg, '*'); } catch (e) {}
    });
  }

  /* ---- 入口按鈕：上傳商品後才顯示 -------------------------------------- */
  var entryBtn = null;
  function ensureEntryButton() {
    var listBox = document.getElementById('bn-prod-list');
    if (!listBox) return;                         /* 商品區還沒建，稍後 observer 會再觸發 */
    if (!entryBtn) {
      entryBtn = el('button', { id: 'bn-coedit-entry' },
        '\u25e7 \u5171\u7de8\u30fb\u5957\u7528\u5404\u7248\u4f4d');   /* ◧ 共編・套用各版位 */
      entryBtn.style.cssText =
        'display:none;width:100%;margin:8px 0 2px;padding:9px;border:none;border-radius:8px;' +
        'background:#FFC107;color:#4a3800;font-weight:700;font-size:13px;cursor:pointer';
      entryBtn.addEventListener('click', openCoEdit);
      listBox.parentNode.insertBefore(entryBtn, listBox);  /* 放商品清單正上方 */
    }
    /* 上傳後才顯示：有商品「或」有人物皆顯示(只上傳人物也要能共編) */
    entryBtn.style.display = (products().length > 0 || persons().length > 0) ? 'block' : 'none';
  }

  /* ---- 共編 modal ------------------------------------------------------ */
  function buildObjects() {
    /* 把真實商品/人物轉成共編物件；初始佈局：人物偏左、商品右側錯開，使用者再調。
       若有上次共編狀態(_bnCoEditLast)則套用,保留最後一步。 */
    var last = global._bnCoEditLast || {};
    function withLast(o) {
      var L = last[o.id];
      if (L) { o.x = L.x; o.y = L.y; o.h = L.h; o.scale = L.scale; o.rot = L.rot; }
      return o;
    }
    var objs = [];
    var ps = persons();
    ps.forEach(function (p, i) {
      objs.push(withLast({ id: p.id, kind: 'person', src: p.src, ratio: p.ratio || 0.5,
        x: 0.28 + i * 0.08, y: 0.60, h: 0.72, rot: 0, scale: 1, label: '人物' + (i + 1) }));
    });
    var pr = products();
    pr.forEach(function (p, i) {
      objs.push(withLast({ id: p.id, kind: 'product', src: p.src, ratio: p.ratio || 0.7,
        x: 0.60 + i * 0.16, y: 0.46 + i * 0.16, h: 0.32, rot: (parseFloat(p.rot) || 0),
        scale: (parseFloat(p.sizeScale) || 1), label: '商品' + (i + 1) }));
    });
    return objs;
  }
  /* 記住目前共編佈局(供下次開啟載入最後一步) */
  function saveCoEditState() {
    var m = {};
    state.objects.forEach(function (o) { m[o.id] = { x: o.x, y: o.y, h: o.h, scale: o.scale, rot: o.rot }; });
    global._bnCoEditLast = m;
  }

  /* ---- Undo(復原):快照式,一次手勢=一步 -------------------------------- */
  /* 只快照可變的 5 個欄位(位置/高/縮放/旋轉);選取狀態不納入 undo(屬暫態)。 */
  function snapshot() {
    return state.objects.map(function (o) {
      return { id: o.id, x: o.x, y: o.y, h: o.h, scale: o.scale, rot: o.rot };
    });
  }
  function applySnapshot(snap) {
    var map = {}; snap.forEach(function (s) { map[s.id] = s; });   /* 依 id 對應,不受順序影響 */
    state.objects.forEach(function (o) {
      var s = map[o.id];
      if (s) { o.x = s.x; o.y = s.y; o.h = s.h; o.scale = s.scale; o.rot = s.rot; }
    });
  }
  function snapEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      if (x.id !== y.id || x.x !== y.x || x.y !== y.y || x.h !== y.h || x.scale !== y.scale || x.rot !== y.rot) return false;
    }
    return true;
  }
  /* 手勢開始:拍下「動作前」快照;手勢結束:若真的變了才入堆疊(避免純點選塞垃圾步) */
  function beginGesture() { state._pre = snapshot(); }
  function commitGesture() {
    if (!state._pre) return;
    if (!snapEqual(state._pre, snapshot())) {
      state.undo.push(state._pre);
      if (state.undo.length > UNDO_MAX) state.undo.shift();    /* 超上限丟最舊 */
      updateUndoBtn();
    }
    state._pre = null;
  }
  function undo() {
    if (!state.undo.length) return;
    applySnapshot(state.undo.pop());                           /* 還原到上一步「動作前」 */
    renderStage(); refresh(); updateUndoBtn();
  }
  function updateUndoBtn() {
    var b = document.getElementById('bn-coedit-undo');
    if (!b) return;
    var empty = state.undo.length === 0;
    b.disabled = empty;
    b.style.opacity = empty ? '0.4' : '1';
    b.style.cursor = empty ? 'default' : 'pointer';
  }

  function openCoEdit() {
    if (products().length === 0 && persons().length === 0) return;
    state.objects = buildObjects();
    state.selection = null;

    var back = el('div', { id: 'bn-coedit-back' });
    back.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;' +
      'align-items:center;justify-content:center;font-family:-apple-system,system-ui,sans-serif';

    var modal = el('div');
    modal.style.cssText =
      'background:#242424;color:#e6e6e6;border:1px solid #3d3d3d;border-radius:12px;' +
      'width:min(720px,94vw);max-height:92vh;overflow:auto';
    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #3d3d3d">' +
        '<b style="font-size:15px">\u5546\u54c1\u5171\u7de8</b>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<button id="bn-coedit-undo" title="\u5fa9\u539f\uff08Ctrl+Z\uff09" style="background:transparent;border:1px solid #3d3d3d;color:#e6e6e6;font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer;opacity:0.4">\u21b6 \u5fa9\u539f</button>' +
          '<button id="bn-coedit-x" style="background:none;border:none;color:#a0a0a0;font-size:20px;cursor:pointer">\u00d7</button>' +
        '</div>' +
      '</div>' +
      '<div style="padding:16px">' +
        '<div style="font-size:12px;color:#a0a0a0;margin-bottom:8px">' +
          '\u5171\u7de8\u756b\u5e03\uff08720\u00d7720\u6b63\u65b9\u5f62\u30fb\u5e95\u8272\u8ddf\u96a8\u914d\u8272\u5668\uff09' +
        '</div>' +
        '<div style="display:flex;justify-content:center">' +
          '<div id="bn-coedit-stage"></div>' +
        '</div>' +
        '<div id="bn-coedit-selinfo" style="font-size:12px;color:#a0a0a0;margin:12px 0 6px">\u672a\u9078\u53d6\u7269\u4ef6</div>' +
        /* ★ 單張編輯入口:單選商品時啟用,多選/未選/人物時反灰(第1+2期:編輯=裁切/去背/擦除;換圖=手動替換) */
        '<div style="display:flex;gap:8px;margin-bottom:10px">' +
          '<button id="bn-coedit-edit" disabled title="\u88c1\u5207\u30fb\u53bb\u80cc\u30fb\u64e6\u9664\uff08\u55ae\u9078\u5546\u54c1\u6216\u4eba\u7269\uff09" style="padding:6px 12px;border:1px solid #3d3d3d;background:transparent;color:#e6e6e6;border-radius:6px;font-size:12px;cursor:pointer;opacity:0.4">\u270e \u7de8\u8f2f</button>' +
          '<button id="bn-coedit-swap" disabled title="\u624b\u52d5\u63db\u5716\uff08\u55ae\u9078\u5546\u54c1\u6216\u4eba\u7269\uff09" style="padding:6px 12px;border:1px solid #3d3d3d;background:transparent;color:#e6e6e6;border-radius:6px;font-size:12px;cursor:pointer;opacity:0.4">\u21bb \u63db\u5716</button>' +
          '<span id="bn-coedit-edithint" style="font-size:11px;color:#6f6f6f;align-self:center"></span>' +
        '</div>' +
        '<div style="font-size:11px;color:#6f6f6f;margin-bottom:12px;line-height:1.6">' +
          '點物件＝選取，Shift＋點＝多選，拖曳＝移動（多選則整組）；' +
          '選取後用<b style="color:#FFC107">四角錨點</b>縮放、<b style="color:#FFC107">頂部把手</b>旋轉（多選則群組整體、繞中心）。' +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
          '<button id="bn-coedit-safe" style="flex:1;padding:9px;border:2px solid #FFC107;background:transparent;color:#FFC107;border-radius:8px;font-weight:600;cursor:pointer">\u5957\u7528\u5230\u672a\u8abf\u6574\u7248\u4f4d</button>' +
          '<button id="bn-coedit-all" style="flex:1;padding:9px;border:1px solid #3d3d3d;background:transparent;color:#a0a0a0;border-radius:8px;font-weight:600;cursor:pointer">\u5168\u90e8\u5957\u7528</button>' +
        '</div>' +
        '<div id="bn-coedit-status" style="font-size:11px;color:#6f6f6f;margin-top:10px"></div>' +
      '</div>';

    back.appendChild(modal);
    document.body.appendChild(back);

    setupStage(document.getElementById('bn-coedit-stage'));
    renderStage();
    refresh();

    document.getElementById('bn-coedit-x').addEventListener('click', closeCoEdit);
    back.addEventListener('mousedown', function (e) { if (e.target === back) closeCoEdit(); });
    document.getElementById('bn-coedit-safe').addEventListener('click', function () { apply('safe'); });
    document.getElementById('bn-coedit-all').addEventListener('click', function () { apply('all'); });

    /* ★Undo:每次開啟為全新 session → 清空堆疊;綁按鈕與 Ctrl/⌘+Z 快捷鍵 */
    state.undo = []; state._pre = null;
    document.getElementById('bn-coedit-undo').addEventListener('click', undo);
    state.keyHandler = function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault(); undo();                          /* 僅 modal 開啟期間生效,關閉即移除 */
      }
    };
    document.addEventListener('keydown', state.keyHandler);
    updateUndoBtn();

    /* ★ 編輯:單選商品→商品編輯器、單選人物→人物編輯器;存回後回填共編 */
    document.getElementById('bn-coedit-edit').addEventListener('click', function () {
      var o = singleSel(); if (!o) return;
      var cb = function () { refreshObjectImage(o.id); };
      if (o.kind === 'person') {
        if (typeof global.openPersonEditor !== 'function') { alert('人物編輯器尚未就緒,請確認 bn-editor-plugin 已載入'); return; }
        var pe = persons().filter(function (p) { return p.id === o.id; })[0];
        if (pe) global.openPersonEditor(pe, cb);
      } else {
        if (typeof global.openProductEditor !== 'function') { alert('編輯器尚未就緒,請確認 bn-editor-plugin 已載入'); return; }
        global.openProductEditor(o.id, cb);
      }
    });
    /* ★ 換圖:選新檔 → 依 kind 手動替換該物件圖,存回後回填共編 */
    document.getElementById('bn-coedit-swap').addEventListener('click', function () {
      var o = singleSel(); if (!o) return;
      var swapFn = (o.kind === 'person') ? global.replacePersonImage : global.replaceProductImage;
      if (typeof swapFn !== 'function') { alert('換圖功能尚未就緒,請確認 bn-editor-plugin 已載入'); return; }
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) { inp.remove(); return; }
        var rd = new FileReader();
        rd.onload = function () { swapFn(o.id, rd.result, function () { refreshObjectImage(o.id); }); inp.remove(); };
        rd.onerror = function () { alert('讀取檔案失敗'); inp.remove(); };
        rd.readAsDataURL(f);
      });
      document.body.appendChild(inp); inp.click();
    });
  }
  function closeCoEdit() {
    if (state.keyHandler) { document.removeEventListener('keydown', state.keyHandler); state.keyHandler = null; }  /* ★Undo 防洩漏 */
    saveCoEditState();                 /* 關閉即記住,下次開啟保留最後一步 */
    var b = document.getElementById('bn-coedit-back');
    if (b) b.remove();
  }

  /* ---- 畫布渲染 -------------------------------------------------------- */
  var stageEl = null;
  function safeRect() { var s = STAGE * SAFE, off = (STAGE - s) / 2; return { x: off, y: off, s: s }; }

  /* 把顏色字串的 alpha 換成指定值(對應版位 --shadow-alpha);支援 hex 與 rgb/rgba,解析失敗回原字串 */
  function withAlpha(color, a) {
    var c = String(color).trim();
    var hm = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);        /* hex:配色器的 shadowColor 是 hex */
    if (hm) {
      var h = hm[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    var m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
    return color;
  }
  /* 依直播時縮圖參數在共編 canvas 繪背景幾何陰影——與 layout-runtime 的 bn-color-ext
     同一套「梯形主體 + 水平漸層 + blur + 下緣淡出 + 左斜邊羽化」演算法(B 方案・非近似)。 */
  function drawCoeditShadow(cv) {
    if (!cv || !cv.getContext) return;               /* 防呆:取不到 canvas/context 就靜默不畫 */
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var W = cv.width, H = cv.height, s = SH720;       /* 內部解析度 = 720,與直播時縮圖一致 */
    ctx.clearRect(0, 0, W, H);
    var rgba = withAlpha(colorSh(), s.alpha);         /* 顏色跟配色器,alpha 鎖 --shadow-alpha(0.4) */
    var bottomPx = Math.min(H * s.bottomY / 100, H);
    var topPx    = H * s.topY / 100;

    /* 第一階段:主體梯形填色(水平漸層 透明→rgba);blur 用 ctx.filter 烘入 */
    if (typeof ctx.filter !== 'undefined') ctx.filter = s.blur > 0 ? 'blur(' + s.blur + 'px)' : 'none';
    ctx.beginPath();
    ctx.moveTo(W * s.leftX  / 100, topPx);            /* 左上 */
    ctx.lineTo(W,                  topPx);            /* 右上 */
    ctx.lineTo(W,                  bottomPx);          /* 右下 */
    ctx.lineTo(W * s.slantX / 100, bottomPx);          /* 左下(斜角) */
    ctx.closePath();
    var grad = ctx.createLinearGradient(W * s.gradFrom / 100, 0, W, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, rgba);
    ctx.fillStyle = grad; ctx.fill();

    /* 第二階段:下緣垂直淡出(destination-in 乘算 alpha,上緣不受影響) */
    if (s.bottomFade > 0) {
      if (typeof ctx.filter !== 'undefined') ctx.filter = 'none';
      ctx.globalCompositeOperation = 'destination-in';
      var fadeStart = bottomPx - (bottomPx - topPx) * (s.bottomFade / 100);
      var vG = ctx.createLinearGradient(0, fadeStart, 0, bottomPx);
      vG.addColorStop(0, 'rgba(0,0,0,1)'); vG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vG; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    /* 第三階段:左斜邊羽化(沿斜邊法向量向內漸隱) */
    if (s.leftFade > 0) {
      var ex1 = W * s.leftX  / 100, ey1 = topPx;
      var ex2 = W * s.slantX / 100, ey2 = bottomPx;
      var dX = ex2 - ex1, dY = ey2 - ey1, len = Math.sqrt(dX * dX + dY * dY) || 1;
      var pX = dY / len, pY = -dX / len;              /* 法向量:指向多邊形內側 */
      if (typeof ctx.filter !== 'undefined') ctx.filter = 'none';
      ctx.globalCompositeOperation = 'destination-in';
      var eG = ctx.createLinearGradient(ex1, ey1, ex1 + pX * s.leftFade, ey1 + pY * s.leftFade);
      eG.addColorStop(0, 'rgba(0,0,0,0)'); eG.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = eG; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (typeof ctx.filter !== 'undefined') ctx.filter = 'none';
  }
  function setupStage(node) {
    stageEl = node;
    node.style.cssText =
      'position:relative;width:' + STAGE + 'px;height:' + STAGE + 'px;border-radius:8px;overflow:hidden;' +
      'background:' + colorBg() + ';user-select:none;touch-action:none';
    /* 陰影:B 方案・非近似——canvas 複製直播時縮圖(720×720)的幾何陰影(見 drawCoeditShadow)。
       內部解析度 720、CSS 縮到 STAGE;z-index:1 → 在底色之上、物件(z10/20)之下。 */
    node.innerHTML =
      '<canvas id="bn-coedit-shadow" width="' + SH720.size + '" height="' + SH720.size + '" ' +
        'style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1"></canvas>' +
      /* ★#3源頭 原本此 div 的 id 與「套用到未調整版位」按鈕(L131)重複,DOM 順序又在按鈕之前,
         導致 getElementById('bn-coedit-safe') 抓到這個 pointer-events:none 的框、click 綁不到按鈕
         → safe 從不觸發、一則廣播都沒送。改名為 bn-coedit-safezone 徹底分離。 */
      '<div id="bn-coedit-safezone" style="position:absolute;border:1.5px dashed #1D9E75;border-radius:4px;pointer-events:none;z-index:2"></div>';
    var _shCv = document.getElementById('bn-coedit-shadow');
    if (_shCv) drawCoeditShadow(_shCv);              /* 開啟當下讀 colorState 繪一次(同現有底色行為) */
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', function () {
      if (state.dragging) { state.dragging = null; commitGesture(); }   /* ★Undo:拖曳結束,變了才入堆疊 */
    });
    /* 建立共用錨點層（縮放/旋轉），透過 callback 讀寫 state.objects */
    state.anchor = (global.AnchorTransform && global.AnchorTransform.create)
      ? global.AnchorTransform.create(node) : null;
  }
  function renderStage() {
    var r = safeRect();
    var safe = document.getElementById('bn-coedit-safezone');
    if (safe) {
      /* SAFE>=1 時安全區=整個畫布,虛線框會貼齊邊界被 overflow 半截切,故隱藏;<1 才顯示內縮框 */
      if (SAFE >= 1) { safe.style.display = 'none'; }
      else { safe.style.display = 'block'; safe.style.left = r.x + 'px'; safe.style.top = r.y + 'px'; safe.style.width = r.s + 'px'; safe.style.height = r.s + 'px'; }
    }
    Array.prototype.slice.call(stageEl.querySelectorAll('.bn-coedit-obj')).forEach(function (n) { n.remove(); });
    state.objects.forEach(function (o) {
      var hpx = o.h * r.s * o.scale;
      var wpx = hpx * (o.ratio || (o.kind === 'person' ? 0.5 : 0.7));
      var cx = r.x + o.x * r.s, cy = r.y + o.y * r.s;
      var sel = state.selection && state.selection.indexOf(o.id) !== -1;
      var box = el('div', { 'class': 'bn-coedit-obj', 'data-id': o.id });
      box.style.cssText =
        'position:absolute;transform-origin:center center;cursor:move;' +
        'left:' + (cx - wpx / 2) + 'px;top:' + (cy - hpx / 2) + 'px;width:' + wpx + 'px;height:' + hpx + 'px;' +
        'transform:rotate(' + o.rot + 'deg);z-index:' + (o.kind === 'person' ? 20 : 10) + ';' +
        (sel ? 'outline:2px solid #FFC107;outline-offset:2px;border-radius:4px' : '');
      var img = el('img');
      img.src = o.src || '';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;display:block';
      img.onerror = function () { box.style.background = 'rgba(255,255,255,.15)'; };  /* 圖載入失敗佔位 */
      box.appendChild(img);
      stageEl.appendChild(box);
    });
  }

  /* ---- 選取 + 拖曳 ----------------------------------------------------- */
  function onDown(e) {
    var t = e.target.closest ? e.target.closest('.bn-coedit-obj') : null;
    if (!t) { if (!e.shiftKey) { state.selection = null; refresh(); } return; }
    var id = t.getAttribute('data-id');
    if (e.shiftKey) {
      state.selection = state.selection || [];
      var k = state.selection.indexOf(id);
      if (k === -1) state.selection.push(id); else state.selection.splice(k, 1);
      refresh(); return;
    }
    if (!state.selection || state.selection.indexOf(id) === -1) { state.selection = [id]; refresh(); }
    var r = safeRect();
    beginGesture();                    /* ★Undo:拖曳開始前拍快照 */
    state.dragging = {
      sx: e.clientX, sy: e.clientY, s: r.s,
      orig: selectedObjs().map(function (o) { return { o: o, x: o.x, y: o.y }; })
    };
    try { stageEl.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function onMove(e) {
    if (!state.dragging) return;
    var dx = (e.clientX - state.dragging.sx) / state.dragging.s;
    var dy = (e.clientY - state.dragging.sy) / state.dragging.s;
    var orig = state.dragging.orig;
    /* ★#2 邊界改以「物件邊緣」為準:先套原始位移,再把整個選取(含邊緣)整塊夾回畫布——
       群組整塊卡住、隊形不變。orig 為起始快照,每次 move 都由 orig+delta 重算,無累積誤差。
       (原本夾的是中心點在 [0,1],物件會半截凸出畫布,即回報的邊界超出現象) */
    orig.forEach(function (rec) { rec.o.x = rec.x + dx; rec.o.y = rec.y + dy; });
    clampObjsIntoCanvas(orig.map(function (rec) { return rec.o; }), safeRect());
    renderStage(); repositionAnchor();
  }
  function selectedObjs() {
    if (!state.selection) return [];
    return state.objects.filter(function (o) { return state.selection.indexOf(o.id) !== -1; });
  }
  function groupCenter(sel) {
    var x = 0, y = 0; sel.forEach(function (o) { x += o.x; y += o.y; });
    return { x: x / sel.length, y: y / sel.length };
  }

  /* ★#2 邊界工具:以「物件邊緣」為準(含各自半寬高,相對畫布 0..1),
     而非中心點——中心夾在 [0,1] 會讓物件半截凸出畫布。 */
  function objHalfRel(o, r) {
    var ratio = o.ratio || (o.kind === 'person' ? 0.5 : 0.7);
    var hpx = o.h * r.s * o.scale, wpx = hpx * ratio;
    return { hw: (wpx / 2) / r.s, hh: (hpx / 2) / r.s };
  }
  /* ★ 2026-08:改為與主畫布(layout-runtime.js 的 _clampDelta)【完全相同】的政策。
     ────────────────────────────────────────────────────────────────
     舊政策是硬夾:左右鎖死、上緣鎖死、下緣放開。使用者回報「共編器的拖曳
     也會被限縮」,而且與主畫布的手感不一致(主畫布已改為自由拖曳)。

     新政策:手動拖曳完全自由,可以拖出畫布;只保留一條救援規則 ——
     整組至少要有 KEEP_GRAB_PX 留在畫布內,否則就再也點不到、抓不回來。
     這條規則同時自然涵蓋「人物下半身可外溢」的設計效果(上緣還在畫布內即可),
     所以不再需要「下緣放開」的特例分支。

     ★ 仍然是「夾群組外框、對所有成員套用同一位移」→ 隊形剛性不變。
     ★ 只作用於手動拖曳;套用到各版位(apply)是直接換算座標,不經過這裡。 */
  var KEEP_GRAB_PX = 48;
  function clampObjsIntoCanvas(objs, r) {
    if (!objs || !objs.length) return;
    var minL = Infinity, maxR = -Infinity, minT = Infinity, maxB = -Infinity;
    objs.forEach(function (o) {
      var e = objHalfRel(o, r);
      if (o.x - e.hw < minL) minL = o.x - e.hw;
      if (o.x + e.hw > maxR) maxR = o.x + e.hw;
      if (o.y - e.hh < minT) minT = o.y - e.hh;
      if (o.y + e.hh > maxB) maxB = o.y + e.hh;
    });
    /* 座標是「相對整個畫布」的 0..1,故把 px 門檻換算成相對量 */
    var keepRel = (r && r.s) ? (KEEP_GRAB_PX / r.s) : 0.06;
    var keepX = Math.min(keepRel, maxR - minL);   /* 群組比門檻還小時用它自己的尺寸 */
    var keepY = Math.min(keepRel, maxB - minT);
    var dx = 0, dy = 0;
    if (maxR < keepX)          dx = keepX - maxR;        /* 整組跑到左邊界外 → 拉回一小塊 */
    else if (minL > 1 - keepX) dx = (1 - keepX) - minL;  /* 整組跑到右邊界外 */
    if (maxB < keepY)          dy = keepY - maxB;        /* 整組跑到上緣外 */
    else if (minT > 1 - keepY) dy = (1 - keepY) - minT;  /* 整組跑到下緣外 */
    if (dx || dy) objs.forEach(function (o) { o.x += dx; o.y += dy; });
  }

  /* ---- 錨點變形（單選=物件本身；多選=群組 bbox，繞中心） -------------- */
  /* 選取範圍在畫布內的 px bounding box（未旋轉外框近似，足供錨點框定位） */
  function selBBoxPx() {
    var r = safeRect(), sel = selectedObjs();
    var minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
    sel.forEach(function (o) {
      var hpx = o.h * r.s * o.scale, wpx = hpx * (o.ratio || (o.kind === 'person' ? 0.5 : 0.7));
      var cx = r.x + o.x * r.s, cy = r.y + o.y * r.s;
      var l = cx - wpx / 2, t = cy - hpx / 2;
      if (l < minL) minL = l; if (t < minT) minT = t;
      if (l + wpx > maxR) maxR = l + wpx; if (t + hpx > maxB) maxB = t + hpx;
    });
    return { x: minL, y: minT, w: maxR - minL, h: maxB - minT };
  }
  function repositionAnchor() {
    if (state.anchor && selectedObjs().length) state.anchor.reposition(selBBoxPx());
  }
  function updateAnchor() {
    if (!state.anchor) return;
    if (selectedObjs().length === 0) { state.anchor.hide(); return; }
    state.anchor.show(selBBoxPx(), {
      onStart: function () {
        beginGesture();                              /* ★Undo:縮放/旋轉開始前拍快照 */
        state.aStart = selectedObjs().map(function (o) {
          return { o: o, x: o.x, y: o.y, scale: o.scale, rot: o.rot };
        });
        state.aCenter = groupCenter(selectedObjs());
      },
      onResize: function (factor, ax, ay) {            /* 等比、對角固定;ax/ay=固定對角(host px) */
        if (!state.aStart) return;
        var r = safeRect();
        var aRelX = (ax - r.x) / r.s, aRelY = (ay - r.y) / r.s;   /* 固定對角 → 畫布 0..1 */

        /* ★#1 統一縮放上限(下緣放開版):以「寬 ≤ 畫布」為每顆的上限——左右仍鎖,
           高度隨等比自然放寬(上界=畫布/ratio,人物 ratio≈0.5→高最多約 2× 畫布,有界不無限)。
           取所有成員最嚴格(最小)者當群組共用上限,單選/群組都夾同一個 fac、隊形比例不變。 */
        var maxFactor = Infinity, MIN_FACTOR = 0.05;
        state.aStart.forEach(function (s) {
          var o = s.o;
          var ratio = o.ratio || (o.kind === 'person' ? 0.5 : 0.7);
          var denom = o.h * r.s * ratio;                         /* ★改用「寬」:o.h×ratio=寬(相對) */
          if (denom <= 0) return;                                /* 防呆:ratio/h 為 0 時跳過(避免除以 0) */
          var maxScale = STAGE / denom;                          /* 此成員最大 scale(寬 ≤ 畫布) */
          var f = maxScale / (s.scale || 1);                     /* 換算成相對起始的倍率上限 */
          if (f < maxFactor) maxFactor = f;                      /* 取最嚴格者 */
        });
        /* ★#1修正 群組外框上限:逐成員上限只保證「每顆寬」不超畫布,但群組放大時成員往外散開,
           整個外框仍可能超出左右邊界(平移夾不回來)。這裡用【起始群組外框寬】算出
           「外框放大後剛好=畫布寬」的倍率 1/Wr 併入上限。高度不夾(下緣放開)。 */
        var gMinL = Infinity, gMaxR = -Infinity;
        state.aStart.forEach(function (s) {
          var o = s.o, ratio = o.ratio || (o.kind === 'person' ? 0.5 : 0.7);
          var hpx = o.h * r.s * s.scale, wpx = hpx * ratio;      /* 起始尺寸(用起始 scale) */
          var hw = (wpx / 2) / r.s;
          if (s.x - hw < gMinL) gMinL = s.x - hw;
          if (s.x + hw > gMaxR) gMaxR = s.x + hw;
        });
        var Wr = gMaxR - gMinL;                                  /* 起始群組外框寬(相對畫布) */
        if (Wr > 0) maxFactor = Math.min(maxFactor, 1 / Wr);    /* 放大後寬 ≤ 畫布(左右鎖) */
        /* ★不夾高:下緣放開,群組可比畫布高、往下凸出 */

        var fac = Math.min(factor, maxFactor);                   /* ★ 夾住上限:群組外框亦然 */
        if (!isFinite(fac)) fac = factor;                        /* 無有效上限時退回原倍率 */
        fac = Math.max(fac, MIN_FACTOR);                         /* 防塌縮到近乎消失 */

        state.aStart.forEach(function (s) {
          var o = s.o;
          o.scale = Math.max(0.1, s.scale * fac);
          o.x = aRelX + (s.x - aRelX) * fac;                     /* 相對固定對角縮放(對角固定) */
          o.y = aRelY + (s.y - aRelY) * fac;
        });

        /* ★#2 縮放後把整個選取(含邊緣)整塊夾回畫布:單選=size 1 的群組,行為等同「單物件邊界感」;
           群組則整塊位移、隊形不變(不各自夾以免壓扁重疊)。與 onMove 共用同一支邊緣夾。 */
        clampObjsIntoCanvas(state.aStart.map(function (s) { return s.o; }), r);
        renderStage(); repositionAnchor();
      },
      onRotate: function (deg) {                        /* deg=相對起始的累積角度 */
        if (!state.aStart) return;
        var grp = state.aStart.length > 1, c = state.aCenter, rad = deg * Math.PI / 180;
        state.aStart.forEach(function (s) {
          s.o.rot = s.rot + deg;                        /* 自身自轉 */
          if (grp) {                                    /* 群組:位置繞中心公轉 */
            var dx = s.x - c.x, dy = s.y - c.y;
            s.o.x = c.x + dx * Math.cos(rad) - dy * Math.sin(rad);
            s.o.y = c.y + dx * Math.sin(rad) + dy * Math.cos(rad);
          }
        });
        renderStage(); repositionAnchor();
      },
      onEnd: function () { state.aStart = null; commitGesture(); }   /* ★Undo:縮放/旋轉結束,變了才入堆疊 */
    });
  }
  function refresh() {
    renderStage();
    var info = document.getElementById('bn-coedit-selinfo');
    var sel = selectedObjs();
    if (info) {
      if (sel.length === 0)       info.textContent = '\u672a\u9078\u53d6\u7269\u4ef6';
      else if (sel.length === 1)  info.textContent = '\u5df2\u9078\uff1a' + (sel[0].label || sel[0].id);
      else                        info.textContent = '\u5df2\u9078 ' + sel.length + ' \u500b\uff08\u7fa4\u7d44\u8b8a\u5f62\u3001\u7e5e\u4e2d\u5fc3\uff09';
    }
    updateAnchor();
    updateEditButtons();
  }

  /* ★ 單張編輯/換圖:僅在「單選 1 個」時啟用(商品或人物皆可);多選/未選一律反灰。 */
  function singleSel() {
    var sel = selectedObjs();
    return (sel.length === 1) ? sel[0] : null;
  }
  function updateEditButtons() {
    var eb = document.getElementById('bn-coedit-edit');
    var sb = document.getElementById('bn-coedit-swap');
    var hint = document.getElementById('bn-coedit-edithint');
    if (!eb || !sb) return;
    var o = singleSel();
    var on = !!o;
    [eb, sb].forEach(function (b) {
      b.disabled = !on;
      b.style.opacity = on ? '1' : '0.4';
      b.style.cursor = on ? 'pointer' : 'default';
    });
    if (hint) {
      var sel = selectedObjs();
      hint.textContent = on ? '' : (sel.length > 1 ? '(多選時無法編輯單張)' : '');
    }
  }
  /* 編輯/換圖存回後回填共編:重讀該物件(商品或人物)最新 src/ratio → 更新共編物件 → 重繪 */
  function refreshObjectImage(id) {
    var entry = products().filter(function (p) { return p.id === id; })[0]
             || persons().filter(function (p) { return p.id === id; })[0];
    if (!entry) return;
    state.objects.forEach(function (o) {
      if (o.id === id) { o.src = entry.src; o.ratio = entry.ratio || o.ratio; }
    });
    renderStage();
  }

  /* ---- 套用：把共編畫布的隊形(相對整個畫布 0..1)廣播,各版位等比縮放進商品範圍 ---- */
  function apply(mode) {
    var r = safeRect();
    var items = state.objects.map(function (o) {
      var hpx = o.h * r.s * o.scale;
      var wpx = hpx * (o.ratio || (o.kind === 'person' ? 0.5 : 0.7));
      var cx = r.x + o.x * r.s, cy = r.y + o.y * r.s;
      /* 中心與大小一律換算成「相對整個共編畫布(STAGE)」0..1;各版位等比縮放即得
         與編輯畫面一致的隊形(不再有 safe/hRel×scale 等額外條件) */
      return { id: o.id, kind: o.kind,
        cx: cx / STAGE, cy: cy / STAGE, wRel: wpx / STAGE, hRel: hpx / STAGE, rot: o.rot };
    });
    broadcast({ type: 'bn-coedit-apply', mode: mode, items: items });
    saveCoEditState();                 /* 套用即記住 */
    var st = document.getElementById('bn-coedit-status');
    if (st) st.textContent = (mode === 'all'
      ? '已全部套用（含已微調版位）。'
      : '已套用到未調整版位。') +
      '（已廣播 bn-coedit-apply；各版位接收為下一批）';
  }

  /* ---- 啟動：插入入口按鈕 + 監聽商品/人物清單變化以切換顯示 ------------ */
  var _obsAttached = { prod: false, person: false };
  function attachObserver(id, key) {
    if (_obsAttached[key]) return;                 /* 已掛過就不重複 */
    var node = document.getElementById(id);
    if (!node) return;
    if (global.MutationObserver) new MutationObserver(ensureEntryButton).observe(node, { childList: true });
    _obsAttached[key] = true;
  }
  function boot() {
    ensureEntryButton();
    attachObserver('bn-prod-list', 'prod');        /* 商品清單 */
    attachObserver('bn-person-list', 'person');    /* ★ 人物清單:只上傳人物也要觸發顯示 */
    /* 清單區可能較晚建立：輪詢直到兩個清單都掛上 observer(最多 ~10 秒) */
    if (!_obsAttached.prod || !_obsAttached.person) {
      var tries = 0, t = setInterval(function () {
        tries++;
        ensureEntryButton();
        attachObserver('bn-prod-list', 'prod');
        attachObserver('bn-person-list', 'person');
        if ((_obsAttached.prod && _obsAttached.person) || tries > 20) clearInterval(t);
      }, 500);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  /* 對外：供 bn-editor 在 renderProdList 後主動同步（可選，非必要） */
  global.BNCoEdit = { syncEntry: ensureEntryButton, open: openCoEdit };

})(window);
