// 匿名夹具：验证方案版本、不同材料排版、任务重组和组合报工的事实边界。
const assert = require('node:assert/strict');
const M = require('../crm-production.js');
const X = require('../crm-process-library.js');
let seq = 0;
const ctx = () => ({ id: 'x-' + ++seq, at: '2026-11-23T02:00:00Z', person: '主管' });
const clone = (x) => JSON.parse(JSON.stringify(x));
function fixture() {
  const catalog = {
    products: [
      {
        id: 'fg',
        nameCN: '匿名产品',
        categoryCode: 'FG',
        hasStock: true,
        skus: [{ skuCode: 'FG-0001-01', stockUnit: '个' }]
      },
      {
        id: 'raw',
        type: 'raw',
        nameCN: '匿名板材',
        hasStock: true,
        skus: [
          { skuCode: 'RAW-0001-01', stockUnit: '张' },
          { skuCode: 'RAW-0001-02', stockUnit: '张' }
        ]
      },
      {
        id: 'pkg',
        type: 'packaging',
        nameCN: '匿名箱',
        hasStock: true,
        skus: [{ skuCode: 'PKG-0001-01', stockUnit: '只' }]
      }
    ]
  };
  return {
    production: M.empty(),
    catalog,
    orders: [
      { id: 'o1', items: [{ id: 'i1', skuCode: 'FG-0001-01', nameCN: '匿名产品', qty: 60, unit: '个' }] },
      { id: 'o2', items: [{ id: 'i2', skuCode: 'FG-0001-01', nameCN: '匿名产品', qty: 41, unit: '个' }] }
    ],
    inventory: {
      movements: [
        { id: 'opening-a', skuCode: 'RAW-0001-01', qty: 30 },
        { id: 'opening-b', skuCode: 'RAW-0001-02', qty: 30 }
      ],
      documents: []
    },
    procurement: { suppliers: [], pos: [] }
  };
}
function setup(merge = true) {
  let s = fixture();
  let b = M.createBatch(s, ['o1', 'o2'], merge, ctx(), '匿名工单');
  return { s, b, p: s.production.products[0] };
}
function recipe(s, code = 'RAW-0001-01', per = 10) {
  return X.savePlan(
    s,
    'recipe',
    {
      name: '匿名加工方案',
      kind: 'product',
      scopeSku: 'FG-0001-01',
      items: [{ skuCode: code, perOutput: per, qty: 1 }],
      route: [
        { id: 'cut', name: '切割', assignees: [], rate: 20, rateMode: '机器小时' },
        { id: 'clean', name: '擦边' },
        { id: 'peel', name: '撕膜' },
        { id: 'pack', name: '包装' }
      ]
    },
    ctx()
  );
}
let { s, b, p } = setup();
const r1 = recipe(s),
  r2 = recipe(s, 'RAW-0001-02', 20),
  pack = X.savePlan(
    s,
    'packaging',
    {
      name: '匿名包装',
      scopeSku: p.skuCode,
      requirements: '按约定包装',
      items: [{ skuCode: 'PKG-0001-01', perOutput: 40, qty: 1 }],
      carton: { pcs: 40, length: 40, width: 30, height: 20, grossKg: 10 }
    },
    ctx()
  );
