// 只使用匿名夹具，验证生产与库存/采购/同步的数量约束。
const assert = require('node:assert/strict');
const M = require('../crm-production.js');
let seq = 0;
const ctx = () => ({ id: 'evt-' + ++seq, person: '主管', at: '2026-11-22T01:00:00Z' });
const clone = (x) => JSON.parse(JSON.stringify(x));
function fixture() {
  return {
    production: M.empty(),
    catalog: {
      products: [
        { id: 'p', nameCN: '标准产品', hasStock: true, skus: [{ skuCode: 'FG-0001-01', stockUnit: '个' }] },
        { id: 'r', nameCN: '板材', hasStock: true, skus: [{ skuCode: 'RAW-0001-01', stockUnit: '张' }] }
      ]
    },
    orders: [
      {
        id: 'o1',
        orderNumber: 'PI-20261122-01',
        items: [{ id: 'a', skuCode: 'FG-0001-01', nameCN: '标准产品', qty: 144, unit: '个' }]
      },
      {
        id: 'o2',
        orderNumber: 'PI-20261122-02',
        items: [{ id: 'b', skuCode: 'FG-0001-01', nameCN: '标准产品', qty: 288, unit: '个' }]
      }
    ],
    inventory: { movements: [{ id: 'opening', skuCode: 'RAW-0001-01', qty: 40 }], documents: [] },
    procurement: { suppliers: [{ id: 'sup', name: '匿名供应商' }], pos: [] }
  };
}
function batch(s, ids = ['o1'], merge = false) {
  return M.createBatch(s, ids, merge, ctx(), '匿名工单');
}
function material(s, b, target = 80) {
  const m = M.addMaterial(s, b.id, 'RAW-0001-01', ctx());
  M.updateMaterial(s, m.id, { target, checked: true, uses: [], note: '' }, ctx());
  return m;
}
let s = fixture(),
  b = batch(s, ['o1', 'o2'], true);
assert.equal(s.production.products.length, 1);
assert.equal(s.production.products[0].qty, 432);
assert.equal(s.production.products[0].sources.length, 2);
assert.throws(() => batch(s, ['o1']), /已有工单/);
const m = material(s, b);
const unmerged = fixture();
batch(unmerged, ['o1', 'o2']);
assert.equal(unmerged.production.products.length, 2);
M.reserve(s, m.id, 30, false, ctx());
assert.equal(M.stock(s, m.skuCode), 40);
assert.equal(M.free(s, m.skuCode), 10);
assert.equal(M.balance(s, m).gap, 50);
M.moveMaterial(s, m.id, 20, false, ctx(), '操作员甲');
assert.equal(M.stock(s, m.skuCode), 20);
assert.equal(M.reserved(s, m.id), 10);
assert.equal(M.balance(s, m).issued, 20);
assert.equal(M.balance(s, m).gap, 50);
assert.equal(s.inventory.documents.length, 1);
M.consume(s, m.id, 12, 2, '实测', ctx());
assert.equal(M.balance(s, m).unused, 8);
assert.equal(M.stock(s, m.skuCode), 20);
assert.throws(() => M.moveMaterial(s, m.id, 9, true, ctx(), '操作员甲'), /退料超过/);
M.moveMaterial(s, m.id, 8, true, ctx(), '操作员甲');
assert.equal(M.stock(s, m.skuCode), 28);
assert.equal(M.reserved(s, m.id), 10);
assert.equal(M.balance(s, m).gap, 58);
assert.throws(() => M.moveMaterial(s, m.id, 11, false, ctx(), '操作员甲'), /领料超过/);
M.reserve(s, m.id, 18, false, ctx());
assert.equal(M.free(s, m.skuCode), 0);
assert.equal(M.balance(s, m).gap, 40);
const po = M.createProcurement(s, [{ materialId: m.id, qty: 40 }], 'sup', 'CNY', ctx(), 'PO-TEST');
assert.equal(po.stage, '草稿');
assert.equal(M.stock(s, m.skuCode), 28);
assert.equal(M.balance(s, m).draft, 40);
assert.equal(M.balance(s, m).gap, 0);
assert.throws(
  () => M.createProcurement(s, [{ materialId: m.id, qty: 40 }], 'sup', 'CNY', ctx(), 'PO-TEST2'),
  /超过/
);
po.stage = '已发PO';
assert.equal(M.balance(s, m).draft, 0);
assert.equal(M.balance(s, m).ordered, 40);
po.items[0].qty = 30;
assert.equal(M.balance(s, m).gap, 10);
po.items[0].qty = 40;
s.inventory.documents.push({
  id: 'receipt',
  sourceType: 'po',
  sourceId: po.id,
  direction: 'in',
  status: '已确认',
  items: [{ skuCode: m.skuCode, actualQty: 15 }]
});
s.inventory.movements.push({ id: 'receipt-move', skuCode: m.skuCode, qty: 15 });
assert.equal(M.balance(s, m).ordered, 25);
assert.equal(M.balance(s, m).gap, 15);
M.reserve(s, m.id, 15, false, ctx());
assert.equal(M.balance(s, m).gap, 0);
const p = s.production.products[0],
  route = [
    { id: 'laser', name: '切割', assignees: ['操作员甲', '操作员乙'], rate: '', requirements: '' },
    { id: 'pack', name: '包装', assignees: ['操作员乙'], rate: '', requirements: '' }
  ];
