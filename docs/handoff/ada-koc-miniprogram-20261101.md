# Ada KOC 小程序模块：交给云端团队

日期：2026-11-01。用户决定把 Ada KOC 小程序模块交给负责云端的团队。本文是这次交接的当前说明。产品规则仍以 [PRD v7](../specs/ada-mvp-v1-20261024-review.md) 为准；Ada App 与云端之间的资料包、任务包、审核和交付仍以 [云端与桌面契约](../contracts/ada-infrastructure-cloud-v1.md) 为准。两处冲突时，先改本文，不要各自沿用旧段落。

对外 GitHub 只发布小程序参考客户端和本文，不发布整个 Ada 仓库。Mac 应用、参考服务、契约、审查记录和其他源码留在内部仓库。2026-11-01 误推的完整仓库已从 GitHub 删除。

历史原型 spec、2026-10-26 的 OpenAPI 草案里仍有「十篇」「不要露脸」和未落地路径。那些是当时记录，不能当作本次要实现的接口。

## 1. 交接结果

| 边界 | 交接后 |
| --- | --- |
| KOC 手机端 | 归云端团队。可以并入现有小程序，也可以在参考客户端上继续。页面可以改，下面第 4 节的行为不能只做成按钮禁用。 |
| 成员业务接口 | 归云端团队实现和维护。路径和错误行为以本文第 5 节及当前参考服务为准。 |
| 接单平台到任务 | 归云端团队内部。参考服务里的 `POST /platform/orders/accepted` 只说明订单如何变成一条 KOC 任务，不是要求保留的对外接口。 |
| 云端 ↔ Ada App | 长期两边都在。云端归对方，Ada App 归 Ada。走已有的 `/v1/admin` 契约，不从成员接口推导。 |
| 写稿 | 不随小程序移交。三篇候选仍由 Ada 按已确认商品事实生成。对方云端只保存并下发结果。`prompts/script-writing/` 不要复制进对方的生产发布。独立的写稿 HTTP 尚未冻结，不能把参考服务内部调用当成已发布接口。 |
| 制作、审核、成片生产 | 仍在 Ada App。小程序不直接连接 Mac。 |

对方未换上自己的云端之前，Ada App 继续连接 Ada 的参考服务。两边并行，不把参考服务停掉，也不把本机联调数据当成正式订单。

## 2. 交给对方的材料

对外仓库只含这两项：

| 材料 | 位置 | 用途 |
| --- | --- | --- |
| 参考客户端 | `apps/ada-koc/` | 微信原生小程序 + TypeScript。页面为登录后的任务、建档、选稿、拍摄、下载。 |
| 成员行为 | 本文第 4–5 节 | 对方实现云端时要保持的规则。 |

参考服务和 Ada App 侧契约留在内部仓库，不放进对外 GitHub。对方按第 5 节实现成员接口。Ada App 仍走内部的 `/v1/admin` 契约，不从本仓库推导。

参考客户端目前把后台地址写在 `apps/ada-koc/miniprogram/config.ts`，默认是 `http://127.0.0.1:8787`。`project.config.json` 里的 AppID `wxb60ecbdabb27ccaf` 是测试号。这两处都由对方换成自己的域名和微信小程序。`project.private.config.json` 只在本机，不要另传。

不要交给对方的内容：AppSecret、员工令牌、模型密钥、环境文件、SQLite、本机测试库、测试素材、Mac 应用源码和构建产物。

## 3. 参考客户端里有什么

`apps/ada-koc/miniprogram/app.json` 的页面：

| 页面 | 行为 |
| --- | --- |
| `pages/index/index` | 登录后列出本人任务。查询参数 `taskId` 时直接进入该任务。 |
| `pages/profile/profile` | 声音采样、正面或半身参考视频、用途确认。只显示朗读文本，没有提词器。 |
| `pages/script/script` | 三篇候选里选一篇，只改台词，然后「确认稿件、进入拍摄」。 |
| `pages/shots/shots` | 按拍摄项录或选视频、逐项上传、退回项补拍、齐全后统一提交。 |
| `pages/delivery/delivery` | 成片和封面都可下载后预览。没有在线返修。 |

