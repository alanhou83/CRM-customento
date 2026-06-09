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
- 当前 SW 版本：customento-crm-v28

## 团队成员与权限
- Alan：管理员，可见所有，可删除/导出/VIP+冲单标记，专属设置页
- Kelly：销售经理，可见所有，可删除（询盘/客户/订单），**可标记询盘VIP**
- Momi：Alibaba 负责
- Mille：1688 负责
- Penny：运营
- **删除权限**：`canDelete()` 返回 Alan 或 Kelly
- **询盘VIP权限**：`canInqVip()` 返回 Alan 或 Kelly（客户VIP/冲单仍 Alan 专属）
- **冲单权限**：`canVip()` 返回 Alan（客户冲单 + 询盘冲单 targetStar 均 Alan 专属）

## 已完成功能
- 6个模块：数据看板 / 热点商机 / 询盘列表 / 客户管理 / 销售统计 / 执行中订单
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
   当前已有：inquiry / customer / order / sale（缺任何一个就会出现"点编辑就退出"的症状）
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

## 必须遵守的规避规则（部署）
- 当前行为：浏览器普通刷新即可看到更新；PWA 关闭重开即可，无需删除重装
- 若看不到更新：bump CACHE_NAME 强制清缓存（已到 v28）

## 工作规范
- 所有改动代码必须先说方案，等确认后再执行
- 给出完整可替换的代码块，不给片段
- 修改前说明改了什么、为什么
- 回复用中文，代码注释用中文
- 同一对话内累积所有改动，不需要每次下载上传
- 说"给我最终文件"时才输出最终版本
- 每次新对话开始前确认项目文件已是最新版本

## 当前进度（最近完成）
- 客户管理卡片视图V2重构：5层Tab切换、动态评分(7分)、超时红框(分层阈值)、状态图标简化
- 动态增长(90天无成交自动关)/动态活跃(超时自动关)机制
- 客户筛选栏：⭐VIP / 🎯冲单 / 🔴超时 芯片按钮
- 询盘列表：桌面芯片快捷筛选（VIP/冲单/热点/超时）
- 询盘 targetStar 字段（Alan专属冲单标记）
- canInqVip()：Kelly 也可标记询盘VIP
- 手机端询盘第一行加🎯冲单芯片（末尾，独立切换），第二行加⭐VIP芯片
- 手机端询盘卡片：🎯排在名字行最后(22px)，超时移至右侧跟单人名左侧同行
- SW 升至 v28（强制清缓存）

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

## 调试经验
- 遇到"点按钮就退出"类问题，先在浏览器 Console 直接调用函数排查（不要改代码）
- `editSaleRecord(saleRecords[0].id)` 可直接测 modal 是否正常开
- `document.querySelector('#detail-body .btn-outline').getAttribute('onclick')` 可看按钮实际 onclick
- 症状相同但原因不同：editCurrent() 漏处理 sale 类型，而非 z-index 或数据问题
- 手机端页面不更新 → 检查是否被 `.filters{display:none}` CSS 隐藏，需在 `mh-xxx` 手机 header 里单独加筛选
- 用户看不到更新但代码已推送 → 先让强制刷新，无效则 bump SW CACHE_NAME

## 已知未解决 Bug
### 待办行日期选择器跨平台问题
- **症状**：PWA 模式正常，手机浏览器和电脑浏览器均无法正常触发日期选择器
- **当前状态**：使用普通 input[type=date]，待后续分析根本原因
- **PWA 与浏览器差异原因待查**：iOS Safari 浏览器模式 vs PWA 模式对 touch event 处理机制不同

## 待做功能（长期/后期）
1. **【待设计】产品管理模块**（待看Alan提供的现有表格结构再设计字段）
2. **【待设计】产品开发模块**（待看现有表格，Penny主用，新品立项/打样/定版/量产进度）
3. **【待设计】采购跟单模块**（待看现有表格）
4. **【暂缓】财务模块**：现有系统在用，CRM暂不做财务/采购/订单关联
5. 询盘成单金额自动计入客户成交统计
6. 客户管理加来源渠道筛选
7. 数据看板优化（待讨论）
8. **【待设计】邮件集成**：CRM内直接发邮件给客户，发送记录自动同步跟进记录（当前静态架构可做mailto快捷入口；完整自动发信+回复同步依赖Supabase阶段）
9. Supabase 迁移（后期）
10. 钉钉 H5 嵌入（后期）

