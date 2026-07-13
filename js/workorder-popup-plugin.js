/* ══════════════════════════════════════════════════════════════
   workorder-popup-plugin.js
   ★ 開啟編輯器後彈出「上傳工單」引導 POPUP（父層外掛，掛在 bn.html）
   ★ 設計原則：不重寫任何解析邏輯，只「驅動既有 UI 流程」
       - 上傳工單 → 把 File 灌進既有 #wo-file-input 並 dispatch change
                    （既有 handleWoFile → 解析鏈 → #wo-status 觀察者全部原封不動觸發）
       - 上傳暫存 → 直接呼叫既有 window._bnStatePlugin.apply()
       - 略過     → 純關閉，同 session 不再彈出
   ★ 載入順序：必須排在 bn-state-plugin.js 之後（確保 #wo-file-input 與
                _bnStatePlugin 已就緒）。
       <script src="js/workorder-popup-plugin.js"></script>
   字體規範：本 POPUP 會渲染中文 UI 文字，依鐵律以 FontFace 非同步預載
            ShopeeNotoSans (content) Medium/Bold，載入完成（或逾時 fallback）
            後才顯示，避免 FOUT。
══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CONFIG = {
    /* 依專案鐵律指定的字體來源（絕對路徑，避免父層相對路徑不確定） */
    fontFamily: 'ShopeeNotoSans (content)',
    fontBase: 'https://jimmywu-commits.github.io/shopee/fonts/',
    fontFiles: {
      '400': 'ShopeeNotoSans(content)-Medium.ttf', /* 主標/時間 = Medium */
      '700': 'ShopeeNotoSans(content)-Bold.ttf'    /* 副標 = Bold */
    },
    fontTimeoutMs: 2500,        /* 字體逾時保護：CDN 抽風時不卡死整個編輯器 */
    inputPollTries: 20,         /* #wo-file-input 尚未建立時的輪詢次數 */
    inputPollIntervalMs: 120,
    ids: {
      overlay: 'wo-popup-overlay',
      card:    'wo-popup-card',
      style:   'wo-popup-style',
      woInput: 'wo-popup-file',   /* POPUP 自己的隱藏 xlsx input */
      stInput: 'wo-popup-state',  /* POPUP 自己的隱藏 json  input */
      errBox:  'wo-popup-err'
    }
  };

  var state = { inited: false, config: CONFIG, shown: false };

  /* ── 小工具 ─────────────────────────────────────────── */
  function byId(id) { return document.getElementById(id); }

  /* 統一 toast：優先用專案既有的通知函式，否則退回 console */
  function notify(msg, type) {
    try {
      if (typeof global.showToast === 'function') { global.showToast(msg, type || ''); return; }
      if (global._bnStatePlugin && typeof global._bnStatePlugin.toast === 'function') {
        global._bnStatePlugin.toast(msg, type || ''); return;
      }
    } catch (e) { /* 靜默退回 console */ }
    if (type === 'err') console.error('[WOPopup]', msg);
    else console.log('[WOPopup]', msg);
  }

  /* ★ 「已顯示」旗標改用記憶體變數，而非 sessionStorage：
     F5 / 重新載入 = 全新頁面，state.shown 自動歸 false → 每次載入都會重彈。
     同一次頁面生命週期內（例如程式其他地方又呼叫 open）則不重複自動彈出。*/
  function markShown() { state.shown = true; }
  function alreadyShown() { return state.shown === true; }

  /* ── 字體預載（鐵律：渲染文字前非同步預載，載完才顯示）─────── */
  function preloadFonts() {
    /* 不支援 FontFace API 時直接放行，避免整個 POPUP 無法顯示 */
    if (!global.FontFace || !document.fonts || !document.fonts.add) {
      return Promise.resolve('unsupported');
    }
    var loads = Object.keys(CONFIG.fontFiles).map(function (weight) {
      var url = CONFIG.fontBase + CONFIG.fontFiles[weight];
      var ff = new global.FontFace(CONFIG.fontFamily, 'url("' + url + '") format("truetype")', { weight: weight });
      return ff.load().then(function (loaded) { document.fonts.add(loaded); return loaded; });
    });
    /* 逾時保護：任一情況先到就放行，字體最終仍會在背景載入 */
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve('timeout'); }, CONFIG.fontTimeoutMs); });
    return Promise.race([Promise.all(loads).catch(function (e) { return 'error:' + e; }), timeout]);
  }

  /* ── 樣式（沿用專案深色玻璃態視覺語言，與 manual-plugin 一致）──── */
  function injectStyle() {
    if (byId(CONFIG.ids.style)) return;
    var s = document.createElement('style');
    s.id = CONFIG.ids.style;
    s.textContent = [
      '#' + CONFIG.ids.overlay + '{position:fixed;inset:0;z-index:100000;display:none;',
      '  align-items:center;justify-content:center;padding:24px;',
      '  background:rgba(0,0,0,.72);backdrop-filter:blur(6px);',
      '  font-family:"' + CONFIG.fontFamily + '",system-ui,"Noto Sans TC",sans-serif;}',
      '#' + CONFIG.ids.overlay + '.wo-open{display:flex;}',
      '#' + CONFIG.ids.card + '{width:min(420px,92vw);background:rgba(13,16,24,.96);',
      '  border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:26px 24px 22px;',
      '  box-shadow:0 30px 90px rgba(0,0,0,.55);color:#e6e8ec;text-align:center;',
      '  transform:translateY(8px);opacity:0;transition:.22s ease;}',
      '#' + CONFIG.ids.overlay + '.wo-open #' + CONFIG.ids.card + '{transform:translateY(0);opacity:1;}',
      '.wo-title{font-size:18px;font-weight:700;letter-spacing:.5px;margin-bottom:6px;}',
      '.wo-sub{font-size:12px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:20px;}',
      /* 主按鈕：上傳工單（最大、最醒目，可點可拖曳） */
      '.wo-main{display:block;position:relative;width:100%;padding:22px 16px;cursor:pointer;',
      '  border:1.6px dashed rgba(74,144,226,.55);border-radius:14px;',
      '  background:rgba(74,144,226,.10);transition:.16s;}',
      '.wo-main:hover,.wo-main.wo-dragover{border-color:#4a90e2;background:rgba(74,144,226,.20);transform:translateY(-1px);}',
      '.wo-main .wo-ic{font-size:30px;line-height:1;margin-bottom:8px;}',
      '.wo-main .wo-mt{font-size:15px;font-weight:700;}',
      '.wo-main .wo-mh{font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;}',
      /* 下方兩顆小按鈕並排 */
      '.wo-minor{display:flex;gap:10px;margin-top:14px;}',
      '.wo-minor .wo-mbtn{flex:1;position:relative;padding:10px 8px;cursor:pointer;',
      '  border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.04);',
      '  color:rgba(255,255,255,.72);font-size:12px;font-weight:600;transition:.14s;',
      '  display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;}',
      '.wo-minor .wo-mbtn:hover{border-color:#4a90e2;color:#fff;background:rgba(74,144,226,.14);}',
      '.wo-hidden-input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}',
      '#' + CONFIG.ids.errBox + '{min-height:16px;margin-top:12px;font-size:11px;color:#ff6b6b;line-height:1.5;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── 建立 DOM ─────────────────────────────────────────── */
  function buildDom() {
    if (byId(CONFIG.ids.overlay)) return;
    var overlay = document.createElement('div');
    overlay.id = CONFIG.ids.overlay;
    overlay.innerHTML = [
      '<div id="' + CONFIG.ids.card + '" role="dialog" aria-modal="true" aria-label="上傳工單">',
      '  <div class="wo-title">開始製作橫幅</div>',
      '  <div class="wo-sub">上傳本次的工單 .xlsx，系統會自動帶入主標／副標／日期／色碼等欄位。</div>',
      /* 主按鈕：上傳工單 */
      '  <label class="wo-main" id="wo-popup-main">',
      '    <div class="wo-ic">📊</div>',
      '    <div class="wo-mt">上傳工單 .xlsx</div>',
      '    <div class="wo-mh">點擊選擇，或直接把檔案拖曳到這裡</div>',
      '    <input type="file" id="' + CONFIG.ids.woInput + '" class="wo-hidden-input" accept=".xlsx,.xls">',
      '  </label>',
      /* 下方兩顆小按鈕 */
      '  <div class="wo-minor">',
      '    <button type="button" class="wo-mbtn" id="wo-popup-skip">略過</button>',
      '    <label class="wo-mbtn" id="wo-popup-state-btn">⬆ 上傳暫存',
      '      <input type="file" id="' + CONFIG.ids.stInput + '" class="wo-hidden-input" accept=".json">',
      '    </label>',
      '  </div>',
      '  <div id="' + CONFIG.ids.errBox + '"></div>',
      '</div>'
    ].join('\n');
    document.body.appendChild(overlay);
  }

  function setErr(msg) {
    var box = byId(CONFIG.ids.errBox);
    if (box) box.textContent = msg || '';
  }

  /* ── 核心：把 File 灌進既有 #wo-file-input ──────────────────
     ★ 每次都用 id 重新查詢：handleWoFile 首次成功後會 innerHTML 重建
       drop-zone 並產生「新的」#wo-file-input，快取舊參照會失效。 */
  function forwardWorkorder(file, tries) {
    tries = tries || 0;
    var input = byId('wo-file-input');
    if (!input) {
      /* 側欄可能尚未建立完成 → 有限次數輪詢後放棄，給明確錯誤而非靜默失敗 */
      if (tries < CONFIG.inputPollTries) {
        setTimeout(function () { forwardWorkorder(file, tries + 1); }, CONFIG.inputPollIntervalMs);
        return;
      }
      setErr('找不到工單上傳欄位，請改用左側「匯入工單」區塊上傳。');
      notify('工單 POPUP：#wo-file-input 未就緒', 'err');
      return;
    }
    try {
      /* 用 DataTransfer 合成 FileList 塞進 input，再派發 change，
         等同使用者親手選檔 → 觸發既有 handleWoFile 完整解析鏈 */
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close(true);
    } catch (err) {
      /* 少數瀏覽器不允許程式化寫入 input.files → 退而求其次：
         暫存檔案並提示改用側欄，不讓使用者卡死 */
      global._bnPendingWorkorder = file;
      setErr('此瀏覽器不支援自動代入，請改用左側「匯入工單」上傳同一檔案。');
      notify('工單 POPUP：input.files 寫入失敗 → ' + (err && err.message), 'err');
    }
  }

  /* ── 核心：上傳暫存 → 呼叫既有 applyState ────────────────── */
  function forwardState(file) {
    var apply = global._bnStatePlugin && global._bnStatePlugin.apply;
    if (typeof apply !== 'function') {
      setErr('暫存還原模組尚未載入，請稍候再試或使用左側「⬆ 上傳暫存」。');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        apply(JSON.parse(e.target.result)); /* 直接複用既有還原流程，含 rebroadcastRetry */
        notify('暫存已載入', 'ok');
        close(true);
      } catch (err) {
        /* 不靜默吞例外：印出真正錯誤，方便回頭排查 */
        console.error('[WOPopup] 暫存還原失敗：', err);
        setErr('暫存還原失敗：' + (err && err.message ? err.message : '未知錯誤') + '（詳情見主控台）');
      }
    };
    reader.onerror = function () {
      console.error('[WOPopup] 讀取暫存檔失敗', reader.error);
      setErr('讀取檔案失敗，請確認檔案未損毀。');
    };
    reader.readAsText(file);
  }

  /* ── 開關 ─────────────────────────────────────────────── */
  function open() {
    var overlay = byId(CONFIG.ids.overlay);
    if (overlay) overlay.classList.add('wo-open');
  }
  function close(persist) {
    var overlay = byId(CONFIG.ids.overlay);
    if (overlay) overlay.classList.remove('wo-open');
    if (persist !== false) markShown(); /* 同 session 不再自動彈出 */
  }

  /* ── 事件綁定 ──────────────────────────────────────────── */
  function bindEvents() {
    var overlay = byId(CONFIG.ids.overlay);
    var main    = byId('wo-popup-main');
    var woInput = byId(CONFIG.ids.woInput);
    var skip    = byId('wo-popup-skip');
    var stInput = byId(CONFIG.ids.stInput);
    if (!overlay) return;

    /* 上傳工單：選檔 */
    if (woInput) woInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) forwardWorkorder(f);
    });

    /* 上傳工單：拖曳到主按鈕 */
    if (main) {
      main.addEventListener('dragover', function (e) { e.preventDefault(); main.classList.add('wo-dragover'); });
      main.addEventListener('dragleave', function () { main.classList.remove('wo-dragover'); });
      main.addEventListener('drop', function (e) {
        e.preventDefault(); main.classList.remove('wo-dragover');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) {
          if (!/\.xlsx?$/i.test(f.name)) { setErr('請上傳 .xlsx 或 .xls 格式的工單。'); return; }
          forwardWorkorder(f);
        }
      });
    }

    /* 略過 */
    if (skip) skip.addEventListener('click', function () { close(true); });

    /* 上傳暫存 */
    if (stInput) stInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) forwardState(f);
    });

    /* 點遮罩空白處 / 按 ESC = 略過（僅在 POPUP 開啟時） */
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('wo-open')) close(true);
    });
  }

  /* ── 初始化 ────────────────────────────────────────────── */
  function init(opts) {
    if (state.inited) return;
    if (opts) CONFIG = Object.assign(CONFIG, opts);
    injectStyle();
    buildDom();
    bindEvents();
    state.inited = true;
    /* 字體載入完成（或逾時）後才顯示，避免 FOUT；同 session 已顯示過則不再彈 */
    if (!alreadyShown()) {
      preloadFonts().then(function () { open(); });
    }
  }

  /* 對外接口 */
  global.WorkorderPopupPlugin = {
    init: init,
    open: function () { open(); },
    close: function () { close(true); },
    /* 供除錯：強制重彈 */
    reopen: function () { state.shown = false; open(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})(window);
