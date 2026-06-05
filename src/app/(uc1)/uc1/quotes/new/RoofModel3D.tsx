"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

type Pt = [number, number];

// Build a simple but recognisable 3D house: extruded walls from the roof
// footprint up to eave height, then a hip/pyramid roof rising to an apex.
function RoofMesh({ outline, W, H, mpp, avgPitch, storeys }: { outline: Pt[]; W: number; H: number; mpp: number; avgPitch: number; storeys: number }) {
  const { walls, roof, span } = useMemo(() => {
    // % image coords → metres, centred on the centroid. Use X (east) / Z (south).
    const pts = outline.map(([x, y]) => [(x / 100) * W * mpp, (y / 100) * H * mpp] as Pt);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const local = pts.map(([x, z]) => [x - cx, z - cz] as Pt);

    const xs = local.map((p) => p[0]);
    const zs = local.map((p) => p[1]);
    const bbox = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) || 10;
    const eave = 2.7 * Math.max(1, storeys);
    const halfMin = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
    const rise = Math.max(0.6, halfMin * Math.tan((avgPitch * Math.PI) / 180));
    const apex: [number, number, number] = [0, eave + rise, 0];

    // Walls — vertical quads around the perimeter.
    const wallPos: number[] = [];
    for (let i = 0; i < local.length; i++) {
      const [ax, az] = local[i];
      const [bx, bz] = local[(i + 1) % local.length];
      wallPos.push(ax, 0, az, bx, 0, bz, bx, eave, bz);
      wallPos.push(ax, 0, az, bx, eave, bz, ax, eave, az);
    }
    const walls = new THREE.BufferGeometry();
    walls.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
    walls.computeVertexNormals();

    // Roof — triangle fan from each eave edge up to the apex.
    const roofPos: number[] = [];
    for (let i = 0; i < local.length; i++) {
      const [ax, az] = local[i];
      const [bx, bz] = local[(i + 1) % local.length];
      roofPos.push(ax, eave, az, bx, eave, bz, apex[0], apex[1], apex[2]);
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute("position", new THREE.Float32BufferAttribute(roofPos, 3));
    roof.computeVertexNormals();

    return { walls, roof, span: bbox };
  }, [outline, W, H, mpp, avgPitch, storeys]);

  return (
    <>
      <mesh geometry={walls}><meshStandardMaterial color="#d9d2c7" side={THREE.DoubleSide} /></mesh>
      <mesh geometry={roof}><meshStandardMaterial color="#dc9f82" side={THREE.DoubleSide} /></mesh>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[span * 3, span * 3]} />
        <meshStandardMaterial color="#3a4a3f" />
      </mesh>
    </>
  );
}

export default function RoofModel3D({ outline, W, H, mpp, avgPitch, storeys = 1 }: { outline: Pt[]; W: number; H: number; mpp: number; avgPitch: number; storeys?: number }) {
  if (outline.length < 3) return <div className="text-neutral-400 text-sm p-8">No roof outline to model.</div>;
  const span = 16;
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [span, span * 0.9, span], fov: 45 }} shadows>
        <ambientLight intensity={0.7} />
        <directionalLight position={[20, 30, 10]} intensity={1.1} />
        <RoofMesh outline={outline} W={W} H={H} mpp={mpp} avgPitch={avgPitch} storeys={storeys} />
        <OrbitControls enablePan enableZoom autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}
