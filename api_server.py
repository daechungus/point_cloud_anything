"""
FastAPI server for automatic depth map generation
Automatically processes images through Depth Anything 3 when uploaded
"""
import os
import sys
import shutil
import numpy as np
import imageio.v2 as imageio
import torch
import json
import base64
import tempfile
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from io import BytesIO

# Add depth_anything_3 to path
script_dir = os.path.dirname(os.path.abspath(__file__))
depth_anything_path = os.path.join(os.path.dirname(script_dir), 'depth_anything_3', 'src')
if depth_anything_path not in sys.path:
    sys.path.insert(0, depth_anything_path)

try:
    from depth_anything_3.api import DepthAnything3
except ImportError:
    print("ERROR: depth_anything_3 not found!")
    print(f"Looking in: {depth_anything_path}")
    print("\nPlease ensure depth_anything_3 is installed or accessible")
    sys.exit(1)

app = FastAPI(title="Depth Anything 3 API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache
_model = None
_device = None

def get_model():
    """Lazy load model on first request"""
    global _model, _device
    
    if _model is None:
        MODEL_ID = "depth-anything/DA3-BASE"  # Can be changed to DA3METRIC-LARGE for better quality
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Loading model: {MODEL_ID} on {_device}")
        _model = DepthAnything3.from_pretrained(MODEL_ID).to(device=_device)
        _model.eval()
        print("✓ Model loaded and ready")
    
    return _model, _device

@app.get("/")
async def root():
    return {"message": "Depth Anything 3 API Server", "status": "running"}

@app.post("/api/generate-depth")
async def generate_depth(file: UploadFile = File(...)):
    """
    Generate depth map from uploaded image
    Returns depth map as base64-encoded PNG
    """
    try:
        # Read uploaded image
        image_bytes = await file.read()
        image = imageio.imread(BytesIO(image_bytes))
        
        # Save temporarily for processing (cross-platform)
        temp_dir = tempfile.gettempdir()
        temp_input = os.path.join(temp_dir, f"depth_{file.filename}")
        imageio.imwrite(temp_input, image)
        
        # Get model
        model, device = get_model()
        
        # Run inference
        print(f"Processing: {file.filename}")
        with torch.no_grad():
            prediction = model.inference([temp_input])
        
        # Get depth map (actual float values, not visualization)
        depth = prediction.depth[0]
        print(f"✓ Depth map generated: {depth.shape}")
        
        # Get raw depth values
        d_min, d_max = float(depth.min()), float(depth.max())
        
        # Save as NPY (actual depth data)
        npy_buffer = BytesIO()
        np.save(npy_buffer, depth)
        npy_buffer.seek(0)
        depth_npy_base64 = base64.b64encode(npy_buffer.read()).decode('utf-8')
        
        # Also create normalized PNG for visualization (optional)
        depth_norm = (depth - d_min) / (d_max - d_min + 1e-8)
        depth_png = (depth_norm * 255).astype(np.uint8)
        png_buffer = BytesIO()
        imageio.imwrite(png_buffer, depth_png, format='PNG')
        png_buffer.seek(0)
        depth_png_base64 = base64.b64encode(png_buffer.read()).decode('utf-8')
        
        # Clean up temp file
        if os.path.exists(temp_input):
            os.remove(temp_input)
        
        return JSONResponse({
            "success": True,
            "depth_npy": f"data:application/octet-stream;base64,{depth_npy_base64}",  # Actual depth data
            "depth_png": f"data:image/png;base64,{depth_png_base64}",  # Visualization only
            "shape": list(depth.shape),
            "depth_range": {
                "min": d_min,
                "max": d_max
            }
        })
        
    except Exception as e:
        print(f"Error processing image: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-point-cloud")
async def generate_point_cloud(file: UploadFile = File(...)):
    """
    Generate point cloud (PLY format) from uploaded image
    Returns point cloud as base64-encoded PLY file
    """
    try:
        # Read uploaded image
        image_bytes = await file.read()
        image = imageio.imread(BytesIO(image_bytes))
        
        # Save temporarily (cross-platform)
        temp_dir = tempfile.gettempdir()
        temp_input = os.path.join(temp_dir, f"pointcloud_{file.filename}")
        imageio.imwrite(temp_input, image)
        
        # Get model
        model, device = get_model()
        
        # Run inference
        print(f"Processing for point cloud: {file.filename}")
        with torch.no_grad():
            prediction = model.inference([temp_input])
        
        # Get depth and image
        depth = prediction.depth[0]  # [H, W]
        processed_image = prediction.processed_images[0]  # [H, W, 3]
        
        # Create point cloud
        H, W = depth.shape
        fx = fy = W
        cx, cy = W / 2, H / 2
        
        # Create pixel coordinates
        u, v = np.meshgrid(np.arange(W), np.arange(H))
        
        # Back-project to 3D
        X = (u - cx) * depth / fx
        Y = (v - cy) * depth / fy
        Z = depth
        
        # Flatten
        points = np.stack([X, Y, Z], axis=-1).reshape(-1, 3)
        colors = processed_image.reshape(-1, 3) / 255.0
        
        # Sample points (every 2nd pixel for smaller file)
        sample_indices = np.arange(0, len(points), 2)
        points = points[sample_indices]
        colors = colors[sample_indices]
        
        # Create PLY file
        ply_content = create_ply_string(points, colors)
        
        # Encode as base64
        ply_base64 = base64.b64encode(ply_content.encode('utf-8')).decode('utf-8')
        
        # Clean up
        if os.path.exists(temp_input):
            os.remove(temp_input)
        
        return JSONResponse({
            "success": True,
            "point_cloud": f"data:application/octet-stream;base64,{ply_base64}",
            "point_count": len(points),
            "format": "ply"
        })
        
    except Exception as e:
        print(f"Error generating point cloud: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-glb")
async def generate_glb(file: UploadFile = File(...)):
    """
    Generate a 3D GLB model from uploaded image using DA3's full export pipeline.
    Uses predicted camera intrinsics/extrinsics and confidence filtering for accurate 3D.
    Returns the GLB file as base64-encoded binary.
    """
    try:
        image_bytes = await file.read()
        image = imageio.imread(BytesIO(image_bytes))

        temp_dir = tempfile.mkdtemp()
        temp_input = os.path.join(temp_dir, file.filename if file.filename else "input.jpg")
        imageio.imwrite(temp_input, image)

        model, device = get_model()

        print(f"Processing for GLB: {file.filename}")
        with torch.no_grad():
            prediction = model.inference(
                image=[temp_input],
                export_dir=temp_dir,
                export_format="glb",
                conf_thresh_percentile=40.0,
                num_max_points=500_000,
                show_cameras=False,
            )

        glb_path = os.path.join(temp_dir, "scene.glb")

        if not os.path.exists(glb_path):
            raise FileNotFoundError("GLB export did not produce scene.glb")

        with open(glb_path, "rb") as f:
            glb_b64 = base64.b64encode(f.read()).decode("utf-8")

        shutil.rmtree(temp_dir, ignore_errors=True)

        point_count = int(prediction.depth[0].size) if prediction.depth is not None else 0

        return JSONResponse({
            "success": True,
            "glb": f"data:model/gltf-binary;base64,{glb_b64}",
            "point_count": point_count,
        })

    except Exception as e:
        print(f"Error generating GLB: {e}")
        import traceback
        traceback.print_exc()
        # Clean up temp dir if it exists
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))


def create_ply_string(points, colors):
    """Create PLY file content as string"""
    header = f"""ply
format ascii 1.0
element vertex {len(points)}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
"""
    
    lines = [header]
    for p, c in zip(points, colors):
        lines.append(f"{p[0]:.6f} {p[1]:.6f} {p[2]:.6f} {int(c[0]*255)} {int(c[1]*255)} {int(c[2]*255)}\n")
    
    return ''.join(lines)

if __name__ == "__main__":
    print("Starting Depth Anything 3 API Server...")
    print("Server will be available at http://localhost:8000")
    print("API docs at http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)

