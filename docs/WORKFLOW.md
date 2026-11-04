# 研发工作流程规范

> 本文档由通用工作流模板实例化而来，是本仓库**唯一**的开发流程规范。目标：**每个变更可追溯、每次合入 main 都通过全部门禁、每条审查发现都有验证证据地闭环**。
>
> 流程对「人工开发」和「AI 协作开发」同等适用。与 AI 协作时：会话开场应提供本文件，AI 在阶段二结束前不得动手改代码（先给方案、确认后再开发），阶段五的审查应由未参与实现的一方执行。

## 模板适配对照

本仓库的模板占位符取值如下，模板升级时按下表逐项同步：

| 模板占位 | 本仓库取值 |
|---|---|
| `<需求文档>` | [docs/PRD.md](PRD.md)（功能需求与决策记录）+ [docs/roadmap.md](roadmap.md)（里程碑状态） |
| `<设计规范>` | 暂无独立文档；事实标准 = `webview/style.css` 既有写法 + [docs/tech-design.md](tech-design.md) 的 ADR |
| `<方案目录>` | `.zcode/plans/`（不入库，已在 `.gitignore` 忽略） |
| `<安全边界目录>` | `src/host/`、`webview/`、`src/core/protocol.ts`、`esbuild.mjs` |
| `<数据入口模块>` | `src/host/extension.ts` 的 `saveImage()`（唯一文件写入）与 `context.globalState`（唯一持久化，当前仅 `openCodeSnap.lastSaveDir`） |
| 门禁四件套 | `npm run typecheck` / `npm test` / `npm run build` / `npm audit --omit=dev` |
| `<scope 参考>` | core / host / webview / export / theme / deps / ci / docs / release |
| `<发布渠道>` | VS Code Marketplace（M3 上架后）+ GitHub Release（vsix 附件） |

---

## 0. 流程总览与规模分级

```
① 需求提出 ──→ ② 分析讨论 ──→ ③ 开发 ──→ ④ 测试验证 ──→ ⑤ 审查与修复闭环 ──→ ⑥ 提交合并 ──→ ⑦ 发布
                  │确认方案│
                  └──否决/返工──┘
```

**规模分级决定流程深度**——小事不举行仪式，大事不跳步骤：

| 级别 | 判定标准（满足任一即升级） | 流程要求 |
|---|---|---|
| **S** | 单文件 ≤30 行；错别字、注释、文案、单点小修；不碰消息协议 / 安全边界 / 依赖 / UI 布局 | 门禁全绿 → 直接提交 main，无需方案文档与独立审查 |
| **M** | 多文件功能增量或修复；新增测试；webview 局部调整 | 方案在对话中确认 → 分支开发 → 全门禁 → 一轮审查 → 分批提交 |
| **L** | 新功能（PRD 功能项）/ 配置项增删 / 安全边界改动 / 依赖增删或升级 / 版本发布 / 架构重构 | 需求单 → 方案文档 → 分支开发 → 全门禁 + 专项脚本 → 独立审查（含机械扫描）→ 修复闭环 → 分批提交 → 发布检查清单 |

以下任一情况**强制按 L 级**处理：安全边界目录（`src/host/`、`webview/`、`src/core/protocol.ts`、`esbuild.mjs`）的任何改动、`package.json` 的 `contributes.configuration` 变化、依赖清单变化、CI / 构建脚本（`.github/workflows/`）变化。

---

## ① 需求提出

**来源**：使用中发现的缺陷、PRD 演进、依赖漏洞 / 升级、审查遗留项。

**需求单五要素**（对话中口头提出也必须答全，L 级需落成文字）：

1. **背景**：什么场景下遇到什么问题；
2. **现状与期望**：现在是什么行为、期望是什么行为；
3. **验收标准**：可验证的判定条目（「切换主题后预览面板 200ms 内完成重渲染」而不是「主题切换要流畅」）；
4. **影响范围猜测**：大概涉及哪些模块（core / host / webview）；
5. **优先级**：立即修（阻塞使用）/ 排期 / 备忘。

**分类标签**（后续提交 type 与之一致）：`feat` / `fix` / `refactor` / `perf` / `test` / `docs` / `chore`。

**登记位置**：L 级新功能写入 [docs/PRD.md](PRD.md) 或新建小节（含决策记录），并在 [docs/roadmap.md](roadmap.md) 标注里程碑归属；缺陷与 M 级需求在对话中登记即可，但**必须进入「本批待办」清单**，不允许只存在于记忆里。

---

## ② 分析讨论（方案确认门）

