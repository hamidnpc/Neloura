import sys
import os
import threading
import time
from fastapi import FastAPI, Response, Body, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import numpy as np
import io
from astropy.io import fits
from astropy.wcs import WCS
from astropy.table import Table
from astropy.coordinates import SkyCoord
import astropy.units as u
import json
from pathlib import Path
import struct
import base64
import glob
import re
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas
from astropy.nddata import Cutout2D
from mpl_toolkits.axes_grid1.inset_locator import inset_axes
from matplotlib.colors import PowerNorm
from astropy.visualization import ImageNormalize
from regions import CircleSkyRegion
import math
from reproject import reproject_interp
from spectral_cube import Projection
from astropy.io import fits as fits_io
from io import BytesIO
import threading
import queue
import tempfile
import shutil
from skimage.transform import resize
from pathlib import Path
import numpy as np
import io
from PIL import Image
import base64
import json
from fastapi import UploadFile, File
import re
import time
from types import SimpleNamespace  # Add this import

# Determine if we're running locally or on a server
RUNNING_ON_SERVER = os.getenv("RUN_SERVER", "False").lower() == "true"

# FastAPI app
app = FastAPI()

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Create a catalogs directory if it doesn't exist
catalogs_dir = Path("catalogs")
catalogs_dir.mkdir(exist_ok=True)

# Global variable to store loaded catalog data
loaded_catalogs = {}

# Cache for catalog data to avoid re-reading files
catalog_cache = {}

# Serve static HTML page for OpenSeadragon
@app.get("/")
async def home():
    return FileResponse("static/index.html")

@app.get("/favicon.ico")
async def favicon():
    return FileResponse("static/favicon.ico")

@app.get("/list-catalogs/")
async def list_catalogs():
    """List available catalog files."""
    try:
        catalogs = []
        for file_path in catalogs_dir.glob("*.fits"):
            catalogs.append({
                "name": file_path.name,
                "path": str(file_path),
                "size": file_path.stat().st_size,
                "modified": file_path.stat().st_mtime
            })
        
        return JSONResponse(content={"catalogs": catalogs})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to list catalogs: {str(e)}"}
        )


import glob
import os
from pathlib import Path


# Add these imports to your main.py file
import threading
import queue
import tempfile
import shutil
from skimage.transform import resize
from pathlib import Path
import numpy as np
import io
from PIL import Image
import base64
import json

# Define a tile cache to store generated tiles
class TileCache:
    def __init__(self, max_size=100):
        self.cache = {}  # Dictionary to store tiles
        self.max_size = max_size
        self.queue = []  # Queue to track tile usage order
        self.lock = threading.Lock()  # Lock for thread safety
    
    def get(self, key):
        with self.lock:
            if key in self.cache:
                # Move this tile to the end of the queue (most recently used)
                self.queue.remove(key)
                self.queue.append(key)
                return self.cache[key]
            return None
    
    def put(self, key, value):
        with self.lock:
            if key in self.cache:
                # Update existing entry
                self.cache[key] = value
                self.queue.remove(key)
                self.queue.append(key)
            else:
                # Add new entry, potentially evicting the oldest one
                if len(self.queue) >= self.max_size:
                    oldest = self.queue.pop(0)
                    del self.cache[oldest]
                self.cache[key] = value
                self.queue.append(key)
    
    def clear(self):
        with self.lock:
            self.cache = {}
            self.queue = []

# Global tile cache
tile_cache = TileCache(max_size=1000)  # Cache up to 1000 tiles

# Global dictionary to store tile generators for active FITS files
active_tile_generators = {}

# Add this endpoint to your FastAPI application for histogram data

@app.get("/fits-histogram/")
async def get_fits_histogram(bins: int = Query(100)):
    """Generate histogram data for the current FITS file."""
    try:
        # Check if a FITS file is loaded
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            return JSONResponse(
                status_code=400,
                content={"error": "No FITS file currently loaded"}
            )
        
        # Open the FITS file
        with fits.open(fits_file) as hdul:
            # Find the HDU with image data
            hdu = None
            for i, h in enumerate(hdul):
                if hasattr(h, 'data') and h.data is not None and len(getattr(h, 'shape', [])) >= 2:
                    hdu = h
                    break
            
            if hdu is None:
                return JSONResponse(
                    status_code=400,
                    content={"error": "No image data found in FITS file"}
                )
            
            # Get the image data
            image_data = hdu.data
            
            # Handle different dimensionality
            if len(image_data.shape) > 2:
                # For 3D data, take the first slice
                if len(image_data.shape) == 3:
                    image_data = image_data[0]
                # For 4D data, take the first slice of the first volume
                elif len(image_data.shape) == 4:
                    image_data = image_data[0, 0]
            
            # Calculate min and max values
            valid_mask = np.isfinite(image_data)
            if np.any(valid_mask):
                min_value = float(np.min(image_data[valid_mask]))
                max_value = float(np.max(image_data[valid_mask]))
            else:
                min_value = 0
                max_value = 1
            
            # Calculate the histogram
            # For large images, sample data instead of using all pixels
            if image_data.size > 1000000:  # More than a million pixels
                # Calculate sampling rate to get around 100,000 samples
                sample_rate = max(1, int(np.sqrt(image_data.size / 100000)))
                
                # Sample the data
                sampled_data = image_data[::sample_rate, ::sample_rate]
                
                # Calculate histogram on sampled data
                hist, bin_edges = np.histogram(
                    sampled_data[np.isfinite(sampled_data)],
                    bins=bins,
                    range=(min_value, max_value)
                )
            else:
                # For smaller images, use all data
                hist, bin_edges = np.histogram(
                    image_data[np.isfinite(image_data)],
                    bins=bins,
                    range=(min_value, max_value)
                )
            
            # Convert to Python types for JSON serialization
            hist_data = {
                "counts": hist.tolist(),
                "bin_edges": bin_edges.tolist(),
                "min_value": min_value,
                "max_value": max_value,
                "width": image_data.shape[1],
                "height": image_data.shape[0],
                "sampled": image_data.size > 1000000
            }
            
            return JSONResponse(content=hist_data)
    
    except Exception as e:
        print(f"Error generating histogram: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate histogram: {str(e)}"}
        )

# Optimized version of FitsTileGenerator with faster downsampling
# Add this endpoint to main.py to handle FITS file uploads

from fastapi import UploadFile, File
import re
import time
from pathlib import Path
import shutil


# Add this proxy endpoint to main.py to handle CORS issues with external URLs

import aiohttp
from fastapi import Query
import os
import uuid

# Add these endpoints to main.py to handle FITS file uploads and proxy downloads

from fastapi import UploadFile, File, Request
import re
import time
from pathlib import Path
import shutil
import aiohttp
import ssl
import certifi
from fastapi.responses import Response

@app.post("/upload-fits/")
async def upload_fits_file(file: UploadFile = File(...)):
    """Upload a FITS file to the server."""
    try:
        # Create the 'uploads' directory if it doesn't exist
        uploads_dir = Path("files/uploads")
        uploads_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate a safe filename
        original_filename = file.filename
        safe_filename = re.sub(r'[^\w\-\.]', '_', original_filename)
        
        # Add timestamp to ensure uniqueness
        timestamp = int(time.time())
        filename_parts = safe_filename.split('.')
        if len(filename_parts) > 1:
            # Insert timestamp before the extension
            ext = filename_parts[-1]
            base = '.'.join(filename_parts[:-1])
            safe_filename = f"{base}_{timestamp}.{ext}"
        else:
            safe_filename = f"{safe_filename}_{timestamp}"
        
        # Construct the file path
        file_path = uploads_dir / safe_filename
        
        # Write the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Return the relative path for loading
        return JSONResponse(content={
            "message": "File uploaded successfully",
            "filepath": f"uploads/{safe_filename}"
        })
    except Exception as e:
        import traceback
        print(f"Error uploading file: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to upload file: {str(e)}"}
        )


# Add this to your main.py file to improve the proxy functionality for NED

import aiohttp
import ssl
import certifi
from fastapi.responses import Response

# Enhanced proxy endpoint for NED requests
@app.get("/ned-proxy/")
async def ned_proxy(url: str):
    """
    Enhanced proxy endpoint for accessing NED data.
    Handles different response formats and special requirements for NED.
    """
    try:
        print(f"Proxying NED request: {url}")
        
        # Create custom headers that mimic a browser
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        }
        
        # Create a custom SSL context that's optimized for astronomy services
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE  # Disables certificate verification
        
        # Use aiohttp to make the request
        conn = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=conn) as session:
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if not response.ok:
                    return JSONResponse(
                        status_code=response.status,
                        content={"error": f"NED request failed: HTTP {response.status}"}
                    )
                
                # Determine the content type
                content_type = response.headers.get("Content-Type", "text/html")
                
                # Check the response content type to determine how to process it
                if "image" in content_type or "fits" in content_type.lower():
                    # For FITS files and images, return as binary data
                    content = await response.read()
                    return Response(
                        content=content,
                        media_type=content_type
                    )
                elif "xml" in content_type:
                    # For XML responses (like object searches)
                    content = await response.text()
                    return Response(
                        content=content,
                        media_type=content_type
                    )
                elif "text/html" in content_type:
                    # For HTML responses (like image lists)
                    content = await response.text()
                    return Response(
                        content=content,
                        media_type=content_type
                    )
                else:
                    # For all other content types
                    content = await response.read()
                    return Response(
                        content=content,
                        media_type=content_type
                    )
    
    except Exception as e:
        print(f"Error in NED proxy: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"NED proxy error: {str(e)}"}
        )

# Enhanced proxy download for larger FITS files from NED
@app.get("/ned-download/")
async def ned_download(url: str, object_name: str = None):
    """
    Specialized endpoint for downloading FITS files from NED.
    Includes proper handling of the file size and progress tracking.
    """
    try:
        print(f"Downloading FITS file from NED: {url}")
        
        # Create custom headers that mimic a browser
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
        }
        
        # Create a custom SSL context that's optimized for astronomy services
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE  # Disables certificate verification
        
        # Use aiohttp to make the request
        conn = aiohttp.TCPConnector(ssl=ssl_context)
        async with aiohttp.ClientSession(connector=conn) as session:
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if not response.ok:
                    return JSONResponse(
                        status_code=response.status,
                        content={"error": f"NED download failed: HTTP {response.status}"}
                    )
                
                # Read the content
                content = await response.read()
                
                # Generate a unique filename
                filename = url.split('/')[-1]
                if not filename.lower().endswith('.fits'):
                    if object_name:
                        # Use the object name to create a meaningful filename
                        filename = f"{object_name.replace(' ', '_')}.fits"
                    else:
                        # Use a generic name with timestamp
                        import time
                        timestamp = int(time.time())
                        filename = f"ned_download_{timestamp}.fits"
                
                # Create the uploads directory if it doesn't exist
                uploads_dir = Path("files/uploads")
                uploads_dir.mkdir(parents=True, exist_ok=True)
                
                # Construct the file path
                file_path = uploads_dir / filename
                
                # Write the file
                with open(file_path, "wb") as buffer:
                    buffer.write(content)
                
                # Return the relative path for loading
                return JSONResponse(content={
                    "message": "File downloaded successfully from NED",
                    "filepath": f"uploads/{filename}"
                })
                
    except Exception as e:
        print(f"Error in NED download: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"NED download error: {str(e)}"}
        )
@app.get("/proxy-download/")
async def proxy_download(url: str, request: Request):
    """
    Proxy endpoint for downloading files from external URLs that may have SSL issues.
    This is especially useful for astronomy data sources with self-signed certificates.
    """
    try:
        print(f"Downloading file from: {url}")
        
        # Create a custom SSL context that's more permissive for astronomy data
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE  # Disables certificate verification
        
        # Get the file through our proxy with the custom SSL context
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
        }
        
        try:
            # First try with regular verification
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        raise aiohttp.ClientError(f"Failed to download: HTTP {response.status}")
                    
                    # Read the content
                    content = await response.read()
        except Exception as e:
            print(f"Error in regular download: {e}")
            print("Trying with SSL verification disabled...")
            
            # Fall back to disabled verification if regular download fails
            conn = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=conn) as session:
                async with session.get(url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        raise aiohttp.ClientError(f"Failed to download: HTTP {response.status}")
                    
                    # Read the content
                    content = await response.read()
        
        # Return the content as binary response
        return Response(
            content=content,
            media_type="application/octet-stream"
        )
    
    except Exception as e:
        print(f"Error in proxy download: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to download file: {str(e)}"}
        )




import numpy as np
import requests
from urllib.parse import quote_plus
import aiohttp
import ssl
import certifi
import re
import requests
from urllib.parse import quote_plus



import numpy as np
import io
import base64
import threading
import queue
from PIL import Image
import multiprocessing as mp
from functools import partial
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor

