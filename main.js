import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadPointCloud, normalizePointCloud } from './pointCloudLoader.js';
import NPY from 'npyjs';

let camera, scene, renderer, controls;
let points;
let meshObject = null;  // Raw GLB scene for mesh view mode
let clock = new THREE.Clock();
let frameCount = 0;

// User-adjustable settings
const particleSettings = {
  skip: 1,              // Particle count (lower = more particles)
  spread: 15,            // Position spread multiplier
  depthMultiplier: 0.3, // Depth effect strength
  particleSizeMin: 0.1, // Minimum particle size
  particleSizeRange: 0.2, // Random size variation
  aspectRatioX: 0.3,    // X-axis scale
  aspectRatioY: 0.3     // Y-axis scale
};

init();
animate();

// Initialize with default gradient, then allow image upload
createDefaultPoints().then(p => {
  points = p;
  points.userData.transitionStartTime = clock.getElapsedTime();
  scene.add(points);
});

// 1. Basic Three.js scene
function init() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f); // Very dark blue-purple
  scene.fog = new THREE.FogExp2(0x0a0a0f, 0.15);

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 0, 20); // Move camera further back
  console.log('✓ Camera positioned at:', camera.position);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.querySelector('#app').appendChild(renderer.domElement);
  
  console.log('✓ Renderer initialized');
  console.log('✓ Canvas size:', w, 'x', h);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 10;

  window.addEventListener('resize', onWindowResize);
  
  // Set up file upload
  setupFileUpload();
}

function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// Load depth map from NPY (actual depth data) or PNG (fallback)
async function loadDepthMap(src, isNpyData = false) {
  if (isNpyData) {
    // Load actual NPY depth data (correct method)
    console.log('Loading NPY depth data...');
    
    try {
      // If src is a base64 data URL, extract the base64 part
      let npyData;
      if (src.startsWith('data:')) {
        const base64Data = src.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        npyData = bytes.buffer;
      } else {
        // Load from URL
        const response = await fetch(src);
        npyData = await response.arrayBuffer();
      }
      
      const npy = new NPY();
      const depth = await npy.load(npyData);
      
      // depth.data = Float32Array or similar
      // depth.shape = [H, W] or [W, H] - check order
      const raw = new Float32Array(depth.data);
      const shape = depth.shape;
      // NPY shape is typically [H, W] for 2D arrays
      const H = shape[0];
      const W = shape[1];
      
      console.log(`✓ NPY loaded: ${W} x ${H}, ${raw.length} values`);
      
      // Percentile clipping to remove sky/far background
      const sorted = Array.from(raw).sort((a, b) => a - b);
      const dMin = sorted[Math.floor(0.01 * raw.length)]; // 1st percentile
      const dMax = sorted[Math.floor(0.99 * raw.length)]; // 99th percentile
      
      console.log(`  Depth range: ${dMin.toFixed(3)} to ${dMax.toFixed(3)} (raw)`);
      console.log(`  Clipped range: ${dMin.toFixed(3)} to ${dMax.toFixed(3)}`);
      
      // Normalize depth
      const depthNorm = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        const clipped = Math.max(dMin, Math.min(dMax, raw[i]));
        depthNorm[i] = (clipped - dMin) / (dMax - dMin + 1e-8);
      }
      
      // Mask out far background (sky)
      const maskThreshold = 0.75; // Skip depths > 75% of range
      const depthMasked = new Float32Array(raw.length);
      let maskedCount = 0;
      
      for (let i = 0; i < depthNorm.length; i++) {
        if (depthNorm[i] > maskThreshold) {
          depthMasked[i] = -1; // Mark as skip
          maskedCount++;
        } else {
          depthMasked[i] = depthNorm[i];
        }
      }
      
      console.log(`  Masked ${maskedCount} far-background pixels (${(maskedCount/raw.length*100).toFixed(1)}%)`);
      
      return { 
        width: W, 
        height: H, 
        depthValues: depthMasked,
        isMasked: true
      };
      
    } catch (error) {
      console.error('Error loading NPY:', error);
      throw error;
    }
  } else {
    // Fallback: Load PNG visualization (less accurate, but works)
    console.log('Loading depth PNG (fallback mode - using luminance)...');
    const img = await loadImage(src);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const targetWidth = 600;
    const scale = targetWidth / img.width;
    const targetHeight = Math.floor(img.height * scale);
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    
    const depthData = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const depthValues = new Float32Array(targetWidth * targetHeight);
    
    // Extract perceptual luminance (not just red channel)
    for (let i = 0; i < depthValues.length; i++) {
      const j = i * 4;
      const r = depthData[j] / 255;
      const g = depthData[j + 1] / 255;
      const b = depthData[j + 2] / 255;
      
      // Perceptual luminance
      const v = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Mask out far sky
      if (v > 0.75) {
        depthValues[i] = -1; // Skip
      } else {
        depthValues[i] = v;
      }
    }
    
    console.log('✓ Depth PNG loaded (luminance extraction):', targetWidth, 'x', targetHeight);
    return { 
      width: targetWidth, 
      height: targetHeight, 
      depthValues,
      isMasked: true
    };
  }
}

