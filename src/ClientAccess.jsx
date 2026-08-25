import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import ModuleAccessEditor from "./ModuleAccessEditor.jsx";

const CSS = `
  .ca-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ca-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .ca-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .ca-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:8px 18px;}
  .ca-btn:hover{opacity:0.85;}
  .ca-primary{background:var(--accent);color:#fff;}
  .ca-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .fs-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:8px 18px;}
  .fs-btn:hover{opacity:0.85;}
  .fs-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
`;

// Platform-admin-only: sets which modules a specific client facility can
// see, via set_facility_module_access() -- the facility's own admin/owner
// can no longer edit this themselves (see FacilitySettings.jsx's
// read-only ModuleAccessEditor for their side of this). This is a UI/
// declutter control, not a data-access paywall -- see moduleVisibility.js's
// own note on that distinction, which still applies here.
export default function ClientAccess() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from("facilities")
          .select("id, facility_name, product_tier, module_overrides")
          .order("facility_name");
        if (error) throw error;
        setFacilities(data || []);
      } catch (e) { setErr("Could not load facilities: " + (e.message || e)); }
      setLoading(false);
    }
    load();
  }, []);

  function selectFacility(id) {
    setSelectedId(id);
    setErr(""); setSaved(false);
    const f = facilities.find(x => x.id === id);
    setDraft(f ? { productTier: f.product_tier || "commercial", moduleOverrides: f.module_overrides || {} } : null);
  }

  async function save() {
    if (!selectedId || !draft) return;
    setSaving(true); setErr(""); setSaved(false);
    try {
      const { error } = await supabase.rpc("set_facility_module_access", {
        p_facility_id: selectedId,
        p_product_tier: draft.productTier,
        p_module_overrides: draft.moduleOverrides,
      });
      if (error) throw error;
      setFacilities(p => p.map(f => f.id === selectedId ? { ...f, product_tier: draft.productTier, module_overrides: draft.moduleOverrides } : f));
      setSaved(true);
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
    setSaving(false);
  }

  if (loading) return (<div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading facilities…</div>);

  const selected = facilities.find(f => f.id === selectedId);

  return (
    <>
      <style>{CSS}</style>
      <div className="ca-wrap">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Client Access</div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Set which modules each client facility sees. Only visible to you — clients see their own settings read-only.</div>
        </div>

        <div className="ca-card">
          <label className="fs-lbl" style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Facility</label>
          <select className="ca-sel" value={selectedId} onChange={e => selectFacility(e.target.value)}>
            <option value="">— Select a facility —</option>
            {facilities.map(f => <option key={f.id} value={f.id}>{f.facility_name || "(unnamed facility)"} — {f.product_tier || "commercial"}</option>)}
          </select>
        </div>

        {selected && draft && (
          <div className="ca-card">
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>{selected.facility_name || "(unnamed facility)"}</div>
            <ModuleAccessEditor
              productTier={draft.productTier}
              moduleOverrides={draft.moduleOverrides}
              readOnly={false}
              onChangeTier={v => setDraft(d => ({ ...d, productTier: v }))}
              onChangeOverride={(modId, checked) => setDraft(d => ({ ...d, moduleOverrides: { ...d.moduleOverrides, [modId]: checked } }))}
              onReset={() => setDraft(d => ({ ...d, moduleOverrides: {} }))}
              note="Choose a product tier, then hide/show individual modules for this client. They can't change this themselves."
            />
            {err && <div style={{ fontSize: 12, color: "var(--danger)", margin: "10px 0" }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
              <button className="ca-btn ca-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save access"}</button>
              {saved && <span style={{ fontSize: 12, color: "var(--accent-2)", fontWeight: 500 }}>✓ Saved</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