class FitsTileGenerator:
    def __init__(self, fits_data, min_value=None, max_value=None, num_processes=None):
        """
        Initialize with memory mapping when possible, or use the provided data.
        
        Args:
            fits_data: Path to the FITS file, or a FITS HDU object, or a dict with 'data', 'header'
            min_value: Optional minimum value for normalization
            max_value: Optional maximum value for normalization
            num_processes: Number of processes to use (defaults to CPU count)
        """
        from astropy.io import fits
        
        # Determine the type of input and extract data appropriately
        if isinstance(fits_data, str):
            # It's a file path
            self.fits_file_path = fits_data
            self.use_memmap = True
            
            # Open the file and get dimensions, but don't load all data
            with fits.open(fits_data, memmap=True) as hdul:
                self.width = hdul[0].header.get('NAXIS1', 0)
                self.height = hdul[0].header.get('NAXIS2', 0)
                self.wcs = fits.utils.WCS(hdul[0].header) if 'CRVAL1' in hdul[0].header else None
                
                # Sample the data to determine min/max if not provided
                if min_value is None or max_value is None:
                    # Sample a subset of the data for min/max calculation
                    sample_size = min(1000, self.width * self.height)
                    step = max(1, (self.width * self.height) // sample_size)
                    
                    flat_indices = np.arange(0, self.width * self.height, step)
                    y_indices = flat_indices // self.width
                    x_indices = flat_indices % self.width
                    
                    # Get sample values
                    sample_values = hdul[0].data[y_indices, x_indices]
                    valid_values = sample_values[np.isfinite(sample_values)]
                    
                    self.min_value = min_value if min_value is not None else np.min(valid_values)
                    self.max_value = max_value if max_value is not None else np.max(valid_values)
                else:
                    self.min_value = min_value
                    self.max_value = max_value
        
        elif hasattr(fits_data, 'data') and hasattr(fits_data, 'header'):
            # It's an HDU object
            self.use_memmap = False
            self.fits_data = fits_data.data
            
            # Extract dimensions from the HDU
            self.width = fits_data.header.get('NAXIS1', fits_data.data.shape[1] if len(fits_data.data.shape) >= 2 else 0)
            self.height = fits_data.header.get('NAXIS2', fits_data.data.shape[0] if len(fits_data.data.shape) >= 2 else 0)
            self.wcs = fits.utils.WCS(fits_data.header) if 'CRVAL1' in fits_data.header else None
            
            # Determine min/max values if not provided
            if min_value is None or max_value is None:
                # Use a sampling approach for large arrays
                if self.width * self.height > 1_000_000:
                    sample_size = min(1000, self.width * self.height)
                    step = max(1, (self.width * self.height) // sample_size)
                    
                    flat_indices = np.arange(0, self.width * self.height, step)
                    y_indices = flat_indices // self.width
                    x_indices = flat_indices % self.width
                    
                    # Get sample values
                    sample_values = self.fits_data[y_indices, x_indices]
                    valid_values = sample_values[np.isfinite(sample_values)]
                else:
                    # For smaller arrays, use the full data
                    valid_values = self.fits_data[np.isfinite(self.fits_data)]
                
                self.min_value = min_value if min_value is not None else np.min(valid_values)
                self.max_value = max_value if max_value is not None else np.max(valid_values)
            else:
                self.min_value = min_value
                self.max_value = max_value
                
        elif isinstance(fits_data, dict) and 'data' in fits_data:
            # It's a dictionary with data and possibly header
            self.use_memmap = False
            self.fits_data = fits_data['data']
            
            # Extract dimensions from the data or header
            if 'header' in fits_data and fits_data['header'] is not None:
                header = fits_data['header']
                self.width = header.get('NAXIS1', self.fits_data.shape[1] if len(self.fits_data.shape) >= 2 else 0)
                self.height = header.get('NAXIS2', self.fits_data.shape[0] if len(self.fits_data.shape) >= 2 else 0)
                self.wcs = fits.utils.WCS(header) if 'CRVAL1' in header else None
            else:
                self.width = self.fits_data.shape[1] if len(self.fits_data.shape) >= 2 else 0
                self.height = self.fits_data.shape[0] if len(self.fits_data.shape) >= 2 else 0
                self.wcs = None
                
            # Determine min/max values if not provided
            if min_value is None or max_value is None:
                # Use a sampling approach for large arrays
                if self.width * self.height > 1_000_000:
                    sample_size = min(1000, self.width * self.height)
                    step = max(1, (self.width * self.height) // sample_size)
                    
                    flat_indices = np.arange(0, self.width * self.height, step)
                    y_indices = flat_indices // self.width
                    x_indices = flat_indices % self.width
                    
                    # Get sample values
                    sample_values = self.fits_data[y_indices, x_indices]
                    valid_values = sample_values[np.isfinite(sample_values)]
                else:
                    # For smaller arrays, use the full data
                    valid_values = self.fits_data[np.isfinite(self.fits_data)]
                
                self.min_value = min_value if min_value is not None else np.min(valid_values)
                self.max_value = max_value if max_value is not None else np.max(valid_values)
            else:
                self.min_value = min_value
                self.max_value = max_value
        else:
            raise ValueError("Unsupported fits_data type. Must be a file path, HDU object, or dict with 'data' key.")
        
        # Calculate the number of zoom levels
        self.max_level = max(0, int(np.ceil(np.log2(max(self.width, self.height) / 256))))
        
        # Set up multiprocessing
        self.num_processes = num_processes if num_processes else mp.cpu_count()
        self.pool = ProcessPoolExecutor(max_workers=self.num_processes)
        
        # Create tile cache directory
        self.cache_dir = tempfile.mkdtemp(prefix="fits_tiles_")
        self.memory_cache = {}
        
        # Generate overview image immediately using fast downsampling
        self.overview = self._generate_quick_overview()
        
        # Create a queue for progressive loading
        self.progressive_queue = queue.Queue()
        
        # Create a cache for pre-rendered overview levels
        self.overview_cache = {}
        
        # Start a worker thread for progressive loading
        self.worker_thread = threading.Thread(target=self._progressive_worker, daemon=True)
        self.worker_thread.start()
        
        # Signal that higher-quality overviews should be generated
        self.progressive_queue.put(('generate_better_overview', None))
        
        print(f"Initialized memory-mapped FITS Tile Generator with {self.num_processes} processes")
        print(f"Image dimensions: {self.width}x{self.height}, Zoom levels: {self.max_level+1}")
    
    def _get_memmap(self):
        """Get data either from memory-map or from loaded array"""
        if hasattr(self, 'use_memmap') and self.use_memmap:
            from astropy.io import fits
            with fits.open(self.fits_file_path, memmap=True) as hdul:
                return np.copy(hdul[0].data)
        else:
            # Return the already loaded data
            return self.fits_data
    
    def _generate_quick_overview(self):
        """Generate a very fast, low-quality overview for immediate display"""
        # Create a heavily downsampled overview image (max 512x512 for immediate speed)
        scale = max(1, max(self.width, self.height) / 512)
        overview_width = int(self.width / scale)
        overview_height = int(self.height / scale)
        
        try:
            # Use memory mapping to access data
            with ProcessPoolExecutor(max_workers=1) as executor:
                future = executor.submit(self._quick_overview_worker, overview_width, overview_height, scale)
                result = future.result(timeout=10)  # Set timeout to ensure responsiveness
                return result
        except Exception as e:
            print(f"Error generating quick overview: {e}")
            # Fall back to a simple gray image if sampling fails
            return self._generate_fallback_overview(overview_width, overview_height)
    
    def _quick_overview_worker(self, overview_width, overview_height, scale):
        """Worker function to generate overview in a separate process"""
        # Get memory-mapped data
        data = self._get_memmap()
        
        # Use super-fast strided sampling
        y_indices = np.linspace(0, self.height-1, overview_height, dtype=int)
        x_indices = np.linspace(0, self.width-1, overview_width, dtype=int)
        
        # Extract the sampled points efficiently
        sampled_data = data[y_indices[:, np.newaxis], x_indices]
        
        # Replace NaN and infinity with 0
        sampled_data = np.nan_to_num(sampled_data, nan=0, posinf=0, neginf=0)
        
        # Normalize the data to 0-1 range
        normalized_data = np.clip((sampled_data - self.min_value) / (self.max_value - self.min_value), 0, 1)
        
        # Convert to RGB image
        rgb_data = (normalized_data * 255).astype(np.uint8)
        image = Image.fromarray(rgb_data)
        
        # Convert to base64 encoded PNG
        buffer = io.BytesIO()
        image.save(buffer, format='PNG', optimize=True, compression_level=3)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def _generate_fallback_overview(self, width, height):
        """Generate a fallback overview if sampling fails"""
        image = Image.new('L', (width, height), color=128)
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def _process_tile(self, level, x, y, tile_size=256):
        """Process a single tile in a separate process"""
        try:
            # Calculate the scale for this level
            scale = 2 ** (self.max_level - level)
            
            # Calculate pixel coordinates in the original image
            start_x = x * tile_size * scale
            start_y = y * tile_size * scale
            end_x = min(start_x + tile_size * scale, self.width)
            end_y = min(start_y + tile_size * scale, self.height)
            
            # Check if the tile is out of bounds
            if start_x >= self.width or start_y >= self.height:
                return None
            
            # Get memory-mapped data
            data = self._get_memmap()
            
            # For direct sampling (faster but less accurate)
            if scale > 1:
                # Sample points for this tile
                tile_width = min(tile_size, int(np.ceil((end_x - start_x) / scale)))
                tile_height = min(tile_size, int(np.ceil((end_y - start_y) / scale)))
                
                # Create sample indices
                y_indices = np.linspace(start_y, end_y - 1, tile_height, dtype=int)
                x_indices = np.linspace(start_x, end_x - 1, tile_width, dtype=int)
                
                # Ensure indices are within bounds
                y_indices = np.clip(y_indices, 0, self.height - 1)
                x_indices = np.clip(x_indices, 0, self.width - 1)
                
                # Extract sampled data (much faster than loops)
                tile_data = data[y_indices[:, np.newaxis], x_indices]
            else:
                # Direct extraction for highest zoom level
                region_data = data[start_y:end_y, start_x:end_x]
                
                # Resize if necessary to match tile_size
                if region_data.shape[0] != tile_size or region_data.shape[1] != tile_size:
                    # Use simple nearest-neighbor resizing for speed
                    h_ratio = region_data.shape[0] / tile_size
                    w_ratio = region_data.shape[1] / tile_size
                    
                    tile_data = np.zeros((tile_size, tile_size), dtype=region_data.dtype)
                    for i in range(tile_size):
                        for j in range(tile_size):
                            src_i = min(int(i * h_ratio), region_data.shape[0] - 1)
                            src_j = min(int(j * w_ratio), region_data.shape[1] - 1)
                            tile_data[i, j] = region_data[src_i, src_j]
                else:
                    tile_data = region_data
            
            # Replace NaN and infinity with 0
            tile_data = np.nan_to_num(tile_data, nan=0, posinf=0, neginf=0)
            
            # Normalize the data to 0-1 range
            normalized_data = np.clip((tile_data - self.min_value) / (self.max_value - self.min_value), 0, 1)
            
            # Convert to RGB image
            rgb_data = (normalized_data * 255).astype(np.uint8)
            image = Image.fromarray(rgb_data)
            
            # Convert to PNG bytes
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            return buffer.getvalue()
                
        except Exception as e:
            print(f"Error generating tile ({level},{x},{y}): {e}")
            return None
    
    def _generate_better_overview(self):
        """Generate a better quality overview in the background using multiprocessing"""
        futures = []
        
        # Create multiple resolution levels for progressive loading
        for level in range(3):
            size = 256 * (2 ** level)
            scale = max(1, max(self.width, self.height) / size)
            overview_width = min(size, int(self.width / scale))
            overview_height = min(size, int(self.height / scale))
            
            # Skip if this level is too close to the full resolution
            if scale < 2:
                continue
                
            # Submit overview generation task to the process pool
            futures.append((level, self.pool.submit(
                self._generate_overview_level, level, overview_width, overview_height, scale)))
        
        # Collect results
        for level, future in futures:
            try:
                result = future.result(timeout=60)  # Set timeout to prevent hanging
                if result:
                    self.overview_cache[level] = result
                    print(f"Generated better overview at level {level}")
            except Exception as e:
                print(f"Error generating better overview at level {level}: {e}")
    
    def _generate_overview_level(self, level, width, height, scale):
        """Generate a specific overview level in a separate process"""
        try:
            # Get memory-mapped data
            data = self._get_memmap()
            
            # Pre-allocate the result array
            result = np.zeros((height, width), dtype=np.float32)
            
            # Process in small chunks to avoid memory issues
            chunk_size = 100  # Process 100 rows at a time
            for chunk_start in range(0, height, chunk_size):
                chunk_end = min(chunk_start + chunk_size, height)
                
                for y in range(chunk_start, chunk_end):
                    for x in range(width):
                        # Calculate source region
                        src_y_start = int(y * scale)
                        src_y_end = min(self.height, int((y + 1) * scale))
                        src_x_start = int(x * scale)
                        src_x_end = min(self.width, int((x + 1) * scale))
                        
                        # Extract block
                        block = data[src_y_start:src_y_end, src_x_start:src_x_end]
                        
                        # Average the valid values (ignoring NaN and Inf)
                        valid_mask = np.isfinite(block)
                        if np.any(valid_mask):
                            result[y, x] = np.mean(block[valid_mask])
                        else:
                            result[y, x] = 0
            
            # Normalize and convert to image
            normalized = np.clip((result - self.min_value) / (self.max_value - self.min_value), 0, 1)
            img_data = (normalized * 255).astype(np.uint8)
            img = Image.fromarray(img_data)
            
            # Convert to PNG
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            return buffer.getvalue()
        except Exception as e:
            print(f"Error in _generate_overview_level: {e}")
            return None
    
    def _progressive_worker(self):
        """Background worker for progressive loading tasks"""
        while True:
            try:
                task, params = self.progressive_queue.get()
                
                if task == 'generate_better_overview':
                    self._generate_better_overview()
                elif task == 'generate_tiles':
                    level, x_range, y_range = params
                    self._prefetch_tiles(level, x_range, y_range)
                
                self.progressive_queue.task_done()
            except Exception as e:
                print(f"Error in progressive worker: {e}")
    
    def _prefetch_tiles(self, level, x_range, y_range):
        """Prefetch tiles in the given range using multiprocessing"""
        futures = {}
        
        # Submit tile generation tasks
        for y in range(y_range[0], y_range[1] + 1):
            for x in range(x_range[0], x_range[1] + 1):
                # Only prefetch if not already in cache
                tile_key = f"{level}/{x}/{y}"
                if tile_key not in self.memory_cache:
                    futures[tile_key] = self.pool.submit(self._process_tile, level, x, y)
        
        # Collect results as they complete
        for tile_key, future in futures.items():
            try:
                result = future.result(timeout=30)  # Set timeout to prevent hanging
                if result:
                    self.memory_cache[tile_key] = result
            except Exception as e:
                print(f"Error prefetching tile {tile_key}: {e}")
    
    def get_better_overview(self, level=0):
        """Get a better quality overview at the specified level"""
        if level in self.overview_cache:
            return self.overview_cache[level]
        return None
    
    def get_tile(self, level, x, y, tile_size=256):
        """Get a tile at the specified level and coordinates with caching"""
        # Check cache first
        tile_key = f"{level}/{x}/{y}"
        if tile_key in self.memory_cache:
            return self.memory_cache[tile_key]
        
        # Generate the tile in a separate process
        future = self.pool.submit(self._process_tile, level, x, y, tile_size)
        try:
            result = future.result(timeout=10)  # Set timeout to ensure responsiveness
            if result:
                # Store in cache
                self.memory_cache[tile_key] = result
            return result
        except Exception as e:
            print(f"Error in get_tile for {tile_key}: {e}")
            return None
    
    def get_tile_info(self):
        """Get information about the tiles"""
        return {
            "width": self.width,
            "height": self.height,
            "tileSize": 256,
            "maxLevel": self.max_level,
            "minValue": float(self.min_value),
            "maxValue": float(self.max_value),
            "overview": self.overview
        }
    
    def request_tiles(self, level, center_x, center_y, radius=2):
        """Request prefetching of tiles around the given center"""
        # Calculate tile coordinates
        tile_size = 256
        scale = 2 ** (self.max_level - level)
        center_tile_x = center_x * scale // tile_size
        center_tile_y = center_y * scale // tile_size
        
        # Calculate range with the given radius
        x_min = max(0, center_tile_x - radius)
        x_max = center_tile_x + radius
        y_min = max(0, center_tile_y - radius)
        y_max = center_tile_y + radius
        
        # Queue the prefetch task
        self.progressive_queue.put(('generate_tiles', (level, (x_min, x_max), (y_min, y_max))))
    
    def cleanup(self):
        """Clean up resources and properly release all references"""
        # Stop the worker thread
        try:
            # Notify worker thread to exit
            self.progressive_queue.put(('exit', None))
            if self.worker_thread.is_alive():
                self.worker_thread.join(timeout=1.0)  # Wait for thread to finish with timeout
        except:
            pass
            
        # Shutdown the process pool
        try:
            self.pool.shutdown(wait=False)
        except:
            pass
            
        # Clear memory caches
        try:
            self.memory_cache.clear()
            self.overview_cache.clear()
        except:
            pass
            
        # Remove temporary directory
        import shutil
        try:
            shutil.rmtree(self.cache_dir, ignore_errors=True)
        except:
            pass
            
        # Force garbage collection
        import gc
        gc.collect()


@app.post("/request-tiles/")
async def request_tiles(request: Request):
    """Request prefetching of tiles for a specific region."""
    try:
        # Get the JSON data
        data = await request.json()
        
        # Extract parameters
        level = data.get("level")
        center_x = data.get("centerX")
        center_y = data.get("centerY")
        radius = data.get("radius", 2)
        
        if level is None or center_x is None or center_y is None:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing required parameters"}
            )
        
        # Check if a FITS file is loaded
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            return JSONResponse(
                status_code=400,
                content={"error": "No FITS file currently loaded"}
            )
        
        # Get file ID
        file_id = os.path.basename(fits_file)
        
        # Check if the tile generator exists
        if file_id not in active_tile_generators:
            return JSONResponse(
                status_code=400,
                content={"error": "Tile generator not initialized"}
            )
        
        # Request tiles
        tile_generator = active_tile_generators[file_id]
        tile_generator.request_tiles(level, center_x, center_y, radius)
        
        return JSONResponse(content={"status": "success"})
    
    except Exception as e:
        print(f"Error requesting tiles: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to request tiles: {str(e)}"}
        )



@app.get("/fits-tile/{level}/{x}/{y}")
async def get_fits_tile(level: int, x: int, y: int):
    """Get a specific tile of the current FITS file."""
    try:
        # Check if a FITS file is loaded
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            return JSONResponse(
                status_code=400,
                content={"error": "No FITS file currently loaded"}
            )
        
        # Get file ID
        file_id = os.path.basename(fits_file)
        
        # Check if the tile generator exists
        if file_id not in active_tile_generators:
            return JSONResponse(
                status_code=400,
                content={"error": "Tile generator not initialized"}
            )
        
        # Try to get the tile from cache first
        tile_key = f"{file_id}/{level}/{x}/{y}"
        cached_tile = tile_cache.get(tile_key)
        
        if cached_tile:
            # Return cached tile
            return Response(
                content=cached_tile,
                media_type="image/png"
            )
        
        # Generate the tile
        tile_generator = active_tile_generators[file_id]
        tile_data = tile_generator.get_tile(level, x, y)
        
        if tile_data is None:
            return JSONResponse(
                status_code=404,
                content={"error": f"Tile ({level},{x},{y}) not found"}
            )
        
        # Add to cache
        tile_cache.put(tile_key, tile_data)
        
        # Return the tile
        return Response(
            content=tile_data,
            media_type="image/png"
        )
    
    except Exception as e:
        print(f"Error getting tile ({level},{x},{y}): {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get tile: {str(e)}"}
        )




# Add this new endpoint to list available files in the "files" directory
@app.get("/list-files/")
@app.get("/list-files/{path:path}")
async def list_files(path: str = ""):
    """List available FITS files and directories in the specified path.
    
    Args:
        path: Relative path within the files directory (optional)
    """
    try:
        # Base directory is "files"
        base_dir = Path("files")
        
        # Construct the full directory path
        current_dir = base_dir / path if path else base_dir
        
        # Ensure the path exists and is within the files directory
        if not current_dir.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"Path '{path}' not found"}
            )
        
        # Security check: ensure the path is within the files directory
        if not str(current_dir.resolve()).startswith(str(base_dir.resolve())):
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied: path is outside the files directory"}
            )
        
        items = []
        
        # Add directories first
        for dir_path in current_dir.glob("*/"):
            if dir_path.is_dir():
                rel_path = str(dir_path.relative_to(base_dir))
                items.append({
                    "name": dir_path.name,
                    "path": rel_path,
                    "type": "directory",
                    "modified": dir_path.stat().st_mtime
                })
        
        # Add FITS files (with case-insensitive extension matching)
        for extension in ["*.fits", "*.fit", "*.FITS", "*.FIT"]:
            for file_path in current_dir.glob(extension):
                if file_path.is_file():
                    rel_path = str(file_path.relative_to(base_dir))
                    items.append({
                        "name": file_path.name,
                        "path": rel_path,
                        "type": "file",
                        "size": file_path.stat().st_size,
                        "modified": file_path.stat().st_mtime
                    })
        
        # Sort items: directories first, then files, both alphabetically
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        
        return JSONResponse(content={
            "current_path": path,
            "items": items
        })
        
    except Exception as e:
        print(f"Error listing files: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to list files: {str(e)}"}
        )
# Add endpoint to load a specific file
@app.get("/load-file/{filepath:path}")
async def load_file(filepath: str):
    """Set the active FITS file.
    
    Args:
        filepath: The path to the FITS file, relative to the files directory.
    """
    try:
        # Base directory is "files"
        base_dir = Path("files")
        
        # Construct the full path
        file_path = base_dir / filepath
        
        # Ensure the file exists
        if not file_path.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"File not found: {filepath}"}
            )
        
        # Ensure the file is within the files directory (security check)
        if not str(file_path.resolve()).startswith(str(base_dir.resolve())):
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied: file is outside the files directory"}
            )
        
        # Set the global file path
        app.state.current_fits_file = str(file_path)
        print(f"Set current FITS file to: {app.state.current_fits_file}")
        
        return JSONResponse(content={"message": f"File {filepath} set as active"})
    except Exception as e:
        print(f"Error setting active file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to set active file: {str(e)}"}
        )


@app.get("/catalog-info/")
async def catalog_info(catalog_name: str):
    """Get information about a catalog file."""
    try:
        catalog_path = f"catalogs/{catalog_name}"
        
        if not os.path.exists(catalog_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Read the FITS catalog - use HDU 1 for tables
        try:
            with fits.open(catalog_path) as hdul:
                # Try HDU 1 first (most common for tables)
                table_hdu = 1
                
                # If HDU 1 is not a table, try to find a table HDU
                if not isinstance(hdul[table_hdu], (fits.BinTableHDU, fits.TableHDU)):
                    for i, hdu in enumerate(hdul):
                        if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                            table_hdu = i
                            print(f"Found table in HDU {i}")
                            break
                
                # Get table data
                table = Table(hdul[table_hdu].data)
                print(f"Successfully loaded catalog info from HDU {table_hdu}: {catalog_name}")
                
                # Get column names
                columns = table.colnames
                
                # Count rows
                row_count = len(table)
                
                # Get sample data (first 5 rows)
                # Convert to simple Python types and handle NaN values
                sample_data = []
                for i in range(min(5, row_count)):
                    row_dict = {}
                    for col in columns:
                        val = table[col][i]
                        # Handle NaN values
                        if isinstance(val, (float, np.float32, np.float64)) and np.isnan(val):
                            row_dict[col] = "NaN"
                        # Handle numpy types
                        elif isinstance(val, (np.integer, np.floating, np.bool_)):
                            row_dict[col] = val.item()
                        # Handle other types
                        else:
                            try:
                                # Try to convert to a simple Python type
                                row_dict[col] = val.item() if hasattr(val, 'item') else val
                            except:
                                # If conversion fails, use string representation
                                row_dict[col] = str(val)
                    sample_data.append(row_dict)
                
                return JSONResponse(content={
                    "name": catalog_name,
                    "columns": columns,
                    "row_count": row_count,
                    "sample_data": sample_data
                })
        except Exception as e:
            print(f"Error in catalog_info: {e}")
            import traceback
            print(traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to get catalog info: {str(e)}"}
            )
            
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get catalog info: {str(e)}"}
        )




