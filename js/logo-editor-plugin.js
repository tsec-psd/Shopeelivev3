/*!
 * Logo 編輯器 Modal v14
 *   ─ openCropEditor：CropperJS 裁切
 *   ─ openColorPicker：從 LOGO 像素吸色（給「底框顏色」用）
 *
 * 使用：
 *   window.BNLogoMenu.openCropEditor(src, onDone)
 *     → 開啟裁切視窗，完成後呼叫 onDone(newSrc)；取消則不呼叫。
 *
 *   window.BNLogoMenu.openColorPicker(items, opts)
 *     items = [{label, src}]（傳基底，不是底色合成品）
 *     opts  = { color:目前顏色, onPick(hex) }
 *     → 點 LOGO 上任一不透明像素即取該色；也可點自動算出的主色。
 *
 * ★ 呼叫端請把「基底」(bn-editor-plugin.js 的 lg._origSrc)傳進來，
 *   不要傳側欄縮圖上那張 —— 白底開著時縮圖是白底合成品，裁它會把
 *   白框烤進基底。詳見 bn-editor-plugin.js 的「LOGO 影像管線」。
 *
 * ★ 2026-09:原本這支還內含一套 logo 縮圖右上角 ✎ 觸發器 + 下拉選單
 *   (attach()/logoMenuV14),但 v14 的選單是 bn-editor-plugin.js 自己
 *   用側欄「編輯」按鈕做的,attach() 從頭到尾沒有任何呼叫點。
 *   兩套選單並存正是「裁切/白底/圓角」各寫各的 bug 溫床,故整套移除。
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
   * 修法：textContent 內只放「純 CSS」，不再夾帶任何 <style> 標籤文字。
   */
  function injectCropperCSS(){
    if(document.getElementById('_bn_lm_cropper_css')) return;
    var s = document.createElement('style');
    s.id = '_bn_lm_cropper_css';
    /* 這段是修好裁切 Modal 定位的關鍵：position:fixed + inset:0
       務必確保這裡是「純 CSS」，不能再夾帶任何字面 <style> 標籤文字。
       z-index 也要疊在最上層：Modal 掛在 document.body，
       不能被側欄或預覽區蓋住。 */
    s.textContent =
      '#logoCropModal{ z-index:2147483646 !important; }\n' +
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

  var activeCropper = null;
  var _cropDone = null;

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
    injectCropperCSS();
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

  /* ══ 吸色 Modal ══════════════════════════════════════════════════
     用途:讓「底框顏色」可以直接吃 LOGO 自己的顏色(廠商品牌色),
     不必先回 PS 對色再手打色碼。

     ★ 呼叫端要傳「基底」的 src —— 底色開著時成品最外圈就是底框本身,
       吸到的會是上一次選的顏色而不是 LOGO 的顏色(bn-editor-plugin.js
       的 openColorPicker 呼叫處已經傳 _bnLogoBase(lg))。
     ★ 透明像素一律不可取:alpha 幾乎為 0 的地方沒有顏色可言,
       硬取會拿到「和棋盤格底混出來」的假色。棋盤格是用 CSS 畫在
       canvas 背後的,不畫進像素,才能靠 alpha 判斷透明。
     ★ Modal 每次開啟重建、關閉即移除 —— 內容(幾張 LOGO、主色)每次都不同,
       常駐 DOM 只會留下過期的 canvas 與監聽器。
     ────────────────────────────────────────────────────────────────── */

  function injectColorCSS(){
    if(document.getElementById('_bn_lm_color_css')) return;
    var st = document.createElement('style');
    st.id = '_bn_lm_color_css';
    st.textContent =
      '.bn-cp-wrap{\n' +
      '  position:fixed !important; inset:0 !important; z-index:2147483646 !important;\n' +
      '  background:rgba(0,0,0,.55) !important; display:flex !important;\n' +
      '  align-items:center !important; justify-content:center !important;\n' +
      '}\n' +
      '.bn-cp-panel{\n' +
      '  background:#1e1e1e; color:#fff; border:1px solid #333; border-radius:14px;\n' +
      '  width:min(460px,94vw); max-height:88vh; overflow:auto;\n' +
      '  box-shadow:0 24px 70px rgba(0,0,0,.6);\n' +
      '}\n' +
      '.bn-cp-panel header{\n' +
      '  display:flex; align-items:center; justify-content:space-between;\n' +
      '  padding:12px 14px; border-bottom:1px solid #333; font-size:14px;\n' +
      '}\n' +
      '.bn-cp-panel header button{\n' +
      '  background:transparent; border:1px solid #444; color:#aaa;\n' +
      '  border-radius:6px; font-size:12px; padding:3px 10px; cursor:pointer;\n' +
      '}\n' +
      '.bn-cp-body{ padding:12px 14px; display:flex; flex-direction:column; gap:10px; }\n' +
      '.bn-cp-hint{ font-size:11px; color:#8b93a1; }\n' +
      /* 棋盤格:讓透明區域看得出來(只在背後,不進像素) */
      '.bn-cp-canvas{\n' +
      '  display:block; max-width:100%; cursor:crosshair; border-radius:8px;\n' +
      '  border:1px solid #333;\n' +
      '  background-color:#fff;\n' +
      '  background-image:linear-gradient(45deg,#e2e2e2 25%,transparent 25%,transparent 75%,#e2e2e2 75%),\n' +
      '                   linear-gradient(45deg,#e2e2e2 25%,transparent 25%,transparent 75%,#e2e2e2 75%);\n' +
      '  background-size:16px 16px; background-position:0 0,8px 8px;\n' +
      '}\n' +
      '.bn-cp-label{ font-size:11px; color:#8b93a1; margin-bottom:3px; }\n' +
      '.bn-cp-swatches{ display:flex; gap:6px; flex-wrap:wrap; }\n' +
      '.bn-cp-swatch{\n' +
      '  width:26px; height:26px; border-radius:6px; border:1px solid #444;\n' +
      '  cursor:pointer; padding:0;\n' +
      '}\n' +
      '.bn-cp-swatch:hover{ outline:2px solid #ee4d2d; outline-offset:1px; }\n' +
      '.bn-cp-foot{\n' +
      '  display:flex; align-items:center; gap:10px;\n' +
      '  padding:10px 14px; border-top:1px solid #333;\n' +
      '}\n' +
      '.bn-cp-prev{ width:30px; height:30px; border-radius:6px; border:1px solid #444; flex-shrink:0; }\n' +
      '.bn-cp-hexv{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; }\n' +
      '.bn-cp-foot .bn-cp-spacer{ flex:1; }\n' +
      '.bn-cp-btn{\n' +
      '  background:transparent; border:1px solid #444; color:#ccc;\n' +
      '  border-radius:7px; font-size:12px; padding:5px 12px; cursor:pointer;\n' +
      '}\n' +
      '.bn-cp-btn:hover{ background:#2b2b2b; }\n';
    document.head.appendChild(st);
  }

  function _hex2(v){
    var h = Math.max(0, Math.min(255, v|0)).toString(16);
    return h.length < 2 ? '0'+h : h;
  }
  function _toHex(r,g,b){ return ('#'+_hex2(r)+_hex2(g)+_hex2(b)).toUpperCase(); }

  /* 自動主色:量化到 4 bit/通道後計數,再把太相近的合併。
     只算不透明像素;縮到 160px 掃是為了避免大圖逐像素跑太久。 */
  function dominantColors(img, maxOut){
    var S = 160;
    var sc = Math.min(1, S / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    var w = Math.max(1, Math.round((img.naturalWidth  || 1) * sc));
    var h = Math.max(1, Math.round((img.naturalHeight || 1) * sc));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var cx = c.getContext('2d', { willReadFrequently:true });
    cx.drawImage(img, 0, 0, w, h);
    var d;
    try { d = cx.getImageData(0, 0, w, h).data; } catch(_) { return []; }

    var bucket = {};
    for(var i = 0; i < d.length; i += 4){
      if(d[i+3] < 200) continue;                     /* 半透明/透明不列入 */
      var key = ((d[i] >> 4) << 8) | ((d[i+1] >> 4) << 4) | (d[i+2] >> 4);
      var b = bucket[key] || (bucket[key] = { n:0, r:0, g:0, b:0 });
      b.n++; b.r += d[i]; b.g += d[i+1]; b.b += d[i+2];
    }
    var list = Object.keys(bucket).map(function(k){
      var b = bucket[k];
      return { n:b.n, r:Math.round(b.r/b.n), g:Math.round(b.g/b.n), b:Math.round(b.b/b.n) };
    }).sort(function(x,y){ return y.n - x.n; });

    /* 貪婪去重:與已選色差距太小的就跳過,免得六格全是同一個色階 */
    var out = [];
    for(var j = 0; j < list.length && out.length < (maxOut || 6); j++){
      var cand = list[j], near = false;
      for(var k2 = 0; k2 < out.length; k2++){
        var o = out[k2];
        if(Math.abs(o.r-cand.r) + Math.abs(o.g-cand.g) + Math.abs(o.b-cand.b) < 60){ near = true; break; }
      }
      if(!near) out.push(cand);
    }
    return out.map(function(o){ return _toHex(o.r, o.g, o.b); });
  }

  function openColorPicker(items, opts){
    injectColorCSS();
    items = items || [];
    opts  = opts  || {};

    /* 舊的先收掉,避免連點開兩層 */
    var old = document.getElementById('bnLogoColorModal');
    if(old) old.remove();

    var wrap = document.createElement('div');
    wrap.id = 'bnLogoColorModal';
    wrap.className = 'bn-cp-wrap';
    wrap.innerHTML =
      '<div class="bn-cp-panel">' +
        '<header><strong>吸取 LOGO 顏色</strong>' +
          '<button type="button" data-cp="close">關閉</button></header>' +
        '<div class="bn-cp-body">' +
          '<div class="bn-cp-hint">在 LOGO 上點一下即取該點顏色（棋盤格＝透明處，取不到色）</div>' +
          '<div data-cp="imgs" style="display:flex;flex-direction:column;gap:10px;"></div>' +
          '<div><div class="bn-cp-label">自動主色</div>' +
            '<div class="bn-cp-swatches" data-cp="swatches"></div></div>' +
        '</div>' +
        '<div class="bn-cp-foot">' +
          '<div class="bn-cp-prev" data-cp="prev"></div>' +
          '<span class="bn-cp-hexv" data-cp="hex">—</span>' +
          '<span class="bn-cp-spacer"></span>' +
          '<button type="button" class="bn-cp-btn" data-cp="screen" hidden>螢幕吸色</button>' +
          '<button type="button" class="bn-cp-btn" data-cp="cancel">取消</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var q1 = function(sel){ return wrap.querySelector('[data-cp="'+sel+'"]'); };
    var prevEl = q1('prev'), hexEl = q1('hex');

    function preview(hex){
      prevEl.style.background = hex || 'transparent';
      hexEl.textContent = hex || '（透明處）';
    }
    preview(opts.color || null);

    function close(){
      document.removeEventListener('keydown', onKey);
      wrap.remove();
    }
    function commit(hex){
      close();
      if(typeof opts.onPick === 'function') opts.onPick(hex);
    }
    function onKey(e){ if(e.key === 'Escape'){ e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey);

    q1('close').addEventListener('click', close);
    q1('cancel').addEventListener('click', close);
    wrap.addEventListener('click', function(e){ if(e.target === wrap) close(); });

    /* 每張 LOGO 一個 canvas。畫的是原圖像素(不含棋盤格),
       所以 alpha 判得準;顯示大小另外用 CSS 縮。 */
    var imgsEl = q1('imgs');
    var swEl   = q1('swatches');

    function sampleAt(cv, e){
      var r = cv.getBoundingClientRect();
      if(!r.width || !r.height) return null;
      var x = Math.floor((e.clientX - r.left) * (cv.width  / r.width));
      var y = Math.floor((e.clientY - r.top ) * (cv.height / r.height));
      if(x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null;
      var d;
      try { d = cv.getContext('2d', { willReadFrequently:true }).getImageData(x, y, 1, 1).data; }
      catch(_) { return null; }
      if(d[3] < 10) return null;          /* 透明處沒有顏色 */
      return _toHex(d[0], d[1], d[2]);
    }

    items.forEach(function(it, idx){
      if(!it || !it.src) return;
      var box = document.createElement('div');
      if(items.length > 1){
        var lb = document.createElement('div');
        lb.className = 'bn-cp-label';
        lb.textContent = it.label || ('Logo ' + (idx+1));
        box.appendChild(lb);
      }
      var cv = document.createElement('canvas');
      cv.className = 'bn-cp-canvas';
      box.appendChild(cv);
      imgsEl.appendChild(box);

      var img = new Image();
      img.onload = function(){
        /* canvas 內部解析度就用原圖(上限 800,上傳時已限過),
           畫面尺寸交給 CSS max-width + height:auto */
        cv.width  = img.naturalWidth  || 1;
        cv.height = img.naturalHeight || 1;
        cv.style.height = 'auto';
        cv.getContext('2d', { willReadFrequently:true }).drawImage(img, 0, 0);

        /* 主色:多張 LOGO 就都列出來,順序照 LOGO 順序 */
        dominantColors(img, 6).forEach(function(hex){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'bn-cp-swatch';
          b.style.background = hex;
          b.title = hex;
          b.addEventListener('mouseover', function(){ preview(hex); });
          b.addEventListener('click', function(){ commit(hex); });
          swEl.appendChild(b);
        });
      };
      img.src = it.src;

      cv.addEventListener('mousemove', function(e){ preview(sampleAt(cv, e)); });
      cv.addEventListener('mouseleave', function(){ preview(opts.color || null); });
      cv.addEventListener('click', function(e){
        var hex = sampleAt(cv, e);
        if(hex) commit(hex);            /* 點到透明處就當沒點 */
      });
    });

    /* 螢幕吸色(Chrome/Edge 有 EyeDropper):可以吸預覽區、KV 底圖等畫面上任何顏色。
       開啟前要把 Modal 藏起來 —— 不然滿版遮罩會擋住要吸的東西。 */
    if(global.EyeDropper){
      var scr = q1('screen');
      scr.hidden = false;
      scr.addEventListener('click', function(){
        wrap.style.visibility = 'hidden';
        new global.EyeDropper().open().then(function(res){
          if(res && res.sRGBHex) commit(res.sRGBHex.toUpperCase());
          else wrap.style.visibility = '';
        }).catch(function(){
          wrap.style.visibility = '';   /* 使用者取消 */
        });
      });
    }
  }

  /* ── 公開 API ── */
  global.BNLogoMenu = {
    openCropEditor: openCropEditor,
    openColorPicker: openColorPicker
  };

}(window));
