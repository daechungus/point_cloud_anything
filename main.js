import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer, controls;
let points;
let clock = new THREE.Clock();
let frameCount = 0;

init();
animate();

// Initialize with default gradient, then allow image upload
createDefaultPoints().then(p => {
  points = p;
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
  camera.position.set(0, 0, 4); // Move camera further back
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

// Load depth map (from Depth Anything 3 or similar)
async function loadDepthMap(src) {
  console.log('Loading depth map:', src.substring(0, 50));
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
  
  // Depth PNG is grayscale (r=g=b)
  for (let i = 0; i < depthValues.length; i++) {
    const j = i * 4;
    const v = depthData[j] / 255; // 0-1, where 0=near, 1=far (or vice versa)
    depthValues[i] = v;
  }
  
  console.log('✓ Depth map loaded:', targetWidth, 'x', targetHeight);
  return { width: targetWidth, height: targetHeight, depthValues };
}

// 2. Convert image → point cloud
async function loadImageAsPoints(src, depthMapSrc = null) {
  console.log('Loading image:', src.substring(0, 50));
  const img = await loadImage(src);
  console.log('Image loaded:', img.width, 'x', img.height);
  
  // Load depth map if provided
  let depthMap = null;
  if (depthMapSrc) {
    depthMap = await loadDepthMap(depthMapSrc);
    console.log('✓ Using DA3 depth map');
  } else {
    console.log('✓ Using brightness-based depth');
  }

  // Draw to canvas and grab pixels
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const targetWidth = 600; // Adjust for more/fewer particles
  const scale = targetWidth / img.width;
  const targetHeight = Math.floor(img.height * scale);

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
  console.log('Image data extracted');

  //# of particles and pixels
  const skip = 2; 
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
      let nx = ((x / targetWidth) * 2 - 1) * aspect;
      let ny = 1 - (y / targetHeight) * 2;

      // Depth calculation
      let nz;
      if (depthMap) {
        // Use real depth from DA3
        const idx = y * targetWidth + x;
        const d = depthMap.depthValues[idx]; // 0 (near) to 1 (far)
        
        // Invert so nearer = closer to camera (larger z)
        // Map to wider range for more dramatic depth
        nz = (1.0 - d) * 2.0 - 1.0; // [-1, 1]
        nz *= 1.5; // Amplify depth effect
      } else {
        // Fallback: brightness-based depth
        nz = (brightness - 0.5) * 0.9;
      }

      // spread of pixels
      const SPREAD = 6;

      positions.push(nx * SPREAD, ny * SPREAD, nz * SPREAD);
      
      // Slightly desaturate for atmospheric look
      const avg = (r + g + b) / 3;
      const mixFactor = 0.3;
      const rr = avg * mixFactor + r * (1 - mixFactor);
      const gg = avg * mixFactor + g * (1 - mixFactor);
      const bb = avg * mixFactor + b * (1 - mixFactor);

      colors.push(rr, gg, bb);
      
      //particle size
      //adjusting size of point cloud
      sizes.push(0.3 + Math.random() * 0.1);
      
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

  // Store original positions for animation
  geometry.setAttribute(
    'basePosition',
    new THREE.Float32BufferAttribute(positions.slice(), 3)
  );

  // Custom shader for better particle rendering
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() }
    },
    vertexShader: `
      precision highp float;
      
      attribute float size;
      attribute float opacity;
      attribute vec3 basePosition;
      
      uniform float uTime;
      uniform float uPixelRatio;
      
      varying vec3 vColor;
      varying float vOpacity;
      
      void main() {
        vColor = color;
        vOpacity = opacity;
        
        // Gentle floating motion
        vec3 pos = position;
        float offset = sin(uTime * 0.5 + basePosition.x * 5.0 + basePosition.y * 5.0) * 0.02;
        pos.y += offset;
        pos.z += offset * 0.5;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Much smaller points
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

// 3. Animate: subtle pulsation + slow camera drift
function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  if (points) {
    if (points.material.uniforms) {
      points.material.uniforms.uTime.value = t;
    }
    
    // Subtle rotation
    points.rotation.y = Math.sin(t * 0.1) * 0.2;
    points.rotation.x = Math.cos(t * 0.15) * 0.1 - 0.1;
    
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
  const status = document.getElementById('status');
  const resetBtn = document.getElementById('resetBtn');
  
  if (!imageInput) return;
  
  let currentImageUrl = null;
  let currentDepthUrl = null;
  
  // Handle image upload
  imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    currentImageUrl = URL.createObjectURL(file);
    status.textContent = 'Image loaded. Add depth map or click "Load" to use brightness-based depth.';
    status.style.color = '#888';
  });
  
  // Handle depth map upload
  depthInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    currentDepthUrl = URL.createObjectURL(file);
    status.textContent = 'Depth map loaded. Click "Load" to apply.';
    status.style.color = '#888';
  });
  
  // Load button
  const loadBtn = document.getElementById('loadBtn');
  loadBtn.addEventListener('click', async () => {
    if (!currentImageUrl) {
      status.textContent = '✗ Please select an image first';
      status.style.color = '#ff4444';
      return;
    }
    
    status.textContent = 'Loading...';
    console.log('Loading with depth:', currentDepthUrl ? 'YES' : 'NO');
    
    try {
      const newPoints = await loadImageAsPoints(currentImageUrl, currentDepthUrl);
      
      // Remove old points
      if (points) {
        scene.remove(points);
        points.geometry.dispose();
        points.material.dispose();
      }
      
      points = newPoints;
      scene.add(points);
      
      const depthMode = currentDepthUrl ? 'with DA3 depth' : 'with brightness depth';
      status.textContent = `✓ Loaded ${depthMode}`;
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
    
    if (points) {
      scene.remove(points);
      points.geometry.dispose();
      points.material.dispose();
    }
    
    points = newPoints;
    scene.add(points);
    
    status.textContent = '✓ Reset to default';
    status.style.color = '#4ade80';
    input.value = '';
  });
}
