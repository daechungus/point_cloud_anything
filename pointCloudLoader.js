/**
 * Point Cloud Loader
 * Supports PLY, XYZ, PCD, and JSON formats from 3D Point Cloud Anything
 */

/**
 * Load PLY format point cloud
 */
export async function loadPLY(file) {
  const text = await file.text();
  const lines = text.split('\n');
  
  let vertexCount = 0;
  let headerEnd = 0;
  let hasColors = false;
  
  // Parse header
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('element vertex')) {
      vertexCount = parseInt(line.split(' ')[2]);
    }
    
    if (line.includes('property') && (line.includes('red') || line.includes('diffuse_red'))) {
      hasColors = true;
    }
    
    if (line === 'end_header') {
      headerEnd = i + 1;
      break;
    }
  }
  
  console.log(`PLY: ${vertexCount} vertices, colors: ${hasColors}`);
  
  const positions = [];
  const colors = [];
  
  // Parse vertex data
  for (let i = headerEnd; i < headerEnd + vertexCount && i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 3) continue;
    
    // Position (x, y, z)
    positions.push(
      parseFloat(parts[0]),
      parseFloat(parts[1]),
      parseFloat(parts[2])
    );
    
    // Color (r, g, b) - normalize from 0-255 to 0-1
    if (hasColors && parts.length >= 6) {
      colors.push(
        parseInt(parts[3]) / 255,
        parseInt(parts[4]) / 255,
        parseInt(parts[5]) / 255
      );
    } else {
      // Default color if none provided
      colors.push(0.7, 0.7, 0.7);
    }
  }
  
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    count: positions.length / 3,
    format: 'PLY'
  };
}

/**
 * Load XYZ format point cloud (simple text format: x y z [r g b])
 */
export async function loadXYZ(file) {
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  
  const positions = [];
  const colors = [];
  
  for (const line of lines) {
    const parts = line.trim().split(/\s+/).map(parseFloat);
    if (parts.length < 3) continue;
    
    positions.push(parts[0], parts[1], parts[2]);
    
    if (parts.length >= 6) {
      // RGB provided (0-255 or 0-1)
      const r = parts[3] > 1 ? parts[3] / 255 : parts[3];
      const g = parts[4] > 1 ? parts[4] / 255 : parts[4];
      const b = parts[5] > 1 ? parts[5] / 255 : parts[5];
      colors.push(r, g, b);
    } else {
      colors.push(0.7, 0.7, 0.7);
    }
  }
  
  console.log(`XYZ: ${positions.length / 3} points`);
  
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    count: positions.length / 3,
    format: 'XYZ'
  };
}

/**
 * Load JSON format point cloud (from 3D Point Cloud Anything)
 */
export async function loadJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  
  let positions, colors;
  
  // Handle different JSON structures
  if (data.vertices && data.colors) {
    // Format: {vertices: [[x,y,z], ...], colors: [[r,g,b], ...]}
    positions = new Float32Array(data.vertices.flat());
    colors = new Float32Array(data.colors.flat().map(c => c > 1 ? c / 255 : c));
  } else if (data.points) {
    // Format: {points: [{x, y, z, r, g, b}, ...]}
    positions = new Float32Array(data.points.length * 3);
    colors = new Float32Array(data.points.length * 3);
    
    data.points.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      
      colors[i * 3] = (p.r || 0) > 1 ? p.r / 255 : (p.r || 0.7);
      colors[i * 3 + 1] = (p.g || 0) > 1 ? p.g / 255 : (p.g || 0.7);
      colors[i * 3 + 2] = (p.b || 0) > 1 ? p.b / 255 : (p.b || 0.7);
    });
  } else if (Array.isArray(data)) {
    // Format: [[x,y,z,r,g,b], ...]
    positions = new Float32Array(data.length * 3);
    colors = new Float32Array(data.length * 3);
    
    data.forEach((p, i) => {
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
      
      if (p.length >= 6) {
        colors[i * 3] = p[3] > 1 ? p[3] / 255 : p[3];
        colors[i * 3 + 1] = p[4] > 1 ? p[4] / 255 : p[4];
        colors[i * 3 + 2] = p[5] > 1 ? p[5] / 255 : p[5];
      } else {
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0.7;
      }
    });
  } else {
    throw new Error('Unsupported JSON point cloud format');
  }
  
  console.log(`JSON: ${positions.length / 3} points`);
  
  return {
    positions,
    colors,
    count: positions.length / 3,
    format: 'JSON'
  };
}