阶段到页面的对应在 `pages/index/index.ts` 的 `pageFor`。成员请求集中在 `miniprogram/services/api.ts` 和 `session.ts`。服务端可以多返回字段；删掉或改掉这些文件已经读取的字段，参考客户端会坏。

## 4. 必须保持的行为

1. 微信登录只提交 `wx.login` 的临时 `code`。服务端用 AppSecret 换 openid，再映射到稳定 `memberId`。客户端传来的 openid、memberId 或员工身份一律忽略。响应、日志和文档都不出现 AppSecret、openid 或 session_key。
2. 没有刷新令牌。访问令牌过期后重新登录。未登录或过期返回 401 `unauthenticated`，停用返回 403 `member_disabled`。退出返回 204，不删除档案，也不撤回已经做出的用途确认。
3. 每单一批三篇，选一篇，不提供换批。历史已保存的十篇批次按原样返回，不改写成三篇。生成中、失败或结果不明时不把残缺结果当成成功。
4. 确认进入拍摄后，服务端拒绝再改稿或换候选。只把按钮禁用不够。选稿和锁稿都不是审核。
5. 拍摄项只来自所选稿里 `source` 为 `shot` 的段落，提示语用该段的 `focus`。必拍语义是本人露脸并与商品互动。
6. 上传使用 multipart 字段 `file` 和 `clientUploadId`。同一个 ID 重试同一份内容只保留一个文件；ID 复用到不同内容要拒绝。音视频必须能被 ffprobe 读出，否则拒绝并提示重拍。
7. 档案至少为已提交，且每个拍摄项已上传或已通过，才允许统一提交。未齐不得进入待审核。
8. 退回后只能重传被退回的项。未受影响且仍合格的项保持原文件和通过状态。
9. 视频和封面都到齐，任务才是可下载。只完成其中一个不能显示成片。
10. 任务、档案、上传和下载都检查成员归属。成员令牌不能访问他人任务，也不能访问 `/admin` 或 `/v1/admin`。
11. 档案尚未提交或通过、而订单还在选稿或拍摄时，成员看到的阶段是 `awaiting_profile`。这是展示阶段，不改掉已存储的订单阶段。
12. 不做支付、提词器、视频内美颜、在线返修或自动发布。

改稿后不自动重写拍摄提示，也不为此再调用写稿模型。错配由 Ada 侧审核员改最终稿，或只退回缺项。

## 5. 成员接口

这些路由没有 `/v1` 前缀。鉴权头是 `Authorization: Bearer <accessToken>`。错误体统一为：

```json
{ "error": { "code": "script_locked", "message": "稿件已确认进入拍摄，不能再修改" } }
```

成功响应的字段以 `services/ada-koc-server/src/server.ts` 和 `tasks.ts` 的当前实现为准。下表是路由和行为。

| 方法与路径 | 行为 |
| --- | --- |
| `POST /auth/wechat/login` | 正文只使用 `{ "code": "..." }`。返回 `{ accessToken, expiresAt, member }`。`member` 只有 `memberId` 和 `status`。 |
| `GET /me` | 返回当前 `{ memberId, status }`。 |
| `POST /auth/logout` | 撤销当前令牌，204。 |
| `GET /profile` | 返回档案状态、声音、参考视频、已确认的用途版本、当前要求的用途版本和退回原因。 |
| `POST /profile/voice` | 上传声音采样。 |
| `POST /profile/reference-video` | 上传参考视频。 |
| `POST /profile/consent` | 正文 `{ "version": "<当前用途确认版本>" }`。版本不符返回 400 `consent_version_mismatch`。 |
| `POST /profile/submit` | 三项都齐才接受。档案已在审核或已通过时拒绝重复上传。 |
| `GET /tasks` | 只返回本人任务，新的在前。 |
| `GET /tasks/{taskId}` | 本人任务详情。阶段、稿件、拍摄项都在这里。 |
| `GET /tasks/{taskId}/scripts` | 资料未就绪、生成中或不成功时 `candidates` 为空数组。只有该批 `ready` 才返回候选。 |
| `PUT /tasks/{taskId}/script` | 正文 `{ candidateId, segments: [{ segmentId, line }] }`。只改已有段落的台词。成功后订单进入拍摄，并按实拍段生成拍摄项。 |
| `POST /tasks/{taskId}/shots/{itemId}/upload` | 上传一个拍摄项。拍摄阶段可覆盖尚未审核的上传；退回阶段只能重传被退回的项。 |
| `POST /tasks/{taskId}/submit` | 统一提交。成功后存储阶段变为 `in_review`，并发出提交事件。 |
| `GET /tasks/{taskId}/delivery` | 仅 `deliverable` 且视频、封面都存在时返回两个文件描述。否则 409 `not_deliverable`。 |
| `GET /files/{uploadId}` | 只下载属于当前成员的文件。 |

