/* ══════════════════════════════════════════════════════════════
   rotate-plugin.js
   ★ 商品圖 / 人物圖「角落旋轉把手」功能（iframe 端外掛，掛在各版位 HTML）
   ★ 核心：旋轉解耦 —— 只旋轉 box 內層的 <img>，絕不旋轉外層 box。
       這樣 layout-runtime.js 的 setupProdDrag 全程用的
       box.getBoundingClientRect()（軸對齊 AABB）完全不受影響，
       拖移 / 縮放 / 邊界夾擠 / 曝品自動排版數學一律不用改。
   ★ 載入順序：必須排在 layout-runtime.js 之後：
       <script src="../js/layout-runtime.js"></script>
       <script src="../js/rotate-plugin.js"></script>
   ★ 適用於 .bn-prod-box（商品）與 .bn-person-box（人物）。
   字體規範：本外掛不渲染任何文字，故不觸發 ShopeeNotoSans 預載鐵律
            （比照 polaroid-plugin 的說明）。
══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var BOX_SELECTOR = '.bn-prod-box, .bn-person-box';
  var SNAP_DEG = 15;      /* 按住 Shift 時的吸附角度 */
  var HANDLE_ID_ATTR = 'data-rot-handle';

  /* ── 角度工具 ─────────────────────────────────────────── */
  function normalize(deg) {
    /* 收斂到 (-180, 180]，避免數字無限累積 */
    deg = deg % 360;
    if (deg > 180) deg -= 360;
    if (deg <= -180) deg += 360;
    return deg;
  }
  function getRot(box) {
    var v = parseFloat(box.dataset.rot);
    return isNaN(v) ? 0 : v;
  }
  function applyRot(box, deg) {
    box.dataset.rot = String(deg);
    var img = box.querySelector('img');
    if (!img) return; /* 防呆：box 尚未有圖或結構異常 → 靜默略過 */
    img.style.transformOrigin = 'center center';
    /* 只轉 img；外層 box 維持軸對齊。translateZ(0) 促成 GPU 合成、邊緣更平滑 */
    img.style.transform = 'rotate(' + deg + 'deg) translateZ(0)';
  }

  /* ── 把旋轉狀態回報父層（供未來持久化；父層未接也不會出錯）──── */
  function emitChange(box) {
    if (global.parent === global) return; /* 非 iframe 情境直接跳過 */
    var id = box.dataset.id;
    if (!id) return;
    global.parent.postMessage({
      type: 'bn-rot-change',
      id: id,
      isPerson: box.classList.contains('bn-person-box'),
      rot: getRot(box)
    }, '*');
  }

  /* ── 樣式（旋轉把手 + 連接桿）──────────────────────────── */
  function injectCSS() {
    if (document.getElementById('rotate-plugin-style')) return;
    var s = document.createElement('style');
    s.id = 'rotate-plugin-style';
    s.textContent = [
      '.bn-rot-handle{position:absolute;left:50%;top:-30px;transform:translateX(-50%);',
      '  width:16px;height:16px;border-radius:50%;background:#22c55e;border:2px solid #fff;',
      '  box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:grab;z-index:40;display:none;',
      '  touch-action:none;}',
      '.bn-rot-handle:active{cursor:grabbing;}',
      '.bn-rot-handle::before{content:"";position:absolute;left:50%;top:14px;',
      '  width:2px;height:16px;background:#22c55e;transform:translateX(-50%);pointer-events:none;}',
      /* 拖曳中即時角度標籤 */
      '.bn-rot-badge{position:absolute;left:50%;top:-54px;transform:translateX(-50%);',
      '  background:rgba(13,16,24,.92);color:#fff;font-size:11px;font-weight:700;',
      '  padding:2px 7px;border-radius:6px;white-space:nowrap;z-index:41;display:none;',
      '  font-family:system-ui,sans-serif;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── 顯示/隱藏把手（單選：一次只有一個 box 顯示旋轉把手）──── */
  function hideAllHandles(except) {
    document.querySelectorAll('.bn-rot-handle').forEach(function (h) {
      if (h.parentNode !== except) h.style.display = 'none';
    });
  }
  function showHandle(box) {
    var h = box.querySelector('.bn-rot-handle');
    if (h) h.style.display = 'block';
  }

  /* ── 幫單一 box 掛上旋轉把手 + 拖曳邏輯 ───────────────────── */
  function attach(box) {
    if (box.dataset.rotBound === '1') return; /* 冪等：避免重複綁定 */
    box.dataset.rotBound = '1';

    /* 若父層還原時已帶入角度（未來持久化用），建立當下先套用一次 */
    if (box.dataset.rot !== undefined) applyRot(box, getRot(box));

    var handle = document.createElement('div');
    handle.className = 'bn-rot-handle';
    handle.setAttribute(HANDLE_ID_ATTR, '1');
    /* ★ 轉存修正：標記 data-no-capture，讓 layout-runtime.js 的 html2canvas
       ignoreElements 在截圖時自動排除整根旋轉把手（含綠色連接桿 ::before
       與角度標籤 .bn-rot-badge 子節點），避免綠色拖曳桿被一起烘進匯出圖。
       沿用既有慣例（同角落把手的 data-corner），不需改動截圖端邏輯。 */
    handle.setAttribute('data-no-capture', 'true');
    var badge = document.createElement('div');
    badge.className = 'bn-rot-badge';
    handle.appendChild(badge);
    box.appendChild(handle);

    /* 選中 box 時（比照 corner handle 的觸發時機）顯示旋轉把手 */
    box.addEventListener('pointerdown', function () {
      hideAllHandles(box);
      showHandle(box);
    });

    var drag = null;
    function centerOf(el) {
      var r = el.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }

    /* ★ 關鍵：把手是 box 的子節點，pointerdown 會冒泡到 box → 觸發 setupProdDrag 的
       移動拖曳。必須 stopPropagation（含 immediate）截斷，旋轉與移動才不會打架。 */
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var c = centerOf(box);
      var startAngle = Math.atan2(e.clientY - c.cy, e.clientX - c.cx) * 180 / Math.PI;
      drag = { baseRot: getRot(box), startAngle: startAngle, cx: c.cx, cy: c.cy };
      handle.setPointerCapture(e.pointerId);
      badge.style.display = 'block';
      box.style.outline = '2px solid #22c55e'; /* 旋轉中的視覺提示 */
    });

    handle.addEventListener('pointermove', function (e) {
      if (!drag) return;
      e.preventDefault();
      var cur = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180 / Math.PI;
      var next = normalize(drag.baseRot + (cur - drag.startAngle));
      if (e.shiftKey) next = Math.round(next / SNAP_DEG) * SNAP_DEG; /* Shift 吸附 15° */
      applyRot(box, next);
      badge.textContent = Math.round(next) + '°';
    });

    function endDrag(e) {
      if (!drag) return;
      drag = null;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      badge.style.display = 'none';
      box.style.outline = '2px solid transparent';
      emitChange(box);
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    /* 雙擊把手 → 歸零（快速取消旋轉）*/
    handle.addEventListener('dblclick', function (e) {
      e.preventDefault(); e.stopPropagation();
      applyRot(box, 0);
      emitChange(box);
    });
  }

  /* ── 監控 box 建立 / 圖片更新 ───────────────────────────── */
  function scanExisting() {
    document.querySelectorAll(BOX_SELECTOR).forEach(attach);
  }

  function initObserver() {
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        /* 新增節點：可能是新 box */
        m.addedNodes && m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches(BOX_SELECTOR)) attach(node);
          if (node.querySelectorAll) node.querySelectorAll(BOX_SELECTOR).forEach(attach);
          /* ★ 就地更新（bn-product-update / 人物 src 更新）若替換了 <img>，
             會清掉先前套在舊 img 上的 transform → 對所屬 box 重新套一次旋轉。*/
          if (node.tagName === 'IMG') {
            var host = node.closest && node.closest(BOX_SELECTOR);
            if (host && host.dataset.rot !== undefined) applyRot(host, getRot(host));
          }
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return mo;
  }

  /* ── 點空白處收起所有旋轉把手（與 corner handle 不同步，屬單選 UX）─ */
  function initDeselect() {
    document.addEventListener('pointerdown', function (e) {
      if (e.target.closest && (e.target.closest(BOX_SELECTOR) || e.target.closest('.bn-rot-handle'))) return;
      hideAllHandles(null);
    }, true);
  }

  function init() {
    injectCSS();
    scanExisting();
    initObserver();
    initDeselect();
  }

  /* 對外接口（供除錯或程式化控制）*/
  global.RotatePlugin = {
    init: init,
    attach: attach,
    setRotation: function (id, deg) {
      /* 分組選擇器無法安全套用屬性過濾（屬性只作用於最後一段），故逐一比對 */
      var box = null;
      document.querySelectorAll(BOX_SELECTOR).forEach(function (b) { if (b.dataset.id === id) box = b; });
      if (box) { applyRot(box, normalize(deg)); emitChange(box); }
    },
    getRotation: function (id) {
      var box = null;
      document.querySelectorAll(BOX_SELECTOR).forEach(function (b) { if (b.dataset.id === id) box = b; });
      return box ? getRot(box) : 0;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
