// Decides how a piece of equipment is drawn in the ResinEx 3D view.
//
// Every equipment row already has a category and inch dimensions, but no
// 3D model. Rather than sourcing a model file per machine, nearly all
// equipment falls into a handful of shapes (tank, rack, bench, box...).
// resolveShape() picks one from the row's category and name; the 3D viewer
// then draws that shape at the row's real width/depth/height.
//
// Pure functions only (no React/three imports) so node --test can cover them.
//
// `eq.shape_type` is honored when present so a future column can override
// the guess; nothing writes it yet, so today every shape is inferred.

export const SHAPE_TYPES = ["box", "tank", "rack", "bench", "overhead", "line"];

const IN_PER_FT = 12;

// Fallbacks match the ones the 2D editor and PDF export already use.
const DEFAULT_W_IN = 24, DEFAULT_D_IN = 24, DEFAULT_H_IN = 36;

// Checked in order, first match wins. Racks come before tanks so a
// "Solvent Tank Stand" or "Column Rack" reads as a frame, not a cylinder.
const NAME_RULES = [
  ["overhead", /\b(light|fixture|luminaire|ceiling|overhead|hanging|camera|fan)\b/i],
  ["line", /\b(conveyor|filling|filler|packaging line|sealer|capper|labeler)\b/i],
  ["rack", /\b(rack|shelf|shelving|cart|trolley|frame|stand)\b/i],
  ["tank", /\b(tank|vessel|boiler|reservoir|drum|column|receiver|cylinder|dewar|reactor|condenser)\b/i],
  ["bench", /\b(bench|table|workstation|work station|bucker|trimmer|desk)\b/i],
];

const CATEGORY_SHAPES = {
  "Lighting": "overhead",
  "Trimming & Bucking": "bench",
  "Fertigation & Irrigation": "tank",
};

// Muted so the room colors and equipment stay distinguishable.
const CATEGORY_COLORS = {
  "Extraction": "#b8c4cc",
  "Trimming & Bucking": "#c9a86a",
  "Drying & Curing": "#a8c0a0",
  "Pre-Roll & Packaging": "#d4a5a5",
  "HVAC & Dehumidification": "#9fb8cf",
  "Fertigation & Irrigation": "#7fb5b0",
  "Lighting": "#e8d9a0",
  "Lab & Testing Instruments": "#b8b0d0",
  "Vehicles & Material Handling": "#d6a05a",
  "Facility Systems": "#a0a0a0",
  "Other": "#c8c8c8",
};

export function resolveShape(eq) {
  const explicit = eq?.shape_type;
  if (explicit && SHAPE_TYPES.includes(explicit)) return explicit;

  const name = String(eq?.name || "");
  for (const [shape, re] of NAME_RULES) {
    if (re.test(name)) return shape;
  }
  return CATEGORY_SHAPES[eq?.category] || "box";
}

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
}

// Real size in feet, with the same fallbacks the rest of ResinEx uses when
// dimensions haven't been filled in yet. `defaulted` lets the UI say so.
export function equipmentDimsFt(eq) {
  const wIn = Number(eq?.width_in), dIn = Number(eq?.depth_in), hIn = Number(eq?.height_in);
  return {
    w: (wIn > 0 ? wIn : DEFAULT_W_IN) / IN_PER_FT,
    d: (dIn > 0 ? dIn : DEFAULT_D_IN) / IN_PER_FT,
    h: (hIn > 0 ? hIn : DEFAULT_H_IN) / IN_PER_FT,
    defaulted: !(wIn > 0 && dIn > 0 && hIn > 0),
  };
}

// Number of shelves for a rack of height h (feet): roughly one per 18",
// always at least a base and a top, never more than 6.
export function rackShelfCount(h) {
  return Math.max(2, Math.min(6, Math.round(h / 1.5) + 1));
}
