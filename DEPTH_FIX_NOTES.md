# Depth Map Fix - Using True NPY Data

## Problem Fixed
The original implementation was using the PNG visualization (false-color map) as if it were actual depth data. This caused the background to appear as a giant floating sheet.

## Solution
Now using the actual NPY depth files (float arrays) instead of PNG visualizations.

## Changes Made

### 1. API Server (`api_server.py`)
- Now returns both `depth_npy` (actual depth data) and `depth_png` (visualization only)
- NPY data is base64-encoded for transmission

### 2. Frontend (`main.js`)
- Added `npyjs` library for loading NPY files
- Updated `loadDepthMap()` to:
  - Load actual NPY depth data when available
  - Use percentile clipping (1st-99th percentile) to remove outliers
  - Mask out far background/sky (depths > 75% of range)
  - Fallback to PNG with luminance extraction if NPY not available
- Updated `loadImageAsPoints()` to:
  - Match image dimensions to depth map dimensions
  - Skip masked pixels (far background) entirely
  - Use proper depth values from NPY

### 3. Key Improvements
- **Percentile Clipping**: Removes sky and far background automatically
- **Masking**: Pixels beyond threshold are marked as -1 and skipped
- **Proper Depth Values**: Uses actual float depth values, not color channels
- **Dimension Matching**: Image and depth map dimensions are matched

## Usage

When you upload an image:
1. API generates both NPY (depth data) and PNG (visualization)
2. Frontend automatically uses NPY data
3. Far background is automatically masked out
4. No more floating sky sheets!

## Technical Details

### NPY Loading
```javascript
const npy = new NPY();
const depth = await npy.load(npyData);
const raw = new Float32Array(depth.data);
```

### Depth Normalization
```javascript
// Percentile clipping
const dMin = sorted[Math.floor(0.01 * raw.length)]; // 1st percentile
const dMax = sorted[Math.floor(0.99 * raw.length)]; // 99th percentile
```

### Sky Masking
```javascript
if (depthNorm[i] > 0.75) {
  depthMasked[i] = -1; // Skip this pixel
}
```

## Testing

To test the fix:
1. Start API server: `python api_server.py`
2. Start frontend: `npm run dev`
3. Upload an image with sky/background
4. Verify that far background is masked out (no floating sheet)

