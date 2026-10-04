# 风格基线 · 《静默信标》ep01

- 选定版本：方向 D+ 「原图路线」（owner-provided illustration, bitmap pipeline）
- 选定依据：老板于风格任务 868b4291 验收中 approve（"选定原图路线（方向D+）作为 ep01 风格基线，配套工程改造放行位图资产"）
- 基线定稿：`owner-ref.png`（原图 1672×941）+ `elements/bg-norin-4x.png`（Real-ESRGAN 4× 去角色底图 6688×3764，为生产主稿）

## 风格要点（自基线提取）

- 插画风位图（painterly raster），非矢量线稿；禁止新资产混搭旧 SVG 线稿风
- 暖色天花灯带 + 冷色屏幕光混合照明；地光来自舷窗地球反光
- 场景为满幅 16:9 位图，相机变焦 ≥1 时不得低于 1920×1080 有效分辨率
- 角色/道具为透明底 PNG（alpha 必需）；角色底部中心 = 站位锚点（脚底）
- 位图角色无 SVG 动画挂点：说话以轻微呼吸/脉动代替口型开合（播放器已实现）
- `dawn-flashback` 类回忆/闪回场景：低饱和、近似单色（从基线取片作灰度化处理）

## 元素清单（elements/）

| 文件 | 内容 |
|---|---|
| bg-norin-4x.png | 舰桥全景底图（LaMa 去凛/去全息环），生产主稿 |
| bg-with-rin-4x.png | 含凛完整底图（备选整幅式） |
| rin-4x.png | 凛·正面立绘透明底（988×2841，默认表情） |
| holo-pedestal.png | 全息柱台+悬浮光环 |
| prop-mug.png | 搪瓷杯 |
| prop-books.png | 书堆 |
| prop-note.png | 手写便签 |
| prop-photo-*.png | 照片（猫/合影/夕阳） |
| bg-norin-preview.png | 底图预览小图 |
