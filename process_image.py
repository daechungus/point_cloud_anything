"""
Quick script to process an image through the automatic depth API
Usage: python process_image.py <image_path>
"""
import sys
import requests
import json
from pathlib import Path

API_URL = "http://localhost:8000/api/generate-depth"

def process_image(image_path):
    """Process an image through the depth API"""
    
    if not Path(image_path).exists():
        print(f"Error: Image not found: {image_path}")
        return
    
    print(f"Processing: {image_path}")
    print("Sending to API server...")
    
    try:
        with open(image_path, 'rb') as f:
            files = {'file': (Path(image_path).name, f, 'image/jpeg')}
            response = requests.post(API_URL, files=files)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✓ Depth map generated successfully!")
                print(f"  Shape: {data['shape']}")
                print(f"  Depth range: {data['depth_range']['min']:.3f} to {data['depth_range']['max']:.3f}")
                
                # Save depth map
                import base64
                depth_data = data['depth_map'].split(',')[1]  # Remove data:image/png;base64,
                depth_bytes = base64.b64decode(depth_data)
                
                output_path = Path(image_path).stem + "_depth.png"
                with open(output_path, 'wb') as f:
                    f.write(depth_bytes)
                
                print(f"✓ Saved depth map: {output_path}")
                print("\nYou can now:")
                print("1. Open the web interface (npm run dev)")
                print("2. Upload the original image")
                print("3. The depth map will be automatically loaded")
                print(f"4. Or manually upload {output_path} as the depth map")
                
            else:
                print("Error: API returned unsuccessful response")
        else:
            print(f"Error: Server returned status {response.status_code}")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to API server")
        print("Make sure the API server is running:")
        print("  python api_server.py")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python process_image.py <image_path>")
        print("\nExample:")
        print("  python process_image.py ../depth_anything_3/scripts/input_images/autumn_palace.webp")
        sys.exit(1)
    
    process_image(sys.argv[1])

