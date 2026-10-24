#!/usr/bin/env python3
"""ホーム画面のアイコンを作る：python3 tools/app_icon.py

クリスのドット絵（腕組みの立ち絵 assets/characters/chris_01_arms_crossed.webp。手が顔にかからない）から顔のまわりだけを切り出し、
金色の背景に、画素を崩さない整数倍で大きく置く。出力は assets/app/（import_assets.py が作り直すフォルダの外）。

- maskable-*.png：Android の丸・角丸の切り抜き用。顔は中央の安全な範囲（直径80%）に収める
- icon-*.png：切り抜かれない環境（PCのインストールなど）用。角を丸めた正方形で、顔をより大きく
- apple-touch-icon.png：iPhone のホーム画面用（角は端末が丸める。透明は使えないので全面を塗る）
Pillow が必要。
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/characters/chris_01_arms_crossed.webp"
OUT = ROOT / "assets/app"
FACE = (13, 15, 49, 51)  # 帽子のてっぺんから襟もとまで（36×36）
TOP = (250, 204, 76)  # 金色（ゲームの差し色）を上から下へ少し濃く
BOTTOM = (228, 146, 22)


def background(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(im)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(TOP[i] * (1 - t) + BOTTOM[i] * t) for i in range(3)) + (255,))
    return im


def icon(size: int, scale: int, rounded: bool = False) -> Image.Image:
    face = Image.open(SRC).convert("RGBA").crop(FACE)
    big = face.resize((face.width * scale, face.height * scale), Image.NEAREST)
    im = background(size)
    im.alpha_composite(big, ((size - big.width) // 2, (size - big.height) // 2))
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.22), fill=255)
        im.putalpha(mask)
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = {
        "maskable-512.png": icon(512, 10),  # 顔 360px（直径80%＝410px の円に収まる）
        "maskable-192.png": icon(192, 4),  # 顔 144px
        "icon-512.png": icon(512, 12, rounded=True),  # 顔 432px
        "icon-192.png": icon(192, 4, rounded=True),
        "apple-touch-icon.png": icon(180, 4).convert("RGB"),  # 顔 144px
    }
    for name, im in targets.items():
        im.save(OUT / name, optimize=True)
        print(OUT / name, im.size)


if __name__ == "__main__":
    main()
