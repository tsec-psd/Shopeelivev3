/*!
 * color-theme-plugin.js  v3.0  — 背景自動配色器（無 UI）
 *
 * 運作方式：完全自動，不需要使用者操作
 *   工單上傳 → 偵測到指定色碼 → 立即生成配色 → 廣播到所有版位
 *   工單無填色碼 → 靜默略過，不影響現有設定
 *
 * 整合方式（bn.html）：
 *   <script src="js/bn-editor-plugin.js"></script>
 *   <script src="js/bn-state-plugin.js"></script>
 *   <script src="js/color-theme-plugin.js"></script>   ← 加在最後
 *
 * layout-runtime.js 需使用已補丁版本（含 bn-color-ext 處理器）
 *
 * 手動呼叫 API（開發 / 除錯用）：
 *   BNColorTheme.applyBg('#FF8866')   直接指定背景色並套用
 *   BNColorTheme.generate('#FF8866')  只生成 palette，不套用
 */
(function (global) {
  'use strict';

  if (global.__BN_COLOR_THEME_PLUGIN__) return;
  global.__BN_COLOR_THEME_PLUGIN__ = true;

  /* ════════════════════════════════════════════════════════
     §1. Color Math
     ════════════════════════════════════════════════════════ */

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const h = hex.replace(/^#/, '').trim();
    const f = h.length === 3 ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h;
    if (!/^[0-9A-Fa-f]{6}$/.test(f)) return null;
    return { r: parseInt(f.substr(0,2),16), g: parseInt(f.substr(2,2),16), b: parseInt(f.substr(4,2),16) };
  }

  function rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0');
    return '#' + c(r) + c(g) + c(b);
  }

  function rgbToHsl(r, g, b) {
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const l=(max+min)/2; let h=0, s=0;
    if (max!==min) {
      const d=max-min;
      s = l>.5 ? d/(2-max-min) : d/(max+min);
      switch(max) {
        case r: h=((g-b)/d+(g<b?6:0))/6; break;
        case g: h=((b-r)/d+2)/6; break;
        case b: h=((r-g)/d+4)/6; break;
      }
    }
    return { h: h*360, s: s*100, l: l*100 };
  }

  function hslToHex(h, s, l) {
    h = ((h%360)+360)%360;
    s = Math.max(0, Math.min(100,s));
    l = Math.max(0, Math.min(100,l));
    h/=360; s/=100; l/=100;
    let r, g, b;
    if (s<.001) { r=g=b=l; }
    else {
      const hue2rgb = (p,q,t) => {
        if(t<0)t+=1; if(t>1)t-=1;
        if(t<1/6) return p+(q-p)*6*t;
        if(t<.5)  return q;
        if(t<2/3) return p+(q-p)*(2/3-t)*6;
        return p;
      };
      const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
      r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
    }
    return rgbToHex(r*255, g*255, b*255);
  }

  function getLuminance(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return 0;
    const lin = c => { c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055,2.4); };
    return .2126*lin(rgb.r) + .7152*lin(rgb.g) + .0722*lin(rgb.b);
  }

  function contrastRatio(hex1, hex2) {
    const a=getLuminance(hex1)+.05, b=getLuminance(hex2)+.05;
    return parseFloat((Math.max(a,b)/Math.min(a,b)).toFixed(2));
  }

  /**
   * 調整文字色直到對背景達到 minRatio。
   * l 限制 12–88%（不黑不白）；s 強制 ≥ 42%（保有色感）。
   */
  function ensureContrast(textHex, bgHex, minRatio) {
    if (contrastRatio(textHex, bgHex) >= minRatio) return textHex;
    const bgLum = getLuminance(bgHex);
    const darken = bgLum > .179;
    const rgb = hexToRgb(textHex); if (!rgb) return darken ? '#1a1a1a' : '#e5e5e5';
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const s = Math.max(hsl.s, 42);
    for (let i=0; i<28; i++) {
      hsl.l = darken ? Math.max(hsl.l-3, 12) : Math.min(hsl.l+3, 88);
      const c = hslToHex(hsl.h, s, hsl.l);
      if (contrastRatio(c, bgHex) >= minRatio) return c;
    }
    return hslToHex(hsl.h, s, darken ? 12 : 88);
  }

  function hexToRgba(hex, alpha) {
    const rgb = hexToRgb(hex); if (!rgb) return 'rgba(0,0,0,0)';
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha.toFixed(2)})`;
  }

  /* ════════════════════════════════════════════════════════
     §2. Theme Engine — 同色系單色推算
     ════════════════════════════════════════════════════════

     亮色背景（lum > 0.35）：文字同色相壓暗
       subText（副標+Bar） l≈20%，mainText（主標+日期） l≈30%

     暗色背景（lum < 0.12）：文字同色相提亮
       subText l≈82%，mainText l≈72%

     中間色調（0.12–0.35）：自動選對比較佳方向
  ════════════════════════════════════════════════════════ */

  function generateTheme(bgHex) {
    const rgb = hexToRgb(bgHex); if (!rgb) return null;
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const lum = getLuminance(bgHex);

    /* 低彩度（灰）→ 錨定蝦皮品牌藍，有彩度→用背景色相 */
    const ha = s < 15 ? 220 : h;
    const sB = Math.max(s + 22, 55); /* 飽和度下限 */

    let mainText, subText, isMidTone = false;

    if (lum > .35) {
      /* 亮色路徑：壓暗 */
      subText  = ensureContrast(hslToHex(ha, Math.min(sB+8, 88), 20), bgHex, 4.5);
      mainText = ensureContrast(hslToHex(ha, Math.min(sB,   80), 30), bgHex, 4.5);
    } else if (lum < .12) {
      /* 暗色路徑：提亮 */
      subText  = ensureContrast(hslToHex(ha, Math.min(s+12, 75), 82), bgHex, 4.5);
      mainText = ensureContrast(hslToHex(ha, Math.min(s+5,  68), 72), bgHex, 4.5);
    } else {
      /* 中間色調：雙向試探，取對比較高方向（目標 3.0:1） */
      isMidTone = true;
      const dSub = ensureContrast(hslToHex(ha, Math.min(sB,   85), 14), bgHex, 3.0);
      const lSub = ensureContrast(hslToHex(ha, Math.min(s+8,  70), 86), bgHex, 3.0);
      if (contrastRatio(lSub, bgHex) >= contrastRatio(dSub, bgHex)) {
        subText  = lSub;
        mainText = ensureContrast(hslToHex(ha, Math.min(s+4, 62), 78), bgHex, 3.0);
      } else {
        subText  = dSub;
        mainText = ensureContrast(hslToHex(ha, Math.min(sB-5, 78), 22), bgHex, 3.0);
      }
    }

    /* 購物專家文字色：深 Bar → 白色；淺 Bar → 背景色 */
    const barText = getLuminance(subText) > .18 ? bgHex : '#FFFFFF';

    /* 商品區陰影（背景同色相深化） */
    const shadowColor = hslToHex(ha, Math.min(s+15, 65),
      lum > .35 ? Math.max(l*.45, 18) : Math.max(l*.30, 5));

    return {
      canvasBg:    bgHex,
      mainText,
      subText,
      dateText:    mainText,
      brandText:   mainText,
      ctaText:     '#FFFFFF',
      ctaBg:       '#EE4D2D',
      barBg:       subText,
      barText,
      shadowColor,
      shadowRgba:  hexToRgba(shadowColor, .22),
      _isMidTone:  isMidTone,
    };
  }

  /* ════════════════════════════════════════════════════════
     §3. Broadcast
     ════════════════════════════════════════════════════════ */

  function _broadcastExt(palette) {
    const msg = {
      type:        'bn-color-ext',
      barBg:       palette.barBg,
      barText:     palette.barText,
      shadowColor: palette.shadowColor,
      shadowRgba:  palette.shadowRgba,
    };
    document.querySelectorAll('.preview-block iframe').forEach(f => {
      try { f.contentWindow.postMessage(msg, '*'); } catch (_) {}
    });
  }

  function broadcastTheme(palette) {
    /* 更新 colorState → 觸發現有的 UI 色票更新 + autoSave 持久化 */
    if (global.colorState) {
      Object.assign(global.colorState, {
        canvasBg:    palette.canvasBg,
        mainText:    palette.mainText,
        subText:     palette.subText,
        dateText:    palette.dateText,
        brandText:   palette.brandText,
        ctaText:     palette.ctaText,
        ctaBg:       palette.ctaBg,
        barBg:       palette.barBg,
        barText:     palette.barText,
        shadowColor: palette.shadowColor,
      });
    }
    if (typeof global.renderColorPickers === 'function') global.renderColorPickers();
    if (typeof global.broadcastColors    === 'function') {
      global.broadcastColors();
    } else {
      document.querySelectorAll('.preview-block iframe').forEach(f => {
        try {
          f.contentWindow.postMessage({ type:'bn-color', data:{
            canvasBg:  palette.canvasBg, mainText:  palette.mainText,
            subText:   palette.subText,  dateText:  palette.dateText,
            brandText: palette.brandText,ctaText:   palette.ctaText,
            ctaBg:     palette.ctaBg,
          }}, '*');
        } catch(_) {}
      });
    }
    _broadcastExt(palette);
  }

  /* ════════════════════════════════════════════════════════
     §4. Work Order — 自動偵測色碼
     ════════════════════════════════════════════════════════

     雙保險觸發：
       ① MutationObserver 監控 #wo-status → '✅ 已填入...' 時觸發
       ② wo-sheet-sel change 事件（使用者手動切換 Sheet 時觸發）
     兩者皆會呼叫 _tryApplyColor(sheetName)，函式內部去重避免重複套用。
  ════════════════════════════════════════════════════════ */

  /** 從 _woWorkbook 的指定 Sheet 提取 C 欄色碼，無填寫回傳 null */
  function _extractColor(sheetName) {
    if (!global.XLSX || !global._woWorkbook) return null;
    const sheet = global._woWorkbook.Sheets[sheetName];
    if (!sheet) return null;

    const rows = global.XLSX.utils.sheet_to_json(sheet, { header:'A', defval:'', raw:false });
    for (let i = 0; i < rows.length; i++) {
      const aVal = String(rows[i]['A'] || '');
      if (aVal.indexOf('指定色號') === -1 && aVal.indexOf('指定色碼') === -1) continue;

      const cv = String(rows[i]['C'] || '').trim();
      /* 過濾無效填寫 */
      if (!cv) return null;
      if (['無','GD','若','指定','請'].some(kw => cv.indexOf(kw) !== -1)) return null;

      /* 格式 A：純 6 位 hex（含或不含 #） */
      const plain = cv.replace(/^#+/, '');
      if (/^[0-9A-Fa-f]{6}$/.test(plain)) return ('#' + plain).toUpperCase();
      /* 格式 A：3 位短格式 */
      if (/^[0-9A-Fa-f]{3}$/.test(plain)) {
        return ('#' + plain[0]+plain[0]+plain[1]+plain[1]+plain[2]+plain[2]).toUpperCase();
      }
      /* 格式 B：字串中夾帶色碼（如「底色：#FF8866」） */
      const m = cv.match(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/);
      if (m) {
        let hx = m[1];
        if (hx.length === 3) hx = hx[0]+hx[0]+hx[1]+hx[1]+hx[2]+hx[2];
        return ('#' + hx).toUpperCase();
      }
      return null;
    }
    return null;
  }

  /* 記錄上一次套用的色碼，避免重複觸發 */
  let _lastAppliedHex = null;

  function _tryApplyColor(sheetName) {
    if (!sheetName) return;
    const hex = _extractColor(sheetName);
    if (!hex) return;                   /* 無填寫，靜默略過 */
    if (hex === _lastAppliedHex) return; /* 同色碼已套用，不重複執行 */

    const palette = generateTheme(hex);
    if (!palette) return;

    _lastAppliedHex = hex;
    broadcastTheme(palette);

    /* Toast 通知（使用 bn-state-plugin 的 toast） */
    if (global._bnStatePlugin && typeof global._bnStatePlugin.toast === 'function') {
      const label = palette._isMidTone ? '（中間色調，對比度有限）' : '';
      global._bnStatePlugin.toast('🎨 工單色碼 ' + hex + ' 已自動配色套用' + label, 'ok');
    }
  }

  function _initWorkorderHook() {
    /* ① MutationObserver：監控 #wo-status
       applyWorkorder 成功後必然寫入 '✅ 已填入...'，此時觸發 */
    const woStatus = document.getElementById('wo-status');
    if (woStatus) {
      new MutationObserver(() => {
        const text = woStatus.textContent || '';
        if (text.indexOf('✅') !== 0) return;
        const sel = document.getElementById('wo-sheet-sel');
        _tryApplyColor(sel && sel.value);
      }).observe(woStatus, { characterData:true, childList:true, subtree:true });
    }

    /* ② wo-sheet-sel change：使用者手動切換 Sheet 時也觸發
       （處理多 Sheet 工單的情況；單 Sheet 由 ① 覆蓋） */
    const sheetSel = document.getElementById('wo-sheet-sel');
    if (sheetSel) {
      sheetSel.addEventListener('change', function () {
        /* 給 applyWorkorder 一個 tick 的時間先跑完，再讀 _woWorkbook */
        setTimeout(() => _tryApplyColor(sheetSel.value), 0);
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     §5. Init
     ════════════════════════════════════════════════════════ */

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── 蝦導播 LOGO 自動切換 ────────────────────────────────────
     橘色 LOGO 在深色背景上對比不足，自動偵測背景亮度切換版本。
     檔名：橘色 ../img/shopee-live-logo.png
           白色 ../img/蝦導播LOGO_白.png
     亮度閾值：W3C 相對亮度 < 0.38 → 白色 LOGO              */
  var LOGO_ORANGE = '../img/shopee-live-logo.png';
  var LOGO_WHITE  = '../img/蝦導播LOGO_白.png';
  var _logoMode   = 'auto'; /* 'auto' | 'orange' | 'white' */

  function _relLum(hex){
    if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return 0.5;
    return [1,3,5].reduce(function(acc,i,idx){
      var c=parseInt(hex.slice(i,i+2),16)/255;
      c=c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);
      return acc+c*[0.2126,0.7152,0.0722][idx];
    },0);
  }
  function _pickLogoSrc(bgHex){
    if(_logoMode==='white')  return LOGO_WHITE;
    if(_logoMode==='orange') return LOGO_ORANGE;
    return _relLum(bgHex||'#6bc0ec')<0.38 ? LOGO_WHITE : LOGO_ORANGE;
  }
  function _broadcastLogo(src){
    var msg={type:'bn-shopee-logo',src:src,white:(src===LOGO_WHITE)};
    document.querySelectorAll('.preview-block iframe').forEach(function(f){
      try{ f.contentWindow.postMessage(msg,'*'); }catch(_){}
    });
  }
  function _broadcastLogoToId(id,src){
    var f=document.getElementById('iframe-'+id);
    if(f) try{ f.contentWindow.postMessage({type:'bn-shopee-logo',src:src,white:(src===LOGO_WHITE)},'*'); }catch(_){}
  }

  ready(() => {
    /* 等 DOM 元素就緒 */

    /* ── 手動輸入色碼 UI ─────────────────────────────────────────
       注入到側欄「背景色」區塊下方：
       [色碼輸入框] [套用] → 觸發與工單相同的配色邏輯             */
    function insertColorThemeInput(){
      var scroll = document.getElementById('sidebar-scroll');
      if(!scroll || document.getElementById('_bn_ct_hex_row')) return;

      /* 找「背景色」區塊的 #color-rows */
      var colorRows = document.getElementById('color-rows');
      if(!colorRows) return;

      var wrap = document.createElement('div');
      wrap.id = '_bn_ct_hex_row';
      wrap.style.cssText = [
        'display:flex;align-items:center;gap:6px;',
        'padding:6px 14px 10px;',
      ].join('');

      /* 輸入框 */
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 7;
      inp.placeholder = '#f5a623';
      inp.style.cssText = [
        'flex:1;background:var(--bg2,#2a2a2a);',
        'border:1px solid var(--border,#3d3d3d);',
        'border-radius:6px;color:var(--text,#e8e8e8);',
        'font-size:12px;font-family:monospace;',
        'padding:6px 8px;outline:none;',
        'transition:border-color .12s;',
      ].join('');
      inp.addEventListener('focus', function(){ this.style.borderColor='var(--accent,#ee4d2d)'; });
      inp.addEventListener('blur',  function(){ this.style.borderColor='var(--border,#3d3d3d)'; });

      /* 套用按鈕 */
      var btn = document.createElement('button');
      btn.textContent = '套用';
      btn.style.cssText = [
        'padding:6px 12px;',
        'background:var(--accent,#ee4d2d);',
        'border:none;border-radius:6px;',
        'color:#fff;font-size:11px;font-weight:700;',
        'cursor:pointer;flex-shrink:0;transition:opacity .12s;',
      ].join('');
      btn.addEventListener('mouseenter', function(){ this.style.opacity='0.85'; });
      btn.addEventListener('mouseleave', function(){ this.style.opacity='1'; });

      function applyHex(){
        var hex = inp.value.trim();
        if(!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
          inp.style.borderColor = 'var(--red,#da3633)';
          setTimeout(function(){ inp.style.borderColor='var(--border,#3d3d3d)'; }, 1200);
          return;
        }
        if(!hex.startsWith('#')) hex = '#' + hex;
        /* 更新 colorState.canvasBg 並觸發配色 */
        if(global.colorState) global.colorState.canvasBg = hex;
        if(global.renderColorPickers) global.renderColorPickers();
        if(global.broadcastColors)    global.broadcastColors();
        /* 更新 workaround：直接呼叫 applyBg（若有暴露）*/
        if(global.BNColorTheme && global.BNColorTheme.applyBg) global.BNColorTheme.applyBg(hex);
        inp.style.borderColor = 'var(--green,#2ea043)';
        setTimeout(function(){ inp.style.borderColor='var(--border,#3d3d3d)'; }, 1000);
      }

      btn.addEventListener('click', applyHex);
      inp.addEventListener('keydown', function(e){ if(e.key==='Enter') applyHex(); });

      wrap.appendChild(inp);
      wrap.appendChild(btn);

      /* 插入在 color-rows 之後 */
      if(colorRows.nextSibling) colorRows.parentNode.insertBefore(wrap, colorRows.nextSibling);
      else colorRows.parentNode.appendChild(wrap);
    }


    /* LOGO 橘白切換 UI（插在 hex input 下方）*/
    function insertLogoToggle(){
      if(document.getElementById('_bn_logo_toggle')) return;
      var colorRows=document.getElementById('color-rows');
      if(!colorRows) return;

      var wrap=document.createElement('div');
      wrap.id='_bn_logo_toggle';
      wrap.style.cssText='display:flex;align-items:center;gap:6px;padding:4px 14px 10px;';

      var label=document.createElement('span');
      label.textContent='LOGO';
      label.style.cssText='font-size:10px;color:var(--text3,#666);flex-shrink:0;';

      var modes=['auto','orange','white'];
      var labels=['自動','橘色','白色'];
      var btnMap={};

      var btnBase='padding:4px 9px;border-radius:5px;font-size:10px;font-weight:700;'+
                  'cursor:pointer;transition:.12s;border:1px solid var(--border,#3d3d3d);'+
                  'background:var(--bg2,#2a2a2a);color:var(--text2,#a0a0a0);';
      var btnActive='border-color:var(--accent,#ee4d2d);color:var(--accent,#ee4d2d);'+
                    'background:rgba(238,77,45,.08);';

      function refreshBtns(){
        modes.forEach(function(m){
          btnMap[m].style.cssText=btnBase+(_logoMode===m?btnActive:'');
        });
      }

      modes.forEach(function(m,i){
        var b=document.createElement('button');
        b.textContent=labels[i];
        b.style.cssText=btnBase;
        b.addEventListener('click',function(){
          _logoMode=m;
          refreshBtns();
          var cs=global.colorState;
          _broadcastLogo(_pickLogoSrc(cs&&cs.canvasBg));
        });
        btnMap[m]=b;
        wrap.appendChild(b);
      });

      wrap.insertBefore(label, wrap.firstChild);
      refreshBtns();

      var hexRow=document.getElementById('_bn_ct_hex_row');
      if(hexRow&&hexRow.nextSibling) hexRow.parentNode.insertBefore(wrap,hexRow.nextSibling);
      else if(hexRow) hexRow.parentNode.appendChild(wrap);
      else if(colorRows.nextSibling) colorRows.parentNode.insertBefore(wrap,colorRows.nextSibling);
      else colorRows.parentNode.appendChild(wrap);
    }

    const tryInit = () => {
      if (document.getElementById('wo-status') || document.getElementById('wo-sheet-sel')) {
        _initWorkorderHook();
        insertColorThemeInput();
        insertLogoToggle();
      } else {
        setTimeout(tryInit, 400);
      }
    };
    tryInit();

    /* ── broadcastColors Hook ────────────────────────────────────
       問題：
         hook 原本只更新 barBg/barText/shadowColor，
         mainText/subText/dateText 完全沒動，
         導致 _origBroadcast 送出的文字色永遠是舊值。

       修法：
         用 _ctAutoGenBg 追蹤「上次自動生成用的 canvasBg」。
         ● canvasBg 改變（新工單或手動換背景色）→ 重新生成全套顏色並更新 colorState
         ● canvasBg 不變 → 略過生成，保留使用者手動調整的文字色
         這樣確保：
           工單上傳 → 全套自動配色
           之後手動改色 → 不被覆蓋，直到下次 canvasBg 改變 */
    let _ctAutoGenBg = null; /* 上次完整自動生成的 canvasBg 記錄 */

    const _DEFAULT_BG = '#6bc0ec'; /* bn.html 的 colorState 初始值 */
    if (typeof global.broadcastColors === 'function') {
      const _origBroadcast = global.broadcastColors;
      global.broadcastColors = function () {
        const cs = global.colorState;

        /* ① canvasBg 非預設值，且與上次生成不同 → 重新生成全套配色 */
        if (cs && cs.canvasBg &&
            cs.canvasBg.toLowerCase() !== _DEFAULT_BG.toLowerCase() &&
            cs.canvasBg !== _ctAutoGenBg) {

          _ctAutoGenBg = cs.canvasBg;
          const p = generateTheme(cs.canvasBg);
          if (p) {
            /* 更新 colorState 全套（文字色 + 擴充色）*/
            cs.mainText   = p.mainText;
            cs.subText    = p.subText;
            cs.dateText   = p.dateText;
            cs.brandText  = p.brandText;
            cs.barBg      = p.barBg;
            cs.barText    = p.barText;
            cs.shadowColor = p.shadowColor;
            /* 重繪側欄色票點 */
            if (typeof global.renderColorPickers === 'function') {
              global.renderColorPickers();
            }
          }
        }

        /* ② 送出標準色（使用更新後的 colorState）*/
        _origBroadcast.call(this);

        /* ③ 送出擴充色 */
        if (cs && (cs.barBg || cs.shadowColor)) {
          _broadcastExt({
            barBg:       cs.barBg,
            barText:     cs.barText,
            shadowColor: cs.shadowColor,
            shadowRgba:  hexToRgba(cs.shadowColor || '#000000', .22),
          });
        }
        /* ④ 背景色改變時同步 LOGO */
        if (cs && cs.canvasBg) _broadcastLogo(_pickLogoSrc(cs.canvasBg));
      };
    }

    /* iframe 就緒時補送擴充色
       canvasBg 非預設 → 生成配色並送出（_ctAutoGenBg 已在 broadcastColors 設好） */
    const origOnReady = global._bnOnIframeReady;
    global._bnOnIframeReady = function (id) {
      if (typeof origOnReady === 'function') origOnReady(id);
      const cs = global.colorState;
      if (!cs || !cs.canvasBg || cs.canvasBg.toLowerCase() === _DEFAULT_BG.toLowerCase()) return;
      const p = generateTheme(cs.canvasBg);
      if (!p) return;
      const f = document.getElementById('iframe-' + id);
      if (f) {
        setTimeout(() => {
          try { f.contentWindow.postMessage({
            type: 'bn-color-ext',
            barBg: p.barBg, barText: p.barText,
            shadowColor: p.shadowColor, shadowRgba: p.shadowRgba,
          }, '*'); } catch (_) {}
          _broadcastLogoToId(id, _pickLogoSrc(cs.canvasBg));
        }, 300);
      }
    };
  });

  /* 公開 API（供除錯 / 手動指定用） */
  global.BNColorTheme = {
    /** 指定背景色並立即套用到所有版位。例：BNColorTheme.applyBg('#FFB6C1') */
    applyBg: function (bgHex) {
      if (!bgHex) return;
      const hex = bgHex.trim().toUpperCase().replace(/^(?!#)/, '#');
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) { console.warn('[BNColorTheme] 色號格式錯誤：', hex); return; }
      _lastAppliedHex = hex;
      const palette = generateTheme(hex);
      if (palette) broadcastTheme(palette);
    },
    /** 只生成 palette，不套用。 */
    generate:     generateTheme,
    broadcast:    broadcastTheme,
    contrastRatio,
    getLuminance,
  };

})(window);
