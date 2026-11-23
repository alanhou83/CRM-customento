/* 生产试跑界面。所有业务保存到既有CRM存储契约，不注入演示业务数据。 */
(function (root) {
  'use strict';
  var M = root.CrmProductionModel,
    selected = '',
    tab = 'overview',
    libraryView = '',
    workerMode = false,
    actor = '',
    routeDraft = null,
    routeProduct = '',
    reportToken = '',
    modalStamp = '',
    routeDesktop = window.innerWidth > 768;
  function e(v) {
    return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function id() {
    return 'pw-' + crypto.randomUUID();
  }
  function context(token) {
    return { id: token || id(), at: new Date().toISOString(), date: today(), person: currentUser };
  }
  function data() {
    return {
      production: M.normalize(JSON.parse(localStorage.getItem(SK.production) || 'null')),
      orders: JSON.parse(localStorage.getItem(SK.ord) || '[]'),
      catalog: getProdCatData(),
      inventory: getInvData(),
      procurement: getProcData()
    };
  }
  function canManage() {
    return currentUser === 'Alan' || currentUser === 'Penny';
  }
  function needManage() {
    if (!canManage()) throw new Error('请由生产主管在管理入口操作');
  }
  function get(list, key) {
    var x = M.find(list, key);
    if (!x) throw new Error('记录已改变，请刷新后重试');
    return x;
  }
  function n(v) {
    return v === null || v === undefined
      ? '待核'
      : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 6 });
  }
  function val(key) {
    var x = document.getElementById(key);
    return x ? x.value : '';
  }
  function field(label, key, value, type) {
    return (
      '<label class="pn-field">' +
      e(label) +
      '<input id="' +
      key +
      '" type="' +
      (type || 'text') +
      '" value="' +
      e(value) +
      '"' +
      (type === 'number' ? ' min="0" step="any"' : '') +
      '></label>'
    );
  }
  function button(label, action, value, kind) {
    return (
      '<button type="button" class="btn ' +
      (kind || 'btn-outline') +
      ' btn-sm" data-pn="' +
      action +
      '" data-value="' +
      e(value || '') +
      '">' +
      e(label) +
      '</button>'
    );
  }
  function note(text, warning) {
    return '<p class="pn-note' + (warning ? ' pn-warning' : '') + '">' + e(text) + '</p>';
  }
  function totals(s, p) {
    return p.route.length
      ? M.totals(s, p.id, p.route[p.route.length - 1].id)
      : { reported: 0, confirmed: 0, pending: 0 };
  }
  function products(s, bid) {
    return s.production.products.filter(function (p) {
      return p.batchId === bid && !p.retiredAt;
    });
  }
  function commit(change, kind) {
    needManage();
    return changeData(change, kind);
  }
  function changeData(change, kind) {
    var s = data(),
      before = {
        production: JSON.stringify(s.production),
        inventory: JSON.stringify(s.inventory),
        procurement: JSON.stringify(s.procurement)
      };
    var result = change(s);
    M.validate(s);
    var changed = Object.keys(before).filter(function (k) {
      return before[k] !== JSON.stringify(s[k]);
    });
    if (
      changed.some(function (k) {
        return k !== kind;
      })
    )
      throw new Error('跨模块保存未完成，已停止写入');
    if (changed.length) {
      var key = kind === 'production' ? SK.production : kind === 'inventory' ? SK.inv : SK.proc;
      localStorage.setItem(key, JSON.stringify(s[kind]));
      window.dispatchEvent(new Event('crm-data-changed'));
    }
    return result;
  }
  function stamp() {
    var s = data();
    return JSON.stringify([s.production, s.inventory, s.procurement, s.orders, s.catalog]);
  }
  function freshForm() {
    if (!document.getElementById('pn-dialog').hidden && modalStamp !== stamp())
      throw new Error('数据已更新，请关闭并重新打开表单核对；尚未覆盖新记录');
  }
  function modal(title, html, submitLabel, submitAction) {
    modalStamp = stamp();
    var box = document.getElementById('pn-dialog');
    box.innerHTML =
      '<div class="pn-dialog-shade" data-pn="close-modal"></div><section class="pn-dialog-content" role="dialog" aria-modal="true" aria-label="' +
      e(title) +
      '"><header><h2>' +
      e(title) +
      '</h2>' +
      button('关闭', 'close-modal') +
      '</header><form id="pn-form" data-submit="' +
      e(submitAction || '') +
      '"><div class="pn-dialog-body">' +
      html +
      '</div>' +
      (submitAction
        ? '<footer><button type="button" class="btn btn-outline" data-pn="close-modal">取消</button><button type="submit" class="btn btn-primary">' +
          e(submitLabel || '保存') +
          '</button></footer>'
        : '') +
      '</form></section>';
    box.hidden = false;
  }
  function closeModal() {
    document.getElementById('pn-dialog').hidden = true;
    routeDraft = null;
    reportToken = '';
  }
  function openNew(orderId) {
    needManage();
    var s = data(),
      html = field('工单名称（例如批次／客户＋交期）', 'pn-name', '') + '<div class="pn-choices">';
    s.orders
      .filter(function (o) {
        return !o.completed;
      })
      .forEach(function (o) {
        html +=
          '<label><input type="checkbox" name="pn-order" value="' +
          e(o.id) +
          '"' +
          (String(o.id) === String(orderId) ? ' checked' : '') +
          '><span><b>' +
          e(o.orderNumber || o.id) +
          ' · ' +
          e(o.alias) +
          '</b><small>' +
          e(
            (o.items || [])
              .map(function (i) {
                return i.nameCN;
              })
              .join('、')
          ) +
          ' · 交期 ' +
          e(o.delivery || '待核') +
          '</small></span></label>';
      });
    html +=
      '</div><label class="pn-check"><input type="checkbox" id="pn-merge">同SKU的工艺、包装一致，合并成产品任务</label>' +
      note('不勾选时，各订单产品独立配置。合并后仍保留订单数量和交期，完工不自动发货。');
    modal('从销售订单建立工单', html, '建立工单', 'create');
  }
  function render() {
    var host = document.getElementById('pn-root');
    if (!host) return;
    try {
      var s = data(),
        managed = canManage() && !workerMode;
      if (libraryView && managed && root.CrmProcessUI) {
        host.innerHTML = header(s, managed) + root.CrmProcessUI.render(s, libraryView);
        return;
      }
      var b =
        M.find(s.production.batches, selected) ||
        get(s.production.batches, (s.production.batches[0] || {}).id);
      selected = b.id;
      host.innerHTML =
        header(s, managed) +
        '<div class="pn-workspace">' +
        (managed ? batchHeader(s, b) + nav() + renderTab(s, b) : worker(s)) +
        '</div>';
    } catch (error) {
      var s0;
      try {
        s0 = data();
      } catch (ex) {
        host.innerHTML = note(ex.message, true);
        return;
      }
      if (s0.production.batches.length) {
        host.innerHTML = header(s0, canManage() && !workerMode) + note(error.message, true);
        return;
      }
      host.innerHTML =
        header(s0, canManage() && !workerMode) +
        '<div class="pn-empty"><h2>先建立第一张生产工单</h2><p>关联现有订单，从产品库选料，配置本批工序后下达。</p>' +
        (canManage() ? button('从订单建工单', 'new', '', 'btn-primary') : '') +
        '</div>';
    }
  }
  function header(s, managed) {
    return (
      '<div class="pn-toolbar"><div><h1>🏭 生产管理</h1><p>工单 · 核料领料 · 工序进度</p></div><div class="pn-actions">' +
      (canManage()
        ? button(workerMode ? '管理入口' : '生产员入口', 'mode') +
          (!workerMode
            ? button('工艺库', 'operations') +
              button('采购工作台', 'proc-workbench') +
              button('新建工单', 'new', '', 'btn-primary')
            : '')
        : '') +
      '</div></div>' +
      (!managed ? note('试跑报工入口；所选姓名用于任务筛选，正式员工登录和权限隔离尚未部署。') : '')
    );
  }
  function batchHeader(s, b) {
    var ps = products(s, b.id),
      plan = ps.reduce(function (a, p) {
        return a + p.qty;
      }, 0),
      done = ps.reduce(function (a, p) {
        return a + totals(s, p).confirmed;
      }, 0);
    return (
      '<div class="pn-batchbar"><label>工单 <select id="pn-batch">' +
      s.production.batches
        .map(function (x) {
          return (
            '<option value="' +
            e(x.id) +
            '"' +
            (x.id === b.id ? ' selected' : '') +
            '>' +
            e(x.name) +
            ' · ' +
            (x.status === 'draft' ? '准备中' : x.status === 'active' ? '执行中' : '已关闭') +
            '</option>'
          );
        })
        .join('') +
      '</select></label><span>' +
      ps.length +
      '款 · 计划 ' +
      n(plan) +
      ' · 末道已确认 ' +
      n(done) +
      '</span></div>'
    );
  }
  function nav() {
    return (
      '<div class="pn-tabs">' +
      [
        ['overview', '总览'],
        ['materials', '核料领料'],
        ['routes', '工序配置'],
        ['reports', '报工记录'],
        ['board', '进度看板']
      ]
        .map(function (t) {
          return (
            '<button data-pn="tab" data-value="' +
            t[0] +
            '" class="' +
            (tab === t[0] ? 'on' : '') +
            '">' +
            t[1] +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  function renderTab(s, b) {
    if (tab === 'materials') return materials(s, b);
    if (tab === 'routes') return routes(s, b);
    if (tab === 'reports') return reports(s, b);
    if (tab === 'board') return board(s, b);
    return overview(s, b);
  }
  function overview(s, b) {
    var html =
      '<div class="pn-section-head"><h2>产品任务</h2>' + button('按历史／模板带出配置', 'copy') + '</div>';
    products(s, b.id).forEach(function (p) {
      var t = totals(s, p);
      html +=
        '<article class="pn-product-row"><div><b>' +
        e(p.name) +
        '</b><small>' +
        e(p.skuCode) +
        ' · ' +
        e(p.description) +
        '</small><details><summary>' +
        p.sources.length +
        '条来源 · 计划 ' +
        n(p.qty) +
        ' ' +
        e(p.unit) +
        '</summary>' +
        p.sources
          .map(function (a) {
            return (
              '<p>' +
              e(a.orderNumber) +
              ' · ' +
              e(a.alias) +
              ' · ' +
              n(a.qty) +
              ' · 交期 ' +
              e(a.delivery || '待核') +
              '</p>'
            );
          })
          .join('') +
        '</details>' +
        (M.orderDrift(s, p)
          ? note('来源订单已变更；本工单保留原数量，请先核对。', true) +
            button('核对订单变更', 'reconcile-order', p.id)
          : '') +
        '</div><div class="pn-right"><b>' +
        n(t.confirmed) +
        ' / ' +
        n(p.qty) +
        '</b><small>末道确认可流转</small>' +
        button(p.released ? '查看工序' : '配置工序', 'route', p.id) +
        (root.CrmProcessUI ? root.CrmProcessUI.taskActions(s, p) : '') +
        '</div></article>';
    });
    return (
      html +
      (root.CrmProcessUI ? root.CrmProcessUI.batchPlanSummary(s, b.id) : '') +
      s.production.planChanges
        .filter(function (c) {
          return c.batchId === b.id;
        })
        .map(function (c) {
          return note('计划变更 ' + c.beforeQty + ' → ' + c.afterQty + ' · ' + c.person + ' · ' + c.note);
        })
        .join('') +
      note('工单产出、成品入库和订单发货分别记录；当前确认工序进度不会自动入库或发货。')
    );
  }
  function materials(s, b) {
    var rows = s.production.materials.filter(function (m) {
      return m.batchId === b.id;
    });
    var html =
      '<div class="pn-section-head"><h2>本批物料清单</h2><div>' +
      button('历史／模板带料', 'copy') +
      ' ' +
      button('从产品库选料', 'select-material', '', 'btn-primary') +
      '</div></div>' +
      note('台账实存来自库存流水；预留不扣实存，实领进入库存出库单。选料后请核对备料目标及账实。');
    if (!rows.length) html += '<div class="pn-empty">尚未选料。可从现有产品库补选，也可引用历史配置。</div>';
    rows.forEach(function (m) {
      var b0 = M.balance(s, m),
        known =
          m.checkedAt ||
          s.inventory.movements.some(function (x) {
            return x.skuCode === m.skuCode;
          });
      html +=
        '<article class="pn-material"><div class="pn-section-head"><div><b>' +
        e(m.name) +
        '</b><small>' +
        e(m.skuCode) +
        ' · ' +
        e(m.variant) +
        ' · ' +
        e(m.unit) +
        '</small></div>' +
        button('配置／操作', 'material', m.id) +
        '</div><div class="pn-material-numbers"><span>备料目标<b>' +
        n(m.target) +
        '</b></span><span>台账实存<b>' +
        (known ? n(b0.stock) : '未建账') +
        '</b></span><span>其他预留<b>' +
        n(b0.other) +
        '</b></span><span>本批预留<b>' +
        n(b0.reserved) +
        '</b></span><span>机旁未用<b>' +
        n(b0.unused) +
        '</b></span><span>缺口<b class="pn-warning">' +
        n(b0.gap) +
        '</b></span></div><small>已投入 ' +
        n(b0.consumed) +
        ' · 采购草稿 ' +
        n(b0.draft) +
        ' · 已下单待到 ' +
        n(b0.ordered) +
        (m.checkedAt ? ' · 核对：' + e(m.checkedBy) : ' · 尚未核料') +
        '</small></article>';
    });
    return html + button('保存本批用料／工艺为模板', 'save-template');
  }
  function openMaterial(id0) {
    needManage();
    var s = data(),
      m = get(s.production.materials, id0),
      b = M.balance(s, m);
    var html =
      '<input type="hidden" id="pn-mid" value="' +
      e(m.id) +
      '">' +
      note(m.name + ' · ' + m.skuCode + ' · ' + m.variant) +
      '<div class="pn-metrics"><b>实存 ' +
      n(b.stock) +
      ' ' +
      e(m.unit) +
      '</b><span>可预留 ' +
      n(b.free) +
      ' · 本批预留 ' +
      n(b.reserved) +
      ' · 机旁未用 ' +
      n(b.unused) +
      '</span></div>' +
      '<div class="pn-grid2">' +
      field('理论净需求（' + m.unit + '，可空）', 'pn-theoretical', m.theoretical, 'number') +
      field('本批备料目标（' + m.unit + '）', 'pn-target', m.target, 'number') +
      '</div>';
    if (root.CrmProcessUI) html += root.CrmProcessUI.materialSuggestionFields(s, m);
    if (m.referenceTarget !== undefined)
      html += note(
        '引用 ' +
          m.source +
          '；原目标 ' +
          n(m.referenceTarget) +
          '，原关联产品量 ' +
          n(m.referenceQty) +
          '。本次目标请重新核对，不复制原库存或领料。'
      );
    html +=
      '<fieldset class="pn-choices"><legend>用于哪些产品（可多选）</legend>' +
      products(s, m.batchId)
        .map(function (p) {
          return (
            '<label><input type="checkbox" name="pn-use" value="' +
            e(p.id) +
            '"' +
            (m.uses.indexOf(p.id) >= 0 ? ' checked' : '') +
            '>' +
            e(p.name) +
            ' · ' +
            n(p.qty) +
            '</label>'
          );
        })
        .join('') +
      '</fieldset>' +
      field('每1' + m.unit + '物料的理论产出数（可空）', 'pn-yield', m.yieldPerUnit, 'number') +
      button('按所选产品量计算理论净需', 'calculate-theory', m.id) +
      note('排版／单耗仅为理论参考；实际损耗另报，备料余量由主管决定。') +
      field('用料说明／客户包装要求', 'pn-material-note', m.note) +
      '<label class="pn-check"><input type="checkbox" id="pn-checked"' +
      (m.checkedAt ? ' checked' : '') +
      '>已核对备料需求及当前台账／实物，未知情况不勾选</label><div class="pn-actions pn-material-actions">' +
      button('预留现货', 'material-action', m.id + '|reserve') +
      button('释放预留', 'material-action', m.id + '|release') +
      button('领料到车间', 'material-action', m.id + '|issue') +
      button('退回未用料', 'material-action', m.id + '|return') +
      button('记录实际投入／损耗', 'material-action', m.id + '|consume') +
      '</div>' +
      note('先保存目标和核料结果，再操作领退。领料不等于耗用；投入只减少机旁未用，不再扣一次仓库。') +
      '<details><summary>查看预留、领退料与耗用</summary>' +
      materialHistory(s, m) +
      '</details>' +
      b.links
        .map(function (l) {
          return '<p>' + button(l.number + ' · ' + l.stage + ' · 待到 ' + n(l.qty), 'open-po', l.id) + '</p>';
        })
        .join('') +
      button('移除未使用物料', 'remove-material', m.id);
    modal('物料配置', html, '保存核料', 'save-material');
  }
  function materialHistory(s, m) {
    var lines = [];
    s.production.reservations
      .filter(function (r) {
        return r.materialId === m.id;
      })
      .forEach(function (r) {
        lines.push(r.at + ' · ' + r.person + ' · ' + (r.qty > 0 ? '预留 ' : '释放 ') + n(Math.abs(r.qty)));
      });
    s.inventory.movements
      .filter(function (r) {
        return r.productionMaterialId === m.id;
      })
      .forEach(function (r) {
        lines.push(
          r.date + ' · ' + r.person + ' · ' + r.movementType + ' ' + n(Math.abs(r.qty)) + ' · ' + r.sourceId
        );
      });
    s.production.consumptions
      .filter(function (r) {
        return r.materialId === m.id;
      })
      .forEach(function (r) {
        lines.push(
          r.at +
            ' · ' +
            r.person +
            ' · 投入 ' +
            n(r.qty) +
            '，其中损耗 ' +
            n(r.scrap) +
            ' · ' +
            r.note +
            (r.status === 'void' ? '（已撤销：' + r.voidReason + '）' : '')
        );
      });
    return (
      (lines.length
        ? lines
            .map(function (l) {
              return '<p class="pn-note">' + e(l) + '</p>';
            })
            .join('')
        : note('暂无记录')) +
      s.production.consumptions
        .filter(function (c) {
          return c.materialId === m.id && c.status !== 'void';
        })
        .map(function (c) {
          return button('更正投入 ' + n(c.qty), 'void-consumption', c.id);
        })
        .join(' ')
    );
  }
  function materialAction(value) {
    needManage();
    var bits = value.split('|'),
      s = data(),
      m = get(s.production.materials, bits[0]),
      action = bits[1],
      labels = {
        reserve: '预留现货',
        release: '释放预留',
        issue: '领料到车间',
        return: '退回未用料',
        consume: '记录实际投入'
      };
    modal(
      labels[action],
      '<input type="hidden" id="pn-mid" value="' +
        e(m.id) +
        '"><input type="hidden" id="pn-material-action" value="' +
        action +
        '">' +
        note(m.name + ' · ' + m.skuCode) +
        field('本次' + labels[action] + '数量（' + m.unit + '）', 'pn-action-qty', '', 'number') +
        (['issue', 'return'].indexOf(action) >= 0 ? field('实际领／退料人', 'pn-recipient', '') : '') +
        (action === 'consume'
          ? field('上述投入中实际损耗数（非成品不良数）', 'pn-scrap', 0, 'number') +
            field('使用产品／工序／异常说明', 'pn-consume-note', '') +
            (root.CrmProcessUI ? root.CrmProcessUI.consumptionFields(s, m) : '')
          : '') +
        note('请填写本次增量，不填累计数。'),
      '确认记录',
      'material-action-save'
    );
  }
  function selectMaterial() {
    needManage();
    modal(
      '从现有产品库选料',
      field('搜索名称、规格、SKU、旧货号', 'pn-material-search', '') +
        '<div id="pn-material-options" class="pn-options"></div>' +
        button('去产品库补充物料档案', 'catalog') +
        note('只展示启用库存的实物SKU；包装组合和加工服务不作为领料物料。')
    );
    filterMaterial('');
  }
  function filterMaterial(q) {
    var s = data(),
      list = [];
    q = q.toLowerCase().trim();
    (s.catalog.products || []).forEach(function (p) {
      (p.skus || []).forEach(function (sk) {
        if (
          M.stocked({ product: p, sku: sk }) &&
          [p.nameCN, p.descCN, p.type, sk.skuCode, sk.variantCN, sk.size, sk.itemNo]
            .join(' ')
            .toLowerCase()
            .indexOf(q) >= 0
        )
          list.push({ p: p, k: sk });
      });
    });
    document.getElementById('pn-material-options').innerHTML = list.length
      ? list
          .map(function (x) {
            return (
              '<button type="button" class="pn-option" data-pn="add-material" data-value="' +
              e(x.k.skuCode) +
              '"><b>' +
              e(x.p.nameCN) +
              ' · ' +
              e(x.k.variantCN || x.k.size) +
              '</b><small>' +
              e(x.k.skuCode) +
              ' · ' +
              e(x.p.descCN || '') +
              '</small></button>'
            );
          })
          .join('')
      : note('没有匹配物料，可先在产品库建立规格并启用库存。');
  }
  function openCopy() {
    needManage();
    var s = data(),
      choices = s.production.templates
        .map(function (t) {
          return { key: 't:' + t.id, name: '模板 · ' + t.name };
        })
        .concat(
          s.production.batches
            .filter(function (b) {
              return b.id !== selected;
            })
            .map(function (b) {
              return { key: 'b:' + b.id, name: '历史工单 · ' + b.name };
            })
        );
    modal(
      '引用历史／配置',
      choices.length
        ? '<label class="pn-field">选择来源<select id="pn-copy">' +
            choices
              .map(function (c) {
                return '<option value="' + e(c.key) + '">' + e(c.name) + '</option>';
              })
              .join('') +
            '</select></label>' +
            note(
              '仅新增本批未选物料，目标留待本次复核；未下达产品可带出同SKU路线，人员重新分派。原库存、采购、领料和报工不会复制。'
            )
        : note('暂无模板或其他工单。可先手工选料、配置路线，再保存为模板。'),
      choices.length ? '带出并复核' : '',
      choices.length ? 'copy-save' : ''
    );
  }
  function routes(s, b) {
    return (
      '<div class="pn-section-head"><h2>每款产品独立配置工序</h2>' +
      button('工艺库', 'operations') +
      '</div>' +
      products(s, b.id)
        .map(function (p) {
          return (
            '<article class="pn-product-row"><div><b>' +
            e(p.name) +
            '</b><small>' +
            e(p.skuCode) +
            ' · ' +
            n(p.qty) +
            ' ' +
            e(p.unit) +
            ' · 路线 v' +
            p.routeVersion +
            '</small><p>' +
            e(
              p.route
                .map(function (r) {
                  return r.name;
                })
                .join(' → ') || '尚未配置工序'
            ) +
            '</p><small>包装要求：' +
            e(p.packaging || '待填写') +
            '</small></div><div class="pn-right">' +
            button('配置／查看', 'route', p.id) +
            button(p.released ? '撤回下达' : '确认下达', 'release-route', p.id) +
            (p.materialsNeedReview ? '<small class="pn-warning">核料需复核</small>' : '') +
            '</div></article>'
          );
        })
        .join('') +
      note(
        '工序库是可维护的基础选项，当前不会预设本客户工艺。下达前检查路线、人员及包装；有报工后保留原路线版本，不悄改历史。'
      )
    );
  }
  function captureRoute() {
    if (!routeDraft) return;
    document.querySelectorAll('[data-route-step]').forEach(function (row) {
      var step = get(routeDraft, row.dataset.routeStep);
      step.name = row.querySelector('[name="step-name"]').value.trim();
      step.requirements = row.querySelector('[name="step-req"]').value;
      step.assignees = names(row.querySelector('[name="step-people"]').value);
      step.rate = row.querySelector('[name="step-rate"]').value;
      step.rateMode = row.querySelector('[name="step-rate-mode"]').value;
    });
  }
  function names(value) {
    return Array.from(
      new Set(
        value
          .split(/[,，、\n]/)
          .map(function (x) {
            return x.trim();
          })
          .filter(Boolean)
      )
    );
  }
  function openRoute(pid, keep) {
    needManage();
    var s = data(),
      p = get(s.production.products, pid),
      pack = keep ? val('pn-packaging') : p.packaging;
    if (!keep) {
      routeDraft = JSON.parse(JSON.stringify(p.route));
      routeProduct = pid;
    }
    routeDesktop = window.innerWidth > 768;
    var locked =
      p.released ||
      s.production.reports.some(function (r) {
        return r.productId === pid;
      });
    var expandedSettings = keep
      ? Array.from(document.querySelectorAll('.pn-route-settings-toggle[open]')).map(function (details) {
          return details.closest('[data-route-step]').dataset.routeStep;
        })
      : [];
    var draft = routeDraft,
      html =
        note(p.name + ' · ' + p.skuCode + ' · 计划 ' + n(p.qty) + ' ' + p.unit) +
        (locked ? note('当前路线已下达或已有报工，保持只读；无报工时可撤回下达再修改。', true) : '') +
        '<input type="hidden" id="pn-route-product" value="' +
        e(pid) +
        '"><div class="pn-route-columns" aria-hidden="true"><span>序</span><span>工序</span><span>操作要求</span><span>参与人员</span><span>参考产能</span><span>口径</span><span>操作</span></div><div id="pn-route-steps">';
    draft.forEach(function (step, index) {
      html +=
        '<fieldset class="pn-route-row' +
        (expandedSettings.indexOf(step.id) >= 0 ? ' pn-route-settings-open' : '') +
        '" data-route-step="' +
        e(step.id) +
        '" ' +
        (locked ? 'disabled' : '') +
        ' aria-label="第' +
        (index + 1) +
        '道工序">' +
        '<span class="pn-route-index">' +
        (index + 1) +
        '</span>' +
        fieldStep('工序名称', 'step-name', step.name, 'text', 'pn-route-name') +
        '<details class="pn-route-settings-toggle"' +
        (expandedSettings.indexOf(step.id) >= 0 ? ' open' : '') +
        '><summary><span class="pn-route-settings-label">设置</span><span class="pn-route-settings-close">收起</span></summary></details>' +
        '<details class="pn-route-requirement"' +
        (window.innerWidth > 768 ? ' open' : '') +
        '>' +
        '<summary><span class="pn-route-req-preview">' +
        e(step.requirements || '操作要求') +
        '</span><span class="pn-route-req-caption">操作要求</span></summary><textarea name="step-req" rows="1" aria-label="本单操作要求" placeholder="操作要求" title="' +
        e(step.requirements || '') +
        '">' +
        e(step.requirements || '') +
        '</textarea></details>' +
        fieldStep('人员', 'step-people', (step.assignees || []).join('，'), 'text', 'pn-route-people') +
        fieldStep('产能', 'step-rate', step.rate || '', 'number', 'pn-route-rate') +
        '<label class="pn-field pn-route-mode"><span class="pn-route-field-label">口径</span>' +
        '<select name="step-rate-mode" aria-label="参考产能口径"><option' +
        (step.rateMode === '人时' ? ' selected' : '') +
        '>人时</option><option' +
        (step.rateMode === '机器小时' ? ' selected' : '') +
        '>机器小时</option></select></label>' +
        '<div class="pn-route-controls">' +
        routeControl('↑', '上移工序', 'route-up', step.id, index === 0) +
        routeControl('↓', '下移工序', 'route-down', step.id, index === draft.length - 1) +
        routeControl('×', '移除工序', 'route-remove', step.id, false) +
        '</div></fieldset>';
    });
    html += '</div>' + note('人员用逗号分隔，可安排小组；参考产能可留空，仅用于预估。');
    if (!locked)
      html +=
        '<div class="pn-actions"><select id="pn-operation-choice"><option value="">从工序库选取</option>' +
        s.production.operations
          .filter(function (o) {
            return o.active;
          })
          .map(function (o) {
            return '<option value="' + e(o.id) + '">' + e(o.name) + '</option>';
          })
          .join('') +
        '</select>' +
        button('添加工序', 'route-add') +
        '</div>';
    if (root.CrmProcessUI) html += root.CrmProcessUI.routeGroupFields(draft, locked);
    html +=
      '<label class="pn-field">本款客户包装要求（保护膜、垫纸、内包装、装箱等）<textarea id="pn-packaging"' +
      (locked ? ' disabled' : '') +
      '>' +
      e(pack) +
      '</textarea></label>' +
      note('包装文字用于交代做法，实际包材仍在核料清单选SKU及数量。改变要求后请复核用料。');
    modal('产品工序配置', html, locked ? '' : '保存本款配置', locked ? '' : 'route-save');
    document.querySelector('#pn-dialog .pn-dialog-content').classList.add('pn-route-dialog');
    routeDraft = draft;
    routeProduct = pid;
  }
  function fieldStep(label, name, value, type, css) {
    return (
      '<label class="pn-field ' +
      (css || '') +
      '"><span class="pn-route-field-label">' +
      e(label) +
      '</span><input name="' +
      name +
      '" type="' +
      (type || 'text') +
      '" value="' +
      e(value || '') +
      '" aria-label="' +
      e(label) +
      '" placeholder="' +
      e(label) +
      '" title="' +
      e(value || '') +
      '"' +
      (type === 'number' ? ' min="0" step="any"' : '') +
      '></label>'
    );
  }
  function routeControl(text, label, action, value, disabled) {
    return (
      '<button type="button" class="pn-route-control" aria-label="' +
      label +
      '" title="' +
      label +
      '" data-pn="' +
      action +
      '" data-value="' +
      e(value) +
      '"' +
      (disabled ? ' disabled' : '') +
      '>' +
      text +
      '</button>'
    );
  }
  function operations() {
    needManage();
    if (root.CrmProcessUI) {
      libraryView = libraryView || 'recipes';
      render();
      return;
    }
    var s = data();
    modal(
      '工序基础库',
      note('名称、操作要求及产能由实际经验维护；参考值不限制真实报工。') +
        s.production.operations
          .map(function (o) {
            return (
              '<div class="pn-operation"><span>' +
              e(o.name) +
              ' · ' +
              (o.active ? '启用' : '停用') +
              '</span><div>' +
              button('编辑', 'edit-operation', o.id) +
              button(o.active ? '停用' : '启用', 'toggle-operation', o.id) +
              '</div></div>'
            );
          })
          .join('') +
        button('新增工序', 'edit-operation')
    );
  }
  function editOperation(key) {
    var s = data(),
      o = key
        ? get(s.production.operations, key)
        : { id: '', name: '', requirements: '', rate: '', rateMode: '人时' };
    modal(
      '维护工序',
      '<input type="hidden" id="pn-opid" value="' +
        e(o.id) +
        '">' +
        field('工序名称', 'pn-opname', o.name) +
        field('默认操作提示', 'pn-opreq', o.requirements) +
        field('参考每小时产量（可不填）', 'pn-oprate', o.rate, 'number') +
        '<label class="pn-field">参考口径<select id="pn-opmode"><option' +
        (o.rateMode === '人时' ? ' selected' : '') +
        '>人时</option><option' +
        (o.rateMode === '机器小时' ? ' selected' : '') +
        '>机器小时</option></select></label>' +
        note('编辑基础库不修改已建工单的工序快照。'),
      '保存工序',
      'operation-save'
    );
  }
  function taskList(s, person, all) {
    var html = '';
    s.production.products.forEach(function (p) {
      var b = get(s.production.batches, p.batchId);
      if (!p.released || ['cancelled', 'completed'].indexOf(b.status) >= 0) return;
      if (p.retiredAt) return;
      var tasks = root.CrmProcessModel
        ? root.CrmProcessModel.taskGroups(p)
        : p.route.map(function (step) {
            return {
              name: step.name,
              steps: [step],
              people: step.assignees,
              requirements: step.requirements
            };
          });
      tasks.forEach(function (group) {
        var step = group.steps[0];
        if (!all && group.people.indexOf(person) < 0) return;
        var t = M.totals(s, p.id, step.id);
        html +=
          '<article class="pn-product-row"><div><b>' +
          e(p.name) +
          ' · ' +
          e(group.name) +
          '</b><small>' +
          e(b.name) +
          ' · ' +
          e(p.skuCode) +
          '</small><small>' +
          e(group.requirements || '按本单工艺执行') +
          '</small></div><div class="pn-right"><b>' +
          n(t.reported) +
          ' / ' +
          n(p.qty) +
          '</b><small>本工序已报／计划</small>' +
          button('报本次完成', 'report', p.id + '|' + step.id, 'btn-primary') +
          '</div></article>';
      });
    });
    return html || '<div class="pn-empty">暂无已下达任务，请先由主管配置并分派工序。</div>';
  }
  function worker(s) {
    var people = [];
    s.production.products
      .filter(function (p) {
        return !p.retiredAt;
      })
      .forEach(function (p) {
        p.route.forEach(function (r) {
          people = people.concat(r.assignees);
        });
      });
    people = Array.from(new Set(people));
    if (people.indexOf(actor) < 0) actor = people[0] || '';
    return (
      '<label class="pn-field">当前报工人员（试跑）<select id="pn-worker">' +
      people
        .map(function (person) {
          return '<option' + (person === actor ? ' selected' : '') + '>' + e(person) + '</option>';
        })
        .join('') +
      '</select></label><h2>我的任务</h2>' +
      taskList(s, actor, false) +
      '<h2>我的参与记录</h2>' +
      reportRows(
        s,
        s.production.reports
          .filter(function (r) {
            return r.people.indexOf(actor) >= 0;
          })
          .slice()
          .reverse(),
        false
      )
    );
  }
  function reports(s, b) {
    return (
      '<details><summary>打开任务代报工</summary>' +
      taskList(
        {
          production: Object.assign({}, s.production, { products: products(s, b.id) }),
          inventory: s.inventory
        },
        '',
        true
      ) +
      '</details><h2>报工记录</h2>' +
      reportRows(
        s,
        s.production.reports
          .filter(function (r) {
            return r.batchId === b.id;
          })
          .slice()
          .reverse(),
        true
      )
    );
  }
  function reportRows(s, list, managed) {
    return (
      list
        .map(function (r) {
          if (r.executionId && root.CrmProcessUI) {
            return r.groupIndex === 0 ? root.CrmProcessUI.executionRow(s, r.executionId, managed) : '';
          }
          var p = get(s.production.products, r.productId);
          return (
            '<article class="pn-report"><div class="pn-section-head"><b>' +
            e(p.name) +
            ' · ' +
            e(r.stepName) +
            '</b><span class="' +
            (r.status === 'pending' ? 'pn-warning' : '') +
            '">' +
            (r.status === 'pending' ? '待核对' : r.status === 'confirmed' ? '已确认' : '已撤销') +
            '</span></div><p>本次 ' +
            n(r.qty) +
            ' ' +
            e(p.unit) +
            ' · ' +
            e(r.people.join('、')) +
            (r.status === 'confirmed' ? ' · 可流转 ' + n(r.good) : '') +
            '</p><small>' +
            e(new Date(r.at).toLocaleString('zh-CN', { hour12: false })) +
            ' · 填报 ' +
            e(r.reportedBy) +
            ' · 路线 v' +
            r.routeVersion +
            '</small>' +
            (r.over || r.previousWarning
              ? note(
                  (r.over ? '累计超过计划 ' + n(r.over) + '。' : '') +
                    (r.previousWarning ? '报数超过上道已确认量，交接待核。' : ''),
                  true
                )
              : '') +
            (r.orderWarning ? note('报工时来源订单有变更，实际报数保留，主管需核对计划。', true) : '') +
            (root.CrmProcessUI ? root.CrmProcessUI.reportContext(s, r) : '') +
            (r.note ? note(r.note) : '') +
            (r.confirmNote ? note('核对：' + r.confirmNote) : '') +
            (r.voidReason ? note('更正：' + r.voidReason) : '') +
            ((r.hours || []).length
              ? note(
                  '人时：' +
                    r.hours
                      .map(function (h) {
                        return h.person + ' ' + n(h.hours) + 'h';
                      })
                      .join('、')
                )
              : '') +
            (r.status !== 'void'
              ? '<div class="pn-actions">' + button('补充／更正工时', 'edit-report-time', r.id) + '</div>'
              : '') +
            (managed
              ? '<div class="pn-actions">' +
                (r.status === 'pending' ? button('确认可流转数', 'confirm-report', r.id) : '') +
                (r.status !== 'void' ? button('撤销并留原因', 'void-report', r.id) : '') +
                '</div>'
              : '') +
            '</article>'
          );
        })
        .join('') || note('暂无报工记录')
    );
  }
  function openReport(value) {
    var s = data(),
      bits = value.split('|'),
      p = get(s.production.products, bits[0]),
      step = get(p.route, bits[1]);
    var group = root.CrmProcessModel
      ? root.CrmProcessModel.taskGroups(p).find(function (g) {
          return g.steps.some(function (st) {
            return st.id === step.id;
          });
        })
      : { name: step.name, people: step.assignees, requirements: step.requirements };
    if (!canManage() && (group.people || []).indexOf(actor) < 0)
      throw new Error('请使用分派给当前人员的任务');
    reportToken = id();
    modal(
      '报本次完成量',
      '<input type="hidden" id="pn-report-product" value="' +
        e(p.id) +
        '"><input type="hidden" id="pn-report-step" value="' +
        e(step.id) +
        '">' +
        note(p.name + ' · ' + group.name + ' · 计划 ' + n(p.qty) + ' ' + p.unit) +
        note(group.requirements || '') +
        (step.executionGroup
          ? '<fieldset class="px-completed-steps"><legend>本次实际完成的步骤</legend>' +
            group.steps
              .map(function (st) {
                return (
                  '<label class="pn-check"><input type="checkbox" name="px-completed-step" value="' +
                  e(st.id) +
                  '" checked>' +
                  e(st.name) +
                  '</label>'
                );
              })
              .join('') +
            note('只勾选已经完成的步骤。仅做了擦边时，取消其他步骤；不会自动算作包装完成。') +
            '</fieldset>'
          : '') +
        field('本次新增完成数量（' + p.unit + '）', 'pn-report-qty', '', 'number') +
        field(
          '实际参与人／小组成员（逗号分隔）',
          'pn-report-people',
          workerMode || !canManage() ? actor : (group.people || []).join('，')
        ) +
        note('小组共同完成的数量只报一次，不按人数重复增加。') +
        '<details><summary>补充异常／工时（可稍后说明）</summary>' +
        field('其中不良数（不清楚可留空）', 'pn-report-bad', '', 'number') +
        field('各人人时（例如 姓名=2，姓名=1.5）', 'pn-report-hours', '') +
        field('实际机器小时（可空）', 'pn-machine-hours', '', 'number') +
        (root.CrmProcessUI ? root.CrmProcessUI.reportFields(s, p) : '') +
        field('异常／补充说明', 'pn-report-note', '') +
        '</details>',
      '提交报工',
      'report-save'
    );
  }
  function board(s, b) {
    return (
      products(s, b.id)
        .map(function (p) {
          return (
            '<article class="pn-report"><h2>' +
            e(p.name) +
            ' · ' +
            n(p.qty) +
            ' ' +
            e(p.unit) +
            '</h2>' +
            p.route
              .map(function (step) {
                var t = M.totals(s, p.id, step.id),
                  percent = Math.min(100, (t.confirmed / p.qty) * 100),
                  rs = s.production.reports.filter(function (r) {
                    return r.productId === p.id && r.stepId === step.id && r.status !== 'void';
                  }),
                  hasTime =
                    rs.length &&
                    rs.every(function (r) {
                      return step.rateMode === '机器小时'
                        ? r.machineHours !== null
                        : (r.hours || []).length === r.people.length;
                    }),
                  hours = rs.reduce(function (sum, r) {
                    return (
                      sum +
                      (step.rateMode === '机器小时'
                        ? Number(r.machineHours || 0)
                        : (r.hours || []).reduce(function (a, h) {
                            return a + Number(h.hours);
                          }, 0))
                    );
                  }, 0),
                  estimate = step.rate
                    ? '参考 ' +
                      n(step.rate) +
                      ' ' +
                      p.unit +
                      '/' +
                      step.rateMode +
                      '，计划约 ' +
                      n(M.round(p.qty / Number(step.rate))) +
                      ' ' +
                      step.rateMode
                    : '参考产能待填';
                return (
                  '<div class="pn-progress-row"><span>' +
                  e(step.name) +
                  '</span><progress max="100" value="' +
                  percent +
                  '"></progress><span>已报 ' +
                  n(t.reported) +
                  ' · 可流转 ' +
                  n(t.confirmed) +
                  (t.reported > p.qty ? ' · 超 ' + n(t.reported - p.qty) : '') +
                  '</span><small class="pn-progress-hint">' +
                  e(estimate) +
                  ' · ' +
                  (hasTime && hours > 0
                    ? '实际 ' +
                      n(hours) +
                      ' ' +
                      e(step.rateMode) +
                      '，已报产出效率 ' +
                      n(M.round(t.reported / hours)) +
                      ' ' +
                      e(p.unit) +
                      '/' +
                      e(step.rateMode)
                    : step.executionGroup
                      ? '组合工时见报工记录／历史实绩'
                      : '实际工时待补齐') +
                  '</small></div>'
                );
              })
              .join('') +
            '</article>'
          );
        })
        .join('') +
      note(
        '各工序分别累计；不把切割、清理、包装相加成订单产量。参考产能仅用于估算，实际效率需补齐人时或机器小时。'
      )
    );
  }
  function workbench() {
    needManage();
    var s = data(),
      html = note(
        '可跨工单汇总同供应商采购。同SKU合并数量，保留工单来源；草稿需到采购模块核价、确认交期后执行。'
      );
    html +=
      '<label class="pn-field">供应商<select id="pn-po-supplier"><option value="">请选择现有供应商</option>' +
      (s.procurement.suppliers || [])
        .map(function (x) {
          return '<option value="' + e(x.id) + '">' + e(x.name || x.alias) + '</option>';
        })
        .join('') +
      '</select></label><label class="pn-field">本张采购单币种<select id="pn-po-currency"><option>CNY</option><option>USD</option></select></label><div class="pn-choices">';
    s.production.materials.forEach(function (m) {
      var b = M.balance(s, m),
        batch = get(s.production.batches, m.batchId);
      if (['cancelled', 'completed'].indexOf(batch.status) >= 0 || !(b.gap > 0)) return;
      html +=
        '<label><input type="checkbox" name="pn-purchase" value="' +
        e(m.id) +
        '"><span><b>' +
        e(m.name) +
        ' · ' +
        e(m.skuCode) +
        '</b><small>' +
        e(batch.name) +
        ' · 缺口 ' +
        n(b.gap) +
        ' ' +
        e(m.unit) +
        (b.free > 0 ? ' · 先预留现货 ' + n(b.free) : '') +
        '</small><input aria-label="本次采购数量" type="number" min="0" step="any" data-purchase-qty="' +
        e(m.id) +
        '" value="' +
        e(b.gap) +
        '"></span></label>';
    });
    html += '</div>';
    modal('采购工作台', html, '生成采购草稿', 'proc-create');
  }
  function show() {
    showPage('production');
  }
  function orderEntry(orderId) {
    libraryView = '';
    show();
    var s = data(),
      found = s.production.products.find(function (p) {
        return (
          !p.retiredAt &&
          p.sources.some(function (a) {
            return a.orderId === String(orderId);
          })
        );
      });
    if (found) {
      selected = found.batchId;
      tab = 'overview';
      render();
    } else if (canManage()) openNew(orderId);
  }
  function handle(action, value) {
    if (action !== 'close-modal') freshForm();
    var s,
      p,
      m,
      ctx = context();
    if (action === 'close-modal') {
      closeModal();
      return;
    }
    if (action === 'mode') {
      closeModal();
      workerMode = !workerMode;
      render();
      return;
    }
    if (action === 'new') {
      libraryView = '';
      openNew();
      return;
    }
    if (action === 'tab') {
      tab = value;
      render();
      return;
    }
    if (action === 'material') {
      openMaterial(value);
      return;
    }
    if (action === 'calculate-theory') {
      s = data();
      var useIds = Array.from(document.querySelectorAll('[name=pn-use]:checked')).map(function (x) {
          return x.value;
        }),
        ps = s.production.products.filter(function (x) {
          return useIds.indexOf(x.id) >= 0;
        });
      if (!ps.length) throw new Error('请先勾选本物料用于哪些产品');
      if (
        new Set(
          ps.map(function (x) {
            return x.unit;
          })
        ).size > 1
      )
        throw new Error('产品单位不同，请手工核算理论需求');
      var yieldQty = M.num(val('pn-yield'));
      document.getElementById('pn-theoretical').value = Math.ceil(
        ps.reduce(function (sum, x) {
          return sum + x.qty;
        }, 0) / yieldQty
      );
      return;
    }
    if (action === 'material-action') {
      materialAction(value);
      return;
    }
    if (action === 'select-material') {
      selectMaterial();
      return;
    }
    if (action === 'catalog') {
      closeModal();
      showPage('prodcat');
      return;
    }
    if (action === 'add-material') {
      commit(function (s0) {
        M.addMaterial(s0, selected, value, ctx);
      }, 'production');
      closeModal();
      tab = 'materials';
      render();
      return;
    }
    if (action === 'remove-material') {
      if (!confirm('移除这条尚未使用的物料配置？')) return;
      commit(function (s0) {
        M.removeMaterial(s0, value);
      }, 'production');
      closeModal();
      render();
      return;
    }
    if (action === 'reconcile-order') {
      var why = prompt('请核对来源订单的新数量，说明变更原因；工序保留，用料/采购不会自动改量。');
      if (!why) return;
      commit(function (s0) {
        M.reconcileOrder(s0, value, why, ctx);
      }, 'production');
      render();
      return;
    }
    if (action === 'copy') {
      openCopy();
      return;
    }
    if (action === 'save-template') {
      needManage();
      modal(
        '保存常用配置',
        field('模板名称', 'pn-template-name', '') +
          note('保存物料引用、参考目标和产品路线，不包含库存、采购、人员分派或报工。'),
        '保存模板',
        'template-save'
      );
      return;
    }
    if (action === 'route') {
      openRoute(value);
      return;
    }
    if (action === 'operations') {
      operations();
      return;
    }
    if (action === 'edit-operation') {
      editOperation(value);
      return;
    }
    if (action === 'toggle-operation') {
      commit(function (s0) {
        var o = get(s0.production.operations, value);
        o.active = !o.active;
      }, 'production');
      operations();
      return;
    }
    if (action === 'release-route') {
      s = data();
      p = get(s.production.products, value);
      if (
        !confirm(
          p.released
            ? '撤回下达以重新配置？有报工后不可撤回。'
            : '确认本款路线及人员，并已按客户要求复核包材？已有物料可先安排生产，无需等齐所有采购。'
        )
      )
        return;
      commit(function (s0) {
        M.releaseRoute(s0, value, p.released);
      }, 'production');
      render();
      return;
    }
    if (action.indexOf('route-') === 0) {
      needManage();
      captureRoute();
      if (action === 'route-add') {
        var opId = val('pn-operation-choice');
        s = data();
        var op = get(s.production.operations, opId);
        routeDraft.push({
          id: id(),
          operationId: op.id,
          name: op.name,
          requirements: op.requirements || '',
          assignees: [],
          rate: op.rate || '',
          rateMode: op.rateMode || '人时'
        });
      } else {
        var index = routeDraft.findIndex(function (r) {
          return r.id === value;
        });
        if (action === 'route-remove') routeDraft.splice(index, 1);
        else {
          var to = index + (action === 'route-up' ? -1 : 1);
          if (to >= 0 && to < routeDraft.length) {
            var temp = routeDraft[index];
            routeDraft[index] = routeDraft[to];
            routeDraft[to] = temp;
          }
        }
      }
      openRoute(routeProduct, true);
      return;
    }
    if (action === 'report') {
      openReport(value);
      return;
    }
    if (action === 'confirm-report') {
      s = data();
      var r = get(s.production.reports, value);
      modal(
        '核对报工',
        '<input type="hidden" id="pn-confirm-id" value="' +
          e(r.id) +
          '">' +
          note('本次报数 ' + n(r.qty) + '；已知不良 ' + n(r.bad)) +
          field('本次确认可流转数量', 'pn-good', r.qty - (r.bad || 0), 'number') +
          field('核对说明（超产或交接异常必填）', 'pn-confirm-note', ''),
        '确认可流转',
        'confirm-save'
      );
      return;
    }
    if (action === 'edit-report-time') {
      s = data();
      var rr = get(s.production.reports, value);
      if (!canManage() && rr.people.indexOf(actor) < 0) throw new Error('仅可补充本人参与的报工');
      modal(
        '补充实际工时',
        '<input type="hidden" id="pn-time-id" value="' +
          e(rr.id) +
          '">' +
          note('参与人：' + rr.people.join('、') + '。只更正工时，不改产量和确认结果。') +
          field(
            '各人人时（姓名=小时，逗号分隔）',
            'pn-time-hours',
            (rr.hours || [])
              .map(function (h) {
                return h.person + '=' + h.hours;
              })
              .join('，')
          ) +
          field('实际机器小时（可空）', 'pn-time-machine', rr.machineHours, 'number') +
          field('补充／更正说明', 'pn-time-note', ''),
        '保存工时',
        'report-time-save'
      );
      return;
    }
    if (action === 'void-consumption') {
      var why0 = prompt('请填写投入更正原因；原记录保留，之后可重新录入实际投入。');
      if (!why0) return;
      commit(function (s0) {
        M.voidConsumption(s0, value, why0, ctx);
      }, 'production');
      closeModal();
      render();
      return;
    }
    if (action === 'void-report') {
      var reason = prompt('请输入更正原因（原记录保留，可重新报工）');
      if (!reason) return;
      commit(function (s0) {
        M.voidReport(s0, value, reason, ctx);
      }, 'production');
      render();
      return;
    }
    if (action === 'proc-workbench') {
      workbench();
      return;
    }
    if (action === 'open-po') {
      closeModal();
      showPage('procurement');
      openProcDetail(value);
      return;
    }
  }
  function submit(action) {
    freshForm();
    if (action.indexOf('px-') === 0 && root.CrmProcessUI) return root.CrmProcessUI.submit(action.slice(3));
    var ctx = context(),
      message = '已保存';
    if (action === 'create') {
      var ids = Array.from(document.querySelectorAll('[name="pn-order"]:checked')).map(function (x) {
        return x.value;
      });
      var b = commit(function (s) {
        return M.createBatch(s, ids, document.getElementById('pn-merge').checked, ctx, val('pn-name').trim());
      }, 'production');
      selected = b.id;
      tab = 'overview';
    } else if (action === 'save-material') {
      commit(function (s) {
        M.updateMaterial(
          s,
          val('pn-mid'),
          {
            target: val('pn-target'),
            theoretical: val('pn-theoretical'),
            yieldPerUnit: val('pn-yield'),
            uses: Array.from(document.querySelectorAll('[name="pn-use"]:checked')).map(function (x) {
              return x.value;
            }),
            note: val('pn-material-note'),
            checked: document.getElementById('pn-checked').checked
          },
          ctx
        );
      }, 'production');
    } else if (action === 'material-action-save') {
      var a = val('pn-material-action'),
        mid = val('pn-mid'),
        qty = val('pn-action-qty');
      ctx.processApplicationId = val('px-consume-app');
      ctx.processStageName = val('px-consume-stage');
      commit(
        function (s) {
          if (a === 'consume') M.consume(s, mid, qty, val('pn-scrap'), val('pn-consume-note'), ctx);
          else if (a === 'issue' || a === 'return')
            M.moveMaterial(s, mid, qty, a === 'return', ctx, val('pn-recipient'));
          else M.reserve(s, mid, qty, a === 'release', ctx);
        },
        a === 'issue' || a === 'return' ? 'inventory' : 'production'
      );
    } else if (action === 'copy-save') {
      var choice = val('pn-copy').split(':');
      commit(function (s) {
        var t = choice[0] === 't' ? get(s.production.templates, choice[1]) : M.configFromBatch(s, choice[1]);
        M.copyConfig(s, selected, t, ctx);
      }, 'production');
      message = '已带出配置，请复核本批目标并重新分派人员';
    } else if (action === 'template-save') {
      var name = val('pn-template-name').trim();
      if (!name) throw new Error('请填写模板名称');
      commit(function (s) {
        var t = M.configFromBatch(s, selected);
        t.id = ctx.id;
        t.name = name;
        t.createdAt = ctx.at;
        s.production.templates.push(t);
      }, 'production');
    } else if (action === 'route-save') {
      captureRoute();
      var draft = JSON.parse(JSON.stringify(routeDraft));
      commit(function (s) {
        M.setRoute(s, val('pn-route-product'), draft, val('pn-packaging'), ctx);
      }, 'production');
    } else if (action === 'operation-save') {
      var name0 = val('pn-opname').trim(),
        opid = val('pn-opid'),
        rate = val('pn-oprate');
      if (!name0) throw new Error('请填写工序名称');
      if (rate !== '') M.num(rate);
      commit(function (s) {
        if (
          s.production.operations.some(function (o) {
            return o.id !== opid && o.name === name0;
          })
        )
          throw new Error('工序名称已存在');
        var o = opid ? get(s.production.operations, opid) : { id: ctx.id, active: true };
        o.name = name0;
        o.requirements = val('pn-opreq');
        o.rate = rate;
        o.rateMode = val('pn-opmode');
        if (!opid) s.production.operations.push(o);
      }, 'production');
      closeModal();
      operations();
      render();
      return;
    } else if (action === 'report-save') {
      var people = names(val('pn-report-people')),
        hours = [];
      if (val('pn-report-hours').trim())
        names(val('pn-report-hours')).forEach(function (entry) {
          var pair = entry.split('=');
          if (pair.length !== 2) throw new Error('人时格式请使用 姓名=小时');
          hours.push({ person: pair[0].trim(), hours: M.num(pair[1], true) });
        });
      ctx = context(reportToken);
      if (!ctx.id) throw new Error('请重新打开报工');
      var r = changeData(function (s) {
        return M.report(
          s,
          val('pn-report-product'),
          val('pn-report-step'),
          {
            qty: val('pn-report-qty'),
            bad: val('pn-report-bad'),
            people: people,
            hours: hours,
            machineHours: val('pn-machine-hours'),
            note: val('pn-report-note'),
            processApplicationId: val('px-report-app'),
            completedStepIds: document.querySelector('[name=px-completed-step]')
              ? Array.from(document.querySelectorAll('[name=px-completed-step]:checked')).map(function (el) {
                  return el.value;
                })
              : undefined,
            deviceId: val('px-report-device'),
            deviceCondition: val('px-report-condition'),
            prepHours: val('px-report-prep'),
            downtimeHours: val('px-report-down')
          },
          ctx
        );
      }, 'production');
      message =
        r && r.over ? '报工已保存，超计划 ' + n(r.over) + '，请主管核对' : '报工已保存，待核对可流转数';
    } else if (action === 'report-time-save') {
      var timeId = val('pn-time-id'),
        timeHours = [];
      if (val('pn-time-hours').trim())
        names(val('pn-time-hours')).forEach(function (entry) {
          var pair = entry.split('=');
          if (pair.length !== 2) throw new Error('人时格式请使用 姓名=小时');
          timeHours.push({ person: pair[0].trim(), hours: M.num(pair[1], true) });
        });
      changeData(function (s) {
        var r = get(s.production.reports, timeId);
        if (!canManage() && r.people.indexOf(actor) < 0) throw new Error('仅可补充本人参与的报工');
        M.updateReportTime(s, timeId, timeHours, val('pn-time-machine'), val('pn-time-note'), ctx);
      }, 'production');
    } else if (action === 'confirm-save') {
      commit(function (s) {
        M.confirmReport(s, val('pn-confirm-id'), val('pn-good'), val('pn-confirm-note'), ctx);
      }, 'production');
    } else if (action === 'proc-create') {
      var requests = Array.from(document.querySelectorAll('[name="pn-purchase"]:checked')).map(function (x) {
        return {
          materialId: x.value,
          qty: document.querySelector('[data-purchase-qty="' + CSS.escape(x.value) + '"]').value
        };
      });
      var po = commit(function (s) {
        return M.createProcurement(
          s,
          requests,
          val('pn-po-supplier'),
          val('pn-po-currency'),
          ctx,
          genPoNumber()
        );
      }, 'procurement');
      closeModal();
      showPage('procurement');
      openProcDetail(po.id);
      toast('采购草稿已生成，待核价和交期');
      return;
    } else return;
    closeModal();
    render();
    toast(message);
  }
  function run(fn) {
    var perform = function () {
      try {
        return fn();
      } catch (error) {
        toast(error.message || '操作失败，未保存');
      }
    };
    return navigator.locks
      ? navigator.locks.request('crm-production-ledger', perform)
      : Promise.resolve(perform());
  }
  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-pn]');
    if (!el) return;
    if (el.closest('fieldset[disabled]')) return;
    event.preventDefault();
    run(function () {
      handle(el.dataset.pn, el.dataset.value || '');
    });
  });
  document.addEventListener('submit', function (event) {
    if (event.target.id !== 'pn-form') return;
    event.preventDefault();
    var btn = event.target.querySelector('button[type="submit"]');
    if (btn.disabled) return;
    btn.disabled = true;
    run(function () {
      submit(event.target.dataset.submit);
    }).finally(function () {
      if (btn.isConnected) btn.disabled = false;
    });
  });
  document.addEventListener('input', function (event) {
    if (event.target.name === 'step-req') {
      var preview = event.target.closest('.pn-route-requirement').querySelector('.pn-route-req-preview');
      preview.textContent = event.target.value || '操作要求';
      event.target.title = event.target.value;
    }
    if (event.target.id === 'pn-material-search')
      run(function () {
        filterMaterial(event.target.value);
      });
  });
  // 展开设置只改变显示；隐藏字段仍由同一份草稿采集和保存。
  document.addEventListener(
    'toggle',
    function (event) {
      if (event.target.classList && event.target.classList.contains('pn-route-settings-toggle')) {
        event.target
          .closest('[data-route-step]')
          .classList.toggle('pn-route-settings-open', event.target.open);
      }
    },
    true
  );
  document.addEventListener('change', function (event) {
    if (event.target.id === 'pn-batch') {
      selected = event.target.value;
      tab = 'overview';
      render();
    }
    if (event.target.id === 'pn-worker') {
      actor = event.target.value;
      closeModal();
      render();
    }
  });
  window.addEventListener('resize', function () {
    var desktop = window.innerWidth > 768;
    if (document.querySelector('.pn-route-dialog') && desktop !== routeDesktop) {
      document.querySelectorAll('.pn-route-requirement').forEach(function (details) {
        details.open = desktop;
      });
    }
    routeDesktop = desktop;
  });
  window.addEventListener('storage', function (event) {
    if ([SK.production, SK.inv, SK.ord, SK.proc, SK.prodcat].indexOf(event.key) >= 0) {
      closeModal();
      render();
    }
  });
  root.CrmProduction = {
    render: render,
    openLibrary: function (t) {
      needManage();
      libraryView = t || 'recipes';
      render();
    },
    closeLibrary: function () {
      libraryView = '';
      render();
    },
    helpers: {
      data: data,
      commit: commit,
      changeData: changeData,
      modal: modal,
      closeModal: closeModal,
      render: render,
      context: context,
      e: e,
      n: n,
      field: field,
      val: val,
      button: button,
      note: note,
      run: run,
      freshForm: freshForm,
      canManage: canManage,
      selected: function () {
        return selected;
      },
      actor: function () {
        return actor;
      },
      openOperation: editOperation,
      openRoute: openRoute,
      captureRoute: captureRoute,
      routeDraft: function () {
        return routeDraft;
      },
      replaceRouteDraft: function (v) {
        routeDraft = v;
      },
      routeProduct: function () {
        return routeProduct;
      }
    },
    orderEntry: orderEntry,
    show: show,
    validateStores: M.validateStores,
    data: data,
    availability: function (code) {
      var s = data();
      return { reserved: M.round(M.stock(s, code) - M.free(s, code)), free: M.free(s, code) };
    }
  };
})(window);