任务详情里，参考客户端实际依赖 `taskId`、`stage`、`sku.name`、`requirements`、`profileStatus`、`scripts.status`、`script`、`shots`。拍摄项依赖 `itemId`、`segmentId`、`prompt`、`status`、`rejectReason`、`version`、`upload`。文件描述至少要有 `uploadId`、`fileName`、`size`、`sha256`。

成员可见阶段：`materials_not_ready`、`awaiting_profile`、`awaiting_script`、`awaiting_shots`、`in_review`、`rework`、`producing`、`deliverable`。

对方实现时至少要能拒绝这些情况，并使用同一错误码：锁稿后改稿 `script_locked`，候选未就绪 `scripts_not_ready`，拍摄项阶段不对 `shot_locked` 或 `task_locked`，未齐就提交 `shots_incomplete`、`profile_required` 或 `script_required`，同一上传 ID 对应不同内容 `client_upload_id_reused` 或 `client_upload_content_mismatch`，媒体读不出 `unreadable_media`。

## 6. 和 Ada App 的关系

小程序不连接 Ada App。成员提交后，参考服务写事件；Ada App 主动用 SSE 或 `GET /v1/admin/events` 对账，再读 `GET /v1/admin/tasks/{taskId}/bundle`。事件只做提醒，任务内容以任务包为准。

对方换上自己的云端后，Ada App 仍走这组管理接口，不改成调用成员接口。审核、交付使用带 `operationId` 的回执；结果不明时不能靠刷新清掉。资料包、首次绑定和三篇预留的规则见云端契约，不在本文重写。

订单从对方平台进入时，最终打开的小程序路径保持：

```text
pages/index/index?taskId=<任务 ID>
```

任务 ID 一经发给小程序就不变。不要为了联调另下一单或复制订单状态。

## 7. 后续做法

1. 对方先阅读本文，并用包含本文件的 `main` 对照参考客户端。定稿前不要按旧 OpenAPI 开工。
2. 对方的小程序先指向 Ada 参考服务，走通登录、建档、三篇选稿、锁稿、逐项上传、统一提交和下载。此阶段不要求他们的云端已经完成。
3. 对方实现成员接口后，用参考客户端连他们的测试环境，再跑第 4 节的拒绝情形。
4. 他们的云端实现 App 侧契约后，再用 Ada App 对同一任务做联合审核、制作和交付。成员联调和 App 联调分开记录，不能互相代替。
5. 两段都通过，才把正式小程序的后台地址改到对方云端。在此之前参考服务继续可供 Ada App 使用。

小程序源码此后以对方仓库为准。Ada 仓库里的 `apps/ada-koc` 只在成员契约变更时作为参考客户端更新。契约变更要两边确认，并补上对应的拒绝用例。

## 8. 明确不做

本次不部署、不发布微信版本、不调用真实模型、不把参考服务接到生产域名。写稿独立接口、事件保留 30 天后的 410、多审核员分配，都还没有在这次交接里定稿。
