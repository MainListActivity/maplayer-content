#!/usr/bin/env python3
"""凛动作资产生成（P-动作 demo）：从 style-bible 主稿 rin-4x.png 切部件、
局部填片清板、按枢轴旋转合成整幅姿势帧 + 表情变体。
产出整幅 PNG（988x2841，锚点=底部中心），走引擎 action.frames 序列帧路线。"""
import os, sys, math
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

SRC = 'public/assets/style-bible/elements/rin-4x.png'
W, H = 988, 2841

img = Image.open(SRC).convert('RGBA')
arr = np.array(img)
alpha = arr[..., 3]
yy, xx = np.mgrid[0:H, 0:W]

def mask_from(cond):
    return (cond & (alpha > 10)).astype(np.uint8) * 255

def seam_mask(side, seam_pts, y0, y1):
    xs = np.interp(yy.ravel(), [p[1] for p in seam_pts], [p[0] for p in seam_pts]).reshape(H, W)
    cond = (yy >= y0) & (yy <= y1) & ((xx < xs) if side == 'l' else (xx > xs))
    return mask_from(cond)

SEAM_AL = [(250, 850), (272, 1020), (292, 1180), (310, 1340), (330, 1480), (350, 1600)]
SEAM_AR = [(772, 850), (750, 1020), (720, 1170), (695, 1320), (672, 1460), (650, 1600)]
MASK_AL = seam_mask('l', SEAM_AL, 840, 1560)
MASK_AR = seam_mask('r', SEAM_AR, 840, 1560)
MASK_LL = mask_from((xx >= 280) & (xx <= 505) & (yy >= 1650))
MASK_LR = mask_from((xx >= 505) & (xx <= 745) & (yy >= 1650) & ~((xx > 650) & (yy < 2070)))
MASK_HEAD = mask_from(yy < 878)
# 腿膝部分件（坐姿）
KNEE_Y = 2215
MASK_LL_T = MASK_LL & (yy <= KNEE_Y).astype(np.uint8) * 255
MASK_LL_S = MASK_LL & (yy > KNEE_Y).astype(np.uint8) * 255
MASK_LR_T = MASK_LR & (yy <= KNEE_Y).astype(np.uint8) * 255
MASK_LR_S = MASK_LR & (yy > KNEE_Y).astype(np.uint8) * 255

PIVOT = {
    'head': (494, 870), 'arm-l': (232, 935), 'arm-r': (762, 935),
    'leg-l': (392, 1690), 'leg-r': (602, 1690),
    'thigh-l': (392, 1690), 'shin-l': (395, KNEE_Y),
    'thigh-r': (602, 1690), 'shin-r': (600, KNEE_Y),
}
PART_MASKS = {
    'head': MASK_HEAD, 'arm-l': MASK_AL, 'arm-r': MASK_AR,
    'leg-l': MASK_LL, 'leg-r': MASK_LR,
    'thigh-l': MASK_LL_T, 'shin-l': MASK_LL_S,
    'thigh-r': MASK_LR_T, 'shin-r': MASK_LR_S,
}

def crop_part(mask):
    ys, xs = np.where(mask > 0)
    piece = np.zeros_like(arr)
    piece[mask > 0] = arr[mask > 0]
    return piece[ys.min():ys.max()+1, xs.min():xs.max()+1], (xs.min(), ys.min(), xs.max(), ys.max())

PARTS = {k: crop_part(m) for k, m in PART_MASKS.items()}

def _add_fist(name, tip, r=40):
    """在部件图尖端画一只拳头（肤色+深描边），提升抬手可读性。"""
    piece, bbox = PARTS[name]
    h, w = piece.shape[:2]
    tx, ty = tip[0]-bbox[0], tip[1]-bbox[1]
    cv2.circle(piece, (int(tx), int(ty)), r, (215, 168, 148, 255), -1, cv2.LINE_AA)
    cv2.circle(piece, (int(tx), int(ty)), r, (72, 44, 40, 255), 5, cv2.LINE_AA)
    PARTS[name] = (piece, bbox)

_add_fist('arm-l', (250, 1480))
_add_fist('arm-r', (752, 1520))

# ---------- 图层工具 ----------
def blank():
    return np.zeros((H, W, 4), np.uint8)

def over(dst, src):
    a = src[..., 3:4].astype(np.float32) / 255.0
    o = dst.astype(np.float32)
    o[..., :3] = src[..., :3] * a + dst[..., :3] * (1 - a)
    o[..., 3] = np.clip(src[..., 3].astype(np.float32) + dst[..., 3] * (1 - a[..., 0]), 0, 255)
    return o.astype(np.uint8)