M.setRoute(s, p.id, route, '按本单要求包装', ctx());
M.releaseRoute(s, p.id, false);
const rctx = ctx();
M.report(
  s,
  p.id,
  'laser',
  {
    qty: 500,
    people: ['操作员甲', '操作员乙'],
    bad: 10,
    hours: [
      { person: '操作员甲', hours: 2 },
      { person: '操作员乙', hours: 1 }
    ]
  },
  rctx
);
assert.equal(M.totals(s, p.id, 'laser').reported, 500);
assert.equal(s.production.reports[0].over, 68);
M.report(s, p.id, 'laser', { qty: 500, people: ['操作员甲'] }, rctx);
assert.equal(s.production.reports.length, 1);
assert.throws(() => M.confirmReport(s, rctx.id, 490, '', ctx()), /说明/);
M.confirmReport(s, rctx.id, 490, '核实超产，保留实际数量', ctx());
assert.equal(M.totals(s, p.id, 'laser').confirmed, 490);
const pack = M.report(s, p.id, 'pack', { qty: 500, people: ['操作员乙'] }, ctx());
assert.equal(pack.previousWarning, true);
assert.throws(() => M.confirmReport(s, pack.id, 500, '交接', ctx()), /上道/);
M.confirmReport(s, pack.id, 490, '核对后确认490', ctx());
assert.throws(() => M.voidReport(s, rctx.id, '更正', ctx()), /后道/);
M.voidReport(s, pack.id, '先更正后道', ctx());
M.voidReport(s, rctx.id, '更正切割', ctx());
assert.equal(M.totals(s, p.id, 'laser').reported, 0);
const template = M.configFromBatch(s, b.id),
  next = fixture(),
  nextB = batch(next, ['o1']);
M.copyConfig(next, nextB.id, template, ctx());
const nm = next.production.materials[0];
assert.equal(nm.target, null);
assert.equal(nm.referenceTarget, 80);
assert.equal(nm.checkedAt, '');
assert.equal(M.balance(next, nm).reserved, 0);
assert.equal(M.balance(next, nm).issued, 0);
assert.equal(next.procurement.pos.length, 0);
assert.equal(next.production.products[0].route[0].assignees.length, 0);
M.validate(s);
M.validate(next);
const race = fixture(),
  ra = batch(race, ['o1']),
  rb = batch(race, ['o2']),
  ma = material(race, ra, 30),
  mb = material(race, rb, 30);
M.reserve(race, ma.id, 30, false, ctx());
assert.throws(() => M.reserve(race, mb.id, 30, false, ctx()), /不足/);
const raceRemote = clone(race);
raceRemote.production.reservations.push({
  id: 'other-device',
  batchId: rb.id,
  materialId: mb.id,
  skuCode: mb.skuCode,
  qty: 30
});
assert.throws(() => M.validate(raceRemote), /库存不足/);
const raceIssue = clone(race);
M.moveMaterial(raceIssue, ma.id, 20, false, ctx(), '甲');
raceIssue.inventory.movements.push({ ...raceIssue.inventory.movements.at(-1), id: 'other-issue' });
assert.throws(() => M.validate(raceIssue), /超出/);
const altered = clone(next);
altered.orders[0].items[0].qty = 100;
assert.equal(M.orderDrift(altered, altered.production.products[0]), true);
assert.throws(
  () => M.validateStores({ crm_inv_v5: { movements: [{ productionMaterialId: 'missing' }] } }),
  /缺少生产/
);
console.log(
  '生产规则通过：合单、稳定来源、防重复、预留领退投入、采购覆盖、多人报工、超产交接、更正、模板及多设备冲突。'
);
// 多设备分别创建同一明细的工单/采购，合并后必须拦截，不能靠各设备单独校验。
const dup = fixture(),
  one = batch(dup, ['o1']);
