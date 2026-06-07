# Customento CRM — Claude 开发记忆文件

## 项目基本信息
- 当前文件：crm-v5_final_5.html
- 技术架构：纯 HTML + JS，localStorage 存储
- Storage key：crm_inq_v5 / crm_cust_v5 / crm_ord_v5 / crm_sale_v5 / crm_settings_v5
- 未来部署：crm.customento.com（Hostinger + Supabase）
- 嵌入方式：钉钉 H5 微应用

## 测试环境
- GitHub Pages：https://alanhou83.github.io/CRM-customento/crm-v5_final_5.html
- 仓库：https://github.com/alanhou83/CRM-customento
- PWA 已配置：manifest.json / service-worker.js / icon-192.png / icon-512.png
- 当前 SW 版本：customento-crm-v2

## 团队成员与权限
- Alan：管理员，可见所有，可删除/导出/VIP+冲单标记，专属设置页
- Kelly：销售经理，可见所有，可删除（询盘/客户/订单）
- Momi：Alibaba 负责
- Mille：1688 负责
- Penny：运营
- **删除权限**：`canDelete()` 返回 Alan 或 Kelly

## 已完成功能
- 6个模块：数据看板 / 热点商机 / 询盘列表 / 客户管理 / 销售统计 / 执行中订单
- 询盘列表：标记列（VIP绿/热点橙/超时红）独立一列
- 客户管理：5层分层（核心/重点培养/普通跟踪/沉睡/流失）+ 卡片/列表双视图 + 分批展开
- 客户详情面板三Tab：客户档案 / 跟进记录（底部固定录入栏）/ 成交统计
- 快速标签点击直接保存
- 🎯冲单标签（所有人可加）+ ⭐VIP（Alan专属）
- 跟进录入框固定底部
- 客户列表视图：公司+产品合并一格（1fr撑满），左侧彩色竖线分层，跟进待办列（过期变红）
- 产品多选标签（getProd/getProdArr 兼容旧字符串数据）
- 管理员设置页（Alan专属，自定义产品种类，存 crm_settings_v5，动态同步所有产品选项）
- 管理员设置页：数据备份导出/导入 JSON 功能
- 销售统计：$ 和 ¥ 分开统计
- 手机端：独立 header 筛选 + 底部导航（看板/询盘/客户/订单/统计）
- 手机端：Alan 登录时 header 右上角显示 ⚙️ 设置入口
- 手机端底部导航订单图标：📦
- 手机端紧凑列表满屏显示，可滚动
- PWA 支持：可安装到手机/桌面，离线缓存
- 社媒联系方式（WhatsApp/Facebook/Instagram/Telegram）加入客户档案，品牌SVG图标，点击跳转App；微信/旺旺加复制按钮

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
- **2个Tab**：询盘详情 / 跟进记录
- Tab标签：`dp-tab-profile`="询盘详情"，`dp-tab-sales` 隐藏（客户详情时恢复"客户档案"+显示销售Tab）
- 状态区第一行：6个动态状态按钮
- 状态区第二行：已报价标记 / 已打样标记 / 已成单（action）/ 失效（action）
- 无"快速更新状态"标题行
- 待办显示在询盘详情Tab内（followupDate + followupNote）
- `saveInqTodo(inqId)` / `clearInqTodoDate(inqId)` 处理待办保存/清除
- 跟进记录Tab：顶部待办日期+内容输入 → 保存到 followupDate/followupNote；下方跟进记录列表

## 询盘列表规范（V2）
- **列定义**（9列）：日期 / 客户 / 标记 / 渠道 / 产品 / 评级 / 状态 / 待办 / 负责人
- `.cols-inq{grid-template-columns:80px 1fr 90px 90px 100px 55px 100px 150px 65px;}`
- 无"操作"列，点行进详情
- 表头排序：日期/客户/待办（`setInqSort`，3态，id=`thi-date-arr`等）
- 手机端排序：日期/客户/待办（`setInqMobileSort`，id=`inq-sort-date`等）
- 排序状态变量：`inqTableSort={key:'date',dir:'desc'}` / `inqMobileSort={key:null,dir:'desc'}`
- 排序优先级：手机端 key≠null 时优先用移动排序，否则用桌面排序

## 询盘手机端筛选（V2）
- **第一行芯片**：全部/Alibaba/1688/笨鸟/🔥A级/⚠️超时（`mobileChip(el,type)`）
- **第二行下拉**：状态(`mb-inq-status`) / 评级(`mb-inq-grade`) / 跟单(`mb-inq-person`) / 渠道(`mb-inq-source`)
- **搜索框**：`id="search-inq-m"`，接入 `getFilteredInq()`
- 点击芯片时自动重置4个下拉为空（避免冲突）
- `getFilteredInq()` 同时读取桌面筛选和手机下拉筛选

## 超时判定逻辑
- `isOverdue(i)`：状态非"已成单/未成单" 且 最后跟进距今 **≥5天** → 超时
- 基准：最后一条跟进记录日期，无跟进则用询盘创建日期

