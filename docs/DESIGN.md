# openrtk 设计文档

## 概述

openrtk 是一个 OpenCode 插件，通过将 shell 命令透明地重写为 `rtk` 等价命令，实现 60-90% 的 LLM token 节省。插件本身不包含任何过滤/压缩逻辑——它是纯粹的"薄代理"（thin delegate），所有重写规则由 RTK Rust 二进制的 `rtk rewrite` 命令提供。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenCode 运行时                                                 │
│                                                                 │
│  ┌───────────┐    ┌──────────────────┐    ┌─────────────────┐  │
│  │ AI Agent  │───►│  tool.execute    │───►│  Shell (bash)   │  │
│  │ (LLM)     │    │  .before hook    │    │  执行实际命令    │  │
│  └───────────┘    └──────┬───────────┘    └─────────────────┘  │
│                          │                                      │
│                   ┌──────▼───────┐                              │
│                   │  openrtk     │                              │
│                   │  plugin      │                              │
│                   │              │                              │
│                   │ ┌──────────┐ │     ┌───────────────────┐   │
│                   │ │ rewrite  │─┼────►│  rtk rewrite      │   │
│                   │ │ .ts      │ │     │  (Rust 子进程)     │   │
│                   │ └──────────┘ │     │  70+ 重写规则      │   │
│                   │ ┌──────────┐ │     └───────────────────┘   │
│                   │ │ tracker  │ │                              │
│                   │ │ .ts      │ │                              │
│                   │ └──────────┘ │                              │
│                   └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

**三个模块，职责分明：**

| 模块 | 文件 | 职责 |
|------|------|------|
| Plugin 入口 | `src/index.ts` | 注册 hook、过滤工具类型、协调 rewrite 与 tracker |
| 重写代理 | `src/rewrite.ts` | 调用 `rtk rewrite` 子进程，返回重写结果 |
| 会话追踪 | `src/tracker.ts` | 内存计数器，记录重写次数和示例 |

---

## 注入机制：如何进入 OpenCode 工作流

### 1. 插件发现与加载

OpenCode 启动时读取配置文件（`opencode.json` 或 `.opencode/config.json`）：

```json
{
  "plugins": ["@cafeng/openrtk"]
}
```

OpenCode 通过 npm 包名 `openrtk` 找到插件，加载 `package.json` 中 `"main"` 指向的入口文件：

```json
{
  "main": "src/index.ts"
}
```

**关键点：没有构建步骤。** OpenCode 原生运行 TypeScript，`src/index.ts` 直接作为入口被导入，无需编译为 JavaScript。

### 2. 插件初始化

OpenCode 调用导出的 Plugin 函数，注入运行时上下文 `{ $ }`：

```typescript
// src/index.ts
export const rtkPlugin: Plugin = async ({ $ }) => { ... }
export default rtkPlugin
```

- `rtkPlugin` 是命名导出，也是默认导出（`export default`）
- `{ $ }` 是 OpenCode 提供的 shell 工具函数（基于 zx 库），允许插件执行命令
- 插件返回一个对象，其键名是 hook 名称，值是对应的处理函数

### 3. Hook 注册

插件返回两个 hook 处理器：

```typescript
return {
  "tool.execute.before": (input, output) => { ... },
  "tool.execute.after": () => {},
}
```

OpenCode 将这两个函数注册到工具执行生命周期的对应阶段：

| Hook | 触发时机 | 用途 |
|------|---------|------|
| `tool.execute.before` | 工具执行**前** | 拦截、修改即将执行的命令 |
| `tool.execute.after` | 工具执行**后** | 当前为空，预留扩展点 |

---

## 命令重写流程（核心路径）

### 完整执行流

