"""
Gera o ATLAS FACIAL do Ícaro a partir do vídeo original do holograma.

Saída (avatar/assets/):
  base.jpg      rosto base: frontal, olhos abertos, boca fechada (720x720)
  mouth.webp    sprite com recortes da boca/queixo alinhados ao rosto base (RGBA, bordas suaves)
  eyes.webp     sprite com recortes dos olhos (piscar em 3 níveis + sobrancelha levantada)
  atlas.json    posições, métricas (abertura/largura da boca) e metadados

Uso:
  pip install --use-feature=truststore mediapipe opencv-python-headless numpy
  python tools/build_atlas.py "video.mp4" [--end 66] [--base 40]

Como funciona:
  1. Detecta 468 pontos do rosto (MediaPipe FaceMesh) em cada quadro.
  2. Descarta quadros com cabeça virada, clarões de brilho ou desfoque.
  3. Alinha cada quadro ao rosto base (olhos + nariz) e recorta boca e olhos
     com máscara elíptica suavizada e correção de cor.
  4. Escolhe recortes que cobrem todo o espaço de formas de boca (abertura x largura),
     e os níveis de piscada, e empacota em sprites.
"""
import argparse, json, math, os, sys
import numpy as np
import cv2

try:
    import truststore; truststore.inject_into_ssl()
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'avatar', 'assets')
SIZE = 720

# índices FaceMesh
L_EYE_OUT, R_EYE_OUT, L_EYE_IN, R_EYE_IN = 33, 263, 133, 362
NOSE_TIP, NOSE_BRIDGE = 1, 168
UP_IN, LO_IN, UP_OUT, LO_OUT, M_L, M_R = 13, 14, 0, 17, 61, 291
CHIN = 152
L_UP, L_LO, R_UP, R_LO = 159, 145, 386, 374
L_BROW, R_BROW = 105, 334
STABLE = [L_EYE_OUT, R_EYE_OUT, L_EYE_IN, R_EYE_IN, NOSE_BRIDGE, 6, 197, 195]


def get_mesh():
    import mediapipe as mp
    if hasattr(mp, 'solutions') and hasattr(mp.solutions, 'face_mesh'):
        fm = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=True,
                                             min_detection_confidence=0.4)

        def run(rgb):
            r = fm.process(rgb)
            if not r.multi_face_landmarks:
                return None
            h, w = rgb.shape[:2]
            return np.array([[p.x * w, p.y * h] for p in r.multi_face_landmarks[0].landmark], np.float32)
        return run
    # API Tasks (mediapipe >= 0.10.3x)
    from mediapipe.tasks.python import vision, BaseOptions
    model = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_landmarker.task')
    if not os.path.exists(model):
        import urllib.request
        print('baixando modelo face_landmarker.task…')
        urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', model)
    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model), num_faces=1, min_face_detection_confidence=0.4))

    def run(rgb):
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        r = lm.detect(img)
        if not r.face_landmarks:
            return None
        h, w = rgb.shape[:2]
        return np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]], np.float32)
    return run


def feats(P):
    iod = np.linalg.norm(P[L_EYE_OUT] - P[R_EYE_OUT])
    eye_mid = (P[L_EYE_OUT] + P[R_EYE_OUT]) / 2
    return dict(
        iod=iod,
        open=float(np.linalg.norm(P[UP_IN] - P[LO_IN]) / iod),
        width=float(np.linalg.norm(P[M_L] - P[M_R]) / iod),
        eye=float((np.linalg.norm(P[L_UP] - P[L_LO]) + np.linalg.norm(P[R_UP] - P[R_LO])) / 2 / iod),
        brow=float(((P[L_UP][1] - P[L_BROW][1]) + (P[R_UP][1] - P[R_BROW][1])) / 2 / iod),
        yaw=float((P[NOSE_TIP][0] - eye_mid[0]) / iod),
        pitch=float((P[NOSE_TIP][1] - eye_mid[1]) / iod),
        roll=float(math.degrees(math.atan2(P[R_EYE_OUT][1] - P[L_EYE_OUT][1], P[R_EYE_OUT][0] - P[L_EYE_OUT][0]))),
    )


