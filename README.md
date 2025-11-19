# Image Particle Cloud

Convert any image into an animated 3D particle cloud, inspired by [Penderecki's Garden](https://pendereckisgarden.pl/en/garden-of-memory).

## Features

- **Image to Particles** - Converts any image into thousands of colored particles
- **3D Depth Mapping** - Uses brightness to create depth (lighter = closer)
- **Floating Animation** - Gentle wave-like motion for atmospheric effect
- **Interactive Camera** - Orbit, zoom, and pan with mouse controls
- **Soft Particle Rendering** - Custom shaders for smooth, glowing particles
- **Atmospheric Design** - Dark background with fog for depth

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### Two Modes:

1. **Brightness-based depth** (default) - Works immediately, uses pixel brightness as fake depth
2. **Real depth from Depth Anything 3** - Requires Python setup, generates accurate 3D geometry

See `QUICKSTART_DEPTH.md` for details.

## Usage

1. **Default View**: Opens with an abstract gradient particle cloud
2. **Load Image**: Click "Load Image" to upload your own photo
3. **Reset**: Click "Reset to Default" to return to the gradient
4. **Navigate**: 
   - Drag to rotate
   - Scroll to zoom
   - Right-click drag to pan

## How It Works

1. **Image Loading** - Loads image and draws to off-screen canvas
2. **Pixel Sampling** - Samples every 2nd pixel (adjustable in code)
3. **Position Mapping** - Maps (x,y) to 3D coordinates, brightness to z-depth
4. **Color Extraction** - Uses RGB values for particle colors (slightly desaturated)
5. **GPU Rendering** - Custom vertex/fragment shaders for smooth animation

## Customization

### Adjust Particle Count

In `main.js`, line 68:
```js
const targetWidth = 600; // Higher = more particles
const skip = 2; // Lower = more particles
```

### Change Animation Speed

In `main.js`, line 131:
```js
float offset = sin(uTime * 0.5 + ...) * 0.02;
//                        ^^^          ^^^^
//                       speed       amplitude
```

### Modify Depth Effect

In `main.js`, line 95:
```js
const nz = (brightness - 0.5) * 0.3; // Adjust 0.3 for more/less depth
```

### Change Background

In `main.js`, line 21:
```js
scene.background = new THREE.Color(0x0a0a0f); // Dark blue-purple
```

## Technical Details

- **Particle Count**: ~90,000 particles (600×450 image sampled every 2 pixels)
- **Rendering**: WebGL with Three.js
- **Shaders**: Custom GLSL for vertex animation and soft particles
- **Performance**: 60fps on modern GPUs
- **Memory**: ~20MB for typical image

## Comparison to Penderecki's Garden

**This Implementation:**
- ✅ Single 2D image input
- ✅ Brightness-based depth
- ✅ Floating particle animation
- ✅ Interactive camera controls
- ✅ Atmospheric rendering

**Penderecki's Garden:**
- Uses photogrammetry point cloud scans
- Real 3D geometry from drones
- Audio-reactive animations
- Multiple viewpoints with hotspots
- Professional production quality

## Next Steps

To get closer to Penderecki's Garden:

1. **Audio Reactivity** - Add Web Audio API for music-driven animation
2. **Multiple Views** - Create camera waypoints with smooth transitions
3. **UI Overlays** - Add text/audio hotspots anchored to 3D positions
4. **Real Point Clouds** - Use `.ply` or `.las` files from photogrammetry
5. **Advanced Shaders** - Distance-based fading, noise-driven motion

## Credits

Inspired by [Penderecki's Garden](https://pendereckisgarden.pl) - an award-winning WebGL experience by Immersion.
