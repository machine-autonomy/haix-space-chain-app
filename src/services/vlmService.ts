import { mapLayout, CELL_SIZE, START_GRID, GOAL_GRID } from '../components/MazeLevel';

// Azure OpenAI Configuration loaded from .env
const DEPLOYMENT_NAME = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT_NAME;
const API_VERSION = import.meta.env.VITE_AZURE_OPENAI_API_VERSION;
const API_KEY = import.meta.env.VITE_AZURE_OPENAI_API_KEY;

// Use relative path to go through Vite proxy

const VLM_API_URL = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT === `/v1/chat/completions` ? `/v1/chat/completions` : `/openai/deployments/${DEPLOYMENT_NAME}/chat/completions?api-version=${API_VERSION}`;

export type AgentAction = "move_forward" | "turn_left" | "turn_right" | "stop";

interface VLMResponse {
  thought: string;
  action: AgentAction;
}

export const SYSTEM_PROMPT = `
You are a 3D Exploration Agent navigating a maze.
The goal is to reach the designated target area.

# INPUT IMAGE FORMAT
You will receive a single image containing four views arranged in a 2×2 grid:
Top-Left: CURRENT VIEW
Top-Right: Simulation if you MOVE FORWARD
Bottom-Left: Simulation if you TURN LEFT
Bottom-Right: Simulation if you TURN RIGHT
Use these simulated future views to avoid collisions and dead ends.

# VISUAL CUES
START POINT: Green floor tile
GOAL POINT: White floor tile + floating yellow box
WALLS: Cyan blocks
FLOOR: Dark gray

# MINIMAP RULES (MOST IMPORTANT)
The bottom-right of each 3D view contains a minimap:
Grey = Wall
Black = Open path
Red Arrow = Your position & facing direction
Green = Start
Blue = Goal
North is always up

# NEW CRITICAL RULES — MUST FOLLOW
1. The minimap ALWAYS overrides the 3D view.
If the 3D view looks open but the minimap shows a wall → treat it as a wall.
If the 3D view looks blocked but the minimap shows a path → treat it as open.

2. NEVER move forward if the minimap shows a wall directly ahead.
Even if the forward simulation looks visually unclear → collision → forbidden.

3. Turning is mandatory when:
Forward cell is a wall
Forward leads to a dead end
There is a turn required to follow the only viable path

4. Turning LEFT or RIGHT must be chosen based on minimap connectivity.
When forward is blocked:
Prefer the direction that leads to a black/open tile
Avoid grey tiles (walls)
Avoid short dead-end corridors unless forced

5. Use BOTH:
3D simulation → for visibility
Minimap → for structure (true geometry)
If minimap and 3D disagree → always trust minimap.

# GOAL-SEEKING RULES
If goal tile becomes visible (white + yellow box) → move toward it
If minimap shows the route toward the goal, follow that direction
Avoid loops, backtracking, and dead ends

# OUTPUT FORMAT
Output ONLY JSON:
{"thought": "reasoning...", "action": "move_forward" | "turn_left" | "turn_right" | "stop"}

# EXAMPLE OF CORRECT REASONING
If the forward tile is grey on minimap → forward is forbidden
If left tile is black and right tile grey → choose turn_left
If forward is open and leads toward the interior path → move_forward
If the simulation shows an open corridor even if 3D looks tight → still valid
`;

/*
export const SYSTEM_PROMPT = `
You are a 3D Exploration Agent navigating a maze.
The goal is to reach the designated target area.
Walk around the 3D maze and find the goal.

# INPUT IMAGE FORMAT
You will receive a single image containing four views arranged in a 2×2 grid:
Top-Left: CURRENT VIEW
Top-Right: Simulation if you MOVE FORWARD
Bottom-Left: Simulation if you TURN LEFT
Bottom-Right: Simulation if you TURN RIGHT
Use these simulated future views to avoid collisions and dead ends.

# VISUAL CUES
START POINT: Green floor tile
GOAL POINT: White floor tile + floating yellow box
WALLS: Cyan blocks
FLOOR: Dark gray

# NEW CRITICAL RULES — MUST FOLLOW
1. Turning is mandatory when:
Forward cell is a wall
Forward leads to a dead end
There is a turn required to follow the only viable path

# OUTPUT FORMAT
Output ONLY JSON:
{"thought": "reasoning...", "action": "move_forward" | "turn_left" | "turn_right" | "stop"}

# EXAMPLE OF CORRECT REASONING
If left tile is black and right tile grey → choose turn_left
If forward is open and leads toward the interior path → move_forward
If the simulation shows an open corridor even if 3D looks tight → still valid
`;
*/

