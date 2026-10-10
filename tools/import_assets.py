#!/usr/bin/env python3
"""mycryptoheroes アセットDBから、ゲームで使う素材だけを assets/ にコピーする。

使い方:
    python3 tools/import_assets.py [mycryptoheroesリポジトリのパス]

パスを省略した場合は ../mycryptoheroes を参照します。
背景画像は 600x900 の JPEG に縮小します。キャラ・商品・アイコンの PNG は可逆の WebP に変換します
（大きいエネミー画像は 256px に縮小）。Pillow が必要です。assets/og.jpg（OGP画像）は消しません。
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
except ImportError:
    raise SystemExit("Pillow が必要です: pip install pillow")

# 作り直すフォルダ（assets/og.jpg などそれ以外は残す）
MANAGED = ["heroes", "extensions", "enemies", "backgrounds", "characters", "icons", "audio", "vendor"]  # effects は手で置いた素材なので消さない


def copy(src: Path, dst: Path) -> None:
    if not src.exists():
        raise SystemExit(f"見つかりません: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def sprite(src: Path, dst: Path, max_size: int = 0) -> None:
    """PNG を可逆の WebP にして保存する（ドット絵が崩れない）。PNG 以外はそのままコピー"""
    if src.suffix.lower() != ".png":
        copy(src, dst.with_suffix(src.suffix))
        return
    if not src.exists():
        raise SystemExit(f"見つかりません: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    if max_size and max(im.size) > max_size:
        im = im.convert("RGBA").resize((max_size, max_size), Image.LANCZOS)
    im.save(dst.with_suffix(".webp"), "WEBP", lossless=True, method=6)


def main() -> None:
    manifest = json.loads((ROOT / "tools" / "assets.json").read_text(encoding="utf-8"))
    for d in MANAGED:
        if (OUT / d).exists():
            shutil.rmtree(OUT / d)

    for hero_id in manifest["heroes"]:
        sprite(SRC / f"Image/Heroes/{hero_id}.png", OUT / f"heroes/{hero_id}")
    for ext_id in manifest["extensions"]:
        sprite(SRC / f"Image/Extensions/{ext_id}.png", OUT / f"extensions/{ext_id}")
    for enemy_id in manifest["enemies"]:
        sprite(SRC / f"Image/Enemies/{enemy_id}.png", OUT / f"enemies/{enemy_id}", 256)

    for key, bg_id in manifest["backgrounds"].items():
        src = SRC / f"Image/Backgrounds/{bg_id}.png"
        dst = OUT / f"backgrounds/{key}.jpg"
        dst.parent.mkdir(parents=True, exist_ok=True)
        Image.open(src).convert("RGB").resize((600, 900), Image.LANCZOS).save(dst, quality=82)

    for png in sorted((SRC / "Image/Characters").glob("*.png")):
        sprite(png, OUT / f"characters/{png.stem}")
    for name in manifest["icons"]:
        sprite(SRC / f"Image/Icons/{name}", OUT / f"icons/{Path(name).stem}")
    copy(SRC / "Image/Icons/gum.png", OUT / "icons/gum.png")  # ファビコンは PNG のまま
    for rel in manifest["battle_icons"]:
        sprite(SRC / f"Image/BattleIcons/{rel}", OUT / f"icons/{Path(rel).stem}")
    for name in manifest["bgm"]:
        copy(SRC / f"Audio/BGM/{name}", OUT / f"audio/bgm/{name}")
    for rel, name in manifest.get("bgm_from_se", {}).items():
        copy(SRC / f"Audio/SE/{rel}", OUT / f"audio/bgm/{name}")
    for rel, name in manifest["se"].items():
        copy(SRC / f"Audio/SE/{rel}", OUT / f"audio/se/{name}")

    for rel, name in manifest.get("vendor", {}).items():
        copy(SRC / rel, OUT / f"vendor/{name}")
    shutil.copyfile(SRC / "Data/Characters/metadata.json", OUT / "characters/metadata.json")
    print(f"assets/ を再生成しました（参照元: {SRC}）")


if __name__ == "__main__":
    main()
