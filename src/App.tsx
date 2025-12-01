// src/App.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { MazeLevel, mapLayout, CELL_SIZE, START_GRID } from './components/MazeLevel';
import { Minimap, drawMinimap } from './components/Minimap';
import { analyzeImage, analyzeAscii, generateAsciiMap, createTiledImage, AgentAction, SYSTEM_PROMPT, SYSTEM_PROMPT_ASCII } from './services/vlmService';

// --- Player & Camera Controller Component ---
const PlayerController = ({ 
  isAgentActive, 
  onUpdateState, 
  onCaptureRequest,
  triggerActionRef,
  simulationRef
}: { 
  isAgentActive: boolean, 
  onUpdateState: (pos: {x:number, z:number}, rot: number) => void,
  onCaptureRequest: React.MutableRefObject<(() => void) | null>,
  triggerActionRef?: React.MutableRefObject<((action: AgentAction) => void) | null>,
  simulationRef?: React.MutableRefObject<(() => Record<string, { image: string, pos: {x: number, z: number}, rot: number }>) | null>
}) => {
  const { camera, gl, scene } = useThree();
  const pos = useRef(new THREE.Vector3(START_GRID.x * CELL_SIZE, 1.5, START_GRID.z * CELL_SIZE)); // Start pos
  const rot = useRef(0); // Y-axis rotation
  const targetAction = useRef<AgentAction | null>(null);
  const actionQueue = useRef<AgentAction[]>([]);
  const movingState = useRef({ progress: 0, startPos: new THREE.Vector3(), startRot: 0 });

  // Keyboard state
  const keys = useRef<{ [key: string]: boolean }>({});

  // Simple Collision Detection
  const checkCollision = (newPos: THREE.Vector3) => {
    const PLAYER_RADIUS = 0.4; // Player size radius
    
    // Check nearby grids (3x3 around the player)
    const gridX = Math.round(newPos.x / CELL_SIZE);
    const gridZ = Math.round(newPos.z / CELL_SIZE);

    for (let z = gridZ - 1; z <= gridZ + 1; z++) {
      for (let x = gridX - 1; x <= gridX + 1; x++) {
        // Check if this grid cell is a wall
        if (mapLayout[z] && mapLayout[z][x] === 1) {
          // Wall boundaries (AABB)
          const wallMinX = x * CELL_SIZE - CELL_SIZE / 2;
          const wallMaxX = x * CELL_SIZE + CELL_SIZE / 2;
          const wallMinZ = z * CELL_SIZE - CELL_SIZE / 2;
          const wallMaxZ = z * CELL_SIZE + CELL_SIZE / 2;

          // Find closest point on the wall box to the player circle center
          const closestX = Math.max(wallMinX, Math.min(newPos.x, wallMaxX));
          const closestZ = Math.max(wallMinZ, Math.min(newPos.z, wallMaxZ));

          // Calculate distance from closest point to player center
          const dx = newPos.x - closestX;
          const dz = newPos.z - closestZ;
          const distanceSquared = dx * dx + dz * dz;

          // If distance is less than radius, we are colliding
          if (distanceSquared < PLAYER_RADIUS * PLAYER_RADIUS) {
            return true;
          }
        }
      }
    }
    return false;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    
    // Assign capture function to ref so parent can trigger it
    onCaptureRequest.current = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/jpeg', 0.8);
    };

    // Assign simulation function
    if (simulationRef) {
      simulationRef.current = () => {
        const originalPos = pos.current.clone();
        const originalRot = rot.current;
        const results: Record<string, { image: string, pos: {x: number, z: number}, rot: number }> = {};

        const actions: AgentAction[] = ['move_forward', 'turn_left', 'turn_right'];

        actions.forEach(action => {
          // Calculate target state
          let simPos = originalPos.clone();
          let simRot = originalRot;

          if (action === 'move_forward') {
             const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), originalRot);
             const targetPos = originalPos.clone().add(forward.multiplyScalar(CELL_SIZE));
             if (!checkCollision(targetPos)) {
               simPos.copy(targetPos);
             }
          } else if (action === 'turn_left') {
             simRot += Math.PI / 2;
          } else if (action === 'turn_right') {
             simRot -= Math.PI / 2;
          }

          // Apply to Camera
          camera.position.copy(simPos);
          camera.rotation.set(0, simRot, 0);
          camera.updateMatrixWorld();
          
          // Render
          gl.render(scene, camera);
          results[action] = {
            image: gl.domElement.toDataURL('image/jpeg', 0.8),
            pos: { x: simPos.x, z: simPos.z },
            rot: simRot
          };
        });

        // Restore
        camera.position.copy(originalPos);
        camera.rotation.set(0, originalRot, 0);
        camera.updateMatrixWorld();
        gl.render(scene, camera); // Render back original frame

        return results;
      };
    }

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [gl, scene, camera, onCaptureRequest, simulationRef]);

  // Expose action API for Agent
  useEffect(() => {
    console.log("PlayerController: Effect running. isAgentActive =", isAgentActive);
    if (isAgentActive) {
      console.log("PlayerController: Setting triggerAgentAction");
      const handler = (action: AgentAction) => {
        console.log("PlayerController: triggerAgentAction called with", action);
        actionQueue.current.push(action);
      };
      
      (window as any).triggerAgentAction = handler;
      if (triggerActionRef) triggerActionRef.current = handler;
    } else {
      console.log("PlayerController: isAgentActive is false, not setting trigger");
    }
    // return () => { console.log("PlayerController: Cleanup"); (window as any).triggerAgentAction = null; };
  }, [isAgentActive, triggerActionRef]);

  useFrame((_, delta) => {
    const speed = 3.0 * delta;
    const rotSpeed = 2.0 * delta;
    
    let nextPos = pos.current.clone();

    if (isAgentActive && !targetAction.current && actionQueue.current.length > 0) {
      const nextAction = actionQueue.current.shift();
      if (nextAction) {
        targetAction.current = nextAction;
        movingState.current.progress = 0;
        movingState.current.startPos.copy(pos.current);
        movingState.current.startRot = rot.current;
      }
    }

    if (isAgentActive && targetAction.current) {
      // --- AI Movement (Discrete steps) ---
      const t = movingState.current.progress + delta * 2; // Animation speed
      movingState.current.progress = Math.min(t, 1);
      
      if (targetAction.current === 'move_forward') {
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), movingState.current.startRot);
        nextPos.copy(movingState.current.startPos).add(forward.multiplyScalar(CELL_SIZE * movingState.current.progress));
      } else if (targetAction.current === 'turn_left') {
        rot.current = movingState.current.startRot + (Math.PI / 2) * movingState.current.progress;
      } else if (targetAction.current === 'turn_right') {
        rot.current = movingState.current.startRot - (Math.PI / 2) * movingState.current.progress;
      }

      // Finish Action
      if (movingState.current.progress >= 1) {
        // Snap to grid/angle
        if (targetAction.current === 'move_forward' && !checkCollision(nextPos)) {
          pos.current.copy(nextPos); 
        } else if (targetAction.current !== 'move_forward') {
          // Normalize rotation
        }
        targetAction.current = null;
        (window as any).agentActionFinished?.();
      }

    } else if (!isAgentActive) {
      // --- Manual Movement (Continuous) ---
      if (keys.current['KeyW']) {
        nextPos.x -= Math.sin(rot.current) * speed;
        nextPos.z -= Math.cos(rot.current) * speed;
      }
      if (keys.current['KeyS']) {
        nextPos.x += Math.sin(rot.current) * speed;
        nextPos.z += Math.cos(rot.current) * speed;
      }
      if (keys.current['KeyA']) rot.current += rotSpeed;
      if (keys.current['KeyD']) rot.current -= rotSpeed;
      
      if (!checkCollision(nextPos)) {
        pos.current.copy(nextPos);
      }
    }

    // Sync Camera
    camera.position.copy(pos.current);
    camera.rotation.set(0, rot.current, 0);
    
    // Update Parent State for Minimap
    onUpdateState({ x: pos.current.x, z: pos.current.z }, rot.current);
  });

  return null;
};