// Helper to load image from base64
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const createTiledImage = async (current: string, futures: Record<string, string> | undefined): Promise<string> => {
  // Load all images
  const imgCurrent = await loadImage(current);
  const imgForward = futures?.['move_forward'] ? await loadImage(futures['move_forward']) : null;
  const imgLeft = futures?.['turn_left'] ? await loadImage(futures['turn_left']) : null;
  const imgRight = futures?.['turn_right'] ? await loadImage(futures['turn_right']) : null;

  const width = imgCurrent.width;
  const height = imgCurrent.height;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get context");

  // Fill black
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Helper to draw image and label
  const drawTile = (img: HTMLImageElement | null, x: number, y: number, label: string) => {
    if (img) {
      ctx.drawImage(img, x, y, width, height);
    }
    // Draw label background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(x, y, width, 60);
    // Draw label text
    ctx.fillStyle = "white";
    ctx.font = "bold 40px Arial";
    ctx.fillText(label, x + 20, y + 45);
  };

  // Top-Left: Current
  drawTile(imgCurrent, 0, 0, "1. Current View");

  // Top-Right: Forward
  drawTile(imgForward, width, 0, "2. Simulate: Move Forward");

  // Bottom-Left: Left
  drawTile(imgLeft, 0, height, "3. Simulate: Turn Left");

  // Bottom-Right: Right
  drawTile(imgRight, width, height, "4. Simulate: Turn Right");

  return canvas.toDataURL('image/jpeg', 0.8);
};

export const SYSTEM_PROMPT_ASCII = `
You are a Rogue-like Dungeon Crawler Agent navigating a maze represented by ASCII art.
Your goal is to reach the Goal (G).

MAP LEGEND:
# : Wall
. : Open Path
S : Start Point
G : Goal Point
^ : You (Facing North / Up)
> : You (Facing East / Right)
v : You (Facing South / Down)
< : You (Facing West / Left)
o : Visited Path

STATUS:
- If you are on 'S', you are at the Start.
- If you are on 'G', you have reached the Goal.

Your task:
1. Analyze the ASCII map to locate yourself (arrow symbol) and the Goal (G).
2. Plan a path to the Goal avoiding Walls (#).
3. Determine the immediate action (move_forward, turn_left, turn_right) to follow that path.
   - 'move_forward' moves you 1 step in the direction you are facing.
   - 'turn_left' / 'turn_right' rotates you 90 degrees in place.
   - 'stop' if you have reached the Goal or cannot move.
   - Chose 'move_forward' preferentially if your front is an open path.
   - Choose an action so that the map state after the action is as different as possible from the state before the action.
   - You can move to visited path if there is no other route.
4. Output JSON only: {"thought": "reasoning...", "action": "move_forward" | "turn_left" | "turn_right" | "stop"}
`;

