import { useState, useEffect, useRef } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const ROOTING   = 14;
const DRYING    = 12;
const TESTING   = 10;
const PACKAGING =  9;
const PX        = 11;
const LW        = 228;
const RH        = 80;
const HH        = 52;

// ── Phase config ──────────────────────────────────────────────────────────────
const PHASES = [
  { name: "Clone",        bg: "#1e4d2a", text: "#9ae6b0" },
  { name: "Veg",          bg: "#1a5c30", text: "#b0f0c8" },
  { name: "Flower",       bg: "#5c3a08", text: "#f5c060" },
  { name: "Post-harvest", bg: "#0e2050", text: "#80b8f8" },
];

// ── Milestone config ──────────────────────────────────────────────────────────
const MS = [
  { k: "cut",  ab: "✂",  la: "Cut clones",              co: "#52c878", alt: 0 },
  { k: "tx",   ab: "TX", la: "Transplant to veg",       co: "#3aaa60", alt: 1 },
  { k: "fl",   ab: "FL", la: "Flip to flower",          co: "#d4900a", alt: 0 },
  { k: "d1",   ab: "D1", la: "1st defoliation",         co: "#b87820", alt: 1 },
  { k: "d2",   ab: "D2", la: "2nd defoliation",         co: "#b07018", alt: 0 },
  { k: "fd",   ab: "FD", la: "Fade begins",             co: "#986020", alt: 1 },
  { k: "ph",   ab: "PH", la: "Pre-harv defol + flush",  co: "#885020", alt: 0 },
  { k: "hv",   ab: "HV", la: "Harvest",                 co: "#d04040", alt: 1 },
  { k: "dr",   ab: "DR", la: "Dry complete",            co: "#3a70d0", alt: 0 },
  { k: "ts",   ab: "TS", la: "Testing sent",            co: "#7050d0", alt: 1 },
  { k: "pk",   ab: "PK", la: "Package + results",       co: "#4880d0", alt: 0 },
  { k: "inv",  ab: "IN", la: "Live inventory",          co: "#2898a8", alt: 1 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function dAdd(dt, n) {
  const r = new Date(dt);
  r.setDate(r.getDate() + n);
  return r;
}
function dDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function fmtShort(dt) {
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtFull(dt) {
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function cloneTarget(plants) {
  return Math.ceil(plants * 1.1);
}

function getSched(sp) {
  const s   = new Date(sp.d + "T12:00:00");
  const tx  = dAdd(s,  ROOTING);
  const fl  = dAdd(tx, sp.veg * 7);
  const hv  = dAdd(fl, sp.flw * 7);
  const dr  = dAdd(hv, DRYING);
  const pk  = dAdd(dr, TESTING);
  const inv = dAdd(pk, PACKAGING);
  return {
    phases: [
      { s, e: tx, ...PHASES[0] },
      { s: tx, e: fl, ...PHASES[1] },
      { s: fl, e: hv, ...PHASES[2] },
      { s: hv, e: inv, ...PHASES[3] },
    ],
    ms: {
      cut: s, tx, fl,
      d1: dAdd(fl, 20),
      d2: dAdd(fl, 42),
      fd: dAdd(hv, -14),
      ph: dAdd(hv, -3),
      hv, dr, ts: dr, pk, inv,
    },
    end: inv,
  };
}

// ── Scheduler CSS ─────────────────────────────────────────────────────────────
const schedCSS = `
  .sch-outer { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
  .sch-row { display: flex; border-bottom: 1px solid var(--border); }
  .sch-row:last-child { border-bottom: none; }
  .sch-left {
    position: sticky; left: 0; z-index: 4;
    width: ${LW}px; min-width: ${LW}px; flex-shrink: 0;
    background: var(--surface); border-right: 1px solid var(--border);
    padding: 8px 12px; display: flex; flex-direction: column;
    justify-content: center; gap: 3px;
  }
  .sch-tl { position: relative; flex: 1; }
  .sch-ms-pill {
    position: absolute; font-size: 9px; font-weight: 600;
    padding: 1px 4px; border-radius: 3px; color: #ffffff;
    white-space: nowrap; font-family: 'IBM Plex Mono', monospace;
    line-height: 1.5; cursor: default; letter-spacing: 0.02em;
  }
  .wk-edit {
    width: 34px; font-size: 11px; padding: 1px 4px; text-align: center;
    border-radius: 4px; border: 1px solid var(--border-2);
    background: var(--surface-2); color: var(--text);
    font-family: 'IBM Plex Mono', monospace;
  }
  .wk-edit:focus { outline: none; border-color: var(--accent); }
  .sch-del-btn {
    background: none; border: none; cursor: pointer;
    font-size: 11px; color: var(--text-3); padding: 0 3px;
    line-height: 1; margin-left: auto;
  }
  .sch-del-btn:hover { color: var(--danger); }
  .sch-add-btn {
    background: var(--accent); border: none; border-radius: 8px;
    color: #fff; font-size: 12px; font-weight: 600;
    padding: 7px 14px; cursor: pointer; font-family: 'Inter', sans-serif;
    transition: background 0.15s;
  }
  .sch-add-btn:hover { background: var(--accent-2); }
  .sch-cancel-btn {
    background: var(--surface-2); border: 1px solid var(--border-2);
    border-radius: 8px; color: var(--text-2); font-size: 12px;
    padding: 7px 14px; cursor: pointer; font-family: 'Inter', sans-serif;
  }
  .sch-form-input {
    width: 100%; background: var(--surface-2); border: 1px solid var(--border-2);
    border-radius: 8px; color: var(--text); font-family: 'Inter', sans-serif;
    font-size: 13px; padding: 8px 10px; box-sizing: border-box;
  }
  .sch-form-input:focus { outline: none; border-color: var(--accent); }
  .sch-form-label {
    font-size: 11px; color: var(--text-2); display: block; margin-bottom: 4px;
  }
  .sch-clone-box {
    background: rgba(74,124,89,0.15); border: 1px solid var(--accent);
    border-radius: 8px; padding: 8px 12px;
  }
`;

// ── Main Component ────────────────────────────────────────────────────────────
export default function Scheduler() {
  const [spaces, setSpaces]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("resinops_spaces") || "[]"); }
    catch { return []; }
  });
  const [showForm, setShowForm] = useState(false);
  const [plants, setPlants]     = useState("");
  const [formErr, setFormErr]   = useState("");

  const nameRef   = useRef();
  const strainRef = useRef();
  const dateRef   = useRef();
  const vegRef    = useRef();
  const flwRef    = useRef();

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem("resinops_spaces", JSON.stringify(spaces));
  }, [spaces]);

  function openForm() {
    setShowForm(true);
    setFormErr("");
    setPlants("");
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function saveSpace() {
    const name   = nameRef.current.value.trim();
    const strain = strainRef.current.value.trim();
    const d      = dateRef.current.value;
    const n      = parseInt(plants) || 0;
    const veg    = Math.max(1, Math.min(24, parseInt(vegRef.current.value) || 4));
    const flw    = Math.max(1, Math.min(24, parseInt(flwRef.current.value) || 9));
    if (!name)   { setFormErr("Enter a space name."); return; }
    if (!strain) { setFormErr("Enter a strain or cultivar."); return; }
    if (!d)      { setFormErr("Select a clone cut date."); return; }
    if (!n || n < 1) { setFormErr("Enter the number of plants for this space."); return; }
    setSpaces(prev => [...prev, { name, strain, d, plants: n, veg, flw, id: Date.now() }]);
    setShowForm(false);
    setPlants("");
    nameRef.current.value = "";
    strainRef.current.value = "";
  }

  function updateWks(id, field, val) {
    const n = Math.max(1, Math.min(24, parseInt(val) || 1));
    setSpaces(prev => prev.map(sp => sp.id === id ? { ...sp, [field]: n } : sp));
  }

  function removeSpace(id) {
    setSpaces(prev => prev.filter(sp => sp.id !== id));
  }

  // ── Render Gantt ──────────────────────────────────────────────────────────
  const scheds = spaces.map(getSched);
  const hasSpaces = spaces.length > 0;

  let gStart, gEnd, total, twPx;
  if (hasSpaces) {
    gStart = new Date(Math.min(...scheds.map(sc => sc.phases[0].s)));
    gEnd   = new Date(Math.max(...scheds.map(sc => sc.end)));
    total  = dDiff(gStart, gEnd) + 10;
    twPx   = total * PX;
  }

  const todayOff = hasSpaces ? dDiff(gStart, new Date()) : 0;
  const clones = parseInt(plants) > 0 ? cloneTarget(parseInt(plants)) : null;

  // Build week/month header markers
  function buildHeader() {
    const months = [];
    let mo = "", moX = 0;
    for (let day = 0; day <= total; day++) {
      const dt = dAdd(gStart, day);
      const ml = dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (ml !== mo) {
        if (mo) months.push({ label: mo, x: moX, w: day * PX - moX });
        mo = ml; moX = day * PX;
      }
    }
    months.push({ label: mo, x: moX, w: total * PX - moX });

    const weeks = [];
    for (let day = 0; day <= total; day += 7) {
      weeks.push({ x: day * PX, wn: Math.floor(day / 7) + 1, date: fmtShort(dAdd(gStart, day)) });
    }
    return { months, weeks };
  }

  return (
    <>
      <style>{schedCSS}</style>
      <div style={{ padding: "24px", flex: 1, overflowY: "auto" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", marginBottom: "3px" }}>
              Cultivation Scheduler
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
              Clone cut to live inventory — every milestone tracked
            </div>
          </div>
          {!showForm && (
            <button className="sch-add-btn" onClick={openForm}>+ Add Grow Space</button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border-2)",
            borderRadius: "10px", padding: "18px", marginBottom: "20px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "14px" }}>
              New Grow Space
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label className="sch-form-label">Space name</label>
                <input ref={nameRef} className="sch-form-input" placeholder="Room A — Tent 1" />
              </div>
              <div>
                <label className="sch-form-label">Strain / cultivar</label>
                <input ref={strainRef} className="sch-form-input" placeholder="Blue Dream" />
              </div>
              <div>
                <label className="sch-form-label">Clone cut date</label>
                <input ref={dateRef} type="date" className="sch-form-input"
                  defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <label className="sch-form-label">Plants in space</label>
                <input className="sch-form-input" type="number" min="1" placeholder="100"
                  value={plants} onChange={e => setPlants(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label className="sch-form-label">Veg weeks</label>
                  <input ref={vegRef} type="number" defaultValue="4" min="1" max="24" className="sch-form-input" />
                </div>
                <div>
                  <label className="sch-form-label">Flower weeks</label>
                  <input ref={flwRef} type="number" defaultValue="9" min="1" max="24" className="sch-form-input" />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {clones ? (
                  <div className="sch-clone-box" style={{ width: "100%" }}>
                    <div style={{ fontSize: "10px", color: "var(--accent-2)", fontWeight: 600, marginBottom: "2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Clone Target</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent-2)", lineHeight: 1.1 }}>{clones}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-2)", marginTop: "2px" }}>{parseInt(plants)} plants + 10% buffer</div>
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Enter plant count to see clone target</div>
                )}
              </div>
            </div>
            {formErr && <div style={{ fontSize: "12px", color: "var(--danger)", marginTop: "8px" }}>{formErr}</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button className="sch-add-btn" onClick={saveSpace}>Add Space</button>
              <button className="sch-cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasSpaces && !showForm && (
          <div style={{
            border: "1px dashed var(--border-2)", borderRadius: "10px",
            padding: "48px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>📅</div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-2)", marginBottom: "4px" }}>No grow spaces yet</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Add a grow space to map the full cultivation timeline</div>
          </div>
        )}

        {/* Gantt chart */}
        {hasSpaces && (() => {
          const { months, weeks } = buildHeader();
          return (
            <>
              <div className="sch-outer">
                {/* Header row */}
                <div className="sch-row" style={{ height: `${HH}px`, background: "var(--surface-2)" }}>
                  <div className="sch-left" style={{ height: `${HH}px`, background: "var(--surface-2)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Grow Space</span>
                  </div>
                  <div className="sch-tl" style={{ minWidth: `${twPx}px`, height: `${HH}px`, overflow: "hidden" }}>
                    {/* Month bands */}
                    {months.map((m, i) => (
                      <div key={i} style={{
                        position: "absolute", left: m.x, top: 0, width: m.w, height: 22,
                        borderRight: "1px solid var(--border)", padding: "0 6px",
                        display: "flex", alignItems: "center", overflow: "hidden",
                      }}>
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>{m.label}</span>
                      </div>
                    ))}
                    {/* Week markers */}
                    {weeks.map((w, i) => (
                      <div key={i} style={{
                        position: "absolute", left: w.x, top: 22, bottom: 0,
                        borderLeft: "1px solid var(--border)", paddingLeft: 3,
                        display: "flex", alignItems: "center",
                      }}>
                        <div>
                          <div style={{ fontSize: "9px", fontWeight: 600, color: "var(--text-3)" }}>W{w.wn}</div>
                          <div style={{ fontSize: "9px", color: "var(--text-3)" }}>{w.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Space rows */}
                {spaces.map((sp, idx) => {
                  const sc = scheds[idx];
                  return (
                    <div key={sp.id} className="sch-row" style={{ height: `${RH}px` }}>
                      {/* Left info cell */}
                      <div className="sch-left" style={{ height: `${RH}px` }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.strain}</div>
                        <div style={{ fontSize: "10px", color: "var(--text-3)" }}>
                          {sp.plants} plants · {cloneTarget(sp.plants)} clones
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
                          <span style={{ fontSize: "10px", color: "var(--text-3)" }}>Veg</span>
                          <input className="wk-edit" type="number" defaultValue={sp.veg} min="1" max="24"
                            onChange={e => updateWks(sp.id, "veg", e.target.value)} />
                          <span style={{ fontSize: "10px", color: "var(--text-3)" }}>Flw</span>
                          <input className="wk-edit" type="number" defaultValue={sp.flw} min="1" max="24"
                            onChange={e => updateWks(sp.id, "flw", e.target.value)} />
                          <button className="sch-del-btn" onClick={() => removeSpace(sp.id)} title="Remove space">✕</button>
                        </div>
                      </div>

                      {/* Timeline cell */}
                      <div className="sch-tl" style={{ minWidth: `${twPx}px`, height: `${RH}px` }}>
                        {/* Week grid lines */}
                        {weeks.map((w, i) => (
                          <div key={i} style={{
                            position: "absolute", left: w.x, top: 0, bottom: 0,
                            width: 1, background: "var(--border)", opacity: 0.4,
                          }} />
                        ))}

                        {/* Phase bars */}
                        {sc.phases.map((ph, i) => {
                          const x = dDiff(gStart, ph.s) * PX;
                          const w = Math.max(dDiff(ph.s, ph.e) * PX, 2);
                          return (
                            <div key={i} style={{
                              position: "absolute", left: x, top: 10, width: w, height: RH - 20,
                              background: ph.bg, borderRadius: 4,
                              display: "flex", alignItems: "center",
                              padding: "0 8px", overflow: "hidden",
                            }}>
                              <span style={{ fontSize: "10px", fontWeight: 600, color: ph.text, whiteSpace: "nowrap" }}>{ph.name}</span>
                            </div>
                          );
                        })}

                        {/* Milestone markers */}
                        {MS.map(m => {
                          const dt = sc.ms[m.k];
                          if (!dt) return null;
                          const x = dDiff(gStart, dt) * PX;
                          const topY = m.alt === 0 ? 2 : RH - 16;
                          return (
                            <div key={m.k} title={`${m.la} — ${fmtFull(dt)}`}
                              style={{ position: "absolute", left: x, top: 0, width: 1, height: RH, zIndex: 2 }}>
                              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 1, background: m.co, opacity: 0.85 }} />
                              <div className="sch-ms-pill" style={{ position: "absolute", left: 2, top: topY, background: m.co }}>{m.ab}</div>
                            </div>
                          );
                        })}

                        {/* Today line */}
                        {todayOff >= 0 && todayOff <= total && (
                          <div style={{
                            position: "absolute", left: todayOff * PX, top: 0, bottom: 0,
                            width: 2, background: "var(--danger)", zIndex: 3, opacity: 0.9,
                          }} title="Today" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
                {MS.map(m => (
                  <div key={m.k} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{
                      background: m.co, color: "#fff", fontSize: "9px", fontWeight: 600,
                      padding: "1px 5px", borderRadius: 3, fontFamily: "IBM Plex Mono, monospace",
                    }}>{m.ab}</div>
                    <span style={{ fontSize: "11px", color: "var(--text-2)" }}>{m.la}</span>
                  </div>
                ))}
                {PHASES.map((ph, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: 14, height: 10, borderRadius: 2, background: ph.bg, border: "1px solid rgba(255,255,255,0.1)" }} />
                    <span style={{ fontSize: "11px", color: "var(--text-2)" }}>{ph.name}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: 2, height: 14, background: "var(--danger)", borderRadius: 1 }} />
                  <span style={{ fontSize: "11px", color: "var(--text-2)" }}>Today</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </>
  );
}