const a1 = X.apply(s, p.id, r1.id, pack.id, 50, true, ctx());
const a2 = X.apply(s, p.id, r2.id, pack.id, 51, false, ctx());
assert.equal(X.coverage(s, p.id, false), 101);
assert.equal(X.coverage(s, p.id, true), 101);
assert.equal(X.demands(s, b.id).find((x) => x.skuCode === 'RAW-0001-01').qty, 5);
assert.equal(X.demands(s, b.id).find((x) => x.skuCode === 'RAW-0001-02').qty, 3);
assert.equal(
  X.demands(s, b.id)
    .filter((x) => x.skuCode === 'PKG-0001-01')
    .reduce((n, x) => n + x.qty, 0),
  3
);
assert.equal(s.inventory.movements.length, 2);
assert.ok(s.production.materials.every((m) => m.target === null && !m.checkedAt));
assert.equal(X.cartonEstimate(s, p.id)[0].boxes, 3);
assert.equal(X.cartonEstimate(s, p.id)[0].volume, 0.072);
assert.throws(() => X.apply(s, p.id, r1.id, '', 1, false, ctx()), /未安排/);
const revision = X.savePlan(
  s,
  'recipe',
  { ...clone(r1), previousId: r1.id, name: '新参考', route: r1.route.map((x) => ({ ...x, rate: 30 })) },
  ctx()
);
assert.equal(revision.version, 2);
assert.equal(a1.recipeSnapshot.route[0].rate, 20);
assert.equal(X.current(s.production.processRecipes).filter((x) => x.familyId === r1.familyId).length, 1);
const prior = clone(s.production);
delete prior.processRecipes;
delete prior.packagingPlans;
delete prior.processApplications;
delete prior.processDevices;
delete prior.taskChanges;
delete prior.executions;
M.normalize(prior);
assert.deepEqual(prior.processRecipes, []);
M.validate(s);
const split = X.split(s, p.id, true, ctx());
assert.equal(split.length, 2);
assert.equal(
  split.reduce((n, p) => n + p.qty, 0),
  101
);
assert.equal(s.production.products.filter(X.active).length, 2);
assert.equal(X.coverage(s, split[0].id, false) + X.coverage(s, split[1].id, false), 101);
assert.equal(s.inventory.movements.length, 2);
M.validate(s);
const merged = X.merge(
  s,
  split.map((x) => x.id),
  true,
  ctx()
);
assert.equal(merged.qty, 101);
assert.equal(merged.sources.length, 2);
assert.equal(s.production.products.filter(X.active).length, 1);
assert.ok(s.production.materials.every((m) => m.uses.includes(merged.id)));
M.validate(s);
let diff = setup(false);
M.setRoute(
  diff.s,
  diff.s.production.products[0].id,
  [{ id: 'step-a', name: '清理', requirements: '保留膜', assignees: [] }],
  '',
  ctx()
);
M.setRoute(
  diff.s,
  diff.s.production.products[1].id,
  [{ id: 'step-b', name: '清理', requirements: '撕膜', assignees: [] }],
  '',
  ctx()
);
assert.throws(
  () =>
    X.merge(
      diff.s,
      diff.s.production.products.map((x) => x.id),
      true,
      ctx()
    ),
  /不一致/
);
let grouped = setup(),
  g = grouped.p,
  gs = grouped.s;
