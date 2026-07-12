#!/usr/bin/env python3
"""Bundle CSV tables into web-static/data/game-data.json for offline frontend."""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLES = ROOT / "data" / "tables"
OUT = Path(__file__).resolve().parents[1] / "data" / "game-data.json"

POWER_COLS = [
    "qian_tian", "kun_di", "zhen_lei", "gen_shan",
    "kan_shui", "li_huo", "xun_feng", "dui_ze",
]

DISK_LAYOUTS = {
    "basic": {"name_ru": "Базовый брактеат", "eternal": 4, "reincarnation": 0, "chaos": 0},
    "medium": {"name_ru": "Средний брактеат", "eternal": 4, "reincarnation": 4, "chaos": 0},
    "high": {"name_ru": "Высокий брактеат", "eternal": 4, "reincarnation": 4, "chaos": 1},
    "ultimate": {"name_ru": "Ультимативный брактеат", "eternal": 8, "reincarnation": 4, "chaos": 1},
}

ETERNAL_TYPES = [
    {"id": "sun", "name_ru": "Руна небесных светил", "shape": "circle"},
    {"id": "moon", "name_ru": "Руна небесного металла", "shape": "circle"},
    {"id": "time", "name_ru": "Руна небесного творения", "shape": "circle"},
    {"id": "space", "name_ru": "Руна небесного огня", "shape": "circle"},
]

REINCARNATION_TYPES = [
    {"id": "soul", "name_ru": "Руна грозовых ливней", "shape": "pentagon"},
    {"id": "spirit", "name_ru": "Руна земной тверди", "shape": "pentagon"},
    {"id": "birth", "name_ru": "Руна весенних ветров", "shape": "pentagon"},
    {"id": "death", "name_ru": "Руна бушующих морей", "shape": "pentagon"},
]

POWER_TO_TYPE = {
    "qian_tian": "sun", "kun_di": "moon", "kan_shui": "time", "li_huo": "space",
    "zhen_lei": "soul", "gen_shan": "spirit", "xun_feng": "birth", "dui_ze": "death",
}

POWER_DISPLAY_COLS = [
    "qian_tian", "kun_di", "kan_shui", "li_huo",
    "zhen_lei", "gen_shan", "xun_feng", "dui_ze",
]

RUNE_LABELS = {t["id"]: t["name_ru"] for t in ETERNAL_TYPES + REINCARNATION_TYPES}
POWER_RUNE_LABELS = {p: RUNE_LABELS[t] for p, t in POWER_TO_TYPE.items()}


def _pick_name(row: dict) -> str | None:
    for key in ("client_name_ru", "name_ru", "variant_name_ru"):
        val = (row.get(key) or "").strip()
        if val:
            return val
    return None


def load_ring_crystals() -> list[dict]:
    rows = []
    with (TABLES / "crystals_by_level.csv").open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rows.append({
                "type_id": row["id"],
                "ring": row["ring"],
                "name_ru": row["name_ru"],
                "level": int(row["level"]),
                "base_stat": row["base_stat"],
                "stat_value": int(row["stat_value"]) if row["stat_value"] else None,
                "power_id": row["power_id"],
                "power_ru": row["power_ru"],
                "power_points": int(row["power_points"]),
            })
    return rows


def load_chaos() -> list[dict]:
    rows = []
    with (TABLES / "chaos_crystals.csv").open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rec = dict(row)
            rec["level"] = int(row["level"])
            rec["power_total"] = int(row["power_total"]) if row["power_total"] else 0
            for col in POWER_COLS:
                rec[col] = int(row[col] or 0)
            rows.append(rec)
    return rows


def load_bonuses() -> list[dict]:
    rows = []
    with (TABLES / "bonuses.csv").open(encoding="utf-8", newline="") as f:
        for i, row in enumerate(csv.DictReader(f), start=1):
            rec = dict(row)
            rec["id"] = i
            rec["tier"] = int(row["tier"])
            for col in POWER_COLS:
                rec[col] = int(row[col] or 0)
            rows.append(rec)
    return rows


def load_catalog() -> list[dict]:
    path = TABLES / "bracteate_crystals_catalog.csv"
    if not path.exists():
        return []
    rows = []
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rec = dict(row)
            if rec.get("level"):
                rec["level"] = int(rec["level"])
            rows.append(rec)
    return rows


