# 麟飞科技 API 接入指南

通过统一接口连接平台开放的模型。已有支持 OpenAI Chat Completions 的应用，可以将请求地址、平台 API Key 和模型 ID 改为平台提供的值。

本版更新于 **2026-11-05（香港时间）**。模型范围来自当天线上公开目录，共 18 个条目；接口格式同时对照项目源码。未使用真实 API Key 逐模型调用，文中成功响应及 Token 数为结构示例。

## 地址与协议

| 配置项 | 当前值 |
| --- | --- |
| 平台控制台 | `http://linfeimodel.fivemiao.com:18080` |
| 当前测试 API 根地址 | `http://linfeimodel.fivemiao.com:18080` |
| OpenAI 兼容客户端 Base URL | `http://linfeimodel.fivemiao.com:18080/v1` |
| 模型发现 | `GET /v1/models` |
| 文本对话 | `POST /v1/chat/completions` |
| 请求编码 | UTF-8 JSON |
| 普通响应 | `application/json` |
| 流式响应 | `text/event-stream`（SSE，须确认模型支持） |

当前公开入口使用 HTTP，请仅在受控测试中使用无敏感内容及测试凭据。正式业务接入应使用平台管理员提供、证书有效的 HTTPS 地址。不要自行把当前地址改为 HTTPS 后假定服务可用。

直接发送 HTTP 请求时，把根地址与完整路径拼接，例如 `${BASE_URL}/v1/chat/completions`。客户端若已自动附加 `/chat/completions`，则配置带 `/v1` 的 Base URL。避免出现 `/v1/v1` 或把其他服务地址混入配置。

## 第一步：准备平台 API Key

登录麟飞科技控制台，在 API 密钥／令牌管理中创建用于应用调用的密钥，按需设置额度、有效期、模型权限和 IP 限制。若页面名称因权限或版本不同而变化，请联系平台管理员。

使用平台签发的 API Key，并通过请求头传递：

```http
Authorization: Bearer <平台 API Key>
Content-Type: application/json
```

控制台登录密码、浏览器 Cookie、管理用途的访问令牌及其他服务的 API Key 均不能作为这里的接入凭据。请在服务端环境变量或密钥管理服务中保存 Key，不要写入网页代码、公开仓库、URL、截图或共享文档。

## 第二步：查询自己的模型列表

以下 Bash 示例使用环境变量。`BASE_URL` 是不含 `/v1` 的根地址，`LFTECH_API_KEY` 从你自己的安全运行环境注入；不要把真实密钥复制进文档。

```bash
export BASE_URL='http://linfeimodel.fivemiao.com:18080'
# 请在安全运行环境中注入 LFTECH_API_KEY
curl --fail-with-body --show-error "${BASE_URL}/v1/models" \
  -H "Authorization: Bearer ${LFTECH_API_KEY}"
```

从返回的 `data[].id` 选取模型。不同账号、分组和令牌的可见模型可能不同。静态目录中列出的模型不一定对当前令牌开放，也不表示所有功能都已验证。

## 第三步：发送第一条请求

`qwen3.7-flash` 是本版目录中的示例 ID；如果你的模型列表没有它，请替换为自己可见、已确认支持文本对话的 ID。

```bash
curl --fail-with-body --show-error "${BASE_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${LFTECH_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3.7-flash",
    "messages": [{"role": "user", "content": "你好，请用一句话介绍自己。"}],
    "stream": false
  }'
```

成功时从 `choices[0].message.content` 读取普通文本。HTTP 非 2xx、返回 `error`，或模型列表返回 `success: false` 时均按失败处理。流式场景详见“流式调用与多轮对话”。

## 本版能力边界

当前公开目录仅登记 Chat Completions 协议。不能仅凭模型名字断言其支持图片、视频、工具、结构化输出、推理模式或某个上下文长度。模型条目 `wan3.0-video` 的名字与聊天协议标注不一致，其视频接入方式待确认。

其他文本协议已有未来扩展位置；本版不将它们列为平台已开放接口。平台所用网关基于 New API / QuantumNous 开源项目，源码支持范围与本平台上线范围分别维护。

---

# 模型目录与能力说明

本目录是 **2026-11-05** 平台公开模型目录的快照。模型 ID 必须按原样传递；不要自行省略版本、后缀或改变大小写。平台可能使用模型别名，名称本身不代表其已验证的功能范围。

## 目录中的模型

以下条目均已登记文本对话协议，使用 `POST /v1/chat/completions`。这是**配置登记状态**，尚未逐项完成带密钥的成功调用验收。