# Add these imports to your FastAPI application
from fastapi import UploadFile, File, Form, Body
from typing import Optional, Dict, Any
import os
import json
import time
import shutil
from pathlib import Path

# Add these endpoints to your FastAPI application

@app.post("/upload-catalog/")
async def upload_catalog(file: UploadFile = File(...)):
    """Upload a catalog file to the server."""
    try:
        # Create the catalogs directory if it doesn't exist
        catalogs_dir = Path("catalogs")
        catalogs_dir.mkdir(exist_ok=True)
        
        # Generate a safe filename
        original_filename = file.filename
        filename_parts = original_filename.split('.')
        
        # Get base name and extension
        if len(filename_parts) > 1:
            extension = filename_parts[-1].lower()
            base_name = '.'.join(filename_parts[:-1])
        else:
            extension = ""
            base_name = original_filename
        
        # Clean the base name (remove special characters)
        base_name = ''.join(c for c in base_name if c.isalnum() or c in ['-', '_', '.'])
        
        # Add timestamp to ensure uniqueness
        timestamp = int(time.time())
        
        # Construct final filename
        if extension:
            safe_filename = f"{base_name}_{timestamp}.{extension}"
        else:
            safe_filename = f"{base_name}_{timestamp}"
        
        # Convert to lowercase for consistency
        safe_filename = safe_filename.lower()
        
        # Construct the file path
        file_path = catalogs_dir / safe_filename
        
        # Write the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Return success message with the filename
        return JSONResponse(content={
            "message": "Catalog uploaded successfully",
            "filename": safe_filename
        })
    except Exception as e:
        import traceback
        print(f"Error uploading catalog: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to upload catalog: {str(e)}"}
        )



def detect_coordinate_columns(columns, sample_data=None):
    """
    Simple detection of RA and DEC columns by strict name matching only.
    No examination of column values.
    
    Args:
        columns: List of column names
        sample_data: Not used in this version
        
    Returns:
        dict: Contains 'ra_col', 'dec_col', and 'radius_col' keys if found
    """
    result = {'ra_col': None, 'dec_col': None, 'radius_col': None}
    
    # Only use these exact column names or patterns
    # We're making this list very specific to avoid false positives
    
    # Columns that are definitely RA (only these will be considered)
    ra_columns = [
        'ra', 'RA', 'Ra',                                         # Just RA
        'ra_deg', 'RA_deg', 'ra_degrees', 'RA_degrees',           # RA in degrees
        'raj2000', 'RAJ2000', 'ra_j2000', 'RA_J2000',             # J2000 RA
        'ra_icrs', 'RA_ICRS',                                     # ICRS RA
        'right_ascension', 'RIGHT_ASCENSION',                     # Full name
        'ra_rad', 'RA_rad', 'ra_radians', 'RA_radians',           # RA in radians
        'alpha', 'ALPHA', 'Alpha',                                # Just Alpha
        'cen_ra', 'CEN_RA',                                       # Central RA
        'ra_hms', 'RA_HMS',                                       # HMS format
        'ra_fk5', 'RA_FK5'                                        # FK5 system
    ]
    
    # Columns that are definitely DEC (only these will be considered)
    dec_columns = [
        'dec', 'DEC', 'Dec',                                      # Just DEC
        'dec_deg', 'DEC_deg', 'dec_degrees', 'DEC_degrees',       # DEC in degrees
        'dej2000','decj2000', 'DECJ2000', 'dec_j2000', 'DEC_J2000',         # J2000 DEC
        'dec_icrs', 'DEC_ICRS',                                   # ICRS DEC
        'declination', 'DECLINATION',                             # Full name
        'dec_rad', 'DEC_rad', 'dec_radians', 'DEC_radians',       # DEC in radians
        'delta', 'DELTA', 'Delta',                                # Just Delta
        'cen_dec', 'CEN_DEC',                                     # Central DEC
        'dec_dms', 'DEC_DMS',                                     # DMS format
        'dec_fk5', 'DEC_FK5',                                     # FK5 system
        'de', 'DE', 'De'                                          # Short DE
    ]
    
    # Columns that are definitely radius (only these will be considered)
    radius_columns = [
        'radius', 'RADIUS', 'Radius',                            # Just radius 
        'rad', 'RAD', 'Rad',                                     # Abbreviated radius
        'size', 'SIZE', 'Size',                                  # Size
        'diameter', 'DIAMETER', 'Diameter',                      # Diameter
        'width', 'WIDTH', 'Width',                               # Width
        'r_eff', 'R_EFF', 'R_eff',                               # Effective radius
        'r_50', 'R_50',                                          # Half-light radius
        'r_kron', 'R_KRON', 'R_kron',                            # Kron radius
        'r_petro', 'R_PETRO', 'R_petro'                          # Petrosian radius
    ]
    
    # First pass: try to find exact column name matches (exact string match)
    for col in columns:
        # Check for RA
        if col in ra_columns and result['ra_col'] is None:
            result['ra_col'] = col
            continue
            
        # Check for DEC    
        if col in dec_columns and result['dec_col'] is None:
            result['dec_col'] = col
            continue
            
        # Check for radius
        if col in radius_columns and result['radius_col'] is None:
            result['radius_col'] = col
            continue
    
    # Second pass: check if a column starts with or ends with any of our keywords
    # But we'll be very careful about what patterns we match
    if result['ra_col'] is None:
        safe_ra_prefixes = ['ra_', 'RA_', 'Ra_', 'RAJ', 'raj']
        safe_ra_suffixes = ['_ra', '_RA', '_Ra']
        
        for col in columns:
            # Check prefixes
            if any(col.startswith(prefix) for prefix in safe_ra_prefixes):
                # Exclude columns with keywords that indicate they're not RA
                if not any(substr in col.lower() for substr in ['err', 'error', 'sigma', 'std', 'var', 'dust']):
                    result['ra_col'] = col
                    break
                    
            # Check suffixes
            if any(col.endswith(suffix) for suffix in safe_ra_suffixes):
                result['ra_col'] = col
                break
    
    # Similar for DEC
    if result['dec_col'] is None:
        safe_dec_prefixes = ['dec_', 'DEC_', 'Dec_', 'DECJ', 'decj', 'de_', 'DE_']
        safe_dec_suffixes = ['_dec', '_DEC', '_Dec', '_de', '_DE']
        
        for col in columns:
            # Check prefixes
            if any(col.startswith(prefix) for prefix in safe_dec_prefixes):
                # Exclude columns with keywords that indicate they're not DEC
                if not any(substr in col.lower() for substr in ['err', 'error', 'sigma', 'std', 'var', 'dust', 'met_', 'scal']):
                    result['dec_col'] = col
                    break
                    
            # Check suffixes
            if any(col.endswith(suffix) for suffix in safe_dec_suffixes):
                result['dec_col'] = col
                break
    
    # Similar for radius
    if result['radius_col'] is None:
        safe_radius_prefixes = ['radius_', 'RADIUS_', 'rad_', 'RAD_', 'r_', 'R_']
        safe_radius_suffixes = ['_radius', '_RADIUS', '_rad', '_RAD', '_size', '_SIZE']
        
        for col in columns:
            # Check prefixes
            if any(col.startswith(prefix) for prefix in safe_radius_prefixes):
                result['radius_col'] = col
                break
                
            # Check suffixes
            if any(col.endswith(suffix) for suffix in safe_radius_suffixes):
                result['radius_col'] = col
                break
    
    # Third pass: If a column is named alpha or delta but there are better candidates, avoid them
    if result['ra_col'] == 'alpha' or result['ra_col'] == 'ALPHA' or result['ra_col'] == 'Alpha':
        # Look for a better candidate
        for col in columns:
            if col in ['ra', 'RA', 'Ra', 'raj2000', 'RAJ2000', 'cen_ra']:
                result['ra_col'] = col
                break
                
    if result['dec_col'] == 'delta' or result['dec_col'] == 'DELTA' or result['dec_col'] == 'Delta':
        # Look for a better candidate
        for col in columns:
            if col in ['dec', 'DEC', 'Dec', 'decj2000', 'DECJ2000', 'cen_dec']:
                result['dec_col'] = col
                break
    
    # Extra safety: never select columns with these substrings
    dangerous_substrings = [
        'dust', 'met_', 'metallicity', 'metal', '_scal', '_scale', 
        'best.dust', 'param', '_err', '_error', 'ratio', 'weight'
    ]
    
    # Final safety check - if our selected columns contain dangerous substrings, reject them
    if result['ra_col'] and any(substr in result['ra_col'].lower() for substr in dangerous_substrings):
        result['ra_col'] = None
        
    if result['dec_col'] and any(substr in result['dec_col'].lower() for substr in dangerous_substrings):
        result['dec_col'] = None
        
    return result

# Replace the existing catalog_columns endpoint with this enhanced version
@app.get("/catalog-columns/")
async def catalog_columns(catalog_name: str):
    """Get column names from a catalog file with enhanced RA/DEC detection."""
    try:
        catalog_path = f"catalogs/{catalog_name}"
        
        if not os.path.exists(catalog_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        columns = []
        sample_data = []
        
        # Check if it's a FITS file
        if catalog_name.lower().endswith(('.fits', '.fit')):
            # Read FITS table
            from astropy.io import fits
            from astropy.table import Table
            
            with fits.open(catalog_path) as hdul:
                # Try to find a table HDU
                table_hdu = None
                for i, hdu in enumerate(hdul):
                    if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                        table_hdu = i
                        break
                
                if table_hdu is None:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "No table found in FITS file"}
                    )
                
                # Read the table
                table = Table(hdul[table_hdu].data)
                columns = list(table.colnames)
                
                # Get a sample of the data for detection
                sample_size = min(5, len(table))
                sample_data = [table[i] for i in range(sample_size)]
                
        # Check if it's a CSV or text file
        elif catalog_name.lower().endswith(('.csv', '.txt', '.cat')):
            # Try to read as CSV
            try:
                # First try pandas
                try:
                    import pandas as pd
                    df = pd.read_csv(catalog_path, sep=None, engine='python', nrows=5)
                    columns = list(df.columns)
                    sample_data = [df.iloc[i] for i in range(min(5, len(df)))]
                except Exception as e:
                    print(f"Error reading with pandas: {e}")
                    
                    # Fallback to manual CSV reading
                    import csv
                    
                    with open(catalog_path, 'r', encoding='utf-8', errors='ignore') as f:
                        # Try to detect the delimiter
                        sample = f.read(4096)
                        f.seek(0)  # Reset to beginning
                        
                        # Count occurrences of common delimiters
                        comma_count = sample.count(',')
                        tab_count = sample.count('\t')
                        semicolon_count = sample.count(';')
                        
                        # Choose the most common delimiter
                        if tab_count > comma_count and tab_count > semicolon_count:
                            delimiter = '\t'
                        elif semicolon_count > comma_count:
                            delimiter = ';'
                        else:
                            delimiter = ','
                        
                        # Read the header and a few rows
                        csv_reader = csv.reader(f, delimiter=delimiter)
                        header = next(csv_reader)
                        columns = [col.strip().strip('"\'') for col in header]
                        
                        # Read sample rows
                        for i, row in enumerate(csv_reader):
                            if i >= 5:  # Only read up to 5 rows
                                break
                            sample_data.append(row)
            except Exception as e:
                print(f"Error reading CSV/TSV file: {e}")
                import traceback
                print(traceback.format_exc())
                return JSONResponse(
                    status_code=500,
                    content={"error": f"Failed to read catalog file: {str(e)}"}
                )
        else:
            return JSONResponse(
                status_code=400,
                content={"error": "Unsupported file format"}
            )
        
        # Use the enhanced detection function
        detected = detect_coordinate_columns(columns, sample_data)
        print(detected)
        return JSONResponse(content={
            "columns": columns,
            "detected": {
                "ra_column": detected['ra_col'],
                "dec_column": detected['dec_col'],
                "radius_column": detected['radius_col']
            }
        })
            
    except Exception as e:
        import traceback
        print(f"Error reading catalog columns: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to read catalog columns: {str(e)}"}
        )

@app.post("/save-catalog-mapping/")
async def save_catalog_mapping(mapping_data: Dict[str, Any] = Body(...)):
    """Save catalog column mappings."""
    try:
        catalog_name = mapping_data.get("catalog_name")
        
        if not catalog_name:
            return JSONResponse(
                status_code=400,
                content={"error": "Catalog name is required"}
            )
        
        catalog_path = f"catalogs/{catalog_name}"
        if not os.path.exists(catalog_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Get the mapping data
        ra_column = mapping_data.get("ra_column", "auto")
        dec_column = mapping_data.get("dec_column", "auto")
        radius_column = mapping_data.get("radius_column", "")
        fixed_radius = mapping_data.get("fixed_radius", 5)
        
        # Create a mapping file
        mapping_file_path = f"catalogs/{catalog_name}.mapping.json"
        
        mapping_info = {
            "catalog_name": catalog_name,
            "ra_column": ra_column,
            "dec_column": dec_column,
            "radius_column": radius_column,
            "fixed_radius": fixed_radius,
            "created_at": time.time()
        }
        
        # Save mapping to file
        with open(mapping_file_path, 'w') as f:
            json.dump(mapping_info, f, indent=2)
        
        print(f"Saved catalog mapping for {catalog_name}")
        
        return JSONResponse(content={
            "message": "Catalog mapping saved successfully",
            "load_catalog": True  # Signal to load the catalog after mapping
        })
    except Exception as e:
        import traceback
        print(f"Error saving catalog mapping: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to save catalog mapping: {str(e)}"}
        )





