/**
 * 安心远助 · Cloudflare Workers 版中心信令 + 媒体转发
 *
 * 与 server/index.js 协议完全一致，控制端页面 / 老人端 App 无需改动：
 *  - HTTP:  GET  /health
 *           POST /api/token        { ownerId } -> { token }
 *           GET  /api/devices?ownerId=&token=
 *  - WS:    /ws   register_bound / auth / watch / unwatch / command / command_ack
 *           二进制帧 = H.264，只转发给正在观看该设备的人
 *
 * 状态放在单个 Durable Object（Hub）里，全局一个实例即可。
 * 用 WebSocket Hibernation API，空闲连接不占 duration 计费，免费额度绰绰有余。
 */
const controlHtml = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\" />\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\" />\n<meta name=\"theme-color\" content=\"#070b16\" />\n<title>\u5b89\u5fc3\u8fdc\u52a9 \u00b7 \u63a7\u5236\u7aef</title>\n<style>\n  :root{\n    --bg:#070b16; --bg2:#0c1324;\n    --surface:rgba(19,28,49,.78); --surface-solid:#111a2e; --surface-hi:#17233d;\n    --border:rgba(122,152,214,.16); --border-hi:rgba(110,150,255,.42);\n    --text:#eaf1ff; --muted:#8fa3c8; --dim:#61739a;\n    --accent:#5b8cff; --accent2:#38e0d0; --grad:linear-gradient(135deg,#5b8cff 0%,#38e0d0 100%);\n    --danger:#ff5f72; --success:#3ddc97; --amber:#ffb648;\n    --shadow:0 24px 70px rgba(0,0,0,.5);\n  }\n  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\n  html,body{margin:0;padding:0}\n  body{\n    color:var(--text);min-height:100vh;\n    font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif;\n    background:\n      radial-gradient(900px 500px at 82% -8%,rgba(91,140,255,.20),transparent 62%),\n      radial-gradient(700px 460px at -10% 30%,rgba(56,224,208,.10),transparent 60%),\n      linear-gradient(180deg,var(--bg2),var(--bg) 55%);\n    background-attachment:fixed;\n  }\n  body::before{\n    content:\"\";position:fixed;inset:0;pointer-events:none;opacity:.28;\n    background-image:linear-gradient(rgba(122,152,214,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(122,152,214,.045) 1px,transparent 1px);\n    background-size:42px 42px;mask-image:linear-gradient(180deg,#000,transparent 78%);\n  }\n\n  /* \u9876\u680f */\n  .top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:14px 22px;\n    border-bottom:1px solid var(--border);background:rgba(8,13,25,.72);backdrop-filter:blur(18px) saturate(140%)}\n  .logo{width:38px;height:38px;border-radius:12px;background:var(--grad);display:grid;place-items:center;\n    font-weight:900;font-size:19px;box-shadow:0 6px 22px rgba(91,140,255,.45);position:relative}\n  .logo::after{content:\"\";position:absolute;inset:0;border-radius:12px;background:var(--grad);filter:blur(10px);opacity:.5;z-index:-1}\n  .brand{font-size:17px;font-weight:750;letter-spacing:.4px}\n  .brand small{display:block;font-size:10px;font-weight:500;color:var(--dim);letter-spacing:1.6px;margin-top:1px}\n  .tag{font-size:11px;color:var(--accent2);border:1px solid rgba(56,224,208,.3);background:rgba(56,224,208,.08);\n    padding:4px 10px;border-radius:20px;white-space:nowrap}\n  .status{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);white-space:nowrap}\n  .dot{width:8px;height:8px;border-radius:50%;background:#556;position:relative}\n  .dot.on{background:var(--success);box-shadow:0 0 0 0 rgba(61,220,151,.5);animation:pulse 2s infinite}\n  .dot.off{background:var(--danger)}\n  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(61,220,151,.45)}70%{box-shadow:0 0 0 8px rgba(61,220,151,0)}100%{box-shadow:0 0 0 0 rgba(61,220,151,0)}}\n\n  .wrap{max-width:1240px;margin:0 auto;padding:26px 18px 60px}\n  .card{background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:24px;\n    backdrop-filter:blur(16px);box-shadow:var(--shadow);position:relative;overflow:hidden}\n  .card::before{content:\"\";position:absolute;top:0;left:12%;right:12%;height:1px;\n    background:linear-gradient(90deg,transparent,rgba(160,190,255,.4),transparent)}\n\n  /* \u767b\u5f55 */\n  #login{max-width:470px;margin:7vh auto 0;text-align:center}\n  .login-icon{width:64px;height:64px;border-radius:20px;background:var(--grad);display:grid;place-items:center;\n    margin:4px auto 18px;font-size:30px;box-shadow:0 12px 40px rgba(91,140,255,.5)}\n  #login h1{margin:0 0 8px;font-size:25px;letter-spacing:.5px}\n  #login .lead{margin:0 0 26px;color:var(--muted);font-size:13.5px;line-height:1.75}\n  .field{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;text-align:left}\n  .field label{font-size:12.5px;color:var(--muted);font-weight:600;letter-spacing:.3px}\n  .input-wrap{position:relative}\n  .input-wrap .ico{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:15px;opacity:.7}\n  input{width:100%;padding:13px 14px 13px 42px;border-radius:12px;border:1px solid var(--border);\n    background:rgba(6,11,22,.75);color:var(--text);font-size:15px;outline:none;transition:.2s}\n  input:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(91,140,255,.14)}\n  .btn{border:1px solid var(--border);border-radius:12px;padding:11px 17px;font-size:14px;font-weight:650;\n    cursor:pointer;background:var(--surface-hi);color:var(--text);transition:.18s;display:inline-flex;align-items:center;justify-content:center;gap:7px}\n  .btn:hover{transform:translateY(-2px);border-color:var(--border-hi)}\n  .btn:active{transform:translateY(0)}\n  .btn.primary{background:var(--grad);border-color:transparent;color:#06122b;box-shadow:0 10px 30px rgba(91,140,255,.4)}\n  .btn.primary:hover{box-shadow:0 14px 38px rgba(91,140,255,.6)}\n  .btn.danger{background:rgba(255,95,114,.12);border-color:rgba(255,95,114,.35);color:#ff9aa6}\n  .btn.ghost{background:transparent}\n  .btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}\n  .btn.block{width:100%;padding:14px;font-size:15px}\n  .hint{font-size:11.5px;color:var(--dim);margin-top:12px;line-height:1.7}\n  .divider{height:1px;background:var(--border);margin:22px 0}\n\n  /* \u4e3b\u754c\u9762 */\n  #main{display:none;grid-template-columns:290px 1fr;gap:20px;align-items:start}\n  .panel-title{display:flex;align-items:center;gap:9px;margin:0 0 16px;font-size:15px;font-weight:700}\n  .panel-title .ic{width:26px;height:26px;border-radius:8px;background:rgba(91,140,255,.14);display:grid;place-items:center;font-size:13px}\n  .panel-title .cnt{margin-left:auto;font-size:11px;color:var(--muted);font-weight:500}\n\n  /* \u8bbe\u5907 */\n  .dev-list{display:flex;flex-direction:column;gap:10px}\n  .dev{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--border);border-radius:14px;\n    background:rgba(9,15,29,.6);cursor:pointer;transition:.18s;position:relative;overflow:hidden}\n  .dev:hover{border-color:var(--border-hi);transform:translateX(2px)}\n  .dev.active{border-color:var(--accent);background:linear-gradient(100deg,rgba(91,140,255,.18),rgba(56,224,208,.06))}\n  .dev.active::before{content:\"\";position:absolute;left:0;top:12%;bottom:12%;width:3px;border-radius:3px;background:var(--grad)}\n  .avatar{width:40px;height:40px;border-radius:12px;background:linear-gradient(145deg,#22345c,#162441);\n    display:grid;place-items:center;flex:none;border:1px solid var(--border);font-size:18px}\n  .dev.active .avatar{background:var(--grad);color:#06122b}\n  .dev-info{min-width:0;flex:1}\n  .dev-info b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n  .dev-info small{color:var(--dim);font-size:11px;font-family:ui-monospace,Menlo,monospace}\n  .badge{font-size:10.5px;padding:4px 9px;border-radius:20px;white-space:nowrap;font-weight:600}\n  .badge.on{background:rgba(61,220,151,.13);color:var(--success);display:flex;align-items:center;gap:5px}\n  .badge.on::before{content:\"\";width:6px;height:6px;border-radius:50%;background:var(--success);box-shadow:0 0 8px var(--success)}\n  .badge.off{background:rgba(143,163,200,.1);color:var(--muted)}\n  .empty{color:var(--dim);font-size:12.5px;text-align:center;padding:30px 12px;line-height:1.8}\n  .side-foot{margin-top:16px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--dim);line-height:1.8}\n\n  /* \u753b\u9762\u53f0 */\n  .stage-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}\n  .stage-head h2{margin:0;font-size:15px}\n  .stage-head .sub{color:var(--muted);font-size:12px;flex:1;min-width:120px}\n  .viewer-wrap{position:relative;background:#03060d;border:1px solid var(--border);border-radius:18px;\n    overflow:hidden;aspect-ratio:9/16;max-height:64vh;width:100%;max-width:390px;margin:0 auto;display:grid;place-items:center}\n  .viewer-wrap::after{content:\"\";position:absolute;inset:0;border-radius:18px;box-shadow:inset 0 0 60px rgba(0,0,0,.6);pointer-events:none}\n  #screen{width:100%;height:100%;object-fit:contain;display:none}\n  #screen.fill{object-fit:cover}\n  #overlay{position:absolute;inset:0;width:100%;height:100%;display:none;cursor:crosshair;touch-action:none;z-index:3}\n  .placeholder{color:var(--muted);text-align:center;font-size:13px;line-height:1.9;padding:20px}\n  .placeholder .big{font-size:46px;display:block;margin-bottom:12px;opacity:.45}\n  .live{position:absolute;top:12px;left:12px;z-index:4;display:none;align-items:center;gap:6px;\n    font-size:10px;font-weight:700;letter-spacing:1px;color:#fff;background:rgba(255,95,114,.85);\n    padding:5px 10px;border-radius:8px;box-shadow:0 4px 16px rgba(255,95,114,.4)}\n  .live::before{content:\"\";width:6px;height:6px;border-radius:50%;background:#fff;animation:blink 1.4s infinite}\n  @keyframes blink{50%{opacity:.25}}\n  .fps{position:absolute;top:12px;right:12px;z-index:4;display:none;font-size:10px;font-family:ui-monospace,monospace;\n    color:var(--success);background:rgba(3,10,20,.7);border:1px solid var(--border);padding:4px 9px;border-radius:8px}\n  .view-ctrl{position:absolute;bottom:12px;right:12px;z-index:4;display:none;gap:6px}\n  .view-ctrl button{width:34px;height:34px;border-radius:10px;border:1px solid var(--border);\n    background:rgba(8,14,26,.8);color:var(--text);font-size:14px;cursor:pointer;backdrop-filter:blur(6px)}\n\n  /* \u5de5\u5177 */\n  .tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}\n  .tool{padding:9px 13px;font-size:12.5px;border:1px solid var(--border);border-radius:11px;\n    background:rgba(17,26,46,.8);color:var(--text);cursor:pointer;transition:.16s;font-weight:600}\n  .tool:hover{border-color:var(--border-hi);transform:translateY(-1px)}\n  .tool.active{background:rgba(91,140,255,.2);border-color:var(--accent);color:#cfe0ff;box-shadow:0 0 0 3px rgba(91,140,255,.1)}\n  .tool.warn{background:rgba(255,95,114,.1);border-color:rgba(255,95,114,.3);color:#ff9aa6}\n\n  /* \u4fe1\u606f\u533a */\n  .rows{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-top:18px}\n  .box{background:rgba(6,11,22,.55);border:1px solid var(--border);border-radius:14px;padding:15px}\n  .box h3{margin:0 0 12px;font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.4px;display:flex;align-items:center;gap:7px}\n  .speak-row{display:flex;gap:8px}\n  .speak-row input{padding:11px 12px 11px 14px;font-size:13.5px}\n  .kv{font-size:12px;color:var(--muted);line-height:2}\n  .kv b{color:var(--text);font-weight:650}\n  .kv .ok{color:var(--success)}\n\n  /* \u64cd\u4f5c\u5386\u53f2 */\n  .history{position:relative;padding-left:6px;max-height:210px;overflow:auto}\n  .history .empty{color:var(--dim);font-size:12px;text-align:center;padding:18px}\n  .hitem{display:flex;gap:11px;padding:8px 4px;position:relative;align-items:flex-start}\n  .hitem::before{content:\"\";position:absolute;left:9px;top:0;bottom:0;width:1px;background:var(--border)}\n  .hitem:first-child::before{top:14px}\n  .hitem:last-child::before{bottom:calc(100% - 14px)}\n  .hdot{width:9px;height:9px;border-radius:50%;background:var(--accent);margin-top:5px;flex:none;z-index:1;box-shadow:0 0 0 3px rgba(91,140,255,.15)}\n  .hdot.speak{background:var(--accent2);box-shadow:0 0 0 3px rgba(56,224,208,.15)}\n  .hdot.sys{background:var(--amber);box-shadow:0 0 0 3px rgba(255,182,72,.15)}\n  .hbody{flex:1;min-width:0}\n  .hbody .ht{font-size:12.5px;font-weight:600}\n  .hbody .hd{font-size:11px;color:var(--dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n  .hresend{font-size:10.5px;color:var(--accent);border:1px solid var(--border);background:transparent;\n    padding:3px 8px;border-radius:7px;cursor:pointer;white-space:nowrap}\n  .hresend:hover{border-color:var(--accent);background:rgba(91,140,255,.1)}\n\n  /* \u65e5\u5fd7 */\n  .log{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:#aebfe0;height:130px;overflow:auto;line-height:1.75}\n  .log .ok{color:var(--success)} .log .err{color:var(--danger)} .log .t{color:var(--dim)}\n\n  @media(max-width:920px){\n    #main{grid-template-columns:1fr;gap:16px}\n    .dev-list{flex-direction:row;overflow-x:auto;padding-bottom:4px}\n    .dev{min-width:210px}\n    .side-foot{display:none}\n    .rows{grid-template-columns:1fr}\n    .wrap{padding:18px 13px 50px}\n    .card{padding:18px;border-radius:18px}\n    .tag{display:none}\n    .viewer-wrap{max-height:60vh}\n  }\n  ::-webkit-scrollbar{width:7px;height:7px}\n  ::-webkit-scrollbar-thumb{background:rgba(122,152,214,.25);border-radius:6px}\n  ::-webkit-scrollbar-track{background:transparent}\n</style>\n</head>\n<body>\n<div class=\"top\">\n  <div class=\"logo\">\u5b89</div>\n  <div class=\"brand\">\u5b89\u5fc3\u8fdc\u52a9<small>REMOTE ASSIST</small></div>\n  <span class=\"tag\">\u65e0\u914d\u5bf9\u7801 \u00b7 \u8d26\u53f7\u76f4\u8fde</span>\n  <div class=\"status\"><span class=\"dot\" id=\"dot\"></span><span id=\"statusText\">\u672a\u8fde\u63a5</span></div>\n</div>\n\n<div class=\"wrap\">\n  <!-- \u767b\u5f55 -->\n  <div class=\"card\" id=\"login\">\n    <div class=\"login-icon\">\ud83d\udee1\ufe0f</div>\n    <h1>\u767b\u5f55\u4f60\u7684\u8d26\u53f7</h1>\n    <p class=\"lead\">\u88c5\u673a\u65f6\u8001\u4eba\u624b\u673a\u5df2\u7ed1\u5b9a\u5230\u4f60\u7684\u8d26\u53f7\u3002\u767b\u5f55\u540e\u5373\u53ef\u5728\u300c\u6211\u7684\u8bbe\u5907\u300d\u91cc\u770b\u5230\u5b83\u2014\u2014\u4e0d\u9700\u8981\u914d\u5bf9\u7801\uff0c\u4e5f\u4e0d\u9700\u8981\u8001\u4eba\u505a\u4efb\u4f55\u64cd\u4f5c\u3002</p>\n    <div class=\"field\">\n      <label>\u4f60\u7684\u8d26\u53f7</label>\n      <div class=\"input-wrap\"><span class=\"ico\">\ud83d\udc64</span><input id=\"ownerId\" value=\"114514\" placeholder=\"\u4f8b\u5982\uff1a114514\" autocomplete=\"username\" /></div>\n    </div>\n    <div class=\"field\">\n      <label>\u4fe1\u4ee4\u670d\u52a1\u5668\u5730\u5740</label>\n      <div class=\"input-wrap\"><span class=\"ico\">\ud83c\udf10</span><input id=\"serverUrl\" placeholder=\"\u81ea\u52a8\u4f7f\u7528\u5f53\u524d\u57df\u540d\" /></div>\n    </div>\n    <button class=\"btn primary block\" id=\"loginBtn\">\u767b\u5f55\u5e76\u67e5\u770b\u6211\u7684\u8bbe\u5907 \u2192</button>\n    <div class=\"hint\">\u6f14\u793a\u73af\u5883\u4f1a\u81ea\u52a8\u5411\u670d\u52a1\u5668\u6362\u53d6 token\uff1b\u751f\u4ea7\u73af\u5883\u63a5\u5165\u4f60\u81ea\u5df1\u7684\u767b\u5f55\u7cfb\u7edf\u3002</div>\n  </div>\n\n  <!-- \u4e3b\u754c\u9762 -->\n  <div id=\"main\">\n    <div class=\"card\" id=\"devicePanel\">\n      <h2 class=\"panel-title\"><span class=\"ic\">\ud83d\udcf1</span>\u6211\u7684\u8bbe\u5907<span class=\"cnt\" id=\"devCount\"></span></h2>\n      <div class=\"dev-list\" id=\"devList\"><div class=\"empty\">\u6b63\u5728\u52a0\u8f7d\u8bbe\u5907\u2026</div></div>\n      <div class=\"side-foot\">\u8bbe\u5907\u5f00\u673a\u5373\u81ea\u52a8\u4e0a\u7ebf\uff0c\u70b9\u4e00\u53f0\u5373\u53ef\u67e5\u770b\u5c4f\u5e55\u5e76\u8fdc\u7a0b\u534f\u52a9\u3002\u591a\u53f0\u8bbe\u5907\u53ef\u968f\u65f6\u5207\u6362\u3002</div>\n    </div>\n\n    <div class=\"card stage\">\n      <div class=\"stage-head\">\n        <h2>\ud83d\udda5\ufe0f \u8fdc\u7a0b\u753b\u9762</h2>\n        <span class=\"sub\" id=\"stageSub\">\u5148\u5728\u5de6\u4fa7\u9009\u62e9\u4e00\u53f0\u5728\u7ebf\u8bbe\u5907</span>\n        <button class=\"btn danger\" id=\"stopWatch\" disabled>\u7ed3\u675f\u89c2\u770b</button>\n      </div>\n\n      <div class=\"viewer-wrap\" id=\"viewerWrap\">\n        <div class=\"live\" id=\"live\">LIVE</div>\n        <div class=\"fps\" id=\"fps\">-- fps</div>\n        <div class=\"placeholder\" id=\"placeholder\"><span class=\"big\">\ud83d\udcf1</span>\u9009\u62e9\u8bbe\u5907\u540e\uff0c\u8fd9\u91cc\u4f1a\u5b9e\u65f6\u663e\u793a\u8001\u4eba\u624b\u673a\u5c4f\u5e55</div>\n        <canvas id=\"screen\"></canvas>\n        <canvas id=\"overlay\"></canvas>\n        <div class=\"view-ctrl\" id=\"viewCtrl\">\n          <button id=\"fitBtn\" title=\"\u9002\u5e94/\u586b\u5145\">\u2922</button>\n          <button id=\"fsBtn\" title=\"\u5168\u5c4f\">\u26f6</button>\n        </div>\n      </div>\n\n      <div class=\"tools\" id=\"tools\" style=\"display:none\">\n        <button class=\"tool active\" data-tool=\"tap\">\ud83d\udc46 \u8fdc\u7a0b\u70b9\u51fb</button>\n        <button class=\"tool\" data-tool=\"swipe\">\u2194\ufe0f \u6ed1\u52a8</button>\n        <button class=\"tool\" data-tool=\"circle\">\u2b55 \u753b\u5708\u6307\u5f15</button>\n        <button class=\"tool\" data-tool=\"arrow\">\u27a1\ufe0f \u7bad\u5934\u6307\u5f15</button>\n        <button class=\"tool\" data-act=\"back\">\u2190 \u8fd4\u56de</button>\n        <button class=\"tool\" data-act=\"home\">\u2302 \u4e3b\u9875</button>\n        <button class=\"tool\" data-act=\"recents\">\u25a4 \u591a\u4efb\u52a1</button>\n        <button class=\"tool warn\" data-act=\"clear\">\ud83e\uddf9 \u6e05\u5c4f</button>\n      </div>\n\n      <div class=\"rows\">\n        <div class=\"box\">\n          <h3>\ud83c\udf99\ufe0f \u8bed\u97f3\u7559\u8a00 \u00b7 \u5728\u8001\u4eba\u624b\u673a\u4e0a\u6717\u8bfb</h3>\n          <div class=\"speak-row\">\n            <input id=\"speakText\" placeholder=\"\u4f8b\u5982\uff1a\u70b9\u4e0b\u9762\u90a3\u4e2a\u7eff\u8272\u7684\u6309\u94ae\" />\n            <button class=\"btn primary\" id=\"speakBtn\">\u53d1\u9001</button>\n          </div>\n        </div>\n        <div class=\"box\">\n          <h3>\ud83d\udcca \u8fde\u63a5\u4fe1\u606f</h3>\n          <div class=\"kv\" id=\"connInfo\">\u8bbe\u5907\uff1a\u2014<br/>\u72b6\u6001\uff1a\u2014<br/>\u5e27\u6570\uff1a0</div>\n        </div>\n      </div>\n\n      <div class=\"box\" style=\"margin-top:14px\">\n        <h3>\ud83d\udd58 \u64cd\u4f5c\u5386\u53f2 \u00b7 \u53ef\u70b9\u300c\u91cd\u53d1\u300d\u518d\u6b21\u6267\u884c\n          <button class=\"hresend\" id=\"clearHistory\" style=\"margin-left:auto\">\u6e05\u7a7a</button>\n        </h3>\n        <div class=\"history\" id=\"history\"><div class=\"empty\">\u8fd8\u6ca1\u6709\u64cd\u4f5c\u8bb0\u5f55</div></div>\n      </div>\n\n      <div class=\"box\" style=\"margin-top:14px\">\n        <h3>\ud83d\udcdd \u4e8b\u4ef6\u65e5\u5fd7</h3>\n        <div class=\"log\" id=\"log\"></div>\n      </div>\n    </div>\n  </div>\n</div>\n\n<script>\n(() => {\n  'use strict';\n  const $ = id => document.getElementById(id);\n  let ws = null, token = '', ownerId = '', baseUrl = '';\n  let devices = [], watching = null;\n  let frameCount = 0, decoder = null, configured = false;\n  let tool = 'tap', markStart = null, marks = [];\n  let fpsFrames = 0, fpsTimer = null;\n  let history = [];\n\n  const screen = $('screen'), sctx = screen.getContext('2d');\n  const overlay = $('overlay'), octx = overlay.getContext('2d');\n\n  function log(msg, cls='') {\n    const el = document.createElement('div');\n    if (cls) el.className = cls;\n    const t = new Date().toLocaleTimeString();\n    el.innerHTML = '<span class=\"t\">'+t+'</span>  '+msg;\n    const box = $('log'); box.appendChild(el); box.scrollTop = box.scrollHeight;\n  }\n  function setStatus(text, cls) {\n    $('statusText').textContent = text;\n    $('dot').className = 'dot ' + (cls || '');\n  }\n\n  // ---------- \u767b\u5f55 ----------\n  (function initServerUrl(){\n    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';\n    $('serverUrl').value = `${proto}//${location.host}/ws`;\n  })();\n\n  $('loginBtn').onclick = async () => {\n    ownerId = $('ownerId').value.trim();\n    const wsUrl = $('serverUrl').value.trim();\n    if (!ownerId) return alert('\u8bf7\u8f93\u5165\u8d26\u53f7');\n    $('loginBtn').disabled = true;\n    try {\n      baseUrl = wsUrl.replace(/^ws/, 'http').replace(/\\/ws$/, '');\n      const r = await fetch(baseUrl + '/api/token', {\n        method:'POST', headers:{'Content-Type':'application/json'},\n        body: JSON.stringify({ ownerId })\n      });\n      const j = await r.json();\n      if (!j.token) throw new Error('\u6362\u53d6 token \u5931\u8d25');\n      token = j.token;\n      connect(wsUrl);\n    } catch (e) {\n      log('\u767b\u5f55\u5931\u8d25: ' + e.message, 'err');\n      $('loginBtn').disabled = false;\n    }\n  };\n\n  function connect(wsUrl) {\n    ws = new WebSocket(wsUrl);\n    ws.binaryType = 'arraybuffer';\n    ws.onopen = () => {\n      setStatus('\u5df2\u8fde\u63a5\u670d\u52a1\u5668', 'on');\n      ws.send(JSON.stringify({ type:'auth', ownerId, token }));\n      $('login').style.display = 'none';\n      $('main').style.display = 'grid';\n      log('\u5df2\u8fde\u63a5\u4fe1\u4ee4\u670d\u52a1\u5668', 'ok');\n    };\n    ws.onmessage = onMessage;\n    ws.onclose = () => { setStatus('\u8fde\u63a5\u5df2\u65ad\u5f00', 'off'); log('\u8fde\u63a5\u5df2\u65ad\u5f00', 'err'); };\n    ws.onerror = () => log('WebSocket \u9519\u8bef', 'err');\n  }\n\n  function onMessage(ev) {\n    if (typeof ev.data === 'string' || ev.data instanceof String) {\n      let m; try { m = JSON.parse(ev.data); } catch { return; }\n      switch (m.type) {\n        case 'auth_ok': devices = m.devices; renderDevices(); log('\u767b\u5f55\u6210\u529f \u00b7 \u8d26\u53f7 '+ownerId, 'ok'); break;\n        case 'device_list': devices = m.devices; renderDevices(); break;\n        case 'device_offline':\n          log('\u8bbe\u5907\u79bb\u7ebf: ' + m.deviceId, 'err');\n          if (watching === m.deviceId) stopWatch();\n          break;\n        case 'watching':\n          log('\u5df2\u5f00\u59cb\u89c2\u770b ' + m.deviceId, 'ok');\n          $('stageSub').textContent = '\u5b9e\u65f6\u753b\u9762 \u00b7 ' + m.deviceId;\n          $('live').style.display = 'flex'; $('fps').style.display = 'block'; $('viewCtrl').style.display = 'flex';\n          initDecoder(); startFps();\n          break;\n        case 'command_ack':\n          log((m.ok ? '\u2713 \u5df2\u6267\u884c ' : '\u2717 \u5931\u8d25 ') + (m.cmdId||''), m.ok ? 'ok':'err');\n          markAck(m.cmdId, m.ok);\n          break;\n        case 'error': log('\u670d\u52a1\u5668: ' + m.message, 'err'); break;\n      }\n    } else {\n      decodeFrame(new Uint8Array(ev.data));\n    }\n  }\n\n  function renderDevices() {\n    const box = $('devList');\n    $('devCount').textContent = devices.length ? devices.length + ' \u53f0' : '';\n    if (!devices.length) { box.innerHTML = '<div class=\"empty\">\u8fd8\u6ca1\u6709\u8bbe\u5907\u3002<br/>\u8bf7\u5148\u5728\u8001\u4eba\u624b\u673a\u4e0a\u7528\u7ed1\u5b9a\u914d\u7f6e\u5b8c\u6210\u88c5\u673a\u3002</div>'; return; }\n    box.innerHTML = '';\n    devices.forEach(d => {\n      const el = document.createElement('div');\n      el.className = 'dev' + (watching === d.id ? ' active':'');\n      el.innerHTML = `<div class=\"avatar\">${d.online?'\ud83d\udcf1':'\ud83d\udcf4'}</div>\n        <div class=\"dev-info\"><b>${escapeHtml(d.name)}</b><small>${d.id}</small></div>\n        <span class=\"badge ${d.online?'on':'off'}\">${d.online?'\u5728\u7ebf':'\u79bb\u7ebf'}</span>`;\n      el.onclick = () => d.online ? watch(d.id) : log('\u8bbe\u5907\u5f53\u524d\u79bb\u7ebf', 'err');\n      box.appendChild(el);\n    });\n  }\n  function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}\n\n  function watch(id) {\n    if (!ws || ws.readyState !== WebSocket.OPEN) return log('\u672a\u8fde\u63a5', 'err');\n    if (watching === id) return;\n    if (watching && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'unwatch' }));\n    resetDecoder();\n    watching = id; renderDevices();\n    $('tools').style.display = 'flex';\n    $('placeholder').style.display = 'none';\n    $('stopWatch').disabled = false;\n    $('connInfo').innerHTML = '\u8bbe\u5907\uff1a<b>'+id+'</b><br/>\u72b6\u6001\uff1a\u8bf7\u6c42\u753b\u9762\u4e2d\u2026<br/>\u5e27\u6570\uff1a0';\n    ws.send(JSON.stringify({ type:'watch', deviceId:id }));\n  }\n  function stopWatch() {\n    if (watching && ws && ws.readyState === WebSocket.OPEN)\n      ws.send(JSON.stringify({ type:'unwatch' }));\n    watching = null; renderDevices();\n    $('stopWatch').disabled = true;\n    $('tools').style.display = 'none';\n    $('placeholder').style.display = 'block';\n    $('live').style.display = 'none'; $('fps').style.display = 'none'; $('viewCtrl').style.display = 'none';\n    $('screen').style.display = 'none'; $('overlay').style.display = 'none';\n    marks = []; stopFps(); resetDecoder();\n  }\n  $('stopWatch').onclick = stopWatch;\n\n  // \u753b\u9762\u9002\u5e94/\u5168\u5c4f\n  $('fitBtn').onclick = () => screen.classList.toggle('fill');\n  $('fsBtn').onclick = () => {\n    const el = $('viewerWrap');\n    if (!document.fullscreenElement) el.requestFullscreen?.();\n    else document.exitFullscreen?.();\n  };\n\n  function resetDecoder(){\n    if (decoder) { try { decoder.close(); } catch(_){} }\n    decoder = null; configured = false; frameCount = 0;\n  }\n  function startFps(){\n    stopFps(); fpsFrames = 0;\n    fpsTimer = setInterval(() => { $('fps').textContent = fpsFrames + ' fps'; fpsFrames = 0; }, 1000);\n  }\n  function stopFps(){ if (fpsTimer) clearInterval(fpsTimer); fpsTimer = null; }\n\n  // ---------- H.264 \u89e3\u7801\uff08WebCodecs\uff09 ----------\n  function initDecoder() {\n    if (decoder) return;\n    if (typeof VideoDecoder === 'undefined') { log('\u6d4f\u89c8\u5668\u4e0d\u652f\u6301 WebCodecs\uff0c\u65e0\u6cd5\u89e3\u7801\u753b\u9762', 'err'); return; }\n    decoder = new VideoDecoder({\n      output(frame) {\n        if (screen.width !== frame.displayWidth || screen.height !== frame.displayHeight) {\n          screen.width = frame.displayWidth; screen.height = frame.displayHeight;\n          overlay.width = frame.displayWidth; overlay.height = frame.displayHeight;\n        }\n        sctx.drawImage(frame, 0, 0);\n        frame.close();\n        frameCount++; fpsFrames++;\n        if (frameCount % 20 === 0) $('connInfo').innerHTML =\n          '\u8bbe\u5907\uff1a<b>'+escapeHtml(watching)+'</b><br/>\u72b6\u6001\uff1a<span class=\"ok\">\u64ad\u653e\u4e2d</span><br/>\u5e27\u6570\uff1a'+frameCount;\n      },\n      error(e) { log('\u89e3\u7801\u9519\u8bef: ' + e.message, 'err'); }\n    });\n  }\n\n  function decodeFrame(data) {\n    if (!decoder) initDecoder();\n    if (!decoder) return;\n    try {\n      const avc = annexBToAvcc(data);\n      if (!avc) return;\n      if (!configured && avc.description) {\n        decoder.configure({ codec:avc.codec || 'avc1.42001e', description:avc.description, optimizeForLatency:true });\n        configured = true;\n        screen.style.display = 'block'; overlay.style.display = 'block';\n      }\n      if (configured) decoder.decode(new EncodedVideoChunk({\n        type: avc.key ? 'key' : 'delta', timestamp: performance.now() * 1000, data: avc.data\n      }));\n    } catch (e) { /* \u9996\u4e2a\u5173\u952e\u5e27\u524d\u53ef\u80fd\u4e22\u5f03\u82e5\u5e72\u5e27 */ }\n  }\n\n  function annexBToAvcc(buf) {\n    const nalus = [];\n    let start = -1;\n    for (let i = 0; i < buf.length - 2; i++) {\n      if (buf[i]===0 && buf[i+1]===0 && buf[i+2]===1) {\n        if (start >= 0) nalus.push(buf.subarray(start, i));\n        start = i + 3; i += 2;\n      }\n    }\n    if (start >= 0) nalus.push(buf.subarray(start));\n    if (!nalus.length) return null;\n    let sps=null, pps=null, key=false; const slices=[];\n    for (const n of nalus) {\n      const t = n[0] & 0x1f;\n      if (t===7) sps=n; else if (t===8) pps=n; else { slices.push(n); if (t===5) key=true; }\n    }\n    if (!slices.length) return null;\n    let description = null, codec = null;\n    if (sps && pps) {\n      const d = new Uint8Array(11 + 2 + sps.length + 2 + pps.length);\n      let p=0;\n      d[p++]=1; d[p++]=sps[1]; d[p++]=sps[2]; d[p++]=sps[3]; d[p++]=0xff; d[p++]=0xe1;\n      d[p++]=sps.length>>8; d[p++]=sps.length&0xff; d.set(sps,p); p+=sps.length;\n      d[p++]=1; d[p++]=pps.length>>8; d[p++]=pps.length&0xff; d.set(pps,p);\n      description = d;\n      const hex = v => v.toString(16).padStart(2,'0');\n      codec = 'avc1.' + hex(sps[1]) + hex(sps[2]) + hex(sps[3]);\n    }\n    let len = 0; slices.forEach(n => len += 4 + n.length);\n    const out = new Uint8Array(len); let o=0;\n    slices.forEach(n => { out[o++]=n.length>>>24; out[o++]=n.length>>>16; out[o++]=n.length>>>8; out[o++]=n.length&0xff; out.set(n,o); o+=n.length; });\n    return { data:out, description, codec, key };\n  }\n\n  // ---------- \u8fdc\u7a0b\u63a7\u5236 ----------\n  document.querySelectorAll('.tool[data-tool]').forEach(b => b.onclick = () => {\n    tool = b.dataset.tool;\n    document.querySelectorAll('.tool[data-tool]').forEach(x => x.classList.toggle('active', x===b));\n  });\n  document.querySelectorAll('.tool[data-act]').forEach(b => b.onclick = () => {\n    const a = b.dataset.act;\n    if (a === 'clear') { marks=[]; octx.clearRect(0,0,overlay.width,overlay.height); return; }\n    sendCmd({ action:a });\n  });\n\n  function point(e) {\n    const r = overlay.getBoundingClientRect();\n    return { x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)), y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height)) };\n  }\n  overlay.addEventListener('pointerdown', e => { overlay.setPointerCapture?.(e.pointerId); markStart = point(e); });\n  overlay.addEventListener('pointerup', e => {\n    if (!markStart) return;\n    const p = point(e);\n    if (tool==='tap') sendCmd({ action:'tap', x:p.x, y:p.y });\n    else if (tool==='swipe') sendCmd({ action:'swipe', x1:markStart.x, y1:markStart.y, x2:p.x, y2:p.y });\n    else if (tool==='circle' || tool==='arrow') { drawMark(tool, markStart, p); sendCmd({ action:'tap', x:p.x, y:p.y }, tool); }\n    markStart = null;\n  });\n\n  function drawMark(kind, a, b) {\n    octx.strokeStyle = '#ff4d5e'; octx.lineWidth = 5; octx.lineCap='round';\n    if (kind==='circle') {\n      const r = Math.hypot((b.x-a.x)*overlay.width,(b.y-a.y)*overlay.height) || 40;\n      octx.beginPath(); octx.arc(a.x*overlay.width,a.y*overlay.height,r,0,Math.PI*2); octx.stroke();\n    } else {\n      const x1=a.x*overlay.width,y1=a.y*overlay.height,x2=b.x*overlay.width,y2=b.y*overlay.height;\n      octx.beginPath(); octx.moveTo(x1,y1); octx.lineTo(x2,y2); octx.stroke();\n      const ang=Math.atan2(y2-y1,x2-x1),h=18;\n      octx.beginPath(); octx.moveTo(x2,y2);\n      octx.lineTo(x2-h*Math.cos(ang-.5),y2-h*Math.sin(ang-.5));\n      octx.lineTo(x2-h*Math.cos(ang+.5),y2-h*Math.sin(ang+.5));\n      octx.closePath(); octx.fillStyle='#ff4d5e'; octx.fill();\n    }\n  }\n\n  function sendCmd(obj, label) {\n    if (!watching) return log('\u8bf7\u5148\u9009\u62e9\u8bbe\u5907', 'err');\n    const cmdId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);\n    ws.send(JSON.stringify({ type:'command', deviceId:watching, cmdId, ...obj }));\n    log('\u53d1\u9001\u6307\u4ee4 ' + (obj.action||'') + ' ' + cmdId);\n    addHistory(label || obj.action, obj, cmdId, obj.action==='speak' ? 'speak' : (obj.action==='back'||obj.action==='home'||obj.action==='recents' ? 'sys':'tap'));\n  }\n\n  // ---------- \u64cd\u4f5c\u5386\u53f2 ----------\n  const ACTION_LABEL = { tap:'\u8fdc\u7a0b\u70b9\u51fb', swipe:'\u6ed1\u52a8', circle:'\u753b\u5708\u6307\u5f15', arrow:'\u7bad\u5934\u6307\u5f15', back:'\u8fd4\u56de\u952e', home:'\u4e3b\u9875\u952e', recents:'\u591a\u4efb\u52a1', speak:'\u8bed\u97f3\u7559\u8a00', clear:'\u6e05\u5c4f' };\n  function addHistory(action, payload, cmdId, kind) {\n    const item = {\n      label: ACTION_LABEL[action] || action,\n      detail: describe(payload),\n      payload, cmdId, kind: kind||'tap', ok: null, time: Date.now()\n    };\n    history.unshift(item);\n    if (history.length > 60) history.length = 60;\n    renderHistory();\n  }\n  function describe(p) {\n    if (!p) return '';\n    if (p.action==='tap') return `\u5750\u6807 ${(p.x*100|0)}%, ${(p.y*100|0)}%`;\n    if (p.action==='swipe') return `\u4ece ${(p.x1*100|0)}%,${(p.y1*100|0)}% \u6ed1\u5230 ${(p.x2*100|0)}%,${(p.y2*100|0)}%`;\n    if (p.action==='speak') return '\u201c' + p.text + '\u201d';\n    if (['back','home','recents'].includes(p.action)) return '\u7cfb\u7edf\u6309\u952e';\n    return p.action || '';\n  }\n  function renderHistory() {\n    const box = $('history');\n    if (!history.length) { box.innerHTML = '<div class=\"empty\">\u8fd8\u6ca1\u6709\u64cd\u4f5c\u8bb0\u5f55</div>'; return; }\n    box.innerHTML = '';\n    history.forEach((h, i) => {\n      const el = document.createElement('div');\n      el.className = 'hitem';\n      const status = h.ok === null ? '' : (h.ok ? ' \u00b7 \u2713' : ' \u00b7 \u2717');\n      el.innerHTML = `<div class=\"hdot ${h.kind}\"></div>\n        <div class=\"hbody\"><div class=\"ht\">${escapeHtml(h.label)}<span style=\"color:var(--dim);font-weight:400\">${status}</span></div>\n        <div class=\"hd\">${new Date(h.time).toLocaleTimeString()} \u00b7 ${escapeHtml(h.detail)}</div></div>\n        <button class=\"hresend\" data-i=\"${i}\">\u91cd\u53d1</button>`;\n      box.appendChild(el);\n    });\n    box.querySelectorAll('.hresend').forEach(b => b.onclick = () => {\n      const h = history[+b.dataset.i];\n      if (!h || !watching) return log('\u8bf7\u5148\u9009\u62e9\u8bbe\u5907\u518d\u91cd\u53d1', 'err');\n      const cmdId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);\n      ws.send(JSON.stringify({ type:'command', deviceId:watching, cmdId, ...h.payload }));\n      h.cmdId = cmdId; h.ok = null; h.time = Date.now(); renderHistory();\n      log('\u91cd\u53d1 ' + h.label + ' ' + cmdId);\n    });\n  }\n  function markAck(cmdId, ok) {\n    const h = history.find(x => x.cmdId === cmdId);\n    if (h) { h.ok = ok; renderHistory(); }\n  }\n  $('clearHistory').onclick = () => { history = []; renderHistory(); };\n\n  $('speakBtn').onclick = () => {\n    const text = $('speakText').value.trim();\n    if (!text) return;\n    sendCmd({ action:'speak', text });\n    $('speakText').value = '';\n  };\n  $('speakText').addEventListener('keydown', e => { if (e.key==='Enter') $('speakBtn').click(); });\n})();\n</script>\n</body>\n</html>\n";

