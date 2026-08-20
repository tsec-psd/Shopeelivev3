/*!
 * Logo Menu Plugin v14
 * 從 hbn.html jimmy-new-logo-menu-only-script 抽取
 * 提供：logo 縮圖右上角 ✎ 觸發器 + 下拉選單（編輯/往右移/刪除/加圓角）
 *       + CropperJS Logo 裁切 Modal
 *
 * 使用：
 *   window.BNLogoMenu.attach(imgEl, options)
 *     options.onEdit(imgEl)    → 點「編輯」
 *     options.onSwap(imgEl)    → 點「往右移」（可選）
 *     options.onDelete(imgEl)  → 點「刪除」
 *     options.showSwap         → 是否顯示「往右移」
 *
 *   window.BNLogoMenu.openCropEditor(src, onDone)
 *     → 開啟 CropperJS 裁切視窗，完成後呼叫 onDone(newSrc)
 */
(function(global){
  if(global.__BN_LOGO_MENU_PLUGIN__) return;
  global.__BN_LOGO_MENU_PLUGIN__ = true;

  /* ── 載入 CropperJS ── */
  function loadCropper(cb){
    if(global.Cropper){ cb(); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css';
    document.head.appendChild(link);
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  /* ── 注入 CSS ──
   * 【Bug 修復說明】原本用單一 textContent 字串內夾帶字面上的
   * <style>...</style> 標籤文字，textContent 不會被當 HTML 解析，
   * 導致 CSS parser 把 "<" ">" 視為非法字元，整條規則（含
   * .cropper-modal-wrap 的 position:fixed 規則）被直接丟棄，
   * 造成 Modal 失去彈窗定位、退化成一般 block 元素沉到頁尾。
   * 修法：拆成兩個獨立 <style> 元素，內容只放「純 CSS」，
   * 不再夾帶任何 <style> 標籤文字。
   */
  function injectCSS(){
    injectMenuCSS();
    injectCropperCSS();
  }

  function injectMenuCSS(){
    if(document.getElementById('_bn_lm_css')) return;
    var s = document.createElement('style');
    s.id = '_bn_lm_css';
    s.textContent =
      '.logo-edit-btn,\n.logo-swap-btn,\n.logo-delete-btn,\n.logo-white-btn,\n.logo-main-pen-btn,\n.logo-action-menu{\n  display:none !important;\n}\n' +
      '.logo-v14-trigger{\n  position:absolute !important;\n  top:-24px !important;\n  right:-2px !important;\n  width:20px !important;\n  height:20px !important;\n  border-radius:50% !important;\n  background:#000 !important;\n  color:#fff !important;\n  display:flex !important;\n  align-items:center !important;\n  justify-content:center !important;\n  cursor:pointer !important;\n  z-index:2147483645 !important;\n  font-size:12px !important;\n  line-height:1 !important;\n  user-select:none !important;\n  box-shadow:0 2px 6px rgba(0,0,0,.25);\n}\n' +
      '.logo-item,\n#square .brand{ overflow:visible !important; }\n' +
      '#logoMenuV14{\n  position:fixed !important;\n  min-width:118px !important;\n  background:#111 !important;\n  color:#fff !important;\n  border-radius:10px !important;\n  box-shadow:0 8px 24px rgba(0,0,0,.28) !important;\n  padding:6px 0 !important;\n  display:none !important;\n  z-index:2147483647 !important;\n}\n' +
      '#logoMenuV14.show{ display:block !important; }\n' +
      '#logoMenuV14 button{\n  width:100% !important;\n  border:0 !important;\n  background:transparent !important;\n  color:#fff !important;\n  text-align:left !important;\n  padding:7px 12px !important;\n  font-size:12px !important;\n  line-height:1.35 !important;\n  cursor:pointer !important;\n}\n' +
      '#logoMenuV14 button:hover{ background:#2b2b2b !important; }\n' +
      '#logoMenuV14 button[hidden]{ display:none !important; }\n' +
      '.is-exporting .logo-v14-trigger,\n.is-exporting #logoMenuV14{ display:none !important; }\n' +
      '#logoCropModal{ z-index:2147483646 !important; }';
    document.head.appendChild(s);
  }

  function injectCropperCSS(){
    if(document.getElementById('_bn_lm_cropper_css')) return;
    var s = document.createElement('style');
    s.id = '_bn_lm_cropper_css';
    /* 這段是修好裁切 Modal 定位的關鍵：position:fixed + inset:0
       務必確保這裡是「純 CSS」，不能再夾帶任何字面 <style> 標籤文字 */
    s.textContent =
      '.cropper-modal-wrap{\n' +
      '  position:fixed !important; inset:0 !important; background:rgba(0,0,0,.5) !important;\n' +
      '  display:none !important; align-items:center !important; justify-content:center !important;\n' +
      '  z-index:10020 !important;\n' +
      '}\n' +
      '.cropper-modal-wrap.open{ display:flex !important; }\n' +
      '.cropper-panel{\n' +
      '  width:min(90vw, 900px); background:#fff; border-radius:12px; overflow:hidden;\n' +
      '  display:flex; flex-direction:column;\n' +
      '}\n' +
      '.cropper-panel header{\n' +
      '  display:flex; align-items:center; justify-content:space-between;\n' +
      '  padding:10px 14px; margin:0;\n' +
      '}\n' +
      '.cropper-panel .body{ padding:10px; }\n' +
      /* .actions 是舊版 Modal 的動作列，2026-08 改版後已由 .bn-crop-foot 取代，
         規則一併移除以免日後誤以為還在使用。 */
      /* ★ 2026-08 修正「放大縮小出現殘影」：
         舊選擇器是 `.cropper-panel img`，會一併命中 CropperJS 自己產生的
         兩張內部圖片（.cropper-canvas > img 與 .cropper-view-box > img）。
         那兩張的尺寸是 CropperJS 用 JS 精確設定的，被 max-width/max-height
         夾住之後就與 view-box 失去同步，疊在一起看起來就是殘影。
         以前 viewMode:1 限制了縮放幅度，很少撞到上限所以沒被發現；
         解除限制（viewMode:0，為了往外擴透明像素）後才浮現。
         修法：只限制「來源圖」本身（.body 的直接子層），
         CropperJS 內部圖片一律解除任何尺寸/邊界限制。 */
      '.cropper-panel .body > img{ max-width:100%; max-height:65vh; display:block; margin:0 auto; }\n' +
      '.cropper-panel .cropper-container img{\n' +
      '  max-width:none !important; max-height:none !important;\n' +
      '  min-width:0 !important; min-height:0 !important; margin:0 !important;\n' +
      '}\n' +

      /* ── 2026-08 重做的工具列 ────────────────────────────────
         全部以 bn-crop- 前綴命名,避免與 CropperJS 自己的 class 打架 */
      '.bn-crop-bar{\n' +
      '  display:flex; align-items:center; gap:8px; flex-wrap:wrap;\n' +
      '  padding:8px 12px; border-bottom:1px solid #eceff3;\n' +
      '}\n' +
      '.bn-crop-bar .bn-crop-label{\n' +
      '  font-size:11px; font-weight:700; color:#7a8395; letter-spacing:.5px;\n' +
      '  flex:0 0 56px;\n' +
      '}\n' +
      '.bn-crop-seg{ display:flex; gap:4px; flex-wrap:wrap; }\n' +
      '.bn-crop-seg button{\n' +
      '  padding:5px 10px; font-size:12px; line-height:1; cursor:pointer;\n' +
      '  background:#f4f6f9; color:#48506080; color:#485060;\n' +
      '  border:1px solid #dfe4ec; border-radius:6px;\n' +
      '  transition:background .12s, border-color .12s, color .12s;\n' +
      '}\n' +
      '.bn-crop-seg button:hover{ background:#e9edf4; }\n' +
      '.bn-crop-seg button.active{\n' +
      '  background:#ee4d2d; border-color:#ee4d2d; color:#fff; font-weight:700;\n' +
      '}\n' +
      '.bn-crop-seg button:focus-visible{ outline:2px solid #ee4d2d; outline-offset:2px; }\n' +
      '.bn-crop-num{\n' +
      '  width:56px; padding:5px 6px; font-size:12px; text-align:right;\n' +
      '  border:1px solid #dfe4ec; border-radius:6px; color:#485060;\n' +
      '}\n' +
      '.bn-crop-num:focus{ outline:none; border-color:#ee4d2d; }\n' +
      '.bn-crop-unit{ font-size:12px; color:#7a8395; margin-left:-4px; }\n' +
      '.bn-crop-hint{ font-size:11px; color:#9aa3b2; margin-left:auto; }\n' +
      '.bn-crop-foot{\n' +
      '  display:flex; align-items:center; gap:8px;\n' +
      '  padding:10px 12px; border-top:1px solid #eceff3;\n' +
      '}\n' +
      '.bn-crop-info{\n' +
      '  font-size:11px; color:#7a8395; font-variant-numeric:tabular-nums;\n' +
      '  white-space:nowrap;\n' +
      '}\n' +
      '.bn-crop-foot .bn-crop-spacer{ flex:1; }\n' +
      '.bn-crop-apply{\n' +
      '  padding:7px 20px; font-size:13px; font-weight:700; cursor:pointer;\n' +
      '  background:#ee4d2d; color:#fff; border:none; border-radius:6px;\n' +
      '}\n' +
      '.bn-crop-apply:hover{ filter:brightness(1.06); }\n' +
      '.cropper-panel header button{\n' +
      '  padding:5px 12px; font-size:12px; cursor:pointer;\n' +
      '  background:#f4f6f9; color:#485060;\n' +
      '  border:1px solid #dfe4ec; border-radius:6px;\n' +
      '}\n' +
      '@media (prefers-reduced-motion: reduce){\n' +
      '  .bn-crop-seg button{ transition:none; }\n' +
      '}';
    document.head.appendChild(s);
  }

  /* ── 裁切 Modal 的比例／外框預設值（2026-08 重做）── */
  var CROP_RATIOS = [
    { key:'free',    label:'自由' },
    { key:'orig',    label:'原始' },
    { key:'1',       label:'1:1'  },
    { key:'1.33333', label:'4:3'  },
    { key:'0.75',    label:'3:4'  },
    { key:'1.77778', label:'16:9' },
    { key:'0.5625',  label:'9:16' }
  ];
  var CROP_PADS = [0, 5, 10, 15, 20];

  /* 組出 Modal 內容：header ／ 比例列 ／ 透明外框列 ／ 畫布 ／ 底部資訊＋動作 */
  function buildCropHTML(){
    var ratioBtns = CROP_RATIOS.map(function(r, i){
      return '<button type="button" data-ratio="' + r.key + '"' +
             (i === 0 ? ' class="active"' : '') + '>' + r.label + '</button>';
    }).join('');

    var padBtns = CROP_PADS.map(function(p, i){
      return '<button type="button" data-pad="' + p + '"' +
             (i === 0 ? ' class="active"' : '') + '>' +
             (p === 0 ? '無' : p + '%') + '</button>';
    }).join('');

    return '' +
      '<div id="logoCropModal" class="cropper-modal-wrap">' +
        '<div class="cropper-panel">' +
          '<header>' +
            '<strong>Logo 裁切</strong>' +
            '<button id="logoCropClose" type="button">關閉</button>' +
          '</header>' +

          '<div class="bn-crop-bar">' +
            '<span class="bn-crop-label">比例</span>' +
            '<div class="bn-crop-seg" id="bnCropRatios">' + ratioBtns + '</div>' +
            '<span class="bn-crop-hint">按住 Shift 拖框＝維持等比</span>' +
          '</div>' +

          '<div class="bn-crop-bar">' +
            '<span class="bn-crop-label">透明外框</span>' +
            '<div class="bn-crop-seg" id="bnCropPads">' + padBtns + '</div>' +
            '<input id="bnCropPadNum" class="bn-crop-num" type="number" ' +
                   'min="0" max="200" step="1" value="0" aria-label="透明外框百分比">' +
            '<span class="bn-crop-unit">%</span>' +
            '<span class="bn-crop-hint">也可直接把裁切框拉到圖片外面</span>' +
          '</div>' +

          '<div class="body"><img id="logoCropImg" alt="Logo 裁切" /></div>' +

          '<div class="bn-crop-foot">' +
            '<span class="bn-crop-info" id="bnCropInfo">—</span>' +
            '<span class="bn-crop-spacer"></span>' +
            '<div class="bn-crop-seg">' +
              '<button type="button" id="bnCropZoomOut" aria-label="縮小">−</button>' +
              '<button type="button" id="bnCropZoomIn" aria-label="放大">＋</button>' +
              '<button type="button" id="bnCropReset">重置</button>' +
            '</div>' +
            '<button id="logoCropApply" class="bn-crop-apply" type="button">套用</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ── 注入 Modal HTML（只注入一次；每次開啟由 openCropEditor() 重設狀態）── */
  function injectHTML(){
    if(document.getElementById('logoCropModal')) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = buildCropHTML();
    while(tmp.firstChild) document.body.appendChild(tmp.firstChild);
  }

  /* ── 核心邏輯（從 hbn.html 抽取，移除 hbn 專屬 DOM 依賴） ── */

  var ctx = null;
  var activeCropper = null;
  var activeTarget = null;
  var _cropDone = null;

  function q(sel, root){ return (root||document).querySelector(sel); }

  function closeMenu(){
    var menu = document.getElementById('logoMenuV14');
    if(menu) menu.classList.remove('show');
  }

  function ensureMenu(){
    var menu = document.getElementById('logoMenuV14');
    if(menu) return menu;
    menu = document.createElement('div');
    menu.id = 'logoMenuV14';
    menu.innerHTML =
      '<button type="button" data-action="edit">編輯</button>' +
      '<button type="button" data-action="swap">往右移</button>' +
      '<button type="button" data-action="delete">刪除</button>' +
      '<button type="button" data-action="round">加圓角</button>';
    document.body.appendChild(menu);
    menu.addEventListener('mousedown', function(e){ e.stopPropagation(); }, true);
    menu.addEventListener('click', function(e){
      var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      e.preventDefault(); e.stopPropagation();
      runAction(btn.dataset.action);
      closeMenu();
    }, true);
    return menu;
  }

  function updateMenu(){
    var menu = ensureMenu();
    var swapBtn = menu.querySelector('[data-action="swap"]');
    if(swapBtn) swapBtn.hidden = !(ctx && ctx.showSwap);
    var roundBtn = menu.querySelector('[data-action="round"]');
    if(roundBtn){
      roundBtn.textContent = (ctx && ctx.img && ctx.img.dataset.bnLogoRound === '1') ? '取消圓角' : '加圓角';
    }
  }

  function openMenu(wrap, img, trigger, opts){
    ctx = { wrap:wrap, img:img, opts:opts||{}, showSwap:!!(opts&&opts.showSwap) };
    var menu = ensureMenu();
    updateMenu();
    var rect = trigger.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.round(rect.right - 118)) + 'px';
    menu.style.top  = Math.max(8, Math.round(rect.bottom + 6)) + 'px';
    menu.classList.add('show');
  }

  function runAction(action){
    if(!ctx || !ctx.img) return;
    var img = ctx.img, opts = ctx.opts||{};
    if(action === 'edit'){
      /* 開啟 CropperJS 裁切，完成後回呼 opts.onEdit */
      openCropEditor(img.src, function(newSrc){
        if(!newSrc) return;
        img.src = newSrc;
        if(typeof opts.onEdit === 'function') opts.onEdit(img, newSrc);
      });
    } else if(action === 'swap'){
      if(typeof opts.onSwap === 'function') opts.onSwap(img);
    } else if(action === 'delete'){
      if(typeof opts.onDelete === 'function') opts.onDelete(img);
    } else if(action === 'round'){
      var isRound = ctx.img.dataset.bnLogoRound === '1';
      ctx.img.dataset.bnLogoRound = isRound ? '' : '1';
      ctx.img.style.borderRadius = isRound ? '' : '50%';
      updateMenu();
      if(typeof opts.onRound === 'function') opts.onRound(img, !isRound);
    }
  }

  /* ── CropperJS 裁切 ── */
  function destroyCropper(){
    try{ activeCropper && activeCropper.destroy(); }catch(_){}
    activeCropper = null;
  }

  /* ══ 裁切器控制項狀態（2026-08 重做）══════════════════════════
     _cropPadPct:透明外框百分比。刻意採「百分比」而非固定 px ——
     各家 LOGO 原始像素從幾百到上千不等,固定 px 在大圖上等於沒有;
     百分比則自動隨圖縮放,與白底留白的算法一致。 */
  var _cropPadPct = 0;
  var _cropBound  = false;

  /* 依裁切結果的短邊換算外框實際像素 */
  function _cropPadPx(w, h){
    if (!_cropPadPct) return 0;
    return Math.round(Math.min(w, h) * _cropPadPct / 100);
  }

  function _setSegActive(container, el){
    if (!container) return;
    Array.prototype.forEach.call(container.querySelectorAll('button'), function(b){
      b.classList.toggle('active', b === el);
    });
  }

  /* 即時顯示「裁切尺寸 → 輸出尺寸」,讓使用者不必套用才知道結果 */
  function updateCropInfo(){
    var info = document.getElementById('bnCropInfo');
    if (!info) return;
    if (!activeCropper) { info.textContent = '—'; return; }
    var d;
    try { d = activeCropper.getData(true); }
    catch(_) { info.textContent = '—'; return; }
    var w = Math.max(0, Math.round(d.width));
    var h = Math.max(0, Math.round(d.height));
    var p = _cropPadPx(w, h);
    info.textContent = p
      ? '裁切 ' + w + '×' + h + '　＋外框 ' + p + 'px　→　輸出 ' + (w + p*2) + '×' + (h + p*2)
      : '裁切 ' + w + '×' + h + '　→　輸出 ' + w + '×' + h;
  }

  /* 控制項只綁一次(Modal 本身也只注入一次),之後每次開啟只重設狀態。
     所有 handler 都透過模組層的 activeCropper 取用「當下」的裁切器實例,
     因此不會抓到已被 destroy 的舊實例。 */
  function bindCropControls(){
    if (_cropBound) return;
    _cropBound = true;

    var ratios = document.getElementById('bnCropRatios');
    var pads   = document.getElementById('bnCropPads');
    var padNum = document.getElementById('bnCropPadNum');
    var cropImg= document.getElementById('logoCropImg');

    if (ratios) ratios.addEventListener('click', function(e){
      var b = e.target && e.target.closest ? e.target.closest('button[data-ratio]') : null;
      if (!b || !activeCropper) return;
      var k = b.dataset.ratio, r;
      if (k === 'free') { r = NaN; }
      else if (k === 'orig') {
        var im = activeCropper.getImageData();
        r = (im && im.naturalHeight) ? (im.naturalWidth / im.naturalHeight) : NaN;
      } else { r = parseFloat(k); }
      activeCropper.setAspectRatio(r);
      _setSegActive(ratios, b);
      updateCropInfo();
    });

    if (pads) pads.addEventListener('click', function(e){
      var b = e.target && e.target.closest ? e.target.closest('button[data-pad]') : null;
      if (!b) return;
      _cropPadPct = parseFloat(b.dataset.pad) || 0;
      if (padNum) padNum.value = String(_cropPadPct);
      _setSegActive(pads, b);
      updateCropInfo();
    });

    if (padNum) padNum.addEventListener('input', function(){
      var v = parseFloat(padNum.value);
      _cropPadPct = (isFinite(v) && v > 0) ? Math.min(v, 200) : 0;
      /* 手動輸入的值若剛好等於某顆快捷鈕就同步高亮,否則全部取消高亮 */
      if (pads) {
        var hit = null;
        Array.prototype.forEach.call(pads.querySelectorAll('button'), function(b){
          if (parseFloat(b.dataset.pad) === _cropPadPct) hit = b;
        });
        _setSegActive(pads, hit);
      }
      updateCropInfo();
    });

    var zi = document.getElementById('bnCropZoomIn');
    var zo = document.getElementById('bnCropZoomOut');
    var rs = document.getElementById('bnCropReset');
    if (zi) zi.addEventListener('click', function(){ if(activeCropper) activeCropper.zoom(0.1); });
    if (zo) zo.addEventListener('click', function(){ if(activeCropper) activeCropper.zoom(-0.1); });
    if (rs) rs.addEventListener('click', function(){
      if(!activeCropper) return;
      activeCropper.reset();
      activeCropper.setAspectRatio(NaN);
      if (ratios) _setSegActive(ratios, ratios.querySelector('button[data-ratio="free"]'));
      updateCropInfo();
    });

    /* CropperJS 每次裁切框變動都會在「來源 img」上派送 crop 事件 */
    if (cropImg) cropImg.addEventListener('crop', updateCropInfo);
  }

  function openCropEditor(src, onDone){
    injectCSS();
    injectHTML();
    _cropDone = onDone || null;
    loadCropper(function(){
      var modal   = document.getElementById('logoCropModal');
      var cropImg = document.getElementById('logoCropImg');
      var apply   = document.getElementById('logoCropApply');
      var close   = document.getElementById('logoCropClose');
      if(!modal || !cropImg) return;

      bindCropControls();

      /* 每次開啟都回到乾淨狀態:自由比例、無外框。
         (Modal 常駐 DOM,不重設的話會沿用上一張 LOGO 的設定) */
      _cropPadPct = 0;
      var ratiosEl = document.getElementById('bnCropRatios');
      var padsEl   = document.getElementById('bnCropPads');
      var padNumEl = document.getElementById('bnCropPadNum');
      if (ratiosEl) _setSegActive(ratiosEl, ratiosEl.querySelector('button[data-ratio="free"]'));
      if (padsEl)   _setSegActive(padsEl,   padsEl.querySelector('button[data-pad="0"]'));
      if (padNumEl) padNumEl.value = '0';

      activeTarget = null;
      destroyCropper();
      /* 重設 img 讓瀏覽器重新 load */
      cropImg.removeAttribute('src');
      modal.classList.add('open');

      cropImg.onload = function(){
        cropImg.onload = null;
        destroyCropper();
        activeCropper = new Cropper(cropImg, {
          ready: updateCropInfo,
          /* ★ 2026-08:viewMode 由 1 改為 0,讓裁切框可以拉到「圖片範圍以外」。
             CropperJS 的 viewMode 定義:
               0 = 無限制,裁切框可超出圖片(本專案要的)
               1 = 裁切框限制在圖片範圍內  ← 舊值,正是它擋住往外擴
             超出圖片的區域,getCroppedCanvas() 預設不填色,
             輸出 PNG 時就是透明像素 —— 即「往外擴透明像素」。
             用途:替太貼邊的 LOGO 補出透明留白,不必回 PS 處理。 */
          viewMode: 0,
          autoCropArea: 1,
          movable: true,
          zoomable: true,
          scalable: true,
          /* ★ 一併打開棋盤格背景:往外擴時要看得出「哪裡是透明的」,
             關著的話使用者無從判斷自己擴了多少。 */
          background: true
        });
      };
      cropImg.src = src;

      /* 「套用」按鈕 */
      if(apply && apply.dataset.bnBound !== '1'){
        apply.dataset.bnBound = '1';
        apply.addEventListener('click', function(){
          if(!activeCropper) return;
          var out = activeCropper.getCroppedCanvas();
          if(!out) return;

          /* ★ 透明外框:在裁切結果外圍再包一圈完全透明的像素。
             刻意做成「套用當下的後處理」而不是去改 CropperJS 的裁切框 ——
             改裁切框會與使用者自己的拖曳互相打架(每次調整都要記住基準框、
             還原時容易累積誤差);後處理則語義單純:
             「就是在最終結果外面加一圈透明邊」,結果完全可預期。
             canvas 建立時本來就是透明的,把裁切結果畫在中間即可。 */
          var p = _cropPadPx(out.width, out.height);
          if (p > 0) {
            var c2 = document.createElement('canvas');
            c2.width  = out.width  + p * 2;
            c2.height = out.height + p * 2;
            c2.getContext('2d').drawImage(out, p, p);
            out = c2;
          }

          var url = out.toDataURL('image/png');
          destroyCropper();
          modal.classList.remove('open');
          if(typeof _cropDone === 'function'){ _cropDone(url); _cropDone = null; }
        });
      }
      /* 「關閉」按鈕 */
      if(close && close.dataset.bnBound !== '1'){
        close.dataset.bnBound = '1';
        close.addEventListener('click', function(){
          destroyCropper();
          modal.classList.remove('open');
          _cropDone = null;
        });
      }
    });
  }

  /* ── 附加觸發器到 logo 縮圖 ── */
  function attach(imgEl, opts){
    injectCSS();
    var wrap = imgEl.parentElement;
    if(!wrap) return;
    wrap.style.overflow = 'visible';
    wrap.style.position = 'relative';

    /* 移除舊觸發器 */
    var old = wrap.querySelector('.logo-v14-trigger');
    if(old) old.remove();

    var trigger = document.createElement('div');
    trigger.className = 'logo-v14-trigger';
    trigger.textContent = '✎';
    trigger.title = 'Logo 功能';
    wrap.appendChild(trigger);

    trigger.style.display = imgEl.getAttribute('src') ? 'flex' : 'none';

    trigger.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      document.addEventListener('click', closeMenu, { once:true });
      openMenu(wrap, imgEl, trigger, opts||{});
    }, true);

    /* src 變化時更新顯示 */
    var obs = new MutationObserver(function(){
      trigger.style.display = imgEl.getAttribute('src') ? 'flex' : 'none';
    });
    obs.observe(imgEl, { attributes:true, attributeFilter:['src'] });
  }

  /* ── 關閉 menu 點外部 ── */
  document.addEventListener('click', function(e){
    var menu = document.getElementById('logoMenuV14');
    if(menu && !menu.contains(e.target)) closeMenu();
  });

  /* ── 公開 API ── */
  global.BNLogoMenu = {
    attach: attach,
    openCropEditor: openCropEditor
  };

}(window));
