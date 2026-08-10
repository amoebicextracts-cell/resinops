import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";

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

export default function ShellViewer3D({ shell, rooms }) {
  const shellW = Number(shell.width_ft) || 1;
  const shellD = Number(shell.depth_ft) || 1;
  const defaultHeight = Number(shell.ceiling_height_ft) || 10;
  const camDist = Math.max(shellW, shellD, 20);

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
        {rooms.map(room => <RoomBox key={room.id} room={room} shellW={shellW} shellD={shellD} defaultHeight={defaultHeight} />)}
        <OrbitControls target={[0, 0, 0]} makeDefault />
      </Canvas>
    </div>
  );
}