def ellipse_mask(shape, center, axes, feather):
    m = np.zeros(shape[:2], np.float32)
    cv2.ellipse(m, (int(center[0]), int(center[1])), (int(axes[0]), int(axes[1])), 0, 0, 360, 1.0, -1)
    k = int(feather) * 2 + 1
    return cv2.GaussianBlur(m, (k, k), feather / 2)


def color_match(src, ref, mask):
    """Ajusta média/desvio de cor do recorte ao rosto base dentro da máscara (evita piscar de brilho)."""
    w = mask > 0.2
    out = src.astype(np.float32)
    for c in range(3):
        s, r = out[..., c][w], ref[..., c][w].astype(np.float32)
        if s.size < 50:
            continue
        out[..., c] = (out[..., c] - s.mean()) * (r.std() / (s.std() + 1e-3)) + r.mean()
    return np.clip(out, 0, 255).astype(np.uint8)


GUTTER = 4  # margem transparente entre recortes: evita "vazar" o recorte vizinho ao girar/escalar


def pack(patches, cols):
    h, w = patches[0].shape[:2]
    sh, sw = h + 2 * GUTTER, w + 2 * GUTTER
    rows = math.ceil(len(patches) / cols)
    sheet = np.zeros((rows * sh, cols * sw, 4), np.uint8)
    for i, p in enumerate(patches):
        r, c = divmod(i, cols)
        sheet[r * sh + GUTTER:r * sh + GUTTER + h, c * sw + GUTTER:c * sw + GUTTER + w] = p
    return sheet


