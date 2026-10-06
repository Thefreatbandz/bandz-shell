/* idb.js — tiny IndexedDB helper for Bandz Arcade offline mode.
   Stores extracted game data (WAD/PAK/GRP bytes) on the phone so the arcade
   plays with no wifi, and so repeat visits skip the download+extract wait.
   Same-origin, works in the arcade iframes and in the shell itself.
   Everything fails soft: if IDB is unavailable (private mode, quota),
   callers get null and fall back to downloading. */
(function () {
  var DB = 'bandz-arcade', STORE = 'gamedata';
  function open() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () {
          try { req.result.createObjectStore(STORE); } catch (e) {}
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('idb open failed')); };
        req.onblocked = function () { reject(new Error('idb blocked')); };
      } catch (e) { reject(e); }
    });
  }
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var done = false;
        function finish(ok, val) {
          if (done) return; done = true;
          try { db.close(); } catch (e) {}
          if (ok) resolve(val); else reject(val);
        }
        try {
          var t = db.transaction(STORE, mode);
          var st = t.objectStore(STORE);
          var req = fn(st);
          req.onsuccess = function () { finish(true, req.result); };
          req.onerror = function () { finish(false, req.error || new Error('idb request failed')); };
          t.onabort = function () { finish(false, t.error || new Error('idb aborted')); };
        } catch (e) { finish(false, e); }
      });
    });
  }
  window.ArcadeDB = {
    // raw value (object, bytes, anything structured-cloneable) or null
    get: function (key) {
      return run('readonly', function (st) { return st.get(key); })
        .catch(function () { return null; });
    },
    // Uint8Array or null
    getBytes: function (key) {
      return run('readonly', function (st) { return st.get(key); }).then(function (v) {
        if (!v) return null;
        try { return new Uint8Array(v); } catch (e) { return null; }
      }).catch(function () { return null; });
    },
    set: function (key, value) {
      return run('readwrite', function (st) { return st.put(value, key); }).catch(function (e) {
        console.info('arcade offline store failed:', e && e.message);
      });
    },
    del: function (key) {
      return run('readwrite', function (st) { return st.delete(key); }).catch(function () {});
    }
  };
})();
