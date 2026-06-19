# Customento CRM — Claude 开发记忆文件

## 项目基本信息
- 当前文件：crm-v5_final_5.html
- 技术架构：纯 HTML + JS，localStorage 存储
- Storage key：crm_inq_v5 / crm_cust_v5 / crm_ord_v5 / crm_sale_v5 / crm_settings_v5 / crm_prod_v5 / crm_prodcat_v5
- 未来部署：crm.customento.com（Hostinger + Supabase）
- 嵌入方式：钉钉 H5 微应用

## 测试环境
- GitHub Pages：https://alanhou83.github.io/CRM-customento/crm-v5_final_5.html
- 仓库：https://github.com/alanhou83/CRM-customento
- PWA 已配置：manifest.json / service-worker.js / icon-192.png / icon-512.png
- 当前 SW 版本：customento-crm-v30

## 团队成员与权限
- Alan：管理员，可见所有，可删除/导出/VIP+冲单标记，专属设置页
- Kelly：销售经理，可见所有，可删除（询盘/客户/订单），**可标记询盘VIP**
- Momi：Alibaba 负责
- Mille：1688 负责
- Penny：运营，主用产品开发/采购/财务模块
- **删除权限**：`canDelete()` 返回 Alan 或 Kelly
- **询盘VIP权限**：`canInqVip()` 返回 Alan 或 Kelly（客户VIP/冲单仍 Alan 专属）
- **冲单权限**：`canVip()` 返回 Alan（客户冲单 + 询盘冲单 targetStar 均 Alan 专属）
- **成本可见权限**：`canSeeCost()` 返回 Alan 或 Penny（BOM 成本信息）

## 角色导航设计（手机底部导航）
- `NAV_CONFIG` 对象定义各角色底部导航（最多5项）：
  - Alan：看板/询盘/客户/订单/全部（全部=overlay菜单）
  - Kelly/Momi/Mille：看板/询盘/客户/订单/统计
  - Penny：看板/订单/产品/采购/供应商
- `renderMobileNav()`：登录后动态渲染底部导航，`switchUser()` 时调用
- `mobileNav('all')`：Alan 点"全部"时展开 `all-modules-overlay` 全屏模块菜单
- `showAllModules()` / `closeAllModules()`：控制全部模块 overlay 显隐
- `closeSettingsPage()`：关闭设置页后跳回当前角色首页（取 NAV_CONFIG 第一项）
- 电脑端：左侧导航用 `nav-sales-section`（询盘/客户/统计，Penny隐藏）和 `nav-ops-section`（产品/采购/供应商/财务，Alan+Penny可见）

## 已完成功能
- 6个核心模块：数据看板 / 热点商机 / 询盘列表 / 客户管理 / 销售统计 / 执行中订单
- **产品开发模块**（crm_prod_v5）：项目跟踪 / 款式管理 / BOM成本（Alan+Penny可见）
- **产品库模块**（crm_prodcat_v5）：4种类型/SKU/多维标签/双语/定价权限/BOM引用行
- **报价单模块**（crm_quote_v5）：新建/编辑/详情/预览/打印/询盘客户Tab集成
- **采购跟单模块**（crm_proc_v5）：采购单/阶段跟踪/入库确认
- **供应商管理模块**（crm_proc_v5 suppliers数组）：独立页面，详情面板含2Tab（供应商档案/采购历史）
- 角色导航：NAV_CONFIG 定义各角色底部导航，手机端动态渲染
- 询盘列表：标记列（VIP绿/热点橙/超时红/🎯冲单）独立一列
- 客户管理：5层分层（核心/重点培养/普通跟踪/沉睡/流失）+ 卡片/列表双视图 + 分批展开
- 客户详情面板三Tab：客户档案 / 跟进记录（底部固定录入栏）/ 成交统计
- 快速标签点击直接保存
- 🎯冲单标签：客户冲单（Alan专属）/ 询盘冲单 targetStar（Alan专属）
- ⭐VIP：客户VIP（Alan专属）/ 询盘VIP（Alan+Kelly）
- 跟进录入框固定底部
- 客户列表视图：公司+产品合并一格（1fr撑满），左侧彩色竖线分层，跟进待办列（过期变红）
- 产品多选标签（getProd/getProdArr 兼容旧字符串数据）
- 管理员设置页（Alan专属，自定义产品种类，存 crm_settings_v5，动态同步所有产品选项）
- 管理员设置页：数据备份导出/导入 JSON 功能
- 销售统计：$ 和 ¥ 分开统计
- 手机端：独立 header 筛选 + 底部导航（角色定制）
- 手机端：Alan 登录时 header 右上角显示 ⚙️ 设置入口
- 手机端紧凑列表满屏显示，可滚动
- PWA 支持：可安装到手机/桌面，离线缓存
- 社媒联系方式（WhatsApp/Facebook/Instagram/Telegram）加入客户档案，品牌SVG图标，点击跳转App；微信/旺旺加复制按钮

## 产品开发模块关键设计（crm_prod_v5）

### 数据结构
- 存储：`localStorage.getItem('crm_prod_v5')`，key=`SK.prod`
- 项目字段：id / name / stage / person / startDate / note / skus[] / followups[]
- SKU字段：id / name / spec / cost / price / note / bom[]（BOM仅 Alan/Penny 可见）
- BOM行字段：material / qty / unit / unitCost / totalCost

### 阶段与颜色（PROD_STAGES / PROD_STAGE_COLORS）
- 初步调研=灰 / 设计开发=蓝 / 打样中=紫 / 样品确认=黄 / 量产准备=橙 / 已完成=绿 / 搁置=红
- `getProdStageStyle(stage)` 返回 inline CSS 字符串

### 桌面列表（table-header cols-prod）
- 7列：缩略图(52px) / 项目名称(1fr) / 阶段(110px) / 负责人(70px) / 款式数(55px) / 开始日期(88px) / 最后跟进(150px)
- CSS：`.cols-prod{display:grid;grid-template-columns:52px 1fr 110px 70px 55px 88px 150px;}`
- 缩略图：`prod-thumb-<id>` 异步从 IndexedDB 加载，`_setProdThumb(pid,dataUrl)` 更新