def farthest_points(X, k, seed_idx):
    chosen = [seed_idx]
    d = np.linalg.norm(X - X[seed_idx], axis=1)
    while len(chosen) < min(k, len(X)):
        i = int(d.argmax())
        if d[i] < 1e-4:
            break
        chosen.append(i)
        d = np.minimum(d, np.linalg.norm(X - X[i], axis=1))
    return chosen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--start', type=float, default=3.0, help='ignora o fade de entrada')
    ap.add_argument('--end', type=float, default=66.0, help='antes do cartão final')
    ap.add_argument('--base', type=float, default=40.0, help='segundo do quadro base (neutro)')
    ap.add_argument('--crop', default='420,0,1080,1080', help='x,y,w,h do rosto no vídeo')
    ap.add_argument('--step', type=int, default=1, help='usar 1 a cada N quadros')
    ap.add_argument('--mouths', type=int, default=36)
    a = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    cx, cy, cw, ch = map(int, a.crop.split(','))
    mesh = get_mesh()
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24

    def grab(t):
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, f = cap.read()
        return cv2.resize(f[cy:cy + ch, cx:cx + cw], (SIZE, SIZE), interpolation=cv2.INTER_AREA) if ok else None

    base = grab(a.base)
    Pb = mesh(cv2.cvtColor(base, cv2.COLOR_BGR2RGB))
    if Pb is None:
        sys.exit('rosto não encontrado no quadro base')
    fb = feats(Pb)
    iod = fb['iod']
    base_bright = float(base.mean())
    print(f"base: IOD={iod:.1f}px abertura={fb['open']:.3f} olhos={fb['eye']:.3f}")

    # regiões no espaço do rosto base
    mouth_c = (Pb[UP_IN] + Pb[LO_IN]) / 2
    mc = mouth_c + np.array([0, 0.12 * iod])
    m_axes = (0.52 * iod, 0.47 * iod)
    m_mask = ellipse_mask(base.shape, mc, m_axes, 0.12 * iod)
    # anel externo (bochechas/queixo): deve mudar pouco; muita diferença = efeito gráfico ou desalinhamento
    ring = np.clip(m_mask - ellipse_mask(base.shape, mouth_c, (0.30 * iod, 0.20 * iod), 0.05 * iod), 0, 1)
    ys, xs = np.where(m_mask > 0.01)
    mbox = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]

    e_mask = np.maximum(
        ellipse_mask(base.shape, (Pb[L_UP] + Pb[L_LO]) / 2 - [0, 0.06 * iod], (0.30 * iod, 0.22 * iod), 0.09 * iod),
        ellipse_mask(base.shape, (Pb[R_UP] + Pb[R_LO]) / 2 - [0, 0.06 * iod], (0.30 * iod, 0.22 * iod), 0.09 * iod))
    ys, xs = np.where(e_mask > 0.01)
    ebox = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]

    # varre o vídeo
    cands = []
    total = int((a.end - a.start) * fps)
    cap.set(cv2.CAP_PROP_POS_MSEC, a.start * 1000)
    for n in range(total):
        ok, f = cap.read()
        if not ok:
            break
        if n % a.step:
            continue
        fr = cv2.resize(f[cy:cy + ch, cx:cx + cw], (SIZE, SIZE), interpolation=cv2.INTER_AREA)
        P = mesh(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
        if P is None:
            continue
        ft = feats(P)
        # alinhamento de similaridade (olhos + ponte do nariz) ao rosto base
        M, _ = cv2.estimateAffinePartial2D(P[STABLE], Pb[STABLE], method=cv2.LMEDS)
        if M is None:
            continue
        scale = math.hypot(M[0, 0], M[1, 0])
        bright = float(fr.mean())
        sharp = float(cv2.Laplacian(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        ft.update(t=a.start + n / fps, M=M, scale=scale, bright=bright, sharp=sharp)
        pose_ok = abs(ft['yaw'] - fb['yaw']) < 0.07 and abs(ft['pitch'] - fb['pitch']) < 0.09 and abs(ft['roll'] - fb['roll']) < 6
        light_ok = abs(bright - base_bright) / base_bright < 0.18
        if pose_ok and light_ok and 0.85 < scale < 1.18:
            cands.append((ft, fr))
        if n % 200 == 0:
            print(f'  {a.start + n / fps:5.1f}s  candidatos={len(cands)}')
    print(f'{len(cands)} quadros utilizáveis')
    if len(cands) < 10:
        sys.exit('poucos quadros utilizáveis; ajuste --crop/--base')

    def aligned(ft, fr):
        return cv2.warpAffine(fr, ft['M'], (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    def cut(img, mask, box):
        x, y, w, h = box
        rgb = color_match(img, base, mask)[y:y + h, x:x + w]
        alpha = (mask[y:y + h, x:x + w] * 255).astype(np.uint8)
        return np.dstack([rgb, alpha])

    # ---------- BOCA: cobre o espaço abertura x largura ----------
    sharp_min = np.percentile([c[0]['sharp'] for c in cands], 25)
    good = [c for c in cands if c[0]['sharp'] >= sharp_min and c[0]['eye'] > fb['eye'] * 0.7] or cands
    # descarta recortes com artefatos (ondas/linhas gráficas do holograma, desalinhamento)
    def artifact(c):
        al = cv2.warpAffine(c[1], c[0]['M'], (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        d = np.abs(al.astype(np.float32) - base.astype(np.float32)).mean(2)
        return float((d * ring).sum() / (ring.sum() + 1e-6))
    scores = np.array([artifact(c) for c in good])
    good = [c for c, sc in zip(good, scores) if sc <= np.percentile(scores, 70)]
    print(f'{len(good)} recortes de boca sem artefatos')
    X = np.array([[c[0]['open'], c[0]['width']] for c in good])
    Xn = (X - X.min(0)) / (np.ptp(X, axis=0) + 1e-6)
    closed = int(np.argmin(X[:, 0] + 0.2 * np.abs(X[:, 1] - fb['width'])))
    sel = farthest_points(Xn, a.mouths, closed)
    sel.sort(key=lambda i: (X[i, 0], X[i, 1]))
    mouth_patches, mouth_meta = [], []
    for i in sel:
        ft, fr = good[i]
        mouth_patches.append(cut(aligned(ft, fr), m_mask, mbox))
        mouth_meta.append({'open': round(ft['open'], 4), 'width': round(ft['width'], 4), 't': round(ft['t'], 2)})
    # recorte da própria base = boca neutra perfeita (sem troca visível em repouso)
    mouth_patches.insert(0, cut(base, m_mask, mbox))
    mouth_meta.insert(0, {'open': round(fb['open'], 4), 'width': round(fb['width'], 4), 't': a.base, 'neutral': True})

    # ---------- OLHOS: piscada (3 níveis) + sobrancelha ----------
    eye_all = [c for c in cands if abs(c[0]['yaw'] - fb['yaw']) < 0.05]
    E = np.array([c[0]['eye'] for c in eye_all])
    eye_patches, eye_meta = [cut(base, e_mask, ebox)], [{'kind': 'open', 'eye': round(fb['eye'], 4)}]
    for kind, target, tol in (('half', 0.55, 0.15), ('closed', 0.12, 0.3)):
        i = int(np.argmin(np.abs(E / fb['eye'] - target)))
        if abs(E[i] / fb['eye'] - target) < tol:
            ft, fr = eye_all[i]
            eye_patches.append(cut(aligned(ft, fr), e_mask, ebox))
            eye_meta.append({'kind': kind, 'eye': round(ft['eye'], 4), 't': round(ft['t'], 2)})
    B = np.array([c[0]['brow'] - fb['brow'] for c in eye_all])
    ok_open = np.array([c[0]['eye'] > fb['eye'] * 1.0 for c in eye_all])
    if ok_open.any():
        i = int(np.argmax(np.where(ok_open, B, -9)))
        if B[i] > 0.02:
            ft, fr = eye_all[i]
            eye_patches.append(cut(aligned(ft, fr), e_mask, ebox))
            eye_meta.append({'kind': 'brow', 'eye': round(ft['eye'], 4), 'brow': round(float(B[i]), 4), 't': round(ft['t'], 2)})
    print('olhos:', [m['kind'] for m in eye_meta])

    cols = 6
    cv2.imwrite(os.path.join(OUT, 'base.jpg'), base, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, 'mouth.webp'), pack(mouth_patches, cols), [cv2.IMWRITE_WEBP_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, 'eyes.webp'), pack(eye_patches, 2), [cv2.IMWRITE_WEBP_QUALITY, 92])
    meta = {
        'version': 2, 'size': SIZE, 'gutter': GUTTER, 'iod': round(float(iod), 2),
        'base': {'open': round(fb['open'], 4), 'width': round(fb['width'], 4), 'eye': round(fb['eye'], 4)},
        'range': {'open': [float(X[:, 0].min()), float(X[:, 0].max())], 'width': [float(X[:, 1].min()), float(X[:, 1].max())]},
        'mouth': {'box': mbox, 'cols': cols, 'frames': mouth_meta},
        'eyes': {'box': ebox, 'cols': 2, 'frames': eye_meta},
        'anchors': {'mouth': [float(mouth_c[0]), float(mouth_c[1])], 'chin': [float(Pb[CHIN][0]), float(Pb[CHIN][1])],
                    'eyeL': [float(Pb[L_UP][0]), float(Pb[L_UP][1])], 'eyeR': [float(Pb[R_UP][0]), float(Pb[R_UP][1])]},
    }
    with open(os.path.join(OUT, 'atlas.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f'OK: {len(mouth_patches)} bocas, {len(eye_patches)} olhos -> {OUT}')


if __name__ == '__main__':
    main()
