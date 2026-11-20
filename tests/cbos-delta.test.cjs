const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('crm-cbos-delta.js','utf8'),ctx);const plan=ctx.window.CrmCbosDelta.plan;
const state={crm_inq_v5:[{id:1,sourceImportId:'A',status:'互动中',notes:'旧需求',followups:[],cbosBaseline:{status:'互动中',notes:'旧需求'}}],crm_settings_v5:{},crm_ord_v5:[{id:3,amount:8000}]};
const delta={schemaVersion:1,source:'CBOS',batchId:'b1',inquiries:[{sourceImportId:'A',revision:2,fields:{status:'打样中',notes:''}},{sourceImportId:'B',revision:1,fields:{alias:'新客',status:'新询盘'}}],followups:[{eventId:'e1',inquiryId:'A',revision:1,date:'',person:'Alan',content:'新增跟进'}]};
let result=plan(state,delta);assert.equal(result.conflicts.length,0);assert.equal(result.stores.crm_inq_v5[0].status,'打样中');assert.equal(result.stores.crm_inq_v5[0].notes,'旧需求');assert.equal(result.stats.added,1);assert.equal(result.stats.followups,1);assert.equal(result.stores.crm_ord_v5[0].amount,8000);assert.equal(state.crm_inq_v5[0].status,'互动中');
assert.equal(plan(result.stores,delta).stats.followups,0);
const changed=JSON.parse(JSON.stringify(state));changed.crm_inq_v5[0].status='追单中';assert.equal(plan(changed,delta).conflicts.length,1);assert.equal(plan(changed,delta,{'/cbos/A/status':'remote'}).conflicts.length,0);
assert.throws(()=>plan(state,{...delta,followups:[{...delta.followups[0],inquiryId:'不存在'}]}));
console.log('CBOS增量：新增/非空更新/事件去重/冲突/未知日期/订单隔离通过');