def build_display_names(ring_rows: list[dict], chaos_rows: list[dict], catalog: list[dict]) -> dict[str, str]:
    names: dict[str, str] = {}

    cat_ring: dict[tuple, dict] = {}
    cat_chaos: dict[tuple, dict] = {}
    for row in catalog:
        ring = row.get("ring")
        if ring == "chaos":
            key = (row.get("class_id"), row.get("variant_id"), row.get("level"))
            cat_chaos[key] = row
        elif ring in ("eternal", "reincarnation"):
            key = (ring, row.get("type_id"), row.get("level"))
            cat_ring[key] = row

    for row in ring_rows:
        key = f"{row['ring']}:{row['type_id']}:{row['level']}"
        cat = cat_ring.get((row["ring"], row["type_id"], row["level"]))
        name = _pick_name(cat) if cat else None
        names[key] = name or row["name_ru"]

    for row in chaos_rows:
        key = f"chaos:{row['class_id']}:{row['variant_id']}:{row['level']}"
        cat = cat_chaos.get((row["class_id"], row["variant_id"], row["level"]))
        name = _pick_name(cat) if cat else None
        names[key] = name or row.get("name_ru") or row.get("variant_name_ru") or "Камень хаоса"

    return names


def build_meta(chaos_rows: list[dict], ring_rows: list[dict], bonuses: list[dict], catalog: list[dict]) -> dict:
    classes_seen: dict[str, str] = {}
    variants = []
    chaos_types: dict[str, list[dict]] = defaultdict(list)
    variant_seen: set[tuple[str, str]] = set()

    for row in chaos_rows:
        cid = row["class_id"]
        classes_seen[cid] = row["class_ru"]
        vid = row["variant_id"]
        if (cid, vid) not in variant_seen:
            variant_seen.add((cid, vid))
            variants.append({
                "class_id": cid,
                "variant_id": vid,
                "variant_name_ru": row.get("variant_name_ru") or vid,
            })
            chaos_types[cid].append({
                "variant_id": vid,
                "name_ru": row.get("variant_name_ru") or vid,
            })

    classes = sorted(
        [{"class_id": k, "class_ru": v} for k, v in classes_seen.items()],
        key=lambda x: x["class_ru"],
    )
    variants.sort(key=lambda x: (x["class_id"], x["variant_name_ru"]))

    return {
        "disks": DISK_LAYOUTS,
        "rings": {
            "eternal": {"name_ru": "Внешнее кольцо (вечные камни)", "types": ETERNAL_TYPES, "max_level": 9},
            "reincarnation": {"name_ru": "Среднее кольцо (циклические камни)", "types": REINCARNATION_TYPES, "max_level": 9},
            "chaos": {"name_ru": "Центр — 2 камня на класс", "max_level": 8},
        },
        "powers": [{"id": k, "label_ru": POWER_RUNE_LABELS[k]} for k in POWER_DISPLAY_COLS],
        "classes": classes,
        "variants": variants,
        "chaos_types": dict(chaos_types),
        "rune_power_by_level": {1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5},
        "counts": {
            "ring": len(ring_rows),
            "chaos": len(chaos_rows),
            "bonuses": len(bonuses),
            "catalog": len(catalog),
        },
    }


def main() -> None:
    ring_rows = load_ring_crystals()
    chaos_rows = load_chaos()
    bonuses = load_bonuses()
    catalog = load_catalog()

    ring_index = {
        f"{r['ring']}:{r['type_id']}:{r['level']}": r for r in ring_rows
    }
    chaos_index = {
        f"{r['class_id']}:{r['variant_id']}:{r['level']}": r for r in chaos_rows
    }

    chaos_by_class: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    display_names = build_display_names(ring_rows, chaos_rows, catalog)

    for row in chaos_rows:
        cid = row["class_id"]
        vid = row["variant_id"]
        enriched = dict(row)
        key = f"chaos:{cid}:{vid}:{row['level']}"
        enriched["display_name_ru"] = display_names.get(key) or row.get("name_ru") or row.get("variant_name_ru")
        chaos_by_class[cid][vid].append(enriched)

    for cid in chaos_by_class:
        for vid in chaos_by_class[cid]:
            chaos_by_class[cid][vid].sort(key=lambda r: r["level"])

    ring_by_type: dict[str, dict[str, list]] = {"eternal": defaultdict(list), "reincarnation": defaultdict(list)}
    for row in ring_rows:
        ring = row["ring"]
        if ring not in ring_by_type:
            continue
        enriched = dict(row)
        key = f"{ring}:{row['type_id']}:{row['level']}"
        enriched["display_name_ru"] = display_names.get(key) or row["name_ru"]
        ring_by_type[ring][row["type_id"]].append(enriched)
        ring_by_type[ring][row["type_id"]].sort(key=lambda r: r["level"])

    payload = {
        "version": 1,
        "generated_from": str(TABLES.relative_to(ROOT)).replace("\\", "/"),
        "meta": build_meta(chaos_rows, ring_rows, bonuses, catalog),
        "ring_index": ring_index,
        "chaos_index": chaos_index,
        "power_bonuses": bonuses,
        "display_names": display_names,
        "ring_by_type": {k: dict(v) for k, v in ring_by_type.items()},
        "chaos_by_class": {k: dict(v) for k, v in chaos_by_class.items()},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
