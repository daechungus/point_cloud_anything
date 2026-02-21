# Automatic Depth Map Integration

This integration automatically processes images through Depth Anything 3 when you upload them to the point cloud viewer, eliminating the need for manual depth map generation.

## 🚀 Quick Start

### 1. Install API Server Dependencies

```bash
cd point_cloud_anything
pip install -r requirements-api.txt
```

### 2. Ensure Depth Anything 3 is Accessible

The API server needs access to `depth_anything_3`. Make sure it's installed or accessible:

```bash
# Option 1: If depth_anything_3 is in the parent directory
# (Already configured in api_server.py)

# Option 2: Install depth_anything_3 in your environment
cd ../depth_anything_3
pip install -e .
```

### 3. Start the API Server

```bash
cd point_cloud_anything
python api_server.py
```

The server will start on `http://localhost:8000`

### 4. Start the Frontend

In a separate terminal:

```bash
cd point_cloud_anything
npm install  # If not already done
npm run dev
```

## ✨ How It Works

1. **Upload an Image**: When you upload an image in the web interface, it automatically:
   - Sends the image to the API server
   - Processes it through Depth Anything 3
   - Generates a depth map
   - Returns it to the frontend
   - Uses it to create a 3D point cloud with proper depth

2. **Export Canvas**: Click "Export as Canvas" to download the 3D scene as a PNG image that you can use on your website.

## 🎯 Features

- **Automatic Depth Generation**: No manual steps required
- **Real Depth Maps**: Uses Depth Anything 3 instead of brightness-based depth
- **Canvas Export**: Export your 3D scene as an image for use anywhere
- **Fallback Support**: If the API server isn't running, falls back to brightness-based depth

## 📝 API Endpoints

### POST `/api/generate-depth`
Generates a depth map from an uploaded image.

**Request**: Multipart form data with `file` field
**Response**: JSON with base64-encoded depth map PNG

### POST `/api/generate-point-cloud`
Generates a PLY point cloud file from an uploaded image.

**Request**: Multipart form data with `file` field
**Response**: JSON with base64-encoded PLY file

## 🔧 Configuration

You can modify the model used in `api_server.py`:

```python
MODEL_ID = "depth-anything/DA3-BASE"  # Fast, good quality
# MODEL_ID = "depth-anything/DA3METRIC-LARGE"  # Slower, best quality
```

## 🐛 Troubleshooting

### API Server Not Found
- Make sure the API server is running on port 8000
- Check that `depth_anything_3` is accessible
- Verify all dependencies are installed

### CORS Errors
- The API server has CORS enabled for all origins
- If you need to restrict it, modify `allow_origins` in `api_server.py`

### Model Loading Issues
- First run will download the model (may take a few minutes)
- Ensure you have enough disk space
- Check your internet connection

## 📦 Using Exported Images

Once you export a canvas:
1. The PNG file is downloaded to your default download folder
2. You can use it directly in your website:
   ```html
   <img src="point-cloud-export-1234567890.png" alt="3D Point Cloud" />
   ```
3. Or as a CSS background:
   ```css
   .background {
     background-image: url('point-cloud-export-1234567890.png');
     background-size: cover;
   }
   ```

## 🎨 Integration with Personal Website

To use the exported point cloud as a background in your personal website:

1. Export the canvas from the point cloud viewer
2. Copy the PNG to your website's static/images folder
3. Reference it in your CSS or HTML

Example for SvelteKit:
```svelte
<div class="background-container">
  <img src="/images/point-cloud-export.png" alt="Background" />
</div>
```

