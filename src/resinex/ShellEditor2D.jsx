import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../lib/db";

const SCALE = 16; // px per ft
const MIN_FT = 2;
const IN_PER_FT = 12;
const ROOM_TYPES = [
  { v: "grow", l: "Grow space" },
  { v: "production", l: "Production space" },
  { v: "business", l: "Business space" },
  { v: "other", l: "Other" },
];
const ROOM_COLORS = { grow: "#4a7c59", production: "#3d5a7a", business: "#a07a3d", other: "#6a6a6a" };

const EMPTY_ROOM = { name: "New Room", room_type: "other", x_ft: 0, y_ft: 0, width_ft: 10, depth_ft: 10, height_ft: "", color: "", linked_grow_room_id: "", linked_facility_map_space_id: "", notes: "" };

// transformFromDb() attaches a camelCase alias (shellId, roomType, ...) next
// to every snake_case column it reads, for callers that prefer camelCase.
// This whole component only ever reads/writes the snake_case names, so a
// fetched room/placement's alias copies are dead weight it never updates --
// if a room or placement object from the rooms/roomEquipment props gets
// spread as-is into a save call (drag/resize, rotate, or the side-panel
// form), those stale aliases ride along and can win over the real edit in
// transformForDb, depending on object key order (see PR #49). Every place
// that reads a room or placement out of props must go through the cleaned
// arrays below -- never `rooms`/`roomEquipment` directly -- so nothing
// alias-bearing ever reaches onSaveRoom/onSaveRoomEquipment.
const ROOM_ALIAS_KEYS = ["shellId", "roomType", "xFt", "yFt", "widthFt", "depthFt", "heightFt", "linkedGrowRoomId", "linkedFacilityMapSpaceId"];
const EQUIPMENT_ALIAS_KEYS = ["roomId", "equipmentId", "xFt", "yFt", "rotationDeg"];

