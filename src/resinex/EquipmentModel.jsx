import { Edges } from "@react-three/drei";
import { resolveShape, categoryColor, rackShelfCount } from "./equipmentShapes.js";

// Procedural stand-ins for real machines. Each generator draws its shape
// inside a w x d x h footprint (feet), centered on x/z with the floor at y=0,
// so the viewer only has to position the group. Detail parts are plain
// boxes/cylinders on purpose: cheap to render for hundreds of items and
// good enough to tell a tank from a rack from a bench at a glance.

const DARK = "#3c4044";

function Mat({ color, metal = 0.3, rough = 0.6 }) {
  return <meshStandardMaterial color={color} metalness={metal} roughness={rough} />;
}

function Part({ pos, size, color, edges }) {
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <Mat color={color} />
      {edges && <Edges color="#1c1e20" />}
    </mesh>
  );
}

function BoxUnit({ w, d, h, color }) {
  const plinth = Math.min(0.2, h * 0.08);
  const bodyH = h - plinth;
  return (
    <group>
      <Part pos={[0, plinth + bodyH / 2, 0]} size={[w, bodyH, d]} color={color} edges />
      <Part pos={[0, plinth / 2, 0]} size={[w * 0.94, plinth, d * 0.94]} color={DARK} />
      {/* front panel: shows which way the unit faces when rotated */}
      <Part pos={[0, plinth + bodyH * 0.6, d / 2]} size={[w * 0.7, bodyH * 0.35, 0.03]} color={DARK} />
    </group>
  );
}

function TankUnit({ w, d, h, color }) {
  const legH = Math.min(h * 0.22, 1);
  const capH = Math.min(h * 0.08, 0.35);
  const bodyH = h - legH - capH;
  const rx = w / 2, rz = d / 2;
  const legR = Math.max(0.04, Math.min(w, d) * 0.03);
  const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return (
    <group>
      {legs.map(([sx, sz], i) => (
        <mesh key={i} position={[sx * rx * 0.72, legH / 2, sz * rz * 0.72]}>
          <cylinderGeometry args={[legR, legR, legH, 8]} />
          <Mat color={DARK} />
        </mesh>
      ))}
      <mesh position={[0, legH + bodyH / 2, 0]} scale={[rx, 1, rz]}>
        <cylinderGeometry args={[1, 1, bodyH, 32]} />
        <Mat color={color} metal={0.7} rough={0.35} />
      </mesh>
      {/* dished top */}
      <mesh position={[0, legH + bodyH, 0]} scale={[rx, capH, rz]}>
        <sphereGeometry args={[1, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color={color} metal={0.7} rough={0.35} />
      </mesh>
      {/* port stub on the top so tanks read as plumbed vessels */}
      <mesh position={[0, h + 0.05, 0]}>
        <cylinderGeometry args={[Math.min(rx, rz) * 0.12, Math.min(rx, rz) * 0.12, 0.12, 12]} />
        <Mat color={DARK} />
      </mesh>
    </group>
  );
}

function RackUnit({ w, d, h, color }) {
  const post = Math.max(0.06, Math.min(w, d) * 0.06);
  const shelfT = 0.06;
  const n = rackShelfCount(h);
  const base = Math.min(0.3, h * 0.1);
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  const shelves = [];
  for (let i = 0; i < n; i++) {
    const y = i === n - 1 ? h - shelfT / 2 : base + ((h - base - shelfT) * i) / (n - 1);
    shelves.push(y);
  }
  return (
    <group>
      {corners.map(([sx, sz], i) => (
        <Part key={i} pos={[sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2)]} size={[post, h, post]} color={DARK} />
      ))}
      {shelves.map((y, i) => (
        <Part key={i} pos={[0, y, 0]} size={[w, shelfT, d]} color={color} />
      ))}
    </group>
  );
}

function BenchUnit({ w, d, h, color }) {
  const topT = Math.min(0.12, h * 0.08);
  const leg = Math.max(0.06, Math.min(w, d) * 0.05);
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return (
    <group>
      {corners.map(([sx, sz], i) => (
        <Part key={i} pos={[sx * (w / 2 - leg / 2 - 0.03), (h - topT) / 2, sz * (d / 2 - leg / 2 - 0.03)]} size={[leg, h - topT, leg]} color={DARK} />
      ))}
      <Part pos={[0, h * 0.25, 0]} size={[w * 0.92, 0.05, d * 0.9]} color={DARK} />
      <Part pos={[0, h - topT / 2, 0]} size={[w, topT, d]} color={color} edges />
    </group>
  );
}

// Lights, fans and cameras. The viewer mounts these at ceiling height.
function OverheadUnit({ w, d, h, color }) {
  return (
    <group>
      <Part pos={[0, h / 2, 0]} size={[w, h, d]} color={DARK} edges />
      <mesh position={[0, 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.9, d * 0.9]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} side={2} />
      </mesh>
    </group>
  );
}

// Conveyors, fillers and other long process lines: deck on legs with rails.
function LineUnit({ w, d, h, color }) {
  const deckT = Math.min(0.15, h * 0.1);
  const leg = Math.max(0.06, Math.min(w, d) * 0.08);
  const long = w >= d;
  const railH = Math.min(0.25, h * 0.15);
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return (
    <group>
      {corners.map(([sx, sz], i) => (
        <Part key={i} pos={[sx * (w / 2 - leg / 2), (h - deckT) / 2, sz * (d / 2 - leg / 2)]} size={[leg, h - deckT, leg]} color={DARK} />
      ))}
      <Part pos={[0, h - deckT / 2, 0]} size={[w, deckT, d]} color={color} edges />
      {[1, -1].map(s => (
        <Part
          key={s}
          pos={long ? [0, h + railH / 2, s * (d / 2 - 0.02)] : [s * (w / 2 - 0.02), h + railH / 2, 0]}
          size={long ? [w, railH, 0.04] : [0.04, railH, d]}
          color={DARK}
        />
      ))}
    </group>
  );
}

const GENERATORS = {
  box: BoxUnit, tank: TankUnit, rack: RackUnit, bench: BenchUnit, overhead: OverheadUnit, line: LineUnit,
};

export default function EquipmentModel({ eq, w, d, h }) {
  const Shape = GENERATORS[resolveShape(eq)] || BoxUnit;
  return <Shape w={w} d={d} h={h} color={categoryColor(eq?.category)} />;
}