// 2. Convert image → point cloud
async function loadImageAsPoints(src, depthMapSrc = null) {
  console.log('Loading image:', src.substring(0, 50));
  const img = await loadImage(src);
  console.log('Image loaded:', img.width, 'x', img.height);
  
      // Load depth map if provided
      let depthMap = null;
      if (depthMapSrc) {
        // Check if it's NPY data (from API) or PNG file
        const isNpy = depthMapSrc.includes('application/octet-stream') || depthMapSrc.endsWith('.npy');
        depthMap = await loadDepthMap(depthMapSrc, isNpy);
        console.log('✓ Using DA3 depth map (NPY data)');
      } else {
        console.log('✓ Using brightness-based depth');
      }

  // Draw to canvas and grab pixels
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // If we have a depth map, use its dimensions; otherwise use default
  let targetWidth, targetHeight;
  if (depthMap) {
    targetWidth = depthMap.width;
    targetHeight = depthMap.height;
    console.log(`Using depth map dimensions: ${targetWidth} x ${targetHeight}`);
  } else {
    targetWidth = 600; // Adjust for more/fewer particles
    const scale = targetWidth / img.width;
    targetHeight = Math.floor(img.height * scale);
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
  console.log('Image data extracted:', targetWidth, 'x', targetHeight);

  //# of particles and pixels (from settings)
  const skip = particleSettings.skip; 
  const positions = [];
  const colors = [];
  const sizes = [];
  const opacities = [];

  for (let y = 0; y < targetHeight; y += skip) {
    for (let x = 0; x < targetWidth; x += skip) {
      const i = (y * targetWidth + x) * 4;
      const r = imgData[i] / 255;
      const g = imgData[i + 1] / 255;
      const b = imgData[i + 2] / 255;
      const a = imgData[i + 3] / 255;

      if (a < 0.1) continue; // Skip transparent pixels
      
      // Calculate brightness
      const brightness = (r + g + b) / 3;
      
      // Skip very dark and very bright pixels
      if (brightness < 0.15 || brightness > 0.85) continue;

      // Normalize x,y to [-1,1] range, preserve aspect ratio
      //grid for image
      const aspect = targetWidth / targetHeight;
      let nx = ((x / targetWidth) * 2 - 1) * aspect * particleSettings.aspectRatioX;
      let ny = (1 - (y / targetHeight) * 2) * particleSettings.aspectRatioY;

      // Depth calculation
      let nz;
      if (depthMap) {
        // Use real depth from DA3
        const idx = y * targetWidth + x;
        const d = depthMap.depthValues[idx];
        
        // Skip masked pixels (far background/sky)
        if (d < 0) continue; // Skip this pixel entirely
        
        // Invert so nearer = closer to camera (larger z)
        // Map to wider range for more dramatic depth
        nz = (1.0 - d) * 2.0 - 1.0; // [-1, 1]
        nz *= particleSettings.depthMultiplier; // User-controlled depth
      } else {
        // Fallback: brightness-based depth
        nz = (brightness - 0.5) * particleSettings.depthMultiplier;
      }

      // spread of pixels (from settings)
      const SPREAD = particleSettings.spread;

      positions.push(nx * SPREAD, ny * SPREAD, nz * SPREAD);
      
      // Slightly desaturate for atmospheric look
      const avg = (r + g + b) / 3;
      const mixFactor = 0.3;
      const rr = avg * mixFactor + r * (1 - mixFactor);
      const gg = avg * mixFactor + g * (1 - mixFactor);
      const bb = avg * mixFactor + b * (1 - mixFactor);

      colors.push(rr, gg, bb);
      
      //particle size (from settings)
      sizes.push(particleSettings.particleSizeMin + Math.random() * particleSettings.particleSizeRange);
      
      // Brightness controls opacity - mid-tones get higher opacity
      // Create a bell curve: darkest and brightest = low opacity, mid-tones = high
      const distFromMid = Math.abs(brightness - 0.5) * 2; // 0 at mid, 1 at extremes
      const opacity = 1.0 - distFromMid * 0.5; // 0.5 to 1.0 range
      opacities.push(opacity);
    }
  }

  const particleCount = positions.length / 3;
  console.log(`✓ Created ${particleCount} particles`);

  if (particleCount === 0) {
    console.error('No particles created! Check image data.');
    throw new Error('No particles created from image');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.Float32BufferAttribute(opacities, 1));

  // Store final positions for animation
  geometry.setAttribute(
    'basePosition',
    new THREE.Float32BufferAttribute(positions.slice(), 3)
  );
  
  // Create initial box positions - particles start in a cube
  const boxPositions = [];
  const boxSize = 100.0; // Size of the initial box
  for (let i = 0; i < particleCount; i++) {
    // Random position within a box
    boxPositions.push(
      (Math.random() - 0.5) * boxSize,
      (Math.random() - 0.5) * boxSize,
      (Math.random() - 0.5) * boxSize
    );
  }
  geometry.setAttribute(
    'boxPosition',
    new THREE.Float32BufferAttribute(boxPositions, 3)
  );
  
  // Add random offsets for independent jitter (per particle)
  const jitterOffsets = [];
  const jitterSpeeds = [];
  for (let i = 0; i < particleCount; i++) {
    // jitterOffsets.push(
    //   Math.random() * Math.PI * 2,
    //   Math.random() * Math.PI * 2,
    //   Math.random() * Math.PI * 2
    // );
    jitterSpeeds.push(
      0.3 + Math.random() * 0.2, // Speed variation
      0.3 + Math.random() * 0.2,
      0.3 + Math.random() * 0.2
    );
  }
  geometry.setAttribute(
    'jitterOffset',
    new THREE.Float32BufferAttribute(jitterOffsets, 3)
  );
  geometry.setAttribute(
    'jitterSpeed',
    new THREE.Float32BufferAttribute(jitterSpeeds, 3)
  );

  // Custom shader for better particle rendering with box transition and jitter
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uTransitionDuration: { value: 3.0 }, // 3 seconds to transition from box to shape
      uJitterAmount: { value: 0.1 } // Amount of independent jitter
    },
    vertexShader: `
      precision highp float;
      
      attribute float size;
      attribute float opacity;
      attribute vec3 basePosition;  // Final position (image shape)
      attribute vec3 boxPosition;    // Initial box position
      attribute vec3 jitterOffset;   // Random phase offsets for jitter
      attribute vec3 jitterSpeed;    // Speed variation per particle
      
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uTransitionDuration;
      uniform float uJitterAmount;
      
      varying vec3 vColor;
      varying float vOpacity;
      
      // Smooth easing function
      float easeInOutCubic(float t) {
        return t < 0.5 
          ? 4.0 * t * t * t 
          : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
      }
      
      void main() {
        vColor = color;
        vOpacity = opacity;
        
        // Phase 1: Transition from box to final shape
        float transitionProgress = clamp(uTime / uTransitionDuration, 0.0, 1.0);
        float easedProgress = easeInOutCubic(transitionProgress);
        
        // Interpolate from box to final position
        vec3 pos = mix(boxPosition, basePosition, easedProgress);
        
        // Phase 2: After transition, add independent jitter
        if (transitionProgress >= 1.0) {
          float jitterTime = uTime - uTransitionDuration;
          
          // Independent jitter for each particle (using their unique offsets and speeds)
          vec3 jitter = vec3(
            sin(jitterTime * jitterSpeed.x + jitterOffset.x),
            sin(jitterTime * jitterSpeed.y + jitterOffset.y),
            sin(jitterTime * jitterSpeed.z + jitterOffset.z)
          );
          
          // Add jitter with varying intensity
          pos += jitter * uJitterAmount;
          
          // Also add some gentle floating motion
          float floatOffset = sin(uTime * 0.3 + basePosition.x * 2.0 + basePosition.y * 2.0) * 0.05;
          pos.y += floatOffset;
        }
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Point size
        gl_PointSize = size * 1.0 * uPixelRatio * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      
      varying vec3 vColor;
      varying float vOpacity;
      
      void main() {
        // Soft circular particles
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        
        if (dist > 0.5) discard;
        
        // Soft edge falloff
        float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
        
        // Combine shape alpha with brightness-based opacity
        gl_FragColor = vec4(vColor * 0.7, alpha * vOpacity * 0.6);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending
  });

  const pointsMesh = new THREE.Points(geometry, material);
  
  console.log('✓ Points mesh created');
  console.log('  - Particle count:', particleCount);
  
  return pointsMesh;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Create points directly from point cloud file
async function createPointsFromPointCloud(file) {
  console.log('Loading point cloud file...');
  
  try {
    // Load the point cloud
    let pointCloud = await loadPointCloud(file);
    console.log(`✓ Loaded ${pointCloud.count} points from ${pointCloud.format}`);
    
    // Normalize to fit in scene
    pointCloud = normalizePointCloud(pointCloud, particleSettings.spread);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pointCloud.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(pointCloud.colors, 3));
    
    // Base position for animation
    geometry.setAttribute('basePosition', new THREE.BufferAttribute(pointCloud.positions.slice(), 3));
    
    // Sizes (all same for point cloud data)
    const sizes = new Float32Array(pointCloud.count).fill(particleSettings.particleSizeMin);
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // Opacity (all same)
    const opacities = new Float32Array(pointCloud.count).fill(0.8);
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
    
    // Create material (same shader as image-based)
    // Create box positions for point cloud too
    const boxPositions = [];
    const boxSize = 8.0;
    for (let i = 0; i < pointCloud.count; i++) {
      boxPositions.push(
        (Math.random() - 0.5) * boxSize,
        (Math.random() - 0.5) * boxSize,
        (Math.random() - 0.5) * boxSize
      );
    }
    geometry.setAttribute('boxPosition', new THREE.BufferAttribute(new Float32Array(boxPositions), 3));
    
    // Add jitter offsets and speeds
    const jitterOffsets = [];
    const jitterSpeeds = [];
    for (let i = 0; i < pointCloud.count; i++) {
      jitterOffsets.push(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      jitterSpeeds.push(
        0.1 + Math.random() * 0.4,
        0.1 + Math.random() * 0.4,
        0.1 + Math.random() * 0.4
      );
    }
    geometry.setAttribute('jitterOffset', new THREE.BufferAttribute(new Float32Array(jitterOffsets), 3));
    geometry.setAttribute('jitterSpeed', new THREE.BufferAttribute(new Float32Array(jitterSpeeds), 3));
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uTransitionDuration: { value: 3.0 },
        uJitterAmount: { value: 0.15 }
      },
      vertexShader: `
        precision highp float;
        
        attribute float size;
        attribute float opacity;
        attribute vec3 basePosition;
        attribute vec3 boxPosition;
        attribute vec3 jitterOffset;
        attribute vec3 jitterSpeed;
        
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uTransitionDuration;
        uniform float uJitterAmount;
        
        varying vec3 vColor;
        varying float vOpacity;
        
        float easeInOutCubic(float t) {
          return t < 0.5 
            ? 4.0 * t * t * t 
            : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
        }
        
        void main() {
          vColor = color;
          vOpacity = opacity;
          
          float transitionProgress = clamp(uTime / uTransitionDuration, 0.0, 1.0);
          float easedProgress = easeInOutCubic(transitionProgress);
          
          vec3 pos = mix(boxPosition, basePosition, easedProgress);
          
          if (transitionProgress >= 1.0) {
            float jitterTime = uTime - uTransitionDuration;
            vec3 jitter = vec3(
              sin(jitterTime * jitterSpeed.x + jitterOffset.x),
              sin(jitterTime * jitterSpeed.y + jitterOffset.y),
              sin(jitterTime * jitterSpeed.z + jitterOffset.z)
            );
            pos += jitter * uJitterAmount;
            float floatOffset = sin(uTime * 0.3 + basePosition.x * 2.0 + basePosition.y * 2.0) * 0.05;
            pos.y += floatOffset;
          }
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * 1.0 * uPixelRatio * (150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        
        varying vec3 vColor;
        varying float vOpacity;
        
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          
          if (dist > 0.5) discard;
          
          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          gl_FragColor = vec4(vColor * 0.7, alpha * vOpacity * 0.6);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });
    
    const pointsMesh = new THREE.Points(geometry, material);
    console.log('✓ Point cloud mesh created');
    
    return pointsMesh;
    
  } catch (error) {
    console.error('Error loading point cloud:', error);
    throw error;
  }
}