| 精确模型 ID | 说明 |
| --- | --- |
| `gpt-5.5` | 已登记聊天协议 |
| `gpt-5.6-sol` | 已登记聊天协议 |
| `gpt-5.6-terra` | 已登记聊天协议 |
| `gpt-6-astra` | 已登记聊天协议 |
| `gpt-6-luna` | 已登记聊天协议 |
| `gpt-6-sol` | 已登记聊天协议 |
| `gpt-6.1-sol` | 已登记聊天协议 |
| `gemini-2.5-flash` | 已登记聊天协议，其他协议支持情况待确认 |
| `gemini-3-flash-preview` | 已登记聊天协议，保留完整 preview 后缀 |
| `gemini-3.1-pro-preview` | 已登记聊天协议，保留完整 preview 后缀 |
| `gemini-3.5-flash` | 已登记聊天协议 |
| `gemini-3.8-flash` | 已登记聊天协议 |
| `deepseek-v4.1-flash` | 已登记聊天协议 |
| `qwen3.7-flash` | 已登记聊天协议；文中最小请求示例使用此 ID |
| `kimi-k3.1-pro` | 已登记聊天协议 |
| `kimi-k3.1-pro-highspeed` | 已登记聊天协议，保留 highspeed 后缀 |
| `codex-auto-review` | 已登记聊天协议；专用参数及适用范围待确认 |
| `wan3.0-video` | 目录仅标注聊天协议；视频生成方法及任务协议待确认 |

## 运行时发现

使用自己的平台 API Key 请求 `GET /v1/models`。列表受账号与令牌的分组、模型限制及平台配置影响。即使模型出现在列表中，模型服务也可能暂时不可用；调用失败时检查错误内容。

响应结构示例，不是本次带密钥请求的真实返回：

```json
{
  "success": true,
  "object": "list",
  "data": [
    {
      "id": "qwen3.7-flash",
      "object": "model",
      "created": 1626777600,
      "supported_endpoint_types": ["openai"]
    }
  ]
}
```

`created` 可能是网关固定元数据，不能用作模型发布或平台上线日期。客户端应允许新字段出现，并识别 HTTP 200 下的 `success: false` 失败结果。

## 尚未确认的能力

本版没有为这些模型填写未经验证的上下文长度、最大输出、图片输入、联网、工具调用、JSON Schema、推理预算、速度或 SLA。先使用仅包含 `model`、文本 `messages` 和 `stream` 的最小请求；需要高级能力时以平台针对该模型的能力说明与实测为准。

价格、优惠及额度条件以控制台实际展示和调用记录为准。本版不固定金额，不把 `usage.total_tokens` 直接换算为应付金额。

## 目录会继续扩展

同协议新增模型时，继续复用 Chat Completions 接口，只需更新模型目录及针对该模型的能力记录。请求字段 `model` 使用开放字符串，不把本版 18 项固化为封闭枚举。

新协议或新任务类型上线后，将在对应能力章节提供接口、参数、响应及验收状态。预留章节不代表已经可以调用。

---

# 文本对话接口

```http
POST /v1/chat/completions
Authorization: Bearer <平台 API Key>
Content-Type: application/json
```

请求体按 OpenAI Chat Completions 兼容结构组织。具体功能以平台针对该模型的说明为准，不同模型的高级参数支持情况可能不同。

## 常用请求字段

| 字段 | 必填 | 类型 | 使用说明 |
| --- | --- | --- | --- |
| `model` | 是 | string | 当前令牌可见的精确模型 ID；新增模型沿用同一字段 |
| `messages` | 是 | array | 按时间顺序传入对话消息；至少一条 |
| `messages[].role` | 是 | string | 普通对话使用 `user` 和 `assistant`；`system`、`developer`、`tool` 支持情况按模型确认 |
| `messages[].content` | 普通文本消息必填 | string | 普通文本直接传字符串；图片内容数组及工具消息仅在模型明确支持时使用 |
| `stream` | 否 | boolean | 默认按非流式处理；`true` 请求 SSE，须确认模型支持 |
| `stream_options.include_usage` | 否 | boolean | 仅在流式且所选模型支持时请求统计事件；初次接入建议省略 |
| `temperature`、`top_p` | 否 | number | 模型可选采样参数，是否支持及范围由模型决定；初次接入建议省略 |
| `tools`、`tool_choice` | 否 | array / string / object | 仅已确认工具调用能力的模型使用 |
| `response_format` | 否 | object | 仅已确认结构化输出能力的模型使用 |

本表只列接入所需的核心及常见可选字段。不要把未记录的参数直接批量套到所有模型。若请求被拒绝，先还原成最小文本请求，再逐项增加参数。

## 普通请求示例