# Modify the existing load_catalog_data function to use the mapping file if it exists
def load_catalog_data(catalog_path):
    """
    Load catalog data from a file.
    Supports FITS tables and CSV/TSV formats.
    Uses mapping file if available.
    """
    try:
        from astropy.coordinates import SkyCoord
        import astropy.units as u
        catalog_data = []
        
        # Check if a mapping file exists
        catalog_name = os.path.basename(catalog_path)
        mapping_file_path = f"catalogs/{catalog_name}.mapping.json"
        
        mapping = None
        if os.path.exists(mapping_file_path):
            try:
                with open(mapping_file_path, 'r') as f:
                    mapping = json.load(f)
                print(f"Using mapping file for catalog: {catalog_name}")
            except Exception as e:
                print(f"Error loading mapping file: {e}")
                mapping = None
        
        # Use the currently selected FITS file
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            print("No FITS file currently selected")
            return []
            
        print(f"Using WCS from current FITS file: {fits_file}")
        
        # Function to convert coordinate strings to decimal degrees
        def parse_coordinate(coord_str, is_ra=None):
            """
            Parse a coordinate string that could be in decimal or sexagesimal format.
            Returns the coordinate value in decimal degrees.
            """
            if coord_str is None:
                return None
                
            # Convert to string if it's not already
            coord_str = str(coord_str).strip()
            
            try:
                # First, try parsing as a simple float
                return float(coord_str)
            except ValueError:
                # If that fails, try parsing as a sexagesimal string
                try:
                    from astropy.coordinates import Angle
                    
                    # Check if we can determine the format
                    has_h = 'h' in coord_str
                    has_m = 'm' in coord_str
                    has_s = 's' in coord_str
                    has_d = 'd' in coord_str or '°' in coord_str
                    has_quote = "'" in coord_str
                    has_dquote = '"' in coord_str
                    
                    # Determine if it's RA or DEC if not specified
                    if is_ra is None:
                        if has_h:  # Hour marker usually indicates RA
                            is_ra = True
                        elif has_d:  # Degree marker usually indicates DEC
                            is_ra = False
                        else:
                            # Default to RA for formats like "12:34:56.7"
                            is_ra = True
                    
                    # Parse using the appropriate unit
                    if is_ra:
                        return Angle(coord_str, unit=u.hourangle).degree
                    else:
                        return Angle(coord_str, unit=u.deg).degree
                        
                except Exception as e:
                    # If direct parsing fails, try with more explicit handling
                    try:
                        # For HMS format (RA): convert 01h36m43.31s to 01:36:43.31
                        if 'h' in coord_str and 'm' in coord_str:
                            # Replace h, m, s with :, :, ''
                            converted = coord_str.replace('h', ':').replace('m', ':').replace('s', '')
                            if is_ra is None or is_ra:
                                return Angle(converted, unit=u.hourangle).degree
                            else:
                                return Angle(converted, unit=u.deg).degree
                    except Exception as e2:
                        print(f"Failed to parse with explicit handling: {coord_str}, Error: {e2}")
                    
                    print(f"Failed to parse coordinate: {coord_str}, Error: {e}")
                    raise ValueError(f"Could not parse coordinate: {coord_str}")
        
        # Check if it's a FITS file
        if catalog_path.lower().endswith(('.fits', '.fit')):
            print(f"Loading FITS catalog: {catalog_path}")
            with fits.open(catalog_path) as hdul:
                # Find the first HDU with a table
                table_hdu = None
                for hdu in hdul:
                    if isinstance(hdu, fits.BinTableHDU) or isinstance(hdu, fits.TableHDU):
                        table_hdu = hdu
                        break
                
                if table_hdu is None:
                    print(f"No table found in FITS file: {catalog_path}")
                    return []
                
                # Get the table data
                catalog_table = table_hdu.data
                
                # Find RA and DEC columns based on mapping or auto-detection
                ra_col = None
                dec_col = None
                radius_col = None
                fixed_radius = 5.0  # Default fixed radius
                
                # Use mapping if available
                if mapping:
                    # Get columns from mapping
                    if mapping.get("ra_column") and mapping.get("ra_column") != "auto":
                        ra_col = mapping.get("ra_column")
                    
                    if mapping.get("dec_column") and mapping.get("dec_column") != "auto":
                        dec_col = mapping.get("dec_column")
                    
                    if mapping.get("radius_column") and mapping.get("radius_column") != "auto":
                        radius_col = mapping.get("radius_column")
                    
                    if mapping.get("fixed_radius"):
                        fixed_radius = float(mapping.get("fixed_radius"))
                
                # If columns not specified in mapping, auto-detect
                if ra_col is None:
                    # Common names for RA column
                    for name in ['RA', 'ra', 'ALPHA', 'alpha', 'ALPHA_J2000', 'alpha_j2000', 'RAJ2000', 'cen_ra']:
                        if name in catalog_table.names:
                            ra_col = name
                            break
                
                if dec_col is None:
                    # Common names for DEC column
                    for name in ['DEC', 'dec', 'DELTA', 'delta', 'DELTA_J2000', 'delta_j2000', 'DEJ2000', 'cen_dec']:
                        if name in catalog_table.names:
                            dec_col = name
                            break
                
                if radius_col is None and not mapping:
                    # Try to find radius column (only if not explicitly set to empty in mapping)
                    for name in ['RADIUS', 'radius', 'SIZE', 'size', 'WIDTH', 'width', 'DIAMETER', 'diameter']:
                        if name in catalog_table.names:
                            radius_col = name
                            break
                
                if ra_col is None or dec_col is None:
                    print(f"RA or DEC column not found in catalog: {catalog_path}")
                    print(f"Available columns: {catalog_table.names}")
                    return []
                
                # Process each row
                for row in catalog_table:
                    try:
                        # Use the parsing function to handle different coordinate formats
                        ra = parse_coordinate(row[ra_col], is_ra=True)
                        dec = parse_coordinate(row[dec_col], is_ra=False)
                        
                        # Skip if invalid coordinates
                        if ra is None or dec is None or np.isnan(ra) or np.isnan(dec):
                            continue
                        
                        # Get radius if available
                        radius = fixed_radius
                        if radius_col and radius_col in catalog_table.names:
                            try:
                                radius = float(row[radius_col])
                                # If radius is too small or invalid, use the default
                                if radius <= 0 or np.isnan(radius):
                                    radius = fixed_radius
                            except:
                                # If conversion fails, use the default radius
                                radius = fixed_radius
                        
                        # Create object data
                        obj_data = {
                            'ra': ra,
                            'dec': dec,
                            'x': 0,  # Will be set later with WCS
                            'y': 0,  # Will be set later with WCS
                            'radius_pixels': radius
                        }
                        
                        # Add magnitude if available
                        for mag_col in ['MAG', 'mag', 'MAGNITUDE', 'magnitude']:
                            if mag_col in catalog_table.names:
                                try:
                                    obj_data['magnitude'] = float(row[mag_col])
                                    break
                                except:
                                    pass
                        
                        catalog_data.append(obj_data)
                    except Exception as e:
                        print(f"Error processing catalog row: {e}")
                        continue
                        
        # Handle CSV and text files
        elif catalog_path.lower().endswith(('.csv', '.txt', '.cat')):
            print(f"Loading CSV/TSV catalog: {catalog_path}")
            try:
                # Try to read the file using various methods
                try:
                    # First try using astropy's Table.read
                    from astropy.table import Table
                    catalog_table = Table.read(catalog_path, format='ascii')
                    has_table = True
                except Exception as e:
                    print(f"Error reading with astropy: {e}")
                    
                    # Fallback to pandas
                    try:
                        import pandas as pd
                        catalog_table = pd.read_csv(catalog_path, sep=None, engine='python')
                        has_table = True
                    except Exception as e2:
                        print(f"Error reading with pandas: {e2}")
                        
                        # Last resort: manual CSV parsing
                        import csv
                        
                        # Try to detect delimiter
                        with open(catalog_path, 'r', encoding='utf-8', errors='ignore') as f:
                            sample = f.read(4096)
                        
                        # Count occurrences of common delimiters
                        comma_count = sample.count(',')
                        tab_count = sample.count('\t')
                        semicolon_count = sample.count(';')
                        
                        # Choose the most common delimiter
                        if tab_count > comma_count and tab_count > semicolon_count:
                            delimiter = '\t'
                        elif semicolon_count > comma_count:
                            delimiter = ';'
                        else:
                            delimiter = ','
                        
                        # Read the CSV file manually
                        rows = []
                        headers = []
                        with open(catalog_path, 'r', encoding='utf-8', errors='ignore') as f:
                            csv_reader = csv.reader(f, delimiter=delimiter)
                            headers = next(csv_reader)  # Read header row
                            for row in csv_reader:
                                rows.append(row)
                        
                        has_table = len(headers) > 0 and len(rows) > 0
                        
                        # Create a simple table-like object
                        class SimpleTable:
                            def __init__(self, headers, rows):
                                self.headers = headers
                                self.rows = rows
                                self.colnames = headers
                            
                            def __getitem__(self, idx):
                                return self.rows[idx]
                            
                            def __len__(self):
                                return len(self.rows)
                        
                        catalog_table = SimpleTable(headers, rows)
                
                if not has_table:
                    print(f"Failed to read catalog file: {catalog_path}")
                    return []
                
                # Find RA and DEC columns based on mapping or auto-detection
                ra_col = None
                dec_col = None
                radius_col = None
                fixed_radius = 5.0  # Default fixed radius
                
                # Get column names
                if hasattr(catalog_table, 'colnames'):
                    columns = catalog_table.colnames
                elif hasattr(catalog_table, 'columns'):
                    columns = list(catalog_table.columns)
                else:
                    columns = catalog_table.headers  # For SimpleTable
                
                # Use mapping if available
                if mapping:
                    # Get columns from mapping
                    if mapping.get("ra_column") and mapping.get("ra_column") != "auto":
                        ra_col = mapping.get("ra_column")
                    
                    if mapping.get("dec_column") and mapping.get("dec_column") != "auto":
                        dec_col = mapping.get("dec_column")
                    
                    if mapping.get("radius_column") and mapping.get("radius_column") != "auto":
                        radius_col = mapping.get("radius_column")
                    
                    if mapping.get("fixed_radius"):
                        fixed_radius = float(mapping.get("fixed_radius"))
                
                # If columns not specified in mapping, auto-detect
                if ra_col is None:
                    # Common names for RA column
                    for name in ['RA', 'ra', 'ALPHA', 'alpha', 'ALPHA_J2000', 'alpha_j2000', 'RAJ2000', 'cen_ra']:
                        if name in columns:
                            ra_col = name
                            break
                
                if dec_col is None:
                    # Common names for DEC column
                    for name in ['DEC', 'dec', 'DELTA', 'delta', 'DELTA_J2000', 'delta_j2000', 'DEJ2000', 'cen_dec']:
                        if name in columns:
                            dec_col = name
                            break
                
                if radius_col is None and not mapping:
                    # Try to find radius column
                    for name in ['RADIUS', 'radius', 'SIZE', 'size', 'WIDTH', 'width', 'DIAMETER', 'diameter']:
                        if name in columns:
                            radius_col = name
                            break
                
                if ra_col is None or dec_col is None:
                    print(f"RA or DEC column not found in catalog: {catalog_path}")
                    print(f"Available columns: {columns}")
                    return []
                
                # Process each row
                for i in range(len(catalog_table)):
                    try:
                        row = catalog_table[i]
                        
                        # Get RA and DEC values, handling different table types
                        if hasattr(row, '__getitem__'):
                            # For astropy Table or pandas DataFrame
                            ra_val = row[ra_col]
                            dec_val = row[dec_col]
                        else:
                            # For SimpleTable or list
                            ra_idx = columns.index(ra_col)
                            dec_idx = columns.index(dec_col)
                            ra_val = row[ra_idx]
                            dec_val = row[dec_idx]
                        
                        # Parse coordinates
                        ra = parse_coordinate(ra_val, is_ra=True)
                        dec = parse_coordinate(dec_val, is_ra=False)
                        
                        # Skip if invalid coordinates
                        if ra is None or dec is None or np.isnan(ra) or np.isnan(dec):
                            continue
                        
                        # Get radius if available
                        radius = fixed_radius
                        if radius_col and radius_col in columns:
                            try:
                                if hasattr(row, '__getitem__'):
                                    radius_val = row[radius_col]
                                else:
                                    radius_idx = columns.index(radius_col)
                                    radius_val = row[radius_idx]
                                
                                radius = float(radius_val)
                                # If radius is too small or invalid, use the default
                                if radius <= 0 or np.isnan(radius):
                                    radius = fixed_radius
                            except:
                                # If conversion fails, use the default radius
                                radius = fixed_radius
                        
                        # Create object data
                        obj_data = {
                            'ra': ra,
                            'dec': dec,
                            'x': 0,  # Will be set later with WCS
                            'y': 0,  # Will be set later with WCS
                            'radius_pixels': radius
                        }
                        
                        # Add magnitude if available
                        for mag_col in ['MAG', 'mag', 'MAGNITUDE', 'magnitude']:
                            if mag_col in columns:
                                try:
                                    if hasattr(row, '__getitem__'):
                                        mag_val = row[mag_col]
                                    else:
                                        mag_idx = columns.index(mag_col)
                                        mag_val = row[mag_idx]
                                    
                                    obj_data['magnitude'] = float(mag_val)
                                    break
                                except:
                                    pass
                        
                        catalog_data.append(obj_data)
                    except Exception as e:
                        print(f"Error processing row {i}: {e}")
                        continue
            except Exception as e:
                print(f"Error loading CSV catalog: {e}")
                import traceback
                print(traceback.format_exc())
        else:
            print(f"Unsupported catalog format: {catalog_path}")
            return []
        
        # Convert RA/DEC to pixel coordinates using the CURRENT image's WCS
        try:
            # Open the CURRENTLY LOADED FITS file to get WCS
            with fits.open(fits_file) as hdul:
                # Find the HDU with valid WCS
                wcs = None
                for i, hdu in enumerate(hdul):
                    if hasattr(hdu, 'header') and hdu.header and hdu.data is not None:
                        try:
                            # Try to create a WCS object from this HDU
                            temp_wcs = WCS(hdu.header)
                            if temp_wcs.has_celestial:
                                wcs = temp_wcs
                                print(f"Found valid WCS in HDU {i}")
                                break
                        except Exception as e:
                            print(f"Error checking WCS in HDU {i}: {e}")
                            continue
                
                if wcs is None:
                    print("No valid WCS found in any HDU")
                    # If no WCS found, return catalog data without pixel coordinates
                    return catalog_data
                
                # Convert RA/DEC to pixel coordinates for each object using the current image's WCS
                if catalog_data:
                    # Extract RA/DEC arrays
                    ra_array = np.array([obj['ra'] for obj in catalog_data])
                    dec_array = np.array([obj['dec'] for obj in catalog_data])
                    
                    # Create SkyCoord object for all points at once
                    sky_coords = SkyCoord(ra_array, dec_array, unit='deg')
                    
                    # Convert all coordinates at once
                    pixel_coords = wcs.world_to_pixel(sky_coords)
                    
                    # Update object data with pixel coordinates
                    for i, obj in enumerate(catalog_data):
                        obj['x'] = float(pixel_coords[0][i])
                        obj['y'] = float(pixel_coords[1][i])
                    
                    print(f"Converted {len(catalog_data)} objects from RA/DEC to pixel coordinates")
                
        except Exception as e:
            print(f"Error applying WCS to catalog: {e}")
            import traceback
            print(traceback.format_exc())
            # If WCS conversion fails, leave x, y as zero for all objects
        
        print(f"Loaded {len(catalog_data)} objects from catalog: {catalog_path}")
        return catalog_data
        
    except Exception as e:
        print(f"Error loading catalog: {e}")
        import traceback
        print(traceback.format_exc())
        return []


# Corrected code to extract BUNIT from each specific HDU

@app.get("/fits-hdu-info/{filepath:path}")
async def get_fits_hdu_info(filepath: str):
    """Get information about the HDUs in a FITS file, including BUNIT for each HDU."""
    try:
        # Base directory is "files"
        base_dir = Path("files")
        
        # Construct the full path
        file_path = base_dir / filepath
        
        # Ensure the file exists
        if not file_path.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"File not found: {filepath}"}
            )
        
        # Ensure the file is within the files directory
        if not str(file_path.resolve()).startswith(str(base_dir.resolve())):
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied: file is outside the files directory"}
            )
        
        # Open the FITS file and analyze its structure
        with fits.open(file_path) as hdul:
            hdu_list = []
            
            # Look for HDUs with valid image or table data
            for i, hdu in enumerate(hdul):
                hdu_info = {
                    "index": i,
                    "name": hdu.name if hasattr(hdu, 'name') else "",
                    "type": "Unknown"
                }
                
                # Extract BUNIT from THIS HDU's header specifically
                if hasattr(hdu, 'header'):
                    # Print the entire header for debugging

                    
                    # Look for BUNIT in this HDU with case-insensitive search
                    bunit = None
                    for key in hdu.header:
                        if key.upper() == 'BUNIT':
                            bunit = hdu.header[key]
                            break
                    
                    # If found, add to HDU info
                    if bunit:
                        hdu_info["bunit"] = bunit
                    else:
                        hdu_info["bunit"] = ""
                else:
                    hdu_info["bunit"] = ""
                
                # Check if this is an image HDU with data
                if isinstance(hdu, (fits.PrimaryHDU, fits.ImageHDU)) and hasattr(hdu, 'data') and hdu.data is not None:
                    hdu_info["type"] = "Image"
                    # Get image dimensions
                    if hasattr(hdu.data, 'shape'):
                        hdu_info["dimensions"] = list(hdu.data.shape)
                    # Get BITPIX
                    if hasattr(hdu, 'header') and 'BITPIX' in hdu.header:
                        hdu_info["bitpix"] = hdu.header['BITPIX']
                    # Check for WCS
                    try:
                        wcs = WCS(hdu.header)
                        hdu_info["hasWCS"] = wcs.has_celestial
                    except:
                        hdu_info["hasWCS"] = False
                    
                    # For Image HDUs, mark as recommended if it has dimensions and data
                    has_sufficient_dimensions = (hasattr(hdu.data, 'shape') and len(hdu.data.shape) >= 2)
                    has_non_empty_data = has_sufficient_dimensions and hdu.data.size > 0
                    
                    hdu_info["isRecommended"] = (
                        has_non_empty_data and 
                        (hdu_info.get("hasWCS", False) or i == 0)
                    )
                
                # Check if this is a table HDU
                elif isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)) and hasattr(hdu, 'data') and hdu.data is not None:
                    hdu_info["type"] = "Table"
                    # Get number of rows
                    if hasattr(hdu.data, '__len__'):
                        hdu_info["rows"] = len(hdu.data)
                    # Get number of columns
                    if hasattr(hdu.data, 'names'):
                        hdu_info["columns"] = len(hdu.data.names)
                    
                    # Tables are typically not recommended for display
                    hdu_info["isRecommended"] = False
                
                # For other HDU types or empty HDUs
                else:
                    if isinstance(hdu, fits.PrimaryHDU):
                        hdu_info["type"] = "Primary Header"
                    elif isinstance(hdu, fits.ImageHDU):
                        hdu_info["type"] = "Empty Image"
                    elif isinstance(hdu, fits.BinTableHDU):
                        hdu_info["type"] = "Binary Table"
                    elif isinstance(hdu, fits.TableHDU):
                        hdu_info["type"] = "ASCII Table"
                    elif isinstance(hdu, fits.GroupsHDU):
                        hdu_info["type"] = "Groups"
                    
                    # These HDUs are not recommended for display
                    hdu_info["isRecommended"] = False
                
                hdu_list.append(hdu_info)
            
            # If no HDU has been marked as recommended yet, choose the best one
            if not any(hdu["isRecommended"] for hdu in hdu_list):
                # First, look for image HDUs
                image_hdus = [hdu for hdu in hdu_list if hdu["type"] == "Image"]
                
                if image_hdus:
                    # Prefer HDUs with WCS
                    wcs_hdus = [hdu for hdu in image_hdus if hdu.get("hasWCS", False)]
                    
                    if wcs_hdus:
                        # Choose the first HDU with WCS
                        wcs_hdus[0]["isRecommended"] = True
                    else:
                        # Otherwise, choose the first image HDU
                        image_hdus[0]["isRecommended"] = True
                elif len(hdu_list) > 0:
                    # If no image HDUs, mark the primary HDU as recommended
                    hdu_list[0]["isRecommended"] = True
            
            print(f"Returning info for {len(hdu_list)} HDUs with their specific BUNIT values")
            for i, hdu in enumerate(hdu_list):
                bunit = hdu.get("bunit", "")
            
            return JSONResponse(content={"hduList": hdu_list})
    
    except Exception as e:
        print(f"Error getting HDU info: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get HDU info: {str(e)}"}
        )


@app.get("/load-file/{filepath:path}")
async def load_file(filepath: str, hdu: int = Query(0)):
    """Set the active FITS file and HDU index."""
    try:
        # Base directory is "files"
        base_dir = Path("files")
        
        # Construct the full path
        file_path = base_dir / filepath
        
        # Ensure the file exists
        if not file_path.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"File not found: {filepath}"}
            )
        
        # Ensure the file is within the files directory (security check)
        if not str(file_path.resolve()).startswith(str(base_dir.resolve())):
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied: file is outside the files directory"}
            )
        
        # Verify the HDU index is valid
        try:
            with fits.open(file_path) as hdul:
                if hdu < 0 or hdu >= len(hdul):
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Invalid HDU index: {hdu}. File has {len(hdul)} HDUs."}
                    )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={"error": f"Error checking HDU: {str(e)}"}
            )
        
        # Set the global file path and HDU index
        app.state.current_fits_file = str(file_path)
        app.state.current_hdu_index = hdu
        print(f"Set current FITS file to: {app.state.current_fits_file}, HDU: {app.state.current_hdu_index}")
        
        # Clear the tile cache for previous files
        tile_cache.clear()
        
        # Return success
        return JSONResponse(content={
            "message": f"File {filepath} set as active, HDU: {hdu}",
            "filepath": filepath,
            "hdu": hdu
        })
    except Exception as e:
        print(f"Error setting active file: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to set active file: {str(e)}"}
        )

