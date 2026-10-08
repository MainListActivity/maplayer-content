# 新原画提示词与制作记录

全部原画由内置 imagegen 生成，透明底由工具生成并保留。没有使用 CLI/API fallback 或任何凭证。生成后的 atlas 由 build.mjs 按 alpha 取格、以解剖端点做几何归一化，编译为 existing-engine PNG parts；脚本只切分/重采样原画与编译动作数据，不修改渲染核心。

## Parts atlas（stylized-concept）

Create a SINGLE transparent animation puppet parts atlas for newly redesigned Rin, a young adult female deep-space radio operator. 3-column by 4-row atlas, twelve isolated parts, one per cell, no labels or borders. Consistent hand-painted anime film visual, detailed restrained brush shading, thin dark warm contour, amber rimlight and cool screen fill. Adult 5.5-head proportion, warm ivory cropped utility jacket with dark teal side inserts, charcoal slim trousers and dark boots, short softly layered dark-brown bob, expressive gray-brown eyes, radio headset, amber clip. Matching gentle three-quarter view facing right. Ordered: head with short neck; torso; near upper arm; near forearm/hand; far upper arm; far forearm/hand; near thigh; near shin; near boot; far thigh; far shin; far boot. Disconnected pieces with fully painted overlapping joint ends, generous cell margins, transparent alpha, no scenery or cropped pieces.

保存为 parts-atlas.png。工具原图生成了部分关节护垫，当前角色服装保留此细节；far boot 的朝向在几何编译时镜像为右向。

## Heads atlas（identity-preserve）

Use only the parts atlas head as identity reference. Transparent 2x2 expression-head atlas, identical size, neck, hair silhouette, headset, clip, three-quarter right view and painted light. Row-major: attentive neutral with closed mouth; listening with eyes glancing right and slightly raised eyebrows; eyes closed for blink; soft reassuring small smile. Exact same direction and anatomy, subtle expressions, full heads with margins, no shoulders, labels or text.

保存为 heads-atlas.png。中性、倾听、眨眼、微笑头使用同一关节位置，透明度衔接；不是整幅身体姿势切换。

## Background（illustration-story）

Clean hand-painted anime film background for a quiet deep-space radio listening bridge at orbital night. No people, animals, portraits or ghost parts. Wide 16:9, large panoramic window in upper 55%, curved blue Earth horizon below, navy space. Amber ceiling arcs and cool cyan rear-right consoles. Clear walkable floor across bottom 40%, restrained clutter, central perspective, left cropped structural beam and low right console corner. Ivory metal, navy equipment, believable shadows/reflections. No text, handwriting, watermarks or central hologram pedestal.

生成图以 Lanczos 转为 background.png；屏幕光为独立的代码生成柔和 UI 光点图，scene.json 驱动 flicker 和低密度微尘。

## Mouth atlas（identity-preserve）

Use the illustrated head-soft.png as exact character reference. A single transparent 2x2 mouth patch atlas: lips with a very small oval of matching warm cheek skin feathering to alpha, gentle three-quarter view facing right. Same lip-center alignment and size. Row-major: softly closed neutral; small open speaking mouth; small round O; tiny reassuring closed smile. Subtle painted natural anime film lips, no lipstick or teeth bar, no heads/noses/eyes/neck, no labels. Matching warm/cool light.

保存为 mouth-atlas.png；编译为四个局部口型贴图，实际音轨 RMS 驱动透明度。上述为最终提示词规格记录，生成调用的完整措辞保存在本会话时间线。
