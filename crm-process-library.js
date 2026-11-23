/* 工艺与包装方案的版本、工单快照、数量建议、任务重组及组合报工规则。 */
(function (root) {
  'use strict';
  var M = root.CrmProductionModel,
    EPS = 0.000001;
  function fail(t) {
    throw new Error(t);
  }
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function find(a, id) {
    return M.find(a || [], id);
  }
  function need(a, id, label) {
    var v = find(a, id);
    if (!v) fail((label || '记录') + '不存在，请刷新');
    return v;
  }
  function active(p) {
    return !p.retiredAt;
  }
  function task(s, id) {
    var p = need(s.production.products, id, '产品任务');
    if (!active(p)) fail('任务已合并或拆分，请打开当前任务');
    return p;
  }
  function live(s, bid) {
    var b = need(s.production.batches, bid, '工单');
    if (['completed', 'cancelled'].indexOf(b.status) >= 0) fail('工单已关闭');
  }
  function mutable(s, p) {
    live(s, p.batchId);
    if (
      p.released ||
      s.production.reports.some(function (r) {
        return r.productId === p.id;
      }) ||
      s.production.consumptions.some(function (c) {
        return c.processProductId === p.id;
      })
    )
      fail('请在未下达、未报工的任务中调整；已有报工的历史保持不变');
  }
  function optional(v) {
    return v === '' || v === undefined || v === null ? null : M.num(v, true);
  }
  function list(s, kind) {
    return kind === 'packaging' ? s.production.packagingPlans : s.production.processRecipes;
  }
  function current(plans) {
    return plans.filter(function (p) {
      return (
        p.enabled !== false &&
        !plans.some(function (x) {
          return x.familyId === p.familyId && x.version > p.version;
        })
      );
    });
  }
  function matches(s, plan, p) {
    if (plan.scopeSku) return plan.scopeSku === p.skuCode;
    if (plan.scopeCategory) {
      var x = M.sku(s, p.skuCode);
      return x && x.product.categoryCode === plan.scopeCategory;
    }
    return true;
  }
  function checkRoute(route) {
    var groups = {},
      ids = {};
    (route || []).forEach(function (step, index) {
      if (!step.id || ids[step.id] || !String(step.name || '').trim()) fail('工序名称或步骤编号无效');
      ids[step.id] = true;
      if (step.rate !== '' && step.rate !== null && step.rate !== undefined) M.num(step.rate);
      if (step.executionGroup) {
        var g =
          groups[step.executionGroup] ||
          (groups[step.executionGroup] = { indices: [], name: step.groupName });
        g.indices.push(index);
        if (!step.groupName || g.name !== step.groupName) fail('组合任务名称不一致');
      }
    });
    Object.keys(groups).forEach(function (k) {
      var a = groups[k].indices;
      if (a.length < 2 || a[a.length - 1] - a[0] + 1 !== a.length)
        fail('组合任务至少包含两道连续工序，请先调整组合设置');
    });
  }
  function isPackaging(s, code) {
    var x = M.sku(s, code);
    return !!(x && x.product.type === 'packaging');
  }
  function materialAllowed(s, kind, code) {
    return M.stocked(M.sku(s, code)) && (kind === 'packaging' ? isPackaging(s, code) : !isPackaging(s, code));
  }
  function checkMaterialScope(s, kind, items) {
    (items || []).forEach(function (i) {
      if (!materialAllowed(s, kind, i.skuCode))
        fail(
          kind === 'packaging'
            ? '包装方案只维护包装材料；生产用料请放入产品工艺'
            : '工艺方案只维护生产用料；包材请整理到包装方案'
        );
      if (kind !== 'packaging' && i.basis && i.basis !== 'product') fail('生产用料须按成品数量核算');
    });
  }
  function checkPackagingRoles(plan) {
    var seen = {};
    (plan.items || []).forEach(function (i) {
      var role = i.packagingRole;
      if (!role || role === 'legacy') return;
      if (['inner', 'carton', 'aux'].indexOf(role) < 0) fail('包装用途无效');
      if (role === 'inner' || role === 'carton') {
        if (seen[role]) fail('同一方案只维护一个内盒和一个外箱');
        seen[role] = true;
        if (i.basis !== role || i.perOutput !== 1 || i.qty !== 1) fail('包装用途与计算规则不一致');
      } else if (i.basis !== 'product' || i.perOutput !== 1) fail('辅助包材须按成品用量维护');
    });
  }
  function packagingCounts(plan, quantity) {
    var c = plan.carton || {},
      inner = c.innerPcs ? Math.ceil(quantity / c.innerPcs - EPS) : null;
    return {
      product: quantity,
      inner: inner,
      carton:
        inner !== null && c.innersPerCarton
          ? Math.ceil(inner / c.innersPerCarton - EPS)
          : c.pcs
            ? Math.ceil(quantity / c.pcs - EPS)
            : null
    };
  }
  function packagingOverlaps(s, pid, recipe, pack) {
    var rs = [],
      ps = [];
    applications(s, pid).forEach(function (a) {
      if (a.recipeSnapshot) rs.push(a.recipeSnapshot);
      if (a.packagingSnapshot) ps.push(a.packagingSnapshot);
    });
    if (recipe) rs.push(recipe);
    if (pack) ps.push(pack);
    var rawCodes = {};
    rs.forEach(function (r) {
      (r.items || []).forEach(function (i) {
        if (isPackaging(s, i.skuCode)) rawCodes[i.skuCode] = true;
      });
    });
    return Array.from(
      new Set(
        ps.reduce(function (a, p) {
          return a.concat(
            (p.items || [])
              .filter(function (i) {
                return rawCodes[i.skuCode];
              })
              .map(function (i) {
                return i.skuCode;
              })
          );
        }, [])
      )
    );
  }
  function materialItems(s, items) {
    return (items || []).map(function (v, i) {
      var x = M.sku(s, v.skuCode);
      if (!M.stocked(x)) fail('方案用料须选择产品库中启用库存的实物SKU');
      if (v.basis && ['product', 'inner', 'carton'].indexOf(v.basis) < 0) fail('包材计量依据无效');
      return {
        id: v.id || 'item-' + i,
        skuCode: v.skuCode,
        unit: x.sku.stockUnit || '个',
        perOutput: v.perOutput === '' || v.perOutput == null ? null : M.num(v.perOutput),
        qty: v.qty === '' || v.qty == null ? null : M.num(v.qty),
        rounding: v.rounding === 'exact' ? 'exact' : 'up',
        basis: v.basis === 'inner' || v.basis === 'carton' ? v.basis : 'product',
        packagingRole: v.packagingRole || '',
        operationId: v.operationId || '',
        stageName: v.stageName || '',
        note: v.note || ''
      };
    });
  }
  function savePlan(s, kind, input, ctx) {
    var a = list(s, kind),
      old = input.previousId ? need(a, input.previousId, '原方案') : null,
      name = String(input.name || '').trim();
    if (!name) fail('请填写方案名称');
    if (input.scopeSku && !M.sku(s, input.scopeSku)) fail('适用产品SKU不存在');
    if (old && (old.scopeSku || '') !== (input.scopeSku || ''))
      fail('更换适用产品请建立新方案，保留原方案历史');
    var family = old ? old.familyId : ctx.id,
      version =
        1 +
        a
          .filter(function (p) {
            return p.familyId === family;
          })
          .reduce(function (n, p) {
            return Math.max(n, p.version);
          }, 0);
    var v = {
      id: ctx.id,
      familyId: family,
      version: version,
      name: name,
      enabled: true,
      scopeSku: input.scopeSku || '',
      scopeCategory: input.scopeCategory || '',
      requirements: input.requirements || '',
      items: materialItems(s, input.items),
      materialScopeVersion: 2,
      createdAt: ctx.at,
      createdBy: ctx.person,
      source: input.source || '经验维护',
      referenceReportIds: input.referenceReportIds || []
    };
    checkMaterialScope(s, kind, v.items);
    if (kind === 'packaging') {
      checkPackagingRoles(v);
      v.carton = {
        innerPcs: optional((input.carton || {}).innerPcs),
        innersPerCarton: optional((input.carton || {}).innersPerCarton),
        pcs: optional((input.carton || {}).pcs),
        length: optional((input.carton || {}).length),
        width: optional((input.carton || {}).width),
        height: optional((input.carton || {}).height),
        grossKg: optional((input.carton || {}).grossKg)
      };
      Object.keys(v.carton).forEach(function (k) {
        if (v.carton[k] === 0) fail('预计箱规和毛重须大于0或留空');
      });
      ['innerPcs', 'innersPerCarton', 'pcs'].forEach(function (k) {
        if (v.carton[k] !== null && !Number.isInteger(v.carton[k])) fail('装箱数量须为正整数或留空');
      });
      if (v.carton.innerPcs && v.carton.innersPerCarton) {
        var capacity = M.round(v.carton.innerPcs * v.carton.innersPerCarton);
        if (v.carton.pcs !== null && Math.abs(v.carton.pcs - capacity) > EPS)
          fail('整箱成品数与每内盒数量×每箱内盒数不一致');
        v.carton.pcs = capacity;
      }
    } else {
      v.packagingFamilyId = input.packagingFamilyId || '';
      if (
        v.packagingFamilyId &&
        !current(s.production.packagingPlans).some(function (p) {
          return (
            p.familyId === v.packagingFamilyId && (!v.scopeSku || matches(s, p, { skuCode: v.scopeSku }))
          );
        })
      )
        fail('关联包装方案不存在或不适用此产品');
      v.kind = input.kind === 'route' ? 'route' : 'product';
      if (v.kind === 'product' && !v.scopeSku) fail('加工用料方案须选择具体成品SKU；通用配置请选择路线模板');
      v.route = (input.route || []).map(function (step, i) {
        return {
          id: step.id || 'stage-' + i,
          operationId: step.operationId || '',
          name: String(step.name || '').trim(),
          requirements: step.requirements || '',
          rate: step.rate === '' || step.rate === null || step.rate === undefined ? '' : M.num(step.rate),
          rateMode: step.rateMode === '机器小时' ? '机器小时' : '人时',
          executionGroup: step.executionGroup || '',
          groupName: step.groupName || ''
        };
      });
      checkRoute(v.route);
      if (v.kind === 'route' && v.items.length) fail('通用路线模板不带物料数量；用料参数请按具体SKU维护');
      v.layoutRef = input.layoutRef || '';
      v.boardSize = input.boardSize || '';
      v.feedMode = input.feedMode || '';
      v.deviceId = input.deviceId || '';
      v.deviceCondition = input.deviceCondition || '';
      if (v.deviceId && !find(s.production.processDevices, v.deviceId)) fail('参考设备不存在');
    }
    a.push(v);
    return v;
  }
  function separatePackaging(s, recipeId, input, ctx) {
    input = input || {};
    var old = need(s.production.processRecipes, recipeId, '原工艺方案'),
      packItems = (old.items || []).filter(function (i) {
        return isPackaging(s, i.skuCode);
      }),
      rawItems = (old.items || []).filter(function (i) {
        return !isPackaging(s, i.skuCode);
      });
    if (!packItems.length) fail('此工艺已无包材需要整理');
    var pack = input.packagingPlanId
      ? need(s.production.packagingPlans, input.packagingPlanId, '已有包装方案')
      : null;
    if (pack) {
      checkMaterialScope(s, 'packaging', pack.items);
      if (!matches(s, pack, { skuCode: old.scopeSku })) fail('已有包装方案不适用此产品');
      packItems.forEach(function (i) {
        var matches = pack.items.filter(function (j) {
          return j.skuCode === i.skuCode;
        });
        if (matches.length !== 1) fail('已有包装方案包材不完整或重复，请先核对');
        var j = matches[0],
          per = j.perOutput;
        if (j.basis === 'inner') per *= pack.carton.innerPcs || NaN;
        if (j.basis === 'carton') per *= pack.carton.pcs || NaN;
        if (
          !per ||
          !Number.isFinite(per) ||
          i.perOutput == null ||
          i.qty == null ||
          j.qty == null ||
          Math.abs(j.qty / per - i.qty / i.perOutput) > EPS
        )
          fail('已有包装方案与原工艺的包材比例不一致，请先核对');
      });
    } else
      pack = savePlan(
        s,
        'packaging',
        {
          name: input.name || old.name + ' · 包装方案',
          scopeSku: old.scopeSku,
          scopeCategory: old.scopeCategory,
          requirements: input.requirements || '',
          items: packItems,
          carton: input.carton || {},
          source: old.source || '经验维护'
        },
        { id: ctx.id + '-pack', at: ctx.at, person: ctx.person }
      );
    var clean = savePlan(
      s,
      'recipe',
      Object.assign({}, clone(old), {
        previousId: old.id,
        items: rawItems,
        packagingFamilyId: pack.familyId
      }),
      { id: ctx.id + '-recipe', at: ctx.at, person: ctx.person }
    );
    clean.packagingSeparation = {
      sourceRecipeId: old.id,
      packagingPlanId: pack.id,
      at: ctx.at,
      person: ctx.person,
      note: '原版本保留；已选工单快照/实际物料不自动改写'
    };
    return { recipe: clean, packaging: pack };
  }
  function saveDevice(s, input, ctx) {
    var name = String(input.name || '').trim();
    if (!name) fail('请填写设备名称');
    var d = input.id ? need(s.production.processDevices, input.id, '设备') : { id: ctx.id, enabled: true };
    if (
      s.production.processDevices.some(function (x) {
        return x.id !== d.id && x.name === name;
      })
    )
      fail('设备名称已存在');
    if (input.id) {
      d.changes = d.changes || [];
      d.changes.push({
        id: ctx.id,
        name: d.name,
        workspace: d.workspace,
        note: d.note,
        at: ctx.at,
        person: ctx.person
      });
    }
    d.name = name;
    d.workspace = input.workspace || '';
    d.note = input.note || '';
    d.updatedAt = ctx.at;
    if (!input.id) s.production.processDevices.push(d);
    return d;
  }
  function cloneRoute(route, p, ctx) {
    var groupMap = {};
    return (route || []).map(function (step, i) {
      var old = p.route[i],
        g = step.executionGroup;
      if (g && !groupMap[g]) groupMap[g] = ctx.id + '-group-' + i;
      return {
        id: ctx.id + '-step-' + i,
        operationId: step.operationId || '',
        name: step.name,
        requirements: step.requirements || '',
        rate: step.rate === null || step.rate === undefined ? '' : step.rate,
        rateMode: step.rateMode || '人时',
        assignees: old && old.name === step.name ? clone(old.assignees || []) : [],
        executionGroup: g ? groupMap[g] : '',
        groupName: step.groupName || ''
      };
    });
  }
  function applyRoute(s, p, recipe, ctx) {
    mutable(s, p);
    if (!matches(s, recipe, p)) fail('路线方案不适用于此产品');
    M.setRoute(s, p.id, cloneRoute(recipe.route, p, ctx), p.packaging, ctx);
    p.routeOrigin = { id: recipe.id, name: recipe.name, version: recipe.version };
  }
  function routeBulk(s, bid, ids, recipeId, ctx) {
    var r = need(s.production.processRecipes, recipeId, '路线模板');
    if (!ids.length) fail('请选择产品任务');
    ids.forEach(function (id, i) {
      var p = task(s, id);
      if (p.batchId !== bid) fail('选择了其他工单任务');
      applyRoute(s, p, r, { id: ctx.id + '-' + i, at: ctx.at, person: ctx.person });
    });
  }
  function applications(s, pid) {
    return s.production.processApplications.filter(function (a) {
      return a.status === 'active' && a.productId === pid;
    });
  }
  function coverage(s, pid, pack) {
    return M.round(
      applications(s, pid)
        .filter(function (a) {
          return pack ? !!a.packagingSnapshot : a.recipeSnapshot && a.recipeSnapshot.kind === 'product';
        })
        .reduce(function (n, a) {
          return n + a.qty;
        }, 0)
    );
  }
  function demands(s, bid) {
    var groups = {};
    s.production.processApplications
      .filter(function (a) {
        return a.status === 'active' && a.batchId === bid;
      })
      .forEach(function (a) {
        [
          ['recipe', a.recipeSnapshot],
          ['packaging', a.packagingSnapshot]
        ].forEach(function (pair) {
          var plan = pair[1];
          if (!plan) return;
          var key = pair[0] + '|' + a.productId + '|' + plan.id,
            g =
              groups[key] ||
              (groups[key] = {
                id: key,
                productId: a.productId,
                plan: plan,
                qty: 0,
                applicationIds: [],
                kind: pair[0]
              });
          g.qty += a.qty;
          g.applicationIds.push(a.id);
        });
      });
    var out = [];
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      (g.plan.items || []).forEach(function (item) {
        var basis = item.basis || 'product',
          base = g.kind === 'packaging' ? packagingCounts(g.plan, g.qty)[basis] : g.qty,
          groupsNeeded = item.perOutput == null || base === null ? null : base / item.perOutput,
          quantity =
            groupsNeeded === null || item.qty == null
              ? null
              : (item.rounding === 'exact' ? groupsNeeded : Math.ceil(groupsNeeded - EPS)) * item.qty;
        out.push({
          id: g.id + '|' + item.id,
          productId: g.productId,
          skuCode: item.skuCode,
          unit: item.unit,
          qty: quantity === null ? null : M.round(quantity),
          applicationIds: g.applicationIds,
          planName: g.plan.name,
          kind: g.kind,
          basis: basis,
          stageName: item.stageName || '',
          operationId: item.operationId || ''
        });
      });
    });
    return out;
  }
  function materialSuggestion(s, m) {
    var a = demands(s, m.batchId).filter(function (d) {
      return d.skuCode === m.skuCode;
    });
    if (!a.length) return null;
    return {
      qty: a.some(function (d) {
        return d.qty === null;
      })
        ? null
        : M.round(
            a.reduce(function (n, d) {
              return n + d.qty;
            }, 0)
          ),
      rows: a
    };
  }
  function prepareMaterials(s, bid, ctx) {
    demands(s, bid).forEach(function (d, i) {
      var m = s.production.materials.find(function (x) {
        return x.batchId === bid && x.skuCode === d.skuCode;
      });
      if (!m) m = M.addMaterial(s, bid, d.skuCode, { id: ctx.id + '-material-' + i });
      if (m.uses.indexOf(d.productId) < 0) m.uses.push(d.productId);
      m.checkedAt = '';
      m.checkedBy = '';
      m.source = '工艺／包装方案（目标待复核）';
    });
  }
  function apply(s, pid, recipeId, packId, quantity, withRoute, ctx) {
    var p = task(s, pid);
    mutable(s, p);
    var recipe = recipeId ? need(s.production.processRecipes, recipeId, '工艺方案') : null,
      pack = packId ? need(s.production.packagingPlans, packId, '包装方案') : null;
    if (!recipe && !pack) fail('请选择工艺或包装方案');
    [recipe, pack].filter(Boolean).forEach(function (v) {
      if (v.enabled === false || !matches(s, v, p)) fail('方案已停用或不适用于当前SKU');
    });
    if (recipe && recipe.kind === 'route') {
      if (pack) fail('路线模板请先单独套用，再选择包装方案');
      applyRoute(s, p, recipe, ctx);
      return null;
    }
    if (
      recipe &&
      (recipe.items || []).some(function (i) {
        return isPackaging(s, i.skuCode);
      })
    )
      fail('旧工艺方案含包材，请先整理到包装方案后选用');
    if (pack) checkMaterialScope(s, 'packaging', pack.items);
    if (packagingOverlaps(s, pid, recipe, pack).length)
      fail('工艺和包装方案重复包含同一包材，请先核对旧方案，避免重复备料');
    var qty = M.num(quantity);
    if (recipe && qty > p.qty - coverage(s, pid, false) + EPS)
      fail('本次加工数量超过未安排数量，请撤回未执行的旧方案后再选');
    if (pack && qty > p.qty - coverage(s, pid, true) + EPS) fail('本次包装数量超过未安排数量，避免重复包材');
    if (withRoute && recipe && recipe.route.length) applyRoute(s, p, recipe, ctx);
    if (pack) p.packaging = pack.requirements || p.packaging;
    var app = {
      id: ctx.id,
      batchId: p.batchId,
      productId: pid,
      qty: qty,
      status: 'active',
      materialScopeVersion: 2,
      recipeSnapshot: recipe ? clone(recipe) : null,
      packagingSnapshot: pack ? clone(pack) : null,
      createdBy: ctx.person,
      at: ctx.at,
      planningBasisQty: p.qty
    };
    s.production.processApplications.push(app);
    p.materialsNeedReview = true;
    prepareMaterials(s, p.batchId, ctx);
    return app;
  }
  function withdraw(s, id, note, ctx) {
    var a = need(s.production.processApplications, id, '选用记录');
    live(s, a.batchId);
    if (a.status !== 'active') fail('方案已撤回');
    if (!String(note || '').trim()) fail('请填写撤回原因');
    if (
      s.production.reports.some(function (r) {
        return r.processApplicationId === id && r.status !== 'void';
      }) ||
      s.production.consumptions.some(function (c) {
        return c.processApplicationId === id && c.status !== 'void';
      })
    )
      fail('方案已有实际报工或投入，保留历史；请先核对实际记录');
    a.status = 'withdrawn';
    a.withdrawReason = note.trim();
    a.withdrawBy = ctx.person;
    a.withdrawAt = ctx.at;
    var p = task(s, a.productId);
    p.materialsNeedReview = true;
    s.production.materials
      .filter(function (m) {
        return m.batchId === a.batchId && m.uses.indexOf(p.id) >= 0;
      })
      .forEach(function (m) {
        m.checkedAt = '';
        m.checkedBy = '';
      });
  }
  function cartonEstimate(s, pid) {
    var groups = {};
    applications(s, pid)
      .filter(function (a) {
        return a.packagingSnapshot;
      })
      .forEach(function (a) {
        var plan = a.packagingSnapshot,
          g = groups[plan.id] || (groups[plan.id] = { plan: plan, qty: 0 });
        g.qty += a.qty;
      });
    return Object.keys(groups).map(function (k) {
      var g = groups[k],
        c = g.plan.carton || {},
        boxes = packagingCounts(g.plan, g.qty).carton;
      return {
        name: g.plan.name,
        qty: g.qty,
        boxes: boxes,
        volume:
          boxes !== null && c.length != null && c.width != null && c.height != null
            ? M.round((boxes * c.length * c.width * c.height) / 1000000)
            : null,
        weight: boxes !== null && c.grossKg != null ? M.round(boxes * c.grossKg) : null
      };
    });
  }
  function routeSignature(p) {
    var groups = {};
    return JSON.stringify(
      (p.route || []).map(function (r, i) {
        if (r.executionGroup && groups[r.executionGroup] === undefined) groups[r.executionGroup] = i;
        return {
          operationId: r.operationId || '',
          name: r.name,
          requirements: r.requirements || '',
          rate: r.rate == null ? '' : String(r.rate),
          rateMode: r.rateMode || '人时',
          group: r.executionGroup ? groups[r.executionGroup] : null,
          groupName: r.groupName || ''
        };
      })
    );
  }
  function packSignature(plan) {
    if (!plan) return '';
    return JSON.stringify({
      requirements: plan.requirements,
      items: plan.items.map(function (i) {
        return { skuCode: i.skuCode, unit: i.unit, perOutput: i.perOutput, qty: i.qty, rounding: i.rounding };
      }),
      carton: plan.carton
    });
  }
  function remapMaterials(s, bid, oldIds, newIds) {
    s.production.materials
      .filter(function (m) {
        return (
          m.batchId === bid &&
          m.uses.some(function (id) {
            return oldIds.indexOf(id) >= 0;
          })
        );
      })
      .forEach(function (m) {
        m.uses = Array.from(
          new Set(
            m.uses
              .filter(function (id) {
                return oldIds.indexOf(id) < 0;
              })
              .concat(newIds)
          )
        );
        m.checkedAt = '';
        m.checkedBy = '';
      });
  }
  function merge(s, ids, confirmed, ctx) {
    if (!confirmed || ids.length < 2 || new Set(ids).size !== ids.length)
      fail('请至少选择两条并确认工艺/包装要求一致');
    var ps = ids.map(function (id) {
        return task(s, id);
      }),
      base = ps[0];
    ps.forEach(function (p) {
      mutable(s, p);
      if (p.batchId !== base.batchId || p.skuCode !== base.skuCode || p.unit !== base.unit)
        fail('只能合并同工单、同SKU及单位的任务');
    });
    var configured = ps.filter(function (p) {
      return p.route.length;
    });
    if (
      configured.some(function (p) {
        return routeSignature(p) !== routeSignature(configured[0]);
      })
    )
      fail('现有工序或操作要求不一致，请分别保留或先核对配置');
    var packs = ps
      .map(function (p) {
        return String(p.packaging || '').trim();
      })
      .filter(Boolean);
    if (new Set(packs).size > 1) fail('包装要求不一致，不能合并');
    var snapshots = [];
    ps.forEach(function (p) {
      applications(s, p.id).forEach(function (a) {
        if (a.packagingSnapshot) snapshots.push(packSignature(a.packagingSnapshot));
      });
    });
    if (new Set(snapshots).size > 1) fail('已选包装方案用料或箱规不同，请保留独立任务');
    var before = clone(ps);
    if (!base.route.length && configured.length) {
      base.route = cloneRoute(configured[0].route, base, ctx);
      base.routeVersion++;
    }
    base.packaging = packs[0] || '';
    base.sources = ps.reduce(function (a, p) {
      return a.concat(clone(p.sources));
    }, []);
    base.qty = M.round(
      ps.reduce(function (n, p) {
        return n + p.qty;
      }, 0)
    );
    base.materialsNeedReview = true;
    ps.slice(1).forEach(function (p) {
      p.retiredAt = ctx.at;
      p.retiredBy = ctx.person;
      p.replacedBy = [base.id];
      p.released = false;
    });
    s.production.processApplications.forEach(function (a) {
      if (a.status === 'active' && ids.indexOf(a.productId) >= 0) {
        a.originalProductId = a.originalProductId || a.productId;
        a.productId = base.id;
        a.planningBasisQty = base.qty;
      }
    });
    remapMaterials(s, base.batchId, ids, [base.id]);
    s.production.taskChanges.push({
      id: ctx.id,
      type: 'merge',
      batchId: base.batchId,
      before: before,
      afterIds: [base.id],
      at: ctx.at,
      person: ctx.person
    });
    return base;
  }
  function split(s, pid, confirmed, ctx) {
    var p = task(s, pid);
    mutable(s, p);
    if (!confirmed || p.sources.length < 2) fail('当前任务没有多条来源，或尚未确认拆分');
    var before = clone(p),
      children = p.sources.map(function (src, i) {
        var c = clone(p);
        c.id = ctx.id + '-product-' + i;
        c.qty = src.qty;
        c.sources = [clone(src)];
        c.route = cloneRoute(p.route, c, { id: c.id });
        c.routeVersion = 1;
        c.materialsNeedReview = true;
        delete c.routeOrigin;
        return c;
      });
    p.retiredAt = ctx.at;
    p.retiredBy = ctx.person;
    p.replacedBy = children.map(function (c) {
      return c.id;
    });
    p.released = false;
    Array.prototype.push.apply(s.production.products, children);
    var oldApps = applications(s, pid),
      rawRemaining = children.map(function (c) {
        return c.qty;
      }),
      packRemaining = children.map(function (c) {
        return c.qty;
      });
    oldApps.forEach(function (a, ai) {
      a.status = 'superseded';
      a.supersededAt = ctx.at;
      var remaining = a.qty;
      children.forEach(function (c, ci) {
        if (remaining <= EPS) return;
        var cap = Math.min(
            a.recipeSnapshot ? rawRemaining[ci] : Infinity,
            a.packagingSnapshot ? packRemaining[ci] : Infinity
          ),
          take = Math.min(cap, remaining);
        if (take <= EPS) return;
        var next = clone(a);
        next.id = ctx.id + '-application-' + ai + '-' + ci;
        next.productId = c.id;
        next.qty = take;
        next.status = 'active';
        next.sourceApplicationId = a.id;
        next.at = ctx.at;
        next.planningBasisQty = c.qty;
        delete next.supersededAt;
        s.production.processApplications.push(next);
        if (a.recipeSnapshot) rawRemaining[ci] -= take;
        if (a.packagingSnapshot) packRemaining[ci] -= take;
        remaining -= take;
      });
      if (remaining > EPS) fail('选用方案数量超过来源需求，请先核对方案再拆分');
    });
    remapMaterials(
      s,
      p.batchId,
      [pid],
      children.map(function (c) {
        return c.id;
      })
    );
    s.production.taskChanges.push({
      id: ctx.id,
      type: 'split',
      batchId: p.batchId,
      before: [before],
      afterIds: children.map(function (c) {
        return c.id;
      }),
      at: ctx.at,
      person: ctx.person
    });
    return children;
  }
  function taskGroups(p) {
    var out = [],
      seen = {};
    p.route.forEach(function (step) {
      var key = step.executionGroup || step.id;
      if (seen[key]) return;
      seen[key] = true;
      var steps = step.executionGroup
        ? p.route.filter(function (v) {
            return v.executionGroup === key;
          })
        : [step];
      out.push({
        id: step.id,
        name: step.executionGroup ? step.groupName : step.name,
        steps: steps,
        people: Array.from(
          new Set(
            steps.reduce(function (a, x) {
              return a.concat(x.assignees || []);
            }, [])
          )
        ),
        requirements: steps
          .map(function (x) {
            return x.name + '：' + (x.requirements || '按本单要求');
          })
          .join('；')
      });
    });
    return out;
  }
  function enrichReport(s, r, values) {
    var app = values.processApplicationId
      ? need(s.production.processApplications, values.processApplicationId, '工单方案')
      : null;
    if (app && (app.status !== 'active' || app.productId !== r.productId))
      fail('实际选用方案不属于当前任务或已撤回');
    var device = values.deviceId ? need(s.production.processDevices, values.deviceId, '设备') : null;
    var p = need(s.production.products, r.productId, '产品任务');
    r.routeFingerprint = JSON.stringify(
      p.route
        .map(function (st) {
          return [st.operationId || '', st.name, st.requirements || '', st.groupName || ''];
        })
        .concat([['包装', p.packaging || '']])
    );
    r.processApplicationId = app ? app.id : '';
    r.deviceId = device ? device.id : '';
    r.deviceName = device ? device.name : '';
    r.deviceCondition = values.deviceCondition || '';
    r.prepHours = optional(values.prepHours);
    r.downtimeHours = optional(values.downtimeHours);
  }
  function reportGroup(s, pid, stepId, values, ctx) {
    var existing = find(s.production.executions, ctx.id);
    if (existing) return existing;
    var p = task(s, pid),
      step = need(p.route, stepId, '工序'),
      steps = p.route.filter(function (x) {
        return x.executionGroup === step.executionGroup;
      });
    checkRoute(p.route);
    if (steps.length < 2) fail('组合任务配置无效');
    var wholeLength = steps.length;
    if (values.completedStepIds) {
      if (
        !Array.isArray(values.completedStepIds) ||
        !values.completedStepIds.length ||
        new Set(values.completedStepIds).size !== values.completedStepIds.length ||
        values.completedStepIds.some(function (id) {
          return !steps.some(function (st) {
            return st.id === id;
          });
        })
      )
        fail('请选择本次实际完成的组合步骤');
      steps = steps.filter(function (st) {
        return values.completedStepIds.indexOf(st.id) >= 0;
      });
      var first = p.route.indexOf(steps[0]),
        last = p.route.indexOf(steps[steps.length - 1]);
      if (last - first + 1 !== steps.length) fail('本次组合须为连续步骤；分开的实际操作请分别报工');
    }
    var e = {
      id: ctx.id,
      batchId: p.batchId,
      productId: pid,
      groupId: step.executionGroup,
      groupName:
        steps.length === wholeLength
          ? step.groupName
          : steps
              .map(function (st) {
                return st.name;
              })
              .join(' → '),
      stepIds: steps.map(function (x) {
        return x.id;
      }),
      reportIds: [],
      qty: M.num(values.qty),
      bad: optional(values.bad),
      people: clone(values.people || []),
      hours: clone(values.hours || []),
      machineHours: optional(values.machineHours),
      note: values.note || '',
      reportedBy: ctx.person,
      at: ctx.at,
      status: 'pending',
      over: 0,
      routeVersion: p.routeVersion
    };
    if (e.bad !== null && e.bad > e.qty + EPS) fail('组合不良数超过完成量');
    var people = {};
    if (!e.people.length || new Set(e.people).size !== e.people.length) fail('请填写不重复的参与人员');
    e.hours.forEach(function (h) {
      if (people[h.person] || e.people.indexOf(h.person) < 0) fail('小组人时人员无效');
      people[h.person] = true;
      M.num(h.hours, true);
    });
    enrichReport(s, e, values);
    steps.forEach(function (st, i) {
      var v = Object.assign({}, values, { _groupInternal: true, bad: '', hours: [], machineHours: '' }),
        r = M.report(s, pid, st.id, v, { id: ctx.id + '-report-' + i, at: ctx.at, person: ctx.person });
      r.executionId = e.id;
      r.groupIndex = i;
      if (i > 0) r.previousWarning = false;
      r.effortScope = 'group';
      e.reportIds.push(r.id);
      e.over = Math.max(e.over, r.over || 0);
      e.orderWarning = e.orderWarning || r.orderWarning;
      if (i === 0) e.previousWarning = r.previousWarning;
    });
    s.production.executions.push(e);
    return e;
  }
  function confirmExecution(s, id, good, note, ctx) {
    var e = need(s.production.executions, id, '组合报工');
    if (e.status !== 'pending') fail('组合记录已处理');
    var n = M.num(good, true);
    if (n > e.qty - (e.bad || 0) + EPS) fail('可流转数量超过组合完成数扣除已知不良');
    e.reportIds.forEach(function (rid) {
      M.confirmReport(s, rid, n, note, Object.assign({}, ctx, { _groupConfirm: true }));
    });
    e.status = 'confirmed';
    e.good = n;
    e.confirmedBy = ctx.person;
    e.confirmedAt = ctx.at;
    e.confirmNote = note || '';
  }
  function voidExecution(s, id, note, ctx) {
    var e = need(s.production.executions, id, '组合报工');
    if (e.status === 'void') fail('组合记录已撤销');
    e.reportIds
      .slice()
      .reverse()
      .forEach(function (rid) {
        M.voidReport(s, rid, note, Object.assign({}, ctx, { _groupVoid: true }));
      });
    e.status = 'void';
    e.voidReason = note;
    e.voidBy = ctx.person;
    e.voidAt = ctx.at;
  }
  function updateExecutionTime(s, id, hours, machine, note, ctx) {
    var e = need(s.production.executions, id, '组合报工');
    if (e.status === 'void') fail('组合记录已撤销');
    live(s, e.batchId);
    var seen = {};
    hours.forEach(function (h) {
      if (seen[h.person] || e.people.indexOf(h.person) < 0) fail('参与人员或工时重复');
      seen[h.person] = true;
      M.num(h.hours, true);
    });
    e.timeChanges = e.timeChanges || [];
    e.timeChanges.push({
      id: ctx.id,
      beforeHours: clone(e.hours),
      beforeMachineHours: e.machineHours,
      note: note || '',
      person: ctx.person,
      at: ctx.at
    });
    e.hours = clone(hours);
    e.machineHours = optional(machine);
  }
  function history(s) {
    return s.production.reports
      .filter(function (r) {
        return !r.executionId;
      })
      .concat(s.production.executions)
      .map(function (r) {
        var p = find(s.production.products, r.productId),
          app = find(s.production.processApplications, r.processApplicationId),
          laborKnown = r.people.length > 0 && r.hours.length === r.people.length,
          labor = laborKnown
            ? r.hours.reduce(function (n, h) {
                return n + Number(h.hours);
              }, 0)
            : null,
          good = r.status === 'confirmed' ? r.good : null,
          runtime = r.machineHours,
          elapsed =
            runtime !== null &&
            r.prepHours !== null &&
            r.prepHours !== undefined &&
            r.downtimeHours !== null &&
            r.downtimeHours !== undefined
              ? runtime + r.prepHours + r.downtimeHours
              : null;
        return {
          record: r,
          product: p,
          application: app,
          scope: r.groupName || r.stepName,
          labor: labor,
          machineRate: good !== null && runtime > 0 ? M.round(good / runtime) : null,
          laborRate: good !== null && labor > 0 ? M.round(good / labor) : null,
          elapsedRate: good !== null && elapsed > 0 ? M.round(good / elapsed) : null
        };
      })
      .sort(function (a, b) {
        return (b.record.at || '').localeCompare(a.record.at || '');
      });
  }
  // 投入按方案及实际工序累计，不能把整批板数分摊到每条报工来计算虚假良率。
  function inputHistory(s) {
    return s.production.processApplications
      .map(function (a) {
        var rows = {};
        s.production.consumptions
          .filter(function (c) {
            return c.status !== 'void' && c.processApplicationId === a.id;
          })
          .forEach(function (c) {
            var m = need(s.production.materials, c.materialId, '投入物料'),
              key = m.skuCode + '|' + (c.processStageName || '未指定工序'),
              row =
                rows[key] ||
                (rows[key] = {
                  skuCode: m.skuCode,
                  name: m.name,
                  unit: m.unit,
                  stageName: c.processStageName || '未指定工序',
                  qty: 0,
                  scrap: 0,
                  count: 0
                });
            row.qty = M.round(row.qty + c.qty);
            row.scrap = M.round(row.scrap + c.scrap);
            row.count++;
          });
        return {
          application: a,
          product: find(s.production.products, a.productId),
          rows: Object.keys(rows).map(function (k) {
            return rows[k];
          })
        };
      })
      .filter(function (x) {
        return x.rows.length;
      });
  }
  function enrichConsumption(s, c, ctx) {
    if (!ctx.processApplicationId) return;
    var a = need(s.production.processApplications, ctx.processApplicationId, '实际投入方案');
    if (a.status !== 'active' || a.batchId !== c.batchId) fail('投入方案不属于当前工单或已撤回');
    var m = need(s.production.materials, c.materialId, '物料行');
    if (
      ![a.recipeSnapshot, a.packagingSnapshot].filter(Boolean).some(function (p) {
        return p.items.some(function (i) {
          return i.skuCode === m.skuCode;
        });
      })
    )
      fail('当前物料不在所选方案内');
    c.processApplicationId = a.id;
    c.processProductId = a.productId;
    c.processStageName = ctx.processStageName || '';
  }
  function validate(s) {
    var d = s.production;
    [
      'processRecipes',
      'packagingPlans',
      'processDevices',
      'processApplications',
      'taskChanges',
      'executions'
    ].forEach(function (k) {
      var ids = {};
      d[k].forEach(function (v) {
        if (!v.id || ids[v.id]) fail('工艺数据' + k + '含重复ID');
        ids[v.id] = true;
      });
    });
    ['processRecipes', 'packagingPlans'].forEach(function (key) {
      var versions = {};
      d[key].forEach(function (v) {
        var key0 = v.familyId + '|' + v.version;
        if (versions[key0]) fail('多设备产生同一方案的重复版本，请核对后同步');
        versions[key0] = true;
        (v.items || []).forEach(function (i) {
          if (i.perOutput != null) M.num(i.perOutput);
          if (i.qty != null) M.num(i.qty);
          if (!M.sku(s, i.skuCode)) fail('工艺／包装引用的物料SKU缺失');
          if (i.basis && ['product', 'inner', 'carton'].indexOf(i.basis) < 0) fail('包材计量依据无效');
        });
        if (key === 'packagingPlans') {
          if (v.materialScopeVersion >= 2) checkPackagingRoles(v);
          var c = v.carton || {};
          Object.keys(c).forEach(function (k) {
            if (c[k] != null) M.num(c[k]);
          });
          if (
            c.innerPcs &&
            c.innersPerCarton &&
            c.pcs &&
            Math.abs(c.innerPcs * c.innersPerCarton - c.pcs) > EPS
          )
            fail('同步后的装箱数量不一致');
        }
        if (v.materialScopeVersion >= 2)
          checkMaterialScope(s, key === 'packagingPlans' ? 'packaging' : 'recipe', v.items);
        if (v.route) checkRoute(v.route);
      });
    });
    d.products.filter(active).forEach(function (p) {
      checkRoute(p.route);
      var raw = coverage(s, p.id, false),
        pack = coverage(s, p.id, true);
      var known = p.processReviewApplicationIds || [];
      var rawApps = applications(s, p.id).filter(function (a) {
          return a.recipeSnapshot && a.recipeSnapshot.kind === 'product';
        }),
        packApps = applications(s, p.id).filter(function (a) {
          return a.packagingSnapshot;
        });
      if (
        (raw > p.qty + EPS &&
          (!p.processPlanNeedsReview ||
            rawApps.some(function (a) {
              return known.indexOf(a.id) < 0;
            }))) ||
        (pack > p.qty + EPS &&
          (!p.processPlanNeedsReview ||
            packApps.some(function (a) {
              return known.indexOf(a.id) < 0;
            })))
      )
        fail('多设备选用方案数量超过任务需求，请核对重复安排');
    });
    d.processApplications.forEach(function (a) {
      var p = need(d.products, a.productId, '方案对应产品');
      if (a.batchId !== p.batchId) fail('方案与工单关联错误');
      M.num(a.qty);
      if (a.status === 'active' && a.materialScopeVersion >= 2 && packagingOverlaps(s, p.id).length)
        fail('同步后工艺和包装重复包含同一包材，请核对后重试');
      if (a.status === 'active' && !active(p)) fail('生效方案仍指向已重组任务');
      [a.recipeSnapshot, a.packagingSnapshot].filter(Boolean).forEach(function (plan) {
        if (!matches(s, plan, p)) fail('方案与产品SKU不匹配');
      });
    });
    d.consumptions.forEach(function (c) {
      if (c.processApplicationId) {
        var a = need(d.processApplications, c.processApplicationId, '投入对应方案');
        if (a.batchId !== c.batchId || a.productId !== c.processProductId) fail('工序投入与方案关联不一致');
      }
    });
    d.reports.forEach(function (r) {
      if (r.processApplicationId) {
        var a = need(d.processApplications, r.processApplicationId, '报工对应方案');
        if (a.productId !== r.productId) fail('报工与用料方案关联错误');
      }
      if (r.executionId && !find(d.executions, r.executionId)) fail('组合报工主记录缺失');
    });
    d.executions.forEach(function (e) {
      M.num(e.qty);
      if (e.bad !== null && M.num(e.bad, true) > e.qty + EPS) fail('组合不良数无效');
      if (!e.people.length || new Set(e.people).size !== e.people.length) fail('组合人员无效');
      var seen = {};
      e.hours.forEach(function (h) {
        if (seen[h.person] || e.people.indexOf(h.person) < 0) fail('组合工时重复');
        seen[h.person] = true;
        M.num(h.hours, true);
      });
      if (e.machineHours !== null) M.num(e.machineHours, true);
      var product = need(d.products, e.productId, '组合产品任务');
      if (product.batchId !== e.batchId || !e.groupId) fail('组合报工关联错误');
      var indices = e.stepIds.map(function (id) {
        var st = need(product.route, id, '组合实际步骤');
        if (st.executionGroup !== e.groupId) fail('组合实际步骤不属于原配置');
        return product.route.indexOf(st);
      });
      if (
        new Set(e.stepIds).size !== e.stepIds.length ||
        indices.some(function (n, i) {
          return i > 0 && n !== indices[i - 1] + 1;
        })
      )
        fail('组合实际步骤不连续');
      if (e.reportIds.length !== e.stepIds.length || e.reportIds.length < 1) fail('组合进度记录不完整');
      e.reportIds.forEach(function (id, i) {
        var r = need(d.reports, id, '组合工序报工');
        if (
          r.executionId !== e.id ||
          r.productId !== e.productId ||
          r.stepId !== e.stepIds[i] ||
          r.qty !== e.qty ||
          r.status !== e.status ||
          r.hours.length ||
          r.machineHours !== null ||
          (e.status === 'confirmed' && r.good !== e.good)
        )
          fail('组合报工与工序进度不一致，请核对同步冲突');
      });
    });
    return true;
  }
  var api = {
    current: current,
    isPackaging: isPackaging,
    materialAllowed: materialAllowed,
    packagingCounts: packagingCounts,
    packagingOverlaps: packagingOverlaps,
    separatePackaging: separatePackaging,
    matches: matches,
    active: active,
    checkRoute: checkRoute,
    savePlan: savePlan,
    saveDevice: saveDevice,
    apply: apply,
    applyRoute: applyRoute,
    routeBulk: routeBulk,
    applications: applications,
    coverage: coverage,
    demands: demands,
    materialSuggestion: materialSuggestion,
    withdraw: withdraw,
    cartonEstimate: cartonEstimate,
    merge: merge,
    split: split,
    taskGroups: taskGroups,
    enrichReport: enrichReport,
    reportGroup: reportGroup,
    confirmExecution: confirmExecution,
    voidExecution: voidExecution,
    updateExecutionTime: updateExecutionTime,
    history: history,
    inputHistory: inputHistory,
    enrichConsumption: enrichConsumption,
    validate: validate
  };
  root.CrmProcessModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