const duplicatedProduct = clone(dup.production.products[0]);
duplicatedProduct.id = 'duplicate-task';
dup.production.products.push(duplicatedProduct);
assert.throws(() => M.validate(dup), /重复建工单/);
const doublePO = clone(s);
doublePO.procurement.pos.push({ ...clone(po), id: 'another-device-po' });
assert.throws(() => M.validate(doublePO), /覆盖超过|单号重复/);
const changed = fixture(),
  cb = batch(changed, ['o1']),
  cp = changed.production.products[0];
changed.orders[0].items[0].qty = 200;
M.reconcileOrder(changed, cp.id, '客户确认改量', ctx());
assert.equal(cp.qty, 200);
assert.equal(changed.production.planChanges[0].beforeQty, 144);
assert.equal(cp.materialsNeedReview, true);
const timed = fixture(),
  tb = batch(timed, ['o1']),
  tp = timed.production.products[0];
M.setRoute(timed, tp.id, [{ id: 'step-time', name: '工序', assignees: ['甲', '乙'] }], '', ctx());
M.releaseRoute(timed, tp.id, false);
const tr = M.report(timed, tp.id, 'step-time', { qty: 100, people: ['甲', '乙'] }, ctx());
M.updateReportTime(
  timed,
  tr.id,
  [
    { person: '甲', hours: 2 },
    { person: '乙', hours: 1 }
  ],
  '',
  '后补工时',
  ctx()
);
assert.equal(tr.timeChanges.length, 1);
assert.equal(tr.qty, 100);
assert.throws(
  () =>
    M.updateReportTime(
      timed,
      tr.id,
      [
        { person: '甲', hours: 1 },
        { person: '甲', hours: 2 }
      ],
      '',
      '',
      ctx()
    ),
  /重复/
);
const used = fixture(),
  ub = batch(used),
  um = material(used, ub, 40);
M.reserve(used, um.id, 40, false, ctx());
M.moveMaterial(used, um.id, 10, false, ctx(), '甲');
M.consume(used, um.id, 10, 0, '误填', ctx());
M.voidConsumption(used, used.production.consumptions[0].id, '纠正实际投入', ctx());
assert.equal(M.balance(used, um).unused, 10);
assert.equal(M.stock(used, um.skuCode), 30);
console.log('生产补充通过：合并重复单据、订单改量追溯、工时更正和投入撤销。');

const vm = require('node:vm'),
  fs = require('node:fs');
const sandbox = {
  window: { CrmProductionModel: M },
  document: { querySelector: () => null },
  localStorage: { getItem: () => null }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('crm-data-sync.js', 'utf8'), sandbox);
assert.throws(
  () =>
    sandbox.window.CrmDataSync.validateStores({
      crm_production_v1: raceRemote.production,
      crm_inv_v5: raceRemote.inventory,
      crm_prodcat_v5: raceRemote.catalog,
      crm_proc_v5: raceRemote.procurement,
      crm_ord_v5: raceRemote.orders
    }),
  /库存不足/
);
const drift = fixture(),
  db = batch(drift, ['o1']),
  dp = drift.production.products[0];
M.setRoute(drift, dp.id, [{ id: 'drift-step', name: '工序', assignees: ['甲'] }], '', ctx());
M.releaseRoute(drift, dp.id, false);
drift.orders[0].items[0].qty = 200;
const dr = M.report(drift, dp.id, 'drift-step', { qty: 100, people: ['甲'] }, ctx());
assert.equal(dr.orderWarning, true);
assert.throws(() => M.confirmReport(drift, dr.id, 100, '', ctx()), /先核对/);
M.reconcileOrder(drift, dp.id, '核对改量', ctx());
M.confirmReport(drift, dr.id, 100, '', ctx());
assert.equal(dr.status, 'confirmed');
console.log('同步入口校验及订单变更仍可记录真实报工通过。');
