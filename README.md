# Chat Memory RAG

SillyTavern UI 扩展，版本 0.1.1。支持 Content/Summary 内容索引、可选 MVU 消息快照、SHA-256 embedding 缓存、关键词与向量混合检索、可选 Rerank、同次聊天请求中的 summary 提示词以及 IndexedDB 导入导出。

## 安装与使用

在 SillyTavern 的「扩展 → 安装扩展」中填写 `https://github.com/robert4213/chat-memory-rag`，安装后刷新页面。更新时在扩展管理中检查更新。

也可将本目录复制到 SillyTavern 的 `public/scripts/extensions/third-party/chat-memory-rag/`（或酒馆当前用户扩展目录）。源码使用浏览器原生 ES modules，无需构建或 npm 安装。

1. 扩展设置中点击「Chat Memory RAG → 打开记忆管理」。
2. 在 API / Presets 设置 OpenAI 兼容服务的基础 URL（如 https://host/v1）、模型和密钥，分别绑定文档、查询及可选 Rerank。保存后测试连接。
3. 常规中启用；默认只索引助手正文。需要摘要时，选择 Summary 索引模式，并按需开启 Summary 页的生成提示词。
4. 内容提取设置 include/exclude，使用预览确认；缺失标签会 warning，不自动回退。
5. 按需开启 MVU，输入需要的变量路径。下一次正常聊天前读取前一层当前选中回复的消息变量。
6. 点击更新索引，然后在检索预览检查结果。正常聊天时自动注入相关历史资料。

API 各用途独立配置；查询与文档须使用相同向量空间。浏览器直接请求 API，服务需要允许当前酒馆来源的跨域请求。密钥保存在本地 IndexedDB，导出时默认移除。所有数据属于当前浏览器与来源地址，换设备请导出/导入。

扩展在消息 extra 中写入自己的 cmrag_id 并保存聊天，用于中间删楼后的来源对齐；不修改消息正文或 MVU。删除、编辑、切换 swipe 后旧来源会排除。重新生成时限制检索到目标楼层之前。历史 swipe 的有效记录按当前选择重建，不保留独立历史版本浏览器。

## 设置与界面

概览、记忆、检索预览、常规、内容提取、Summary、MVU、API / Presets、检索与注入、数据管理、诊断和 TODO。额外人物事实解析保留在 TODO，没有解析请求。

## 验证与限制

### Debug 与日志

「诊断」页开启 Debug 模式并保存。普通模式在 IndexedDB 中保留 API 成功/失败、同步结果与警告；Debug 额外记录 embedding 缓存命中、共享请求、生命周期事件、检索分数，并输出到浏览器控制台。支持按级别筛选、刷新、清空与 JSON 导出，默认最多 300 条（可设 50–2000）。

日志不记录 API 密钥、请求头/正文、聊天文本、MVU 值或向量；错误中的已配置密钥、Bearer、URL 自动遮蔽。诊断页的可折叠运行状态仍可在本机显示检索正文，单独导出日志不包含该面板。

运行 `npm test`、`npm run check`。本版本完成纯逻辑单元测试和语法检查，尚未在真实 SillyTavern 会话中联调。请先用测试聊天验证生成事件、swipe 与 MVU 版本兼容性。

v0.1 使用顺序 embedding 请求及内存余弦检索；未提供批量调度、变量树选择器、自动历史 MVU 回填、跨设备同步、EJS 模板渲染、角色事实抽取。历史内容可手动批量建立索引；MVU 在发送时及手动更新时只读取最新目标层。当前通过公开 getContext 和 Mvu 接口工作，Prompt Template / TavernHelper 状态在概览显示。初始化采用功能检测，尚不强制阻止缺少这两个扩展时的基本文本检索。

生成结束事件不能单独证明所有提供商都成功完成，停止生成会排除；网络失败的最终事件行为仍需真实酒馆验证。先核验此项再用于正式长聊天。

研究及后续范围见 PLAN.md。
