/*!
 * layout-runtime.js
 * 所有排版版位共用的執行邏輯
 * 由各版位 HTML 載入：<script src="../js/layout-runtime.js"></script>
 */
(function(){

(function () {
  var urlId = parseInt(new URLSearchParams(location.search).get('bnid')) || 0;
  var fname = decodeURIComponent(location.pathname.split('/').pop().replace(/\.html$/i, ''));

  function loadCSS(href, cb) {
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onload = cb || function(){};
    l.onerror = function(){ if(cb) cb(); };
    document.head.appendChild(l);
  }
  var loaded = 0;
  function onBothLoaded() {
    loaded++;
    if (loaded >= 2) requestAnimationFrame(function(){ requestAnimationFrame(init); });
  }
  loadCSS(fname + '.css',        onBothLoaded);
  loadCSS(fname + '.config.css', onBothLoaded);
  window.addEventListener('load', function(){ setTimeout(init, 600); });
  var inited = false;

  function init() {
    if (inited) return;
    inited = true;
    var root = getComputedStyle(document.documentElement);
    var canvas = document.getElementById('canvas');
    var W = parseFloat(root.getPropertyValue('--canvas-w')) || parseFloat(document.body.dataset.fw) || 900;
    var H = parseFloat(root.getPropertyValue('--canvas-h')) || parseFloat(document.body.dataset.fh) || 600;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    var bgRaw = root.getPropertyValue('--bg-img').trim();
    if (bgRaw && bgRaw !== 'none' && bgRaw !== '') {
      var bsrc = bgRaw.replace(/^url\(["']?/,'').replace(/["']?\)$/,'').trim();
      var bimg = document.getElementById('底圖');
      if (bimg) { bimg.src = bsrc; bimg.style.display = 'block'; }
    }

    var ctaRaw = root.getPropertyValue('--cta-classes').trim().replace(/^["']/,'').replace(/["']$/,'');
    var ctaSet = {};
    if (ctaRaw) ctaRaw.split(',').forEach(function(s){ var k=s.trim(); if(k) ctaSet[k]=true; });

    var layersRaw = root.getPropertyValue('--layers').trim().replace(/^["']/,'').replace(/["']$/,'');
    if (layersRaw) {
      /* pointer-events:none 的圖層 class（透明容器不應攔截點擊）
         ★ 商品範圍不在此清單：它是商品圖的實際容器，必須接收點擊 */
      var pointerNoneClasses = {'LOGO範圍':true,'logo範圍':true,'TEXT':true};

      layersRaw.split(',').forEach(function(s) {
        s = s.trim(); if (!s) return;
        var parts = s.split('|'), cls = parts[0].trim(), txt = parts.length>1 ? parts[1].trim() : '';
        if (!cls) return;
        var el = document.createElement('div');
        el.className = cls;
        /* 透明容器：不攔截點擊，讓點擊穿透到文字圖層 */
        if (pointerNoneClasses[cls]) {
          el.style.pointerEvents = 'none';
        }
        if (ctaSet[cls]) {
          var s1 = document.createElement('span'); s1.className = 'cta-text'; if(txt) s1.textContent = txt;
          var s2 = document.createElement('span'); s2.className = 'cta-arrow';
          el.appendChild(s1); el.appendChild(s2);
        } else { if(txt) el.textContent = txt; }
        canvas.appendChild(el);
      });
    }

    function fit() {
      if (window.parent !== window) {
        canvas.style.transform = 'none';
        var st = document.getElementById('stage');
        if (st) { st.style.width = W+'px'; st.style.height = H+'px'; }
        return;
      }
      var sc = Math.min(window.innerWidth/W, window.innerHeight/H);
      var st = document.getElementById('stage');
      canvas.style.transform = 'scale('+sc+')';
      st.style.width  = (W*sc)+'px';
      st.style.height = (H*sc)+'px';
    }
    window.addEventListener('resize', fit);
    fit();
    if (window.parent !== window && urlId)
      window.parent.postMessage({type:'bn-iframe-ready',id:urlId,w:W,h:H},'*');

    /* 清除可能殘留的舊版商品區陰影元素（舊版 layout-runtime 遺留） */
    document.querySelectorAll('.bn-product-shadow-layer').forEach(function(el){ el.remove(); });

    /* 啟用畫布文字直接編輯 */
    attachEditableToAll();
  }

  window.addEventListener('message', function(e) {
    if (!e.data) return;

    if (e.data.type === 'bn-text') {
      var d = e.data.data||{};
      ['品牌名','主標','副標','日期','購物專家'].forEach(function(cls) {
        if (d[cls]===undefined) return;
        document.querySelectorAll('.'+cls).forEach(function(el) {
          var ct = el.querySelector('.cta-text');
          if(ct) ct.textContent = d[cls];
          else if(!el.children.length) el.textContent = d[cls];
        });
      });

      /* 日期跟隨主標：若 config.css 設定 --date-follow-headline: "1"，
         在主標文字更新後動態計算主標的視覺寬度，
         把日期的 left 設為「主標左邊界 + 主標視覺寬度 + 間距」
         使用 getBoundingClientRect().width 取得含 matrix 縮放後的實際寬度 */
      if (d['主標'] !== undefined) {
        var followDate = (getComputedStyle(document.documentElement)
                          .getPropertyValue('--date-follow-headline')||'').trim().replace(/["']/g,'');
        if (followDate === '1' || followDate === 'center') {
          /* 雙層 rAF：確保文字與字型渲染完成後再量測寬度 */
          requestAnimationFrame(function(){ requestAnimationFrame(_syncDateToHeadline); });
        }
      }
    }

    /* 畫布直接編輯完成後，父層轉換好再推回來 */
    if (e.data.type === 'bn-text-set') {
      var cls = e.data.field;
      var val = e.data.value;
      if(!cls) return;
      document.querySelectorAll('.'+cls).forEach(function(el) {
        var ct = el.querySelector('.cta-text');
        /* 編輯中不更新，避免跟 contenteditable 衝突 */
        if(el.contentEditable === 'true') return;
        if(ct) ct.textContent = val;
        else if(!el.children.length) el.textContent = val;
      });
      /* 主標更新時同步觸發日期位置重算 */
      if (cls === '主標') {
        var followDate2 = (getComputedStyle(document.documentElement)
                           .getPropertyValue('--date-follow-headline')||'').trim().replace(/["']/g,'');
        if (followDate2 === '1' || followDate2 === 'center') {
          requestAnimationFrame(function(){ requestAnimationFrame(_syncDateToHeadline); });
        }
      }
    }

    if (e.data.type === 'bn-color') {
      var c = e.data.data||{}, cv = document.getElementById('canvas');
      if (c.canvasBg) {
        var bg = cv.querySelector('.背景色');
        if(bg) bg.style.backgroundColor = c.canvasBg; else cv.style.background = c.canvasBg;
      }
      function ac(cls,col){ if(!col)return; document.querySelectorAll('.'+cls).forEach(function(el){ if(!el.querySelector('.cta-text')) el.style.color=col; }); }
      ac('主標',c.mainText); ac('副標',c.subText); ac('日期',c.dateText); ac('品牌名',c.brandText);
      document.querySelectorAll('.cta-text').forEach(function(el){ if(c.ctaText) el.style.color=c.ctaText; });
      document.querySelectorAll('.cta-arrow').forEach(function(el){ if(c.ctaText) el.style.borderLeftColor=c.ctaText; });
      /* CTA 底色：.逛逛去按鈕 / .cta底 / .逛逛去底 */
      document.querySelectorAll('.逛逛去按鈕,.cta底,.逛逛去底').forEach(function(el){ if(c.ctaBg) el.style.backgroundColor=c.ctaBg; });
      /* CTA 文字色：.放心買_安心退 / .逛逛去 */
      document.querySelectorAll('.放心買_安心退,.逛逛去').forEach(function(el){ if(c.ctaText) el.style.color=c.ctaText; });
      /* CTA 三角色：.cta三角標 / .逛逛去三角標 */
      document.querySelectorAll('.cta三角標').forEach(function(el){ if(c.ctaText) el.style.borderLeftColor=c.ctaText; });
      document.querySelectorAll('.逛逛去三角標').forEach(function(el){ if(c.ctaText) el.style.borderLeftColor=c.ctaText; });
      /* 清除舊版商品區陰影（確保任何顏色廣播都觸發清理） */
      document.querySelectorAll('.bn-product-shadow-layer').forEach(function(el){ el.remove(); });
    }

    if (e.data.type === 'bn-logo' || e.data.type === 'bn-logos') {
      /* --logo-target：指定廠商 LOGO 注入目標（預設 .LOGO範圍/.logo範圍）
         config.css 可宣告 --logo-target: "廠商LOGO範圍" 讓廠商 LOGO 注入到子容器
         這樣蝦導播官方 LOGO 可以在 HTML 靜態放置，廠商 LOGO 獨立管理 */
      var logoTarget = (getComputedStyle(document.documentElement)
                         .getPropertyValue('--logo-target')||'').trim().replace(/["']/g,'');
      var zone = null;
      if (logoTarget) {
        zone = document.querySelector('.' + logoTarget);
      }
      if (!zone) {
        ['logo範圍','LOGO範圍'].forEach(function(n){ if(!zone){ var z=document.querySelector('.'+n); if(z) zone=z; } });
      }
      if (!zone) return;

      Array.from(zone.querySelectorAll('img.bn-logo-img')).forEach(function(i){i.remove();});
      /* 還原 display 避免舊設定殘留 */
      zone.style.display = ''; zone.style.alignItems = '';

      var fn = decodeURIComponent(location.pathname.split('/').pop());
      var fnLow = fn.toLowerCase();
      /* HBN：檔名含 hbn */
      var isHBN = fnLow.indexOf('hbn') !== -1;
      /* IG方/ddcard方：不是 HBN、但檔名含「方」→ 正方形 logo 範圍 */
      var isIGSquare = !isHBN && fn.indexOf('方') !== -1;
      /* ddcard橫：檔名含 ddcard → 橫式 logo 範圍（多張並排） */
      var isDDCard = fnLow.indexOf('ddcard') !== -1;

      /* --logo-mode CSS 變數覆寫：config.css 可宣告 --logo-mode: "hbn" 強制指定模式
         不宣告時維持原本檔名判斷邏輯，確保現有版位不受影響 */
      var logoMode = (getComputedStyle(document.documentElement)
                       .getPropertyValue('--logo-mode') || '').trim().replace(/["']/g,'');
      if (logoMode === 'hbn')      { isHBN = true;  isIGSquare = false; isDDCard = false; }
      else if (logoMode === 'square') { isHBN = false; isIGSquare = true;  isDDCard = false; }
      else if (logoMode === 'flex')   { isHBN = false; isIGSquare = false; isDDCard = false; }

      var logos = [];
      if (e.data.type === 'bn-logos') logos = e.data.logos || [];
      else if (e.data.dataUrl) logos = [{id:'single', src:e.data.dataUrl}];

      if (!logos.length) { zone.style.opacity=''; zone.style.background=''; return; }

      /* IG方：只取第一張 */
      if (isIGSquare) logos = logos.slice(0, 1);
      if (isDDCard && !isIGSquare) logos = logos.slice(0, 1); /* ddcard橫也只取一張 */

      zone.style.background = 'transparent';
      zone.style.opacity    = '1';
      /* 不覆蓋 position，保持 CSS 的 absolute 定位 */
      zone.style.overflow   = 'hidden';

      /* HBN：absolute 多張；IG方/ddcard方：單張 contain 正方；IG橫/ddcard橫：flex 並排 */
      if(isHBN){
        /* HBN：每個 logo 用 absolute 定位，從左往右排，間距 GAP px
           全部 onload 後計算總寬，若超出容器則等比縮小所有圖片 */
        zone.style.display = '';
        var GAP = 8;
        var loadedCount = 0;
        var totalLogos  = logos.length;

        logos.forEach(function(lg, i){
          var img = new Image(); img.className = 'bn-logo-img';
          var roundCss = lg.round ? 'border-radius:10px;' : '';
          /* 初始設為 0x0 完全隱藏，onload 後才設定精確尺寸
             避免 height:100% 在計算前造成拉伸 */
          img.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;'+
                              'object-fit:contain;pointer-events:none;'+roundCss;
          img.src = lg.src;
          zone.appendChild(img);

          img.onload = function(){
            loadedCount++;
            var cs    = window.getComputedStyle(zone);
            /* 優先讀 CSS 變數 --logo-zone-h / --logo-zone-w（精確設計尺寸）
               fallback 到 getComputedStyle → 最後才用預設值 */
            var rootCs = window.getComputedStyle(document.documentElement);
            var zoneH = parseFloat(rootCs.getPropertyValue('--logo-zone-h')) ||
                        parseFloat(cs.height) || 57;
            var zoneW = parseFloat(rootCs.getPropertyValue('--logo-zone-w')) ||
                        parseFloat(cs.width)  || 125;

            /* 設定此圖自然高寬 */
            var ratio = img.naturalWidth / (img.naturalHeight || 1);
            img.dataset.naturalW = String(Math.round(zoneH * ratio));

            if (loadedCount < totalLogos) return; /* 等其他圖也 load */

            /* 全部載完：計算總寬 */
            var allImgs = Array.from(zone.querySelectorAll('img.bn-logo-img'));
            var n = allImgs.length;
            var totalW = 0;
            allImgs.forEach(function(el, idx){
              totalW += parseFloat(el.dataset.naturalW || 0);
              if (idx < n - 1) totalW += GAP;
            });

            /* 若超出容器寬度，等比縮小 scale
               ★ scale 只作用於圖片寬度，GAP 固定不縮放
               所以可用空間 = zoneW - GAP*(n-1)，再除以純圖片總寬 */
            var imgOnlyW = totalW - GAP * (n - 1);
            var availW   = zoneW  - GAP * (n - 1);
            var scale = (imgOnlyW > availW && imgOnlyW > 0) ? (availW / imgOnlyW) : 1;
            var x = 0;
            allImgs.forEach(function(el){
              var w = Math.round(parseFloat(el.dataset.naturalW || 0) * scale);
              var h = Math.round(zoneH * scale);
              var topOffset = Math.round((zoneH - h) / 2);
              el.style.width   = w + 'px';
              el.style.height  = h + 'px';
              el.style.left    = x + 'px';
              el.style.top     = topOffset + 'px';
              el.style.display = 'block';
              x += w + GAP;
            });
          };

          img.onerror = function(){
            loadedCount++;
          };
        });
      } else if(isIGSquare){
        /* IG方：單張，依較大邊 contain 縮放，置中不裁切 */
        zone.style.display = 'flex';
        zone.style.alignItems = 'center';
        zone.style.justifyContent = 'center';
        zone.style.transformOrigin = '';
        var lg0 = logos[0];
        var img0 = new Image(); img0.className = 'bn-logo-img';
        var roundCss0 = lg0.round ? 'border-radius:10px;' : '';
        /* max-width/max-height 100% + width/height auto = contain 效果，不裁切 */
        img0.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;pointer-events:none;display:block;'+roundCss0;
        img0.src = lg0.src;
        zone.appendChild(img0);
      } else {
        /* flex 置中模式：多張廠商 LOGO 並排，自動縮放至 zone 範圍
           蝦導播 LOGO（.蝦導播LOGO範圍）是 zone 的 flex sibling，大小不受影響
           ① 載入所有圖片，量測各自在 zoneH 高度下的自然寬度
           ② 若總寬超出 zoneW，等比縮小所有廠商 LOGO
           ③ zone 切換為 flex 並排，logo 設為計算後的精確尺寸 */
        var FLEX_GAP  = 10;
        var fRootCs   = window.getComputedStyle(document.documentElement);
        var flexZoneH = parseFloat(fRootCs.getPropertyValue('--logo-zone-h')) ||
                        parseFloat(window.getComputedStyle(zone).height) || 60;
        var flexZoneW = parseFloat(fRootCs.getPropertyValue('--logo-zone-w')) ||
                        parseFloat(window.getComputedStyle(zone).width)  || 120;
        var flexLoaded = 0;
        var flexTotal  = logos.length;
        var flexImgs   = [];

        logos.forEach(function(lg) {
          var img = new Image(); img.className = 'bn-logo-img';
          var rCss = lg.round ? 'border-radius:10px;' : '';
          img.style.cssText = 'width:0;height:0;object-fit:contain;pointer-events:none;display:none;flex-shrink:0;' + rCss;
          img.src = lg.src;
          flexImgs.push(img);
          zone.appendChild(img);

          img.onload = function() {
            flexLoaded++;
            var ratio = img.naturalWidth / (img.naturalHeight || 1);
            img.dataset.naturalW = String(Math.round(flexZoneH * ratio));
            if (flexLoaded < flexTotal) return;

            /* 全部載完：計算是否需要等比縮放 */
            var n = flexImgs.length;
            var totalW = 0;
            flexImgs.forEach(function(el, idx) {
              totalW += parseFloat(el.dataset.naturalW || 0);
              if (idx < n - 1) totalW += FLEX_GAP;
            });
            var imgOnlyW = totalW - FLEX_GAP * (n - 1);
            var availW   = flexZoneW - FLEX_GAP * (n - 1);
            var scale    = (imgOnlyW > availW && imgOnlyW > 0) ? (availW / imgOnlyW) : 1;

            zone.style.display        = 'flex';
            zone.style.alignItems     = 'center';
            zone.style.justifyContent = 'center';
            zone.style.gap            = FLEX_GAP + 'px';

            flexImgs.forEach(function(el) {
              var w = Math.round(parseFloat(el.dataset.naturalW || 0) * scale);
              var h = Math.round(flexZoneH * scale);
              el.style.width   = w + 'px';
              el.style.height  = h + 'px';
              el.style.display = 'block';
            });
          };
          img.onerror = function() { flexLoaded++; };
        });
      }
    }

    /* 商品新增 */
    if (e.data.type === 'bn-product-add') {
      var pzone = getProductZone(); if(!pzone) return;
      /* 去重：移除相同 id 的舊 box */
      var existing = pzone.querySelector('.bn-prod-box[data-id="'+e.data.id+'"]');
      if (existing) existing.remove();
      pzone.style.background = 'transparent'; pzone.style.opacity = '1';
      pzone.style.overflow = 'visible'; pzone.style.position = 'relative';
      var box = document.createElement('div');
      box.className = 'bn-prod-box';
      box.dataset.id = e.data.id;
      box.dataset.ratio = e.data.ratio||1;
      box.dataset.sizeScale = e.data.sizeScale||1;
      box.dataset.position  = e.data.position !== undefined ? e.data.position : e.data.index || 0;
      /* 明確加 pointer-events:auto，確保不繼承父容器的 pointer-events:none */
      box.style.pointerEvents = 'auto';
      var pimg = document.createElement('img'); pimg.src = e.data.src;
      pimg.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;display:block;';
      box.appendChild(pimg);
      ['nw','ne','sw','se'].forEach(function(c){
        var h = document.createElement('div'); h.dataset.corner = c;
        h.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;'+
          'background:#4a90e2;border:2px solid #fff;z-index:20;display:none;'+  /* 預設隱藏 */
          (c==='nw'?'left:-7px;top:-7px;cursor:nwse-resize;':'')+
          (c==='ne'?'right:-7px;top:-7px;cursor:nesw-resize;':'')+
          (c==='sw'?'left:-7px;bottom:-7px;cursor:nesw-resize;':'')+
          (c==='se'?'right:-7px;bottom:-7px;cursor:nwse-resize;':'');
        box.appendChild(h);
      });
      pzone.appendChild(box);
      setupProdDrag(box, pzone);
      layoutProducts(pzone);
      /* 商品盒建立完成後延遲 30ms，等待同批次所有 bn-product-add 落地後
         再執行 _smartAutoLayout，避免中途觸發導致位置計算不完整 */
      setTimeout(_smartAutoLayout, 30);
    }

    /* 人物就地更新：更新 src/ratio，不重置位置（編輯/去背完成後使用，邏輯比照商品圖 bn-product-update）
       ★ 重要：若改用整批替換的 bn-persons，會清空重建所有人物 DOM，
       連動觸發下方的「直式高窄版位避讓演算法／座標分派」重新計算，導致使用者已調整過的位置被打回預設值。
       此處改為精準定位單一 .bn-person-box，只更新圖片來源與寬高比，不碰任何座標／x/y/h 欄位。*/
    if (e.data.type === 'bn-person-update') {
      var pzone2 = getProductZone(); if(!pzone2) return;
      var pbox = pzone2.querySelector('.bn-person-box[data-id="'+e.data.id+'"]');
      if (!pbox) return;  /* 防呆：該人物可能已被使用者移除，找不到對應 DOM 直接中止 */
      var pImgEl = pbox.querySelector('img');
      if (pImgEl) pImgEl.src = e.data.src;
      /* 保持高度不變，依新 ratio 重算寬度（與商品圖相同的等比縮放策略，不動 left/top）*/
      var newPRatio = parseFloat(e.data.ratio) || 1;
      var curPH = parseFloat(pbox.style.height) || pbox.offsetHeight || 100;
      pbox.style.width = Math.round(curPH * newPRatio) + 'px';
      pbox.dataset.ratio = String(newPRatio);
      return;
    }

    /* 商品就地更新：更新 src/ratio，不重置位置（陰影重算/切換使用）*/
    if (e.data.type === 'bn-product-update') {
      var pzone = getProductZone(); if(!pzone) return;
      var box = pzone.querySelector('.bn-prod-box[data-id="'+e.data.id+'"]');
      if (!box) return;
      var imgEl = box.querySelector('img');
      if (imgEl) imgEl.src = e.data.src;
      /* 保持高度不變，依新 ratio 重算寬度 */
      var newRatio = parseFloat(e.data.ratio) || 1;
      var curH = parseFloat(box.style.height) || box.offsetHeight || 100;
      box.style.width = Math.round(curH * newRatio) + 'px';
      box.dataset.ratio = String(newRatio);
      return;
    }

    if (e.data.type === 'bn-product-remove') {
      var pzone = getProductZone(); if(!pzone) return;
      var el = pzone.querySelector('.bn-prod-box[data-id="'+e.data.id+'"]');
      if(el) el.remove();
      var remaining = pzone.querySelectorAll('.bn-prod-box');
      if(!remaining.length) { pzone.style.background=''; pzone.style.opacity=''; }
      else setTimeout(_smartAutoLayout, 30);
    }

    /* z-index 順序更新：order[0] = 最上層（z 最高） */
    if (e.data.type === 'bn-product-zorder') {
      var pzone = getProductZone(); if(!pzone) return;
      var order = e.data.order || [];
      var total = order.length;
      order.forEach(function(id, i){
        var box = pzone.querySelector('.bn-prod-box[data-id="'+id+'"]');
        if(box) box.style.zIndex = String(total - i + 10);
      });
    }

    /* 人物圖層順序更新：order[0] = 最前層（z 最高）
       只更新 z-index，不重建 box，保留使用者手動拖移的位置 */
    if (e.data.type === 'bn-person-zorder') {
      var pzone = getProductZone(); if(!pzone) return;
      var order = e.data.order || [];
      var total = order.length;
      order.forEach(function(id, i){
        var box = pzone.querySelector('.bn-person-box[data-id="'+id+'"]');
        if(box) box.style.zIndex = String(20 + total - 1 - i);
      });
    }

    /* 構圖預設：套用 preset 的人物 + 商品位置（百分比相對於商品範圍）*/
    if (e.data.type === 'bn-compose') {
      /* 記住最後一次套用的構圖，供 _smartAutoLayout 在商品數量變動時重用 */
      window.__bnLastPreset = e.data.preset;
      _applyCompose(e.data.preset);
      return;
    }

    /* 蝦導播 LOGO 切換：橘色 ↔ 白色，同步更新分隔線顏色
       支援直式版位自訂 LOGO：config.css 可宣告
         --shopee-logo-orange: "../img/蝦導播logo_直式_橘.png"
         --shopee-logo-white:  "../img/蝦導播logo_直式_白.png"
       未宣告時 fallback 到 e.data.src（系統預設橫式 LOGO）*/
    if (e.data.type === 'bn-shopee-logo') {
      var logoEl = document.querySelector('.蝦導播官方LOGO');
      if (logoEl) {
        var rootCsLogo   = getComputedStyle(document.documentElement);
        var customOrange = (rootCsLogo.getPropertyValue('--shopee-logo-orange')||'').trim().replace(/["']/g,'');
        var customWhite  = (rootCsLogo.getPropertyValue('--shopee-logo-white') ||'').trim().replace(/["']/g,'');
        var usePath = e.data.white ? (customWhite || e.data.src) : (customOrange || e.data.src);
        if (usePath) { logoEl.src = usePath; logoEl.style.display = 'block'; }
      }
      /* 分隔線：與 LOGO 同色——白色 LOGO → 白色，橘色 LOGO → 蝦皮橘 */
      var divider = document.querySelector('.分隔線');
      if (divider) {
        var divColor = e.data.white ? 'rgba(255,255,255,0.75)' : 'rgba(238,77,45,0.85)';
        divider.style.setProperty('background',   divColor, 'important');
        divider.style.setProperty('border-color', divColor, 'important');
      }
      return;
    }

    /* Legacy compatibility: single-person messages still need to be treated as persons array */
    if (e.data.type === 'bn-person') {
      var persons = [];
      if (e.data.src) {
        persons.push({
          id: e.data.id || 'person_0',
          src: e.data.src,
          ratio: (typeof e.data.ratio === 'number' ? e.data.ratio : parseFloat(e.data.ratio) || 1),
          zOrder: (typeof e.data.zOrder === 'number' ? e.data.zOrder : 0)
        });
      }
      e.data.type = 'bn-persons';
      e.data.persons = persons;
    }

    /* 人物圖：由 config.css 定義初始 slot，支援拖移/縮放，永遠在最上層 */
    // 更改為接收複數人物陣列訊號
    if (e.data.type === 'bn-persons') {
      var pzone = getProductZone();
      if (!pzone) return;

      /* 1. 清除舊的「所有」人物外殼（避免殘留） */
      var oldPersons = pzone.querySelectorAll('.bn-person-box');
      oldPersons.forEach(function(el) { el.remove(); });

      var persons = e.data.persons || [];
      if (persons.length === 0) return;

      /* 讀取畫布與外框的當前樣式 */
      var rootCs = window.getComputedStyle(document.documentElement);
      var pcs = window.getComputedStyle(pzone);
      var zw  = parseFloat(pcs.width)  || pzone.offsetWidth  || 400;
      var zh  = parseFloat(pcs.height) || pzone.offsetHeight || 300;

      /* 2. 使用迴圈依序渲染每一張人物圖 */
      persons.forEach(function(personData, index) {
        if (!personData.src) return;

        // 智慧型變數判定：優先尋找第二個人的獨立控制變數（如 --bn-person2-x），若無則帶入基本預設
        var suffix = index === 0 ? '' : '2';
        var personX = (rootCs.getPropertyValue('--bn-person' + suffix + '-x') || rootCs.getPropertyValue('--bn-person-x') || '').trim();
        
        // 防呆：如果連第一個人物的基本 X 座標都沒定義，代表此版位不支援人物，直接跳過
        if (!personX && index === 0) return;

        // 防疊加機制：如果上傳了第二個人，但該版位的 config.css 還沒設定 --bn-person2-x，
        // 我們自動幫第二個人往右偏移 15%，避免兩個人完美重疊導致滑點不到下面的圖
        if (index === 1 && !rootCs.getPropertyValue('--bn-person2-x')) {
          personX = String(parseFloat(personX || '0') + 15) + '%';
        }

        var personBottom = (rootCs.getPropertyValue('--bn-person' + suffix + '-bottom') || rootCs.getPropertyValue('--bn-person-bottom') || '0%').trim();
        var personH      = (rootCs.getPropertyValue('--bn-person' + suffix + '-h')      || rootCs.getPropertyValue('--bn-person-h')      || '88%').trim();

        /* 延續您原有的精密 px 比例演算 */
        var ratio        = parseFloat(personData.ratio) || 1;
        var hPx          = parseFloat(personH)       / 100 * zh;
        var wPx          = Math.round(hPx * ratio);
        var leftPx       = Math.round(parseFloat(personX) / 100 * zw);
        var bottomOffset = parseFloat(personBottom)  / 100 * zh;
        var topPx        = Math.max(0, Math.round(zh - bottomOffset - hPx));

        var box = document.createElement('div');
        box.className     = 'bn-person-box bn-person-idx-' + index;
        box.dataset.id    = personData.id || ('person_' + index);  /* ★ ID，供 bn-person-zorder handler 定址 */
        box.dataset.ratio = String(ratio);          /* setupProdDrag 等比縮放用 */

        /* ★ z-index：從 personData.zOrder 計算（zOrder=0 = 最前層）
           n = 總人物數；zOrder 最小 → z 最高（最前）
           公式：z = 20 + (n - 1 - zOrder)
           例如 2 人：zOrder=0 → z=21（前），zOrder=1 → z=20（後）*/
        var totalPersons = persons.length;
        var zOrder = (personData.zOrder !== undefined) ? personData.zOrder : index;
        var personZ = 20 + (totalPersons - 1 - zOrder);

        box.style.cssText = [
          'position:absolute;',
          'left:'+leftPx+'px; top:'+topPx+'px;',
          'width:'+wPx+'px; height:'+Math.round(hPx)+'px;',
          'cursor:move; box-sizing:border-box;',
          'outline:2px solid transparent;',
          'overflow:visible;',
          'z-index:' + personZ + ';',
          'pointer-events:auto;',
        ].join('');

        var img = document.createElement('img');
        img.src = personData.src;
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;';
        box.appendChild(img);

        /* Corner handles：保持您的橘色控制點，並根據圖層微調 z-index */
        ['nw','ne','sw','se'].forEach(function(c){
          var h = document.createElement('div');
          h.dataset.corner = c;
          h.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;'+
            'background:#ee4d2d;border:2px solid #fff;z-index:' + (22 + index) + ';display:none;'+
            (c==='nw'?'left:-7px;top:-7px;cursor:nwse-resize;':'')+
            (c==='ne'?'right:-7px;top:-7px;cursor:nesw-resize;':'')+
            (c==='sw'?'left:-7px;bottom:-7px;cursor:nesw-resize;':'')+
            (c==='se'?'right:-7px;bottom:-7px;cursor:nwse-resize;':'');
          box.appendChild(h);
        });

        pzone.appendChild(box);
        setupProdDrag(box, pzone);  /* 讓新生成的每一張人物圖，都具備獨立的拖移/縮放/滾輪能力 */
      });

      /* ==========================================
      商品數量同步控制（與人物共用邏輯）
       ========================================== */

       var productEls = Array.from(
       document.querySelectorAll('.bn-product')
       );

      /* 防呆：沒有商品直接跳出 */
       if (productEls.length) {

       var visibleProdCount =
        Array.isArray(preset.prods)
       ? preset.prods.length
       : 0;

       productEls.forEach(function(el, idx){

      /* 超出構圖需求的商品直接隱藏 */
        if (idx >= visibleProdCount) {

        el.style.display = 'none';
        el.style.pointerEvents = 'none';

       } else {

        el.style.display = '';
        el.style.pointerEvents = '';
       }

  });
}
      /* 確保 zone 屬性正確 */
      pzone.style.overflow = 'visible';
      pzone.style.position = 'relative';
      return;
    }

    /* 底圖核對：疊加半透明底圖（完全保留您原有的邏輯） */
    if (e.data.type === 'bn-bg-overlay') {
      var overlay = document.getElementById('_bn_bg_overlay');
      if(!overlay){
        overlay = document.createElement('img');
        overlay.id = '_bn_bg_overlay';
        overlay.style.cssText = [
          'position:absolute;top:0;left:0;',
          'width:100%;height:100%;',
          'object-fit:contain;object-position:top left;',
          'z-index:9999;pointer-events:none;',
          'opacity:0.5;',
        ].join('');
        document.getElementById('canvas').appendChild(overlay);
      }
      if(e.data.src){
        overlay.style.display = 'none'; /* 先隱藏，load 成功再顯示 */
        overlay.onerror = function(){ overlay.style.display = 'none'; };
        overlay.onload  = function(){ overlay.style.display = 'block'; };
        overlay.src = e.data.src;
      } else {
        overlay.style.display = 'none';
        overlay.src = '';
      }
      return;
    }

    /* 畫布截圖（完全保留您原有的邏輯） */
    if (e.data.type === 'bn-capture') {
      captureCanvas(function(dataUrl){
        window.parent.postMessage({type:'bn-snapshot',msgId:e.data.msgId,dataUrl:dataUrl},'*');
      });
    }

    /* ── bn-color-ext：自動配色器擴充屬性 ──────────────────────
       由 color-theme-plugin.js 廣播，此處接收後套用至版位。
       包含：Bar底色漸層、購物專家文字色、背景幾何陰影、商品區過渡陰影。
       ──────────────────────────────────────────────────────── */
    if (e.data.type === 'bn-color-ext') {

      /* 1. Bar 底色漸層
            左側完全透明 → 右側漸變為實色（副標同色）
            使用 background 漸層取代 backgroundColor，實現透明漸層效果 */
      if (e.data.barBg) {
        document.querySelectorAll('.bar範圍').forEach(function(el) {
          el.style.background =
            'linear-gradient(to right, transparent 0%, ' + e.data.barBg + ' 50%)';
        });
      }

      /* 2. 購物專家文字色
            深色 Bar → 白色文字
            淺色 Bar → 背景色文字（由 color-theme-plugin 預先計算好）
            套用到 .bar範圍 及其所有子元素 */
      if (e.data.barText) {
        document.querySelectorAll('.bar範圍').forEach(function(barEl) {
          barEl.style.color = e.data.barText;
          barEl.querySelectorAll('*').forEach(function(child) {
            child.style.color = e.data.barText;
          });
        });
      }

      /* 3. 背景幾何陰影（平行四邊形）
            PS 資料：畫布 1125×360，包圍框 X=785 Y=182 W=343 H=116
            四頂點（順時針）：
              左上 69.8% 50.5%  ← 左下 X 往右偏 = 正確「\」斜向
              右上 100%  50.5%
              右下 100%  115%  ← 延伸至畫布外，底緣不可見
              左下 76.0% 115%  ← 此 X 為斜切估算值，可微調控制斜角
            漸層方向：左→右 + 下→上 同時（對角線漸層 to top left 表達）
            羽化：blur(30px) 加強邊緣暈散 */
      if (e.data.shadowRgba || e.data.shadowColor) {
        var canvas = document.getElementById('canvas');
        if (canvas) {
          /* ── Canvas 陰影取代 div+clip-path+filter ──────────────────
             html2canvas 不支援 clip-path:polygon() 與 filter:blur()，
             改用 <canvas> 繪製：形狀直接畫在像素上，blur 用 ctx.filter
             烘入，html2canvas 讀取 canvas 像素時即為正確效果。

             形狀參數可在各版位 config.css 的 :root 宣告 CSS 變數來覆寫，
             未宣告時使用以下預設值（對應 1125×360 LPBN 版位）：
               --shadow-top-y    : 50.5   ← 地平線高度（畫布 % ）
               --shadow-left-x   : 69.8   ← 陰影左上角 X（畫布 % ）
               --shadow-slant-x  : 76.0   ← 陰影左下角 X，控制斜角
               --shadow-grad-from: 65     ← 漸層起始點 X（畫布 % ）
               --shadow-blur     : 8      ← 模糊強度 px
          ────────────────────────────────────────────────────────── */
          var W    = parseFloat(canvas.style.width)  || canvas.offsetWidth;
          var H    = parseFloat(canvas.style.height) || canvas.offsetHeight;

          /* 讀取形狀 CSS 變數（config.css 可個別覆寫） */
          var rootCsSh   = getComputedStyle(document.documentElement);
          var sTopY   = parseFloat(rootCsSh.getPropertyValue('--shadow-top-y')    || '') || 50.5;
          var sLeftX  = parseFloat(rootCsSh.getPropertyValue('--shadow-left-x')   || '') || 69.8;
          var sSlantX = parseFloat(rootCsSh.getPropertyValue('--shadow-slant-x')  || '') || 76.0;
          var sGradFrom = parseFloat(rootCsSh.getPropertyValue('--shadow-grad-from') || '') || 65;
          var sBlur   = parseFloat(rootCsSh.getPropertyValue('--shadow-blur')     || '') || 0;
          var sBottomY = parseFloat(rootCsSh.getPropertyValue('--shadow-bottom-y') || '') || 115;
          var sBottomFade = parseFloat(rootCsSh.getPropertyValue('--shadow-bottom-fade') || '') || 0;
          var bottomPx = Math.min(H * sBottomY / 100, H);

          /* --shadow-rgba：手動鎖定陰影深淺，優先於配色器計算值 */
          var customRgba = (rootCsSh.getPropertyValue('--shadow-rgba')||'').trim().replace(/["']/g,'');
          var rgba = customRgba || e.data.shadowRgba || 'rgba(0,0,0,0.22)';

          /* --shadow-alpha：只替換 alpha 值，RGB 仍跟配色器走
             例：--shadow-alpha: 0.45 → 配色器的顏色不變，透明度鎖定 0.45
             優先級低於 --shadow-rgba（若兩個都填，--shadow-rgba 完全接管）*/
          if (!customRgba) {
            var customAlpha = (rootCsSh.getPropertyValue('--shadow-alpha')||'').trim();
            if (customAlpha !== '') {
              rgba = rgba.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/,
                                  'rgba($1,$2,$3,' + parseFloat(customAlpha) + ')');
            }
          }

          /* 每次都移除舊圖層（顏色或形狀改變時重繪） */
          var oldShadow = canvas.querySelector('.bn-bg-shadow-layer');
          if (oldShadow) oldShadow.remove();

          var shadowCv = document.createElement('canvas');
          shadowCv.className = 'bn-bg-shadow-layer';
          shadowCv.width  = W;
          shadowCv.height = H;
          shadowCv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

          var ctx = shadowCv.getContext('2d');

          /* ── 第一階段：主體填色 ──────────────────────────────────
             ctx.filter blur 烘入像素，html2canvas 讀取時效果正確。
             --shadow-blur: 0 → 上緣完全銳利；值越大上緣越柔。        */
          if (typeof ctx.filter !== 'undefined') {
            ctx.filter = sBlur > 0 ? 'blur(' + sBlur + 'px)' : 'none';
          }

          ctx.beginPath();
          ctx.moveTo(W * sLeftX  / 100, H * sTopY / 100);  /* 左上 */
          ctx.lineTo(W,                 H * sTopY / 100);  /* 右上 */
          ctx.lineTo(W,                 bottomPx);          /* 右下 */
          ctx.lineTo(W * sSlantX / 100, bottomPx);          /* 左下 */
          ctx.closePath();

          var grad = ctx.createLinearGradient(W * sGradFrom / 100, 0, W, 0);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, rgba);
          ctx.fillStyle = grad;
          ctx.fill();

          /* ── 第二階段：下緣垂直淡出（destination-in 乘算 alpha）──
             --shadow-bottom-fade: 0  → 不淡出（預設）
             --shadow-bottom-fade: 60 → 下緣 60% 範圍漸隱為透明
             destination-in 讓已繪像素 alpha ×= 遮罩 alpha，
             垂直漸層 1→0 讓下緣消散，上緣完全不影響。              */
          if (sBottomFade > 0) {
            if (typeof ctx.filter !== 'undefined') ctx.filter = 'none';
            ctx.globalCompositeOperation = 'destination-in';
            var topPx     = H * sTopY / 100;
            var fadeStart = bottomPx - (bottomPx - topPx) * (sBottomFade / 100);
            var vGrad = ctx.createLinearGradient(0, fadeStart, 0, bottomPx);
            vGrad.addColorStop(0, 'rgba(0,0,0,1)');
            vGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = vGrad;
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
          }

          /* ── 第三階段：左側斜邊羽化（destination-in 沿邊垂直漸層）──
             --shadow-left-fade: 0  → 不羽化（預設，邊緣銳利）
             --shadow-left-fade: 40 → 斜邊往內 40px 範圍內漸隱
             原理：
               ① 計算斜邊方向向量（左上角 → 左下角）
               ② 旋轉 90° 取法向量（垂直斜邊、指向多邊形內側）
               ③ 以法向量方向建立線性漸層（0→1，從邊緣向內淡入）
               ④ destination-in 乘算 alpha，只對邊緣附近有效，
                  遠離斜邊的像素 gradient ≥ 1，完全不受影響            */
          var sLeftFade = parseFloat(rootCsSh.getPropertyValue('--shadow-left-fade') || '') || 0;
          if (sLeftFade > 0) {
            /* 斜邊兩端座標 */
            var ex1 = W * sLeftX  / 100,  ey1 = H * sTopY / 100;
            var ex2 = W * sSlantX / 100,  ey2 = bottomPx;

            /* 邊方向向量 */
            var edgeDx = ex2 - ex1,  edgeDy = ey2 - ey1;
            var edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;

            /* 法向量（旋轉 90° CW → 指向多邊形內側，即右方）*/
            var perpX = edgeDy / edgeLen;
            var perpY = -edgeDx / edgeLen;

            if (typeof ctx.filter !== 'undefined') ctx.filter = 'none';
            ctx.globalCompositeOperation = 'destination-in';

            /* 漸層：從斜邊（透明）往內 sLeftFade px（不透明）*/
            var eGrad = ctx.createLinearGradient(
              ex1,                       ey1,
              ex1 + perpX * sLeftFade,   ey1 + perpY * sLeftFade
            );
            eGrad.addColorStop(0, 'rgba(0,0,0,0)');
            eGrad.addColorStop(1, 'rgba(0,0,0,1)');
            ctx.fillStyle = eGrad;
            ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
          }

          /* 插入到背景色圖層之後 */
          var bgEl = canvas.querySelector('.背景色');
          if (bgEl && bgEl.nextSibling) {
            canvas.insertBefore(shadowCv, bgEl.nextSibling);
          } else {
            canvas.insertBefore(shadowCv, canvas.firstChild);
          }
        }
      }

      /* 4. 商品區過渡陰影：已移除（改版後確認不需要，並清理既有注入元素） */
      document.querySelectorAll('.bn-product-shadow-layer').forEach(function(el) {
        el.remove();
      });
    }

  });

  /* 正三角排品（仿 freelyapp 邏輯）
     主品（第0張）居中最大，左配品（第1張）次之，右配品（第2張）最小
     底部對齊，所有尺寸以商品範圍 px 為單位，不超出邊界 */
  function layoutProducts(pzone) {
    var allBoxes = Array.from(pzone.querySelectorAll('.bn-prod-box'));
    var n = allBoxes.length; if(!n) return;

    /* ── CSS 變數 Slot 模式（config.css 定義座標時啟用）──────────────
       每個 slot 以中心點（X/Y）＋高度（H）定義，相對於商品範圍百分比
       未定義的 slot → 不顯示（fallback B）
       未定義任何 slot → 使用下方的舊版底部對齊邏輯（向下相容）    */
    var rootCs = window.getComputedStyle(document.documentElement);
    var slot0X = (rootCs.getPropertyValue('--bn-prod-0-x') || '').trim();

    if (slot0X) {
      var pcs = window.getComputedStyle(pzone);
      var zw  = parseFloat(pcs.width)  || pzone.offsetWidth  || 400;
      var zh  = parseFloat(pcs.height) || pzone.offsetHeight || 300;

      var sortedBoxes = allBoxes
  .filter(function(box){

    /* 已被 compose 隱藏的商品不要再參與排版 */

    if (
      box.style.display === 'none' ||
      box.style.visibility === 'hidden'
    ) {
      return false;
    }

    return true;
  })
  .sort(function(a,b){

    return (
      (parseInt(a.dataset.position,10) || 0) -
      (parseInt(b.dataset.position,10) || 0)
    );

  });

      sortedBoxes.forEach(function(box, i){
        var sx  = (rootCs.getPropertyValue('--bn-prod-'+i+'-x')  || '').trim();
        var sy  = (rootCs.getPropertyValue('--bn-prod-'+i+'-y')  || '').trim();
        var sh  = (rootCs.getPropertyValue('--bn-prod-'+i+'-h')  || '').trim();
        var sbw = (rootCs.getPropertyValue('--bn-prod-'+i+'-bw') || '').trim(); /* ★ Contain 寬度上限 */

        if (!sx || !sy || !sh) { box.style.display='none'; return; } /* Slot 未定義 */
        box.style.display = '';

        var ratio = parseFloat(box.dataset.ratio)    || 1;
        var scale = parseFloat(box.dataset.sizeScale) || 1;
        var cx    = parseFloat(sx) / 100 * zw;
        var cy    = parseFloat(sy) / 100 * zh;

        /* ★ Contain 模式：在 (maxW × maxH) 框內等比縮放，保持商品比例不溢出
           - sbw 有定義 → 使用精確框寬
           - sbw 未定義 → 兜底用 zone 寬 92%（舊邏輯向下相容）
           比較 ratio 與框的長寬比：
             ratio ≥ maxW/maxH → 寬邊先觸頂，以 maxW 反推 h
             ratio < maxW/maxH → 高邊先觸頂，以 maxH 正推 w        */
        var maxH = parseFloat(sh) / 100 * zh * scale;
        var maxW = sbw ? parseFloat(sbw) / 100 * zw : zw * 0.92;
        var h, w;
        if (ratio >= maxW / maxH) { w = maxW;  h = w / ratio; }
        else                       { h = maxH;  w = h * ratio; }
        h = Math.round(h); w = Math.round(w);

        /* clamp 中心點，確保商品至少 80% 在 zone 內 */
        cx = Math.max(w * 0.5, Math.min(zw - w * 0.5, cx));
        cy = Math.max(h * 0.5, Math.min(zh - h * 0.5, cy));
        var left = Math.round(cx - w / 2);
        var top  = Math.round(cy - h / 2);

        box.style.cssText = [
          'position:absolute;',
          'left:'+left+'px;top:'+top+'px;',
          'width:'+w+'px;height:'+h+'px;',
          'cursor:move;box-sizing:border-box;',
          'outline:2px solid transparent;',
          'overflow:visible;',
          /* 主品（i=0）在後，配品依序往前 */
          'z-index:'+(10+i)+';',
        ].join('');
      });
      return; /* Slot 模式結束，不執行舊版邏輯 */
    }

    /* ── 舊版底部對齊排列（向下相容，未定義 slot 的版位）──*/
    /* 依 position 排序：0=主品，1=左配，2=右配 */
    var boxes = allBoxes.slice().sort(function(a,b){
      return (parseInt(a.dataset.position)||0) - (parseInt(b.dataset.position)||0);
    });

    /* 從 CSS 直接讀取 zone 的 width/height（不受 iframe 縮放影響） */
    var cs   = window.getComputedStyle(pzone);
    var zw   = parseFloat(cs.width)  || pzone.offsetWidth  || 400;
    var zh   = parseFloat(cs.height) || pzone.offsetHeight || 300;
    var PAD = 6;

    /* 寬高比 */
    var ratios = boxes.map(function(b){ return Math.max(0.1, parseFloat(b.dataset.ratio)||0.75); });

    /* 大小比例：主品1.0，左0.85，右0.72 */
    var wsMap = [1.0, 0.85, 0.72];
    var ov = 0;   /* 不重疊 */

    var r0 = ratios[0];
    var r1 = n>=2 ? ratios[1] : 0;
    var r2 = n>=3 ? ratios[2] : 0;
    var ws1 = n>=2 ? wsMap[1] : 0;
    var ws2 = n>=3 ? wsMap[2] : 0;

    /* 主品最大高度：預設 88%，若版位有 .cta底 則不超過 CTA 頂部 */
    var maxH0 = Math.floor(zh * 0.88);
    var ctaEl = document.querySelector('.cta底');
    if(ctaEl){
      var ctaTop    = parseFloat(window.getComputedStyle(ctaEl).top)   || 0;
      var pzoneTop  = parseFloat(window.getComputedStyle(pzone).top)   || 0;
      var ctaRelTop = ctaTop - pzoneTop - 8; /* 8px 間距 */
      if(ctaRelTop > 0 && ctaRelTop < zh){
        maxH0 = Math.min(maxH0, Math.floor(ctaRelTop * 0.96));
      }
    }

    /* 算主品寬度：讓三張總寬不超出可用寬（留 PAD*2） */
    /* 主品寬 w0，左品寬 w1=ws1*h0*r1，右品寬 w2=ws2*h0*r2 */
    /* h0 = w0/r0；總寬 = w0 + w1 + w2 = w0(1 + ws1*r1/r0 + ws2*r2/r0) */
    var spanFactor = 1 + ws1*r1/r0 + ws2*r2/r0;
    var GAP = n > 1 ? 8 : 0;
    var avail = zw - PAD*2 - GAP*(n-1);
    var w0 = Math.min(avail / spanFactor, maxH0 * r0);
    var h0 = w0 / r0;
    /* 再檢查高度上限 */
    if(h0 > maxH0){ h0 = maxH0; w0 = h0 * r0; }

    var w1 = n>=2 ? Math.round(ws1*h0*r1) : 0;
    var h1 = n>=2 ? Math.round(ws1*h0)    : 0;
    var w2 = n>=3 ? Math.round(ws2*h0*r2) : 0;
    var h2 = n>=3 ? Math.round(ws2*h0)    : 0;

    w0 = Math.round(w0); h0 = Math.round(h0);

    /* 底部 y 位置：優先使用 CTA 頂部上方，否則用 zone 底部 */
    var bot0 = zh - 4;
    if(ctaEl){
      var ctaTop2   = parseFloat(window.getComputedStyle(ctaEl).top)  || 0;
      var pzoneTop2 = parseFloat(window.getComputedStyle(pzone).top)  || 0;
      var ctaRel2   = ctaTop2 - pzoneTop2 - 8;
      if(ctaRel2 > 0 && ctaRel2 < zh) bot0 = ctaRel2;
    }
    var bot1 = bot0;
    var bot2 = bot0;

    /* 水平：主品居中，左品在左，右品在右 */
    var totalW = w0 + (n>=2 ? w1+GAP : 0) + (n>=3 ? w2+GAP : 0);
    var startX = Math.max(PAD, Math.floor((zw - totalW) / 2));

    /* 排列順序：左品、主品、右品（視覺上中間最大） */
    var positions = [];
    if(n===1){
      positions = [{box:boxes[0], x:startX, y:bot0-h0, w:w0, h:h0}];
    } else if(n===2){
      /* 左=小，右=主 or 左=主，右=小 → 左配+主 */
      positions = [
        {box:boxes[1], x:startX,          y:bot1-h1, w:w1, h:h1},  /* 左：第1張 */
        {box:boxes[0], x:startX+w1+GAP,   y:bot0-h0, w:w0, h:h0},  /* 右：主品 */
      ];
    } else {
      positions = [
        {box:boxes[1], x:startX,              y:bot1-h1, w:w1, h:h1},  /* 左 */
        {box:boxes[0], x:startX+w1+GAP,       y:bot0-h0, w:w0, h:h0},  /* 中（主品） */
        {box:boxes[2], x:startX+w1+GAP+w0+GAP, y:bot2-h2, w:w2, h:h2},  /* 右 */
      ];
    }

    positions.forEach(function(p, i){
      p.box.style.cssText = [
        'position:absolute;',
        'left:'+p.x+'px;top:'+p.y+'px;',
        'width:'+p.w+'px;height:'+p.h+'px;',
        'cursor:move;box-sizing:border-box;',
        'outline:2px solid transparent;',
        'overflow:visible;',   /* handle 超出 box 邊界時不被裁切 */
        'z-index:'+(15-i)+';',
      ].join('');
    });
  }


  function getProductZone(){
    var names=['商品範圍','商品圖範圍'];
    for(var i=0;i<names.length;i++){ var z=document.querySelector('.'+names[i]); if(z)return z; }
    return null;
  }

  function setupProdDrag(box,zone){
    var drag=null;
    function postLayoutChange() {
      if (window.parent === window) return;
      var id = box.dataset.id;
      if (!id) return;
      var msg = {
        type: box.classList.contains('bn-person-box') ? 'bn-person-layout' : 'bn-product-layout',
        id: id,
        left: parseFloat(box.style.left) || 0,
        top: parseFloat(box.style.top) || 0,
        width: parseFloat(box.style.width) || 0,
        height: parseFloat(box.style.height) || 0,
      };
      if (box.dataset.sizeScale !== undefined) msg.sizeScale = parseFloat(box.dataset.sizeScale) || 1;
      if (box.classList.contains('bn-person-box') && box.dataset.zOrder !== undefined) {
        msg.zOrder = parseInt(box.dataset.zOrder, 10);
      }
      window.parent.postMessage(msg, '*');
    }

    /* 人物圖：允許垂直向下超出 zone（下半身可超出畫布被裁切） */
    var isPersonBox = box.classList.contains('bn-person-box');
    box.addEventListener('pointerdown',function(e){
      if(e.target.dataset.corner) return;
      e.stopPropagation();
      var zr=zone.getBoundingClientRect(),br=box.getBoundingClientRect();
      drag={type:'move',sx:e.clientX,sy:e.clientY,l:br.left-zr.left,t:br.top-zr.top,w:br.width,h:br.height,zw:zr.width,zh:zr.height};
      /* 選中：顯示藍框 + handle */
      box.querySelectorAll('[data-corner]').forEach(function(h){ h.style.display='block'; });
      box.setPointerCapture(e.pointerId); box.style.outline='2px solid '+(isPersonBox?'#ee4d2d':'#4a90e2');
    });
    box.querySelectorAll('[data-corner]').forEach(function(h){
      h.addEventListener('pointerdown',function(e){
        e.stopPropagation();
        var zr=zone.getBoundingClientRect(),br=box.getBoundingClientRect();
        drag={type:'resize',corner:h.dataset.corner,sx:e.clientX,sy:e.clientY,l:br.left-zr.left,t:br.top-zr.top,w:br.width,h:br.height,zw:zr.width,zh:zr.height,ratio:parseFloat(box.dataset.ratio)||1};
        h.setPointerCapture(e.pointerId); box.style.outline='2px solid '+(isPersonBox?'#ee4d2d':'#4a90e2'); e.preventDefault();
      });
      h.addEventListener('pointermove',function(e){
        if(!drag||drag.type!=='resize') return;
        var dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
        var c=drag.corner,r=drag.ratio;
        /* 等比例縮放：取 dx/dy 中絕對值較大的方向決定縮放量 */
        var sX=c.includes('w')?-1:1,sY=c.includes('n')?-1:1;
        var delta=Math.abs(dx)>Math.abs(dy)?dx*sX:dy*sY;
        var w=Math.max(40,drag.w+delta);
        var bh=w/r;  /* 維持原始比例 */
        if(bh<30){bh=30;w=bh*r;}
        var l=drag.l,t=drag.t;
        if(c.includes('w')) l=drag.l+(drag.w-w);
        if(c.includes('n')) t=drag.t+(drag.h-bh);
        l=Math.max(0,Math.min(drag.zw-w,l));
        /* 人物：t 可超出 zone 底部（讓下半身超出畫布） */
        t=isPersonBox?Math.max(0,t):Math.max(0,Math.min(drag.zh-bh,t));
        box.style.left=l+'px'; box.style.top=t+'px';
        box.style.width=w+'px'; box.style.height=bh+'px';
      });
      h.addEventListener('pointerup',function(){
        if (drag) postLayoutChange();
        drag=null;
      });
    });
    box.addEventListener('pointermove',function(e){
      if(!drag||drag.type!=='move') return;
      box.style.left=Math.max(0,Math.min(drag.zw-drag.w,drag.l+e.clientX-drag.sx))+'px';
      /* 人物：允許向下超出 zone（下半身超出畫布被裁切以模擬半身效果）*/
      var newTop=drag.t+e.clientY-drag.sy;
      box.style.top=(isPersonBox?Math.max(0,newTop):Math.max(0,Math.min(drag.zh-drag.h,newTop)))+'px';
    });
    box.addEventListener('pointerup',function(){
      if(drag) {
        box.dataset.userMoved='1'; /* 有拖移/縮放 → 記錄手動定位 */
        postLayoutChange();
      }
      drag=null;
      box.style.outline='2px solid transparent';
    });
    box.addEventListener('wheel',function(e){ box.dataset.userMoved='1';
      e.preventDefault();
      var zr=zone.getBoundingClientRect(),br=box.getBoundingClientRect();
      var sc=e.deltaY<0?1.08:.93,r=parseFloat(box.dataset.ratio)||1;
      var w=Math.max(40,Math.min(br.width*sc,zr.width*.95)),bh=w/r;
      if(bh<30){bh=30;w=bh*r;} if(!isPersonBox&&bh>zr.height*.95){bh=zr.height*.95;w=bh*r;}
      var cx=(br.left-zr.left)+br.width/2,cy=(br.top-zr.top)+br.height/2;
      box.style.left=Math.max(0,Math.min(cx-w/2,zr.width-w))+'px';
      box.style.top =Math.max(0,Math.min(cy-bh/2,zr.height-bh))+'px';
      box.style.width=w+'px'; box.style.height=bh+'px';
      postLayoutChange();
    },{passive:false});
  }


  /* ── 畫布文字直接點擊編輯 ── */
  var EDITABLE_CLASSES = ['主標','副標','日期','品牌名','購物專家'];
  var _dollarExemptSet = {};   /* {className: true} */

  /* ── 字數計算（中文1字，英數0.5字） ── */
  var CHAR_LIMITS = { '品牌名':9, '主標':8, '副標':7, '日期':14, '購物專家':20 };

  function calcUnits(text){
    var units = 0;
    for(var i=0; i<text.length; i++){
      var c = text.charCodeAt(i);
      /* 中文、全形等 CJK 算 1，其餘算 0.5 */
      units += (c > 0x2E7F) ? 1 : 0.5;
    }
    return Math.round(units * 10) / 10;
  }

  function updateCharCounter(el, cls){
    var limit = CHAR_LIMITS[cls];
    if(!limit) return;
    var counter = document.getElementById('_bn_counter_'+cls);
    if(!counter) return;
    var text = el.textContent;
    var used = calcUnits(text);
    counter.textContent = used.toFixed(1) + ' / ' + limit + ' 字';
    counter.style.color = used > limit ? '#ef4444' : used > limit * 0.85 ? '#f59e0b' : '#687090';
  }

  function ensureCounter(el, cls){ /* 字數提示已移至左側工具列，此處為空 */ }

  function showCounter(el, cls){
    /* 通知父層（BN編輯器）更新字數顯示 */
    if(window.parent !== window){
      var limit = CHAR_LIMITS[cls] || 0;
      var used  = calcUnits(el.textContent);
      window.parent.postMessage({
        type:'bn-char-count', field:cls, used:used, limit:limit
      }, '*');
    }
  }

  function hideCounter(cls){
    if(window.parent !== window){
      window.parent.postMessage({type:'bn-char-count', field:cls, used:null}, '*');
    }
  }

  function enforceLimit(el, cls){
    var limit = CHAR_LIMITS[cls];
    if(!limit) return;
    var text = el.textContent;
    var units = calcUnits(text);
    if(units <= limit) return;
    /* 截斷到限制 */
    var out = '';
    var sum = 0;
    for(var i=0; i<text.length; i++){
      var c = text.charCodeAt(i);
      var w = (c > 0x2E7F) ? 1 : 0.5;
      if(sum + w > limit) break;
      out += text[i];
      sum += w;
    }
    /* 保留游標位置 */
    var sel = window.getSelection();
    el.textContent = out;
    /* 游標移到尾端 */
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /* ── makeEditable ── */
  function makeEditable(el, cls){
    if(el.dataset.bnEditBound === '1') return;
    el.dataset.bnEditBound = '1';
    el.style.cursor = 'text';

    var _editing = false;
    var _rightClickPending = false;  /* 右鍵選單開啟中，阻止 blur 關閉編輯 */

    function startEditing(clientX, clientY){
      if(_editing) return;
      _editing = true;
      el.contentEditable = 'true';
      el.style.outline = '1.5px solid rgba(74,144,226,.55)';
      el.style.borderRadius = '2px';
      requestAnimationFrame(function(){
        if(typeof clientX === 'number' && document.caretRangeFromPoint){
          var rng = document.caretRangeFromPoint(clientX, clientY);
          if(rng){ var s=window.getSelection(); s.removeAllRanges(); s.addRange(rng); }
        }
        showCounter(el, cls);
      });
    }

    function commitEdit(){
      _editing = false;
      el.contentEditable = 'false';
      el.style.outline = 'none';
      hideCounter(cls);
      _sendUpdate(el, cls);
    }

    el.addEventListener('mousedown', function(e){
      if(e.button === 2) return; /* 右鍵由 contextmenu 處理 */
      e.stopPropagation();
      startEditing(e.clientX, e.clientY);
    });

    el.addEventListener('input', function(){
      updateCharCounter(el, cls);
      var limit = CHAR_LIMITS[cls];
      if(limit && calcUnits(el.textContent) > limit){
        enforceLimit(el, cls);
        updateCharCounter(el, cls);
        el.style.outline = '1.5px solid #ef4444';
        setTimeout(function(){ if(_editing) el.style.outline='1.5px solid rgba(74,144,226,.55)'; }, 400);
      }
      showCounter(el, cls);
    });

    el.addEventListener('blur', function(){
      if(_rightClickPending) return; /* 右鍵選單開啟中，不關閉編輯 */
      if(_editing) commitEdit();
    });

    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); commitEdit(); }
      if(e.key === 'Escape'){
        _editing = false;
        el.contentEditable = 'false';
        el.style.outline = 'none';
        hideCounter(cls);
        if(window.parent !== window){
          window.parent.postMessage({type:'bn-text-cancel', field:cls}, '*');
        }
      }
    });

    el.addEventListener('contextmenu', function(e){
      e.preventDefault(); e.stopPropagation();

      /* 確保進入編輯模式 */
      if(!_editing) startEditing(e.clientX, e.clientY);

      /* 立刻把選取的文字和位置存下來 */
      var savedSelText = '';
      var savedStart = -1;
      var savedEnd   = -1;
      var sel = window.getSelection();
      if(sel && sel.rangeCount > 0 && !sel.isCollapsed){
        savedSelText = sel.toString();
        var range = sel.getRangeAt(0);
        var preRange = document.createRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        savedStart = preRange.toString().length;
        savedEnd   = savedStart + savedSelText.length;
      }

      _rightClickPending = true;
      showCanvasTextMenu(e, el, cls, savedSelText, savedStart, savedEnd, function onMenuClose(){
        _rightClickPending = false;
      });
    });
  }

  /* sba.html 同款：工具函式 */
  function _cleanNum(t){ return t.replace(/[$,]/g,'').trim(); }
  function _isNumeric(t){ var c=_cleanNum(t); return /^\d+$/.test(c) && c.length>0; }
  function _addThousands(d){ return String(d).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
  function _fmtDollar(n){ return '$'+(n.length>=4?_addThousands(n):n); }
  function _getExempt(el){ try{ return JSON.parse(el.dataset.dollarExempt||'[]'); }catch(_){ return []; } }
  function _setExempt(el, list){
    if(list.length) el.dataset.dollarExempt = JSON.stringify(list);
    else el.removeAttribute('data-dollar-exempt');
  }
  function _replaceSelText(savedRange, text){
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(savedRange);
    try{ document.execCommand('insertText', false, text); }
    catch(_){
      savedRange.deleteContents();
      var node = document.createTextNode(text);
      savedRange.insertNode(node);
      sel.removeAllRanges(); sel.collapse(node, node.length);
    }
  }

  function _sendUpdate(el, cls){
    var text = el.textContent.trim();
    /* 把豁免清單一起送出，父層用這個清單跳過對應數字的 $ 格式化 */
    var exemptList = _getExempt(el);
    if(window.parent !== window){
      window.parent.postMessage({
        type:'bn-text-update', field:cls, value:text,
        dollarExempt: exemptList.length > 0 ? exemptList : false
      }, '*');
    }
  }

  function showCanvasTextMenu(e, el, cls, savedSelText, savedStart, savedEnd, onMenuClose){
    var existing = document.getElementById('_bn_canvas_ctx');
    if(existing) existing.remove();

    /* 只有選取的是純數字才顯示選單（同 sba.html） */
    var savedRange = null;
    var sel = window.getSelection();
    if(sel && sel.rangeCount > 0 && !sel.isCollapsed){
      savedRange = sel.getRangeAt(0).cloneRange();
    }

    var cleanSel  = _cleanNum(savedSelText);
    var isNumSel  = _isNumeric(savedSelText);
    var hasDollar = savedSelText.indexOf('$') !== -1;
    var exemptList = _getExempt(el);
    var alreadyExempt = exemptList.indexOf(cleanSel) !== -1;

    /* 如果沒有選取數字，不顯示選單 */
    if(!savedSelText){ return; }

    var menu = document.createElement('div');
    menu.id = '_bn_canvas_ctx';
    menu.style.cssText=[
      'position:fixed;z-index:999999;',
      'background:#1a1d2a;border:1px solid #2e3347;',
      'border-radius:10px;padding:6px 0;',
      'box-shadow:0 8px 24px rgba(0,0,0,.5);',
      'min-width:200px;font-size:13px;',
    ].join('');

    function menuBtn(label, handler){
      var btn = document.createElement('div');
      btn.textContent = label;
      btn.style.cssText = 'padding:8px 16px;cursor:pointer;color:#dde3f0;white-space:nowrap;';
      btn.addEventListener('mouseenter', function(){ btn.style.background='#2b2f42'; });
      btn.addEventListener('mouseleave', function(){ btn.style.background=''; });
      btn.addEventListener('mousedown', function(ev){
        ev.preventDefault();
        menu.remove();
        if(typeof onMenuClose === 'function') onMenuClose();
        handler();
        setTimeout(function(){ el.focus(); }, 0);
      });
      menu.appendChild(btn);
    }

    if(isNumSel){
      if(alreadyExempt || !hasDollar){
        /* 恢復：補回 $ 千分位，從豁免清單移除 */
        menuBtn('恢復 $'+_addThousands(cleanSel)+' 的千分位格式', function(){
          var list = _getExempt(el).filter(function(n){ return n !== cleanSel; });
          _setExempt(el, list);
          if(savedRange) _replaceSelText(savedRange, _fmtDollar(cleanSel));
          _sendUpdate(el, cls);
        });
      } else {
        /* 移除：拿掉 $ 和千分位，加入豁免清單 */
        menuBtn('暫時不加$和千分位符號', function(){
          var list = _getExempt(el);
          if(list.indexOf(cleanSel) === -1) list.push(cleanSel);
          _setExempt(el, list);
          if(savedRange) _replaceSelText(savedRange, cleanSel);
          _sendUpdate(el, cls);
        });
      }
    } else {
      /* 非純數字的選取：整段文字豁免選項 */
      menuBtn('暫時不加$和千分位符號（整段）', function(){
        /* 把選取範圍的所有數字加進豁免清單，並移除 $ */
        var nums = savedSelText.match(/\d+/g) || [];
        var list = _getExempt(el);
        nums.forEach(function(n){ if(list.indexOf(n)===-1) list.push(n); });
        _setExempt(el, list);
        var cleaned = savedSelText.replace(/\$/g,'').replace(/(\d),(\d{3})(?!\d)/g,'$1$2');
        if(savedRange) _replaceSelText(savedRange, cleaned);
        _sendUpdate(el, cls);
      });
    }

    menu.style.left = Math.min(e.clientX, window.innerWidth  - 230) + 'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight - 80)  + 'px';
    document.body.appendChild(menu);
    menu.tabIndex = -1;

    document.addEventListener('mousedown', function rm(ev){
      if(!menu.contains(ev.target)){
        menu.remove();
        document.removeEventListener('mousedown', rm);
        if(typeof onMenuClose === 'function') onMenuClose();
      }
    });
  }
  /* ══════════════════════════════════════════════════════════
     構圖預設套用
     preset.person  : { x, bottom, h }  — 相對商品範圍的 %
     preset.prods[] : { x, y, h, z }    — 中心點 X/Y %、高度 %、z-index
     ★ 同時更新 CSS 變數（--bn-prod-N-x/y/h）→ 之後 layoutProducts 重算不會跑掉
     ★ 保留 sizeScale（使用者縮放偏好不被清掉）
  ══════════════════════════════════════════════════════════ */
  /**
 * 接收並套用跨版位全域構圖預設 (支援 1人2品 / 2人 / 2人2品 / 1人1品 矩陣)
 * @param {Object} rawPreset 來自父控制介面的原始預設配置資料
 */
/**
 * 接收並套用全域構圖預設 (完全根除資產殘留與多餘 Slot 穿幫問題)
 * @param {Object} rawPreset 來自父控制介面的原始預設配置資料
 */
function _applyCompose(rawPreset) {
  if (!rawPreset) return;

  var pzone = getProductZone();
  if (!pzone) return;

  // 1. 隔離性深拷貝防止多版位傳址污染
  var preset = JSON.parse(JSON.stringify(rawPreset));

  // 2. 探測「商品範圍」尺寸，供下面換算人物/商品 box 的 px 座標用
  var pcs = window.getComputedStyle(pzone);
  var zw  = parseFloat(pcs.width)  || pzone.offsetWidth  || 400;
  var zh  = parseFloat(pcs.height) || pzone.offsetHeight || 300;

  /* ★ 不再自己判斷橫式/直式、不再二次覆寫 preset 的 x/h！
     bn.html 的 applyComposeBroadcast() 已經用每個版位回報的真實
     canvas 寬高（l.w/l.h）判斷方向，並依 COMPOSE_PRESETS 裡的
     preset.vertical（若有提供）送出對應座標。
     這裡如果再用一套公式覆寫一次，會把 bn.html 精心送來的座標
     （尤其是直式版位的 preset.vertical 值）疊加修改、整組跑掉。
     layout-runtime.js 在這裡只負責「忠實套用收到的 preset」。 */

  // ════════════════════════════════════════════════════════════════════
  // 4. 全全域【人物圖層】動態剪裁與優先權配對
  // ════════════════════════════════════════════════════════════════════
  var personBoxes = pzone.querySelectorAll('.bn-person-box');
  var targetPersonCount = (preset.persons && preset.persons.length) || 0;

  personBoxes.forEach(function(personBox, idx) {
    // 優先讀取 DOM 上的 data-position 屬性，若無則以元素索引遞補
    var currentSlot = parseInt(personBox.getAttribute('data-position') || idx, 10);

    // 🌟 核心防禦：若該 Slot 超出當前構圖所需數量，強制隱藏剪裁，徹底解決殘留問題
    if (currentSlot >= targetPersonCount || !preset.persons || !preset.persons[currentSlot]) {
      personBox.style.display = 'none';
      return; 
    }

    // 符合構圖數量，執行排版定位 (永遠以 Slot 0 第一張圖為最優先)
    var pConfig = preset.persons[currentSlot];
    personBox.style.display = 'block';

    var pRatio   = parseFloat(personBox.dataset.ratio) || 1;
    var pH       = (pConfig.h / 100) * zh;
    var pW       = pH * pRatio;
    var pLeft    = (pConfig.x / 100) * zw;
    var pBottom  = (pConfig.bottom / 100) * zh;
    var pTop     = Math.max(0, Math.round(zh - pBottom - pH));

    personBox.style.width  = Math.round(pW) + 'px';
    personBox.style.height = Math.round(pH) + 'px';
    personBox.style.left   = Math.round(pLeft) + 'px';
    personBox.style.top    = Math.round(pTop) + 'px';
  });


  // ════════════════════════════════════════════════════════════════════
  // 5. 全全域【商品圖層】動態剪裁與殘留清空
  // ════════════════════════════════════════════════════════════════════
  var prodBoxes = pzone.querySelectorAll('.bn-prod-box');
  var targetProdCount = (preset.prods && preset.prods.length) || 0;

  prodBoxes.forEach(function(box, idx) {
    var currentSlot = parseInt(box.getAttribute('data-position') || idx, 10);

    // 🌟 核心防禦：上傳了2品但切回1品構圖時，大於等於 1 的 Slot (即第二件商品) 直接強制關閉！
    if (currentSlot >= targetProdCount || !preset.prods || !preset.prods[currentSlot]) {
      box.style.display = 'none';
     box.dataset.composeHidden = '1';
      return; 
    }

    // 符合數量，執行精確黃金點定位 (第一張上傳的圖片 Slot 0 享有絕對第一優先權)
    var prodConfig = preset.prods[currentSlot];
    box.style.display = 'block'; // 確保恢復顯示

    try {
      var pRatio = parseFloat(box.dataset.ratio) || 1;
      /* ★ Contain 模式：在 (maxW × maxH) 框內等比縮放，與 slot mode 邏輯一致
         prodConfig.bw 未定義時，以 zone 寬 92% 兜底（向下相容舊 preset）*/
      var maxH = (prodConfig.h  / 100) * zh;
      var maxW = (prodConfig.bw !== undefined) ? (prodConfig.bw / 100) * zw : zw * 0.92;
      var boxH, boxW;
      if (pRatio >= maxW / maxH) { boxW = Math.round(maxW);  boxH = Math.round(boxW / pRatio); }
      else                        { boxH = Math.round(maxH);  boxW = Math.round(boxH * pRatio); }

      var boxLeft = (prodConfig.x / 100) * zw - (boxW / 2);
      var boxTop  = (prodConfig.y / 100) * zh - (boxH / 2);

      box.style.width  = boxW + 'px';
      box.style.height = boxH + 'px';
      box.style.left   = Math.round(boxLeft) + 'px';
      box.style.top    = Math.round(boxTop)  + 'px';
      box.style.zIndex = String(prodConfig.z || (10 + currentSlot));

      // 烘入 Inline CSS 全域環境變數鎖定 Runtime 狀態
      document.documentElement.style.setProperty('--bn-prod-' + currentSlot + '-x', prodConfig.x + '%');
      document.documentElement.style.setProperty('--bn-prod-' + currentSlot + '-y', prodConfig.y + '%');
      document.documentElement.style.setProperty('--bn-prod-' + currentSlot + '-h', prodConfig.h + '%');
      /* ★ 同步寫入 bw CSS var，供後續 layoutProducts slot mode 讀取；未定義則清除 */
      if (prodConfig.bw !== undefined) {
        document.documentElement.style.setProperty('--bn-prod-' + currentSlot + '-bw', prodConfig.bw + '%');
      } else {
        document.documentElement.style.removeProperty('--bn-prod-' + currentSlot + '-bw');
      }

    } catch (err) {
      console.error('[LayoutRuntime] 商品多向動態剪裁排版重繪失敗, Slot: ' + currentSlot, err);
    }
  });

  // 6. 強制調用一次陰影與邊界重繪機制，維持跨版位視覺一致性
  if (typeof layoutProducts === 'function') {
    layoutProducts(pzone);
  }
}
  /* 日期跟隨主標：
     "1"      → 日期貼著主標右側（原有行為，向下相容）
     "center" → 主標＋日期整串水平置中，兩者同步重算 left
     雙層 requestAnimationFrame 確保字型渲染完成後再量測
     canvas 在 iframe 模式 transform:none，但 iframe 本身被 bn.html scale，
     用 cvRect.width / cvEl.offsetWidth 算出縮放比例還原為 CSS px */
  function _syncDateToHeadline() {
    var hlEl = document.querySelector('.主標');
    var dtEl = document.querySelector('.日期');
    if (!hlEl || !dtEl) return;
    var cvEl = document.getElementById('canvas');
    var cvR  = cvEl.getBoundingClientRect();
    var canvasScale = cvR.width / (cvEl.offsetWidth || cvR.width);
    if (canvasScale <= 0) canvasScale = 1;

    var followMode = (getComputedStyle(document.documentElement)
                      .getPropertyValue('--date-follow-headline')||'').trim().replace(/["']/g,'');

    if (followMode === '1') {
      /* 舊模式：日期貼著主標右側 */
      var hlR = hlEl.getBoundingClientRect();
      dtEl.style.left = (hlR.right - cvR.left) / canvasScale + 12 + 'px';

    } else if (followMode === 'center') {
      /* 新模式：主標＋日期整串水平置中
         hlW / dtW = 各元素含 matrix 縮放後的視覺寬度（CSS px 空間）
         startX = 置中起點，主標從此開始，日期緊接其後                  */
      var GAP = 12;
      var W   = cvEl.offsetWidth;
      var hlR = hlEl.getBoundingClientRect();
      var dtR = dtEl.getBoundingClientRect();
      var hlW = hlR.width / canvasScale;
      var dtW = dtR.width / canvasScale;
      var startX = Math.round((W - hlW - GAP - dtW) / 2);
      hlEl.style.left = startX + 'px';
      dtEl.style.left = startX + hlW + GAP + 'px';
    }
  }

  function attachEditableToAll(){
    EDITABLE_CLASSES.forEach(function(cls){
      document.querySelectorAll('.'+cls).forEach(function(el){
        makeEditable(el, cls);
      });
    });
  }

  function captureCanvas(cb){
    if(window.html2canvas){doCapture(cb);return;}
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload=function(){doCapture(cb);}; s.onerror=function(){if(cb)cb(null);};
    document.head.appendChild(s);
  }
  function doCapture(cb){
    var cv=document.getElementById('canvas');
    if(!cv){if(cb)cb(null);return;}

    /* 讀取 KB 上限（config.css 的 --max-kb，單位 KB，0 = 無限制）*/
    var maxKb = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--max-kb')||'') || 0;
    var TARGET_BYTES = maxKb > 0 ? maxKb * 1024 : 0;

    html2canvas(cv,{scale:1,useCORS:true,allowTaint:true,backgroundColor:null,
      width:parseFloat(cv.style.width)||cv.offsetWidth,
      height:parseFloat(cv.style.height)||cv.offsetHeight,logging:false,
      ignoreElements: function(el){
        if (!el.dataset) return false;
        return el.dataset.noCapture === 'true' || !!el.dataset.corner;
      }})
    .then(function(c){
      /* Base64 大小估算（省去 header 後 × 0.75）*/
      function getBytes(url){
        var hdr = 'data:image/jpeg;base64,';
        return Math.ceil((url.length - hdr.length) * 0.75);
      }

      if (TARGET_BYTES <= 0) {
        /* 無限制：直接輸出高品質 JPEG */
        if(cb) cb(c.toDataURL('image/jpeg', 0.95));
        return;
      }

      /* 先試高品質 0.95 */
      var hiUrl = c.toDataURL('image/jpeg', 0.95);
      if (getBytes(hiUrl) <= TARGET_BYTES) { if(cb) cb(hiUrl); return; }

      /* 先試最低 0.50（若還超過，只能給最小值）*/
      var loUrl = c.toDataURL('image/jpeg', 0.50);
      if (getBytes(loUrl) > TARGET_BYTES) { if(cb) cb(loUrl); return; }

      /* 二元搜尋：8 次迭代精度 ≈ 0.003，找最高品質且 ≤ TARGET_BYTES */
      var lo = 0.50, hi = 0.95, bestUrl = loUrl;
      for (var i = 0; i < 8; i++) {
        var mid    = (lo + hi) / 2;
        var midUrl = c.toDataURL('image/jpeg', mid);
        if (getBytes(midUrl) <= TARGET_BYTES) { bestUrl = midUrl; lo = mid; }
        else { hi = mid; }
      }
      if(cb) cb(bestUrl);
    })
    .catch(function(){if(cb)cb(null);});
  }

  /**
   * _smartAutoLayout — 統一自動排版入口
   * ─────────────────────────────────────────────────────────────
   * 每次商品數量變動（新增 / 移除）後呼叫：
   *   1. 清除所有 inline slot CSS 變數（防止殘留值污染下一次計算）
   *   2. 若曾套用過構圖預設（window.__bnLastPreset 存在），重新套用，
   *      讓新增或移除後的商品也能遵照相同構圖定位。
   *   3. 若從未套用過構圖，走 legacy 底部對齊排列兜底。
   * ─────────────────────────────────────────────────────────────
   */
  function _smartAutoLayout() {
    var pzone = getProductZone();
    if (!pzone) return;

    /* 清除 inline slot 變數，讓後續計算以乾淨狀態出發
       （removeProperty 只清 inline style，不影響 config.css 裡定義的靜態預設值）*/
    for (var i = 0; i < 3; i++) {
      document.documentElement.style.removeProperty('--bn-prod-' + i + '-x');
      document.documentElement.style.removeProperty('--bn-prod-' + i + '-y');
      document.documentElement.style.removeProperty('--bn-prod-' + i + '-h');
      document.documentElement.style.removeProperty('--bn-prod-' + i + '-bw'); /* ★ Contain 上限也要清 */
    }

    if (window.__bnLastPreset) {
      /* 重套上次構圖預設：商品數量改變後維持一致的視覺排版 */
      _applyCompose(window.__bnLastPreset);
    } else {
      /* 尚未套用任何構圖 → legacy 模式底部對齊排列（已有 zone 寬高防爆保護）*/
      layoutProducts(pzone);
    }
  }

  function applyColor(cls,color){
    if(!color)return;
    document.querySelectorAll('.'+cls).forEach(function(el){
      if(!el.querySelector('.cta-text')) el.style.color=color;
    });
  }
})();

})();

/**
 * 根據人物數量與商品數量
 * 自動套用最接近的構圖
 */
function autoApplyCompose() {

  if (
    !window.COMPOSE_PRESETS ||
    !Array.isArray(window.COMPOSE_PRESETS)
  ) {
    return;
  }

  var personCount = document.querySelectorAll('.bn-person-box').length;
  var prodCount   = document.querySelectorAll('.bn-prod-box').length;

  personCount = Math.min(personCount, 2);
  prodCount   = Math.min(prodCount, 3);

  var targetPreset = null;

  COMPOSE_PRESETS.forEach(function(preset){

    var pCount =
      (preset.persons && preset.persons.length) || 0;

    var prodLen =
      (preset.prods && preset.prods.length) || 0;

    if (
      pCount === personCount &&
      prodLen === prodCount
    ) {
      targetPreset = preset;
    }

  });

  if (targetPreset) {
    _applyCompose(targetPreset);
  }
}
function autoArrangeProducts() {

  var pzone = getProductZone();

  if (!pzone) return;

  var boxes =
    Array.from(
      pzone.querySelectorAll('.bn-prod-box')
    );

  if (!boxes.length) return;

  var layouts = {

    1: [
      {x:50,y:60}
    ],

    2: [
      {x:35,y:60},
      {x:65,y:60}
    ],

    3: [
      {x:50,y:35},
      {x:30,y:72},
      {x:70,y:72}
    ]

  };

  var positions =
    layouts[
      Math.min(boxes.length,3)
    ];

  boxes.forEach(function(box, idx){

    var pos = positions[idx];

    if (!pos) return;

    document.documentElement.style.setProperty(
      '--bn-prod-'+idx+'-x',
      pos.x+'%'
    );

    document.documentElement.style.setProperty(
      '--bn-prod-'+idx+'-y',
      pos.y+'%'
    );

  });

  layoutProducts(pzone);
}
function autoScaleProducts() {

  var pzone = getProductZone();

  if (!pzone) return;

  var boxes =
    pzone.querySelectorAll('.bn-prod-box');

  var count = boxes.length;

  var scale = 1;

  if (count === 2) {

    scale = 0.85;

  } else if (count >= 3) {

    scale = 0.72;

  }

  boxes.forEach(function(box){

    box.dataset.sizeScale = scale;

  });

}