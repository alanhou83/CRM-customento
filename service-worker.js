const CACHE_NAME = 'customento-crm-v60';
const STATIC_ASSETS = [
  '/CRM-customento/crm-v5_final_5.html',
  '/CRM-customento/manifest.json',
  '/CRM-customento/crm-production.js?v=60',
  '/CRM-customento/crm-process-library.js?v=60',
  '/CRM-customento/crm-process-ui.js?v=60',
  '/CRM-customento/crm-production-ui.js?v=60',
  '/CRM-customento/crm-production.css?v=60',
  '/CRM-customento/crm-image-codec.js?v=60',
  '/CRM-customento/crm-cbos-delta.js?v=60',
  '/CRM-customento/crm-data-sync.js?v=60',
  '/CRM-customento/icon-192.png',
  '/CRM-customento/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS.map(url => new Request(url, {cache:'reload'}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 带授权或跨域请求交由浏览器直接处理，私有数据不进入静态缓存。
  if(url.origin!==self.location.origin||e.request.headers.has('Authorization'))return;
  // HTML 文件：网络优先，离线时回退缓存
  if (url.pathname.endsWith('.html') || e.request.destination === 'document' || /crm-(image-codec|cbos-delta|data-sync|production|production-ui|process-library|process-ui)\.js$/.test(url.pathname) || /crm-production\.css$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request, {cache:'no-cache'}).then(res => {
        if(!res.ok)throw new Error('应用资源暂不可用');
        const clone = res.clone();
        e.waitUntil(caches.open(CACHE_NAME).then(c => c.put(e.request, clone)));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // 静态资源：缓存优先
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
