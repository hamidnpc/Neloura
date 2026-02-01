# Neloura
<img src="static/logo/logo.png" alt="Neloura Logo" width="200"/>

**A modern, web-based astronomical image analysis and visualization platform.  
Check the server-based app [here](https://neloura.com)**

Neloura is a comprehensive tool for astronomical data analysis, specializing in FITS image processing, catalog management, and multi-wavelength visualization. Built with a Python FastAPI backend and a sophisticated vanilla JavaScript frontend, it provides an intuitive web interface for exploring astronomical datasets with professional-grade analysis capabilities.

The platform features a clean, responsive design with integrated code execution, real-time progress monitoring, and advanced visualization tools—all accessible through any modern web browser without requiring local software installation.


## Key Features

### Advanced FITS Image Processing
- **High-performance tile-based rendering** for large astronomical images
- **Real-time image scaling** with multiple stretch functions (linear, logarithmic, sqrt, power, asinh)
- **Dynamic range adjustment** with percentile-based scaling
- **Multi-HDU support** with automatic HDU detection and selection

### Comprehensive Catalog Management
- **Advanced filtering and search** with TopCat-like functionality
- **Column mapping system** for flexible data integration
- **Spatial queries** including cone search and coordinate matching
- **Real-time catalog overlay** on astronomical images

### Multi-wavelength Visualization
- **RGB composite generation** for HST, JWST NIRCam, and MIRI data
- **Spectral Energy Distribution (SED) plotting**
- **Automated cutout extraction** from multi-instrument datasets
- **Publication-ready figure generation**

### Source Detection & Analysis
- **Automated peak finding** with configurable parameters
- **Source property extraction** and photometry
- **Cross-matching between catalogs and images**
- **Artificial source injection** for completeness testing

### Modern Web Interface
- **Professional toolbar** with zoom controls and dropdown menus
- **Integrated code execution** with CodeMirror syntax highlighting (Python)
- **Real-time progress monitoring** with progress indicators
- **Interactive plotting canvas** with OpenSeadragon deep zoom capabilities
- **Responsive catalog management** with dynamic content loading
- **Modal dialogs** for FITS header inspection and data analysis
- **WebSocket communication** for live updates and notifications
- **No installation required** — runs entirely in the browser

## Getting Started

### Prerequisites
- Python 3.8 or higher
- 4GB+ RAM (8GB+ recommended for large datasets)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/neloura.git
   cd neloura
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up directories**
   ```bash
   mkdir -p files catalogs psf kernels images static
   ```

4. **Run the application**
   ```bash
   python main.py
   ```

5. **Access the interface**
   Open your browser to `http://localhost:8000`

## API & Deep Links (Practical Guide)

Neloura is a web app, but many actions are driven by HTTP endpoints. This section documents the **most useful URLs** for automation and sharing links.

### Open a FITS directly in the viewer

Pretty route (redirects to `/?file=...`):

- `GET /open/<path-to-fits>?hdu=<index>`

Local example:

- `http://localhost:8000/open/PHANGS-JWST/ngc4254_miri_lv3_f2100w_i2d_anchor.fits?hdu=1`

Or try it on `neloura.com`:

- `https://neloura.com/open/PHANGS-JWST/ngc4254_miri_lv3_f2100w_i2d_anchor.fits?hdu=1`

### Search files in the in-app file browser (deep link)

This fills the file browser search box (`#files-search-input`) and lists matching files.

- `GET /search/<text>` (path form)

Examples:

- `http://localhost:8000/search/ngc0628`

Or on `neloura.com`:

- `https://neloura.com/search/ngc0628`

### Load a catalog overlay (via `catalog=` deep link)

The easiest way to load a catalog in the UI is to open the app (either `/open/...` or `/`) with query parameters:

- `catalog=<catalog_name>`: catalog file name (usually under `catalogs/`)
- `ra_col=<col>` / `dec_col=<col>`: RA/Dec columns in the catalog
- `size_col=<col>`: optional size/radius column (e.g. `bmaj`)
- `size_unit=px|arcsec` (optional): force units for `size_col`

Example (image + catalog in one link):

- `http://localhost:8000/open/PHANGS-JWST/ngc0628_miri_lv3_f2100w_i2d_anchor.fits?hdu=1&catalog=21um_catalog_hassani_et_al_jan_2026.fits&ra_col=ra&dec_col=dec&size_col=bmaj&size_unit=arcsec`

- `http://localhost:8000/open/PHANGS-JWST/ngc0628_miri_lv3_f2100w_i2d_anchor.fits?hdu=1&catalog=21um_catalog_hassani_et_al_jan_2026.fits&ra_col=ra&dec_col=dec&size_col=5&size_unit=px`

Or on `neloura.com`:

- `https://neloura.com/open/PHANGS-JWST/ngc0628_miri_lv3_f2100w_i2d_anchor.fits?hdu=1&catalog=21um_catalog_hassani_et_al_jan_2026.fits&ra_col=ra&dec_col=dec&size_col=bmaj&size_unit=arcsec`
- `https://neloura.com/open/PHANGS-HST/hlsp_phangs-hst_hst_wfc3-uvis_ngc1385_f814w_v1_exp-drc-sci.fits?hdu=0&catalog=10um_catalog_hassani_et_al_jan_2026.fits&ra_col=ra&dec_col=dec&size_col=0.06&size_unit=arcsec`

### Quick Start Guide

1. **Load a FITS image**: Use the file browser to select and load your astronomical image
2. **Upload catalogs**: Drag and drop FITS catalogs or CSV files with source coordinates
3. **Generate visualizations**: Create RGB composites or SED plots for selected objects
4. **Export results**: Download generated plots and analysis results

```
neloura/
├── main.py                 # FastAPI backend server
├── peak_finder.py          # Source detection algorithms
├── ast_test.py            # Artificial source testing
├── coding.py              # Development tools integration
├── static/                # Frontend assets
│   ├── index.html         # Main application interface
│   ├── main.js            # Core application logic
│   ├── fits-viewer.js     # FITS image viewer component
│   ├── catalog-manager.js # Catalog handling and overlay
│   ├── peak.js            # Source detection interface
│   ├── sed.js             # SED plotting functionality
│   ├── plotter.js         # Interactive plotting tools
│   ├── asttest.js         # Artificial source testing UI
│   ├── catalogs.js        # Catalog management interface
│   ├── files.js           # File browser and upload
│   ├── canvas.js          # Canvas-based overlays
│   ├── local_coding.js    # Integrated code execution
│   ├── style.css          # Main application styles
│   ├── progress.css       # Progress indicator styles
│   └── vendor/            # Third-party libraries
│       ├── openseadragon/ # Deep zoom image viewer
│       ├── codemirror/    # Code editor
│       ├── fabric/        # Canvas manipulation
│       ├── lodash/        # Utility functions
│       └── sweetalert2/   # Enhanced alerts
├── files/                 # FITS image storage
├── catalogs/              # Catalog file storage
├── psf/                   # Point spread function files
├── kernels/               # Convolution kernels
└── images/                # Generated plot outputs
```

## Project Structure

### Backend
- **FastAPI** - High-performance Python web framework
- **Astropy** - Core astronomical data handling
- **NumPy/SciPy** - Numerical computing
- **Matplotlib** - Scientific plotting
- **Uvicorn** - ASGI server

### Frontend Architecture
- **JavaScript** - No framework dependencies, optimized performance
- **OpenSeadragon** - Professional deep-zoom image viewer for astronomical images
- **CodeMirror** - Advanced code editor with Python syntax highlighting
- **Fabric.js** - High-performance canvas rendering for overlays


## Configuration

Neloura is configurable through constants defined in `main.py`. Key settings include:

```python
# Image processing
IMAGE_TILE_SIZE_PX = 256
DYNAMIC_RANGE_PERCENTILES = {'q_min': 0.5, 'q_max': 99.5}

# File handling
MAX_CATALOG_ROWS_FULL_LOAD = 50000000
DEFAULT_API_PAGE_SIZE = 1000

# Visualization
RGB_FIGURE_SIZE_INCHES = (10, 10)
SED_FIGURE_SIZE_INCHES = (18, 14)
```

### Admin mode (`NELOURA_ADMIN`)

Neloura has an **admin mode** intended for trusted/local deployments. Enable it by setting the environment variable `NELOURA_ADMIN=true` when starting the server.

Example:

```bash
NELOURA_ADMIN=true python main.py
```


When **admin mode** is enabled, Neloura unlocks privileged endpoints, including:

- **Local coding routes**: `/local-coding/*` is enabled (otherwise these routes return `403`).
- **Maintenance cleanup**: `/admin/erase-uploads` is enabled (used by the Settings UI to clear the uploads folder).

### Temporary (“temporal”) file removal (`files/uploads`)

Neloura treats `files/uploads/` as a **temporary workspace** (uploads + intermediate/generated artifacts). On startup, a background worker is scheduled that periodically deletes the contents of this folder (default interval: 60 minutes).

Important implications:

- **Admin mode does not disable or change the periodic cleanup**. It only enables the *manual* “erase uploads” endpoint (`/admin/erase-uploads`) so you can trigger an immediate cleanup.
- **Do not store anything you want to keep long-term in `files/uploads/`**, since it may be removed automatically. Put persistent data in `files/`, `catalogs/`, or a separate directory.


## Acknowledgments

**Backend (Python):**

- Aiohttp
- Astropy
- FastAPI
- Matplotlib
- NumPy
- Pillow
- Photutils
- Psutil
- Pydantic
- Regions
- Reproject
- Scikit-image
- Scipy
- Spectral-cube
- Uvicorn

**Frontend (JavaScript):**

- OpenSeadragon
- D3.js
- SweetAlert2
