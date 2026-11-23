/* 工艺库独立工作区；物料引用既有SKU，方案选用保留版本。 */
(function (root) {
  'use strict';
  var X = root.CrmProcessModel,
    M = root.CrmProductionModel,
    H = root.CrmProduction.helpers;
  var state = { tab: 'recipes', query: '', historyCondition: '', draft: null, kind: 'recipe', pid: '' };
  function uid() {
    return 'px-' + crypto.randomUUID();
  }
  function e(x) {
    return H.e(x);
  }
  function n(x) {
    return H.n(x);
  }
  function v(id) {
    return H.val(id);
  }
  function data() {
    return H.data();
  }
  function find(a, id) {
    var r = M.find(a || [], id);
    if (!r) throw new Error('记录已变化，请刷新');
    return r;
  }
  function b(t, a, value, primary) {
    return (
      '<button type="button" class="btn ' +
      (primary ? 'btn-primary' : 'btn-outline') +
      ' btn-sm" data-px="' +
      a +
      '" data-value="' +
      e(value || '') +
      '">' +
      e(t) +
      '</button>'
    );
  }
  function f(t, id, x, type) {
    if (id === 'px-plan-req' || id.indexOf('px-stage-req-') === 0)
      return (
        '<label class="pn-field">' +
        e(t) +
        '<textarea id="' +
        id +
        '" rows="2">' +
        e(x || '') +
        '</textarea></label>'
      );
    return H.field(t, id, x, type);
  }
  function select(t, id, opts, value) {
    return (
      '<label class="pn-field">' +
      e(t) +
      '<select id="' +
      id +
      '">' +
      opts
        .map(function (o) {
          return (
            '<option value="' +
            e(o[0]) +
            '"' +
            (String(value || '') === String(o[0]) ? ' selected' : '') +
            '>' +
            e(o[1]) +
            '</option>'
          );
        })
        .join('') +
      '</select></label>'
    );
  }
  function note(t) {
    return H.note(t);
  }
  function names(t) {
    return Array.from(
      new Set(
        String(t || '')
          .split(/[,，、\n]/)
          .map(function (x) {
            return x.trim();
          })
          .filter(Boolean)
      )
    );
  }
  function modal(t, html, a, label) {
    H.modal(t, html, label || '保存', a ? 'px-' + a : '');
    document.querySelector('#pn-dialog .pn-dialog-content').classList.add('px-editor');
  }
  function picker(id, code, kind) {
    var x = code ? M.sku(data(), code) : null,
      text = x ? [x.product.nameCN, x.sku.variantCN || x.sku.size, code].filter(Boolean).join(' · ') : '';
    return (
      '<div class="px-picker"><input type="hidden" id="' +
      id +
      '" value="' +
      e(code || '') +
      '"><input class="form-input" id="' +
      id +
      '-query" data-px-picker="' +
      id +
      '" data-kind="' +
      kind +
      '" autocomplete="off" aria-label="搜索SKU" placeholder="搜索名称、规格、SKU…" value="' +
      e(text) +
      '"><div class="px-picker-options" id="' +
      id +
      '-options" hidden></div></div>'
    );
  }
  function pickerResults(input) {
    var id = input.dataset.pxPicker,
      kind = input.dataset.kind,
      q = input.value.toLowerCase().trim(),
      list = [];
    document.getElementById(id).value = '';
    data().catalog.products.forEach(function (p) {
      (p.skus || []).forEach(function (sk) {
        if (kind === 'material' && !M.stocked({ product: p, sku: sk })) return;
        if (
          [p.nameCN, p.descCN, sk.variantCN, sk.size, sk.itemNo, sk.skuCode]
            .join(' ')
            .toLowerCase()
            .indexOf(q) >= 0
        )
          list.push({ p: p, s: sk });
      });
    });
    var box = document.getElementById(id + '-options');
    box.hidden = false;
    box.innerHTML = list.length
      ? list
          .map(function (x) {
            return (
              '<button type="button" data-px="pick-sku" data-value="' +
              e(id + '|' + x.s.skuCode) +
              '"><b>' +
              e(x.p.nameCN) +
              ' · ' +
              e(x.s.variantCN || x.s.size || '') +
              '</b><small>' +
              e(x.s.skuCode) +
              ' · ' +
              e(x.p.descCN || '') +
              '</small></button>'
            );
          })
          .join('')
      : note('没有匹配SKU。物料需在产品库启用库存。');
  }
  function plans(s, kind) {
    return kind === 'packaging' ? s.production.packagingPlans : s.production.processRecipes;
  }
  function scope(s, p) {
    var x = p.scopeSku ? M.sku(s, p.scopeSku) : null;
    return x ? x.product.nameCN + ' · ' + p.scopeSku : p.scopeSku || '通用模板，使用前核对';
  }
  function render(s, tab) {
    state.tab = tab || 'recipes';
    var tabs = [
      ['recipes', '产品工艺'],
      ['packaging', '包装方案'],
      ['operations', '基础工序'],
      ['devices', '设备'],
      ['history', '历史实绩']
    ];
    return (
      '<section class="px-library"><div class="pn-section-head"><div><h2>工艺与生产经验库</h2><small>产品、材料、排版、设备条件共同决定参数，工单保留选用版本。</small></div>' +
      b('返回工单', 'back') +
      '</div><div class="pn-tabs">' +
      tabs
        .map(function (t) {
          return (
            '<button data-px="tab" data-value="' +
            t[0] +
            '" class="' +
            (state.tab === t[0] ? 'on' : '') +
            '">' +
            t[1] +
            '</button>'
          );
        })
        .join('') +
      '</div><div class="px-library-tools"><input class="form-input" id="px-library-search" placeholder="搜索名称、SKU、规格、设备…" value="' +
      e(state.query) +
      '">' +
      (state.tab === 'history'
        ? select(
            '设备状态',
            'px-history-condition',
            [
              ['', '全部状态'],
              ['normal', '正常'],
              ['slow', '偏慢'],
              ['abnormal', '异常'],
              ['unknown', '未记录']
            ],
            state.historyCondition
          )
        : state.tab === 'operations'
          ? b('新增工序', 'edit-operation', '', true)
          : state.tab === 'devices'
            ? b('新增设备', 'edit-device', '', true)
            : b(
                state.tab === 'packaging' ? '新增包装方案' : '新增加工方案／路线模板',
                'new-plan',
                state.tab === 'packaging' ? 'packaging' : 'recipe',
                true
              )) +
      '</div><div id="px-library-results">' +
      results(s) +
      '</div></section>'
    );
  }
  function results(s) {
    var q = state.query.toLowerCase().trim();
    if (state.tab === 'operations')
      return (
        note('基础工序保持通用，专用用料和产能在产品工艺中维护。原默认产能只作经验参考。') +
        s.production.operations
          .filter(function (o) {
            return !q || (o.name + ' ' + o.requirements).toLowerCase().indexOf(q) >= 0;
          })
          .map(function (o) {
            return (
              '<article class="px-library-row"><div><b>' +
              e(o.name) +
              '</b><small>' +
              e(o.requirements || '操作提示待补') +
              ' · ' +
              (o.active ? '启用' : '停用') +
              '</small></div><div class="pn-actions">' +
              b('编辑', 'edit-operation', o.id) +
              b(o.active ? '停用' : '启用', 'toggle-operation', o.id) +
              '</div></article>'
            );
          })
          .join('')
      );
    if (state.tab === 'devices')
      return (
        s.production.processDevices
          .filter(function (d) {
            return !q || (d.name + ' ' + d.workspace + ' ' + d.note).toLowerCase().indexOf(q) >= 0;
          })
          .map(function (d) {
            return (
              '<article class="px-library-row"><div><b>' +
              e(d.name) +
              '</b><small>工作区 ' +
              e(d.workspace || '待核') +
              ' · ' +
              e(d.note || '') +
              ' · ' +
              (d.enabled === false ? '停用' : '启用') +
              '</small></div><div class="pn-actions">' +
              b('编辑', 'edit-device', d.id) +
              b(d.enabled === false ? '启用' : '停用', 'toggle-device', d.id) +
              '</div></article>'
            );
          })
          .join('') || note('尚无设备，规格按现场核实填写。')
      );
    if (state.tab === 'history') return historyView(s, q);
    var source = plans(s, state.tab);
    var a = source
      .filter(function (p) {
        return !source.some(function (v) {
          return v.familyId === p.familyId && v.version > p.version;
        });
      })
      .filter(function (p) {
        return (
          !q ||
          JSON.stringify([p.name, p.scopeSku, p.boardSize, p.layoutRef, scope(s, p)])
            .toLowerCase()
            .indexOf(q) >= 0
        );
      });
    return (
      (a
        .map(function (p) {
          var kind = state.tab === 'packaging' ? 'packaging' : 'recipe';
          return (
            '<article class="px-library-row"><div><b>' +
            e(p.name) +
            ' <span class="px-version">v' +
            p.version +
            '</span></b><small>' +
            e(scope(s, p)) +
            '</small><small>' +
            (p.kind === 'route' ? '通用路线模板' : p.items.length + '项物料') +
            (p.layoutRef ? ' · 排版 ' + e(p.layoutRef) : '') +
            ' · ' +
            e(p.source || '经验维护') +
            '</small></div><div class="pn-actions">' +
            b('查看', 'view-plan', kind + '|' + p.id) +
            b('另存新版本', 'revise-plan', kind + '|' + p.id) +
            b('历史版本', 'versions', kind + '|' + p.familyId) +
            (kind === 'recipe' ? b('套用工序到工单', 'bulk-route', p.id) : '') +
            b(p.enabled === false ? '启用' : '停用', 'disable-plan', kind + '|' + p.id) +
            '</div></article>'
          );
        })
        .join('') || '<div class="pn-empty">暂无方案，可从产品任务整理，也可在这里新建。</div>') +
      note('修订另存版本，原工单快照保留。停用不删除历史，不自动修改库存。')
    );
  }
  function refresh() {
    var box = document.getElementById('px-library-results');
    if (box) box.innerHTML = results(data());
    else H.render();
  }
  function routeInput(st, i, ops) {
    return (
      '<div class="px-route-editor-row" data-px-stage="' +
      e(st.id) +
      '">' +
      select(
        '第' + (i + 1) + '道',
        'px-stage-op-' + i,
        [['', '自定义／历史工序']].concat(
          ops
            .filter(function (o) {
              return o.active;
            })
            .map(function (o) {
              return [o.id, o.name];
            })
        ),
        st.operationId
      ) +
      f('名称', 'px-stage-name-' + i, st.name) +
      f('本方案要求', 'px-stage-req-' + i, st.requirements || '') +
      f('参考每小时产量', 'px-stage-rate-' + i, st.rate === undefined ? '' : st.rate, 'number') +
      select(
        '口径',
        'px-stage-mode-' + i,
        [
          ['人时', '人时'],
          ['机器小时', '机器小时']
        ],
        st.rateMode || '人时'
      ) +
      '<div class="pn-actions">' +
      b('↑', 'plan-step-up', String(i)) +
      b('↓', 'plan-step-down', String(i)) +
      b('×', 'plan-step-remove', String(i)) +
      '</div></div>'
    );
  }
  function newDraft(kind, old, pid) {
    var s = data(),
      p = pid ? find(s.production.products, pid) : null;
    state.kind = kind;
    state.draft = old
      ? JSON.parse(JSON.stringify(old))
      : {
          name: '',
          scopeSku: p ? p.skuCode : '',
          kind: 'product',
          requirements: kind === 'packaging' && p ? p.packaging : '',
          items: [],
          route:
            kind === 'recipe' && p
              ? p.route.map(function (st) {
                  var x = JSON.parse(JSON.stringify(st));
                  delete x.assignees;
                  return x;
                })
              : [],
          carton: {},
          layoutRef: '',
          boardSize: '',
          feedMode: '',
          deviceId: '',
          deviceCondition: '',
          source: '经验维护'
        };
    if (old) state.draft.previousId = old.id;
    if (p)
      s.production.materials
        .filter(function (m) {
          var actual = M.sku(s, m.skuCode),
            pack = actual && actual.product.type === 'packaging';
          return (
            m.batchId === p.batchId && m.uses.indexOf(p.id) >= 0 && (kind === 'packaging' ? pack : !pack)
          );
        })
        .forEach(function (m) {
          state.draft.items.push({
            id: uid(),
            skuCode: m.skuCode,
            perOutput: m.uses.length === 1 && m.yieldPerUnit ? m.yieldPerUnit : '',
            qty: m.uses.length === 1 && m.yieldPerUnit ? 1 : '',
            rounding: 'up',
            note: '从工单整理，用量待核'
          });
        });
    editPlan();
  }
  function editPlan() {
    var d = state.draft,
      s = data(),
      kind = state.kind,
      html =
        '<div class="px-form-grid">' +
        f('方案名称', 'px-plan-name', d.name) +
        select(
          '参考数据来源',
          'px-plan-source',
          [
            ['经验维护', '经验维护／暂定'],
            ['历史实绩参考', '历史实绩参考（核对条件）'],
            ['试切核实', '试切核实']
          ],
          d.source || '经验维护'
        ) +
        (kind === 'recipe'
          ? select(
              '用途',
              'px-plan-kind',
              [
                ['product', '具体产品加工用料方案'],
                ['route', '通用路线模板']
              ],
              d.kind
            )
          : '') +
        '</div><label class="pn-check"><input id="px-plan-generic" type="checkbox"' +
        (!d.scopeSku ? ' checked' : '') +
        '>通用路线／包装模板（加工用料方案须选具体SKU）</label><label class="pn-field">适用产品SKU' +
        picker('px-plan-sku', d.scopeSku, 'product') +
        '</label>' +
        select(
          '适用产品大类（可空）',
          'px-plan-category',
          [['', '不限定大类']].concat(
            Array.from(
              new Set(
                s.catalog.products
                  .map(function (p) {
                    return p.categoryCode;
                  })
                  .filter(Boolean)
              )
            ).map(function (c) {
              var cat = (crmSettings.pcatCategories || []).find(function (x) {
                return x.code === c;
              });
              return [c, cat ? cat.nameCN + ' · ' + c : c];
            })
          ),
          d.scopeCategory || ''
        ) +
        f('方案要求／包装做法', 'px-plan-req', d.requirements || '');
    if (kind === 'recipe')
      html +=
        '<details open><summary>工序路线</summary>' +
        d.route
          .map(function (st, i) {
            return routeInput(st, i, s.production.operations);
          })
          .join('') +
        b('添加工序', 'plan-step-add') +
        note('人员在工单分派，基础工序更新不回写此版本。') +
        '</details>';
    html +=
      '<details open><summary>实际物料与用量规则</summary>' +
      d.items
        .map(function (it, i) {
          return (
            '<fieldset class="px-item"><legend>物料 ' +
            (i + 1) +
            '</legend>' +
            picker('px-item-sku-' + i, it.skuCode, 'material') +
            '<div class="px-form-grid">' +
            f('每组产品数', 'px-item-output-' + i, it.perOutput, 'number') +
            f('每组用该物料数', 'px-item-qty-' + i, it.qty, 'number') +
            select(
              '备料方式',
              'px-item-round-' + i,
              [
                ['up', '整组向上备料'],
                ['exact', '按比例保留小数']
              ],
              it.rounding || 'up'
            ) +
            f('对应工序／说明', 'px-item-stage-' + i, it.stageName || '') +
            '</div>' +
            b('移除此项', 'plan-item-remove', String(i)) +
            '</fieldset>'
          );
        })
        .join('') +
      b('从产品库添加物料', 'plan-item-add') +
      note('例：每144个产品用1张板；每480个用1只外箱。不同板材分别保存排版方案，未知留待核。') +
      '</details>';
    if (kind === 'recipe')
      html +=
        '<details><summary>排版、设备与参考条件</summary><div class="px-form-grid">' +
        f('原板／上机料规格', 'px-plan-board', d.boardSize || '') +
        f('排版文件／版本', 'px-plan-layout', d.layoutRef || '') +
        select(
          '上机方式',
          'px-plan-feed',
          [
            ['', '待核'],
            ['整板一次切割', '整板一次切割'],
            ['整板分区推进', '整板分区推进'],
            ['按上机小板切割', '按上机小板切割'],
            ['其他', '其他']
          ],
          d.feedMode || ''
        ) +
        select(
          '参考设备',
          'px-plan-device',
          [['', '未指定']].concat(
            s.production.processDevices
              .filter(function (x) {
                return x.enabled !== false;
              })
              .map(function (x) {
                return [x.id, x.name];
              })
          ),
          d.deviceId || ''
        ) +
        f('参考设备状态／适用条件', 'px-plan-condition', d.deviceCondition || '') +
        '</div></details>';
    else {
      var c = d.carton || {};
      html +=
        '<details open><summary>预计外箱数据（可空）</summary><div class="px-form-grid">' +
        f('每外箱产品数', 'px-box-pcs', c.pcs, 'number') +
        f('箱长cm', 'px-box-l', c.length, 'number') +
        f('箱宽cm', 'px-box-w', c.width, 'number') +
        f('箱高cm', 'px-box-h', c.height, 'number') +
        f('参考整箱毛重kg（含货）', 'px-box-gw', c.grossKg, 'number') +
        '</div>' +
        note('只算预计值，尾箱和出货重量仍需实测。') +
        '</details>';
    }
    modal(
      (d.previousId ? '另存新版本：' : '新建：') + (kind === 'recipe' ? '工艺方案' : '包装方案'),
      html,
      'plan-save',
      '保存方案版本'
    );
  }
  function capturePlan() {
    var d = state.draft;
    d.name = v('px-plan-name');
    d.source = v('px-plan-source');
    d.scopeSku = document.getElementById('px-plan-generic').checked ? '' : v('px-plan-sku');
    if (!document.getElementById('px-plan-generic').checked && !d.scopeSku)
      throw new Error('请从搜索结果选择适用SKU');
    d.requirements = v('px-plan-req');
    d.scopeCategory = v('px-plan-category');
    if (state.kind === 'recipe') {
      d.kind = v('px-plan-kind');
      d.route = d.route.map(function (st, i) {
        return Object.assign({}, st, {
          operationId: v('px-stage-op-' + i),
          name: v('px-stage-name-' + i),
          requirements: v('px-stage-req-' + i),
          rate: v('px-stage-rate-' + i),
          rateMode: v('px-stage-mode-' + i)
        });
      });
      d.boardSize = v('px-plan-board');
      d.layoutRef = v('px-plan-layout');
      d.feedMode = v('px-plan-feed');
      d.deviceId = v('px-plan-device');
      d.deviceCondition = v('px-plan-condition');
    } else
      d.carton = {
        pcs: v('px-box-pcs'),
        length: v('px-box-l'),
        width: v('px-box-w'),
        height: v('px-box-h'),
        grossKg: v('px-box-gw')
      };
    d.items = d.items.map(function (it, i) {
      return Object.assign({}, it, {
        skuCode: v('px-item-sku-' + i),
        perOutput: v('px-item-output-' + i),
        qty: v('px-item-qty-' + i),
        rounding: v('px-item-round-' + i),
        stageName: v('px-item-stage-' + i)
      });
    });
    return d;
  }
  function planDetails(kind, id) {
    var s = data(),
      p = find(plans(s, kind), id);
    modal(
      p.name + ' · v' + p.version,
      note(scope(s, p)) +
        (p.route
          ? '<p>' +
            e(
              p.route
                .map(function (x) {
                  return x.name;
                })
                .join(' → ')
            ) +
            '</p>'
          : '') +
        note(p.requirements || '') +
        (p.boardSize ? note('板材 ' + p.boardSize + ' · 排版 ' + p.layoutRef + ' · ' + p.feedMode) : '') +
        p.items
          .map(function (i) {
            var x = M.sku(s, i.skuCode);
            return (
              '<p class="px-detail-line">' +
              e(x ? x.product.nameCN : i.skuCode) +
              ' · ' +
              e(i.skuCode) +
              '：每 ' +
              (i.perOutput == null ? '待核' : n(i.perOutput)) +
              ' 个产品用 ' +
              (i.qty == null ? '待核' : n(i.qty)) +
              ' ' +
              e(i.unit) +
              ' · ' +
              e(i.stageName || '工序待核') +
              '</p>'
            );
          })
          .join('') +
        note('来源 ' + p.source + ' · ' + p.createdBy + ' · ' + p.createdAt)
    );
  }
  function applyForm(pid) {
    var s = data(),
      p = find(s.production.products, pid);
    state.pid = pid;
    var recipes = X.current(s.production.processRecipes).filter(function (r) {
        return X.matches(s, r, p);
      }),
      packs = X.current(s.production.packagingPlans).filter(function (r) {
        return X.matches(s, r, p);
      });
    modal(
      '给本任务选用方案',
      note(p.name + ' · ' + p.skuCode + ' · 计划 ' + n(p.qty)) +
        select(
          '加工／路线方案（可空，仅选包装）',
          'px-apply-recipe',
          [['', '暂不选加工方案']].concat(
            recipes.map(function (r) {
              return [r.id, r.name + ' v' + r.version + (r.kind === 'route' ? '（仅套路线）' : '')];
            })
          ),
          ''
        ) +
        select(
          '包装方案（可单独选用）',
          'px-apply-pack',
          [['', '暂不选包装方案']].concat(
            packs.map(function (r) {
              return [r.id, r.name + ' v' + r.version];
            })
          ),
          ''
        ) +
        f(
          '本次方案负责的产品数量',
          'px-apply-qty',
          Math.max(0, p.qty - X.coverage(s, p.id, false)) || Math.max(0, p.qty - X.coverage(s, p.id, true)),
          'number'
        ) +
        '<label class="pn-check"><input id="px-apply-route" type="checkbox"' +
        (!p.route.length ? ' checked' : '') +
        '>带入工序路线（仅覆盖未下达配置，同名同位置人员保留）</label>' +
        note(
          '可分批选择不同板材方案；包装可独立覆盖全量，同一任务的相同包装方案合算尾箱。用量先进入核料建议，不自动预留或扣库存。'
        ),
      'apply-save',
      '带入本次配置'
    );
  }
  function taskActions(s, p) {
    if (!H.canManage()) return '';
    if (
      p.released ||
      s.production.reports.some(function (r) {
        return r.productId === p.id;
      }) ||
      s.production.consumptions.some(function (c) {
        return c.processProductId === p.id;
      })
    )
      return '<div class="pn-actions px-task-actions">' + b('整理为方案', 'from-task', p.id) + '</div>';
    return (
      '<div class="pn-actions px-task-actions">' +
      b('选工艺／包装', 'apply', p.id) +
      (s.production.products.some(function (x) {
        return (
          !x.retiredAt &&
          x.id !== p.id &&
          x.batchId === p.batchId &&
          x.skuCode === p.skuCode &&
          x.unit === p.unit
        );
      })
        ? b('合并同款', 'merge', p.id)
        : '') +
      (p.sources.length > 1 ? b('按来源拆分', 'split', p.id) : '') +
      b('整理为方案', 'from-task', p.id) +
      '</div>'
    );
  }
  function mergeForm(pid) {
    var s = data(),
      p = find(s.production.products, pid),
      a = s.production.products.filter(function (x) {
        return !x.retiredAt && x.batchId === p.batchId && x.skuCode === p.skuCode && x.unit === p.unit;
      });
    modal(
      '合并同款生产任务',
      note('只调整同批同SKU、工艺包装一致的未下达任务。已有报工历史保持原样。') +
        '<div class="pn-choices">' +
        a
          .map(function (x) {
            return (
              '<label><input type="checkbox" name="px-merge-id" value="' +
              e(x.id) +
              '"' +
              (x.id === pid ? ' checked' : '') +
              '><span><b>' +
              e(x.name) +
              ' · ' +
              n(x.qty) +
              ' ' +
              e(x.unit) +
              '</b><small>' +
              e(
                x.sources
                  .map(function (o) {
                    return o.orderNumber;
                  })
                  .join('、')
              ) +
              ' · ' +
              e(
                x.route
                  .map(function (st) {
                    return st.name;
                  })
                  .join(' → ') || '工序待配'
              ) +
              ' · 包装 ' +
              e(x.packaging || '待填') +
              '</small></span></label>'
            );
          })
          .join('') +
        '</div><label class="pn-check"><input type="checkbox" id="px-merge-confirm">已核对选中来源的工艺、包装和客户细节要求一致</label>' +
        note('保留订单数量及交期，整批预留/领料不重复扣减；用料取整变化需复核。'),
      'merge-save',
      '合并生产任务'
    );
  }
  function splitForm(pid) {
    var s = data(),
      p = find(s.production.products, pid);
    modal(
      '按订单来源拆分',
      '<input type="hidden" id="px-split-id" value="' +
        e(pid) +
        '">' +
        p.sources
          .map(function (o) {
            return (
              '<p class="px-detail-line">' +
              e(o.orderNumber) +
              ' · ' +
              n(o.qty) +
              ' ' +
              e(p.unit) +
              ' · 交期 ' +
              e(o.delivery || '待核') +
              '</p>'
            );
          })
          .join('') +
        '<label class="pn-check"><input type="checkbox" id="px-split-confirm">按以上来源拆成独立任务，再分别核对要求</label>' +
        note(
          '仅处理未下达、未报工任务。尚未执行的方案按来源数量先后分配；拆后复核用料取整。原预留和已领仍属整批，不按比例伪造实际耗用。'
        ),
      'split-save',
      '按来源拆分'
    );
  }
  function batchPlanSummary(s, bid) {
    var apps = s.production.processApplications.filter(function (a) {
      return a.batchId === bid && a.status === 'active';
    });
    if (!apps.length) return '';
    return (
      '<details class="px-used-plans" open><summary>本批已选方案／预计包装</summary>' +
      s.production.products
        .filter(function (p) {
          return (
            !p.retiredAt &&
            p.batchId === bid &&
            (X.coverage(s, p.id, false) > p.qty || X.coverage(s, p.id, true) > p.qty)
          );
        })
        .map(function (p) {
          return note(p.name + '：订单需求已调整，原方案安排量超过现计划，请核对原安排及实际执行。', true);
        })
        .join('') +
      apps
        .map(function (a) {
          var p = find(s.production.products, a.productId);
          return (
            '<div class="px-used-plan"><span>' +
            e(p.name) +
            ' · ' +
            n(a.qty) +
            ' ' +
            e(p.unit) +
            ' · ' +
            e(
              [
                a.recipeSnapshot && a.recipeSnapshot.name + ' v' + a.recipeSnapshot.version,
                a.packagingSnapshot && a.packagingSnapshot.name + ' v' + a.packagingSnapshot.version
              ]
                .filter(Boolean)
                .join(' ＋ ')
            ) +
            '</span>' +
            b('撤回未执行选用', 'withdraw', a.id) +
            '</div>'
          );
        })
        .join('') +
      s.production.products
        .filter(function (p) {
          return p.batchId === bid && !p.retiredAt;
        })
        .map(function (p) {
          return X.cartonEstimate(s, p.id)
            .map(function (c) {
              return note(
                p.name +
                  ' · ' +
                  c.name +
                  '：预计 ' +
                  n(c.boxes) +
                  ' 箱 · ' +
                  n(c.volume) +
                  ' m³ · ' +
                  n(c.weight) +
                  ' kg（尾箱和实际重量另核）'
              );
            })
            .join('');
        })
        .join('') +
      '</details>'
    );
  }
  function materialSuggestionFields(s, m) {
    var a = X.materialSuggestion(s, m);
    return a
      ? '<div class="px-plan-suggestion"><b>方案建议 ' +
          (a.qty === null ? '用量待核' : n(a.qty)) +
          ' ' +
          e(m.unit) +
          '</b>' +
          a.rows
            .map(function (x) {
              return (
                '<small>' +
                e(x.planName) +
                ' · ' +
                (x.qty === null ? '用量待核' : n(x.qty)) +
                ' ' +
                e(m.unit) +
                '</small>'
              );
            })
            .join('') +
          (a.qty === null ? '' : b('填入理论需求', 'material-suggest', m.id)) +
          note('建议仅覆盖已选方案的用量，未选方案的产品仍需另核；保留已填备料余量。') +
          '</div>'
      : '';
  }
  function routeGroupFields(draft, locked) {
    return (
      '<details class="px-route-groups"><summary>现场组合任务（多道一次报工）</summary>' +
      draft
        .map(function (st) {
          return (
            '<label class="pn-check"><input type="checkbox" name="px-group-step" value="' +
            e(st.id) +
            '"' +
            (locked ? ' disabled' : '') +
            '>' +
            e(st.name) +
            (st.groupName ? ' · 当前组合：' + e(st.groupName) : '') +
            '</label>'
          );
        })
        .join('') +
      (locked
        ? note('已下达或已有报工的组合保持只读。')
        : f('组合名称', 'px-group-name', '') +
          '<div class="pn-actions">' +
          b('选中连续工序设为一组', 'group-set') +
          b('清除所选组合', 'group-clear') +
          '</div>') +
      note(
        '整组报一次完成量，代表本批完成所选全部步骤；只完成部分时请拆开安排。小组工时仅计一次，不估造每道分摊。'
      ) +
      '</details>'
    );
  }
  function reportFields(s, p) {
    var apps = X.applications(s, p.id);
    return (
      select(
        '本次实际选用方案（可后补）',
        'px-report-app',
        [['', '未指定']].concat(
          apps.map(function (a) {
            return [
              a.id,
              [a.recipeSnapshot && a.recipeSnapshot.name, a.packagingSnapshot && a.packagingSnapshot.name]
                .filter(Boolean)
                .join('＋') +
                ' · 计划 ' +
                n(a.qty)
            ];
          })
        ),
        apps.length === 1 ? apps[0].id : ''
      ) +
      select(
        '实际设备（可空）',
        'px-report-device',
        [['', '未记录']].concat(
          s.production.processDevices
            .filter(function (d) {
              return d.enabled !== false;
            })
            .map(function (d) {
              return [d.id, d.name];
            })
        ),
        ''
      ) +
      select(
        '本次设备状态',
        'px-report-condition',
        [
          ['', '未记录'],
          ['normal', '正常'],
          ['slow', '偏慢'],
          ['abnormal', '异常']
        ],
        ''
      ) +
      '<div class="pn-grid2">' +
      f('准备／换料小时（可空）', 'px-report-prep', '', 'number') +
      f('等待／停机小时（可空）', 'px-report-down', '', 'number') +
      '</div>'
    );
  }
  function condition(code) {
    return { normal: '正常', slow: '偏慢', abnormal: '异常' }[code] || '未记录';
  }
  function reportContext(s, r) {
    var app = M.find(s.production.processApplications, r.processApplicationId);
    return (
      note(
        (app
          ? [
              app.recipeSnapshot && app.recipeSnapshot.name + ' v' + app.recipeSnapshot.version,
              app.packagingSnapshot && app.packagingSnapshot.name + ' v' + app.packagingSnapshot.version
            ]
              .filter(Boolean)
              .join(' ＋ ')
          : '工艺方案未关联') +
          ' · 设备 ' +
          (r.deviceName || '未记录') +
          ' · 状态 ' +
          condition(r.deviceCondition)
      ) + (r.status !== 'void' ? b('补充设备／方案／工时', 'context-edit', r.id) : '')
    );
  }
  function executionRow(s, id, managed) {
    var x = find(s.production.executions, id),
      p = find(s.production.products, x.productId);
    return (
      '<article class="pn-report"><div class="pn-section-head"><b>' +
      e(p.name) +
      ' · ' +
      e(x.groupName) +
      '</b><span>' +
      (x.status === 'confirmed' ? '已确认' : x.status === 'void' ? '已撤销' : '待核对') +
      '</span></div><p>组合本次 ' +
      n(x.qty) +
      ' ' +
      e(p.unit) +
      ' · ' +
      e(x.people.join('、')) +
      (x.status === 'confirmed' ? ' · 可流转 ' + n(x.good) : '') +
      '</p><small>' +
      e(new Date(x.at).toLocaleString('zh-CN')) +
      ' · ' +
      e(x.reportedBy) +
      ' · 含 ' +
      x.stepIds.length +
      ' 道工序，产量/工时一次计</small>' +
      reportContext(s, x) +
      note(x.note || '') +
      (x.confirmNote ? note('核对：' + x.confirmNote) : '') +
      (x.voidReason ? note('更正：' + x.voidReason) : '') +
      (x.over ? note('超计划 ' + n(x.over) + '，原报数保留') : '') +
      (x.previousWarning ? note('前道交接量不足，核对后确认', true) : '') +
      (x.orderWarning ? note('来源订单已变动，请先核对计划', true) : '') +
      (x.hours.length
        ? note(
            '组合人时：' +
              x.hours
                .map(function (h) {
                  return h.person + ' ' + n(h.hours) + 'h';
                })
                .join('、')
          )
        : '') +
      (managed && x.status !== 'void'
        ? '<div class="pn-actions">' +
          (x.status === 'pending' ? b('整组确认可流转', 'confirm-execution', x.id) : '') +
          b('整组撤销', 'void-execution', x.id) +
          '</div>'
        : '') +
      '</article>'
    );
  }
  function median(a) {
    if (!a.length) return null;
    a = a.slice().sort(function (x, y) {
      return x - y;
    });
    var i = Math.floor(a.length / 2);
    return M.round(a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2);
  }
  function inputHistoryView(s, q) {
    var rows = X.inputHistory(s).filter(function (x) {
      return (
        !q ||
        JSON.stringify([
          x.product && x.product.name,
          x.product && x.product.skuCode,
          x.application.recipeSnapshot,
          x.application.packagingSnapshot,
          x.rows
        ])
          .toLowerCase()
          .indexOf(q) >= 0
      );
    });
    return rows.length
      ? '<details class="px-history-group"><summary>方案实际投入对照 · ' +
          rows.length +
          '条方案</summary>' +
          note(
            '按实际选用方案、物料和工序累计；含已记录损耗。整批投入不摊到每条报工，不据此推算单板良率；未关联的整批投入仍在核料领料查看。'
          ) +
          rows
            .map(function (x) {
              var a = x.application,
                r = a.recipeSnapshot;
              return (
                '<div class="px-input-history"><b>' +
                e(x.product.name) +
                ' · ' +
                e(
                  [
                    r && r.name + ' v' + r.version,
                    a.packagingSnapshot && a.packagingSnapshot.name + ' v' + a.packagingSnapshot.version
                  ]
                    .filter(Boolean)
                    .join('＋')
                ) +
                '</b>' +
                note(r ? [r.boardSize, r.layoutRef, r.feedMode].filter(Boolean).join(' · ') : '包装投入') +
                x.rows
                  .map(function (i) {
                    return (
                      '<p>' +
                      e(i.name) +
                      ' · ' +
                      e(i.skuCode) +
                      ' · ' +
                      e(i.stageName) +
                      '：投入 ' +
                      n(i.qty) +
                      ' ' +
                      e(i.unit) +
                      '，其中损耗 ' +
                      n(i.scrap) +
                      ' · ' +
                      i.count +
                      '次记录</p>'
                    );
                  })
                  .join('') +
                '</div>'
              );
            })
            .join('') +
          '</details>'
      : '';
  }
  function historyView(s, q) {
    var hs = X.history(s).filter(function (h) {
      var r = h.record,
        app = h.application,
        search = [
          h.product && h.product.name,
          h.product && h.product.skuCode,
          h.scope,
          r.deviceName,
          app && app.recipeSnapshot && app.recipeSnapshot.name,
          app && app.packagingSnapshot && app.packagingSnapshot.name
        ]
          .join(' ')
          .toLowerCase();
      return (
        (!q || search.indexOf(q) >= 0) &&
        (!state.historyCondition || (r.deviceCondition || 'unknown') === state.historyCondition)
      );
    });
    var groups = {};
    hs.forEach(function (h) {
      var r = h.record,
        app = h.application,
        key = [
          app && app.recipeSnapshot ? app.recipeSnapshot.id : '未指定加工',
          app && app.packagingSnapshot ? app.packagingSnapshot.id : '未指定包装',
          h.product && h.product.skuCode,
          h.scope,
          r.deviceId || '未记设备',
          r.deviceCondition || 'unknown',
          h.product && h.product.unit,
          r.routeFingerprint || String(r.routeVersion)
        ].join('|');
      (groups[key] || (groups[key] = [])).push(h);
    });
    return (
      note(
        '按相同产品、方案版本、工序或组合、设备及状态分别统计。撤销记录不参加产能统计；缺工时不算0。组合工时不摊给单道工序，参考值需主管核对后另存方案。'
      ) +
      (Object.keys(groups)
        .map(function (key) {
          var a = groups[key],
            h = a[0],
            machine = a
              .filter(function (x) {
                return x.machineRate !== null && x.record.status === 'confirmed';
              })
              .map(function (x) {
                return x.machineRate;
              }),
            labor = a
              .filter(function (x) {
                return x.laborRate !== null && x.record.status === 'confirmed';
              })
              .map(function (x) {
                return x.laborRate;
              });
          return (
            '<details class="px-history-group" open><summary><b>' +
            e((h.product ? h.product.name : '产品') + ' · ' + h.scope) +
            '</b> · ' +
            e(h.record.deviceName || '设备未记') +
            ' · ' +
            condition(h.record.deviceCondition) +
            '</summary><small>同条件记录 ' +
            a.length +
            ' 条 · 机时有效样本 ' +
            machine.length +
            '，中位 ' +
            n(median(machine)) +
            ' · 人时有效样本 ' +
            labor.length +
            '，中位 ' +
            n(median(labor)) +
            '</small>' +
            a
              .map(function (x) {
                var r = x.record,
                  app = x.application;
                return (
                  '<article class="px-history-row"><div><b>' +
                  n(r.qty) +
                  ' ' +
                  e(x.product ? x.product.unit : '') +
                  ' · ' +
                  (r.status === 'confirmed'
                    ? '可流转 ' + n(r.good)
                    : r.status === 'void'
                      ? '已撤销'
                      : '待核对') +
                  '</b><small>' +
                  e(new Date(r.at).toLocaleString('zh-CN')) +
                  ' · ' +
                  e(
                    app
                      ? [
                          app.recipeSnapshot && app.recipeSnapshot.name + ' v' + app.recipeSnapshot.version,
                          app.packagingSnapshot &&
                            app.packagingSnapshot.name + ' v' + app.packagingSnapshot.version
                        ]
                          .filter(Boolean)
                          .join('＋')
                      : '方案未关联'
                  ) +
                  '</small><small>运行产能 ' +
                  n(x.machineRate) +
                  ' /机器小时 · ' +
                  n(x.laborRate) +
                  ' /人时 · 含准备停机 ' +
                  n(x.elapsedRate) +
                  ' /小时</small></div>' +
                  (r.status !== 'void' ? b('补充／核对条件', 'context-edit', r.id) : '') +
                  '</article>'
                );
              })
              .join('') +
            '</details>'
          );
        })
        .join('') ||
        '<div class="pn-empty">暂无符合条件的生产记录。真实报工后在这里积累，不生成演示实绩。</div>') +
      inputHistoryView(s, q)
    );
  }
  function contextEditor(id) {
    var s = data(),
      r = M.find(s.production.executions, id) || find(s.production.reports, id),
      p = find(s.production.products, r.productId);
    if (!H.canManage() && r.people.indexOf(H.actor()) < 0) throw new Error('仅可补充本人参与的报工');
    modal(
      '补充生产条件／工时',
      '<input type="hidden" id="px-context-id" value="' +
        e(id) +
        '">' +
        note(p.name + ' · ' + (r.groupName || r.stepName) + ' · 产量 ' + n(r.qty) + '，本次不改产量') +
        f(
          '每人人时（姓名=小时，逗号分隔）',
          'px-context-hours',
          r.hours
            .map(function (h) {
              return h.person + '=' + h.hours;
            })
            .join('，')
        ) +
        f('实际机器运行小时（可空）', 'px-context-machine', r.machineHours, 'number') +
        reportFields(s, p) +
        f('补充／更正说明', 'px-context-note', ''),
      'context-save',
      '保存条件与工时'
    );
    document.getElementById('px-report-app').value = r.processApplicationId || '';
    document.getElementById('px-report-device').value = r.deviceId || '';
    document.getElementById('px-report-condition').value = r.deviceCondition || '';
    document.getElementById('px-report-prep').value =
      r.prepHours === null || r.prepHours === undefined ? '' : r.prepHours;
    document.getElementById('px-report-down').value =
      r.downtimeHours === null || r.downtimeHours === undefined ? '' : r.downtimeHours;
  }
  function bulkChoices(recipeId, bid) {
    var s = data(),
      r = find(s.production.processRecipes, recipeId);
    return (
      s.production.products
        .filter(function (p) {
          return !p.retiredAt && p.batchId === bid && X.matches(s, r, p);
        })
        .map(function (p) {
          return (
            '<label class="pn-check"><input type="checkbox" name="px-bulk-product" value="' +
            e(p.id) +
            '"' +
            (p.released ? ' disabled' : '') +
            '>' +
            e(p.name) +
            ' · ' +
            n(p.qty) +
            (p.released ? '（已下达）' : '') +
            '</label>'
          );
        })
        .join('') || note('本工单没有适用产品。')
    );
  }
  function bulkForm(rid) {
    var s = data(),
      bs = s.production.batches.filter(function (b) {
        return ['completed', 'cancelled'].indexOf(b.status) < 0;
      }),
      bid = H.selected() || (bs[0] || {}).id;
    if (!bid) throw new Error('请先建立生产工单，再套用路线');
    modal(
      '批量套用工序路线',
      '<input type="hidden" id="px-bulk-recipe" value="' +
        e(rid) +
        '">' +
        select(
          '目标工单',
          'px-bulk-batch',
          bs.map(function (b) {
            return [b.id, b.name];
          }),
          bid
        ) +
        '<div id="px-bulk-products">' +
        bulkChoices(rid, bid) +
        '</div>' +
        note('仅替换选中任务的未下达工序配置；不同SKU的用料和排版不会一起套用。'),
      'bulk-save',
      '带入所选路线'
    );
  }
  function handle(action, value) {
    H.freshForm();
    var s = data(),
      ctx = H.context(),
      bits = value.split('|');
    if (action === 'back') {
      root.CrmProduction.closeLibrary();
      return;
    }
    if (action === 'tab') {
      state.query = '';
      root.CrmProduction.openLibrary(value);
      return;
    }
    if (action === 'pick-sku') {
      var id = bits[0],
        x = M.sku(s, bits[1]);
      if (!x) throw new Error('SKU不存在');
      document.getElementById(id).value = bits[1];
      document.getElementById(id + '-query').value = [
        x.product.nameCN,
        x.sku.variantCN || x.sku.size,
        bits[1]
      ]
        .filter(Boolean)
        .join(' · ');
      document.getElementById(id + '-options').hidden = true;
      return;
    }
    if (action === 'edit-operation') {
      root.CrmProduction.openLibrary('operations');
      H.openOperation(value);
      return;
    }
    if (action === 'toggle-operation') {
      H.commit(function (s) {
        var o = find(s.production.operations, value);
        o.active = !o.active;
      }, 'production');
      H.render();
      return;
    }
    if (action === 'edit-device') {
      var d = value
        ? find(s.production.processDevices, value)
        : { id: '', name: '', workspace: '', note: '' };
      modal(
        '设备档案',
        '<input type="hidden" id="px-device-id" value="' +
          e(d.id) +
          '">' +
          f('设备名称／现场编号', 'px-device-name', d.name) +
          f('单次有效工作区（说明，可空）', 'px-device-workspace', d.workspace) +
          f('备注／适用条件', 'px-device-note', d.note) +
          note('原板尺寸、上机方式在产品方案维护，工作区按现场核对。'),
        'device-save'
      );
      return;
    }
    if (action === 'toggle-device') {
      H.commit(function (s) {
        var d = find(s.production.processDevices, value);
        d.enabled = d.enabled === false;
      }, 'production');
      H.render();
      return;
    }
    if (action === 'new-plan') {
      newDraft(value);
      return;
    }
    if (action === 'revise-plan') {
      newDraft(bits[0], find(plans(s, bits[0]), bits[1]));
      return;
    }
    if (action === 'versions') {
      var versions = plans(s, bits[0])
        .filter(function (p) {
          return p.familyId === bits[1];
        })
        .sort(function (a, b) {
          return b.version - a.version;
        });
      modal(
        '方案历史版本',
        versions
          .map(function (p) {
            return (
              '<div class="px-used-plan"><span>' +
              e(p.name) +
              ' v' +
              p.version +
              ' · ' +
              e(p.createdAt) +
              '</span>' +
              b('查看', 'view-plan', bits[0] + '|' + p.id) +
              b('据此修订', 'revise-plan', bits[0] + '|' + p.id) +
              '</div>'
            );
          })
          .join('')
      );
      return;
    }
    if (action === 'view-plan') {
      planDetails(bits[0], bits[1]);
      return;
    }
    if (action === 'disable-plan') {
      if (!confirm('切换此方案的启用状态？原工单及历史快照保留。')) return;
      H.commit(function (s) {
        var plan = find(plans(s, bits[0]), bits[1]);
        plan.enabled = plan.enabled === false;
      }, 'production');
      H.render();
      return;
    }
    if (action === 'from-task') {
      state.pid = value;
      modal(
        '从当前任务整理为方案',
        note('保存已配置工序和已知用量依据，不复制库存/领料/人员或报工。') +
          '<div class="pn-actions">' +
          b('整理加工工艺', 'from-task-recipe', value, true) +
          b('整理包装方案', 'from-task-packaging', value) +
          '</div>'
      );
      return;
    }
    if (action === 'from-task-recipe' || action === 'from-task-packaging') {
      newDraft(action === 'from-task-recipe' ? 'recipe' : 'packaging', null, value);
      return;
    }
    if (action.indexOf('plan-') === 0) {
      capturePlan();
      var d = state.draft,
        i = Number(value);
      if (action === 'plan-item-add')
        d.items.push({ id: uid(), skuCode: '', perOutput: '', qty: '', rounding: 'up' });
      else if (action === 'plan-item-remove') d.items.splice(i, 1);
      else if (action === 'plan-step-add')
        d.route.push({ id: uid(), name: '', operationId: '', requirements: '', rate: '', rateMode: '人时' });
      else if (action === 'plan-step-remove') d.route.splice(i, 1);
      else {
        var to = i + (action === 'plan-step-up' ? -1 : 1);
        if (to >= 0 && to < d.route.length) {
          var t = d.route[i];
          d.route[i] = d.route[to];
          d.route[to] = t;
        }
      }
      editPlan();
      return;
    }
    if (action === 'apply') {
      applyForm(value);
      return;
    }
    if (action === 'merge') {
      mergeForm(value);
      return;
    }
    if (action === 'split') {
      splitForm(value);
      return;
    }
    if (action === 'withdraw') {
      var why = prompt('撤回未执行选用的原因（原已购/预留/已领保持，需重新核料）：');
      if (!why) return;
      H.commit(function (s) {
        X.withdraw(s, value, why, ctx);
      }, 'production');
      H.render();
      return;
    }
    if (action === 'material-suggest') {
      var m = find(s.production.materials, value),
        a = X.materialSuggestion(s, m);
      if (!a || a.qty === null) throw new Error('请先补齐方案的物料用量规则，或手工核料');
      document.getElementById('pn-theoretical').value = a.qty;
      if (v('pn-target') === '') document.getElementById('pn-target').value = a.qty;
      return;
    }
    if (action === 'bulk-route') {
      bulkForm(value);
      return;
    }
    if (action === 'group-set' || action === 'group-clear') {
      H.captureRoute();
      var draft = JSON.parse(JSON.stringify(H.routeDraft())),
        selected = Array.from(document.querySelectorAll('[name=px-group-step]:checked')).map(function (el) {
          return el.value;
        });
      if (!selected.length) throw new Error('请选择需要组合或清除的工序');
      var touched = draft
        .filter(function (st) {
          return selected.indexOf(st.id) >= 0;
        })
        .map(function (st) {
          return st.executionGroup;
        })
        .filter(Boolean);
      draft.forEach(function (st) {
        if (touched.indexOf(st.executionGroup) >= 0) {
          st.executionGroup = '';
          st.groupName = '';
        }
      });
      if (action === 'group-set') {
        var name = v('px-group-name').trim();
        if (!name) throw new Error('请填写组合名称');
        draft.forEach(function (st) {
          if (selected.indexOf(st.id) >= 0) {
            st.executionGroup = ctx.id;
            st.groupName = name;
          }
        });
      }
      X.checkRoute(draft);
      H.replaceRouteDraft(draft);
      H.openRoute(H.routeProduct(), true);
      return;
    }
    if (action === 'context-edit') {
      contextEditor(value);
      return;
    }
    if (action === 'confirm-execution') {
      var ex = find(s.production.executions, value);
      modal(
        '整组核对报工',
        '<input type="hidden" id="px-execution-id" value="' +
          e(ex.id) +
          '">' +
          note(ex.groupName + ' · 本次完成 ' + n(ex.qty) + ' · 已知不良 ' + n(ex.bad)) +
          f('本批确认可流转数量', 'px-execution-good', ex.qty - (ex.bad || 0), 'number') +
          f('核对说明（超产/交接异常必填）', 'px-execution-note', ''),
        'execution-confirm',
        '确认全部实际完成步骤'
      );
      return;
    }
    if (action === 'void-execution') {
      var reason = prompt('请填写整组更正原因，原记录保留：');
      if (!reason) return;
      H.commit(function (s) {
        X.voidExecution(s, value, reason, ctx);
      }, 'production');
      H.render();
      return;
    }
  }
  function submit(action) {
    var ctx = H.context(),
      message = '已保存';
    if (action === 'plan-save') {
      var input = JSON.parse(JSON.stringify(capturePlan())),
        kind = state.kind;
      H.commit(function (s) {
        X.savePlan(s, kind, input, ctx);
      }, 'production');
      root.CrmProduction.openLibrary(kind === 'packaging' ? 'packaging' : 'recipes');
      message = '方案版本已保存，原工单快照保留';
    } else if (action === 'device-save') {
      H.commit(function (s) {
        X.saveDevice(
          s,
          {
            id: v('px-device-id'),
            name: v('px-device-name'),
            workspace: v('px-device-workspace'),
            note: v('px-device-note')
          },
          ctx
        );
      }, 'production');
    } else if (action === 'apply-save') {
      H.commit(function (s) {
        X.apply(
          s,
          state.pid,
          v('px-apply-recipe'),
          v('px-apply-pack'),
          v('px-apply-qty'),
          document.getElementById('px-apply-route').checked,
          ctx
        );
      }, 'production');
      message = '已带入，请核对用料建议及人员安排';
    } else if (action === 'merge-save') {
      var ids = Array.from(document.querySelectorAll('[name=px-merge-id]:checked')).map(function (el) {
        return el.value;
      });
      H.commit(function (s) {
        X.merge(s, ids, document.getElementById('px-merge-confirm').checked, ctx);
      }, 'production');
      message = '已合并，来源保留，请复核用料取整';
    } else if (action === 'split-save') {
      H.commit(function (s) {
        X.split(s, v('px-split-id'), document.getElementById('px-split-confirm').checked, ctx);
      }, 'production');
      message = '已按来源拆分，原整批领料保留，请复核配置';
    } else if (action === 'bulk-save') {
      var ids0 = Array.from(document.querySelectorAll('[name=px-bulk-product]:checked')).map(function (el) {
        return el.value;
      });
      H.commit(function (s) {
        X.routeBulk(s, v('px-bulk-batch'), ids0, v('px-bulk-recipe'), ctx);
      }, 'production');
      message = '已带入工序，请在工单复核人员与要求';
    } else if (action === 'execution-confirm') {
      H.commit(function (s) {
        X.confirmExecution(s, v('px-execution-id'), v('px-execution-good'), v('px-execution-note'), ctx);
      }, 'production');
    } else if (action === 'context-save') {
      var hours = [];
      if (v('px-context-hours').trim())
        names(v('px-context-hours')).forEach(function (entry) {
          var pair = entry.split('=');
          if (pair.length !== 2) throw new Error('人时格式为 姓名=小时');
          hours.push({ person: pair[0].trim(), hours: M.num(pair[1], true) });
        });
      H.changeData(function (s) {
        var id = v('px-context-id'),
          isGroup = !!M.find(s.production.executions, id),
          r = isGroup ? find(s.production.executions, id) : find(s.production.reports, id);
        if (!H.canManage() && r.people.indexOf(H.actor()) < 0) throw new Error('仅可补充本人参与的报工');
        var before = JSON.parse(JSON.stringify(r));
        if (isGroup) X.updateExecutionTime(s, id, hours, v('px-context-machine'), v('px-context-note'), ctx);
        else M.updateReportTime(s, id, hours, v('px-context-machine'), v('px-context-note'), ctx);
        X.enrichReport(s, r, {
          processApplicationId: v('px-report-app'),
          deviceId: v('px-report-device'),
          deviceCondition: v('px-report-condition'),
          prepHours: v('px-report-prep'),
          downtimeHours: v('px-report-down')
        });
        r.contextChanges = r.contextChanges || [];
        r.contextChanges.push({
          id: ctx.id,
          at: ctx.at,
          person: ctx.person,
          beforeApplicationId: before.processApplicationId || '',
          beforeDeviceId: before.deviceId || '',
          beforeCondition: before.deviceCondition || '',
          beforePrep: before.prepHours === undefined ? null : before.prepHours,
          beforeDown: before.downtimeHours === undefined ? null : before.downtimeHours,
          note: v('px-context-note')
        });
        if (isGroup)
          r.reportIds.forEach(function (rid) {
            var child = find(s.production.reports, rid);
            [
              'processApplicationId',
              'deviceId',
              'deviceName',
              'deviceCondition',
              'prepHours',
              'downtimeHours',
              'routeFingerprint'
            ].forEach(function (k) {
              child[k] = r[k];
            });
          });
      }, 'production');
    } else return;
    H.closeModal();
    H.render();
    toast(message);
  }
  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-px]');
    if (!el) return;
    event.preventDefault();
    H.run(function () {
      handle(el.dataset.px, el.dataset.value || '');
    });
  });
  document.addEventListener('input', function (event) {
    var el = event.target;
    if (el.dataset.pxPicker) {
      pickerResults(el);
      return;
    }
    if (el.id === 'px-library-search') {
      state.query = el.value;
      refresh();
    }
  });
  document.addEventListener('change', function (event) {
    var el = event.target;
    if (el.id === 'px-history-condition') {
      state.historyCondition = el.value;
      refresh();
    }
    if (el.id === 'px-bulk-batch')
      document.getElementById('px-bulk-products').innerHTML = bulkChoices(v('px-bulk-recipe'), el.value);
    if (el.id.indexOf('px-stage-op-') === 0 && el.value) {
      var i = el.id.slice('px-stage-op-'.length),
        op = M.find(data().production.operations, el.value);
      if (op) {
        document.getElementById('px-stage-name-' + i).value = op.name;
        if (!v('px-stage-req-' + i))
          document.getElementById('px-stage-req-' + i).value = op.requirements || '';
      }
    }
  });
  function consumptionFields(s, m) {
    var a = s.production.processApplications.filter(function (a) {
      return (
        a.status === 'active' &&
        a.batchId === m.batchId &&
        [a.recipeSnapshot, a.packagingSnapshot].filter(Boolean).some(function (p) {
          return p.items.some(function (i) {
            return i.skuCode === m.skuCode;
          });
        })
      );
    });
    return (
      select(
        '关联实际使用方案（可空）',
        'px-consume-app',
        [['', '暂不关联，保留整批投入']].concat(
          a.map(function (x) {
            var p = find(s.production.products, x.productId);
            return [
              x.id,
              p.name +
                ' · ' +
                [x.recipeSnapshot && x.recipeSnapshot.name, x.packagingSnapshot && x.packagingSnapshot.name]
                  .filter(Boolean)
                  .join('＋')
            ];
          })
        ),
        ''
      ) + f('实际使用工序／组合名称（可空）', 'px-consume-stage', '')
    );
  }
  root.CrmProcessUI = {
    render: render,
    submit: submit,
    consumptionFields: consumptionFields,
    taskActions: taskActions,
    batchPlanSummary: batchPlanSummary,
    materialSuggestionFields: materialSuggestionFields,
    routeGroupFields: routeGroupFields,
    reportFields: reportFields,
    reportContext: reportContext,
    executionRow: executionRow
  };
})(window);