def warp(canvas, pivot, angle=0.0, dx=0.0, dy=0.0, scale=1.0, sy=None):
    M = cv2.getRotationMatrix2D((float(pivot[0]), float(pivot[1])), float(angle), float(scale))
    M[0, 2] += dx; M[1, 2] += dy
    if sy is not None:  # 绕 pivot 的非等比纵向压缩
        T1 = np.float64([[1, 0, -pivot[0]], [0, 1, -pivot[1]], [0, 0, 1]])
        S = np.float64([[1, 0, 0], [0, sy, 0], [0, 0, 1]])
        T2 = np.float64([[1, 0, pivot[0]], [0, 1, pivot[1]], [0, 0, 1]])
        M3 = T2 @ S @ T1 @ np.vstack([M, [0, 0, 1]])
        M = np.float32(M3[:2])
    return cv2.warpAffine(canvas, M, (W, H), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))

def xform_pt(pivot, angle, pt):
    r = math.radians(angle); c, s = math.cos(r), math.sin(r)
    dx, dy = pt[0]-pivot[0], pt[1]-pivot[1]
    return (pivot[0] + c*dx - s*dy, pivot[1] + s*dx + c*dy)

def part_layer(name, angle=0.0, dx=0.0, dy=0.0, scale=1.0, chain=None):
    """chain: [(pivot,angle),...] 先做继承变换（如 thigh 带 shin），再做自身角度。"""
    piece, bbox = PARTS[name]
    c = blank()
    c[bbox[1]:bbox[3]+1, bbox[0]:bbox[2]+1] = piece
    if chain:
        for pv, ag in chain:
            c = warp(c, pv, ag)
    if angle or dx or dy or scale != 1.0:
        c = warp(c, PIVOT[name], angle, dx, dy, scale=scale)
    return c

def blur_region(src, box, rad=25):
    x0, y0, x1, y1 = box
    reg = src[y0:y1, x0:x1].copy()
    rgb = cv2.GaussianBlur(reg[..., :3], (0, 0), rad)
    am = reg[..., 3]
    # alpha 也模糊软化边缘
    am = cv2.GaussianBlur(am, (0, 0), rad)
    return np.dstack([rgb, am]), (x0, y0)

def paste_patch(dst, patch, pos):
    x0, y0 = pos
    h, w = patch.shape[:2]
    c = blank()
    c[y0:y0+h, x0:x0+w] = patch
    return over(dst, c)

