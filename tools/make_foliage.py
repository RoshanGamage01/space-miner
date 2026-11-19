"""Build leaf-cluster cards (RGBA) for the tree generator from scanned leaf atlases."""
import math, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

S = 1024
random.seed(4)

def cut(path, box=None, thr=22, min_area=1500):
    im = Image.open(path).convert('RGB')
    if box: im = im.crop(box)
    a = np.asarray(im).astype(np.float32)
    mask = a.max(axis=2) > thr
    mask = ndi.binary_opening(mask, iterations=1)
    lab, n = ndi.label(mask)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        m = lab[sl] == i + 1
        if m.sum() < min_area: continue
        m = ndi.binary_erosion(m, iterations=1)
        rgba = np.dstack([a[sl], (ndi.gaussian_filter(m.astype(np.float32), 0.8) * 255)]).astype(np.uint8)
        out.append(Image.fromarray(rgba, 'RGBA'))
    return out

def bleed(im):
    """Fill transparent pixels with nearby colour so mipmaps do not get dark fringes."""
    a = np.asarray(im).copy()
    solid = a[..., 3] > 40
    idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    rgb = a[..., :3][idx[0], idx[1]]
    a[..., :3] = rgb
    return Image.fromarray(a, 'RGBA')

def paste_leaf(canvas, leaf, x, y, ang, scale, shade=1.0):
    w, h = leaf.size
    l = leaf.resize((max(2, int(w * scale)), max(2, int(h * scale))), Image.LANCZOS)
    if shade != 1.0:
        arr = np.asarray(l).astype(np.float32); arr[..., :3] *= shade
        l = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA')
    # leaf images point up with the stem at the bottom: pivot at bottom centre
    pad = Image.new('RGBA', (l.size[0], l.size[1] * 2), (0, 0, 0, 0)); pad.paste(l, (0, 0))
    r = pad.rotate(-math.degrees(ang), expand=True, resample=Image.BICUBIC)
    canvas.alpha_composite(r, (int(x - r.size[0] / 2), int(y - r.size[1] / 2)))

def twig(draw, pts, w, col):
    for i in range(len(pts) - 1):
        ww = max(1, int(w * (1 - i / len(pts)) + 1))
        draw.line([pts[i], pts[i + 1]], fill=col, width=ww)

def broadleaf(leaves, out, n_side=7, leaf_scale=0.42, col=(78, 62, 44, 255)):
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    stems = [((S * 0.5, S * 0.99), -0.0, S * 0.9, 9)]
    for side in (-1, 1):
        for k in range(3):
            t = 0.2 + k * 0.22
            stems.append(((S * 0.5 + side * 4, S * (0.99 - t * 0.9)), side * (0.75 + random.uniform(-0.15, 0.15)), S * (0.5 - k * 0.09), 5))
    items = []
    for (x0, y0), ang, length, w in stems:
        pts = []; a = ang
        for i in range(13):
            f = i / 12
            pts.append((x0 + math.sin(a) * length * f, y0 - math.cos(a) * length * f))
            a += random.uniform(-0.03, 0.03) + (0.012 if ang > 0 else -0.012)
        twig(d, pts, w, col)
        for i in range(2, 13):
            for s in (-1, 1):
                if random.random() < 0.12: continue
                px, py = pts[i]
                la = a + s * random.uniform(0.6, 1.25)
                items.append((py, px, py, la))
        items.append((pts[-1][1], pts[-1][0], pts[-1][1], a))
    random.shuffle(items)
    for i, (_, px, py, la) in enumerate(items):
        leaf = random.choice(leaves)
        paste_leaf(c, leaf, px, py, la, leaf_scale * random.uniform(0.75, 1.1), random.uniform(0.72, 1.12))
    bleed(c).save(out)

def fronds(leaves, out):
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for i in range(9):
        f = random.choice(leaves)
        if f.size[0] > f.size[1]: f = f.rotate(90, expand=True)
        ang = (i - 4) * 0.36 + random.uniform(-0.1, 0.1)
        paste_leaf(c, f, S * 0.5, S * 0.97, ang, (S * 0.78 / f.size[1]) * random.uniform(0.8, 1.0), random.uniform(0.8, 1.1))
    bleed(c).save(out)

def pine(out, fir=False):
    c = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    def branch(x0, y0, ang, length, depth):
        steps = int(length / 9)
        a = ang; x, y = x0, y0
        for i in range(steps):
            f = i / steps
            nx, ny = x + math.sin(a) * 9, y - math.cos(a) * 9
            d.line([(x, y), (nx, ny)], fill=(70, 52, 36, 255), width=max(1, int((5 - depth * 2) * (1 - f)) + 1))
            nl = (26 if fir else 52) * (1 - f * 0.4) * (1 - depth * 0.25)
            for k in range(5 if fir else 4):
                for s in (-1, 1):
                    na = a + s * random.uniform(0.45, 1.15 if fir else 0.85)
                    g = random.randint(70, 135); r = int(g * random.uniform(0.42, 0.62)); b = int(g * random.uniform(0.3, 0.5))
                    l = nl * random.uniform(0.7, 1.1)
                    px = x + (nx - x) * random.random(); py = y + (ny - y) * random.random()
                    d.line([(px, py), (px + math.sin(na) * l, py - math.cos(na) * l)], fill=(r, g, b, 255), width=2)
            if depth < 2 and i > 2 and i % (5 if depth == 0 else 6) == 0:
                for s in (-1, 1):
                    branch(nx, ny, a + s * random.uniform(0.6, 0.95), length * (1 - f) * 0.62, depth + 1)
            a += random.uniform(-0.035, 0.035)
            x, y = nx, ny
    branch(S * 0.5, S * 0.99, 0.0, S * 0.9, 0)
    c = c.filter(ImageFilter.GaussianBlur(0.6))
    bleed(c).save(out)

A = 'assets/trees/'
isl = cut(A + 'island_tree_01/island_tree_01_leaves_diff_1k.jpg')
print('island leaves', len(isl))
broadleaf(isl, 'assets/foliage/broadleaf.png')
sm = cut(A + 'tree_small_02/tree_small_02_leaves_diff_1k.jpg', box=(0, 0, 560, 1024), min_area=900)
sm = [l for l in sm if 30 < l.size[0] < 260 and 30 < l.size[1] < 260]
print('small leaves', len(sm))
broadleaf(sm, 'assets/foliage/broadleaf2.png', leaf_scale=0.62, col=(60, 70, 40, 255))
jac = cut(A + 'jacaranda_tree/jacaranda_tree_leaves_diff_1k.jpg', min_area=6000)
print('fronds', len(jac))
fronds(jac, 'assets/foliage/jacaranda.png')
pine('assets/foliage/pine.png'); pine('assets/foliage/fir.png', fir=True)
prev = Image.new('RGB', (S * 5 // 4, S // 4), (40, 40, 60))
for i, n in enumerate(['broadleaf', 'broadleaf2', 'jacaranda', 'pine', 'fir']):
    im = Image.open(f'assets/foliage/{n}.png').resize((S // 4, S // 4)); prev.paste(im, (i * S // 4, 0), im)
prev.save('/home/user/assets_raw/foliage_prev.png')