进入开发前必须达成方案共识。**检查清单**（逐项过，不适用则注明「不涉及」）：

- [ ] **与需求文档一致**：与 [docs/PRD.md](PRD.md) 的现有决策冲突？冲突则先补决策记录、再开发；跨端复用决策对照 [docs/tech-design.md](tech-design.md) 的架构约束（core 保持纯 TS、无 VS Code 依赖）；
- [ ] **与设计规范一致**：webview 改动对照 `webview/style.css` 既有令牌写法，不引入魔法值；
- [ ] **配置项影响**（本项目的「数据结构」）：新增 / 修改 `contributes.configuration` 项？→ 新配置必须**带 default、可选生效**（旧配置缺省不得导致报错或行为回退），enum 变化评估旧值兼容；
- [ ] **安全边界影响**：是否新增 webview 消息类型（`src/core/protocol.ts`）、文件写入、剪贴板访问、网络请求？→ 必须沿用既有防护层（CSP + 随机 nonce、`localResourceRoots` 仅 dist/、`asWebviewUri`、消息入参白名单校验），禁止旁路；
- [ ] **依赖影响**：新增依赖需给出不可用现有能力实现的理由（默认惯例：**零新增运行时依赖**，当前仅 `shiki` 与 `dom-to-image-more`；**零网络请求**是本扩展的安全不变量，任何 fetch / XHR / `openExternal` 新增都属 L 级强制审查）；
- [ ] **测试计划**：哪些纯逻辑值得落在 `src/core/` 并补 vitest 回归用例（参照 `tests/layout.test.ts`、`tests/theme-map.test.ts` 模式）；
- [ ] **提交拆分计划**：L 级列出预期 commit 批次。

**产出物**：

- **S / M 级**：对话中确认方案要点（改哪些文件、怎么验证）；
- **L 级**：方案文档（放 `.zcode/plans/`，不入库；需要长期留档的决策沉淀到 PRD / tech-design）。

**门**：方案经提出人**明确确认**后才进入阶段③。分析阶段否决的需求要留下否决理由（一两句话，记在需求来源处）。

---

## ③ 开发

**分支规范**（M / L 级）：

```
git switch -c feat/m1-theme-picker   # 功能：feat/、修复：fix/、杂务：chore/
```

S 级可直接在 main 上改。**main 上的每个 commit 都必须门禁全绿**——不允许「先合上再修」。

**开发纪律**：

1. **单一职责提交**：一个 commit 只做一件事；重构、格式化、依赖升级必须与功能改动分开提交；
2. **遵守既有架构**：渲染逻辑进 `src/core/`（纯函数、可测），VS Code API 只出现在 `src/host/`，DOM 操作只出现在 `webview/`；三端通信只走 `src/core/protocol.ts` 的消息类型，不得私加通道；
3. **安全边界不退让**：`src/host/extension.ts` 新增消息处理必须校验入参（类型 / 枚举 / 大小），webview HTML 变动必须维持 CSP（`default-src 'none'`、script 走 nonce、wasm-unsafe-eval 仅限 Shiki oniguruma）；资源引用只经 `asWebviewUri`；
4. **错误处理**：失败路径必须给出用户可见提示（`showErrorMessage` / webview 内通知），禁止静默吞错；文件写入（`saveImage`）保留既有失败恢复考虑；
5. **不留尾巴**：不提交 `TODO` / `FIXME` / 调试语句 / 注释掉的死代码；
6. 开发中随时增量验证：`npm run typecheck`。

---

## ④ 测试验证（本地门禁）

**提交 / 合并前四件套，必须全绿**（与 CI 完全一致）：

```bash
npm run typecheck        # tsc --noEmit，覆盖 src/ webview/ tests/ 三端
npm test                 # vitest run（src/core 纯函数单测）
npm run build            # esbuild 双 bundle（host + webview）
npm audit --omit=dev     # 生产依赖漏洞必须为 0，出现即红灯
```

> **本地镜像源注意**：本机 npm 默认源是 npmmirror，不支持 audit 端点（`NOT_IMPLEMENTED` 报错）。本地审计需显式指定官方源：
> `npm audit --omit=dev --registry=https://registry.npmjs.org`。
> CI 在 GitHub runner 上走官方源，无此问题。

> **lockfile 严格校验**：涉及 `package.json` / `package-lock.json` 的变更，须额外用较新的 npm 复现 `npm ci` 的严格校验：
> `npx -y npm@latest ci --ignore-scripts --dry-run`。
> 本地 lock 的 resolved 指向 npmmirror，CI 按同一 URL 下载（镜像源公网可达）；lock 与 manifest 不同步会在 CI 的 `npm ci` 直接红灯。

