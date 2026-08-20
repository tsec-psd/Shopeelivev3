/*!
 * BN Editor Plugin v4
 * Logo 上傳 + 商品圖上傳（兩步驟視窗：選圖→排大小）+ 下載
 */
(function () {
  if (window.__BN_EDITOR_PLUGIN__) return;
  window.__BN_EDITOR_PLUGIN__ = true;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {

    /* ══ CSS ══ */
    var style = document.createElement('style');
    style.textContent = `
.bn-section{padding:4px 14px 10px}
.bn-drop{border:1.5px dashed rgba(238,77,45,.45);border-radius:7px;padding:14px 10px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;color:rgba(238,77,45,.75);font-size:12px;position:relative;background:rgba(238,77,45,.07)}
.bn-drop:hover,.bn-drop.drag{border-color:var(--accent,#ee4d2d);background:rgba(238,77,45,.15);color:var(--accent,#ee4d2d)}
.bn-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}
.bn-prev{width:100%;margin-top:6px;border-radius:5px;border:1px solid var(--border,#3d3d3d);display:none;object-fit:contain;max-height:60px;background:rgba(255,255,255,.05)}
.bn-prev.show{display:block}
.bn-clr{margin-top:4px;width:100%;background:transparent;border:1px solid var(--border,#3d3d3d);border-radius:5px;color:var(--text2,#a0a0a0);font-size:11px;padding:3px;cursor:pointer;transition:.12s;display:none}
.bn-clr.show{display:block}
.bn-clr:hover{border-color:var(--red,#da3633);color:var(--red,#da3633)}
.bn-prod-list{margin-top:6px;display:flex;flex-direction:column;gap:4px}
.bn-prod-item{display:flex;align-items:center;gap:6px;background:var(--bg2,#2a2a2a);border-radius:5px;padding:4px 7px;font-size:11px;color:var(--text2,#a0a0a0)}
.bn-prod-item img{width:32px;height:32px;object-fit:contain;border-radius:3px;background:rgba(255,255,255,.05)}
.bn-prod-item span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bn-prod-item button{background:transparent;border:1px solid var(--border,#3d3d3d);border-radius:4px;color:var(--text3,#666666);font-size:10px;padding:2px 6px;cursor:pointer}
.bn-prod-item button:hover{border-color:var(--accent,#ee4d2d);color:var(--accent,#ee4d2d)}
.bn-prod-item button.rm:hover{border-color:var(--red,#da3633);color:var(--red,#da3633)}
.bn-prod-move{display:flex;flex-direction:column;gap:2px;flex-shrink:0}
.bn-prod-move button{padding:1px 5px;font-size:10px;line-height:1.2}
#bn-prod-open-btn{display:block;width:100%;padding:12px;background:rgba(238,77,45,.07);border:1.5px dashed rgba(238,77,45,.45);border-radius:7px;color:rgba(238,77,45,.75);font-size:12px;cursor:pointer;text-align:center;transition:.15s;margin-bottom:2px}
#bn-prod-open-btn:hover{background:rgba(238,77,45,.15);border-color:var(--accent,#ee4d2d);color:var(--accent,#ee4d2d)}
#bn-download-bar{padding:10px 14px;border-top:1px solid var(--border,#3d3d3d);flex-shrink:0}
.bn-dl-btn{display:block;width:100%;padding:10px;background:linear-gradient(135deg,#ee4d2d,#cc3a1e);border:none;border-radius:7px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:opacity .12s}
.bn-dl-btn:hover{opacity:.88}
.bn-dl-btn:disabled{opacity:.35;cursor:not-allowed}
.bn-dl-progress{font-size:10px;color:var(--text3,#666666);text-align:center;margin-top:5px;min-height:14px}
/* ── 商品上傳 Modal ── */
#bn-prod-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
#bn-prod-modal.show{display:flex}
.bn-modal-box{background:#1e1e1e;border:1px solid #333333;border-radius:14px;width:min(520px,94vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden}
.bn-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #333333}
.bn-modal-head h3{font-size:14px;font-weight:700;color:#e0e0e0;margin:0}
.bn-modal-close{background:transparent;border:none;color:#666666;font-size:20px;cursor:pointer;line-height:1;padding:0}
.bn-modal-close:hover{color:#e0e0e0}
.bn-modal-body{flex:1;overflow-y:auto;padding:16px 18px}
.bn-modal-foot{padding:12px 18px;border-top:1px solid #333333;display:flex;gap:8px;justify-content:flex-end;align-items:center}
.bn-step-tabs{display:flex;gap:8px;margin-bottom:14px}
.bn-step-tab{padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid #333333;color:#666666;background:transparent;cursor:pointer}
.bn-step-tab.on{background:#252525;color:#ee4d2d;border-color:#ee4d2d}
.bn-modal-drop{border:1.5px dashed #333333;border-radius:10px;padding:18px;text-align:center;cursor:pointer;color:#666666;font-size:12px;position:relative;transition:.15s;margin-bottom:12px}
.bn-modal-drop:hover,.bn-modal-drop.over{border-color:#ee4d2d;background:rgba(238,77,45,.06);color:#ee4d2d}
.bn-modal-drop input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}
.bn-preview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:8px}
.bn-preview-cell{position:relative;border:1.5px solid #333333;border-radius:10px;overflow:hidden;background:#141414;cursor:pointer;transition:.15s}
.bn-preview-cell.is-hero{border-color:#ee4d2d;box-shadow:0 0 0 2px rgba(238,77,45,.2)}
.bn-preview-cell img{width:100%;height:88px;object-fit:contain;padding:6px;display:block}
.bn-preview-cell .pc-name{font-size:10px;color:#666666;padding:0 6px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.bn-preview-cell .pc-hero{position:absolute;top:5px;left:5px;background:#ee4d2d;color:#fff;border-radius:999px;font-size:9px;font-weight:900;padding:2px 6px}
.bn-preview-cell .pc-rm{position:absolute;top:5px;right:5px;width:20px;height:20px;border-radius:50%;background:rgba(13,16,24,.85);border:1px solid rgba(255,255,255,.15);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;z-index:2}
.bn-limit-msg{font-size:11px;text-align:center;padding:4px 0;color:#666666;margin-bottom:4px}
/* step2 rank */
.bn-rank-row{display:flex;gap:12px;align-items:flex-end;justify-content:center;min-height:140px;position:relative;padding:8px 0}
.bn-rank-card{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:grab;user-select:none;position:relative;transition:opacity .15s}
.bn-rank-card.dragging{opacity:.4}
.bn-rank-img-wrap{display:flex;align-items:flex-end;justify-content:center;position:relative}
.bn-rank-img-wrap img{object-fit:contain;width:auto;display:block}
.bn-rank-arrow{background:rgba(255,255,255,.08);border:1px solid #333333;color:#666666;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;position:absolute;bottom:2px;transition:.12s;z-index:2}
.bn-rank-arrow:hover{background:#252525;color:#ee4d2d;border-color:#ee4d2d}
.bn-rank-arrow.left-arr{left:-26px}
.bn-rank-arrow.right-arr{right:-26px}
.bn-rank-name{font-size:10px;color:#666666;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.bn-rank-tag{font-size:10px;font-weight:700;border-radius:999px;padding:2px 8px}
.bn-rank-tag.hero{background:#ee4d2d;color:#fff}
.bn-rank-tag.left{background:#252525;color:#666666;border:1px solid #333333}
.bn-rank-tag.right{background:#252525;color:#666666;border:1px solid #333333}
.bn-rank-hint{font-size:11px;color:#666666;text-align:center;margin-top:6px}
.bn-drop-line{position:absolute;top:4px;bottom:4px;width:3px;background:#ee4d2d;border-radius:3px;box-shadow:0 0 8px rgba(238,77,45,.7);pointer-events:none;display:none;z-index:10}
.bn-btn-skip{background:transparent;border:1px solid #333333;color:#666666;font-size:12px;padding:7px 14px;border-radius:7px;cursor:pointer;transition:.12s}
.bn-btn-skip:hover{border-color:#ee4d2d;color:#ee4d2d}
.bn-btn-confirm{background:linear-gradient(135deg,#ee4d2d,#cc3a1e);border:none;color:#fff;font-size:12px;font-weight:700;padding:7px 18px;border-radius:7px;cursor:pointer;transition:opacity .12s}
.bn-btn-confirm:hover{opacity:.88}
.bn-btn-confirm:disabled{opacity:.35;cursor:not-allowed}
`;
    document.head.appendChild(style);

    /* ── 狀態 ── */
    /* logo 支援最多2張 */
    window._bnLogos = window._bnLogos || [];   /* [{id,src}] */
    window._bnLogoDataUrl = window._bnLogoDataUrl || null;  /* 向下相容：第一張 */
    var MAX_LOGOS = 2;
    window._bnProducts    = window._bnProducts    || [];
    var MAX_PROD = 2;
    window._bnPersons     = window._bnPersons     || [];
    var MAX_PERSONS       = 2;
    window._bnComposePreset = window._bnComposePreset || null;
    /* ── 工具 ── */
    function readFile(file){ return new Promise(function(res,rej){var r=new FileReader();r.onload=function(e){res(e.target.result);};r.onerror=rej;r.readAsDataURL(file);}); }
    function loadImg(src){ return new Promise(function(res,rej){var i=new Image();i.onload=function(){res(i);};i.onerror=rej;i.src=src;}); }
    function sampleCorner(d,w,h){function px(x,y){var i=(y*w+x)*4;return{r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]};}var c=[px(0,0),px(w-1,0),px(0,h-1),px(w-1,h-1)].filter(function(p){return p.a>200;});if(!c.length)return{r:255,g:255,b:255};var r=0,g=0,b=0;c.forEach(function(p){r+=p.r;g+=p.g;b+=p.b;});return{r:r/c.length,g:g/c.length,b:b/c.length};}
    function autoTrim(img){var max=1200,sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));var w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));var c=document.createElement('canvas');c.width=w;c.height=h;var ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);var id=ctx.getImageData(0,0,w,h),d=id.data,bg=sampleCorner(d,w,h);var x0=w,y0=h,x1=-1,y1=-1;for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=(y*w+x)*4,a=d[i+3];if(a>18&&(a<245||Math.abs(d[i]-bg.r)+Math.abs(d[i+1]-bg.g)+Math.abs(d[i+2]-bg.b)>46)&&!(d[i]>246&&d[i+1]>246&&d[i+2]>246)){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}}if(x1<0)return{src:img.src,ratio:img.naturalWidth/img.naturalHeight};var pad=Math.round(Math.max(w,h)*.015);x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(w-1,x1+pad);y1=Math.min(h-1,y1+pad);var tw=x1-x0+1,th=y1-y0+1;var o=document.createElement('canvas');o.width=tw;o.height=th;o.getContext('2d').drawImage(c,x0,y0,tw,th,0,0,tw,th);return{src:o.toDataURL('image/png'),ratio:tw/th};}

    /* ── 廣播 ── */

    /* trimAlpha：只掃 alpha 通道，裁掉透明邊距
       用於人物/商品（背景已去除），不像 autoTrim 排除白色像素，
       確保白色系商品或穿白衣人物的邊框計算正確。 */
    function trimAlpha(img){
      var W=img.naturalWidth,H=img.naturalHeight;
      if(!W||!H)return{src:img.src,ratio:W/H||1};
      var max=1600,sc=Math.min(1,max/Math.max(W,H));
      var w=Math.max(1,Math.round(W*sc)),h=Math.max(1,Math.round(H*sc));
      var c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,w,h);
      var d=c.getContext('2d').getImageData(0,0,w,h).data;
      var x0=w,y0=h,x1=-1,y1=-1;
      for(var y=0;y<h;y++)for(var x=0;x<w;x++){
        if(d[(y*w+x)*4+3]>10){
          if(x<x0)x0=x;if(x>x1)x1=x;
          if(y<y0)y0=y;if(y>y1)y1=y;
        }
      }
      if(x1<0)return{src:img.src,ratio:W/H||1};
      var pad=Math.round(Math.max(w,h)*.008);
      x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);
      x1=Math.min(w-1,x1+pad);y1=Math.min(h-1,y1+pad);
      var tw=x1-x0+1,th=y1-y0+1;
      var o=document.createElement('canvas');o.width=tw;o.height=th;
      o.getContext('2d').drawImage(c,x0,y0,tw,th,0,0,tw,th);
      return{src:o.toDataURL('image/png'),ratio:tw/th};
    }


    function broadcast(msg){document.querySelectorAll('.preview-block iframe').forEach(function(f){try{f.contentWindow.postMessage(msg,'*');}catch(e){}});}
    function broadcastTo(id,msg){var f=document.getElementById('iframe-'+id);if(f)try{f.contentWindow.postMessage(msg,'*');}catch(e){}}

    /* 陰影光源角度(左/中/右)：全域設定，按鈕在 insertProductUI() 建立 */
    var _shadowAngleBtns = null;
    function _syncShadowAngleBtns(){
      if (!_shadowAngleBtns) return;
      var cur = window._bnShadowAngle || 'left';
      _shadowAngleBtns.forEach(function(b){
        var active = b.dataset.angle === cur;
        b.style.background = active ? '#ee4d2d' : '#222';
        b.style.borderColor = active ? '#ee4d2d' : '#444';
        b.style.color = active ? '#fff' : '#ccc';
      });
    }

    /* ══ Logo 上傳 ══ */
    function insertLogoUI(){
      var scroll=document.getElementById('sidebar-scroll');
      if(!scroll||document.getElementById('bn-logo-drop'))return;
      var target=null;
      scroll.querySelectorAll('.s-section').forEach(function(el){if(el.textContent.trim()==='排版選擇')target=el;});
      window._bnLogoWhiteBg = window._bnLogoWhiteBg || false;

      var sec=document.createElement('div');
      sec.innerHTML=[
        '<div class="s-section" style="margin-top:14px">廠商 Logo 上傳（最多2張）</div>',
        '<div class="bn-section">',
        '  <div class="bn-drop" id="bn-logo-drop">',
        '    <input type="file" accept="image/*" multiple id="bn-logo-inp">',
        '    ＋ 點擊或拖曳上傳 Logo',
        '  </div>',
        /* 白底 toggle */
        '  <label id="bn-logo-whitebg-wrap" style="display:flex;align-items:center;gap:7px;',
        '         padding:6px 0 2px;cursor:pointer;font-size:11px;color:var(--text2);">',
        '    <div id="bn-logo-whitebg-toggle" style="',
        '         width:36px;height:20px;border-radius:10px;background:var(--bg3);',
        '         border:1px solid var(--border);cursor:pointer;position:relative;',
        '         transition:background .2s;flex-shrink:0;">',
        '      <div id="bn-logo-whitebg-knob" style="',
        '           position:absolute;width:14px;height:14px;border-radius:50%;',
        '           background:var(--text3);top:2px;left:2px;',
        '           transition:transform .2s,background .2s;"></div>',
        '    </div>',
        '    Logo 加白底',
        '  </label>',
        /* ★ 規格 3.1:白框留白可調（回報「logo 無法拉大白框至合適大小」）
           ★ 同批做過的「廠商 LOGO 尺寸」滑桿已移除 —— 放大會撐寬 .廠商LOGO範圍,
             而 .LOGO範圍 是 justify-content:center,整排會重新置中,
             連帶把蝦導播 LOGO 推離設計的左側對齊線。要重做必須先解決這點。 */
        '  <div id="bn-logo-pad-row" style="display:flex;align-items:center;gap:8px;padding:4px 0 4px;font-size:11px;color:var(--text2);">',
        '    <span style="flex-shrink:0;">白框留白</span>',
        '    <input type="range" id="bn-logo-pad" min="0" max="40" step="1" value="10" style="flex:1;min-width:0;">',
        '    <span id="bn-logo-pad-val" style="flex-shrink:0;width:30px;text-align:right;">10%</span>',
        '  </div>',
        '  <div class="bn-prod-list" id="bn-logo-list"></div>',
        '</div>',
      ].join('');
      if(target)scroll.insertBefore(sec,target);else scroll.appendChild(sec);
      var inp=document.getElementById('bn-logo-inp');
      var drop=document.getElementById('bn-logo-drop');
      inp.addEventListener('change',function(){
        var remaining=MAX_LOGOS-window._bnLogos.length;
        Array.from(this.files).slice(0,remaining).forEach(function(f){doLoadLogo(f);});
        inp.value='';
      });

      /* 白底 toggle 事件 */
      var wbToggle = document.getElementById('bn-logo-whitebg-toggle');
      var wbKnob   = document.getElementById('bn-logo-whitebg-knob');
      function syncWhiteBgToggle() {
        var on = window._bnLogoWhiteBg;
        wbToggle.style.background = on ? 'var(--accent,#ee4d2d)' : 'var(--bg3,#333333)';
        wbToggle.style.borderColor = on ? 'var(--accent,#ee4d2d)' : 'var(--border,#3d3d3d)';
        wbKnob.style.transform = on ? 'translateX(16px)' : 'translateX(0)';
        wbKnob.style.background = on ? '#fff' : 'var(--text3,#666666)';
      }
      if (wbToggle) {
        syncWhiteBgToggle();
        wbToggle.addEventListener('click', function(){
          window._bnLogoWhiteBg = !window._bnLogoWhiteBg;
          syncWhiteBgToggle();
          window._bnSyncLogoSliders && window._bnSyncLogoSliders();
          if (!window._bnLogos.length) return;
          /* 重新合成所有 LOGO 並廣播 */
          _applyWhiteBgToAll(function(){
            renderLogoList();
            broadcast({type:'bn-logos', logos:window._bnLogos});
            if (typeof saveHistory === 'function') saveHistory();
          });
        });
      }

      /* ══ 規格 3.1:白框留白滑桿 ═══════════════════════════════════
         改的是「白底合成當下的 padding」,所以每次調整都要重新合成
         (白底是烤進 PNG 的,不是 CSS)。合成是非同步的 canvas 作業,
         故用 change 而非 input —— 拖曳過程中不重複合成,放開才做一次。 */
      var padInp   = document.getElementById('bn-logo-pad');
      var padVal   = document.getElementById('bn-logo-pad-val');

      window._bnSyncLogoSliders = function(){
        var p = document.getElementById('bn-logo-pad');
        var pv= document.getElementById('bn-logo-pad-val');
        var padPct = Math.round(((typeof window._bnLogoPad === 'number') ? window._bnLogoPad : 0.10) * 100);
        if (p)  p.value  = String(padPct);
        if (pv) pv.textContent = padPct + '%';
        /* 白底關著時留白沒有作用,淡出提示(仍可調,開啟白底後立即生效) */
        var row = document.getElementById('bn-logo-pad-row');
        if (row) row.style.opacity = window._bnLogoWhiteBg ? '1' : '.4';
      };

      if (padInp) {
        padInp.addEventListener('input', function(){
          if (padVal) padVal.textContent = this.value + '%';
        });
        padInp.addEventListener('change', function(){
          window._bnLogoPad = (parseFloat(this.value) || 0) / 100;
          if (!window._bnLogoWhiteBg || !window._bnLogos.length) {
            if (typeof saveHistory === 'function') saveHistory();
            return;   /* 白底沒開 → 只記下設定值,不需重新合成 */
          }
          _applyWhiteBgToAll(function(){
            renderLogoList();
            broadcast({type:'bn-logos', logos:window._bnLogos});
            if (typeof saveHistory === 'function') saveHistory();
          });
        });
      }
      window._bnSyncLogoSliders();
      drop.addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
      drop.addEventListener('dragleave',function(){this.classList.remove('drag');});
      drop.addEventListener('drop',function(e){
        e.preventDefault();this.classList.remove('drag');
        var remaining=MAX_LOGOS-window._bnLogos.length;
        Array.from(e.dataTransfer.files).filter(function(f){return f.type.startsWith('image/');})
          .slice(0,remaining).forEach(function(f){doLoadLogo(f);});
      });
    }

    /* ══ 人物圖上傳 ══ */
    function insertPersonUI(){
      var scroll=document.getElementById('sidebar-scroll');
      if(!scroll||document.getElementById('bn-person-drop'))return;

      var sec=document.createElement('div');
      sec.innerHTML=[
        '<div class="s-section" style="margin-top:14px">人物圖（最多2張）</div>',
        '<div class="bn-section">',
        '  <div class="bn-drop" id="bn-person-drop">',
        '    <input type="file" accept="image/*" multiple id="bn-person-inp">',
        '    ＋ 點擊或拖曳上傳人物圖',
        '  </div>',
        '  <div class="bn-prod-list" id="bn-person-list"></div>',
        '</div>',
      ].join('');
      scroll.appendChild(sec);

      var drop=document.getElementById('bn-person-drop');
      var inp=document.getElementById('bn-person-inp');

      inp.addEventListener('change',function(){
        var remaining = MAX_PERSONS - window._bnPersons.length;
        if(remaining <= 0) return;
        Array.from(this.files).slice(0, remaining).forEach(function(f){
          doLoadPerson(f);
        });
        inp.value='';
      });
      drop.addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag');});
      drop.addEventListener('dragleave',function(){this.classList.remove('drag');});
      drop.addEventListener('drop',function(e){
        e.preventDefault();this.classList.remove('drag');
        var remaining = MAX_PERSONS - window._bnPersons.length;
        if(remaining <= 0) return;
        Array.from(e.dataTransfer.files).filter(function(f){return f.type.startsWith('image/');})
          .slice(0, remaining).forEach(function(f){ doLoadPerson(f); });
      });
    }

    function doLoadPerson(file){
      if(window._bnPersons.length >= MAX_PERSONS) return;
      readFile(file).then(function(src){
        return loadImg(src).then(function(img){
          /* trimAlpha：只裁透明邊距 */
          var trimmed=trimAlpha(img);
          var personId = 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
          /* zOrder=0 → 最前層，新加入的人物 zOrder 排在現有人物之後（後面）*/
          window._bnPersons.push({
            id: personId,
            src: trimmed.src,
            ratio: trimmed.ratio,
            zOrder: window._bnPersons.length  /* 先求長度再 push，第 0 人 zOrder=0（最前），第 1 人 zOrder=1（後一層）*/
          });
          broadcast({type:'bn-persons', persons:window._bnPersons});
          renderPersonList();
          if (typeof saveHistory === 'function') saveHistory();
        });
      }).catch(function(){console.warn('[BN] 人物圖載入失敗');});
    }

    function renderPersonList(){
      var list=document.getElementById('bn-person-list');
      if(!list)return;
      list.innerHTML='';

      /* 依 zOrder 升序排列顯示：zOrder=0 在最上方（最前層）*/
      var zSorted = window._bnPersons.slice().sort(function(a,b){
        return (a.zOrder||0) - (b.zOrder||0);
      });

      zSorted.forEach(function(p, sortedIdx){
        var row=document.createElement('div');row.className='bn-prod-item';
        var img=document.createElement('img');img.src=p.src;

        /* 圖層標籤：以排序位置顯示「最前」「後一層」 */
        var label=document.createElement('span');
        label.textContent = sortedIdx === 0 ? '人物（最前層）' : '人物（後一層）';
        label.style.cssText='font-size:11px;';

        var editBtn=document.createElement('button');
        editBtn.textContent='編輯';
        editBtn.title='裁切・去背・擦除・影子';
        editBtn.addEventListener('click',function(){ 
          if(typeof openPersonEditor === 'function') openPersonEditor(p); 
        });

        /* ── 圖層 UP/DOWN 按鈕（與商品相同邏輯）── */
        var moveWrap=document.createElement('div');moveWrap.className='bn-prod-move';

        var upBtn=document.createElement('button');upBtn.textContent='▲';upBtn.title='往前一層';
        var downBtn=document.createElement('button');downBtn.textContent='▼';downBtn.title='往後一層';

        upBtn.disabled   = sortedIdx === 0;
        downBtn.disabled = sortedIdx === zSorted.length - 1;
        upBtn.style.opacity   = upBtn.disabled   ? '0.3' : '1';
        downBtn.style.opacity = downBtn.disabled ? '0.3' : '1';

        upBtn.addEventListener('click',(function(pid, si){ return function(){
          var a = window._bnPersons.find(function(x){return x.id===pid;});
          var b = zSorted[si-1];
          if(!a||!b) return;
          var tmp=a.zOrder; a.zOrder=b.zOrder; b.zOrder=tmp;
          broadcastPersonZOrder();
          renderPersonList();
          if (typeof saveHistory === 'function') saveHistory();
        };})(p.id, sortedIdx));

        downBtn.addEventListener('click',(function(pid, si){ return function(){
          var a = window._bnPersons.find(function(x){return x.id===pid;});
          var b = zSorted[si+1];
          if(!a||!b) return;
          var tmp=a.zOrder; a.zOrder=b.zOrder; b.zOrder=tmp;
          broadcastPersonZOrder();
          renderPersonList();
          if (typeof saveHistory === 'function') saveHistory();
        };})(p.id, sortedIdx));

        moveWrap.appendChild(upBtn);moveWrap.appendChild(downBtn);

        var rmBtn=document.createElement('button');rmBtn.textContent='移除';rmBtn.className='rm';
        rmBtn.addEventListener('click',function(){
          window._bnPersons = window._bnPersons.filter(function(x){ return x.id !== p.id; });
          broadcast({type:'bn-persons', persons:window._bnPersons});
          renderPersonList();
          if (typeof saveHistory === 'function') saveHistory();
        });

        row.appendChild(img);row.appendChild(label);row.appendChild(moveWrap);row.appendChild(editBtn);row.appendChild(rmBtn);
        list.appendChild(row);
      });
    }

    /** broadcastPersonZOrder — 廣播人物圖層順序到所有 iframe
     *  order[0] = 最前層（z 最高），與 broadcastZOrder 商品版本相同邏輯 */
    function broadcastPersonZOrder(){
      var order = window._bnPersons.slice()
        .sort(function(a,b){ return (a.zOrder||0) - (b.zOrder||0); })
        .map(function(p){ return p.id; });
      broadcast({type:'bn-person-zorder', order: order});
    }


    function renderLogoList(){
      var list=document.getElementById('bn-logo-list');
      if(!list)return;
      list.innerHTML='';
      window._bnLogos.forEach(function(lg,i){
        var row=document.createElement('div');row.className='bn-prod-item';
        var img=document.createElement('img');img.src=lg.src;
        var name=document.createElement('span');name.textContent='Logo '+(i+1);
        /* 恢復圓邊狀態 */
        if(lg.round){ img.dataset.bnLogoRound='1'; img.style.borderRadius='50%'; }

        /* 編輯按鈕：點了彈出四個選項 */
        /* ◀ ▶ 換位置箭頭 */
        var moveWrap=document.createElement('div');
        moveWrap.style.cssText='display:flex;flex-direction:column;gap:2px;flex-shrink:0;';

        var upLogo=document.createElement('button');upLogo.textContent='▲';upLogo.title='往前';
        var dnLogo=document.createElement('button');dnLogo.textContent='▼';dnLogo.title='往後';
        var logoIdx = window._bnLogos.indexOf(lg);
        upLogo.disabled = logoIdx === 0;
        dnLogo.disabled = logoIdx === window._bnLogos.length - 1;
        upLogo.style.opacity = upLogo.disabled ? '0.3' : '1';
        dnLogo.style.opacity = dnLogo.disabled ? '0.3' : '1';

        upLogo.addEventListener('click',(function(lid){return function(){  
          saveHistory();
          var idx=window._bnLogos.findIndex(function(x){return x.id===lid;});
          if(idx<=0)return;
          var tmp=window._bnLogos[idx]; window._bnLogos[idx]=window._bnLogos[idx-1]; window._bnLogos[idx-1]=tmp;
          window._bnLogoDataUrl=window._bnLogos[0].src;
          renderLogoList(); broadcast({type:'bn-logos',logos:window._bnLogos});
        };})(lg.id));

        dnLogo.addEventListener('click',(function(lid){return function(){
          var idx=window._bnLogos.findIndex(function(x){return x.id===lid;});
          if(idx<0||idx>=window._bnLogos.length-1)return;
          var tmp=window._bnLogos[idx]; window._bnLogos[idx]=window._bnLogos[idx+1]; window._bnLogos[idx+1]=tmp;
          window._bnLogoDataUrl=window._bnLogos[0].src;
          renderLogoList(); broadcast({type:'bn-logos',logos:window._bnLogos});
          if (typeof saveHistory === 'function') saveHistory();
        };})(lg.id));

        moveWrap.appendChild(upLogo); moveWrap.appendChild(dnLogo);

        var editBtn=document.createElement('button');editBtn.textContent='編輯';
        editBtn.addEventListener('click',(function(lid, imgRef){return function(e){
          e.stopPropagation();
          showLogoMenu(lid, imgRef, editBtn);
        };})(lg.id, img));

        var btn=document.createElement('button');btn.textContent='移除';
        btn.addEventListener('click',(function(lid){return function(){
          window._bnLogos=window._bnLogos.filter(function(x){return x.id!==lid;});
          window._bnLogoDataUrl=window._bnLogos.length?window._bnLogos[0].src:null;
          renderLogoList();
          broadcast({type:'bn-logo-remove',id:lid});
          broadcast({type:'bn-logos',logos:window._bnLogos});
          if (typeof saveHistory === 'function') saveHistory();
        };})(lg.id));
        row.appendChild(img);row.appendChild(name);row.appendChild(moveWrap);row.appendChild(editBtn);row.appendChild(btn);
        list.appendChild(row);
      });
      /* drop 按鈕狀態 */
      var drop=document.getElementById('bn-logo-drop');
      if(drop) drop.style.opacity=window._bnLogos.length>=MAX_LOGOS?'0.4':'1';
    }


    /* 工具列「編輯」按鈕的選單 */
    function showLogoMenu(lid, imgEl, anchorEl){
      function doShow(){
        if(!window.BNLogoMenu){ return; }
        var n = window._bnLogos.length;
        var idx = window._bnLogos.findIndex(function(x){return x.id===lid;});
        /* 建選單 */
        var menu = document.getElementById('_bn_logo_inline_menu');
        if(!menu){
          menu = document.createElement('div');
          menu.id = '_bn_logo_inline_menu';
          menu.style.cssText = [
            'position:fixed;z-index:999999;',
            'background:#111;color:#fff;',
            'border-radius:10px;',
            'box-shadow:0 8px 24px rgba(0,0,0,.4);',
            'padding:6px 0;min-width:120px;',
          ].join('');
          document.body.appendChild(menu);
          document.addEventListener('click', function(){
            menu.style.display='none';
          });
        }

        var items = [
          { label:'裁切', action:'crop' },
          { label:'加圓邊', action:'round' },
        ];

        menu.innerHTML = '';
        items.forEach(function(item){
          if(item.hidden) return;
          var b = document.createElement('button');
          b.textContent = item.action === 'round'
            ? (imgEl.dataset.bnLogoRound === '1' ? '取消圓邊' : '加圓邊')
            : item.label;
          b.style.cssText = 'display:block;width:100%;border:0;background:transparent;color:#fff;text-align:left;padding:7px 14px;font-size:13px;cursor:pointer;';
          b.addEventListener('mouseover', function(){ this.style.background='#2b2b2b'; });
          b.addEventListener('mouseout',  function(){ this.style.background='transparent'; });
          b.addEventListener('click', function(e){
            e.stopPropagation();
            menu.style.display = 'none';
            handleLogoAction(item.action, lid, imgEl);
          });
          menu.appendChild(b);
        });

        /* 定位到按鈕旁邊 */
        var rect = anchorEl.getBoundingClientRect();
        var left = rect.left;
        var top  = rect.bottom + 4;
        if(left + 130 > window.innerWidth) left = window.innerWidth - 134;
        menu.style.left = left + 'px';
        menu.style.top  = top  + 'px';
        menu.style.display = 'block';
      }

      if(window.BNLogoMenu){ doShow(); }
      else {
        var s=document.createElement('script');
        s.src='js/logo-editor-plugin.js';
        s.onload=doShow;
        document.head.appendChild(s);
      }
    }

    function handleLogoAction(action, lid, imgEl){
      if(action === 'crop'){
        window.BNLogoMenu.openCropEditor(imgEl.src, function(newSrc){
          if(!newSrc) return;
          var lo = window._bnLogos.find(function(x){return x.id===lid;});
          if(lo){
            lo.src = newSrc;
            imgEl.src = newSrc;
            window._bnLogoDataUrl = window._bnLogos[0].src;
            broadcast({type:'bn-logos', logos:window._bnLogos});
            if (typeof saveHistory === 'function') saveHistory();
          }
        });
      } else if(action === 'swap'){
        var idx = window._bnLogos.findIndex(function(x){return x.id===lid;});
        if(idx >= 0){
          var next = (idx + 1) % window._bnLogos.length;
          var tmp = window._bnLogos[idx];
          window._bnLogos[idx] = window._bnLogos[next];
          window._bnLogos[next] = tmp;
          window._bnLogoDataUrl = window._bnLogos[0].src;
          renderLogoList();
          broadcast({type:'bn-logos', logos:window._bnLogos});
          if (typeof saveHistory === 'function') saveHistory();
        }
      } else if(action === 'round'){
        var isOn = imgEl.dataset.bnLogoRound === '1';
        imgEl.dataset.bnLogoRound = isOn ? '' : '1';
        imgEl.style.borderRadius  = isOn ? '' : '10px';
        /* 把 round 狀態存進 _bnLogos */
        var lo = window._bnLogos.find(function(x){return x.id===lid;});
        if(lo) lo.round = !isOn;
        broadcast({type:'bn-logos', logos:window._bnLogos});
        renderLogoList();
        if (typeof saveHistory === 'function') saveHistory();
      } else if(action === 'delete'){
        window._bnLogos = window._bnLogos.filter(function(x){return x.id!==lid;});
        window._bnLogoDataUrl = window._bnLogos.length ? window._bnLogos[0].src : null;
        renderLogoList();
        broadcast({type:'bn-logo-remove', id:lid});
        broadcast({type:'bn-logos', logos:window._bnLogos});
        if (typeof saveHistory === 'function') saveHistory();
      }
    }

    /* ══ Logo Menu（logo-editor-plugin.js 的 BNLogoMenu） ══ */
    function attachLogoMenu(lid, imgEl){
      function doAttach(){
        if(!window.BNLogoMenu){ return; }
        var n = window._bnLogos.length;
        window.BNLogoMenu.attach(imgEl, {
          showSwap: n > 1,
          onEdit: function(el, newSrc){
            var lo = window._bnLogos.find(function(x){return x.id===lid;});
            if(lo){
              lo.src = newSrc;
              el.src = newSrc;
              window._bnLogoDataUrl = window._bnLogos[0].src;
              broadcast({type:'bn-logos', logos:window._bnLogos});
              if (typeof saveHistory === 'function') saveHistory();
            }
          },
          onSwap: function(){
            /* 往右移：把此 logo 往後排一位 */
            var idx = window._bnLogos.findIndex(function(x){return x.id===lid;});
            if(idx < 0) return;
            var next = (idx + 1) % window._bnLogos.length;
            var tmp = window._bnLogos[idx];
            window._bnLogos[idx] = window._bnLogos[next];
            window._bnLogos[next] = tmp;
            window._bnLogoDataUrl = window._bnLogos[0].src;
            renderLogoList();
            broadcast({type:'bn-logos', logos:window._bnLogos});
            if (typeof saveHistory === 'function') saveHistory();
          },
          onDelete: function(){
            window._bnLogos = window._bnLogos.filter(function(x){return x.id!==lid;});
            window._bnLogoDataUrl = window._bnLogos.length ? window._bnLogos[0].src : null;
            renderLogoList();
            broadcast({type:'bn-logo-remove', id:lid});
            broadcast({type:'bn-logos', logos:window._bnLogos});
            if (typeof saveHistory === 'function') saveHistory();
          },
          onRound: function(el, isOn){
            var lo = window._bnLogos.find(function(x){return x.id===lid;});
            if(lo){ lo.round = !!isOn; }
            renderLogoList();
            broadcast({type:'bn-logos', logos:window._bnLogos});
            if (typeof saveHistory === 'function') saveHistory();
          }
        });
      }
      if(window.BNLogoMenu){
        doAttach();
      } else {
        var s=document.createElement('script');
        s.src='js/logo-editor-plugin.js';
        s.onload=doAttach;
        document.head.appendChild(s);
      }
    }

    function doLoadLogo(file){
      if(window._bnLogos.length>=MAX_LOGOS)return;
      readFile(file).then(function(src){
        /* 步驟 1：autoTrim — 裁切透明/白色邊距，讓 LOGO 吻合實際像素範圍
           原理：掃描畫布像素，找出非透明內容的邊界框，裁掉多餘空白
           這樣 object-fit:contain 才能讓 LOGO 真正填滿限制框 */
        loadImg(src).then(function(img){
          var trimmed = autoTrim(img);
          /* 步驟 2：限制最大尺寸，避免大圖佔用記憶體 */
          _resizeIfNeeded(trimmed.src, 800, function(finalSrc) {
            var id = 'logo_' + Date.now();
            /* 原始圖（未加白底）永遠保存在 _origSrc，白底合成另外處理 */
            window._bnLogos.push({ id:id, src:finalSrc, _origSrc:finalSrc });
            window._bnLogoDataUrl = window._bnLogos[0].src;
            renderLogoList();
            /* 若白底開關已開啟，立刻合成白底版本 */
            if (window._bnLogoWhiteBg) {
              _applyWhiteBgToAll(function(){ broadcast({type:'bn-logos', logos:window._bnLogos}); if (typeof saveHistory === 'function') saveHistory(); });
            } else {
              broadcast({type:'bn-logos', logos:window._bnLogos});
              if (typeof saveHistory === 'function') saveHistory();
            }
          });
        }).catch(function(){ /* 載入失敗直接用原圖 */
          var id = 'logo_' + Date.now();
          window._bnLogos.push({ id:id, src:src, _origSrc:src });
          window._bnLogoDataUrl = window._bnLogos[0].src;
          renderLogoList();
          broadcast({type:'bn-logos', logos:window._bnLogos});
          if (typeof saveHistory === 'function') saveHistory();
        });
      });
    }

    /* ── 白底合成：把所有 LOGO 加上白色底色（或還原原圖）──
       whiteBg=true  → src 換成白底合成版（_origSrc 保留原圖）
       whiteBg=false → src 還原為 _origSrc
    */
    function _applyWhiteBgToAll(cb) {
      var pending = window._bnLogos.length;
      if (!pending) { if(cb) cb(); return; }
      window._bnLogos.forEach(function(lg) {
        if (!window._bnLogoWhiteBg) {
          /* 還原原圖 */
          lg.src = lg._origSrc || lg.src;
          if (!--pending && cb) cb();
          return;
        }
        /* 合成白底 */
        var img = new Image();
        img.onload = function() {
          /* ★ 2026-08 修正:白底「切著邊」的真正原因
             ──────────────────────────────────────────────────────────
             舊版:畫布 = LOGO 原始尺寸,白色圓角矩形再從邊緣「向內」縮 pad,
             最後 LOGO 以滿版 drawImage(img,0,0) 蓋上去。
             結果白底其實比 LOGO【小】了 pad ——
             LOGO 最外圈 pad 寬的那一圈底下是透明的、沒有白色,
             看起來就像白底被切掉一角。這不是視覺錯覺,是座標畫錯邊。

             新版:畫布 = LOGO 尺寸 +【向外】各加 pad,白底鋪滿整個畫布,
             LOGO 置中畫在 (pad, pad),於是四周都有真正的白色留白。

             ★ pad 改為隨 LOGO 尺寸等比,不再固定 4px:
             各家 LOGO 的原始像素尺寸差異極大(幾百到上千 px),而它們之後
             還會被等面積排版以【不同倍率】縮放。固定 4px 在大圖上等於沒有,
             縮放後更是趨近 0 —— 這也是「加了白底卻看不太出來」的主因。
             改用短邊的 10%(下限 6px)後,不同 LOGO 縮放後的白邊粗細
             才會落在相近的量級。 */
          /* ★ 規格 3.1「logo 無法拉大白框至合適大小 / 太小會縮減到 logo 圖案」:
             留白比例改為使用者可調(側欄滑桿),不再寫死 10%。
             0 = 完全貼齊 LOGO(等同沒有白邊),0.40 = 短邊 40% 的厚白框。
             下限仍保 6px,避免小圖在低比例下白邊細到看不見。 */
          var natW = img.naturalWidth, natH = img.naturalHeight;
          var padRatio = (typeof window._bnLogoPad === 'number') ? window._bnLogoPad : 0.10;
          padRatio = Math.max(0, Math.min(0.40, padRatio));
          var pad  = padRatio <= 0 ? 0
                   : Math.max(6, Math.round(Math.min(natW, natH) * padRatio));
          var cw   = natW + pad * 2;
          var ch   = natH + pad * 2;
          /* 圓角:跟著 pad 走,並夾住上限避免半徑超過邊長一半導致路徑異常 */
          var r    = Math.min(Math.round(pad * 1.8), Math.floor(Math.min(cw, ch) / 2));

          var c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          var ctx = c.getContext('2d');

          /* 白色圓角矩形鋪滿整個畫布(不再內縮) */
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(cw - r, 0);
          ctx.quadraticCurveTo(cw, 0, cw, r);
          ctx.lineTo(cw, ch - r);
          ctx.quadraticCurveTo(cw, ch, cw - r, ch);
          ctx.lineTo(r, ch);
          ctx.quadraticCurveTo(0, ch, 0, ch - r);
          ctx.lineTo(0, r);
          ctx.quadraticCurveTo(0, 0, r, 0);
          ctx.closePath();
          ctx.fill();

          /* LOGO 置中,四周各留 pad */
          ctx.drawImage(img, pad, pad);
          lg.src = c.toDataURL('image/png');
          if (!--pending && cb) cb();
        };
        img.onerror = function() { if (!--pending && cb) cb(); };
        img.src = lg._origSrc || lg.src;
      });
    }

    /* LOGO / 商品圖尺寸限制：超過 maxPx 則等比縮小，否則直接使用原圖 */
    function _resizeIfNeeded(src, maxPx, cb) {
      var img = new Image();
      img.onload = function() {
        if (img.naturalWidth <= maxPx && img.naturalHeight <= maxPx) {
          cb(src); return;
        }
        var scale = Math.min(maxPx / img.naturalWidth, maxPx / img.naturalHeight);
        var c = document.createElement('canvas');
        c.width  = Math.round(img.naturalWidth  * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/png'));
      };
      img.onerror = function() { cb(src); }; /* 讀取失敗直接用原圖 */
      img.src = src;
    }

    /* ══ 商品上傳（Modal） ══ */
    var modal, staged=[], heroIdx=0, rankOrder=null, currentStep=1, dragSrc=null;

    function insertProductUI(){
      var scroll=document.getElementById('sidebar-scroll');
      if(!scroll||document.getElementById('bn-prod-open-btn'))return;
      var target=null;
      scroll.querySelectorAll('.s-section').forEach(function(el){if(el.textContent.trim()==='排版選擇')target=el;});
      var sec=document.createElement('div');
      sec.innerHTML=[
        '<div class="s-section" style="margin-top:8px">商品圖（最多2張）</div>',
        '<div class="bn-section">',
        '  <div id="bn-shadow-angle-row" style="display:flex;align-items:center;gap:8px;padding:2px 0 8px;">',
        '    <span style="font-size:11px;color:var(--text2,#a0a0a0);flex-shrink:0;">陰影光源</span>',
        '    <div style="display:flex;gap:4px;">',
        '      <button type="button" class="bn-shadow-angle-btn" data-angle="left" style="flex:1;padding:3px 0;font-size:11px;border:1px solid #444;border-radius:4px;background:#222;color:#ccc;cursor:pointer;">左</button>',
        '      <button type="button" class="bn-shadow-angle-btn" data-angle="top" style="flex:1;padding:3px 0;font-size:11px;border:1px solid #444;border-radius:4px;background:#222;color:#ccc;cursor:pointer;">中</button>',
        '      <button type="button" class="bn-shadow-angle-btn" data-angle="right" style="flex:1;padding:3px 0;font-size:11px;border:1px solid #444;border-radius:4px;background:#222;color:#ccc;cursor:pointer;">右</button>',
        '    </div>',
        '  </div>',
        '  <button id="bn-prod-open-btn">＋ 上傳商品圖</button>',
        '  <div class="bn-prod-list" id="bn-prod-list"></div>',
        '</div>',
      ].join('');
      if(target)scroll.insertBefore(sec,target);else scroll.appendChild(sec);
      document.getElementById('bn-prod-open-btn').addEventListener('click',openModal);
      _shadowAngleBtns = sec.querySelectorAll('.bn-shadow-angle-btn');
      _shadowAngleBtns.forEach(function(b){
        b.addEventListener('click', function(){
          window._bnShadowAngle = b.dataset.angle;
          broadcast({type:'bn-shadow-angle', preset: window._bnShadowAngle});
          _syncShadowAngleBtns();
          if (typeof saveHistory === 'function') saveHistory();
        });
      });
      _syncShadowAngleBtns();
      buildModal();
    }

    /* ── 規格 5.2「整體一鍵等比例縮放」已於 2026-08-19 依使用者要求移除 ──
       實作過(以商品範圍底部中央為錨點的相似變換,驗證過可逆且不累積誤差),
       但實際使用效果不佳,故整支拿掉。若日後要重做,備份在
       scratchpad/bak-before-revert52/,重點是「錨點該取哪裡」——
       繞畫布中心會讓縮小時所有素材集體離地漂浮,那是當初選底部錨點的原因。 */

    function buildModal(){
      if(document.getElementById('bn-prod-modal'))return;
      var el=document.createElement('div');
      el.id='bn-prod-modal';
      el.innerHTML=[
        '<div class="bn-modal-box">',
        '  <div class="bn-modal-head"><h3>上傳商品圖</h3><button class="bn-modal-close" id="bn-mc">×</button></div>',
        '  <div class="bn-modal-body">',
        '    <div class="bn-step-tabs">',
        '      <button class="bn-step-tab on" id="bn-st1">① 選取圖片</button>',
        '      <button class="bn-step-tab" id="bn-st2">② 確認大小比例</button>',
        '    </div>',
        '    <div id="bn-sc1">',
        '      <div class="bn-modal-drop" id="bn-mdrop">',
        '        <div style="font-size:22px;margin-bottom:4px">🖼️</div>',
        '        <div style="font-size:13px;font-weight:700;color:#e0e0e0">拖曳或點擊選取圖片</div>',
        '        <p style="margin:4px 0 0;font-size:11px">最多2張，可多選</p>',
        '        <input id="bn-mfinp" type="file" accept="image/*" multiple>',
        '      </div>',
        '      <div class="bn-preview-grid" id="bn-mpgrid"></div>',
        '      <div id="bn-mno" style="text-align:center;color:#666666;font-size:12px;padding:8px">尚未選取圖片</div>',
        '      <div class="bn-limit-msg" id="bn-mlimit"></div>',
        '      <div style="text-align:center;margin:8px 0 2px">',
        '        <button id="bn-polaroid-btn" style="padding:8px 16px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#ddd;cursor:pointer;font-size:13px">🖼️ 拍立得構圖</button>',
        '      </div>',
        '    </div>',
        '    <div id="bn-sc2" style="display:none">',
        '      <div style="font-size:12px;color:#ee4d2d;background:rgba(74,144,226,.08);border:1px solid rgba(238,77,45,.2);border-radius:10px;padding:8px 12px;margin-bottom:14px;line-height:1.8">',
        '        ・<b style="color:#e0e0e0">最前面 = 主品</b>，放中間最大<br>',
        '        ・左側配品第二大，右側配品最小<br>',
        '        ・用 ← → 箭頭或拖曳調整順序',
        '      </div>',
        '      <div class="bn-rank-row" id="bn-rrow"></div>',
        '      <div class="bn-rank-hint">圖片高度反映構圖時的相對大小</div>',
        '    </div>',
        '  </div>',
        '  <div class="bn-modal-foot">',
        '    <button class="bn-btn-skip" id="bn-mback" style="display:none">← 上一步</button>',
        '    <button class="bn-btn-skip" id="bn-mskip">跳過，直接套用</button>',
        '    <button class="bn-btn-confirm" id="bn-mnext">下一步 →</button>',
        '  </div>',
        '</div>',
      ].join('');
      document.body.appendChild(el);
      modal=el;

      // 事件綁定
      document.getElementById('bn-mc').addEventListener('click',closeModal);
      modal.addEventListener('click',function(e){if(e.target===modal)closeModal();});
      document.getElementById('bn-st1').addEventListener('click',function(){if(currentStep!==1)showStep(1);});
      document.getElementById('bn-st2').addEventListener('click',function(){if(currentStep!==2&&staged.length&&staged.length<=MAX_PROD)showStep(2);});
      document.getElementById('bn-mnext').addEventListener('click',function(){
        if(currentStep===1){if(!staged.length||staged.length>MAX_PROD)return;showStep(2);}
        else{applyWithOrder(rankOrder.map(function(i){return staged[i];}));closeModal();}
      });
      document.getElementById('bn-mback').addEventListener('click',function(){showStep(1);});
      document.getElementById('bn-mskip').addEventListener('click',function(){
        if(!staged.length){closeModal();return;}
        applyWithOrder(staged.slice(0,MAX_PROD),true);closeModal();
      });
      var mdrop=document.getElementById('bn-mdrop');
      var mfinp=document.getElementById('bn-mfinp');
      mdrop.addEventListener('click',function(e){if(e.target===mfinp)return;mfinp.click();});
      mdrop.addEventListener('dragover',function(e){e.preventDefault();this.classList.add('over');});
      mdrop.addEventListener('dragleave',function(){this.classList.remove('over');});
      mdrop.addEventListener('drop',function(e){e.preventDefault();this.classList.remove('over');handleFiles(Array.from(e.dataTransfer.files));});
      mfinp.addEventListener('change',function(){handleFiles(Array.from(this.files));this.value='';});

      /* 拍立得構圖：開產生器 → 產出當一張普通商品圖塞進 staged，續走既有流程
         ★ 必須綁在 buildModal() 內部，此時按鈕 DOM 才存在（否則抓到 null，監聽掛不上）*/
      var pbtn=document.getElementById('bn-polaroid-btn');
      if(pbtn){
        pbtn.addEventListener('click',function(){
          if(!window.bnPolaroid||typeof window.bnPolaroid.open!=='function'){alert('拍立得外掛尚未載入');return;}
          if(staged.length>=MAX_PROD){alert('已達 '+MAX_PROD+' 張上限，請先移除一張');return;}
          window.bnPolaroid.open(function(res){
            if(staged.length>=MAX_PROD)return;
            staged.push({src:res.flatSrc,name:'拍立得',ratio:res.ratio,_polaroid:res.recipe});
            renderPreview();updateLimit();
          });
        });
      }
    }

    function openModal(){
      staged=window._bnProducts.map(function(p){return{src:p.src,name:p.name,ratio:p.ratio,fromExisting:true,id:p.id,_polaroid:p._polaroid};});
      heroIdx=0; rankOrder=null; currentStep=1;
      renderPreview(); updateLimit(); showStep(1);
      modal.classList.add('show');
    }
    function closeModal(){modal.classList.remove('show');}

    function handleFiles(files){
      var imgs=files.filter(function(f){return f.type.startsWith('image/');});
      var toAdd=imgs.slice(0,Math.max(0,MAX_PROD-staged.length+(staged.filter(function(s){return s.fromExisting;}).length)));
      if(!toAdd.length){updateLimit();renderPreview();return;}
      Promise.all(toAdd.map(function(f){return readFile(f).then(function(src){return{file:f,src:src,name:f.name.replace(/\.[^.]+$/,''),ratio:1};});}))
        .then(function(results){results.forEach(function(r){if(staged.length<MAX_PROD)staged.push(r);});renderPreview();updateLimit();});
    }

    function updateLimit(){
      var el=document.getElementById('bn-mlimit');
      var n=staged.length;
      if(n>MAX_PROD){el.style.color='#f5a623';el.textContent='目前 '+n+' 張，請移除 '+(n-MAX_PROD)+' 張才可繼續';}
      else if(n===MAX_PROD){el.style.color='#ee4d2d';el.textContent='✓ 已選 2 張，可繼續下一步';}
      else if(n>0){el.style.color='#666666';el.textContent='已選 '+n+' 張（最多2張）';}
      else{el.textContent='';}
      var btn=document.getElementById('bn-mnext');
      if(btn&&currentStep===1){var ok=n>0&&n<=MAX_PROD;btn.disabled=!ok;}
    }

    function renderPreview(){
      var grid=document.getElementById('bn-mpgrid');
      var noEl=document.getElementById('bn-mno');
      if(!grid)return;
      grid.innerHTML='';
      noEl.style.display=staged.length?'none':'';
      staged.forEach(function(item,i){
        var isHero=(i===heroIdx);
        var cell=document.createElement('div');
        cell.className='bn-preview-cell'+(isHero?' is-hero':'');
        cell.innerHTML=(isHero?'<div class="pc-hero">主品</div>':'')+
          '<img src="'+item.src+'">'+
          '<div class="pc-name">'+item.name+'</div>'+
          '<div class="pc-rm" data-ri="'+i+'">×</div>';
        cell.addEventListener('click',function(e){if(e.target.dataset.ri!==undefined)return;heroIdx=i;renderPreview();});
        cell.querySelector('.pc-rm').addEventListener('click',function(e){
          e.stopPropagation();
          staged.splice(+e.target.dataset.ri,1);
          if(heroIdx>=staged.length)heroIdx=Math.max(0,staged.length-1);
          renderPreview();updateLimit();
        });
        grid.appendChild(cell);
      });
    }

    /* ── Step 2: 排序 ── */
    function initRankOrder(){
      rankOrder=[];
      if(heroIdx<staged.length)rankOrder.push(heroIdx);
      staged.forEach(function(_,i){if(i!==heroIdx)rankOrder.push(i);});
    }

    function renderRankRow(){
      var row=document.getElementById('bn-rrow');
      if(!row)return;
      row.innerHTML='';
      var posLabels=['最前面（中間）','左側配品','右側配品'];
      var posTags=['hero','left','right'];
      var heights=[120,95,75];
      dragSrc=null;

      rankOrder.forEach(function(itemIdx,pos){
        var item=staged[itemIdx];
        if(!item)return;
        var h=heights[pos]||75;
        var w=Math.round(h*(item.ratio||1));

        var card=document.createElement('div');
        card.className='bn-rank-card'; card.dataset.pos=pos; card.draggable=true;

        var wrap=document.createElement('div');
        wrap.className='bn-rank-img-wrap'; wrap.style.cssText='width:'+w+'px;height:'+h+'px;';
        var img=document.createElement('img');
        img.src=item.src; img.style.cssText='height:'+h+'px;width:auto;max-width:'+w+'px;';
        wrap.appendChild(img);

        if(pos>0){
          var al=document.createElement('button');al.className='bn-rank-arrow left-arr';al.textContent='‹';al.title='往左移';
          al.addEventListener('click',function(e){e.stopPropagation();var t=rankOrder[pos];rankOrder[pos]=rankOrder[pos-1];rankOrder[pos-1]=t;renderRankRow();});
          wrap.appendChild(al);
        }
        if(pos<rankOrder.length-1){
          var ar=document.createElement('button');ar.className='bn-rank-arrow right-arr';ar.textContent='›';ar.title='往右移';
          ar.addEventListener('click',function(e){e.stopPropagation();var t=rankOrder[pos];rankOrder[pos]=rankOrder[pos+1];rankOrder[pos+1]=t;renderRankRow();});
          wrap.appendChild(ar);
        }
        card.appendChild(wrap);

        var nameEl=document.createElement('div');nameEl.className='bn-rank-name';nameEl.textContent=item.name;card.appendChild(nameEl);
        var tagEl=document.createElement('div');tagEl.className='bn-rank-tag '+(posTags[pos]||'left');tagEl.textContent=posLabels[pos]||'配品';card.appendChild(tagEl);

        card.addEventListener('dragstart',function(e){dragSrc=+card.dataset.pos;e.dataTransfer.effectAllowed='move';setTimeout(function(){card.classList.add('dragging');},0);});
        card.addEventListener('dragend',function(){card.classList.remove('dragging');hideLine();dragSrc=null;});
        row.appendChild(card);
      });

      /* drop line */
      var line=document.createElement('div');line.className='bn-drop-line';row.appendChild(line);
      function hideLine(){line.style.display='none';}
      function getInsertIdx(cx){var cards=Array.from(row.querySelectorAll('.bn-rank-card'));for(var i=0;i<cards.length;i++){var r=cards[i].getBoundingClientRect();if(cx<r.left+r.width*.5)return i;}return cards.length;}
      function showLine(cx){var cards=Array.from(row.querySelectorAll('.bn-rank-card'));var rr=row.getBoundingClientRect();var idx=getInsertIdx(cx);var lx;if(!cards.length){lx=0;}else if(idx===0){lx=cards[0].getBoundingClientRect().left-rr.left-8;}else if(idx>=cards.length){lx=cards[cards.length-1].getBoundingClientRect().right-rr.left+8;}else{lx=(cards[idx-1].getBoundingClientRect().right+cards[idx].getBoundingClientRect().left)/2-rr.left;}line.style.left=Math.round(lx)+'px';line.style.display='block';}
      row.addEventListener('dragover',function(e){if(dragSrc===null)return;e.preventDefault();showLine(e.clientX);});
      row.addEventListener('dragleave',function(e){if(!row.contains(e.relatedTarget))hideLine();});
      row.addEventListener('drop',function(e){e.preventDefault();hideLine();if(dragSrc===null)return;var idx=getInsertIdx(e.clientX);var moved=rankOrder.splice(dragSrc,1)[0];if(idx>dragSrc)idx--;rankOrder.splice(idx,0,moved);dragSrc=null;renderRankRow();});
    }

    function showStep(n){
      currentStep=n;
      document.getElementById('bn-sc1').style.display=n===1?'':'none';
      document.getElementById('bn-sc2').style.display=n===2?'':'none';
      document.getElementById('bn-st1').classList.toggle('on',n===1);
      document.getElementById('bn-st2').classList.toggle('on',n===2);
      document.getElementById('bn-mback').style.display=n===2?'':'none';
      document.getElementById('bn-mnext').textContent=n===1?'下一步 →':'確認並套用';
      document.getElementById('bn-mskip').textContent=n===1?'跳過，直接套用':'跳過比例，直接套用';
      document.getElementById('bn-mnext').disabled=false;
      if(n===1)updateLimit();
      if(n===2){initRankOrder();renderRankRow();}
    }

    /* ── 套用 ── */
    async function applyWithOrder(orderedItems,skipRatio){
       saveHistory();
      if(!orderedItems.length)return;
      /* 清除舊商品 */
      var oldIds=window._bnProducts.map(function(p){return p.id;});
      oldIds.forEach(function(id){broadcast({type:'bn-product-remove',id:id});});
      window._bnProducts=[];

      var sizeRatios=skipRatio?null:[1,0.85,0.72];
      for(var i=0;i<orderedItems.length;i++){
        var item=orderedItems[i];
        var src=item.src;
        /* 如果是已有的商品直接用，否則先 trimAlpha */
        if(!item.fromExisting){
          var img=await loadImg(src);
          /* trimAlpha：只裁透明邊距，autoTrim 的白色排除邏輯會誤裁白色系商品 */
          var trimmed=trimAlpha(img);
          src=trimmed.src;
          item.ratio=trimmed.ratio;
        }
        var id='p'+Date.now()+'_'+i;
        var sizeScale=sizeRatios?sizeRatios[i]||0.72:1;
        /* position: 0=主品(中), 1=左配, 2=右配 */
        var positionMap = [0, 1, 2];
        var pos = positionMap[i] !== undefined ? positionMap[i] : i;
        /* 預設 z 堆疊：主品（i=0）在後，配品（i=1+）依序往前。
           zOrder 越小 = z-index 越高（越靠前），故主品得到最大的 zOrder 值 */
        var zOrder = orderedItems.length - 1 - i;
        var _prod={id:id,src:src,ratio:item.ratio||1,name:item.name,sizeScale:sizeScale,position:pos,zOrder:zOrder};
        if(item._polaroid)_prod._polaroid=item._polaroid; /* 拍立得配方隨商品保存，供 undo/暫存/重編 */
        window._bnProducts.push(_prod);
        broadcast({type:'bn-product-add',id:id,src:src,ratio:item.ratio||1,name:item.name,index:i,sizeScale:sizeScale,position:pos,rot:_prod.rot||0});
        await new Promise(function(r){setTimeout(r,50);});
      }
      renderProdList();
      /* 商品全部上傳後，自動廣播最佳構圖預設
         → 讓每個 iframe 的 _smartAutoLayout 正確排版，不需手動點構圖按鈕 */
      _broadcastBestCompose(window._bnProducts.length);
      /* 商品狀態更新後立即記錄歷史 */
      if (typeof saveHistory === 'function') saveHistory();
    }

    /* 大中小位置標籤 */
    var POS_LABELS = ['主品（中）', '左配品', '右配品'];
    var POS_COLORS = ['#ee4d2d', '#666666', '#666666'];

    /**
     * _broadcastBestCompose — 依商品+人物數量自動配對最佳構圖並廣播
     * ─────────────────────────────────────────────────────────────
     * 優先權：商品數完全吻合 > 人物差值最小
     * 在 bn.html context 執行，可直接讀取 window.COMPOSE_PRESETS。
     * ─────────────────────────────────────────────────────────────
     * @param {number} prodCount 目前上傳的商品數量
     */
    function _broadcastBestCompose(prodCount) {
      if (!window.COMPOSE_PRESETS || !Array.isArray(window.COMPOSE_PRESETS)) return;
      var personCount = window._bnPersons ? window._bnPersons.length : 0;
      var capped = Math.min(prodCount, 2); /* 上限 2 品 */
      if (capped === 0) return;

      var bestPreset = null;
      var bestScore  = Infinity;
      window.COMPOSE_PRESETS.forEach(function(preset) {
        var pProd   = (preset.prods   && preset.prods.length)   || 0;
        var pPerson = (preset.persons && preset.persons.length) || 0;
        if (pProd !== capped) return; /* 商品數必須完全吻合 */
        var score = Math.abs(pPerson - personCount);
        if (score < bestScore) { bestScore = score; bestPreset = preset; }
      });

      if (bestPreset) {
        window._bnComposePreset = bestPreset;
        /* ★ 改呼叫 bn.html 共用的 applyComposeBroadcast()，不再自己重寫一份
           postMessage 迴圈 —— 這樣才能吃到「依版位方向送對應座標」的邏輯，
           否則這條自動配對路徑會繞過分方向機制，繼續對所有版位送同一份資料。 */
        /* ★ 防呆提示：自動重排前若已有手動調整過的圖層，這次重排會「保留」它們
           （由 layout-runtime 的 preserveManual 預設處理）。用非阻斷式 toast 告知
           使用者這是刻意保留、不是排版壞掉；沒有手動圖層時不打擾。 */
        var _preserved = (window._bnProducts || []).some(function(p){ return p.userMoved; }) ||
                         (window._bnPersons  || []).some(function(p){ return p.userMoved; });
        if (_preserved && typeof window._bnToast === 'function') {
          window._bnToast('已保留你手動調整的圖層，新素材放入預設位置');
        }
        if (typeof window.applyComposeBroadcast === 'function') {
          window.applyComposeBroadcast(bestPreset);
        } else {
          /* 防呆 fallback：極端情況下 applyComposeBroadcast 還沒掛到 window
             （理論上不會發生，bn.html 是先載入的），維持原始無分方向行為 */
          document.querySelectorAll('.preview-block iframe').forEach(function(f) {
            try { f.contentWindow.postMessage({ type: 'bn-compose', preset: bestPreset }, '*'); }
            catch(e) {}
          });
        }
        if (typeof saveHistory === 'function') saveHistory();
      }
    }

    function renderProdList(){
      var list=document.getElementById('bn-prod-list');
      if(!list)return;
      list.innerHTML='';
      /* 依 position 排序顯示：主品第一 */
      var sorted = window._bnProducts.slice().sort(function(a,b){
        var pa = a.position !== undefined ? a.position : 99;
        var pb = b.position !== undefined ? b.position : 99;
        return pa - pb;
      });
      /* 初始化 zOrder（若未設定，依目前 sorted 順序） */
      sorted.forEach(function(p, i){
        if(p.zOrder === undefined) p.zOrder = i;
      });
      /* z-index 排序：zOrder 小的在上面（蓋住其他） */
      var zSorted = window._bnProducts.slice().sort(function(a,b){
        return (a.zOrder||0) - (b.zOrder||0);
      });
      /* 工具列顯示用 zSorted（前面的蓋住後面的） */
      zSorted.forEach(function(p){
        var row=document.createElement('div');row.className='bn-prod-item';
        row.style.flexWrap='wrap';row.style.gap='4px';

        var img=document.createElement('img');img.src=p.src;

        var infoWrap=document.createElement('div');
        infoWrap.style.cssText='flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;';

        var name=document.createElement('span');
        name.textContent=p.name;
        name.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;';

        var posLabel=document.createElement('span');
        var posIdx = p.position !== undefined ? p.position : 0;
        posLabel.textContent = POS_LABELS[posIdx] || '';
        posLabel.style.cssText='font-size:9px;font-weight:700;color:'+( POS_COLORS[posIdx]||'#666666')+';';

        infoWrap.appendChild(name);
        infoWrap.appendChild(posLabel);

        var editBtn=document.createElement('button');
        if(p._polaroid){
          /* 拍立得商品：不給去背編輯器（PM 指定），改為重開產生器就地重編 */
          editBtn.textContent='重拍';editBtn.title='重新編輯拍立得構圖';
          editBtn.addEventListener('click',(function(pid){return function(){
            if(!window.bnPolaroid)return;
            var pp=window._bnProducts.find(function(x){return x.id===pid;});
            if(!pp)return;
            window.bnPolaroid.open(function(res){
              saveHistory();
              pp.src=res.flatSrc;pp.ratio=res.ratio;pp._polaroid=res.recipe;
              renderProdList();
              broadcast({type:'bn-product-update',id:pp.id,src:pp.src,ratio:pp.ratio});
            },pp._polaroid);
          };})(p.id));
        }else{
          editBtn.textContent='編輯';editBtn.title='裁切・去背・擦除';
          editBtn.addEventListener('click',(function(pid){return function(){
            openProductEditor(pid);
          };})(p.id));
        }

        /* 陰影縮放微調：X/Y 各一條滑桿，只影響陰影寬度/拖曳長度，
           不影響商品照片本體大小(引擎見 shadow-plugin.js drawGroundShadow 的
           spw/sph vs pw/ph 兩軌)。全排版共用同一個值，input 只更新顯示數字，
           change 才真的送出去(沿用 LOGO 白框留白滑桿的既有慣例)。 */
        var shadowScaleWrap=document.createElement('div');
        shadowScaleWrap.style.cssText='flex-basis:100%;display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2,#a0a0a0);';
        var sxLabel=document.createElement('span');sxLabel.textContent='陰影寬';sxLabel.style.flexShrink='0';
        var sxInput=document.createElement('input');sxInput.type='range';sxInput.min='30';sxInput.max='200';sxInput.step='5';
        sxInput.style.cssText='flex:1;min-width:0;';
        sxInput.value=String(Math.round((typeof p.shadowScaleX==='number'?p.shadowScaleX:1)*100));
        var sxVal=document.createElement('span');sxVal.textContent=sxInput.value+'%';sxVal.style.cssText='flex-shrink:0;width:32px;text-align:right;';
        var syLabel=document.createElement('span');syLabel.textContent='長';syLabel.style.flexShrink='0';
        var syInput=document.createElement('input');syInput.type='range';syInput.min='30';syInput.max='200';syInput.step='5';
        syInput.style.cssText='flex:1;min-width:0;';
        syInput.value=String(Math.round((typeof p.shadowScaleY==='number'?p.shadowScaleY:1)*100));
        var syVal=document.createElement('span');syVal.textContent=syInput.value+'%';syVal.style.cssText='flex-shrink:0;width:32px;text-align:right;';
        sxInput.addEventListener('input',function(){ sxVal.textContent=sxInput.value+'%'; });
        syInput.addEventListener('input',function(){ syVal.textContent=syInput.value+'%'; });
        (function(pid){
          function commit(){
            var pp=window._bnProducts.find(function(x){return x.id===pid;});
            if(!pp) return;
            pp.shadowScaleX=parseFloat(sxInput.value)/100;
            pp.shadowScaleY=parseFloat(syInput.value)/100;
            broadcast({type:'bn-product-shadow-scale',id:pid,shadowScaleX:pp.shadowScaleX,shadowScaleY:pp.shadowScaleY});
            if (typeof saveHistory === 'function') saveHistory();
          }
          sxInput.addEventListener('change',commit);
          syInput.addEventListener('change',commit);
        })(p.id);
        shadowScaleWrap.appendChild(sxLabel);shadowScaleWrap.appendChild(sxInput);shadowScaleWrap.appendChild(sxVal);
        shadowScaleWrap.appendChild(syLabel);shadowScaleWrap.appendChild(syInput);shadowScaleWrap.appendChild(syVal);

        var rmBtn=document.createElement('button');rmBtn.textContent='移除';rmBtn.className='rm';
        rmBtn.addEventListener('click',function(){
           saveHistory();
          window._bnProducts=window._bnProducts.filter(function(x){return x.id!==p.id;});
          renderProdList();broadcast({type:'bn-product-remove',id:p.id});
        });

        /* 上移/下移：調整 position 值 */
        var moveWrap=document.createElement('div');moveWrap.className='bn-prod-move';

        var upBtn=document.createElement('button');upBtn.textContent='▲';upBtn.title='往前';
        var downBtn=document.createElement('button');downBtn.textContent='▼';downBtn.title='往後';

        /* 依目前 sorted 裡的順序決定能否移動 */
        var sortedIdx = zSorted.indexOf(p);
        upBtn.disabled   = sortedIdx === 0;
        downBtn.disabled = sortedIdx === zSorted.length - 1;
        upBtn.style.opacity   = upBtn.disabled   ? '0.3' : '1';
        downBtn.style.opacity = downBtn.disabled ? '0.3' : '1';

        upBtn.addEventListener('click',(function(pid, si){ return function(){
          /* 往上 = z-index 升高（蓋在前面） */
          var a = window._bnProducts.find(function(x){return x.id===pid;});
          var b = zSorted[si-1];
          if(!a||!b) return;
          var tmp = a.zOrder; a.zOrder = b.zOrder; b.zOrder = tmp;
          renderProdList();
          broadcastZOrder();
          if (typeof saveHistory === 'function') saveHistory();
        };})(p.id, sortedIdx));

        downBtn.addEventListener('click',(function(pid, si){ return function(){
          /* 往下 = z-index 降低（被蓋在後面） */
          var a = window._bnProducts.find(function(x){return x.id===pid;});
          var b = zSorted[si+1];
          if(!a||!b) return;
          var tmp = a.zOrder; a.zOrder = b.zOrder; b.zOrder = tmp;
          renderProdList();
          broadcastZOrder();
          if (typeof saveHistory === 'function') saveHistory();
        };})(p.id, sortedIdx));

        moveWrap.appendChild(upBtn);
        moveWrap.appendChild(downBtn);

        row.appendChild(img);row.appendChild(infoWrap);row.appendChild(moveWrap);row.appendChild(editBtn);row.appendChild(rmBtn);row.appendChild(shadowScaleWrap);
        list.appendChild(row);
      });
    }


    /* 廣播 z-index 更新 */
    function broadcastZOrder(){
      /* zOrder：依工具列順序，index 0 = 最上層（z-index 最高） */
      var order = window._bnProducts.slice().sort(function(a,b){
        return (a.zOrder||0) - (b.zOrder||0);
      }).map(function(p){ return p.id; });
      broadcast({type:'bn-product-zorder', order: order});
    }
    /* 開啟 editor-plugin 編輯器（裁切/去背/擦除/影子） */
    function openProductEditor(pid, onDone){
      var p=window._bnProducts.find(function(x){return x.id===pid;});
      if(!p)return;

      /* 確保 editor-plugin.js 已載入 */
      if(!window.HBNProductEditorPlugin){
        var s=document.createElement('script');
        s.src='js/editor-plugin.js';
        s.onload=function(){ doOpenEditor(pid, onDone); };
        document.head.appendChild(s);
        return;
      }
      doOpenEditor(pid, onDone);
    }

    /* ★ 對外開放:供共編器(coedit-plugin)以 product id 直接開編輯器 / 換圖 */
    window.openProductEditor = openProductEditor;

    /* 手動換圖:用新圖(dataURL)取代該商品,走與編輯存回相同的 trimAlpha→更新→重播流程 */
    function replaceProductImage(pid, dataUrl, onDone){
      var p=window._bnProducts.find(function(x){return x.id===pid;});
      if(!p || !dataUrl) return;
      var im=new Image();
      im.onload=function(){
        var trimmed=trimAlpha(im);            /* 與編輯路徑一致:去背後透明邊距修正、重算 ratio */
        p.src=trimmed.src;
        p.ratio=trimmed.ratio;
        renderProdList();
        if(typeof onDone==='function') onDone(p);   /* 共編回填 */
        /* ★ per-版位:不再 remove+add(會刪掉各版位 box、位置全丟且攤平頂層值);
           bn-product-add 已支援就地更新 → 逐 iframe 發自己版位的 payload,只換圖、位置保住。 */
        setTimeout(function(){
          var idx=window._bnProducts.indexOf(p);
          document.querySelectorAll('.preview-block iframe').forEach(function(f){
            var lid = parseInt(String(f.id||'').replace('iframe-',''), 10);
            try { f.contentWindow.postMessage(_bnBuildProdAddMsg(p, idx, lid), '*'); } catch(e){}
          });
          if (typeof saveHistory === 'function') saveHistory();
        },50);
      };
      im.onerror=function(){ alert('圖片載入失敗,請換一張'); };
      im.src=dataUrl;
    }
    window.replaceProductImage = replaceProductImage;

    function doOpenEditor(pid, onDone){
      if(!window.HBNProductEditorPlugin){ alert('editor-plugin.js 未載入'); return; }
      var p=window._bnProducts.find(function(x){return x.id===pid;});
      if(!p)return;

      /* 建一個暫存的 .editor-item 結構讓 plugin 使用 */
      var wrap=document.getElementById('bn-edit-wrap');
      if(!wrap){
        wrap=document.createElement('div');
        wrap.id='bn-edit-wrap';
        wrap.style.cssText='position:fixed;left:-9999px;top:-9999px;width:400px;height:400px;';
        document.body.appendChild(wrap);
      }
      wrap.innerHTML='';
      var box=document.createElement('div');
      box.className='editor-item';
      box.dataset.baseSrc=p.src;
      box.style.cssText='position:relative;width:400px;height:400px;';
      var img=document.createElement('img');
      img.src=p.src;
      img.style.cssText='width:100%;height:100%;object-fit:contain;display:block;';
      box.appendChild(img);
      wrap.appendChild(box);

      /* 覆寫 imgRef.src 後同步回 _bnProducts 和 iframe */
      var origOnload=img.onload;
      var observer=new MutationObserver(function(){
        if(img.src && img.src!==p.src && img.src.startsWith('data:')){
          observer.disconnect();
          /* 編輯後 trimAlpha：去背後可能產生新的透明邊距，重算 ratio */
          var editedImg=new Image();
          editedImg.onload=function(){
            var trimmed=trimAlpha(editedImg);
            p.src=trimmed.src;
            p.ratio=trimmed.ratio;
            renderProdList();
            if(typeof onDone==='function') onDone(p);   /* ★ 供共編回填:編輯存回後通知呼叫端 */
            /* ★ per-版位:同換圖——就地更新、逐 iframe 發自己版位 payload,只換圖、位置保住 */
            setTimeout(function(){
              var idx=window._bnProducts.indexOf(p);
              document.querySelectorAll('.preview-block iframe').forEach(function(f){
                var lid = parseInt(String(f.id||'').replace('iframe-',''), 10);
                try { f.contentWindow.postMessage(_bnBuildProdAddMsg(p, idx, lid), '*'); } catch(e){}
              });
              if (typeof saveHistory === 'function') saveHistory();
            },50);
          };
          editedImg.src=img.src;
        }
      });
      observer.observe(img,{attributes:true,attributeFilter:['src']});

      window.HBNProductEditorPlugin.open(img);
    }

    /* ── 人物圖編輯器（與商品圖相同的裁切/去背/擦除功能）──
       ★ 修正：系統已由單人物 window._bnPerson 升級為多人物陣列 window._bnPersons，
       原本兩個函式仍寫死讀取 window._bnPerson（永遠是 undefined），導致編輯按鈕點擊無反應。
       現在改為依照呼叫端傳入的 person 物件（含 id）精準定位，支援多人物各自獨立編輯。 */
    function openPersonEditor(person, onDone){
      /* 防呆：呼叫端未傳入物件，或物件無有效圖片來源，直接中止 */
      if(!person||!person.src) return;
      if(!window.HBNProductEditorPlugin){
        var s=document.createElement('script');
        s.src='js/editor-plugin.js';
        s.onload=function(){ doOpenPersonEditor(person, onDone); };
        document.head.appendChild(s);
        return;
      }
      doOpenPersonEditor(person, onDone);
    }
    window.openPersonEditor = openPersonEditor;   /* ★ 對外開放:供共編以人物物件開編輯器 */

    /* 手動換圖(人物):走與人物編輯存回相同的 trimAlpha→更新→bn-person-update 流程 */
    function replacePersonImage(pid, dataUrl, onDone){
      var target=(window._bnPersons||[]).find(function(x){return x.id===pid;});
      if(!target || !dataUrl) return;
      var im=new Image();
      im.onload=function(){
        var trimmed=trimAlpha(im);
        target.src=trimmed.src;
        target.ratio=trimmed.ratio;
        renderPersonList();
        if(typeof onDone==='function') onDone(target);   /* 共編回填 */
        broadcast({type:'bn-person-update',id:target.id,src:trimmed.src,ratio:trimmed.ratio});
        if (typeof saveHistory === 'function') saveHistory();
      };
      im.onerror=function(){ alert('圖片載入失敗,請換一張'); };
      im.src=dataUrl;
    }
    window.replacePersonImage = replacePersonImage;

    function doOpenPersonEditor(person, onDone){
      if(!window.HBNProductEditorPlugin){ alert('editor-plugin.js 未載入'); return; }
      if(!person||!person.src) return;

      /* 防呆：編輯視窗開啟的瞬間，若該人物已被使用者按下「移除」從 _bnPersons 拿掉，
         以 id 重新核對一次目前清單中是否仍存在，避免對已刪除的物件操作 */
      var pid=person.id;
      var liveP=(window._bnPersons||[]).find(function(x){return x.id===pid;});
      if(!liveP) return;

      var wrap=document.getElementById('bn-edit-wrap');
      if(!wrap){
        wrap=document.createElement('div');
        wrap.id='bn-edit-wrap';
        wrap.style.cssText='position:fixed;left:-9999px;top:-9999px;width:400px;height:400px;';
        document.body.appendChild(wrap);
      }
      wrap.innerHTML='';

      var box=document.createElement('div');
      box.className='editor-item';
      box.dataset.baseSrc=liveP.src;
      box.style.cssText='position:relative;width:400px;height:400px;';
      var img=document.createElement('img');
      img.src=liveP.src;
      img.style.cssText='width:100%;height:100%;object-fit:contain;display:block;';
      box.appendChild(img);
      wrap.appendChild(box);

      /* 監聽 src 變更：編輯完成後同步回對應 id 的 person 並廣播（精準定位，不影響其他人物）*/
      var prevSrc=liveP.src;
      var observer=new MutationObserver(function(){
        if(img.src&&img.src!==prevSrc&&img.src.startsWith('data:')){
          observer.disconnect();
          /* 重新計算比例（去背後寬高可能改變）*/
          var tmp=new Image();
          tmp.onload=function(){
            /* 再次以 id 核對：MutationObserver 為非同步回呼，期間使用者可能已移除該人物 */
            var target=(window._bnPersons||[]).find(function(x){return x.id===pid;});
            if(!target) return;
            /* 編輯後重新 trimAlpha（去背後可能有新的透明邊距）*/
            var trimmed=trimAlpha(tmp);
            target.src=trimmed.src;
            target.ratio=trimmed.ratio;
            renderPersonList();
            if(typeof onDone==='function') onDone(target);   /* ★ 供共編回填 */
            /* 用 bn-person-update 精準更新單一人物，避免覆蓋其他人物的位置與順序 */
            broadcast({type:'bn-person-update',id:target.id,src:trimmed.src,ratio:trimmed.ratio});
            if (typeof saveHistory === 'function') saveHistory();
          };
          tmp.src=img.src;
        }
      });
      observer.observe(img,{attributes:true,attributeFilter:['src']});

      window.HBNProductEditorPlugin.open(img);
    }

    /* ══ 下載 ══ */
    function insertDownloadBar(){
      var sidebar=document.getElementById('sidebar');
      if(!sidebar||document.getElementById('bn-download-bar'))return;
      var bar=document.createElement('div');bar.id='bn-download-bar';
      bar.innerHTML=[
        '<button class="bn-dl-btn" id="bn-dl-all">📦 一鍵下載 ZIP</button>',
        '<button class="bn-dl-btn" id="bn-dl-single" style="margin-top:4px;',
        'background:linear-gradient(135deg,#1a3a5c,#0d2a47);">⬇ 逐一下載 PNG</button>',
        '<div class="bn-dl-progress" id="bn-dl-progress"></div>',
      ].join('');
      var ew=sidebar.querySelector('.export-wrap');
      if(ew)sidebar.insertBefore(bar,ew);else sidebar.appendChild(bar);
      document.getElementById('bn-dl-all').addEventListener('click', downloadAllZip);
      document.getElementById('bn-dl-single').addEventListener('click', downloadAllSingle);
    }

    /* 收集所有版位截圖，回傳 Promise<Array<{name,dataUrl}>> */
    function _collectSnapshots() {
      var iframes = Array.from(document.querySelectorAll('.preview-block iframe'));
      if (!iframes.length) return Promise.resolve([]);
      var results = [];
      var promises = iframes.map(function(iframe) {
        return new Promise(function(resolve) {
          var blockEl = iframe.closest('.preview-block');
          var name = ((blockEl?(blockEl.querySelector('.pname')||{}).textContent:'')||'layout')
                       .trim().replace(/[\/:*?"<>|]/g,'_');
          var msgId = 'dl_'+Date.now()+'_'+Math.random();
          var timer;
          function onMsg(e) {
            if (!e.data||e.data.type!=='bn-snapshot'||e.data.msgId!==msgId) return;
            window.removeEventListener('message', onMsg);
            clearTimeout(timer);
            if (e.data.dataUrl) results.push({name:name, dataUrl:e.data.dataUrl});
            resolve();
          }
          window.addEventListener('message', onMsg);
          try { iframe.contentWindow.postMessage({type:'bn-capture',msgId:msgId},'*'); }
          catch(e) { resolve(); }
          timer = setTimeout(function(){ window.removeEventListener('message',onMsg); resolve(); }, 6000);
        });
      });
      return Promise.all(promises).then(function(){ return results; });
    }

    /* ZIP 打包下載 */
    function downloadAllZip() {
      var btn = document.getElementById('bn-dl-all');
      btn.disabled = true; setProgress('截圖中…');
      function doZip(snapshots) {
        if (!snapshots.length) { setProgress('沒有可下載的版位'); btn.disabled=false; return; }
        if (typeof JSZip === 'undefined') {
          var s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
          s.onload = function() { doZip(snapshots); };
          document.head.appendChild(s); return;
        }
        setProgress('打包中…');
        var zip = new JSZip();
        var folder = zip.folder('蝦導播素材');
        snapshots.forEach(function(s) {
          folder.file(s.name+'.png', s.dataUrl.split(',')[1], {base64:true});
        });
        /* ★ 一併打包「暫存檔」(與『下載暫存』位元組相同的 JSON):解壓後可用『⬆ 上傳暫存』讀回續編。
           防呆:狀態外掛未就緒則略過,不影響出圖。 */
        var _stateOk = false;
        try {
          if (window._bnStatePlugin && typeof window._bnStatePlugin.collect === 'function') {
            zip.file('\u8766\u5c0e\u64ad_\u66ab\u5b58\u6a94.json', JSON.stringify(window._bnStatePlugin.collect(), null, 2));
            _stateOk = true;
          }
        } catch (err) { _stateOk = false; }
        zip.generateAsync({type:'blob'}).then(function(blob) {
          var ts = new Date().toISOString().slice(0,16).replace('T','_');
          triggerDownload(URL.createObjectURL(blob), '蝦導播素材_'+ts+'.zip');
          setProgress('✅ 已打包 '+snapshots.length+' 個版位' + (_stateOk ? '（含暫存檔）' : ''));
          btn.disabled = false;
          setTimeout(function(){ setProgress(''); }, 3000);
        });
      }
      _collectSnapshots().then(doZip);
    }

    /* 逐一 PNG 下載（原有邏輯保留） */
    function downloadAllSingle(){
      var iframes=document.querySelectorAll('.preview-block iframe');
      if(!iframes.length){setProgress('沒有勾選的排版');return;}
      var btn=document.getElementById('bn-dl-single');btn.disabled=true;
      var total=iframes.length,done=0;setProgress('準備中…');
      iframes.forEach(function(iframe){
        var blockEl=iframe.closest('.preview-block');
        var name=(blockEl?(blockEl.querySelector('.pname')||{}).textContent||'layout':'layout');
        name=name.trim().replace(/[\/:*?"<>|]/g,'_');
        var msgId='dl_'+Date.now()+'_'+Math.random();
        function onMsg(e){if(!e.data||e.data.type!=='bn-snapshot'||e.data.msgId!==msgId)return;window.removeEventListener('message',onMsg);if(e.data.dataUrl)triggerDownload(e.data.dataUrl,name+'.png');done++;setProgress('已下載 '+done+' / '+total);if(done>=total){btn.disabled=false;setTimeout(function(){setProgress('');},2500);}}
        window.addEventListener('message',onMsg);
        try{iframe.contentWindow.postMessage({type:'bn-capture',msgId:msgId},'*');}catch(e){done++;}
        setTimeout(function(){window.removeEventListener('message',onMsg);if(done<total){done++;setProgress('已下載 '+done+' / '+total+'（部分逾時）');if(done>=total){btn.disabled=false;setTimeout(function(){setProgress('');},2500);}}},6000);
      });
    }
    function setProgress(msg){var el=document.getElementById('bn-dl-progress');if(el)el.textContent=msg;}
    function triggerDownload(dataUrl,filename){var a=document.createElement('a');a.href=dataUrl;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(function(){a.remove();},1000);}

    /* ── iframe ready 推送 ── */
    var origOnReady=window._bnOnIframeReady;
    window._bnOnIframeReady=function(id){
      if(origOnReady)origOnReady(id);
      setTimeout(function(){
        if(window._bnLogos&&window._bnLogos.length){
          broadcastTo(id,{type:'bn-logos',logos:window._bnLogos});
        } else if(window._bnLogoDataUrl){
          broadcastTo(id,{type:'bn-logo',dataUrl:window._bnLogoDataUrl});
        }
        /* 先送 product-add，再送 zorder
           ★ 關鍵修正：這裡原本沒有帶 userMoved/百分比座標，導致「使用者
           手動調整過位置」的商品，在這個新 iframe 就緒時，會被這條路徑
           用預設位置重新覆蓋回去——而且是在 _bnRebroadcastProducts()
           正確定位「之後」才觸發（因為要等這個特定 iframe 自己回報
           bn-iframe-ready，時間點通常比整批重播還晚），所以看起來就像
           「暫存還原後怎麼調都調不回來、永遠是預設位置」。
           修法：跟 _bnRebroadcastProducts() 用同一套規則——只有
           p.userMoved 為真時才附上百分比座標，讓 layout-runtime.js
           收到後用 applyManualProductPositions() 覆寫回正確位置。*/
        /* ★ per-版位修正(攤平主凶):此補播在 iframe ready 才觸發,時間點晚於整批重播,
           原本補的是「頂層值」(=最後一次任何版位的操作)→ 把 per-版位重播的正確結果蓋掉
           → 有動到的被同步攤平到所有版位。改用共用 builder:此 iframe(版位 id)只拿自己的 layout。 */
        window._bnProducts.forEach(function(p,idx){ broadcastTo(id, _bnBuildProdAddMsg(p, idx, id)); });
        if(window._bnPersons&&window._bnPersons.length){broadcastTo(id,{type:'bn-persons',persons:_bnBuildPersonsPayload(id)});}
        /* 每個 iframe 都有自己獨立的 ShadowPlugin 實例，光源角度要單獨補送 */
        broadcastTo(id,{type:'bn-shadow-angle',preset:window._bnShadowAngle||'left'});
        setTimeout(function(){
          var order=window._bnProducts.slice().sort(function(a,b){return (a.zOrder||0)-(b.zOrder||0);}).map(function(p){return p.id;});
          broadcastTo(id,{type:'bn-product-zorder',order:order});
        },100);
      },200);
    };

    /* ══ per-版位 payload builder(共用):ready 補播 / 暫存重播 / 還原重播 一律走這裡 ══
       語義:物件「有 layouts 維度」時,某版位無記錄=該版位沒動過 → userMoved:false、無 pct、rot 0
       (吃自動排版/預設 slot),【絕不】退回頂層值(頂層=最後一次任何版位的操作,退回=攤平)。
       只有整個物件完全沒有 layouts(舊暫存檔)才退頂層,行為同舊版。 */
    function _bnBuildProdAddMsg(p, idx, lid){
      var hasLayouts = p.layouts && Object.keys(p.layouts).length > 0;
      var L = (hasLayouts && !isNaN(lid)) ? (p.layouts[lid] || null) : null;
      var um, rot, ss, ca, pct;
      if (hasLayouts) {
        um  = L ? !!L.userMoved : false;
        rot = (L && typeof L.rot === 'number') ? L.rot : 0;
        /* ★ 2026-08 修正(規格文件 Bug 1.2「JSON 重載後商品尺寸自動還原預設」的根因):
           這裡原本是 `: 1` —— 寫死退回 1,既不取 per-版位值、也不取頂層值。
           症狀:只要商品在「任何一個版位」被拖過(於是 p.layouts 產生、hasLayouts 變真),
           其餘「沒被拖過」的版位在重播時就拿不到 layouts[該版位],尺寸一律被打成 1,
           而不是它原本的自動配圖比例(sizeRatios[i],常見 0.72)。
           因為只有重播路徑會重算 payload(暫存重載 / Undo / iframe re-ready),
           編輯當下 iframe 的 DOM 還是舊值,所以現象才會是「預覽正常、重載才跑掉」。

           退回頂層是安全的:sizeScale 全程沒有任何 per-版位編輯行為 ——
           layout-runtime.js 只在 bn-product-add 時寫一次 box.dataset.sizeScale(:567),
           之後回報位置時原封echo 回來(:1977/:2191),從不修改它;
           使用者調大小走的是 widthPct/heightPct(那才是真正 per-版位、且本來就不該退回)。
           故 L.sizeScale 與 p.sizeScale 恆等,退回頂層不會造成跨版位「攤平」。
           同檔下方的 zOrder(見本函式 return 區)本來就是這樣寫,這裡屬漏改。 */
        ss  = (L && typeof L.sizeScale === 'number') ? L.sizeScale
            : (typeof p.sizeScale === 'number' ? p.sizeScale : 1);
        ca  = L ? !!L.coeditApplied : false;
        pct = (um && L) ? L : null;
      } else {
        um  = !!p.userMoved; rot = p.rot || 0; ss = p.sizeScale || 1;
        ca  = !!p.coeditApplied; pct = um ? p : null;
      }
      return {type:'bn-product-add', id:p.id, src:p.src, ratio:p.ratio,
        name:p.name, index:idx, position:p.position||0,
        sizeScale: ss, rot: rot, userMoved: um, coeditApplied: ca,
        zOrder: (L && typeof L.zOrder === 'number') ? L.zOrder : (p.zOrder||0),
        /* 陰影縮放微調:刻意不走 per-版位 layouts 覆寫(單一商品全排版共用同一個值),
           跟 rot/位置那些「每個版位各自記」的欄位不同,不需要疊加 4 檔案協定的複雜度。 */
        shadowScaleX: (typeof p.shadowScaleX === 'number') ? p.shadowScaleX : 1,
        shadowScaleY: (typeof p.shadowScaleY === 'number') ? p.shadowScaleY : 1,
        leftPct:   pct ? pct.leftPct   : undefined,
        topPct:    pct ? pct.topPct    : undefined,
        widthPct:  pct ? pct.widthPct  : undefined,
        heightPct: pct ? pct.heightPct : undefined};
    }
    function _bnBuildPersonsPayload(lid){
      return (window._bnPersons||[]).map(function(p){
        var hasLayouts = p.layouts && Object.keys(p.layouts).length > 0;
        var L = (hasLayouts && !isNaN(lid)) ? (p.layouts[lid] || null) : null;
        var um, rot, ca, pct;
        if (hasLayouts) {
          um  = L ? !!L.userMoved : false;
          rot = (L && typeof L.rot === 'number') ? L.rot : 0;
          ca  = L ? !!L.coeditApplied : false;
          pct = (um && L) ? L : null;
        } else {
          um  = !!p.userMoved; rot = p.rot || 0; ca = !!p.coeditApplied; pct = um ? p : null;
        }
        var out = { id:p.id, src:p.src, ratio:p.ratio,
          zOrder: (L && typeof L.zOrder === 'number') ? L.zOrder : (p.zOrder||0),
          userMoved: um, coeditApplied: ca, rot: rot };
        if (pct) {
          out.leftPct = pct.leftPct; out.topPct = pct.topPct;
          out.widthPct = pct.widthPct; out.heightPct = pct.heightPct;
        }
        return out;
      });
    }

    /* ── init ── */
    function init(){
      if(document.getElementById('sidebar-scroll')){insertLogoUI();insertPersonUI();insertProductUI();insertDownloadBar();}
      else setTimeout(init,200);
    }
    init();

   /* ════════════════════════════════════════════════════════════════════════
       暴露給 bn-state-plugin 使用 (已手工補入 Undo 歷史快照防禦機制)
       ════════════════════════════════════════════════════════════════════════ */
    window._bnRenderLogoList = function(){ 
      renderLogoList(); 
      // 廠商 Logo 變更（上傳/刪除/改圓邊）完成後，立即觸發歷史快照
      if (window._bnPushHistoryState) window._bnPushHistoryState(true);
    };

    window._bnBroadcastLogos = function(){
      if(window._bnLogos && window._bnLogos.length){
        broadcast({type:'bn-logos', logos:window._bnLogos});
      }
    };

    window._bnRenderProdList = function(){ 
      renderProdList(); 
      // 商品圖片變更（上傳/刪除/改排序）完成後，立即觸發歷史快照
      if (window._bnPushHistoryState) window._bnPushHistoryState(true);
    };

    window._bnRenderPersonList = function(){ 
      renderPersonList(); 
      // 人物圖片變更（上傳/刪除/改層序）完成後，立即觸發歷史快照
      if (window._bnPushHistoryState) window._bnPushHistoryState(true);
    };

    window._bnSyncLogoWhiteBg = function(){
      var wbToggle = document.getElementById('bn-logo-whitebg-toggle');
      var wbKnob   = document.getElementById('bn-logo-whitebg-knob');
      if(!wbToggle||!wbKnob) return;
      var on = window._bnLogoWhiteBg;
      wbToggle.style.background = on ? 'var(--accent,#ee4d2d)' : 'var(--bg3,#333333)';
      wbToggle.style.borderColor = on ? 'var(--accent,#ee4d2d)' : 'var(--border,#3d3d3d)';
      wbKnob.style.transform = on ? 'translateX(16px)' : 'translateX(0)';
      wbKnob.style.background = on ? '#fff' : 'var(--text3,#666666)';
    };

    window._bnBroadcastPerson = function(){
      /* ★ per-版位重播(同商品):每個 iframe 取「自己版位」的人物 layout(p.layouts[lid]),
         沒有才退回頂層欄位。修「所有版位人物吃同一來源」。 */
      var frames = document.querySelectorAll('.preview-block iframe');
      Array.prototype.forEach.call(frames, function(f){
        var lid = parseInt(String(f.id||'').replace('iframe-',''), 10);
        try { f.contentWindow.postMessage({type:'bn-persons', persons:_bnBuildPersonsPayload(lid)}, '*'); } catch(e){}
      });
    };

    window._bnRebroadcastProducts = function(){
      /* ★ 先移除 iframe 內「已不在清單」的殘留 box(帶 keep 清單:保留有效 box、不全清重建,避免 Undo 抖動);
         有效 box 交給下方 bn-product-add 就地更新。 */
      broadcast({type:'bn-product-remove', id:'__all__', keep: (window._bnProducts||[]).map(function(p){ return p.id; })});
      var reordered = (window._bnProducts||[]).slice().sort(function(a,b){
        return (a.position||0)-(b.position||0);
      });
      setTimeout(function(){
        /* ★ per-版位重播:每個 iframe 取「自己版位」的 layout(p.layouts[lid]),沒有才退回頂層欄位。
           修「上傳暫存後所有版位吃同一來源」——例:只轉 FB 的商品1,重播後只有 FB 帶那個旋轉。 */
        var frames = document.querySelectorAll('.preview-block iframe');
        reordered.forEach(function(p, idx){
          Array.prototype.forEach.call(frames, function(f){
            var lid = parseInt(String(f.id||'').replace('iframe-',''), 10);
            try { f.contentWindow.postMessage(_bnBuildProdAddMsg(p, idx, lid), '*'); } catch(e){}
          });
        });
        /* z-index */
        var order = (window._bnProducts||[]).slice().sort(function(a,b){
          return (a.zOrder||0)-(b.zOrder||0);
        }).map(function(p){ return p.id; });
        /* ★ 訊息名修正:全專案沒有任何地方監聽 'bn-product-order',
           iframe 端的 handler 是 'bn-product-zorder'(layout-runtime.js) → 這行原本是空包彈,
           暫存還原/Undo 重播後 z-index 不會被還原。連帶影響陰影:
           _bnRedrawShadowScene() 是依 z-index 由小到大排序決定遮擋順序的。
           payload 的組法(上方 sort/map)與 broadcastZOrder() 逐字相同,改名即等價,無反轉風險。 */
        broadcast({type:'bn-product-zorder', order:order});
        /* 每個 iframe 有自己獨立的 ShadowPlugin 實例，還原/重播時要重新告知光源角度 */
        broadcast({type:'bn-shadow-angle', preset: window._bnShadowAngle||'left'});

        /* ★ 改用 saveHistory()(去抖動+去重+還原中抑制):原本 _bnPushHistoryState(true) 是 force、
           繞過去重,還原時(+200ms、還原鎖已在 100ms 解除)會塞一筆幽靈歷史 → 破壞 undo/redo、
           連帶讓共編套用後的狀態被污染而「跑掉」。改一般 saveHistory 後,還原時狀態與剛還原者相同
           會被去重略過,不再污染。 */
        if (typeof saveHistory === 'function') saveHistory();
      }, 200);
    };

    /* 光源角度(左/中/右)：全域設定，供 bn.html 還原 Undo/暫存狀態後呼叫，
       重新告知每個 iframe 各自獨立的 ShadowPlugin 實例。 */
    window._bnBroadcastShadowAngle = function(){
      broadcast({type:'bn-shadow-angle', preset: window._bnShadowAngle||'left'});
      _syncShadowAngleBtns();
    };
  });
})();
