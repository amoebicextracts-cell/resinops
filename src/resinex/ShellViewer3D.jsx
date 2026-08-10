import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";

const ROOM_COLORS = { grow: "#4a7c59", production: "#3d5a7a", business: "#a07a3d", other: "#6a6a6a" };
const IN_PER_FT = 12;

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
function EquipmentBox({ placement, eq, room, shellW, shellD, roomHeight }) {
  const rotated = Number(placement.rotation_deg) === 90 || Number(placement.rotation_deg) === 270;
  const wIn = Number(eq?.width_in) || 24, dIn = Number(eq?.depth_in) || 24, hIn = Number(eq?.height_in) || 36;
  const w = (rotated ? dIn : wIn) / IN_PER_FT;
  const d = (rotated ? wIn : dIn) / IN_PER_FT;
  const h = Math.min(hIn / IN_PER_FT, roomHeight); // never render taller than its own room
  const cx = Number(room.x_ft) + Number(placement.x_ft) + w / 2 - shellW / 2;
  const cz = Number(room.y_ft) + Number(placement.y_ft) + d / 2 - shellD / 2;
  return (
    <mesh position={[cx, h / 2, cz]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color="#d0d0d0" />
      <Edges color="#000" />
    </mesh>
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
              <EquipmentBox
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