```json
{
  "model": "qwen3.7-flash",
  "messages": [
    {"role": "user", "content": "请写一句简短的欢迎语。"}
  ],
  "stream": false
}
```

响应结构示例，内容及 Token 数均为构造数据：

```json
{
  "id": "chatcmpl-example",
  "object": "chat.completion",
  "created": 0,
  "model": "qwen3.7-flash",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "欢迎使用麟飞科技模型平台。"},
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": 20, "completion_tokens": 18, "total_tokens": 38}
}
```

普通文本读取 `choices[0].message.content`。应先确认 `choices` 非空，并检查是否为工具调用或其他输出。请保存请求中的模型 ID，排查时结合平台调用记录判断。

## 完成原因

| `finish_reason` | 应用处理 |
| --- | --- |
| `stop` | 正常结束，或遇到停止条件 |
| `length` | 输出受限或被截断，不应当作完整答案 |
| `tool_calls` | 应用应处理工具调用，而非只读取文本 |
| `content_filter` | 内容受到安全过滤 |
| 其他值或 null | 按模型返回处理；流式中间事件常见 null |

`usage` 是统计信息，字段可能随模型变化或缺失，不能作为扣费金额。不要依赖响应中的所有扩展字段都始终存在。

## 工具调用和图片输入

这些属于条件能力，本次没有逐模型验证。需要时先取得明确能力说明。工具调用由应用执行：模型返回调用要求后，应用校验参数、执行获准操作，再回传对应 `tool_call_id` 的结果；网关不会自动执行你声明的业务工具。

图片输入要求模型支持视觉理解；模型名称中出现某个品牌或版本并不足以证明支持图片。本版不提供未经验证的图片、联网或视频生成调用示例。

---

# 流式调用与多轮对话

## 请求 SSE

在同一个 Chat Completions 接口中设置 `stream: true`。下例须使用已确认支持流式输出的模型。Bash 环境中的 `BASE_URL` 不含 `/v1`。

```bash
curl --fail-with-body --show-error --no-buffer "${BASE_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${LFTECH_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3.7-flash",
    "messages": [{"role": "user", "content": "请写一句欢迎语。"}],
    "stream": true
  }'
```

响应使用 `text/event-stream`。以下为简化的结构示例，每条事件以空行结束：

```text
data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{"content":"欢迎"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{"content":"使用麟飞科技。"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

## 正确读取流

1. 先检查 HTTP 状态与 `Content-Type`。流建立前的失败通常是普通错误响应。
2. 增量解码 UTF-8，保存不完整行及不完整事件；网络分块可能切断一个汉字或 JSON 文本，不能直接逐块 `JSON.parse`。
3. 按 SSE 规则解析事件：空行分隔事件，多条 `data:` 行拼接，忽略注释、心跳和空数据。
4. 遇到 `[DONE]` 结束。其余 `data` 按 JSON 解析；若存在 `error`，按失败处理。
5. 按 `choices[].index` 分别累积 `delta.content`，跳过角色信息、空 delta 和没有 choices 的统计事件。工具增量、推理内容等须单独按已确认的模型协议处理。
6. 到达 `finish_reason` 后仍继续读取结束事件及可能的 usage。流断开而未见完整结束条件时，记录为中断，避免把部分文本当作完整成功。

`stream_options.include_usage: true` 只在对应模型支持时使用。统计事件可能包含空的 `choices`；缺少 usage 不等于零 Token。反向代理应支持持续输出，应用应允许用户主动取消，并配置合理的读取超时。

流中断后再次提交可能产生第二次模型调用和费用，不要盲目自动重试，也不要假设此接口提供幂等键或断点续传。

## 多轮对话

每轮请求自行携带需要的历史记录。不要把 `chatcmpl-...` 响应 ID 当作下一轮上下文句柄。

```json
{
  "model": "qwen3.7-flash",
  "messages": [
    {"role": "user", "content": "请记住项目代号是青竹。"},
    {"role": "assistant", "content": "好的，项目代号是青竹。"},
    {"role": "user", "content": "项目代号是什么？"}
  ],
  "stream": false
}
```

按业务需要压缩历史并保护用户内容。上下文上限与输出长度限制须按具体模型确认，本版不填写推测数值。

---

# 代码示例与接入调试

以下示例使用 Python 标准库和 JavaScript 内置 fetch，避免绑定某个 SDK 版本。示例未使用真实平台 Key 实测。执行前在安全运行环境中配置 `BASE_URL`（站点根地址，不含 `/v1`）和 `LFTECH_API_KEY`，可选 `LFTECH_MODEL`。

当前测试入口为 `http://linfeimodel.fivemiao.com:18080`；正式业务请改用管理员提供的有效 HTTPS 入口。

