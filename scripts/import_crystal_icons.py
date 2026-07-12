#!/usr/bin/env python3
"""Copy crystal icons from Desktop folder into web-static/assets/icons/crystals."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

SRC = Path(r"C:\Users\Bbdev\Desktop\Новая папка\без_числа")
OUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "icons" / "crystals"
MANIFEST = Path(__file__).resolve().parents[1] / "assets" / "icons" / "crystal-icons.json"

TYPE_BY_SUFFIX = {
    "небесных_светил": "sun",
    "небесного_металла": "moon",
    "небесного_творения": "time",
    "небесного_огня": "space",
    "грозовых_ливней": "soul",
    "земной_тверди": "spirit",
    "весенних_ветров": "birth",
    "бушующих_морей": "death",
}

# Game slot levels 3-7 -> icon quality tier (best match in source pack).
LEVEL_QUALITIES = {
    3: "Яркий",
    4: "Чистый",
    5: "Мерцающий",
    6: "Сверкающий",
    7: "Искрящийся",
}

QUALITY_RANK = {q: i for i, q in enumerate(LEVEL_QUALITIES.values())}
FNAME_RE = re.compile(
    r"^(?P<item_id>\d+)_(?P<quality>Яркий|Чистый|Мерцающий|Сверкающий|Искрящийся)_камень_(?P<suffix>.+)\.png$",
    re.UNICODE,
)


def parse_file(path: Path) -> dict | None:
    m = FNAME_RE.match(path.name)
    if not m:
        return None
    suffix = m.group("suffix")
    type_id = TYPE_BY_SUFFIX.get(suffix)
    if not type_id:
        return None
    return {
        "path": path,
        "item_id": m.group("item_id"),
        "quality": m.group("quality"),
        "type_id": type_id,
    }


def pick_icon(candidates: list[dict], want_quality: str) -> dict | None:
    if not candidates:
        return None
    exact = [c for c in candidates if c["quality"] == want_quality]
    if exact:
        return sorted(exact, key=lambda c: c["item_id"])[0]
    want_rank = QUALITY_RANK.get(want_quality, 99)
    return sorted(
        candidates,
        key=lambda c: (abs(QUALITY_RANK.get(c["quality"], 99) - want_rank), c["item_id"]),
    )[0]


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Source folder not found: {SRC}")

    grouped: dict[str, list[dict]] = {t: [] for t in TYPE_BY_SUFFIX.values()}
    for path in sorted(SRC.glob("*.png")):
        rec = parse_file(path)
        if rec:
            grouped[rec["type_id"]].append(rec)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.png"):
        old.unlink()

    manifest: dict[str, dict[str, str]] = {}
    copied = 0

    for type_id, files in grouped.items():
        manifest[type_id] = {}
        for level, quality in LEVEL_QUALITIES.items():
            picked = pick_icon(files, quality)
            if not picked:
                continue
            out_name = f"{type_id}_L{level}.png"
            shutil.copy2(picked["path"], OUT_DIR / out_name)
            manifest[type_id][str(level)] = f"assets/icons/crystals/{out_name}"
            copied += 1
            print(f"{type_id} L{level} <- {picked['path'].name}")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCopied {copied} icons -> {OUT_DIR}")
    print(f"Manifest -> {MANIFEST}")


if __name__ == "__main__":
    main()
