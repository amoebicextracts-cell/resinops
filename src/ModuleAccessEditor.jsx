import { TOGGLEABLE_SECTIONS } from "./lib/modules";
import { isModuleVisible } from "./lib/moduleVisibility";

const TIERS = [["home", "🌱 Home"], ["commercial", "🏭 Commercial"]];

// Shared module-visibility checklist -- used both by FacilitySettings.jsx
// (read-only for a regular facility admin; only a platform admin sees the
// live controls, and only on their own facility) and by ClientAccess.jsx
// (the platform-admin panel that edits any client facility's access).
// Kept as one component so the two surfaces can never visually drift.
export default function ModuleAccessEditor({ productTier, moduleOverrides, onChangeTier, onChangeOverride, onReset, readOnly, note }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Modules</div>
        {!readOnly && <button className="fs-btn fs-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={onReset}>Reset to tier defaults</button>}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>
        {note || (readOnly
          ? "Which modules you see is set by your ResinOps advisor as part of your engagement — reach out if something you need isn't showing."
          : "Choose a product tier, then hide/show individual modules to declutter the sidebar. This only controls visibility — it isn't a paywall, and doesn't affect data access.")}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TIERS.map(([v, l]) => (
          <button key={v} disabled={readOnly} onClick={() => onChangeTier(v)} style={{
            flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border-2)",
            cursor: readOnly ? "default" : "pointer", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
            background: productTier === v ? "var(--accent)" : "var(--surface-2)",
            color: productTier === v ? "#fff" : "var(--text-2)",
            opacity: readOnly && productTier !== v ? 0.6 : 1,
          }}>{l}</button>
        ))}
      </div>

      {TOGGLEABLE_SECTIONS.map(section => (
        <div key={section.name} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{section.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {section.mods.map(mod => {
              const enabled = isModuleVisible(mod, productTier, moduleOverrides);
              const isOverridden = Object.prototype.hasOwnProperty.call(moduleOverrides || {}, mod.id);
              return (
                <label key={mod.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", cursor: readOnly ? "default" : "pointer", fontSize: 12, color: enabled ? "var(--text-2)" : "var(--text-3)" }}>
                  <input type="checkbox" checked={enabled} disabled={readOnly} onChange={e => onChangeOverride(mod.id, e.target.checked)} />
                  <span>{mod.icon} {mod.label}</span>
                  {isOverridden && <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--accent-2)", fontWeight: 600 }}>custom</span>}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