M.setRoute(
  gs,
  g.id,
  [
    { id: 'gc', name: '切割', assignees: ['甲'] },
    { id: 'g1', name: '擦边', assignees: ['甲', '乙'], executionGroup: 'after', groupName: '后处理' },
    { id: 'g2', name: '撕膜', assignees: ['甲', '乙'], executionGroup: 'after', groupName: '后处理' },
    { id: 'g3', name: '包装', assignees: ['甲', '乙'], executionGroup: 'after', groupName: '后处理' }
  ],
  '',
  ctx()
);
M.releaseRoute(gs, g.id, false);
const cutting = M.report(gs, g.id, 'gc', { qty: 100, people: ['甲'], hours: [], machineHours: 2 }, ctx());
M.confirmReport(gs, cutting.id, 100, '', ctx());
const gc = ctx();
const ex = M.report(
  gs,
  g.id,
  'g1',
  {
    qty: 100,
    bad: 2,
    people: ['甲', '乙'],
    hours: [
      { person: '甲', hours: 2 },
      { person: '乙', hours: 2 }
    ],
    machineHours: '',
    note: '同批实际完成三道'
  },
  gc
);
assert.equal(gs.production.executions.length, 1);
assert.equal(gs.production.reports.filter((r) => r.executionId).length, 3);
assert.ok(gs.production.reports.filter((r) => r.executionId).every((r) => r.hours.length === 0));
assert.equal(
  ex.hours.reduce((n, h) => n + h.hours, 0),
  4
);
assert.equal(M.report(gs, g.id, 'g1', { qty: 100, people: ['甲'] }, gc).id, ex.id);
assert.equal(gs.production.executions.length, 1);
assert.throws(() => M.confirmReport(gs, ex.reportIds[0], 98, '', ctx()), /整组/);
X.confirmExecution(gs, ex.id, 98, '核对组合完成', ctx());
assert.equal(M.totals(gs, g.id, 'g3').confirmed, 98);
assert.equal(X.history(gs).length, 2);
assert.equal(X.history(gs).find((h) => h.record.id === ex.id).laborRate, 24.5);
M.validate(gs);
X.voidExecution(gs, ex.id, '更正组合报数', ctx());
assert.equal(M.totals(gs, g.id, 'g1').confirmed, 0);
M.validate(gs);
const partial = M.report(
  gs,
  g.id,
  'g1',
  { qty: 40, people: ['甲'], hours: [{ person: '甲', hours: 1 }], completedStepIds: ['g1'] },
  ctx()
);
X.confirmExecution(gs, partial.id, 40, '', ctx());
assert.equal(M.totals(gs, g.id, 'g1').confirmed, 40);
assert.equal(M.totals(gs, g.id, 'g2').confirmed, 0);
assert.equal(M.totals(gs, g.id, 'g3').confirmed, 0);
assert.throws(
  () => M.report(gs, g.id, 'g1', { qty: 40, people: ['甲'], completedStepIds: ['g1', 'g3'] }, ctx()),
  /连续步骤/
);
assert.throws(
  () => M.report(gs, g.id, 'g1', { qty: 40, people: ['甲'], completedStepIds: [] }, ctx()),
  /实际完成/
);
const remaining = M.report(
  gs,
  g.id,
  'g1',
  { qty: 40, people: ['甲'], hours: [{ person: '甲', hours: 1 }], completedStepIds: ['g2', 'g3'] },
  ctx()
);
X.confirmExecution(gs, remaining.id, 40, '', ctx());
assert.equal(M.totals(gs, g.id, 'g1').confirmed, 40);
assert.equal(M.totals(gs, g.id, 'g3').confirmed, 40);
M.validate(gs);
const race = clone(s);
race.production.processApplications.push({
  ...clone(race.production.processApplications.find((a) => a.status === 'active')),
  id: 'other-device',
  qty: 1
});
assert.throws(() => M.validate(race), /超过任务需求/);
const bad = clone(gs);
bad.production.executions = [];
assert.throws(() => M.validate(bad), /主记录缺失/);
// 未核实用量不能当0，选物料仍可先建待核清单。
const unknown = setup();
const ur = X.savePlan(
  unknown.s,
  'recipe',
  {
    name: '待核用量',
    scopeSku: unknown.p.skuCode,
    items: [{ skuCode: 'RAW-0001-01', perOutput: '', qty: '' }],
    route: []
  },
  ctx()
);
const ua = X.apply(unknown.s, unknown.p.id, ur.id, '', 101, false, ctx());
const um = unknown.s.production.materials[0];
assert.equal(X.materialSuggestion(unknown.s, um).qty, null);
assert.equal(um.target, null);
assert.equal(unknown.s.inventory.movements.length, 2);
M.validate(unknown.s);
assert.throws(
  () => X.savePlan(unknown.s, 'packaging', { name: '无效箱规', carton: { length: 0 } }, ctx()),
  /大于0/
);
// 整批投入只累计一次，可按实际方案/工序对照，撤销后不再计入。
M.updateMaterial(
  unknown.s,
  um.id,
  { uses: [unknown.p.id], theoretical: 11, target: 11, checked: true },
  ctx()
);
M.reserve(unknown.s, um.id, 11, false, ctx());
M.moveMaterial(unknown.s, um.id, 5, false, ctx(), '员工');
const cc = Object.assign(ctx(), { processApplicationId: ua.id, processStageName: '切割' });
M.consume(unknown.s, um.id, 2, 1, '试切', cc);
assert.equal(X.inputHistory(unknown.s)[0].rows[0].qty, 2);
assert.equal(X.inputHistory(unknown.s)[0].rows[0].scrap, 1);
assert.throws(() => X.split(unknown.s, unknown.p.id, true, ctx()), /未下达、未报工/);
assert.throws(() => X.withdraw(unknown.s, ua.id, '换方案', ctx()), /实际报工或投入/);
M.voidConsumption(unknown.s, cc.id, '重核', ctx());
assert.equal(X.inputHistory(unknown.s).length, 0);
M.validate(unknown.s);
// 订单改少保留原安排供复核，但并发新加的超额安排仍拒绝。
const reduced = setup();
const rr = recipe(reduced.s);
X.apply(reduced.s, reduced.p.id, rr.id, '', 101, true, ctx());
reduced.s.orders[1].items[0].qty = 20;
M.reconcileOrder(reduced.s, reduced.p.id, '客户减量', ctx());
assert.equal(reduced.p.qty, 80);
M.validate(reduced.s);
reduced.s.production.processApplications.push({
  ...clone(reduced.s.production.processApplications[0]),
  id: 'concurrent-extra',
  qty: 1
});
assert.throws(() => M.validate(reduced.s), /超过任务需求/);
console.log(
  '工艺库规则通过：旧数据兼容、版本快照、多物料方案、包装合算、任务合拆、组合产量工时一次计、核对撤销与并发保护。'
);