@app.get("/fits-binary/")
async def fits_binary(type: str = Query(None), ra: float = Query(None), 
                      dec: float = Query(None), catalog_name: str = Query(None),
                      initialize_tiles: bool = Query(True), fast_loading: bool = Query(True),
                      hdu: int = Query(None)):
    try:
        # Choose which file to use based on request
        if type == "sed" and ra is not None and dec is not None:
            # Use for SED requests (unchanged)
            return await fits_binary_for_sed(ra, dec, catalog_name)
        
        # For regular image requests, use the current file
        fits_file = getattr(app.state, "current_fits_file", None)
        
        # If no file has been selected yet, return an error
        if not fits_file:
            return JSONResponse(
                status_code=400,
                content={"error": "No FITS file selected. Please select a file first."}
            )
        else:
            print(f"Using selected file: {fits_file}")
        
        # Use the specified HDU or fall back to the current HDU index
        hdu_index = hdu if hdu is not None else getattr(app.state, "current_hdu_index", 0)
        print(f"Using HDU index: {hdu_index}")
        
        # Check if the file exists
        if not os.path.exists(fits_file):
            return JSONResponse(
                status_code=404,
                content={"error": f"FITS file not found: {fits_file}"}
            )
        
        # Check if the file size exceeds the fast loading threshold
        try:
            file_size = os.path.getsize(fits_file)
            is_large_file = file_size > 100 * 1024 * 1024  # 100 MB
            
            if is_large_file and fast_loading:
                print(f"Large file detected ({format_file_size(file_size)}), using fast loading mode")
                # For very large files, we'll return a basic structure instead of full data
                
                # First, check if we already have a tile generator
                file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
                if file_id in active_tile_generators:
                    # We already have a tile generator, use the information from it
                    tile_generator = active_tile_generators[file_id]
                    
                    # Return basic information for the client
                    basic_info = {
                        "fast_loading": True,
                        "width": tile_generator.width,
                        "height": tile_generator.height,
                        "min_value": float(tile_generator.min_value),
                        "max_value": float(tile_generator.max_value),
                        "overview": tile_generator.overview,
                        "message": "Use tiled rendering for this large file",
                        "hdu": hdu_index
                    }
                    
                    # Add WCS info if available
                    if tile_generator.wcs:
                        try:
                            header = tile_generator.wcs.to_header()
                            wcs_info = {
                                "ra_ref": float(header.get('CRVAL1', 0)),
                                "dec_ref": float(header.get('CRVAL2', 0)),
                                "x_ref": float(header.get('CRPIX1', 0)),
                                "y_ref": float(header.get('CRPIX2', 0)),
                                "cd1_1": float(header.get('CD1_1', header.get('CDELT1', 0))),
                                "cd1_2": float(header.get('CD1_2', 0)),
                                "cd2_1": float(header.get('CD2_1', 0)),
                                "cd2_2": float(header.get('CD2_2', header.get('CDELT2', 0))),
                                "pc1_1": float(header.get('PC1_1', 0)),
                                "pc1_2": float(header.get('PC1_2', 0)),
                                "pc2_1": float(header.get('PC2_1', 0)),
                                "pc2_2": float(header.get('PC2_2', 0)),
                                "bunit": ""
                            }
                            basic_info["wcs"] = wcs_info
                        except Exception as e:
                            print(f"Error extracting WCS info: {e}")
                    
                    # Return the JSON response instead of binary data
                    return JSONResponse(content=basic_info)
        except Exception as e:
            print(f"Error checking file size: {e}")
            # Continue with normal processing if file size check fails
        
        # Open the FITS file
        with fits.open(fits_file) as hdul:
            # Validate the HDU index
            if hdu_index < 0 or hdu_index >= len(hdul):
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs."}
                )
            
            # Get the specified HDU
            hdu = hdul[hdu_index]
            
            # Make sure the HDU has valid image data
            if not hasattr(hdu, 'data') or hdu.data is None:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"HDU {hdu_index} does not contain image data"}
                )
            
            # Handle different dimensionality
            # If data has more than 2 dimensions, take the first 2D slice
            image_data = hdu.data
            if image_data is not None and len(image_data.shape) > 2:
                print(f"Original image has {len(image_data.shape)} dimensions, taking first 2D slice")
                # For 3D data, take the first slice
                if len(image_data.shape) == 3:
                    image_data = image_data[0]
                # For 4D data, take the first slice of the first volume
                elif len(image_data.shape) == 4:
                    image_data = image_data[0, 0]
            
            # Get the header
            header = hdu.header
            
            # Check if data is valid
            if image_data is None:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"No data in HDU {hdu_index}"}
                )
            
            # Get dimensions
            height, width = image_data.shape
            
            # Calculate the file size in pixels to decide if tiled rendering is appropriate
            pixel_count = width * height
            is_large_file = pixel_count > 100000000  # 100 million pixels threshold
            
            if is_large_file and initialize_tiles:
                print(f"Large file detected ({width}x{height} = {pixel_count} pixels), initializing tile generator")
                # Initialize the tile generator in a background thread when needed
                file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
                if file_id not in active_tile_generators:
                    # Prepare to initialize tile generator in background
                    threading.Thread(
                        target=initialize_tile_generator_background,
                        args=(file_id, fits_file, image_data, header, hdu_index),
                        daemon=True
                    ).start()
            
            # Calculate min and max values
            valid_data = image_data[np.isfinite(image_data)]
            if len(valid_data) == 0:
                min_value = 0
                max_value = 1
            else:
                min_value = float(np.min(valid_data))
                max_value = float(np.max(valid_data))
            
            # Extract WCS information if available
            wcs_info = None
            try:
                w = WCS(header)
                if w.has_celestial:
                    wcs_info = {
                        "ra_ref": float(header.get('CRVAL1', 0)),
                        "dec_ref": float(header.get('CRVAL2', 0)),
                        "x_ref": float(header.get('CRPIX1', 0)),
                        "y_ref": float(header.get('CRPIX2', 0)),
                        "cd1_1": float(header.get('CD1_1', header.get('CDELT1', 0))),
                        "cd1_2": float(header.get('CD1_2', 0)),
                        "cd2_1": float(header.get('CD2_1', 0)),
                        "cd2_2": float(header.get('CD2_2', header.get('CDELT2', 0))),
                        "bunit": header.get('BUNIT', ''),
                        "pc1_1": float(header.get('PC1_1', 0)),
                        "pc1_2": float(header.get('PC1_2', 0)),
                        "pc2_1": float(header.get('PC2_1', 0)),
                        "pc2_2": float(header.get('PC2_2', 0)),
                    }
                    
                    # Store WCS info in app state for later use
                    app.state.current_wcs = wcs_info
                    app.state.current_wcs_object = w
            except Exception as e:
                print(f"Error extracting WCS: {e}")
                wcs_info = None
            
            # Create a binary buffer to hold the data
            buffer = io.BytesIO()
            
            # Write dimensions (width, height) as 32-bit integers
            buffer.write(struct.pack('<i', width))
            buffer.write(struct.pack('<i', height))
            
            # Write min and max values as 32-bit floats
            buffer.write(struct.pack('<f', min_value))
            buffer.write(struct.pack('<f', max_value))
            
            # Write WCS info flag and data if available
            if wcs_info:
                buffer.write(struct.pack('<?', True))  # WCS flag
                
                # Convert WCS info to JSON
                wcs_json = json.dumps(wcs_info)
                wcs_bytes = wcs_json.encode('utf-8')
                
                # Write WCS JSON length and data
                buffer.write(struct.pack('<i', len(wcs_bytes)))
                buffer.write(wcs_bytes)
            else:
                buffer.write(struct.pack('<?', False))  # No WCS
                buffer.write(struct.pack('<i', 0))  # Zero length
            
            # Write BUNIT if available
            bunit = header.get('BUNIT', '')
            bunit_bytes = bunit.encode('utf-8')
            buffer.write(struct.pack('<i', len(bunit_bytes)))
            if bunit_bytes:
                buffer.write(bunit_bytes)
            
            # Add padding to ensure 4-byte alignment for the image data
            current_pos = buffer.tell()
            padding_bytes = (4 - (current_pos % 4)) % 4
            buffer.write(b'\0' * padding_bytes)
            
            # Write the image data as float32 values
            # Ensure data is in the correct format (float32) and C-contiguous
            float_data = np.ascontiguousarray(image_data, dtype=np.float32)
            buffer.write(float_data.tobytes())
            
            # Get the binary data
            binary_data = buffer.getvalue()
            
            # Return the binary data
            return Response(
                content=binary_data,
                media_type="application/octet-stream",
                headers={"Content-Disposition": "attachment; filename=fits_data.bin"}
            )
    
    except Exception as e:
        print(f"Error in fits_binary: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


def initialize_tile_generator_background(file_id, fits_file, image_data, header, hdu_index):
    try:
        print(f"Initializing tile generator for {file_id} in background")
        
        # Create simplified FITS data object for the tile generator
        fits_data = SimpleNamespace()
        fits_data.data = image_data
        fits_data.width = image_data.shape[1]
        fits_data.height = image_data.shape[0]
        fits_data.hdu_index = hdu_index  # Store the HDU index
        
        # Calculate min and max values
        valid_data = image_data[np.isfinite(image_data)]
        if len(valid_data) > 0:
            fits_data.min_value = float(np.min(valid_data))
            fits_data.max_value = float(np.max(valid_data))
        else:
            fits_data.min_value = 0
            fits_data.max_value = 1
        
        # Extract WCS
        try:
            fits_data.wcs = WCS(header)
        except Exception as e:
            print(f"Error extracting WCS for tile generator: {e}")
            fits_data.wcs = None
        
        # Create the tile generator
        active_tile_generators[file_id] = FitsTileGenerator(fits_data)
        print(f"Tile generator initialized for {file_id}")
    except Exception as e:
        print(f"Error initializing tile generator: {e}")
        import traceback
        print(traceback.format_exc())

def initialize_tile_generator(file_id, fits_data):
    try:
        print(f"Initializing tile generator for {file_id}")
        active_tile_generators[file_id] = FitsTileGenerator(fits_data)
        print(f"Tile generator initialized for {file_id}")
    except Exception as e:
        print(f"Error in tile generator initialization: {e}")
        import traceback
        print(traceback.format_exc())





@app.get("/fits-overview/{quality}")
async def get_fits_overview(quality: int = 0):
    """Get a better quality overview image for progressive loading."""
    try:
        # Check if a FITS file is loaded
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            return JSONResponse(
                status_code=400,
                content={"error": "No FITS file currently loaded"}
            )
        
        # Get file ID
        file_id = os.path.basename(fits_file)
        
        # Check if the tile generator exists
        if file_id not in active_tile_generators:
            return JSONResponse(
                status_code=400,
                content={"error": "Tile generator not initialized"}
            )
        
        # Get a better quality overview
        tile_generator = active_tile_generators[file_id]
        overview_data = tile_generator.get_better_overview(quality)
        
        if overview_data is None:
            return JSONResponse(
                status_code=404,
                content={"error": f"Overview at quality level {quality} not available yet"}
            )
        
        # Return the overview image
        return Response(
            content=overview_data,
            media_type="image/png"
        )
    
    except Exception as e:
        print(f"Error getting overview: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get overview: {str(e)}"}
        )



@app.get("/catalog-with-flags/{catalog_name}")
async def catalog_with_flags(catalog_name: str, prevent_auto_load: bool = Query(False)):
    """Return catalog data with all flag information in a single response."""
    try:
        # Store the current catalog name to prevent duplicate loading
        app.state.last_loaded_catalog = catalog_name
        
        # Find the catalog file
        catalog_path = f"catalogs/{catalog_name}"
        
        if not os.path.exists(catalog_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Load the catalog data first (using your existing function)
        catalog_data = load_catalog_data(catalog_path)
        
        if not catalog_data:
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to load catalog data"}
            )
        
        # Get the flags from the FITS table
        try:
            with fits.open(catalog_path) as hdul:
                # Try HDU 1 first (most common for tables)
                table_hdu = 1
                
                # If HDU 1 is not a table, try to find a table HDU
                if not isinstance(hdul[table_hdu], (fits.BinTableHDU, fits.TableHDU)):
                    for i, hdu in enumerate(hdul):
                        if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                            table_hdu = i
                            print(f"Found table in HDU {i}")
                            break
                
                # Get table data
                table = Table(hdul[table_hdu].data)
                
                # Find boolean columns
                boolean_columns = []
                for col_name in table.colnames:
                    # Check first few rows to see if it's a boolean column
                    sample_size = min(5, len(table))
                    is_boolean = True
                    
                    for i in range(sample_size):
                        try:
                            val = table[col_name][i]
                            # Check if it's a boolean type
                            if not isinstance(val, (bool, np.bool_)) and \
                               not (isinstance(val, (str, np.str_)) and val.lower() in ('true', 'false')) and \
                               not (isinstance(val, (int, np.integer)) and val in (0, 1)):
                                is_boolean = False
                                break
                        except:
                            is_boolean = False
                            break
                    
                    if is_boolean:
                        boolean_columns.append(col_name)
                
                print(f"Found {len(boolean_columns)} boolean columns")
                
                # Find RA and DEC columns
                ra_col = None
                dec_col = None
                
                for col_name in table.colnames:
                    if col_name.lower() in ['ra', 'alpha', 'right_ascension']:
                        ra_col = col_name
                    elif col_name.lower() in ['dec', 'delta', 'declination']:
                        dec_col = col_name
                
                if not ra_col or not dec_col:
                    print(f"RA or DEC column not found, using default column names")
                    # Try to use default column names
                    ra_col = 'ra'
                    dec_col = 'dec'
                
                # Add flag information to each catalog object
                for obj in catalog_data:
                    ra = obj['ra']
                    dec = obj['dec']
                    
                    # Find the matching row in the table
                    matches = []
                    try:
                        # Calculate distances to find matching object in table
                        ra_diff = np.abs(table[ra_col] - ra)
                        dec_diff = np.abs(table[dec_col] - dec)
                        distances = np.sqrt(ra_diff**2 + dec_diff**2)
                        closest_idx = np.argmin(distances)
                        closest_dist = distances[closest_idx]
                        
                        # Use the closest match if it's within a reasonable distance
                        if closest_dist < 0.0003:  # ~1 arcsec
                            # Add all boolean properties to the object
                            for col_name in boolean_columns:
                                try:
                                    val = table[col_name][closest_idx]
                                    # Convert to standard boolean
                                    if isinstance(val, (bool, np.bool_)):
                                        obj[col_name] = bool(val)
                                    elif isinstance(val, (str, np.str_)) and val.lower() == 'true':
                                        obj[col_name] = True
                                    elif isinstance(val, (str, np.str_)) and val.lower() == 'false':
                                        obj[col_name] = False
                                    elif isinstance(val, (int, np.integer)):
                                        obj[col_name] = bool(val)
                                    else:
                                        obj[col_name] = False
                                except Exception as e:
                                    print(f"Error processing boolean column {col_name}: {e}")
                                    obj[col_name] = False
                    except Exception as e:
                        print(f"Error matching object: {e}")
        
        except Exception as e:
            print(f"Error processing flags: {e}")
            import traceback
            print(traceback.format_exc())
            # Return basic catalog data without flags
            print("Returning catalog data without flag information")
        
        return JSONResponse(content=catalog_data)
        
    except Exception as e:
        print(f"Error in catalog_with_flags: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get catalog with flags: {str(e)}"}
        )




@app.get("/file-size/{filepath:path}")
async def get_file_size(filepath: str):
    """Get the size of a file in the files directory."""
    try:
        # Base directory is "files"
        base_dir = Path("files")
        
        # Construct the full path
        file_path = base_dir / filepath
        
        # Ensure the file exists
        if not file_path.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"File not found: {filepath}"}
            )
        
        # Ensure the file is within the files directory (security check)
        if not str(file_path.resolve()).startswith(str(base_dir.resolve())):
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied: file is outside the files directory"}
            )
        
        # Get file size
        file_size = file_path.stat().st_size
        
        return JSONResponse(content={
            "path": filepath,
            "size": file_size,
            "formatted_size": format_file_size(file_size)
        })
    except Exception as e:
        print(f"Error getting file size: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get file size: {str(e)}"}
        )

# Helper function to format file size
def format_file_size(bytes):
    """Format file size in human-readable format."""
    if bytes < 1024:
        return f"{bytes} B"
    elif bytes < 1024 * 1024:
        return f"{bytes / 1024:.1f} KB"
    elif bytes < 1024 * 1024 * 1024:
        return f"{bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes / (1024 * 1024 * 1024):.1f} GB"

# Add this to the bottom of your main.py file to properly initialize the tile generators
# from the FITS data loaded by the client

# Function to register new FITS data for tiling

# Add this to your existing main.py file

# Import the necessary modules at the top of the file
import subprocess
import sys
import os

from fastapi import Form



# Add a new endpoint for running the peak finder


# Add this to your main.py file
import subprocess
import sys
import os
import json
from fastapi import Form
from fastapi.responses import JSONResponse

@app.post("/run-peak-finder/")
async def run_peak_finder(
    fits_file: str = Form(...),
    pix_across_beam: float = Form(5.0),
    min_beams: float = Form(1.0),
    beams_to_search: float = Form(1.0),
    delta_rms: float = Form(3.0),
    minval_rms: float = Form(2.0)
):
    """
    Run the peak finder on a specified FITS file with configurable parameters
    """
    try:
        # Verify the file exists and is a valid FITS file
        full_file_path = os.path.join('files', fits_file)
        
        if not os.path.exists(full_file_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"File not found: {fits_file}"}
            )
        
        # Ensure the script path is correct
        peak_finder_script = os.path.join(os.path.dirname(__file__), 'peak_finder.py')
        
        # Prepare command with parameters
        cmd = [
            sys.executable, 
            peak_finder_script, 
            full_file_path,
            str(pix_across_beam),
            str(min_beams),
            str(beams_to_search),
            str(delta_rms),
            str(minval_rms)
        ]
        
        # Debug: Log the exact command being run
        print(f"Running peak finder command: {' '.join(cmd)}")
        
        # Run the peak finder script using subprocess
        try:
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                check=False,  # Don't raise exception on non-zero exit
                timeout=120,  # 2-minute timeout
                cwd=os.path.dirname(os.path.abspath(__file__))  # Set working directory
            )
        except subprocess.TimeoutExpired:
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Peak finder script timed out",
                    "ra": [],
                    "dec": [],
                    "source_count": 0
                }
            )
        
        # Debug: Log the full output
        print("Peak Finder Script Output:")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        print(f"Return code: {result.returncode}")
        
        # Check for errors in subprocess execution
        if result.returncode != 0:
            return JSONResponse(
                status_code=500,
                content={
                    "error": f"Peak finder script failed with return code {result.returncode}: {result.stderr or result.stdout}",
                    "ra": [],
                    "dec": [],
                    "source_count": 0
                }
            )
        
        # Parse the output, handling potential mixed content
        try:
            # Look for JSON pattern in the output (starting with { and ending with })
            import re
            json_match = re.search(r'({.*"source_count":\s*\d+})', result.stdout, re.DOTALL)
            
            if json_match:
                # Extract the JSON part
                json_str = json_match.group(1)
                output_data = json.loads(json_str)
                
                # Validate the output structure
                if not isinstance(output_data, dict):
                    raise ValueError("Invalid output format: expected JSON object")
                
                # Ensure output has expected fields
                if "ra" not in output_data or "dec" not in output_data or "source_count" not in output_data:
                    raise ValueError("Missing required fields in output")
                
                # Add debug info about the found sources
                print(f"Successfully found {output_data['source_count']} sources")
                
                return JSONResponse(content=output_data)
            else:
                # No JSON found in the output
                raise ValueError("No valid JSON data found in peak finder output")
        
        except (json.JSONDecodeError, ValueError) as e:
            # Log the problematic output
            print("JSON Parsing Error:", e)
            print("Raw Output:", result.stdout)
            
            return JSONResponse(
                status_code=500,
                content={
                    "error": f"Invalid output from peak finder script: {str(e)}",
                    "raw_output": result.stdout[:1000],  # Include part of the raw output for debugging
                    "ra": [],
                    "dec": [],
                    "source_count": 0
                }
            )
    
    except Exception as e:
        # Catch any unexpected errors
        print(f"Unexpected error in peak finder endpoint: {e}")
        import traceback
        traceback.print_exc()
        
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "ra": [],
                "dec": [],
                "source_count": 0
            }
        )



