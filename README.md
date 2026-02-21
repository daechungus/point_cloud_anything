# Image Particle Cloud

Convert any image into an animated 3D particle cloud, inspired by [Penderecki's Garden](https://pendereckisgarden.pl/en/garden-of-memory).

## Features

- **Image to Particles** - Converts any image into thousands of colored particles
- **DA3 3D Model Mode** - Uses Depth Anything 3's full pipeline: predicted camera intrinsics/extrinsics, confidence filtering → proper GLB 3D model → point cloud
- **Dual View Toggle** - Switch between animated particle cloud and raw 3D mesh
- **Brightness Depth Fallback** - Works without a backend using brightness as depth
- **Point Cloud Support** - Load PLY, XYZ, JSON, NPY files directly
- **Floating Animation** - Gentle wave-like motion with box-to-shape entry animation
- **Interactive Camera** - Orbit, zoom, and pan with mouse controls
- **Soft Particle Rendering** - Custom GLSL shaders for smooth, glowing particles
- **Real-time Adjustments** - 7 sliders to control appearance without reloading

## Running

You need **two terminals**:

**Terminal 1 — Python API backend:**
```bash
cd point_cloud_anything
python api_server.py
```
Wait for `✓ Model loaded and ready`. The first run downloads the DA3 model (~500MB).

**Terminal 2 — Frontend:**
```bash
cd point_cloud_anything
npm install   # first time only
npm run dev
```

Open `http://localhost:5173` in your browser.

> The frontend works without the backend (falls back to brightness-based depth), but the DA3 3D Model mode requires the API server.

## Input Modes

### 1. Image + Optional Depth
Uses brightness as depth by default. If the API server is running, it automatically generates a depth map via DA3 when you upload an image.

1. Select **"Image + Optional Depth"** mode
2. Upload an image — depth map is generated automatically if the API is running
3. Click **"Load Particles"**
4. Adjust sliders and click **"Reload with Settings"** to fine-tune

### 2. Direct Point Cloud
Load a pre-existing point cloud file.

1. Select **"Direct Point Cloud"** mode
2. Upload a file (`.ply`, `.xyz`, `.pts`, `.json`, `.npy`)
3. Click **"Load Particles"**

### 3. DA3 3D Model (GLB) — requires API server
The highest-quality mode. Sends your image through DA3's full 3D reconstruction pipeline, which uses the model's predicted camera intrinsics/extrinsics and confidence filtering to produce an accurate GLB point cloud. The result is displayed as animated particles, with an option to view the raw 3D mesh.

1. Select **"DA3 3D Model (GLB)"** mode
2. Upload an image
3. Click **"Load Particles"** — takes ~10–30 seconds (longer on first model load)
4. Use **"Toggle: Particles / Mesh"** to switch between views

## Controls

| Input | Action |
|-------|--------|
| Left-click drag | Rotate |
| Scroll | Zoom |
| Right-click drag | Pan |

## Particle Settings (real-time sliders)

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Particle Count** | 1–10 | Lower = more particles (denser) |
| **Spread** | 1–20 | Scene size |
| **Depth Strength** | 0–5 | 3D depth effect |
| **Particle Size** | 0.1–1.0 | Base size of points |
| **Size Variation** | 0–0.5 | Random size differences |
| **Aspect X** | 0.1–3.0 | Horizontal stretch |
| **Aspect Y** | 0.1–3.0 | Vertical stretch |

Adjust sliders, then click **"Reload with Settings"** to apply.

## Architecture

```
point_cloud_anything/
├── main.js              # Three.js scene, particle shaders, all input modes
├── pointCloudLoader.js  # PLY / XYZ / JSON / NPY parser
├── api_server.py        # FastAPI backend — DA3 depth + GLB endpoints
├── index.html           # UI controls
└── public/
    ├── images/          # Sample images
    └── depth/           # Sample depth maps
```

### API Endpoints (port 8000)

| Endpoint | Description |
|----------|-------------|
| `POST /api/generate-depth` | Returns DA3 depth map as NPY + PNG |
| `POST /api/generate-point-cloud` | Returns simple back-projected PLY |
| `POST /api/generate-glb` | Returns full DA3 GLB using model camera intrinsics + confidence filtering |

Interactive API docs available at `http://localhost:8000/docs`.

### DA3 GLB Pipeline

```
image → DA3 inference (predicted intrinsics/extrinsics + confidence map)
      → export_to_glb (confidence filtering, up to 500k points, proper 3D back-projection)
      → GLB binary (base64) → GLTFLoader → extract vertices
      → normalise to scene scale → animated particle cloud + raw mesh toggle
```

## Credits

Inspired by [Penderecki's Garden](https://pendereckisgarden.pl) — an award-winning WebGL experience by Immersion.
Depth estimation by [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3) (ByteDance).