```
AI 发出: "运行 git status 查看仓库状态"
    │
    ▼
OpenCode 解析为 tool call: { tool: "bash", args: { command: "git status" } }
    │
    ▼
触发 tool.execute.before hook
    │
    ▼
┌─ openrtk plugin handler ──────────────────────────────┐
│                                                        │
│  1. 工具过滤                                           │
│     input.tool = "bash" → 小写 → 匹配 "bash"/"shell"  │
│     ✓ 通过。其他工具 (Read/Grep/Glob) 直接 return     │
│                                                        │
│  2. 提取命令                                           │
│     output.args.command = "git status"                 │
│     类型检查: string 且非空 ✓                          │
│                                                        │
│  3. 重写委托                                           │
│     rewrite("git status")                              │
│       │                                                │
│       ├─ 空命令检查: "" → return null                  │
│       ├─ rtk 前缀检查: "rtk xxx" → return null         │
│       └─ 调用子进程:                                   │
│          execFileSync("rtk", ["rewrite", "git status"])│
│              │                                         │
│              ▼ (Rust 进程)                             │
│          rtk rewrite 查询注册表:                       │
│            70+ 模式匹配 git/cargo/npm/docker...        │
│            匹配到 git status → 输出 "rtk git status"   │
│              │                                         │
│          返回: "rtk git status"                        │
│                                                        │
│  4. 命令替换                                           │
│     output.args.command = "rtk git status"  ← 原地修改 │
│                                                        │
│  5. 记录追踪                                           │
│     tracker.record("git status", "rtk git status")    │
│                                                        │
└────────────────────────────────────────────────────────┘
    │
    ▼
OpenCode 执行: rtk git status
    │
    ▼
输出压缩后的结果 (~200 tokens, 原本 ~2000)
    │
    ▼
AI 看到压缩结果，完全不知道中间发生了重写
```

### `tool.execute.before` 签名

```typescript
(input: any, output: any) => void
```

- **`input`**（只读）: 包含 `tool` 属性，标识工具类型（`"bash"`, `"shell"`, `"Read"` 等）
- **`output`**（可变）: 包含 `args` 属性，其中 `args.command` 是即将执行的命令字符串。**修改此对象会直接影响实际执行**

这是 OpenCode 插件 API 的设计——`output` 是引用传递，修改它的属性会改变后续执行行为。

---

## 重写代理：`rewrite.ts`

### 设计决策

```
                  ┌──────────────────────────────┐
                  │   两种实现策略                 │
                  │                              │
   ┌──────────────┴──────────────┐               │
   │                             │               │
   ▼                             ▼               │
 硬编码规则                    子进程委托          │
 (参考 openrtk)              (我们的选择)         │
                              │                  │
 60+ 条正则写死在 TS         所有规则在 Rust      │
 需要与 rtk 同步更新         rtk 更新即自动生效    │
 新增规则需发新版             零维护成本           │
```

### 实现细节

```typescript
import { execFileSync } from "node:child_process"

const RTK_TIMEOUT_MS = 2000
const RTK_PREFIX_RE = /^(.*\/)?rtk\s/

export function rewrite(command: string): string | null {
  if (!command || RTK_PREFIX_RE.test(command)) return null
  try {
    const result = execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: RTK_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    return result && result !== command ? result : null
  } catch {
    return null
  }
}
```

**逐行解析：**

| 行 | 作用 | 设计考量 |
|----|------|---------|
| `execFileSync` | 同步调用子进程 | 阻塞式——hook 必须同步返回修改结果，异步无法影响命令执行 |
| `["rewrite", command]` | 参数数组传递 | **不使用** 模板字面量 `rtk rewrite ${cmd}`，避免 shell 注入风险 |
| `timeout: 2000` | 2 秒超时 | 防止 rtk 卡死阻塞整个命令执行 |
| `stdio: ["pipe", "pipe", "pipe"]` | 捕获所有输出 | stdin/stdout/stderr 全部管道化，不污染控制台 |
| `.trim()` | 去除尾部换行 | rtk rewrite 输出带换行符 |
| `result !== command` | 防止无意义替换 | 如果重写结果与输入相同，视为无需重写 |
| `catch { return null }` | 全捕获异常 | 任何错误（rtk 不存在、超时、崩溃）都静默降级 |

### `rtk rewrite` 的退出码契约

| 退出码 | 含义 | 插件行为 |
|--------|------|---------|
| 0 + stdout | 命令被重写 | 使用 stdout 作为新命令 |
| 0 + stdout == input | 命令无变化 | 不重写 |
| 1 | 无 RTK 等价命令 | 不重写 |
| 2 | deny 规则匹配 | 忽略（OpenCode 有自己的权限模型） |
| 3 | ask 规则匹配 | 忽略 |
| 其他 / 异常 | rtk 崩溃或未安装 | 不重写，原命令照常执行 |

### 前置守卫

TypeScript 层面有两个前置检查，**在调用子进程之前**短路返回：

1. **空命令**: `!command` → `null`
2. **已 rtk 前缀**: `/^(.*\/)?rtk\s/` 匹配 → `null`

这避免了不必要的子进程调用（如 `rtk rewrite "rtk git status"` 会导致双重写）。

---

## 会话追踪：`tracker.ts`

### 数据结构

```typescript
class Tracker {
  private count = 0                                          // 重写总次数
  private examples: Array<{ original: string;                // 最多保留 5 个示例
                             rewritten: string }> = []
}
```

