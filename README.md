# Mini Notes · Anna App

一个本地运行的 Anna 笔记应用。支持创建、查看、删除笔记；总结通过 Executa 的 reverse JSON-RPC sampling 借用宿主模型。前端为 React + TypeScript + Vite，工具为只依赖 Node.js 内置模块的独立进程。

交付版本：[v1.0.0 三平台 Release](https://github.com/wxxxuser/anna-mini-notes/releases/tag/v1.0.0)。[发布工作流](https://github.com/wxxxuser/anna-mini-notes/actions/runs/41009894336)已于 2026-10-30 通过构建、严格校验、27 项测试、独立 CLI sampling 及三平台归档前后 smoke。仓库保持私有，审阅者需拥有访问权限；资产校验值见[验收记录](docs/ACCEPTANCE.md)。

```text
App iframe → AnnaAppRuntime.connect()
           ├─ anna.storage.get / set → Host storage
           └─ anna.tools.invoke → Executa invoke
                                → sampling/createMessage → Host
                                ← sampling response      ← LLM / tool-test fixture
           ← summary            ← invoke result
```

## 环境与安装

- Node.js 22.12+；推荐 Node.js 24，与发布 workflow 一致。
- npm（随 Node.js 提供）。
- Astral uv：启动官方 Anna Python runtime 所需，不要求全局安装 Python 工具依赖。
- 打包需要系统 `tar`；Windows 10/11 使用系统自带 bsdtar，macOS 使用系统 tar。
- 不需要 Anna 账号、`anna-app login`、真实 LLM API key 或云数据库。

在本项目根目录执行：

```sh
npm ci
# 如果尚未安装 uv，可使用已有 Python 做项目内安装（不改系统 PATH）：
python -m pip install --target .tools/python uv==0.13.6
npm run setup:runtime
npm run build
npm run validate
npm run dev
```

已有 uv/uvx 在 PATH 时，跳过 pip 安装。也可按 [uv 官方文档](https://docs.astral.sh/uv/getting-started/installation/) 安装。`npm run dev` 自动先执行 `setup:runtime`：离线启动真正的 bridge，收到 `_ready` 后通过 EOF 正常关闭；缓存不足时才联网准备并再次检查。首次下载没有总时限，慢网络下请等待下载完成，可按 Ctrl+C 取消；uv 的单次 HTTP 读取超时默认为 120 秒、重试 3 次，可通过 `UV_HTTP_TIMEOUT`、`UV_HTTP_RETRIES` 覆盖。

默认 uv 缓存固定在项目的 `.tools/uv-cache`，让不同终端共用已经下载的依赖。准备和正式启动使用同一缓存；正式 dev 启动时 uv 禁止联网取包，避免网络等待挤占官方 CLI 固定的 8 秒启动时限。可用 `UV_CACHE_DIR` 显式覆盖缓存路径，准备与启动需保持一致。首次安装依赖和工具链需要网络，测试无需账号和付费模型；uv 离线设置只影响依赖获取，不会关闭 Anna 自身的网络能力。

Windows PowerShell 使用 `npm.cmd run build` 和 `npm.cmd run dev`。如果看到 `python bridge did not signal ready in 8s`，先确认启动日志中已出现 `predev` 和 `Anna runtime ready`；可单独执行 `npm.cmd run setup:runtime` 查看完整的 uv 下载或 Python 初始化错误，无需退出 Conda 或重装 Anna。

打开终端打印的 `http://localhost:5180/`。这是官方 `anna-app dev --no-llm` dashboard，App 在其 iframe 中运行。不要直接双击构建后的 HTML。

本项目锁定 `@anna-ai/cli 0.1.61`，它使用 `anna-app-runtime-local 0.2.0a30`。`package-lock.json` 固定前端和 Anna SDK/schema 等 npm 依赖。`scripts/anna.mjs` 设置项目内 uv 路径、共享缓存与 dev 的离线取包模式，再运行官方 CLI；没有替换 Host API。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run build` | TypeScript 检查并生成 `dist/` 静态 bundle |
| `npm run build:watch` | 持续构建；另一个终端保持 `npm run dev` |
| `npm run validate` | `anna-app validate --bundle dist --strict` |
| `npm run dev` | `anna-app dev --bundle dist --slug mini-notes --no-llm` |
| `npm run anna -- <参数>` | 运行同一版本 Anna CLI，含本地 uv PATH 适配 |
| `npm test` | 协议、配置一致性、前端服务单元测试和官方 CLI mock-sampling 测试 |
| `npm run test:harness` | 自动启动真实无模型 harness，验证 storage 与 tool 路由 |
| `npm run check` | 构建、严格校验和上述全部自动测试 |
| `npm run package:binary` | 构建本机二进制、smoke、归档、解包后再次 smoke |

## 项目结构

```text
src/
  anna/                 Runtime 连接、storage、tools、错误与类型
  components/           输入框、列表、总结区
  hooks/useNotebook.ts  异步操作与界面状态
  App.tsx / styles.css  页面与响应式样式
executas/mini-notes/
  index.cjs             正式工具入口：JSON-RPC 与 sampling
  dev-launcher.cjs       固定版本本地 harness 的初始化握手适配
  manifest.json         工具描述与 parameters[]
  executa.json           官方 CLI 的发现与启动配置
fixtures/sampling.jsonl  单独测试后端的宿主模型回复
tests/                  协议、配置、真实 harness 测试
scripts/                CLI、测试、打包与发布检查脚本
.github/workflows/      三平台 GitHub Release 工作流
manifest.json           Anna App manifest（schema 2）
app.json                App 本地名称与版本信息
dist/                   构建输出，忽略提交
releases/               本机二进制包，忽略提交
artifacts/              测试生成的证据，忽略提交
docs/ACCEPTANCE.md       逐项验收记录与发布证据
```

## 验证 App 与 Host storage

1. `npm run build && npm run validate`，随后 `npm run dev`。
2. 页面打开时，dashboard RPC LOG 应有 `window.hello` 与 `storage.get`。
3. 空内容或只有空白时，“保存笔记”不可用。
4. 保存两条笔记，输入框清空，列表显示内容与 `#01`、`#02`。日志显示 `storage.get`、`storage.set`。
5. 删除第一条，列表只剩 `#02`，日志中的 `storage.set` 只包含剩余笔记；再次添加得到 `#03`。
6. 仅重新加载 iframe 时可以从同一宿主 session 再读取笔记。刷新外层 dashboard 会新建 session；重启 dev 也会丢失内存数据，这两种情况不承诺保留。

存储键为 `notes`，值为 `{version:1,nextOrder,notes:[{id,content,order,createdAt}]}`。每次增删先 `get` 最新值，再 `set` 整个新对象；宿主写入成功后同步界面。React state 仅用于渲染，没有 localStorage、IndexedDB 或文件存储回退。为适配小笔记用途，界面限制每条 2,000 字符、最多 100 条、正文合计 100,000 字符，JSON 不超过 200 KiB。

`npm run test:harness` 在独立临时端口启动真正的官方 CLI，通过 harness 的 HTTP 转发接口调用真实 Host dispatcher，验证存储读写和工具路由。它不是浏览器点击测试；浏览器步骤见上。该测试不注入任何模拟 summary，结束后关闭它启动的进程。生成：

- `artifacts/harness-rpc.jsonl`：请求 namespace/method/args 与实际响应，不保存 session token。
- `artifacts/harness.stderr.log`：工具的反向 sampling 事件和宿主错误。

这两个文件是本项目的审计记录，不是 `anna-app fixture replay` 格式。浏览器 dashboard 的 record 功能另可录制官方格式；不要把带临时 token 或个人笔记的原始录制公开上传。

## 为什么 UI 点击总结会出现错误

在 `--no-llm` 下，点击“总结笔记”仍会：读取最新笔记 → `anna.tools.invoke` → 本地工具 → `sampling/createMessage`。宿主禁用模型后，返回：

```text
[tool_failed] [-32603] harness started with --no-llm
```

界面会显示“当前环境未开启 AI 总结”及原始诊断。它是题目要求的预期结果，表示调用已走到宿主模型边界；不是用前端 mock 伪造总结，也不代表工具 sampling 实现失败。不要给 App 的 `dev.mocks` 添加总结返回值。

## 独立验证后端 sampling

```sh
npm run test:sampling
```

脚本实际执行官方 CLI 的如下路径，使用结构化 argv 避免 Windows shell 的 JSON 引号问题：

```sh
anna-app executa dev --dir executas/mini-notes \
  --mock-sampling fixtures/sampling.jsonl \
  --invoke summarize --args '<包含 notes 数组的 JSON>' --json \
  --no-agent --no-image --no-upload --storage off
```

上面的 `--args` 是说明占位符；可以直接运行 `scripts/test-sampling.mjs` 内完整的调用。也可进入交互工具 runner：

```sh
npm run anna -- executa dev --dir executas/mini-notes --mock-sampling fixtures/sampling.jsonl --no-agent --no-image --no-upload --storage off
```

fixture 每行形如 `{ns:"sampling",method:"createMessage",result:{role:"assistant",content:{type:"text",text:"..."}}}`。fixture 由测试宿主读取，正式工具不读取 fixture、不包含固定总结。

运行后检查：

- `artifacts/sampling-cli.stdout.json`：`data.summary` 必须逐字等于 fixture 的 `result.content.text`。
- `artifacts/sampling-cli.stderr.log`：`sampling.request` 的 `method` 为 `sampling/createMessage`；`sampling.response` 使用相同 `rpc_id` 和 `invoke_id`。
- `npm run test:protocol`：自建测试宿主实际捕获工具 stdout 的 sampling 请求，再从 stdin 回复不同文本；验证输出透传、并发乱序关联、宿主错误、超时、EOF 和长驻多请求。

工具只记录方法和关联编号，不记录笔记正文、完整提示词或凭据。`metadata.executa_invoke_id` 带入当前执行编号；真实 harness 给出的 `context.invoke_id` 优先，独立 CLI 未提供时使用 `local:<请求id>`。

`npm run test:frontend` 在内存中构建真实前端服务模块，用单元测试替身验证存储限制、写入失败及返回值解包。这些替身仅存在于测试进程，不会进入 UI bundle 或替代上述两条官方集成路径。

## 手动测试 JSON-RPC

在终端启动正式工具（没有 banner，等待你输入是正常的）：

```sh
node executas/mini-notes/index.cjs
```

依次输入以下三行，每行回车。先等上一行响应，再输入下一行：

```jsonl
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2.0","capabilities":{"sampling":{}}}}
{"jsonrpc":"2.0","id":2,"method":"describe","params":{}}
{"jsonrpc":"2.0","id":3,"method":"invoke","params":{"tool":"summarize","arguments":{"notes":[{"id":"manual-1","order":1,"content":"修复登录 bug"}]},"context":{"invoke_id":"manual-invoke-1"}}}
```

此时工具输出一条 `method:"sampling/createMessage"` 的请求。复制其中的 `id`，把下面 `id` 的占位值替换后输入：

```jsonl
{"jsonrpc":"2.0","id":"替换为刚才的 sampling 请求 id","result":{"role":"assistant","content":{"type":"text","text":"手动宿主回复：优先修复登录问题。"},"model":"manual-test"}}
```

应看到 `id:3` 的响应，`data.summary` 是刚输入的宿主文本。再输入 `{"jsonrpc":"2.0","id":4,"method":"health"}`，仍能得到响应，证明进程未在一次请求后退出。发送 EOF 结束（Windows 控制台通常 Ctrl+Z 后回车；macOS Ctrl+D）。stderr 的结构日志与 stdout 协议帧是两个流，终端可能将它们一起显示。

`describe.result` 直接是 manifest，包含 `name/display_name/version/description/host_capabilities/tools/runtime`；工具参数为 Anna 的 `parameters[]`。JSON-RPC 2.0、Executa 协议 v2、App schema 2 是不同层的版本号。

## 固定版本兼容说明

实现与测试针对锁定版本，未修改 `node_modules` 或 Python vendor 包。

1. App 使用 schema 2，保留题面要求的 `permissions`。实际接口授权来自 `ui.host_api`；schema 3 已删除顶层 `permissions`，不能直接改数字升级。
2. runtime `0.2.0a30` 的 App `ExecutaPool` 未发送 `initialize`。`dev-launcher.cjs` 启动正式工具，真实发送并验证 v2 握手，然后透明双向转发原消息。它只拦截自己的握手响应，不改写业务参数、错误或模型内容。正式入口仍会拒绝未握手的 sampling。发布二进制不包含 launcher。
3. 同一 runtime 将反向 sampling 转发到 `llm.complete` 并复用 App ACL。因此 manifest 声明 `ui.host_api.llm:["complete"]`。这是该版本工具桥接所需授权；前端始终只调用 `anna.tools.invoke`，源码没有 `anna.llm.complete`。
4. `initialize` 同时返回题目要求的 `client_capabilities.sampling={}` 和部分文档中的 `capabilities.sampling={}`，两者一致。

## 本机二进制打包

```sh
npm run package:binary
```

脚本自动识别本机 OS/CPU，使用 `@yao-pkg/pkg` 内嵌 Node24 运行时，输出以下对应之一：

```text
releases/mini-notes-1.0.0-darwin-arm64.tar.gz
releases/mini-notes-1.0.0-darwin-x86_64.tar.gz
releases/mini-notes-1.0.0-windows-x86_64.zip
```

包根目录结构：

```text
manifest.json
bin/mini-notes-tool       # Windows 为 mini-notes-tool.exe
```

根 manifest 的 `runtime.binary.entrypoint` 指向上述入口，`permissions` 声明可执行权限。运行包不需要额外安装 Node.js。脚本在归档前和解包后都启动真实二进制，执行 initialize、describe、invoke 与反向 sampling smoke；成功后才替换最终文件。macOS 的可执行位会被检查。不做代码签名、公证或 Authenticode。

v1.0.0 已通过下述 workflow 完成三平台原生构建与二进制实际执行；本机命令只生成当前平台对应的包。

## GitHub Release

`.github/workflows/release.yml` 支持：

- GitHub Actions 页手动运行 **Release Executa binaries**。
- 推送 `v1.0.0` 一类版本标签。标签必须匹配根 package、app metadata 与工具 manifest 的版本。

发布前 verify job 构建前端，执行严格 validate、协议测试、fixture sampling 和真实 harness 测试。随后分别在 Apple Silicon macOS、Intel macOS、Windows x64 runner 原生打包并 smoke。最后一个 job 检查三包齐全，上传同一个 **GitHub Release 的 assets**；Actions artifacts 只是 job 之间传文件的中间产物。手动触发同样会创建/更新 Release，不会只留下 Actions artifacts。

仓库 Actions 需启用；release job 使用 `contents: write` 的 `GITHUB_TOKEN`。更改代码后再次发布，应同步更新三个版本字段并使用新标签；workflow 会拒绝把不同代码附到已有版本标签。

当前完成情况及真实执行边界见 [验收记录](docs/ACCEPTANCE.md)。

## 概念对应

- **App manifest** 声明 UI、依赖工具和授权；**bundle** 是 `dist/` 里的网页资源。
- **Executa** 是独立进程，`tool_id` 在 App、前端常量、发现配置和工具 `name` 中统一为 `tool-dev-mini-notes`。
- **Anna storage / APS KV** 是平台存储接口；本题选 legacy 内存 runtime_state，不承诺跨 dashboard session 或进程重启持久化。
- **sampling** 是工具借用宿主模型；测试 fixture 在工具测试宿主里替代真实模型。
- **binary archive** 是可安装的工具发布包，与浏览器 UI bundle 分开。

参考：[Anna 开发文档](https://staging.anna.partners/developers)、[示例仓库](https://github.com/whtcjdtc2007/anna-executa-examples)、[二进制分发规范](https://staging.anna.partners/developers/tools/executa-binary)。