### 项目图片（3张，IndexedDB）
- key 格式：`'prod_'+projId+'_0'` / `'prod_'+projId+'_1'` / `'prod_'+projId+'_2'`
- 复用现有 `saveImgToDB` / `getImgFromDB` / `deleteImgFromDB`
- IndexedDB：`customento-img-v1`，object store：`imgs`
- 详情面板图片区：3个 `.prod-img-slot`，点击触发 `uploadProdImg(projId,idx)`
- `loadProdImagesIntoDetail(projId)`：异步加载3张图到详情面板
- `uploadProdImg(projId,idx)`：文件选择 → 压缩至800px JPEG → 存 IndexedDB → 刷新
- `deleteProdImg(projId,idx)`：删除并刷新槽位显示

### 详情面板（openProdDetail）
- 2 Tab：项目详情 / 跟进记录（同询盘/订单模式）
- Tab1：图片区(3槽) + 阶段快捷切换 + 项目信息 + SKU列表（含BOM，canSeeCost()控制）
- Tab2：待办输入 + 跟进录入 + 历史列表
- currentDetailType='prod'，editCurrent() 分支已支持 prod
- `quickProdStage(projId,stage)`：切换阶段后刷新详情面板
- `addProdFollowup(projId)`：添加跟进，刷新 openProdDetail(projId)+switchDpTab('followup')

### 筛选与排序
- 电脑端：搜索框(search-prod) + 阶段下拉(fp-stage) + 负责人下拉(fp-person) + 清除
- 手机端芯片：初步调研/设计开发/打样中/样品确认/量产准备/已完成/搁置 + 排序按钮
- `prodChipFilter(el,stage)`：手机端芯片筛选
- `setProdMobileSort(key)`：3态排序（日期/名称）
- `clearFilters_prod()`：清除所有筛选

### SKU与BOM Modal
- `openSkuModal(projId,skuId)`：新建/编辑 SKU
- BOM区域仅 `canSeeCost()` 时显示（Alan/Penny）
- `renderBomRows(bom)`：渲染BOM行（可编辑 input）
- `addBomRow()`：收集当前DOM BOM，添加空行，重渲染
- `removeBomRow(btn)`：从DOM移除BOM行
- `collectBomFromDOM()`：读取DOM BOM数据
- `saveSkuRecord()`：保存SKU（含BOM）

### 示例数据（DEF_PROD，5个项目）
- 迷你音乐盒（打样中，2SKU含BOM）
- 软木杯垫新款（样品确认，1SKU含BOM）
- MDF激光冰箱贴（量产准备，3SKU含BOM）
- 马克杯北欧简约（设计开发，2SKU无BOM）
- 帆布环保袋（初步调研，0SKU）

### 集成点
- `SK.prod='crm_prod_v5'`
- `showPage('proddev')`：调 renderProdDev() + renderMobileCards('prod')
- `refreshAll()`：proddev 页时调 renderProdDev()
- `renderMobileCards('prod')`：调 renderMobileCards_prod()
- `editCurrent()`：prod 类型 → openProdModal(_id)
- `setMobileHeader('proddev')`：对应 mh-prod 手机 header

## 询盘状态设计（V2 重构后）
- **4个Tab**：活跃（非沉默中）/ 沉默 / 成单（archived）/ 失效（expired）
- **6个动态状态**：新询盘 / 互动中 / 报价中 / 打样中 / 追单中 / 沉默中
- **里程碑标记 flags[]**：已报价（黄）/ 已打样（紫），可叠加，独立于状态
- **旧数据迁移**：`migrateInqStatuses()` 一次性迁移，已归档/失效的跳过
- SC map 含新旧状态名兼容（已回复→互动中 等）
- 沉默中：切换时记录 `silentSince` 日期，≥7天在沉默Tab显示警告
- 询盘列表4个Tab计数：`updateInqTabCounts()`（活跃/沉默/成单/失效）
- 手机端Tab计数 id：`minq-tab-active/silent/archive/expired`

## 询盘详情面板设计（V2）
- **3个Tab**：询盘详情 / 跟进记录 / 报价单
- Tab标签：`dp-tab-profile`="询盘详情"，`dp-tab-sales` 隐藏（客户详情时恢复"客户档案"+显示销售Tab），`dp-tab-quote`="报价单（N）"
- 报价单Tab：显示该询盘关联的报价单列表 + 新建报价单按钮，计数显示在Tab标签括号内
- 状态区第一行：6个动态状态按钮
- 状态区第二行：已报价标记 / 已打样标记 / 已成单（action）/ 失效（action）
- 无"快速更新状态"标题行
- 待办显示在询盘详情Tab内（followupDate + followupNote）
- `saveInqTodo(inqId)` / `clearInqTodoDate(inqId)` 处理待办保存/清除
- 跟进记录Tab：顶部待办日期+内容输入 → 保存到 followupDate/followupNote；下方跟进记录列表

## 询盘列表规范（V2）
- **列定义**（10列）：缩略图 / 日期 / 客户 / 标记 / 渠道 / 产品 / 评级 / 状态 / 待办 / 负责人
- `.cols-inq{grid-template-columns:46px 80px 1fr 90px 90px 100px 55px 100px 150px 65px;}`
- `.cols-hot` 与 `.cols-inq` 完全相同
- 无"操作"列，点行进详情
- 表头排序：日期/客户/待办（`setInqSort`，3态，id=`thi-date-arr`等）
- 手机端排序：日期/客户/待办（`setInqMobileSort`，id=`inq-sort-date`等）
- 排序状态变量：`inqTableSort={key:'date',dir:'desc'}` / `inqMobileSort={key:null,dir:'desc'}`
- 排序优先级：手机端 key≠null 时优先用移动排序，否则用桌面排序

