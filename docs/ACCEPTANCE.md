# 题目验收记录

题面要求已完成本机及远端验收。检查环境：本机 Windows x86_64、Node.js 24.15.0；远端 Ubuntu 24.04、macOS 15 arm64／Intel、Windows Server 2022；Anna CLI 0.1.61，Python runtime 0.2.0a30。最终发布验收日期：2026-10-30。

## 对照题面

| 验收项 | 状态 | 证据／复现方式 |
|---|---|---|
| 安装依赖、工程化源码与分层 | 已验证 | `npm ci`；`src/anna`、components、hooks 分层 |
| 前端静态 bundle | 已验证 | `npm run build`，输出 `dist/index.html` 和 assets |
| Anna App manifest 严格校验 | 已验证 | `npm run validate`（实际官方 `validate --strict`） |
| 官方无账号 UI harness | 已验证 | `npm run dev`，真实 iframe 与 SDK connect |
| 首次启动与 Python bridge 冷缓存 | 已验证 | 空 `UV_CACHE_DIR` 下运行 `npm run dev -- --port 5181`；自动准备真实 bridge 后成功启动，HTTP 200、storage 和 no-llm 工具链回归通过 |
| 慢速下载与跨终端缓存复用 | 已验证 | 下载阶段移除整体 120 秒截止时间；依赖已完整准备到 `.tools/uv-cache`，显式 `UV_OFFLINE=true` 的 `npm run dev` 成功启动；最新 `npm run check` 全通过 |
| 创建、查看、删除、顺序与空白拦截 | 浏览器已验证 | 空白按钮禁用；新增清空输入；创建 #01/#02 后删除 #01，剩 #02；RPC LOG 显示 get/set |
| notes 经过 storage Host API | 已验证 | 浏览器 RPC LOG + `artifacts/harness-rpc.jsonl`；无 localStorage／IndexedDB／文件回退 |
| UI → tools.invoke → Executa → sampling | 已验证 | 浏览器记录显示 tools.invoke；宿主与工具 stderr 记录 sampling.request |
| `--no-llm` 预期错误 | 已验证 | 浏览器显示 `[tool_failed] [-32603] harness started with --no-llm`；自动 test:harness 同样断言 |
| 独立 CLI mock sampling | 已验证 | `npm run test:sampling` 调官方 `executa dev --mock-sampling`，返回 fixture 原文 |
| JSON-RPC initialize/describe/invoke 与长驻 | 已验证 | `npm run test:protocol`；手动步骤见 README |
| 本机二进制归档与根 manifest | Windows 已验证 | `npm run package:binary`；归档前、解包后均跑真实 exe smoke |
| 三平台构建及 GitHub Release workflow | 远端已通过 | [Actions 41009894336](https://github.com/wxxxuser/anna-mini-notes/actions/runs/41009894336) 的 verify、三个 build、release 全部 success；本次通过 workflow_dispatch 实际发布 |
| macOS arm64／x86_64 二进制实际执行 | 远端已通过 | 两种 macOS 原生 runner 均在归档前、解包后执行 initialize、describe、invoke、reverse sampling、EOF；Windows 同样通过 |
| GitHub 仓库链接与远端发布 | 已完成 | [私有源码仓库](https://github.com/wxxxuser/anna-mini-notes)；[v1.0.0 Release](https://github.com/wxxxuser/anna-mini-notes/releases/tag/v1.0.0) 包含完整三个 assets，均为 uploaded |
| README 覆盖题目列出的操作说明 | 已完成 | 安装、构建、strict、UI、mock、手动协议、证据、打包、发布、术语与版本兼容 |

## 迭代审查

1. **基础实现**：完成工程化前端、tool identity 对齐、严格 v2 工具、sampling fixture。构建、manifest validate、协议与独立 CLI sampling 通过。
2. **真实集成**：发现固定 runtime 在 App 路径漏 initialize，并复用 llm.complete ACL。通过开发 launcher 实际握手和声明必要 grant 修复；正式工具仍拒绝未协商 v2 的调用。Windows 子进程 Path/PATH 重复导致 Node 查找失败，也已修复。最终真实 harness 的 storage 和预期模型禁用错误通过。
3. **独立审查**：发现前端可保存的总正文大于工具上限。保存时补 100,000 字符检查并保留 200 KiB UTF-8 上限；超限在写入前拒绝。增加对应回归测试。
4. **交付初检**：Windows 自包含二进制及归档解包 smoke 通过；发布 workflow 静态检查通过。当轮尚未取得 GitHub 授权，远端执行留待第 7 轮完成。
5. **启动修复**：用户终端出现 bridge 8 秒超时。为 `npm run dev` 增加自动预热，使用与 CLI 相同的真实 bridge 命令，等待 `_ready` 后通过 EOF 正常关闭；独立准备阶段最多等待 120 秒，失败阻止继续启动。空 uv 缓存的下载、首次启动及 Host storage／Executa no-llm 链路实测通过。
6. **慢网络修复**：用户下载未完成即退出，发现上轮 120 秒总时限可能截断慢速下载。改为项目共享 `.tools/uv-cache`，离线真实启动探测不足时才联网准备，联网阶段不设整体截止时间，uv 单次读取超时／重试仍有效。下载完成后再验证离线启动；正式 dev 的 uv 不再联网取包。已完整准备项目缓存并以 `UV_OFFLINE=true` 成功启动；构建、strict validate、27 项测试与官方 CLI sampling 全通过。
7. **远端交付验收**：用户完成 GitHub CLI 授权后，向私有仓库上传全部源码；手动触发发布工作流。干净的 Ubuntu runner 完成依赖安装、构建、strict validate、27 项测试和官方 CLI mock-sampling。两个 macOS 平台与 Windows 均成功构建自包含二进制、归档、解包和再次 smoke；最终在同一 v1.0.0 Release 上传三个安装包。Release API 的文件大小与 SHA256 均和各构建日志一致。

## 发布证据

- 仓库：[wxxxuser/anna-mini-notes](https://github.com/wxxxuser/anna-mini-notes)，保持私有，审阅者需要访问权限。
- 发布运行：[41009894336](https://github.com/wxxxuser/anna-mini-notes/actions/runs/41009894336)，5 个 job 全部成功。
- 正式版本：[v1.0.0](https://github.com/wxxxuser/anna-mini-notes/releases/tag/v1.0.0)，非草稿、非预发布；发布时间为 2026-10-30 13:43:59（香港时间）。
- 版本标签与本次构建源码均指向 [`69838943434232f52da8c9ebc7f3da1ab968d0b1`](https://github.com/wxxxuser/anna-mini-notes/commit/69838943434232f52da8c9ebc7f3da1ab968d0b1)。后续 main 提交仅补充本验收记录和 README，不改变 v1.0.0 二进制源码。

| Release asset | 大小（字节） | SHA256（GitHub 与构建日志一致） |
|---|---:|---|
| `mini-notes-1.0.0-darwin-arm64.tar.gz` | 23991789 | `4ce9635d5350119cce88ec4a19db3696e3e76ef5563c5adf5f2e2a13c0dd2b26` |
| `mini-notes-1.0.0-darwin-x86_64.tar.gz` | 25310205 | `3e079ebd359cb00c5eea4e851cb186b4358656a77733ca184e9e8896f241a143` |
| `mini-notes-1.0.0-windows-x86_64.zip` | 34826525 | `852d54287b9844201d3c254db3c04003b3e9c96217fedf3650a3f73815851c12` |

三个文件是 GitHub Release assets；Actions artifacts 仅用于各 job 之间传递这些文件。三平台运行日志均有两次 `Binary smoke passed`，覆盖归档前与解包后的真实可执行文件。

发布后已从 GitHub Release 下载全部三个文件到本机，重新计算 SHA256，并检查每个包仅含根 `manifest.json`、`bin/` 与声明的入口；全部一致。下载的 Windows exe 在本机再次通过完整 smoke；macOS 的实际运行由对应原生 runner 验证。

## 证据与限制

- `npm run check` 可重新生成本地测试证据；需先完成 `npm run setup:runtime`。
- 最后一轮检查：16 项协议测试、2 项配置/构建契约、8 项前端服务测试、1 项真实 harness 测试全部通过，另有官方 CLI fixture sampling 集成通过。
- 早期本机 Windows 归档 SHA256：`832610caa31f3c5558cb23837cdd6de421a039de50c0916524ed4c29390a1251`；正式 Release 使用上表中的远端构建产物。真实界面截图在本地 `artifacts/ui-harness.png`。
- `test:harness` 是真实官方 Host dispatcher 集成测试，不冒充浏览器自动化；UI 操作为单独的实际浏览器验收。
- `artifacts/`、`releases/` 为本地生成结果，不提交临时 token、测试日志、依赖或大文件到源码仓库。
- UI harness 不接 mock summary；独立工具 runner 才读 fixture。
- legacy 内存存储不承诺外层 dashboard 刷新或 dev 重启后保留，符合题目范围。
- 前端渲染为纯文本，笔记和模型内容不会作为 HTML 执行。
- 本题本地实现不需要也未进行 Anna 账号登录、模型付费调用或 Anna 商店上线。
