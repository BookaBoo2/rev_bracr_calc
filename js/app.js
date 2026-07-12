import { calculateBuild, getChaosForClass } from "./calculator.js?v=9";
import {
  buildExportDoc,
  deleteBuild,
  getBuild,
  listBuilds,
  parseImportDoc,
  saveBuild,
} from "./builds.js?v=9";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

const ETERNAL_R = 46;
const REINC_R = 33;

function posAt(angleDeg, radiusPct) {
  const a = (angleDeg * Math.PI) / 180;
  return {
    left: `${50 + radiusPct * Math.cos(a)}%`,
    top: `${50 + radiusPct * Math.sin(a)}%`,
  };
}

const ETERNAL_ANGLES_8 = [-67.5, -22.5, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5];
const ETERNAL_SLOTS_8 = ETERNAL_ANGLES_8.map(angle => ({ angle, ...posAt(angle, ETERNAL_R) }));
const ETERNAL_SLOTS_4 = [1, 3, 5, 7].map(i => ETERNAL_SLOTS_8[i]);
const REINC_ANGLES_4 = [-135, -45, 45, 135];
const REINC_SLOTS_4 = REINC_ANGLES_4.map(angle => ({ angle, ...posAt(angle, REINC_R) }));

const RUNE_TYPE_ORDER = {
  eternal: ["sun", "moon", "time", "space"],
  reincarnation: ["soul", "spirit", "birth", "death"],
};

let gameData = null;
let meta = null;
let crystalIcons = {};
let modalCtx = null;
let lastCalc = null;
let chaosCrystals = {};

const state = {
  disk: "ultimate",
  character_level: 59,
  eternal: [
    { type_id: "moon", level: 3 }, { type_id: "time", level: 3 },
    { type_id: "space", level: 4 }, { type_id: "sun", level: 4 },
    { type_id: "moon", level: 3 }, { type_id: "time", level: 3 },
    { type_id: "space", level: 3 }, { type_id: "sun", level: 2 },
  ],
  reincarnation: [
    { type_id: "birth", level: 3 }, { type_id: "spirit", level: 4 },
    { type_id: "death", level: 2 }, { type_id: "soul", level: 3 },
  ],
  chaos: { class_id: "shengtang", variant_id: "sharp", level: 1 },
};

function buildSnapshot() {
  normalizeChaos();
  const ly = layout();
  return {
    disk: state.disk,
    character_level: state.character_level,
    eternal: state.eternal.map(s => ({ type_id: s.type_id, level: s.level })),
    reincarnation: state.reincarnation.map(s => ({ type_id: s.type_id, level: s.level })),
    chaos: ly.chaos && state.chaos ? { ...state.chaos } : null,
  };
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(name) {
  return (name || "bracteate").replace(/[^\w\u0400-\u04FF.-]+/gu, "_").slice(0, 40);
}

function refreshSavedBuilds(selectId) {
  const sel = document.getElementById("savedBuilds");
  const rows = listBuilds();
  sel.innerHTML = '<option value="">—</option>' + rows.map(b =>
    `<option value="${b.id}" ${b.id === selectId ? "selected" : ""}>${b.name}</option>`
  ).join("");
}

function saveLocalBuild() {
  const name = document.getElementById("saveName").value.trim() || "Брактеат";
  const selectId = document.getElementById("savedBuilds").value;
  const saved = saveBuild(name, buildSnapshot(), selectId || null);
  document.getElementById("saveName").value = saved.name;
  refreshSavedBuilds(saved.id);
}

function loadLocalBuild() {
  const id = document.getElementById("savedBuilds").value;
  if (!id) {
    alert("Выберите сборку из списка");
    return;
  }
  const row = getBuild(id);
  if (!row) {
    alert("Сборка не найдена");
    refreshSavedBuilds();
    return;
  }
  document.getElementById("saveName").value = row.name;
  applyBuild(row.build);
}

function deleteLocalBuild() {
  const id = document.getElementById("savedBuilds").value;
  if (!id) return;
  if (!confirm("Удалить сохранённую сборку?")) return;
  deleteBuild(id);
  refreshSavedBuilds();
}

function exportJsonFile() {
  const name = document.getElementById("saveName").value.trim() || "Брактеат";
  const doc = buildExportDoc(name, buildSnapshot());
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`${safeFilename(name)}_${stamp}.json`, doc);
}

