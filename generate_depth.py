"""
Depth Anything 3 - Depth Map Generator
Generates depth maps from images for use in Three.js point cloud visualization
"""
import os
import sys
import numpy as np
import imageio.v2 as imageio
import torch
import json
from pathlib import Path

try:
    from depth_anything_3.api import DepthAnything3
except ImportError:
    print("ERROR: depth_anything_3 not found!")
    print("\nPlease install Depth Anything 3:")
    print("1. git clone https://github.com/ByteDance-Seed/Depth-Anything-3.git")
    print("2. cd Depth-Anything-3")
    print("3. pip install -e .[all]")
    sys.exit(1)

# Configuration
MODEL_ID = "depth-anything/DA3-BASE"  # Apache 2.0 license
INPUT_DIR = "public/images"
OUTPUT_DIR = "public/depth"

def generate_depth_map(input_path, output_base_name):
    """Generate depth map from an input image"""
    
    print(f"\n{'='*60}")
    print(f"Processing: {input_path}")
    print(f"{'='*60}")
    
    # Setup device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    # Load model
    print(f"Loading model: {MODEL_ID}...")
    model = DepthAnything3.from_pretrained(MODEL_ID).to(device=device)
    print("✓ Model loaded")
    
    # Run inference
    print("Running depth inference...")
    prediction = model.inference([input_path])
    
    # Get depth map (H, W)
    depth = prediction.depth[0]
    print(f"✓ Depth map generated: {depth.shape}")
    
    # Normalize to 0-1
    d_min, d_max = depth.min(), depth.max()
    depth_norm = (depth - d_min) / (d_max - d_min + 1e-8)
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Save as PNG (grayscale, for visualization and loading in JS)
    depth_png = (depth_norm * 255).astype(np.uint8)
    png_path = f"{OUTPUT_DIR}/{output_base_name}_depth.png"
    imageio.imwrite(png_path, depth_png)
    print(f"✓ Saved PNG: {png_path}")
    
    # Save raw depth as NPY (higher precision)
    npy_path = f"{OUTPUT_DIR}/{output_base_name}_depth.npy"
    np.save(npy_path, depth_norm)
    print(f"✓ Saved NPY: {npy_path}")
    
    # Save metadata as JSON
    metadata = {
        "input_image": str(input_path),
        "depth_png": png_path,
        "depth_npy": npy_path,
        "shape": list(depth.shape),
        "depth_range": {
            "min": float(d_min),
            "max": float(d_max)
        },
        "normalized": True
    }
    
    json_path = f"{OUTPUT_DIR}/{output_base_name}_depth.json"
    with open(json_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"✓ Saved metadata: {json_path}")
    
    print(f"\n{'='*60}")
    print("✓ COMPLETE!")
    print(f"{'='*60}\n")
    
    return metadata

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_depth.py <image_path>")
        print("\nExample:")
        print("  python generate_depth.py public/images/hanok.jpg")
        print("  python generate_depth.py my_image.png")
        sys.exit(1)
    
    input_path = sys.argv[1]
    
    if not os.path.exists(input_path):
        print(f"ERROR: Image not found: {input_path}")
        sys.exit(1)
    
    # Get output base name from input filename
    base_name = Path(input_path).stem
    
    try:
        metadata = generate_depth_map(input_path, base_name)
        
        print("\nTo use in Three.js:")
        print(f"1. Copy {metadata['depth_png']} to your public folder")
        print(f"2. In the UI, toggle 'Use Depth Map'")
        print(f"3. Upload both the original image and depth map")
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

