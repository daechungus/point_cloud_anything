# Depth Anything 3 Setup Guide

This guide shows you how to generate real depth maps for your particle cloud visualizations.

## Prerequisites

- Python ≥ 3.10
- PyTorch ≥ 2.0 (GPU recommended but not required)
- Git

## Installation

### 1. Create a Python Virtual Environment (Recommended)

```bash
# Windows
python -m venv da3-env
da3-env\Scripts\activate

# macOS/Linux
python3 -m venv da3-env
source da3-env/bin/activate
```

### 2. Install PyTorch

**With NVIDIA GPU (CUDA):**
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

**CPU only (slower but works):**
```bash
pip install torch torchvision
```

Check which command to use at: https://pytorch.org/get-started/locally/

### 3. Clone and Install Depth Anything 3

```bash
# Clone the repository
git clone https://github.com/ByteDance-Seed/Depth-Anything-3.git

# Enter directory
cd Depth-Anything-3

# Install with all dependencies
pip install -e .[all]
```

### 4. Copy Generation Script

Copy `generate_depth.py` from your project root to the `Depth-Anything-3` directory:

```bash
# From your project root
cp generate_depth.py Depth-Anything-3/
```

## Usage

### Generate Depth Map for an Image

```bash
# Make sure you're in the Depth-Anything-3 directory
cd Depth-Anything-3

# Activate your venv if not already active
# Windows: da3-env\Scripts\activate
# Linux/Mac: source da3-env/bin/activate

# Generate depth map
python generate_depth.py path/to/your/image.jpg
```

### Example

```bash
python generate_depth.py ../public/images/hanok.jpg
```

This will create:
- `public/depth/hanok_depth.png` - Grayscale depth map (for JS loading)
- `public/depth/hanok_depth.npy` - High-precision depth data
- `public/depth/hanok_depth.json` - Metadata

## In the Web App

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Upload your image** using the file input

3. **Toggle "Use Depth Map"** in the UI

4. **Upload the corresponding depth map** (the `_depth.png` file)

5. The particles will now use **real geometric depth** from DA3 instead of fake brightness-based depth!

## Models Available

- `depth-anything/DA3-BASE` (Default) - Apache 2.0, good balance
- `depth-anything/DA3MONO-LARGE` - Better quality, slower
- `depth-anything/DA3-SMALL` - Faster, less accurate

Change in `generate_depth.py` line 20.

## Troubleshooting

### "CUDA out of memory"
- Use CPU: The script auto-detects. CPU is slower but works.
- Or use a smaller image (resize before processing)

### "Module not found: depth_anything_3"
- Make sure you ran `pip install -e .[all]` inside the Depth-Anything-3 directory
- Make sure your venv is activated

### Generated depth looks wrong
- Try a different model (MONO-LARGE usually better)
- Check that the input image is clear and well-lit

## Performance

- **GPU (RTX 3060+)**: ~1-2 seconds per image
- **CPU**: ~10-30 seconds per image
- Memory: ~2-4GB VRAM (GPU) or ~4-8GB RAM (CPU)

## License

- Depth Anything 3: Apache 2.0 (BASE model) or CC BY-NC 4.0 (others)
- Check the [official repo](https://github.com/ByteDance-Seed/Depth-Anything-3) for details