**CI 流水线**（`.github/workflows/ci.yml`）：push 到 main 与所有 PR 自动跑 `npm ci` → 四件套 → `vsce package` 打包验证，产物 vsix 上传为 artifact。**push 后必须看一眼 CI 结果，红灯当天修**（含 PR 上的红）。

**专项门禁矩阵**（按改动内容追加）：

| 改动内容 | 额外必过项 |
|---|---|
| webview UI / 样式 / 主题 | F5 实测：多语言（含中文宽字符）× 明暗主题高亮正确；开发者控制台无 CSP 违规报错；涉及主题映射跑 `tests/theme-map.test.ts` |
| 消息协议 / 安全边界 | 新增消息逐个核对入参白名单校验；CSP 变动双引擎导出回归 |
| 导出引擎（export/） | canvas 与 dom 双引擎 F5 实测导出，产物打开人工核对（字体、阴影、透明背景、缩放倍数） |
| 配置项（contributes） | 新配置在默认值下的行为 = 升级前行为；旧 settings.json 不受影响 |
| 依赖升级 / 运行时大版本 | `vsce package` 后 vsix **实机安装**冒烟（M0 验收清单重跑核心项） |
| 端到端 | M3 引入 `@vscode/test-electron` 后生效；此前以 F5 手测清单代替 |
| 任意逻辑变更 | **为修复的缺陷补回归用例**——没有用例的修复视为未完成 |

**验收核对**：逐条对照阶段①的验收标准，全部满足才算通过。

---

## ⑤ 代码审查与修复闭环

**审查者**：换一双眼睛。AI 实现的代码由用户审或**另起会话的 AI 审**（不带实现过程的先入之见）；用户实现的代码由 AI 审。

**审查输入**：`git diff main...<branch>` + 需求单 + 验收标准。不看 diff 的「审查」无效。

**审查清单**：

1. **安全**（最高优先级）：消息 handler 无未校验入口；无 `eval` / `new Function` / `child_process`；无硬编码密钥；webview 未越界调用宿主能力；CSP 未放宽；无新增网络请求（零网络不变量）；
2. **数据**：旧配置兼容；`saveImage` 写入失败路径；globalState 键无冲突；
3. **正确性**：边界条件（空选区 / 超长行 / 特殊字符 / CRLF）；事件监听与面板 dispose 清理；深色浅色主题下的对比度；
4. **一致性**：命名与既有代码风格一致；文案口径（中英文混排）与全扩展一致；架构分层未破坏（core 无 VS Code / DOM 依赖）；
5. **机械扫描**（对抗「只看逻辑漏掉粗筛项」）：
   ```bash
   grep -rn "TODO\|FIXME\|HACK\|XXX" src/ webview/
   grep -rn "eval(\|new Function\|execSync\|shell:\s*true" src/ webview/
   grep -rn "fetch(\|XMLHttpRequest\|openExternal" src/ webview/   # 零网络不变量
   git diff --stat   # 确认没有不该进的文件混入
   ```

**发现分级与闭环规则**：

| 级别 | 定义 | 处理 |
|---|---|---|
| **Critical** | 安全漏洞 / 数据丢失风险 | 必须修复 + 复测，**阻塞提交合并** |
| **Major** | 功能错误、验收标准未满足 | 必须修复 + 复测，**阻塞提交合并** |
| **Minor** | 缺陷但影响小、有变通 | 记录编号，本批或下批修复，不阻塞 |
| **Nit** | 风格 / 命名 / 更优写法 | 记录，择期处理 |

**修复闭环铁律**：

- 每条发现**逐条编号**（如 C-1、M-2、N-3），修复后**逐条给出验证证据**（实跑命令、测试输出），不凭「已修好」的自述采信；
- 修复后**重跑全部门禁**（四件套 + 该改动对应的专项项）；
- 审查过程稿（CODE-REVIEW-*.md）留在 `.zcode/plans/` 不入库；终审结论压缩后写进 PR 描述或提交说明。

---

## ⑥ 提交与合并

**Conventional Commits + 中文描述**（沿用既有历史风格）：

```
<type>(<scope>): <一句话说清做了什么>

[正文：为什么改、关键取舍、验证结果]
```

