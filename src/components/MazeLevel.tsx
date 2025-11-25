// src/components/MazeLevel.tsx
import React from 'react';
import * as THREE from 'three';
import { Box, Plane } from '@react-three/drei';

// 1 = Wall, 0 = Path
export const mapLayout = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

export const CELL_SIZE = 2;

export const START_GRID = { x: 6, z: 5 };
export const GOAL_GRID = { x: 1, z: 1 };

export const MazeLevel: React.FC = () => {
  return (
    <group>
      {/* Floor */}
      <Plane 
        args={[20, 20]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[7, -0.5, 7]} 
      >
        <meshStandardMaterial color="#333" />
      </Plane>

      {/* Start Marker (Green Tile) */}
      <Plane 
        args={[CELL_SIZE * 0.8, CELL_SIZE * 0.8]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[START_GRID.x * CELL_SIZE, -0.49, START_GRID.z * CELL_SIZE]} 
      >
        <meshStandardMaterial color="#4caf50" />
      </Plane>

      {/* Goal Marker (Red Area & Floating Box) */}
      <Plane 
        args={[CELL_SIZE * 0.8, CELL_SIZE * 0.8]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[GOAL_GRID.x * CELL_SIZE, -0.49, GOAL_GRID.z * CELL_SIZE]} 
      >
        <meshStandardMaterial color="#363cf4ff" />
      </Plane>
      <Box
        position={[GOAL_GRID.x * CELL_SIZE, 1, GOAL_GRID.z * CELL_SIZE]}
        args={[1, 1, 1]}
      >
        <meshStandardMaterial color="#ffeb3b" emissive="#ffeb3b" emissiveIntensity={0.5} />
      </Box>

      {/* Ceiling (Visual aesthetic for enclosed feeling) */}
      <Plane 
        args={[20, 20]} 
        rotation={[Math.PI / 2, 0, 0]} 
        position={[7, 2.5, 7]} 
      >
        <meshStandardMaterial color="#222" />
      </Plane>

      {/* Walls */}
      {mapLayout.map((row, z) =>
        row.map((cell, x) => {
          if (cell === 1) {
            return (
              <Box
                key={`${x}-${z}`}
                position={[x * CELL_SIZE, 1, z * CELL_SIZE]}
                args={[CELL_SIZE, 3, CELL_SIZE]}
              >
                <meshStandardMaterial color="#00bcd4" roughness={0.2} side={THREE.DoubleSide} />
              </Box>
            );
          }
          return null;
        })
      )}
    </group>
  );
};