/**
 * Load NPY format (NumPy array from Python)
 * Basic parser for .npy files
 */
export async function loadNPY(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  
  // Read NPY header
  const magic = String.fromCharCode(view.getUint8(0)) + String.fromCharCode(view.getUint8(1));
  if (magic !== '\x93N') {
    throw new Error('Not a valid NPY file');
  }
  
  const headerLen = view.getUint16(8, true);
  const headerBytes = new Uint8Array(buffer, 10, headerLen);
  const header = new TextDecoder().decode(headerBytes);
  
  // Parse shape from header
  const shapeMatch = header.match(/'shape':\s*\((\d+),\s*(\d+)\)/);
  if (!shapeMatch) {
    throw new Error('Could not parse NPY shape');
  }
  
  const rows = parseInt(shapeMatch[1]);
  const cols = parseInt(shapeMatch[2]);
  
  // Read data (assume float32)
  const dataStart = 10 + headerLen;
  const data = new Float32Array(buffer, dataStart);
  
  // Assume format: N x 6 (x, y, z, r, g, b)
  const positions = new Float32Array(rows * 3);
  const colors = new Float32Array(rows * 3);
  
  for (let i = 0; i < rows; i++) {
    positions[i * 3] = data[i * cols];
    positions[i * 3 + 1] = data[i * cols + 1];
    positions[i * 3 + 2] = data[i * cols + 2];
    
    if (cols >= 6) {
      colors[i * 3] = data[i * cols + 3] > 1 ? data[i * cols + 3] / 255 : data[i * cols + 3];
      colors[i * 3 + 1] = data[i * cols + 4] > 1 ? data[i * cols + 4] / 255 : data[i * cols + 4];
      colors[i * 3 + 2] = data[i * cols + 5] > 1 ? data[i * cols + 5] / 255 : data[i * cols + 5];
    } else {
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0.7;
    }
  }
  
  console.log(`NPY: ${rows} points`);
  
  return {
    positions,
    colors,
    count: rows,
    format: 'NPY'
  };
}

/**
 * Auto-detect and load point cloud file
 */
export async function loadPointCloud(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  
  console.log(`Loading point cloud: ${file.name} (${ext})`);
  
  try {
    switch (ext) {
      case 'ply':
        return await loadPLY(file);
      case 'xyz':
      case 'pts':
        return await loadXYZ(file);
      case 'json':
        return await loadJSON(file);
      case 'npy':
        return await loadNPY(file);
      default:
        throw new Error(`Unsupported format: ${ext}`);
    }
  } catch (error) {
    console.error('Error loading point cloud:', error);
    throw error;
  }
}

/**
 * Normalize and center point cloud
 */
export function normalizePointCloud(pointCloud, targetSize = 6) {
  const { positions } = pointCloud;
  
  // Find bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  
  // Calculate center and scale
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxSize = Math.max(sizeX, sizeY, sizeZ);
  const scale = targetSize / maxSize;
  
  // Normalize positions
  const normalized = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    normalized[i] = (positions[i] - centerX) * scale;
    normalized[i + 1] = (positions[i + 1] - centerY) * scale;
    normalized[i + 2] = (positions[i + 2] - centerZ) * scale;
  }
  
  console.log(`Normalized to size ${targetSize}, scale: ${scale.toFixed(3)}`);
  
  return {
    ...pointCloud,
    positions: normalized
  };
}