// Create default gradient for initial load
async function createDefaultPoints() {
  console.log('Creating default gradient...');
  
  // Create a simple gradient canvas
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  
  // Dark background first
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 300, 300);
  
  // Create radial gradient
  const gradient = ctx.createRadialGradient(150, 150, 0, 150, 150, 150);
  gradient.addColorStop(0, '#6a5acd');     // Slate blue
  gradient.addColorStop(0.4, '#4169e1');   // Royal blue
  gradient.addColorStop(0.7, '#1e3a8a');   // Dark blue
  gradient.addColorStop(1, '#0f172a');     // Very dark blue
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 300);
  
  // Add some colorful spots
  for (let i = 0; i < 8; i++) {
    const x = 50 + Math.random() * 200;
    const y = 50 + Math.random() * 200;
    const r = 20 + Math.random() * 40;
    
    const hue = Math.random() * 60 + 180; // Blue to purple range
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(${hue}, 80%, 70%, 0.8)`);
    grad.addColorStop(0.5, `hsla(${hue}, 70%, 50%, 0.4)`);
    grad.addColorStop(1, `hsla(${hue}, 60%, 30%, 0)`);
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  console.log('✓ Default gradient canvas created');
  const dataUrl = canvas.toDataURL();
  return loadImageAsPoints(dataUrl);
}

// ─── DA3 GLB Pipeline ────────────────────────────────────────────────────────

/**
 * POST image to /api/generate-glb, return the parsed GLTF object.
 */
async function loadGlbFromApi(imageFile) {
  const formData = new FormData();
  formData.append('file', imageFile);

  const response = await fetch('http://localhost:8000/api/generate-glb', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GLB API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  if (!data.success || !data.glb) throw new Error('GLB API returned no data');

  console.log(`✓ GLB received (${data.point_count?.toLocaleString() ?? '?'} source points)`);

  // Decode base64 → ArrayBuffer
  const b64 = data.glb.split(',')[1];
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

  // Parse GLB
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer.buffer, '', resolve, reject);
  });
}

/**
 * Walk a loaded GLTF scene and collect all position + color data.
 * Returns { positions: Float32Array, colors: Float32Array }.
 */
function extractPointsFromGltf(gltf) {
  const positionsArr = [];
  const colorsArr = [];

  gltf.scene.traverse((child) => {
    const geo = child.geometry;
    if (!geo) return;

    const pos = geo.attributes.position;
    const col = geo.attributes.color;

    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        positionsArr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
    }
    if (col) {
      for (let i = 0; i < col.count; i++) {
        colorsArr.push(col.getX(i), col.getY(i), col.getZ(i));
      }
    }
  });

  console.log(`✓ Extracted ${positionsArr.length / 3} points from GLB`);
  return {
    positions: new Float32Array(positionsArr),
    colors: new Float32Array(colorsArr),
  };
}

/**
 * Normalize GLB metric-space points to fit within scene spread setting.
 */
function normalizeGlbPositions(positions) {
  const N = positions.length / 3;
  if (N === 0) return positions;

  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < N; i++) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  cx /= N; cy /= N; cz /= N;

  let maxDist = 0;
  for (let i = 0; i < N; i++) {
    const dx = positions[i * 3] - cx;
    const dy = positions[i * 3 + 1] - cy;
    const dz = positions[i * 3 + 2] - cz;
    maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }

  const scale = particleSettings.spread / (maxDist + 1e-8);
  const out = new Float32Array(positions.length);
  for (let i = 0; i < N; i++) {
    out[i * 3]     = (positions[i * 3]     - cx) * scale;
    out[i * 3 + 1] = (positions[i * 3 + 1] - cy) * scale;
    out[i * 3 + 2] = (positions[i * 3 + 2] - cz) * scale;
  }
  return out;
}

/**
 * Build a shader-animated Points mesh from raw position + color arrays.
 * Reuses the same vertex/fragment shaders as the image-based pipeline.
 */
function createPointsFromGlbData(rawPositions, rawColors) {
  const positions = normalizeGlbPositions(rawPositions);
  const N = positions.length / 3;

  // If no color data from GLB, fill with white
  let colors = rawColors;
  if (!colors || colors.length === 0) {
    colors = new Float32Array(N * 3).fill(1.0);
  }

  // Sizes & opacities
  const sizes = new Float32Array(N);
  const opacities = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    sizes[i] = particleSettings.particleSizeMin + Math.random() * particleSettings.particleSizeRange;
    opacities[i] = 0.85;
  }

  // Box start positions for the entry animation
  const boxPositions = new Float32Array(N * 3);
  const boxSize = 8.0;
  for (let i = 0; i < N; i++) {
    boxPositions[i * 3]     = (Math.random() - 0.5) * boxSize;
    boxPositions[i * 3 + 1] = (Math.random() - 0.5) * boxSize;
    boxPositions[i * 3 + 2] = (Math.random() - 0.5) * boxSize;
  }

  // Per-particle jitter speeds
  const jitterOffsets = new Float32Array(N * 3);
  const jitterSpeeds = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    jitterOffsets[i * 3]     = Math.random() * Math.PI * 2;
    jitterOffsets[i * 3 + 1] = Math.random() * Math.PI * 2;
    jitterOffsets[i * 3 + 2] = Math.random() * Math.PI * 2;
    jitterSpeeds[i * 3]      = 0.1 + Math.random() * 0.4;
    jitterSpeeds[i * 3 + 1]  = 0.1 + Math.random() * 0.4;
    jitterSpeeds[i * 3 + 2]  = 0.1 + Math.random() * 0.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',     new THREE.Float32BufferAttribute(positions,     3));
  geometry.setAttribute('color',        new THREE.Float32BufferAttribute(colors,        3));
  geometry.setAttribute('size',         new THREE.Float32BufferAttribute(sizes,         1));
  geometry.setAttribute('opacity',      new THREE.Float32BufferAttribute(opacities,     1));
  geometry.setAttribute('basePosition', new THREE.Float32BufferAttribute(positions.slice(), 3));
  geometry.setAttribute('boxPosition',  new THREE.Float32BufferAttribute(boxPositions,  3));
  geometry.setAttribute('jitterOffset', new THREE.Float32BufferAttribute(jitterOffsets, 3));
  geometry.setAttribute('jitterSpeed',  new THREE.Float32BufferAttribute(jitterSpeeds,  3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:               { value: 0 },
      uPixelRatio:         { value: renderer.getPixelRatio() },
      uTransitionDuration: { value: 3.0 },
      uJitterAmount:       { value: 0.12 },
    },
    vertexShader: `
      precision highp float;
      attribute float size;
      attribute float opacity;
      attribute vec3 basePosition;
      attribute vec3 boxPosition;
      attribute vec3 jitterOffset;
      attribute vec3 jitterSpeed;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uTransitionDuration;
      uniform float uJitterAmount;
      varying vec3 vColor;
      varying float vOpacity;
      float easeInOutCubic(float t) {
        return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t+2.0,3.0)/2.0;
      }
      void main() {
        vColor = color;
        vOpacity = opacity;
        float tp = clamp(uTime / uTransitionDuration, 0.0, 1.0);
        vec3 pos = mix(boxPosition, basePosition, easeInOutCubic(tp));
        if (tp >= 1.0) {
          float jt = uTime - uTransitionDuration;
          vec3 jitter = vec3(
            sin(jt * jitterSpeed.x + jitterOffset.x),
            sin(jt * jitterSpeed.y + jitterOffset.y),
            sin(jt * jitterSpeed.z + jitterOffset.z)
          );
          pos += jitter * uJitterAmount;
          pos.y += sin(uTime * 0.3 + basePosition.x * 2.0 + basePosition.y * 2.0) * 0.05;
        }
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * 1.0 * uPixelRatio * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor * 0.7, alpha * vOpacity * 0.6);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const pointsMesh = new THREE.Points(geometry, material);
  console.log(`✓ GLB particle mesh: ${N} particles`);
  return pointsMesh;
}

