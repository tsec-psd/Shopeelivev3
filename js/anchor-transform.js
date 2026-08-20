/* ============================================================================
 * anchor-transform.js — 共用「錨點縮放 + 旋轉」互動模組
 * ----------------------------------------------------------------------------
 * 目的:讓共編介面(coedit-plugin)與外面畫布(layout-runtime,未來遷入)共用同一套
 *   錨點操作,根治「兩套操作分叉」。模組只管覆蓋層與拖曳幾何,透過 callback 讀寫,
 *   不直接碰任何資料模型,故可同時服務 JS 物件模型與 DOM box。
 *
 * 用法:
 *   var at = AnchorTransform.create(hostEl);           // host 需 position:relative/absolute
 *   at.show({x,y,w,h}, {                               // bbox 相對 host(px)
 *     onStart:  function(){},                          // 拖曳開始:呼叫方存起始狀態
 *     onResize: function(factor,ax,ay){},              // 等比、對角固定;factor=倍率,ax/ay=固定對角(host px)
 *     onRotate: function(totalDeg){},                  // totalDeg=相對起始的累積角度(繞中心)
 *     onEnd:    function(){}
 *   });
 *   at.reposition({x,y,w,h});                          // 幾何變動後更新覆蓋層位置
 *   at.hide();
 *
 * 語意:四角 handle 拖曳=繞 bbox 中心等比縮放;頂部把手=繞中心旋轉。
 *   (與外面畫布四角錨點視覺一致;縮放語意於 layout-runtime 遷入時以本模組為準統一)
 * ========================================================================== */
(function (global) {
  'use strict';

  function create(host) {
    if (!host) return null;

    var layer = document.createElement('div');
    layer.dataset.noCapture = 'true';   /* ★ 轉存(html2canvas)排除此層:不把把手/框烤進輸出圖 */
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;z-index:9999';

    var frame = document.createElement('div');
    frame.style.cssText = 'position:absolute;border:1px solid #FFC107;pointer-events:none';
    layer.appendChild(frame);

    var corners = ['nw', 'ne', 'sw', 'se'], handles = {};
    corners.forEach(function (c) {
      var h = document.createElement('div');
      h.style.cssText =
        'position:absolute;width:12px;height:12px;margin:-6px;background:#FFC107;border:1px solid #fff;' +
        'border-radius:2px;pointer-events:auto;touch-action:none;cursor:' +
        (c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize');
      handles[c] = h; layer.appendChild(h);
    });

    var rotH = document.createElement('div');
    rotH.style.cssText =
      'position:absolute;width:14px;height:14px;margin:-7px;background:#fff;border:2px solid #FFC107;' +
      'border-radius:50%;pointer-events:auto;touch-action:none;cursor:grab';
    layer.appendChild(rotH);

    host.appendChild(layer);

    var cur = null, cbs = null;

    function place(b) {
      cur = b;
      frame.style.left = b.x + 'px'; frame.style.top = b.y + 'px';
      frame.style.width = b.w + 'px'; frame.style.height = b.h + 'px';
      handles.nw.style.left = b.x + 'px';         handles.nw.style.top = b.y + 'px';
      handles.ne.style.left = (b.x + b.w) + 'px'; handles.ne.style.top = b.y + 'px';
      handles.sw.style.left = b.x + 'px';         handles.sw.style.top = (b.y + b.h) + 'px';
      handles.se.style.left = (b.x + b.w) + 'px'; handles.se.style.top = (b.y + b.h) + 'px';
      /* ★ 旋轉把手放「框外」才點得到:框上方有空間→放上方 22px;空間不足(群組貼上緣)→放框下方 10px。 */
      var _rGap = 22;
      var _ry = (b.y >= _rGap + 6) ? (b.y - _rGap) : (b.y + b.h + 10);
      rotH.style.left = (b.x + b.w / 2) + 'px';   rotH.style.top = _ry + 'px';
    }
    function show(b, callbacks) { cbs = callbacks || {}; place(b); layer.style.display = 'block'; }
    function hide() { layer.style.display = 'none'; cur = null; cbs = null; }
    function centerScreen() {
      var r = host.getBoundingClientRect();
      return { x: r.left + cur.x + cur.w / 2, y: r.top + cur.y + cur.h / 2 };
    }

    /* 縮放:四角拖曳 → 等比、對角固定(拖某角,對角不動)→ onResize(factor, 固定對角 px) */
    corners.forEach(function (c) {
      handles[c].addEventListener('pointerdown', function (e) {
        if (!cur) return;
        e.preventDefault(); e.stopPropagation();
        var hr = host.getBoundingClientRect();
        /* 固定對角(相對 host):與外面畫布 handle 同語意 */
        var ax = (c === 'se' || c === 'ne') ? cur.x : cur.x + cur.w;
        var ay = (c === 'se' || c === 'sw') ? cur.y : cur.y + cur.h;
        /* 拖曳角起始(相對 host) */
        var startX = (c === 'se' || c === 'ne') ? cur.x + cur.w : cur.x;
        var startY = (c === 'se' || c === 'sw') ? cur.y + cur.h : cur.y;
        var d0 = Math.hypot(startX - ax, startY - ay) || 1;
        if (cbs && cbs.onStart) cbs.onStart();
        function mv(ev) {
          var mx = ev.clientX - hr.left, my = ev.clientY - hr.top;
          var factor = Math.max(0.1, Math.hypot(mx - ax, my - ay) / d0);
          if (cbs && cbs.onResize) cbs.onResize(factor, ax, ay);
        }
        function up() {
          document.removeEventListener('pointermove', mv);
          document.removeEventListener('pointerup', up);
          if (cbs && cbs.onEnd) cbs.onEnd();
        }
        document.addEventListener('pointermove', mv);
        document.addEventListener('pointerup', up);
      });
    });

    /* 旋轉:把手拖曳 → 相對起始的累積角度 → onRotate(totalDeg) */
    rotH.addEventListener('pointerdown', function (e) {
      if (!cur) return;
      e.preventDefault(); e.stopPropagation();
      var ctr = centerScreen();
      var a0 = Math.atan2(e.clientY - ctr.y, e.clientX - ctr.x);
      if (cbs && cbs.onStart) cbs.onStart();
      function mv(ev) {
        var a = Math.atan2(ev.clientY - ctr.y, ev.clientX - ctr.x);
        var deg = (a - a0) * 180 / Math.PI;
        if (cbs && cbs.onRotate) cbs.onRotate(deg);
      }
      function up() {
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', up);
        if (cbs && cbs.onEnd) cbs.onEnd();
      }
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
    });

    return { show: show, hide: hide, reposition: place };
  }

  global.AnchorTransform = { create: create };

})(window);