function stripKeys(obj, keys) {
  const clean = { ...obj };
  for (const k of keys) delete clean[k];
  return clean;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Equipment dims are in inches (phase 1); rooms/placements are in feet.
// Nullable dims fall back to a placeholder footprint so undimensioned
// equipment doesn't render as a zero-size, undraggable rect.
function eqFootprintFt(eq) {
  const wFt = (Number(eq?.width_in) || 24) / IN_PER_FT;
  const dFt = (Number(eq?.depth_in) || 24) / IN_PER_FT;
  return { wFt, dFt };
}

export default function ShellEditor2D({ shell, rooms, onSaveRoom, onDeleteRoom, roomEquipment, onSaveRoomEquipment, onDeleteRoomEquipment }) {
  const [selectedId, setSelectedId] = useState(null);
  const [roomForm, setRoomForm] = useState(null);
  const [growRooms, setGrowRooms] = useState([]);
  const [mapSpaces, setMapSpaces] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [err, setErr] = useState("");
  const [dragPreview, setDragPreview] = useState(null); // {roomId, x_ft?, y_ft?, width_ft?, depth_ft?}
  const dragRef = useRef(null); // {mode:'move'|'resize', roomId, startX, startY, orig}
  const [eqDragPreview, setEqDragPreview] = useState(null); // {placementId, x_ft, y_ft}
  const eqDragRef = useRef(null); // {placementId, roomId, startX, startY, orig}

  useEffect(() => {
    db.grow_rooms.list().then(setGrowRooms).catch(() => {});
    db.facility_map_spaces.list().then(setMapSpaces).catch(() => {});
    db.equipment.list().then(setEquipmentList).catch(() => {});
  }, []);

  const cleanRooms = useMemo(() => rooms.map(r => stripKeys(r, ROOM_ALIAS_KEYS)), [rooms]);
  const cleanRoomEquipment = useMemo(() => roomEquipment.map(re => stripKeys(re, EQUIPMENT_ALIAS_KEYS)), [roomEquipment]);

  const equipmentById = new Map(equipmentList.map(eq => [eq.id, eq]));
  const placedEquipmentIds = new Set(cleanRoomEquipment.map(re => re.equipment_id));

  useEffect(() => {
    const room = cleanRooms.find(r => r.id === selectedId);
    setRoomForm(room || null);
  }, [selectedId, cleanRooms]);

  const shellW = Number(shell.width_ft) || 1;
  const shellD = Number(shell.depth_ft) || 1;
  const svgW = shellW * SCALE;
  const svgH = shellD * SCALE;

  async function addRoom() {
    const saved = await onSaveRoom({ ...EMPTY_ROOM });
    setSelectedId(saved.id);
  }

  function onPointerDownRoom(e, room) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(room.id);
    dragRef.current = { mode: "move", roomId: room.id, startX: e.clientX, startY: e.clientY, orig: { x_ft: Number(room.x_ft), y_ft: Number(room.y_ft) } };
  }

  function onPointerDownHandle(e, room) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(room.id);
    dragRef.current = { mode: "resize", roomId: room.id, startX: e.clientX, startY: e.clientY, orig: { width_ft: Number(room.width_ft), depth_ft: Number(room.depth_ft) } };
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (drag) {
      const room = cleanRooms.find(r => r.id === drag.roomId);
      if (room) {
        const dxFt = Math.round((e.clientX - drag.startX) / SCALE);
        const dyFt = Math.round((e.clientY - drag.startY) / SCALE);
        if (drag.mode === "move") {
          const x_ft = clamp(drag.orig.x_ft + dxFt, 0, shellW - Number(room.width_ft));
          const y_ft = clamp(drag.orig.y_ft + dyFt, 0, shellD - Number(room.depth_ft));
          setDragPreview({ roomId: room.id, x_ft, y_ft });
        } else {
          const width_ft = clamp(drag.orig.width_ft + dxFt, MIN_FT, shellW - Number(room.x_ft));
          const depth_ft = clamp(drag.orig.depth_ft + dyFt, MIN_FT, shellD - Number(room.y_ft));
          setDragPreview({ roomId: room.id, width_ft, depth_ft });
        }
      }
    }
    const eqDrag = eqDragRef.current;
    if (eqDrag) {
      const room = cleanRooms.find(r => r.id === eqDrag.roomId);
      const placement = cleanRoomEquipment.find(re => re.id === eqDrag.placementId);
      if (room && placement) {
        const { wFt, dFt } = eqFootprintFt(equipmentById.get(placement.equipment_id));
        const rotated = Number(placement.rotation_deg) === 90 || Number(placement.rotation_deg) === 270;
        const boxW = rotated ? dFt : wFt, boxD = rotated ? wFt : dFt;
        const dxFt = Math.round((e.clientX - eqDrag.startX) / SCALE);
        const dyFt = Math.round((e.clientY - eqDrag.startY) / SCALE);
        const x_ft = clamp(eqDrag.orig.x_ft + dxFt, 0, Number(room.width_ft) - boxW);
        const y_ft = clamp(eqDrag.orig.y_ft + dyFt, 0, Number(room.depth_ft) - boxD);
        setEqDragPreview({ placementId: placement.id, x_ft, y_ft });
      }
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && dragPreview) {
      const room = cleanRooms.find(r => r.id === drag.roomId);
      if (room) onSaveRoom({ ...room, ...dragPreview });
    }
    setDragPreview(null);

    const eqDrag = eqDragRef.current;
    eqDragRef.current = null;
    if (eqDrag && eqDragPreview) {
      const placement = cleanRoomEquipment.find(re => re.id === eqDrag.placementId);
      if (placement) onSaveRoomEquipment({ ...placement, ...eqDragPreview });
    }
    setEqDragPreview(null);
  }

  function onPointerDownEquipment(e, room, placement) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    eqDragRef.current = { placementId: placement.id, roomId: room.id, startX: e.clientX, startY: e.clientY, orig: { x_ft: Number(placement.x_ft), y_ft: Number(placement.y_ft) } };
  }

  function placeEquipment(roomId, equipmentId) {
    if (!equipmentId) return;
    onSaveRoomEquipment({ room_id: roomId, equipment_id: equipmentId, x_ft: 0, y_ft: 0, rotation_deg: 0 });
  }

  function rotateEquipment(placement) {
    onSaveRoomEquipment({ ...placement, rotation_deg: (Number(placement.rotation_deg) + 90) % 360 });
  }

  const setRF = (k, v) => setRoomForm(f => ({ ...f, [k]: v }));

  async function saveRoomForm() {
    if (!roomForm.name.trim()) { setErr("Enter a room name."); return; }
    try {
      const saved = await onSaveRoom({
        ...roomForm,
        x_ft: clamp(Number(roomForm.x_ft) || 0, 0, shellW),
        y_ft: clamp(Number(roomForm.y_ft) || 0, 0, shellD),
        width_ft: Math.max(MIN_FT, Number(roomForm.width_ft) || MIN_FT),
        depth_ft: Math.max(MIN_FT, Number(roomForm.depth_ft) || MIN_FT),
        height_ft: roomForm.height_ft === "" ? null : Number(roomForm.height_ft),
        linked_grow_room_id: roomForm.linked_grow_room_id || null,
        linked_facility_map_space_id: roomForm.linked_facility_map_space_id || null,
      });
      setSelectedId(saved.id);
      setErr("");
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
  }

  async function removeSelected() {
    if (!selectedId) return;
    await onDeleteRoom(selectedId);
    setSelectedId(null);
  }

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ border: "1px solid var(--border-2)", borderRadius: 8, overflow: "auto", flex: 1 }}>
        <svg
          width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ display: "block", background: "var(--surface-2)" }}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onClick={() => setSelectedId(null)}
        >
          <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="var(--border-2)" strokeWidth={2} />
          {cleanRooms.map(room => {
            const preview = dragPreview && dragPreview.roomId === room.id ? dragPreview : {};
            const r = { ...room, ...preview };
            const x = Number(r.x_ft) * SCALE, y = Number(r.y_ft) * SCALE;
            const w = Number(r.width_ft) * SCALE, h = Number(r.depth_ft) * SCALE;
            const fill = room.color || ROOM_COLORS[room.room_type] || ROOM_COLORS.other;
            const selected = room.id === selectedId;
            return (
              <g key={room.id}>
                <rect
                  x={x} y={y} width={w} height={h}
                  fill={fill} fillOpacity={selected ? 0.55 : 0.35}
                  stroke={selected ? "var(--accent)" : fill} strokeWidth={selected ? 2 : 1}
                  style={{ cursor: "move" }}
                  onPointerDown={e => onPointerDownRoom(e, room)}
                  onClick={e => e.stopPropagation()}
                />
                <text x={x + 6} y={y + 16} fontSize={12} fill="var(--text)" style={{ pointerEvents: "none", fontFamily: "Inter, sans-serif" }}>{room.name}</text>
                <rect
                  x={x + w - 10} y={y + h - 10} width={10} height={10}
                  fill="var(--accent)" style={{ cursor: "nwse-resize" }}
                  onPointerDown={e => onPointerDownHandle(e, room)}
                  onClick={e => e.stopPropagation()}
                />
                {cleanRoomEquipment.filter(re => re.room_id === room.id).map(pe => {
                  const eq = equipmentById.get(pe.equipment_id);
                  const eqPreview = eqDragPreview && eqDragPreview.placementId === pe.id ? eqDragPreview : {};
                  const p = { ...pe, ...eqPreview };
                  const { wFt, dFt } = eqFootprintFt(eq);
                  const rotated = Number(p.rotation_deg) === 90 || Number(p.rotation_deg) === 270;
                  const boxW = (rotated ? dFt : wFt) * SCALE, boxD = (rotated ? wFt : dFt) * SCALE;
                  const ex = x + Number(p.x_ft) * SCALE, ey = y + Number(p.y_ft) * SCALE;
                  return (
                    <g key={pe.id}>
                      <rect
                        x={ex} y={ey} width={boxW} height={boxD}
                        fill="#1a1a1a" fillOpacity={0.7} stroke="#fff" strokeWidth={1}
                        style={{ cursor: "move" }}
                        onPointerDown={e => onPointerDownEquipment(e, room, pe)}
                        onClick={e => e.stopPropagation()}
                      />
                      <text x={ex + 4} y={ey + 12} fontSize={9} fill="#fff" style={{ pointerEvents: "none", fontFamily: "Inter, sans-serif" }}>{eq?.name || "Equipment"}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ width: 280, flexShrink: 0 }}>
        <button className="rx-btn rx-primary" style={{ width: "100%", marginBottom: 10 }} onClick={addRoom}>+ Add room</button>
        {!roomForm ? (
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Click a room to edit it, or drag rooms directly on the plan to move/resize them.</div>
        ) : (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12 }}>
            <div style={{ marginBottom: 8 }}><label className="rx-lbl">Name</label><input className="rx-inp" value={roomForm.name} onChange={e => setRF("name", e.target.value)} /></div>
            <div style={{ marginBottom: 8 }}><label className="rx-lbl">Type</label><select className="rx-sel" value={roomForm.room_type} onChange={e => setRF("room_type", e.target.value)}>{ROOM_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label className="rx-lbl">Width (ft)</label><input type="number" className="rx-inp" value={roomForm.width_ft} onChange={e => setRF("width_ft", e.target.value)} /></div>
              <div><label className="rx-lbl">Depth (ft)</label><input type="number" className="rx-inp" value={roomForm.depth_ft} onChange={e => setRF("depth_ft", e.target.value)} /></div>
              <div><label className="rx-lbl">Height (ft)</label><input type="number" className="rx-inp" placeholder={String(shell.ceiling_height_ft)} value={roomForm.height_ft ?? ""} onChange={e => setRF("height_ft", e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 8 }}><label className="rx-lbl">Color (optional)</label><input type="color" className="rx-inp" style={{ padding: 2, height: 32 }} value={roomForm.color || ROOM_COLORS[roomForm.room_type] || "#6a6a6a"} onChange={e => setRF("color", e.target.value)} /></div>
            <div style={{ marginBottom: 8 }}><label className="rx-lbl">Link to grow room (optional)</label><select className="rx-sel" value={roomForm.linked_grow_room_id || ""} onChange={e => setRF("linked_grow_room_id", e.target.value)}><option value="">— None —</option>{growRooms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
            <div style={{ marginBottom: 8 }}><label className="rx-lbl">Link to facility space (optional)</label><select className="rx-sel" value={roomForm.linked_facility_map_space_id || ""} onChange={e => setRF("linked_facility_map_space_id", e.target.value)}><option value="">— None —</option>{mapSpaces.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div style={{ marginBottom: 10 }}><label className="rx-lbl">Notes</label><input className="rx-inp" value={roomForm.notes || ""} onChange={e => setRF("notes", e.target.value)} /></div>
            {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button className="rx-btn rx-primary" onClick={saveRoomForm}>Save</button>
              <button className="rx-btn rx-del" onClick={removeSelected}>Delete</button>
            </div>

            <div style={{ borderTop: "1px solid var(--border-2)", paddingTop: 10 }}>
              <div className="rx-lbl" style={{ marginBottom: 6 }}>Equipment in this room</div>
              {cleanRoomEquipment.filter(re => re.room_id === selectedId).length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>None placed yet.</div>
              ) : (
                <div style={{ marginBottom: 8 }}>
                  {cleanRoomEquipment.filter(re => re.room_id === selectedId).map(re => {
                    const eq = equipmentById.get(re.equipment_id);
                    return (
                      <div key={re.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                        <span>{eq?.name || "Equipment"}</span>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button className="rx-sm rx-edit" onClick={() => rotateEquipment(re)}>⟳</button>
                          <button className="rx-sm rx-del" onClick={() => onDeleteRoomEquipment(re.id)}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <select className="rx-sel" value="" onChange={e => { placeEquipment(selectedId, e.target.value); e.target.value = ""; }}>
                <option value="">+ Place equipment</option>
                {equipmentList.filter(eq => !placedEquipmentIds.has(eq.id)).map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
