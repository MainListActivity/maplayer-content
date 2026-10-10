# maplayer-content · 内容生产

本仓库制作动画内容，使用 Remotion 按分镜合成。内容任务交付剧本、素材和分镜；渲染代码（`src/lib/`）的修改属于工程任务。

## 素材与风格

- 人物、场景的素材格式、媒介与制作方式自由选择，以最终画面效果为准。
- 装饰和小物件继续使用 SVG。
- 已验收的视觉参考见 `public/assets/style-bible/`；同一作品保持风格一致。参考图用于判断视觉效果，不限定素材格式或绘制技法。
- 旧文档中的 SVG 骨架、固定线宽、滤镜、比例、色板和位图路线等制作限制，不再作为通用要求；具体要求以当前任务和老板验收意见为准。
- 接入现有播放器时，查看 `src/spec.ts` 和 `docs/engine/ANIMATION.md` 确认实际支持。需要扩展能力时提出工程任务。

## 任务与验收

岗位轨为：`编剧`、`角色设计`、`服化道`、`场景`、`分镜`、`配音`、`合成`、`审片`。
任务的 `discipline` 与 `project.disciplines` 一致，单任务只挂一轨，按声明的 `tracks` 承接。

- 原型：`executorRole=concept-design`，`reviewerRole=owner`。新角色、视觉风格、场景基调先交 demo，老板批准后再解锁依赖它的量产任务。
- 量产：`executorRole=asset-production`，由 GM/QA 验收。经理按剧本、素材、分镜、配音、合成、审片的实际依赖安排任务。
- 原型提交可直接打开的静帧或短样片；成片审核提交 mp4、`qa/frames/<片>/sheet.jpg` 和问题清单。多版本对比附对应静帧。

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
```

台词或声线修改后，重新运行 `pnpm audio <ep>` 和 `pnpm validate <ep>`。
成片交付前验证数据、完成渲染并检查抽帧与音频：画面完整，字幕可读，声音与说话人及时间线匹配，时长符合任务目标。
验证失败需修复或说明具体阻塞；旧格式或风格检查与当前要求冲突时，提出对应的工程调整。

## 边界

- 资产和分镜只修改任务授权的集数目录；共享资产修改需有对应授权。
- 不改公司规则，不将客户资料、凭证或 `.env` 内容写入产物或证据。