| type | 用途 | scope 参考 |
|---|---|---|
| feat | 新功能 | core / host / webview / export / theme … |
| fix | 缺陷修复 | core / host / webview / export / ci … |
| refactor | 重构（不改行为） | core / host / webview … |
| test | 测试补充 | 按模块 |
| docs | 文档 | prd / readme / workflow / roadmap … |
| chore / ci / build | 杂务 / 流水线 / 构建 | deps / release / build / ci |
| perf | 性能 | — |

**提交纪律**：

1. `git status` 确认无杂文件；**明确列出文件名** `git add <file>`，不用 `git add -A` / `git add .`；
2. 标题 ≤ 50 字左右，说清「做了什么」；正文补充「为什么」与验证结果（门禁输出摘要）；
3. M / L 级按阶段②的拆分计划**分批提交**（单一职责，一批一意图）；
4. **M / L 级流程**：分支 push → 开 PR（CI 自动跑门禁）→ CI 绿 + 审查闭环后合并 → 删除分支；**S 级**：门禁全绿后直接 commit 到 main（分支保护设置保留管理员豁免，勿勾选「Include administrators」）。

---

## ⑦ 发布

**版本号**（semver）：新功能集 → minor；纯修复 → patch；配置项语义破坏性变更 → major，并说明迁移方式。

**发布检查清单**（L 级，逐项打勾）：

- [ ] main 分支 CI 绿（typecheck / test / build / audit / package 五步）；
- [ ] `package.json` 版本号修改（本仓库无第二份版本文件，lock 随 `npm install` 同步）；
- [ ] README「版本历史」按**全局 / 页面 / 修复三段式**更新，与 Release 日志口径一致；
- [ ] 本地全部门禁复跑一遍（不只依赖 CI）；
- [ ] `npx -y @vscode/vsce package --no-dependencies` 打出 vsix 并**实机安装**：旧版本配置正常生效、核心功能冒烟（高亮、主题切换、双引擎导出、保存）；
- [ ] 提交 `chore(release): vX.Y.Z` → 打 tag `vX.Y.Z` → `git push && git push --tags`；
- [ ] 创建 GitHub Release，正文为该版本完整日志，**vsix 作为资产上传**（本地网络不稳时从 CI artifact 取云端构建的 vsix）；
- [ ] M3 上架 Marketplace 后追加：`vsce publish`（需配置 `VSCE_PAT`）；发布 workflow（tag 触发自动 publish）在 M3 落地；
- [ ] 更新 [docs/roadmap.md](roadmap.md) 交付状态标注。

**回滚预案**：Marketplace 直接发 patch 版本覆盖；GitHub Release 资产可覆盖重传（`gh release upload --clobber`）；vsix 历史版本始终可从 Release 下载回退安装；配置结构出问题 → 停止推广新版本，新配置项全部走「可选 + default」保证旧环境可回退。

---

## 附录 A：门禁速查

| 我要改… | 最小流程 |
|---|---|
| 错别字 / 注释 / README | S 级：改完四件套 → 直接提交 |
| 单点 bug 修复 | S~M：四件套 + 对应专项项 + **补回归用例** |
| 新功能（PRD 功能项） | L：需求单 → 方案确认 → 分支 → 全门禁 + F5 实测 → 独立审查 → PR |
| 新配置项 / 配置语义变化 | L：兼容性方案先行（default + 可选）→ 旧配置实测 → 独立审查 |
| 消息协议 / 安全边界 | L：安全清单逐条过 → 入参校验核对 → 独立审查（含机械扫描） |
| 依赖新增 / 升级 | L：理由说明 → audit 清零 → vsce package 实机安装验证 |
| CI / 构建脚本 | L：改动本身要在 CI 上验证过一轮 |
| 发版 | L：⑦ 发布检查清单全勾 |

## 附录 B：需求单模板

```markdown
## 需求：<一句话标题>
- 类型：feat / fix / refactor / docs / chore
- 级别：S / M / L
- 背景：
- 现状与期望：
- 验收标准：
  1.
- 影响范围：core / host / webview
- 优先级：立即 / 排期 / 备忘
```

## 附录 C：审查报告模板

```markdown
# 代码审查报告 — <需求标题>
- 日期 / 审查者 / 审查范围（commit 或 diff）：

## 发现
| 编号 | 级别 | 位置 | 问题描述 | 修复与验证证据 |
|---|---|---|---|---|
| C-1 | Critical | | | |

## 机械扫描
TODO/FIXME：0 处 | 危险调用：0 处 | 网络请求：0 处 | diff 杂文件：无

## 结论
□ 通过  □ 修复后通过  □ 打回
```

---

*修订本文件本身按 L 级流程执行：说明动机 → 确认 → 提交 `docs(workflow): …`。*