## Python：普通文本对话

```python
import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base_url = os.environ["BASE_URL"].rstrip("/")
payload = {
    "model": os.environ.get("LFTECH_MODEL", "qwen3.7-flash"),
    "messages": [{"role": "user", "content": "你好，请用一句话介绍自己。"}],
    "stream": False,
}
request = Request(
    f"{base_url}/v1/chat/completions",
    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {os.environ['LFTECH_API_KEY']}",
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urlopen(request, timeout=120) as response:
        result = json.load(response)
except HTTPError as error:
    # 生产环境向受控排查通道提供脱敏信息；不要输出完整请求头或密钥。
    raise RuntimeError(f"模型调用失败，HTTP {error.code}") from None
if result.get("error") or result.get("success") is False:
    raise RuntimeError("模型调用返回错误，请检查受控日志中的脱敏响应")
choices = result.get("choices") or []
if not choices:
    raise RuntimeError("响应中没有 choices")
message = choices[0].get("message") or {}
print(message.get("content") or "")
```

这是一份普通文本示例，不会执行工具调用或解析 SSE。网络错误和读取超时由应用结合业务处理；不要默认重试所有失败。

## JavaScript：服务端 fetch

使用支持内置 fetch 的服务端 JavaScript 运行环境。不要把平台 Key 暴露到浏览器前端或公开构建变量中。

```javascript
const baseUrl = process.env.BASE_URL?.replace(/\/+$/, '')
const apiKey = process.env.LFTECH_API_KEY
if (!baseUrl || !apiKey) throw new Error('缺少 BASE_URL 或 LFTECH_API_KEY')

const response = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: process.env.LFTECH_MODEL || 'qwen3.7-flash',
    messages: [{ role: 'user', content: '你好，请用一句话介绍自己。' }],
    stream: false,
  }),
  signal: AbortSignal.timeout(120_000),
})
if (!response.ok) throw new Error(`模型调用失败，HTTP ${response.status}`)
const result = await response.json()
if (result.error || result.success === false) throw new Error('模型调用返回错误')
if (!result.choices?.length) throw new Error('响应中没有 choices')
console.log(result.choices[0].message?.content || '')
```

客户端 SDK 或第三方应用通常需要带 `/v1` 的 Base URL；本页直接 HTTP 示例使用根地址加完整路径，两者不要混用。先确认第三方应用使用 Chat Completions，不能只替换地址就假设其他协议也已开通。

## 使用这份文档

左侧目录可跳转到快速开始、模型目录、代码示例、错误排查及未来能力章节；搜索框可查找模型 ID 或字段。

接口参考位于指南之后，包含两个平台接口、请求示例、JSON 与 SSE 响应及公共数据模型。文档右上角可以下载 OpenAPI 定义，导入支持 OpenAPI 的开发工具。

先在自己的安全运行环境中配置平台 API Key，再查询模型列表并运行最小文本示例。本公开站点仅展示文档，不提供在线发送模型请求的入口。

---

# 错误处理与排查

先检查 HTTP 状态码、`Content-Type` 与响应体，再判断是否重试。不同错误场景的响应结构可能不同，不能假设每次都会返回相同 JSON 或固定错误文案。

常见错误结构示例，不是本次线上响应原文：

```json
{
  "error": {
    "message": "错误说明",
    "type": "invalid_request_error",
    "param": null,
    "code": "错误标识"
  }
}
```

少数模型发现失败还可能返回 HTTP 200 和 `{"success": false, "message": "..."}`。空响应、HTML 错误页或不符合预期的 JSON 均应进入错误处理，不要仅用“HTTP 200”判断业务成功。

| 现象 | 建议排查 | 重试建议 |
| --- | --- | --- |
| 400 | JSON、字段类型、模型 ID、参数组合，以及模型是否支持该功能 | 修正请求后再试 |
| 401 | 是否携带 Bearer Key、Key 是否有效、是否误用管理访问令牌或其他服务的 Key | 更新配置后再试 |
| 403 | 账号状态、模型或分组权限、IP 限制、账号及令牌额度；具体以错误说明为准 | 解除对应限制后再试 |
| 404 | 根地址、端口、`/v1` 是否重复、协议路径及资源是否存在 | 修正地址后再试 |
| 429 | 平台限流、并发及请求频率 | 若有 Retry-After 则遵守；否则有上限地退避 |
| 5xx | 模型服务暂时不可用 | 仅对适合重试的业务有限退避 |
| 网络中断或超时 | DNS、端口、网络、客户端超时及代理配置 | 先判断请求是否已被执行，避免重复调用 |
| SSE 返回了部分内容后断开 | 读取超时、代理缓冲或模型服务中断 | 标记结果不完整，不盲目重放 |
| 列表有模型但调用失败 | 当前令牌权限、模型服务状态、模型参数及平台配置 | 先用最小文本请求定位 |

