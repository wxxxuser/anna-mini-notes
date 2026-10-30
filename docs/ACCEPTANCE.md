# 题目验收记录

本记录区分源码已实现、本机实际验证和仍待远端执行的项目。检查环境：Windows x86_64，Node.js 24.15.0，Anna CLI 0.1.61，Python runtime 0.2.0a30。日期：2026-10-29。

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
| 三平台构建及 GitHub Release workflow | 已实现、静态检查通过 | release.yml，手动与 tag 路径都汇总三个 Release assets；actionlint 通过 |
| macOS arm64／x86_64 二进制实际执行 | 待 GitHub Actions | 当前电脑为 Windows，不把 workflow 配置视为已实跑 |
| GitHub 仓库链接与远端发布 | 待仓库访问授权 | 用户已创建私有仓库 https://github.com/wxxxuser/anna-mini-notes；连接器暂不可访问，源码上传与远端发布尚未完成 |
| README 覆盖题目列出的操作说明 | 已完成 | 安装、构建、strict、UI、mock、手动协议、证据、打包、发布、术语与版本兼容 |

## 迭代审查

1. **基础实现**：完成工程化前端、tool identity 对齐、严格 v2 工具、sampling fixture。构建、manifest validate、协议与独立 CLI sampling 通过。
2. **真实集成**：发现固定 runtime 在 App 路径漏 initialize，并复用 llm.complete ACL。通过开发 launcher 实际握手和声明必要 grant 修复；正式工具仍拒绝未协商 v2 的调用。Windows 子进程 Path/PATH 重复导致 Node 查找失败，也已修复。最终真实 harness 的 storage 和预期模型禁用错误通过。
3. **独立审查**：发现前端可保存的总正文大于工具上限。保存时补 100,000 字符检查并保留 200 KiB UTF-8 上限；超限在写入前拒绝。增加对应回归测试。
4. **交付检查**：Windows 自包含二进制及归档解包 smoke 通过；发布 workflow 静态检查通过。GitHub 授权、真实三平台 Actions 和 Release 页面仍是外部待办。
5. **启动修复**：用户终端出现 bridge 8 秒超时。为 `npm run dev` 增加自动预热，使用与 CLI 相同的真实 bridge 命令，等待 `_ready` 后通过 EOF 正常关闭；独立准备阶段最多等待 120 秒，失败阻止继续启动。空 uv 缓存的下载、首次启动及 Host storage／Executa no-llm 链路实测通过。
6. **慢网络修复**：用户下载未完成即退出，发现上轮 120 秒总时限可能截断慢速下载。改为项目共享 `.tools/uv-cache`，离线真实启动探测不足时才联网准备，联网阶段不设整体截止时间，uv 单次读取超时／重试仍有效。下载完成后再验证离线启动；正式 dev 的 uv 不再联网取包。已完整准备项目缓存并以 `UV_OFFLINE=true` 成功启动；构建、strict validate、27 项测试与官方 CLI sampling 全通过。

## 证据与限制

- `npm run check` 可重新生成本地测试证据；需先完成 `npm run setup:runtime`。
- 最后一轮检查：16 项协议测试、2 项配置/构建契约、8 项前端服务测试、1 项真实 harness 测试全部通过，另有官方 CLI fixture sampling 集成通过。
- Windows 归档 SHA256：`832610caa31f3c5558cb23837cdd6de421a039de50c0916524ed4c29390a1251`；真实界面截图在本地 `artifacts/ui-harness.png`。
- `test:harness` 是真实官方 Host dispatcher 集成测试，不冒充浏览器自动化；UI 操作为单独的实际浏览器验收。
- `artifacts/`、`releases/` 为本地生成结果，不提交临时 token、测试日志、依赖或大文件到源码仓库。
- UI harness 不接 mock summary；独立工具 runner 才读 fixture。
- legacy 内存存储不承诺外层 dashboard 刷新或 dev 重启后保留，符合题目范围。
- 前端渲染为纯文本，笔记和模型内容不会作为 HTML 执行。
- 本题本地实现不需要也未进行 Anna 账号登录、模型付费调用或 Anna 商店上线。
