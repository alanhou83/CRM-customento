/* GitHub私有数据同步适配器。令牌默认仅驻留内存，可由用户选择记住本机；数据写入须校验远端SHA。 */
(function (root) {
  'use strict';
  var secret = '',
    running = false,
    resolutions = {},
    conflicts = [],
    activeRun = null,
    lastAutomaticAttempt = 0;
  var requestTimeout = 20000,
    writeTimeout = 45000,
    storageTimeout = 15000;
  var configKey = 'crm_sync_config_v1',
    baseKey = 'crm_sync_base_v1',
    credentialKey = 'crm_sync_device_token_v1',
    secretRepository = '';
  // 本机授权单独保存，不进入业务存储、同步快照或备份。
  function forgetDevice() {
    if (running) throw new Error('同步正在进行，请结束后取消授权');
    localStorage.removeItem(credentialKey);
    secret = '';
    secretRepository = '';
    document.getElementById('crm-sync-token').value = '';
    document.getElementById('crm-sync-remember').checked = false;
    status('已取消本机授权；业务数据和图片保留');
  }
  function rememberDevice(c) {
    var checkbox = document.getElementById('crm-sync-remember');
    if (checkbox.checked && secret && secretRepository === c.repository) {
      localStorage.setItem(credentialKey, JSON.stringify({ repository: c.repository, token: secret }));
    } else localStorage.removeItem(credentialKey);
  }
  function restoreDevice(c) {
    try {
      var saved = JSON.parse(localStorage.getItem(credentialKey) || 'null');
      if (saved && saved.repository === c.repository && typeof saved.token === 'string' && saved.token) {
        secret = saved.token;
        secretRepository = c.repository;
        return true;
      }
    } catch (e) {}
    return false;
  }
  function safe(value) {
    if (value && typeof value === 'object')
      Object.keys(value).forEach(function (k) {
        if (['__proto__', 'constructor', 'prototype'].indexOf(k) >= 0) throw new Error('数据包含不安全的键');
        safe(value[k]);
      });
    return value;
  }
  // 对象字段顺序不代表业务变化，避免反复上传同一份数据。
  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) || Array.isArray(b))
      return (
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every(function (v, i) {
          return same(v, b[i]);
        })
      );
    var keys = Object.keys(a).filter(function (k) {
        return a[k] !== undefined;
      }),
      other = Object.keys(b).filter(function (k) {
        return b[k] !== undefined;
      });
    return (
      keys.length === other.length &&
      keys.every(function (k) {
        return Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]);
      })
    );
  }
  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }
  function keyOf(v) {
    return v && typeof v === 'object'
      ? v.sourceImportId
        ? 'source:' + v.sourceImportId
        : v.id !== undefined
          ? 'id:' + v.id
          : null
      : null;
  }
  function merge(base, local, remote, path, found, choices) {
    path = path || '';
    found = found || [];
    choices = choices || {};
    if (same(local, remote)) return clone(local);
    if (same(local, base)) return clone(remote);
    if (same(remote, base)) return clone(local);
    if (choices[path]) return clone(choices[path] === 'local' ? local : remote);
    if (Array.isArray(local) && Array.isArray(remote)) {
      var all = local.concat(remote, Array.isArray(base) ? base : []);
      if (
        all.every(function (v) {
          return typeof v === 'string';
        })
      )
        return Array.from(new Set(local.concat(remote)));
      if (
        all.every(function (v) {
          return keyOf(v) !== null;
        })
      ) {
        var toMap = function (list) {
          var map = {};
          (list || []).forEach(function (v) {
            var k = keyOf(v);
            if (map[k]) throw new Error('同一数组含重复记录ID，请先核对');
            map[k] = v;
          });
          return map;
        };
        var bm = toMap(base),
          lm = toMap(local),
          rm = toMap(remote);
        Object.keys(lm).forEach(function (k) {
          if (!bm[k] && rm[k] && !same(lm[k], rm[k])) {
            var collisionPath = path + '/' + k;
            found.push({ path: collisionPath, base: undefined, local: clone(lm[k]), remote: clone(rm[k]) });
            if (choices[collisionPath]) {
              if (choices[collisionPath] === 'local') rm[k] = clone(lm[k]);
              else lm[k] = clone(rm[k]);
              found.pop();
            }
          }
        });
        var merged = merge(bm, lm, rm, path, found, choices);
        return Object.keys(merged)
          .map(function (k) {
            return merged[k];
          })
          .filter(function (v) {
            return v !== undefined;
          });
      }
    }
    if (
      local &&
      remote &&
      typeof local === 'object' &&
      typeof remote === 'object' &&
      !Array.isArray(local) &&
      !Array.isArray(remote) &&
      (!base || typeof base === 'object')
    ) {
      var out = {},
        keys = Array.from(new Set(Object.keys(base || {}).concat(Object.keys(local), Object.keys(remote))));
      keys.forEach(function (k) {
        var v = merge(
          (base || {})[k],
          local[k],
          remote[k],
          path + '/' + k.replace(/~/g, '~0').replace(/\//g, '~1'),
          found,
          choices
        );
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    found.push({ path: path, base: clone(base), local: clone(local), remote: clone(remote) });
    return clone(local);
  }
  function validateStores(stores) {
    if (root.CrmProductionModel) root.CrmProductionModel.validateStores(stores);
    var fin = stores.crm_fin_v6;
    if (!fin) return;
    var active = function (list) {
      return (list || []).filter(function (a) {
        return a.status === 'active';
      });
    };
    var claims = active(fin.receiptAllocations).concat(active(fin.paymentAllocations));
    (fin.transactions || []).forEach(function (t) {
      var used = claims
        .filter(function (a) {
          return a.transactionId === t.id;
        })
        .reduce(function (n, a) {
          if (a.currency !== t.currency || !Number.isFinite(Number(a.amount)) || Number(a.amount) <= 0)
            throw new Error('合并后财务认领币种/金额无效，请核对');
          return n + Math.round(Number(a.amount) * 100);
        }, 0);
      if (used > Math.round(Number(t.amount) * 100))
        throw new Error('多设备认领合计超过银行流水金额，已停止同步');
    });
    claims.forEach(function (a) {
      if (
        !(fin.transactions || []).some(function (t) {
          return t.id === a.transactionId;
        })
      )
        throw new Error('认领对应的银行流水缺失，已停止同步');
    });
  }
  function status(text) {
    var el = document.getElementById('crm-sync-status');
    if (el) el.textContent = text;
    var fab = document.getElementById('crm-sync-fab');
    if (fab) {
      fab.textContent =
        text.indexOf('已同步') === 0 ? '☁ 已同步' : text.indexOf('正在') === 0 ? '☁ 同步中' : '☁ 同步';
      fab.title = text;
    }
  }
  function config() {
    return JSON.parse(
      localStorage.getItem(configKey) || '{"repository":"alanhou83/CRM-customento-data","branch":"main"}'
    );
  }
  function baseStorageKey(c) {
    return baseKey + ':' + c.repository + ':' + c.branch;
  }
  function setConfig() {
    if (running) throw new Error('同步正在进行，请稍后修改授权');
    var repository = document.getElementById('crm-sync-repository').value.trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('请填写所有者/仓库名');
    var c = {
      repository: repository,
      branch: document.getElementById('crm-sync-branch').value.trim() || 'main'
    };
    if (secretRepository && secretRepository !== repository) {
      secret = '';
      secretRepository = '';
      localStorage.removeItem(credentialKey);
    }
    localStorage.setItem(configKey, JSON.stringify(c));
    var entered = document.getElementById('crm-sync-token').value.trim();
    if (entered) {
      secret = entered;
      secretRepository = repository;
    }
    document.getElementById('crm-sync-token').value = '';
    rememberDevice(c);
    return c;
  }
  function encode(text) {
    var bytes = new TextEncoder().encode(text),
      s = '';
    bytes.forEach(function (v) {
      s += String.fromCharCode(v);
    });
    return btoa(s);
  }
  function decode(content) {
    var s = atob(content.replace(/\s/g, ''));
    return new TextDecoder().decode(
      Uint8Array.from(s, function (c) {
        return c.charCodeAt(0);
      })
    );
  }
  function paintProgress() {
    var job = activeRun;
    if (!job) return;
    var seconds = Math.floor((Date.now() - job.started) / 1000);
    status(job.phase + (seconds >= 2 ? '（已用' + seconds + '秒）' : ''));
  }
  function phase(text) {
    if (activeRun) {
      activeRun.phase = text;
      paintProgress();
    } else status(text);
  }
  function controls() {
    ['crm-sync-run', 'crm-sync-init'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = running;
    });
    var cancel = document.getElementById('crm-sync-cancel');
    if (cancel) {
      cancel.hidden = !running;
      cancel.style.display = running ? '' : 'none';
      cancel.disabled = !!(activeRun && activeRun.committing);
    }
  }
  function cancelSync() {
    if (!activeRun || activeRun.committing) return;
    activeRun.cancelled = true;
    activeRun.controller.abort();
    phase('正在取消同步…');
  }
  function ensureActive() {
    if (activeRun && activeRun.cancelled) throw new Error('已取消同步');
  }
  async function api(c, path, options) {
    if (!secret || secretRepository !== c.repository)
      throw new Error('请填写仅限当前私有数据仓库的GitHub令牌');
    ensureActive();
    var job = activeRun,
      controller = new AbortController(),
      isWrite = options && options.method && options.method !== 'GET',
      timer,
      onCancel;
    var stopped = new Promise(function (resolve, reject) {
      timer = setTimeout(
        function () {
          controller.abort();
          reject(
            new Error(isWrite ? '上传请求超时，云端结果待确认，请重新同步' : '网络请求超时，请检查网络后重试')
          );
        },
        isWrite ? writeTimeout : requestTimeout
      );
      onCancel = function () {
        controller.abort();
        reject(new Error('已取消同步'));
      };
      if (job) job.controller.signal.addEventListener('abort', onCancel, { once: true });
    });
    try {
      return await Promise.race([
        stopped,
        (async function () {
          var response = await fetch(
            'https://api.github.com/repos/' + c.repository + path,
            Object.assign(
              {
                cache: 'no-store',
                headers: {
                  Authorization: 'Bearer ' + secret,
                  Accept: 'application/vnd.github+json',
                  'Content-Type': 'application/json',
                  'X-GitHub-Api-Version': '2022-11-28'
                }
              },
              options || {},
              { signal: controller.signal }
            )
          );
          if (response.status === 404) {
            if (isWrite) throw new Error('GitHub写入未成功，请检查仓库、分支及Contents写入权限');
            return null;
          }
          if (!response.ok) {
            if (response.status === 409 || response.status === 422)
              throw new Error('远端版本已改变，请重新同步并核对冲突');
            if (response.status === 401) throw new Error('GitHub令牌无效或已过期，请重新授权');
            if (response.status === 403 || response.status === 429)
              throw new Error('GitHub暂时限制请求或权限不足，请稍后重试');
            throw new Error('GitHub请求失败（' + response.status + '），请检查权限或网络');
          }
          return await response.json();
        })()
      ]);
    } finally {
      clearTimeout(timer);
      if (job) job.controller.signal.removeEventListener('abort', onCancel);
    }
  }
  async function file(c, path) {
    return api(c, '/contents/' + path + '?ref=' + encodeURIComponent(c.branch));
  }
  async function write(c, path, content, sha) {
    return api(c, '/contents/' + path, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'CRM 数据同步',
        branch: c.branch,
        content: content,
        sha: sha || undefined
      })
    });
  }
  function capture() {
    var stores = {};
    Object.keys(SK)
      .filter(function (k) {
        return k !== 'user';
      })
      .forEach(function (k) {
        var raw = localStorage.getItem(SK[k]);
        if (raw !== null) stores[SK[k]] = JSON.parse(raw);
      });
    [
      'crm_ord_sequence_v5',
      'crm_ord_daily_sequences_v5',
      'crm_catalog_code_highwater_v1',
      'crm_inq_highwater_v1',
      'crm_cust_highwater_v1',
      'crm_real_trial_cleanup_done_v1'
    ].forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw !== null) stores[k] = JSON.parse(raw);
    });
    var baseline = JSON.parse(localStorage.getItem(baseStorageKey(config())) || 'null');
    var ledger = JSON.parse(localStorage.getItem('crm_deleted_records_v1') || '[]');
    Object.keys((baseline || {}).stores || {}).forEach(function (key) {
      var old = baseline.stores[key],
        current = stores[key];
      if (!Array.isArray(old) || !Array.isArray(current)) return;
      old.forEach(function (record) {
        var id = keyOf(record);
        if (
          !id ||
          current.some(function (v) {
            return keyOf(v) === id;
          })
        )
          return;
        var marker = key + ':' + id;
        if (
          !ledger.some(function (d) {
            return d.key === marker;
          })
        )
          ledger.push({
            key: marker,
            store: key,
            id: marker,
            recordId: record.id,
            sourceImportId: record.sourceImportId || '',
            deletedAt: new Date().toISOString()
          });
      });
    });
    if (ledger.length) {
      localStorage.setItem('crm_deleted_records_v1', JSON.stringify(ledger));
      stores.crm_deleted_records_v1 = ledger;
    }
    return stores;
  }
  function storageTask(label, open) {
    return new Promise(function (resolve, reject) {
      var done = false,
        tx = null,
        db = null,
        job = activeRun;
      function finish(error, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (job) job.controller.signal.removeEventListener('abort', cancel);
        if (error && tx) {
          try {
            tx.abort();
          } catch (e) {}
        }
        if (db) db.close();
        if (error) reject(error);
        else resolve(value);
      }
      function cancel() {
        finish(new Error('已取消同步'));
      }
      var timer = setTimeout(function () {
        finish(new Error(label + '等待超时，请关闭其他CRM标签页后重试'));
      }, storageTimeout);
      if (job) job.controller.signal.addEventListener('abort', cancel, { once: true });
      open(
        function (value, owned) {
          if (done) {
            if (value && owned) value.close();
            return false;
          }
          if (owned) db = value;
          return true;
        },
        function (value) {
          tx = value;
        },
        finish
      );
    });
  }
  function imageRecords() {
    return storageTask('读取本机图片', function (accept, setTx, finish) {
      openImgDB(function (db) {
        if (!accept(db)) return;
        if (!db) {
          finish(new Error('无法读取本地图片'));
          return;
        }
        var tx = db.transaction('imgs', 'readonly');
        setTx(tx);
        var request = tx.objectStore('imgs').getAll(),
          records;
        request.onsuccess = function () {
          records = request.result;
        };
        tx.oncomplete = function () {
          finish(null, records);
        };
        tx.onerror = tx.onabort = function () {
          finish(new Error('读取图片失败'));
        };
      });
    });
  }
  function saveLocalBackup(value) {
    return storageTask('保存同步前备份', function (accept, setTx, finish) {
      var request = indexedDB.open('customento-sync-backups-v1', 1);
      request.onupgradeneeded = function () {
        request.result.createObjectStore('snapshots');
      };
      request.onerror = function () {
        finish(new Error('无法创建同步前备份'));
      };
      request.onblocked = function () {
        finish(new Error('备份数据库被其他标签页占用，请关闭其他CRM页面后重试'));
      };
      request.onsuccess = function () {
        var db = request.result;
        if (!accept(db, true)) return;
        var tx = db.transaction('snapshots', 'readwrite');
        setTx(tx);
        tx.objectStore('snapshots').put(value, 'last-before-sync');
        tx.oncomplete = function () {
          finish();
        };
        tx.onerror = tx.onabort = function () {
          finish(new Error('同步前备份失败，未覆盖本地'));
        };
      };
    });
  }
  async function exportPortableBackup() {
    try {
      var value = {
        kind: 'crm-portable-backup',
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        stores: capture(),
        imageRecords: await imageRecords()
      };
      var blob = new Blob([JSON.stringify(value)], { type: 'application/json' }),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'CRM完整数据及图片备份-' + new Date().toISOString().slice(0, 10) + '.json';
      link.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      status('完整备份已导出，包含图片；令牌不在备份中');
    } catch (error) {
      status(error.message);
    }
  }
  async function restorePortable(value) {
    if (running) throw new Error('同步正在进行，请稍后恢复');
    safe(value);
    if (
      value.kind !== 'crm-portable-backup' ||
      value.schemaVersion !== 1 ||
      !value.stores ||
      !Array.isArray(value.imageRecords)
    )
      throw new Error('完整备份格式错误');
    var stores = value.stores;
    validateStores(stores);
    Object.keys(stores).forEach(function (k) {
      if (!/^crm_/.test(k) || /sync|token|secret/i.test(k)) throw new Error('备份包含不允许的存储键');
    });
    var ids = new Set();
    value.imageRecords.forEach(function (r) {
      if (!((typeof r.id === 'string' && r.id) || (typeof r.id === 'number' && Number.isFinite(r.id))))
        throw new Error('备份图片ID无效');
      var key = typeof r.id + ':' + r.id;
      if (ids.has(key)) throw new Error('备份图片ID重复');
      ids.add(key);
      ['img', 'thumb'].forEach(function (k) {
        if (!r[k]) {
          if (k === 'thumb') return;
          throw new Error('备份图片缺失');
        }
        var m = /^data:image\/(webp|png|jpeg);base64,(.*)$/.exec(r[k]);
        if (!m || atob(m[2]).length > (k === 'img' ? 300000 : 60000))
          throw new Error('备份图片格式或大小无效');
      });
    });
    if (
      !confirm(
        '恢复将替换本机业务数据及同ID图片，并先保存当前完整备份。恢复后需重新授权再同步，不自动上传。确认恢复？'
      )
    )
      return false;
    running = true;
    try {
      await saveLocalBackup({
        createdAt: new Date().toISOString(),
        stores: capture(),
        imageRecords: await imageRecords()
      });
      await imagePut(value.imageRecords);
      Object.keys(SK)
        .filter(function (k) {
          return k !== 'user';
        })
        .forEach(function (k) {
          if (!(SK[k] in stores)) localStorage.removeItem(SK[k]);
        });
      Object.keys(stores).forEach(function (k) {
        localStorage.setItem(k, JSON.stringify(stores[k]));
      });
      localStorage.removeItem(credentialKey);
      secret = '';
      secretRepository = '';
      status('已恢复完整备份，尚未上传云端；刷新后重新授权');
      setTimeout(function () {
        location.reload();
      }, 500);
      return true;
    } finally {
      running = false;
    }
  }
  function imagePut(records) {
    if (!records.length) return Promise.resolve();
    return storageTask('保存同步图片', function (accept, setTx, finish) {
      openImgDB(function (db) {
        if (!accept(db)) return;
        if (!db) {
          finish(new Error('无法保存图片'));
          return;
        }
        var tx = db.transaction('imgs', 'readwrite');
        setTx(tx);
        var store = tx.objectStore('imgs');
        records.forEach(function (r) {
          if (r.deleted) store.delete(r.id);
          else store.put(r);
        });
        tx.oncomplete = function () {
          finish();
        };
        tx.onerror = tx.onabort = function () {
          finish(new Error('保存图片失败，未标记同步成功'));
        };
      });
    });
  }
  async function hash(bytes) {
    var buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer))
      .map(function (v) {
        return v.toString(16).padStart(2, '0');
      })
      .join('');
  }
  function prepareImage(url) {
    return new Promise(function (resolve, reject) {
      var job = activeRun,
        done = false;
      function finish(error, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (job) job.controller.signal.removeEventListener('abort', cancel);
        if (error) reject(error);
        else resolve(value);
      }
      function cancel() {
        finish(new Error('已取消同步'));
      }
      var timer = setTimeout(function () {
        finish(new Error('本机图片处理超时，请重试'));
      }, requestTimeout);
      if (job) job.controller.signal.addEventListener('abort', cancel, { once: true });
      CrmImageCodec.prepare(url).then(function (value) {
        finish(null, value);
      }, finish);
    });
  }
  async function imageIndex(records) {
    var index = {},
      uploads = {};
    var processed = 0;
    for (var r of records) {
      ensureActive();
      phase('正在核对本机图片 ' + ++processed + '/' + records.length + '…');
      var prepared = r.thumb ? null : await prepareImage(r.img);
      var detail = prepared ? prepared.detail.url : r.img,
        thumb = prepared ? prepared.thumb.url : r.thumb;
      var entry = {
        id: r.id,
        width: prepared ? prepared.detail.width : (r.meta || {}).width,
        height: prepared ? prepared.detail.height : (r.meta || {}).height
      };
      for (var kind of ['detail', 'thumb']) {
        var url = kind === 'detail' ? detail : thumb,
          m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(url);
        if (!m) throw new Error('存在无法同步的图片，请先核对');
        var bytes = Uint8Array.from(atob(m[2]), function (c) {
          return c.charCodeAt(0);
        });
        if (bytes.length > (kind === 'detail' ? 300000 : 60000))
          throw new Error('图片超过' + (kind === 'detail' ? '300KB' : '60KB') + '，请先重新上传压缩');
        var digest = await hash(bytes),
          path =
            'images/' + digest + (m[1] === 'image/webp' ? '.webp' : m[1] === 'image/png' ? '.png' : '.jpg');
        entry[kind] = { path: path, sha256: digest, mime: m[1], bytes: bytes.length };
        uploads[path] = m[2];
      }
      index[typeof r.id + ':' + r.id] = entry;
      await new Promise(function (resolve) {
        setTimeout(resolve, 0);
      });
    }
    return { index: index, uploads: uploads };
  }
  function imageInfo(info, kind) {
    var ext =
      info && info.mime === 'image/webp'
        ? '.webp'
        : info && info.mime === 'image/png'
          ? '.png'
          : info && info.mime === 'image/jpeg'
            ? '.jpg'
            : '';
    if (
      !info ||
      !ext ||
      !Number.isInteger(info.bytes) ||
      info.bytes <= 0 ||
      info.bytes > (kind === 'detail' ? 300000 : 60000) ||
      !/^[a-f0-9]{64}$/.test(info.sha256) ||
      info.path !== 'images/' + info.sha256 + ext
    )
      throw new Error('远端图片路径、格式或大小无效');
  }
  async function downloadImages(c, index, oldIndex, localImages, localRecords) {
    var job = activeRun,
      records = [],
      files = {},
      cache = {},
      byId = {},
      done = 0;
    function checkJob() {
      if (job !== activeRun || (job && job.controller.signal.aborted)) throw new Error('已取消同步');
      ensureActive();
    }
    (localRecords || []).forEach(function (r) {
      byId[typeof r.id + ':' + r.id] = r;
    });
    Object.keys(index).forEach(function (key) {
      var entry = index[key];
      if (
        !entry ||
        !(
          (typeof entry.id === 'string' && entry.id) ||
          (typeof entry.id === 'number' && Number.isFinite(entry.id))
        ) ||
        key !== typeof entry.id + ':' + entry.id
      )
        throw new Error('云端图片ID无效');
      ['detail', 'thumb'].forEach(function (kind) {
        var info = entry[kind];
        imageInfo(info, kind);
        if (
          files[info.path] &&
          (files[info.path].sha256 !== info.sha256 ||
            files[info.path].bytes !== info.bytes ||
            files[info.path].mime !== info.mime)
        )
          throw new Error('相同图片的校验信息不一致');
        files[info.path] = info;
      });
    });
    var paths = Object.keys(files),
      missing = paths.filter(function (path) {
        return !localImages.uploads[path];
      }),
      cursor = 0;
    async function load(path) {
      checkJob();
      var info = files[path],
        encoded = localImages.uploads[path];
      if (!encoded) {
        var f = await file(c, path);
        if (!f || !f.content) throw new Error('远端图片缺失，同步已停止');
        encoded = f.content.replace(/\s/g, '');
        checkJob();
        phase('正在下载图片 ' + ++done + '/' + missing.length + '…');
      }
      var bytes = Uint8Array.from(atob(encoded), function (ch) {
        return ch.charCodeAt(0);
      });
      if (bytes.length !== info.bytes || (await hash(bytes)) !== info.sha256)
        throw new Error('图片校验失败，同步已停止');
      cache[path] = 'data:' + info.mime + ';base64,' + encoded;
    }
    // 相同哈希仅处理一次；未变化图片复用已核验本机内容，新增下载最多并行三项。
    for (var path of paths.filter(function (path) {
      return !!localImages.uploads[path];
    }))
      await load(path);
    if (missing.length) phase('正在下载图片 0/' + missing.length + '…');
    await Promise.all(
      Array.from({ length: Math.min(3, missing.length) }, async function () {
        while (cursor < missing.length) {
          var path = missing[cursor++];
          await load(path);
        }
      })
    );
    Object.keys(index).forEach(function (key) {
      var entry = index[key],
        old = byId[key],
        record = Object.assign({}, old || {}, {
          id: entry.id,
          img: cache[entry.detail.path],
          thumb: cache[entry.thumb.path],
          meta: Object.assign({}, (old && old.meta) || {}, {
            width: entry.width,
            height: entry.height,
            mime: entry.detail.mime,
            bytes: entry.detail.bytes,
            thumbBytes: entry.thumb.bytes
          })
        });
      if (!same(old, record)) records.push(record);
    });
    Object.keys(oldIndex || {}).forEach(function (k) {
      if (!index[k]) records.push({ id: oldIndex[k].id, deleted: true });
    });
    return records;
  }
  function remoteImagePaths(index) {
    var paths = new Set();
    Object.keys(index || {}).forEach(function (key) {
      ['detail', 'thumb'].forEach(function (kind) {
        var info = index[key][kind];
        imageInfo(info, kind);
        paths.add(info.path);
      });
    });
    return paths;
  }
  function lastSuccess() {
    var el = document.getElementById('crm-sync-last'),
      date = localStorage.getItem('crm_sync_last_success_v1'),
      rev = localStorage.getItem('crm_sync_last_revision_v1');
    if (el)
      el.textContent = date
        ? '上次成功：' + new Date(date).toLocaleString('zh-CN') + (rev ? ' · 数据版本' + rev : '')
        : '';
  }
  function complete(merged, revision) {
    resolutions = {};
    conflicts = [];
    var box = document.getElementById('crm-sync-conflicts');
    if (box) box.hidden = true;
    var now = new Date().toISOString();
    localStorage.setItem('crm_sync_last_success_v1', now);
    if (revision != null) localStorage.setItem('crm_sync_last_revision_v1', String(revision));
    lastSuccess();
    status(
      '已同步 ' +
        new Date().toLocaleString('zh-CN') +
        (revision != null ? ' · 数据版本' + revision : '') +
        ' · 数据与图片已核对'
    );
  }
  function showConflicts(list) {
    conflicts = list;
    var box = document.getElementById('crm-sync-conflicts');
    box.hidden = false;
    box.replaceChildren();
    list.forEach(function (conflict) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-top:10px;font-size:12px;overflow-wrap:anywhere';
      var label = document.createElement('div');
      label.textContent = conflict.path;
      row.appendChild(label);
      ['local', 'remote'].forEach(function (side) {
        var button = document.createElement('button');
        button.className = 'btn btn-outline btn-sm';
        button.textContent = side === 'local' ? '选本地' : '选云端';
        button.onclick = function () {
          resolutions[conflict.path] = side;
          label.textContent = conflict.path + '（已选' + (side === 'local' ? '本地' : '云端') + '）';
        };
        row.appendChild(button);
      });
      var details = document.createElement('details'),
        summary = document.createElement('summary'),
        text = document.createElement('pre');
      summary.textContent = '查看两边内容';
      text.textContent = JSON.stringify({ local: conflict.local, remote: conflict.remote }, null, 2);
      text.style.whiteSpace = 'pre-wrap';
      details.append(summary, text);
      row.appendChild(details);
      box.appendChild(row);
    });
  }
  async function sync(initialize, source) {
    if (running) return;
    if (source === 'auto') {
      if (Date.now() - lastAutomaticAttempt < 30000) return;
      lastAutomaticAttempt = Date.now();
    }
    running = true;
    activeRun = {
      controller: new AbortController(),
      started: Date.now(),
      phase: '正在检查云端与本机修改…',
      cancelled: false,
      committing: false
    };
    controls();
    var progressTimer = setInterval(paintProgress, 1000);
    try {
      phase('正在连接私有数据仓库…');
      var c = config(),
        repo = await api(c, '');
      if (!repo) throw new Error('仓库不存在或当前令牌无法访问，请核对仓库授权');
      if (repo.private !== true) throw new Error('数据仓库必须为私有，已停止同步');
      phase('正在读取本机数据与图片…');
      var initial = capture(),
        initialRecords = await imageRecords();
      phase('正在读取云端业务数据…');
      var f = await file(c, 'state/snapshot.json'),
        remote = f ? safe(JSON.parse(decode(f.content))) : null;
      if (!remote && !initialize) throw new Error('私有仓库尚无基准数据，请先使用初始化按钮');
      if (remote && remote.schemaVersion !== 1) throw new Error('不支持的云端数据格式');
      if (remote && initialize) throw new Error('远端已有数据，不能再次初始化覆盖');
      var base = JSON.parse(localStorage.getItem(baseStorageKey(c)) || 'null'),
        firstDownload = !!remote && !base;
      if (firstDownload) {
        var hasLocalRecords =
          initialRecords.length ||
          Object.keys(initial).some(function (k) {
            return Array.isArray(initial[k])
              ? initial[k].length
              : initial[k] && typeof initial[k] === 'object' && Object.keys(initial[k]).length;
          });
        if (
          hasLocalRecords &&
          !confirm(
            '首次同步：使用云端数据替换本机旧数据和图片，本机旧内容不会上传。已确认本机内容不需要保留？取消可先导出完整备份。'
          )
        ) {
          status('已取消，未更改本机或云端数据');
          return;
        }
      }
      // 首次接收不解析或上传旧图片，避免演示图片大小/ID阻止接入或混入云端。
      var localImages = firstDownload ? { index: {}, uploads: {} } : await imageIndex(initialRecords),
        local = { stores: initial, images: localImages.index };
      var problems = [],
        merged = firstDownload
          ? { stores: clone(remote.stores), images: clone(remote.images || {}) }
          : remote
            ? merge(
                base || {},
                local,
                { stores: remote.stores, images: remote.images || {} },
                '',
                problems,
                resolutions
              )
            : local;
      phase('正在检查CBOS跟进更新…');
      var manifestFile = await file(c, 'cbos/manifest.json');
      if (manifestFile) {
        var manifest = JSON.parse(decode(manifestFile.content));
        if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.batches))
          throw new Error('CBOS批次索引格式错误');
        for (var batch of manifest.batches) {
          if (!/^cbos\/batches\/[A-Za-z0-9_-]+\.json$/.test(batch.path)) throw new Error('CBOS批次路径无效');
          if (((merged.stores[SK.settings] || {}).cbosAppliedBatches || []).indexOf(batch.id) >= 0) continue;
          phase('正在接收CBOS跟进更新…');
          var batchFile = await file(c, batch.path);
          if (!batchFile) throw new Error('CBOS批次文件缺失');
          var delta = safe(JSON.parse(decode(batchFile.content)));
          if (delta.batchId !== batch.id) throw new Error('CBOS批次编号不一致');
          var result = CrmCbosDelta.plan(merged.stores, delta, resolutions);
          merged.stores = result.stores;
          problems = problems.concat(result.conflicts);
        }
      }
      if (problems.length) {
        showConflicts(problems);
        status('有' + problems.length + '项冲突；选择后再次点击同步，尚未覆盖本地或云端');
        return;
      }
      if (!same(capture(), initial) || !same(await imageRecords(), initialRecords))
        throw new Error('同步期间本地发生修改，请重新同步；新修改已保留');
      validateStores(merged.stores);
      Object.keys(merged.stores).forEach(function (k) {
        if (!/^crm_/.test(k) || /sync|token|secret/i.test(k)) throw new Error('云端数据包含不允许的键');
      });
      var remotePaths = remoteImagePaths((remote && remote.images) || {}),
        mergedPaths = remoteImagePaths(merged.images);
      if (
        !firstDownload &&
        remote &&
        same(local, merged) &&
        same({ stores: remote.stores, images: remote.images || {} }, merged)
      ) {
        localStorage.setItem(baseStorageKey(c), JSON.stringify(merged));
        complete(merged, remote.revision);
        return;
      }
      phase('正在保存同步前备份…');
      await saveLocalBackup({
        createdAt: new Date().toISOString(),
        stores: initial,
        imageRecords: initialRecords
      });
      var uploads = Object.keys(localImages.uploads).filter(function (path) {
          return mergedPaths.has(path) && !remotePaths.has(path);
        }),
        uploaded = 0;
      for (var path of uploads) {
        phase('正在上传新图片 ' + ++uploaded + '/' + uploads.length + '…');
        var old = await file(c, path);
        if (!old) await write(c, path, localImages.uploads[path]);
      }
      var imageData = await downloadImages(
        c,
        merged.images,
        local.images,
        localImages,
        firstDownload ? [] : initialRecords
      );
      phase('正在核对云端版本…');
      var check = await file(c, 'state/snapshot.json');
      if ((check && check.sha) !== (f && f.sha)) throw new Error('另一设备已更新，请重新同步');
      var next = {
        schemaVersion: 1,
        revision: (remote ? remote.revision : 0) + 1,
        updatedAt: new Date().toISOString(),
        stores: merged.stores,
        images: merged.images
      };
      if (!same(capture(), initial) || !same(await imageRecords(), initialRecords))
        throw new Error('本地发生修改，已停止覆盖，请重新同步');
      ensureActive();
      activeRun.committing = true;
      controls();
      phase('正在保存同步结果…');
      if (!remote || !same({ stores: remote.stores, images: remote.images || {} }, merged))
        await write(c, 'state/snapshot.json', encode(JSON.stringify(next)), f && f.sha);
      if (!same(capture(), initial) || !same(await imageRecords(), initialRecords))
        throw new Error('云端已写入，但本地同时有新修改；新修改保留，需再次同步');
      if (firstDownload)
        initialRecords.forEach(function (r) {
          if (
            !imageData.some(function (v) {
              return v.id === r.id;
            })
          )
            imageData.push({ id: r.id, deleted: true });
        });
      phase('正在应用数据与图片…');
      await imagePut(imageData);
      if (firstDownload)
        Object.keys(initial).forEach(function (k) {
          if (!(k in merged.stores)) localStorage.removeItem(k);
        });
      Object.keys(merged.stores).forEach(function (k) {
        if (!/^crm_/.test(k) || /sync|token|secret/i.test(k)) throw new Error('云端数据包含不允许的键');
      });
      Object.keys(merged.stores).forEach(function (k) {
        localStorage.setItem(k, JSON.stringify(merged.stores[k]));
      });
      localStorage.setItem(
        baseStorageKey(c),
        JSON.stringify({ stores: merged.stores, images: merged.images })
      );
      inquiries = merged.stores[SK.inq] || [];
      customers = merged.stores[SK.cust] || [];
      orders = merged.stores[SK.ord] || [];
      saleRecords = merged.stores[SK.sale] || [];
      quoteRecords = merged.stores[SK.quote] || [];
      prodProjects = merged.stores[SK.prod] || [];
      crmSettings = merged.stores[SK.settings] || crmSettings;
      ensureOrderNumbers();
      nextInqId =
        Math.max(
          nextInqId,
          1,
          ...inquiries.map(function (i) {
            return Number(i.id) || 0;
          })
        ) + 1;
      nextCustId =
        Math.max(
          nextCustId,
          1,
          ...customers.map(function (c) {
            return Number(c.id) || 0;
          })
        ) + 1;
      nextSaleId =
        Math.max(
          nextSaleId,
          1,
          ...saleRecords.map(function (i) {
            return Number(i.id) || 0;
          })
        ) + 1;
      nextQuoteId =
        Math.max(
          nextQuoteId,
          1,
          ...quoteRecords.map(function (i) {
            return Number(i._num) || 0;
          })
        ) + 1;
      refreshAll();
      rebuildProductSelects();
      complete(
        merged,
        !remote || !same({ stores: remote.stores, images: remote.images || {} }, merged)
          ? next.revision
          : remote.revision
      );
    } catch (error) {
      if (activeRun) activeRun.controller.abort();
      status(error.message + '；本地数据保留');
    } finally {
      clearInterval(progressTimer);
      activeRun = null;
      running = false;
      controls();
    }
  }
  function mount() {
    var host = document.querySelector('#page-settings .page-content>div');
    if (!host) return;
    var box = document.createElement('div');
    box.style.cssText = 'border-top:2px solid var(--border);margin-top:24px;padding-top:20px';
    box.innerHTML =
      '<div style="font-weight:600">☁ GitHub私有数据同步（个人试跑 · v59）</div><div style="font-size:12px;color:var(--muted);margin:8px 0">默认仅本次页面使用；勾选记住此设备后，下次打开可继续同步。请先导出备份。</div><input id="crm-sync-repository" class="form-input" aria-label="私有数据仓库"><input id="crm-sync-branch" class="form-input" aria-label="分支"><input id="crm-sync-token" type="password" autocomplete="off" class="form-input" placeholder="GitHub细粒度令牌（已记住时可留空）"><label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input id="crm-sync-remember" type="checkbox">记住此设备（仅限自己的手机或电脑）</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button id="crm-sync-run" class="btn btn-primary">同步数据</button><button id="crm-sync-cancel" class="btn btn-outline" style="display:none" hidden>取消本次同步</button><button id="crm-sync-init" class="btn btn-outline">首次初始化私有仓库</button><button id="crm-sync-update" class="btn btn-outline">更新应用</button><button id="crm-sync-forget" class="btn btn-outline">取消授权</button><button id="crm-sync-export" class="btn btn-outline">导出完整数据及图片</button></div><div id="crm-sync-status" style="font-size:12px;margin-top:8px;overflow-wrap:anywhere">未连接；当前修改仅保存在本机</div><div id="crm-sync-last" style="font-size:12px;color:var(--muted);margin-top:6px"></div><div id="crm-sync-conflicts" hidden></div>';
    var fab = document.createElement('button');
    fab.id = 'crm-sync-fab';
    fab.className = 'btn btn-primary btn-sm';
    fab.textContent = '☁ 同步';
    fab.style.cssText = 'position:fixed;right:14px;bottom:76px;z-index:250;box-shadow:0 2px 10px #0005';
    fab.onclick = function () {
      showPage('settings');
      box.scrollIntoView({ block: 'start' });
    };
    document.body.appendChild(fab);
    host.prepend(box);
    var c = config();
    document.getElementById('crm-sync-repository').value = c.repository;
    document.getElementById('crm-sync-branch').value = c.branch;
    lastSuccess();
    var remembered = restoreDevice(c);
    document.getElementById('crm-sync-remember').checked = remembered;
    if (remembered) status('已记住此设备，正在准备同步');
    document.getElementById('crm-sync-forget').onclick = function () {
      try {
        forgetDevice();
      } catch (e) {
        status(e.message);
      }
    };
    document.getElementById('crm-sync-remember').onchange = function () {
      try {
        if (running) {
          this.checked = !!localStorage.getItem(credentialKey);
          throw new Error('同步正在进行，请稍后修改记住设置');
        }
        if (!this.checked) {
          localStorage.removeItem(credentialKey);
          status('已关闭记住此设备；当前页面仍可同步，重新打开需填写令牌');
        } else {
          setConfig();
          status(secret ? '已记住此设备' : '请填写令牌后点击同步数据，以记住此设备');
        }
      } catch (e) {
        status(e.message);
      }
    };
    document.getElementById('crm-sync-update').onclick = async function () {
      if (running) {
        status('同步正在进行，请完成后更新应用');
        return;
      }
      try {
        status('正在检查应用更新…');
        var url = new URL(location.href);
        url.searchParams.set('appUpdate', Date.now());
        var response = await fetch(url.href, { cache: 'no-store' });
        if (!response.ok) throw new Error('应用更新暂不可用');
        if ('serviceWorker' in navigator) {
          var reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        }
        location.replace(url.href);
      } catch (e) {
        status('更新未完成，请联网后重试；本机数据和授权保留');
      }
    };
    document.getElementById('crm-sync-cancel').onclick = cancelSync;
    document.getElementById('crm-sync-export').onclick = exportPortableBackup;
    document.getElementById('crm-sync-run').onclick = function () {
      try {
        setConfig();
        sync(false);
      } catch (e) {
        status(e.message);
      }
    };
    document.getElementById('crm-sync-init').onclick = function () {
      try {
        setConfig();
        if (confirm('仅在私有仓库为空时上传当前本机基准，确认已备份？')) sync(true);
      } catch (e) {
        status(e.message);
      }
    };
    if (remembered)
      setTimeout(function () {
        if (secret && !running) sync(false, 'auto');
      }, 500);
    setInterval(function () {
      if (secret && !running && document.visibilityState === 'visible') sync(false, 'auto');
    }, 180000);
    document.addEventListener('visibilitychange', function () {
      if (secret && document.visibilityState === 'visible' && !running) sync(false, 'auto');
    });
    window.addEventListener('pagehide', function () {
      if (secret && !running) sync(false);
    });
    window.addEventListener('crm-data-changed', function () {
      if (!running) status('有待同步修改；当前已保存到本机');
    });
    window.addEventListener('crm-image-changed', function () {
      status('图片有待同步修改');
    });
  }
  root.CrmDataSync = {
    merge: merge,
    validateStores: validateStores,
    restorePortable: restorePortable,
    capture: capture,
    sync: sync,
    cancel: cancelSync,
    isRunning: function () {
      return running;
    },
    mount: mount
  };
  mount();
})(window);