// --- Helper: Format ASCII History ---
const formatAsciiHistory = (history: string[]) => {
  return history.map((map, index) => {
    const stepLabel = (index === history.length - 1) 
      ? `${index + 1} step (latest):` 
      : `${index + 1} step:`;
    return `${stepLabel}\n${map}`;
  }).join("\n\n");
};

// --- Main App Component ---
function App() {
  const [agentActive, setAgentActive] = useState(false);
  const triggerActionRef = useRef<any>(null); // Ref for triggering agent actions
  const [manualMode, setManualMode] = useState(false); // New: Manual Test Mode
  const [asciiMode, setAsciiMode] = useState(false); // New: ASCII Mode
  const [currentImage, setCurrentImage] = useState<string | null>(null); // New: Captured Image
  const [tiledImage, setTiledImage] = useState<string | null>(null); // New: Tiled Image for VLM
  const [currentAsciiMap, setCurrentAsciiMap] = useState<string | null>(null); // New: Current ASCII Map
  const [asciiHistory, setAsciiHistory] = useState<string[]>([]); // New: ASCII History
  const [manualResponse, setManualResponse] = useState(""); // New: User Input JSON
  const [isWaitingForManualInput, setIsWaitingForManualInput] = useState(false); // New: Waiting state

  const [pos, setPos] = useState({ x: 0, z: 0 });
  const [rot, setRot] = useState(0);
  const [history, setHistory] = useState<{ x: number, z: number }[]>([]);
  const [logs, setLogs] = useState<{role: string, text: string, image?: string}[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true); // New: Toggle Map

  const captureRef = useRef<(() => string) | null>(null);
  const simulationRef = useRef<(() => Record<string, { image: string, pos: {x: number, z: number}, rot: number }>) | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null); // New: Ref for auto-scrolling
  const [simulatedImages, setSimulatedImages] = useState<Record<string, string> | null>(null); // New: Store simulated views

  // Update history periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(prev => [...prev, pos]);
    }, 500);
    return () => clearInterval(interval);
  }, [pos]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isThinking]);

  // Agent Loop
  useEffect(() => {
    if (!agentActive) return;

    const runAgentCycle = async () => {
      if (isThinking || isWaitingForManualInput) return;
      
      let result: { thought: string, action: AgentAction };
      let capturedImage = null;
      let generatedMap = null;

      if (asciiMode) {
        // --- ASCII Mode ---
        generatedMap = generateAsciiMap(pos, rot);
        
        // Update history
        const newHistory = [...asciiHistory, generatedMap];
        setAsciiHistory(newHistory);
        const promptContent = formatAsciiHistory(newHistory);
        
        setCurrentAsciiMap(promptContent); // Show full history in manual mode
        
        if (manualMode) {
           setIsWaitingForManualInput(true);
           addLog("System", "Waiting for manual ASCII input...");
           setIsThinking(false);
           return;
        }

        addLog("Agent", "Analyzing ASCII Map...");
        result = await analyzeAscii(promptContent);

      } else {
        // --- VLM Mode ---
        // 1. Capture Current View
        if (!captureRef.current) return;
        // Wait a bit for rendering to settle
        await new Promise(r => setTimeout(r, 500));
        
        const mainImageBase64 = captureRef.current(); 
        
        // Composite Minimap if visible
        let finalImageBase64 = mainImageBase64;
        if (showMinimap && minimapCanvasRef.current) {
          finalImageBase64 = await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) { resolve(mainImageBase64); return; }

              // Draw 3D scene
              ctx.drawImage(img, 0, 0);

              // Draw Minimap Overlay
              const mmCanvas = minimapCanvasRef.current!;
              const padding = 10;
              const margin = 20;
              
              const x = canvas.width - mmCanvas.width - margin - padding; 
              const y = canvas.height - mmCanvas.height - margin - padding;
              
              ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.fillRect(x - padding, y - padding, mmCanvas.width + padding * 2, mmCanvas.height + padding * 2);
              ctx.drawImage(mmCanvas, x, y);
              
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = mainImageBase64;
          });
        }
        capturedImage = finalImageBase64;

        // 2. Simulate Future Views
        let futureImages: Record<string, string> = {};
        if (simulationRef.current) {
          const rawSimulations = simulationRef.current();
          
          // Process each simulation to add minimap
          for (const [action, data] of Object.entries(rawSimulations) as [string, { image: string, pos: {x: number, z: number}, rot: number }][]) {
             const img = new Image();
             img.src = data.image;
             await new Promise(r => img.onload = r);
             
             const canvas = document.createElement('canvas');
             canvas.width = img.width;
             canvas.height = img.height;
             const ctx = canvas.getContext('2d');
             
             if (ctx) {
               // Draw 3D view
               ctx.drawImage(img, 0, 0);
               
               // Draw Minimap
               if (showMinimap) {
                 const mmCanvas = document.createElement('canvas');
                 const SCALE = 60;
                 mmCanvas.width = mapLayout[0].length * SCALE;
                 mmCanvas.height = mapLayout.length * SCALE;
                 
                 // Draw map with FUTURE position
                 drawMinimap(mmCanvas, data.pos, data.rot, history);
                 
                 const padding = 10;
                 const margin = 20;
                 
                 // Use full size to match current view
                 const mmWidth = mmCanvas.width;
                 const mmHeight = mmCanvas.height;
                 
                 const x = canvas.width - mmWidth - margin - padding;
                 const y = canvas.height - mmHeight - margin - padding;
                 
                 ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                 ctx.fillRect(x - padding, y - padding, mmWidth + padding * 2, mmHeight + padding * 2);
                 ctx.drawImage(mmCanvas, x, y, mmWidth, mmHeight);
               }
               
               futureImages[action] = canvas.toDataURL('image/jpeg', 0.8);
             } else {
               futureImages[action] = data.image;
             }
          }

          setSimulatedImages(futureImages);
        }

        // Create Tiled Image for VLM
        const tiled = await createTiledImage(capturedImage, futureImages);
        setTiledImage(tiled);

        if (manualMode) {
           setCurrentImage(capturedImage);
           setIsWaitingForManualInput(true);
           addLog("System", "Waiting for manual VLM input...");
           setIsThinking(false);
           return;
        }

        setIsThinking(true);
        addLog("Agent", "Analyzing vision...", tiled);
        result = await analyzeImage(tiled);
      }
      
      await executeAgentAction(result);
    };

    runAgentCycle();
    
    // return () => { (window as any).triggerAgentAction = null; }; // Removed incorrect cleanup
  }, [agentActive, isThinking, isWaitingForManualInput, manualMode, showMinimap, asciiMode, pos, rot]); // Added dependencies

  const executeAgentAction = async (result: { thought: string, action: AgentAction }) => {
    addLog("Space Chain", `Thought: ${result.thought}`);
    addLog("Action", `Executing: ${result.action}`);

    // 3. Act
    const trigger = triggerActionRef.current || (window as any).triggerAgentAction;

    if (trigger) {
      trigger(result.action);
      
      // Wait for action to finish
      await new Promise<void>(resolve => {
        (window as any).agentActionFinished = resolve;
      });
    } else {
      console.error("executeAgentAction: trigger is missing!");
      addLog("Error", "Internal Error: Agent controller not connected.");
    }

    setIsThinking(false);
    
    // Loop if still active (and not switched to manual waiting)
    if (agentActive && !manualMode) {
      // Trigger next cycle via effect dependency or recursive call?
      // Since we added dependencies to useEffect, setting isThinking=false should trigger it if agentActive is true.
      // However, the effect depends on isThinking. When isThinking becomes false, effect runs.
    }
  };

  const handleManualSubmit = () => {
    try {
      const result = JSON.parse(manualResponse);
      if (!result.action) throw new Error("No action in JSON");
      
      setManualResponse("");
      setCurrentImage(null);
      setIsWaitingForManualInput(false);
      setIsThinking(true); // Prevent loop from restarting immediately
      
      // Execute the manually provided action
      executeAgentAction(result);

    } catch (e) {
      alert("Invalid JSON format! Example: {\"thought\": \"...\", \"action\": \"move_forward\"}");
    }
  };

  const addLog = (role: string, text: string, image?: string) => {
    setLogs((prev: {role: string, text: string, image?: string}[]) => [...prev.slice(-100), { role, text, image }]);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#111', color: '#eee' }}>
      
      {/* Left: 3D View (Agent Vision) */}
      <div style={{ flex: 2, position: 'relative', borderRight: '1px solid #333' }}>
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '10px' }}>
          <h3>Agent Vision (1st Person)</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa' }}>
            {agentActive ? "Mode: AUTONOMOUS (VLM Controlled)" : "Mode: MANUAL (WASD to move)"}
          </p>
        </div>
        
        {/* Overlay Minimap */}
        {showMinimap && (
          <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', border: '1px solid #555' }}>
            <h4 style={{ margin: '0 0 5px 0', fontSize: '0.9rem', textAlign: 'center' }}>Space Memory</h4>
            <Minimap position={pos} rotation={rot} history={history} canvasRef={minimapCanvasRef} />
          </div>
        )}

        <Canvas shadows>
          <PerspectiveCamera makeDefault fov={120} near={0.1} far={100} />
          <Environment preset="city" />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          
          <MazeLevel />
          <PlayerController 
            isAgentActive={agentActive} 
            onUpdateState={(p, r) => { setPos(p); setRot(r); }} 
            onCaptureRequest={captureRef}
            triggerActionRef={triggerActionRef}
            simulationRef={simulationRef}
          />
        </Canvas>
      </div>

      {/* Right: Control & Space Graph */}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
        
        {/* Controls */}
        <div style={{ background: '#222', padding: '15px', borderRadius: '8px', flexShrink: 0 }}>
          <h2>Space Chain Lab</h2>
          <button 
            onClick={() => {
              setAgentActive(!agentActive);
              if (!agentActive) setAsciiHistory([]); // Clear history on start
            }}
            style={{ 
              width: '100%', padding: '15px', fontSize: '1.2rem', cursor: 'pointer',
              background: agentActive ? '#ff4444' : '#00bcd4', color: 'white', border: 'none', borderRadius: '4px'
            }}
          >
            {agentActive ? "STOP AGENT" : "START AGENT (VLM)"}
          </button>
          <p style={{fontSize: '0.9rem', marginTop: '10px'}}>
            {!agentActive ? "Keyboard: W,A,S,D to move." : "Agent is observing and thinking..."}
          </p>
          
          {/* Manual Mode Toggle */}
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input 
              type="checkbox" 
              id="manualMode" 
              checked={manualMode} 
              onChange={(e) => setManualMode(e.target.checked)} 
            />
            <label htmlFor="manualMode" style={{ cursor: 'pointer' }}>Manual Test Mode (Copy/Paste)</label>
          </div>

          {/* Minimap Toggle */}
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input 
              type="checkbox" 
              id="showMinimap" 
              checked={showMinimap} 
              onChange={(e) => setShowMinimap(e.target.checked)} 
            />
            <label htmlFor="showMinimap" style={{ cursor: 'pointer' }}>Show Minimap Overlay</label>
          </div>

          {/* ASCII Mode Toggle */}
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input 
              type="checkbox" 
              id="asciiMode" 
              checked={asciiMode} 
              onChange={(e) => setAsciiMode(e.target.checked)} 
            />
            <label htmlFor="asciiMode" style={{ cursor: 'pointer' }}>ASCII Map Mode (Rogue-like)</label>
          </div>
        </div>

        {/* Manual Test Interface */}
        {manualMode && isWaitingForManualInput && (
          <div style={{ background: '#333', padding: '15px', borderRadius: '8px', border: '1px solid #00bcd4', flexShrink: 0 }}>
            <h4>Manual {asciiMode ? "ASCII" : "VLM"} Test</h4>
            
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '0.8rem', color: '#aaa' }}>1. Copy {asciiMode ? "Map & Prompt" : "Image & Prompt"}</p>
              
              {asciiMode ? (
                <div style={{ marginBottom: '5px' }}>
                  <textarea 
                    readOnly
                    value={currentAsciiMap || ""}
                    style={{ width: '100%', height: '150px', background: '#000', color: '#0f0', fontFamily: 'monospace', border: '1px solid #555', fontSize: '12px' }}
                  />
                </div>
              ) : (
                <div>
                  {/* Tiled Image Display */}
                  {tiledImage ? (
                    <img src={tiledImage} alt="Agent Vision Tiled" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', border: '1px solid #555' }} />
                  ) : (
                    <img src={currentImage} alt="Agent Vision" style={{ width: '100%', maxHeight: '150px', objectFit: 'contain', border: '1px solid #555' }} />
                  )}
                  
                  {/* Simulated Views (Optional: Keep for debugging or remove if tiled is enough) */}
                  {simulatedImages && (
                    <div style={{ marginTop: '10px' }}>
                      <p style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '5px' }}>Simulated Futures (Individual):</p>
                      <div style={{ display: 'flex', gap: '5px', overflowX: 'auto' }}>
                        {['move_forward', 'turn_left', 'turn_right'].map(action => (
                          <div key={action} style={{ minWidth: '80px', textAlign: 'center' }}>
                            <img 
                              src={simulatedImages[action]} 
                              alt={action} 
                              style={{ width: '80px', height: '50px', objectFit: 'cover', border: '1px solid #555' }} 
                            />
                            <p style={{ fontSize: '0.6rem', color: '#888', margin: '2px 0 0 0' }}>{action.replace('move_', '').replace('turn_', '')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                <button 
                  onClick={() => {
                    const textToCopy = asciiMode 
                      ? `${SYSTEM_PROMPT_ASCII}\n\n${currentAsciiMap}`
                      : SYSTEM_PROMPT;
                    navigator.clipboard.writeText(textToCopy);
                  }} 
                  style={{ flex: 1 }}
                >
                  Copy {asciiMode ? "Full Prompt (History)" : "System Prompt"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '0.8rem', color: '#aaa' }}>2. Paste Response (JSON)</p>
              <textarea 
                value={manualResponse}
                onChange={(e) => setManualResponse(e.target.value)}
                placeholder='{"thought": "...", "action": "move_forward"}'
                style={{ width: '100%', height: '80px', background: '#111', color: '#eee', border: '1px solid #555' }}
              />
            </div>

            <button 
              onClick={handleManualSubmit}
              style={{ width: '100%', padding: '10px', background: '#00bcd4', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Inject Action
            </button>
          </div>
        )}

        {/* Minimap (Space Graph Visualization) - REMOVED from here */}
        
        {/* Logs / Thinking Process */}
        <div ref={logContainerRef} style={{ flex: 1, background: '#000', padding: '15px', borderRadius: '8px', overflowY: 'auto', fontFamily: 'monospace', minHeight: 0 }}>
          <h4>Thinking Log</h4>
          {logs.map((log, i) => (
            <div key={i} style={{ marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
              <span style={{ color: log.role === 'Agent' ? '#00bcd4' : '#ff9800', fontWeight: 'bold' }}>
                [{log.role}]
              </span><br/>
              {log.text}
              {log.image && (
                <div style={{ marginTop: '5px' }}>
                  <img src={log.image} alt="Vision Context" style={{ width: '100%', borderRadius: '4px', border: '1px solid #333' }} />
                </div>
              )}
            </div>
          ))}
          {isThinking && <div style={{color: '#888'}}>Processing...</div>}
        </div>

      </div>
    </div>
  );
}

export default App;
