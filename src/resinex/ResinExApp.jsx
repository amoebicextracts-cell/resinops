import { useState, useEffect, lazy, Suspense } from "react";
import { db } from "../lib/db";

const ShellViewer3D = lazy(() => import("./ShellViewer3D.jsx"));

import ShellEditor2D from "./ShellEditor2D.jsx";

const PROJECT_TYPES = [
  { v: "expansion", l: "Expansion of existing facility" },
  { v: "greenfield", l: "Greenfield buildout" },
];
const PROJECT_STATUSES = [
  { v: "planning", l: "Planning" },
  { v: "active", l: "Active" },
  { v: "on_hold", l: "On Hold" },
  { v: "complete", l: "Complete" },
];

const EMPTY_PROJECT = { name: "", project_type: "expansion", status: "planning", notes: "" };
const EMPTY_SHELL = { width_ft: "100", depth_ft: "60", ceiling_height_ft: "12", notes: "" };

const CSS = `
  .rx-wrap{padding:24px;flex:1;overflow-y:auto;}
  .rx-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .rx-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .rx-inp:focus{outline:none;border-color:var(--accent);}
  .rx-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .rx-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .rx-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .rx-btn:hover{opacity:0.85;}
  .rx-primary{background:var(--accent);color:#fff;}
  .rx-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .rx-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .rx-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .rx-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .rx-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .rx-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .rx-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .rx-tbl tr:last-child td{border-bottom:none;}
  .rx-tbl tr{cursor:pointer;}
  .rx-tbl tr.active{background:var(--surface-2);}
  .rx-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(74,124,89,0.2);color:var(--accent-2);}
`;