async function importJsonFile(file) {
  const text = await file.text();
  const doc = parseImportDoc(text);
  document.getElementById("saveName").value = doc.name || "Брактеат";
  applyBuild(doc.build);
}

function layout() {
  return meta?.disks?.[state.disk] || { eternal: 8, reincarnation: 4, chaos: 1 };
}

function normalizeChaos() {
  if (!state.chaos) {
    state.chaos = { class_id: "shengtang", variant_id: "sharp", level: 1 };
  }
  const lv = Number(state.chaos.level);
  state.chaos.level = Number.isFinite(lv) ? Math.min(5, Math.max(1, Math.round(lv))) : 1;
}

function typeLabels(ring) {
  const types = meta?.rings?.[ring]?.types || [];
  return Object.fromEntries(types.map(t => [t.id, t.name_ru]));
}

function roman(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return "I";
  return ROMAN[v] || String(v);
}

function gemClass(typeId, ring) {
  if (ring === "chaos") return "gem-chaos";
  return `gem-${typeId}`;
}

function gemIconUrl(typeId, level) {
  const lv = Number(level);
  if (!Number.isFinite(lv) || lv < 3 || lv > 7) return null;
  return crystalIcons?.[typeId]?.[String(lv)] || null;
}

function gemFaceHtml(ring, typeId, level) {
  const url = gemIconUrl(typeId, level);
  const shape = ring === "eternal" ? "eternal" : "reinc";
  if (url) {
    return `<div class="gem-face ${shape} gem-has-icon"><img class="gem-img" src="${url}" alt="" draggable="false" loading="lazy" /></div>`;
  }
  return `<div class="gem-face ${shape} ${gemClass(typeId, ring)}">
    <span class="gem-lv">${roman(level)}</span>
    <span class="gem-icon"></span>
  </div>`;
}

function eternalSlotLayout(count) {
  return count >= 8 ? ETERNAL_SLOTS_8 : ETERNAL_SLOTS_4.slice(0, count);
}

function reincSlotLayout(count) {
  return REINC_SLOTS_4.slice(0, count);
}

function variantLabel() {
  const types = chaosTypesForClass(state.chaos.class_id);
  const v = types.find(x => x.variant_id === state.chaos.variant_id);
  return v?.name_ru || "";
}

function chaosTypesForClass(classId) {
  return meta?.chaos_types?.[classId]
    || meta?.variants?.filter(v => v.class_id === classId)
    || [];
}

function chaosNameNow() {
  const fromCalc = lastCalc?.crystals?.find(c => c.ring === "chaos");
  if (fromCalc?.name_ru) return fromCalc.name_ru;
  const rows = chaosCrystals[state.chaos.variant_id] || [];
  const row = rows.find(r => Number(r.level) === Number(state.chaos.level));
  return row?.display_name_ru || row?.name_ru || variantLabel() || "Камень хаоса";
}

function slotTypeName(ring, typeId) {
  return typeLabels(ring)[typeId] || typeId;
}

function ensureSlots() {
  const ly = layout();
  const eTypes = Object.keys(typeLabels("eternal"));
  const rTypes = Object.keys(typeLabels("reincarnation"));
  const eCount = eternalSlotLayout(ly.eternal).length;
  const rCount = reincSlotLayout(ly.reincarnation).length;

  while (state.eternal.length < eCount) {
    state.eternal.push({ type_id: eTypes[state.eternal.length % eTypes.length] || "sun", level: 1 });
  }
  state.eternal = state.eternal.slice(0, eCount).map((slot, i) => ({
    type_id: eTypes.includes(slot.type_id) ? slot.type_id : (eTypes[i % eTypes.length] || "sun"),
    level: slot.level || 1,
  }));

  while (state.reincarnation.length < rCount) {
    state.reincarnation.push({ type_id: rTypes[state.reincarnation.length % rTypes.length] || "soul", level: 1 });
  }
  state.reincarnation = state.reincarnation.slice(0, rCount).map((slot, i) => ({
    type_id: rTypes.includes(slot.type_id) ? slot.type_id : (rTypes[i % rTypes.length] || "soul"),
    level: slot.level || 1,
  }));

  normalizeChaos();
}

