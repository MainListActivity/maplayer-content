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

## v4 手部朝向修正

老板指出“手的方向都反了”。固定的站立/伸手渲染帧与源 parts atlas 对照后，发现原近侧垂手（画面右侧、人物左手）的拇指在画面右，原远侧垂手（画面左侧、人物右手）的拇指在画面左；原画左右手关系颠倒。编译未对这两个部件做镜像，右行走位也没有触发角色 flip。改动仅替换手部、切掉旧 fore-far 内嵌手掌，保留袖口、肩肘轨道和全部非手部演出。

内置 imagegen 参照原人物部件和伸手帧，重绘透明手部图。规格：单行三格，腕在上、指尖向下，同一成年女性、原肤色与画笔；两张手背视角垂手以及一张近侧左手掌心视角。两张垂手按实际拇指/指甲方向赋角色；生成工具没有遵循请求的格顺序，不能盲信 prompt 标签。实际 `hands-atlas-v4.png` 从左到右是：右手背、左手背、左手掌。因此编译把第 2 格赋给近侧左手，第 1 格赋给远侧右手，第 3 格赋给近侧左手翻掌。禁止镜像整个角色或袖子。

手腕裁切定位由图中腕横截面中心确定。原袖口与新手腕保留覆盖；手部图的左右关系需从画面核对，矩阵与锚点检测不声称识别人体解剖。`check-hands.ts` 调用生产 `evalParts` 检测全片腕锚点连接并输出固定时刻静帧，用于人工/视觉复验。

补绘 `hand-edge-v4.png`：参照新手 atlas，画同一左手的窄轮廓斜侧视角，腕上指下，拇指藏在掌后，同款皮肤/笔触，透明底、无袖子。此图作为手背到掌心、掌心到手背的中间姿势。最终近侧手使用三张绘制视图、24fps hold 逐帧换图，同一时刻只显示一张，避免两只不同拇指透明叠化。该手势是 2D 绘制视图的过渡，不宣称完整三维前臂扭转或逐指动画。
