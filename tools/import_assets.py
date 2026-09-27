#!/usr/bin/env python3
"""mycryptoheroes アセットDBから、ゲームで使う素材だけを assets/ にコピーする。

使い方:
    python3 tools/import_assets.py [mycryptoheroesリポジトリのパス]

パスを省略した場合は ../mycryptoheroes を参照します。
背景画像は Pillow があれば 600x900 の JPEG に縮小し、なければそのままコピーします。
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (ROOT.parent / "mycryptoheroes")
OUT = ROOT / "assets"

try:
    from PIL import Image  # type: ignore
except ImportError:  # Pillow がなくても動く
    Image = None


def copy(src: Path, dst: Path) -> None:
    if not src.exists():
        raise SystemExit(f"見つかりません: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def main() -> None:
    manifest = json.loads((ROOT / "tools" / "assets.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)

    for hero_id in manifest["heroes"]:
        copy(SRC / f"Image/Heroes/{hero_id}.png", OUT / f"heroes/{hero_id}.png")
    for ext_id in manifest["extensions"]:
        copy(SRC / f"Image/Extensions/{ext_id}.png", OUT / f"extensions/{ext_id}.png")
    for enemy_id in manifest["enemies"]:
        copy(SRC / f"Image/Enemies/{enemy_id}.png", OUT / f"enemies/{enemy_id}.png")

    for key, bg_id in manifest["backgrounds"].items():
        src = SRC / f"Image/Backgrounds/{bg_id}.png"
        if Image is not None:
            dst = OUT / f"backgrounds/{key}.jpg"
            dst.parent.mkdir(parents=True, exist_ok=True)
            Image.open(src).convert("RGB").resize((600, 900), Image.LANCZOS).save(dst, quality=82)
        else:
            copy(src, OUT / f"backgrounds/{key}.png")

    for png in sorted((SRC / "Image/Characters").glob("*.png")):
        copy(png, OUT / f"characters/{png.name}")
    for name in manifest["icons"]:
        copy(SRC / f"Image/Icons/{name}", OUT / f"icons/{name}")
    for rel in manifest["battle_icons"]:
        copy(SRC / f"Image/BattleIcons/{rel}", OUT / f"icons/{Path(rel).name}")
    for name in manifest["bgm"]:
        copy(SRC / f"Audio/BGM/{name}", OUT / f"audio/bgm/{name}")
    for rel, name in manifest["se"].items():
        copy(SRC / f"Audio/SE/{rel}", OUT / f"audio/se/{name}")

    shutil.copyfile(SRC / "Data/Characters/metadata.json", OUT / "characters/metadata.json")
    print(f"assets/ を再生成しました（参照元: {SRC}）")


if __name__ == "__main__":
    main()