export default function ResinExApp() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shells, setShells] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [roomEquipment, setRoomEquipment] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [projectForm, setProjectForm] = useState(null);
  const [shellForm, setShellForm] = useState(null);
  const [show3D, setShow3D] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [p, s, r, eq, re] = await Promise.all([
          db.resinex_projects.list(),
          db.resinex_facility_shells.list(),
          db.resinex_rooms.list(),
          db.equipment.list(),
          db.resinex_room_equipment.list(),
        ]);
        setProjects(p);
        setShells(s);
        setRooms(r);
        setEquipment(eq);
        setRoomEquipment(re);
      } catch (e) { console.error("ResinEx load error:", e); }
      setLoading(false);
    }
    load();
  }, []);

  const selectedProject = projects.find(p => p.id === selectedId) || null;
  const selectedShell = shells.find(s => s.project_id === selectedId) || null;
  const shellRooms = selectedShell ? rooms.filter(r => r.shell_id === selectedShell.id) : [];
  const shellRoomIds = new Set(shellRooms.map(r => r.id));
  const projectRoomEquipment = roomEquipment.filter(re => shellRoomIds.has(re.room_id));
  const estCost = projectRoomEquipment.reduce((sum, re) => {
    const eq = equipment.find(e => e.id === re.equipment_id);
    return sum + (Number(eq?.purchasePrice) || 0);
  }, 0);

  function openAddProject() { setProjectForm({ ...EMPTY_PROJECT }); setErr(""); }
  function openEditProject(p) { setProjectForm({ ...p }); setErr(""); }
  const setPF = (k, v) => setProjectForm(f => ({ ...f, [k]: v }));

  async function saveProject() {
    if (!projectForm.name.trim()) { setErr("Enter a project name."); return; }
    const rec = { ...projectForm, id: projectForm.id || crypto.randomUUID() };
    try {
      const saved = await db.resinex_projects.upsert(rec);
      if (projectForm.id) setProjects(p => p.map(x => x.id === saved.id ? saved : x));
      else { setProjects(p => [saved, ...p]); setSelectedId(saved.id); }
      setProjectForm(null); setErr("");
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
  }

  async function removeProject(id) {
    try {
      await db.resinex_projects.delete(id);
      setProjects(p => p.filter(x => x.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) { setErr("Could not delete: " + (e.message || e)); }
  }

  function openAddShell() { setShellForm({ ...EMPTY_SHELL }); setErr(""); }
  const setSF = (k, v) => setShellForm(f => ({ ...f, [k]: v }));

  async function saveShell() {
    const rec = {
      ...shellForm,
      id: crypto.randomUUID(),
      project_id: selectedId,
      width_ft: Number(shellForm.width_ft) || 0,
      depth_ft: Number(shellForm.depth_ft) || 0,
      ceiling_height_ft: Number(shellForm.ceiling_height_ft) || 12,
    };
    try {
      const saved = await db.resinex_facility_shells.upsert(rec);
      setShells(s => [...s, saved]);
      setShellForm(null); setErr("");
    } catch (e) { setErr("Could not save shell: " + (e.message || e)); }
  }

  async function saveRoom(room) {
    const rec = { ...room, id: room.id || crypto.randomUUID(), shell_id: selectedShell.id };
    const saved = await db.resinex_rooms.upsert(rec);
    setRooms(r => room.id ? r.map(x => x.id === saved.id ? saved : x) : [...r, saved]);
    return saved;
  }

  async function deleteRoom(id) {
    await db.resinex_rooms.delete(id);
    setRooms(r => r.filter(x => x.id !== id));
  }

  async function saveRoomEquipment(placement) {
    const rec = { ...placement, id: placement.id || crypto.randomUUID() };
    const saved = await db.resinex_room_equipment.upsert(rec);
    setRoomEquipment(re => placement.id ? re.map(x => x.id === saved.id ? saved : x) : [...re, saved]);
    return saved;
  }

  async function deleteRoomEquipment(id) {
    await db.resinex_room_equipment.delete(id);
    setRoomEquipment(re => re.filter(x => x.id !== id));
  }

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading ResinEx…</div>;

  return (
    <div className="rx-wrap">
      <style>{CSS}</style>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ width: 320, flexShrink: 0 }}>
          <div className="rx-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Capex Projects</div>
              {!projectForm && <button className="rx-btn rx-primary" onClick={openAddProject}>+ New</button>}
            </div>
            {projectForm && (
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ marginBottom: 8 }}><label className="rx-lbl">Project name</label><input className="rx-inp" value={projectForm.name} onChange={e => setPF("name", e.target.value)} placeholder="Suite B Expansion" /></div>
                <div style={{ marginBottom: 8 }}><label className="rx-lbl">Type</label><select className="rx-sel" value={projectForm.project_type} onChange={e => setPF("project_type", e.target.value)}>{PROJECT_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
                <div style={{ marginBottom: 8 }}><label className="rx-lbl">Status</label><select className="rx-sel" value={projectForm.status} onChange={e => setPF("status", e.target.value)}>{PROJECT_STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
                <div style={{ marginBottom: 10 }}><label className="rx-lbl">Notes</label><input className="rx-inp" value={projectForm.notes || ""} onChange={e => setPF("notes", e.target.value)} /></div>
                {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="rx-btn rx-primary" onClick={saveProject}>{projectForm.id ? "Save" : "Create"}</button>
                  <button className="rx-btn rx-secondary" onClick={() => { setProjectForm(null); setErr(""); }}>Cancel</button>
                </div>
              </div>
            )}
            {projects.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13 }}>No capex projects yet.</div>
            ) : (
              <table className="rx-tbl">
                <tbody>
                  {projects.map(p => (
                    <tr key={p.id} className={p.id === selectedId ? "active" : ""} onClick={() => setSelectedId(p.id)}>
                      <td style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}<div style={{ fontSize: 10, color: "var(--text-3)" }}>{p.project_type === "greenfield" ? "Greenfield" : "Expansion"}</div></td>
                      <td><span className="rx-pill">{p.status}</span></td>
                      <td><div style={{ display: "flex", gap: 5 }}>
                        <button className="rx-sm rx-edit" onClick={e => { e.stopPropagation(); openEditProject(p); }}>Edit</button>
                        <button className="rx-sm rx-del" onClick={e => { e.stopPropagation(); removeProject(p.id); }}>✕</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedProject ? (
            <div className="rx-card" style={{ textAlign: "center", padding: 48, color: "var(--text-3)" }}>Select or create a project to plan its facility layout.</div>
          ) : !selectedShell ? (
            <div className="rx-card">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Set up the facility shell for "{selectedProject.name}"</div>
              {!shellForm ? (
                <button className="rx-btn rx-primary" onClick={openAddShell}>+ Define facility shell</button>
              ) : (
                <div style={{ maxWidth: 420 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div><label className="rx-lbl">Width (ft)</label><input type="number" step="1" className="rx-inp" value={shellForm.width_ft} onChange={e => setSF("width_ft", e.target.value)} /></div>
                    <div><label className="rx-lbl">Depth (ft)</label><input type="number" step="1" className="rx-inp" value={shellForm.depth_ft} onChange={e => setSF("depth_ft", e.target.value)} /></div>
                    <div><label className="rx-lbl">Ceiling height (ft)</label><input type="number" step="0.5" className="rx-inp" value={shellForm.ceiling_height_ft} onChange={e => setSF("ceiling_height_ft", e.target.value)} /></div>
                  </div>
                  <div style={{ marginBottom: 10 }}><label className="rx-lbl">Notes</label><input className="rx-inp" value={shellForm.notes || ""} onChange={e => setSF("notes", e.target.value)} /></div>
                  {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="rx-btn rx-primary" onClick={saveShell}>Create shell</button>
                    <button className="rx-btn rx-secondary" onClick={() => setShellForm(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rx-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedProject.name} — {selectedShell.width_ft}ft × {selectedShell.depth_ft}ft shell</div>
                <button className="rx-btn rx-secondary" onClick={() => setShow3D(v => !v)}>{show3D ? "← Back to 2D editor" : "View in 3D"}</button>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span className="rx-pill">Est. equipment cost: ${estCost.toLocaleString()}</span>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Sum of purchase price for {projectRoomEquipment.length} placed item{projectRoomEquipment.length === 1 ? "" : "s"} — planning estimate, not a full capex budget.</div>
              </div>
              {show3D ? (
                <Suspense fallback={<div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading 3D viewer…</div>}>
                  <ShellViewer3D shell={selectedShell} rooms={shellRooms} roomEquipment={projectRoomEquipment} equipment={equipment} />
                </Suspense>
              ) : (
                <ShellEditor2D
                  shell={selectedShell} rooms={shellRooms} onSaveRoom={saveRoom} onDeleteRoom={deleteRoom}
                  roomEquipment={projectRoomEquipment} onSaveRoomEquipment={saveRoomEquipment} onDeleteRoomEquipment={deleteRoomEquipment}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
