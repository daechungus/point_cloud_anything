# Jitter Customization Guide

## Where the Jitter Happens

The jitter effect is created in **two places**:

### 1. JavaScript: Jitter Data Generation (Lines ~350-372)

This creates the random offsets and speeds for each particle:

```javascript
// Add random offsets for independent jitter (per particle)
const jitterOffsets = [];
const jitterSpeeds = [];
for (let i = 0; i < particleCount; i++) {
  jitterOffsets.push(
    Math.random() * Math.PI * 2,  // X offset (0 to 2π)
    Math.random() * Math.PI * 2,  // Y offset (0 to 2π)
    Math.random() * Math.PI * 2   // Z offset (0 to 2π)
  );
  jitterSpeeds.push(
    0.3 + Math.random() * 0.4,  // X speed (0.3 to 0.7)
    0.3 + Math.random() * 0.4,  // Y speed (0.3 to 0.7)
    0.3 + Math.random() * 0.4   // Z speed (0.3 to 0.7)
  );
}
```

### 2. Vertex Shader: Jitter Application (Lines 418-435)

This applies the jitter to particle positions:

```glsl
// Phase 2: After transition, add independent jitter
if (transitionProgress >= 1.0) {
  float jitterTime = uTime - uTransitionDuration;
  
  // Independent jitter for each particle
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
```

### 3. Jitter Amount Control (Line ~380)

The intensity is controlled by a uniform:

```javascript
uJitterAmount: { value: 0.15 } // Amount of independent jitter
```

## How to Customize

### Option 1: Change Jitter Intensity (Easiest)

**Line ~380** - Change the `uJitterAmount` value:
- `0.0` = No jitter (particles stay in place)
- `0.15` = Current default (subtle movement)
- `0.5` = Moderate jitter
- `1.0` = Strong jitter (particles move a lot)

```javascript
uJitterAmount: { value: 0.5 } // Increase for more movement
```

### Option 2: Change Jitter Speed

**Lines 359-363** - Modify the speed range:
- Current: `0.3 + Math.random() * 0.4` (range: 0.3 to 0.7)
- Faster: `0.5 + Math.random() * 0.5` (range: 0.5 to 1.0)
- Slower: `0.1 + Math.random() * 0.2` (range: 0.1 to 0.3)

```javascript
jitterSpeeds.push(
  0.5 + Math.random() * 0.5,  // Faster jitter
  0.5 + Math.random() * 0.5,
  0.5 + Math.random() * 0.5
);
```

### Option 3: Change Jitter Pattern

**Lines 423-427** - Modify the jitter calculation in the shader:

**Current (sine wave):**
```glsl
vec3 jitter = vec3(
  sin(jitterTime * jitterSpeed.x + jitterOffset.x),
  sin(jitterTime * jitterSpeed.y + jitterOffset.y),
  sin(jitterTime * jitterSpeed.z + jitterOffset.z)
);
```

**More chaotic (add noise):**
```glsl
vec3 jitter = vec3(
  sin(jitterTime * jitterSpeed.x + jitterOffset.x) * cos(jitterTime * 0.7),
  sin(jitterTime * jitterSpeed.y + jitterOffset.y) * sin(jitterTime * 0.5),
  sin(jitterTime * jitterSpeed.z + jitterOffset.z) * cos(jitterTime * 0.9)
);
```

**Smoother (use cosine):**
```glsl
vec3 jitter = vec3(
  cos(jitterTime * jitterSpeed.x + jitterOffset.x),
  cos(jitterTime * jitterSpeed.y + jitterOffset.y),
  cos(jitterTime * jitterSpeed.z + jitterOffset.z)
);
```

### Option 4: Disable Floating Motion

**Line 433** - Comment out or remove the floating motion:

```glsl
// Comment this out to disable floating:
// float floatOffset = sin(uTime * 0.3 + basePosition.x * 2.0 + basePosition.y * 2.0) * 0.05;
// pos.y += floatOffset;
```

Or change the intensity:
```glsl
float floatOffset = sin(uTime * 0.3 + basePosition.x * 2.0 + basePosition.y * 2.0) * 0.02; // Reduced from 0.05
```

### Option 5: Make Jitter Directional

**Line 430** - Apply jitter only to specific axes:

```glsl
// Only jitter on X and Y (no Z movement)
pos.xy += jitter.xy * uJitterAmount;

// Or only vertical jitter
pos.y += jitter.y * uJitterAmount;
```

### Option 6: Add User Control (Slider)

Add a slider in the HTML and connect it:

**In HTML (index.html):**
```html
<label>Jitter Amount <span id="jitterValue">0.15</span></label>
<input type="range" id="jitterSlider" min="0" max="1" step="0.05" value="0.15">
```

**In JavaScript (main.js) - Add to setupSliders():**
```javascript
const jitterSlider = document.getElementById('jitterSlider');
const jitterValue = document.getElementById('jitterValue');
jitterSlider.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  if (points && points.material && points.material.uniforms) {
    points.material.uniforms.uJitterAmount.value = value;
  }
  jitterValue.textContent = value.toFixed(2);
});
```

## Quick Reference

| What | Where | How to Change |
|------|-------|---------------|
| **Jitter Intensity** | Line ~380 | Change `uJitterAmount.value` |
| **Jitter Speed** | Lines 359-363 | Change speed range values |
| **Jitter Pattern** | Lines 423-427 | Modify sin/cos functions |
| **Floating Motion** | Line 433 | Change or remove `floatOffset` |
| **Jitter Direction** | Line 430 | Apply to specific axes only |

## Example: Remove Jitter Completely

To disable jitter entirely, set:

```javascript
uJitterAmount: { value: 0.0 } // Line ~380
```

And comment out the jitter code in the shader (lines 418-435):

```glsl
// Phase 2: After transition, add independent jitter
// if (transitionProgress >= 1.0) {
//   ... jitter code ...
// }
```

## Example: Make Jitter More Dramatic

```javascript
// Line ~380: Increase intensity
uJitterAmount: { value: 0.5 }

// Lines 359-363: Increase speed
jitterSpeeds.push(
  0.8 + Math.random() * 0.4,  // Faster (0.8 to 1.2)
  0.8 + Math.random() * 0.4,
  0.8 + Math.random() * 0.4
);
```


