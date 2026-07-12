import { POWER_COLS, POWER_DISPLAY_COLS } from "./config.js?v=3";

// Split multi-effect chaos stone descriptions (V level: ", все характеристики...").
const PSKILL_SPLIT_RE = /,\s+(?=все )/;

const ETERNAL_DEFAULTS = ["sun", "moon", "time", "space"];
const REINC_DEFAULTS = ["soul", "spirit", "birth", "death"];

function expandRingSlots(slots, count, defaults) {
  if (slots.length >= count) return slots.slice(0, count);
  const out = [...slots];
  let i = 0;
  while (out.length < count) {
    out.push({ type_id: defaults[i % defaults.length], level: 1 });
    i += 1;
  }
  return out;
}

function displayName(gameData, ring, level, typeId, classId, variantId) {
  let key;
  if (ring === "chaos") {
    key = `chaos:${classId}:${variantId}:${level}`;
  } else {
    key = `${ring}:${typeId}:${level}`;
  }
  return gameData.display_names?.[key] || null;
}

function splitPskillDesc(desc) {
  const text = (desc || "").trim();
  if (!text) return [];
  return text.split(PSKILL_SPLIT_RE).map(p => p.trim()).filter(Boolean);
}

function chaosEffects(row) {
  const desc = (row.pskill_desc || row.stat_label || "").trim();
  if (!desc) return [];
  return splitPskillDesc(desc);
}

function chaosPowers(row) {
  return Object.fromEntries(POWER_COLS.map(col => [col, Number(row[col] || 0)]));
}

function evaluateBonuses(gameData, totals) {
  const rows = gameData.power_bonuses || [];
  const byBonus = new Map();
  const bonusOrder = [];

  for (const row of rows) {
    const bonusId = row.bonus_id;
    if (!byBonus.has(bonusId)) {
      bonusOrder.push(bonusId);
      byBonus.set(bonusId, []);
    }
    byBonus.get(bonusId).push(row);
  }

  for (const bonusId of bonusOrder) {
    byBonus.get(bonusId).sort((a, b) => Number(b.tier) - Number(a.tier));
  }

  const active = [];
  const inactive = [];

  for (const bonusId of bonusOrder) {
    const tiers = byBonus.get(bonusId);
    let activated = false;
    for (const row of tiers) {
      const reqs = Object.fromEntries(
        POWER_COLS.filter(col => Number(row[col]) > 0).map(col => [col, Number(row[col])])
      );
      const ok = Object.entries(reqs).every(([col, need]) => (totals[col] || 0) >= need);
      if (ok) {
        active.push({
          bonus_id: bonusId,
          tier: Number(row.tier),
          name_ru: row.name_ru,
          effect_ru: row.effect_ru,
          requirements: reqs,
        });
        activated = true;
        break;
      }
    }
    if (!activated) {
      const nextTier = tiers[tiers.length - 1];
      const reqs = Object.fromEntries(
        POWER_COLS.filter(col => Number(nextTier[col]) > 0).map(col => [col, Number(nextTier[col])])
      );
      const missing = Object.fromEntries(
        Object.entries(reqs)
          .filter(([col, need]) => (totals[col] || 0) < need)
          .map(([col, need]) => [col, Math.max(0, need - (totals[col] || 0))])
      );
      inactive.push({
        bonus_id: bonusId,
        name_ru: nextTier.name_ru,
        next_tier: Number(nextTier.tier),
        effect_ru: nextTier.effect_ru,
        requirements: reqs,
        missing,
      });
    }
  }

  return { active, inactive };
}

export function calculateBuild(gameData, req) {
  const layout = gameData.meta.disks[req.disk] || gameData.meta.disks.high;
  const powerLabels = Object.fromEntries(
    (gameData.meta.powers || []).map(p => [p.id, p.label_ru])
  );

  const eternalSlots = expandRingSlots(req.eternal || [], layout.eternal, ETERNAL_DEFAULTS);
  const reincSlots = expandRingSlots(req.reincarnation || [], layout.reincarnation, REINC_DEFAULTS);

  const powers = Object.fromEntries(POWER_COLS.map(col => [col, 0]));
  const crystals = [];

  for (const slot of eternalSlots) {
    const key = `eternal:${slot.type_id}:${slot.level}`;
    const row = gameData.ring_index?.[key];
    if (!row) continue;
    const pid = row.power_id;
    const pts = Number(row.power_points);
    if (pid in powers) powers[pid] += pts;
    crystals.push({
      ring: "eternal",
      type_id: row.type_id,
      name_ru: displayName(gameData, "eternal", slot.level, slot.type_id) || row.name_ru,
      level: row.level,
      base_stat: row.base_stat,
      stat_value: row.stat_value,
      power_id: pid,
      power_ru: row.power_ru,
      power_points: pts,
    });
  }

  for (const slot of reincSlots) {
    const key = `reincarnation:${slot.type_id}:${slot.level}`;
    const row = gameData.ring_index?.[key];
    if (!row) continue;
    const pid = row.power_id;
    const pts = Number(row.power_points);
    if (pid in powers) powers[pid] += pts;
    crystals.push({
      ring: "reincarnation",
      type_id: row.type_id,
      name_ru: displayName(gameData, "reincarnation", slot.level, slot.type_id) || row.name_ru,
      level: row.level,
      base_stat: row.base_stat,
      stat_value: row.stat_value,
      power_id: pid,
      power_ru: row.power_ru,
      power_points: pts,
    });
  }

  let chaosBonuses = [];
  if (layout.chaos && req.chaos) {
    const c = req.chaos;
    const key = `${c.class_id}:${c.variant_id}:${c.level}`;
    const row = gameData.chaos_index?.[key];
    if (row) {
      const cp = chaosPowers(row);
      for (const [col, val] of Object.entries(cp)) {
        powers[col] += val;
      }
      const effects = chaosEffects(row);
      const extra = effects.length ? effects.join("; ") : null;
      const label =
        displayName(gameData, "chaos", c.level, null, c.class_id, c.variant_id) ||
        row.name_ru ||
        row.variant_name_ru ||
        "Камень хаоса";
      chaosBonuses = effects.map(effect => ({ name_ru: label, effect_ru: effect }));
      crystals.push({
        ring: "chaos",
        type_id: `${row.class_id}/${row.variant_id}`,
        name_ru: label,
        level: row.level,
        base_stat: row.stat_label,
        stat_value: row.stat_value && /^\d+$/.test(String(row.stat_value)) ? Number(row.stat_value) : null,
        power_id: `${row.power_1}+${row.power_2}`,
        power_ru: `${row.power_1_ru} + ${row.power_2_ru}`,
        power_points: Number(row.power_total || 0),
        extra,
      });
    }
  }

  const powerList = POWER_DISPLAY_COLS.map(col => ({
    power_id: col,
    label_ru: powerLabels[col] || col,
    points: powers[col],
  }));

  const { active, inactive } = evaluateBonuses(gameData, powers);

  return {
    disk: req.disk,
    disk_name_ru: layout.name_ru,
    character_level: req.character_level,
    powers: powerList,
    total_power_points: Object.values(powers).reduce((a, b) => a + b, 0),
    crystals,
    active_bonuses: active,
    chaos_bonuses: chaosBonuses,
    inactive_bonuses: inactive,
  };
}

export function getChaosForClass(gameData, classId) {
  return gameData.chaos_by_class?.[classId] || {};
}