function renderDisk() {
  const ly = layout();
  const disk = document.getElementById("bracteateDisk");
  const eEl = document.getElementById("eternalSlots");
  const rEl = document.getElementById("reincSlots");
  eEl.innerHTML = "";
  rEl.innerHTML = "";
  disk.querySelectorAll(".chaos-slot").forEach(el => el.remove());

  const eLayout = eternalSlotLayout(ly.eternal);
  const rLayout = reincSlotLayout(ly.reincarnation);

  state.eternal.forEach((slot, i) => {
    eEl.appendChild(makeSlotBtn("eternal", i, slot, eLayout[i]));
  });

  if (ly.reincarnation) {
    state.reincarnation.forEach((slot, i) => {
      rEl.appendChild(makeSlotBtn("reincarnation", i, slot, rLayout[i]));
    });
  }

  if (ly.chaos) {
    const name = chaosNameNow();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gem-slot chaos-slot";
    btn.title = name;
    btn.innerHTML = `
      <div class="gem-face chaos gem-chaos">
        <span class="gem-lv">${roman(state.chaos.level)}</span>
        <span class="gem-icon chaos-icon"></span>
      </div>`;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openChaosModal();
    });
    disk.appendChild(btn);
  }

  updateChaosToolbar();
}

function makeSlotBtn(ring, idx, slot, slotMeta) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gem-slot" + (gemIconUrl(slot.type_id, slot.level) ? " gem-slot--icon" : "");
  btn.style.left = slotMeta.left;
  btn.style.top = slotMeta.top;
  btn.dataset.ring = ring;
  btn.dataset.typeId = slot.type_id;
  btn.title = `${slotTypeName(ring, slot.type_id)} ${roman(slot.level)}`;
  const shape = ring === "eternal" ? "eternal" : "reinc";
  btn.innerHTML = gemFaceHtml(ring, slot.type_id, slot.level);
  btn.addEventListener("click", () => openSlotModal(ring, idx));
  return btn;
}

function fillModalLevels(ring, typeId, currentLevel, maxLv) {
  const lvSel = document.getElementById("modalLevel");
  lvSel.innerHTML = Array.from({ length: maxLv }, (_, i) => {
    const lv = i + 1;
    return `<option value="${lv}" ${Number(currentLevel) === lv ? "selected" : ""}>${roman(lv)}</option>`;
  }).join("");
}

function modalTypeValue() {
  const pick = document.getElementById("modalTypePick");
  if (!pick.classList.contains("hidden")) {
    return pick.querySelector(".rune-type-btn.active")?.dataset.typeId
      || document.getElementById("modalType").value;
  }
  return document.getElementById("modalType").value;
}

function fillModalTypePick(ring, selectedId) {
  const pick = document.getElementById("modalTypePick");
  const sel = document.getElementById("modalType");
  const types = typeLabels(ring);
  const order = RUNE_TYPE_ORDER[ring] || Object.keys(types);

  pick.classList.remove("hidden");
  sel.classList.add("hidden");
  pick.innerHTML = order.filter(id => types[id]).map(id => {
    const active = id === selectedId ? " active" : "";
    return `<button type="button" class="rune-type-btn${active}" data-type-id="${id}">
      <span class="rune-swatch swatch-${id}" aria-hidden="true"></span>
      <span class="rune-type-label">${types[id]}</span>
    </button>`;
  }).join("");

  sel.innerHTML = order.filter(id => types[id]).map(id =>
    `<option value="${id}" ${id === selectedId ? "selected" : ""}>${types[id]}</option>`
  ).join("");

  pick.querySelectorAll(".rune-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      pick.querySelectorAll(".rune-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      sel.value = btn.dataset.typeId;
      if (modalCtx && !modalCtx.isChaos) {
        const slot = state[modalCtx.ring][modalCtx.idx];
        fillModalLevels(modalCtx.ring, btn.dataset.typeId, slot.level, 9);
      }
    });
  });
}

function fillModalChaosType(selectedVariant) {
  const pick = document.getElementById("modalTypePick");
  const sel = document.getElementById("modalType");
  pick.classList.add("hidden");
  pick.innerHTML = "";
  sel.classList.remove("hidden");

  const vars = chaosTypesForClass(state.chaos.class_id);
  sel.innerHTML = vars.map(v =>
    `<option value="${v.variant_id}" ${selectedVariant === v.variant_id ? "selected" : ""}>${v.name_ru || v.variant_name_ru}</option>`
  ).join("");
}

function openSlotModal(ring, idx) {
  modalCtx = { ring, idx, isChaos: false };
  const slot = state[ring][idx];

  document.getElementById("modalTitle").textContent =
    ring === "eternal" ? `Внешнее кольцо — гнездо ${idx + 1}` : `Среднее кольцо — гнездо ${idx + 1}`;

  document.getElementById("modalTypeField").classList.remove("hidden");
  document.getElementById("modalTypeLabel").textContent = "Руна";
  fillModalTypePick(ring, slot.type_id);
  fillModalLevels(ring, slot.type_id, slot.level, 9);
  document.getElementById("slotModal").classList.remove("hidden");
}