// ─── End DA3 GLB Pipeline ────────────────────────────────────────────────────

// 3. Animate: subtle pulsation + slow camera drift
function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  if (points) {
    if (points.material.uniforms) {
      points.material.uniforms.uTime.value = t;
      // Reset transition when new points are loaded
      if (points.userData.transitionStartTime === undefined) {
        points.userData.transitionStartTime = t;
      }
      // Update time relative to transition start
      const relativeTime = t - points.userData.transitionStartTime;
      points.material.uniforms.uTime.value = relativeTime;
    }
    
    // Subtle rotation (only after transition)
    // const transitionTime = points.material?.uniforms?.uTransitionDuration?.value || 3.0;
    // if (t > transitionTime) {
    //   points.rotation.y = Math.sin(t * 0.1) * 0.2;
    //   points.rotation.x = Math.cos(t * 0.15) * 0.1 - 0.1;
    // }
    
    // Debug first frame
    if (frameCount === 0) {
      console.log('🎬 First frame rendering');
      console.log('  - Points object:', points);
      console.log('  - Points visible:', points.visible);
      console.log('  - Particle count:', points.geometry.attributes.position.count);
      console.log('  - Camera position:', camera.position);
    }
  } else if (frameCount === 0) {
    console.log('⚠️ No points object yet');
  }
  
  frameCount++;

  controls.update();
  renderer.render(scene, camera);
}