不同错误场景的状态码可能不同；错误内容与调用记录应结合判断。本接口不承诺通用幂等性，自动重试可能产生多次调用及费用。

## 建议排查顺序

1. 确认使用麟飞平台地址，根地址不含重复 `/v1`。
2. 用同一 Key 查询 `GET /v1/models`，取得精确模型 ID。
3. 将对话缩减到一条短 `user` 文本，移除高级参数，关闭流式。
4. 检查账号和令牌额度、有效期、分组、模型权限及 IP 条件。
5. 若普通请求成功而 SSE 失败，单独排查流式能力、代理及读取逻辑。

联系平台支持时，提供发生时间及其时区、请求方法和路径、请求模型 ID、HTTP 状态、脱敏错误内容、是否流式，以及平台返回的请求标识（若有）。不要提交 Key、Cookie、密码、完整认证头或包含隐私的用户输入。

Token 用量与账户金额是不同信息。核对费用时以控制台实际调用记录和当时价格条件为准，文档示例中的 Token 数不是报价或收费承诺。

---

# 未来能力与模型扩展

此页为后续模型与能力预留结构。**下列预留项未在本版确认上线，不构成可调用接口或上架时间承诺。** 模型目录有新条目时，仍须确认令牌权限、协议及对应能力。

## 预留能力分区

| 分区 | 后续可补充内容 | 本版状态 |
| --- | --- | --- |
| 文本模型 | 同一 Chat Completions 协议下新增模型、能力及差异参数 | 已建立可扩展结构 |
| Responses | 请求、输入类型、流式事件、状态管理及兼容边界 | 预留，未确认上线 |
| 其他文本协议 | 请求格式、版本兼容、流式事件及模型适用范围 | 预留，未确认上线 |
| 图片理解 | 支持视觉输入的模型、文件格式、输入限制及安全访问条件 | 预留，未逐模型确认 |
| 图像生成与编辑 | 生成、编辑、输出格式及模型差异 | 预留，未确认上线 |
| 音频 | 语音识别、翻译、合成、输入格式及返回媒体类型 | 预留，未确认上线 |
| 视频生成 | 提交、轮询、终态、错误、结果下载、保留期限及各模型差异 | 预留；wan3.0-video 接入方式待确认 |
| 向量嵌入 | 输入类型、维度、批量限制及模型版本 | 预留，未确认上线 |
| 重排 | 文档列表、返回索引、分数及截断规则 | 预留，未确认上线 |
| 实时交互 | 连接建立、事件、会话生命周期及认证方式 | 预留，未确认上线 |

## 新增模型的记录模板

| 项目 | 待填写信息 |
| --- | --- |
| 精确模型 ID | 按平台实际返回填写，不自行推断 |
| 显示名称与说明 | 说明用途和用户可见名称 |
| 协议与接口 | 列明实际支持的请求格式、方法及路径 |
| 开放范围 | 说明账号或令牌可用条件 |
| 输入与输出 | 文本、图片、音频等；明确支持和限制 |
| 已验证能力 | 非流式、流式、工具调用、结构化输出分别记录 |
| 参数差异 | 必填字段、默认行为、限制和不支持的参数 |
| 上下文与输出限制 | 只填写可核验的值及来源 |
| 计量和价格入口 | 指向控制台有效价格信息，明确单位及适用条件 |
| 验收状态 | 目录登记、联调中、已验收、灰度或下架 |
| 验证记录 | 日期、环境、验证项目、实际结果及遗留问题 |
| 变更与下架 | 生效日期、影响及迁移方式 |

同协议新增模型继续复用现有请求及响应模型，不为每个模型复制同一接口。只有协议、请求结构或任务生命周期实际不同，才增设接口文档。

异步任务类能力上线时，应完整说明提交响应、任务归属、状态轮询、失败终态、结果过期及重试行为，不能只提供一个提交接口。状态命名、下载地址及计量规则均以上线后的实际合同为准。

## 本版变更记录

| 日期 | 内容 |
| --- | --- |
| 2026-11-05 | 首版；按线上公开目录记录 18 个模型条目；建立模型发现与 Chat Completions 定义、普通及 SSE 示例、错误说明与未来能力分区；尚未完成逐模型带密钥调用验收 |
| 2026-11-05 | 整理接入说明、模型目录元数据和新增模型记录模板 |