# ---------- 板件 ----------
_CACHE = {}
def pelvis_layer():
    """腿下填层：把双腿区域 inpaint 成连续裤料，垫在腿层下防缝隙透光。"""
    if 'pelvis' in _CACHE: return _CACHE['pelvis']
    m = np.clip(MASK_LL // 255 + MASK_LR // 255, 0, 1).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    bgr = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2BGR)
    fixed = cv2.cvtColor(cv2.inpaint(bgr, m, 8, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
    fixed = (fixed.astype(np.float32) * 0.62).astype(np.uint8)  # 压暗当胯下阴影
    keep = cv2.dilate(np.clip(MASK_LL//255+MASK_LR//255,0,1).astype(np.uint8)*255, np.ones((15,15),np.uint8)) > 0
    keep &= alpha > 10
    lay = np.dstack([fixed, np.where(keep, 255, 0).astype(np.uint8)])
    _CACHE['pelvis'] = lay
    return lay

def torso_plate(erase=('leg-l', 'leg-r')):
    """躯干层 = 原图 减去指定部件区（头/腿/臂按需）；
    臂被切走时在躯干内部留下的孔洞做 inpaint（夹克延续），轮廓外孔洞保持透明。"""
    key = tuple(sorted(erase))
    if key in _CACHE: return _CACHE[key]
    t = arr.copy()
    inner = cv2.erode((alpha > 10).astype(np.uint8) * 255, np.ones((41, 41), np.uint8)) > 0
    hole = np.zeros((H, W), np.uint8)
    for name in erase:
        m = PART_MASKS[name] > 0
        t[m] = 0
        if name.startswith('arm-') or name == 'head':
            hole[(m & inner)] = 255
    if hole.any():
        hole = cv2.dilate(hole, np.ones((7, 7), np.uint8)) > 0
        # 逐行取夹克中段（x400-620，干净前襟）中位色填充，纵向平滑——平色织纹比 Telea 糊痕干净
        src_band = arr[:, 400:620, :3].astype(np.float32)
        src_alpha = alpha[:, 400:620] > 10
        rows = np.zeros((H, 3), np.float32)
        for y in range(H):
            px = src_band[y][src_alpha[y]]
            rows[y] = np.median(px, 0) if len(px) else rows[y-1] if y else 128
        rows = cv2.GaussianBlur(rows.reshape(H, 1, 3), (1, 61), 0).reshape(H, 3)
        hm = hole & inner
        t[..., :3] = np.where(hm[..., None], rows[:, None, :].astype(np.uint8)[ :, 0, :][:, None].repeat(1, axis=1) if False else np.broadcast_to(rows[:, None, :], (H, W, 3)).astype(np.uint8)[..., :3][:, :, :], t[..., :3])
        t[..., 3] = np.where(hm, np.maximum(t[..., 3], np.uint8(235)), t[..., 3])
    _CACHE[key] = t
    return t

def underarm_fills():
    """臂下填片：臂转开后躯干侧边应有夹克延续。取躯干邻列克隆拉伸。"""
    t = torso_plate(('arm-l', 'arm-r', 'head'))
    # 仅填臂孔深入躯干内部的部分：arm mask ∩ alpha 内缩区
    inner = cv2.erode((alpha > 10).astype(np.uint8) * 255, np.ones((31, 31), np.uint8))
    fills = []
    for side in ('l', 'r'):
        m = PART_MASKS['arm-' + side] // 255
        hole = (m & (inner // 255)).astype(np.uint8) * 255
        hole = cv2.dilate(hole, np.ones((9, 9), np.uint8))
        bgr = cv2.cvtColor(t[..., :3], cv2.COLOR_RGB2BGR)
        fixed = cv2.inpaint(bgr, hole, 6, cv2.INPAINT_TELEA)
        fills.append(cv2.cvtColor(fixed, cv2.COLOR_BGR2RGB))
    return fills

# ---------- 姿势合成 ----------
OUT_W = 1400  # 姿势帧画布加宽（挥臂需要），角色仍在水平居中 → 底部中心锚点不变
PAD = (OUT_W - W) // 2

def make_pose(spec):
    """spec: dict with legs/arms/head transforms + options。输出 OUT_W×H 画布。"""
    global _PADED
    out = blank()
    # 1. 垫底：腿下裤料填层
    if spec.get('pelvis', True):
        out = over(out, pelvis_layer())
    # 2. 腿（两段或整腿；缺省双腿原样画上）
    legmode = spec.get('legmode', 'whole')
    if legmode == 'whole':
        for lg in ('leg-l', 'leg-r'):
            out = over(out, part_layer(lg, **spec.get('legs', {}).get(lg, {})))
    else:  # split: thigh + shin（坐姿），可整体 sy 压缩 + dy 落定
        legs = blank()
        for side in ('l', 'r'):
            tk = spec['thighs'][side]; sk = spec['shins'][side]
            th_ang = tk.get('angle', 0)
            legs = over(legs, part_layer('thigh-' + side, **tk))
            knee0 = PIVOT['shin-' + side]
            knee1 = xform_pt(PIVOT['thigh-' + side], th_ang, knee0)
            shin = part_layer('shin-' + side)
            shin = warp(shin, PIVOT['thigh-' + side], th_ang)  # 继承大腿旋转
            shin = warp(shin, knee1, sk.get('angle', 0), sk.get('dx', 0), sk.get('dy', 0))
            legs = over(legs, shin)
        sq = spec.get('legs_squash')
        if sq:  # (sy, anchor_y, dy)
            legs = warp(legs, (494, sq[1]), 0, 0, sq[2] if len(sq) > 2 else 0, sy=sq[0])
        out = over(out, legs)
    # 3. 躯干板（含未切的臂/挂包）
    erase = ['head', 'leg-l', 'leg-r']
    for a in spec.get('move_arms', []):
        erase.append('arm-' + a)
    t = torso_plate(tuple(erase))
    bdy = spec.get('dy', 0)
    bang = spec.get('torso_angle', 0)
    if bang:  # 躯干扭转（回眸）
        t = warp(t, (494, 1600), bang)
    if bdy:  # 躯干下沉（坐/蹲）
        t = warp(t, (0, 0), 0, 0, bdy)
    out = over(out, t)
    # 4. 臂
    for a in ('l', 'r'):
        cfgs = dict(spec.get('arms', {}).get(a, {}))
        cfgs['dy'] = cfgs.get('dy', 0) + bdy
        out = over(out, part_layer('arm-' + a, **cfgs))
    # 5. 头
    hc = dict(spec.get('head', {}))
    if hc.pop('flip', False):
        hp = blank()
        piece, bbox = PARTS['head']
        hp[bbox[1]:bbox[3]+1, bbox[0]:bbox[2]+1] = piece
        hp = hp[:, ::-1]  # 水平镜像
        hlayer = warp(hp, (W - PIVOT['head'][0], PIVOT['head'][1]), hc.get('angle', 0),
                      hc.get('dx', 0), hc.get('dy', 0) + bdy)
        out = over(out, hlayer)
    else:
        hc['dy'] = hc.get('dy', 0) + bdy
        out = over(out, part_layer('head', **hc))
    if OUT_W != W:
        padded = np.zeros((H, OUT_W, 4), np.uint8)
        padded[:, PAD:PAD+W] = out
        out = padded
    return Image.fromarray(out, 'RGBA')

POSES = {
    # 走路循环：腿剪刀（正角=朝画面右）+ 臂反向轻摆；前腿 dy 补回地面
    'walk-1': dict(legs={'leg-l': {'angle': -26, 'dy': 90}, 'leg-r': {'angle': 16, 'dy': 20}},
                   arms={'l': {'angle': 7}, 'r': {'angle': -7}}),
    'walk-2': dict(legs={'leg-l': {'angle': 4, 'dy': -14}, 'leg-r': {'angle': -6, 'dy': -10}},
                   arms={'l': {'angle': -2}, 'r': {'angle': 2}}),
    'walk-3': dict(legs={'leg-l': {'angle': 16, 'dy': 20}, 'leg-r': {'angle': -26, 'dy': 90}},
                   arms={'l': {'angle': -7}, 'r': {'angle': 7}}),
    'walk-4': dict(legs={'leg-l': {'angle': -6, 'dy': -10}, 'leg-r': {'angle': 4, 'dy': -14}},
                   arms={'l': {'angle': 2}, 'r': {'angle': -2}}),
    # 抬手指向前方（右臂侧举前指）
    'point': dict(move_arms=['r'], arms={'r': {'angle': 74, 'scale': 0.72, 'dx': -30, 'dy': -30}},
                  head={'angle': -3}),
    'point-mid': dict(move_arms=['r'], arms={'r': {'angle': 34, 'scale': 0.88, 'dx': -14, 'dy': -10}},
                  head={'angle': -1}),
    # 托起道具（右臂前平举，掌心向上感）
    'offer': dict(move_arms=['r'], arms={'r': {'angle': 42, 'scale': 0.85, 'dx': -14, 'dy': -6}},
                  head={'angle': -2}),
    'offer-mid': dict(move_arms=['r'], arms={'r': {'angle': 20, 'scale': 0.95, 'dx': -6, 'dy': -2}},
                  head={'angle': -1}),
    # 回眸：头镜像+微侧转
    'look-back': dict(torso_angle=-4, head={'flip': True, 'angle': -8, 'dx': -10, 'dy': 8}),
    # 俯身坐下：大腿外展、小腿内折、腿组纵向压缩、躯干下沉
    'sit': dict(legmode='split',
                thighs={'l': {'angle': -72}, 'r': {'angle': 72}},
                shins={'l': {'angle': 118}, 'r': {'angle': -118}},
                legs_squash=(0.35, 2823, 0),
                move_arms=['l', 'r'],
                arms={'l': {'angle': -20, 'dx': 8}, 'r': {'angle': 20, 'dx': -8}},
                head={'angle': 5}, dy=720),
    'sit-mid': dict(legmode='split',
                thighs={'l': {'angle': -34}, 'r': {'angle': 34}},
                shins={'l': {'angle': 60}, 'r': {'angle': -60}},
                legs_squash=(0.68, 2823, 0),
                move_arms=['l', 'r'],
                arms={'l': {'angle': -8, 'dx': 3}, 'r': {'angle': 8, 'dx': -3}},
                head={'angle': 2}, dy=300),
}

if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv) > 1 else '/tmp/rinwork'
    os.makedirs(outdir, exist_ok=True)
    tile = []
    for name, spec in POSES.items():
        im2 = make_pose(spec)
        im2.save(f'{outdir}/pose-{name}.png')
        t = im2.resize((240, 690))
        bg = Image.new('RGBA', (240, 690), (48, 52, 64, 255))
        bg.alpha_composite(t)
        tile.append(bg.convert('RGB'))
    W2 = sum(t.width for t in tile)
    sheet = Image.new('RGB', (W2, 690), (30, 30, 38))
    x = 0
    for t in tile:
        sheet.paste(t, (x, 0)); x += t.width
    sheet.save(f'{outdir}/poses-sheet.jpg', quality=90)
    print('done ->', outdir)

# ================= 表情变体 =================
FACE = dict(
    eyeL=(285, 500, 402, 652), eyeR=(545, 495, 702, 648),   # (x0,y0,x1,y1)
    mouth=(455, 650, 560, 720),
    mouth_c=(505, 678),
)

def warp_region(src, box, pivot, scale=1.0, sy=None, angle=0.0):
    """把 box 内像素绕 pivot 缩放/旋转后贴回（羽化融合）。"""
    x0, y0, x1, y1 = box
    out = src.copy()
    reg = src[y0:y1, x0:x1].copy()
    M = cv2.getRotationMatrix2D((pivot[0]-x0, pivot[1]-y0), angle, scale)
    if sy is not None:
        M = np.float32([[M[0,0], M[0,1], M[0,2]], [M[1,0]/1*sy, M[1,1]*sy, M[1,2]*sy]])
        M = np.float32([[scale, 0, (pivot[0]-x0)*(1-scale)], [0, scale*sy, (pivot[1]-y0)*(1-scale*sy)]])
    warped = cv2.warpAffine(reg, M, (x1-x0, y1-y0), flags=cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
    m = cv2.GaussianBlur((warped[...,3]>0).astype(np.float32), (0,0), 6)[...,None]
    out[y0:y1, x0:x1, :3] = (warped[...,:3]*m + out[y0:y1,x0:x1,:3]*(1-m)).astype(np.uint8)
    out[y0:y1, x0:x1, 3] = np.maximum(out[y0:y1,x0:x1,3], (warped[...,3]*m[...,0]).astype(np.uint8))
    return out

def erase_region(src, box, feather=8):
    """用 cv2 inpaint 抹掉 box 内细节（取box内深色当mask过重：直接整片inpaint周边）。"""
    x0,y0,x1,y1 = box
    m = np.zeros(src.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = 255
    m &= (src[...,3] > 10).astype(np.uint8)*255
    bgr = cv2.cvtColor(src[...,:3], cv2.COLOR_RGB2BGR)
    fixed = cv2.cvtColor(cv2.inpaint(bgr, m, 6, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
    out = src.copy()
    edge = cv2.GaussianBlur(m.astype(np.float32)/255.0, (0,0), feather)[...,None]
    out[...,:3] = (fixed*edge + out[...,:3]*(1-edge)).astype(np.uint8)
    return out

def draw_arc(canvas, cx, cy, rx, ry, a0, a1, color, width):
    """在脸上画弧线（在透明层上画再叠入）。"""
    lay = np.zeros_like(canvas)
    cv2.ellipse(lay, (int(cx),int(cy)), (int(rx),int(ry)), 0, a0, a1, (*color,255), width, cv2.LINE_AA)
    lay[...,3] = cv2.GaussianBlur(lay[...,3], (0,0), 1.2)
    return over(canvas, lay)

def make_expr(kind):
    a2 = arr.copy()
    if kind == 'calm' or kind == 'determined':
        return Image.fromarray(a2, 'RGBA')   # determined 直接用既有文件，calm=default
    if kind == 'surprised':
        # 眼睛放大 1.16x + 嘴张开小椭圆
        for eye in ('eyeL','eyeR'):
            b = FACE[eye]; c=( (b[0]+b[2])/2, (b[1]+b[3])/2 )
            a2 = warp_region(a2, b, c, scale=1.16)
        a2 = erase_region(a2, FACE['mouth'])
        # 张嘴：暗红外唇+内深
        a2 = draw_arc(a2, 505, 692, 30, 40, 0, 360, (52,30,34), -1)
        a2 = draw_arc(a2, 505, 700, 18, 24, 0, 360, (30,16,20), -1)
    elif kind == 'smile':
        # 嘴角上扬的宽弧 + 眼睛轻眯（上部盖肤色）
        a2 = erase_region(a2, FACE['mouth'])
        a2 = draw_arc(a2, 505, 668, 62, 46, 25, 155, (60,34,34), 7)
        a2 = draw_arc(a2, 430, 660, 9, 9, 0, 360, (60,34,34), -1)   # 左嘴角小勾
        a2 = draw_arc(a2, 580, 660, 9, 9, 0, 360, (60,34,34), -1)
    return Image.fromarray(a2, 'RGBA')