function openChaosModal() {
  if (!meta?.variants?.length && !Object.keys(meta?.chaos_types || {}).length) {
    alert("Данные хаоса не загружены.");
    return;
  }

  normalizeChaos();
  modalCtx = { isChaos: true };
  document.getElementById("modalTitle").textContent = "Камень хаоса (центр)";
  document.getElementById("modalTypeField").classList.remove("hidden");
  document.getElementById("modalTypeLabel").textContent = "Тип камня";

  const vars = chaosTypesForClass(state.chaos.class_id);
  if (!vars.length) {
    alert("Нет типов центрального камня для выбранного класса.");
    return;
  }
  fillModalChaosType(state.chaos.variant_id);
  fillModalLevels("chaos", state.chaos.variant_id, state.chaos.level, 5);
  document.getElementById("slotModal").classList.remove("hidden");
}

function saveModal() {
  const lv = Math.max(1, +document.getElementById("modalLevel").value || 1);
  if (modalCtx?.isChaos) {
    state.chaos.variant_id = modalTypeValue();
    state.chaos.level = Math.min(5, lv);
  } else if (modalCtx) {
    state[modalCtx.ring][modalCtx.idx] = {
      type_id: modalTypeValue(),
      level: Math.min(9, lv),
    };
  }
  document.getElementById("slotModal").classList.add("hidden");
  renderDisk();
  calculate();
}

function crystalLine(c) {
  const name = c.name_ru || slotTypeName(c.ring, c.type_id) || "Камень";
  const lv = roman(c.level);
  if (c.base_stat && c.stat_value != null) {
    return `${name} (${lv}) — +${c.stat_value} ${c.base_stat}`;
  }
  return `${name} (${lv}) — ${c.extra || c.power_ru || ""}`;
}

function renderStatSummary(data) {
  const el = document.getElementById("statSummary");
  const rows = data.stat_summary || [];
  el.innerHTML = rows.length
    ? rows.map(r => `
      <div class="stat-summary-row">
        <span>${r.stat}</span>
        <strong>+${r.total}</strong>
      </div>`).join("")
    : '<div class="empty-bonus">Нет числовых статов от камней</div>';
}

function renderBonuses(data) {
  lastCalc = data;
  renderStatSummary(data);
  const pb = document.getElementById("powerBonuses");
  const rows = [];
  for (const b of data.active_bonuses || []) {
    rows.push(`
      <div class="power-bonus-row">
        <span class="name">${b.name_ru} ${roman(b.tier)}</span>
        <span class="effect">${b.effect_ru}</span>
      </div>`);
  }
  for (const b of data.chaos_bonuses || []) {
    rows.push(`
      <div class="power-bonus-row chaos-bonus-row">
        <span class="name">${b.name_ru}</span>
        <span class="effect">${b.effect_ru}</span>
      </div>`);
  }
  pb.innerHTML = rows.length
    ? rows.join("")
    : '<div class="empty-bonus">Нет активных бонусов</div>';

  document.getElementById("powersGrid").innerHTML = data.powers.map(p =>
    `<div><span>${p.label_ru}</span><strong>${p.points}</strong></div>`
  ).join("");

  document.getElementById("crystalTable").innerHTML = data.crystals.map(c =>
    `<div>${crystalLine(c)}</div>`
  ).join("");

  if (layout().chaos) {
    const btn = document.querySelector(".chaos-slot");
    if (btn) {
      btn.title = chaosNameNow();
      const lv = btn.querySelector(".gem-lv");
      if (lv) lv.textContent = roman(state.chaos.level);
    }
  }
}

function calculate() {
  if (!gameData) return;
  normalizeChaos();
  const ly = layout();
  try {
    const data = calculateBuild(gameData, {
      disk: state.disk,
      character_level: state.character_level,
      eternal: state.eternal,
      reincarnation: state.reincarnation,
      chaos: ly.chaos ? state.chaos : null,
    });
    renderBonuses(data);
  } catch (e) {
    console.error("calculate failed", e);
    document.getElementById("powerBonuses").innerHTML =
      `<div class="empty-bonus">Ошибка расчёта: ${e.message}</div>`;
  }
}

