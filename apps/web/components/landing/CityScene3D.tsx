"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * WasteWise AI — 3D City Scene (React Three Fiber)
 * Source of truth: design_guide.md §5
 *
 * Stylized low-poly city block / terrain in warm earth-green & amber palette.
 * Visual micro-narrative: Amber incident points pulse, vehicle glyph glides
 * along a path and collects them.
 */

// Colors per design_guide.md §2
const PALETTE = {
  canvasBg: "#F6F3EC",
  buildingPrimary: "#1F5E3F",
  buildingMuted: "#346E52",
  buildingLight: "#7AA88E",
  ground: "#E2DCD2",
  groundGrid: "#D4CCBF",
  incidentAmber: "#E86A33",
  incidentPulse: "#F7A361",
  vehicleAqua: "#2B8C86",
  vehicleLight: "#5CC2BC",
  roadDark: "#B8B0A2",
};

// Low-poly City Block Mesh
function CityBlock() {
  const groupRef = useRef<THREE.Group>(null);

  // Generate buildings layout deterministically
  const buildings = useMemo(() => {
    const list: Array<{
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      color: string;
    }> = [];
    const colors = [
      PALETTE.buildingPrimary,
      PALETTE.buildingMuted,
      PALETTE.buildingLight,
      "#2E533F",
      "#43735B",
    ];

    // Left side & background denser (leaving right side calm for the auth card)
    for (let x = -8; x <= 3; x += 2.2) {
      for (let z = -8; z <= 6; z += 2.2) {
        // Less density in the right-foreground where login card floats
        if (x > 1 && z > 0) continue;

        // Skip some slots for plazas/roads
        if (Math.sin(x * 1.5 + z * 0.7) > 0.4) continue;

        const w = 1.1 + Math.sin(x * 3.1) * 0.3;
        const d = 1.1 + Math.cos(z * 2.7) * 0.3;
        const h = 1.0 + Math.abs(Math.sin(x * 0.8 + z * 1.2)) * 3.2;
        const color = colors[Math.abs(Math.floor(x * 3 + z * 7)) % colors.length];

        list.push({ x, z, w, d, h, color });
      }
    }
    return list;
  }, []);

  return (
    <group ref={groupRef}>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={0.9} />
      </mesh>

      {/* Grid line accent */}
      <gridHelper
        args={[30, 30, PALETTE.groundGrid, PALETTE.groundGrid]}
        position={[0, 0.01, 0]}
      />

      {/* Buildings */}
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial
            color={b.color}
            roughness={0.6}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

// Waste Incidents & Autonomous Collection Vehicle Glyph
function WasteNarrative() {
  const vehicleRef = useRef<THREE.Group>(null);
  const incidentRefs = useRef<Array<THREE.Mesh | null>>([]);

  // Fixed incident coordinates on the map
  const incidents = useMemo(
    () => [
      { id: 1, pos: new THREE.Vector3(-4.5, 0.3, -2.5) },
      { id: 2, pos: new THREE.Vector3(-2.0, 0.3, 2.0) },
      { id: 3, pos: new THREE.Vector3(-5.0, 0.3, 3.5) },
    ],
    []
  );

  // Closed loop Bezier-like waypoint sequence
  const waypoints = useMemo(
    () => [
      new THREE.Vector3(-6, 0.3, -5),
      new THREE.Vector3(-4.5, 0.3, -2.5), // Stop 1
      new THREE.Vector3(-1, 0.3, 0),
      new THREE.Vector3(-2.0, 0.3, 2.0),  // Stop 2
      new THREE.Vector3(-3.5, 0.3, 4.0),
      new THREE.Vector3(-5.0, 0.3, 3.5),  // Stop 3
      new THREE.Vector3(-7, 0.3, 0),
    ],
    []
  );

  const curve = useMemo(() => new THREE.CatmullRomCurve3(waypoints, true), [waypoints]);

  useFrame(({ clock }) => {
    const t = (clock.getElapsedTime() * 0.08) % 1; // 12.5s loop

    // Move vehicle along curve
    if (vehicleRef.current) {
      const position = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      vehicleRef.current.position.copy(position);

      // Orient vehicle forward
      const lookTarget = position.clone().add(tangent);
      vehicleRef.current.lookAt(lookTarget);
    }

    // Pulse incidents & fade as vehicle approaches
    incidents.forEach((inc, idx) => {
      const mesh = incidentRefs.current[idx];
      if (mesh && vehicleRef.current) {
        const dist = vehicleRef.current.position.distanceTo(inc.pos);
        const pulse = 1 + 0.3 * Math.sin(clock.getElapsedTime() * 4 + idx);
        mesh.scale.set(pulse, pulse, pulse);

        // Turn green / fade when collected
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (dist < 1.2) {
          mat.color.set(PALETTE.vehicleLight);
          mat.emissive.set(PALETTE.vehicleAqua);
        } else {
          mat.color.set(PALETTE.incidentAmber);
          mat.emissive.set(PALETTE.incidentPulse);
        }
      }
    });
  });

  return (
    <group>
      {/* Incidents (Glowing Amber Pulses) */}
      {incidents.map((inc, i) => (
        <mesh
          key={inc.id}
          ref={(el) => {
            incidentRefs.current[i] = el;
          }}
          position={inc.pos}
        >
          <cylinderGeometry args={[0.25, 0.25, 0.15, 12]} />
          <meshStandardMaterial
            color={PALETTE.incidentAmber}
            emissive={PALETTE.incidentPulse}
            emissiveIntensity={0.6}
            roughness={0.3}
          />
        </mesh>
      ))}

      {/* Vehicle Glyph (Aqua municipal collector) */}
      <group ref={vehicleRef}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.6, 0.35, 1.0]} />
          <meshStandardMaterial color={PALETTE.vehicleAqua} roughness={0.4} />
        </mesh>
        {/* Cab */}
        <mesh position={[0, 0.45, 0.2]}>
          <boxGeometry args={[0.55, 0.25, 0.4]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.2} />
        </mesh>
        {/* Signal beacon */}
        <mesh position={[0, 0.62, 0.2]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color={PALETTE.incidentAmber}
            emissive={PALETTE.incidentAmber}
            emissiveIntensity={1.0}
          />
        </mesh>
      </group>
    </group>
  );
}

// Scene Root with gentle orbit & subtle mouse tilt
function SceneContent() {
  const sceneRef = useRef<THREE.Group>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalized mouse coords (-1 to 1)
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMouse({ x, y });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useFrame(({ clock }) => {
    if (sceneRef.current) {
      // Ambient slow rotation (~25s per revolution)
      const baseRotation = clock.getElapsedTime() * 0.04;
      // Parallax capped to ~5° (0.08 rad) per design_guide.md §5
      const targetTiltX = mouse.y * 0.05;
      const targetTiltY = baseRotation + mouse.x * 0.07;

      sceneRef.current.rotation.x = THREE.MathUtils.lerp(
        sceneRef.current.rotation.x,
        0.5 + targetTiltX,
        0.05
      );
      sceneRef.current.rotation.y = THREE.MathUtils.lerp(
        sceneRef.current.rotation.y,
        targetTiltY,
        0.05
      );
    }
  });

  return (
    <group ref={sceneRef} position={[0, -1, 0]}>
      <CityBlock />
      <WasteNarrative />
    </group>
  );
}

export default function CityScene3D() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      <Canvas
        camera={{ position: [0, 11, 14], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        {/* Soft lighting per design_guide.md §2 (green/amber canopy light) */}
        <ambientLight intensity={1.1} color="#FFFDF7" />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1.4}
          color="#FFF8E7"
          castShadow
        />
        <directionalLight
          position={[-10, 8, -5]}
          intensity={0.6}
          color="#DCEBE0"
        />

        <SceneContent />

        {/* Soft fog blending into warm off-white canvas */}
        <fog attach="fog" args={[PALETTE.canvasBg, 15, 30]} />
      </Canvas>
    </div>
  );
}