// File upload handling
function setupFileUpload() {
  const imageInput = document.getElementById('imageInput');
  const depthInput = document.getElementById('depthInput');
  const pointCloudInput = document.getElementById('pointCloudInput');
  const da3ImageInput = document.getElementById('da3ImageInput');
  const status = document.getElementById('status');
  const resetBtn = document.getElementById('resetBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const toggleViewBtn = document.getElementById('toggleViewBtn');
  const loadModeSelect = document.getElementById('loadMode');
  const imageInputs = document.getElementById('imageInputs');
  const pointCloudInputs = document.getElementById('pointCloudInputs');
  const da3Inputs = document.getElementById('da3Inputs');

  if (!imageInput) return;

  let currentImageUrl = null;
  let currentDepthUrl = null;
  let currentPointCloudFile = null;
  let currentDa3ImageFile = null;
  let currentViewMode = 'particles'; // 'particles' | 'mesh'

  // Setup sliders
  setupSliders();

  // Handle mode switching
  if (loadModeSelect) {
    loadModeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      imageInputs.style.display = mode === 'image' ? 'block' : 'none';
      pointCloudInputs.style.display = mode === 'pointcloud' ? 'block' : 'none';
      da3Inputs.style.display = mode === 'da3glb' ? 'block' : 'none';
      toggleViewBtn.style.display = 'none';
      if (mode === 'image') status.textContent = 'Mode: Image + Optional Depth Map';
      else if (mode === 'pointcloud') status.textContent = 'Mode: Direct Point Cloud';
      else status.textContent = 'Mode: DA3 3D Model — upload image to generate GLB';
      status.style.color = '#888';
    });
  }

  // DA3 image selection
  if (da3ImageInput) {
    da3ImageInput.addEventListener('change', (e) => {
      currentDa3ImageFile = e.target.files[0] || null;
      if (currentDa3ImageFile) {
        status.textContent = `Image ready: ${currentDa3ImageFile.name}. Click "Load Particles" to generate 3D model.`;
        status.style.color = '#888';
      }
    });
  }

  // Toggle between particle cloud and raw mesh
  if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
      if (!points && !meshObject) return;
      currentViewMode = currentViewMode === 'particles' ? 'mesh' : 'particles';
      if (points) points.visible = currentViewMode === 'particles';
      if (meshObject) meshObject.visible = currentViewMode === 'mesh';
      toggleViewBtn.textContent = currentViewMode === 'particles'
        ? 'Toggle: Particles / Mesh'
        : 'Toggle: Mesh / Particles';
      status.textContent = `View: ${currentViewMode === 'particles' ? 'Animated Particles' : 'Raw 3D Mesh'}`;
      status.style.color = '#4ade80';
    });
  }
  
  // Handle image upload
  imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    currentImageUrl = URL.createObjectURL(file);
    status.textContent = 'Image loaded. Generating depth map automatically...';
    status.style.color = '#888';
    
    // Automatically generate depth map
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('http://localhost:8000/api/generate-depth', {
        method: 'POST',
        body: formData
      });
      
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.depth_npy) {
            // Use the actual NPY depth data (not the PNG visualization)
            currentDepthUrl = data.depth_npy;
            status.textContent = '✓ Depth map generated (NPY)! Click "Load" to view 3D point cloud.';
            status.style.color = '#4ade80';
            console.log('✓ Automatic depth map generated (NPY data)');
            console.log(`  Shape: ${data.shape[0]} x ${data.shape[1]}`);
            console.log(`  Depth range: ${data.depth_range.min.toFixed(3)} to ${data.depth_range.max.toFixed(3)}`);
          } else {
            throw new Error('Depth generation failed');
          }
        } else {
          throw new Error(`Server error: ${response.status}`);
        }
    } catch (error) {
      console.warn('Could not generate depth map automatically:', error);
      status.textContent = 'Image loaded. Depth generation failed - using brightness-based depth. (Make sure API server is running)';
      status.style.color = '#ffa500';
      currentDepthUrl = null; // Fall back to brightness-based
    }
  });
  
  // Handle depth map upload
  depthInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    currentDepthUrl = URL.createObjectURL(file);
    status.textContent = 'Depth map loaded. Click "Load" to apply.';
    status.style.color = '#888';
  });
  
  // Handle point cloud upload
  if (pointCloudInput) {
    pointCloudInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      currentPointCloudFile = file;
      status.textContent = `Point cloud ready: ${file.name}. Click "Load" to apply.`;
      status.style.color = '#888';
    });
  }
  
  // Load button
  const loadBtn = document.getElementById('loadBtn');
  loadBtn.addEventListener('click', async () => {
    const mode = loadModeSelect ? loadModeSelect.value : 'image';

    status.textContent = 'Loading...';
    status.style.color = '#888';

    try {
      let newPoints;

      if (mode === 'da3glb' && currentDa3ImageFile) {
        // ── DA3 GLB pipeline ──────────────────────────────────────────────
        status.textContent = 'Sending image to DA3 API… (may take ~30s on first run)';

        const gltf = await loadGlbFromApi(currentDa3ImageFile);
        const { positions, colors } = extractPointsFromGltf(gltf);

        if (positions.length === 0) throw new Error('GLB contained no vertex data');

        newPoints = createPointsFromGlbData(positions, colors);

        // Remove old mesh & points
        if (meshObject) { scene.remove(meshObject); meshObject = null; }
        if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }

        // Add particle cloud
        points = newPoints;
        points.userData.transitionStartTime = clock.getElapsedTime();
        scene.add(points);

        // Also keep raw GLB scene for mesh-view toggle (initially hidden)
        meshObject = gltf.scene;
        meshObject.visible = false;
        // Center the raw mesh to match particle normalisation
        const box = new THREE.Box3().setFromObject(meshObject);
        const center = new THREE.Vector3();
        box.getCenter(center);
        meshObject.position.sub(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxSide = Math.max(size.x, size.y, size.z);
        const meshScale = (particleSettings.spread * 2) / (maxSide + 1e-8);
        meshObject.scale.setScalar(meshScale);
        scene.add(meshObject);

        // Show toggle button
        currentViewMode = 'particles';
        toggleViewBtn.style.display = 'block';
        toggleViewBtn.textContent = 'Toggle: Particles / Mesh';

        status.textContent = `✓ DA3 GLB loaded — ${(positions.length / 3).toLocaleString()} points`;

      } else if (mode === 'pointcloud' && currentPointCloudFile) {
        console.log('Loading point cloud file...');
        newPoints = await createPointsFromPointCloud(currentPointCloudFile);

        if (meshObject) { scene.remove(meshObject); meshObject = null; }
        if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
        points = newPoints;
        points.userData.transitionStartTime = clock.getElapsedTime();
        scene.add(points);
        toggleViewBtn.style.display = 'none';
        status.textContent = `✓ Loaded point cloud: ${currentPointCloudFile.name}`;

      } else if (mode === 'image' && currentImageUrl) {
        console.log('Loading with depth:', currentDepthUrl ? 'YES' : 'NO');
        newPoints = await loadImageAsPoints(currentImageUrl, currentDepthUrl);

        if (meshObject) { scene.remove(meshObject); meshObject = null; }
        if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
        points = newPoints;
        points.userData.transitionStartTime = clock.getElapsedTime();
        scene.add(points);
        toggleViewBtn.style.display = 'none';
        const depthMode = currentDepthUrl ? 'with DA3 depth' : 'with brightness depth';
        status.textContent = `✓ Loaded ${depthMode}`;

      } else {
        status.textContent = '✗ Please select a file first';
        status.style.color = '#ff4444';
        return;
      }

      status.style.color = '#4ade80';

    } catch (error) {
      console.error('Error loading:', error);
      status.textContent = `✗ Error: ${error.message}`;
      status.style.color = '#ff4444';
    }
  });
  
  resetBtn.addEventListener('click', async () => {
    status.textContent = 'Resetting...';

    const newPoints = await createDefaultPoints();

    if (meshObject) { scene.remove(meshObject); meshObject = null; }
    if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }

    points = newPoints;
    points.userData.transitionStartTime = clock.getElapsedTime();
    scene.add(points);

    toggleViewBtn.style.display = 'none';
    status.textContent = '✓ Reset to default';
    status.style.color = '#4ade80';
    imageInput.value = '';
    depthInput.value = '';
    if (da3ImageInput) da3ImageInput.value = '';
    currentImageUrl = null;
    currentDepthUrl = null;
    currentDa3ImageFile = null;
  });
  
  // Reload with current settings
  reloadBtn.addEventListener('click', async () => {
    if (!currentImageUrl) {
      status.textContent = '✗ No image loaded yet';
      status.style.color = '#ff4444';
      return;
    }
    
    status.textContent = 'Reloading with new settings...';
    
    try {
      const newPoints = await loadImageAsPoints(currentImageUrl, currentDepthUrl);
      
      if (points) {
        scene.remove(points);
        points.geometry.dispose();
        points.material.dispose();
      }
      
      points = newPoints;
      points.userData.transitionStartTime = clock.getElapsedTime();
      scene.add(points);
      
      status.textContent = '✓ Reloaded with new settings';
      status.style.color = '#4ade80';
    } catch (error) {
      console.error('Error reloading:', error);
      status.textContent = `✗ Error: ${error.message}`;
      status.style.color = '#ff4444';
    }
  });
  
  // Export canvas button
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportSceneAsCanvas();
    });
  }
}

