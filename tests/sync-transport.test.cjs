// 匿名同步集成：网络/图片复用、设备拉取、超时取消及并发写入保护。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const copy = (x) => JSON.parse(JSON.stringify(x));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const repository = 'example/private-data';
const configKey = 'crm_sync_config_v1';
const baseKey = 'crm_sync_base_v1:' + repository + ':main';
const SK = {
  inq: 'crm_inq_v5',
  cust: 'crm_cust_v5',
  ord: 'crm_ord_v5',
  sale: 'crm_sale_v5',
  quote: 'crm_quote_v5',
  prod: 'crm_prod_v5',
  settings: 'crm_settings_v5',
  user: 'crm_user_v5'
};
function image(value, id) {
  const detail = Buffer.from(value),
    thumb = Buffer.from(value + '-thumb');
  function info(bytes) {
    const sha = createHash('sha256').update(bytes).digest('hex');
    return { path: 'images/' + sha + '.png', sha256: sha, mime: 'image/png', bytes: bytes.length };
  }
  return {
    record: {
      id,
      img: 'data:image/png;base64,' + detail.toString('base64'),
      thumb: 'data:image/png;base64,' + thumb.toString('base64'),
      meta: { width: 2, height: 2 }
    },
    entry: { id, width: 2, height: 2, detail: info(detail), thumb: info(thumb) },
    files: { [info(detail).path]: detail.toString('base64'), [info(thumb).path]: thumb.toString('base64') }
  };
}
function harness() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        checked: false,
        hidden: false,
        disabled: false,
        textContent: '',
        style: {},
        prepend() {},
        append() {},
        appendChild() {},
        replaceChildren() {},
        scrollIntoView() {}
      });
    return elements.get(id);
  }
  const storage = new Map([[configKey, JSON.stringify({ repository, branch: 'main' })]]);
  const stores = { crm_inq_v5: [{ id: 1, name: '匿名询盘', status: '待跟进' }], crm_settings_v5: {} };
  for (const [k, v] of Object.entries(stores)) storage.set(k, JSON.stringify(v));
  const a = image('anonymous-a', 'a'),
    b = image('anonymous-a', 'b');
  const records = new Map([
    ['a', a.record],
    ['b', b.record]
  ]);
  const initial = { stores: copy(stores), images: { 'string:a': a.entry, 'string:b': b.entry } };
  storage.set(baseKey, JSON.stringify(initial));
  let remote = { schemaVersion: 1, revision: 5, ...copy(initial) },
    sha = 'remote-5',
    requests = [],
    mode = '',
    getCount = 0,
    imageDBClosed = 0,
    backupWrites = 0,
    lateRequest;
  const files = { ...a.files },
    backups = new Map();
  function db(map, shared) {
    return {
      close() {
        if (shared) imageDBClosed++;
      },
      transaction() {
        let aborted = false;
        const pending = [],
          tx = {
            abort() {
              aborted = true;
              if (tx.onabort) tx.onabort();
            },
            objectStore() {
              return {
                getAll() {
                  const req = {};
                  queueMicrotask(() => {
                    req.result = copy([...map.values()]);
                    if (req.onsuccess) req.onsuccess();
                  });
                  return req;
                },
                put(v, key) {
                  pending.push(() => {
                    map.set(key || v.id, copy(v));
                    if (!shared) backupWrites++;
                  });
                },
                delete(id) {
                  pending.push(() => map.delete(id));
                }
              };
            }
          };
        setTimeout(() => {
          if (aborted) return;
          pending.forEach((f) => f());
          if (tx.oncomplete) tx.oncomplete();
        }, 0);
        return tx;
      }
    };
  }
  const context = {
    window: { addEventListener() {} },
    document: {
      querySelector: () => element('host'),
      getElementById: element,
      createElement: () => element('created-' + elements.size),
      body: { appendChild() {} },
      addEventListener() {},
      visibilityState: 'visible'
    },
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k)
    },
    SK,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortController,
    URL,
    Blob,
    atob: (x) => Buffer.from(x, 'base64').toString('binary'),
    btoa: (x) => Buffer.from(x, 'binary').toString('base64'),
    confirm: () => true,
    setTimeout: (f, ms) => {
      const t = setTimeout(f, ms === 20000 || ms === 45000 || ms === 15000 ? 70 : ms);
      t.unref();
      return t;
    },
    clearTimeout,
    setInterval: (f, ms) => {
      const t = setInterval(f, ms);
      t.unref();
      return t;
    },
    clearInterval,
    openImgDB: (cb) => cb(db(records, true)),
    indexedDB: {
      open() {
        const req = {};
        queueMicrotask(() => {
          req.result = db(backups);
          if (mode === 'blocked') {
            lateRequest = req;
            req.onblocked();
          } else req.onsuccess();
        });
        return req;
      }
    },
    CrmImageCodec: {
      prepare() {
        throw new Error('不应重复压缩带缩略图的文件');
      }
    },
    inquiries: [],
    customers: [],
    orders: [],
    saleRecords: [],
    quoteRecords: [],
    prodProjects: [],
    crmSettings: {},
    nextInqId: 1,
    nextCustId: 1,
    nextSaleId: 1,
    nextQuoteId: 1,
    ensureOrderNumbers() {},
    refreshAll() {},
    rebuildProductSelects() {}
  };
  context.fetch = async (url, options) => {
    const path = url.split('/repos/' + repository)[1].split('?')[0],
      method = options.method || 'GET';
    requests.push({ path, method });
    if (mode === 'hang' || mode === 'hang-body') {
      if (mode === 'hang') return new Promise(() => {});
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    }
    function response(value, status = 200) {
      return { ok: status === 200, status, json: async () => copy(value) };
    }
    if (path === '') return response({ private: true });
    if (path === '/contents/state/snapshot.json') {
      if (method === 'PUT') {
        const body = JSON.parse(options.body);
        if (body.sha !== sha) return response({}, 409);
        remote = JSON.parse(Buffer.from(body.content, 'base64'));
        sha = 'new-' + remote.revision;
        return response({ content: { sha } });
      }
      getCount++;
      if (mode === 'cloud-race' && getCount === 2) sha = 'another-device';
      if (mode === 'local-race') storage.set(SK.inq, JSON.stringify([{ id: 1, name: '保留本机新修改' }]));
      return response({ sha, content: Buffer.from(JSON.stringify(remote)).toString('base64') });
    }
    if (path === '/contents/cbos/manifest.json') return response({}, 404);
    if (path.startsWith('/contents/images/')) {
      const file = path.slice('/contents/'.length);
      if (method === 'PUT') {
        files[file] = JSON.parse(options.body).content;
        return response({});
      }
      if (!files[file]) return response({}, 404);
      return response({
        content: mode === 'corrupt-image' ? Buffer.from('bad').toString('base64') : files[file]
      });
    }
    throw new Error('未预期请求 ' + path);
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('crm-data-sync.js', 'utf8'), context);
  async function run() {
    element('crm-sync-token').value = 'anonymous-test-token';
    element('crm-sync-run').onclick();
    while (context.window.CrmDataSync.isRunning()) await wait(2);
  }
  return {
    context,
    storage,
    records,
    files,
    element,
    run,
    state: () => ({ remote, requests, imageDBClosed, backupWrites }),
    setMode: (v) => {
      mode = v;
      getCount = 0;
    },
    resetRequests: () => {
      requests = [];
      getCount = 0;
    },
    updateRemote: (f) => f(remote),
    lateBackup: () => {
      lateRequest.onsuccess();
    }
  };
}
(async () => {
  const h = harness();
  await h.run();
  assert.match(h.element('crm-sync-status').textContent, /^已同步/);
  assert.equal(h.state().requests.length, 3);
  assert.equal(h.state().backupWrites, 0);
  assert.equal(h.state().imageDBClosed, 0);
  h.resetRequests();
  h.updateRemote((r) => {
    r.stores = Object.fromEntries(Object.entries(r.stores).reverse());
    r.images = Object.fromEntries(Object.entries(r.images).reverse());
  });
  await h.run();
  assert.equal(h.state().requests.length, 3);
  assert.equal(h.state().requests.filter((r) => r.method === 'PUT').length, 0);
  h.resetRequests();
  h.updateRemote((r) => {
    r.revision = 6;
    r.stores.crm_inq_v5[0].status = '云端跟进已更新';
  });
  await h.run();
  assert.equal(JSON.parse(h.storage.get(SK.inq))[0].status, '云端跟进已更新');
  assert.equal(h.state().requests.filter((r) => r.path.includes('/images/')).length, 0);
  assert.equal(h.state().requests.filter((r) => r.method === 'PUT').length, 0);
  assert.match(h.element('crm-sync-last').textContent, /数据版本6/);
  const c = image('anonymous-new', 'c'),
    d = image('anonymous-new', 'd');
  Object.assign(h.files, c.files);
  h.updateRemote((r) => {
    r.images['string:c'] = c.entry;
    r.images['string:d'] = d.entry;
  });
  h.resetRequests();
  await h.run();
  assert.equal(h.state().requests.filter((r) => r.path.includes('/images/')).length, 2);
  assert.equal(h.records.size, 4);
  h.resetRequests();
  const e = image('anonymous-local', 'e');
  h.records.set('e', e.record);
  await h.run();
  assert.equal(h.state().requests.filter((r) => r.path.includes('/images/') && r.method === 'PUT').length, 2);
  assert.equal(h.state().requests.filter((r) => r.path.includes('/images/') && r.method === 'GET').length, 2);
  assert.ok(h.state().remote.images['string:e']);
  assert.equal(h.state().imageDBClosed, 0);
  const snapshot = h.storage.get(SK.inq),
    success = h.storage.get('crm_sync_last_success_v1');
  for (const mode of ['hang', 'hang-body']) {
    h.setMode(mode);
    await h.run();
    assert.match(h.element('crm-sync-status').textContent, /超时/);
    assert.equal(h.context.window.CrmDataSync.isRunning(), false);
    assert.equal(h.element('crm-sync-run').disabled, false);
    assert.equal(h.storage.get(SK.inq), snapshot);
    assert.equal(h.storage.get('crm_sync_last_success_v1'), success);
  }
  h.setMode('hang');
  h.element('crm-sync-token').value = 'anonymous-test-token';
  h.element('crm-sync-run').onclick();
  h.context.window.CrmDataSync.cancel();
  while (h.context.window.CrmDataSync.isRunning()) await wait(2);
  assert.match(h.element('crm-sync-status').textContent, /已取消/);
  h.setMode('');
  await h.run();
  assert.match(h.element('crm-sync-status').textContent, /^已同步/);
  const race = harness();
  race.updateRemote((r) => {
    r.stores.crm_inq_v5[0].status = '远端修改';
  });
  race.setMode('cloud-race');
  await race.run();
  assert.match(race.element('crm-sync-status').textContent, /另一设备已更新/);
  assert.equal(JSON.parse(race.storage.get(SK.inq))[0].status, '待跟进');
  const local = harness();
  local.setMode('local-race');
  await local.run();
  assert.match(local.element('crm-sync-status').textContent, /本地发生修改/);
  assert.equal(JSON.parse(local.storage.get(SK.inq))[0].name, '保留本机新修改');
  const corrupt = harness();
  const changed = image('changed', 'a');
  Object.assign(corrupt.files, changed.files);
  corrupt.updateRemote((r) => {
    r.images['string:a'] = changed.entry;
  });
  corrupt.setMode('corrupt-image');
  const prior = copy([...corrupt.records]);
  await corrupt.run();
  assert.match(corrupt.element('crm-sync-status').textContent, /校验失败/);
  assert.deepEqual([...corrupt.records], prior);
  const blocked = harness();
  blocked.updateRemote((r) => {
    r.stores.crm_inq_v5[0].status = '待下载';
  });
  blocked.setMode('blocked');
  await blocked.run();
  assert.match(blocked.element('crm-sync-status').textContent, /占用/);
  blocked.lateBackup();
  await wait(3);
  assert.equal(blocked.state().backupWrites, 0);
  const first = harness();
  first.storage.delete(baseKey);
  first.records.set('old-junk', { id: 'old-junk', img: 'unsupported-old-demo' });
  await first.run();
  assert.match(first.element('crm-sync-status').textContent, /^已同步/);
  assert.equal(first.records.has('old-junk'), false);
  assert.equal(first.state().requests.filter((r) => r.method === 'PUT').length, 0);
  assert.equal(first.state().requests.filter((r) => r.path.includes('/images/')).length, 2);
  assert.equal(first.state().backupWrites, 1);
  const rejected = harness();
  rejected.storage.delete(baseKey);
  rejected.context.confirm = () => false;
  const initialRejected = copy([...rejected.records]);
  await rejected.run();
  assert.match(rejected.element('crm-sync-status').textContent, /已取消/);
  assert.deepEqual([...rejected.records], initialRejected);
  assert.equal(rejected.state().backupWrites, 0);
  console.log(
    '同步传输通过：未变化仅3请求/零图片传输、云端文字一次拉取、共享图片去重、新图只传一次、网络及响应体超时/取消后重试、版本竞争/本机修改/校验失败保留数据、数据库阻塞迟到不写入。'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
