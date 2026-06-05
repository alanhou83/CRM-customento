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
- Kelly：销售经理，可见所有
- Momi：Alibaba 负责
- Mille：1688 负责
- Penny：运营

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

## 客户分层逻辑
- 5层：核心 / 重点培养 / 普通跟踪 / 沉睡 / 流失
- 分层图标：🏆核心 / 🌳重点培养 / 🔄普通跟踪 / 💤沉睡 / ☠️流失
- 系统自动建议分层（基于成单/复购/评分）
- 手动可覆盖，保存后固定
- 录入成交记录自动更新标签（成单/复购/增长/活跃）

## 布局规范
- detail-body padding=0
- 询盘/订单用 detail-body-inner 包 padding:20px
- 客户详情 Tab 用 dp-tab-content.active 的 padding:20px

## 品牌规范
- 主色：#2D3172（深海军蓝）
- 强调色：#6B72C3（紫色）
- 浅紫：#8B91D4
- 背景：#F0F2F8
- Logo：定位针图标 + CUSTOMENTO 文字
- PWA 图标：深蓝背景 + 定位针 + CRM 文字 + CUSTOMENTO 小字

## 必须遵守的规避规则（代码）
1. JS 里绝对不能用模板字符串，必须用字符串拼接，否则引号嵌套会导致整个脚本崩溃
2. 每次修改客户管理 HTML 后必须检查 cust-list-view 的 </div> 是否正确闭合，否则后续页面被隐藏
3. setCustView() 里所有 getElementById 必须加 null 检查（if(el)）
4. showPage() 里 getElementById 必须加 null 检查
5. 手机端 cust-card-view 和 cust-list-view 必须 CSS 强制 display:none !important
6. renderMobileCards 里 var html='' 必须在 if 判断之前声明
7. 手机端媒体查询必须覆盖：html,body{overflow:auto} / .app{overflow:visible;height:auto} / .main{overflow:visible} / .page-content{padding:0;overflow:visible}
8. editCurrent() 必须先保存 id 再 closeDetail()，否则 id 被清空
9. str_replace 定位锚点用完后必须确认原内容完整保留（曾发生 refreshAll 函数被误删导致全站崩溃）
10. 每次改完 JS 必须用 node --check 语法检查再给文件

13. iOS Safari input[type=date] 日期选择器：已证实无效的方案（不要重复尝试）：
    - opacity:0 覆盖层：iOS 认为不可见，不触发 picker
    - opacity:0.01 覆盖层：PWA 模式可用，iOS 浏览器模式仍不触发
    - label 包裹 + opacity:0.01：同上，且容易误加 overflow:hidden 重现 bug
    - opacity:1 + color:transparent + CSS 隐藏 indicator：仍不触发
    - 普通可见 input（与编辑弹窗写法相同）：仍不触发（原因未明）
    - showPicker() 调用：PWA 可用，iOS 浏览器模式不可靠
    - overflow:hidden 父容器：会阻断 iOS 所有 touch 事件，绝对不能用在 date input 父层
    - 根本原因：iOS Safari 浏览器模式 vs PWA 模式对 input[type=date] touch 处理机制不同，待查

## 必须遵守的规避规则（部署）
11. 每次推送新版本到 GitHub Pages，必须同时把 service-worker.js 里的 CACHE_NAME 版本号加1（如 crm-v2 → crm-v3），否则 SW 缓存导致用户看不到更新
12. PWA 安装版（桌面/手机 App）更新后需关闭再重开 App 才生效；浏览器访问版刷新即可

## 工作规范
- 所有改动代码必须先说方案，等确认后再执行
- 给出完整可替换的代码块，不给片段
- 修改前说明改了什么、为什么
- 回复用中文，代码注释用中文
- 同一对话内累积所有改动，不需要每次下载上传
- 说"给我最终文件"时才输出最终版本
- 每次新对话开始前确认项目文件已是最新版本

## 当前进度
- 上次完成：跟进记录输入框置顶 / 最新在前 / 删除按钮 / 快速下拉修改分层/类型/渠道/负责人 / 下次跟进待办行（日期+内容）/ 待办显示在卡片/列表/客户档案

## 已知未解决 Bug
### 待办行日期选择器跨平台问题
- **症状**：PWA 模式正常，手机浏览器和电脑浏览器均无法正常触发日期选择器
- **已尝试方案**：
  1. 透明 input 覆盖（opacity:0）+ overflow:hidden 移除 → 手机浏览器仍不触发
  2. opacity:0.01 → 同上
  3. label 包裹 + opacity:0.01 → 误加 overflow:hidden 重现 bug
  4. opacity:1 + color:transparent + CSS 隐藏 calendar indicator → 仍不触发
  5. 普通可见 input（与编辑弹窗同款写法）→ 仍不触发
- **当前状态**：使用普通 input[type=date]，待后续分析根本原因
- **PWA 与浏览器差异原因待查**：可能与 iOS Safari 浏览器模式对 touch event 的处理机制有关

## 待做功能
1. 询盘成单金额自动计入客户成交统计
2. 客户管理加来源渠道筛选
3. 数据看板优化（待讨论）
4. Supabase 迁移（后期）
5. 钉钉 H5 嵌入（后期）