// Export 3D scene as canvas/image
function exportSceneAsCanvas() {
  if (!points || !renderer) {
    alert('No scene to export. Please load a point cloud first.');
    return;
  }
  
  try {
    // Render the scene to get current frame
    renderer.render(scene, camera);
    
    // Get canvas data
    const canvas = renderer.domElement;
    const dataURL = canvas.toDataURL('image/png');
    
    // Create download link
    const link = document.createElement('a');
    link.download = `point-cloud-export-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    
    console.log('✓ Scene exported as PNG');
    
    // Also show in status
    const status = document.getElementById('status');
    if (status) {
      status.textContent = '✓ Scene exported as PNG';
      status.style.color = '#4ade80';
      setTimeout(() => {
        if (status.textContent === '✓ Scene exported as PNG') {
          status.textContent = '';
        }
      }, 3000);
    }
  } catch (error) {
    console.error('Error exporting scene:', error);
    alert('Error exporting scene: ' + error.message);
  }
}

// Setup slider controls
function setupSliders() {
  // Particle Count (skip)
  const skipSlider = document.getElementById('skipSlider');
  const skipValue = document.getElementById('skipValue');
  skipSlider.addEventListener('input', (e) => {
    particleSettings.skip = parseInt(e.target.value);
    const count = Math.floor((600 * 450) / (particleSettings.skip * particleSettings.skip));
    skipValue.textContent = `${particleSettings.skip} (≈${count.toLocaleString()} particles)`;
  });
  
  // Spread
  const spreadSlider = document.getElementById('spreadSlider');
  const spreadValue = document.getElementById('spreadValue');
  spreadSlider.addEventListener('input', (e) => {
    particleSettings.spread = parseFloat(e.target.value);
    spreadValue.textContent = particleSettings.spread.toFixed(1);
  });
  
  // Depth Multiplier
  const depthSlider = document.getElementById('depthSlider');
  const depthValue = document.getElementById('depthValue');
  depthSlider.addEventListener('input', (e) => {
    particleSettings.depthMultiplier = parseFloat(e.target.value);
    depthValue.textContent = particleSettings.depthMultiplier.toFixed(1);
  });
  
  // Particle Size Min
  const sizeMinSlider = document.getElementById('sizeMinSlider');
  const sizeMinValue = document.getElementById('sizeMinValue');
  sizeMinSlider.addEventListener('input', (e) => {
    particleSettings.particleSizeMin = parseFloat(e.target.value);
    sizeMinValue.textContent = particleSettings.particleSizeMin.toFixed(2);
  });
  
  // Particle Size Range
  const sizeRangeSlider = document.getElementById('sizeRangeSlider');
  const sizeRangeValue = document.getElementById('sizeRangeValue');
  sizeRangeSlider.addEventListener('input', (e) => {
    particleSettings.particleSizeRange = parseFloat(e.target.value);
    sizeRangeValue.textContent = particleSettings.particleSizeRange.toFixed(2);
  });
  
  // Aspect Ratio X
  const aspectXSlider = document.getElementById('aspectXSlider');
  const aspectXValue = document.getElementById('aspectXValue');
  aspectXSlider.addEventListener('input', (e) => {
    particleSettings.aspectRatioX = parseFloat(e.target.value);
    aspectXValue.textContent = particleSettings.aspectRatioX.toFixed(2);
  });
  
  // Aspect Ratio Y
  const aspectYSlider = document.getElementById('aspectYSlider');
  const aspectYValue = document.getElementById('aspectYValue');
  aspectYSlider.addEventListener('input', (e) => {
    particleSettings.aspectRatioY = parseFloat(e.target.value);
    aspectYValue.textContent = particleSettings.aspectYValue.toFixed(2);
  });
}