@app.post("/register-fits-data/")
async def register_fits_data(request: Request):
    """Register FITS data for tiling when client processes it."""
    try:
        # Get the JSON data
        data = await request.json()
        
        # Extract file ID and basic info
        file_id = data.get("file_id")
        width = data.get("width")
        height = data.get("height")
        min_value = data.get("min_value")
        max_value = data.get("max_value")
        
        if not file_id or not width or not height:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing required FITS data parameters"}
            )
        
        # Store the basic information to initialize the tile generator later
        # We don't store the full pixel data as it's too large, but we'll use
        # this information when generating tiles from the server-side FITS data
        print(f"Registered FITS data for tiling: {file_id} ({width}x{height})")
        
        # Check if we have this file loaded
        fits_file = getattr(app.state, "current_fits_file", None)
        if fits_file and os.path.basename(fits_file) == file_id:
            # Initialize the tile generator in a background thread
            threading.Thread(
                target=initialize_tile_generator_from_server,
                args=(file_id, width, height, min_value, max_value),
                daemon=True
            ).start()
        
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        print(f"Error registering FITS data: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to register FITS data: {str(e)}"}
        )

# Function to initialize a tile generator using server-side FITS data
def initialize_tile_generator_from_server(file_id, width, height, min_value, max_value):
    try:
        # Get the current FITS file
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file or os.path.basename(fits_file) != file_id:
            print(f"FITS file not loaded or doesn't match: {file_id}")
            return
            
        print(f"Initializing server-side tile generator for {file_id}")
        
        # Load the FITS data directly from the file
        with fits.open(fits_file) as hdul:
            # Find the HDU with image data
            data_hdu = None
            for i, hdu in enumerate(hdul):
                if isinstance(hdu, (fits.PrimaryHDU, fits.ImageHDU)) and hdu.data is not None:
                    data_hdu = hdu
                    break
            
            if data_hdu is None:
                print(f"No image data found in FITS file: {fits_file}")
                return
                
            # Create a simplified FITS data object for the tile generator
            fits_data = SimpleNamespace()
            fits_data.data = data_hdu.data
            fits_data.width = width
            fits_data.height = height
            fits_data.min_value = min_value
            fits_data.max_value = max_value
            
            # Try to get WCS information
            try:
                fits_data.wcs = WCS(data_hdu.header)
            except:
                fits_data.wcs = None
                
            # Create the tile generator
            active_tile_generators[file_id] = FitsTileGenerator(fits_data)
            print(f"Server-side tile generator initialized for {file_id}")
    except Exception as e:
        print(f"Error initializing server-side tile generator: {e}")
        import traceback
        print(traceback.format_exc())

@app.get("/catalog-data/")
async def catalog_data(catalog_name: str):
    """Return catalog data in JSON format for client-side rendering."""
    try:
        catalog_path = f"catalogs/{catalog_name}"
        print(f"Processing catalog data request for: {catalog_name}")
        
        if not os.path.exists(catalog_path):
            print(f"Catalog file not found: {catalog_path}")
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Load catalog data using the same function used elsewhere
        try:
            catalog_data = load_catalog_data(catalog_path)
            print(f"Loaded {len(catalog_data)} objects from catalog")
        except Exception as e:
            print(f"Error loading catalog data: {e}")
            import traceback
            print(traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to load catalog data: {str(e)}"}
            )
        
        
        return JSONResponse(content=catalog_data)
    except Exception as e:
        print(f"Error in catalog_data: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get catalog data: {str(e)}"}
        )

@app.get("/load-catalog/{catalog_name}")
async def load_catalog_endpoint(catalog_name: str):
    """Return catalog data in JSON format for plotting and analysis."""
    try:
        from astropy.coordinates import Angle
        import astropy.units as u
        
        # Helper function to parse coordinates (same as in other functions)
        def parse_coordinate(coord_str, is_ra=None):
            """
            Parse a coordinate string that could be in decimal or sexagesimal format.
            Returns the coordinate value in decimal degrees.
            """
            if coord_str is None:
                return None
                
            # Convert to string if it's not already
            coord_str = str(coord_str).strip()
            
            try:
                # First, try parsing as a simple float
                return float(coord_str)
            except ValueError:
                # If that fails, try parsing as a sexagesimal string
                try:
                    # Check if we can determine the format
                    has_h = 'h' in coord_str
                    has_m = 'm' in coord_str
                    has_s = 's' in coord_str
                    has_d = 'd' in coord_str or '°' in coord_str
                    has_quote = "'" in coord_str
                    has_dquote = '"' in coord_str
                    
                    # Determine if it's RA or DEC if not specified
                    if is_ra is None:
                        if has_h:  # Hour marker usually indicates RA
                            is_ra = True
                        elif has_d:  # Degree marker usually indicates DEC
                            is_ra = False
                        else:
                            # Default to RA for formats like "12:34:56.7"
                            is_ra = True
                    
                    # Parse using the appropriate unit
                    if is_ra:
                        return Angle(coord_str, unit=u.hourangle).degree
                    else:
                        return Angle(coord_str, unit=u.deg).degree
                        
                except Exception as e:
                    # If direct parsing fails, try with more explicit handling
                    try:
                        # For HMS format (RA): convert 01h36m43.31s to 01:36:43.31
                        if 'h' in coord_str and 'm' in coord_str:
                            # Replace h, m, s with :, :, ''
                            converted = coord_str.replace('h', ':').replace('m', ':').replace('s', '')
                            if is_ra is None or is_ra:
                                return Angle(converted, unit=u.hourangle).degree
                            else:
                                return Angle(converted, unit=u.deg).degree
                    except Exception as e2:
                        print(f"Failed to parse with explicit handling: {coord_str}, Error: {e2}")
                    
                    print(f"Failed to parse coordinate: {coord_str}, Error: {e}")
                    raise ValueError(f"Could not parse coordinate: {coord_str}")
        
        # Find the catalog file
        catalog_path = None
        for file_pattern in ["catalogs/*.cat", "catalogs/*.fits", "catalogs/*.fit"]:
            for file in glob.glob(file_pattern):
                if os.path.basename(file).lower() == catalog_name.lower() or os.path.splitext(os.path.basename(file))[0].lower() == catalog_name.lower():
                    catalog_path = file
                    break
            if catalog_path:
                break
        
        if not catalog_path:
            print(f"Catalog file not found: {catalog_name}")
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Load catalog data using the same function used elsewhere
        try:
            catalog_data = load_catalog_data(catalog_path)
            if not catalog_data:
                return JSONResponse(
                    status_code=500,
                    content={"error": f"Failed to load catalog data"}
                )
            print(f"Loaded {len(catalog_data)} objects from catalog for plotting")
            
            # Get boolean flag columns from the catalog
            # Load the catalog table if not already loaded
            if catalog_name not in loaded_catalogs:
                try:
                    with fits.open(catalog_path) as hdul:
                        # Find the first HDU with a table
                        table_hdu = None
                        for i, hdu in enumerate(hdul):
                            if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                                table_hdu = hdu
                                table_hdu_index = i
                                break
                        
                        if table_hdu is None:
                            print(f"No table found in FITS file: {catalog_path}")
                            # Continue without boolean flags
                        else:
                            # Get the table data
                            loaded_catalogs[catalog_name] = Table(table_hdu.data)
                            print(f"Loaded catalog table for boolean flags: {catalog_name}")
                except Exception as e:
                    print(f"Error loading catalog table for boolean flags: {e}")
                    # Continue without boolean flags
            
            # If we have the catalog table loaded, add boolean flags to the catalog data
            if catalog_name in loaded_catalogs:
                catalog_table = loaded_catalogs[catalog_name]
                
                # Find potential boolean columns
                boolean_columns = []
                
                # Check first row to find boolean columns (if table is not empty)
                if len(catalog_table) > 0:
                    for col_name in catalog_table.colnames:
                        try:
                            val = catalog_table[col_name][0]
                            # Check if value is a boolean type or looks like a boolean
                            if isinstance(val, (bool, np.bool_)) or \
                               (isinstance(val, (str, np.str_)) and val.lower() in ('true', 'false')) or \
                               (isinstance(val, (int, np.integer)) and val in (0, 1)):
                                boolean_columns.append(col_name)
                        except Exception:
                            continue
                
                # Add boolean properties to catalog data
                if boolean_columns:
                    print(f"Found boolean columns for filtering: {boolean_columns}")
                    
                    # Find RA and DEC columns
                    ra_col = None
                    dec_col = None
                    
                    for col_name in catalog_table.colnames:
                        if col_name.lower() in ['ra', 'alpha', 'alpha_j2000', 'raj2000', 'cen_ra', 'right_ascension']:
                            ra_col = col_name
                        elif col_name.lower() in ['dec', 'delta', 'delta_j2000', 'dej2000', 'cen_dec', 'declination']:
                            dec_col = col_name
                    
                    if ra_col and dec_col:
                        # Check if catalog coordinates need parsing
                        need_parsing = False
                        try:
                            # Try to get first coordinate value
                            first_ra = catalog_table[ra_col][0]
                            if not isinstance(first_ra, (int, float, np.integer, np.floating)):
                                need_parsing = True
                                print(f"Catalog contains non-numerical coordinates, will parse...")
                        except:
                            pass
                        
                        # Create arrays for the catalog coordinates
                        if need_parsing:
                            # We need to parse the coordinates in the catalog table
                            ra_values = []
                            dec_values = []
                            
                            for row_idx in range(len(catalog_table)):
                                try:
                                    ra_val = parse_coordinate(catalog_table[ra_col][row_idx], is_ra=True)
                                    dec_val = parse_coordinate(catalog_table[dec_col][row_idx], is_ra=False)
                                    ra_values.append(ra_val)
                                    dec_values.append(dec_val)
                                except Exception as e:
                                    print(f"Error parsing coordinates at index {row_idx}: {e}")
                                    # Use placeholder values that won't match
                                    ra_values.append(float('nan'))
                                    dec_values.append(float('nan'))
                            
                            ra_values = np.array(ra_values)
                            dec_values = np.array(dec_values)
                        else:
                            # Coordinates are already numeric
                            ra_values = np.array(catalog_table[ra_col], dtype=float)
                            dec_values = np.array(catalog_table[dec_col], dtype=float)
                        
                        # For each object in the catalog data
                        for obj in catalog_data:
                            ra = obj['ra']
                            dec = obj['dec']
                            
                            # Calculate distances to find matching object in table
                            ra_diff = np.abs(ra_values - ra)
                            dec_diff = np.abs(dec_values - dec)
                            distances = np.sqrt(ra_diff**2 + dec_diff**2)
                            
                            # Handle NaN values in distances
                            valid_indices = ~np.isnan(distances)
                            if np.any(valid_indices):
                                # Only consider valid (non-NaN) distances
                                valid_distances = distances[valid_indices]
                                valid_indices_array = np.where(valid_indices)[0]
                                min_idx = np.argmin(valid_distances)
                                closest_idx = valid_indices_array[min_idx]
                                min_distance = valid_distances[min_idx]
                                
                                # Check if the match is close enough
                                if min_distance < 0.0003:  # ~1 arcsec
                                    # Add boolean properties
                                    for col_name in boolean_columns:
                                        try:
                                            val = catalog_table[col_name][closest_idx]
                                            # Convert to standard boolean
                                            if isinstance(val, (bool, np.bool_)):
                                                obj[col_name] = bool(val)
                                            elif isinstance(val, (str, np.str_)) and val.lower() == 'true':
                                                obj[col_name] = True
                                            elif isinstance(val, (str, np.str_)) and val.lower() == 'false':
                                                obj[col_name] = False
                                            elif isinstance(val, (int, np.integer)):
                                                obj[col_name] = bool(val)
                                            else:
                                                obj[col_name] = False
                                        except Exception as e:
                                            print(f"Error processing boolean column {col_name}: {e}")
                                            obj[col_name] = False
            
        except Exception as e:
            print(f"Error loading catalog data: {e}")
            import traceback
            print(traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to load catalog data: {str(e)}"}
            )
        
        return JSONResponse(content=catalog_data)
    except Exception as e:
        print(f"Error in load_catalog_endpoint: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to load catalog: {str(e)}"}
        )


@app.get("/catalog-binary/")
async def catalog_binary(catalog_name: str, prevent_auto_load: bool = Query(False)):
    """
    Return catalog data as binary for efficient transfer.
    """
    try:
        # Find the catalog file
        catalog_path = None
        for file_pattern in ["catalogs/*.cat", "catalogs/*.fits", "catalogs/*.fit"]:
            for file in glob.glob(file_pattern):
                if os.path.basename(file).lower() == catalog_name.lower() or os.path.splitext(os.path.basename(file))[0].lower() == catalog_name.lower():
                    catalog_path = file
                    break
            if catalog_path:
                break
        
        if not catalog_path:
            return {"error": f"Catalog '{catalog_name}' not found"}
        
        # Store the current catalog name to prevent duplicate loading
        app.state.last_loaded_catalog = catalog_name
        
        # Load the catalog data
        catalog_data = load_catalog_data(catalog_path)
        if not catalog_data:
            return {"error": f"Failed to load catalog '{catalog_name}'"}
        
        # Also load the catalog table for SED generation
        try:
            with fits.open(catalog_path) as hdul:
                # Try HDU 1 first (most common for tables)
                table_hdu = 1
                
                # If HDU 1 is not a table, try to find a table HDU
                if not isinstance(hdul[table_hdu], (fits.BinTableHDU, fits.TableHDU)):
                    for i, hdu in enumerate(hdul):
                        if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                            table_hdu = i
                            print(f"Found table in HDU {i}")
                            break
                
                # Get table data and store it in the global dictionary
                loaded_catalogs[catalog_name] = Table(hdul[table_hdu].data)
                print(f"Stored catalog table for SED generation: {catalog_name}")
        except Exception as e:
            print(f"Error loading catalog table for SED: {e}")
        
        # Create a binary buffer
        buffer = io.BytesIO()
        
        # Write the number of objects
        num_objects = len(catalog_data)
        buffer.write(struct.pack('!I', num_objects))
        
        # Write each object's data
        for obj in catalog_data:
            # Write x, y coordinates
            buffer.write(struct.pack('!ff', obj['x'], obj['y']))
            
            # Write ra, dec coordinates
            buffer.write(struct.pack('!ff', obj['ra'], obj['dec']))
            
            # Write radius in pixels (if available)
            radius = obj.get('radius_pixels', 5.0)  # Default to 5 pixels if not specified
            buffer.write(struct.pack('!f', radius))
            
            # Write magnitude (if available)
            magnitude = obj.get('magnitude', 0.0)
            buffer.write(struct.pack('!f', magnitude))
        
        # Get the binary data
        binary_data = buffer.getvalue()
        
        # Return binary response
        return Response(
            content=binary_data,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={catalog_name}.bin"}
        )
    except Exception as e:
        print(f"Error in catalog_binary: {e}")
        import traceback
        print(traceback.format_exc())
        return {"error": str(e)}
