# maplayer-content · 内容生产

本仓库制作动画内容，使用 Remotion 按分镜合成。内容任务交付剧本、素材和分镜；渲染代码（`src/lib/`）的修改属于工程任务。

## 素材与风格

- 人物、场景的素材格式、媒介与制作方式自由选择，以最终画面效果为准。
- 装饰和小物件继续使用 SVG。
- 已验收的视觉参考见 `public/assets/style-bible/`；同一作品保持风格一致。参考图用于判断视觉效果，不限定素材格式或绘制技法。
- 旧文档中的 SVG 骨架、固定线宽、滤镜、比例、色板和位图路线等制作限制，不再作为通用要求；具体要求以当前任务和老板验收意见为准。
- 接入现有播放器时，查看 `src/spec.ts` 和 `docs/engine/ANIMATION.md` 确认实际支持。需要扩展能力时提出工程任务。

## 任务与验收

岗位轨为：`编剧`、`角色设计`、`服化道`、`场景`、`分镜`、`配音`、`合成`、`审片`、`原著`。
任务的 `discipline` 与 `project.disciplines` 一致，单任务只挂一轨，按声明的 `tracks` 承接。

- 编剧：`executorRole=screenwriter`，任务必带 `discipline=编剧`（缺轨/错轨在创建与领取双端显式拒绝）；P 段原型剧本与 M 段剧本量产都归它（对「P 段=concept-design」约定的有意例外）。验收按段：P 段原型剧本 `reviewerRole=owner`（老板 demo 验收），M 段 `reviewerRole=gm`。同一剧本多轮修订走串依赖任务链：初稿→评审驳回→被取代稿作废关闭（void 视为依赖满足）→修订稿 v(N+1) 解锁；版本号进任务标题，驳回意见逐条转成修订要点写进下一轮 context；不为解锁依赖而批准不合格稿。
- 原型（视频产线编剧以外七轨）：`executorRole=concept-design`，`reviewerRole=owner`。新角色、视觉风格、场景基调先交 demo，老板批准后再解锁依赖它的量产任务。
- 量产（视频产线编剧以外七轨）：`executorRole=asset-production`，由 GM/QA 验收。经理按剧本、素材、分镜、配音、合成、审片的实际依赖安排任务。
- 原型提交可直接打开的静帧或短样片；成片审核提交 mp4、`qa/frames/<片>/sheet.jpg` 和问题清单。多版本对比附对应静帧。

## 原著线（长篇故事创作）

与视频产线并列的独立产线，只负责写故事原著。种子稿见 `科幻故事续写筹备.md`，全部产出放 `story/`，不进入 `public/episodes/`。

- 路由：`discipline=原著`。岗位落地后 `executorRole=story-author`；过渡期由 `concept-design`/`asset-production` 承接（编制固定 antigravity）。`product`/`gm`/`ai-content` 等岗不承接原著轨写作任务。
- 递归流程：总体架构（故事圣经+全书总纲，reviewer=owner）→ 卷概要（owner）→ 章概要（owner）→ 正文补齐（QA→GM）→ 交付一个小章节 → 递归下一章。先概要后正文，老板只看概要。
- 概要被驳回：修订概要再交同一验收人，不跳过直接写正文。正文被 QA/GM 驳回：按意见修订正文，概要不变。
- 交付单位=一个小章节正文（markdown），QA 口径：与已批概要一致、文风连贯、与故事圣经无矛盾、字数达标。
- 作家不接触视频产线概念：不分集、不定时长、不写分镜格式；改编剧本是下游编剧轨的事。任务 context 不带动画产线术语。
- `story/` 目录约定：`story/<作品>/bible.md`（故事圣经）、`outline/<卷>.md`（卷/章概要）、`chapters/<卷>/<章>.md`（正文）、`notes/`（评审与修订记录）。版本历史靠 git，不另建版本目录。

## 文件与验证

每集内容放在 `public/episodes/<ep>/`：

- `script.md`：剧本。
- `episode.json`：集信息、画幅、声线表。
- `shots.json`：分镜。
- `assets/`：人物、场景、道具等素材。

命令参数与脚本见 `package.json`，常用命令：

```bash
pnpm validate <ep>
pnpm audio <ep>
pnpm storyboard <ep>
pnpm render <ep>
pnpm frames renders/<片>.mp4
pnpm archive <子命令>   # 资产入库：add/list/show/note（见 .agents/skills/asset-archive）
```

台词或声线修改后，重新运行 `pnpm audio <ep>` 和 `pnpm validate <ep>`。
成片交付前验证数据、完成渲染并检查抽帧与音频：画面完整，字幕可读，声音与说话人及时间线匹配，时长符合任务目标。
验证失败需修复或说明具体阻塞；旧格式或风格检查与当前要求冲突时，提出对应的工程调整。

## 边界

- 资产和分镜只修改任务授权的集数目录；共享资产修改需有对应授权。
- 不改公司规则，不将客户资料、凭证或 `.env` 内容写入产物或证据。
