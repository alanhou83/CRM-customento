const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const context={window:{},document:{querySelector:()=>null},localStorage:{getItem:()=>null}};vm.createContext(context);vm.runInContext(fs.readFileSync('crm-data-sync.js','utf8'),context);const merge=context.window.CrmDataSync.merge;
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(merge({a:1},{a:2},{a:1})),{a:2});
assert.deepEqual(plain(merge({a:1,b:1},{a:2,b:1},{a:1,b:3})),{a:2,b:3});
let conflicts=[];merge({a:1},{a:2},{a:3},'',conflicts);assert.equal(conflicts.length,1);
assert.deepEqual(plain(merge({a:1},{a:2},{a:3},'',[],{'/a':'remote'})),{a:3});
assert.deepEqual(plain(merge([{id:1,a:1}],[{id:1,a:2}],[{id:1,a:1},{id:2,a:5}])),[{id:1,a:2},{id:2,a:5}]);
assert.deepEqual(plain(merge(['旧跟进'],['旧跟进','本地跟进'],['旧跟进','云端跟进'])),['旧跟进','本地跟进','云端跟进']);
conflicts=[];merge([], [{id:1,name:'A'}],[{id:1,name:'B'}],'',conflicts);assert.ok(conflicts.length>0);
assert.deepEqual(plain(merge([{id:1,a:1}],[],[{id:1,a:1}])),[]);
conflicts=[];merge([{id:1,a:1}],[],[{id:1,a:2}],'',conflicts);assert.ok(conflicts.length);
console.log('同步三方合并9项通过');

assert.throws(()=>context.window.CrmDataSync.validateStores({crm_fin_v6:{transactions:[{id:'t',amount:5000,currency:'USD'}],receiptAllocations:[{transactionId:'t',status:'active',currency:'USD',amount:4000},{transactionId:'t',status:'active',currency:'USD',amount:4000}]}}));
