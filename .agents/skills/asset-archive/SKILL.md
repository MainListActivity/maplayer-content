---
name: asset-archive
description: 把角色/场景/服化道资产存档进 maplayer-content 档案库（正确落点 + 机检 + registry 登记）。当任务要求"存档/入库/登记"角色、场景、道具资产，或需要查阅已有资产档案时使用。
---

# asset-archive · 资产档案库

档案工具把资产放进播放器认识的规范位置，并登记进 `public/episodes/<ep>/assets/registry.json`（名称/说明/变体/归档时间/经手人）。**入库前过原画机检**（`pipeline/art-lint.ts` 同一套规则），硬问题直接拒绝——不要把文件手动拷进 assets 目录绕过机检。

## 用法

```bash
# 角色：需要 variant（default/worried/determined...），透明底 PNG 或合规 SVG
pnpm archive add ep01 character raven default ./raven.png --name 渡鸦船长 --note "失联七年归港的船长，左臂机械义肢" --tags "主角,船长" --by <你的员工id>

# 场景/道具：无 variant，场景位图需 ≥1920×1080
pnpm archive add ep01 scene bridge ./bridge.png --name 舰桥
pnpm archive add ep01 prop signal-pip ./pip.png --name 信号管

# 只更新档案元数据（不改文件）
pnpm archive note ep01 character raven --note "补充设定..."

# 查档案：list 全量清单 / show 单条详情
pnpm archive list ep01 [character|scene|prop]
pnpm archive show ep01 character raven
```

## 规则

- 每次 `add` 都带 `--by` 记经手人；`--name`（中文显示名）和 `--note`（一句设定说明）必给。
- 机检被拒时看错误改资产再交，不要手工拷文件进 `assets/`——那会绕过 registry 登记，播放器读不到档案元数据。
- 落点即生产路径：character → `characters/<id>/<variant>.<ext>`，scene → `scenes/<id>.<ext>`，prop → `props/<id>.<ext>`；shots.json 直接按 id/variant 引用。
- 归档后跑 `pnpm validate <ep>` 确认资产被引用方兼容（变体名对得上 shots.json）。