export const generateAsciiMap = (pos: {x: number, z: number}, rot: number): string => {
  const gridX = Math.round(pos.x / CELL_SIZE);
  const gridZ = Math.round(pos.z / CELL_SIZE);
  
  // Mark current position as visited
  if (mapLayout[gridZ] && mapLayout[gridZ][gridX] !== 1) {
    mapLayout[gridZ][gridX] = -1;
  }
  
  // Normalize rotation to 0-2PI
  let r = rot % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  
  // Determine direction symbol (0=North/Up, PI/2=West/Left, PI=South/Down, 3PI/2=East/Right)
  // Note: In Three.js, 0 is -Z (North), +Rot is CCW around Y.
  // 0 -> North (^)
  // PI/2 -> West (<) (Left turn from North)
  // PI -> South (v)
  // 3PI/2 -> East (>)
  
  let playerChar = '^';
  const sector = Math.PI / 4;
  if (r >= 7*sector || r < 1*sector) playerChar = '^';      // North
  else if (r >= 1*sector && r < 3*sector) playerChar = '<'; // West
  else if (r >= 3*sector && r < 5*sector) playerChar = 'v'; // South
  else if (r >= 5*sector && r < 7*sector) playerChar = '>'; // East

  let mapStr = "Current Map:\n";
  
  mapLayout.forEach((row, z) => {
    let line = "";
    row.forEach((cell, x) => {
      if (x === gridX && z === gridZ) {
        line += playerChar + " ";
      } else if (x === START_GRID.x && z === START_GRID.z) {
        line += "S ";
      } else if (x === GOAL_GRID.x && z === GOAL_GRID.z) {
        line += "G ";
      } else if (cell === 1) {
        line += "# ";
      } else if (cell === -1) {
        line += "o ";
      } else {
        line += ". ";
      }
    });
    mapStr += line + "\n";
  });

  // Status line for overlap
  if (gridX === START_GRID.x && gridZ === START_GRID.z) {
    mapStr += "\n[STATUS]: You are currently standing on the START point.";
  } else if (gridX === GOAL_GRID.x && gridZ === GOAL_GRID.z) {
    mapStr += "\n[STATUS]: You are currently standing on the GOAL point.";
  }

  return mapStr;
};

export const analyzeAscii = async (asciiMap: string): Promise<VLMResponse> => {
  const MOCK_MODE = false; // Toggle this for real API

  if (MOCK_MODE) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          thought: "ASCII Mode: I see the map. Moving towards goal.",
          action: "move_forward",
        });
      }, 1000);
    });
  }

  try {
    const response = await fetch(VLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: SYSTEM_PROMPT_ASCII + "\n\n" + asciiMap
          }
        ],
      }),
    });

    const data = await response.json();

    if (!data.choices || !data.choices.length) {
      console.error("ASCII API Error Response:", data);
      return { thought: "API Error: Check console for details.", action: "stop" };
    }

    const content = data.choices[0].message.content;
    const cleanJson = content.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("ASCII Agent Error:", error);
    return { thought: "Error connecting to AI.", action: "stop" };
  }
};

export const analyzeImage = async (base64Image: string, futureImages?: Record<string, string>): Promise<VLMResponse> => {
  // 【モックモード】VLMがない場合のためのダミーロジック
  // 実際につなぐ場合はここを false にしてください
  const MOCK_MODE = false; 

  if (MOCK_MODE) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const actions: AgentAction[] = ["move_forward", "turn_left", "turn_right"];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        resolve({
          thought: "Mock: I see a path ahead, proceeding carefully to map the area.",
          action: randomAction,
        });
      }, 1500); // 思考時間をシミュレート
    });
  }

  // プロンプト: Space Chainの「空間理解」を促す
  // 実際のAPIコール
  try {
    // Create tiled image
    const tiledImage = await createTiledImage(base64Image, futureImages);

    const messages: any[] = [
      { type: "text", text: SYSTEM_PROMPT },
      {
        type: "image_url",
        image_url: { url: tiledImage },
      },
    ];

    // Future images are no longer sent individually
    /*
    if (futureImages) {
      messages.push({ type: "text", text: "Below are the simulated views for possible next actions:" });
      if (futureImages['move_forward']) {
        messages.push({ type: "text", text: "Option A: Move Forward" });
        messages.push({ type: "image_url", image_url: { url: futureImages['move_forward'] } });
      }
      if (futureImages['turn_left']) {
        messages.push({ type: "text", text: "Option B: Turn Left" });
        messages.push({ type: "image_url", image_url: { url: futureImages['turn_left'] } });
      }
      if (futureImages['turn_right']) {
        messages.push({ type: "text", text: "Option C: Turn Right" });
        messages.push({ type: "image_url", image_url: { url: futureImages['turn_right'] } });
      }
    }
    */

    const response = await fetch(VLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: messages,
          },
        ],
      }),
    });

    const data = await response.json();
    
    if (!data.choices || !data.choices.length) {
      console.error("VLM API Error Response:", data);
      return { thought: "API Error: Check console for details.", action: "stop" };
    }

    const content = data.choices[0].message.content;
    
    // JSONパース（マークダウン記法が含まれる場合の除去処理含む）
    const cleanJson = content.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("VLM Error:", error);
    return { thought: "Error connecting to VLM.", action: "stop" };
  }
};
