/* 生产管理数据规则：产品与库存沿用CRM主档，不保存第二套库存余额。 */
(function (root) {
  'use strict';
  var EPS = 0.000001;
  function fail(message) {
    throw new Error(message);
  }
  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function num(value, zero) {
    if (value === '' || value === null || value === undefined) fail('请填写数量');
    if (typeof value === 'boolean') fail('数量格式错误');
    var n = Number(value);
    if (!Number.isFinite(n) || n < (zero ? 0 : EPS)) fail('数量须为' + (zero ? '非负' : '正') + '数');
    return n;
  }
  function round(n) {
    return Math.round(n * 1000000) / 1000000;
  }
  function empty() {
    return {
      schemaVersion: 1,
      batches: [],
      products: [],
      materials: [],
      reservations: [],
      consumptions: [],
      reports: [],
      operations: [],
      templates: [],
      planChanges: [],
      processRecipes: [],
      packagingPlans: [],
      processDevices: [],
      processApplications: [],
      taskChanges: [],
      executions: []
    };
  }
  function normalize(p) {
    p = p || empty();
    if (p.schemaVersion !== 1) fail('生产数据版本不支持');
    Object.keys(empty()).forEach(function (k) {
      if (Array.isArray(empty()[k]) && !Array.isArray(p[k])) {
        if (
          p[k] === undefined &&
          [
            'processRecipes',
            'packagingPlans',
            'processDevices',
            'processApplications',
            'taskChanges',
            'executions'
          ].indexOf(k) >= 0
        )
          p[k] = [];
        else fail('生产数据缺少' + k);
      }
    });
    return p;
  }
  function find(list, id) {
    return list.find(function (x) {
      return String(x.id) === String(id);
    });
  }
  function material(s, id) {
    var m = find(s.production.materials, id);
    if (!m) fail('物料行已不存在，请刷新');
    return m;
  }
  function product(s, id) {
    var p = find(s.production.products, id);
    if (!p) fail('产品任务已不存在，请刷新');
    if (p.retiredAt) fail('任务已合并或拆分，请打开当前任务');
    return p;
  }
  function batch(s, id) {
    var b = find(s.production.batches, id);
    if (!b) fail('工单已不存在，请刷新');
    return b;
  }
  function live(s, id) {
    if (['cancelled', 'completed'].indexOf(batch(s, id).status) >= 0) fail('已关闭工单不能再操作');
  }
  function sku(s, code) {
    var out = null;
    (s.catalog.products || []).forEach(function (p) {
      (p.skus || []).forEach(function (k) {
        if (k.skuCode === code) out = { product: p, sku: k };
      });
    });
    return out;
  }
  function stocked(x) {
    return (
      x &&
      !x.product.isBundle &&
      x.product.type !== 'service' &&
      !x.sku.isBundle &&
      (x.sku.hasStock === true || (x.sku.hasStock === undefined && x.product.hasStock === true))
    );
  }
  function stock(s, code) {
    return round(
      (s.inventory.movements || [])
        .filter(function (x) {
          return x.skuCode === code;
        })
        .reduce(function (n, x) {
          return n + Number(x.qty || 0);
        }, 0)
    );
  }
  function issued(s, id, gross) {
    return round(
      (s.inventory.movements || [])
        .filter(function (x) {
          return x.productionMaterialId === id;
        })
        .reduce(function (n, x) {
          return (
            n +
            (x.productionAction === 'issue'
              ? -Number(x.qty)
              : !gross && x.productionAction === 'return'
                ? -Number(x.qty)
                : 0)
          );
        }, 0)
    );
  }
  function consumed(s, id) {
    return round(
      s.production.consumptions
        .filter(function (x) {
          return x.materialId === id && x.status !== 'void';
        })
        .reduce(function (n, x) {
          return n + Number(x.qty);
        }, 0)
    );
  }
  function reserved(s, id) {
    return round(
      s.production.reservations
        .filter(function (x) {
          return x.materialId === id;
        })
        .reduce(function (n, x) {
          return n + Number(x.qty);
        }, 0) - issued(s, id, true)
    );
  }
  function heldForSku(s, code) {
    return round(
      s.production.materials
        .filter(function (m) {
          return m.skuCode === code;
        })
        .reduce(function (n, m) {
          return n + reserved(s, m.id);
        }, 0)
    );
  }
  function free(s, code) {
    return round(stock(s, code) - heldForSku(s, code));
  }
  function received(s, po, code) {
    var qty = 0;
    (s.inventory.documents || [])
      .filter(function (d) {
        return (
          d.direction === 'in' &&
          d.sourceType === 'po' &&
          String(d.sourceId) === String(po.id) &&
          d.status === '已确认'
        );
      })
      .forEach(function (d) {
        (d.items || []).forEach(function (i) {
          if (i.skuCode === code) qty += Number(i.actualQty || 0);
        });
      });
    (s.inventory.movements || []).forEach(function (m) {
      if (m.sourceType === 'po' && m.sourceId === po.poNumber && m.skuCode === code)
        qty += Number(m.qty || 0);
    });
    return Math.max(0, qty);
  }
  // 按当前采购明细和实际收货分摊覆盖，删除/减量/作废的采购不沿用旧覆盖数。
  function procurementCoverage(s, materialId) {
    var result = { draft: 0, ordered: 0, links: [] };
    (s.procurement.pos || []).forEach(function (po) {
      if (['已取消', '已作废', 'cancelled'].indexOf(po.stage) >= 0) return;
      var by = {};
      (po.productionLinks || []).forEach(function (l) {
        (by[l.skuCode + '|' + l.unit] || (by[l.skuCode + '|' + l.unit] = [])).push(l);
      });
      Object.keys(by).forEach(function (key) {
        var code = by[key][0].skuCode,
          unit = by[key][0].unit;
        var qty = (po.items || [])
            .filter(function (i) {
              return i.skuCode === code && i.unit === unit;
            })
            .reduce(function (n, i) {
              return n + Number(i.qty || 0);
            }, 0),
          rcv = received(s, po, code);
        by[key].forEach(function (l) {
          var allocated = Math.min(Number(l.qty), Math.max(0, qty));
          qty -= allocated;
          var arrived = Math.min(allocated, rcv);
          rcv -= arrived;
          var open = po.stage === '已入库' ? 0 : Math.max(0, allocated - arrived);
          if (l.materialId === materialId && open > EPS) {
            result[po.stage === '草稿' ? 'draft' : 'ordered'] += open;
            result.links.push({ id: po.id, number: po.poNumber, stage: po.stage, qty: open });
          }
        });
      });
    });
    result.draft = round(result.draft);
    result.ordered = round(result.ordered);
    return result;
  }
  function balance(s, m) {
    var po = procurementCoverage(s, m.id),
      hold = reserved(s, m.id),
      issue = issued(s, m.id, false),
      used = consumed(s, m.id);
    return {
      stock: stock(s, m.skuCode),
      reserved: hold,
      other: round(heldForSku(s, m.skuCode) - hold),
      free: free(s, m.skuCode),
      issued: issue,
      unused: round(issue - used),
      consumed: used,
      draft: po.draft,
      ordered: po.ordered,
      links: po.links,
      gap: m.target === null ? null : round(Math.max(0, m.target - hold - issue - po.draft - po.ordered))
    };
  }
  function createBatch(s, ids, merge, ctx, title) {
    var selected = s.orders.filter(function (o) {
      return ids.indexOf(String(o.id)) >= 0;
    });
    if (!selected.length) fail('请选择销售订单');
    var b = {
        id: ctx.id,
        name: title || '生产工单',
        status: 'draft',
        createdAt: ctx.at,
        createdBy: ctx.person,
        orderIds: selected.map(function (o) {
          return String(o.id);
        })
      },
      rows = [];
    selected.forEach(function (o) {
      if (o.completed) fail('已完成订单不能新建生产工单');
      if (!(o.items || []).length) fail('订单没有产品明细');
      o.items.forEach(function (i, index) {
        var quantity = num(i.qty),
          lineKey = String(i.id === undefined ? 'index-' + index : i.id),
          code = i.skuCode || '';
        if (!code || !sku(s, code)) fail('请先把订单产品关联到产品库SKU');
        var duplicate = s.production.products.some(function (p) {
          return (
            !p.retiredAt &&
            batch(s, p.batchId).status !== 'cancelled' &&
            p.sources.some(function (a) {
              return a.orderId === String(o.id) && a.lineId === lineKey;
            })
          );
        });
        if (duplicate) fail('所选订单明细已有工单，请打开原工单核对');
        var unit = i.unit || '个',
          p =
            merge &&
            rows.find(function (r) {
              return r.skuCode === code && r.unit === unit;
            });
        if (!p) {
          p = {
            id: ctx.id + '-p' + rows.length,
            batchId: b.id,
            skuCode: code,
            name: i.nameCN || sku(s, code).product.nameCN,
            description: i.descCN || '',
            unit: unit,
            qty: 0,
            sources: [],
            route: [],
            routeVersion: 1,
            released: false,
            packaging: '',
            materialsNeedReview: true
          };
          rows.push(p);
        }
        p.qty = round(p.qty + quantity);
        p.sources.push({
          id: ctx.id + '-s' + rows.length + '-' + index + '-' + o.id,
          orderId: String(o.id),
          lineId: lineKey,
          orderNumber: o.orderNumber || String(o.id),
          alias: o.alias || '',
          delivery: o.delivery || '',
          qty: quantity,
          skuCode: code,
          unit: unit
        });
      });
    });
    s.production.batches.push(b);
    Array.prototype.push.apply(s.production.products, rows);
    return b;
  }
  function orderDrift(s, p) {
    return (
      p.sources.filter(function (a) {
        var o = find(s.orders, a.orderId),
          i =
            o &&
            (o.items || []).find(function (v, index) {
              return String(v.id === undefined ? 'index-' + index : v.id) === a.lineId;
            });
        return (
          !o ||
          o.completed ||
          !i ||
          i.skuCode !== a.skuCode ||
          Number(i.qty) !== a.qty ||
          (o.delivery || '') !== a.delivery ||
          (i.unit || '个') !== a.unit
        );
      }).length > 0
    );
  }
  function reconcileOrder(s, pid, note, ctx) {
    var p = product(s, pid);
    live(s, p.batchId);
    if (!String(note || '').trim()) fail('请填写订单变更核对说明');
    var next = p.sources.map(function (a) {
      var o = find(s.orders, a.orderId),
        i =
          o &&
          (o.items || []).find(function (v, index) {
            return String(v.id === undefined ? 'index-' + index : v.id) === a.lineId;
          });
      if (!o || !i || i.skuCode !== p.skuCode || (i.unit || '个') !== p.unit)
        fail('来源已删除或SKU/单位已更换，请保留原任务并单独核对，不能当数量变更处理');
      var fresh = copy(a);
      fresh.qty = num(i.qty);
      fresh.delivery = o.delivery || '';
      return fresh;
    });
    var quantity = round(
      next.reduce(function (n, a) {
        return n + a.qty;
      }, 0)
    );
    s.production.planChanges.push({
      id: ctx.id,
      productId: p.id,
      batchId: p.batchId,
      beforeQty: p.qty,
      afterQty: quantity,
      beforeSources: copy(p.sources),
      afterSources: copy(next),
      note: note.trim(),
      person: ctx.person,
      at: ctx.at
    });
    p.qty = quantity;
    p.sources = next;
    p.materialsNeedReview = true;
    p.processPlanNeedsReview = true;
    p.processReviewApplicationIds = s.production.processApplications
      .filter(function (a) {
        return a.productId === p.id && a.status === 'active';
      })
      .map(function (a) {
        return a.id;
      });
  }
  function addMaterial(s, bid, code, ctx) {
    live(s, bid);
    var x = sku(s, code);
    if (!stocked(x)) fail('请选择产品库中启用库存的实物SKU，组合和服务不能领料');
    if (
      s.production.materials.some(function (m) {
        return m.batchId === bid && m.skuCode === code;
      })
    )
      fail('该规格已在物料清单中');
    var m = {
      id: ctx.id,
      batchId: bid,
      skuCode: code,
      unit: x.sku.stockUnit || '个',
      name: x.product.nameCN,
      variant: x.sku.variantCN || x.sku.size || '',
      target: null,
      theoretical: null,
      yieldPerUnit: null,
      uses: [],
      checkedAt: '',
      checkedBy: '',
      note: '',
      source: '手工选料'
    };
    s.production.materials.push(m);
    return m;
  }
  function updateMaterial(s, id, values, ctx) {
    var m = material(s, id);
    live(s, m.batchId);
    var target = num(values.target, true),
      b = balance(s, m);
    if (target + EPS < b.reserved + b.issued + b.draft + b.ordered)
      fail('目标小于已预留/已领/已安排采购，请先释放或调整对应记录');
    var allowed = s.production.products
      .filter(function (p) {
        return p.batchId === m.batchId;
      })
      .map(function (p) {
        return p.id;
      });
    if (
      (values.uses || []).some(function (v) {
        return allowed.indexOf(v) < 0;
      })
    )
      fail('产品归属不属于本工单');
    m.target = target;
    m.theoretical =
      values.theoretical === undefined || values.theoretical === '' ? null : num(values.theoretical, true);
    m.yieldPerUnit =
      values.yieldPerUnit === undefined || values.yieldPerUnit === '' ? null : num(values.yieldPerUnit);
    m.uses = values.uses || [];
    m.note = values.note || '';
    m.checkedAt = values.checked ? ctx.at : '';
    m.checkedBy = values.checked ? ctx.person : '';
  }
  function removeMaterial(s, id) {
    var m = material(s, id);
    live(s, m.batchId);
    if (
      s.production.reservations.some(function (x) {
        return x.materialId === id;
      }) ||
      s.production.consumptions.some(function (x) {
        return x.materialId === id;
      }) ||
      (s.inventory.movements || []).some(function (x) {
        return x.productionMaterialId === id;
      }) ||
      (s.procurement.pos || []).some(function (po) {
        return (po.productionLinks || []).some(function (x) {
          return x.materialId === id;
        });
      })
    )
      fail('已有业务记录的物料保留追溯，请调整目标或释放预留');
    s.production.materials = s.production.materials.filter(function (x) {
      return x.id !== id;
    });
  }
  function reserve(s, id, quantity, release, ctx) {
    var m = material(s, id);
    live(s, m.batchId);
    var qty = num(quantity),
      b = balance(s, m);
    if (!m.checkedAt || m.target === null) fail('请先核对库存并保存本批备料目标');
    if (release) {
      if (qty > b.reserved + EPS) fail('释放数超过本批预留');
    } else {
      if (!stocked(sku(s, m.skuCode))) fail('该SKU已停用库存管理');
      if (qty > b.free + EPS) fail('可用现货不足，请刷新或核实库存');
      if (qty > b.gap + EPS) fail('预留超过当前未覆盖需求，请先调整采购或备料目标');
    }
    s.production.reservations.push({
      id: ctx.id,
      materialId: id,
      batchId: m.batchId,
      skuCode: m.skuCode,
      qty: release ? -qty : qty,
      person: ctx.person,
      at: ctx.at
    });
  }
  function moveMaterial(s, id, quantity, returning, ctx, recipient) {
    var m = material(s, id);
    live(s, m.batchId);
    var qty = num(quantity),
      b = balance(s, m);
    if (!recipient || !recipient.trim()) fail('请填写实际领/退料人');
    if (returning) {
      if (qty > b.unused + EPS) fail('退料超过已领未耗用数');
    } else if (qty > b.reserved + EPS || qty > b.stock + EPS) fail('领料超过本批预留或仓库实存');
    var docId = ctx.id + '-doc',
      docNo =
        (returning ? 'PR-' : 'MI-') +
        (ctx.date || ctx.at.slice(0, 10)).replace(/-/g, '') +
        '-' +
        ctx.id
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(-12)
          .toUpperCase();
    var movement = {
      id: ctx.id,
      date: ctx.date || ctx.at.slice(0, 10),
      skuCode: m.skuCode,
      nameCN: m.name,
      unit: m.unit,
      movementType: returning ? '生产退料' : '生产领料',
      qty: returning ? qty : -qty,
      sourceType: 'production',
      sourceId: docNo,
      productionBatchId: m.batchId,
      productionMaterialId: id,
      productionAction: returning ? 'return' : 'issue',
      person: recipient.trim(),
      recordedBy: ctx.person,
      note: '工单 ' + batch(s, m.batchId).name
    };
    s.inventory.movements.push(movement);
    s.inventory.documents = s.inventory.documents || [];
    s.inventory.documents.push({
      id: docId,
      docNo: docNo,
      direction: returning ? 'in' : 'out',
      type: movement.movementType,
      date: movement.date,
      person: recipient.trim(),
      sourceType: 'production',
      sourceId: m.batchId,
      sourceName: batch(s, m.batchId).name,
      status: '已确认',
      confirmedBy: ctx.person,
      confirmedDate: movement.date,
      productionManaged: true,
      items: [{ skuCode: m.skuCode, nameCN: m.name, unit: m.unit, planQty: qty, actualQty: qty }],
      movementIds: [ctx.id],
      note: movement.note
    });
    return movement;
  }
  function consume(s, id, quantity, scrap, note, ctx) {
    var m = material(s, id);
    live(s, m.batchId);
    var qty = num(quantity),
      bad = num(scrap, true);
    if (bad > qty + EPS) fail('损耗数不能超过本次投入数');
    if (qty > balance(s, m).unused + EPS) fail('投入超过已领未耗用数');
    s.production.consumptions.push({
      id: ctx.id,
      materialId: id,
      batchId: m.batchId,
      qty: qty,
      scrap: bad,
      note: note || '',
      person: ctx.person,
      at: ctx.at
    });
    if (root.CrmProcessModel)
      root.CrmProcessModel.enrichConsumption(
        s,
        s.production.consumptions[s.production.consumptions.length - 1],
        ctx
      );
  }
  function voidConsumption(s, id, note, ctx) {
    var c = find(s.production.consumptions, id);
    if (!c || c.status === 'void') fail('投入记录已撤销');
    live(s, c.batchId);
    if (!String(note || '').trim()) fail('请填写更正原因');
    c.status = 'void';
    c.voidBy = ctx.person;
    c.voidAt = ctx.at;
    c.voidReason = note.trim();
  }
  function copyConfig(s, bid, t, ctx) {
    live(s, bid);
    var sourceMaterials = t.materials || [],
      sourceProducts = t.products || [],
      count = 0;
    sourceMaterials.forEach(function (old, index) {
      if (
        s.production.materials.some(function (m) {
          return m.batchId === bid && m.skuCode === old.skuCode;
        })
      )
        return;
      if (!stocked(sku(s, old.skuCode))) return;
      var m = addMaterial(s, bid, old.skuCode, { id: ctx.id + '-m' + index });
      m.source = t.name || '历史配置';
      m.referenceTarget = old.target;
      m.referenceNote = old.note || '';
      m.uses = s.production.products
        .filter(function (p) {
          return !p.retiredAt && p.batchId === bid && (old.useSkus || []).indexOf(p.skuCode) >= 0;
        })
        .map(function (p) {
          return p.id;
        });
      m.referenceQty = old.referenceQty || null;
      m.yieldPerUnit = old.yieldPerUnit || null;
      count++;
    });
    s.production.products
      .filter(function (p) {
        return (
          p.batchId === bid &&
          !p.retiredAt &&
          !p.released &&
          !s.production.reports.some(function (r) {
            return r.productId === p.id;
          })
        );
      })
      .forEach(function (p, index) {
        var old = sourceProducts.find(function (x) {
          return x.skuCode === p.skuCode;
        });
        if (old) {
          p.route = (old.route || []).map(function (step, i) {
            return {
              id: ctx.id + '-r' + index + '-' + i,
              operationId: step.operationId || '',
              name: step.name,
              requirements: step.requirements || '',
              assignees: [],
              rate: step.rate === undefined ? '' : step.rate,
              rateMode: step.rateMode || '人时',
              executionGroup: step.executionGroup
                ? ctx.id + '-group-' + index + '-' + step.executionGroup
                : '',
              groupName: step.groupName || ''
            };
          });
          p.packaging = old.packaging || '';
          p.routeVersion++;
          p.materialsNeedReview = true;
        }
      });
    return count;
  }
  function configFromBatch(s, bid) {
    var b = batch(s, bid),
      products = s.production.products.filter(function (p) {
        return p.batchId === bid && !p.retiredAt;
      });
    return {
      name: b.name,
      products: products.map(function (p) {
        return { skuCode: p.skuCode, route: copy(p.route), packaging: p.packaging };
      }),
      materials: s.production.materials
        .filter(function (m) {
          return m.batchId === bid;
        })
        .map(function (m) {
          return {
            skuCode: m.skuCode,
            target: m.target,
            yieldPerUnit: m.yieldPerUnit || null,
            note: m.note,
            useSkus: products
              .filter(function (p) {
                return m.uses.indexOf(p.id) >= 0;
              })
              .map(function (p) {
                return p.skuCode;
              }),
            referenceQty:
              products
                .filter(function (p) {
                  return m.uses.indexOf(p.id) >= 0;
                })
                .reduce(function (n, p) {
                  return n + p.qty;
                }, 0) || null
          };
        })
    };
  }
  function setRoute(s, id, route, packaging, ctx) {
    var p = product(s, id);
    live(s, p.batchId);
    if (
      p.released ||
      s.production.reports.some(function (r) {
        return r.productId === id;
      })
    )
      fail('已下达路线保留版本；尚无报工时可先撤回下达再修改');
    var seen = {};
    route.forEach(function (step) {
      if (!step.id || seen[step.id] || !step.name.trim()) fail('工序名称或步骤编号无效');
      seen[step.id] = true;
      if (step.rate !== '' && step.rate !== null && step.rate !== undefined) num(step.rate);
      step.assignees = Array.from(new Set(step.assignees || []));
    });
    p.route = copy(route);
    p.packaging = packaging || '';
    p.routeVersion++;
    p.materialsNeedReview = true;
    p.updatedBy = ctx.person;
    p.updatedAt = ctx.at;
  }
  function releaseRoute(s, id, retract) {
    var p = product(s, id);
    live(s, p.batchId);
    if (retract) {
      if (
        s.production.reports.some(function (r) {
          return r.productId === id && r.status !== 'void';
        })
      )
        fail('已有报工，不能撤回路线');
      p.released = false;
      return;
    }
    if (orderDrift(s, p)) fail('来源订单发生变动，请先核对；本版不自动重写已建工单');
    if (
      !p.route.length ||
      p.route.some(function (step) {
        return !step.assignees.length;
      })
    )
      fail('请先配置工序并分派实际人员');
    p.released = true;
    p.materialsNeedReview = false;
    batch(s, p.batchId).status = 'active';
  }
  function totals(s, pid, stepId) {
    var rs = s.production.reports.filter(function (r) {
      return r.productId === pid && r.stepId === stepId && r.status !== 'void';
    });
    return {
      reported: round(
        rs.reduce(function (n, r) {
          return n + r.qty;
        }, 0)
      ),
      confirmed: round(
        rs
          .filter(function (r) {
            return r.status === 'confirmed';
          })
          .reduce(function (n, r) {
            return n + r.good;
          }, 0)
      ),
      pending: rs.filter(function (r) {
        return r.status === 'pending';
      }).length
    };
  }
  function report(s, pid, stepId, values, ctx) {
    var p = product(s, pid);
    live(s, p.batchId);
    if (!p.released) fail('任务尚未下达');
    var step = find(p.route, stepId);
    if (!step) fail('工序已不存在');
    if (step.executionGroup && !values._groupInternal && root.CrmProcessModel)
      return root.CrmProcessModel.reportGroup(s, pid, stepId, values, ctx);
    if (
      s.production.reports.some(function (r) {
        return r.id === ctx.id;
      })
    )
      return;
    var qty = num(values.qty),
      people = Array.from(
        new Set(
          (values.people || [])
            .map(function (x) {
              return x.trim();
            })
            .filter(Boolean)
        )
      );
    if (!people.length) fail('请填写实际参与人');
    var bad =
      values.bad === '' || values.bad === null || values.bad === undefined ? null : num(values.bad, true);
    if (bad !== null && bad > qty + EPS) fail('不良数不能超过本次完成数');
    var hours = values.hours || [],
      hourPeople = {};
    hours.forEach(function (h) {
      if (hourPeople[h.person]) fail('同一人员工时只能填写一次');
      hourPeople[h.person] = true;
      if (people.indexOf(h.person) < 0) fail('工时人员不在参与名单中');
      num(h.hours, true);
    });
    var previous =
      p.route.indexOf(step) > 0 ? totals(s, pid, p.route[p.route.indexOf(step) - 1].id).confirmed : null;
    var sum = totals(s, pid, stepId).reported + qty;
    var r = {
      id: ctx.id,
      batchId: p.batchId,
      productId: pid,
      stepId: stepId,
      stepName: step.name,
      routeVersion: p.routeVersion,
      qty: qty,
      bad: bad,
      people: people,
      hours: copy(hours),
      machineHours:
        values.machineHours === '' || values.machineHours === undefined
          ? null
          : num(values.machineHours, true),
      note: values.note || '',
      reportedBy: ctx.person,
      at: ctx.at,
      status: 'pending',
      over: round(Math.max(0, sum - p.qty)),
      orderWarning: orderDrift(s, p),
      previousWarning: previous !== null && sum > previous + EPS
    };
    if (root.CrmProcessModel) root.CrmProcessModel.enrichReport(s, r, values);
    s.production.reports.push(r);
    return r;
  }
  function updateReportTime(s, id, hours, machineHours, note, ctx) {
    var r = find(s.production.reports, id);
    if (!r || r.status === 'void') fail('报工记录不存在或已撤销');
    if (r.executionId) fail('组合报工请从组合记录补充工时');
    live(s, r.batchId);
    var people = {};
    hours.forEach(function (h) {
      if (people[h.person] || r.people.indexOf(h.person) < 0) fail('工时人员重复或不在原参与名单中');
      people[h.person] = true;
      num(h.hours, true);
    });
    var machine = machineHours === '' ? null : num(machineHours, true);
    r.timeChanges = r.timeChanges || [];
    r.timeChanges.push({
      id: ctx.id,
      beforeHours: copy(r.hours),
      beforeMachineHours: r.machineHours,
      afterHours: copy(hours),
      afterMachineHours: machine,
      note: note || '',
      person: ctx.person,
      at: ctx.at
    });
    r.hours = copy(hours);
    r.machineHours = machine;
  }
  function confirmReport(s, id, good, note, ctx) {
    var r = find(s.production.reports, id);
    if (!r || r.status !== 'pending') fail('报工已处理，请刷新');
    if (r.executionId && !ctx._groupConfirm) fail('组合报工请整组核对');
    live(s, r.batchId);
    var p = product(s, r.productId),
      n = num(good, true);
    if (orderDrift(s, p)) fail('来源订单已变更，真实报工已保留，请先核对任务数量再确认流转');
    if (n > r.qty + EPS || (r.bad !== null && n > r.qty - r.bad + EPS))
      fail('确认可流转数超过本次报工扣除已知不良的数量');
    var step = find(p.route, r.stepId),
      index = p.route.indexOf(step),
      confirmed = totals(s, p.id, step.id).confirmed;
    if (index > 0 && confirmed + n > totals(s, p.id, p.route[index - 1].id).confirmed + EPS)
      fail('超过上道已确认可流转量，请先核对工序交接');
    if ((r.over > EPS || r.previousWarning || confirmed + n > p.qty + EPS) && !String(note || '').trim())
      fail('超产或交接异常需填写核对说明');
    r.status = 'confirmed';
    r.good = n;
    r.confirmNote = note || '';
    r.confirmedBy = ctx.person;
    r.confirmedAt = ctx.at;
  }
  function voidReport(s, id, note, ctx) {
    var r = find(s.production.reports, id);
    if (!r || r.status === 'void') fail('记录已撤销');
    if (r.executionId && !ctx._groupVoid) fail('组合报工请整组撤销');
    live(s, r.batchId);
    if (!String(note || '').trim()) fail('请填写更正原因');
    var p = product(s, r.productId),
      index = p.route.findIndex(function (step) {
        return step.id === r.stepId;
      });
    if (
      r.status === 'confirmed' &&
      index < p.route.length - 1 &&
      totals(s, p.id, p.route[index + 1].id).confirmed > totals(s, p.id, r.stepId).confirmed - r.good + EPS
    )
      fail('后道已有交接，请先撤销受影响的后道记录');
    r.status = 'void';
    r.voidReason = note;
    r.voidBy = ctx.person;
    r.voidAt = ctx.at;
  }
  function createProcurement(s, requests, supplierId, currency, ctx, poNumber) {
    var supplier = find(s.procurement.suppliers || [], supplierId);
    if (!supplier) fail('请选择现有供应商');
    if (['CNY', 'USD'].indexOf(currency) < 0) fail('币种无效');
    if (!requests.length) fail('请选择采购物料');
    var seen = {},
      items = [],
      links = [];
    requests.forEach(function (request, index) {
      var m = material(s, request.materialId);
      live(s, m.batchId);
      if (seen[m.id]) fail('重复采购来源');
      seen[m.id] = true;
      var b = balance(s, m),
        qty = num(request.qty);
      if (!m.checkedAt || b.gap === null) fail('物料尚未完成核料');
      if (b.free > EPS) fail(m.name + '仍有可用现货，请先预留再安排缺口采购');
      if (qty > b.gap + EPS) fail('采购数量超过当前缺口，请刷新');
      var item = items.find(function (i) {
        return i.skuCode === m.skuCode && i.unit === m.unit;
      });
      if (!item) {
        item = { skuCode: m.skuCode, nameCN: m.name, qty: 0, unit: m.unit, currency: currency, unitCost: '' };
        items.push(item);
      }
      item.qty = round(item.qty + qty);
      links.push({
        id: ctx.id + '-link' + index,
        materialId: m.id,
        batchId: m.batchId,
        skuCode: m.skuCode,
        unit: m.unit,
        qty: qty
      });
    });
    var po = {
      id: ctx.id,
      poNumber: poNumber,
      supplierId: supplierId,
      supplierName: supplier.name || supplier.alias || '',
      person: ctx.person,
      stage: '草稿',
      createDate: ctx.at.slice(0, 10),
      receivedDate: '',
      items: items,
      fees: [],
      totalCNY: 0,
      totalUSD: 0,
      paymentIds: [],
      followups: [],
      paymentStatus: '未付款',
      productionLinks: links,
      note: '由生产缺口汇总生成，价格及交付条件待核；不代表已下单或已收货。'
    };
    s.procurement.pos.push(po);
    return po;
  }
  function validate(s) {
    normalize(s.production);
    var p = s.production,
      ids = {};
    [
      'batches',
      'products',
      'materials',
      'reservations',
      'consumptions',
      'reports',
      'operations',
      'templates',
      'planChanges'
    ].forEach(function (k) {
      ids = {};
      p[k].forEach(function (v) {
        if (!v.id || ids[v.id]) fail('生产' + k + '含重复或缺失ID');
        ids[v.id] = true;
      });
    });
    var codes = {};
    p.materials.forEach(function (m) {
      batch(s, m.batchId);
      var key = m.batchId + '|' + m.skuCode;
      if (codes[key]) fail('同工单物料SKU重复');
      codes[key] = true;
      if (m.target !== null) num(m.target, true);
      if (reserved(s, m.id) < -EPS || balance(s, m).unused < -EPS)
        fail('多设备领料/耗用超出覆盖，请核对后再同步');
      if (
        m.target !== null &&
        reserved(s, m.id) +
          issued(s, m.id, false) +
          procurementCoverage(s, m.id).draft +
          procurementCoverage(s, m.id).ordered >
          m.target + EPS
      )
        fail('合并后预留/领料/采购覆盖超过目标，请核对重复安排');
      if (!sku(s, m.skuCode)) fail('生产引用物料SKU缺失，请先恢复主档');
    });
    var sourceKeys = {};
    p.products.forEach(function (pr) {
      if (pr.retiredAt || batch(s, pr.batchId).status === 'cancelled') return;
      pr.sources.forEach(function (a) {
        var key = a.orderId + '|' + a.lineId;
        if (sourceKeys[key]) fail('同一销售明细被多个设备重复建工单，请核对');
        sourceKeys[key] = true;
      });
    });
    var poNumbers = {};
    (s.procurement.pos || []).forEach(function (po) {
      var linked = (po.productionLinks || []).length > 0;
      if (po.poNumber && poNumbers[po.poNumber] && (linked || poNumbers[po.poNumber].linked))
        fail('生产关联采购单号重复，请核对后再同步');
      if (po.poNumber) poNumbers[po.poNumber] = { linked: linked };
      (po.productionLinks || []).forEach(function (l) {
        var m = material(s, l.materialId);
        if (m.skuCode !== l.skuCode || m.batchId !== l.batchId || m.unit !== l.unit)
          fail('采购来源与生产物料不匹配');
        num(l.qty);
      });
    });
    var checked = {};
    p.materials.forEach(function (m) {
      if (checked[m.skuCode]) return;
      checked[m.skuCode] = true;
      if (heldForSku(s, m.skuCode) > Math.max(0, stock(s, m.skuCode)) + EPS)
        fail('库存不足以覆盖生产预留，请核对领退料/多设备预留');
    });
    p.reservations.forEach(function (r) {
      var m = material(s, r.materialId);
      if (
        r.skuCode !== m.skuCode ||
        r.batchId !== m.batchId ||
        !Number.isFinite(Number(r.qty)) ||
        !Number(r.qty)
      )
        fail('生产预留关联或数量错误');
    });
    p.consumptions.forEach(function (c) {
      material(s, c.materialId);
      num(c.qty);
      num(c.scrap, true);
      if (c.scrap > c.qty + EPS) fail('生产损耗错误');
    });
    p.products.forEach(function (pr) {
      batch(s, pr.batchId);
      num(pr.qty);
      if (
        Math.abs(
          pr.qty -
            pr.sources.reduce(function (n, a) {
              return n + num(a.qty);
            }, 0)
        ) > EPS ||
        pr.sources.some(function (a) {
          return a.skuCode !== pr.skuCode || a.unit !== pr.unit;
        })
      )
        fail('产品任务数量或SKU与来源明细不一致');
      var stepIds = {};
      pr.route.forEach(function (step, index) {
        if (stepIds[step.id]) fail('工序步骤ID重复');
        stepIds[step.id] = true;
        var done = totals(s, pr.id, step.id).confirmed;
        if (index > 0 && done > totals(s, pr.id, pr.route[index - 1].id).confirmed + EPS)
          fail('合并后工序交接数量不足，请核对');
      });
    });
    p.reports.forEach(function (r) {
      var pr = product(s, r.productId);
      if (!find(pr.route, r.stepId) || r.routeVersion !== pr.routeVersion) fail('报工对应路线版本缺失');
      num(r.qty);
      if (
        r.batchId !== pr.batchId ||
        !Array.isArray(r.people) ||
        !r.people.length ||
        new Set(r.people).size !== r.people.length
      )
        fail('报工参与人或工单关联无效');
      if (r.bad !== null && num(r.bad, true) > r.qty + EPS) fail('报工不良数无效');
      var hourPeople = {};
      (r.hours || []).forEach(function (h) {
        if (hourPeople[h.person] || r.people.indexOf(h.person) < 0) fail('报工人时人员无效');
        hourPeople[h.person] = true;
        num(h.hours, true);
      });
      if (r.machineHours !== null) num(r.machineHours, true);
      if (['pending', 'confirmed', 'void'].indexOf(r.status) < 0) fail('报工状态无效');
      if (
        r.status === 'confirmed' &&
        (num(r.good, true) > r.qty + EPS || (r.bad !== null && r.good > r.qty - r.bad + EPS))
      )
        fail('报工确认数无效');
    });
    (s.inventory.movements || [])
      .filter(function (m) {
        return m.productionMaterialId;
      })
      .forEach(function (m) {
        var item = material(s, m.productionMaterialId);
        if (
          !(s.inventory.documents || []).some(function (d) {
            return (
              d.productionManaged &&
              d.sourceId === m.productionBatchId &&
              (d.movementIds || []).indexOf(m.id) >= 0
            );
          })
        )
          fail('生产领退料对应库存单缺失');
        if (m.skuCode !== item.skuCode || m.productionBatchId !== item.batchId || m.unit !== item.unit)
          fail('生产领退料SKU/单位关联错误');
        if (
          (m.productionAction === 'issue' && !(Number(m.qty) < 0)) ||
          (m.productionAction === 'return' && !(Number(m.qty) > 0)) ||
          ['issue', 'return'].indexOf(m.productionAction) < 0
        )
          fail('生产领退料方向错误');
      });
    if (root.CrmProcessModel) root.CrmProcessModel.validate(s);
    return true;
  }
  function validateStores(stores) {
    if (!stores.crm_production_v1) {
      if (
        ((stores.crm_inv_v5 || {}).movements || []).some(function (m) {
          return m.productionMaterialId;
        })
      )
        fail('备份缺少生产领料对应工单');
      return true;
    }
    return validate({
      production: stores.crm_production_v1,
      inventory: stores.crm_inv_v5 || { movements: [] },
      catalog: stores.crm_prodcat_v5 || { products: [] },
      procurement: stores.crm_proc_v5 || { pos: [] },
      orders: stores.crm_ord_v5 || []
    });
  }
  var api = {
    empty: empty,
    normalize: normalize,
    num: num,
    round: round,
    find: find,
    sku: sku,
    stocked: stocked,
    stock: stock,
    free: free,
    reserved: reserved,
    issued: issued,
    balance: balance,
    createBatch: createBatch,
    orderDrift: orderDrift,
    reconcileOrder: reconcileOrder,
    addMaterial: addMaterial,
    updateMaterial: updateMaterial,
    removeMaterial: removeMaterial,
    reserve: reserve,
    moveMaterial: moveMaterial,
    consume: consume,
    voidConsumption: voidConsumption,
    copyConfig: copyConfig,
    configFromBatch: configFromBatch,
    setRoute: setRoute,
    releaseRoute: releaseRoute,
    totals: totals,
    report: report,
    confirmReport: confirmReport,
    updateReportTime: updateReportTime,
    voidReport: voidReport,
    createProcurement: createProcurement,
    validate: validate,
    validateStores: validateStores
  };
  root.CrmProductionModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
