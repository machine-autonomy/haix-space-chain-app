// src/components/Minimap.tsx
import React, { useEffect, useRef } from "react";
import { mapLayout, CELL_SIZE, START_GRID, GOAL_GRID } from "./MazeLevel";

interface MinimapProps {
  position: { x: number; z: number };
  rotation: number;
  history: { x: number; z: number }[];
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

export const drawMinimap = (
  canvas: HTMLCanvasElement, 
  position: { x: number; z: number }, 
  rotation: number, 
  history: { x: number; z: number }[]
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const SCALE = 60; // High resolution for VLM capture

  // Clear
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Maze Walls
  ctx.fillStyle = "#444";
  mapLayout.forEach((row, z) => {
    row.forEach((cell, x) => {
      if (cell === 1) {
        ctx.fillRect(x * SCALE, z * SCALE, SCALE, SCALE);
      }
    });
  });

  // Draw Start (Green)
  ctx.fillStyle = "rgba(76, 175, 80, 0.5)";
  ctx.fillRect(START_GRID.x * SCALE, START_GRID.z * SCALE, SCALE, SCALE);

  // Draw Goal (Red)
  ctx.fillStyle = "rgba(54, 57, 244, 0.5)";
  ctx.fillRect(GOAL_GRID.x * SCALE, GOAL_GRID.z * SCALE, SCALE, SCALE);

  // Draw Player Arrow
  const px = (position.x / CELL_SIZE) * SCALE + SCALE / 2;
  const pz = (position.z / CELL_SIZE) * SCALE + SCALE / 2;

  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-rotation); // 3D rotation to 2D map rotation
  
  // Arrow graphic
  ctx.fillStyle = "red";
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.lineTo(18, 18);
  ctx.lineTo(-18, 18);
  ctx.fill();
  ctx.restore();
};

export const Minimap: React.FC<MinimapProps> = ({ position, rotation, history, canvasRef }) => {
  const localRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef || localRef;
  const SCALE = 60; // High resolution for VLM capture
  const DISPLAY_SCALE = 20; // Visual size on screen

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    drawMinimap(canvas, position, rotation, history);
  }, [position, rotation, history]);

  return (
    <div style={{ border: "2px solid #555", display: "inline-block" }}>
      <canvas 
        ref={ref} 
        width={mapLayout[0].length * SCALE} 
        height={mapLayout.length * SCALE}
        style={{ width: `${mapLayout[0].length * DISPLAY_SCALE}px`, height: `${mapLayout.length * DISPLAY_SCALE}px` }}
      />
    </div>
  );
};