// 包装层级按实际所需内盒计算尾箱，不把尾箱补成满箱内盒。
{
  const { s, b, p } = setup();
  s.catalog.products.find((x) => x.id === 'pkg').skus.push({ skuCode: 'PKG-0001-02', stockUnit: '只' });
  const beforeInventory = clone(s.inventory),
    beforeOrders = clone(s.orders),
    r = recipe(s);
  const pack = X.savePlan(
    s,
    'packaging',
    {
      name: '匿名分层包装',
      scopeSku: p.skuCode,
      carton: { innerPcs: 7, innersPerCarton: 5 },
      items: [
        { skuCode: 'PKG-0001-01', perOutput: 1, qty: 1, basis: 'carton' },
        { skuCode: 'PKG-0001-02', perOutput: 1, qty: 1, basis: 'inner' }
      ]
    },
    ctx()
  );
  assert.equal(pack.carton.pcs, 35);
  const linked = X.savePlan(
    s,
    'recipe',
    { ...clone(r), previousId: r.id, packagingFamilyId: pack.familyId },
    ctx()
  );
  X.apply(s, p.id, linked.id, pack.id, 60, false, ctx());
  X.apply(s, p.id, linked.id, pack.id, 41, false, ctx());
  const ds = X.demands(s, b.id);
  assert.equal(ds.find((x) => x.skuCode === 'PKG-0001-01').qty, 3);
  assert.equal(ds.find((x) => x.skuCode === 'PKG-0001-02').qty, 15);
  assert.equal(ds.find((x) => x.skuCode === 'RAW-0001-01').qty, 11);
  assert.equal(X.cartonEstimate(s, p.id)[0].boxes, 3);
  assert.deepEqual(s.inventory, beforeInventory);
  assert.deepEqual(s.orders, beforeOrders);
  M.validate(s);
  assert.throws(
    () =>
      X.savePlan(
        s,
        'packaging',
        { ...clone(pack), carton: { innerPcs: 7, innersPerCarton: 5, pcs: 36 } },
        ctx()
      ),
    /不一致/
  );
  assert.throws(
    () => X.savePlan(s, 'packaging', { ...clone(pack), carton: { innerPcs: 1.5 } }, ctx()),
    /正整数/
  );
  assert.throws(() => recipe(s, 'PKG-0001-01'), /包材/);
  assert.throws(
    () =>
      X.savePlan(
        s,
        'packaging',
        { name: '错误分类', items: [{ skuCode: 'RAW-0001-01', qty: 1, perOutput: 1 }] },
        ctx()
      ),
    /包装材料/
  );
  const unknown = X.savePlan(
    s,
    'packaging',
    {
      name: '未定箱数',
      scopeSku: p.skuCode,
      items: [{ skuCode: 'PKG-0001-01', qty: 1, perOutput: 1, basis: 'carton' }]
    },
    ctx()
  );
  assert.equal(X.packagingCounts(unknown, 101).carton, null);
}
// 旧混合版本可读取，整理创建新版本；已有工单快照和实际流水不被静默改写。
{
  const { s, p, b } = setup(),
    r = recipe(s);
  delete r.materialScopeVersion;
  r.items.push({ id: 'old-box', skuCode: 'PKG-0001-01', unit: '只', perOutput: 35, qty: 1, rounding: 'up' });
  const old = clone(r),
    inv = clone(s.inventory),
    materials = clone(s.production.materials);
  s.production.processApplications.push({
    id: 'legacy-use',
    batchId: b.id,
    productId: p.id,
    qty: 10,
    status: 'active',
    recipeSnapshot: clone(r)
  });
  M.validate(s);
  const pack = X.savePlan(
    s,
    'packaging',
    {
      name: '已有包装',
      scopeSku: p.skuCode,
      carton: { pcs: 35 },
      items: [{ skuCode: 'PKG-0001-01', perOutput: 1, qty: 1, basis: 'carton' }]
    },
    ctx()
  );
  assert.throws(() => X.apply(s, p.id, '', pack.id, 10, false, ctx()), /重复/);
  const result = X.separatePackaging(s, r.id, { packagingPlanId: pack.id }, ctx());
  assert.equal(s.production.packagingPlans.length, 1);
  assert.equal(result.recipe.version, 2);
  assert.equal(result.recipe.items.length, 1);
  assert.equal(result.recipe.packagingFamilyId, pack.familyId);
  assert.deepEqual(r, old);
  assert.deepEqual(s.production.processApplications[0].recipeSnapshot, old);
  assert.deepEqual(s.inventory, inv);
  assert.deepEqual(s.production.materials, materials);
  M.validate(s);
  assert.throws(() => X.apply(s, p.id, r.id, '', 10, false, ctx()), /旧工艺/);
  const bad = X.savePlan(
    s,
    'packaging',
    { name: '比例不同', scopeSku: p.skuCode, items: [{ skuCode: 'PKG-0001-01', perOutput: 30, qty: 1 }] },
    ctx()
  );
  assert.throws(() => X.separatePackaging(s, r.id, { packagingPlanId: bad.id }, ctx()), /比例不一致/);
  const conflict = clone(s);
  conflict.production.processApplications.push({
    id: 'new-pack',
    batchId: b.id,
    productId: p.id,
    qty: 10,
    status: 'active',
    materialScopeVersion: 2,
    packagingSnapshot: clone(pack)
  });
  assert.throws(() => M.validate(conflict), /重复/);
}
console.log('包装分工验证通过：分类边界、层级尾箱、未知用量、旧版本追溯、复用包装及重复核料保护。');