function loadChaosData(classId) {
  chaosCrystals = getChaosForClass(gameData, classId);
}

function applyBuild(build) {
  state.disk = build.disk || state.disk;
  state.character_level = Number(build.character_level) || 59;
  state.eternal = Array.isArray(build.eternal) ? build.eternal : [];
  state.reincarnation = Array.isArray(build.reincarnation) ? build.reincarnation : [];
  if (build.chaos) state.chaos = { ...build.chaos };

  normalizeChaos();
  ensureSlots();
  fillChaosClassSelect();
  loadChaosData(state.chaos.class_id);
  renderDisk();
  calculate();
}

function fillChaosClassSelect() {
  const cls = document.getElementById("chaosClass");
  if (!cls) return;
  cls.innerHTML = meta.classes.map(c =>
    `<option value="${c.class_id}" ${state.chaos.class_id === c.class_id ? "selected" : ""}>${c.class_ru}</option>`
  ).join("");

  const types = chaosTypesForClass(state.chaos.class_id);
  if (!types.some(v => v.variant_id === state.chaos.variant_id)) {
    state.chaos.variant_id = types[0]?.variant_id || "sharp";
  }
}

function updateChaosToolbar() {
  const ly = layout();
  const el = document.getElementById("chaosClassField");
  if (el) el.classList.toggle("hidden", !ly.chaos);
}

async function loadGameData() {
  const [dataRes, iconsRes] = await Promise.all([
    fetch("data/game-data.json"),
    fetch("assets/icons/crystal-icons.json"),
  ]);
  if (!dataRes.ok) throw new Error(`Не удалось загрузить data/game-data.json (${dataRes.status})`);
  gameData = await dataRes.json();
  meta = gameData.meta;
  if (iconsRes.ok) {
    crystalIcons = await iconsRes.json();
  } else {
    crystalIcons = {};
  }
}

async function init() {
  const status = document.getElementById("appStatus");
  try {
    await loadGameData();
    const counts = meta.counts || {};
    status.textContent = `Статическая версия · ${counts.ring || 0} камней · ${counts.bonuses || 0} бонусов`;
    status.className = "ok";
  } catch (e) {
    status.textContent = "Ошибка загрузки данных: " + e.message;
    console.error(e);
    return;
  }

  normalizeChaos();
  loadChaosData(state.chaos.class_id);
  fillChaosClassSelect();
  ensureSlots();
  renderDisk();
  calculate();
  refreshSavedBuilds();

  document.getElementById("chaosClass").addEventListener("change", e => {
    state.chaos.class_id = e.target.value;
    loadChaosData(state.chaos.class_id);
    fillChaosClassSelect();
    renderDisk();
    calculate();
  });

  document.getElementById("toggleDetails").addEventListener("click", () => {
    document.getElementById("detailsPanel").classList.toggle("hidden");
  });

  document.getElementById("btnRunes").addEventListener("click", () => {
    openSlotModal("eternal", 0);
  });

  document.getElementById("btnShare")?.addEventListener("click", exportJsonFile);
  document.getElementById("btnSaveLocal").addEventListener("click", saveLocalBuild);
  document.getElementById("btnLoadLocal").addEventListener("click", loadLocalBuild);
  document.getElementById("btnDeleteLocal").addEventListener("click", deleteLocalBuild);
  document.getElementById("btnExportJson").addEventListener("click", exportJsonFile);
  document.getElementById("btnImportJson").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await importJsonFile(file);
    } catch (err) {
      alert("Ошибка импорта: " + err.message);
    }
  });

  document.getElementById("modalType").addEventListener("change", e => {
    if (!modalCtx) return;
    if (modalCtx.isChaos) {
      fillModalLevels("chaos", e.target.value, state.chaos.level, 5);
    } else {
      const slot = state[modalCtx.ring][modalCtx.idx];
      fillModalLevels(modalCtx.ring, e.target.value, slot.level, 9);
    }
  });

  document.getElementById("modalSave").addEventListener("click", saveModal);
  document.getElementById("modalClose").addEventListener("click", () => {
    document.getElementById("slotModal").classList.add("hidden");
  });
  document.getElementById("slotModal").addEventListener("click", e => {
    if (e.target.id === "slotModal") document.getElementById("slotModal").classList.add("hidden");
  });
}

init().catch(e => {
  console.error(e);
  const status = document.getElementById("appStatus");
  if (status) status.textContent = "Ошибка запуска: " + e.message;
});
