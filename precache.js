/* 全量预缓存：第一次打开就把整包下到本地，之后每一关都走缓存 */
(function () {
  var CACHE = 'star-catch-40-v1';
  var DONE = 'precache-done-star-catch-40-v1-v2';
  var LIST = 'precache.json';
  var CONC = 6;

  if (localStorage.getItem(DONE) === '1') return;

  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;font:12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:rgba(12,12,14,.82);color:#fff;padding:8px 12px;border-radius:8px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.3)';
  box.textContent = '预缓存准备中…';
  function mount() { if (box.parentNode) return; (document.body || document.documentElement).appendChild(box); }
  mount();
  document.addEventListener('DOMContentLoaded', mount);

  function fmt(n) { return (n / 1048576).toFixed(1) + 'MB'; }

  var started = false;   // 防重入：load 与 readyState 两条路只跑一次
  function start() {
    if (started) return; started = true;
    fetch(LIST + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      if (!/^\//.test(data.base)) {
        localStorage.removeItem(DONE);
        box.textContent = '预缓存清单异常：base 必须以 / 开头，实际=' + data.base;
        setTimeout(function () { box.remove(); }, 10000);
        return;
      }
      var files = data.files, totalBytes = 0, i;
      for (i = 0; i < files.length; i++) totalBytes += files[i][1];
      caches.open(CACHE).then(function (cache) {
        return cache.keys().then(function (keys) {
          var have = {};
          for (i = 0; i < keys.length; i++) { try { have[new URL(keys[i].url).pathname] = 1; } catch (e) {} }
          var todo = [], doneBytes = 0, doneN = 0;
          for (i = 0; i < files.length; i++) {
            var p = data.base + files[i][0];
            if (have[p]) { doneBytes += files[i][1]; doneN++; } else { todo.push(files[i]); }
          }
          var totalN = files.length, lastTick = 0, failed = 0;
          function tick() {
            var pct = totalBytes ? Math.min(100, Math.round(doneBytes / totalBytes * 100)) : 100;
            box.textContent = '预缓存 ' + doneN + '/' + totalN + ' · ' + fmt(doneBytes) + '/' + fmt(totalBytes) + ' · ' + pct + '%'
              + (failed ? ' · ' + failed + ' 个待重试' : '');
          }
          tick();
          if (!todo.length) {
            localStorage.setItem(DONE, '1');
            box.textContent = '预缓存已完成 · ' + fmt(totalBytes);
            setTimeout(function () { box.remove(); }, 1800);
            return;
          }
          var idx = 0;
          function fetchOne(url) {
            return fetch(url, { cache: 'no-store' }).then(function (res) {
              if (!res.ok) throw new Error(res.status);
              return cache.put(url, res);
            });
          }
          function one(item) {
            var url = data.base + item[0];
            return fetchOne(url)
              .catch(function () { return fetchOne(url); })   // 重试 1 次
              .then(function () { doneBytes += item[1]; doneN++; })
              .catch(function () { failed++; });               // 两次都失败：计数，不许吞掉当成功
          }
          function worker() {
            if (idx >= todo.length) return Promise.resolve();
            return one(todo[idx++]).then(function () {
              var now = Date.now();
              if (now - lastTick > 400) { lastTick = now; tick(); }
              return worker();
            });
          }
          var workers = [];
          for (var k = 0; k < CONC; k++) workers.push(worker());
          Promise.all(workers).then(function () {
            tick();
            if (failed > 0) {
              // 有失败就不写完成标记：下次打开从已缓存的断点继续补（否则每关现下载 → 切关慢）
              box.textContent = '预缓存未完成：' + failed + ' 个失败（下次打开续传）· ' + doneN + '/' + totalN;
              setTimeout(function () { box.remove(); }, 8000);
              return;
            }
            localStorage.setItem(DONE, '1');
            box.textContent = '预缓存完成 · ' + fmt(doneBytes) + ' / ' + totalN + ' 个文件';
            setTimeout(function () { box.remove(); }, 2500);
          });
        });
      });
    }).catch(function (e) {
      box.textContent = '预缓存失败：' + e.message;
      setTimeout(function () { box.remove(); }, 6000);
    });
  }

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  window.addEventListener('load', function () { setTimeout(start, 3000); });
  if (document.readyState === 'complete') setTimeout(start, 3000);
})();