## 执行中订单模块关键设计
- 电脑端表头排序：日期/客户/金额/交期（`setOrdSort`，3态）
- 手机端排序：日期/客户/产品/金额/交期（`setOrdMobileSort`，3态）
- 阶段颜色：等待打样=灰 / 打样中=紫(#b36bfa) / 客户确认样品=黄 / 生产中=蓝 / 待发货=橙 / 已发货=绿
- `getOrdStageStyle(stage)` 返回 inline CSS
- `ordChipFilter(el,stage)` 手机端芯片筛选，含超时筛选
- 超时标记：`o.delivery && o.delivery < today()` → 红色边框 + ⚠️图标
- mh-ord：`margin-bottom:-6px`；chips：`padding-bottom:6px`；搜索栏全宽 border-top 风格

## 手机端搜索栏统一规范
所有页面（询盘/客户/销售统计/执行订单）搜索栏样式一致：
- mh-xxx 容器：`margin-bottom:-6px`
- chips 行：`padding-bottom:6px`（无 margin-bottom）
- 搜索栏容器：`display:flex;width:calc(100%+30px);margin-left:-15px;margin-right:-15px;padding:5px 8px 5px 12px;border-top:1px solid var(--border);background:var(--surface2);box-sizing:border-box`
- 排序按钮中性态统一用 `↓`（低透明度 opacity:.4），不用 `↕`（手机会渲染成表情符号）

## 排序逻辑规范（电脑端+手机端）
- **3态循环**：↓（降序）→ ↑（升序）→ 取消（key=null）→ 再点回↓
- **中性态显示**：文字+`↓`，`opacity:.4`，不加 active class（不用 ↕ 符号）
- **激活态**：`opacity:1`，加 active class，升序时显示 `↑`
- **实现函数**：setOrdSort / setOrdMobileSort / setCustSort / setStatsSort（逻辑完全一致）
- 中性态（key=null）时按默认排序（通常按日期降序）

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
- `editCurrent()` 已支持：inquiry / customer / order / sale
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
- 询盘详情/订单：**不用** detail-body-inner，直接用 dp-tab-content.active 的 padding:20px
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

**原则B：不再需要每次推送都 bump CACHE_NAME**
- 由于 HTML 已是网络优先，内容更新无需升级版本号
- 只有在 service-worker.js 本身的代码逻辑发生变化时才需要 bump CACHE_NAME

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
   当前已有：inquiry / customer / order / sale（缺任何一个就会出现"点编辑就退出"的症状）
9. str_replace 定位锚点用完后必须确认原内容完整保留（曾发生 refreshAll 函数被误删导致全站崩溃）
10. 每次改完 JS 必须用 node --check 语法检查再给文件
11. 手机端排序按钮中性态绝对不能用 ↕ 符号（iOS 会渲染成表情图标），统一用 ↓ + opacity:.4
12. 新增/编辑 modal 有 delete-area 时，新建入口必须清空 innerHTML，否则新建时会显示旧的删除按钮
13. iOS Safari input[type=date] 日期选择器：已证实无效的方案（不要重复尝试）：
    - opacity:0 / opacity:0.01 覆盖层：iOS 浏览器模式不触发
    - overflow:hidden 父容器：会阻断 iOS 所有 touch 事件，绝对不能用
    - showPicker()：PWA 可用，iOS 浏览器模式不可靠

## 必须遵守的规避规则（部署）
- 当前行为：浏览器普通刷新即可看到更新；PWA 关闭重开即可，无需删除重装

## 工作规范
- 所有改动代码必须先说方案，等确认后再执行
- 给出完整可替换的代码块，不给片段
- 修改前说明改了什么、为什么
- 回复用中文，代码注释用中文
- 同一对话内累积所有改动，不需要每次下载上传
- 说"给我最终文件"时才输出最终版本
- 每次新对话开始前确认项目文件已是最新版本

## 当前进度（最近完成）
- 手机端搜索栏全部统一为全宽 border-top 风格（询盘/客户/销售统计/执行订单）
- 排序按钮统一3态逻辑，取消 ↕ 符号
- 社媒联系方式加入客户档案（WhatsApp/Facebook/Instagram/Telegram 品牌SVG图标）
- 询盘状态系统V2重构：6动态状态 + flags里程碑 + 4个Tab（活跃/沉默/成单/失效）
- 询盘详情面板改为2Tab结构（询盘详情/跟进记录），含待办录入
- 询盘列表：移除操作列，加待办列，表头+手机端排序（日期/客户/待办）
- 手机端询盘筛选：芯片+下拉（状态/评级/跟单/渠道）联动，搜索框 id=search-inq-m
- 超时判定阈值改为5天（≥5天未跟进）
- 客户成交统计Tab重构（概览紧凑/点行进编辑/删除+退回按钮在modal）

## 调试经验
- 遇到"点按钮就退出"类问题，先在浏览器 Console 直接调用函数排查（不要改代码）
- `editSaleRecord(saleRecords[0].id)` 可直接测 modal 是否正常开
- `document.querySelector('#detail-body .btn-outline').getAttribute('onclick')` 可看按钮实际 onclick
- 症状相同但原因不同：editCurrent() 漏处理 sale 类型，而非 z-index 或数据问题
- 手机端页面不更新 → 检查是否被 `.filters{display:none}` CSS 隐藏，需在 `mh-xxx` 手机 header 里单独加筛选

## 已知未解决 Bug
### 待办行日期选择器跨平台问题
- **症状**：PWA 模式正常，手机浏览器和电脑浏览器均无法正常触发日期选择器
- **当前状态**：使用普通 input[type=date]，待后续分析根本原因
- **PWA 与浏览器差异原因待查**：iOS Safari 浏览器模式 vs PWA 模式对 touch event 处理机制不同

## 待做功能（长期/后期）
1. 询盘成单金额自动计入客户成交统计
2. 客户管理加来源渠道筛选
3. 数据看板优化（待讨论）
4. Supabase 迁移（后期）
5. 钉钉 H5 嵌入（后期）

## 近期待办（未完成，按优先级）

### 大改动（待单独讨论）
**询盘页：**
- ⬜ 状态标签可叠加（涉及数据结构变更，影响面大）

### 长期
- ⬜ 询盘成单金额自动计入客户成交统计
- ⬜ 客户管理加来源渠道筛选
- ⬜ 数据看板优化（待讨论）
