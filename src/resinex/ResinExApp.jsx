import { useState, useEffect, lazy, Suspense } from "react";
import { db } from "../lib/db";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ShellViewer3D = lazy(() => import("./ShellViewer3D.jsx"));

import ShellEditor2D from "./ShellEditor2D.jsx";
import ProjectDocuments from "./ProjectDocuments.jsx";
import ProjectActuals from "./ProjectActuals.jsx";

const IN_PER_FT = 12;
const PDF_ROOM_FILL = { grow: [224, 237, 228], production: [222, 229, 239], business: [241, 231, 212], other: [227, 227, 227] };
const PDF_ROOM_BORDER = { grow: [74, 124, 89], production: [61, 90, 122], business: [160, 122, 61], other: [106, 106, 106] };
const DISCLAIMER = "Estimator tool — verify all dimensions, specifications, and pricing before requesting bids.";

// Facility-shell/room/equipment schematic export -- a dimensioned floor
// plan for GC-bidding reference. Deliberately a planning-reference
// document, not a stamped construction document (that needs a licensed
// architect/engineer) -- the disclaimer is repeated on both pages so it
// can't be mistaken for one.
function buildSchematicPdf(project, shell, rooms, roomEquipment, equipmentList) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const equipmentById = new Map(equipmentList.map(e => [e.id, e]));

  let y = margin;
  doc.setFontSize(15); doc.setFont(undefined, "bold"); doc.setTextColor(0);
  doc.text(project.name || "ResinEx Facility Plan", margin, y);
  y += 6;
  doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(90);
  doc.text(`${shell.width_ft}ft × ${shell.depth_ft}ft shell · Generated ${new Date().toLocaleDateString()}`, margin, y);
  y += 6;
  doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.setTextColor(180, 60, 40);
  doc.text("PLANNING REFERENCE — NOT FOR CONSTRUCTION", margin, y);
  y += 5;
  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(90);
  doc.text(DISCLAIMER, margin, y);
  doc.setTextColor(0);
  y += 8;

  // Scale-to-fit the shell into the remaining page area, centered.
  const planTop = y;
  const planAreaW = pageW - margin * 2;
  const planAreaH = pageH - planTop - margin;
  const shellW = Number(shell.width_ft) || 1;
  const shellD = Number(shell.depth_ft) || 1;
  const scale = Math.min(planAreaW / shellW, planAreaH / shellD); // mm per ft
  const drawW = shellW * scale, drawH = shellD * scale;
  const originX = margin + (planAreaW - drawW) / 2;
  const originY = planTop + (planAreaH - drawH) / 2;

  doc.setDrawColor(120); doc.setLineWidth(0.6); doc.setFillColor(255, 255, 255);
  doc.rect(originX, originY, drawW, drawH);
  doc.setFontSize(8); doc.setTextColor(90);
  doc.text(`${shellW} ft`, originX + drawW / 2, originY - 2, { align: "center" });
  doc.text(`${shellD} ft`, originX - 2, originY + drawH / 2, { align: "right" });
  doc.setTextColor(0);

  rooms.forEach(room => {
    const rx = originX + Number(room.x_ft) * scale;
    const ry = originY + Number(room.y_ft) * scale;
    const rw = Number(room.width_ft) * scale;
    const rd = Number(room.depth_ft) * scale;
    const fill = PDF_ROOM_FILL[room.room_type] || PDF_ROOM_FILL.other;
    const border = PDF_ROOM_BORDER[room.room_type] || PDF_ROOM_BORDER.other;
    doc.setFillColor(...fill); doc.setDrawColor(...border); doc.setLineWidth(0.4);
    doc.rect(rx, ry, rw, rd, "FD");
    if (rw > 15 && rd > 6) {
      doc.setFontSize(7); doc.setTextColor(30);
      doc.text(room.name, rx + 1.5, ry + 4);
      if (rd > 10) doc.text(`${room.width_ft}×${room.depth_ft}ft`, rx + 1.5, ry + 8);
    }

    roomEquipment.filter(re => re.room_id === room.id).forEach(pe => {
      const eq = equipmentById.get(pe.equipment_id);
      const rotated = Number(pe.rotation_deg) === 90 || Number(pe.rotation_deg) === 270;
      const wIn = Number(eq?.width_in) || 24, dIn = Number(eq?.depth_in) || 24;
      const wFt = (rotated ? dIn : wIn) / IN_PER_FT, dFt = (rotated ? wIn : dIn) / IN_PER_FT;
      const ex = rx + Number(pe.x_ft) * scale, ey = ry + Number(pe.y_ft) * scale;
      const ew = wFt * scale, ed = dFt * scale;
      doc.setFillColor(70, 70, 70); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.2);
      doc.rect(ex, ey, ew, ed, "FD");
      if (ew > 12 && ed > 4) {
        doc.setFontSize(5); doc.setTextColor(255, 255, 255);
        doc.text(eq?.name || "Equipment", ex + 1, ey + 3);
      }
    });
  });
  doc.setTextColor(0);

  doc.addPage();
  let y2 = margin;
  doc.setFontSize(13); doc.setFont(undefined, "bold"); doc.setTextColor(0);
  doc.text("Room & Equipment Summary", margin, y2);
  y2 += 8;

  autoTable(doc, {
    startY: y2,
    head: [["Room", "Type", "Dimensions (ft)", "Height (ft)", "Sqft"]],
    body: rooms.length ? rooms.map(r => [
      r.name, r.room_type,
      `${r.width_ft} × ${r.depth_ft}`,
      r.height_ft || `(${shell.ceiling_height_ft})`,
      (Number(r.width_ft) * Number(r.depth_ft)).toFixed(0),
    ]) : [["No rooms defined yet.", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: [74, 124, 89] },
  });

  const eqRows = roomEquipment.map(re => {
    const eq = equipmentById.get(re.equipment_id);
    const room = rooms.find(r => r.id === re.room_id);
    const dims = eq?.width_in && eq?.depth_in ? `${eq.width_in}×${eq.depth_in}×${eq.height_in || "—"}in` : "—";
    return [
      eq?.name || "—", eq?.cat || "—",
      [eq?.make, eq?.model].filter(Boolean).join(" ") || "—",
      dims, room?.name || "—",
      eq?.purchasePrice ? `$${Number(eq.purchasePrice).toLocaleString()}` : "—",
    ];
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [["Equipment", "Category", "Make/Model", "Dimensions", "Room", "Purchase Price"]],
    body: eqRows.length ? eqRows : [["No equipment placed yet.", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: [61, 90, 122] },
  });

  const total = roomEquipment.reduce((sum, re) => sum + (Number(equipmentById.get(re.equipment_id)?.purchasePrice) || 0), 0);
  let y3 = doc.lastAutoTable.finalY + 10;
  // A long equipment table can push finalY near the bottom of the page --
  // without this check the cost total and required disclaimer could be
  // clipped off the exported PDF entirely (caught by Greptile review on
  // PR #44, merged before this was read/fixed).
  if (y3 + 15 > pageH - margin) {
    doc.addPage();
    y3 = margin;
  }
  doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.setTextColor(0);
  doc.text(`Estimated equipment cost: $${total.toLocaleString()}`, margin, y3);
  y3 += 8;
  doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(90);
  doc.text(doc.splitTextToSize("Planning reference only — not for construction. " + DISCLAIMER, pageW - margin * 2), margin, y3);

  const fileSafeName = (project.name || "resinex-plan").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`${fileSafeName}-floorplan.pdf`);
}

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
  const [activeTab, setActiveTab] = useState("layout");
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedProject.name} — {selectedShell.width_ft}ft × {selectedShell.depth_ft}ft shell</div>
                {activeTab === "layout" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="rx-btn rx-secondary" onClick={() => buildSchematicPdf(selectedProject, selectedShell, shellRooms, projectRoomEquipment, equipment)}>Export PDF</button>
                    <button className="rx-btn rx-secondary" onClick={() => setShow3D(v => !v)}>{show3D ? "← Back to 2D editor" : "View in 3D"}</button>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid var(--border-2)", paddingBottom: 10 }}>
                <button className={activeTab === "layout" ? "rx-btn rx-primary" : "rx-btn rx-secondary"} onClick={() => setActiveTab("layout")}>Layout</button>
                <button className={activeTab === "documents" ? "rx-btn rx-primary" : "rx-btn rx-secondary"} onClick={() => setActiveTab("documents")}>Documents</button>
                <button className={activeTab === "actuals" ? "rx-btn rx-primary" : "rx-btn rx-secondary"} onClick={() => setActiveTab("actuals")}>Actuals</button>
              </div>

              {activeTab === "layout" && (
                <>
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
                </>
              )}
              {activeTab === "documents" && <ProjectDocuments project={selectedProject} />}
              {activeTab === "actuals" && <ProjectActuals project={selectedProject} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
