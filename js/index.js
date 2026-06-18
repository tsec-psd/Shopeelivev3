/* ══════════════════════════════════════
   js/index.js
   ★ 排版清單，BN編輯器從這裡讀取版位
   ★ 新增版位：在陣列加入 html 檔名即可
══════════════════════════════════════ */
var BN_LAYOUTS = [
  "FB_POST.html",
  "直播大廳LPBN_有CTA.html",
  "直播時縮圖.html",
  "IG.html",
  "開播字卡_直式.html",
];

/* ★ 這行不要刪 */
if (typeof window._bn_scan_cb === 'function') window._bn_scan_cb(BN_LAYOUTS);