### 生命周期

```
插件初始化时: new Tracker()      ← 每个 OpenCode 会话一个实例
    │
    ▼
每次成功重写: tracker.record("git status", "rtk git status")
    │           → count++
    │           → examples.push(...) (≤5 个)
    ▼
会话结束时:   tracker.summary()
              → 输出统计摘要
```

### 内存模型

```
Tracker 实例
┌────────────────────────────────────┐
│  count: 15                         │
│  examples: [                       │
│    { "git status", "rtk git status"},    ← 最多展示 3 个
│    { "cargo test", "rtk cargo test"},
│    { "docker ps",  "rtk docker ps" },
│    ...                                     (最多存储 5 个)
│  ]                                  │
└────────────────────────────────────┘
         纯内存，无持久化
         会话结束即消失
```

### 为什么不做 Token 统计

Token 节省的精确计算需要对比原始输出和压缩输出的 token 数量。这个数据在 RTK Rust 端（通过 SQLite `~/.local/share/rtk/tracking.db`）已经完整追踪。TypeScript 插件只做**重写次数统计**，详细数据通过 `rtk gain` 命令获取。

---

## 降级策略

插件的核心设计原则：**永不阻塞命令执行。**

```
                    命令即将执行
                        │
              ┌─────────▼─────────┐
              │ 插件是否已加载?     │
              │ (rtk 可用性检查)   │
              └────┬─────────┬────┘
                   │         │
                可用       不可用
                   │         │
                   ▼         ▼
            注册 hooks    返回 {} (空对象)
                   │         │
                   ▼         ▼
            hook 被调用    hook 不存在
                   │         │
              ┌────▼────┐    │
              │ 重写    │    │
              │ 成功?   │    │
              └┬────┬───┘    │
           成功  失败         │
               │    │         │
               ▼    ▼         ▼
          替换命令  保持原样  保持原样
               │    │         │
               └────┴─────────┘
                    │
                    ▼
              命令正常执行
```

每种故障场景的具体行为：

| 故障 | 发生位置 | 行为 | 影响 |
|------|---------|------|------|
| rtk 未安装 | `checkRtk($)` | 插件返回 `{}`，不注册任何 hook | 零影响 |
| `which rtk` 超时 | `checkRtk($)` | 缓存为 false，后续不再检查 | 零影响 |
| `execFileSync` 抛异常 | `rewrite()` | catch 返回 null | 原命令执行 |
| 子进程超时（2s） | `rewrite()` | Node.js 抛 ETIMEDOUT，被 catch | 原命令执行 |
| rtk 二进制崩溃 | `rewrite()` | 非 0 退出码，被 catch | 原命令执行 |
| output.args 为 undefined | `index.ts` handler | 提前 return | 无操作 |

---

## 性能考量

### 每次命令的额外开销

```
普通 bash 命令:     AI → OpenCode → bash → 执行
带 openrtk:         AI → OpenCode → hook → execFileSync("rtk rewrite") → bash → 执行
                                       ↑
                                   ~5-10ms
                              (同步子进程开销)
```

- `execFileSync` 是同步调用，会在 hook 阶段阻塞 ~5-10ms
- 2 秒超时确保最坏情况下不会长时间阻塞
- `checkRtk` 结果被缓存（`rtkAvailable: boolean | null`），只检查一次
- 前置守卫（空命令、已 rtk 前缀）在 TypeScript 层短路，避免子进程调用

### 内存占用

```
插件加载:    ~1 MB (TypeScript 模块)
Tracker:    ~1 KB (计数器 + 最多 5 条记录)
每次 hook:   无持久分配 (纯函数式调用)
```

---

## 文件清单

```
/home/cafeng/projects/openrtk/
├── package.json          # npm 包配置，main: "src/index.ts"
├── tsconfig.json         # TypeScript 配置，无构建输出
├── .gitignore            # node_modules/
├── opencode.md           # 系统提示词（教 AI 使用 rtk 元命令）
├── README.md             # 安装与使用文档
└── src/
    ├── index.ts          # 插件入口，hook 注册与协调
    ├── rewrite.ts        # rtk rewrite 子进程包装器
    ├── tracker.ts        # 会话级重写计数器
    ├── index.test.ts     # 插件集成测试（14 个）
    ├── rewrite.test.ts   # 重写模块测试（6 个）
    └── tracker.test.ts   # 追踪模块测试（5 个）
```

**总计：** 102 行生产代码 + 25 个测试，所有重写逻辑由 RTK Rust 二进制提供。