## 询盘芯片快捷筛选
### 电脑端（询盘筛选栏"清除"按钮右侧）
- `<button id="btn-inq-vip">⭐ VIP</button>`（alan 键）
- `<button id="btn-inq-chong">🎯 冲单</button>`（chong 键）
- `<button id="btn-inq-hot">🔥 热点</button>`（hot 键）
- `<button id="btn-inq-ov">⚠️ 超时</button>`（overdue 键）
- CSS激活色：VIP=金色(vip-on) / 冲单=橙色(chong-on) / 热点=橙红(hot-on) / 超时=红色(ov-on)

### 手机端
- **第一行芯片**：全部/Alibaba/1688/笨鸟/🔥A级/⚠️超时/🎯冲单（id=`mb-inq-chip-chong`）
- **第二行下拉**：状态/评级/跟单/渠道 + **⭐VIP**（id=`mb-inq-chip-vip`）
- 🎯冲单 在第一行末尾，使用 `toggleInqFilter('chong')` 独立切换（非 mobileChip 全重置逻辑）
- ⭐VIP 在第二行末尾，使用 `toggleInqFilter('alan')` 独立切换

### 筛选逻辑函数
- `currentInqFilter`：对象，键 alan/chong/hot/overdue/source/grade/today
- `toggleInqFilter(key)`：切换单个键，调 `updateInqFilterUI()` + `refreshInqActive()`
- `updateInqFilterUI()`：同步电脑端4个芯片按钮 + 手机端2个芯片高亮状态
- `mobileChip()` 末尾调 `updateInqFilterUI()`：第一行芯片点击时清除VIP/冲单高亮
- `clearFilters('inq')` 调 `updateInqFilterUI()`：清除按钮同步芯片高亮

## 询盘手机端筛选（V2）
- **第一行芯片**：全部/Alibaba/1688/笨鸟/🔥A级/⚠️超时/🎯冲单（`mobileChip` 或 `toggleInqFilter`）
- **第二行下拉**：状态(`mb-inq-status`) / 评级(`mb-inq-grade`) / 跟单(`mb-inq-person`) / 渠道(`mb-inq-source`) / ⭐VIP
- **搜索框**：`id="search-inq-m"`，接入 `getFilteredInq()`
- 点击第一行普通芯片时自动重置4个下拉+VIP/冲单芯片（via updateInqFilterUI）
- `getFilteredInq()` 同时读取桌面筛选和手机下拉筛选

## 手机端询盘卡片布局（V2）
- **名字行**（flex布局，align-items:center）：客户名 + ⭐ + 🔥 + 🎯（22px，排最后最大）
- **第二行**：备注 / 公司·国家
- **第三行**（标签行）：渠道 + 状态 + flags（已报价/已打样）
- **第四行**：最后跟进记录
- **右侧列**（flex-direction:column，align-items:flex-end）：产品+日期+评级 / **超时** 超时 Momi（超时在人名左侧同行）/ 待办日期 / 待办备注
- 超时用红色左边框 `border-left:3px solid var(--yellow)`

## 超时判定逻辑
- `isOverdue(i)`：状态非"已成单/未成单" 且 最后跟进距今 **≥5天** → 超时
- 基准：最后一条跟进记录日期，无跟进则用询盘创建日期

## 客户管理卡片视图（V2 重构后）
- **5个分层Tab**：核心/重点培养/普通跟踪/沉睡/流失（`switchCustCardLayer(layer)`）
- Tab计数：显示各层总数，含超时⚠数量角标
- **超时判定阈值（`OVERDUE_DAYS`）**：核心20天/重点30天/普通50天/沉睡90天/流失180天
- 超时客户：红色边框 `cust-overdue`，优先级高于 VIP 绿色边框
- VIP客户：绿色边框 `vip-star`（rgba(62,207,142,.45)）
- **动态评分 `custScoreEff(c)`**：7分制（成单1+复购1+增长1+画像1+活跃1+体量0-2）
- **动态增长**：`effectiveGrowing(c)` = growing 且 90天内有成交记录（自动关闭）
- **动态活跃**：`effectiveActiveScore(c)` = activeScore 且未超时（自动关闭）
- 状态图标：✅成单 / 🔄复购 / 📈增长（动态）/ 💬活跃（动态）/ 🏅️画像匹配（c.match==1）
- 🎯冲单图标（`c.targetStar`）：右上角大图标（font-size:28px）
- 排序：`custLayerSort[layer]`，默认按 score 降序
- 筛选栏芯片：⭐VIP / 🎯冲单 / 🔴超时（`btn-cust-vip/chong/ov`）

