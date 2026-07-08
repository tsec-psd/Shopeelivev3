/*!
 * bn-positions.js  —  蝦導播 版位座標「單一權威來源」
 * ────────────────────────────────────────────────────────────
 * 結構： BN_POSITIONS[版位檔名(去副檔名)][模式][構圖] = { persons, prods }
 *   模式： 'normal' = 公版 ／ 'sbd' = SBD
 *   構圖名稱需與 COMPOSE_PRESETS 的 preset.name 完全一致
 *
 * 座標格式（中心點制，皆為「掛載容器寬高」的百分比）：
 *   person: { x=左緣%, bottom=距底部%, h=高度% }
 *   prod  : { x=中心水平%, y=中心垂直%, h=最大高度%, bw=最大寬度%, z=層級 }
 *   ★ SBD 模式的 prod 座標，容器是白框(.bn-kv-frame)，故 % 以白框計。
 *
 * 維護方式：
 *   1) 小修：直接改下面數字。
 *   2) 大改：畫布上拖到滿意 → 下載暫存 → 丟進 bn-positions-converter.html
 *            轉出對應 [版位][模式][構圖] 區塊貼回這裡。
 *
 * 註：以下初始值＝遷移自舊 COMPOSE_PRESETS 的「當下解析結果」。
 *     曾經靠 fallback（SBD 借公版／套 vertical／套 base）補上的格子，
 *     數值先給合理起點，請依實測畫面微調。
 * ────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';
  global.BN_POSITIONS = {
    "FB_POST": {
      normal: {
        "1人2品": { persons: [{ x:0, bottom:0, h:80 }], prods: [{ x:65, y:30, h:50, bw:44, z:10 }, { x:88, y:50, h:37, bw:26, z:14 }] },
        "2人": { persons: [{ x:0, bottom:-1, h:82 }, { x:39, bottom:-1, h:82 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:67 }, { x:26, bottom:0, h:67 }], prods: [{ x:77, y:30, h:23, bw:25, z:10 }, { x:88, y:44, h:23, bw:26, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:0, h:80  }], prods: [{ x:71, y:48, h:61, bw:50, z:10}] }
      },
      sbd: {
        "1人2品": { persons: [{ x:0, bottom:0, h:70 }], prods: [{ x:60, y:30, h:50, bw:44, z:10 }, { x:85, y:60, h:45, bw:26, z:14 }] },
        "2人": { persons: [{ x:20, bottom:0, h:95 }, { x:42, bottom:0, h:95 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:-20, h:90 }, { x:25, bottom:-20, h:90 }], prods: [{ x:65, y:30, h:30, bw:44, z:10 }, { x:88, y:50, h:25, bw:26, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:-5, h:76 }], prods: [{ x:72, y:48, h:61, bw:50, z:10 }] }
      }
    },
    "IG": {
      normal: {
        "1人2品": { persons: [{ x:5, bottom:0, h:95 }], prods: [{ x:65, y:20, h:37, bw:44, z:10 }, { x:90, y:30, h:35, bw:26, z:14 }] },
        "2人": { persons: [{  x:0, bottom:0, h:95 }, { x:35, bottom:0, h:95 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:78 }, { x:25, bottom:-1, h:78 }], prods: [{ x:73, y:22, h:25, bw:26, z:10 }, { x:88, y:36, h:26, bw:26, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:-1, h:90 }], prods: [{ x:77, y:23, h:40, bw:41, z:10 }] }
      },
      sbd: {
        "1人2品": { persons: [{ x:0, bottom:-1, h:77 }], prods: [{ x:47, y:32, h:50, bw:42, z:10 }, { x:74, y:64, h:56, bw:46, z:14 }] },
        "2人": { persons: [{ x:5, bottom:0, h:95 }, { x:15, bottom:0, h:95 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:90 }, { x:30, bottom:0, h:90 }], prods: [{ x:70, y:25, h:28, bw:44, z:10 }, { x:90, y:40, h:25, bw:26, z:14 }] },
        "1人1品": { persons: [{  x:0, bottom:-1, h:77 }], prods: [{ x:61, y:49, h:72, bw:60, z:10 }] }
      }
    },
    "直播大廳LPBN_有CTA": {
      normal: {
        "1人2品": { persons: [{ x:0, bottom:0, h:95 }], prods: [{ x:65, y:40, h:62, bw:44, z:10 }, { x:88, y:60, h:37, bw:26, z:14 }] },
        "2人": { persons: [{ x:0, bottom:-20, h:120 }, { x:40, bottom:-20, h:120 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:-1, h:84 }, { x:26, bottom:-1, h:84 }], prods: [{ x:76, y:31, h:38, bw:26, z:10 }, { x:88, y:51, h:38, bw:26, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:-32, h:129 }], prods: [{ x:76, y:32, h:57, bw:40, z:10 }] }
      },
      sbd: {
        "1人2品": { persons: [{ x:0, bottom:0, h:95 }], prods: [{ x:50, y:40, h:60, bw:44, z:10 }, { x:75, y:70, h:50, bw:26, z:14 }] },
        "2人": { persons: [{ x:20, bottom:0, h:95 }, { x:42, bottom:0, h:95 }], prods: [] },
        "2人2品": { persons: [{ x:5, bottom:0, h:90 }, { x:25, bottom:0, h:90 }], prods: [{ x:65, y:30, h:50, bw:44, z:10 }, { x:88, y:50, h:37, bw:26, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:-32, h:129 }], prods: [{ x:72, y:54, h:73, bw:42, z:10 }] }
      }
    },
    "直播時縮圖": {
      normal: {
        "1人2品": { persons: [{ x:5, bottom:0, h:95 }], prods: [{ x:65, y:20, h:37, bw:44, z:10 }, { x:90, y:30, h:35, bw:26, z:14 }] },
        "2人": { persons: [{  x:0, bottom:-4, h:103 }, { x:36, bottom:-3, h:103 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:90 }, { x:25, bottom:0, h:90 }], prods: [{ x:80, y:20, h:24, bw:22, z:10 }, { x:91, y:33, h:23, bw:21, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:-6, h:106 }], prods: [{  x:78, y:23, h:41, bw:37, z:10 }] }
      },
      sbd: {
        "1人2品": { persons: [{ x:0, bottom:-2, h:95 }], prods: [{ x:60, y:31, h:43, bw:32, z:10 }, { x:80, y:62, h:44, bw:33, z:14 }] },
        "2人": { persons: [{ x:5, bottom:0, h:95 }, { x:15, bottom:0, h:95 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:90 }, { x:30, bottom:0, h:90 }], prods: [{ x:70, y:25, h:28, bw:44, z:10 }, { x:90, y:40, h:25, bw:26, z:14 }] },
        "1人1品": { persons: [{ x:0, bottom:-2, h:95 }], prods: [{ x:72, y:51, h:58, bw:43, z:10 }] }
      }
    },
    "開播字卡_直式": {
      normal: {
        "1人2品": { persons: [{ x:5, bottom:0, h:95 }], prods: [{ x:65, y:20, h:37, bw:44, z:10 }, { x:90, y:30, h:35, bw:26, z:14 }] },
        "2人": { persons: [{ x:0, bottom:-8, h:103 }, { x:38, bottom:-8, h:103 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:84 }, {  x:25, bottom:0, h:84 }], prods: [{ x:75, y:17, h:29, bw:26, z:10 }, { x:88, y:35, h:29, bw:27, z:14 }] },
        "1人1品": { persons: [{  x:0, bottom:-9, h:103 }], prods: [{ x:76, y:25, h:43, bw:39, z:10 }] }
      },
      sbd: {
        "1人2品": { persons: [{ x:0, bottom:-3, h:78 }], prods: [{ x:48, y:33, h:47, bw:39, z:10 }, { x:75, y:58, h:52, bw:43, z:14 }] },
        "2人": { persons: [{ x:5, bottom:0, h:95 }, { x:15, bottom:0, h:95 }], prods: [] },
        "2人2品": { persons: [{ x:0, bottom:0, h:90 }, { x:30, bottom:0, h:90 }], prods: [{ x:70, y:25, h:28, bw:44, z:10 }, { x:90, y:40, h:25, bw:26, z:14 }] },
        "1人1品": { persons: [{  x:0, bottom:-3, h:78 }], prods: [{ x:64, y:52, h:67, bw:56, z:10 }] }
      }
    }
  };

  /* 全域最終保底：當某版位不在上表（例如日後新增版位、或構圖名對不上）時，
     buildComposePayload 會退回 COMPOSE_PRESETS 的 vertical/base，這裡不需重複定義。
     單純作為對外旗標，方便 debug 確認此檔已載入。 */
  global.BN_POSITIONS_READY = true;
})(window);