@app.get("/generate-sed/")
async def generate_sed(ra: float, dec: float, catalog_name: str):
    """Generate a SED plot for a specific region based on RA and DEC coordinates."""
    try:
        # Check if we have the catalog data loaded
        if catalog_name not in loaded_catalogs:
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog '{catalog_name}' not loaded. Please load the catalog first."}
            )
        
        # Use the already loaded catalog data
        catalog_table = loaded_catalogs[catalog_name]
        print(f"Using already loaded catalog: {catalog_name}")
        
        # Find RA and DEC columns
        ra_col = None
        dec_col = None
        

        for col_name in catalog_table.colnames:
            if col_name.lower() in ['RA', 'ra', 'ALPHA', 'alpha', 'ALPHA_J2000', 'alpha_j2000', 'RAJ2000','cen_ra']:
                ra_col = col_name
            elif col_name.lower() in ['DEC', 'dec', 'DELTA', 'delta', 'DELTA_J2000', 'delta_j2000', 'DEJ2000','cen_dec']:
                dec_col = col_name
        
        if not ra_col or not dec_col:
            return JSONResponse(
                status_code=400,
                content={"error": "Could not find RA and DEC columns in catalog"}
            )
        
        # Calculate angular distance to find closest object
        ra_diff = np.abs(catalog_table[ra_col] - ra)
        dec_diff = np.abs(catalog_table[dec_col] - dec)
        distances = np.sqrt(ra_diff**2 + dec_diff**2)
        closest_idx = np.argmin(distances)
        
        # Get the closest object
        closest_obj = catalog_table[closest_idx]
        
        # Check if the object is close enough (within 1 arcsec)
        if distances[closest_idx] > 0.0003:  # ~1 arcsec in degrees
            return JSONResponse(
                status_code=404,
                content={"error": "No object found near the specified coordinates"}
            )
        
        # Extract data for SED plot
        filter_wavelengths = [0.275, 0.336, 0.438, 0.555, 0.814, 2.0, 3.0, 3.35, 3.6, 7.7, 10.0, 11.3, 21]
        filter_names = ['F275W', 'F336W', 'F438W', 'F555W', 'F814W', 'F200W', 'F300M', 'F335M', 'F360M', 'F770W', 'F1000W', 'F1130W', 'F2100W']
        
        # Get flux values
        sed_fluxes = []
        sed_fluxes_err = []
        sed_fluxes_cigale = []
        
        # HST filters
        for filter_name in ['F275W', 'F336W', 'F438W', 'F555W', 'F814W']:
            if filter_name in catalog_table.colnames:
                sed_fluxes.append(float(closest_obj[filter_name]))
                if f"{filter_name}_err" in catalog_table.colnames:
                    sed_fluxes_err.append(float(closest_obj[f"{filter_name}_err"]))
                else:
                    sed_fluxes_err.append(0.0)
            else:
                sed_fluxes.append(0.0)
                sed_fluxes_err.append(0.0)
            
            # CIGALE best fit
            if f"best.hst.wfc3.{filter_name}" in catalog_table.colnames:
                sed_fluxes_cigale.append(float(closest_obj[f"best.hst.wfc3.{filter_name}"]) * 1000)
            elif f"best.hst.wfc.{filter_name}" in catalog_table.colnames:
                sed_fluxes_cigale.append(float(closest_obj[f"best.hst.wfc.{filter_name}"]) * 1000)
            elif f"best.hst_{filter_name}" in catalog_table.colnames:
                sed_fluxes_cigale.append(float(closest_obj[f"best.hst_{filter_name}"]) * 1000)
            else:
                sed_fluxes_cigale.append(0.0)
        
        # JWST NIRCam filters
        for filter_name in ['F200W', 'F300M', 'F335M', 'F360M']:
            if filter_name in catalog_table.colnames:
                sed_fluxes.append(float(closest_obj[filter_name]))
                if f"{filter_name}_err" in catalog_table.colnames:
                    sed_fluxes_err.append(float(closest_obj[f"{filter_name}_err"]))
                else:
                    sed_fluxes_err.append(0.0)
            else:
                sed_fluxes.append(0.0)
                sed_fluxes_err.append(0.0)
            
            # CIGALE best fit
            if f"best.jwst.nircam.{filter_name}" in catalog_table.colnames:
                sed_fluxes_cigale.append(float(closest_obj[f"best.jwst.nircam.{filter_name}"]) * 1000)
            else:
                sed_fluxes_cigale.append(0.0)
        
        # JWST MIRI filters
        for filter_name in ['F770W', 'F1000W', 'F1130W', 'F2100W']:
            if filter_name in catalog_table.colnames:
                sed_fluxes.append(float(closest_obj[filter_name]))
                if f"{filter_name}_err" in catalog_table.colnames:
                    sed_fluxes_err.append(float(closest_obj[f"{filter_name}_err"]))
                else:
                    sed_fluxes_err.append(0.0)
            else:
                sed_fluxes.append(0.0)
                sed_fluxes_err.append(0.0)
            
            # CIGALE best fit
            if f"best.jwst.miri.{filter_name}" in catalog_table.colnames:
                sed_fluxes_cigale.append(float(closest_obj[f"best.jwst.miri.{filter_name}"]) * 1000)
            else:
                sed_fluxes_cigale.append(0.0)
        
        # Create the SED plot with the requested size
        fig = plt.figure(figsize=(9, 3.5))
        
        # Create main plot
        ax = fig.add_subplot(111)
        
        # Plot observed fluxes with error bars
        ax.errorbar(filter_wavelengths, sed_fluxes, yerr=sed_fluxes_err, fmt='o', 
                    ecolor='gray', color='blue', label='BKG-Subtracted', markersize=9, capsize=4)
        
        # Check if this is an ISM source
        is_ism_source = False
        if 'ISM_source' in catalog_table.colnames:
            is_ism_source = bool(closest_obj['ISM_source'])
        
        # Plot CIGALE best fit if it's an ISM source
        if is_ism_source:
            ax.scatter(filter_wavelengths, sed_fluxes_cigale, s=140, marker="s", 
                       facecolors='none', edgecolors='red', label=r'CIGALE Best Fit')
            ax.plot(filter_wavelengths, sed_fluxes_cigale, '-', color='red')
        
        # Set plot labels and scales
        ax.set_xlabel('Wavelength (μm)', fontsize=12)
        ax.set_ylabel('Flux Density (μJy)', fontsize=12)
        # Remove title as requested
        ax.legend(loc='lower left', fontsize=12)
        ax.set_xscale('log')
        ax.set_yscale('log')
        ax.set_xticks(filter_wavelengths)
        ax.set_xticklabels([f'{w:.2f}' for w in filter_wavelengths], rotation=45, fontsize=10)
        ax.set_xlim(0.25, 23)
        # Remove grid as requested
        
        # Add information text box in the bottom right corner of the plot
        galaxy_name = "Unknown"
        if 'galaxy' in catalog_table.colnames:
            galaxy_name = str(closest_obj['galaxy']).upper()
        
        # Get age and mass if available
        age = 0.0
        mass = 0.0
        chi = 0.0
        ebv_gas = 0.0
        
        if 'best.stellar.age_m_star' in catalog_table.colnames:
            age = float(closest_obj['best.stellar.age_m_star'])
        
        if 'best.stellar.m_star' in catalog_table.colnames:
            mass = float(closest_obj['best.stellar.m_star'])
        
        if 'best.reduced_chi_square' in catalog_table.colnames:
            chi = float(closest_obj['best.reduced_chi_square'])
        
        if 'best.attenuation.E_BV_lines' in catalog_table.colnames:
            ebv_gas = float(closest_obj['best.attenuation.E_BV_lines'])
        
        # Create text for the information box
        bbox = dict(boxstyle="round", alpha=0.7, facecolor="white")
        if is_ism_source:
            text_str = (
                f"Galaxy: {galaxy_name}\n"
                f"RA: {ra:.4f}, DEC: {dec:.4f}\n"
                f"Age: {age:.1f} Myr, Mass: {mass:.1f} M$_{{\\odot}}$ \n"
                f"Reduced $\\chi$: {chi:.1f}, E(B-V) gas: {ebv_gas:.1f}"
            )
        else:
            text_str = (
                f"Galaxy: {galaxy_name}\n"
                f"RA: {ra:.4f}, DEC: {dec:.4f}"
            )
        
        # Position the text box in the bottom right corner of the plot
        ax.text(0.98, 0.05, text_str, 
                transform=ax.transAxes, 
                ha="right", va="bottom", 
                fontsize=12, bbox=bbox)
        
        # Finalize the plot to ensure accurate transformation
        fig.canvas.draw()
        
        # Get transformation from data to axes coordinates
        transform = ax.transAxes.inverted()
        
        # Define x-offsets for the cutout images
        x_offsets = [0.002, 0.02, 0.023, 0.032, 0.009, -0.07, -0.083, -0.045, 0.001, -0.10, -0.0955, -0.06, 0.007, -0.7, -1, -0.885]

        
        # Store cutout data for RGB composites
        rgbs = []  # NIRCam (F300M, F335M, F360M)
        rgbs_1 = []  # MIRI (F770W, F1000W, F1130W)
        rgbs_2 = []  # HST (F336W, F438W, F555W)
        rgbsss = []  # CO data
        rgbsss2 = []  # HST HA data
        
        # Headers for reprojection
        nircam_header = None
        miri_header = None
        hst_header = None
        filter_wavelengths2 = [0.275,0.336,0.438,0.555,0.814,2.0, 3.0, 3.35, 3.6, 7.7, 10.0, 11.3,11.4,11.5,21,21.5]  # Example values

        # Find and display cutout images above their corresponding wavelength points
        for i, (wavelength, filter_name) in enumerate(zip(filter_wavelengths2, filter_names)):
            # Get normalized x position in axes space
            x_norm, _ = transform.transform(ax.transData.transform((wavelength, 0)))
            
            # Ensure within visible bounds and apply offset
            x_norm = max(min(x_norm, 1 - 0.05), 0.0)
            x_norm += x_offsets[i]
            
            # Try to find a matching file
            # First try exact match
            filter_pattern = f"files/*{filter_name.lower()}*.fits"
            matching_files = glob.glob(filter_pattern)
            
            # If F438W is not available, try F435W
            if not matching_files and filter_name == 'F438W':
                filter_pattern = f"files/*f435w*.fits"
                matching_files = glob.glob(filter_pattern)
            
            # Try more flexible pattern matching if still no matches
            if not matching_files:
                # Try with just the filter number
                filter_number = ''.join(filter(str.isdigit, filter_name))
                if filter_number:
                    filter_pattern = f"files/*{filter_number}*.fits"
                    matching_files = glob.glob(filter_pattern)
            
            if matching_files:
                try:
                    # Use the first matching file
                    fits_file = matching_files[0]
                    
                    with fits.open(fits_file) as hdul:
                        # Find the HDU with image data
                        for hdu_idx, hdu in enumerate(hdul):
                            if hdu.data is not None and hasattr(hdu.data, 'shape') and len(hdu.data.shape) >= 2:
                                try:
                                    # Get the WCS
                                    wcs = WCS(hdu.header)
                                    
                                    # Get the image data
                                    image_data = hdu.data
                                    
                                    # Handle different dimensionality
                                    if len(image_data.shape) > 2:
                                        # For 3D data, take the first slice
                                        if len(image_data.shape) == 3:
                                            image_data = image_data[0]
                                        # For 4D data, take the first slice of the first volume
                                        elif len(image_data.shape) == 4:
                                            image_data = image_data[0, 0]
                                    
                                    # Create a SkyCoord object for the target position
                                    target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                                    
                                    # Define cutout size (2.5 arcsec)
                                    cutout_size = 2.5 * u.arcsec
                                    
                                    # Create a cutout
                                    cutout = Cutout2D(image_data, target_coord, cutout_size, wcs=wcs)
                                    
                                    # Handle NaN and Inf values
                                    cutout_data = cutout.data.copy()
                                    cutout_data[np.isnan(cutout_data)] = 0
                                    cutout_data[np.isinf(cutout_data)] = 0
                                    
                                    # Create inset axes for this cutout
                                    ax_inset = inset_axes(ax, width='80%', height='80%', loc='center',
                                                         bbox_to_anchor=(x_norm, 0.945, 0.19, 0.19),
                                                         bbox_transform=fig.transFigure)
                                    
                                    # Display the image
                                    if filter_name in ['F200W', 'F300M', 'F335M', 'F360M', 'F1000W', 'F1130W', 'F2100W']:
                                        # Use ImageNormalize for these filters
                                        norm = ImageNormalize(cutout_data)
                                        ax_inset.imshow(cutout_data, origin='lower', cmap='gray',
                                                       vmin=0, vmax=np.percentile(cutout_data, 99.5))
                                    else:
                                        # Use PowerNorm for other filters
                                        sqrt_norm = PowerNorm(gamma=0.5, vmin=0, 
                                                             vmax=np.percentile(cutout_data, 99.9))
                                        ax_inset.imshow(cutout_data, origin='lower', cmap='gray', norm=sqrt_norm)
                                    
                                    # Add a circle to mark the target position
                                    region_sky = CircleSkyRegion(center=target_coord, radius=0.67 * u.arcsec)
                                    reg = region_sky.to_pixel(cutout.wcs)
                                    reg.plot(ax=ax_inset, color='red')
                                    
                                    # Set the title to the filter name
                                    ax_inset.set_title(filter_name, fontsize=8)
                                    
                                    # Remove axis ticks and labels
                                    ax_inset.axis('off')
                                    
                                    # Store cutout data for RGB composites
                                    # Create header for the cutout
                                    header = cutout.wcs.to_header()
                                    header['NAXIS1'] = cutout.data.shape[1]
                                    header['NAXIS2'] = cutout.data.shape[0]
                                    header['NAXIS'] = 2
                                    
                                    # Store data for RGB composites
                                    if filter_name == 'F300M':  # red for NIRCam
                                        nircam_header = header.copy()
                                        rgbs.append(np.array(cutout_data))
                                    elif filter_name == 'F335M':  # green for NIRCam
                                        rgbs.append(np.array(cutout_data))
                                    elif filter_name == 'F360M':  # blue for NIRCam
                                        rgbs.append(cutout_data)
                                    elif filter_name == 'F336W':  # red for HST
                                        hst_header = header.copy()
                                        rgbs_2.append(np.array(cutout_data))
                                    elif filter_name == 'F438W' or filter_name == 'F435W':  # green for HST
                                        rgbs_2.append(np.array(cutout_data))
                                    elif filter_name == 'F555W':  # blue for HST
                                        rgbs_2.append(cutout_data)
                                    elif filter_name == 'F770W':  # red for MIRI
                                        miri_header = header.copy()
                                        rgbs_1.append(np.array(cutout_data))
                                    elif filter_name == 'F1000W':  # green for MIRI
                                        rgbs_1.append(np.array(cutout_data))
                                    elif filter_name == 'F1130W':  # blue for MIRI
                                        rgbs_1.append(cutout_data)
                                    
                                    # Found and displayed the cutout, so break the loop
                                    break
                                except Exception as e:
                                    print(f"Error creating cutout for {filter_name}: {e}")
                                    # Continue to the next HDU
                                    continue
                except Exception as e:
                    print(f"Error processing {filter_name} cutout: {e}")
        
        # Look for HST Ha data
        ha_pattern = "files/*ha*.fits"
        ha_files = glob.glob(ha_pattern)
        if ha_files:
            try:
                for ha_file in ha_files:
                    with fits.open(ha_file) as hdul:
                        # Find the HDU with image data
                        for hdu_idx, hdu in enumerate(hdul):
                            if hdu.data is not None and hasattr(hdu.data, 'shape') and len(hdu.data.shape) >= 2:
                                try:
                                    # Get the WCS
                                    wcs = WCS(hdu.header)
                                    
                                    # Get the image data
                                    image_data = hdu.data
                                    
                                    # Handle different dimensionality
                                    if len(image_data.shape) > 2:
                                        # For 3D data, take the first slice
                                        if len(image_data.shape) == 3:
                                            image_data = image_data[0]
                                        # For 4D data, take the first slice of the first volume
                                        elif len(image_data.shape) == 4:
                                            image_data = image_data[0, 0]
                                    
                                    # Create a SkyCoord object for the target position
                                    target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                                    
                                    # Define cutout size (2.5 arcsec)
                                    cutout_size = 2.5 * u.arcsec
                                    
                                    # Create a cutout
                                    cutout = Cutout2D(image_data, target_coord, cutout_size, wcs=wcs)
                                    
                                    # Handle NaN and Inf values
                                    cutout_data = cutout.data.copy()
                                    cutout_data[np.isnan(cutout_data)] = 0
                                    cutout_data[np.isinf(cutout_data)] = 0
                                    
                                    # Create inset axes for this cutout - position for HST Ha
                                    wavelength = 21.5  # Position for HST Ha
                                    x_norm, _ = transform.transform(ax.transData.transform((wavelength, 0)))
                                    x_norm = max(min(x_norm, 1 - 0.05), 0.0)
                                    x_norm += -0.7  # Apply offset for HST Ha
                                    
                                    ax_inset = inset_axes(ax, width='80%', height='80%', loc='center',
                                                         bbox_to_anchor=(x_norm, 0.735, 0.19, 0.19),
                                                         bbox_transform=fig.transFigure)
                                    
                                    # Use PowerNorm for HST Ha
                                    from astropy.visualization import simple_norm
                                    import matplotlib.colors as mcolors
                                    sqrt_norm = mcolors.PowerNorm(gamma=0.5, vmin=0, vmax=np.percentile(cutout_data, 99.9))
                                    ax_inset.imshow(cutout_data, origin='lower', cmap='gray', norm=sqrt_norm)
                                    
                                    # Add a circle to mark the target position
                                    region_sky = CircleSkyRegion(center=target_coord, radius=0.67 * u.arcsec)
                                    reg = region_sky.to_pixel(cutout.wcs)
                                    reg.plot(ax=ax_inset, color='red')
                                    
                                    # Set the title to HST Ha
                                    ax_inset.set_title('HST Ha', fontsize=8)
                                    
                                    # Remove axis ticks and labels
                                    ax_inset.axis('off')
                                    
                                    # Store cutout data for HST Ha contours
                                    header = cutout.wcs.to_header()
                                    header['NAXIS1'] = cutout.data.shape[1]
                                    header['NAXIS2'] = cutout.data.shape[0]
                                    header['NAXIS'] = 2
                                    
                                    # if hst_header is not None:
                                    #     from reproject import reproject_interp
                                    #     fits_file = Projection(value=cutout.data, header=header, wcs=WCS(header))
                                    #     fits_projected = fits_file.reproject(hst_header)
                                    #     rgbsss2.append(np.array(fits_projected.data))
                                    #     print("Added HST Ha data to rgbsss2 with reprojection")
                                    # else:
                                    #     rgbsss2.append(np.array(cutout_data))
                                    #     print("Added HST Ha data to rgbsss2 without reprojection")
                                    
                                    break
                                except Exception as e:
                                    print(f"Error creating HST Ha cutout: {e}")
                                    continue
            except Exception as e:
                print(f"Error processing HST Ha file: {e}")
        
        # Create RGB composite images if we have enough data
        # NIRCam RGB
        if len(rgbs) == 3 and nircam_header is not None:
            try:
                rgbs = np.array(rgbs)
                imgs = np.zeros((rgbs[0].shape[1], rgbs[0].shape[0], 3))
                imgs[:, :, 0] = linear(rgbs[2], scale_min=0, scale_max=np.nanpercentile(rgbs[2], 99))
                imgs[:, :, 1] = linear(rgbs[1], scale_min=0, scale_max=np.nanpercentile(rgbs[1], 99))
                imgs[:, :, 2] = linear(rgbs[0], scale_min=0, scale_max=np.nanpercentile(rgbs[0], 99))
                
                ax_inset2 = inset_axes(ax, width='40%', height='40%', loc='center',
                                  bbox_to_anchor=(-0.17, 0.52, 0.62, 0.62),
                                  bbox_transform=fig.transFigure)
                
                region_sky = CircleSkyRegion(center=target_coord, radius=0.67 * u.arcsec)
                reg = region_sky.to_pixel(WCS(nircam_header))
                reg.plot(ax=ax_inset2, color='red')
                
                ax_inset2.imshow(imgs, origin='lower')
                ax_inset2.text(0.63, 0.83, 'NIRCam', fontsize=9, color='white',
                              transform=ax_inset2.transAxes, 
                              horizontalalignment='right', verticalalignment='bottom')
                ax_inset2.axis('off')
            except Exception as e:
                print(f"Error creating NIRCam RGB: {e}")
        
        # MIRI RGB
        if len(rgbs_1) == 3 and miri_header is not None:
            try:
                rgbs_1 = np.array(rgbs_1)
                imgs = np.zeros((rgbs_1[0].shape[1], rgbs_1[0].shape[0], 3))
                imgs[:, :, 0] = linear(rgbs_1[2], scale_min=0, scale_max=np.percentile(rgbs_1[2], 99))
                imgs[:, :, 1] = linear(rgbs_1[1], scale_min=0, scale_max=np.percentile(rgbs_1[1], 99))
                imgs[:, :, 2] = linear(rgbs_1[0], scale_min=0, scale_max=np.percentile(rgbs_1[0], 99))
                
                ax_inset2 = inset_axes(ax, width='40%', height='40%', loc='center',
                                  bbox_to_anchor=(-0.073, 0.52, 0.62, 0.62),
                                  bbox_transform=fig.transFigure)
                
                region_sky = CircleSkyRegion(center=target_coord, radius=0.67 * u.arcsec)
                reg = region_sky.to_pixel(WCS(miri_header))
                reg.plot(ax=ax_inset2, color='red')
                
                ax_inset2.imshow(imgs, origin='lower')
                ax_inset2.text(0.4, 0.83, 'MIRI', fontsize=9, color='white',
                              transform=ax_inset2.transAxes, 
                              horizontalalignment='right', verticalalignment='bottom')
                ax_inset2.axis('off')
                
                # Add CO contours if available
                if len(rgbsss) > 0:
                    try:
                        smoothed_data = rgbsss[0]
                        smoothed_data[np.isnan(smoothed_data)] = 0
                        p50 = np.percentile(smoothed_data, 70)
                        p60 = np.percentile(smoothed_data, 80)
                        p75 = np.percentile(smoothed_data, 98)
                        contour_levels = [p50, p60, p75]
                        ax_inset2.contour(smoothed_data, levels=contour_levels, colors='white', linewidths=0.3, alpha=0.5)
                    except Exception as e:
                        print(f"Error adding CO contours: {e}")
            except Exception as e:
                print(f"Error creating MIRI RGB: {e}")
        
        # HST RGB
        if len(rgbs_2) == 3 and hst_header is not None:
            try:
                rgbs_2 = np.array(rgbs_2)
                imgs = np.zeros((rgbs_2[0].shape[1], rgbs_2[0].shape[0], 3))
                imgs[:, :, 0] = linear(rgbs_2[2], scale_min=0, scale_max=np.percentile(rgbs_2[2], 99))
                imgs[:, :, 1] = linear(rgbs_2[1], scale_min=0, scale_max=np.percentile(rgbs_2[1], 99))
                imgs[:, :, 2] = linear(rgbs_2[0], scale_min=0, scale_max=np.percentile(rgbs_2[0], 99))
                
                ax_inset2 = inset_axes(ax, width='40%', height='40%', loc='center',
                                  bbox_to_anchor=(-0.17, 0.28, 0.62, 0.62),
                                  bbox_transform=fig.transFigure)
                
                region_sky = CircleSkyRegion(center=target_coord, radius=0.67 * u.arcsec)
                reg = region_sky.to_pixel(WCS(hst_header))
                reg.plot(ax=ax_inset2, color='red')
                
                ax_inset2.imshow(imgs, origin='lower')
                ax_inset2.text(0.4, 0.83, 'HST', fontsize=9, color='white',
                              transform=ax_inset2.transAxes, 
                              horizontalalignment='right', verticalalignment='bottom')
                ax_inset2.axis('off')
                
                # Add HST HA contours if available
                if len(rgbsss2) > 0:
                    try:
                        from scipy.ndimage import gaussian_filter
                        smoothed_data = gaussian_filter(rgbsss2[0], 4)
                        smoothed_data[np.isnan(smoothed_data)] = 0
                        p50 = np.percentile(smoothed_data, 70)
                        p60 = np.percentile(smoothed_data, 80)
                        p75 = np.percentile(smoothed_data, 99)
                        contour_levels = [p50, p60, p75]
                        ax_inset2.contour(smoothed_data, levels=contour_levels, colors='white', linewidths=0.3, alpha=0.5)
                    except Exception as e:
                        print(f"Error adding HST HA contours: {e}")
            except Exception as e:
                print(f"Error creating HST RGB: {e}")
        
        # Adjust layout
        plt.tight_layout()
        
        # Generate a filename based on coordinates
        filename = f"SED_RA{ra:.4f}_DEC{dec:.4f}.png"
        # Save to static directory instead of root directory
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", filename)
        
        # Save the figure to disk with high DPI and including all cutouts
        fig.savefig(filepath, format='png', dpi=400, bbox_inches='tight')

        plt.close(fig)
        
        print(f"SED saved successfully as {filename} with DPI=400")
        
        return JSONResponse(
            status_code=200,
            content={"message": f"SED saved successfully as {filename}", "filepath": filepath, "filename": filename}
        )
    
    except Exception as e:
        import traceback
        print(f"Error saving SED: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to save SED: {str(e)}"}
        )