## 执行中订单模块关键设计
- 电脑端表头排序：日期/客户/金额/交期（`setOrdSort`，3态）
- 手机端排序：日期/客户/产品/金额/交期（`setOrdMobileSort`，3态）
- 阶段颜色：等待打样=灰 / 打样中=紫(#b36bfa) / 客户确认样品=黄 / 生产中=蓝 / 待发货=橙 / 已发货=绿
- `getOrdStageStyle(stage)` 返回 inline CSS
- `ordChipFilter(el,stage)` 手机端芯片筛选，含超时筛选
- 超时标记：`o.delivery && o.delivery < today()` → 红色边框 + ⚠️图标
- mh-ord：`margin-bottom:-6px`；chips：`padding-bottom:6px`；搜索栏全宽 border-top 风格

### 订单详情面板（openOrderDetail）
- **2 Tab 结构**：订单详情 / 跟进记录（同询盘/客户面板模式）
- **Tab1 订单详情**：阶段快速切换 → 订单信息区 → 编辑/标记完成按钮
  - 阶段切换到"已发货"：阶段按钮下方常驻黄色提示条（📦 已发货 — 点下方「✓ 标记完成」...）
  - 预计交期：超时 → `⚠️ 日期`（红色）；未超时 → `📦 日期`（灰色）
  - 待办行（followupDate+followupNote 均存在时显示）：超时 → `🔔 日期 📌 内容`（红色）；正常 → `📅 日期 📌 内容`（绿色）
  - 标记完成按钮：`btn-danger`（红色），onclick = `completeOrder(id);closeDetail()` ⚠️ closeDetail() 必须保留，否则 iOS PWA 全屏面板的 overflow-y:auto 会拦截 confirm-overlay 的 touch 事件
- **Tab2 跟进记录**：待办输入（date+note）+ 跟进内容输入 + 历史列表
- `saveOrdTodo(ordId)`：保存后调 `openOrderDetail(ordId);switchDpTab('followup')` 刷新面板
- `clearOrdTodoDate(ordId)`：同上刷新模式
- `quickOrdStage(ordId,stage)`：切换阶段后调 `openOrderDetail(ordId)` 刷新

### 手机端订单卡片三行布局
- **第1行**：`alias [阶段] 超时 注：备注`（flex 换行，备注蓝色 var(--accent2)）
- **第2行**：`产品 · 最后跟进记录`（getLastFollowupStr，灰色，单行省略）
- **第3行**：`📅/🔔 日期 📌 内容`（todoOvd → 红色；否则 date=灰色 note=绿色）
- 超时交期：红色左边框 + 右列 ⚠️ 红色日期

## 手机端搜索栏统一规范
所有页面（询盘/客户/销售统计/执行订单/产品开发）搜索栏样式一致：
- mh-xxx 容器：`margin-bottom:-6px`
- chips 行：`padding-bottom:6px`（无 margin-bottom）
- 搜索栏容器：`display:flex;width:calc(100%+30px);margin-left:-15px;margin-right:-15px;padding:5px 8px 5px 12px;border-top:1px solid var(--border);background:var(--surface2);box-sizing:border-box`
- 排序按钮中性态统一用 `↓`（低透明度 opacity:.4），不用 `↕`（手机会渲染成表情符号）

## 排序逻辑规范（电脑端+手机端）
- **3态循环**：↓（降序）→ ↑（升序）→ 取消（key=null）→ 再点回↓
- **中性态显示**：文字+`↓`，`opacity:.4`，不加 active class（不用 ↕ 符号）
- **激活态**：`opacity:1`，加 active class，升序时显示 `↑`
- **实现函数**：setOrdSort / setOrdMobileSort / setCustSort / setStatsSort / setProdMobileSort（逻辑完全一致）
- 中性态（key=null）时按默认排序（通常按日期降序）

## 页面结构规范（所有列表页统一）
- `page.page-head` → `div.page-content`（padding:18px 28px 28px）→ `div.filters` → `div.table-wrap` → `div.table-scroll` → `div.table-inner` → `div.table-header` + body div
- 搜索框用 `class="search-box"`（对应 CSS `.filter-select,.search-box{...}`），不能用 `filter-input`（CSS 中不存在）
- 手机端卡片容器：`<div id="mobile-xxx-cards" class="mobile-cards">`

## 客户管理成交统计 Tab 设计
- 成交概览压缩在标题行右侧：`次数 · $总额 · ¥总额`（0值不显示）
- 记录列表：左列`日期·备注`+`产品`，右列`金额`+`负责人`，无行内按钮
- 点击整行 → `editSaleRecord(id)` 直接进编辑 modal
- 编辑 modal 左下角有删除按钮（2次确认）+ 退回执行中按钮（有 fromOrderId 才显示）
- `sale-delete-area`：编辑时填充，新建时清空

## 销售统计模块关键设计
- 点击列表行 → `openSaleDetail(id)`，currentDetailType='sale'
- 详情面板头部"编辑"→ `editCurrent()` → `editSaleRecord(id)`
- 详情面板内编辑按钮 → `editSaleFromDetail(id)`（先closeDetail再openModal）
- `editCurrent()` 已支持：inquiry / customer / order / sale / prod
- 产品字段：多选芯片 `fs-product-chips`，逗号分隔存储，`getSaleProductSelected()` 读取
- `saveSaleRecord()`：编辑分支用 `sid=editingSaleId` 保存后直接 `openSaleDetail(sid)`
- 订单完成 `doCompleteOrder(id)`：存 `fromOrderId` 字段，sales detail 有"退回执行中"按钮
- `completeOrder(id)` 先弹二次确认，确认后才调 `doCompleteOrder`

## 客户分层逻辑
- 5层：核心 / 重点培养 / 普通跟踪 / 沉睡 / 流失
- 分层图标：🏆核心 / 🌳重点培养 / 🔄普通跟踪 / 💤沉睡 / ☠️流失
- 系统自动建议分层（基于成单/复购/评分）
- 手动可覆盖，保存后固定
- 录入成交记录自动更新标签（成单/复购/增长/活跃）

## 布局规范
- detail-body padding=0
- 询盘详情/订单/产品开发：**不用** detail-body-inner，直接用 dp-tab-content.active 的 padding:20px
- 客户详情 Tab 用 dp-tab-content.active 的 padding:20px
- 询盘详情 Tab1/Tab2 内容都直接在 dp-tab-content 内，无需额外包裹层

## 品牌规范
- 主色：#2D3172（深海军蓝）
- 强调色：#6B72C3（紫色）
- 浅紫：#8B91D4
- 背景：#F0F2F8
- Logo：定位针图标 + CUSTOMENTO 文字
- PWA 图标：深蓝背景 + 定位针 + CRM 文字 + CUSTOMENTO 小字

## ⚠️ 最高优先级原则（覆盖其他所有规则）

**原则A：SW 采用 HTML 网络优先策略，绝对不能改回缓存优先**
- service-worker.js 已将 HTML 文件设为 network-first（每次请求先取网络，离线才回退缓存）
- 这是解决浏览器刷新/PWA重开看不到更新的根本方案
- 绝对不能把 HTML 的 fetch 策略改回 `caches.match → fetch` 的缓存优先写法
- 静态资源（图片/manifest）仍可保持缓存优先

**原则B：用户看不到更新时，bump CACHE_NAME 强制清缓存**
- 正常情况浏览器普通刷新即可看到更新（HTML 网络优先）
- 若用户反映看不到更新，先让用户强制刷新；若无效则 bump CACHE_NAME（v27→v28→v29...）
- bump 后用户关闭重开 PWA 即可生效

## 必须遵守的规避规则（代码）
1. JS 里绝对不能用模板字符串，必须用字符串拼接，否则引号嵌套会导致整个脚本崩溃
2. 每次修改客户管理 HTML 后必须检查 cust-list-view 的 </div> 是否正确闭合，否则后续页面被隐藏
3. setCustView() 里所有 getElementById 必须加 null 检查（if(el)）
4. showPage() 里 getElementById 必须加 null 检查
5. 手机端 cust-card-view 和 cust-list-view 必须 CSS 强制 display:none !important
6. renderMobileCards 里 var html='' 必须在 if 判断之前声明
7. 手机端媒体查询必须覆盖：html,body{overflow:auto} / .app{overflow:visible;height:auto} / .main{overflow:visible} / .page-content{padding:0;overflow:visible}
8. editCurrent() 必须先保存 id 再 closeDetail()，否则 id 被清空
   ⚠️ 新增 detail type 时必须同步在 editCurrent() 加对应分支，否则头部编辑按钮点了只关面板不开modal
   当前已有：inquiry / customer / order / sale / prod / quote / proc / supplier / prodcat（缺任何一个就会出现"点编辑就退出"的症状）
9. str_replace 定位锚点用完后必须确认原内容完整保留（曾发生 refreshAll 函数被误删导致全站崩溃）
10. 每次改完 JS 必须用 node --check 语法检查再给文件
11. 手机端排序按钮中性态绝对不能用 ↕ 符号（iOS 会渲染成表情图标），统一用 ↓ + opacity:.4
12. 新增/编辑 modal 有 delete-area 时，新建入口必须清空 innerHTML，否则新建时会显示旧的删除按钮
13. iOS Safari input[type=date] 日期选择器：已证实无效的方案（不要重复尝试）：
    - opacity:0 / opacity:0.01 覆盖层：iOS 浏览器模式不触发
    - overflow:hidden 父容器：会阻断 iOS 所有 touch 事件，绝对不能用
    - showPicker()：PWA 可用，iOS 浏览器模式不可靠
14. 手机端卡片名字行有大小不一的 span 时必须用 flex + align-items:center，不能用 vertical-align（会导致行高撑大、文字错位）
15. toggleInqFilter 类芯片（独立切换）不能放进 mobileChip 同一个 .mobile-chips 容器，否则 querySelectorAll 会误清除高亮；或用不同 class 区分
16. openProdModal 等 modal 函数中，if/else 两个分支共用同一 DOM 变量时，var 声明必须提到 if 之前（否则重复 var 声明可能导致逻辑错误），如 `var pmTitle=document.getElementById('prod-modal-title')` 提到 if 判断前

## 必须遵守的规避规则（部署）
- 当前行为：浏览器普通刷新即可看到更新；PWA 关闭重开即可，无需删除重装
- 若看不到更新：bump CACHE_NAME 强制清缓存（已到 v30）

## 工作规范
- 所有改动代码必须先说方案，等确认后再执行
- 给出完整可替换的代码块，不给片段
- 修改前说明改了什么、为什么
- 回复用中文，代码注释用中文
- 同一对话内累积所有改动，不需要每次下载上传
- 说"给我最终文件"时才输出最终版本
- 每次新对话开始前确认项目文件已是最新版本

## 产品库模块关键设计（crm_prodcat_v5）

### 业务分类（type字段，4种）
- `raw` = 原材料（大板/墨水/纸张/包装耗材等，有库存，可直销）
- `blank` = 空白产品（加工后的空白品，有库存，可直销，有BOM）
- `custom` = 定制品（客户设计，不留库存，有BOM，用于报价模板）
- `service` = 加工服务（激光切割/UV/DTF/热转印等，按件/批计价）

### 新建产品 vs 新增SKU 判断原则
**同一产品下加SKU：** 同类产品、不同规格/厂家，功能上可替代
  - 例：热转印纸A4，118g 1号厂家 → SKU-A；125g 2号厂家 → SKU-B（同一产品PAP-001）
  - 例：11oz白杯，裸装36个 → SKU-A；带盒36个 → SKU-B（同一产品MUG-001）
**新建产品：** 形态/功能完全不同，或尺寸差异大（如A4纸 vs A3纸），或品牌差异大定价完全不同

### SKU编码规则
- 格式：`[类目前缀]-[流水号]-[变体字母]`（如 MUG-001-A）
- 前缀只管功能大类（10-15个），不编材质/尺寸/颜色（这些是属性字段）
- 类目前缀（Alan设置页可管理）：MUG/CTR/BAG/MGN/TEE/TIL/BRD/PKG/INK/PAP/SVC/MBX

### 多维标签体系（均可在设置页管理）
- `categoryCode`：类目前缀（MUG/CTR...）
- `materials[]`：材质标签多选（陶瓷/软木/MDF/布艺/亚克力...）
- `processes[]`：工艺标签多选（热转印/UV直打/DTF/激光切割...）
- `formTag`：形态单选（杯子/杯垫/冰箱贴/T恤...）

### 双语字段规则
- 产品级：`nameCN`/`nameEN` + `descCN`/`descEN`
- SKU级：`variantCN`/`variantEN`（变体描述，如"白色·裸装·36个/箱" / "White·Bulk·36pcs/ctn"）
- 报价给外国客户用英文，中国客户用中文，内部显示中文

### SKU字段（含权限控制）
- 变体：skuCode/variantCN/variantEN/color/size/shape/packType/qtyPerCarton/unitWeight
- 箱规：ctnL/ctnW/ctnH(cm)/ctnWeight(kg)
- 定价：`costPrice`（Alan+Penny）/ `priceMin`/`priceMax`（所有人）/ `floorPrice`（Alan+Penny+Kelly）/ currency
- 库存：stockQty/stockUnit/safetyStock（hasStock=true时启用）
- **`supplier`（供应商，仅内部可见，不进报价/规格描述）**
- BOM：`bom[]`（定制品专用，引用行type=ref + 估算行type=text）

### BOM设计（定制品）
- 引用行（type=ref）：指向产品库其他SKU，自动带入成本价，skuCode/nameCN/qty/unit/unitCost/currency
- 估算行（type=text）：消耗品（墨水/纸张等），自由填写，qty/unit/unitCost/currency
- 总成本自动合计（CNY和USD分开）
- BOM仅 canSeeCost()（Alan/Penny）可见

### 图片（IndexedDB）
- 产品级图片：key = `pcat_<prodId>_0/1/2`（3张）
- SKU级图片：暂不单独存（可用产品级图片区分）

### 库存变动类型（结构预留，采购模块联动后激活）
1. 采购入库 2. 销售出库 3. 生产领料出库 4. 损坏补领 5. 盘点调整 6. 样品出库

### 集成点
- `SK.prodcat='crm_prodcat_v5'`
- `showPage('prodcat')` → `setPcatView(pcatView)`
- `refreshAll()` → prodcat页时调 `setPcatView(pcatView)`
- `editCurrent()` 已支持 prodcat 类型
- 设置页新增：类目/材质/工艺/形态标签管理（Alan专属）

### 示例数据（DEF_PRODCAT，9个产品）
- 原材料3：热转印纸A4(PAP-001) / 马克杯礼盒(PKG-001) / 马克杯外箱36装(PKG-002)
- 空白产品3：11oz白杯(MUG-001,2SKU) / 软木杯垫(CTR-001) / 帆布袋(BAG-001)
- 定制品2：印图马克杯(MUG-D001,含BOM) / 印图杯垫(CTR-D001,含BOM)
- 加工服务2：热转印服务(SVC-001,2个价格档) / UV直打(SVC-002)

## 供应商管理模块关键设计

### 架构
- 独立页面 `page-suppliers`（不放在采购Tab内），与客户管理同级
- 数据存储：`crm_proc_v5` 的 `suppliers` 数组（与采购单共用同一存储 key）
- Penny 手机底部导航第3项为库存，第5项为供应商

### 供应商列表（cols-suppliers）
- 6列：供应商名(1fr) / 联系人(80px) / 主营产品(1fr) / 货币(60px) / 付款条件(120px) / 进行中PO(80px)
- CSS：`.cols-suppliers{display:grid;grid-template-columns:1fr 80px 1fr 60px 120px 80px;}`
- `renderSuppliersPage()` 渲染列表

### 供应商详情面板（openSupplierDetail）
- `currentDetailType='supplier'`
- **2 Tab**：供应商档案 / 采购历史
  - Tab1：联系信息（电话/微信/邮件）+ 主营产品/货币/付款条件/备注 + 新建采购单按钮
  - Tab2（复用 dp-tab-followup，textContent改'采购历史'）：该供应商的全部PO列表，每项显示 PO号+阶段+产品明细(品名/数量/单价)+日期/负责人/合计金额
- 从供应商详情进入 `openProcDetail` 时，用 `_prevDetailContext` 保存来源，X退出后回到供应商采购历史Tab

### 集成点
- `showPage('suppliers')` → `renderSuppliersPage()`
- `editCurrent()` 支持 supplier → `openSupplierModal(id)`
- `createProcFromSupplier(supplierId)` → `openProcModal('')` 并预选供应商

## 库存管理模块关键设计（crm_inv_v5）

### 核心原则
- 所有库存变动 = 显式流水记录，不自动触发，不可删除
- 只有 Alan 和 Penny 可确认库存变动（`canInvControl()`）
- 当前库存 = 该 SKU 所有流水 qty 之和（正=入库，负=出库）
- 数据只来自 prodcat 中 `hasStock=true` 的 SKU（原材料+空白产品）

### 存储与数据结构
- `SK.inv='crm_inv_v5'`，`getInvData()` / `saveInvData(d)`
- 流水记录字段：`id / date / skuCode / nameCN / unit / movementType / qty / sourceType / sourceId / person / note`
- movementType：采购入库 / 销售出库 / 手工入库 / 样品出库 / 生产领料出库 / 损坏报废 / 盘点调整

### 页面（page-inventory）
- 台账视图：8列（SKU编码/品名/规格/单位/现有库存/安全库存/状态/最近变动）
- `.cols-inv{grid-template-columns:100px 1fr 120px 60px 80px 80px 70px 120px;}`
- 状态：充足(绿) / 预警(qty≤safetyStock,黄) / 缺货(qty≤0,红)
- 筛选：搜索框 + 状态下拉 + 手机端芯片（全部/缺货/预警/充足）

### 详情面板（openInvDetail）
- `currentDetailType='inv'`，`currentDetailId=skuCode`
- Tab1 库存详情：库存数量/安全库存/状态 + 快速手工录入按钮（Penny/Alan）
- Tab2 流水记录：所有该SKU流水，按日期降序

### 4个Modal
- `inv-adj-modal`：手工录入（手工入库/样品出库/生产领料出库/损坏报废），SKU模糊搜索
- `inv-inbound-modal`：采购入库单确认，从 PO「已到货」进入，填实际到货数量，打印/确认后 PO 变「已入库」
- `inv-outbound-modal`：销售出库单确认，从订单「待发货/已发货」进入，打印/确认后扣减库存
- `stocktake-modal`：盘库对账，展示系统库存 vs 实盘，差异生成「盘点调整」流水

### 打印单据（printInvDoc）
- `printInvDoc('inbound')`：打开新窗口打印入库单（PO号/供应商/明细/签收栏）
- `printInvDoc('outbound')`：打开新窗口打印出库单（客户/明细/发货人签字栏）

### 集成点
- PO 详情「已到货」状态：只有 Penny/Alan 看到「生成入库单」按钮，其他人看到提示
- 订单详情「待发货/已发货」状态：只有 Penny/Alan 看到「生成出库单」按钮
- `showPage('inventory')` → `renderInventoryPage()` + `renderMobileCards('inv')`
- `clearFilters('inv')`：清除库存筛选
- Penny 手机底部导航第3项：库存（替代产品）

### 关键函数
- `canInvControl()`：返回 Penny 或 Alan
- `getCurrentStock(skuCode)`：计算当前库存
- `getStockedSkus()`：从 prodcat 获取 hasStock=true 的 SKU 列表
- `getPcatForInv()`：读取 prodcat localStorage 数据
- `invChipFilter(el,status)`：手机端芯片筛选
- `updateStDiff(el,sysQty)`：盘库对账实时显示差异

## 当前进度（最近完成）
- **库存管理模块**（crm_inv_v5）：完整实现，含台账/流水/入库单/出库单/盘库对账/打印
- **角色导航**：NAV_CONFIG 定义各角色底部导航，renderMobileNav() 动态渲染，Alan 有"全部"overlay
- **产品开发模块**（crm_prod_v5）：完整实现，含项目列表/详情面板/SKU/BOM/3张图片/跟进记录/示例数据
- **产品库模块**（crm_prodcat_v5）：完整实现，4种类型/SKU/多维标签/BOM/图片
- **报价单模块**（crm_quote_v5）：新建/编辑/详情/预览/打印/CN+EN双语
- **采购跟单模块**：采购单CRUD/阶段跟踪/入库确认/从订单下推/关联订单
- **供应商管理模块**：独立页面 page-suppliers，详情含供应商档案+采购历史2Tab
- **询盘报价单Tab**：询盘详情新增第3个Tab显示关联报价单列表（含数量角标）
- **_prevDetailContext**：报价单/采购单详情X退出后回到父面板对应Tab
- **关联字段模糊搜索**：采购单「关联销售订单」/订单「关联采购单」均支持实时下拉搜索
- SW 升至 v30（强制清缓存）
- 询盘 targetStar 字段（Alan专属冲单标记），canInqVip() 含 Kelly
- `toast(msg, dur)` 新增可选时长参数（默认 2500ms）

## 询盘图片上传与裁切设计
- 图片存储：IndexedDB（`crm_inq_images` 库，key=inqId，value=base64 dataUrl），不用 localStorage
- `saveImgToDB(id,dataUrl,cb)` / `getImgFromDB(id,cb)` / `deleteImgFromDB(id)`
- 裁切 modal id：`crop-modal`，用 `.modal-overlay` + `.open` class 控制显隐（**不能用 display:none/flex**）
- 裁切状态对象：`_cropState`（img/offsetX/offsetY/dragging/zoomFactor/pinchDist 等）
- Zoom 控件：`#crop-zoom` range slider（0.5~4）+ `#crop-zoom-label` 显示倍率
- 自由拖拽：mouse/touch 事件，**无边界限制**（`clampOffset` 为空函数）
- 双指缩放：`touchstart` 记录 `pinchDist`，`touchmove` 计算新距离更新 `zoomFactor`
- 滚轮缩放：`wheel` 事件，`deltaY<0` 放大，反之缩小，范围 0.5~4
- 输出：400×400 白色背景 canvas，坐标映射公式：`imgX=offsetX-cx; scale=400/cropSize`
- 缩略图显示：`.inq-list-thumb`（36×36 border-radius:6px）+ `.inq-list-thumb-ph`（占位符📷）
- 编辑询盘时重置图片预览 + 从 IndexedDB 异步加载当前询盘的图片
- `_pendingInqImg`：暂存待保存的裁切结果 dataUrl，保存询盘时写入 DB

## 详情面板导航机制（_prevDetailContext）
- `var _prevDetailContext=null;`：全局变量，记录进入子详情前的父面板状态
- 场景：从询盘/客户的报价单Tab → 进入报价单详情；从供应商详情 → 进入采购单详情
- 保存时机：在 `openQuoteDetail` / `openProcDetail` 顶部，若 `currentDetailType` 是父类型则保存 `{type, id, tab}`
- ⚠️ 刷新时不能覆盖：`openQuoteDetail` 内部刷新（`currentDetailType==='quote'`）时必须用 `else if` 跳过清除，否则 `_prevDetailContext` 丢失
- `closeDetail()` 优先检查 `_prevDetailContext`：若存在则恢复父面板（`openXxxDetail(ctx.id)` + `switchDpTab(ctx.tab)`）并清空，否则才真正关闭面板
- Tab display 状态持久化 bug：各 detail opener 设 `display:none` 的 tab，在其他 opener 里必须显式 `style.display=''` 重置，否则跨面板切换后 tab 消失

## 关联字段模糊搜索自动补全
- CSS：`.autocomplete-dd`（绝对定位下拉，z-index:9999）/ `.autocomplete-item`（可点击项）
- **采购单 `fproc-linked-order`**：模糊搜索活跃订单（alias/product），选中后存 `_procLinkedOrderId`（数字id）+ `_procLinkedOrderAlias`（客户简称）
  - `onProcLinkedOrderInput(el)` / `onProcLinkedOrderBlur(el)` / `selectProcLinkedOrder(ordId,alias)`
  - `openProcModal` 编辑模式下需从 `p.linkedOrderId/p.linkedOrderAlias` 恢复两个变量
- **订单 `fo-linkedprocid`**：模糊搜索PO（poNumber/supplierName），选中后填入 PO号文本，保存时直接读字段值
  - `onOrdLinkedProcInput(el)` / `onOrdLinkedProcBlur(el)` / `selectOrdLinkedProc(poNumber)`
- 使用 `onmousedown + e.preventDefault()` 防止 blur 在点击前触发导致下拉消失

## 调试经验
- 遇到"点按钮就退出"类问题，先在浏览器 Console 直接调用函数排查（不要改代码）
- `editSaleRecord(saleRecords[0].id)` 可直接测 modal 是否正常开
- `document.querySelector('#detail-body .btn-outline').getAttribute('onclick')` 可看按钮实际 onclick
- 症状相同但原因不同：editCurrent() 漏处理某 type，而非 z-index 或数据问题
- 手机端页面不更新 → 检查是否被 `.filters{display:none}` CSS 隐藏，需在 `mh-xxx` 手机 header 里单独加筛选
- 用户看不到更新但代码已推送 → 先让强制刷新，无效则 bump SW CACHE_NAME
- **iOS PWA overlay 被面板遮挡**：position:fixed 全屏面板（overflow-y:auto）会拦截更高 z-index 元素的 touch 事件 → 解决方案：在触发 overlay 的同一 onclick 里先/后调 `closeDetail()`
- **待办保存不刷新详情面板**：saveTodo/saveInqTodo/saveOrdTodo 只调 refreshAll() 不够，必须同时调对应的 openXxxDetail(id)+switchDpTab('followup') 才能刷新面板内容
- **feature branch 与 main 分歧**：改动在 feature branch 上时用 cherry-pick 合到 main，不能直接 push 到 feature branch

## 待做功能（优先级顺序）
1. **【已完成】产品库模块**（prodcat）：基础完成，报价单已集成
2. **【已完成】报价单模块**（quote）：新建/编辑/详情/预览/打印/询盘客户Tab集成
3. **【已完成】采购跟单模块**（procurement）：供应商管理/采购单/阶段跟踪/入库确认
4. **【待资料】打印模板**：订单 + 采购单各需支持3个公司抬头，等待公司资料（名称/地址/税号/Logo等）
5. **【已完成】库存管理模块**（inventory）：台账/流水/入库单/出库单/盘库对账/打印
6. **【之后】财务模块**（finance）：账户流水/应收应付/P&L报表
7. 数据看板优化（待讨论）
8. **【待设计】邮件集成**：CRM内直接发邮件给客户，发送记录自动同步跟进记录
9. **【后期】订单反查报价单**：订单详情加关联报价单入口
10. Supabase 迁移（后期）
11. 钉钉 H5 嵌入（后期）

## 采购跟单模块设计规划（procurement）

### 两种采购单来源
- **从销售订单下推**：执行中订单→「创建采购单」→ PO存 linkedOrderId，双向可查
- **直接新建**：补库存或备货，不关联订单

### 供应商管理
- 存储在 crm_settings_v5 的 suppliers 数组（或独立 crm_proc_v5）
- 字段：id / name / contact / phone / wechat / email / mainProducts / currency / paymentTerms / note
- 同一产品可有多个供应商，SKU 的 supplier 字段为文本，采购时从供应商列表选

### 采购单字段
- poNumber：PO-2026-001（自动生成）
- supplierId / supplierName / linkedOrderId（可空）/ person
- stage：草稿→已发PO→生产中→已发货→已到货→已入库
- createDate / expectedDate / receivedDate
- items[]：skuCode / nameCN / qty / unit / unitCost / currency / receivedQty（支持部分到货）
- totalCNY / totalUSD（自动计算）
- paymentStatus：未付款 / 已付定金 / 已付全款（手工标记）
- paymentIds[]：关联财务流水记录（财务模块做好后联动）
- note

### 采购单阶段（stage）
- 草稿：已建未发
- 已发PO：已通过微信/邮件/1688发给供应商
- 生产中：供应商确认接单在做
- 已发货：供应商已发出
- 已到货：货到仓库，待入库确认
- 已入库：显式入库确认后进入此状态（触发库存模块增加库存）

### 到货入库流程（防误操作）
- 点「确认到货」→ 弹出**入库确认单**（预填PO数量，可修改实际数量）
- 提交入库 → 生成永久库存流水记录（不可删，只能做调整记录）
- PO状态自动变为「已入库」

## 库存管理模块设计规划（inventory）

### 核心原则
- 所有库存变动 = 显式流水记录，不自动触发，不可删除
- 库存台账 = 实时汇总所有流水的结果
- 只能通过「调整记录」纠错，不能直接修改历史记录

### 库存变动类型（movement type）
1. 采购入库（来源：采购单）
2. 销售出库（来源：执行中订单）
3. 生产领料出库（来源：执行中订单）
4. 样品出库（手工录入）
5. 盘点调整（盘库后差异）
6. 损坏报废（手工录入）

### 库存流水记录字段
- date / skuCode / nameCN / movementType / qty（正=入库，负=出库）
- sourceType：po / order / manual
- sourceId：关联PO或订单号
- person / note

### 库存台账视图
- 按SKU展示当前库存、安全库存预警、最近一次变动
- 可搜索SKU编码/产品名称
- 点击查看该SKU所有收发明细

### 盘库对账流程
- 选择盘库日期 → 按SKU逐一填入实盘数量
- 系统显示：系统账 vs 实盘 vs 差异
- 确认提交 → 每条差异生成一条「盘点调整」流水记录

## 财务模块设计规划（finance）

### 设计原则：现金制（Cash Basis），不做逐笔核销
- 记实际收到/付出的钱，不记"应该收/付"
- AR = 订单总额 - 该客户收款流水合计（自动计算）
- AP = 采购总额 - 该供应商付款流水合计（自动计算）
- P&L = 收款流水 - 付款流水 - 支出流水

### 账户管理（8个账户）
- 汇丰USD-1 / 汇丰USD-2 / 阿里巴巴USD
- 个人CNY-1 / 个人CNY-2 / 公司CNY-1 / 公司CNY-2 / 支付宝CNY
- 每个账户：期初余额 + 实时余额（期初 + 所有流水合计）

### 财务流水记录字段
- date / amount / currency / accountId（哪个账户）
- type：收款（入）/ 付款（出）/ 内部转账 / 运营支出
- category：客户收款 / 供应商付款 / 员工工资 / 房租 / 快递 / 其他支出
- party：客户名 或 供应商名（自由文本或关联）
- linkedType：order / po / expense（可空）/ linkedId
- note / person

### 复杂付款场景处理
- 1笔款对多订单：记1条流水，note里说明，AR按客户总额计算
- 多笔款对多订单：各记各的流水，不强制对应到具体订单
- 1688：只记净到账金额，不追每笔明细
- 客户=供应商（抵账）：AR - AP = 净欠款

### 订单/采购单付款状态（简化手工标记）
- 销售订单：paymentStatus = 未收款 / 已收定金 / 已收全款（手工勾选）
- 采购单：paymentStatus = 未付款 / 已付定金 / 已付全款（手工勾选）
- 精确AR/AP从流水自动计算，标记仅供快速判断

### 报表
- 月度P&L：按月汇总收款/付款/支出，计算毛利
- 账户余额汇总：所有账户当前余额一览
- 应收账款：按客户汇总欠款+账龄
- 应付账款：按供应商汇总欠款+账龄
- 导出JSON → 给AI分析