const DEFAULT_SECRET = 'dev-secret-change-me';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// HMAC-SHA256 -> base64url，与 Node 版 crypto.createHmac 输出一致
async function makeToken(secret, ownerId) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(ownerId)));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyToken(secret, ownerId, token) {
  return constantEqual(await makeToken(secret, ownerId), String(token || ''));
}

// ---------------- Worker 入口 ----------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.AX_SECRET || DEFAULT_SECRET;

    if (url.pathname === '/health') {
      return json({ ok: true, ts: Date.now() });
    }

    if (url.pathname === '/api/token' && request.method === 'POST') {
      let ownerId = '';
      try { ownerId = String((await request.json()).ownerId || '').trim(); } catch (_) {}
      if (!ownerId) return json({ error: 'ownerId required' }, 400);
      return json({ ownerId, token: await makeToken(secret, ownerId) });
    }

    if (url.pathname === '/ws' || url.pathname === '/api/devices') {
      const stub = env.HUB.get(env.HUB.idFromName('global'));
      return stub.fetch(request);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(controlHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

// ---------------- Durable Object：Hub ----------------
export class Hub {
  constructor(state, env) {
    this.state = state;
    this.secret = env.AX_SECRET || DEFAULT_SECRET;
    this.devices = new Map();   // deviceId -> { id, ownerId, name, ws, online, lastSeen }
    this.watchers = new Map();  // deviceId -> Set<viewerWs>
    this.cmdRoute = new Map();  // cmdId -> viewerWs
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/devices') {
      const ownerId = url.searchParams.get('ownerId') || '';
      const token = url.searchParams.get('token') || '';
      if (!(await verifyToken(this.secret, ownerId, token))) {
        return json({ error: 'unauthorized' }, 401);
      }
      return json({ devices: this.devicesOf(ownerId) });
    }
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[0]);
      pair[0].serializeAttachment({ role: null });
      return new Response(null, { status: 101, webSocket: pair[1] });
    }
    return new Response('Not found', { status: 404 });
  }

  sockets() { return this.state.getWebSockets(); }
  meta(ws) { return ws.deserializeAttachment() || {}; }
  setMeta(ws, m) { ws.serializeAttachment(m); }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }

  publicDevice(d) { return { id: d.id, name: d.name, online: d.online, lastSeen: d.lastSeen }; }
  devicesOf(ownerId) {
    const out = [];
    for (const d of this.devices.values()) if (d.ownerId === ownerId) out.push(this.publicDevice(d));
    return out;
  }
  broadcastDeviceList(ownerId) {
    for (const v of this.sockets()) {
      const m = this.meta(v);
      if (m.role === 'viewer' && m.ownerId === ownerId) {
        this.send(v, { type: 'device_list', devices: this.devicesOf(ownerId) });
      }
    }
  }

  async webSocketMessage(ws, message) {
    // H.264 二进制帧：只转发给正在观看该设备的人
    if (typeof message !== 'string') {
      const m = this.meta(ws);
      if (m.role === 'device' && m.deviceId) {
        const set = this.watchers.get(m.deviceId);
        if (set) for (const v of set) { try { v.send(message); } catch (_) {} }
      }
      return;
    }

    let msg;
    try { msg = JSON.parse(message); } catch (_) { return; }
    if (msg.type === 'register_bound') return this.onRegister(ws, msg);
    if (msg.type === 'auth') return this.onAuth(ws, msg);
    const m = this.meta(ws);
    if (m.role === 'viewer') return this.onViewer(ws, msg);
    if (m.role === 'device') return this.onDevice(ws, msg);
  }

  async onRegister(ws, msg) {
    if (!(await verifyToken(this.secret, msg.ownerId, msg.token))) {
      this.send(ws, { type: 'error', message: 'invalid token' });
      ws.close();
      return;
    }
    const m = { role: 'device', deviceId: String(msg.deviceId), ownerId: String(msg.ownerId) };
    this.setMeta(ws, m);
    const existed = this.devices.get(m.deviceId);
    this.devices.set(m.deviceId, {
      id: m.deviceId,
      ownerId: m.ownerId,
      name: String(msg.name || existed?.name || '家人的手机'),
      ws,
      online: true,
      lastSeen: Date.now(),
    });
    this.send(ws, { type: 'registered', deviceId: m.deviceId });
    this.broadcastDeviceList(m.ownerId);
  }

  async onAuth(ws, msg) {
    const ownerId = String(msg.ownerId || '');
    if (!(await verifyToken(this.secret, ownerId, msg.token))) {
      this.send(ws, { type: 'error', message: 'unauthorized' });
      ws.close();
      return;
    }
    this.setMeta(ws, { role: 'viewer', ownerId, watching: null });
    this.send(ws, { type: 'auth_ok', devices: this.devicesOf(ownerId) });
  }

  onViewer(ws, msg) {
    const m = this.meta(ws);
    if (msg.type === 'watch') {
      const dev = this.devices.get(String(msg.deviceId));
      if (!dev || dev.ownerId !== m.ownerId) {
        this.send(ws, { type: 'error', message: 'device not found' });
        return;
      }
      let set = this.watchers.get(dev.id);
      if (!set) { set = new Set(); this.watchers.set(dev.id, set); }
      const first = set.size === 0;
      set.add(ws);
      this.setMeta(ws, { ...m, watching: dev.id });
      if (first && dev.online) this.send(dev.ws, { type: 'stream_control', start: true });
      this.send(ws, { type: 'watching', deviceId: dev.id });
      return;
    }
    if (msg.type === 'unwatch') { this.stopWatching(ws); return; }
    if (msg.type === 'command') {
      const dev = this.devices.get(m.watching);
      if (!dev || !dev.online) {
        this.send(ws, { type: 'command_ack', cmdId: msg.cmdId, ok: false, reason: 'offline' });
        return;
      }
      const cmdId = String(msg.cmdId || (Date.now() + Math.random().toString(36).slice(2, 6)));
      this.cmdRoute.set(cmdId, ws);
      const out = { ...msg, type: 'command', cmdId };
      delete out.token;
      this.send(dev.ws, out);
    }
  }

  onDevice(ws, msg) {
    if (msg.type === 'command_ack') {
      const viewer = this.cmdRoute.get(String(msg.cmdId));
      if (viewer) {
        this.cmdRoute.delete(String(msg.cmdId));
        this.send(viewer, { type: 'command_ack', cmdId: msg.cmdId, ok: msg.ok !== false });
      }
    }
  }

  stopWatching(ws) {
    const m = this.meta(ws);
    const id = m.watching;
    if (!id) return;
    this.setMeta(ws, { ...m, watching: null });
    const set = this.watchers.get(id);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        this.watchers.delete(id);
        const dev = this.devices.get(id);
        if (dev?.online) this.send(dev.ws, { type: 'stream_control', start: false });
      }
    }
  }

  webSocketClose(ws) { this.onDisconnect(ws); }
  webSocketError(ws) { this.onDisconnect(ws); }
  onDisconnect(ws) {
    const m = this.meta(ws);
    if (m.role === 'viewer') this.stopWatching(ws);
    if (m.role === 'device' && m.deviceId) {
      const d = this.devices.get(m.deviceId);
      if (d && d.ws === ws) {
        d.online = false;
        d.lastSeen = Date.now();
        const set = this.watchers.get(d.id);
        if (set) for (const v of set) this.send(v, { type: 'device_offline', deviceId: d.id });
        this.broadcastDeviceList(d.ownerId);
      }
    }
  }
}