@app.get("/source-properties/")
async def source_properties(ra: str, dec: str, catalog_name: str):
    """Get all properties for a specific source based on RA and DEC coordinates."""
    try:
        from astropy.coordinates import Angle
        import astropy.units as u
        
        # Helper function to parse coordinates (similar to the one in load_catalog_data)
        def parse_coordinate(coord_str, is_ra=None):
            """
            Parse a coordinate string that could be in decimal or sexagesimal format.
            Returns the coordinate value in decimal degrees.
            """
            if coord_str is None:
                return None
                
            # Convert to string if it's not already
            coord_str = str(coord_str).strip()
            
            try:
                # First, try parsing as a simple float
                return float(coord_str)
            except ValueError:
                # If that fails, try parsing as a sexagesimal string
                try:
                    # Check if we can determine the format
                    has_h = 'h' in coord_str
                    has_m = 'm' in coord_str
                    has_s = 's' in coord_str
                    has_d = 'd' in coord_str or '°' in coord_str
                    has_quote = "'" in coord_str
                    has_dquote = '"' in coord_str
                    
                    # Determine if it's RA or DEC if not specified
                    if is_ra is None:
                        if has_h:  # Hour marker usually indicates RA
                            is_ra = True
                        elif has_d:  # Degree marker usually indicates DEC
                            is_ra = False
                        else:
                            # Default to RA for formats like "12:34:56.7"
                            is_ra = True
                    
                    # Parse using the appropriate unit
                    if is_ra:
                        return Angle(coord_str, unit=u.hourangle).degree
                    else:
                        return Angle(coord_str, unit=u.deg).degree
                        
                except Exception as e:
                    # If direct parsing fails, try with more explicit handling
                    try:
                        # For HMS format (RA): convert 01h36m43.31s to 01:36:43.31
                        if 'h' in coord_str and 'm' in coord_str:
                            # Replace h, m, s with :, :, ''
                            converted = coord_str.replace('h', ':').replace('m', ':').replace('s', '')
                            if is_ra is None or is_ra:
                                return Angle(converted, unit=u.hourangle).degree
                            else:
                                return Angle(converted, unit=u.deg).degree
                    except Exception as e2:
                        print(f"Failed to parse with explicit handling: {coord_str}, Error: {e2}")
                    
                    print(f"Failed to parse coordinate: {coord_str}, Error: {e}")
                    raise ValueError(f"Could not parse coordinate: {coord_str}")
        
        # Parse the input coordinates to decimal degrees
        try:
            ra_decimal = parse_coordinate(ra, is_ra=True)
            dec_decimal = parse_coordinate(dec, is_ra=False)
            print(f"Parsed coordinates: RA={ra_decimal}, DEC={dec_decimal}")
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid coordinate format: {str(e)}"}
            )
        
        # Check if we have the catalog data loaded
        if catalog_name not in loaded_catalogs:
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog '{catalog_name}' not loaded. Please load the catalog first."}
            )
        
        # Use the already loaded catalog data
        catalog_table = loaded_catalogs[catalog_name]
        print(f"Using already loaded catalog: {catalog_name}")
        
        # Find RA and DEC columns
        ra_col = None
        dec_col = None
        
        for col_name in catalog_table.colnames:
            if col_name.lower() in ['ra', 'alpha', 'alpha_j2000', 'raj2000', 'cen_ra']:
                ra_col = col_name
            elif col_name.lower() in ['dec', 'delta', 'delta_j2000', 'dej2000', 'cen_dec']:
                dec_col = col_name
        
        if not ra_col or not dec_col:
            return JSONResponse(
                status_code=400,
                content={"error": "Could not find RA and DEC columns in catalog"}
            )
        
        # Parse catalog coordinates if needed
        # First check if any of the coordinates in the catalog might be in string format
        need_parsing = False
        try:
            # Try to get first coordinate value
            first_ra = catalog_table[ra_col][0]
            if not isinstance(first_ra, (int, float, np.integer, np.floating)):
                need_parsing = True
        except:
            pass
        
        # Create arrays for the coordinates
        if need_parsing:
            print("Catalog contains non-numerical coordinates, parsing...")
            # We need to parse the coordinates in the catalog
            ra_values = np.array([parse_coordinate(val, is_ra=True) for val in catalog_table[ra_col]])
            dec_values = np.array([parse_coordinate(val, is_ra=False) for val in catalog_table[dec_col]])
        else:
            # Coordinates are already numeric
            ra_values = np.array(catalog_table[ra_col], dtype=float)
            dec_values = np.array(catalog_table[dec_col], dtype=float)
        
        # Calculate angular distance to find closest object
        ra_diff = np.abs(ra_values - ra_decimal)
        dec_diff = np.abs(dec_values - dec_decimal)
        distances = np.sqrt(ra_diff**2 + dec_diff**2)
        closest_idx = np.argmin(distances)
        
        # Get the closest object
        closest_obj = catalog_table[closest_idx]
        
        # Check if the object is close enough (within 1 arcsec)
        if distances[closest_idx] > 0.0003:  # ~1 arcsec in degrees
            return JSONResponse(
                status_code=404,
                content={"error": "No object found near the specified coordinates"}
            )
        
        # Convert the object to a dictionary
        obj_dict = {}
        for col_name in catalog_table.colnames:
            try:
                # Try to convert to a Python native type
                value = closest_obj[col_name]
                if isinstance(value, (np.integer, np.floating, np.bool_)):
                    value = value.item()  # Convert numpy types to Python native types
                elif isinstance(value, np.ndarray):
                    # Handle arrays more carefully
                    try:
                        value = value.tolist()  # Convert numpy arrays to lists
                    except:
                        value = str(value)  # Fall back to string representation
                # Handle NaN, inf, and other special values
                if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
                    value = None
                obj_dict[col_name] = value
            except Exception as e:
                # If conversion fails, use string representation or None
                try:
                    obj_dict[col_name] = str(closest_obj[col_name])
                except:
                    obj_dict[col_name] = None
                print(f"Warning: Could not convert column {col_name}: {e}")
        
        return JSONResponse(
            status_code=200,
            content={"properties": obj_dict}
        )
    
    except Exception as e:
        import traceback
        print(f"Error getting source properties: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get source properties: {str(e)}"}
        )

@app.get("/catalog-boolean-columns/")
async def catalog_boolean_columns(catalog_name: str):
    """Get a list of boolean columns from the catalog for flag filtering."""
    try:
        catalog_path = f"catalogs/{catalog_name}"
        
        if not os.path.exists(catalog_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Read the FITS catalog - use HDU 1 for tables
        try:
            with fits.open(catalog_path) as hdul:
                # Try HDU 1 first (most common for tables)
                table_hdu = 1
                
                # If HDU 1 is not a table, try to find a table HDU
                if not isinstance(hdul[table_hdu], (fits.BinTableHDU, fits.TableHDU)):
                    for i, hdu in enumerate(hdul):
                        if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                            table_hdu = i
                            print(f"Found table in HDU {i}")
                            break
                
                # Get table data
                table = Table(hdul[table_hdu].data)
                print(f"Successfully loaded catalog info from HDU {table_hdu}: {catalog_name}")
                
                # Get column names
                columns = table.colnames
                
                # Find boolean columns
                boolean_columns = []
                
                # Process first few rows to identify boolean columns
                sample_size = min(5, len(table))
                
                for col in columns:
                    is_boolean = True
                    
                    # Check the first few rows
                    for i in range(sample_size):
                        val = table[col][i]
                        
                        # Check if value is a boolean type or looks like a boolean
                        if isinstance(val, (bool, np.bool_)):
                            continue
                        elif isinstance(val, (str, np.str_)) and val.lower() in ('true', 'false'):
                            continue
                        elif isinstance(val, (int, np.integer)) and val in (0, 1):
                            continue
                        else:
                            is_boolean = False
                            break
                    
                    # If all checked rows appear to be boolean, add to list
                    if is_boolean:
                        boolean_columns.append(col)
                
                return JSONResponse(content={
                    "boolean_columns": boolean_columns
                })
        except Exception as e:
            print(f"Error in catalog_boolean_columns: {e}")
            import traceback
            print(traceback.format_exc())
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to get boolean columns: {str(e)}"}
            )
            
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get boolean columns: {str(e)}"}
        )       
@app.get("/save-sed/")
async def save_sed(ra: float, dec: float, catalog_name: str):
    """Save a SED plot for a specific region based on RA and DEC coordinates."""
    try:
        # Generate a filename based on coordinates
        filename = f"SED_RA{ra:.4f}_DEC{dec:.4f}.png"
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", filename)
        
        # Check if the file exists
        if not os.path.exists(filepath):
            return JSONResponse(
                status_code=404,
                content={"error": f"SED file not found. Please generate it first."}
            )
        
        # Return success response
        return JSONResponse(
            status_code=200,
            content={"message": f"SED saved successfully as {filename}", "filepath": filepath}
        )
    
    except Exception as e:
        import traceback
        print(f"Error saving SED: {e}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to save SED: {str(e)}"}
        )

# Helper functions for image processing
def linear(inputArray, scale_min=None, scale_max=None):
    """Performs linear scaling of the input numpy array."""
    imageData = np.array(inputArray, copy=True)

    if scale_min is None:
        scale_min = imageData.min()
    if scale_max is None:
        scale_max = imageData.max()

    imageData = imageData.clip(min=scale_min, max=scale_max)
    imageData = (imageData - scale_min) / (scale_max - scale_min)
    indices = np.where(imageData < 0)
    imageData[indices] = 0.0
    indices = np.where(imageData > 1)
    imageData[indices] = 1.0

    return imageData

def sky_median_sig_clip(input_arr, sig_fract, percent_fract, max_iter=100):
    """Estimating sky value for a given number of iterations"""
    work_arr = np.ravel(input_arr)
    old_sky = np.median(work_arr)
    sig = work_arr.std()
    upper_limit = old_sky + sig_fract * sig
    lower_limit = old_sky - sig_fract * sig
    indices = np.where((work_arr < upper_limit) & (work_arr > lower_limit))
    work_arr = work_arr[indices]
    new_sky = np.median(work_arr)
    iteration = 0
    while ((math.fabs(old_sky - new_sky)/new_sky) > percent_fract) and (iteration < max_iter):
        iteration += 1
        old_sky = new_sky
        sig = work_arr.std()
        upper_limit = old_sky + sig_fract * sig
        lower_limit = old_sky - sig_fract * sig
        indices = np.where((work_arr < upper_limit) & (work_arr > lower_limit))
        work_arr = work_arr[indices]
        new_sky = np.median(work_arr)
    return (new_sky, iteration)

def sky_mean_sig_clip(input_arr, sig_fract, percent_fract, max_iter=100):
    """Estimating sky value for a given number of iterations"""
    work_arr = np.ravel(input_arr)
    old_sky = np.mean(work_arr)
    sig = work_arr.std()
    upper_limit = old_sky + sig_fract * sig
    lower_limit = old_sky - sig_fract * sig
    indices = np.where((work_arr < upper_limit) & (work_arr > lower_limit))
    work_arr = work_arr[indices]
    new_sky = np.mean(work_arr)
    iteration = 0
    while ((math.fabs(old_sky - new_sky)/new_sky) > percent_fract) and (iteration < max_iter):
        iteration += 1
        old_sky = new_sky
        sig = work_arr.std()
        upper_limit = old_sky + sig_fract * sig
        lower_limit = old_sky - sig_fract * sig
        indices = np.where((work_arr < upper_limit) & (work_arr > lower_limit))
        work_arr = work_arr[indices]
        new_sky = np.mean(work_arr)
    return (new_sky, iteration)

def sqrt(inputArray, scale_min=None, scale_max=None):
    """Performs sqrt scaling of the input numpy array."""
    imageData = np.array(inputArray, copy=True)

    if scale_min is None:
        scale_min = imageData.min()
    if scale_max is None:
        scale_max = imageData.max()

    imageData = imageData.clip(min=scale_min, max=scale_max)
    imageData = imageData - scale_min
    indices = np.where(imageData < 0)
    imageData[indices] = 0.0
    imageData = np.sqrt(imageData)
    imageData = imageData / math.sqrt(scale_max - scale_min)

    return imageData

def log(inputArray, scale_min=None, scale_max=None):
    """Performs log10 scaling of the input numpy array."""
    imageData = np.array(inputArray, copy=True)

    if scale_min is None:
        scale_min = imageData.min()
    if scale_max is None:
        scale_max = imageData.max()
    factor = math.log10(scale_max - scale_min)
    indices0 = np.where(imageData < scale_min)
    indices1 = np.where((imageData >= scale_min) & (imageData <= scale_max))
    indices2 = np.where(imageData > scale_max)
    imageData[indices0] = 0.0
    imageData[indices2] = 1.0
    try:
        imageData[indices1] = np.log10(imageData[indices1])/factor
    except:
        print("Error on math.log10")

    return imageData



def asinh(inputArray, scale_min=None, scale_max=None, non_linear=2.0):
    """Performs asinh scaling of the input numpy array."""
    imageData = np.array(inputArray, copy=True)

    if scale_min is None:
        scale_min = imageData.min()
    if scale_max is None:
        scale_max = imageData.max()
    factor = np.arcsinh((scale_max - scale_min)/non_linear)
    indices0 = np.where(imageData < scale_min)
    indices1 = np.where((imageData >= scale_min) & (imageData <= scale_max))
    indices2 = np.where(imageData > scale_max)
    imageData[indices0] = 0.0
    imageData[indices2] = 1.0
    imageData[indices1] = np.arcsinh((imageData[indices1] - scale_min)/non_linear)/factor

    return imageData


# ---------------------------
# Run FastAPI Server in a Thread
# ---------------------------
def run_server():
    """Run FastAPI in a separate thread."""
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    if RUNNING_ON_SERVER:
        run_server()  # Run FastAPI if deployed online
    else:
        # Start FastAPI in a separate thread
        server_thread = threading.Thread(target=run_server, daemon=True)
        server_thread.start()

        # Run macOS GUI
        run_mac_app()
