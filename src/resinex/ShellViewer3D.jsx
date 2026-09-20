import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
import EquipmentModel from "./EquipmentModel.jsx";
import { resolveShape, equipmentDimsFt } from "./equipmentShapes.js";

const ROOM_COLORS = { grow: "#4a7c59", production: "#3d5a7a", business: "#a07a3d", other: "#6a6a6a" };

function RoomBox({ room, shellW, shellD, defaultHeight }) {
  const h = Number(room.height_ft) || defaultHeight;
  const w = Number(room.width_ft), d = Number(room.depth_ft);
  // Room coords are 2D top-down (x_ft along width, y_ft along depth, origin
  // at the shell's front-left corner) -- recenter around the scene origin
  // so OrbitControls' default target sits in the middle of the facility.
  const cx = Number(room.x_ft) + w / 2 - shellW / 2;
  const cz = Number(room.y_ft) + d / 2 - shellD / 2;
  const color = room.color || ROOM_COLORS[room.room_type] || ROOM_COLORS.other;
  return (
    <mesh position={[cx, h / 2, cz]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} transparent opacity={0.55} />
      <Edges color={color} />
    </mesh>
  );
}

// Equipment dims are in inches (phase 1); room/placement coords are feet.
// The placement's x/y is the top-left of the (possibly rotated) footprint,
// so the model is positioned at the footprint center and the shape itself
// is drawn unrotated then turned clockwise (seen from above) by rotation_deg.
function EquipmentItem({ placement, eq, room, shellW, shellD, roomHeight }) {
  const deg = Number(placement.rotation_deg) || 0;
  const rotated = deg === 90 || deg === 270;
  const dims = equipmentDimsFt(eq);
  const h = Math.min(dims.h, roomHeight); // never render taller than its own room
  const fw = rotated ? dims.d : dims.w; // footprint after rotation
  const fd = rotated ? dims.w : dims.d;
  const cx = Number(room.x_ft) + Number(placement.x_ft) + fw / 2 - shellW / 2;
  const cz = Number(room.y_ft) + Number(placement.y_ft) + fd / 2 - shellD / 2;
  // Lights/fans/cameras hang from the ceiling rather than standing on the floor.
  const y = resolveShape(eq) === "overhead" ? roomHeight - h : 0;
  return (
    <group position={[cx, y, cz]} rotation={[0, (-deg * Math.PI) / 180, 0]}>
      <EquipmentModel eq={eq} w={dims.w} d={dims.d} h={h} />
    </group>
  );
}

export default function ShellViewer3D({ shell, rooms, roomEquipment, equipment }) {
  const shellW = Number(shell.width_ft) || 1;
  const shellD = Number(shell.depth_ft) || 1;
  const defaultHeight = Number(shell.ceiling_height_ft) || 10;
  const camDist = Math.max(shellW, shellD, 20);
  const equipmentById = new Map((equipment || []).map(e => [e.id, e]));

  return (
    <div style={{ width: "100%", height: 520, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-2)" }}>
      <Canvas camera={{ position: [camDist * 0.9, camDist * 0.8, camDist * 0.9], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[camDist, camDist * 1.5, camDist]} intensity={0.8} />
        <Grid args={[shellW, shellD]} position={[0, 0, 0]} cellColor="#3a3a3a" sectionColor="#555" fadeDistance={camDist * 3} />
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[shellW, 0.1, shellD]} />
          <meshStandardMaterial color="#2a2a2a" transparent opacity={0.4} />
        </mesh>
        {rooms.map(room => (
          <group key={room.id}>
            <RoomBox room={room} shellW={shellW} shellD={shellD} defaultHeight={defaultHeight} />
            {(roomEquipment || []).filter(re => re.room_id === room.id).map(pe => (
              <EquipmentItem
                key={pe.id}
                placement={pe}
                eq={equipmentById.get(pe.equipment_id)}
                room={room}
                shellW={shellW}
                shellD={shellD}
                roomHeight={Number(room.height_ft) || defaultHeight}
              />
            ))}
          </group>
        ))}
        <OrbitControls target={[0, 0, 0]} makeDefault />
      </Canvas>
    </div>
  );
}
