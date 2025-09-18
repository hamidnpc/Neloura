import sys
import os
import threading
import time
from fastapi import FastAPI, Response, Body, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import uuid
from multiprocessing import Process, Manager
import numpy as np
import io
from astropy.io import fits
from astropy.wcs import WCS
from astropy.table import Table
from astropy.coordinates import SkyCoord
from astropy.coordinates import search_around_sky

import astropy.units as u
import json
from pathlib import Path
import struct
import base64
import glob
from ast_test import AstInjectRequest, inject_sources, get_pixel_scale_from_header, AstPlotRequest, compute_ast_plot
import re
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas
from astropy.nddata import Cutout2D
from mpl_toolkits.axes_grid1.inset_locator import inset_axes
from matplotlib.colors import PowerNorm, LogNorm
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
from datetime import datetime # Add datetime import
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures import ThreadPoolExecutor
from astropy.time import Time # Added for type handling
import psutil # Added for system stats
import asyncio # <--- ADD THIS IMPORT
import logging # Add logger import
import warnings # Import the warnings module
from astropy.visualization import simple_norm
import matplotlib as mpl
from pydantic import BaseModel
from typing import Optional, List, Literal, Union
from scipy.ndimage import zoom
from pydantic import BaseModel
from typing import Optional, List, Literal
from scipy.ndimage import zoom
from astropy.wcs import WCS as WCSpy
from astropy.wcs.utils import proj_plane_pixel_scales
import coding
from local_coding import router as local_coding_router
from settings_api import router as settings_router
plt.rcParams["font.family"] = "serif"
mpl.rcParams['mathtext.fontset'] = 'stix'
mpl.rcParams['mathtext.rm'] = 'serif'

#Global parameters

logger = logging.getLogger(__name__) # Create a logger instance

# Ensure INFO logs are visible in console and file unless overridden
def _configure_logging():
    try:
        level_name = os.getenv('NELOURA_LOG_LEVEL', 'INFO').upper()
        level = getattr(logging, level_name, logging.INFO)
        root = logging.getLogger()
        root.setLevel(level)
        logger.setLevel(level)

        fmt = logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s')

        # Stream handler to stdout
        if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
            sh = logging.StreamHandler(stream=sys.stdout)
            sh.setLevel(level)
            sh.setFormatter(fmt)
            root.addHandler(sh)

        # Optional file handler (simple: truncate if > 5MB, no backups)
        log_file = os.getenv('NELOURA_LOG_FILE', 'neloura.log')
        if log_file and not any(isinstance(h, logging.FileHandler) for h in root.handlers):
            try:
                try:
                    p = Path(log_file)
                    if p.exists() and p.is_file():
                        if p.stat().st_size > 5 * 1024 * 1024:
                            p.unlink()
                except Exception:
                    pass
                fh = logging.FileHandler(log_file)
                fh.setLevel(level)
                fh.setFormatter(fmt)
                root.addHandler(fh)
            except Exception:
                pass

        # Ensure uvicorn loggers also write to the same file
        try:
            for lname in ('uvicorn', 'uvicorn.error', 'uvicorn.access'):
                ul = logging.getLogger(lname)
                ul.setLevel(level)
                # Attach a file handler if not present
                has_file = any(isinstance(h, logging.FileHandler) for h in ul.handlers)
                if not has_file and log_file:
                    try:
                        # Do the same simple truncate logic
                        try:
                            p = Path(log_file)
                            if p.exists() and p.is_file():
                                if p.stat().st_size > 5 * 1024 * 1024:
                                    p.unlink()
                        except Exception:
                            pass
                        fh2 = logging.FileHandler(log_file)
                        fh2.setLevel(level)
                        fh2.setFormatter(fmt)
                        ul.addHandler(fh2)
                    except Exception:
                        pass
        except Exception:
            pass

        # Capture warnings -> logging
        try:
            logging.captureWarnings(True)
        except Exception:
            pass

        # Redirect stdout/stderr to logging so print() also goes to neloura.log
        # (guard so we don't wrap multiple times)
        try:
            if not getattr(sys, '_neloura_tee', False):
                class _StreamToLogger:
                    def __init__(self, _logger, _level):
                        self._logger = _logger
                        self._level = _level
                        self._buffer = ''
                    def write(self, message):
                        try:
                            msg = str(message)
                        except Exception:
                            msg = message
                        self._buffer += msg
                        while '\n' in self._buffer:
                            line, self._buffer = self._buffer.split('\n', 1)
                            line = line.rstrip('\r')
                            if line:
                                try:
                                    self._logger.log(self._level, line)
                                except Exception:
                                    pass
                    def flush(self):
                        if self._buffer:
                            try:
                                self._logger.log(self._level, self._buffer.rstrip('\r\n'))
                            except Exception:
                                pass
                            self._buffer = ''
                    # Some formatters (e.g., uvicorn) ask stdout.isatty() to enable colors
                    def isatty(self):
                        return False

                sys.stdout = _StreamToLogger(logging.getLogger('stdout'), logging.INFO)
                sys.stderr = _StreamToLogger(logging.getLogger('stderr'), logging.ERROR)
                sys._neloura_tee = True
        except Exception:
            pass
    except Exception:
        # Fall back silently; FastAPI/uvicorn default logging will still work
        pass

_configure_logging()

# --- Global Configuration Constants for Performance Tuning ---
MAX_SAMPLE_POINTS_FOR_DYN_RANGE = 200  # Lower to speed percentile on slow storage
# --- End Global Configuration Constants ---

# Prime psutil.cpu_percent() for non-blocking calls later
psutil.cpu_percent(interval=None)

# ==============================================================================
# --- NELOURA APPLICATION CONFIGURATION (FINAL & VERIFIED) ---
# ==============================================================================
# This section contains a comprehensive, verified list of all tunable parameters
# for the application, extracted directly from the source code.
# ==============================================================================

# ------------------------------------------------------------------------------
# I. Web Server & API Configuration
# ------------------------------------------------------------------------------
UVICORN_HOST = "127.0.0.1"
UVICORN_PORT = 8000
UVICORN_RELOAD_MODE = True
DEFAULT_EXPORT_FORMAT = 'csv'
MAX_EXPORT_ROWS = 10000
CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE = 1000
SYSTEM_STATS_UPDATE_INTERVAL = 2
PROXY_DOWNLOAD_TIMEOUT = 60
FIND_FILES_TIMEOUT = 2.0
PEAK_FINDER_TIMEOUT = 300

# ------------------------------------------------------------------------------
# II. File System & Path Configuration
# ------------------------------------------------------------------------------
CATALOGS_DIRECTORY = 'catalogs'
UPLOADS_DIRECTORY = 'files/uploads'
PEAK_FINDER_OUTPUT_DIR=    'files/uploads'
CATALOG_MAPPINGS_FILE= 'catalog_mappings.json'
FILES_DIRECTORY= 'files'
BASE_FITS_PATH = f"{FILES_DIRECTORY}/"
PSF_DIRECTORY = 'psf'
BASE_PSF_PATH = f"{PSF_DIRECTORY}/"
IMAGE_DIR = 'images'
#
# Admin mode: When True, the current process treats the caller as admin.
# You can also set environment variable NELOURA_ADMIN=true to enable.
ADMIN_MODE = os.getenv('NELOURA_ADMIN', 'True').strip().lower() in ('1','true','yes','on')

# ----------------------------------------------------------------------------
# Uploads Maintenance Settings (Admin)
# ----------------------------------------------------------------------------
# Enable automatic cleaning of the uploads directory
UPLOADS_AUTO_CLEAN_ENABLE = False
# Interval in minutes between automatic clean operations
UPLOADS_AUTO_CLEAN_INTERVAL_MINUTES = 60


# ------------------------------------------------------------------------------
# III. FITS Image & Tile Processing
# ------------------------------------------------------------------------------
DEFAULT_HDU_INDEX = 0
IMAGE_TILE_SIZE_PX = 256
DYNAMIC_RANGE_PERCENTILES = {'q_min': 0.5, 'q_max': 99.5}

# ------------------------------------------------------------------------------
# IV. Algorithm & Processing Defaults
# ------------------------------------------------------------------------------
PEAK_FINDER_DEFAULTS = {
    'pix_across_beam': 5.0, 'min_beams': 1.0, 'beams_to_search': 1.0,
    'delta_rms': 3.0, 'minval_rms': 2.0, 'edge_clip': 1
}
SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC = 1.0
MAX_POINTS_FOR_FULL_HISTOGRAM = 1000
FITS_HISTOGRAM_DEFAULT_BINS = 100
CATALOG_ANALYSIS_HISTOGRAM_BINS = 20

RA_COLUMN_NAMES = ['PHANGS_RA','XCTR_DEG','cen_ra','ra', 'RA', 'Ra', 'right_ascension', 'RIGHT_ASCENSION', 'raj2000', 'RAJ2000']
DEC_COLUMN_NAMES = ['PHANGS_DEC','YCTR_DEG','cen_dec','dec', 'DEC', 'Dec', 'declination', 'DECLINATION', 'decj2000','dej2000', 'DECJ2000', 'dej2000', 'DEJ2000']
RGB_GALAXY_COLUMN_NAMES = ['gal_name','PHANGS_GALAXY','galaxy', 'galaxy_name', 'object_name', 'obj_name', 'target']
RGB_INVALID_GALAXY_NAMES = ['nan', 'none', '', 'unknown']


ra_columns= RA_COLUMN_NAMES
dec_columns= DEC_COLUMN_NAMES
RGB_RA_COLUMN_NAMES= RA_COLUMN_NAMES
RGB_DEC_COLUMN_NAMES= DEC_COLUMN_NAMES

SED_RA_COLUMN_NAMES = RA_COLUMN_NAMES
SED_DEC_COLUMN_NAMES =DEC_COLUMN_NAMES


STATIC_DIRECTORY = 'static'
KERNELS_DIRECTORY = 'kernels'


# ------------------------------------------------------------------------------
# VI. Plotting & Visualization (RGB and SED)
# ------------------------------------------------------------------------------
# --- General Settings ---

# --- RGB Cutout Settings (`generate_rgb_cutouts`) ---
# in the function, not a single dictionary. These are the relevant values.
CUTOUT_SIZE_ARCSEC= 7.5
RGB_PANEL_TYPE_DEFAULT = "default"


# ------------------------------------------------------------------------------
# WCS (World Coordinate System) Settings
# ------------------------------------------------------------------------------
# Master toggle for WCS features across the app
WCS_ENABLE = True
# Automatically convert catalog RA/Dec to pixels using current image WCS
WCS_CATALOG_AUTO_CONVERT = True
# Apply X-axis reflection when PC1_1 < 0 in frontend transforms
WCS_REFLECTION_FIX = True
# Prefer CD matrix over PC when both are present
WCS_PREFER_CD = True
WCS_LABEL_MODE = "sexagesimal"  # or "degrees"
WCS_AXIS_COLOR = '#732a54'
WCS_TICK_COLOR = '#5b304b'
WCS_LABEL_TEXT_COLOR = 'rgba(255, 255, 255,0.6)'
WCS_LABEL_BG_COLOR = 'rgba(115, 42, 84,.6)'
WCS_LABEL_BG_ALPHA = 0.15

# Coordinate matching
RGB_COORDINATE_TOLERANCE_FACTOR = 3.0  # Cutout size divided by this factor for coordinate matching


# ------------------------------------------------------------------------------
# VI. RGB
# ------------------------------------------------------------------------------

# Figure layout
RGB_FIGURE_WIDTH = 9.2
RGB_FIGURE_HEIGHT = 2.3
RGB_SUBPLOT_ROWS = 1 # min alwasy 1
RGB_SUBPLOT_COLS = 4 # max always 4
RGB_TIGHT_LAYOUT_PAD = 0
RGB_TIGHT_LAYOUT_W_PAD = 0
RGB_TIGHT_LAYOUT_H_PAD = 0

# Panel styling
RGB_PANEL_BACKGROUND_COLOR = '#1e1e1e'
RGB_PANEL_SPINE_COLOR = '#383838'
RGB_TITLE_FONT_SIZE = 11
RGB_TITLE_COLOR = 'white'
RGB_TITLE_FONT_WEIGHT = 'bold'
RGB_TITLE_X_POSITION = 0.97
RGB_TITLE_Y_POSITION = 0.97
RGB_TITLE_BBOX_FACECOLOR = 'black'
RGB_TITLE_BBOX_ALPHA = 0.6

# RA/Dec marker styling
RGB_MARKER_SYMBOL = 'o'
RGB_MARKER_SIZE = 0.67  # arcsec
RGB_MARKER_EDGE_WIDTH = 1.5
RGB_MARKER_ALPHA = 0.8
RGB_MARKER_FACE_COLOR = 'none'  # 'none' for hollow markers, or any matplotlib color
RGB_MARKER_EDGE_COLOR = '#ff0000'  # edge/border color for marker outline (red)

# H-alpha display settings
RGB_HA_COLORMAP = 'gray'
RGB_HA_STRETCH = 'linear'
RGB_HA_PERCENTILE = 99.0


# Filter configurations (ids, display_name)
RGB_FILTERS = {
    "HST": {
        "RED": (["f814w", "814"], "F814W"),
        "GREEN": (["f555w", "555"], "F555W"), 
        "BLUE": (["f438w", "f435w", "438", "435"], "F438W/F435W"),
        "exclude_patterns": ["ha-img", "ha_img"]  # Exclude H-alpha composite files
    },
    "NIRCAM": {
        "RED": (["f360m", "360", "nircam_f360m"], "F360M"),
        "GREEN": (["f335m", "335", "nircam_f335m"], "F335M"),
        "BLUE": (["f300m", "300", "nircam_f300m"], "F300M"),
        "exclude_patterns": ["ha-img", "ha_img"]  # Exclude H-alpha composite files
    },
    "MIRI": {
        "RED": (["f2100w", "2100", "miri_f2100w"], "F2100W"),
        "GREEN": (["f1000w", "1000", "miri_f1000w"], "F1000W"),
        "BLUE": (["f770w", "770", "miri_f770w"], "F770W"),
        "exclude_patterns": ["ha-img", "ha_img"]  # Exclude H-alpha composite files
    },
    "HA": (['ha',"halpha", "f657n", "f658n", "f656n"], "H-alpha")  # Removed "ha" from the list
}

TILE_CACHE_MAX_SIZE = 100
SED_HST_FILTERS = ['F275W', 'F336W', 'F438W', 'F555W', 'F814W']
SED_JWST_NIRCAM_FILTERS = ['F200W', 'F300M', 'F335M', 'F360M']
SED_JWST_MIRI_FILTERS = ['F770W', 'F1000W', 'F1130W', 'F2100W']


# Panel titles and labels
RGB_HST_SHORT_TITLE = "HST"
RGB_NIRCAM_SHORT_TITLE = "NIRCam"
RGB_MIRI_SHORT_TITLE = "MIRI"
RGB_HA_SHORT_TITLE = "H-alpha"
RGB_PANEL_FULL_TITLE_TEMPLATE = "{short} ({galaxy})"
RGB_HA_PANEL_FULL_TITLE_TEMPLATE = "HST {short} ({galaxy})"

# Default scaling parameters
RGB_DEFAULT_Q_MIN = 0.5
RGB_DEFAULT_Q_MAX = 99.4

# File output settings
RGB_OUTPUT_DPI = 300
RGB_DEFAULT_GALAXY_NAME = "UnknownGalaxy"
RGB_FILENAME_PREFIX = "RGB_Cutouts"
RGB_ALLOWED_FILENAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ '
RGB_FILENAME_REPLACEMENT_CHAR = '_'
RGB_IMSHOW_ASPECT = 'equal'
RGB_FILENAME_TEMPLATE = "{prefix}_{galaxy}_RA{ra:.4f}_DEC{dec:.4f}_{timestamp}.png"

# RGB file search and cutout configuration
RGB_FILE_SEARCH_PATTERNS = [
    "{base_dir}/*{needle}*.fits",
    "{base_dir}/**/*{needle}*.fits",
]
RGB_TOKEN_EXTEND_TEMPLATES = [
    "{base_dir}/*{token}*{needle}*.fits",
    "{base_dir}/**/*{token}*{needle}*.fits",
]
RGB_WCS_PREP_FILTERS = SED_JWST_NIRCAM_FILTERS + SED_JWST_MIRI_FILTERS
RGB_CUTOUT_MODE = 'partial'
RGB_CUTOUT_FILL_VALUE = np.nan
RGB_SKIP_NON_CELESTIAL_WCS = True
RGB_USE_FIRST_MATCH = True

# Panel indices # ordering!!!
RGB_HST_PANEL_INDEX = 0
RGB_NIRCAM_PANEL_INDEX = 1
RGB_MIRI_PANEL_INDEX = 2
RGB_HA_PANEL_INDEX = 3


# Default scaling percentiles
RGB_DISPLAY_DEFAULT_Q_MIN = 12.0
RGB_DISPLAY_DEFAULT_Q_MAX = 99.8

# HST-specific scaling percentiles
RGB_DISPLAY_HST_MIN_PERCENTILE = 5
RGB_DISPLAY_HST_FIRST_SOURCE_MAX_PERCENTILE = 99.4

# NIRCam-specific scaling percentiles  
RGB_DISPLAY_NIRCAM_MIN_PERCENTILE = 5
RGB_DISPLAY_NIRCAM_MAX_PERCENTILE = 99.7

# MIRI-specific scaling percentiles
RGB_DISPLAY_MIRI_MIN_PERCENTILE = 5
RGB_DISPLAY_MIRI_MAX_PERCENTILE = 99.3



SED_RGB_MIRI_COMPOSITE_MAX_PERCENTILE = 99.3            # Max value for MIRI RGB composite creation
SED_RGB_MIRI_COMPOSITE_MIN_PERCENTILE= 5

SED_RGB_NIRCAM_COMPOSITE_MAX_PERCENTILE = 99.7          # Max value for NIRCam RGB composite creation
SED_RGB_NIRCAM_COMPOSITE_MIN_PERCENTILE = 5         # Max value for NIRCam RGB composite creation

SED_RGB_HST_COMPOSITE_MAX_PERCENTILE = 99.4         # Max value for HST RGB composite scaling
SED_RGB_HST_COMPOSITE_MIN_PERCENTILE = 5             # Min value for HST RGB composite scaling


# Image processing constants
RGB_DISPLAY_OUTPUT_SCALE_FACTOR = 255
RGB_DISPLAY_NAN_REPLACEMENT_VALUE = 0

# Panel type identifiers
RGB_PANEL_TYPE_HST = "hst"
RGB_PANEL_TYPE_NIRCAM = "nircam"
RGB_PANEL_TYPE_MIRI = "miri"
RGB_PANEL_TYPE_DEFAULT = "default"

# Channel indices for RGB mapping
RGB_CHANNEL_RED = 0
RGB_CHANNEL_GREEN = 1
RGB_CHANNEL_BLUE = 2

# RGB array dimensions
RGB_IMAGE_CHANNELS = 3



# ------------------------------------------------------------------------------
# VI. SED
# ------------------------------------------------------------------------------


# ------------------------------------------------------------------------------
# V. Caching Configuration
# ------------------------------------------------------------------------------

# --- SED Plot Settings (`generate_sed_optimized`) ---
# Figure and Main Plot

# Main Plot Axes, Grid, and Text
SED_X_LABEL = "Wavelength (μm)"
SED_Y_LABEL = "Flux (uJy)"

# General plot and label configuration
SED_LEGEND_LOC = 'lower right'
SED_LEGEND_BBOX_ANCHOR = (0.67, 0.0)
SED_XTICK_ROTATION_DEGREES = 45
SED_INSET_RIGHT_MARGIN = 0.05
SED_CUTOUT_BASE_Y = 0.945
SED_XSCALE = 'log'
SED_YSCALE = 'log'
SED_XTICK_LABEL_DECIMALS = 2
SED_XTICK_LABEL_FORMAT = "{w:.2f}"
SED_INFO_BOX_FACE_ALPHA = 0.7
SED_INFO_BOX_FACE_COLOR = 'white'
SED_SAVEFIG_BBOX_INCHES = 'tight'

# Series labels and colors
SED_OBS_LABEL = 'Observed'
SED_BKG_SUB_LABEL = 'BKG-Subtracted'
SED_OBS_COLOR = 'purple'
SED_BKG_SUB_COLOR = 'blue'
SED_ERRORBAR_ECOLOR = 'gray'
SED_MARKER_FMT = 'o'

# Default names and labels
SED_DEFAULT_GALAXY_NAME = "UnknownGalaxy"
SED_RGB_LABEL_NIRCAM = 'NIRCam'
SED_RGB_LABEL_MIRI = 'MIRI'
SED_RGB_LABEL_HST = 'HST'
SED_RGB_LABEL_COLOR = 'white'
SED_INFO_BOX_BOXSTYLE = 'round'
SED_FILENAME_TEMPLATE = "SED_RA{ra:.4f}_DEC{dec:.4f}.png"
SED_HA_TITLE = r'HST H$\alpha$'


# SED Generation Parameters
SED_COORDINATE_TOLERANCE = 0.0003

# Catalog column templates for flux, background, and error
SED_FLUX_COLUMN_TEMPLATE = "{filter}"
SED_BKG_COLUMN_TEMPLATE = "{filter}_bkg"
SED_ERR_COLUMN_TEMPLATE = "{filter}_err"

# CIGALE column patterns by instrument group
SED_CIGALE_COLUMN_PATTERNS = {
    'HST': [
        "best.hst.wfc3.{filter}",
        "best.hst.wfc.{filter}",
        "best.hst_{filter}",
    ],
    'NIRCAM': [
        "best.jwst.nircam.{filter}",
    ],
    'MIRI': [
        "best.jwst.miri.{filter}",
    ],
}

# Filter wavelengths and names
SED_FILTER_WAVELENGTHS = [0.275, 0.336, 0.438, 0.555, 0.814, 2.0, 3.0, 3.35, 3.6, 7.7, 10.0, 11.3, 21]
SED_FILTER_NAMES = ['F275W', 'F336W', 'F438W', 'F555W', 'F814W', 'F200W', 'F300M', 'F335M', 'F360M', 'F770W', 'F1000W', 'F1130W', 'F2100W']
SED_FILTER_WAVELENGTHS_EXTENDED = [0.275, 0.336, 0.438, 0.555, 0.814, 2.0, 3.0, 3.35, 3.6, 7.7, 10.0, 11.3, 11.4, 11.5, 21, 21.5]

# Filter categories


# CIGALE multiplier # from mJy to uJy
SED_CIGALE_MULTIPLIER = 1000

# Catalog column names
SED_COL_GALAXY = 'galaxy'

# Plot configuration
SED_FIGURE_SIZE_WIDTH = 9
SED_FIGURE_SIZE_HEIGHT = 3.5
SED_DPI = 300
SED_MARKERSIZE = 9
SED_CAPSIZE = 4
SED_ALPHA = 0.4
SED_X_LIM_MIN = 0.25
SED_X_LIM_MAX = 23
SED_FONTSIZE_LABELS = 12
SED_FONTSIZE_TICKS = 10
SED_FONTSIZE_TITLE = 8
SED_FONTSIZE_INFO = 12

CIRCLE_COLOR = 'red'
CIRCLE_LINEWIDTH = 0.5
SED_CUTOUT_CMAP = 'gray'

# Cutout configuration
SED_CUTOUT_SIZE_ARCSEC = 2.5
SED_CIRCLE_RADIUS_ARCSEC = 0.67
SED_INSET_WIDTH = '80%'
SED_INSET_HEIGHT = '80%'
SED_INSET_BBOX_SIZE = 0.19
SED_RGB_WIDTH = '40%'
SED_RGB_HEIGHT = '40%'
SED_RGB_BBOX_SIZE = 0.62

# X-axis offsets for cutout positioning
SED_X_OFFSETS = [0.002, 0.02, 0.023, 0.032, 0.009, -0.07, -0.083, -0.045, 0.001, -0.10, -0.0955, -0.06, 0.007, -0.7, -1, -0.885]

# RGB composite positioning
SED_RGB_NIRCAM_X = -0.17
SED_RGB_NIRCAM_Y = 0.52
SED_RGB_MIRI_X = -0.073
SED_RGB_MIRI_Y = 0.52
SED_RGB_HST_X = -0.17
SED_RGB_HST_Y = 0.28

# RGB filter assignments
SED_NIRCAM_RED_FILTER = 'F360M'
SED_NIRCAM_GREEN_FILTER = 'F335M'
SED_NIRCAM_BLUE_FILTER = 'F300M'

SED_MIRI_RED_FILTER = 'F2100W'
SED_MIRI_GREEN_FILTER = 'F1000W'
SED_MIRI_BLUE_FILTER = 'F770W'

SED_HST_RED_FILTERS =  ['F814W']
SED_HST_BLUE_FILTER = ['F438W', 'F435W']
SED_HST_GREEN_FILTER = ['F555W']

# Ha file patterns
SED_HA_PATTERNS = [
    f"{FILES_DIRECTORY}/*ha-img.fits",
    f"{FILES_DIRECTORY}/hlsp_*ha-img.fits", 
    f"{FILES_DIRECTORY}/*_ha-*.fits",
    f"{FILES_DIRECTORY}/*-ha-*.fits",
    f"{FILES_DIRECTORY}/*halpha*.fits"
]

# Token-extend templates for H-alpha patterns
SED_HA_TOKEN_EXTEND_TEMPLATES = [
    "{base_dir}/*{token}*ha-img.fits",
    "{base_dir}/**/*{token}*ha-img.fits",
    "{base_dir}/*{token}*_ha-*.fits",
    "{base_dir}/**/*{token}*_ha-*.fits",
    "{base_dir}/*{token}*-ha-*.fits",
    "{base_dir}/**/*{token}*-ha-*.fits",
    "{base_dir}/*{token}*halpha*.fits",
    "{base_dir}/**/*{token}*halpha*.fits",
]

# Ha wavelength and positioning
SED_HA_WAVELENGTH = 21.5
SED_HA_X_OFFSET = -0.7
SED_HA_Y_POSITION = 0.72
# Processing configuration
SED_MAX_WORKERS_FILES = 8

# Percentile values and gamma for image normalization (used by cutout insets)
# - SED_SQRT_NORM_GAMMA controls the gamma used in PowerNorm for sqrt-like stretch
# - Per-instrument percentiles set the vmax for normalization
SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE = 99.7  # Max value for NIRCam/MIRI individual cutout display
SED_HST_CUTOUT_DISPLAY_MAX_PERCENTILE = 99.97         # Max value for HST individual cutout display
SED_SQRT_NORM_GAMMA = 0.5                             # Gamma for sqrt_norm (PowerNorm)

# Normalization strategy for SED cutout insets
# Options:
# - 'power': uses PowerNorm with SED_SQRT_NORM_GAMMA
# - 'linear': no special norm, just vmin/vmax
# - 'log': uses LogNorm with vmin>0
SED_NORM_MODE = 'linear'
SED_NORM_MODE_BY_GROUP = {
    # Override per group; falls back to SED_NORM_MODE if not present
    'HST': 'power',
    'NIRCAM': 'linear',
    'MIRI': 'linear',
    'HA': 'power',
}
# Uppercased filter name to mode mapping, e.g., { 'F555W': 'linear' }
SED_NORM_MODE_BY_FILTER = {}
SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE = 99.9           # Max value for H-alpha cutout display with sqrt norm
SED_CO_CONTOUR_LOW_LEVEL_PERCENTILE = 70              # Low level percentile for CO contours
SED_CO_CONTOUR_MID_LEVEL_PERCENTILE = 80              # Mid level percentile for CO contours
SED_CO_CONTOUR_HIGH_LEVEL_PERCENTILE = 98             # High level percentile for CO contours
SED_HA_CONTOUR_HIGH_LEVEL_PERCENTILE = 99             # High level percentile for H-alpha contours
# File selection and exclusion patterns
SED_EXCLUDED_HA_TOKENS_FOR_CONTINUUM = ['_ha-img', '_ha_', '-ha-', '-ha.fits']
# File search patterns and aliases per filter
SED_FILE_SEARCH_PATTERNS = [
    "{base_dir}/*{needle}*.fits",
    "{base_dir}/**/*{needle}*.fits",
]
SED_FILTER_ALIASES = {
    # Use lowercase needles here; base filter name will be added automatically
    'F438W': ['f435w'],
}

# Contour settings
SED_CONTOUR_LINEWIDTH = 0.3
SED_CONTOUR_ALPHA = 0.5
SED_GAUSSIAN_FILTER_SIGMA = 4

# Async cutout processing (process_cutouts_async / process_single_cutout)
SED_ASYNC_CONCURRENCY = 3
SED_ASYNC_XNORM_BASE = 0.1
SED_ASYNC_XNORM_STEP = 0.07

# Info box settings
SED_INFO_BOX_X = 0.98
SED_INFO_BOX_Y = 0.05
SED_RGB_TEXT_X = 0.63
SED_RGB_TEXT_Y = 0.83
SED_RGB_TEXT_X_ALT = 0.4
# ------------------------------------------------------------------------------
# VII. I/O Mitigations (Server Performance)
# ------------------------------------------------------------------------------
# When storage has poor random-read performance (see fio results), reduce disk
# pressure by promoting image slices to RAM or by warming the OS page cache.
ENABLE_IN_MEMORY_FITS = False
IN_MEMORY_FITS_MAX_MB = 2048  # cap per promoted 2D slice
IN_MEMORY_FITS_RAM_FRACTION = 0.5  # must be <= 50% of available RAM
ENABLE_PAGECACHE_WARMUP = False
PAGECACHE_WARMUP_CHUNK_ROWS = 4096
IN_MEMORY_FITS_MODE = 'never'  # 'auto' | 'always' | 'never'
RANDOM_READ_BENCH_SAMPLES = 128
RANDOM_READ_CHUNK_BYTES = 4096
RANDOM_READ_THRESHOLD_MBPS = 1.0

# ------------------------------------------------------------------------------
# Shared I/O optimization helpers (app-wide)
# ------------------------------------------------------------------------------
def _random_read_bench_global(arr: np.ndarray, samples: int = RANDOM_READ_BENCH_SAMPLES) -> float:
    try:
        h, w = int(arr.shape[0]), int(arr.shape[1])
        rng = np.random.default_rng(12345)
        t0 = time.perf_counter()
        total_bytes = 0
        for _ in range(samples):
            y = rng.integers(0, max(1, h))
            x = rng.integers(0, max(1, w))
            y0 = max(0, int(y) - 8)
            y1 = min(h, y0 + 16)
            x0 = max(0, int(x) - 32)
            x1 = min(w, x0 + 64)
            _ = float(np.sum(arr[y0:y1, x0:x1]))
            total_bytes += (y1 - y0) * (x1 - x0) * arr.dtype.itemsize
        elapsed = max(time.perf_counter() - t0, 1e-6)
        return float((total_bytes / (1024*1024)) / elapsed)
    except Exception:
        return 0.0
def _should_promote_global(arr: np.ndarray, required_bytes: int) -> bool:
    if not ENABLE_IN_MEMORY_FITS:
        return False
    vmem = psutil.virtual_memory()
    allow_bytes = int(IN_MEMORY_FITS_RAM_FRACTION * getattr(vmem, 'available', 0))
    max_bytes = IN_MEMORY_FITS_MAX_MB * 1024 * 1024
    cap_bytes = min(allow_bytes if allow_bytes > 0 else 0, max_bytes)
    if cap_bytes <= 0 or required_bytes <= 0 or required_bytes > cap_bytes:
        return False
    if IN_MEMORY_FITS_MODE == 'always':
        return True
    if IN_MEMORY_FITS_MODE == 'never':
        return False
    bench_mbps = _random_read_bench_global(arr)
    logger.info(f"[FITS I/O] random-read probe (global): {bench_mbps:.2f} MiB/s (threshold {RANDOM_READ_THRESHOLD_MBPS} MiB/s)")
    return bench_mbps < RANDOM_READ_THRESHOLD_MBPS
def optimize_array_io(arr: np.ndarray, height: int, width: int, filename: str, hdu_index: int):
    """Apply app-wide I/O optimization policy to a 2D array. Returns (array, strategy)."""
    try:
        logger.info(
            f"[FITS I/O] (global) mode={IN_MEMORY_FITS_MODE}, promote_enabled={ENABLE_IN_MEMORY_FITS}, "
            f"pagecache_warmup={ENABLE_PAGECACHE_WARMUP}, max_mb={IN_MEMORY_FITS_MAX_MB}, "
            f"ram_fraction={IN_MEMORY_FITS_RAM_FRACTION}, threshold_mbps={RANDOM_READ_THRESHOLD_MBPS}"
        )
        if isinstance(arr, np.memmap):
            required_bytes = int(height) * int(width) * arr.dtype.itemsize
            if _should_promote_global(arr, required_bytes):
                out = np.array(arr, copy=True)
                logger.info(f"[FITS I/O] (global) Promoted FITS slice to RAM (~{required_bytes/1e6:.1f} MB). file={filename} hdu={hdu_index}")
                return out, 'in_memory'
            if ENABLE_PAGECACHE_WARMUP:
                rows = int(height)
                step = max(1, int(PAGECACHE_WARMUP_CHUNK_ROWS))
                acc = 0.0
                for y in range(0, rows, step):
                    acc += float(np.sum(arr[y:y+step, :]))
                if not np.isfinite(acc):
                    pass
                logger.info(f"[FITS I/O] (global) Warmed OS page cache (sequential scan). file={filename} hdu={hdu_index}")
                return arr, 'memmap_warmcache'
            logger.info(f"[FITS I/O] (global) Using memmap directly. file={filename} hdu={hdu_index}")
            return arr, 'memmap'
        else:
            logger.info(f"[FITS I/O] (global) Data already in RAM (ndarray). file={filename} hdu={hdu_index}")
            return arr, 'already_in_memory'
    except Exception as e:
        logger.warning(f"[FITS I/O] (global) Optimization skipped: {e}")
        return arr, 'unknown'


# Tunable shape parameters
LOG_STRETCH_K = 9.0      # log curve strength (higher -> stronger compression near 0)
ASINH_BETA    = 5.0      # asinh curve strength
POWER_GAMMA   = 2.0      # power exponent (gamma)

def _norm_unit(val: float, min_v: float, max_v: float) -> float:
    # Linear normalize to [0,1] using UI min/max, robust to degenerate ranges
    if not (math.isfinite(val) and math.isfinite(min_v) and math.isfinite(max_v)) or min_v == max_v:
        return 0.5
    t = (val - min_v) / (max_v - min_v)
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    return t

SCALING_FUNCTIONS_PY = {
    # Linear stays as normalized [0,1]
    'linear': lambda val, min_v, max_v: _norm_unit(val, min_v, max_v),

    # Log stretch on normalized t: y = log(1 + k t) / log(1 + k), no dependence on absolute units
    'logarithmic': lambda val, min_v, max_v: (
        math.log1p(LOG_STRETCH_K * _norm_unit(val, min_v, max_v)) / math.log1p(LOG_STRETCH_K)
    ),

    # Square-root stretch on normalized t
    'sqrt': lambda val, min_v, max_v: math.sqrt(_norm_unit(val, min_v, max_v)),

    # Power-law stretch on normalized t
    'power': lambda val, min_v, max_v: _norm_unit(val, min_v, max_v) ** POWER_GAMMA,

    # Asinh stretch on normalized t: y = asinh(beta t) / asinh(beta)
    'asinh': lambda val, min_v, max_v: (
        math.asinh(ASINH_BETA * _norm_unit(val, min_v, max_v)) / math.asinh(ASINH_BETA)
        if ASINH_BETA > 0 else _norm_unit(val, min_v, max_v)
    ),
}



# ==============================================================================
# --- END OF CONFIGURATION ---
# ==============================================================================
# Python implementations of Colormaps and Scaling functions
# Adapted from static/image-processing.js


COLOR_MAPS_PY = {
    'grayscale': lambda val: (val, val, val),

# Monochrome ramps
'blue':   lambda val: (0, 0, int(val)),
'red':    lambda val: (int(val), 0, 0),
'green':  lambda val: (0, int(val), 0),
'orange':  lambda val: (int(val), int(val * (165/255)), 0),   # 0 -> (0,0,0), 255 -> (255,165,0)
'yellow':  lambda val: (int(val), int(val), 0),               # 0 -> (0,0,0), 255 -> (255,255,0)
'cyan':    lambda val: (0, int(val), int(val)),               # 0 -> (0,0,0), 255 -> (0,255,255)
'magenta': lambda val: (int(val), 0, int(val)),      

    'viridis': lambda val: (
        # Red channel
        round(68 + (val / 255) * 4 * (33 - 68)) if val / 255 < 0.25 else
        round(33 + (val / 255 - 0.25) * 4 * (94 - 33)) if val / 255 < 0.5 else
        round(94 + (val / 255 - 0.5) * 4 * (190 - 94)) if val / 255 < 0.75 else
        round(190 + (val / 255 - 0.75) * 4 * (253 - 190)),

        # Green channel
        round(1 + (val / 255) * 4 * (144 - 1)) if val / 255 < 0.25 else
        round(144 + (val / 255 - 0.25) * 4 * (201 - 144)) if val / 255 < 0.5 else
        round(201 + (val / 255 - 0.5) * 4 * (222 - 201)) if val / 255 < 0.75 else
        round(222 + (val / 255 - 0.75) * 4 * (231 - 222)),

        # Blue channel
        round(84 + (val / 255) * 4 * (140 - 84)) if val / 255 < 0.25 else
        round(140 + (val / 255 - 0.25) * 4 * (120 - 140)) if val / 255 < 0.5 else
        round(120 + (val / 255 - 0.5) * 4 * (47 - 120)) if val / 255 < 0.75 else
        round(47 + (val / 255 - 0.75) * 4 * (37 - 47))
    ),

    'plasma': lambda val: (
        round(13 + (val / 255) * 4 * (126 - 13)) if val / 255 < 0.25 else
        round(126 + (val / 255 - 0.25) * 4 * (203 - 126)) if val / 255 < 0.5 else
        round(203 + (val / 255 - 0.5) * 4 * (248 - 203)) if val / 255 < 0.75 else
        round(248 + (val / 255 - 0.75) * 4 * (239 - 248)),

        round(8 + (val / 255) * 4 * (8 - 8)) if val / 255 < 0.25 else
        round(8 + (val / 255 - 0.25) * 4 * (65 - 8)) if val / 255 < 0.5 else
        round(65 + (val / 255 - 0.5) * 4 * (150 - 65)) if val / 255 < 0.75 else
        round(150 + (val / 255 - 0.75) * 4 * (204 - 150)),

        round(135 + (val / 255) * 4 * (161 - 135)) if val / 255 < 0.25 else
        round(161 + (val / 255 - 0.25) * 4 * (107 - 161)) if val / 255 < 0.5 else
        round(107 + (val / 255 - 0.5) * 4 * (58 - 107)) if val / 255 < 0.75 else
        round(58 + (val / 255 - 0.75) * 4 * (42 - 58))
    ),

    'inferno': lambda val: (
        round(0 + (val / 255) * 5 * 50) if val / 255 < 0.2 else
        round(50 + (val / 255 - 0.2) * 5 * (120 - 50)) if val / 255 < 0.4 else
        round(120 + (val / 255 - 0.4) * 5 * (187 - 120)) if val / 255 < 0.6 else
        round(187 + (val / 255 - 0.6) * 5 * (236 - 187)) if val / 255 < 0.8 else
        round(236 + (val / 255 - 0.8) * 5 * (251 - 236)),

        round(0 + (val / 255) * 5 * 10) if val / 255 < 0.2 else
        round(10 + (val / 255 - 0.2) * 5 * (28 - 10)) if val / 255 < 0.4 else
        round(28 + (val / 255 - 0.4) * 5 * (55 - 28)) if val / 255 < 0.6 else
        round(55 + (val / 255 - 0.6) * 5 * (104 - 55)) if val / 255 < 0.8 else
        round(104 + (val / 255 - 0.8) * 5 * (180 - 104)),

        round(4 + (val / 255) * 5 * 90) if val / 255 < 0.2 else
        round(94 + (val / 255 - 0.2) * 5 * (109 - 94)) if val / 255 < 0.4 else
        round(109 + (val / 255 - 0.4) * 5 * (84 - 109)) if val / 255 < 0.6 else
        round(84 + (val / 255 - 0.6) * 5 * (36 - 84)) if val / 255 < 0.8 else
        round(26 + (val / 255 - 0.8) * 5 * (26 - 26))
    ),
'spectral': lambda val: (
    (lambda t: (
        (
            # R channel
            round(158 + (t/0.25)       * (244 - 158)) if t < 0.25 else
            round(244 + ((t-0.25)/0.25)*(255 - 244)) if t < 0.50 else
            round(255 + ((t-0.50)/0.25)*(102 - 255)) if t < 0.75 else
            round(102 + ((t-0.75)/0.25)*(50  - 102)),

            # G channel
            round(1   + (t/0.25)       * (109 - 1))   if t < 0.25 else
            round(109 + ((t-0.25)/0.25)*(255 - 109)) if t < 0.50 else
            round(255 + ((t-0.50)/0.25)*(194 - 255)) if t < 0.75 else
            round(194 + ((t-0.75)/0.25)*(136 - 194)),

            # B channel
            round(66  + (t/0.25)       * (67  - 66))  if t < 0.25 else
            round(67  + ((t-0.25)/0.25)*(191 - 67))  if t < 0.50 else
            round(191 + ((t-0.50)/0.25)*(165 - 191)) if t < 0.75 else
            round(165 + ((t-0.75)/0.25)*(189 - 165))
        )
    ))(val/255)
),
'rdbu': lambda val: (
    (lambda t: (
        # Stops: red (178,24,43) -> white (247,247,247) -> blue (33,102,172)
        (
            # R
            round(178 + (t/0.5) * (247 - 178)) if t < 0.5 else round(247 + ((t - 0.5)/0.5) * (33 - 247)),
            # G
            round(24  + (t/0.5) * (247 - 24))  if t < 0.5 else round(247 + ((t - 0.5)/0.5) * (102 - 247)),
            # B
            round(43  + (t/0.5) * (247 - 43))  if t < 0.5 else round(247 + ((t - 0.5)/0.5) * (172 - 247))
        )
    ))(val/255)
),
    'cividis': lambda val: (
        round(0 + (val / 255) * 5 * 33) if val / 255 < 0.2 else
        round(33 + (val / 255 - 0.2) * 5 * (85 - 33)) if val / 255 < 0.4 else
        round(85 + (val / 255 - 0.4) * 5 * (123 - 85)) if val / 255 < 0.6 else
        round(123 + (val / 255 - 0.6) * 5 * (165 - 123)) if val / 255 < 0.8 else
        round(165 + (val / 255 - 0.8) * 5 * (217 - 165)),

        round(32 + (val / 255) * 5 * (61 - 32)) if val / 255 < 0.2 else
        round(61 + (val / 255 - 0.2) * 5 * (91 - 61)) if val / 255 < 0.4 else
        round(91 + (val / 255 - 0.4) * 5 * (122 - 91)) if val / 255 < 0.6 else
        round(122 + (val / 255 - 0.6) * 5 * (156 - 122)) if val / 255 < 0.8 else
        round(156 + (val / 255 - 0.8) * 5 * (213 - 156)),

        round(76 + (val / 255) * 5 * (107 - 76)) if val / 255 < 0.2 else
        round(107 + (val / 255 - 0.2) * 5 * (108 - 107)) if val / 255 < 0.4 else
        round(108 + (val / 255 - 0.4) * 5 * (119 - 108)) if val / 255 < 0.6 else
        round(119 + (val / 255 - 0.6) * 5 * (116 - 119)) if val / 255 < 0.8 else
        round(116 + (val / 255 - 0.8) * 5 * (122 - 116))
    ),

    'hot': lambda val: (
        round((val / 255) * 3 * 255) if val / 255 < 1/3 else 255,
        round((val / 255 - 1/3) * 3 * 255) if 1/3 <= val / 255 < 2/3 else (255 if val / 255 >= 2/3 else 0),
        round((val / 255 - 2/3) * 3 * 255) if val / 255 >= 2/3 else 0
    ),

 'cool': lambda val: (
    (lambda t: (
        round(255 - t/0.33 * 255) if t < 0.33 else
        round((t-0.33)/0.33 * 0) if t < 0.66 else
        round((t-0.66)/0.34 * 0),

        round(t/0.33 * 128) if t < 0.33 else
        round(128 + (t-0.33)/0.33 * (255 - 128)) if t < 0.66 else
        round(255),

        round(255) if t < 0.33 else
        round(255 - (t-0.33)/0.33 * (255 - 255)) if t < 0.66 else
        round(255 - (t-0.66)/0.34 * (255 - 128))
    ))(val/255)
),


  'rainbow': lambda val: (
    (lambda t: (
        round(255) if t < 0.2 else round(255) if t < 0.4 else
        round(255 - (t-0.4)/0.2 * 255) if t < 0.6 else
        round(0) if t < 0.8 else round((t-0.8)/0.2 * (148 - 0)),

        round(t/0.2 * 127) if t < 0.2 else
        round(127 + (t-0.2)/0.2 * (255 - 127)) if t < 0.4 else
        round(255 - (t-0.4)/0.2 * 255) if t < 0.6 else
        round(0) if t < 0.8 else 0,

        round(0) if t < 0.2 else
        round((t-0.2)/0.2 * 0) if t < 0.4 else
        round((t-0.4)/0.2 * 255) if t < 0.6 else
        round(255 - (t-0.6)/0.2 * 255) if t < 0.8 else
        round(255 - (t-0.8)/0.2 * (255 - 211))
    ))(val/255)
),

    'jet': lambda val: (
    (lambda t: (
        round(0 + (t/0.35) * (0 - 0)) if t < 0.35 else
        round(0 + ((t-0.35)/0.15) * (255 - 0)) if t < 0.5 else
        round(255 + ((t-0.5)/0.25) * (255 - 255)) if t < 0.75 else
        round(255 + ((t-0.75)/0.25) * (128 - 255)),
        
        round(0 + (t/0.35) * (255 - 0)) if t < 0.35 else
        round(255 + ((t-0.35)/0.15) * (255 - 255)) if t < 0.5 else
        round(255 + ((t-0.5)/0.25) * (0 - 255)) if t < 0.75 else
        round(0 + ((t-0.75)/0.25) * (0 - 0)),
        
        round(128 + (t/0.35) * (255 - 128)) if t < 0.35 else
        round(255 + ((t-0.35)/0.15) * (0 - 255)) if t < 0.5 else
        round(0 + ((t-0.5)/0.25) * (0 - 0)) if t < 0.75 else
        round(0 + ((t-0.75)/0.25) * (0 - 0))
    ))(val/255)
),

}



# Simple tile cache
class TileCache:
    def __init__(self, max_size=100):
        self.cache = {}
        self.max_size = max_size
        self.access_order = []
    
    def get(self, key):
        if key in self.cache:
            # Move to end (most recently used)
            self.access_order.remove(key)
            self.access_order.append(key)
            return self.cache[key]
        return None
    
    def put(self, key, value):
        if key in self.cache:
            # Update existing
            self.cache[key] = value
            self.access_order.remove(key)
            self.access_order.append(key)
        else:
            # Add new
            if len(self.cache) >= self.max_size:
                # Remove least recently used
                lru_key = self.access_order.pop(0)
                del self.cache[lru_key]
            
            self.cache[key] = value
            self.access_order.append(key)
    
    def clear(self):
        self.cache.clear()
        self.access_order.clear()

# Global tile cache and active generators
tile_cache = TileCache(max_size=TILE_CACHE_MAX_SIZE)
active_tile_generators = {}


# FastAPI app
app = FastAPI()
# Mount settings router (profiles API)
app.include_router(settings_router)

# (Session start endpoint is defined later; using the unified one below)

# (Cookie-based auto-session removed to honor per-tab session requirement)

import time, secrets, threading
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse

SESSION_HEADER_NAME = "X-Session-ID"
SESSION_PARAM_NAME = "sid"

@dataclass
class SessionContext:
    session_id: str
    data: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=lambda: time.time())
    last_seen: float = field(default_factory=lambda: time.time())

class SessionManager:
    def __init__(self, idle_ttl_seconds: int = 3600, absolute_ttl_seconds: int = 86400):
        self.idle_ttl_seconds = idle_ttl_seconds
        self.absolute_ttl_seconds = absolute_ttl_seconds
        self._sessions: Dict[str, SessionContext] = {}
        self._lock = threading.RLock()

    def create_session(self) -> str:
        session_id = secrets.token_urlsafe(32)
        with self._lock:
            self._sessions[session_id] = SessionContext(session_id=session_id)
        return session_id

    def get(self, session_id: Optional[str]) -> Optional[SessionContext]:
        if not session_id:
            return None
        now = time.time()
        with self._lock:
            ctx = self._sessions.get(session_id)
            if not ctx:
                return None
            if (now - ctx.last_seen) > self.idle_ttl_seconds or (now - ctx.created_at) > self.absolute_ttl_seconds:
                self._sessions.pop(session_id, None)
                return None
            return ctx

    def touch(self, session_id: str) -> None:
        with self._lock:
            ctx = self._sessions.get(session_id)
            if ctx:
                ctx.last_seen = time.time()

    def cleanup_expired_sessions(self) -> int:
        now = time.time()
        removed = 0
        with self._lock:
            for sid in list(self._sessions.keys()):
                ctx = self._sessions.get(sid)
                if not ctx:
                    continue
                if (now - ctx.last_seen) > self.idle_ttl_seconds or (now - ctx.created_at) > self.absolute_ttl_seconds:
                    self._sessions.pop(sid, None)
                    removed += 1
        return removed

session_manager = SessionManager()

def start_session_reaper_thread(interval_seconds: int = 60) -> threading.Thread:
    def _reaper() -> None:
        while True:
            try:
                session_manager.cleanup_expired_sessions()
            except Exception:
                pass
            time.sleep(interval_seconds)
    t = threading.Thread(target=_reaper, daemon=True)
    t.start()
    return t

class PerSessionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allow_paths: set[str] | None = None):
        super().__init__(app)
        self.allow_paths = allow_paths or set()

    async def dispatch(self, request, call_next):
        path = request.url.path
        # Always allow CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # Allow exact allow-listed paths
        if path in self.allow_paths:
            # Try to attach a session context if provided; otherwise create a transient one
            sid = request.headers.get(SESSION_HEADER_NAME) or request.query_params.get(SESSION_PARAM_NAME)
            ctx = session_manager.get(sid) if sid else None
            if ctx is None:
                try:
                    sid = session_manager.create_session()
                    ctx = session_manager.get(sid)
                except Exception:
                    ctx = None
            if ctx is not None:
                request.state.session = ctx
                session_manager.touch(ctx.session_id)
            return await call_next(request)

        # Allow static and image assets (needed before JS can attach session headers)
        try:
            static_prefix = f"/{STATIC_DIRECTORY}/"
        except Exception:
            static_prefix = "/static/"
        try:
            images_prefix = f"/{IMAGE_DIR}/"
        except Exception:
            images_prefix = "/images/"

        if path.startswith(static_prefix) or path.startswith(images_prefix):
            return await call_next(request)

        # Allow common docs endpoints
        if path in {"/openapi.json", "/docs", "/redoc"}:
            return await call_next(request)

        sid = request.headers.get(SESSION_HEADER_NAME) or request.query_params.get(SESSION_PARAM_NAME)
        if not sid:
            return JSONResponse(status_code=401, content={"error": "Missing session"})

        ctx = session_manager.get(sid)
        if ctx is None:
            return JSONResponse(status_code=401, content={"error": "Invalid or expired session"})

        request.state.session = ctx
        session_manager.touch(sid)
        return await call_next(request)

# Add this right after app = FastAPI()
app.add_middleware(PerSessionMiddleware, allow_paths={
    "/", 
    "/favicon.ico", 
    "/session/start",
    "/mast/resolve",
    "/mast/search",
    "/mast/products",
    "/proxy-download/",
    "/ned-proxy/",
    "/list-catalogs/",
    "/list-files-for-frontend/",
    "/fits-tile-info/",
    "/fits-histogram/",
    "/settings/effective",
    "/settings/schema",
    "/settings/defaults",
    "/settings/me",
    "/settings/profiles",
})

@app.get("/session/start")
async def start_session():
    # Create a fresh session and immediately resolve effective settings
    sid = session_manager.create_session()
    # Preload effective settings to ensure runtime is updated for this session
    try:
        class _ReqObj:
            def __init__(self, sid):
                from types import SimpleNamespace as _SN
                self.headers = {"X-Session-ID": sid}
                self.query_params = {}
                self.state = _SN(session=session_manager.get(sid))
        from settings_api import _apply_effective_to_runtime as _apply_eff, _load_store as _load_st, _compute_effective_settings_for_session as _comp
        _apply_eff(_ReqObj(sid))
    except Exception:
        pass
    return {"session_id": sid}

app.include_router(coding.router, prefix="/coding", tags=["coding"])
if ADMIN_MODE:
    app.include_router(local_coding_router, prefix="/local-coding", tags=["local-coding"])
else:
    @app.api_route("/local-coding", methods=["GET","POST","PUT","DELETE","PATCH"])
    async def _local_coding_block_root():
        return JSONResponse(status_code=403, content={"error": "Local coding is disabled (admin mode required)"})

    @app.api_route("/local-coding/{rest:path}", methods=["GET","POST","PUT","DELETE","PATCH"])
    async def _local_coding_block_all(rest: str):
        return JSONResponse(status_code=403, content={"error": "Local coding is disabled (admin mode required)"})
# Mount settings API
app.include_router(settings_router)
# Mount static files directory
app.mount("/"+STATIC_DIRECTORY, StaticFiles(directory=STATIC_DIRECTORY), name=STATIC_DIRECTORY)
app.mount("/"+IMAGE_DIR, StaticFiles(directory=IMAGE_DIR), name=IMAGE_DIR)

# Create a catalogs directory if it doesn't exist
catalogs_dir = Path(CATALOGS_DIRECTORY)  # Updated
catalogs_dir.mkdir(exist_ok=True)

# --- Catalog Column Mapping --- 
# Path to store mappings
catalog_mapping_file = Path(CATALOG_MAPPINGS_FILE)  # Updated
# Dictionary to hold mappings in memory
catalog_column_mappings = {}

# Load existing mappings at startup
def load_mappings():
    global catalog_column_mappings
    if catalog_mapping_file.exists():
        try:
            with open(catalog_mapping_file, 'r') as f:
                catalog_column_mappings = json.load(f)
            print(f"Loaded column mappings from {catalog_mapping_file}")
        except Exception as e:
            print(f"Error loading column mappings: {e}. Starting with empty mappings.")
            catalog_column_mappings = {}
    else:
        catalog_column_mappings = {}

# Save mappings to file
def save_mappings():
    try:
        with open(catalog_mapping_file, 'w') as f:
            json.dump(catalog_column_mappings, f, indent=4)
    except Exception as e:
        print(f"Error saving column mappings: {e}")

# Load mappings when the app starts
load_mappings()
# --- End Catalog Column Mapping ---

# Global variable to store loaded catalog data
loaded_catalogs = {}
# Admin-only endpoint to erase uploads directory contents
@app.post("/admin/erase-uploads")
async def admin_erase_uploads(request: Request):
    main = sys.modules.get("main")
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    if not is_admin:
        return JSONResponse(status_code=403, content={"error": "Admin mode required"})
    try:
        uploads_dir = Path(UPLOADS_DIRECTORY)
        if uploads_dir.exists() and uploads_dir.is_dir():
            for p in uploads_dir.iterdir():
                try:
                    if p.is_file() or p.is_symlink():
                        p.unlink()
                    elif p.is_dir():
                        shutil.rmtree(p)
                except Exception:
                    continue
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/log")
async def get_app_log(request: Request, lines: int = 1000):
    try:
        log_path = Path("neloura.log")
        if not log_path.exists() or not log_path.is_file():
            return PlainTextResponse("No log file found.")
        try:
            # Read last N lines (simple approach)
            with log_path.open("r", encoding="utf-8", errors="ignore") as f:
                data = f.read()
            all_lines = data.splitlines()
            tail = all_lines[-max(1, int(lines)):] if all_lines else []
            content = "\n".join(tail)
            return PlainTextResponse(content)
        except Exception as e:
            return PlainTextResponse(f"Failed to read log: {e}", status_code=500)
    except Exception as e:
        return PlainTextResponse(f"Unexpected error: {e}", status_code=500)


# Cache for catalog data to avoid re-reading files
catalog_cache = {}

# Serve static HTML page for OpenSeadragon
@app.get("/")
async def home():
    return FileResponse(f"{STATIC_DIRECTORY}/index.html")

@app.get("/favicon.ico")
async def favicon():
    # Serve existing favicon path; fall back to png if .ico missing
    try:
        return FileResponse(f"{STATIC_DIRECTORY}/logo/favicon.ico")
    except Exception:
        return FileResponse(f"{STATIC_DIRECTORY}/logo/favicon-32x32.png")

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

@app.post("/ast-plot/")
async def ast_plot(request: AstPlotRequest):
    try:
        base_dir = Path(".").resolve()

        # Resolve possible relative paths against CATALOGS_DIRECTORY or project root
        def resolve_path(p: str) -> str:
            for candidate in [base_dir / CATALOGS_DIRECTORY / p, base_dir / p]:
                if Path(candidate).exists():
                    return str(candidate)
            return str(p)

        request.fakeCatalogFile = resolve_path(request.fakeCatalogFile)
        request.detectedCatalogFile = resolve_path(request.detectedCatalogFile)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, compute_ast_plot, request)
        return JSONResponse(content=result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/ast-inject/")
async def ast_inject(request: AstInjectRequest):
    try:
        # Resolve file paths before passing to the executor
        base_dir = Path(".").resolve()
        
        fits_file_path = None
        possible_fits_paths = [base_dir / FILES_DIRECTORY / request.fitsFile, base_dir / request.fitsFile]
        for path in possible_fits_paths:
            if path.exists():
                fits_file_path = str(path)
                break
        
        psf_file_path = None
        possible_psf_paths = [base_dir / PSF_DIRECTORY / request.psfFile, base_dir / request.psfFile]
        for path in possible_psf_paths:
            if path.exists():
                psf_file_path = str(path)
                break

        catalog_file_path = None
        if request.useSeparation and request.catalogFile:
            possible_catalog_paths = [base_dir / CATALOGS_DIRECTORY / request.catalogFile, base_dir / request.catalogFile]
            for path in possible_catalog_paths:
                if path.exists():
                    catalog_file_path = str(path)
                    break

        # Update the request object with the full paths
        request.fitsFile = fits_file_path
        request.psfFile = psf_file_path
        request.catalogFile = catalog_file_path

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, inject_sources, request)
        return JSONResponse(content=result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/get-pixel-scale/{filepath:path}")
async def get_pixel_scale(filepath: str):
    """
    Calculates the pixel scale of a FITS file in arcseconds per pixel.
    """
    if ".." in filepath:
        raise HTTPException(status_code=400, detail="Invalid file path.")

    base_files_dir = Path(FILES_DIRECTORY).resolve()
    base_kernels_dir = Path(KERNELS_DIRECTORY).resolve()
    base_psf_dir = Path(PSF_DIRECTORY).resolve()

    possible_paths = [
        Path(filepath),
        Path(FILES_DIRECTORY) / filepath,
        Path(KERNELS_DIRECTORY) / filepath,
        Path(PSF_DIRECTORY) / filepath
    ]
    
    full_path = None
    for path in possible_paths:
        if path.exists():
            full_path = path.resolve()
            break
            
    if full_path is None:
        raise HTTPException(status_code=404, detail=f"File not found: {filepath}")

    if not (
        str(full_path).startswith(str(base_files_dir)) or
        str(full_path).startswith(str(base_kernels_dir)) or
        str(full_path).startswith(str(base_psf_dir))
    ):
        raise HTTPException(status_code=403, detail="Access to this file path is forbidden.")

    try:
        with fits.open(full_path) as hdul:
            # Find the first HDU with a valid WCS
            header, wcs = None, None
            # Find the first HDU with a valid header and data.
            for hdu in hdul:
                if hdu.header and hdu.data is not None and hdu.data.ndim >= 2:
                    header = hdu.header
                    try:
                        wcs = WCSpy(header)
                    except Exception:
                        wcs = None
                    # Stop at the first valid HDU
                    break
            
            if header is None:
                raise HTTPException(status_code=400, detail="No valid image HDU found in FITS file.")

        pixel_scale = get_pixel_scale_from_header(header, wcs)
        return {"filepath": filepath, "pixel_scale_arcsec": pixel_scale}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
@app.get("/load-catalog/{catalog_name:path}")
async def load_catalog_endpoint(request: Request, catalog_name: str):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    try:
        # Debug incoming query/headers for overrides visibility
        try:
            print(f"[load_catalog] URL: {str(request.url)}")
            print(f"[load_catalog] Query params: {dict(request.query_params)}")
            try:
                hdr = request.headers
                print(f"[load_catalog] Header overrides: X-RA-Col={hdr.get('x-ra-col')} X-DEC-Col={hdr.get('x-dec-col')} X-Size-Col={hdr.get('x-size-col')}")
                hk = list(hdr.keys())
                print(f"[load_catalog] Header keys: {hk[:15]}{' ...' if len(hk)>15 else ''}")
            except Exception:
                pass
            try:
                raw_headers = request.scope.get('headers') or []
                sample = [(k.decode('latin1'), v.decode('latin1')) for k, v in raw_headers[:10]]
                print(f"[load_catalog] Raw headers sample: {sample}")
            except Exception:
                pass
        except Exception:
            pass

        # Resolve catalog path (support files/uploads/... and absolute)
        base_dir = Path('.') .resolve()
        p: Optional[Path] = None
        if Path(catalog_name).is_absolute():
            p = Path(catalog_name)
        else:
            for candidate in [
                base_dir / catalog_name,
                base_dir / UPLOADS_DIRECTORY / catalog_name,
                base_dir / FILES_DIRECTORY / catalog_name,
                base_dir / CATALOGS_DIRECTORY / catalog_name,
            ]:
                try:
                    if candidate.is_file():
                        p = candidate; break
                except Exception:
                    continue
        if p is None or not p.is_file():
            return JSONResponse(status_code=404, content={"error": f"Catalog file not found: {catalog_name}"})
        catalog_path = str(p)

        # Remove global clear; keep per-session state only
        # session_data["loaded_catalogs"] = {}  # Optional: per-session catalog cache map

        try:
            # Ensure RA/DEC overrides are present. If missing, derive from table columns.
            qp = dict(getattr(request, 'query_params', {}) or {})
            ra_q = qp.get('ra_col')
            dec_q = qp.get('dec_col')
            size_q = qp.get('size_col') or qp.get('resolution_col')
            if not ra_q or not dec_q:
                try:
                    tbl = get_astropy_table_from_catalog(catalog_name, Path(CATALOGS_DIRECTORY))
                    if tbl is not None:
                        ra_guess, dec_guess = detect_coordinate_columns(tbl.colnames)
                        if ra_guess and dec_guess:
                            print(f"[load_catalog] Derived overrides: ra_col={ra_guess} dec_col={dec_guess} (no client overrides)")
                            # Build a lightweight request-like wrapper carrying overrides
                            class _ReqShim:
                                def __init__(self, base_req, ra, dec, size):
                                    self.state = getattr(base_req, 'state', None)
                                    self._qp = { 'ra_col': ra, 'dec_col': dec }
                                    if size:
                                        self._qp['size_col'] = size
                                    self.query_params = self._qp
                                    # Merge headers with X-RA/DEC for robustness
                                    base_headers = {}
                                    try:
                                        base_headers = dict(getattr(base_req, 'headers', {}) or {})
                                    except Exception:
                                        base_headers = {}
                                    base_headers = {k.lower(): v for k, v in base_headers.items()}
                                    base_headers['x-ra-col'] = ra
                                    base_headers['x-dec-col'] = dec
                                    if size:
                                        base_headers['x-size-col'] = size
                                    self.headers = base_headers
                                    # ASGI scope headers (bytes)
                                    try:
                                        scope_headers = list(getattr(base_req, 'scope', {}).get('headers') or [])
                                    except Exception:
                                        scope_headers = []
                                    scope_headers.extend([
                                        (b'x-ra-col', str(ra).encode('latin1')),
                                        (b'x-dec-col', str(dec).encode('latin1'))
                                    ])
                                    if size:
                                        scope_headers.append((b'x-size-col', str(size).encode('latin1')))
                                    self.scope = { 'headers': scope_headers }
                            request = _ReqShim(request, ra_guess, dec_guess, size_q)
                except Exception:
                    pass

            # Pass (possibly wrapped) request so load_catalog_data can use session-scoped state and overrides
            catalog_data = load_catalog_data(catalog_path, request)
            if not catalog_data:
                return JSONResponse(status_code=500, content={"error": "Failed to load catalog data"})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Failed to load catalog data: {str(e)}"})

        # Optionally pre-load table to compute boolean columns (keep global mapping cache read-only or per-session)
        try:
            with fits.open(catalog_path) as hdul:
                table_hdu = None
                for i, hdu in enumerate(hdul):
                    if isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                        table_hdu = hdu
                        break

                boolean_columns = []
                if table_hdu is not None:
                    table = Table(table_hdu.data)
                    if len(table) > 0:
                        for col_name in table.colnames:
                            try:
                                val = table[col_name][0]
                                if isinstance(val, (bool, np.bool_)) or (isinstance(val, (str, np.str_)) and val.lower() in ('true', 'false')) or (isinstance(val, (int, np.integer)) and val in (0, 1)):
                                    boolean_columns.append(col_name)
                            except Exception:
                                continue

                    # If needed, attach boolean column hints to each object in catalog_data here (left as-is)

        except Exception:
            pass

        return JSONResponse(content=catalog_data)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to load catalog: {str(e)}"})


@app.post("/upload-catalog/")
async def upload_catalog(file: UploadFile = File(...)):
    """Uploads a FITS catalog file, adding a timestamp to avoid overwrites."""
    try:
        # Save into files/uploads (not catalogs/)
        uploads_dir = Path(UPLOADS_DIRECTORY)
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Generate a unique filename with a timestamp
        original_stem = Path(file.filename).stem
        original_suffix = Path(file.filename).suffix or ".fits"
        # Ensure uploaded catalogs are clearly prefixed, keep original name
        prefixed_stem = original_stem if original_stem.lower().startswith("upload_") else f"upload_{original_stem}"
        unique_filename = f"{prefixed_stem}{original_suffix}"
        # If a file with the same name exists, append an incrementing suffix to avoid overwrite
        counter = 1
        while (uploads_dir / unique_filename).exists():
            unique_filename = f"{prefixed_stem}_{counter}{original_suffix}"
            counter += 1
        upload_path = uploads_dir / unique_filename

        # Basic check to prevent excessively large uploads (optional)
        # max_size = 500 * 1024 * 1024 # 500 MB limit
        # if file.size > max_size:
        #     raise HTTPException(status_code=413, detail=f"File size exceeds limit ({max_size // 1024 // 1024} MB)")

        print(f"Attempting to save uploaded catalog as: {upload_path}")

        # Save the uploaded file
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"Successfully saved catalog: {upload_path}")
        
        # Optional: Clear cache if necessary
        # catalog_cache.pop(unique_filename, None) 
        
        # Return path relative to project root for frontend usage
        rel_path = f"{UPLOADS_DIRECTORY}/{unique_filename}"
        return JSONResponse(content={
            "message": "Catalog uploaded successfully",
            "filename": unique_filename,
            "path": rel_path,
            "filepath": rel_path
        })
    
    except HTTPException as http_exc:
         print(f"HTTP Exception during catalog upload: {http_exc.detail}")
         raise http_exc # Re-raise FastAPI specific exceptions

    except Exception as e:
        print(f"Error during catalog upload: {e}")
        # Clean up partially uploaded file if error occurs
        if 'upload_path' in locals() and upload_path.exists():
            try:
                 upload_path.unlink()
                 print(f"Cleaned up partially uploaded file: {upload_path}")
            except Exception as cleanup_err:
                 print(f"Error cleaning up file {upload_path}: {cleanup_err}")
        
        # Determine appropriate status code
        status_code = 500
        error_detail = f"Failed to upload catalog: {str(e)}"
        # Example: Check for specific errors like disk full (requires OS-specific checks or catching specific exceptions)
        # if isinstance(e, OSError) and e.errno == errno.ENOSPC:
        #    status_code = 507 # Insufficient Storage
        #    error_detail = "Insufficient storage space to save catalog."
            
        return JSONResponse(
            status_code=status_code,
            content={"error": error_detail}
        )
    finally:
        if file and hasattr(file, 'file') and not file.file.closed:
             file.file.close()


@app.get("/catalog-columns/")
async def get_catalog_columns(catalog_name: str):
    """Reads a FITS catalog file and returns the column names from the first BinTableHDU."""
    base_dir = Path(".").resolve()
    catalog_path = None
    try:
        name = catalog_name.strip()
        # Absolute path provided
        if Path(name).is_absolute() and Path(name).is_file():
            catalog_path = Path(name)
        else:
            # If caller passed a files/... path, resolve directly
            if name.startswith(f"{FILES_DIRECTORY}/"):
                p = base_dir / name
                if p.is_file():
                    catalog_path = p
            # Try uploads, files, catalogs, and project root in order
            if catalog_path is None:
                for candidate in [
                    base_dir / UPLOADS_DIRECTORY / name,
                    base_dir / FILES_DIRECTORY / name,
                    base_dir / CATALOGS_DIRECTORY / name,
                    base_dir / name,
                ]:
                    try:
                        if candidate.is_file():
                            catalog_path = candidate
                            break
                    except Exception:
                        continue
    except Exception:
        pass
    if catalog_path is None:
        raise HTTPException(status_code=404, detail=f"Catalog file not found: {catalog_name}")

    try:
        with fits.open(catalog_path) as hdul:
            # Find the first binary table HDU
            bintable_hdu = None
            for hdu in hdul:
                if isinstance(hdu, fits.BinTableHDU):
                    bintable_hdu = hdu
                    break
            
            if bintable_hdu is None:
                raise HTTPException(status_code=400, detail=f"No binary table (catalog data) found in FITS file: {catalog_name}")

            # Extract column names
            column_names = bintable_hdu.columns.names
            return JSONResponse(content={"columns": column_names})

    except FileNotFoundError:
         raise HTTPException(status_code=404, detail=f"Catalog file could not be opened (not found): {catalog_name}")
    except HTTPException as e:
        # Re-raise HTTPExceptions from above
        raise e
    except Exception as e:
        # Catch other potential errors (e.g., corrupted FITS file)
        raise HTTPException(status_code=500, detail=f"Error reading catalog columns for {catalog_name}: {str(e)}")

# NEW ENDPOINT: Save Catalog Column Mapping
@app.post("/save-catalog-mapping/")
async def save_catalog_mapping(request: Request):
    """Saves the user-defined mapping between standard fields (RA, Dec, etc.) and catalog columns."""
    try:
        mapping_data = await request.json()
        catalog_name = mapping_data.get('catalog_name')
        ra_col = mapping_data.get('ra_col')
        dec_col = mapping_data.get('dec_col')
        # Optional: Get other mapped columns like resolution/size if needed
        resolution_col = mapping_data.get('resolution_col') 

        if not catalog_name or not ra_col or not dec_col:
            raise HTTPException(status_code=400, detail="Missing required mapping fields: catalog_name, ra_col, dec_col")

        # Store the mapping
        catalog_column_mappings[catalog_name] = {
            "ra_col": ra_col,
            "dec_col": dec_col
        }
        if resolution_col:
            catalog_column_mappings[catalog_name]["resolution_col"] = resolution_col
        
        # Persist the mappings
        save_mappings()
        print(f"Saved mapping for {catalog_name}: {catalog_column_mappings[catalog_name]}")
        
        return JSONResponse(content={"message": "Catalog mapping saved successfully"})

    except HTTPException as http_exc:
        raise http_exc # Re-raise FastAPI specific exceptions
    except Exception as e:
        print(f"Error saving catalog mapping: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save catalog mapping: {str(e)}")
class SimpleTileGenerator:
    def __init__(self, fits_file_path, hdu_index=0, image_data=None):
        """Initialize simple tile generator with memory-mapped access."""
        self.fits_file_path = fits_file_path
        self.hdu_index = hdu_index
        self.tile_size = IMAGE_TILE_SIZE_PX
        self.overview_image = None
        self.overview_generated = False
        self.dynamic_range_calculated = False
        self.min_value = None
        self.max_value = None
        self.wcs = None
        self.color_map = 'grayscale'  # Default colormap
        self.scaling_function = 'linear'  # Default scaling function
        self._update_colormap_lut() # Initialize LUT
        self._overview_lock = threading.Lock() # Lock for overview generation
        self._dynamic_range_lock = threading.Lock() # DEFER: Lock for dynamic range calculation
        
        # Keep the FITS file open with memory mapping. Disable scaling to avoid costly I/O on Ceph
        self._hdul = fits.open(
            fits_file_path,
            memmap=True,
            lazy_load_hdus=True,
            do_not_scale_image_data=True
        )
        hdu = self._hdul[self.hdu_index] # Use self.hdu_index
        self.header = hdu.header 

        # Header-first sizing to avoid touching data on Ceph
        self.width = int(self.header.get('NAXIS1', 0))
        self.height = int(self.header.get('NAXIS2', 0))

        # Defer data access to first need
        self.image_data = None
        self._image_data_loaded = False
        if image_data is not None:
            self.image_data = image_data
            if getattr(self.image_data, "ndim", 0) > 2:
                if self.image_data.ndim == 3:
                    self.image_data = self.image_data[0, :, :]
                elif self.image_data.ndim == 4:
                    self.image_data = self.image_data[0, 0, :, :]
            self.height, self.width = self.image_data.shape[-2:]
            self._image_data_loaded = True

        # Optional: apply app-wide I/O optimization policy (deferred by default for Ceph)
        self.io_strategy = 'deferred'
        try:
            if os.getenv('FITS_OPTIMIZE_ON_INIT', '0') in ('1', 'true', 'True'):
                self.image_data, self.io_strategy = optimize_array_io(
                    self.image_data, self.height, self.width,
                    os.path.basename(self.fits_file_path), self.hdu_index
                )
        except Exception as e:
            logger.warning(f"[FITS I/O] Optimization skipped during init: {e}")
        
        # NOTE: Percentile calculation is deferred.
        
        # Calculate max zoom level (MUST REMAIN IN __init__)
        self.max_level = max(0, int(np.ceil(np.log2(max(self.width, self.height) / self.tile_size))))
        
        # Get WCS if available (MUST REMAIN IN __init__)
        try:
            prepared_header = _prepare_jwst_header_for_wcs(hdu.header)
            self.wcs = WCS(prepared_header)
        except Exception as e:
            print(f"Error initializing WCS for {self.fits_file_path}:{self.hdu_index}. WCS may be invalid. Error: {e}")
            self.wcs = None
        
        logger.info(f"SimpleTileGenerator initialized: {self.width}x{self.height}, max_level: {self.max_level}. Dynamic range calculation deferred.")

    def _ensure_image_data_loaded(self):
        """Load image data lazily when first needed to avoid heavy I/O on Ceph during fast init."""
        if self._image_data_loaded:
            return
        hdu = self._hdul[self.hdu_index]
        data = hdu.data
        if data is None:
            raise HTTPException(status_code=400, detail=f"No image data found in HDU {self.hdu_index}.")
        if getattr(data, "ndim", 0) > 2:
            if data.ndim == 3:
                data = data[0, :, :]
            elif data.ndim == 4:
                data = data[0, 0, :, :]
        # Apply pending flip if required
        if getattr(self, "_flip_required", False) and not getattr(self, "_flip_applied", False):
            try:
                data = np.flipud(data)
                setattr(self, "_flip_applied", True)
            except Exception:
                pass
        self.image_data = data
        self.height, self.width = self.image_data.shape[-2:]
        # Recompute max_level if width/height were unknown
        self.max_level = max(0, int(np.ceil(np.log2(max(self.width, self.height) / self.tile_size))))
        self._image_data_loaded = True
    
    def _calculate_initial_dynamic_range(self):
        """Calculates and sets the initial dynamic range (min/max values) using percentiles."""
        # Ensure data is loaded lazily (avoid heavy I/O during fast init on Ceph)
        self._ensure_image_data_loaded()
        # MAX_SAMPLE_POINTS = 1_000_000  # Target for number of points to use for percentile <- REMOVE THIS

        # self.image_data is expected to be 2D at this point due to __init__
        current_image_data = self.image_data 

        if not isinstance(current_image_data, np.ndarray) or current_image_data.size == 0:
            print("Warning: Image data is not a non-empty NumPy array or is empty. Defaulting min/max.")
            self.min_value = 0.0
            self.max_value = 1.0
            return

        sampled_data_flat = None
        if current_image_data.size > MAX_SAMPLE_POINTS_FOR_DYN_RANGE: # USE GLOBAL CONSTANT
            if current_image_data.ndim == 2: # Primary path for large 2D images
                ratio = current_image_data.size / MAX_SAMPLE_POINTS_FOR_DYN_RANGE # USE GLOBAL CONSTANT
                # Ensure stride is at least 1
                stride = max(1, int(np.sqrt(ratio))) 
                
                sampled_data = current_image_data[::stride, ::stride]
                sampled_data_flat = sampled_data.ravel()
                print(f"Strided sampling (stride={stride}) on 2D data ({current_image_data.shape}). Sampled ~{sampled_data_flat.size} points for dynamic range.")
            else: # Fallback: if self.image_data wasn't 2D (e.g. 1D, or >4D not sliced in __init__)
                  # This is less ideal as ravel() on large N-D memmap is slow.
                  # But __init__ should make self.image_data 2D for common 3D/4D cases.
                temp_flat = current_image_data.ravel()
                num_to_sample = min(MAX_SAMPLE_POINTS_FOR_DYN_RANGE, temp_flat.size) # USE GLOBAL CONSTANT, ensure not asking for more than available
                if num_to_sample > 0:
                    indices = np.random.choice(temp_flat.size, size=num_to_sample, replace=False)
                    sampled_data_flat = temp_flat[indices]
                    print(f"Random sampling on non-2D/fallback data ({current_image_data.shape}). Sampled {sampled_data_flat.size} points for dynamic range.")
        else: # Data size is <= MAX_SAMPLE_POINTS_FOR_DYN_RANGE
            sampled_data_flat = current_image_data.ravel()
            print(f"Using all {sampled_data_flat.size} points (data smaller than max sample size).")

        if sampled_data_flat is None or sampled_data_flat.size == 0: # Check if sampling produced anything
            print("Warning: Sampled data is empty (either from source or after sampling). Defaulting min/max.")
            # Assign empty array to prevent error with np.isfinite if sampled_data_flat is None
            data_for_percentile = np.array([])
        else:
            data_for_percentile = sampled_data_flat[np.isfinite(sampled_data_flat)]
        
        print(f"Using {data_for_percentile.size} finite points from sample for percentile calculation.")

        if data_for_percentile.size > 0:
            self.min_value = float(np.percentile(data_for_percentile, DYNAMIC_RANGE_PERCENTILES['q_min']))
            self.max_value = float(np.percentile(data_for_percentile, DYNAMIC_RANGE_PERCENTILES['q_max']))
            if self.min_value >= self.max_value:
                # Fallback for noisy or flat data where percentiles are too close or inverted
                print(f"Warning: Percentile min ({self.min_value}) >= max ({self.max_value}). Falling back to overall min/max of finite sample.")
                self.min_value = float(np.min(data_for_percentile))
                self.max_value = float(np.max(data_for_percentile))
                if self.min_value >= self.max_value: # Handle case where all values in sample are identical
                    # Ensure max_value is slightly greater than min_value to avoid division by zero in scaling
                    self.max_value = self.min_value + (1e-6 if self.min_value != 0 else 1.0) # Add small epsilon, or use 1.0 if min is 0
                    print(f"All finite sampled values are identical ({self.min_value}). Adjusted max to {self.max_value}.")
        else:
            print("Warning: No finite data available for percentile calculation after sampling. Defaulting min/max to 0.0/1.0")
            self.min_value = 0.0
            self.max_value = 1.0 # Default max_value if no finite data
        print(f"Initial dynamic range set: min={self.min_value}, max={self.max_value}")
    
    def ensure_dynamic_range_calculated(self):
        """Ensures the dynamic range is calculated, thread-safe."""
        if self.min_value is None or self.max_value is None: 
            with self._dynamic_range_lock:
                if self.min_value is None or self.max_value is None: 
                    print(f"Dynamic range for {self.fits_file_path}:{self.hdu_index} not calculated, calculating now...")
                    self._calculate_initial_dynamic_range()
                    print(f"Dynamic range for {self.fits_file_path}:{self.hdu_index} calculated.")
    
    def ensure_overview_generated(self):
        """Ensures the overview is generated, thread-safe."""
        # Do not force dynamic range calculation up-front on Ceph; overview computes its own vmin/vmax
        if self.overview_image is None: 
            with self._overview_lock:
                if self.overview_image is None: 
                    print(f"Overview for {self.fits_file_path}:{self.hdu_index} not found, generating...")
                    self.overview_image = self._generate_overview()
                    print(f"Overview for {self.fits_file_path}:{self.hdu_index} generated.")
                else:
                    print(f"Overview for {self.fits_file_path}:{self.hdu_index} was generated by another thread.")
        else:
            print(f"Overview for {self.fits_file_path}:{self.hdu_index} already generated.")
    
    def _generate_overview(self):
        """Generate a downsampled overview image for quick display."""
        try:
            # Ensure data is loaded lazily before slicing
            self._ensure_image_data_loaded()
            # Create a small overview (max 512x512)
            target_size = 512
            strategy = os.getenv('OVERVIEW_STRATEGY', 'central')  # 'central' | 'full'

            if strategy == 'central':
                # Read a single contiguous central window to avoid random I/O on Ceph
                win_size = int(os.getenv('OVERVIEW_CENTRAL_SIZE', '2048'))
                win_h = min(self.height, win_size)
                win_w = min(self.width, win_size)
                cy = self.height // 2
                cx = self.width // 2
                y0 = max(0, cy - win_h // 2)
                y1 = y0 + win_h
                x0 = max(0, cx - win_w // 2)
                x1 = x0 + win_w
                window = self.image_data[y0:y1, x0:x1]

                # Downsample the window to target_size using simple stride sampling (contiguous access)
                stride_y = max(1, window.shape[0] // target_size)
                stride_x = max(1, window.shape[1] // target_size)
                overview_data = window[0:window.shape[0]:stride_y, 0:window.shape[1]:stride_x]
                # Clamp to target dimensions if slightly oversized
                overview_data = overview_data[:target_size, :target_size]
            else:
                # Full-image strided decimation (may be slow on Ceph due to random I/O)
                scale = max(1, max(self.width, self.height) / target_size)
                overview_width = int(self.width / scale)
                overview_height = int(self.height / scale)
                if scale > 1:
                    stride_y = max(1, int(self.height / overview_height))
                    stride_x = max(1, int(self.width / overview_width))
                    overview_data = self.image_data[0:self.height:stride_y, 0:self.width:stride_x]
                    overview_data = overview_data[:overview_height, :overview_width]
                else:
                    overview_data = np.array(self.image_data)  # Small image, use as-is
            
            # Handle NaN and infinity values
            overview_data = np.nan_to_num(overview_data, nan=0, posinf=0, neginf=0)
            
            # Determine vmin/vmax
            vmin = self.min_value
            vmax = self.max_value
            if vmin is None or vmax is None or not np.isfinite([vmin, vmax]).all() or vmin >= vmax:
                vmin = float(np.nanmin(overview_data))
                vmax = float(np.nanmax(overview_data))
                if not np.isfinite(vmin) or not np.isfinite(vmax) or vmin >= vmax:
                    vmin, vmax = 0.0, 1.0

            # Vectorized normalization and scaling
            t = (np.clip(overview_data, vmin, vmax) - vmin) / max(vmax - vmin, 1e-12)

            sf = self.scaling_function
            if sf == 'logarithmic':
                norm = np.log1p(LOG_STRETCH_K * t) / np.log1p(LOG_STRETCH_K)
            elif sf == 'sqrt':
                norm = np.sqrt(t)
            elif sf == 'power':
                norm = t ** POWER_GAMMA
            elif sf == 'asinh' and ASINH_BETA > 0:
                norm = np.arcsinh(ASINH_BETA * t) / np.arcsinh(ASINH_BETA)
            else:
                norm = t

            # Convert to 8-bit and apply LUT
            img_data_8bit = (np.clip(norm, 0, 1) * 255).astype(np.uint8)
            rgb_img_data = self.lut[img_data_8bit]
            
            # Create PNG with minimal compression for speed
            from PIL import Image
            img = Image.fromarray(rgb_img_data, 'RGB') # Ensure mode is RGB
            
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=False, compress_level=0)
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
            
        except Exception as e:
            logger.error(f"Error generating overview for {self.fits_file_path}: {e}", exc_info=True)
            self.overview_image = None
            self.overview_generated = False
            return None
    
    def get_tile_info(self):
        """Get tile information for the frontend."""
        self.ensure_dynamic_range_calculated() # Ensure min/max values are available
        
        bunit = self.header.get('BUNIT', None)

        # self.min_value and self.max_value are set by _calculate_initial_dynamic_range
        # and represent the initial display range (e.g., 0.5 to 99.5 percentile)
        initial_display_min = float(self.min_value) if self.min_value is not None else None
        initial_display_max = float(self.max_value) if self.max_value is not None else None

        return {
            "width": self.width, # Use attributes initialized in __init__
            "height": self.height, # Use attributes initialized in __init__
            "tileSize": self.tile_size,
            "maxLevel": self.max_level,
            "initial_display_min": initial_display_min, 
            "initial_display_max": initial_display_max, 
            "bunit": bunit,
            "color_map": self.color_map, # Correct attribute name
            "scaling_function": self.scaling_function # Correct attribute name
            # data_min and data_max (overall true data range) are removed for now to fix the error.
            # If needed, these would require explicit calculation and storage in the generator.
        }

    def get_minimal_tile_info(self):
        """Return minimal tile info without triggering dynamic range (cpah-friendly)."""
        bunit = self.header.get('BUNIT', None)
        return {
            "width": self.width,
            "height": self.height,
            "tileSize": self.tile_size,
            "maxLevel": self.max_level,
            "bunit": bunit,
            "color_map": self.color_map,
            "scaling_function": self.scaling_function
        }
    def get_tile(self, level, x, y):
        """Generate a tile at the specified level and coordinates."""
        # Ensure data is loaded lazily before slicing
        self._ensure_image_data_loaded()
        self.ensure_dynamic_range_calculated() # ADDED: Ensure min/max values are available for scaling
        try:
            # Calculate the scale for this level
            scale = 2 ** (self.max_level - level)
            
            # Calculate pixel coordinates in the original image
            start_x = x * self.tile_size * scale
            start_y = y * self.tile_size * scale
            
            # Check if the tile is out of bounds (top-left corner check)
            if start_x >= self.width or start_y >= self.height:
                # Create a blank tile as we are completely outside the image bounds
                # print(f"Tile ({level},{x},{y}) out of bounds (top-left corner).")
                # tile_data = np.zeros((self.tile_size, self.tile_size), dtype=self.image_data.dtype)
                # The normalization below will handle this by producing a black image.
                # To be safe, and ensure correct processing flow, let's return a PNG of a blank tile.
                img = Image.new('L', (self.tile_size, self.tile_size), color=0) # Black tile
                buffer = io.BytesIO()
                img.save(buffer, format='PNG', optimize=False, compress_level=0)
                return buffer.getvalue()

            # Handle full resolution (scale=1) and overzoom (scale<1)
            if scale <= 1:
                # Calculate the source region in the full-resolution image
                # start_x, start_y are pixel coordinates on the original image
                # corresponding to the top-left of the tile at the *current requested level*.
                
                # The dimensions of the source data to extract for this tile:
                src_region_width_on_image = self.tile_size * scale
                src_region_height_on_image = self.tile_size * scale

                # Actual end coordinates for reading from source, clamped to image dimensions
                read_start_x_exact = start_x
                read_start_y_exact = start_y
                read_end_x_exact = start_x + src_region_width_on_image
                read_end_y_exact = start_y + src_region_height_on_image

                # Integer pixel indices for slicing from self.image_data
                # Ensure start coordinates are within bounds before int conversion
                # Clamp read start/end to actual image dimensions to avoid invalid slices
                int_start_x = int(np.floor(max(0, read_start_x_exact)))
                int_start_y = int(np.floor(max(0, read_start_y_exact)))
                int_end_x = int(np.ceil(min(self.width, read_end_x_exact)))
                int_end_y = int(np.ceil(min(self.height, read_end_y_exact)))
                
                if int_start_x >= int_end_x or int_start_y >= int_end_y:
                    # This means the calculated slice has zero width or height,
                    # e.g., it's entirely off the image edge after clamping.
                    # print(f"Tile ({level},{x},{y}) resulted in empty slice after clamping.")
                    tile_data = np.zeros((self.tile_size, self.tile_size), dtype=self.image_data.dtype)
                else:
                    region_data = self.image_data[int_start_y:int_end_y, int_start_x:int_end_x]

                    if region_data.size == 0:
                        # print(f"Tile ({level},{x},{y}) extracted empty region_data.")
                        tile_data = np.zeros((self.tile_size, self.tile_size), dtype=self.image_data.dtype)
                    elif scale < 1:  # Overzooming: upscale the extracted region_data
                        # order=1 for bilinear. preserve_range is important.
                        tile_data = resize(region_data,
                                           (self.tile_size, self.tile_size),
                                           order=0,  # Changed to 0 for nearest-neighbor
                                           preserve_range=True, 
                                           anti_aliasing=False, # anti-aliasing not for upscaling or order < 2
                                           mode='constant', 
                                           cval=0)
                        tile_data = tile_data.astype(self.image_data.dtype)
                    elif region_data.shape[0] != self.tile_size or region_data.shape[1] != self.tile_size:
                        # Native resolution (scale=1) but tile is partial (at image edge)
                        # Pad to full tile_size
                        padded_data = np.zeros((self.tile_size, self.tile_size), dtype=region_data.dtype)
                        h, w = region_data.shape
                        padded_data[:h, :w] = region_data
                        tile_data = padded_data
                    else:
                        # Native resolution (scale=1) and full tile
                        tile_data = np.array(region_data) # Ensure it's a copy
            else:
                # Downsampled - use stride slicing for speed (scale > 1)
                region_start_x = x * self.tile_size * scale
                region_start_y = y * self.tile_size * scale
                region_end_x = min(region_start_x + self.tile_size * scale, self.width)
                region_end_y = min(region_start_y + self.tile_size * scale, self.height)

                stride = max(1, int(scale))

                y0, y1 = int(region_start_y), int(region_end_y)
                x0, x1 = int(region_start_x), int(region_end_x)

                sampled_region = self.image_data[y0:y1:stride, x0:x1:stride]

                if sampled_region.shape[0] < self.tile_size or sampled_region.shape[1] < self.tile_size:
                    padded = np.zeros((self.tile_size, self.tile_size), dtype=sampled_region.dtype)
                    padded[:sampled_region.shape[0], :sampled_region.shape[1]] = sampled_region
                    tile_data = padded
                else:
                    tile_data = sampled_region

            # Handle NaN and infinity values
            tile_data = np.nan_to_num(tile_data, nan=0, posinf=self.max_value, neginf=self.min_value)

            # Normalize to 0-1 range using selected scaling function (vectorized)
            sf = self.scaling_function
            vmin, vmax = self.min_value, self.max_value

            if vmin is None or vmax is None or vmin == vmax:
                normalized_tile_data = np.full((self.tile_size, self.tile_size), 0.5, dtype=float)
            else:
                clipped = np.clip(tile_data, vmin, vmax)
                t = (clipped - vmin) / max(vmax - vmin, 1e-12)

                if sf == 'logarithmic':
                    normalized_tile_data = np.log1p(LOG_STRETCH_K * t) / np.log1p(LOG_STRETCH_K)
                elif sf == 'sqrt':
                    normalized_tile_data = np.sqrt(t)
                elif sf == 'power':
                    normalized_tile_data = t ** POWER_GAMMA
                elif sf == 'asinh' and ASINH_BETA > 0:
                    normalized_tile_data = np.arcsinh(ASINH_BETA * t) / np.arcsinh(ASINH_BETA)
                else:
                    normalized_tile_data = t

            normalized_tile_data = np.clip(normalized_tile_data, 0, 1)

            # Convert to 8-bit image
            img_data_8bit = (normalized_tile_data * 255).astype(np.uint8)
            
            # Apply colormap using the LUT
            rgb_img_data = self.lut[img_data_8bit]
            
            # Create PNG with minimal compression for speed
            from PIL import Image
            img = Image.fromarray(rgb_img_data, 'RGB') # Ensure mode is RGB
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=False, compress_level=0)
            return buffer.getvalue()
            
        except Exception as e:
            print(f"Error generating tile ({level},{x},{y}): {e}")
            return None
    def cleanup(self):
        """Clean up resources."""
        if hasattr(self, '_hdul'):
            try:
                self._hdul.close()
            except:
                pass
        if hasattr(self, 'image_data'):
            del self.image_data
        import gc
        gc.collect()
    
    def request_tiles(self, level, center_x, center_y, radius=2):
        """Simple tile request method for compatibility. 
        SimpleTileGenerator generates tiles on-demand, so this is just a placeholder."""
        print(f"Tile request: level={level}, center=({center_x},{center_y}), radius={radius}")
        return True  # Always successful since we generate on-demand
    def _update_colormap_lut(self):
        """Generate a Lookup Table (LUT) for the current colormap."""
        cmap_key = self.color_map if isinstance(self.color_map, str) else 'grayscale'
        color_map_func = COLOR_MAPS_PY.get(cmap_key, COLOR_MAPS_PY['grayscale'])
        if not callable(color_map_func):
            print(f"[colormap] Invalid or non-callable colormap '{self.color_map}', falling back to 'grayscale'")
            color_map_func = COLOR_MAPS_PY['grayscale']
        # Create a LUT: 256 entries, each with 3 (RGB) uint8 values
        self.lut = np.zeros((256, 3), dtype=np.uint8)
        for i in range(256):
            self.lut[i] = color_map_func(i)
        print(f"Colormap LUT updated for '{self.color_map}'")
@app.get("/fits-histogram/")
async def get_fits_histogram(
    request: Request,
    bins: int = Query(FITS_HISTOGRAM_DEFAULT_BINS),
    min_val: float = Query(None),
    max_val: float = Query(None)
):
    """Generate histogram data for the current FITS file (session-aware, robust sampling, no all-zero bins)."""
    try:
        # Prefer session-scoped state; fallback to global
        session = getattr(request.state, "session", None)
        session_data = session.data if session is not None else None

        if session_data is not None:
            current_file = session_data.get("current_fits_file")
            hdu_index = int(session_data.get("current_hdu_index", DEFAULT_HDU_INDEX))
        else:
            current_file = getattr(app.state, "current_fits_file", None)
            hdu_index = getattr(app.state, "current_hdu_index", DEFAULT_HDU_INDEX)

        if not current_file:
            return JSONResponse(status_code=400, content={"error": "No FITS file currently loaded"})

        # Try to use the session tile generator data (matches displayed image and orientation)
        image_data_raw = None
        height = width = None
        if session_data is not None:
            file_id = f"{os.path.basename(current_file)}:{hdu_index}"
            session_generators = session_data.setdefault("active_tile_generators", {})
            gen = session_generators.get(file_id)
            if gen is not None and hasattr(gen, "image_data") and gen.image_data is not None:
                image_data_raw = gen.image_data
                height, width = image_data_raw.shape[-2:]

        # Fallback: open file if no generator data present
        if image_data_raw is None:
            full_path = Path(current_file)
            if not full_path.exists() and not str(full_path).startswith(str(FILES_DIRECTORY)):
                full_path = Path(FILES_DIRECTORY) / current_file
            if not full_path.exists():
                return JSONResponse(status_code=404, content={"error": f"FITS file not found: {full_path}"})

            with fits.open(full_path, memmap=True, lazy_load_hdus=True) as hdul:
                if hdu_index < 0 or hdu_index >= len(hdul):
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs."}
                    )
                hdu = hdul[hdu_index]
                if hdu.data is None or hdu.data.ndim < 2:
                    return JSONResponse(status_code=400, content={"error": "Selected HDU has no 2D image data."})
                image_data_raw = hdu.data
                if image_data_raw.ndim > 2:
                    if image_data_raw.ndim == 3:
                        image_data_raw = image_data_raw[0, :, :]
                    elif image_data_raw.ndim == 4:
                        image_data_raw = image_data_raw[0, 0, :, :]
                    else:
                        return JSONResponse(
                            status_code=400,
                            content={"error": f"Image data has {image_data_raw.ndim} dimensions; histogram supports 2D/3D/4D (first slice)."}
                        )
                height, width = image_data_raw.shape[-2:]

        # Robust sampling: keep at most MAX_POINTS_FOR_FULL_HISTOGRAM points
        total_points = int(image_data_raw.size)
        if total_points > MAX_POINTS_FOR_FULL_HISTOGRAM:
            ratio = total_points / MAX_POINTS_FOR_FULL_HISTOGRAM
            stride = max(1, int(np.sqrt(ratio)))
            sampled = image_data_raw[::stride, ::stride]
            finite_vals = sampled[np.isfinite(sampled)] if sampled.size > 0 else np.array([])
            sampled_flag = True
            print(f"Histogram: Strided sampling (stride={stride}) on {image_data_raw.shape}, ~{finite_vals.size} finite points.")
        else:
            finite_vals = image_data_raw[np.isfinite(image_data_raw)]
            sampled_flag = False
            print(f"Histogram: Using all {finite_vals.size} finite points.")

        if finite_vals.size == 0:
            # Respect provided range if any, else default
            hist_range_min = min_val if min_val is not None else 0.0
            hist_range_max = max_val if max_val is not None else 1.0
            if hist_range_min >= hist_range_max:
                hist_range_max = hist_range_min + 1e-6
            counts, bin_edges = np.histogram([], bins=bins, range=(hist_range_min, hist_range_max))
            return JSONResponse(content={
                "counts": counts.tolist(),
                "bin_edges": bin_edges.tolist(),
                "min_value": hist_range_min,
                "max_value": hist_range_max,
                "data_overall_min": hist_range_min,
                "data_overall_max": hist_range_max,
                "width": width or 0,
                "height": height or 0,
                "sampled": sampled_flag,
                "query_min_val": min_val,
                "query_max_val": max_val,
                "notes": "No finite data found; used specified/default range."
            })

        # Overall finite data range
        actual_data_min = float(np.min(finite_vals))
        actual_data_max = float(np.max(finite_vals))
        if actual_data_min >= actual_data_max:
            actual_data_max = actual_data_min + 1e-6

        # Use user range if valid; else data-derived range
        if min_val is None or max_val is None or min_val >= max_val:
            current_min_val_hist = actual_data_min
            current_max_val_hist = actual_data_max
            range_notes = "Used data range."
        else:
            current_min_val_hist = float(min_val)
            current_max_val_hist = float(max_val)
            if current_min_val_hist >= current_max_val_hist:
                current_max_val_hist = current_min_val_hist + 1e-6
            range_notes = "Used user-specified range."

        counts, bin_edges_out = np.histogram(
            finite_vals, bins=bins, range=(current_min_val_hist, current_max_val_hist)
        )

        # Avoid all-zero bins by falling back to auto-range once
        if counts.sum() == 0 and finite_vals.size > 0:
            counts, bin_edges_out = np.histogram(
                finite_vals, bins=bins, range=(actual_data_min, actual_data_max)
            )
            current_min_val_hist = actual_data_min
            current_max_val_hist = actual_data_max
            range_notes = "User range produced no hits; fell back to data range."

        return JSONResponse(content={
            "counts": counts.tolist(),
            "bin_edges": bin_edges_out.tolist(),
            "min_value": float(current_min_val_hist),
            "max_value": float(current_max_val_hist),
            "data_overall_min": actual_data_min,
            "data_overall_max": actual_data_max,
            "width": width,
            "height": height,
            "sampled": sampled_flag,
            "notes": range_notes,
            "query_min_val": min_val,
            "query_max_val": max_val
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating histogram: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": f"Failed to generate histogram: {str(e)}"})


@app.get("/fits-header/{filepath:path}")
async def get_fits_header(filepath: str, hdu_index: int = Query(0, description="Index of the HDU to read the header from")):
    """Retrieve the header of a specific HDU from a FITS file."""
    try:
        # Construct the full path relative to the workspace or use absolute path
        # This assumes 'files/' directory or allows absolute paths
        if not os.path.isabs(filepath):
             # Adjust base path if files are not in the root
             base_path = Path(FILES_DIRECTORY) # Or Path(os.getcwd()) if files are elsewhere
             full_path = base_path / filepath
        else:
             full_path = Path(filepath)

        if not full_path.exists():
            raise HTTPException(status_code=404, detail=f"FITS file not found at: {full_path}")

        with fits.open(full_path, memmap=False) as hdul:
            if hdu_index < 0 or hdu_index >= len(hdul):
                 raise HTTPException(status_code=400, detail=f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs.")

            header = hdul[hdu_index].header
            # Convert header to a list of key-value pairs for easier frontend handling
            header_list = [{"key": k, "value": repr(v), "comment": header.comments[k]} for k, v in header.items() if k] # Ensure key is not empty

            return JSONResponse(content={"header": header_list, "hdu_index": hdu_index, "filename": full_path.name})

    except FileNotFoundError:
         raise HTTPException(status_code=404, detail=f"FITS file not found at specified path: {filepath}")
    except HTTPException as http_exc:
        # Re-raise HTTP exceptions
        raise http_exc
    except Exception as e:
        # Log the error for debugging
        print(f"Error reading FITS header for {filepath}, HDU {hdu_index}: {e}")
        # Optionally, include traceback:
        # import traceback
        # print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to read FITS header: {str(e)}")

@app.get("/fits-hdu-info/{filepath:path}")
async def get_fits_hdu_info(filepath: str):
    """
    Returns a list of HDUs and their basic information for a given FITS file.
    """
    if ".." in filepath:
        raise HTTPException(status_code=400, detail="Invalid file path.")

    # The filepath from the frontend might not be prefixed with "files/", so we handle both cases.
    full_path = Path(filepath)
    if not full_path.exists():
        if not filepath.startswith(FILES_DIRECTORY):
            full_path = Path(FILES_DIRECTORY) / filepath

    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"FITS file not found at: {filepath}")

    try:
        with fits.open(full_path) as hdul:
            hdu_list = []
            # Determine which HDU is likely the main science image
            recommended_index = -1
            max_pixels = 0
            
            # First pass: find the best candidate for the "recommended" HDU
            for i, hdu in enumerate(hdul):
                if hdu.is_image and hdu.data is not None and hdu.data.ndim >= 2:
                    num_pixels = hdu.data.size
                    if num_pixels > max_pixels:
                        max_pixels = num_pixels
                        recommended_index = i

            # Second pass: gather info for all HDUs
            for i, hdu in enumerate(hdul):
                # Basic info
                info = {
                    "index": i,
                    "name": hdu.name or hdu.header.get('EXTNAME', f'HDU {i}'),
                    "type": "Primary" if isinstance(hdu, fits.PrimaryHDU) else ("Image" if hdu.is_image else "Table"),
                    "isRecommended": i == recommended_index
                }

                # Add specific details based on HDU type
                if hdu.is_image and hdu.data is not None:
                    info["dimensions"] = hdu.shape
                    info["dataType"] = str(hdu.data.dtype)
                    info["bunit"] = hdu.header.get('BUNIT', 'Unknown')
                    try:
                        wcs_info = WCS(hdu.header)
                        info["hasWCS"] = wcs_info.has_celestial
                    except Exception:
                        info["hasWCS"] = False
                elif isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                    info["rows"] = hdu.header.get('NAXIS2', 0)
                    info["columns"] = hdu.header.get('TFIELDS', 0)

                hdu_list.append(info)
                
            return JSONResponse(content={"hduList": hdu_list, "filename": full_path.name})
    except Exception as e:
        logger.error(f"Failed to read HDU info for {full_path}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read HDU info: {str(e)}")


# Helper functions for image processing
import numpy

def linear(inputArray, scale_min=None, scale_max=None):
    """Performs linear scaling of the input numpy array."""
    imageData = numpy.array(inputArray, copy=True)

    if scale_min is None:
        scale_min = imageData.min()
    if scale_max is None:
        scale_max = imageData.max()

    imageData = imageData.clip(min=scale_min, max=scale_max)
    imageData = (imageData - scale_min) / (scale_max - scale_min)
    
    # Ensure data is within the 0.0 to 1.0 range
    imageData[imageData < 0] = 0.0
    imageData[imageData > 1] = 1.0
    
    return imageData


def build_sed_norm(mode: str, vmax_percentile: float, data: np.ndarray):
    """Return a matplotlib norm or None based on mode for SED (cutout) images.
    - mode 'power': PowerNorm with gamma SED_SQRT_NORM_GAMMA
    - mode 'log': LogNorm with vmin>0
    - mode 'linear': None (use vmin/vmax only)
    """
    try:
        vmax = np.percentile(data, vmax_percentile)
        if mode == 'power':
            print('doing power')
            return PowerNorm(gamma=SED_SQRT_NORM_GAMMA, vmin=0, vmax=vmax)
        if mode == 'log':
            # Ensure vmin>0 for log
            print('doing log')
            vmin = max(np.nanmin(data[data>0]) if np.any(data>0) else 1e-6, 1e-6)
            return LogNorm(vmin=vmin, vmax=max(vmax, vmin*10))
        # linear
        print('doing linear')
        return None
    except Exception as e:
        print(f"Error building SED norm: {e}")
        return None


def resolve_sed_norm_mode_for_filter(filter_name: str, default_group: str | None = None) -> str:
    """Resolve the effective normalization mode for a filter.
    Precedence:
      1) SED_NORM_MODE_BY_FILTER (exact filter override)
      2) SED_NORM_MODE_BY_GROUP (instrument group override)
      3) SED_NORM_MODE (global fallback)
    """
    try:
        key = (filter_name or '').upper()
        if key in SED_NORM_MODE_BY_FILTER:
            return SED_NORM_MODE_BY_FILTER[key]
        if default_group and default_group in SED_NORM_MODE_BY_GROUP:
            return SED_NORM_MODE_BY_GROUP[default_group]
        return SED_NORM_MODE
    except Exception:
        return SED_NORM_MODE
@app.get("/generate-sed/")
async def generate_sed_optimized(
    ra: float,
    dec: float,
    catalog_name: str,
    galaxy_name: str = None,
    ra_col: Optional[str] = Query(None, description="Override RA column name for SED"),
    dec_col: Optional[str] = Query(None, description="Override DEC column name for SED")
):
    """SED plot generation that accepts catalog_name, derives galaxy from row (ignores JS galaxy_name),
    searches recursively under FILES_DIRECTORY with galaxy-token preference, and keeps cutouts/RGB logic."""
    print('given galaxy_name',galaxy_name)
    try:
        if np.isnan(ra) or np.isinf(ra) or np.isnan(dec) or np.isinf(dec):
            return JSONResponse(status_code=400, content={"error": "Invalid RA/Dec coordinates"})

        print(f"[[DEBUG]] generate_sed_optimized CALLED. ra: {ra} dec: {dec} catalog_name: {catalog_name} (ignoring JS galaxy_name)")

        # 1) Load catalog (support catalogs/, files/, files/uploads/)
        catalog_table = loaded_catalogs.get(catalog_name)
        if catalog_table is None:
            print(f"SED: Loading catalog '{catalog_name}'...")
            base_dir = Path(".").resolve()
            candidates = [
                (base_dir, base_dir / catalog_name),
                (base_dir / CATALOGS_DIRECTORY, base_dir / CATALOGS_DIRECTORY / catalog_name),
                (base_dir / UPLOADS_DIRECTORY, base_dir / UPLOADS_DIRECTORY / catalog_name),
                (base_dir / FILES_DIRECTORY, base_dir / FILES_DIRECTORY / catalog_name),
            ]
            found_dir = None
            for parent_dir, fullp in candidates:
                try:
                    if fullp.is_file():
                        found_dir = parent_dir
                        break
                except Exception:
                    continue
            # Fallback to catalogs_dir if not found by probing
            probe_dir = found_dir if found_dir is not None else catalogs_dir
            catalog_table = get_astropy_table_from_catalog(catalog_name, Path(probe_dir))
            if catalog_table is None:
                return JSONResponse(status_code=404, content={"error": f"Failed to load catalog '{catalog_name}'"})
            loaded_catalogs[catalog_name] = catalog_table

        # 2) Find nearest row
        available_cols_lower = {c.lower(): c for c in catalog_table.colnames}
        # Prefer explicit overrides if valid
        ra_col_name = available_cols_lower.get((ra_col or '').lower()) if ra_col else None
        dec_col_name = available_cols_lower.get((dec_col or '').lower()) if dec_col else None
        # Fallback to candidate lists (case-insensitive)
        if not ra_col_name:
            ra_col_name = next((available_cols_lower[name.lower()] for name in RA_COLUMN_NAMES if name.lower() in available_cols_lower), None)
        if not dec_col_name:
            dec_col_name = next((available_cols_lower[name.lower()] for name in DEC_COLUMN_NAMES if name.lower() in available_cols_lower), None)
        # Final PHANGS fallback
        if not ra_col_name:
            ra_col_name = available_cols_lower.get('phangs_ra')
        if not dec_col_name:
            dec_col_name = available_cols_lower.get('phangs_dec')
        if not ra_col_name or not dec_col_name:
            return JSONResponse(status_code=400, content={"error": "Could not find RA and DEC columns in catalog"})

        # Robust RA/DEC normalization to degrees (supports sexagesimal strings, astropy quantities, radians, hours)
        def _parse_sexagesimal(s: str, is_ra: bool) -> float:
            try:
                import re
                txt = str(s).strip().lower()
                nums = re.findall(r'[+-]?\d+(?:\.\d+)?', txt)
                if not nums:
                    return float('nan')
                a0 = float(nums[0])
                a1 = float(nums[1]) if len(nums) > 1 else 0.0
                a2 = float(nums[2]) if len(nums) > 2 else 0.0
                sign = -1.0 if a0 < 0 else 1.0
                a0 = abs(a0)
                val = a0 + a1/60.0 + a2/3600.0
                if is_ra:
                    return sign * val * 15.0
                return sign * val
            except Exception:
                return float('nan')

        def _normalize_coord_value(val, is_ra: bool, col_name: str | None = None) -> float:
            try:
                # Astropy Quantity with angle units
                try:
                    from astropy import units as u
                    if hasattr(val, 'unit') and getattr(val, 'unit') is not None:
                        q = val
                        try:
                            return float(q.to(u.deg).value)
                        except Exception:
                            try:
                                return float((q.to(u.hourangle)).to(u.deg).value)
                            except Exception:
                                pass
                except Exception:
                    pass

                # Strings (sexagesimal or numeric)
                if isinstance(val, str):
                    out = _parse_sexagesimal(val, is_ra)
                    if np.isfinite(out):
                        return out
                    try:
                        v = float(val)
                    except Exception:
                        return float('nan')
                    val = v

                # numpy scalar -> python
                if hasattr(val, 'item'):
                    val = val.item()

                if isinstance(val, (int, float, np.number)):
                    v = float(val)
                    if not np.isfinite(v):
                        return float('nan')
                    # radians
                    if abs(v) <= (2*np.pi + 1e-6):
                        return v * (180.0/np.pi)
                    # hours for RA
                    if is_ra:
                        name = (col_name or '').lower()
                        if ('hms' in name) or ('hour' in name) or (0.0 <= v <= 24.0):
                            return v * 15.0
                    return v
            except Exception:
                return float('nan')
            return float('nan')

        try:
            ra_col_data = catalog_table[ra_col_name]
            dec_col_data = catalog_table[dec_col_name]
            ra_vals_deg = np.array([_normalize_coord_value(v, True, ra_col_name) for v in ra_col_data], dtype=float)
            dec_vals_deg = np.array([_normalize_coord_value(v, False, dec_col_name) for v in dec_col_data], dtype=float)
        except Exception as e_norm:
            return JSONResponse(status_code=500, content={"error": f"Error processing RA/DEC columns: {str(e_norm)}"})

        # Compute great-circle approximation in degrees with RA wrap
        ra_diff = np.abs(ra_vals_deg - ra)
        ra_diff = np.where(ra_diff > 180.0, 360.0 - ra_diff, ra_diff)
        dec_diff = np.abs(dec_vals_deg - dec)
        distances = np.sqrt((ra_diff * np.cos(np.radians(dec)))**2 + dec_diff**2)
        closest_idx = int(np.argmin(distances))
        if float(distances[closest_idx]) > SED_COORDINATE_TOLERANCE:
            return JSONResponse(status_code=404, content={"error": "No object found near specified coordinates"})
        closest_obj = catalog_table[closest_idx]
        available_cols = set(catalog_table.colnames)

        # 3) Derive galaxy from the matched row (ignore JS galaxy_name)
        def _first_non_empty_string(*vals):
            for v in vals:
                if isinstance(v, str):
                    s = v.strip()
                    if s:
                        return s
            return None

        galaxy_from_row = _first_non_empty_string(
            str(closest_obj.get(SED_COL_GALAXY, '') if SED_COL_GALAXY in available_cols else ''),
            str(closest_obj.get('galaxy', '')),
            str(closest_obj.get('galaxy_name', '')),
            str(closest_obj.get('gal_name', '')),
            str(closest_obj.get('PHANGS_GALAXY', '')),
            str(closest_obj.get('NAME', '')),
            str(closest_obj.get('name', ''))
        )
        target_galaxy_name = galaxy_from_row if galaxy_from_row else SED_DEFAULT_GALAXY_NAME
        print(f"[SED] Galaxy from row: {target_galaxy_name}")
        import re


            # Final fallback: try to parse galaxy name from the catalog_name filename if still unknown/invalid
        print('catalog name:', catalog_name)
        print('target_galaxy_name:', target_galaxy_name)
        try:
            if (target_galaxy_name=='UnknownGalaxy'):
                base_name = Path(str(catalog_name)).name.lower()
                print('base_name after pathlib:', base_name)
                
                # Enhanced pattern to match galaxy names with optional suffixes and delimiters (e.g., ngc628c, ngc0628, ic5332a)
                # Use lookarounds so underscores/dashes/spaces or end-of-string count as boundaries
                pattern = r"(?<![a-z0-9])(ngc|ic|m|ugc|eso|pgc|arp)\s*0*(\d+)[a-z]*?(?=[^a-z0-9]|$)"
                print('searching pattern:', pattern)
                print('in base_name:', base_name)
                
                m = re.search(pattern, base_name, re.IGNORECASE)
                print('match found:', m)
                
                if m:
                    print('match groups:', m.groups())
                    prefix, digits = m.group(1).lower(), m.group(2)
                    print('prefix:', prefix, 'digits:', digits)
                    
                    # Normalize the galaxy name format
                    if prefix in ['ngc', 'ic']:
                        candidate = f"{prefix.upper()}{digits.zfill(4)}"  # NGC0628, IC1623
                    elif prefix == 'm':
                        candidate = f"M{digits}"  # M31, M51
                    else:
                        candidate = f"{prefix.upper()}{digits}"  # UGC1234, ESO137
                    
                    target_galaxy_name = candidate
                    print(f"RGB Cutouts: Galaxy name parsed from catalog filename: {target_galaxy_name}")
                else:
                    print('No regex match found')
        except Exception as e:
            print('Exception in filename parsing:', e)
            pass

        # Tokens (ngc628/ngc0628/ngc628mosaic)
        import re
        def build_galaxy_tokens(name: str) -> list[str]:
            if not name:
                return []
            g = name.strip().lower()
            if not g or g in ("unknown", "unknowngalaxy"):
                return []
            base = re.sub(r'[\s_\-]+', '', g)
            tokens = {g, base}
            m = re.match(r'([a-z]+)\s*0*(\d+)', base)
            if m:
                prefix, digits = m.group(1), m.group(2)
                tokens.add(f"{prefix}{digits}")             # ngc628
                tokens.add(f"{prefix}{digits.zfill(4)}")    # ngc0628
                tokens.add(f"{prefix}0{digits}")            # ngc0628 variant
            return list(tokens)

        galaxy_tokens = build_galaxy_tokens(target_galaxy_name)

        # 4) Gather fluxes
        sed_fluxes, sed_fluxes_err, sed_fluxes_cigale, sed_fluxes_total = [], [], [], []

        for filter_name in SED_HST_FILTERS:
            # Resolve flux/error columns from multiple naming variants
            flux_candidates = [
                SED_FLUX_COLUMN_TEMPLATE.format(filter=filter_name),  # e.g., F555W
                f"flux_{filter_name}",                               # e.g., flux_F555W
                f"PHANGS_{filter_name}_mJy"                          # e.g., PHANGS_F555W_mJy
            ]
            err_candidates = [
                SED_ERR_COLUMN_TEMPLATE.format(filter=filter_name),   # e.g., F555W_err
                f"er_flux_{filter_name}",                            # e.g., er_flux_F555W
                f"PHANGS_{filter_name}_mJy_ERR"                      # e.g., PHANGS_F555W_mJy_ERR
            ]
            flux_column = next((c for c in flux_candidates if c in available_cols), flux_candidates[0])
            bkg_column = SED_BKG_COLUMN_TEMPLATE.format(filter=filter_name)
            err_column = next((c for c in err_candidates if c in available_cols), err_candidates[0])

            flux_val = float(closest_obj[flux_column]) if flux_column in available_cols else np.nan
            sed_fluxes.append(flux_val)
            if bkg_column in available_cols:
                sed_fluxes_total.append(flux_val + float(closest_obj.get(bkg_column, np.nan)))
            else:
                sed_fluxes_total.append(np.nan)
            sed_fluxes_err.append(float(closest_obj.get(err_column, np.nan)) if err_column in available_cols else np.nan)
            cigale_val = np.nan
            for pattern in [p.format(filter=filter_name) for p in SED_CIGALE_COLUMN_PATTERNS['HST']]:
                if pattern in available_cols:
                    cigale_val = float(closest_obj[pattern]) * SED_CIGALE_MULTIPLIER
                    break
            sed_fluxes_cigale.append(cigale_val)

        for filter_name in SED_JWST_NIRCAM_FILTERS:
            # Resolve flux/error columns from multiple naming variants
            flux_candidates = [
                SED_FLUX_COLUMN_TEMPLATE.format(filter=filter_name),
                f"flux_{filter_name}",
                f"PHANGS_{filter_name}_mJy"
            ]
            err_candidates = [
                SED_ERR_COLUMN_TEMPLATE.format(filter=filter_name),
                f"er_flux_{filter_name}",
                f"PHANGS_{filter_name}_mJy_ERR"
            ]
            flux_column = next((c for c in flux_candidates if c in available_cols), flux_candidates[0])
            bkg_column = SED_BKG_COLUMN_TEMPLATE.format(filter=filter_name)
            err_column = next((c for c in err_candidates if c in available_cols), err_candidates[0])

            flux_val = float(closest_obj[flux_column]) if flux_column in available_cols else np.nan
            sed_fluxes.append(flux_val)
            if bkg_column in available_cols:
                sed_fluxes_total.append(flux_val + float(closest_obj.get(bkg_column, np.nan)))
            else:
                sed_fluxes_total.append(np.nan)
            sed_fluxes_err.append(float(closest_obj.get(err_column, np.nan)) if err_column in available_cols else np.nan)
            cigale_col = None
            for pattern in [p.format(filter=filter_name) for p in SED_CIGALE_COLUMN_PATTERNS['NIRCAM']]:
                if pattern in available_cols:
                    cigale_col = pattern
                    break
            sed_fluxes_cigale.append((float(closest_obj.get(cigale_col, np.nan)) if cigale_col in available_cols else np.nan) * SED_CIGALE_MULTIPLIER)

        for filter_name in SED_JWST_MIRI_FILTERS:
            # Resolve flux/error columns from multiple naming variants
            flux_candidates = [
                SED_FLUX_COLUMN_TEMPLATE.format(filter=filter_name),
                f"flux_{filter_name}",
                f"PHANGS_{filter_name}_mJy"
            ]
            err_candidates = [
                SED_ERR_COLUMN_TEMPLATE.format(filter=filter_name),
                f"er_flux_{filter_name}",
                f"PHANGS_{filter_name}_mJy_ERR"
            ]
            flux_column = next((c for c in flux_candidates if c in available_cols), flux_candidates[0])
            bkg_column = SED_BKG_COLUMN_TEMPLATE.format(filter=filter_name)
            err_column = next((c for c in err_candidates if c in available_cols), err_candidates[0])

            flux_val = float(closest_obj[flux_column]) if flux_column in available_cols else np.nan
            sed_fluxes.append(flux_val)
            if bkg_column in available_cols:
                sed_fluxes_total.append(flux_val + float(closest_obj.get(bkg_column, np.nan)))
            else:
                sed_fluxes_total.append(np.nan)
            sed_fluxes_err.append(float(closest_obj.get(err_column, np.nan)) if err_column in available_cols else np.nan)
            cigale_col = None
            for pattern in [p.format(filter=filter_name) for p in SED_CIGALE_COLUMN_PATTERNS['MIRI']]:
                if pattern in available_cols:
                    cigale_col = pattern
                    break
            sed_fluxes_cigale.append((float(closest_obj.get(cigale_col, np.nan)) if cigale_col in available_cols else np.nan) * SED_CIGALE_MULTIPLIER)

        # 5) Plot
        fig = plt.figure(figsize=(SED_FIGURE_SIZE_WIDTH, SED_FIGURE_SIZE_HEIGHT))
        ax = fig.add_subplot(111)
        # Ensure main plot renders above inset RGB panels without hiding them
        ax.set_zorder(3)
        ax.set_facecolor('none')
        try:
            _vals_total = [v for v in sed_fluxes_total if v is not None and np.isfinite(v) and abs(v) > 0]
            if _vals_total:
                ax.errorbar(
                    SED_FILTER_WAVELENGTHS,
                    sed_fluxes_total,
                    yerr=sed_fluxes_err,
                    fmt=SED_MARKER_FMT,
                    ecolor=SED_ERRORBAR_ECOLOR,
                    color=SED_OBS_COLOR,
                    label=SED_OBS_LABEL,
                    alpha=SED_ALPHA,
                    markersize=SED_MARKERSIZE,
                    capsize=SED_CAPSIZE,
                    zorder=10,
                )
            ax.errorbar(
                SED_FILTER_WAVELENGTHS,
                sed_fluxes,
                yerr=sed_fluxes_err,
                fmt=SED_MARKER_FMT,
                ecolor=SED_ERRORBAR_ECOLOR,
                color=SED_BKG_SUB_COLOR,
                label=(lambda _vals: (SED_BKG_SUB_LABEL if (bool(_vals) and any(abs(v) > 0 for v in _vals)) else '_nolegend_'))([v for v in sed_fluxes if v is not None and np.isfinite(v)]),
                markersize=SED_MARKERSIZE,
                capsize=SED_CAPSIZE,
                zorder=10,
                alpha=SED_ALPHA,
            )
            # Plot CIGALE fluxes only if there is at least one finite, non-zero value
            try:
                _vals = [v for v in sed_fluxes_cigale if v is not None and np.isfinite(v) and abs(v) > 0]
                if _vals:
                    ax.plot(SED_FILTER_WAVELENGTHS, sed_fluxes_cigale, '-', color='red', alpha=0.8, linewidth=1.5, label='CIGALE', zorder=11)
                    ax.scatter(SED_FILTER_WAVELENGTHS, sed_fluxes_cigale, marker='s', facecolors='none', edgecolors='red', linewidths=1.5, s=max(60, SED_MARKERSIZE*3), label='_nolegend_', zorder=12)
            except Exception as _e:
                pass
        except:
            ax.errorbar(
                SED_FILTER_WAVELENGTHS[:-1],
                sed_fluxes,
                yerr=sed_fluxes_err,
                fmt=SED_MARKER_FMT,
                ecolor=SED_ERRORBAR_ECOLOR,
                color=SED_BKG_SUB_COLOR,
                label=(lambda _vals: (SED_BKG_SUB_LABEL if (bool(_vals) and any(abs(v) > 0 for v in _vals)) else '_nolegend_'))([v for v in sed_fluxes if v is not None and np.isfinite(v)]),
                markersize=SED_MARKERSIZE,
                capsize=SED_CAPSIZE,
                zorder=10,
                alpha=SED_ALPHA,
            )
        ax.set_xlabel(SED_X_LABEL, fontsize=SED_FONTSIZE_LABELS)
        ax.set_ylabel(SED_Y_LABEL, fontsize=SED_FONTSIZE_LABELS)
        ax.legend(loc=SED_LEGEND_LOC, bbox_to_anchor=SED_LEGEND_BBOX_ANCHOR)
        ax.set_xscale(SED_XSCALE); ax.set_yscale(SED_YSCALE)
        ax.set_xticks(SED_FILTER_WAVELENGTHS)
        ax.set_xticklabels([SED_XTICK_LABEL_FORMAT.format(w=w) for w in SED_FILTER_WAVELENGTHS], rotation=SED_XTICK_ROTATION_DEGREES, fontsize=SED_FONTSIZE_TICKS)
        ax.set_xlim(SED_X_LIM_MIN, SED_X_LIM_MAX)

        bbox = dict(boxstyle=SED_INFO_BOX_BOXSTYLE, alpha=SED_INFO_BOX_FACE_ALPHA, facecolor=SED_INFO_BOX_FACE_COLOR)
        galaxy_name_display = (str(closest_obj.get(SED_COL_GALAXY)).upper() if SED_COL_GALAXY in available_cols else target_galaxy_name.upper())
        ax.text(SED_INFO_BOX_X, SED_INFO_BOX_Y, f"Galaxy: {galaxy_name_display}\nRA: {ra:.4f}, DEC: {dec:.4f}",
                transform=ax.transAxes, ha="right", va="bottom", fontsize=SED_FONTSIZE_INFO, bbox=bbox)

        fig.canvas.draw()
        transform = ax.transAxes.inverted()

        # 6) File search (recursive + tokens)
        base_dir = FILES_DIRECTORY
        filter_patterns = {}
        for filter_name in SED_FILTER_NAMES:
            lf = filter_name.lower()
            needles = [lf] + SED_FILTER_ALIASES.get(filter_name, [])
            patterns = []
            for nd in needles:
                for tmpl in SED_FILE_SEARCH_PATTERNS:
                    patterns.append(tmpl.format(base_dir=base_dir, needle=nd))
            # token-augmented
            for tok in galaxy_tokens:
                for nd in needles:
                    for tmpl in SED_FILE_SEARCH_PATTERNS:
                        patterns.append(tmpl.format(base_dir=base_dir, needle=f"{tok}*{nd}"))
            filter_patterns[filter_name] = patterns

        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading, glob, os

        file_matches = {}
        file_lock = threading.Lock()

        def find_files_for_filter(filter_name, patterns):
            for pattern in patterns:
                matches = glob.glob(pattern, recursive=True)
                if not matches:
                    continue
                # Exclude any matches from uploads directory
                matches = [
                    f for f in matches
                    if ('/files/uploads/' not in str(f).replace('\\', '/').lower() and '/uploads/' not in str(f).replace('\\', '/').lower())
                ]
                if not matches:
                    continue
                if filter_name.upper() in set([f.upper() for f in (SED_HST_GREEN_FILTER + SED_HST_RED_FILTERS)]):
                    matches = [
                        f for f in matches
                        if not any(t in os.path.basename(f).lower() for t in SED_EXCLUDED_HA_TOKENS_FOR_CONTINUUM)
                    ]
                    if not matches:
                        continue
                chosen = matches
                if galaxy_tokens:
                    prioritized = [f for f in matches if any(tok in f.lower() for tok in galaxy_tokens)]
                    if prioritized:
                        chosen = prioritized
                with file_lock:
                    if filter_name not in file_matches and chosen:
                        file_matches[filter_name] = chosen[0]
                        return

        with ThreadPoolExecutor(max_workers=SED_MAX_WORKERS_FILES) as executor:
            futures = [executor.submit(find_files_for_filter, fn, pats) for fn, pats in filter_patterns.items()]
            for fut in as_completed(futures, timeout=FIND_FILES_TIMEOUT):
                try:
                    fut.result()
                except:
                    continue

        if target_galaxy_name and target_galaxy_name != SED_DEFAULT_GALAXY_NAME:
            print(f"Files found for galaxy '{target_galaxy_name}': {len(file_matches)} filters")
            for fn, fp in file_matches.items():
                mark = "galaxy-specific" if any(tok in fp.lower() for tok in galaxy_tokens) else "generic"
                print(f"  {fn}: {fp} ({mark})")

        # 7) Cutouts
        nircam_cutouts, miri_cutouts, hst_cutouts = {}, {}, {}
        nircam_header = miri_header = hst_header = None
        rgbsss = []          # CO data
        rgbsss2 = []         # HST HA data

        for i, (wavelength, filter_name) in enumerate(zip(SED_FILTER_WAVELENGTHS_EXTENDED[:len(SED_FILTER_NAMES)], SED_FILTER_NAMES)):
            if filter_name not in file_matches:
                continue
            try:
                fits_file = file_matches[filter_name]
                print(f"Processing cutout for {filter_name} from {fits_file}")
                with fits.open(fits_file) as hdul:
                    image_hdu = next((h for h in hdul if (h.data is not None and hasattr(h.data, 'shape') and len(h.data.shape) >= 2)), None)
                    if image_hdu is None:
                        print(f"No valid image HDU found in {fits_file}")
                        continue

                    prepared_header = _prepare_jwst_header_for_wcs(image_hdu.header)
                    wcs = WCS(prepared_header)
                    if not wcs.has_celestial:
                        print(f"No celestial WCS found for {filter_name}")
                        continue

                    image_data = image_hdu.data
                    if len(image_data.shape) > 2:
                        image_data = image_data[0] if len(image_data.shape) == 3 else image_data[0, 0]

                    target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                    cutout = Cutout2D(image_data, target_coord, SED_CUTOUT_SIZE_ARCSEC * u.arcsec, wcs=wcs)

                    cutout_data = cutout.data.copy()
                    cutout_data[np.isnan(cutout_data)] = 0
                    cutout_data[np.isinf(cutout_data)] = 0

                    x_norm, _ = transform.transform(ax.transData.transform((wavelength, 0)))
                    x_norm = max(min(x_norm, 1 - SED_INSET_RIGHT_MARGIN), 0.0)
                    x_norm += SED_X_OFFSETS[i] if i < len(SED_X_OFFSETS) else 0

                    ax_inset = inset_axes(ax, width=SED_INSET_WIDTH, height=SED_INSET_HEIGHT, loc='center',
                                          bbox_to_anchor=(x_norm, SED_CUTOUT_BASE_Y, SED_INSET_BBOX_SIZE, SED_INSET_BBOX_SIZE),
                                          bbox_transform=fig.transFigure)

                    # Determine instrument group and percentile, then resolve norm mode
                    if filter_name in SED_JWST_NIRCAM_FILTERS:
                        group = 'NIRCAM'
                        vmax_pct = SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE
                    elif filter_name in SED_JWST_MIRI_FILTERS:
                        group = 'MIRI'
                        vmax_pct = SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE
                    else:
                        group = 'HST'
                        vmax_pct = SED_HST_CUTOUT_DISPLAY_MAX_PERCENTILE

                    norm_mode = resolve_sed_norm_mode_for_filter(filter_name, default_group=group)
                    norm = build_sed_norm(norm_mode, vmax_pct, cutout_data)
                    print(f"Using norm: {norm}, group: {group}, filter: {filter_name}")

                    if norm is None:
                        ax_inset.imshow(
                            cutout_data,
                            origin='lower',
                            cmap=SED_CUTOUT_CMAP,
                            vmin=0,
                            vmax=np.percentile(cutout_data, vmax_pct),
                        )
                    else:
                        ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP, norm=norm)

                    region_sky = CircleSkyRegion(center=target_coord, radius=SED_CIRCLE_RADIUS_ARCSEC * u.arcsec)
                    reg = region_sky.to_pixel(cutout.wcs); reg.plot(ax=ax_inset, color=CIRCLE_COLOR, lw=CIRCLE_LINEWIDTH)

                    ax_inset.set_title(filter_name, fontsize=SED_FONTSIZE_TITLE)
                    ax_inset.axis('off')

                    header = cutout.wcs.to_header()
                    header['NAXIS1'] = cutout.data.shape[1]
                    header['NAXIS2'] = cutout.data.shape[0]
                    header['NAXIS'] = 2

                    if filter_name == SED_NIRCAM_RED_FILTER:
                        nircam_cutouts['red'] = np.array(cutout_data); nircam_header = header.copy()
                    elif filter_name == SED_NIRCAM_GREEN_FILTER:
                        nircam_cutouts['green'] = np.array(cutout_data); nircam_header = nircam_header or header.copy()
                    elif filter_name == SED_NIRCAM_BLUE_FILTER:
                        nircam_cutouts['blue'] = np.array(cutout_data); nircam_header = nircam_header or header.copy()
                    elif filter_name.upper() in [f.upper() for f in SED_HST_RED_FILTERS]:
                        hst_cutouts['red'] = np.array(cutout_data); hst_header = header.copy()
                    elif filter_name.upper() in [f.upper() for f in SED_HST_GREEN_FILTER]:
                        hst_cutouts['green'] = np.array(cutout_data); hst_header = hst_header or header.copy()
                    elif filter_name.upper() in [f.upper() for f in SED_HST_BLUE_FILTER]:
                        hst_cutouts['blue'] = np.array(cutout_data); hst_header = hst_header or header.copy()
                    elif filter_name == SED_MIRI_RED_FILTER:
                        miri_cutouts['red'] = np.array(cutout_data); miri_header = header.copy()
                    elif filter_name == SED_MIRI_GREEN_FILTER:
                        miri_cutouts['green'] = np.array(cutout_data); miri_header = miri_header or header.copy()
                    elif filter_name == SED_MIRI_BLUE_FILTER:
                        miri_cutouts['blue'] = np.array(cutout_data); miri_header = miri_header or header.copy()

            except Exception as e:
                print(f"Error processing {filter_name}: {e}")
                import traceback; traceback.print_exc()
                continue

        print(f"Total cutouts processed: {len(nircam_cutouts) + len(miri_cutouts) + len(hst_cutouts)}")

        # 8) H-alpha (recursive + tokens)
        ha_patterns = SED_HA_PATTERNS.copy()
        for tok in galaxy_tokens:
            for tmpl in SED_HA_TOKEN_EXTEND_TEMPLATES:
                ha_patterns.append(tmpl.format(base_dir=base_dir, token=tok))
        ha_files = []
        for pattern in ha_patterns:
            matches = glob.glob(pattern, recursive=True)
            if not matches:
                continue
            # Exclude uploads from HA candidates as well
            matches = [
                f for f in matches
                if ('/files/uploads/' not in str(f).replace('\\', '/').lower() and '/uploads/' not in str(f).replace('\\', '/').lower())
            ]
            if not matches:
                continue
            if galaxy_tokens:
                galaxy_matches = [f for f in matches if any(tok in f.lower() for tok in galaxy_tokens)]
                if galaxy_matches:
                    ha_files = galaxy_matches; break
            ha_files = matches; break

        if ha_files:
            try:
                ha_file = ha_files[0]
                print(f"Processing H-alpha file: {ha_file}")
                with fits.open(ha_file) as hdul:
                    for hdu in hdul:
                        if (hdu.data is None or not hasattr(hdu.data, 'shape') or len(hdu.data.shape) < 2):
                            continue
                        prepared_header = _prepare_jwst_header_for_wcs(hdu.header)
                        wcs = WCS(prepared_header)
                        if not wcs.has_celestial: continue
                        image_data = hdu.data
                        if len(image_data.shape) > 2:
                            image_data = image_data[0] if len(image_data.shape) == 3 else image_data[0, 0]
                        target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                        cutout = Cutout2D(image_data, target_coord, SED_CUTOUT_SIZE_ARCSEC * u.arcsec, wcs=wcs)
                        cutout_data = cutout.data.copy()
                        cutout_data[np.isnan(cutout_data)] = 0
                        cutout_data[np.isinf(cutout_data)] = 0
                        x_norm, _ = transform.transform(ax.transData.transform((SED_HA_WAVELENGTH, 0)))
                        x_norm = max(min(x_norm, 1 - SED_INSET_RIGHT_MARGIN), 0.0); x_norm += SED_HA_X_OFFSET
                        ax_inset = inset_axes(ax, width=SED_INSET_WIDTH, height=SED_INSET_HEIGHT, loc='center',
                                             bbox_to_anchor=(x_norm, SED_HA_Y_POSITION, SED_INSET_BBOX_SIZE, SED_INSET_BBOX_SIZE),
                                             bbox_transform=fig.transFigure)
                        norm_mode = resolve_sed_norm_mode_for_filter('HA', default_group='HA')
                        norm = build_sed_norm(norm_mode, SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE, cutout_data)
                        print(f"Using norm: {norm},filter: {filter_name}")

                        if norm is None:
                            ax_inset.imshow(
                                cutout_data,
                                origin='lower',
                                cmap=SED_CUTOUT_CMAP,
                                vmin=0,
                                vmax=np.percentile(cutout_data, SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE),
                            )
                        else:
                            ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP, norm=norm)
                        region_sky = CircleSkyRegion(center=target_coord, radius=SED_CIRCLE_RADIUS_ARCSEC * u.arcsec)
                        reg = region_sky.to_pixel(cutout.wcs); reg.plot(ax=ax_inset, color=CIRCLE_COLOR, lw=CIRCLE_LINEWIDTH)
                        ax_inset.set_title(SED_HA_TITLE, fontsize=SED_FONTSIZE_TITLE)
                        ax_inset.axis('off')
                        break
            except Exception as e:
                print(f"Error processing HST Ha: {e}")


        # NIRCam RGB
        if len(nircam_cutouts) == 3 and nircam_header is not None:
            try:
                imgs_nircam = np.zeros((nircam_cutouts['red'].shape[1], nircam_cutouts['red'].shape[0], 3))
                imgs_nircam[:, :, 0] = linear(nircam_cutouts['red'], scale_min=np.percentile(nircam_cutouts['red'], SED_RGB_NIRCAM_COMPOSITE_MIN_PERCENTILE), scale_max=np.nanpercentile(nircam_cutouts['red'], SED_RGB_NIRCAM_COMPOSITE_MAX_PERCENTILE))
                imgs_nircam[:, :, 1] = linear(nircam_cutouts['green'], scale_min=np.percentile(nircam_cutouts['green'], SED_RGB_NIRCAM_COMPOSITE_MIN_PERCENTILE), scale_max=np.nanpercentile(nircam_cutouts['green'], SED_RGB_NIRCAM_COMPOSITE_MAX_PERCENTILE))
                imgs_nircam[:, :, 2] = linear(nircam_cutouts['blue'], scale_min=np.percentile(nircam_cutouts['blue'], SED_RGB_NIRCAM_COMPOSITE_MIN_PERCENTILE), scale_max=np.nanpercentile(nircam_cutouts['blue'], SED_RGB_NIRCAM_COMPOSITE_MAX_PERCENTILE))
                
                ax_nircam_rgb = inset_axes(ax, width=SED_RGB_WIDTH, height=SED_RGB_HEIGHT, loc='center',
                                  bbox_to_anchor=(SED_RGB_NIRCAM_X, SED_RGB_NIRCAM_Y, SED_RGB_BBOX_SIZE, SED_RGB_BBOX_SIZE),
                                  bbox_transform=fig.transFigure)
                
                target_coord_sky = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                region_sky_nircam = CircleSkyRegion(center=target_coord_sky, radius=SED_CIRCLE_RADIUS_ARCSEC * u.arcsec)
                reg_nircam = region_sky_nircam.to_pixel(WCS(nircam_header))
                reg_nircam.plot(ax=ax_nircam_rgb, color=CIRCLE_COLOR,lw=CIRCLE_LINEWIDTH)
                
                ax_nircam_rgb.imshow(imgs_nircam, origin='lower')
                ax_nircam_rgb.text(SED_RGB_TEXT_X, SED_RGB_TEXT_Y, SED_RGB_LABEL_NIRCAM, fontsize=SED_FONTSIZE_TITLE, color=SED_RGB_LABEL_COLOR,
                              transform=ax_nircam_rgb.transAxes, 
                              horizontalalignment='right', verticalalignment='bottom')
                ax_nircam_rgb.axis('off')
                print("NIRCam RGB composite created successfully")
            except Exception as e:
                print(f"Error creating NIRCam RGB: {e}")
        
        # MIRI RGB
        if len(miri_cutouts) == 3 and miri_header is not None:
            try:
                imgs_miri = np.zeros((miri_cutouts['red'].shape[1], miri_cutouts['red'].shape[0], 3))
                imgs_miri[:, :, 0] = linear(miri_cutouts['red'], scale_min=np.percentile(miri_cutouts['red'], SED_RGB_MIRI_COMPOSITE_MIN_PERCENTILE), scale_max=np.percentile(miri_cutouts['red'], SED_RGB_MIRI_COMPOSITE_MAX_PERCENTILE))
                imgs_miri[:, :, 1] = linear(miri_cutouts['green'], scale_min=np.percentile(miri_cutouts['green'], SED_RGB_MIRI_COMPOSITE_MIN_PERCENTILE), scale_max=np.percentile(miri_cutouts['green'], SED_RGB_MIRI_COMPOSITE_MAX_PERCENTILE))
                imgs_miri[:, :, 2] = linear(miri_cutouts['blue'], scale_min=np.percentile(miri_cutouts['blue'], SED_RGB_MIRI_COMPOSITE_MIN_PERCENTILE), scale_max=np.percentile(miri_cutouts['blue'], SED_RGB_MIRI_COMPOSITE_MAX_PERCENTILE))
                
                ax_miri_rgb = inset_axes(ax, width=SED_RGB_WIDTH, height=SED_RGB_HEIGHT, loc='center',
                                  bbox_to_anchor=(SED_RGB_MIRI_X, SED_RGB_MIRI_Y, SED_RGB_BBOX_SIZE, SED_RGB_BBOX_SIZE),
                                  bbox_transform=fig.transFigure)
                
                target_coord_sky = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                region_sky_miri = CircleSkyRegion(center=target_coord_sky, radius=SED_CIRCLE_RADIUS_ARCSEC * u.arcsec)
                reg_miri = region_sky_miri.to_pixel(WCS(miri_header))
                reg_miri.plot(ax=ax_miri_rgb, color=CIRCLE_COLOR,lw=CIRCLE_LINEWIDTH)
                
                ax_miri_rgb.imshow(imgs_miri, origin='lower')
                ax_miri_rgb.text(SED_RGB_TEXT_X_ALT, SED_RGB_TEXT_Y, SED_RGB_LABEL_MIRI, fontsize=SED_FONTSIZE_TITLE, color=SED_RGB_LABEL_COLOR,
                              transform=ax_miri_rgb.transAxes, 
                              horizontalalignment='right', verticalalignment='bottom')
                ax_miri_rgb.axis('off')
                
                # Add CO contours if available
                if len(rgbsss) > 0:
                    try:
                        smoothed_data_co = rgbsss[0]
                        smoothed_data_co[np.isnan(smoothed_data_co)] = 0
                        p50_co = np.percentile(smoothed_data_co, SED_CO_CONTOUR_LOW_LEVEL_PERCENTILE)
                        p60_co = np.percentile(smoothed_data_co, SED_CO_CONTOUR_MID_LEVEL_PERCENTILE)
                        p75_co = np.percentile(smoothed_data_co, SED_CO_CONTOUR_HIGH_LEVEL_PERCENTILE)
                        contour_levels_co = [p50_co, p60_co, p75_co]
                        ax_miri_rgb.contour(smoothed_data_co, levels=contour_levels_co, colors='white', 
                                          linewidths=SED_CONTOUR_LINEWIDTH, alpha=SED_CONTOUR_ALPHA)
                    except Exception as e:
                        print(f"Error adding CO contours: {e}")
                print("MIRI RGB composite created successfully")
            except Exception as e:
                print(f"Error creating MIRI RGB: {e}")
        
        # HST RGB
        if len(hst_cutouts) == 3 and hst_header is not None:
            try:
                imgs_hst = np.zeros((hst_cutouts['red'].shape[1], hst_cutouts['red'].shape[0], 3))
                imgs_hst[:, :, 0] = linear(hst_cutouts['red'], scale_min=np.percentile(hst_cutouts['red'], SED_RGB_HST_COMPOSITE_MIN_PERCENTILE), scale_max=np.percentile(hst_cutouts['red'], SED_RGB_HST_COMPOSITE_MAX_PERCENTILE))
                imgs_hst[:, :, 1] = linear(hst_cutouts['green'], scale_min=np.percentile(hst_cutouts['green'], SED_RGB_HST_COMPOSITE_MIN_PERCENTILE), scale_max=np.percentile(hst_cutouts['green'], SED_RGB_HST_COMPOSITE_MAX_PERCENTILE))
                imgs_hst[:, :, 2] = linear(hst_cutouts['blue'], scale_min=np.percentile(hst_cutouts['blue'], SED_RGB_HST_COMPOSITE_MIN_PERCENTILE), scale_max=np.percentile(hst_cutouts['blue'], SED_RGB_HST_COMPOSITE_MAX_PERCENTILE))
                
                ax_hst_rgb = inset_axes(ax, width=SED_RGB_WIDTH, height=SED_RGB_HEIGHT, loc='center',
                                  bbox_to_anchor=(SED_RGB_HST_X, SED_RGB_HST_Y, SED_RGB_BBOX_SIZE, SED_RGB_BBOX_SIZE),
                                  bbox_transform=fig.transFigure)
                
                target_coord_sky = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                region_sky_hst = CircleSkyRegion(center=target_coord_sky, radius=SED_CIRCLE_RADIUS_ARCSEC * u.arcsec)
                reg_hst = region_sky_hst.to_pixel(WCS(hst_header))
                reg_hst.plot(ax=ax_hst_rgb, color=CIRCLE_COLOR,lw=CIRCLE_LINEWIDTH)
                
                ax_hst_rgb.imshow(imgs_hst, origin='lower')
                ax_hst_rgb.text(SED_RGB_TEXT_X_ALT, SED_RGB_TEXT_Y, SED_RGB_LABEL_HST, fontsize=SED_FONTSIZE_TITLE, color=SED_RGB_LABEL_COLOR,
                              transform=ax_hst_rgb.transAxes, 
                              horizontalalignment='right', verticalalignment='bottom')
                ax_hst_rgb.axis('off')
                
                # Add HST HA contours if available
                if len(rgbsss2) > 0:
                    try:
                        from scipy.ndimage import gaussian_filter
                        smoothed_data_ha = gaussian_filter(rgbsss2[0], SED_GAUSSIAN_FILTER_SIGMA)
                        smoothed_data_ha[np.isnan(smoothed_data_ha)] = 0
                        p50_ha = np.percentile(smoothed_data_ha, SED_CO_CONTOUR_LOW_LEVEL_PERCENTILE)
                        p60_ha = np.percentile(smoothed_data_ha, SED_CO_CONTOUR_MID_LEVEL_PERCENTILE)
                        p75_ha = np.percentile(smoothed_data_ha, SED_HA_CONTOUR_HIGH_LEVEL_PERCENTILE)
                        contour_levels_ha = [p50_ha, p60_ha, p75_ha]
                        ax_hst_rgb.contour(smoothed_data_ha, levels=contour_levels_ha, colors='white', 
                                         linewidths=SED_CONTOUR_LINEWIDTH, alpha=SED_CONTOUR_ALPHA)
                    except Exception as e:
                        print(f"Error adding HST HA contours: {e}")
                print("HST RGB composite created successfully")
            except Exception as e:
                print(f"Error creating HST RGB: {e}")
        # 9) Save
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=UserWarning,
                                        message="This figure includes Axes that are not compatible with tight_layout")
                plt.tight_layout()
        except Exception as e_layout:
            print(f"Error during plt.tight_layout(): {e_layout}")

        filename = SED_FILENAME_TEMPLATE.format(ra=ra, dec=dec)
        image_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), IMAGE_DIR)
        os.makedirs(image_dir, exist_ok=True)
        filepath = os.path.join(image_dir, filename)
        fig.savefig(filepath, format='png', dpi=SED_DPI, bbox_inches=SED_SAVEFIG_BBOX_INCHES)
        plt.close(fig)

        if os.path.exists(filepath):
            print(f"SED file created successfully: {filepath} (size: {os.path.getsize(filepath)} bytes)")
        else:
            print(f"ERROR: SED file was not created at {filepath}")

        return JSONResponse(status_code=200, content={"message": "SED saved successfully", "url": f"/{IMAGE_DIR}/{filename}", "filename": filename})

    except Exception as e:
        import traceback
        print(f"Error saving SED: {e}")
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": f"Failed to save SED: {str(e)}"})
@app.get("/source-properties/")
async def source_properties(
    request: Request,
    ra: float,
    dec: float,
    catalog_name: str,
    ra_col: Optional[str] = Query(None, description="Override RA column name"),
    dec_col: Optional[str] = Query(None, description="Override DEC column name"),
    size_col: Optional[str] = Query(None, description="Optional size/radius column name (unused here)")
):
    """Per-session source properties; uses session-scoped catalog cache."""
    session = getattr(request.state, "session", None)
    if session is None:
        return JSONResponse(status_code=401, content={"error": "Missing session"})
    session_data = session.data

    try:
        session_catalogs = session_data.setdefault("loaded_catalogs", {})
        catalog_table = session_catalogs.get(catalog_name)
        if catalog_table is None:
            print(f"Catalog '{catalog_name}' not in session cache. Attempting to load as Astropy Table.")
            base_dir = Path(".").resolve()
            candidates = [
                (base_dir, base_dir / catalog_name),
                (base_dir / CATALOGS_DIRECTORY, base_dir / CATALOGS_DIRECTORY / catalog_name),
                (base_dir / UPLOADS_DIRECTORY, base_dir / UPLOADS_DIRECTORY / catalog_name),
                (base_dir / FILES_DIRECTORY, base_dir / FILES_DIRECTORY / catalog_name),
            ]
            found_dir = None
            for parent_dir, fullp in candidates:
                try:
                    if fullp.is_file():
                        found_dir = parent_dir
                        break
                except Exception:
                    continue
            probe_dir = found_dir if found_dir is not None else Path(CATALOGS_DIRECTORY)
            catalog_table = get_astropy_table_from_catalog(catalog_name, Path(probe_dir))
            if catalog_table is None:
                return JSONResponse(status_code=404, content={"error": f"Failed to load catalog '{catalog_name}' as Astropy Table."})
            session_catalogs[catalog_name] = catalog_table
            print(f"Cached Astropy Table for '{catalog_name}' in session.")

        available_cols_lower = {col.lower(): col for col in catalog_table.colnames}

        # Prefer explicit overrides from query params when valid
        ra_col_name = available_cols_lower.get((ra_col or '').lower()) if ra_col else None
        dec_col_name = available_cols_lower.get((dec_col or '').lower()) if dec_col else None

        # Fallback to default candidate lists
        if not ra_col_name:
            ra_col_name = next((available_cols_lower[name.lower()] for name in RA_COLUMN_NAMES if name.lower() in available_cols_lower), None)
        if not dec_col_name:
            dec_col_name = next((available_cols_lower[name.lower()] for name in DEC_COLUMN_NAMES if name.lower() in available_cols_lower), None)

        # Final fallback for known PHANGS naming
        if not ra_col_name:
            ra_col_name = available_cols_lower.get('phangs_ra')
        if not dec_col_name:
            dec_col_name = available_cols_lower.get('phangs_dec')

        if not ra_col_name or not dec_col_name:
            print(f"[source-properties] Could not resolve RA/DEC columns. Requested: ra_col={ra_col}, dec_col={dec_col}. Available: {list(catalog_table.colnames)[:10]} ...")
            return JSONResponse(status_code=400, content={"error": f"Could not find RA/DEC columns in catalog '{catalog_name}'."})

        # Robust RA/DEC normalization to degrees (supports sexagesimal strings, astropy quantities, radians, hours)
        def _parse_sexagesimal(s: str, is_ra: bool) -> float:
            try:
                import re
                txt = str(s).strip().lower()
                nums = re.findall(r'[+-]?\d+(?:\.\d+)?', txt)
                if not nums:
                    return float('nan')
                a0 = float(nums[0])
                a1 = float(nums[1]) if len(nums) > 1 else 0.0
                a2 = float(nums[2]) if len(nums) > 2 else 0.0
                sign = -1.0 if a0 < 0 else 1.0
                a0 = abs(a0)
                val = a0 + a1/60.0 + a2/3600.0
                if is_ra:
                    return sign * val * 15.0
                return sign * val
            except Exception:
                return float('nan')

        def _normalize_coord_value(val, is_ra: bool, col_name: str | None = None) -> float:
            try:
                # Astropy Quantity with angle units
                try:
                    from astropy import units as u
                    if hasattr(val, 'unit') and getattr(val, 'unit') is not None:
                        q = val
                        try:
                            return float(q.to(u.deg).value)
                        except Exception:
                            try:
                                return float((q.to(u.hourangle)).to(u.deg).value)
                            except Exception:
                                pass
                except Exception:
                    pass

                # Strings (sexagesimal or numeric)
                if isinstance(val, str):
                    out = _parse_sexagesimal(val, is_ra)
                    if np.isfinite(out):
                        return out
                    try:
                        v = float(val)
                    except Exception:
                        return float('nan')
                    val = v

                # numpy scalar -> python
                if hasattr(val, 'item'):
                    val = val.item()

                if isinstance(val, (int, float, np.number)):
                    v = float(val)
                    if not np.isfinite(v):
                        return float('nan')
                    # radians
                    if abs(v) <= (2*np.pi + 1e-6):
                        return v * (180.0/np.pi)
                    # hours for RA
                    if is_ra:
                        name = (col_name or '').lower()
                        if ('hms' in name) or ('hour' in name) or (0.0 <= v <= 24.0):
                            return v * 15.0
                    return v
            except Exception:
                return float('nan')
            return float('nan')

        # Build or reuse a fast spatial index (KD-Tree on unit sphere) stored in session
        try:
            spatial_index = session_data.setdefault("catalog_spatial_index", {})
            idx_entry = spatial_index.get(catalog_name)
            need_rebuild = True
            if idx_entry is not None:
                # Reuse only if based on the same RA/DEC columns and table length matches
                if (
                    idx_entry.get("ra_col") == ra_col_name
                    and idx_entry.get("dec_col") == dec_col_name
                    and int(idx_entry.get("n_rows", -1)) == int(len(catalog_table))
                ):
                    need_rebuild = False

            if need_rebuild:
                # Normalize columns to degrees (vectorized)
                try:
                    ra_col_data = catalog_table[ra_col_name]
                    dec_col_data = catalog_table[dec_col_name]
                    table_ra_values = np.array([_normalize_coord_value(v, True, ra_col_name) for v in ra_col_data], dtype=float)
                    table_dec_values = np.array([_normalize_coord_value(v, False, dec_col_name) for v in dec_col_data], dtype=float)
                except Exception as e_norm:
                    return JSONResponse(status_code=500, content={"error": f"Error processing RA/DEC columns for '{catalog_name}': {str(e_norm)}"})

                if not (np.isfinite(table_ra_values).any() and np.isfinite(table_dec_values).any()):
                    return JSONResponse(status_code=400, content={"error": f"Catalog '{catalog_name}' RA/DEC columns could not be parsed to degrees."})

                # Build unit vectors for KDTree
                ra_rad = np.radians(table_ra_values)
                dec_rad = np.radians(table_dec_values)
                cosd = np.cos(dec_rad)
                unit_xyz = np.column_stack((cosd * np.cos(ra_rad), cosd * np.sin(ra_rad), np.sin(dec_rad)))

                try:
                    from scipy.spatial import cKDTree  # local import to avoid top-level dependency
                    tree = cKDTree(unit_xyz)
                except Exception:
                    tree = None

                idx_entry = {
                    "ra_col": ra_col_name,
                    "dec_col": dec_col_name,
                    "n_rows": int(len(catalog_table)),
                    "ra_deg": table_ra_values,
                    "dec_deg": table_dec_values,
                    "unit_xyz": unit_xyz,
                    "tree": tree,
                }
                spatial_index[catalog_name] = idx_entry

            # Query nearest neighbor
            q_ra_deg = float(ra)
            q_dec_deg = float(dec)
            q_ra_rad = np.radians(q_ra_deg)
            q_dec_rad = np.radians(q_dec_deg)
            q_vec = np.array([
                np.cos(q_dec_rad) * np.cos(q_ra_rad),
                np.cos(q_dec_rad) * np.sin(q_ra_rad),
                np.sin(q_dec_rad),
            ])

            closest_idx = None
            min_sep_deg = None
            if idx_entry.get("tree") is not None:
                # KDTree in 3D Euclidean; distance relates to angular separation: d = sqrt(2(1-cos theta))
                d_euclid, i_nn = idx_entry["tree"].query(q_vec, k=1)
                # Compute accurate angle via dot product
                try:
                    dot = float(np.clip(np.dot(q_vec, idx_entry["unit_xyz"][int(i_nn)]), -1.0, 1.0))
                    theta_rad = float(np.arccos(dot))
                except Exception:
                    theta_rad = float(2.0)  # large
                closest_idx = int(i_nn)
                min_sep_deg = float(np.degrees(theta_rad))
            else:
                # Fallback: vectorized great-circle approx in degrees
                table_ra_values = idx_entry["ra_deg"]
                table_dec_values = idx_entry["dec_deg"]
                ra_diff = np.abs(table_ra_values - q_ra_deg)
                ra_diff = np.where(ra_diff > 180.0, 360.0 - ra_diff, ra_diff)
                dec_diff = np.abs(table_dec_values - q_dec_deg)
                distances = np.sqrt((ra_diff * np.cos(np.radians(q_dec_deg)))**2 + dec_diff**2)
                if distances.size == 0:
                    return JSONResponse(status_code=404, content={"error": f"No data in catalog '{catalog_name}'."})
                closest_idx = int(np.argmin(distances))
                min_sep_deg = float(distances[closest_idx])

            # Threshold in degrees
            if min_sep_deg is None:
                return JSONResponse(status_code=404, content={"error": f"No object within threshold near RA={ra}, Dec={dec}."})
            if min_sep_deg > float(SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC) / 3600.0:
                return JSONResponse(status_code=404, content={"error": f"No object within threshold near RA={ra}, Dec={dec}."})
        except Exception as e_idx:
            return JSONResponse(status_code=500, content={"error": f"Index/query error: {str(e_idx)}"})

        closest_obj_row = catalog_table[closest_idx]
        obj_dict = {}
        for col_name in catalog_table.colnames:
            value = closest_obj_row[col_name]
            processed_value = None
            if isinstance(value, u.Quantity):
                num_val = value.value
                if hasattr(num_val, 'item'):
                    processed_value = num_val.item()
                else:
                    processed_value = num_val
                if isinstance(processed_value, float) and (np.isnan(processed_value) or np.isinf(processed_value)):
                    processed_value = None
            elif isinstance(value, Time):
                try:
                    processed_value = value.isot
                except Exception:
                    processed_value = str(value)
            elif isinstance(value, SkyCoord):
                try:
                    processed_value = f"RA:{value.ra.deg:.6f}, Dec:{value.dec.deg:.6f}"
                except Exception:
                    processed_value = str(value)
            elif isinstance(value, (np.floating, np.integer, np.complexfloating)):
                processed_value = None if (np.isnan(value) or np.isinf(value)) else value.item()
            elif isinstance(value, np.bool_):
                processed_value = value.item()
            elif isinstance(value, np.ndarray):
                if value.dtype.kind in 'fc':
                    temp_list = []
                    for x in value.flat:
                        if np.isnan(x) or np.isinf(x):
                            temp_list.append(None)
                        elif hasattr(x, 'item'):
                            temp_list.append(x.item())
                        else:
                            temp_list.append(x)
                    processed_value = temp_list
                elif value.dtype.kind in ('S', 'U'):
                    processed_value = [item.decode('utf-8', 'replace') if isinstance(item, bytes) else str(item) for item in value.tolist()]
                else:
                    processed_value = value.tolist()
            elif isinstance(value, bytes):
                try:
                    processed_value = value.decode('utf-8', errors='replace')
                except Exception:
                    processed_value = str(value)
            elif isinstance(value, float):
                processed_value = None if (np.isnan(value) or np.isinf(value)) else value
            elif isinstance(value, (str, int, bool, list, dict)) or value is None:
                processed_value = value
            else:
                try:
                    processed_value = str(value)
                except Exception as e_str_conv:
                    processed_value = f"Error converting value: {e_str_conv}"
            obj_dict[col_name] = processed_value

        return JSONResponse(status_code=200, content={"properties": obj_dict})
    except Exception as e:
      return JSONResponse(status_code=500, content={"error": f"Failed to get source properties: {str(e)}"})

@app.post("/upload-fits/")
async def upload_fits_file(file: UploadFile = File(...)):
    """Upload a FITS file to the server."""
    try:
        # Create the 'uploads' directory if it doesn't exist
        uploads_dir = Path(UPLOADS_DIRECTORY)
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
            # No extension; append timestamp and default to .fits
            safe_filename = f"{safe_filename}_{timestamp}.fits"
        
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
import xml.etree.ElementTree as ET
import certifi
from fastapi.responses import Response


import requests
from fastapi import Request, Response, HTTPException
from urllib.parse import quote_plus
from urllib.parse import urlparse, unquote
from starlette.responses import StreamingResponse

# Make sure to import 'requests' and other necessary modules at the top of main.py

@app.get("/proxy-download/")
async def proxy_download(url: str):
    """
    More robust proxy that handles redirects and content types for general file downloads.
    This version uses the `requests` library for simplicity and robustness.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://ned.ipac.caltech.edu/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }

    try:
        # Use a synchronous request which is simpler and fine for this proxy endpoint
        response = requests.get(url, headers=headers, timeout=PROXY_DOWNLOAD_TIMEOUT, allow_redirects=True, verify=False, stream=True)
        response.raise_for_status()

        # Get content length for progress tracking
        content_length = response.headers.get('Content-Length')
        headers = {'Content-Length': content_length} if content_length else {}
        
        # For HTML content from NED, it must be returned as plain text for the frontend parser
        media_type = response.headers.get('Content-Type', 'application/octet-stream')
        if 'text/html' in media_type:
            # Not streamed as we need to parse it on the frontend
            return Response(content=response.content, media_type="text/plain")

        # For FITS or other files, stream the response
        # Try to provide a sensible filename with .fits extension when missing
        try:
            disp = response.headers.get('Content-Disposition', '')
            filename = None
            if 'filename=' in disp:
                # naive parse
                parts = disp.split('filename=')
                if len(parts) > 1:
                    filename = parts[1].strip('"; ')
            if not filename:
                parsed = urlparse(url)
                path_name = os.path.basename(unquote(parsed.path)) or 'download'
                filename = path_name
            # If no extension and looks like FITS, add .fits
            if '.' not in os.path.basename(filename).split('/')[-1]:
                if ('fits' in (media_type or '').lower()) or ('fits' in url.lower()):
                    filename = filename + '.fits'
            headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        except Exception:
            pass

        return StreamingResponse(response.iter_content(chunk_size=4096), media_type=media_type, headers=headers)

    except requests.exceptions.HTTPError as e:
        logger.error(f"Proxy Download HTTP Error for {url}: {e.response.status_code}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Failed to download from external URL. The server responded with status {e.response.status_code}.")
    except requests.exceptions.RequestException as e:
        logger.error(f"Proxy Download RequestException for {url}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download from external URL due to a network error: {e}")
    except Exception as e:
        logger.error(f"An unexpected error occurred in the proxy download for {url}: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred in the proxy download service.")


# --- Uploads Auto Clean Worker ---
_CLEANER_LAST_RUN_TS: float | None = None
_CLEANER_LAST_SLEEP_SEC: float | None = None
_CLEANER_LAST_PATH: str | None = None

def _resolve_uploads_dir() -> Path:
    base_dir = Path(__file__).parent.resolve()
    return (base_dir / UPLOADS_DIRECTORY).resolve() if not Path(UPLOADS_DIRECTORY).is_absolute() else Path(UPLOADS_DIRECTORY)

def _clean_uploads_dir_once() -> dict:
    global _CLEANER_LAST_RUN_TS, _CLEANER_LAST_PATH
    uploads_dir = _resolve_uploads_dir()
    cleaned = 0
    errors = 0
    if uploads_dir.exists() and uploads_dir.is_dir():
        for p in uploads_dir.iterdir():
            try:
                if p.is_file() or p.is_symlink():
                    p.unlink()
                elif p.is_dir():
                    shutil.rmtree(p)
                cleaned += 1
            except Exception:
                errors += 1
                continue
    _CLEANER_LAST_RUN_TS = time.time()
    _CLEANER_LAST_PATH = str(uploads_dir)
    return {"path": str(uploads_dir), "cleaned": cleaned, "errors": errors}

async def uploads_auto_clean_worker():
    """Periodically cleans files in UPLOADS_DIRECTORY if enabled by settings."""
    try:
        while True:
            try:
                # Use module-level constants (do not override from profiles)
                current_enable = bool(UPLOADS_AUTO_CLEAN_ENABLE)
                current_minutes = float(UPLOADS_AUTO_CLEAN_INTERVAL_MINUTES)

                # Compute sleep period first (supports fractional minutes); min 1 second
                period_sec = float(current_minutes) * 60.0
                sleep_for = period_sec

                # Perform clean if enabled
                if current_enable:
                    outcome = _clean_uploads_dir_once()
                    print(f"[uploads_auto_clean] cleaned: {outcome['path']} (removed={outcome['cleaned']}, errors={outcome['errors']})")
                # Debug log each cycle
                try:
                    print(f"[uploads_auto_clean] sleeping for {sleep_for:.1f}s (enable={current_enable})")
                    global _CLEANER_LAST_SLEEP_SEC
                    _CLEANER_LAST_SLEEP_SEC = sleep_for
                except Exception:
                    pass
                await asyncio.sleep(sleep_for)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[uploads_auto_clean] error: {e}")
                # Backoff a bit on error to avoid tight loops
                await asyncio.sleep(60)
    except Exception as outer_e:
        print(f"[uploads_auto_clean] worker exited: {outer_e}")

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
                    # Provide Content-Disposition with .fits when missing
                    try:
                        parsed = urlparse(url)
                        path_name = os.path.basename(unquote(parsed.path)) or 'download'
                        filename = path_name
                        if '.' not in os.path.basename(filename).split('/')[-1]:
                            filename = filename + '.fits'
                        return Response(content=content, media_type=content_type, headers={
                            'Content-Disposition': f'attachment; filename="{filename}"'
                        })
                    except Exception:
                        return Response(content=content, media_type=content_type)
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


# ================================
# MAST helper endpoints
# ================================

@app.get("/mast/resolve")
async def mast_resolve(name: str):
    """Deprecated: Use /mast/search with objectname instead. """
    raise HTTPException(status_code=410, detail="/mast/resolve is deprecated; call /mast/search with objectname and radius")


@app.get("/mast/search")
async def mast_search(
    ra: float = Query(None),
    dec: float = Query(None),
    objectname: str | None = Query(None, description="Optional target name to resolve via astroquery"),
    radius: float = Query(0.05, description="Search radius in degrees"),
    pagesize: int = Query(10, ge=1, le=2000, description="Page size for results"),
    page: int = Query(1, ge=1),
    mission: str | None = Query(None, description="Optional mission filter; defaults to JWST"),
    min_calib_level: int = Query(2, ge=0, description="Minimum calibration level"),
    dp_types: str = Query("image,cube", description="Comma-separated dataproduct types to include")
):
    """Search MAST CAOM observations using astroquery only (no direct MAST API)."""
    try:
        if not _ASTROQUERY_AVAILABLE:
            return JSONResponse(status_code=500, content={"error": "astroquery not available"})
        # Normalize mission (empty string means all missions; UI can choose defaults)
        mission_norm = (mission or '').strip().upper()

        # If objectname provided, prefer that and ignore ra/dec; clamp radius by mission to avoid heavy queries
        if objectname and isinstance(objectname, str):
            eff_radius = radius
            if mission_norm == 'JWST':
                eff_radius = min(radius, 0.1)
            elif mission_norm == 'HST':
                eff_radius = min(radius, 0.05)
            else:
                eff_radius = min(radius, 0.2)
            coords_arg = {'objectname': objectname.strip(), 'radius': f"{eff_radius} deg"}
        else:
            # Require coordinates
            if ra is None or dec is None:
                return JSONResponse(status_code=400, content={"error": "Either objectname or (ra, dec) must be provided"})
            eff_radius = radius
            if mission_norm == 'JWST':
                eff_radius = min(radius, 0.1)
            elif mission_norm == 'HST':
                eff_radius = min(radius, 0.05)
            else:
                eff_radius = min(radius, 0.2)
            coords_arg = {'coordinates': f"{ra} {dec}", 'radius': f"{eff_radius} deg"}

        # Limit rows server-side for faster responses
        fetch_limit = max(int(pagesize) * int(page), 1)
        try:
            Observations.ROW_LIMIT = fetch_limit  # type: ignore[attr-defined]
        except Exception:
            pass
        try:
            Observations.TIMEOUT = 20  # type: ignore[attr-defined]
        except Exception:
            pass

        # Cache wrapper to avoid repeated remote calls for same key
        @lru_cache(maxsize=256)
        def _astroquery_search_cached(key: tuple) -> list[dict]:
            coords_key, rad_k, limit_k, mission_k, min_cl_k, dpt_k = key
            dp_list_local = [s.strip().lower() for s in (dpt_k or '').split(',') if s.strip()]
            criteria_local: dict[str, object] = {
                'intentType': 'science',
            }
            # Inject either coordinates or objectname path
            if isinstance(coords_key, tuple) and coords_key and coords_key[0] == 'obj':
                criteria_local['objectname'] = coords_key[1]
                criteria_local['radius'] = f"{rad_k} deg"
            else:
                criteria_local['coordinates'] = coords_key
                criteria_local['radius'] = f"{rad_k} deg"
            if dp_list_local:
                criteria_local['dataproduct_type'] = dp_list_local
            try:
                min_cl_int = int(min_cl_k)
                if min_cl_int > 0:
                    # Exact level filter for any selected level (1..4)
                    criteria_local['calib_level'] = [min_cl_int]
            except Exception:
                pass
            if mission_k:
                criteria_local['obs_collection'] = [mission_k]
            # Single call only (no extra count or fallback queries)
            table_local = Observations.query_criteria(**criteria_local)

            wanted_cols_local = [
                'obsid', 'obs_collection', 'instrument_name', 'target_name',
                's_ra', 's_dec', 't_exptime', 'proposal_pi', 'calib_level', 'dataproduct_type',
                'filters', 'proposal_id'
            ]
            rows: list[dict] = []
            for r in table_local:
                row = {}
                for c in wanted_cols_local:
                    val = r[c] if c in r.colnames else None
                    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
                        val = None
                    row[c] = val.item() if hasattr(val, 'item') else val
                rows.append(row)
            # Trim to requested limit (ROW_LIMIT should already limit, this is extra safety)
            return rows[:limit_k]

        if objectname and isinstance(objectname, str):
            coords_key = ('obj', objectname.strip())
        else:
            coords_key = f"{round(ra, 6)} {round(dec, 6)}"
        cache_key = (
            coords_key, round(radius, 4), int(fetch_limit),
            mission_norm, int(min_calib_level), (dp_types or '')
        )
        all_rows = _astroquery_search_cached(cache_key)
        start_idx = (int(page) - 1) * int(pagesize)
        end_idx = start_idx + int(pagesize)
        out_rows = all_rows[start_idx:end_idx]
        return JSONResponse(content={"data": out_rows})

    except Exception as e:
        return JSONResponse(status_code=502, content={"error": "MAST search error", "detail": str(e)})


@app.get("/mast/products")
async def mast_products(obsid: int = Query(..., description="Observation ID")):
    """Get product list for a MAST observation ID using astroquery only."""
    try:
        if not _ASTROQUERY_AVAILABLE:
            return JSONResponse(status_code=500, content={"error": "astroquery not available"})

        # Limit products retrieval time
        try:
            Observations.TIMEOUT = 45  # type: ignore[attr-defined]
        except Exception:
            pass
        # Pass obsid as string per astroquery docs to avoid dtype issues
        products_table = Observations.get_product_list(str(obsid))
        filtered_rows: list[dict] = []
        for r in products_table:
            product_type = r.get('productType')
            data_uri = r.get('dataURI')
            calib = r.get('calib_level') or 0
            dpt = r.get('dataproduct_type')
            if product_type != 'SCIENCE':
                continue
            try:
                if int(calib) < 2:
                    continue
            except Exception:
                continue
            if dpt not in ('image', 'cube'):
                continue
            if isinstance(data_uri, str) and 'fitscut.cgi' in data_uri:
                continue
            row = {k: (v.item() if hasattr(v, 'item') else v) for k, v in zip(products_table.colnames, r)}
            filtered_rows.append(row)

        try:
            filtered_rows.sort(key=lambda p: p.get('calib_level', 0), reverse=True)
        except Exception:
            pass
        # Cap to 12 items for speed
        return JSONResponse(content={"data": filtered_rows[:12]})
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": "MAST products error", "detail": str(e)})


@app.get("/mast/download")
async def mast_download(uri: str = Query(..., description="MAST dataURI or direct URL")):
    """Download a MAST product using astroquery for mast: URIs; otherwise proxy the URL."""
    try:
        if uri.startswith("mast:"):
            # Stream directly from MAST so the client sees progress immediately
            try:
                mast_url = f"https://mast.stsci.edu/api/v0.1/Download/file?uri={quote_plus(uri)}"
                hdrs = {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': '*/*'
                }
                upstream = requests.get(mast_url, headers=hdrs, timeout=PROXY_DOWNLOAD_TIMEOUT, allow_redirects=True, verify=False, stream=True)
                upstream.raise_for_status()

                media_type = upstream.headers.get('Content-Type', 'application/octet-stream')
                headers: dict[str, str] = {}
                # Prefer upstream filename if provided
                disp = upstream.headers.get('Content-Disposition')
                if disp:
                    headers['Content-Disposition'] = disp
                else:
                    base_name = os.path.basename(uri.split('/')[-1]) or 'download.fits'
                    headers['Content-Disposition'] = f'attachment; filename="{base_name}"'
                cl = upstream.headers.get('Content-Length')
                if cl:
                    headers['Content-Length'] = cl

                return StreamingResponse(upstream.iter_content(chunk_size=4096), media_type=media_type, headers=headers)
            except requests.exceptions.HTTPError as e:
                raise HTTPException(status_code=e.response.status_code, detail=f"MAST download failed with HTTP {e.response.status_code}")
            except Exception as e:
                # Fallback to astroquery if direct stream fails and astroquery is available
                if not _ASTROQUERY_AVAILABLE:
                    raise HTTPException(status_code=502, detail=f"MAST streaming error: {e}")
                tmp_dir = tempfile.mkdtemp()
                base_name = os.path.basename(uri.split('/')[-1]) or 'download.fits'
                status, _, _ = Observations.download_file(uri, local_path=tmp_dir)
                if str(status).upper() != 'COMPLETE':
                    raise HTTPException(status_code=502, detail=f"MAST download failed: {status}")
                candidate = os.path.join(tmp_dir, base_name)
                if not os.path.exists(candidate):
                    entries = [p for p in os.listdir(tmp_dir) if os.path.isfile(os.path.join(tmp_dir, p))]
                    if not entries:
                        raise HTTPException(status_code=502, detail="MAST download error: file not found after download")
                    base_name = entries[0]
                    candidate = os.path.join(tmp_dir, base_name)
                media_type = 'application/fits' if base_name.lower().endswith(('.fits', '.fit', '.fts')) else 'application/octet-stream'
                headers = {'Content-Disposition': f'attachment; filename="{base_name}"'}
                try:
                    headers['Content-Length'] = str(os.path.getsize(candidate))
                except Exception:
                    pass
                def file_iter_and_cleanup():
                    try:
                        with open(candidate, 'rb') as f:
                            while True:
                                chunk = f.read(4096)
                                if not chunk:
                                    break
                                yield chunk
                    finally:
                        try:
                            os.remove(candidate)
                        except Exception:
                            pass
                        try:
                            os.rmdir(tmp_dir)
                        except Exception:
                            pass
                return StreamingResponse(file_iter_and_cleanup(), media_type=media_type, headers=headers)
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"MAST download error: {e}")
        else:
            headers = {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*'
            }
            resp = requests.get(uri, headers=headers, timeout=PROXY_DOWNLOAD_TIMEOUT, allow_redirects=True, verify=False, stream=True)
            resp.raise_for_status()
            media_type = resp.headers.get('Content-Type', 'application/octet-stream')
            return StreamingResponse(resp.iter_content(chunk_size=4096), media_type=media_type)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": "MAST download error", "detail": str(e)})


import numpy as np
import requests
from urllib.parse import quote_plus
import aiohttp
import ssl
import certifi
import re
import requests
from urllib.parse import quote_plus


# Try to use astroquery for faster and more reliable MAST mission filtering
try:
    from astroquery.mast import Observations  # type: ignore
    from astropy.coordinates import SkyCoord  # type: ignore
    import astropy.units as u  # type: ignore
    _ASTROQUERY_AVAILABLE = True
except Exception:
    _ASTROQUERY_AVAILABLE = False



import numpy as np
import io
import base64
import threading
import queue
from PIL import Image
import multiprocessing as mp
from functools import partial, lru_cache
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor
# =============================================================================
# OLD FitsTileGenerator CLASS COMPLETELY REMOVED
# =============================================================================
# The original complex FitsTileGenerator class has been completely removed
# because it was causing 'cannot pickle _thread.lock object' errors.
# It has been replaced with SimpleTileGenerator (defined at end of file).
# =============================================================================
@app.post("/request-tiles/")
async def request_tiles(request: Request):
    """Request prefetching of tiles for a specific region (session-scoped)."""
    session = getattr(request.state, "session", None)
    if session is None:
        return JSONResponse(status_code=401, content={"error": "Missing session"})
    session_data = session.data

    try:
        data = await request.json()
        level = data.get("level")
        center_x = data.get("centerX")
        center_y = data.get("centerY")
        radius = data.get("radius", 2)
        
        if level is None or center_x is None or center_y is None:
            return JSONResponse(status_code=400, content={"error": "Missing required parameters"})
        
        fits_file = session_data.get("current_fits_file")
        if not fits_file:
            return JSONResponse(status_code=400, content={"error": "No FITS file currently loaded"})

        hdu_index = int(session_data.get("current_hdu_index", 0))
        file_id = f"{os.path.basename(fits_file)}:{hdu_index}"

        session_generators = session_data.setdefault("active_tile_generators", {})
        tile_generator = session_generators.get(file_id)
        if tile_generator is None:
            return JSONResponse(status_code=400, content={"error": "Tile generator not initialized for this session"})

        tile_generator.request_tiles(level, center_x, center_y, radius)
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to request tiles: {str(e)}"})
@app.get("/fits-tile-info/")
async def get_fits_tile_information(request: Request):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    fits_file = session_data.get("current_fits_file")
    hdu_index = int(session_data.get("current_hdu_index", 0))

    if not fits_file:
        raise HTTPException(status_code=400, detail="No FITS file currently loaded.")

    file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
    session_generators = session_data.setdefault("active_tile_generators", {})
    tile_generator = session_generators.get(file_id)

    if not tile_generator:
        try:
            # Initialize generator using the shared executor
            loop = asyncio.get_running_loop()
            tile_generator = await loop.run_in_executor(app.state.thread_executor, SimpleTileGenerator, fits_file, hdu_index)
            session_generators[file_id] = tile_generator
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to initialize tile generator: {str(e)}")

    # Always return tile info (even if generator already existed)
    try:
        info = tile_generator.get_tile_info()
        # Ensure fields the frontend expects
        if "minLevel" not in info:
            info["minLevel"] = 0
        # Fire-and-forget overview generation in background
        try:
            if not getattr(tile_generator, "overview_generated", False):
                loop = asyncio.get_running_loop()
                asyncio.create_task(loop.run_in_executor(app.state.thread_executor, tile_generator.ensure_overview_generated))
        except Exception:
            pass
        # If overview already available, include it
        if getattr(tile_generator, "overview_image", None):
            info["overview"] = tile_generator.overview_image
        return JSONResponse(content=info)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tile info: {str(e)}")
@app.get("/fits-tile/{level}/{x}/{y}")
async def get_fits_tile(level: int, x: int, y: int, request: Request):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    try:
        fits_file = session_data.get("current_fits_file")
        hdu_index = int(session_data.get("current_hdu_index", 0))
        if not fits_file:
            return JSONResponse(status_code=400, content={"error": "No FITS file currently loaded in session"})

        file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
        session_generators = session_data.setdefault("active_tile_generators", {})
        tile_generator = session_generators.get(file_id)
        if not tile_generator:
            if not Path(fits_file).exists():
                return JSONResponse(status_code=404, content={"error": f"FITS file path not found: {fits_file}"})
            # Initialize generator and dynamic range using shared executor
            loop = asyncio.get_running_loop()
            tile_generator = await loop.run_in_executor(app.state.thread_executor, SimpleTileGenerator, fits_file, hdu_index)
            await loop.run_in_executor(app.state.thread_executor, tile_generator.ensure_dynamic_range_calculated)
            session_generators[file_id] = tile_generator

        # Per-session tile cache
        session_tile_cache = session_data.setdefault("tile_cache", TileCache(max_size=TILE_CACHE_MAX_SIZE))

        tile_key = f"{file_id}/{level}/{x}/{y}/{tile_generator.color_map}/{tile_generator.scaling_function}/{tile_generator.min_value}/{tile_generator.max_value}"
        cached_tile = session_tile_cache.get(tile_key)
        if cached_tile:
            return Response(content=cached_tile, media_type="image/png")

        # Generate tile in a worker thread (PNG encoding can be heavy), limited by semaphore
        render_sem = getattr(app.state, "tile_render_semaphore", None)
        if render_sem is None:
            render_sem = asyncio.Semaphore(3)
            app.state.tile_render_semaphore = render_sem
        async with render_sem:
            loop = asyncio.get_running_loop()
            tile_data = await loop.run_in_executor(app.state.thread_executor, tile_generator.get_tile, level, x, y)
        if tile_data is None:
            return JSONResponse(status_code=404, content={"error": f"Tile ({level},{x},{y}) data not found or generation failed"})

        session_tile_cache.put(tile_key, tile_data)
        return Response(content=tile_data, media_type="image/png")
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to get tile: {str(e)}"})

# Add this new endpoint to list available files in the "files" directory
@app.get("/list-files-for-frontend/")
@app.get("/list-files-for-frontend/{path:path}")
async def list_files_for_frontend(path: str = "", search: str = Query(None)):
    """List available FITS files and directories in the specified path.
    
    Args:
        path: Relative path within the files directory (optional)
        search: Search term to filter files and folders (optional)
    """
    try:
        # Base directory is "files"
        base_dir = Path(FILES_DIRECTORY)
        
        # Construct the full directory path
        current_dir = base_dir / path if path else base_dir
        
        # Ensure the path exists and is within the files directory
        if not current_dir.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"Path '{path}' not found"}
            )
        
        # Security check: ensure the path is within the files directory
        if ".." in Path(path).parts:
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied: directory traversal not allowed"}
            )
        
        items = []

        if search:
            # Recursive search if a search term is provided
            for entry in current_dir.rglob(f'*{search}*'):
                if any(part.startswith('.') for part in entry.parts):
                    continue

                if entry.is_dir():
                    rel_path = str(entry.relative_to(base_dir))
                    items.append({
                        "name": entry.name,
                        "path": rel_path,
                        "type": "directory",
                        "modified": entry.stat().st_mtime
                    })
                elif entry.is_file() and entry.suffix.lower() in ['.fits', '.fit']:
                    rel_path = str(entry.relative_to(base_dir))
                    items.append({
                        "name": entry.name,
                        "path": rel_path,
                        "type": "file",
                        "size": entry.stat().st_size,
                        "modified": entry.stat().st_mtime
                    })
        else:
            # Original behavior: list contents of the current directory
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
# Add endpoint to



def table_to_serializable(table: Table) -> list:
    """Converts an Astropy Table to a list of dictionaries."""
    sources_list = []
    for row in table:
        source_dict = {}
        for col_name in table.colnames:
            val = row[col_name]
            if isinstance(val, (np.integer, np.floating)):
                if np.isnan(val) or np.isinf(val):
                    source_dict[col_name] = None
                else:
                    source_dict[col_name] = val.item()
            elif isinstance(val, bytes):
                source_dict[col_name] = val.decode('utf-8', errors='ignore')
            elif isinstance(val, str) or isinstance(val, (int, float, bool)) or val is None:
                if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
                    source_dict[col_name] = None
                else:
                    source_dict[col_name] = val
            else:
                source_dict[col_name] = str(val)
        sources_list.append(source_dict)
    return sources_list
@app.get("/cone-search/")
async def cone_search(ra: float, dec: float, radius: float, catalog_name: str):
    """
    Performs a cone search in a given catalog.
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)  # Updated
    
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read catalog: {e}")

    # Detect coordinate columns
    ra_col_name, dec_col_name = detect_coordinate_columns(catalog_table.colnames)
    if not ra_col_name or not dec_col_name:
        raise HTTPException(status_code=500, detail="Could not detect RA/Dec columns in catalog")

    # Ensure RA and Dec columns are float type for SkyCoord
    try:
        # Handle cases where columns might be bytes
        if catalog_table[ra_col_name].dtype.kind == 'S':
             catalog_table[ra_col_name] = np.char.decode(catalog_table[ra_col_name])
        if catalog_table[dec_col_name].dtype.kind == 'S':
             catalog_table[dec_col_name] = np.char.decode(catalog_table[dec_col_name])
        
        catalog_table[ra_col_name] = catalog_table[ra_col_name].astype(float)
        catalog_table[dec_col_name] = catalog_table[dec_col_name].astype(float)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=500, detail=f"Could not convert coordinate columns to numeric type: {e}")

    # Create SkyCoord objects for the catalog and the search position
    catalog_coords = SkyCoord(ra=catalog_table[ra_col_name], dec=catalog_table[dec_col_name], unit=(u.deg, u.deg), frame='icrs')
    search_coord = SkyCoord(ra=ra, dec=dec, unit=(u.deg, u.deg), frame='icrs')

    # Perform the cone search using separation method
    separations = search_coord.separation(catalog_coords)
    radius_angle = radius * u.arcsec
    
    # Find sources within the specified radius
    mask = separations < radius_angle
    idx = np.where(mask)[0]

    if len(idx) == 0:
        return {"sources": []}

    # Create a new table with the found sources
    nearby_sources_table = catalog_table[idx]
    
    # Add a column for the distance
    nearby_sources_table['distance_arcsec'] = separations[mask].to(u.arcsec).value
    
    # Sort by distance
    nearby_sources_table.sort('distance_arcsec')

    # Convert the result to a list of dictionaries
    sources_list = table_to_serializable(nearby_sources_table)

    return {"sources": sources_list}

@app.get("/flag-search/")
async def flag_search(catalog_name: str, flag_column: str):
    """
    Searches a catalog for entries where a given flag column is true.
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)  # Updated
    
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read catalog: {e}")

    if flag_column not in catalog_table.colnames:
        raise HTTPException(status_code=400, detail=f"Flag column '{flag_column}' not found in catalog.")

    try:
        column_data = catalog_table[flag_column]
        
        if column_data.dtype.kind in ['b', 'i']: # Boolean or integer
             mask = column_data.astype(bool)
        elif column_data.dtype.kind in ['U', 'S']: # String
             str_data_lower = np.char.lower(column_data.astype(str))
             true_values = ['true', 't', 'yes', 'y', '1']
             mask = np.isin(str_data_lower, true_values)
        else:
             mask = column_data.astype(bool)

        flagged_sources_table = catalog_table[mask]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to filter by flag: {e}")

    if len(flagged_sources_table) == 0:
        return {"sources": []}

    sources_list = table_to_serializable(flagged_sources_table)

    return {"sources": sources_list}



# FIND AND REPLACE these exact classes in your main.py file:

from pydantic import BaseModel, validator
from typing import List, Literal

class RangeCondition(BaseModel):
    column_name: str
    operator: str
    value: str  # ONLY STRING - NO UNION!
    
    @validator('operator')
    def validate_operator(cls, v):
        valid_operators = ['>', '<', '>=', '<=', '==', '!=']
        if v not in valid_operators:
            raise ValueError(f"Operator must be one of: {', '.join(valid_operators)}")
        return v

class RangeSearchRequest(BaseModel):
    catalog_name: str
    conditions: List[RangeCondition]
    logical_operator: Literal['AND', 'OR']


# ALSO UPDATE THE ENDPOINT FUNCTION:

@app.post("/range-search/")
async def range_search(request: RangeSearchRequest):
    """
    Searches a catalog for entries matching a set of numeric, boolean, or string range conditions.
    Enhanced to handle dynamic type detection and validation.
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)  # Updated
    
    try:
        catalog_table = get_astropy_table_from_catalog(request.catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{request.catalog_name}'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read catalog: {e}")

    all_masks = []
    
    for condition in request.conditions:
        if condition.column_name not in catalog_table.colnames:
            raise HTTPException(status_code=400, detail=f"Column '{condition.column_name}' not found in catalog.")

        column_data = catalog_table[condition.column_name]
        column_name = condition.column_name
        operator = condition.operator
        value_str = condition.value.strip()

        print(f"Processing condition: Column '{column_name}', Operator '{operator}', Value '{value_str}'")

        # Special handling for known string columns
        known_string_columns = ['galaxy', 'name', 'object_name', 'source_name', 'target', 'object_id']
        is_known_string_column = column_name.lower() in known_string_columns or any(term in column_name.lower() for term in ['galaxy', 'name', 'object', 'target'])

        # Step 1: Handle boolean columns
        if column_data.dtype.kind == 'b':
            # Convert string boolean values to actual booleans
            if value_str.lower() in ['true', 't', 'yes', 'y', '1']:
                value = True
            elif value_str.lower() in ['false', 'f', 'no', 'n', '0']:
                value = False
            else:
                raise HTTPException(status_code=400, detail=f"Invalid boolean value '{value_str}' for column '{column_name}'. Use true/false.")
            
            if operator != '==':
                raise HTTPException(status_code=400, detail=f"Only '==' operator is supported for boolean column '{column_name}'.")
            
            mask = (column_data == value)
            all_masks.append(mask)
            continue

        # Step 2: Handle explicit string columns or known string columns
        if column_data.dtype.kind in 'SU' or is_known_string_column:
            if operator not in ['==', '!=']:
                raise HTTPException(status_code=400, detail=f"Only '==' and '!=' operators are supported for string column '{column_name}'.")
            
            try:
                # Convert column data to string for comparison if needed
                if column_data.dtype.kind == 'S':  # Byte strings
                    str_column_data = np.char.decode(column_data, 'utf-8', errors='ignore')
                else:  # Unicode strings or other types
                    str_column_data = np.array([str(val) for val in column_data])
                
                # Perform case-insensitive comparison
                condition_value_str = value_str.lower()
                str_column_data_lower = np.char.lower(str_column_data.astype(str))
                
                if operator == '==':
                    mask = str_column_data_lower == condition_value_str
                else:  # !=
                    mask = str_column_data_lower != condition_value_str
                    
                all_masks.append(mask)
                continue
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to process string column '{column_name}': {e}")

        # Step 3: Check if this looks like a string value being used on a potentially mixed column
        # If the value contains letters and isn't a known number format, treat as string
        is_string_value = bool(re.search(r'[a-zA-Z]', value_str)) and not re.match(r'^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$', value_str)
        
        if is_string_value:
            # String value - only allow equality operators
            if operator not in ['==', '!=']:
                raise HTTPException(status_code=400, detail=f"String values like '{value_str}' can only use '==' or '!=' operators on column '{column_name}'.")
            
            try:
                # Convert entire column to string for comparison
                str_column_data = np.array([str(val) for val in column_data])
                condition_value_lower = value_str.lower()
                str_column_data_lower = np.char.lower(str_column_data)
                
                if operator == '==':
                    mask = str_column_data_lower == condition_value_lower
                else:  # !=
                    mask = str_column_data_lower != condition_value_lower
                    
                all_masks.append(mask)
                continue
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to process column '{column_name}' as text: {e}")

        # Step 4: Handle numeric operations
        # Try to convert string to number
        try:
            if '.' in value_str or 'e' in value_str.lower() or 'E' in value_str:
                numeric_value = float(value_str)
            else:
                # Try int first, then float
                try:
                    numeric_value = int(value_str)
                except ValueError:
                    numeric_value = float(value_str)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Cannot convert '{value_str}' to a number for numeric operation on column '{column_name}'. Use '==' or '!=' for text values.")

        # Check if column is actually numeric
        if column_data.dtype.kind not in 'iufc':  # integers, unsigned integers, floats, complex
            raise HTTPException(status_code=400, detail=f"Cannot use numeric operator '{operator}' on non-numeric column '{column_name}'. Use '==' or '!=' for text comparisons.")

        try:
            if operator == '>':
                mask = column_data > numeric_value
            elif operator == '<':
                mask = column_data < numeric_value
            elif operator == '>=':
                mask = column_data >= numeric_value
            elif operator == '<=':
                mask = column_data <= numeric_value
            elif operator == '==':
                mask = column_data == numeric_value
            elif operator == '!=':
                mask = column_data != numeric_value
            else:
                raise HTTPException(status_code=400, detail=f"Invalid operator '{operator}'.")
            
            all_masks.append(mask)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to apply numeric condition on '{column_name}': {e}")

    if not all_masks:
        return {"sources": []}

    try:
        if request.logical_operator == 'AND':
            final_mask = np.logical_and.reduce(all_masks)
        elif request.logical_operator == 'OR':
            final_mask = np.logical_or.reduce(all_masks)
        else:
            raise HTTPException(status_code=400, detail=f"Invalid logical operator '{request.logical_operator}'.")
        
        filtered_table = catalog_table[final_mask]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to combine filters: {e}")

    if len(filtered_table) == 0:
        return {"sources": []}

    sources_list = table_to_serializable(filtered_table)
    return {"sources": sources_list}
@app.get("/list-files/")
@app.get("/list-files/{path:path}")
async def list_files(path: str = ""):
    """List files and directories in a given path relative to the project root.
    
    Args:
        path: Relative path within the allowed directories (optional)
    """
    try:
        # Base directory is project root
        base_dir = Path(__file__).parent.resolve()
        
        if not path:
            # For the root, list key directories
            key_dirs = ["files", CATALOGS_DIR, "kernels"]
            items = []
            for dir_name in key_dirs:
                dir_path = base_dir / dir_name
                if dir_path.is_dir():
                    items.append({
                        "name": dir_name,
                        "path": dir_name,
                        "type": "dir",
                        "size": 0,
                        "modified": dir_path.stat().st_mtime,
                    })
            return JSONResponse(content={
                "path": "",
                "parent_path": "",
                "current_path": "",
                "files": items,
                "items": items
            })

        # Security checks
        if ".." in path.split(os.path.sep):
            raise HTTPException(status_code=400, detail="Invalid path (contains '..')")

        current_path = (base_dir / path).resolve()

        # Enhanced security check
        if not current_path.is_relative_to(base_dir):
            raise HTTPException(status_code=403, detail="Access to this path is forbidden.")

        if not current_path.exists():
            raise HTTPException(status_code=404, detail=f"Directory not found: {path}")

        if not current_path.is_dir():
            raise HTTPException(status_code=400, detail="The specified path is not a directory.")

        # List directory contents
        items = []
        
        # Determine if we're in a files directory context
        is_files_context = path == FILES_DIRECTORY or path.startswith(FILES_DIRECTORY)
        
        # Get all items in the directory
        for item_path in current_path.iterdir():
            if item_path.name.startswith('.'):  # Skip hidden files
                continue

            try:
                stat_info = item_path.stat()
                is_directory = item_path.is_dir()
                
                # Always include directories
                if is_directory:
                    item_data = {
                        "name": item_path.name,
                        "path": str(item_path.relative_to(base_dir)),
                        "type": "dir",
                        "modified": stat_info.st_mtime,
                        "size": 0,
                    }
                    items.append(item_data)
                else:
                    # For files, apply filtering based on context
                    if is_files_context:
                        # In files directory, only show FITS files
                        file_ext = item_path.suffix.lower()
                        if file_ext in ['.fits', '.fit']:
                            item_data = {
                                "name": item_path.name,
                                "path": str(item_path.relative_to(base_dir)),
                                "type": "file",
                                "modified": stat_info.st_mtime,
                                "size": stat_info.st_size,
                            }
                            items.append(item_data)
                    else:
                        # In other directories, show all files
                        item_data = {
                            "name": item_path.name,
                            "path": str(item_path.relative_to(base_dir)),
                            "type": "file",
                            "modified": stat_info.st_mtime,
                            "size": stat_info.st_size,
                        }
                        items.append(item_data)
                
            except (FileNotFoundError, PermissionError) as e:
                print(f"Skipping {item_path} due to error: {e}")
                continue
        
        # Sort items: directories first, then files, both alphabetically
        items.sort(key=lambda x: (x["type"] != "dir", x["name"].lower()))
        
        # Calculate parent path
        parent = current_path.parent
        parent_path = ""
        # Check if parent is within base_dir and not the base_dir itself
        if parent.is_relative_to(base_dir) and parent != base_dir:
            parent_path = str(parent.relative_to(base_dir))
        elif current_path != base_dir and parent == base_dir:
            parent_path = ""  # at a key directory, parent is root

        # Return response compatible with both formats
        return JSONResponse(content={
            "path": path,
            "parent_path": parent_path,
            "current_path": path,
            "files": items,
            "items": items
        })
        
    except HTTPException:
        raise  # Re-raise HTTPException to let FastAPI handle it
    except Exception as e:
        print(f"Error in list_files for path '{path}': {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred while listing files.")
@app.get("/load-file/{filepath:path}")
async def load_file(request: Request, filepath: str, hdu: int = Query(DEFAULT_HDU_INDEX)):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    try:
        base_dir = Path(FILES_DIRECTORY)
        file_path = base_dir / filepath
        
        if not file_path.exists():
            return JSONResponse(status_code=404, content={"error": f"File not found: {filepath}"})
        
        if ".." in Path(filepath).parts:
            return JSONResponse(status_code=403, content={"error": "Access denied: file is outside the files directory"})
        
        try:
            # Be tolerant of slightly malformed FITS and avoid hard failures
            with fits.open(str(file_path), ignore_missing_end=True, memmap=True, lazy_load_hdus=True) as hdul:
                if hdu < 0 or hdu >= len(hdul):
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Invalid HDU index: {hdu}. File has {len(hdul)} HDUs."}
                    )
        except Exception as e:
            import traceback
            print("[load_file] Error checking/opening FITS:", e)
            print(traceback.format_exc())
            return JSONResponse(status_code=500, content={"error": f"Error checking HDU: {type(e).__name__}: {str(e)}"})

        # Persist in this session only
        session_data["current_fits_file"] = str(file_path)
        session_data["current_hdu_index"] = hdu

        # Per-session caches/generators
        session_tile_cache = session_data.setdefault("tile_cache", TileCache(max_size=TILE_CACHE_MAX_SIZE))
        session_tile_cache.clear()
        session_generators = session_data.setdefault("active_tile_generators", {})

        file_id = f"{os.path.basename(file_path)}:{hdu}"
        try:
            # Initialize the per-session tile generator
            session_generators[file_id] = SimpleTileGenerator(str(file_path), hdu)
        except Exception as e:
            import traceback
            print("[load_file] Failed to initialize tile generator:", e)
            print(traceback.format_exc())
            return JSONResponse(status_code=500, content={"error": f"Failed to initialize tile generator: {type(e).__name__}: {str(e)}"})

        return JSONResponse(content={"message": f"File {filepath} set as active, HDU: {hdu}", "filepath": filepath, "hdu": hdu})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to set active file: {str(e)}"})
@app.get("/catalog-info/")
async def catalog_info(catalog_name: str):
    """Get information about a catalog file."""
    try:
        catalog_path = f"{CATALOGS_DIRECTORY}/{catalog_name}"  # Updated
        
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



@app.post("/update-dynamic-range/")
async def update_dynamic_range(request: Request):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    data = await request.json()
    min_value = data.get('min_value')
    max_value = data.get('max_value')
    color_map = data.get('color_map')
    scaling_function = data.get('scaling_function')

    if min_value is None or max_value is None:
        raise HTTPException(status_code=400, detail="Missing min_value or max_value")
    if color_map is None:
        raise HTTPException(status_code=400, detail="Missing color_map")
    if scaling_function is None:
        raise HTTPException(status_code=400, detail="Missing scaling_function")

    fits_file = session_data.get("current_fits_file")
    hdu_index = int(session_data.get("current_hdu_index", 0))
    file_id = f"{os.path.basename(fits_file)}:{hdu_index}" if fits_file else None

    session_generators = session_data.setdefault("active_tile_generators", {})
    tile_generator = session_generators.get(file_id) if file_id else None
    if not file_id or not tile_generator:
        raise HTTPException(status_code=404, detail="Tile generator not found in this session or no file loaded.")

    tile_generator.min_value = float(min_value)
    tile_generator.max_value = float(max_value)
    if tile_generator.color_map != color_map:
        tile_generator.color_map = color_map
        tile_generator._update_colormap_lut()
    if tile_generator.scaling_function != scaling_function:
        tile_generator.scaling_function = scaling_function

    tile_generator.overview_image = None 

    return {
        "status": "success", 
        "new_min": tile_generator.min_value, 
        "new_max": tile_generator.max_value,
        "color_map": tile_generator.color_map,
        "scaling_function": tile_generator.scaling_function
    }


import numpy as np
from astropy.io import fits
from astropy.wcs import WCS



from fastapi import Query, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
import numpy as np
from astropy.io import fits
# Requires: from fastapi import Query, HTTPException
#           from fastapi.responses import JSONResponse
#           from pathlib import Path
#           import numpy as np
#           from astropy.io import fits



# Requires: from fastapi import Query, HTTPException
#           from fastapi.responses import JSONResponse
#           from pathlib import Path
#           from astropy.io import fits
#           from astropy.wcs import WCS
#           import numpy as np


@app.get("/probe-pixel/")
async def probe_pixel(
    request: Request,
    x: int = Query(...),
    y: int = Query(...),
    origin: str = Query("bottom"),
    filepath: str | None = Query(None),
    hdu: int | None = Query(None),
):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    try:
        current_file = filepath or session_data.get("current_fits_file")
        if not current_file:
            raise HTTPException(status_code=400, detail="No current FITS file and no 'filepath' provided.")
        hdu_index = int(hdu if hdu is not None else session_data.get("current_hdu_index", 0))

        full_path = Path(current_file)
        if not full_path.exists():
            if not str(full_path).startswith(str(FILES_DIRECTORY)):
                full_path = Path(FILES_DIRECTORY) / current_file
        if not full_path.exists():
            raise HTTPException(status_code=404, detail=f"FITS file not found: {full_path}")

        image_data = None
        header = None
        unit = None
        height = width = None
        used_generator = False
        applied_flip_y = False

        try:
            file_id = f"{full_path.name}:{hdu_index}"
            session_generators = session_data.setdefault("active_tile_generators", {})
            gen = session_generators.get(file_id)
            if gen is not None and getattr(gen, "image_data", None) is not None:
                image_data = gen.image_data
                height, width = int(gen.height), int(gen.width)
                header = getattr(gen, "header", None)
                unit = header.get("BUNIT", None) if header is not None else None
                used_generator = True
        except Exception:
            pass

        if image_data is None:
            with fits.open(full_path, memmap=True, lazy_load_hdus=True) as hdul:
                if not (0 <= hdu_index < len(hdul)):
                    raise HTTPException(status_code=400, detail=f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs.")
                h = hdul[hdu_index]
                header = h.header
                unit = header.get("BUNIT", None)
                data = h.data
                if data is None or data.ndim < 2:
                    raise HTTPException(status_code=400, detail="Selected HDU has no 2D image data.")
                if data.ndim > 2:
                    data = data[0] if data.ndim == 3 else data[0, 0]

                try:
                    flip_y, _, corrected = analyze_wcs_orientation(header, data)
                    image_data = corrected if corrected is not None else data
                    applied_flip_y = bool(flip_y)
                except Exception:
                    image_data = data
                    applied_flip_y = False

                height, width = int(image_data.shape[-2]), int(image_data.shape[-1])

        x_idx = int(x)
        y_idx = int(height - 1 - y) if origin.lower().startswith("bottom") else int(y)

        if not (0 <= x_idx < width and 0 <= y_idx < height):
            return JSONResponse(content={"value": None, "unit": unit, "x": x_idx, "y": y_idx,
                                         "origin": origin, "filepath": str(full_path),
                                         "hdu_index": hdu_index, "used_generator": used_generator,
                                         "applied_flip_y": applied_flip_y, "detail": "Out of bounds"}, status_code=200)
        try:
            px = float(image_data[y_idx, x_idx])
            if not np.isfinite(px):
                px = None
        except Exception:
            px = None

        return JSONResponse(content={"value": px, "unit": unit, "x": x_idx, "y": y_idx, "origin": origin,
                                     "filepath": str(full_path), "hdu_index": hdu_index,
                                     "used_generator": used_generator, "applied_flip_y": applied_flip_y}, status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"probe-pixel failed: {e}")


@app.get("/pixel-to-world/")
async def pixel_to_world(
    request: Request,
    x: int = Query(...),
    y: int = Query(...),
    origin: str = Query("bottom"),
    filepath: str | None = Query(None),
    hdu: int | None = Query(None),
):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    try:
        current_file = filepath or session_data.get("current_fits_file")
        if not current_file:
            raise HTTPException(status_code=400, detail="No current FITS file and no 'filepath' provided.")
        hdu_index = int(hdu if hdu is not None else session_data.get("current_hdu_index", 0))

        full_path = Path(current_file)
        if not full_path.exists():
            if not str(full_path).startswith(str(FILES_DIRECTORY)):
                full_path = Path(FILES_DIRECTORY) / current_file
        if not full_path.exists():
            raise HTTPException(status_code=404, detail=f"FITS file not found: {full_path}")

        with fits.open(full_path, memmap=True, lazy_load_hdus=True) as hdul:
            if not (0 <= hdu_index < len(hdul)):
                raise HTTPException(status_code=400, detail=f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs.")
            h = hdul[hdu_index]
            header = h.header
            data = h.data
            if data is None or data.ndim < 2:
                raise HTTPException(status_code=400, detail="Selected HDU has no 2D image data.")
            if data.ndim > 2:
                data = data[0] if data.ndim == 3 else data[0, 0]
            height = int(data.shape[-2])

            x_idx = float(x)
            y_idx = float(height - 1 - y) if origin.lower().startswith("bottom") else float(y)

            w = WCS(header)
            if not w.has_celestial:
                return JSONResponse(content={"ra": None, "dec": None, "detail": "No celestial WCS"}, status_code=200)

            ra_deg, dec_deg = w.all_pix2world([[x_idx, y_idx]], 0)[0]
            ra = float(ra_deg) if np.isfinite(ra_deg) else None
            dec = float(dec_deg) if np.isfinite(dec_deg) else None

        return JSONResponse(content={"ra": ra, "dec": dec}, status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"pixel-to-world failed: {e}")




@app.get("/fits-binary/")
@app.get("/canfits-binary/")
async def fits_binary(
    request: Request,
    type: str = Query(None),
    ra: float = Query(None),
    dec: float = Query(None),
    catalog_name: str = Query(None),
    initialize_tiles: bool = Query(True),
    fast_loading: bool = Query(True),
    hdu: int = Query(None),
):
    try:
        # SED path unchanged
        if type == "sed" and ra is not None and dec is not None:
            return await fits_binary_for_sed(ra, dec, catalog_name)

        # Prefer per-session state; fall back to global app.state
        session = getattr(request.state, "session", None)
        session_data = session.data if session is not None else None

        if session_data is not None:
            fits_file = session_data.get("current_fits_file")
            hdu_index = int(hdu if hdu is not None else session_data.get("current_hdu_index", 0))
        else:
            fits_file = getattr(app.state, "current_fits_file", None)
            hdu_index = hdu if hdu is not None else getattr(app.state, "current_hdu_index", 0)

        if not fits_file:
            return JSONResponse(status_code=400, content={"error": "No FITS file selected. Please select a file first."})

        # Persist chosen HDU back to session or global for consistency
        if session_data is not None:
            session_data["current_hdu_index"] = int(hdu_index)
        else:
            app.state.current_hdu_index = hdu_index

        # Resolve file path; if relative/basename, try under FILES_DIRECTORY
        if not os.path.exists(fits_file):
            candidate_path = os.path.join(str(FILES_DIRECTORY), fits_file) if not os.path.isabs(fits_file) else fits_file
            if os.path.exists(candidate_path):
                fits_file = candidate_path
            else:
                return JSONResponse(status_code=404, content={"error": f"FITS file not found: {fits_file}"})

        # Fast/tiled path: return JSON metadata and ensure a tile generator exists in-session
        try:
            _ = os.path.getsize(fits_file)
            if fast_loading:
                file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
                if session_data is not None:
                    session_generators = session_data.setdefault("active_tile_generators", {})
                else:
                    # Only use the global store if no session
                    session_generators = active_tile_generators

                generator_instance = session_generators.get(file_id)
                if generator_instance is None:
                    # Header-only lazy init: avoid heavy image reads on cpah; return minimal info immediately
                    loop = asyncio.get_running_loop()
                    generator_instance = await loop.run_in_executor(app.state.thread_executor, SimpleTileGenerator, fits_file, hdu_index)
                    session_generators[file_id] = generator_instance
                    # Determine if Y-flip is required from header only; defer actual flip to first data access
                    try:
                        header = getattr(generator_instance, "header", None)
                        if header is not None:
                            flip_y, _, _ = analyze_wcs_orientation(header, None)
                            if flip_y:
                                setattr(generator_instance, "_flip_required", True)
                    except Exception:
                        pass
                    # Skip heavy warmups on Ceph; frontend will request overview when needed
                    pass
                else:
                    # Reused generator: set flip flag based on header without touching data
                    try:
                        header = getattr(generator_instance, "header", None)
                        if header is None:
                            # Read header in a worker thread
                            def _read_header_sync():
                                with fits.open(fits_file) as hdul:
                                    return hdul[hdu_index].header
                            loop = asyncio.get_running_loop()
                            header = await loop.run_in_executor(app.state.thread_executor, _read_header_sync)
                        flip_y, _, _ = analyze_wcs_orientation(header, None)
                        if flip_y:
                            setattr(generator_instance, "_flip_required", True)
                            # Invalidate any previous overview so it regenerates after flip at next request
                            generator_instance.overview_image = None
                            generator_instance.overview_generated = False
                    except Exception as _e:
                        print(f"Orientation check on existing generator failed: {_e}")

                # Defer overview generation until explicitly requested by /fits-overview

                tile_info = generator_instance.get_minimal_tile_info()
                return JSONResponse(content={
                    "fast_loading": True,
                    "file_id": file_id,
                    "tile_info": tile_info,
                    "message": "Fast loading enabled. Use tile endpoints to fetch image data."
                })
        except Exception as e_init:
            logger.critical(f"Error in fast/tiled initialization: {e_init}", exc_info=True)
            # Fall through to non-tiled; frontend can handle the binary path as a fallback

        # Non-fast path: return binary with header + stats for initial render
        try:
            loop = asyncio.get_running_loop()
            fits_sem = getattr(app.state, "fits_init_semaphore", None)
            if fits_sem is None:
                fits_sem = asyncio.Semaphore(2)
                app.state.fits_init_semaphore = fits_sem
            async with fits_sem:
                binary_data, wcs_info, w_object = await loop.run_in_executor(app.state.thread_executor, _build_fits_binary_sync, fits_file, int(hdu_index))
            # Persist WCS for later use
            if wcs_info is not None:
                app.state.current_wcs = wcs_info
                app.state.current_wcs_object = w_object
            return Response(
                content=binary_data,
                media_type="application/octet-stream",
                headers={"Content-Disposition": "attachment; filename=fits_data.bin"},
            )
        except HTTPException:
            raise
        except Exception as e_nonfast:
            raise HTTPException(status_code=500, detail=f"Failed to build FITS binary: {e_nonfast}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in fits_binary: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})



def _load_image_data_and_header_corrected(fits_file: str, hdu_index: int):
    """Blocking helper: load image data and header, normalize dimensions, apply orientation correction."""
    with fits.open(fits_file, memmap=True, lazy_load_hdus=True) as hdul:
        if not (0 <= hdu_index < len(hdul)):
            raise HTTPException(status_code=400, detail=f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs.")
        image_data = hdul[hdu_index].data
        header = hdul[hdu_index].header
        if image_data is None:
            raise HTTPException(status_code=400, detail=f"No image data found in HDU {hdu_index}.")
        if getattr(image_data, "ndim", 0) > 2:
            if image_data.ndim == 3:
                image_data = image_data[0, :, :]
            elif image_data.ndim == 4:
                image_data = image_data[0, 0, :, :]
        _, _, corrected_data = analyze_wcs_orientation(header, image_data)
        if corrected_data is not None:
            image_data = corrected_data
        return image_data, header


def _build_fits_binary_sync(fits_file: str, hdu_index: int):
    """Blocking helper: open FITS and build the binary payload and WCS info."""
    with fits.open(fits_file) as hdul:
        if hdu_index < 0 or hdu_index >= len(hdul):
            raise HTTPException(status_code=400, detail=f"Invalid HDU index: {hdu_index}. File has {len(hdul)} HDUs.")
        hdu_obj = hdul[hdu_index]
        if not hasattr(hdu_obj, "data") or hdu_obj.data is None:
            raise HTTPException(status_code=400, detail=f"HDU {hdu_index} does not contain image data")
        image_data = hdu_obj.data
        if getattr(image_data, "ndim", 0) > 2:
            if image_data.ndim == 3:
                image_data = image_data[0, :, :]
            elif image_data.ndim == 4:
                image_data = image_data[0, 0, :, :]
        header = hdu_obj.header
        _, _, corrected_data = analyze_wcs_orientation(header, image_data)
        if corrected_data is not None:
            image_data = corrected_data

        if image_data is None:
            raise HTTPException(status_code=400, detail=f"No data in HDU {hdu_index} after potential slicing.")

        height, width = image_data.shape[-2:]
        valid_data = image_data[np.isfinite(image_data)]
        if valid_data.size == 0:
            min_value = 0.0
            max_value = 1.0
        else:
            min_value = float(np.percentile(valid_data, 0.5))
            max_value = float(np.percentile(valid_data, 99.5))
            if min_value >= max_value:
                min_value = float(np.min(valid_data))
                max_value = float(np.max(valid_data))
                if min_value >= max_value:
                    max_value = min_value + 1e-6

        wcs_info = None
        w_object = None
        try:
            w_object = WCS(_prepare_jwst_header_for_wcs(header))
            if w_object.has_celestial:
                wcs_info = {
                    "ra_ref": float(header.get("CRVAL1", 0)),
                    "dec_ref": float(header.get("CRVAL2", 0)),
                    "x_ref": float(header.get("CRPIX1", 0)),
                    "y_ref": float(header.get("CRPIX2", 0)),
                    "cd1_1": float(header.get("CD1_1", header.get("CDELT1", 0))),
                    "cd1_2": float(header.get("CD1_2", 0)),
                    "cd2_1": float(header.get("CD2_1", 0)),
                    "cd2_2": float(header.get("CD2_2", header.get("CDELT2", 0))),
                    "bunit": header.get("BUNIT", "")
                }
        except Exception:
            wcs_info = None
            w_object = None

        buffer = io.BytesIO()
        buffer.write(struct.pack("<i", width))
        buffer.write(struct.pack("<i", height))
        buffer.write(struct.pack("<f", min_value))
        buffer.write(struct.pack("<f", max_value))

        if wcs_info:
            buffer.write(struct.pack("<?", True))
            wcs_json = json.dumps(wcs_info)
            wcs_bytes = wcs_json.encode("utf-8")
            buffer.write(struct.pack("<i", len(wcs_bytes)))
            buffer.write(wcs_bytes)
        else:
            buffer.write(struct.pack("<?", False))
            buffer.write(struct.pack("<i", 0))

        bunit = header.get("BUNIT", "")
        bunit_bytes = bunit.encode("utf-8")
        buffer.write(struct.pack("<i", len(bunit_bytes)))
        if bunit_bytes:
            buffer.write(bunit_bytes)

        padding_bytes = (4 - (buffer.tell() % 4)) % 4
        buffer.write(b"\0" * padding_bytes)

        float_data = np.ascontiguousarray(image_data, dtype=np.float32)
        buffer.write(float_data.tobytes())

        binary_data = buffer.getvalue()
        return binary_data, wcs_info, w_object


def initialize_tile_generator_background(request: Request, file_id, fits_file, image_data, header, hdu_index):
    try:
        print(f"Initializing simple tile generator for {file_id} in background (session-scoped)")
        session = getattr(request.state, "session", None)
        if session is None:
            raise RuntimeError("Missing session in initialize_tile_generator_background")
        session_data = session.data

        tile_generator = SimpleTileGenerator(fits_file, hdu_index)
        session_generators = session_data.setdefault("active_tile_generators", {})
        session_generators[file_id] = tile_generator
        print(f"Simple tile generator initialized for {file_id} (session)")
    except Exception as e:
        print(f"Error initializing simple tile generator: {e}")
        import traceback
        print(traceback.format_exc())


def initialize_tile_generator(request: Request, file_id, fits_data):
    try:
        print(f"Initializing tile generator for {file_id} (session-scoped)")
        session = getattr(request.state, "session", None)
        if session is None:
            raise RuntimeError("Missing session in initialize_tile_generator")
        session_data = session.data

        session_generators = session_data.setdefault("active_tile_generators", {})

        if hasattr(fits_data, 'fits_file_path') and hasattr(fits_data, 'hdu_index'):
            session_generators[file_id] = SimpleTileGenerator(fits_data.fits_file_path, fits_data.hdu_index)
        else:
            fits_file = session_data.get("current_fits_file")
            hdu_index = int(session_data.get("current_hdu_index", 0))
            if fits_file:
                session_generators[file_id] = SimpleTileGenerator(fits_file, hdu_index)

        print(f"Tile generator initialized for {file_id} (session)")
    except Exception as e:
        print(f"Error in tile generator initialization: {e}")
        import traceback
        print(traceback.format_exc())
@app.get("/fits-overview/{quality}")
async def get_fits_overview(request: Request, quality: int = 0, file_id: str = Query(None)):
    session = getattr(request.state, "session", None)
    if session is None:
        raise HTTPException(status_code=401, detail="Missing session")
    session_data = session.data

    if not file_id:
        fits_file = session_data.get("current_fits_file")
        if not fits_file:
            raise HTTPException(status_code=404, detail="No FITS file loaded in session and no file_id provided")
        hdu_index = int(session_data.get("current_hdu_index", 0))
        file_id = f"{os.path.basename(fits_file)}:{hdu_index}"

    session_generators = session_data.setdefault("active_tile_generators", {})
    tile_generator = session_generators.get(file_id)

    if not tile_generator:
        try:
            base_filename, hdu_str = file_id.rsplit(":", 1)
            hdu_idx_from_id = int(hdu_str)
            current_full_path = session_data.get("current_fits_file", None)
            if current_full_path and os.path.basename(current_full_path) == base_filename:
                generator_instance = SimpleTileGenerator(current_full_path, hdu_idx_from_id)
                session_generators[file_id] = generator_instance
                tile_generator = generator_instance
            else:
                raise HTTPException(status_code=404, detail=f"Tile generator for {file_id} not found in this session")
        except Exception as e_reinit:
            raise HTTPException(status_code=500, detail=f"Failed to prepare tile generator for {file_id}: {str(e_reinit)}")

    try:
        tile_generator.ensure_overview_generated()
        if tile_generator.overview_image:
            return Response(content=base64.b64decode(tile_generator.overview_image), media_type="image/png")
            raise HTTPException(status_code=404, detail="Overview not available or empty")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving overview for {file_id}: {str(e)}")

def detect_coordinate_columns(colnames):
    """Detect RA and DEC column names from a list of column names."""
    ra_candidates = ra_columns
    dec_candidates = dec_columns
    
    ra_col = None
    dec_col = None
    
    # Find exact matches first
    for col in colnames:
        if col in ra_candidates and ra_col is None:
            ra_col = col
        if col in dec_candidates and dec_col is None:
            dec_col = col
    
    # If no exact matches, try partial matches
    if ra_col is None:
        for col in colnames:
            if any(candidate.lower() in col.lower() for candidate in ra_columns):
                ra_col = col
                break
    
    if dec_col is None:
        for col in colnames:
            if any(candidate.lower() in col.lower() for candidate in dec_columns):
                dec_col = col
                break
    
    return ra_col, dec_col
import json
import numpy as np
from fastapi import Query, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.responses import FileResponse
from pathlib import Path
import numpy as np
import json
from typing import Optional, Dict, Any, List

# ... existing code ...

@app.get("/download/{filepath:path}")
async def download_file(filepath: str, request: Request):
    """Serve a file for download if it resides under FILES_DIRECTORY/uploads."""
    try:
        base_dir = Path(FILES_DIRECTORY).resolve() / "uploads"
        target = (base_dir / filepath).resolve()
        if not str(target).startswith(str(base_dir)):
            raise HTTPException(status_code=403, detail="Access denied")
        if not target.exists() or not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        # Require a valid session (same as other endpoints)
        sid = request.headers.get('x-session-id') or request.query_params.get('sid')
        if not sid:
            raise HTTPException(status_code=401, detail="Missing session")
        return FileResponse(path=str(target), filename=target.name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
import gzip
import io
import asyncio
import logging
logger = logging.getLogger(__name__)
import struct
import json
import gzip
from io import BytesIO
from fastapi import Query, Request, HTTPException
from fastapi.responses import Response
from pathlib import Path
from typing import Optional
import numpy as np


from functools import lru_cache
def sanitize(val):
    try:
        if hasattr(val, "item"):
            val = val.item()
        if isinstance(val, (bytes, bytearray)):
            return val.decode("utf-8", errors="ignore")
        if isinstance(val, (float, np.floating)):
            return None if not math.isfinite(float(val)) else float(val)
        if isinstance(val, (np.integer,)):
            return int(val)
        return val
    except Exception:
        return None


@lru_cache(maxsize=16)
def _get_table_cached(catalogs_dir_str: str, catalog_name: str):
    catalogs_dir = Path(catalogs_dir_str)
    tbl = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
    if tbl is None:
        raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")
    return tbl

@app.get("/catalog-binary-raw/{catalog_name:path}")
async def catalog_binary_raw(
    request: Request,
    catalog_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(5000, ge=1, le=10000, description="Items per page"),
    columns: Optional[str] = Query(None, description="Comma-separated list of columns to include in metadata (optional)"),
    search: Optional[str] = Query(None, description="Search term for filtering (case-insensitive contains across columns)"),
    sort_by: Optional[str] = Query(None, description="Column to sort by (name)"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order"),
    filters: Optional[str] = Query(None, description="JSON string of column filters: { col: { type: 'contains'|'equals'|'range', value|min|max } }"),
    stats: bool = Query(False, description="Include column statistics (reserved)"),
    ra_col: Optional[str] = Query(None, description="Override RA column name"),
    dec_col: Optional[str] = Query(None, description="Override DEC column name"),
    size_col: Optional[str] = Query(None, description="Override size/radius column name"),
):
    from io import BytesIO
    import struct, gzip, numpy as np
    from fastapi.responses import Response, JSONResponse

    catalogs_dir = Path(CATALOGS_DIRECTORY)
    # Resolve uploaded paths as well (e.g., files/uploads/...) like /catalog-columns
    try:
        base_dir = Path(".").resolve()
        direct = base_dir / catalog_name
        in_catalogs = base_dir / CATALOGS_DIRECTORY / catalog_name
        if direct.is_file():
            # load_catalog_data below expects a full path string; we still need table for boolean columns
            # So set catalogs_dir to the base of direct path to satisfy get_astropy_table_from_catalog
            catalogs_dir = base_dir
        elif in_catalogs.is_file():
            catalogs_dir = base_dir / CATALOGS_DIRECTORY
    except Exception:
        pass
    # Resolve uploaded paths as well (e.g., files/uploads/...) like /catalog-columns
    try:
        base_dir = Path(".").resolve()
        direct = base_dir / catalog_name
        in_catalogs = base_dir / CATALOGS_DIRECTORY / catalog_name
        in_files = base_dir / FILES_DIRECTORY / catalog_name
        in_uploads = base_dir / UPLOADS_DIRECTORY / catalog_name
        if direct.is_file():
            catalogs_dir = base_dir
        elif in_catalogs.is_file():
            catalogs_dir = base_dir / CATALOGS_DIRECTORY
        elif in_uploads.is_file():
            catalogs_dir = base_dir / UPLOADS_DIRECTORY
        elif in_files.is_file():
            catalogs_dir = base_dir / FILES_DIRECTORY
    except Exception:
        pass
    try:
        # Hard cap page size to keep responses small regardless of caller
        try:
            limit = int(limit)
        except Exception:
            limit = 5000
        limit = min(max(limit, 1), 500)

        # 1) Load table once from cache (no re-read on every page)
        table = _get_table_cached(str(catalogs_dir.resolve()), catalog_name)

        total_items = len(table)

        # Prepare filtering mask across the full table
        mask = np.ones(total_items, dtype=bool)

        # Determine candidate columns for search/filters
        requested_cols = None
        if columns:
            requested_cols = [c.strip() for c in columns.split(",") if c.strip() and c.strip() in table.colnames]
        candidate_cols = requested_cols if requested_cols is not None else list(table.colnames)

        # Apply simple search (contains on any candidate column)
        if search:
            s = str(search).lower()
            matched = np.zeros(total_items, dtype=bool)
            for col_name in candidate_cols:
                try:
                    col = table[col_name]
                    # Convert to strings safely
                    vals = np.array([str(x).lower() if x is not None else '' for x in col])
                    matched |= np.char.find(vals, s) >= 0
                except Exception:
                    continue
            mask &= matched

        # Apply advanced column filters if provided
        if filters:
            try:
                filter_dict = json.loads(filters)
                if isinstance(filter_dict, dict):
                    for col_name, cfg in filter_dict.items():
                        if col_name not in table.colnames or not isinstance(cfg, dict):
                            continue
                        col = table[col_name]
                        try:
                            kind = cfg.get('type')
                            if kind == 'range':
                                vmin = cfg.get('min')
                                vmax = cfg.get('max')
                                arr = np.array(col, dtype=float)
                                cond = np.ones_like(arr, dtype=bool)
                                if vmin is not None:
                                    try:
                                        cond &= arr >= float(vmin)
                                    except Exception:
                                        cond &= False
                                if vmax is not None:
                                    try:
                                        cond &= arr <= float(vmax)
                                    except Exception:
                                        cond &= False
                                mask &= cond
                            elif kind == 'equals':
                                value = cfg.get('value')
                                # Try numeric compare first, fallback to string
                                try:
                                    arr = np.array(col, dtype=float)
                                    valf = float(value)
                                    cond = arr == valf
                                except Exception:
                                    vals = np.array([str(x) for x in col])
                                    cond = vals == str(value)
                                mask &= cond
                            elif kind == 'contains':
                                value = cfg.get('value')
                                if value is not None:
                                    vals = np.array([str(x).lower() if x is not None else '' for x in col])
                                    cond = np.char.find(vals, str(value).lower()) >= 0
                                    mask &= cond
                        except Exception:
                            # Ignore broken filters on this column
                            continue
            except json.JSONDecodeError:
                pass

        # limit already capped above

        # Indices after filtering
        filtered_indices = np.where(mask)[0]

        # Sorting
        if sort_by:
            try:
                if sort_by in table.colnames:
                    col = table[sort_by]
                    try:
                        vals = np.array(col, dtype=float)
                    except Exception:
                        vals = np.array([str(x) for x in col])
                else:
                    # sort by derived columns like 'ra'/'dec' handled later after detection
                    col = None
                    vals = None
                if vals is not None:
                    order = np.argsort(vals[filtered_indices])
                else:
                    order = np.argsort(filtered_indices)
                if sort_order == 'desc':
                    order = order[::-1]
                filtered_indices = filtered_indices[order]
            except Exception:
                pass

        # Pagination window
        total_filtered = int(filtered_indices.size)
        start_idx = (page - 1) * limit
        end_idx = min(start_idx + limit, total_filtered)
        if start_idx >= total_filtered:
            page_indices = np.arange(0, 0, dtype=int)
        else:
            page_indices = filtered_indices[start_idx:end_idx]

        # 2) Core numeric fields, best-effort RA/DEC and radius-like detection
        ra_col_detected, dec_col_detected = detect_coordinate_columns(table.colnames)

        radius_candidates = [
            "radius_pixels", "radius", "rad", "size", "fwhm",  "bmaj", "r_eff",  "r_kron", "r_petro"
        ]
        def find_radius_col(cols):
            for key in radius_candidates:
                for col in cols:
                    if key.lower() in col.lower():
                        return col
            return None
        radius_col = find_radius_col(table.colnames)

        # Apply overrides if provided and valid
        try:
            if ra_col and ra_col in table.colnames:
                ra_col_detected = ra_col
            if dec_col and dec_col in table.colnames:
                dec_col_detected = dec_col
            if size_col and size_col in table.colnames:
                radius_col = size_col
        except Exception:
            pass

        ra_array = np.zeros(end_idx - start_idx, dtype=np.float64)
        dec_array = np.zeros(end_idx - start_idx, dtype=np.float64)
        x_array = np.zeros(end_idx - start_idx, dtype=np.float32)  # placeholder
        y_array = np.zeros(end_idx - start_idx, dtype=np.float32)  # placeholder
        radius_array = np.full(end_idx - start_idx, 5.0, dtype=np.float32)

        # 3) Limit metadata columns if requested (already intersected earlier)
        # requested_cols computed above

        # metadata keys to exclude (core numeric names)
        numeric_fields = {'ra', 'dec', 'x_pixels', 'y_pixels', 'radius_pixels'}

        # 4) Build metadata only for current page rows
        metadata_list = []
        # RA/DEC normalizers (same logic as in catalog_binary)
        def _parse_sexagesimal(s: str, is_ra: bool) -> float:
            try:
                import re
                txt = str(s).strip().lower()
                # Extract up to 3 numeric tokens from formats like 23h34m25.89s, 23:34:25.89, 23 34 25.89
                nums = re.findall(r'[+-]?\d+(?:\.\d+)?', txt)
                if not nums:
                    return float('nan')
                a0 = float(nums[0])
                a1 = float(nums[1]) if len(nums) > 1 else 0.0
                a2 = float(nums[2]) if len(nums) > 2 else 0.0
                sign = -1.0 if a0 < 0 else 1.0
                a0 = abs(a0)
                val = a0 + a1/60.0 + a2/3600.0
                if is_ra:
                    return sign * val * 15.0
                return sign * val
            except Exception:
                return float('nan')

        def _normalize_coord(val, is_ra: bool, col_name: str = None) -> float:
            try:
                if isinstance(val, str):
                    out = _parse_sexagesimal(val, is_ra)
                    if np.isfinite(out):
                        return out
                    val = float(val)
                if isinstance(val, (int, float, np.number)):
                    v = float(val)
                    if not np.isfinite(v):
                        return float('nan')
                    # radians
                    if abs(v) <= (2*np.pi + 1e-6):
                        return v * (180.0/np.pi)
                    # hours for RA
                    if is_ra:
                        name = (col_name or '').lower()
                        if ('hms' in name) or ('hour' in name) or (0.0 <= v <= 24.0):
                            return v * 15.0
                    return v
            except Exception:
                return float('nan')
            return float('nan')

        for out_i, idx in enumerate(page_indices):
            row = table[idx]

            def _to_py(v):
                try:
                    # numpy scalar → python
                    if hasattr(v, "item"):
                        return v.item()
                    # bytes -> str
                    if isinstance(v, (bytes, bytearray)):
                        return v.decode("utf-8", errors="ignore")
                    return v
                except Exception:
                    return None

            if ra_col_detected is not None:
                try:
                    ra_val = _to_py(row[ra_col_detected])
                    ra_array[out_i] = float(_normalize_coord(ra_val, True, ra_col_detected))
                except Exception:
                    pass
            if dec_col_detected is not None:
                try:
                    dec_val = _to_py(row[dec_col_detected])
                    dec_array[out_i] = float(_normalize_coord(dec_val, False, dec_col_detected))
                except Exception:
                    pass
            if radius_col is not None:
                try:
                    radius_array[out_i] = float(_to_py(row[radius_col]))
                except Exception:
                    pass

            # Build metadata for this row
            # Either the requested subset, or all non-core columns
            cols_iter = requested_cols if requested_cols is not None else table.colnames
            md = {}
            for c in cols_iter:
                if c in (ra_col_detected, dec_col_detected, radius_col):
                    continue
                if c in numeric_fields:
                    continue
                md[c] = _to_py(row[c])
            metadata_list.append(md)

        # If RA/DEC are still missing or non-finite, attempt a fallback from metadata columns (case-insensitive)
        try:
            ra_any_finite = np.isfinite(ra_array).any()
            dec_any_finite = np.isfinite(dec_array).any()
        except Exception:
            ra_any_finite = True
            dec_any_finite = True
        if not ra_any_finite or not dec_any_finite:
            # Inspect first metadata dict to detect candidate keys
            cand_ra = RA_COLUMN_NAMES
            cand_dec = DEC_COLUMN_NAMES
            ra_key = None
            dec_key = None
            if len(metadata_list) > 0 and isinstance(metadata_list[0], dict):
                lower_map = {k.lower(): k for k in metadata_list[0].keys()}
                for c in cand_ra:
                    if c.lower() in lower_map:
                        ra_key = lower_map[c.lower()]
                        break
                for c in cand_dec:
                    if c.lower() in lower_map:
                        dec_key = lower_map[c.lower()]
                        break
            # Fill from metadata if keys found
            if (not ra_any_finite and ra_key) or (not dec_any_finite and dec_key):
                for i_md, md in enumerate(metadata_list):
                    if not ra_any_finite and ra_key in md:
                        val = md.get(ra_key)
                        nv = _normalize_coord(val, True, ra_key)
                        if np.isfinite(nv):
                            ra_array[i_md] = float(nv)
                    if not dec_any_finite and dec_key in md:
                        val = md.get(dec_key)
                        nv = _normalize_coord(val, False, dec_key)
                        if np.isfinite(nv):
                            dec_array[i_md] = float(nv)
                    # Debug first few rows
                    if i_md < 3:
                        try:
                            logger.info(f"[catalog-binary-raw] row {i_md} meta RA '{ra_key}'='{md.get(ra_key, None)}' DEC '{dec_key}'='{md.get(dec_key, None)}' -> RAdeg={ra_array[i_md]:.6f} DECdeg={dec_array[i_md]:.6f}")
                        except Exception:
                            pass
                try:
                    ra_any_finite = np.isfinite(ra_array).any()
                    dec_any_finite = np.isfinite(dec_array).any()
                except Exception:
                    pass

        # 5) Boolean columns for UI (computed once, cached with table)
        boolean_columns = []
        if len(table) > 0:
            for col_name in table.colnames:
                col = table[col_name]
                dt = getattr(col, "dtype", None)
                if dt is None:
                    continue
                if dt.kind == 'b':
                    boolean_columns.append(col_name)
                elif dt.kind in ('i', 'u'):
                    try:
                        unique_vals = np.unique(col[:min(len(col), 100)])
                        if np.all(np.isin(unique_vals, [0, 1])):
                            boolean_columns.append(col_name)
                    except Exception:
                        pass
                elif dt.kind in ('S', 'U'):
                    try:
                        sample_vals = np.char.lower(col[:10].astype(str))
                        tf_vals = ['true', 'false', 't', 'f', 'yes', 'no', 'y', 'n', '1', '0']
                        if np.any(np.isin(sample_vals, tf_vals)):
                            boolean_columns.append(col_name)
                    except Exception:
                        pass

        # 6) Header + page
        header = {
            "version": 1,
            "catalog_name": catalog_name,
            "boolean_columns": boolean_columns,
            "num_records": int(end_idx - start_idx),
            "pagination": {
                "page": page,
                "limit": limit,
                "total_items": int(total_filtered),
                "total_pages": (int(total_filtered) + limit - 1) // limit,
                "has_next": end_idx < int(total_filtered),
                "has_prev": page > 1
            },
            "field_info": {
                "ra": {"dtype": "float64", "offset": 0},
                "dec": {"dtype": "float64", "offset": 8},
                "x_pixels": {"dtype": "float32", "offset": 16},
                "y_pixels": {"dtype": "float32", "offset": 20},
                "radius_pixels": {"dtype": "float32", "offset": 24},
                "metadata": {"dtype": "json", "offset": 28}
            },
            "record_size": 28,
            "column_names": list(table.colnames if requested_cols is None else requested_cols),
        }

        buf = BytesIO()
        header_json = json.dumps(header).encode('utf-8')
        buf.write(struct.pack('<I', len(header_json)))
        buf.write(header_json)

        # 7) Write page records
        for i in range(end_idx - start_idx):
            buf.write(struct.pack('<d', float(ra_array[i])))
            buf.write(struct.pack('<d', float(dec_array[i])))
            buf.write(struct.pack('<f', float(x_array[i])))
            buf.write(struct.pack('<f', float(y_array[i])))
            buf.write(struct.pack('<f', float(radius_array[i])))
            safe_md = {k: sanitize(v) for k, v in metadata_list[i].items()}
            meta_json = json.dumps(safe_md, separators=(',', ':'), allow_nan=False).encode('utf-8')
            buf.write(struct.pack('<I', len(meta_json)))
            buf.write(meta_json)

        binary_data = buf.getvalue()

        # 8) gzip if large
        accept_encoding = request.headers.get('accept-encoding', '')
        if 'gzip' in accept_encoding and len(binary_data) > 5000:
            gz_buf = BytesIO()
            with gzip.GzipFile(fileobj=gz_buf, mode='wb', compresslevel=6) as gz:
                gz.write(binary_data)
            binary_data = gz_buf.getvalue()
            return Response(
                content=binary_data,
                media_type="application/octet-stream",
                headers={"Content-Encoding": "gzip", "X-Catalog-Format": "binary-v1-raw"}
            )

        return Response(content=binary_data, media_type="application/octet-stream",
                        headers={"X-Catalog-Format": "binary-v1-raw"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in catalog_binary_raw: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/catalog-binary/{catalog_name:path}")
async def catalog_binary(
    request: Request,
    catalog_name: str,
    prevent_auto_load: bool = Query(False),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(5000, ge=1, le=10000, description="Items per page"),
    search: Optional[str] = Query(None, description="Search term for filtering"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order"),
    columns: Optional[str] = Query(None, description="Comma-separated list of columns to return"),
    filters: Optional[str] = Query(None, description="JSON string of column filters"),
    stats: bool = Query(False, description="Include column statistics"),
    ra_col: Optional[str] = Query(None, description="Override RA column name"),
    dec_col: Optional[str] = Query(None, description="Override DEC column name"),
    size_col: Optional[str] = Query(None, description="Override size/radius column name"),
):
    """
    Return catalog data in binary format for faster transfer.
    
    Binary format structure:
    - Header (JSON metadata as UTF-8 bytes, length prefixed)
    - Data section with fixed-size records
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)
    # Resolve uploaded paths as well (e.g., files/uploads/...) like /catalog-columns
    try:
        base_dir = Path(".").resolve()
        direct = base_dir / catalog_name
        in_catalogs = base_dir / CATALOGS_DIRECTORY / catalog_name
        in_files = base_dir / FILES_DIRECTORY / catalog_name
        in_uploads = base_dir / UPLOADS_DIRECTORY / catalog_name
        if direct.is_file():
            # load_catalog_data below expects a full path string; we still need table for boolean columns
            catalogs_dir = base_dir
        elif in_catalogs.is_file():
            catalogs_dir = base_dir / CATALOGS_DIRECTORY
        elif in_uploads.is_file():
            catalogs_dir = base_dir / UPLOADS_DIRECTORY
        elif in_files.is_file():
            catalogs_dir = base_dir / FILES_DIRECTORY
    except Exception:
        pass
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

        # Extract boolean columns (same logic as before)
        boolean_columns = []
        if len(catalog_table) > 0:
            for col_name in catalog_table.colnames:
                col = catalog_table[col_name]
                if col.dtype.kind == 'b':
                    boolean_columns.append(col_name)
                elif col.dtype.kind in ('i', 'u'):
                    unique_vals = np.unique(col[:min(len(col), 100)])
                    if np.all(np.isin(unique_vals, [0, 1])):
                        boolean_columns.append(col_name)
                elif col.dtype.kind in ('S', 'U'):
                    try:
                        sample_vals = np.char.lower(col[:10].astype(str))
                        true_false_vals = ['true', 'false', 't', 'f', 'yes', 'no', 'y', 'n', '1', '0']
                        if np.any(np.isin(sample_vals, true_false_vals)):
                            boolean_columns.append(col_name)
                    except (TypeError, ValueError):
                        continue

        if prevent_auto_load:
            return JSONResponse(content={"boolean_columns": boolean_columns})

        # Load and process catalog data (use session-aware request to access current WCS/file)
        # Debug incoming query
        try:
            print(f"[catalog_binary] URL: {str(request.url)}")
            print(f"[catalog_binary] Query params: {dict(request.query_params)}")
            try:
                hdr = request.headers
                print(f"[catalog_binary] Header overrides: X-RA-Col={hdr.get('x-ra-col')} X-DEC-Col={hdr.get('x-dec-col')} X-Size-Col={hdr.get('x-size-col')}")
                try:
                    # Print a compact view of header keys for debugging
                    hk = list(hdr.keys())
                    print(f"[catalog_binary] Header keys: {hk[:15]}{' ...' if len(hk)>15 else ''}")
                except Exception:
                    pass
                # Also print raw ASGI headers for verification
                try:
                    raw_headers = request.scope.get('headers') or []
                    sample = [(k.decode('latin1'), v.decode('latin1')) for k, v in raw_headers[:10]]
                    print(f"[catalog_binary] Raw headers sample: {sample}")
                except Exception:
                    pass
            except Exception:
                pass
        except Exception:
            pass

        # Attach overrides onto request by adding to query params is messy; instead we pass through request
        # and load_catalog_data will read overrides from request.query_params directly.
        # Build full path for loader
        full_path = (Path(str(catalogs_dir)) / catalog_name)
        catalog_data = load_catalog_data(str(full_path), request=request)
        if not catalog_data:
            logger.warning(f"/catalog-binary: No in-bounds objects for {catalog_name}; returning empty result")
            catalog_data = []

        # Convert to numpy arrays for efficient processing
        # Define core numeric fields that will be sent as binary
        numeric_fields = ['ra', 'dec', 'x_pixels', 'y_pixels', 'radius_pixels']
        
        # Prepare data arrays
        num_items = len(catalog_data)
        ra_array = np.zeros(num_items, dtype=np.float64)
        dec_array = np.zeros(num_items, dtype=np.float64)
        x_array = np.zeros(num_items, dtype=np.float32)
        y_array = np.zeros(num_items, dtype=np.float32)
        radius_array = np.zeros(num_items, dtype=np.float32)
        
        # Additional metadata for each object (stored as JSON strings)
        metadata_list = []
        
        # Helpers to robustly normalize RA/DEC to degrees
        def _parse_sexagesimal(s: str, is_ra: bool) -> float:
            try:
                parts = str(s).strip().split(':')
                if len(parts) < 2:
                    return float('nan')
                a0 = float(parts[0]); a1 = float(parts[1] or 0); a2 = float(parts[2] or 0)
                sign = -1.0 if a0 < 0 else 1.0
                a0 = abs(a0)
                val = a0 + a1/60.0 + a2/3600.0
                if is_ra:
                    return sign * val * 15.0
                return sign * val
            except Exception:
                return float('nan')

        def _get_ci(d: dict, candidates) -> tuple:
            if not isinstance(d, dict):
                return (None, None)
            lower_map = {k.lower(): k for k in d.keys()}
            for c in candidates:
                k = lower_map.get(c.lower())
                if k is not None:
                    return (k, d[k])
            return (None, None)

        def _normalize_coord(val, is_ra: bool, col_name: str = None) -> float:
            try:
                # string sexagesimal
                if isinstance(val, str):
                    out = _parse_sexagesimal(val, is_ra)
                    if np.isfinite(out):
                        return out
                    # try as float string
                    fv = float(val)
                    val = fv
                # numeric
                if isinstance(val, (int, float, np.number)):
                    v = float(val)
                    if not np.isfinite(v):
                        return float('nan')
                    # radians
                    if abs(v) <= (2*np.pi + 1e-6):
                        return v * (180.0/np.pi)
                    # hours for RA
                    if is_ra:
                        name = (col_name or '').lower()
                        if ('hms' in name) or ('hour' in name) or (0.0 <= v <= 24.0):
                            return v * 15.0
                    return v
            except Exception:
                return float('nan')
            return float('nan')

        for i, item in enumerate(catalog_data):
            # Start with direct fields if present
            ra_val = item.get('ra', None)
            dec_val = item.get('dec', None)

            # If missing or zero/non-finite, try alternate column names from the same dict
            if not isinstance(ra_val, (int, float)) or not np.isfinite(float(ra_val)) or float(ra_val) == 0.0:
                k, v = _get_ci(item, RA_COLUMN_NAMES)
                if k is not None:
                    ra_val = _normalize_coord(v, True, k)
            else:
                ra_val = _normalize_coord(ra_val, True, 'ra')
            if not isinstance(dec_val, (int, float)) or not np.isfinite(float(dec_val)) or float(dec_val) == 0.0:
                k, v = _get_ci(item, DEC_COLUMN_NAMES)
                if k is not None:
                    dec_val = _normalize_coord(v, False, k)
            else:
                dec_val = _normalize_coord(dec_val, False, 'dec')

            ra_array[i] = float(ra_val) if np.isfinite(ra_val) else 0.0
            dec_array[i] = float(dec_val) if np.isfinite(dec_val) else 0.0

            # Debug: log first few normalization results
            if i < 3:
                try:
                    logger.info(f"[catalog-binary] row {i} RA raw={item.get('ra', None)} DEC raw={item.get('dec', None)} -> RAdeg={ra_array[i]:.6f} DECdeg={dec_array[i]:.6f}")
                except Exception:
                    pass
            x_array[i] = item.get('x_pixels', 0.0)
            y_array[i] = item.get('y_pixels', 0.0)
            radius_array[i] = item.get('radius_pixels', 5.0)
            
            # Store other fields as metadata
            metadata = {k: v for k, v in item.items() 
                       if k not in numeric_fields}
            metadata_list.append(metadata)
        
        # Apply filters if needed
        mask = np.ones(num_items, dtype=bool)
        
        if search:
            # Simple text search in metadata
            search_lower = search.lower()
            for i, meta in enumerate(metadata_list):
                if not any(search_lower in str(v).lower() for v in meta.values()):
                    mask[i] = False
        
        if filters:
            # Apply advanced filters
            try:
                filter_dict = json.loads(filters)
                # Apply filter logic here...
            except json.JSONDecodeError:
                pass
        
        # Apply mask
        filtered_indices = np.where(mask)[0]
        
        # Apply sorting if requested
        if sort_by:
            if sort_by == 'ra':
                sort_indices = np.argsort(ra_array[filtered_indices])
            elif sort_by == 'dec':
                sort_indices = np.argsort(dec_array[filtered_indices])
            else:
                # For other fields, need to sort based on metadata
                sort_values = []
                for idx in filtered_indices:
                    val = metadata_list[idx].get(sort_by, 0)
                    try:
                        sort_values.append(float(val))
                    except (ValueError, TypeError):
                        sort_values.append(0)
                sort_indices = np.argsort(sort_values)
            
            if sort_order == 'desc':
                sort_indices = sort_indices[::-1]
            
            filtered_indices = filtered_indices[sort_indices]
        
        # Apply pagination
        total_filtered = len(filtered_indices)
        start_idx = (page - 1) * limit
        end_idx = min(start_idx + limit, total_filtered)
        page_indices = filtered_indices[start_idx:end_idx]
        
        # Prepare binary data
        binary_buffer = BytesIO()
        
        # Create header with metadata
        header = {
            "version": 1,
            "catalog_name": catalog_name,
            "boolean_columns": boolean_columns,
            "num_records": len(page_indices),
            "pagination": {
                "page": page,
                "limit": limit,
                "total_items": total_filtered,
                "total_pages": (total_filtered + limit - 1) // limit,
                "has_next": end_idx < total_filtered,
                "has_prev": page > 1
            },
            "field_info": {
                "ra": {"dtype": "float64", "offset": 0},
                "dec": {"dtype": "float64", "offset": 8},
                "x_pixels": {"dtype": "float32", "offset": 16},
                "y_pixels": {"dtype": "float32", "offset": 20},
                "radius_pixels": {"dtype": "float32", "offset": 24},
                "metadata": {"dtype": "json", "offset": 28}
            },
            "record_size": 28  # bytes for numeric data
        }
        
        # Write header
        header_json = json.dumps(header).encode('utf-8')
        binary_buffer.write(struct.pack('<I', len(header_json)))  # 4 bytes for header length
        binary_buffer.write(header_json)
        
        # Write binary data for each record
        for idx in page_indices:
            # Pack numeric data (28 bytes total)
            binary_buffer.write(struct.pack('<d', float(ra_array[idx])))        # 8 bytes
            binary_buffer.write(struct.pack('<d', float(dec_array[idx])))       # 8 bytes
            binary_buffer.write(struct.pack('<f', x_array[idx]))         # 4 bytes
            binary_buffer.write(struct.pack('<f', y_array[idx]))         # 4 bytes
            binary_buffer.write(struct.pack('<f', radius_array[idx]))    # 4 bytes
            
            # Pack metadata as length-prefixed JSON
            meta_json = json.dumps(metadata_list[idx]).encode('utf-8')
            binary_buffer.write(struct.pack('<I', len(meta_json)))       # 4 bytes for length
            binary_buffer.write(meta_json)
        
        # Get binary data
        binary_data = binary_buffer.getvalue()
        
        # Compress if client accepts gzip and data is large
        accept_encoding = request.headers.get('accept-encoding', '')
        if 'gzip' in accept_encoding and len(binary_data) > 5000:
            compressed_buffer = BytesIO()
            with gzip.GzipFile(fileobj=compressed_buffer, mode='wb', compresslevel=6) as gz:
                gz.write(binary_data)
            binary_data = compressed_buffer.getvalue()
            
            return Response(
                content=binary_data,
                media_type="application/octet-stream",
                headers={
                    "Content-Encoding": "gzip",
                    "X-Catalog-Format": "binary-v1"
                }
            )
        
        return Response(
            content=binary_data,
            media_type="application/octet-stream",
            headers={
                "X-Catalog-Format": "binary-v1"
            }
        )
        
    except Exception as e:
        logger.error(f"Error in catalog_binary: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing catalog: {str(e)}")
        
        
             
@app.get("/catalog-with-flags/{catalog_name:path}")
async def catalog_with_flags(
    request: Request,
    catalog_name: str, 
    prevent_auto_load: bool = Query(False),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(5000, ge=1, le=10000, description="Items per page"),
    search: Optional[str] = Query(None, description="Search term for filtering"),
    sort_by: Optional[str] = Query(None, description="Column to sort by"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="Sort order"),
    columns: Optional[str] = Query(None, description="Comma-separated list of columns to return"),
    filters: Optional[str] = Query(None, description="JSON string of column filters"),
    stats: bool = Query(False, description="Include column statistics"),
    ra_col: Optional[str] = Query(None, description="Override RA column name"),
    dec_col: Optional[str] = Query(None, description="Override DEC column name"),
    size_col: Optional[str] = Query(None, description="Override size/radius column name")
):
    """
    Return catalog data with advanced filtering, pagination, and TopCat-like features (session-scoped).
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

        boolean_columns = []
        if len(catalog_table) > 0:
            for col_name in catalog_table.colnames:
                col = catalog_table[col_name]
                if col.dtype.kind == 'b':
                    boolean_columns.append(col_name)
                elif col.dtype.kind in ('i', 'u'):
                    unique_vals = np.unique(col[:min(len(col), 100)])
                    if np.all(np.isin(unique_vals, [0, 1])):
                        boolean_columns.append(col_name)
                elif col.dtype.kind in ('S', 'U'):
                    try:
                        sample_vals = np.char.lower(col[:10].astype(str))
                        true_false_vals = ['true', 'false', 't', 'f', 'yes', 'no', 'y', 'n', '1', '0']
                        if np.any(np.isin(sample_vals, true_false_vals)):
                            boolean_columns.append(col_name)
                    except (TypeError, ValueError):
                        continue

        if prevent_auto_load:
            return JSONResponse(content={"boolean_columns": boolean_columns})

        # load_catalog_data reads overrides directly from request.query_params
        # Allow absolute or files/... paths
        path_arg = catalog_name
        try:
            base_dir = Path('.') .resolve()
            direct = base_dir / catalog_name
            if direct.is_file():
                path_arg = str(direct)
            else:
                path_arg = str((catalogs_dir / catalog_name))
        except Exception:
            path_arg = str((catalogs_dir / catalog_name))
        catalog_data = load_catalog_data(path_arg, request=request)
        if not catalog_data:
            raise HTTPException(status_code=500, detail="Failed to process catalog. An image with WCS may be required for full data.")

        full_data = table_to_serializable(catalog_table)
        catalog_data_map = {f"{item['ra']:.6f}": item for item in catalog_data}
        for item in full_data:
            ra_key = f"{item.get('ra', ''):.6f}"
            if ra_key in catalog_data_map:
                item.update(catalog_data_map[ra_key])
        
        total_items = len(full_data)
        filtered_data = apply_advanced_filters(full_data, search, filters)
        filtered_total = len(filtered_data)
        
        if sort_by and filtered_data:
            filtered_data = apply_sorting(filtered_data, sort_by, sort_order)
        
        if columns and filtered_data:
            selected_columns = [col.strip() for col in columns.split(',')]
            available_columns = list(filtered_data[0].keys())
            valid_columns = [col for col in selected_columns if col in available_columns]
            if valid_columns:
                filtered_data = [{col: item.get(col) for col in valid_columns} for item in filtered_data]
        
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_data = filtered_data[start_idx:end_idx]
        total_pages = (filtered_total + limit - 1) // limit
        
        response_data = {
            "catalog_data": paginated_data,
            "boolean_columns": boolean_columns,
            "pagination": {
                "page": page,
                "limit": limit,
                "total_items": filtered_total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
                "showing_start": start_idx + 1 if paginated_data else 0,
                "showing_end": min(end_idx, filtered_total)
            },
            "filters": {
                "search": search,
                "sort_by": sort_by,
                "sort_order": sort_order,
                "active_filters": filters
            },
            "message": f"Catalog loaded with flags (page {page} of {total_pages})"
        }
        
        response_size = len(json.dumps(response_data, separators=(',', ':')))
        accept_encoding = request.headers.get('accept-encoding', '')
        if 'gzip' in accept_encoding and response_size > 5000:
            return create_safe_compressed_response(response_data)
        
        return JSONResponse(content=response_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing catalog with flags: {str(e)}")
def apply_advanced_filters(data: List[Dict], search: Optional[str], filters: Optional[str]) -> List[Dict]:
    """Apply search and advanced column filters to data."""
    filtered_data = data
    
    # Apply search filter
    if search:
        search_term = search.lower()
        filtered_data = []
        for item in data:
            if any(search_term in str(value).lower() for value in item.values()):
                filtered_data.append(item)
    
    # Apply advanced filters
    if filters:
        try:
            filter_dict = json.loads(filters)
            for column, filter_config in filter_dict.items():
                filtered_data = apply_column_filter(filtered_data, column, filter_config)
        except json.JSONDecodeError:
            logger.warning(f"Invalid filter JSON: {filters}")
    
    return filtered_data
def apply_column_filter(data: List[Dict], column: str, filter_config: Dict) -> List[Dict]:
    """Apply filter to a specific column."""
    if not data or column not in data[0]:
        return data
    
    filter_type = filter_config.get('type', 'contains')
    filter_value = filter_config.get('value')
    
    if filter_value is None:
        return data
    
    filtered = []
    for item in data:
        value = item.get(column)
        if value is None:
            continue
            
        try:
            if filter_type == 'contains':
                if str(filter_value).lower() in str(value).lower():
                    filtered.append(item)
            elif filter_type == 'equals':
                if str(value) == str(filter_value):
                    filtered.append(item)
            elif filter_type == 'greater_than':
                if float(value) > float(filter_value):
                    filtered.append(item)
            elif filter_type == 'less_than':
                if float(value) < float(filter_value):
                    filtered.append(item)
            elif filter_type == 'range':
                min_val = filter_config.get('min')
                max_val = filter_config.get('max')
                val = float(value)
                if (min_val is None or val >= float(min_val)) and \
                   (max_val is None or val <= float(max_val)):
                    filtered.append(item)
        except (ValueError, TypeError):
            continue
    
    return filtered


def apply_sorting(data: List[Dict], sort_by: str, sort_order: str) -> List[Dict]:
    """Apply sorting to data."""
    if not data or sort_by not in data[0]:
        return data
    
    try:
        # Try numeric sort first
        return sorted(
            data,
            key=lambda x: float(x.get(sort_by, 0)) if x.get(sort_by) is not None else 0,
            reverse=(sort_order == "desc")
        )
    except (ValueError, TypeError):
        # Fall back to string sort
        return sorted(
            data,
            key=lambda x: str(x.get(sort_by, "")),
            reverse=(sort_order == "desc")
        )


def calculate_column_stats(data: List[Dict]) -> Dict[str, Dict]:
    """Calculate basic statistics for each column."""
    if not data:
        return {}
    
    stats = {}
    columns = data[0].keys()
    
    for col in columns:
        values = [item.get(col) for item in data if item.get(col) is not None]
        if not values:
            continue
            
        col_stats = {"count": len(values)}
        
        # Try to calculate numeric stats
        try:
            numeric_values = [float(v) for v in values]
            col_stats.update({
                "min": min(numeric_values),
                "max": max(numeric_values),
                "mean": sum(numeric_values) / len(numeric_values),
                "type": "numeric"
            })
        except (ValueError, TypeError):
            # String/categorical stats
            unique_values = list(set(str(v) for v in values))
            col_stats.update({
                "unique_count": len(unique_values),
                "unique_values": unique_values[:10],  # First 10 unique values
                "type": "categorical"
            })
        
        stats[col] = col_stats
    
    return stats


def create_safe_compressed_response(data: Dict[Any, Any]) -> Response:
    """Create a properly compressed response that avoids content-length issues."""
    try:
        # Serialize to JSON with minimal separators
        json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        json_bytes = json_str.encode('utf-8')
        
        # Compress the JSON
        compressed_data = gzip.compress(json_bytes)
        
        # Create response with proper headers - don't set Content-Length for gzip
        response = Response(
            content=compressed_data,
            media_type="application/json",
            headers={
                'Content-Encoding': 'gzip',
                'Vary': 'Accept-Encoding',
                'X-Original-Size': str(len(json_bytes)),
                'X-Compression-Ratio': f"{len(compressed_data) / len(json_bytes):.2f}"
            }
        )
        
        return response
        
    except Exception as e:
        logger.warning(f"Compression failed: {e}, falling back to uncompressed")
        return JSONResponse(content=data)


@app.get("/catalog-metadata/{catalog_name:path}")
async def catalog_metadata(catalog_name: str):
    """
    Return comprehensive catalog metadata similar to TopCat's table info.
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)  # Updated
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

        # Extract detailed column information
        columns_info = []
        for col_name in catalog_table.colnames:
            col = catalog_table[col_name]
            col_info = {
                "name": col_name,
                "dtype": str(col.dtype),
                "kind": col.dtype.kind,
                "is_numeric": col.dtype.kind in ('i', 'u', 'f', 'c'),
                "is_boolean": col.dtype.kind == 'b',
                "is_string": col.dtype.kind in ('S', 'U', 'O'),
                "unit": getattr(col, 'unit', None),
                "description": getattr(col, 'description', ''),
                "format": getattr(col, 'format', None)
            }
            
            # Add sample values and basic stats
            if len(catalog_table) > 0:
                try:
                    sample_size = min(10, len(col))
                    sample_values = col[:sample_size]
                    
                    col_info["sample_values"] = [str(v) for v in sample_values]
                    
                    # Basic statistics for numeric columns
                    if col_info["is_numeric"]:
                        try:
                            valid_data = col[~np.isnan(col.astype(float))]
                            if len(valid_data) > 0:
                                col_info["stats"] = {
                                    "min": float(np.min(valid_data)),
                                    "max": float(np.max(valid_data)),
                                    "mean": float(np.mean(valid_data)),
                                    "std": float(np.std(valid_data)),
                                    "null_count": len(col) - len(valid_data)
                                }
                        except:
                            pass
                    
                    # Unique value info for categorical columns
                    elif col_info["is_string"] or col_info["is_boolean"]:
                        try:
                            unique_vals = np.unique(col[:100])  # Sample for performance
                            col_info["unique_info"] = {
                                "unique_count": len(unique_vals),
                                "unique_sample": [str(v) for v in unique_vals[:5]]
                            }
                        except:
                            pass
                            
                except Exception as e:
                    logger.warning(f"Error processing column {col_name}: {e}")
                    col_info["sample_values"] = []
            
            columns_info.append(col_info)

        # Table-level metadata
        table_info = {
            "catalog_name": catalog_name,
            "total_rows": len(catalog_table),
            "total_columns": len(catalog_table.colnames),
            "columns": columns_info,
            "column_names": catalog_table.colnames,
            "memory_usage_mb": catalog_table.nbytes / (1024 * 1024) if hasattr(catalog_table, 'nbytes') else None,
            "table_meta": dict(catalog_table.meta) if hasattr(catalog_table, 'meta') else {}
        }

        return JSONResponse(content=table_info)

    except Exception as e:
        logger.error(f"Error getting catalog metadata: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting catalog metadata: {str(e)}")


@app.get("/catalog-metadata/")
async def catalog_metadata_query(catalog_name: str = Query(..., description="Catalog path or name (supports files/uploads)") ):
    return await catalog_metadata(catalog_name)



@app.get("/catalog-column-analysis/{catalog_name:path}/{column_name}")
async def catalog_column_analysis(catalog_name: str, column_name: str, sample_size: int = Query(CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE)):  # Updated
    """
    Provide detailed analysis of a specific column, similar to TopCat's column info.
    """
    catalogs_dir = Path(CATALOGS_DIRECTORY)  # Updated
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

        if column_name not in catalog_table.colnames:
            raise HTTPException(status_code=400, detail=f"Column '{column_name}' not found in catalog.")

        col_data = catalog_table[column_name]
        
        # Sample data for analysis
        data_size = len(col_data)
        if data_size > sample_size:
            # Random sampling for better representation
            indices = np.random.choice(data_size, sample_size, replace=False)
            sample_data = col_data[indices]
        else:
            sample_data = col_data
        
        analysis = {
            "column_name": column_name,
            "total_rows": data_size,
            "sample_size": len(sample_data),
            "dtype": str(col_data.dtype),
            "unit": str(getattr(col_data, 'unit', '')),
            "description": str(getattr(col_data, 'description', ''))
        }

        # Numeric analysis
        if col_data.dtype.kind in ('i', 'u', 'f'):
            try:
                valid_data = sample_data[~np.isnan(sample_data.astype(float))]
                if len(valid_data) > 0:
                    analysis["numeric_stats"] = {
                        "count": len(valid_data),
                        "null_count": len(sample_data) - len(valid_data),
                        "min": float(np.min(valid_data)),
                        "max": float(np.max(valid_data)),
                        "mean": float(np.mean(valid_data)),
                        "median": float(np.median(valid_data)),
                        "std": float(np.std(valid_data)),
                        "q25": float(np.percentile(valid_data, 25)),
                        "q75": float(np.percentile(valid_data, 75)),
                        "histogram": calculate_histogram(valid_data)
                    }
            except Exception as e:
                analysis["error"] = f"Error calculating numeric stats: {str(e)}"
        
        # Categorical analysis
        else:
            try:
                str_data = [str(x) for x in sample_data]
                unique_values, counts = np.unique(str_data, return_counts=True)
                
                # Sort by frequency
                sorted_indices = np.argsort(counts)[::-1]
                unique_values = unique_values[sorted_indices]
                counts = counts[sorted_indices]
                
                analysis["categorical_stats"] = {
                    "unique_count": len(unique_values),
                    "most_common": [
                        {"value": str(val), "count": int(count)} 
                        for val, count in zip(unique_values[:20], counts[:20])
                    ],
                    "diversity_index": len(unique_values) / len(sample_data) if len(sample_data) > 0 else 0
                }
            except Exception as e:
                analysis["error"] = f"Error calculating categorical stats: {str(e)}"

        return JSONResponse(content=analysis)

    except Exception as e:
        logger.error(f"Error analyzing column: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing column: {str(e)}")

def calculate_histogram(data, bins=CATALOG_ANALYSIS_HISTOGRAM_BINS):  # Updated
    """Calculate histogram data for numeric columns."""
    try:
        counts, bin_edges = np.histogram(data, bins=bins)
        return {
            "bins": [float(x) for x in bin_edges],
            "counts": [int(x) for x in counts]
        }
    except:
        return None
# Endpoint for exporting filtered data
@app.get("/catalog-export/{catalog_name}")
async def export_catalog_data(
    catalog_name: str,
    format: str = Query(DEFAULT_EXPORT_FORMAT, regex="^(csv|json|fits)$"),
    search: Optional[str] = Query(None),
    filters: Optional[str] = Query(None),
    columns: Optional[str] = Query(None),
    max_rows: int = Query(MAX_EXPORT_ROWS, le=50000)
):
    """
    Export catalog data in various formats with applied filters.
    """
    # This would implement export functionality
    # For now, return a placeholder
    return JSONResponse(content={
        "message": f"Export functionality for {format} format",
        "catalog_name": catalog_name,
        "applied_filters": {"search": search, "filters": filters, "columns": columns},
        "max_rows": max_rows
    })

@app.get("/file-size/{filepath:path}")
async def get_file_size(filepath: str):
    """Get the size of a file in the files directory."""
    try:
        # Base directory is "files"
        base_dir = Path(FILES_DIRECTORY)  # Updated
        
        # Construct the full path
        file_path = base_dir / filepath
        
        # Ensure the file exists
        if not file_path.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"File not found: {filepath}"}
            )
        
        # Ensure the file is within the files directory (security check)
        if ".." in Path(filepath).parts:
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
import json
from fastapi import Form
from fastapi.responses import JSONResponse

# Helper function to load catalog as Astropy Table
from astropy.table import Table # Ensure Table is imported


from typing import Union, Optional
from urllib.parse import unquote
from pathlib import Path
from astropy.table import Table
from astropy.io import fits

def get_astropy_table_from_catalog(catalog_name: str, catalogs_dir_path: Path) -> Optional[Table]:
   # Resolve path intelligently: allow references under 'files/...', absolute paths, or catalogs/
   # Use CWD as base to be consistent with other endpoints
   base_dir = Path(".").resolve()
   norm_name = unquote(str(catalog_name)).replace('\\', '/').strip()
   if norm_name.startswith(f"{FILES_DIRECTORY}/"):
       catalog_file_path_as_is = base_dir / norm_name
   elif Path(catalog_name).is_absolute():
       catalog_file_path_as_is = Path(catalog_name)
   else:
       # Default to catalogs directory
       catalog_file_path_as_is = catalogs_dir_path / catalog_name
   
   if catalog_file_path_as_is.exists():
       catalog_file_path = catalog_file_path_as_is
       print(f"[get_astropy_table_from_catalog] Found catalog file directly: {catalog_file_path}")
   else:
       # If not found, try replacing spaces with '+' (common for URL-decoded query params)
       catalog_name_with_plus = catalog_name.replace(' ', '+')
       # Rebuild with the same base used above
       if norm_name.startswith(f"{FILES_DIRECTORY}/"):
           catalog_file_path_with_plus = base_dir / catalog_name_with_plus
       elif Path(catalog_name_with_plus).is_absolute():
           catalog_file_path_with_plus = Path(catalog_name_with_plus)
       else:
           catalog_file_path_with_plus = catalogs_dir_path / catalog_name_with_plus
       if catalog_file_path_with_plus.exists():
           catalog_file_path = catalog_file_path_with_plus
           print(f"[get_astropy_table_from_catalog] Found catalog file by replacing spaces with '+': {catalog_file_path}")
       else:
           # If still not found, report the original attempt (with spaces) as not existing
           print(f"[get_astropy_table_from_catalog] Catalog file {catalog_file_path_as_is} (and with '+' replacements) does not exist.")
           return None # Original failure path

   try:
       with fits.open(catalog_file_path) as hdul:
           table_hdu_index = -1
           # Prefer BinTableHDU, search all HDUs
           for i, hdu_item in enumerate(hdul):
               if isinstance(hdu_item, fits.BinTableHDU):
                   table_hdu_index = i
                   print(f"[get_astropy_table_from_catalog] Found BinTableHDU for '{catalog_name}' at index {i}.")
                   break
           
           if table_hdu_index == -1: # Fallback if no BinTableHDU
               if len(hdul) > 1 and isinstance(hdul[1], (fits.TableHDU, fits.BinTableHDU)): # Common for catalogs to be in HDU 1
                   table_hdu_index = 1
                   print(f"[get_astropy_table_from_catalog] No BinTableHDU found, using HDU 1 for '{catalog_name}'.")
               elif isinstance(hdul[0], (fits.TableHDU, fits.BinTableHDU)): # If primary HDU is a table
                   table_hdu_index = 0
                   print(f"[get_astropy_table_from_catalog] No BinTableHDU found, using Primary HDU 0 for '{catalog_name}'.")
               else: # Search all HDUs for any TableHDU as a last resort
                   for i, hdu_item in enumerate(hdul):
                       if isinstance(hdu_item, fits.TableHDU):
                           table_hdu_index = i
                           print(f"[get_astropy_table_from_catalog] Found TableHDU for '{catalog_name}' at index {i} (fallback).")
                           break
                   if table_hdu_index == -1:
                       print(f"[get_astropy_table_from_catalog] No suitable TableHDU or BinTableHDU found in '{catalog_name}'.")
                       return None
           print(f"[get_astropy_table_from_catalog] Loading Astropy Table from '{catalog_name}', HDU index {table_hdu_index}")
           table = Table(hdul[table_hdu_index].data)
           return table
   except Exception as e:
       print(f"[get_astropy_table_from_catalog] Error loading catalog '{catalog_name}' as Astropy Table: {e}")
       import traceback
       traceback.print_exc()
       return None
# Helper function similar to parse_jwst_wcs from peak_finder.py
def _prepare_jwst_header_for_wcs(header):
    """
    Prepares a FITS header for WCS processing, especially for JWST files.
    - Handles potential conflicts between PC and CD matrix keywords.
    - If CD matrix is present, it's preferred and PC keywords are removed.
    - If only PC matrix is present, ensures off-diagonal terms are set (defaulting to 0).
    """
    new_header = header.copy()
    
    return new_header
def analyze_wcs_orientation(header, data=None):
    """
    Analyze WCS header to determine coordinate system orientation and optionally flip data
    
    Parameters:
    -----------
    header : astropy.io.fits.Header
        FITS header containing WCS information
    data : numpy.ndarray, optional
        Image data array to flip if Y-axis is inverted
        
    Returns:
    --------
    flip_y : bool
        True if Y-axis is flipped (dy should be multiplied by -1)
    determinant : float
        Determinant of the transformation matrix
    flipped_data : numpy.ndarray or None
        Flipped data array if data was provided and flip was needed, otherwise None
    """
    
    try:
        # Get coordinate system types for reference
        ctype1 = header.get('CTYPE1', '').strip()
        ctype2 = header.get('CTYPE2', '').strip()
        
        print(f"Coordinate types: CTYPE1={ctype1}, CTYPE2={ctype2}")
        
        # Get transformation matrix elements
        # Check for both CD matrix and PC matrix formats
        if 'CD1_1' in header:
            # CD matrix format
            cd11 = header.get('CD1_1', 0)
            cd12 = header.get('CD1_2', 0)
            cd21 = header.get('CD2_1', 0)
            cd22 = header.get('CD2_2', 0)
            print(f"Using CD matrix: CD11={cd11}, CD12={cd12}, CD21={cd21}, CD22={cd22}")
        elif 'PC1_1' in header:
            # PC matrix format with CDELT
            pc11 = header.get('PC1_1', 1)
            pc12 = header.get('PC1_2', 0)
            pc21 = header.get('PC2_1', 0)
            pc22 = header.get('PC2_2', 1)
            cdelt1 = header.get('CDELT1', 1)
            cdelt2 = header.get('CDELT2', 1)
            
            # Convert PC matrix to CD matrix
            cd11 = pc11 * cdelt1
            cd12 = pc12 * cdelt1
            cd21 = pc21 * cdelt2
            cd22 = pc22 * cdelt2
            print(f"Using PC matrix: PC11={pc11}, PC12={pc12}, PC21={pc21}, PC22={pc22}")
            print(f"CDELT1={cdelt1}, CDELT2={cdelt2}")
            print(f"Equivalent CD matrix: CD11={cd11}, CD12={cd12}, CD21={cd21}, CD22={cd22}")
        else:
            # Simple CDELT format (like ALMA)
            cdelt1 = header.get('CDELT1', 1)
            cdelt2 = header.get('CDELT2', 1)
            cd11 = cdelt1
            cd12 = 0
            cd21 = 0
            cd22 = cdelt2
            print(f"Using simple CDELT format: CDELT1={cdelt1}, CDELT2={cdelt2}")
            print(f"Equivalent CD matrix: CD11={cd11}, CD12={cd12}, CD21={cd21}, CD22={cd22}")
        
        # Calculate determinant
        determinant = cd11 * cd22 - cd12 * cd21
        print(f"Transformation matrix determinant: {determinant}")
        
        # Initialize flip decision based on WCS properties
        flip_y = False
        
        # Primary logic: check determinant for coordinate system handedness
        if determinant < 0:
            print("Negative determinant detected: coordinate system is flipped")
            flip_y = True
        else:
            print("Positive determinant: standard coordinate system orientation")
            flip_y = False
        
        # Secondary check: CD22 sign (Y-axis direction)
        if cd22 < 0:
            print("CD22 is negative: Y-axis is inverted")
            # If determinant was positive but CD22 is negative, we might need to flip
            if determinant > 0:
                flip_y = True
        
        # Additional check for very small determinants (near rotation singularities)
        if abs(determinant) < 1e-15:
            print("Warning: Very small determinant, coordinate system may be near singular")
            # Fall back to CD22 sign in this case
            flip_y = cd22 < 0
        
        # Additional diagnostic information
        print(f"CD22 (Y-axis scale): {cd22}")
        if cd22 < 0:
            print("CD22 is negative: Y-axis is inverted in WCS")
        else:
            print("CD22 is positive: Y-axis is normal in WCS")
        
        print(f"Final decision: flip_y = {flip_y}")
        
        # Handle data flipping if data is provided
        flipped_data = None
        if data is not None:
            if flip_y:
                flipped_data = np.flipud(data)  # Flip data upside down
                print("Applied Y-flip to image data (flipped upside down)")
            else:
                flipped_data = data.copy()  # Return copy of original data
                print("No Y-flip applied to image data")
        
        return flip_y, determinant, flipped_data
        
    except Exception as e:
        print(f"Error in analyze_wcs_orientation: {e}")
        import traceback
        print(traceback.format_exc())
        # Return standard orientation with original or copied data
        flipped_data = data.copy() if data is not None else None
        return False, 1.0, flipped_data
def load_catalog_data(catalog_path_str, request: Request = None):
    """
    Load catalog (FITS table or ASCII/CSV/TSV) and compute pixel x/y that match
    the displayed image.

    - Uses the viewer WCS if available (app.state.current_wcs_object)
    - Computes array-space pixels with origin=0
    - Applies ONLY a post-conversion vertical flip using IMAGE HEIGHT when
      analyze_wcs_orientation(...) indicates a vertical flip
    - Returns both:
        x,y                → top-left image pixels (use for drawing/OSD)
        x_bottom_left,y_bottom_left → FITS-like bottom-left pixels (use for readout)
    """
    catalog_path = Path(catalog_path_str)
    catalog_name = catalog_path.name
    print(f"load_catalog_data called for: {catalog_name}")

    try:
        catalog_data = []

        # Prefer session-scoped viewer state when available
        session_data = None
        if request is not None:
            sess = getattr(request.state, "session", None)
            if sess is not None:
                session_data = sess.data

        fits_file = (session_data.get("current_fits_file") if session_data else getattr(app.state, "current_fits_file", None))
        hdu_index = int(session_data.get("current_hdu_index", 0) if session_data else getattr(app.state, "current_hdu_index", 0))
        if not fits_file:
            print("No FITS file currently selected")
            return []

        # Prefer exact viewer WCS if present
        image_wcs = (session_data.get("current_wcs_object") if session_data else getattr(app.state, "current_wcs_object", None))
        image_height: int | None = None
        image_width: int | None = None
        flip_y = False

        # Determine flip_y and image_height from the displayed image
        try:
            with fits.open(fits_file) as hdul:
                if not (0 <= hdu_index < len(hdul)):
                    hdu_index = 0

                image_hdu = hdul[hdu_index]
                if not (hasattr(image_hdu, 'data') and image_hdu.data is not None and image_hdu.data.ndim >= 2):
                    image_hdu = next(
                        (h for h in hdul if hasattr(h, 'data') and h.data is not None and len(getattr(h, 'shape', ())) >= 2),
                        None
                    )
                if image_hdu is None:
                    print("No image HDU found in FITS file")
                    return []

                fy, _, _ = analyze_wcs_orientation(image_hdu.header, image_hdu.data)
                flip_y = bool(fy)
                # IMPORTANT: vertical flip uses the number of rows (height)
                image_height = int(image_hdu.data.shape[-2])
                image_width = int(image_hdu.data.shape[-1])

                if image_wcs is None:
                    try:
                        wcs_header = _prepare_jwst_header_for_wcs(image_hdu.header)
                    except Exception:
                        wcs_header = image_hdu.header
                    image_wcs = WCS(wcs_header)
            # Reduce to celestial (2D) WCS if header contains extra axes (e.g., spectral, Stokes)
            try:
                if image_wcs is not None:
                    if hasattr(image_wcs, 'celestial'):
                        image_wcs = image_wcs.celestial
                    else:
                        # Fallback for older astropy
                        image_wcs = image_wcs.sub(['celestial'])
            except Exception:
                # If subsetting fails, leave image_wcs as-is; downstream guard handles errors
                pass
        except Exception as e:
            print(f"WCS/init error: {e}")
            image_wcs = None

        # Column mapping must come from explicit overrides only
        ra_col = dec_col = resolution_col = None

        # Allow one-shot override via query params or headers (highest precedence)
        try:
            if request is not None and hasattr(request, 'query_params'):
                qp = request.query_params
                ra_override = qp.get('ra_col')
                dec_override = qp.get('dec_col')
                res_override = qp.get('size_col') or qp.get('resolution_col')
                if ra_override:
                    ra_col = ra_override
                if dec_override:
                    dec_col = dec_override
                if res_override:
                    resolution_col = res_override
            # Header-based fallback (in case query params were stripped by caller)
            if request is not None and hasattr(request, 'headers'):
                hdr = request.headers
                ra_hdr = hdr.get('x-ra-col')
                dec_hdr = hdr.get('x-dec-col')
                res_hdr = hdr.get('x-size-col') or hdr.get('x-resolution-col')
                if ra_hdr and not ra_col:
                    ra_col = ra_hdr
                if dec_hdr and not dec_col:
                    dec_col = dec_hdr
                if res_hdr and not resolution_col:
                    resolution_col = res_hdr
            # Ultimate fallback: inspect ASGI raw headers (bytes)
            if request is not None and hasattr(request, 'scope') and isinstance(request.scope, dict):
                try:
                    raw_headers = request.scope.get('headers') or []
                    # headers are list of (key: bytes, value: bytes)
                    for k_b, v_b in raw_headers:
                        try:
                            k = k_b.decode('latin1').lower()
                            v = v_b.decode('latin1')
                        except Exception:
                            continue
                        if not ra_col and k == 'x-ra-col' and v:
                            ra_col = v
                        elif not dec_col and k == 'x-dec-col' and v:
                            dec_col = v
                        elif not resolution_col and (k == 'x-size-col' or k == 'x-resolution-col') and v:
                            resolution_col = v
                except Exception:
                    pass
        except Exception:
            pass

        # Require explicit RA/Dec via overrides
        if not ra_col or not dec_col:
            print("[load_catalog_data] Missing required RA/Dec overrides (ra_col/dec_col).")
            return []

        rows = None
        lower_cols = []

        if catalog_path.suffix.lower() in ('.fits', '.fit'):
            with fits.open(catalog_path) as hdul:
                table_hdus = [h for h in hdul if isinstance(h, fits.BinTableHDU) or isinstance(h, fits.TableHDU)]
                if not table_hdus:
                    print("No table found in FITS catalog")
                    return []

                from astropy.table import Table  # local import to ensure symbol is defined in this branch

                def _normalize_colname(name):
                    try:
                        if isinstance(name, (bytes, bytearray)):
                            return name.decode('utf-8', errors='ignore')
                        return str(name)
                    except Exception:
                        return str(name)

                def lower_map_for(tbl):
                    return { _normalize_colname(c).strip().lower(): _normalize_colname(c) for c in getattr(tbl, 'colnames', []) }

                selected_tbl = None
                selected_ra = ra_col
                selected_dec = dec_col
                selected_res = resolution_col

                # 1) If overrides provided, pick an HDU that contains them
                try:
                    print(f"[load_catalog_data] Overrides -> ra_col={ra_col} dec_col={dec_col} size_col={resolution_col}")
                except Exception:
                    pass
                if ra_col or dec_col or resolution_col:
                    for h in table_hdus:
                        try:
                            tmp_tbl = Table(h.data)
                            lm = lower_map_for(tmp_tbl)
                            try:
                                print(f"[load_catalog_data] HDU cols: {list(lm.values())[:10]} ... total={len(lm)}")
                            except Exception:
                                pass
                            ok = True
                            if ra_col and ra_col.lower() not in lm:
                                ok = False
                            if dec_col and dec_col.lower() not in lm:
                                ok = False
                            if resolution_col and resolution_col.lower() not in lm:
                                ok = False
                            if ok:
                                selected_tbl = tmp_tbl
                                selected_ra = lm.get(ra_col.lower()) if ra_col else None
                                selected_dec = lm.get(dec_col.lower()) if dec_col else None
                                selected_res = lm.get(resolution_col.lower()) if resolution_col else None
                                break
                        except Exception:
                            continue

                if selected_tbl is None:
                    print("[load_catalog_data] Specified RA/Dec columns not found in any FITS table HDU.")
                    return []

                table = selected_tbl
                rows = table
                lower_cols = [str(c).strip().lower() for c in table.colnames]
                ra_col = selected_ra
                dec_col = selected_dec
                resolution_col = selected_res
        else:
            from astropy.table import Table
            try:
                table = Table.read(catalog_path, format='ascii')
            except Exception:
                try:
                    table = Table.read(catalog_path, format='csv')
                except Exception:
                    table = Table.read(catalog_path, format='tab')

            rows = table
            lower_cols = [str(c).strip().lower() for c in table.colnames]

            # Validate required columns exist using overrides only
            if ra_col.lower() not in lower_cols or dec_col.lower() not in lower_cols:
                print("[load_catalog_data] Specified RA/Dec columns not found in ASCII/CSV catalog.")
                return []
            # Map to actual column names with original case
            ra_col = table.colnames[lower_cols.index(ra_col.lower())]
            dec_col = table.colnames[lower_cols.index(dec_col.lower())]
            if resolution_col and resolution_col.lower() in lower_cols:
                resolution_col = table.colnames[lower_cols.index(resolution_col.lower())]
            else:
                resolution_col = None

        # Build objects
        def _to_py(v):
            try:
                if hasattr(v, 'item'):
                    return v.item()
                if isinstance(v, (bytes, bytearray)):
                    return v.decode('utf-8', errors='ignore')
                # Handle masked values by treating masked as NaN
                try:
                    import numpy.ma as ma
                    if ma.isMaskedArray(v):
                        return float('nan') if bool(getattr(v, 'mask', False)) else _to_py(v.data)
                except Exception:
                    pass
                return v
            except Exception:
                return None
        def _parse_sexagesimal(s: str, is_ra: bool) -> float:
            try:
                import re
                txt = str(s).strip().lower()
                nums = re.findall(r'[+-]?\d+(?:\.\d+)?', txt)
                if not nums:
                    return float('nan')
                a0 = float(nums[0])
                a1 = float(nums[1]) if len(nums) > 1 else 0.0
                a2 = float(nums[2]) if len(nums) > 2 else 0.0
                sign = -1.0 if a0 < 0 else 1.0
                a0 = abs(a0)
                val = a0 + a1/60.0 + a2/3600.0
                if is_ra:
                    return sign * val * 15.0
                return sign * val
            except Exception:
                return float('nan')

        def _normalize_coord(val, is_ra: bool, col_name: str | None = None) -> float:
            try:
                # Astropy Quantity with units
                try:
                    from astropy import units as u  # local import to avoid top-level dependency issues
                    if hasattr(val, 'unit') and getattr(val, 'unit') is not None:
                        q = val
                        # Convert any angle unit (including hourangle, rad) to degrees
                        try:
                            deg_val = q.to(u.deg)
                            return float(deg_val.value)
                        except Exception:
                            # If direct to deg fails, try hourangle -> deg explicitly
                            try:
                                deg_val = (q.to(u.hourangle)).to(u.deg)
                                return float(deg_val.value)
                            except Exception:
                                pass
                except Exception:
                    pass

                # string sexagesimal or general string
                if isinstance(val, str):
                    out = _parse_sexagesimal(val, is_ra)
                    if np.isfinite(out):
                        return out
                    # try numeric string
                    val = float(val)
                # numpy scalars
                if hasattr(val, 'item'):
                    val = val.item()
                if isinstance(val, (int, float, np.number)):
                    v = float(val)
                    if not np.isfinite(v):
                        return float('nan')
                    # radians
                    if abs(v) <= (2*np.pi + 1e-6):
                        return v * (180.0/np.pi)
                    # hours for RA
                    if is_ra:
                        name = (col_name or '').lower()
                        if ('hms' in name) or ('hour' in name) or (0.0 <= v <= 24.0):
                            return v * 15.0
                    return v
            except Exception:
                return float('nan')
            return float('nan')
        if catalog_path.suffix.lower() in ('.fits', '.fit'):
            for r in rows:
                try:
                    ra_raw = _to_py(r[ra_col])
                    dec_raw = _to_py(r[dec_col])
                    ra = _normalize_coord(ra_raw, True, ra_col)
                    dec = _normalize_coord(dec_raw, False, dec_col)
                    if not (np.isfinite(ra) and np.isfinite(dec)):
                        continue
                    obj = {'ra': ra, 'dec': dec, 'x': 0.0, 'y': 0.0, 'radius_pixels': 5.0}
                    # Attach galaxy name if present in the table under common column names
                    try:
                        galaxy_col_candidates = [c for c in getattr(table, 'colnames', []) if str(c).strip().lower() in [n.lower() for n in RGB_GALAXY_COLUMN_NAMES]]
                        if galaxy_col_candidates:
                            gcol = galaxy_col_candidates[0]
                            gval = _to_py(r[gcol])
                            if gval is not None and str(gval).strip() != "":
                                obj['galaxy_name'] = str(gval).strip()
                                # Also mirror the original column name to ease frontend access if they expect exact key
                                obj[str(gcol)] = str(gval).strip()
                    except Exception:
                        pass
                    if resolution_col and resolution_col in table.colnames:
                        try:
                            rv = float(_to_py(r[resolution_col]))
                            if np.isfinite(rv) and rv > 0:
                                obj['radius_pixels'] = rv
                        except Exception:
                            pass
                    catalog_data.append(obj)
                except Exception:
                    pass
        else:
            for r in rows:
                try:
                    ra_raw = _to_py(r[ra_col])
                    dec_raw = _to_py(r[dec_col])
                    ra = _normalize_coord(ra_raw, True, ra_col)
                    dec = _normalize_coord(dec_raw, False, dec_col)
                    if not (np.isfinite(ra) and np.isfinite(dec)):
                        continue
                    obj = {'ra': ra, 'dec': dec, 'x': 0.0, 'y': 0.0, 'radius_pixels': 5.0}
                    # Attach galaxy name if present in the table under common column names
                    try:
                        galaxy_col_candidates = [c for c in getattr(rows, 'colnames', []) if str(c).strip().lower() in [n.lower() for n in RGB_GALAXY_COLUMN_NAMES]]
                        if galaxy_col_candidates:
                            gcol = galaxy_col_candidates[0]
                            gval = _to_py(r[gcol])
                            if gval is not None and str(gval).strip() != "":
                                obj['galaxy_name'] = str(gval).strip()
                                obj[str(gcol)] = str(gval).strip()
                    except Exception:
                        pass
                    if resolution_col and resolution_col in rows.colnames:
                        try:
                            rv = float(_to_py(r[resolution_col]))
                            if np.isfinite(rv) and rv > 0:
                                obj['radius_pixels'] = rv
                        except Exception:
                            pass
                    catalog_data.append(obj)
                except Exception:
                    pass

        # If parsing produced no objects, return early with a clear log
        if not catalog_data:
            print(f"[load_catalog_data] Parsed 0 objects from '{catalog_name}' using RA='{ra_col}' DEC='{dec_col}'.")
            return []

        # RA/Dec → pixels (origin=0), then apply vertical flip using HEIGHT if required
        if image_wcs is not None and image_wcs.has_celestial and catalog_data:
            try:
                ra_arr = np.array([o['ra'] for o in catalog_data])
                dec_arr = np.array([o['dec'] for o in catalog_data])

                px, py = image_wcs.all_world2pix(ra_arr, dec_arr, 0)  # origin=0 (array coords)

                keep = []
                for i, o in enumerate(catalog_data):
                    xi = float(px[i]); yi = float(py[i])

                    # Top-left frame used for drawing (matches OSD/tile frame)
                    y_tl = (float(image_height) - yi - 1.0) if (flip_y and image_height is not None) else yi
                    x_tl = xi

                    # Bottom-left (FITS-like) readout, if needed
                    y_bl = (float(image_height) - 1.0 - y_tl) if image_height is not None else np.nan
                    x_bl = x_tl

                    in_bounds = (
                        np.isfinite(x_tl) and np.isfinite(y_tl) and
                        image_width is not None and image_height is not None and
                        (0.0 <= x_tl < float(image_width)) and (0.0 <= y_tl < float(image_height))
                    )

                    if in_bounds:
                        o['x'] = x_tl
                        o['y'] = y_tl

                        o['x_bottom_left'] = x_bl
                        o['y_bottom_left'] = y_bl
                        keep.append(True)
                    else:
                        keep.append(False)

                catalog_data = [o for o, k in zip(catalog_data, keep) if k]
                print(f"WCS conversion kept {len(catalog_data)} objects in-bounds")
            except Exception as e:
                print(f"WCS conversion failed: {e}")
                for o in catalog_data:
                    o['x'] = np.nan; o['y'] = np.nan
                    o['x_bottom_left'] = np.nan; o['y_bottom_left'] = np.nan
        else:
            if image_wcs is None or not getattr(image_wcs, 'has_celestial', False):
                print("No valid WCS; marking x/y as NaN")
            for o in catalog_data:
                o['x'] = np.nan; o['y'] = np.nan
                o['x_bottom_left'] = np.nan; o['y_bottom_left'] = np.nan

        print(f"Final loaded object count for {catalog_name}: {len(catalog_data)}")
        for obj in catalog_data:
            obj['x'] = obj['x']+1
            obj['y'] = obj['y']+1
            obj['x_bottom_left'] = obj['x_bottom_left']+1
            obj['y_bottom_left'] = obj['y_bottom_left']+1
        return catalog_data

    except Exception as e:
        print(f"Error loading catalog {catalog_name}: {e}")
        import traceback; print(traceback.format_exc())
        return []

        
def create_display_rgb(r_data, g_data, b_data, stretch_class=None, 
                      q_min=RGB_DISPLAY_DEFAULT_Q_MIN, q_max=RGB_DISPLAY_DEFAULT_Q_MAX, 
                      panel_type=RGB_PANEL_TYPE_DEFAULT, source_index=0):
    """
    Creates an RGB image for display using scaling that matches your original astronomical code.
    
    Parameters:
    - r_data, g_data, b_data: Input data arrays (order: F814W, F555W, F438W for HST)
    - stretch_class: Ignored, kept for compatibility
    - q_min, q_max: Percentile cuts for scaling
    - panel_type: "hst", "nircam", "miri", or "default" for instrument-specific scaling
    - source_index: Used to determine which max percentile values to use (0 for first source, others for rest)
    
    Returns:
    - RGB image as uint8 array ready for display
    """
    
    if r_data is None and g_data is None and b_data is None:
        return None
    
    # Find reference shape
    ref_shape = next((d.shape for d in [r_data, g_data, b_data] if d is not None), None)
    if ref_shape is None:
        return None

    # Initialize RGB image - note the shape order matches your original
    rgb_image = np.zeros((ref_shape[1], ref_shape[0], RGB_IMAGE_CHANNELS), dtype=np.float32)
    
    # Handle different panel types with different scaling approaches
    if panel_type.lower() == RGB_PANEL_TYPE_HST:
        # HST-specific scaling - EXACTLY matching your original code
        # Your original: hst_rgb order is [F438W, F555W, F814W] (indices 0, 1, 2)
        # Your mapping: r_data=F814W, g_data=F555W, b_data=F438W
        hst_rgb = [b_data, g_data, r_data]  # Reorder to match your original [F438W, F555W, F814W]
        
        # Calculate max values exactly like your original code
        max_hst2 = np.percentile(hst_rgb[2], RGB_DISPLAY_HST_FIRST_SOURCE_MAX_PERCENTILE)  # F814W
        max_hst1 = np.percentile(hst_rgb[1], RGB_DISPLAY_HST_FIRST_SOURCE_MAX_PERCENTILE)  # F555W  
        max_hst0 = np.percentile(hst_rgb[0], RGB_DISPLAY_HST_FIRST_SOURCE_MAX_PERCENTILE)  # F438W

        # Red channel (gets F814W data)
        if hst_rgb[2] is not None:
            channel_copy = hst_rgb[2].astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_RED] = linear(channel_copy, 
                                                     scale_min=np.percentile(channel_copy, RGB_DISPLAY_HST_MIN_PERCENTILE), 
                                                     scale_max=max_hst2)
        
        # Green channel (gets F555W data)  
        if hst_rgb[1] is not None:
            channel_copy = hst_rgb[1].astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_GREEN] = linear(channel_copy, 
                                                       scale_min=np.percentile(channel_copy, RGB_DISPLAY_HST_MIN_PERCENTILE), 
                                                       scale_max=max_hst1)
        
        # Blue channel (gets F438W data)
        if hst_rgb[0] is not None:
            channel_copy = hst_rgb[0].astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_BLUE] = linear(channel_copy, 
                                                      scale_min=np.percentile(channel_copy, RGB_DISPLAY_HST_MIN_PERCENTILE), 
                                                      scale_max=max_hst0)
            
    elif panel_type.lower() == RGB_PANEL_TYPE_NIRCAM:
        # NIRCam scaling - matching your original approach
        # Order: F360M (r), F335M (g), F300M (b)
        nircam_rgb = [b_data, g_data, r_data]  # Reorder to match [F300M, F335M, F360M]
        
        # Calculate max values for NIRCam
        max_nircam2 = np.percentile(nircam_rgb[2], RGB_DISPLAY_NIRCAM_MAX_PERCENTILE)  # F360M
        max_nircam1 = np.percentile(nircam_rgb[1], RGB_DISPLAY_NIRCAM_MAX_PERCENTILE)  # F335M
        max_nircam0 = np.percentile(nircam_rgb[0], RGB_DISPLAY_NIRCAM_MAX_PERCENTILE)  # F300M
        print(max_nircam2,max_nircam1,max_nircam0)
        
        # Apply scaling: R gets F360M, G gets F335M, B gets F300M
        if nircam_rgb[2] is not None:  # F360M -> Red
            channel_copy = nircam_rgb[2].astype(np.float32, copy=True)
            # channel_copy[np.isinf(channel_copy)] = np.nan
            # channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_RED] = linear(channel_copy, 
                                                     scale_min=np.percentile(channel_copy, RGB_DISPLAY_NIRCAM_MIN_PERCENTILE), 
                                                     scale_max=max_nircam2)
        
        if nircam_rgb[1] is not None:  # F335M -> Green
            channel_copy = nircam_rgb[1].astype(np.float32, copy=True)
            # channel_copy[np.isinf(channel_copy)] = np.nan
            # channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_GREEN] = linear(channel_copy, 
                                                       scale_min=np.percentile(channel_copy, RGB_DISPLAY_NIRCAM_MIN_PERCENTILE), 
                                                       scale_max=max_nircam1)
        
        if nircam_rgb[0] is not None:  # F300M -> Blue
            channel_copy = nircam_rgb[0].astype(np.float32, copy=True)
            # channel_copy[np.isinf(channel_copy)] = np.nan
            # channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_BLUE] = linear(channel_copy, 
                                                      scale_min=np.percentile(channel_copy, RGB_DISPLAY_NIRCAM_MIN_PERCENTILE), 
                                                      scale_max=max_nircam0)
            
    elif panel_type.lower() == RGB_PANEL_TYPE_MIRI:
        # MIRI scaling - matching your original approach  
        # Order: F2100W (r), F1000W (g), F770W (b)
        miri_rgb = [b_data, g_data, r_data]  # Reorder to match [F770W, F1000W, F2100W]
        
        # Apply scaling: R gets F2100W, G gets F1000W, B gets F770W
        if miri_rgb[2] is not None:  # F2100W -> Red
            channel_copy = miri_rgb[2].astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_RED] = linear(channel_copy, 
                                                     scale_min=np.percentile(channel_copy, RGB_DISPLAY_MIRI_MIN_PERCENTILE), 
                                                     scale_max=np.percentile(channel_copy, RGB_DISPLAY_MIRI_MAX_PERCENTILE))
        
        if miri_rgb[1] is not None:  # F1000W -> Green
            channel_copy = miri_rgb[1].astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_GREEN] = linear(channel_copy, 
                                                       scale_min=np.percentile(channel_copy, RGB_DISPLAY_MIRI_MIN_PERCENTILE), 
                                                       scale_max=np.percentile(channel_copy, RGB_DISPLAY_MIRI_MAX_PERCENTILE))
        
        if miri_rgb[0] is not None:  # F770W -> Blue
            channel_copy = miri_rgb[0].astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            rgb_image[:, :, RGB_CHANNEL_BLUE] = linear(channel_copy, 
                                                      scale_min=np.percentile(channel_copy, RGB_DISPLAY_MIRI_MIN_PERCENTILE), 
                                                      scale_max=np.percentile(channel_copy, RGB_DISPLAY_MIRI_MAX_PERCENTILE))
            
    else:
        # Default scaling for other cases
        channels = [r_data, g_data, b_data]
        
        for i, data_channel in enumerate(channels):
            if data_channel is None:
                continue
                
            if data_channel.shape != ref_shape:
                continue
            
            # Clean the data
            channel_copy = data_channel.astype(np.float32, copy=True)
            channel_copy[np.isinf(channel_copy)] = np.nan
            channel_copy[np.isnan(channel_copy)] = RGB_DISPLAY_NAN_REPLACEMENT_VALUE
            
            if not np.any(np.isfinite(channel_copy)) or np.all(channel_copy == 0):
                continue
            
            # Use provided percentiles
            scale_min = np.percentile(channel_copy, q_min)
            scale_max = np.percentile(channel_copy, q_max)
            
            # Apply linear scaling
            scaled_channel = linear(channel_copy, scale_min=scale_min, scale_max=scale_max)
            rgb_image[:, :, i] = scaled_channel

    # Convert to 8-bit image for display
    return (rgb_image * RGB_DISPLAY_OUTPUT_SCALE_FACTOR).astype(np.uint8)
# Function to add "Data N/A" text to an axes
def plot_data_na(ax, title=""):
    ax.text(0.5, 0.5, "Data N/A", ha='center', va='center', fontsize=10, color='#bbbbbb')
    ax.set_title(title, fontsize=9, color='lightgray', pad=4)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_facecolor('#2c2c2c')
    for spine in ax.spines.values():
        spine.set_edgecolor('#444444')




# Add this import at the top of your main.py file with other imports
from astropy.nddata.utils import NoOverlapError


def _find_and_extract_cutout_via_glob(
    base_search_path: str,
    filter_identifiers: list[str],
    ra: float,
    dec: float,
    cutout_size_arcsec: float,
    display_filter_name: str,
    exclude_patterns: list[str] = None,
    galaxy_name: str | None = None
):
    """
    Finds a FITS file using glob patterns and extracts cutout data.
    - Recursively searches under base_search_path (files/**)
    - If galaxy_name is provided, only considers files whose path includes a matching galaxy token
      (handles variants like 'ngc628', 'ngc0628', 'ngc628mosaic', etc.)
    """
    import re

    if exclude_patterns is None:
        exclude_patterns = []

    def build_galaxy_tokens(name: str) -> list[str]:
        if not name:
            return []
        g = name.strip().lower()
        if not g or g in ("unknown", "unknowngalaxy"):
            return []
        base = re.sub(r'[\s_\-]+', '', g)
        tokens = {g, base}
        m = re.match(r'([a-z]+)\s*0*(\d+)', base)
        if m:
            prefix, digits = m.group(1), m.group(2)
            tokens.add(f"{prefix}{digits}")             # ngc628
            tokens.add(f"{prefix}{digits.zfill(4)}")    # ngc0628
            tokens.add(f"{prefix}0{digits}")            # ngc0628 (single zero variant)
        return list(tokens)

    galaxy_tokens = build_galaxy_tokens(galaxy_name) if galaxy_name else []

    matching_files = []
    for ident in filter_identifiers:
        ident_lower = ident.lower()
        patterns = [tmpl.format(base_dir=base_search_path, needle=ident_lower) for tmpl in RGB_FILE_SEARCH_PATTERNS]
        # Add targeted galaxy+identifier patterns for each token
        for tok in galaxy_tokens:
            for tmpl in RGB_TOKEN_EXTEND_TEMPLATES:
                patterns.append(tmpl.format(base_dir=base_search_path, token=tok, needle=ident_lower))

        for pattern in patterns:
            found = glob.glob(pattern, recursive=True)
            if found:
                filtered_found = []
                for file_path in found:
                    filename = os.path.basename(file_path).lower()
                    norm_path = str(file_path).replace('\\', '/').lower()
                    # Always exclude anything under uploads directory by path
                    if '/files/uploads/' in norm_path or '/uploads/' in norm_path:
                        print(f"Cutout [{display_filter_name}]: Excluding {file_path} (in uploads folder)")
                        continue
                    # Exclude by patterns (match against both filename and full path)
                    should_exclude = any(excl.lower() in filename or excl.lower() in norm_path for excl in exclude_patterns)
                    if not should_exclude:
                        filtered_found.append(file_path)
                    else:
                        print(f"Cutout [{display_filter_name}]: Excluding {file_path} (matches exclude pattern)")
                matching_files.extend(filtered_found)

    # Deduplicate while preserving order
    matching_files = list(dict.fromkeys(matching_files))

    # If galaxy_name provided, strictly restrict to that galaxy using any token
    if galaxy_tokens:
        galaxy_only = [f for f in matching_files if any(tok in f.lower() for tok in galaxy_tokens)]
        if not galaxy_only:
            print(f"Cutout [{display_filter_name}]: No FITS file found for galaxy='{galaxy_name}' using identifiers {filter_identifiers}")
            return None, None
        matching_files = galaxy_only

    if not matching_files:
        excluded_info = f" (after excluding patterns: {exclude_patterns})" if exclude_patterns else ""
        print(f"Cutout [{display_filter_name}]: No FITS file found using identifiers {filter_identifiers} in {base_search_path}{excluded_info}")
        return None, None

    fits_file_path = matching_files[0] if RGB_USE_FIRST_MATCH else matching_files[-1]
    print(f"Cutout [{display_filter_name}]: Using FITS file {fits_file_path}")

    try:
        with fits.open(fits_file_path) as hdul:
            for hdu_idx, hdu in enumerate(hdul):
                if hdu.data is not None and hasattr(hdu.data, 'shape') and len(hdu.data.shape) >= 2:
                    try:
                        header = hdu.header.copy()
                        if any(tag.upper() in display_filter_name.upper() for tag in RGB_WCS_PREP_FILTERS):
                            header = _prepare_jwst_header_for_wcs(header)

                        wcs = WCS(header)
                        if RGB_SKIP_NON_CELESTIAL_WCS and not wcs.has_celestial:
                            print(f"Cutout [{display_filter_name}]: WCS for {fits_file_path} (HDU {hdu_idx}) lacks celestial. Skipping HDU.")
                            continue

                        image_data_full = hdu.data
                        if image_data_full.ndim == 3:
                            image_data_full = image_data_full[0, :, :]
                        elif image_data_full.ndim == 4:
                            image_data_full = image_data_full[0, 0, :, :]
                        elif image_data_full.ndim != 2:
                            print(f"Cutout [{display_filter_name}]: HDU {hdu_idx} has unsupported {image_data_full.ndim} dimensions. Skipping HDU.")
                            continue

                        if np.isnan(ra) or np.isinf(ra) or np.isnan(dec) or np.isinf(dec):
                            print(f"Cutout [{display_filter_name}]: Invalid RA/Dec ({ra}, {dec}). Cannot create cutout.")
                            return None, None

                        target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg, frame='icrs')
                        # Pre-validate that target transforms to finite pixel coords for this WCS
                        try:
                            px, py = wcs.world_to_pixel(target_coord)
                            if not (np.isfinite(px) and np.isfinite(py)):
                                print(f"Cutout [{display_filter_name}]: world->pixel produced non-finite ({px}, {py}); skipping HDU {hdu_idx}")
                                continue
                        except Exception as _w2p_e:
                            print(f"Cutout [{display_filter_name}]: world->pixel failed for HDU {hdu_idx}: {_w2p_e}")
                            continue
                        try:
                            cutout_obj = Cutout2D(
                                image_data_full,
                                target_coord,
                                cutout_size_arcsec * u.arcsec,
                                wcs=wcs,
                                mode=RGB_CUTOUT_MODE,
                                fill_value=RGB_CUTOUT_FILL_VALUE
                            )
                        except NoOverlapError:
                            print(f"Cutout [{display_filter_name}]: Target position (RA={ra:.4f}, Dec={dec:.4f}) is outside image coverage area")
                            return None, None

                        cutout_data = cutout_obj.data.copy()
                        cutout_wcs_header = cutout_obj.wcs.to_header()
                        cutout_wcs_header['NAXIS1'] = cutout_data.shape[1]
                        cutout_wcs_header['NAXIS2'] = cutout_data.shape[0]
                        cutout_wcs_header['NAXIS'] = 2
                        print(f"Cutout [{display_filter_name}]: Successfully extracted from HDU {hdu_idx}, shape {cutout_data.shape}")
                        return cutout_data, cutout_wcs_header

                    except NoOverlapError:
                        print(f"Cutout [{display_filter_name}]: Target position (RA={ra:.4f}, Dec={dec:.4f}) is outside image coverage area")
                        return None, None
                    except Exception as wcs_cutout_e:
                        print(f"Cutout [{display_filter_name}]: Error processing HDU {hdu_idx} in {fits_file_path}: {wcs_cutout_e}")
                        if not isinstance(wcs_cutout_e, NoOverlapError):
                            import traceback
                            print(f"Traceback for HDU processing error [{display_filter_name}]:")
                            traceback.print_exc()
                        continue

            print(f"Cutout [{display_filter_name}]: No suitable HDU found in {fits_file_path}")
            return None, None

    except FileNotFoundError:
        print(f"Cutout [{display_filter_name}]: FITS file {fits_file_path} not found.")
        return None, None
    except Exception as e:
        print(f"Cutout [{display_filter_name}]: Error opening or processing FITS file {fits_file_path}: {e}")
        if not isinstance(e, NoOverlapError):
            import traceback
            print(f"Traceback for FITS file processing error [{display_filter_name}]:")
            traceback.print_exc()
        return None, None
@app.get("/generate-rgb-cutouts/")
async def generate_rgb_cutouts(ra: float, dec: float, catalog_name: str, galaxy_name: str = Query("UnknownGalaxy")):
    """
    Generates a 1x4 panel of RGB and H-alpha cutouts for a given RA/Dec.
    Uses recursive file search and restricts to files for the provided galaxy_name when available.
    """
    import re
    from pathlib import Path  # Add this line here

    BASE_FITS_PATH = FILES_DIRECTORY
    print('galaxy name provided: ',galaxy_name)
    target_galaxy_name = galaxy_name

    # Try to get galaxy name from catalog (unchanged)
    try:
        catalog_table = loaded_catalogs.get(catalog_name)
        if catalog_table is None:
            print(f"RGB Cutouts: Catalog '{catalog_name}' not in cache. Loading.")
            catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
            if catalog_table is not None:
                loaded_catalogs[catalog_name] = catalog_table
            else:
                print(f"RGB Cutouts: Failed to load catalog '{catalog_name}'.")
        if catalog_table is not None:
            ra_col, dec_col = None, None
            available_cols_lower = {col.lower(): col for col in catalog_table.colnames}
            for potential_ra_name in RGB_RA_COLUMN_NAMES:
                if potential_ra_name in available_cols_lower:
                    ra_col = available_cols_lower[potential_ra_name]; break
            for potential_dec_name in RGB_DEC_COLUMN_NAMES:
                if potential_dec_name in available_cols_lower:
                    dec_col = available_cols_lower[potential_dec_name]; break
            if ra_col and dec_col:
                try:
                    table_ra = catalog_table[ra_col].astype(float)
                    table_dec = catalog_table[dec_col].astype(float)
                    ra_diff = table_ra - ra
                    ra_diff = np.where(ra_diff > 180, ra_diff - 360, ra_diff)
                    ra_diff = np.where(ra_diff < -180, ra_diff + 360, ra_diff)
                    distances = np.sqrt((ra_diff * np.cos(np.radians(dec)))**2 + (table_dec - dec)**2)
                    if len(distances) > 0:
                        closest_idx = np.argmin(distances)
                        if distances[closest_idx] < ((CUTOUT_SIZE_ARCSEC / RGB_COORDINATE_TOLERANCE_FACTOR) / 3600.0):
                            closest_obj = catalog_table[closest_idx]
                            print(RGB_GALAXY_COLUMN_NAMES)
                            for gal_col_name in RGB_GALAXY_COLUMN_NAMES:
                                try:
                                    # Resolve actual case from catalog table columns (case-insensitive)
                                    lc = gal_col_name.lower()
                                    resolved_col = available_cols_lower.get(lc)
                                    if not resolved_col:
                                        continue
                                    val = closest_obj[resolved_col]
                                    cat_galaxy_name = str(val).strip()
                                    
                                    if cat_galaxy_name and cat_galaxy_name.lower() not in RGB_INVALID_GALAXY_NAMES:
                                        target_galaxy_name = cat_galaxy_name
                                        print(f"RGB Cutouts: Galaxy name from catalog ('{resolved_col}'): {target_galaxy_name}")
                                        break
                                    else:
                                        print(f"Galaxy name '{cat_galaxy_name}' was rejected")
                                except Exception as _e:
                                    continue
                            
                except Exception as cat_e:
                    print(f"RGB Cutouts: Error processing catalog for galaxy name: {cat_e}")
    except Exception as e:
        print(f"RGB Cutouts: Error loading/processing catalog '{catalog_name}': {e}")

# Final fallback: try to parse galaxy name from the catalog_name filename if still unknown/invalid
    print('catalog name:', catalog_name)
    print('target_galaxy_name:', target_galaxy_name)
    try:
        if (target_galaxy_name=='UnknownGalaxy'):
            from pathlib import Path
            base_name = Path(str(catalog_name)).name.lower()
            print('base_name after pathlib:', base_name)
            
            # Enhanced pattern to match galaxy names with optional suffixes and delimiters (e.g., ngc628c, ngc0628, ic5332a)
            # Use lookarounds so underscores/dashes/spaces or end-of-string count as boundaries
            pattern = r"(?<![a-z0-9])(ngc|ic|m|ugc|eso|pgc|arp)\s*0*(\d+)[a-z]*?(?=[^a-z0-9]|$)"
            print('searching pattern:', pattern)
            print('in base_name:', base_name)
            
            m = re.search(pattern, base_name, re.IGNORECASE)
            print('match found:', m)
            
            if m:
                print('match groups:', m.groups())
                prefix, digits = m.group(1).lower(), m.group(2)
                print('prefix:', prefix, 'digits:', digits)
                
                # Normalize the galaxy name format
                if prefix in ['ngc', 'ic']:
                    candidate = f"{prefix.upper()}{digits.zfill(4)}"  # NGC0628, IC1623
                elif prefix == 'm':
                    candidate = f"M{digits}"  # M31, M51
                else:
                    candidate = f"{prefix.upper()}{digits}"  # UGC1234, ESO137
                
                target_galaxy_name = candidate
                print(f"RGB Cutouts: Galaxy name parsed from catalog filename: {target_galaxy_name}")
            else:
                print('No regex match found')
    except Exception as e:
        print('Exception in filename parsing:', e)
        pass

    def build_galaxy_tokens(name: str) -> list[str]:
        if not name:
            return []
        g = name.strip().lower()
        if not g or g in ("unknown", "unknowngalaxy"):
            return []
        base = re.sub(r'[\s_\-]+', '', g)
        tokens = {g, base}
        m = re.match(r'([a-z]+)\s*0*(\d+)', base)
        if m:
            prefix, digits = m.group(1), m.group(2)
            tokens.add(f"{prefix}{digits}")             # ngc628
            tokens.add(f"{prefix}{digits.zfill(4)}")    # ngc0628
            tokens.add(f"{prefix}0{digits}")            # ngc0628 variant
        return list(tokens)

    print('building galaxy tokens',target_galaxy_name)
    galaxy_tokens = build_galaxy_tokens(target_galaxy_name)

    print(f"RGB Cutouts: Generating for RA={ra}, Dec={dec}. Target Galaxy: {target_galaxy_name}")

    fig, axes_list = plt.subplots(RGB_SUBPLOT_ROWS, RGB_SUBPLOT_COLS, figsize=(RGB_FIGURE_WIDTH, RGB_FIGURE_HEIGHT))
    # Normalize axes into a flat list of Axes for consistent indexing
    if isinstance(axes_list, np.ndarray):
        try:
            axes_list = np.ravel(axes_list).tolist()
        except Exception:
            axes_list = list(axes_list.flatten())
    else:
        axes_list = [axes_list]

    plot_panels_info = [
        {
            "ax_idx": RGB_HST_PANEL_INDEX,
            "short_title": RGB_HST_SHORT_TITLE,
            "full_title": RGB_PANEL_FULL_TITLE_TEMPLATE.format(short=RGB_HST_SHORT_TITLE, galaxy=target_galaxy_name),
            "filters": {
                "r": {"id": RGB_FILTERS["HST"]["RED"][0], "name": RGB_FILTERS["HST"]["RED"][1]},
                "g": {"id": RGB_FILTERS["HST"]["GREEN"][0], "name": RGB_FILTERS["HST"]["GREEN"][1]},
                "b": {"id": RGB_FILTERS["HST"]["BLUE"][0], "name": RGB_FILTERS["HST"]["BLUE"][1]}
            }
        },
        {
            "ax_idx": RGB_NIRCAM_PANEL_INDEX,
            "short_title": RGB_NIRCAM_SHORT_TITLE,
            "full_title": RGB_PANEL_FULL_TITLE_TEMPLATE.format(short=RGB_NIRCAM_SHORT_TITLE, galaxy=target_galaxy_name),
            "filters": {
                "r": {"id": RGB_FILTERS["NIRCAM"]["RED"][0], "name": RGB_FILTERS["NIRCAM"]["RED"][1]},
                "g": {"id": RGB_FILTERS["NIRCAM"]["GREEN"][0], "name": RGB_FILTERS["NIRCAM"]["GREEN"][1]},
                "b": {"id": RGB_FILTERS["NIRCAM"]["BLUE"][0], "name": RGB_FILTERS["NIRCAM"]["BLUE"][1]}
            }
        },
        {
            "ax_idx": RGB_MIRI_PANEL_INDEX,
            "short_title": RGB_MIRI_SHORT_TITLE,
            "full_title": RGB_PANEL_FULL_TITLE_TEMPLATE.format(short=RGB_MIRI_SHORT_TITLE, galaxy=target_galaxy_name),
            "filters": {
                "r": {"id": RGB_FILTERS["MIRI"]["RED"][0], "name": RGB_FILTERS["MIRI"]["RED"][1]},
                "g": {"id": RGB_FILTERS["MIRI"]["GREEN"][0], "name": RGB_FILTERS["MIRI"]["GREEN"][1]},
                "b": {"id": RGB_FILTERS["MIRI"]["BLUE"][0], "name": RGB_FILTERS["MIRI"]["BLUE"][1]}
            }
        },
        {
            "ax_idx": RGB_HA_PANEL_INDEX,
            "short_title": RGB_HA_SHORT_TITLE,
            "full_title": RGB_HA_PANEL_FULL_TITLE_TEMPLATE.format(short=RGB_HA_SHORT_TITLE, galaxy=target_galaxy_name),
            "is_single_channel": True,
            "filters": { "ha": {"id": RGB_FILTERS["HA"][0], "name": RGB_FILTERS["HA"][1]} }
        }
    ]

    all_data_found_flags = {}
    panel_wcs_objects = [None] * len(axes_list)
    used_axes_indices: set[int] = set()

    for panel_info in plot_panels_info:
        ax_idx = int(panel_info["ax_idx"]) if panel_info.get("ax_idx") is not None else 0
        # Normalize/repair index: ensure unique and within range
        if not (0 <= ax_idx < len(axes_list)) or ax_idx in used_axes_indices:
            original = ax_idx
            # Find first free index
            for k in range(len(axes_list)):
                if k not in used_axes_indices:
                    ax_idx = k
                    break
            print(f"RGB Cutouts: adjusted ax_idx from {original} to {ax_idx} for panel {panel_info.get('short_title')}")
        used_axes_indices.add(ax_idx)
        ax = axes_list[ax_idx]
        ax.set_facecolor(RGB_PANEL_BACKGROUND_COLOR)
        ax.tick_params(axis='both', which='both', bottom=False, top=False, left=False, right=False,
                       labelbottom=False, labelleft=False)
        for spine in ax.spines.values():
            spine.set_edgecolor(RGB_PANEL_SPINE_COLOR)

        channel_data = {}
        panel_all_found = True
        current_panel_wcs = None
        data_for_shape_check = None

        instrument = None
        if panel_info["short_title"] == RGB_HST_SHORT_TITLE:
            instrument = "HST"
        elif panel_info["short_title"] == RGB_NIRCAM_SHORT_TITLE:
            instrument = "NIRCAM"
        elif panel_info["short_title"] == RGB_MIRI_SHORT_TITLE:
            instrument = "MIRI"

        exclude_patterns = RGB_FILTERS.get(instrument, {}).get("exclude_patterns", []) if instrument else []

        if panel_info.get("is_single_channel"):
            f_info = panel_info["filters"]["ha"]
            data, wcs_header = _find_and_extract_cutout_via_glob(
                BASE_FITS_PATH, f_info["id"], ra, dec, CUTOUT_SIZE_ARCSEC, f_info["name"],
                galaxy_name=target_galaxy_name
            )
            if data is not None:
                channel_data["ha"] = data
                data_for_shape_check = data
                if wcs_header:
                    try:
                        current_panel_wcs = WCS(_prepare_jwst_header_for_wcs(wcs_header))
                        if not current_panel_wcs.has_celestial: current_panel_wcs = None
                    except Exception as e:
                        print(f"Error creating WCS for panel {panel_info['short_title']}: {e}")
                        current_panel_wcs = None
            else:
                panel_all_found = False
        else:
            r_wcs_header = None
            for band in ["r", "g", "b"]:
                f_info = panel_info["filters"][band]
                data, temp_wcs_header = _find_and_extract_cutout_via_glob(
                    BASE_FITS_PATH, f_info["id"], ra, dec, CUTOUT_SIZE_ARCSEC, f_info["name"],
                    exclude_patterns=exclude_patterns, galaxy_name=target_galaxy_name
                )
                if data is not None:
                    channel_data[band] = data
                    if band == "r":
                        data_for_shape_check = data
                        if temp_wcs_header: r_wcs_header = temp_wcs_header
                else:
                    panel_all_found = False
                    break
            if panel_all_found and r_wcs_header:
                try:
                    current_panel_wcs = WCS(_prepare_jwst_header_for_wcs(r_wcs_header))
                    if not current_panel_wcs.has_celestial: current_panel_wcs = None
                except Exception as e:
                    print(f"Error creating WCS for panel {panel_info['short_title']} from R-band: {e}")
                    current_panel_wcs = None

        panel_wcs_objects[ax_idx] = current_panel_wcs
        all_data_found_flags[panel_info["full_title"]] = panel_all_found

        ax.text(RGB_TITLE_X_POSITION, RGB_TITLE_Y_POSITION, panel_info["short_title"],
                transform=ax.transAxes, fontsize=RGB_TITLE_FONT_SIZE, color=RGB_TITLE_COLOR,
                fontweight=RGB_TITLE_FONT_WEIGHT, ha='right', va='top',
                bbox=dict(facecolor=RGB_TITLE_BBOX_FACECOLOR, alpha=RGB_TITLE_BBOX_ALPHA, edgecolor='none'))

        if not panel_all_found:
            plot_data_na(ax, title="")
            print(f"RGB Cutouts: Not all data found for panel {panel_info['short_title']}")
            continue

        if panel_info.get("is_single_channel"):
            ha_data = channel_data.get("ha")
            if ha_data is not None:
                norm = simple_norm(ha_data, stretch=RGB_HA_STRETCH, percent=RGB_HA_PERCENTILE)
                ax.imshow(ha_data, origin='lower', cmap=RGB_HA_COLORMAP, norm=norm, aspect=RGB_IMSHOW_ASPECT)
        else:
            r_data, g_data, b_data = channel_data.get("r"), channel_data.get("g"), channel_data.get("b")
            if r_data is not None and g_data is not None and b_data is not None:
                if panel_info["short_title"] == RGB_HST_SHORT_TITLE:
                    rgb_image = create_display_rgb(r_data, g_data, b_data, panel_type="hst", source_index=0)
                elif panel_info["short_title"] == RGB_NIRCAM_SHORT_TITLE:
                    rgb_image = create_display_rgb(r_data, g_data, b_data, panel_type="nircam")
                elif panel_info["short_title"] == RGB_MIRI_SHORT_TITLE:
                    rgb_image = create_display_rgb(r_data, g_data, b_data, panel_type="miri")
                else:
                    rgb_image = create_display_rgb(r_data, g_data, b_data, q_min=RGB_DEFAULT_Q_MIN, q_max=RGB_DEFAULT_Q_MAX)
                if rgb_image is not None:
                    ax.imshow(rgb_image, origin='lower', aspect=RGB_IMSHOW_ASPECT)
                else:
                    print(f"Warning: RGB image creation failed for {panel_info['short_title']}")
                    plot_data_na(ax, title="")
            else:
                print(f"Warning: Missing channel data for {panel_info['short_title']} RGB panel")
                plot_data_na(ax, title="")

        retrieved_wcs = panel_wcs_objects[ax_idx]
        if retrieved_wcs and data_for_shape_check is not None:
            try:
                pixel_coords = retrieved_wcs.world_to_pixel_values(ra, dec)
                if 0 <= pixel_coords[0] < data_for_shape_check.shape[1] and 0 <= pixel_coords[1] < data_for_shape_check.shape[0]:
                    mface = RGB_MARKER_FACE_COLOR if isinstance(RGB_MARKER_FACE_COLOR, str) else 'none'
                    if mface.strip().lower() == 'none':
                        mface = 'none'
                    # Convert desired marker radius from arcsec to pixels using WCS scale
                    try:
                        from astropy.wcs.utils import proj_plane_pixel_scales
                        pixel_scales_deg = proj_plane_pixel_scales(retrieved_wcs)  # degrees/pixel for (y,x)
                        # Use mean of axes to get approx isotropic scale, convert deg->arcsec
                        arcsec_per_pixel = float(((pixel_scales_deg[0] + pixel_scales_deg[1]) / 2.0) * 3600.0)
                        radius_pixels = max(1.0, float(RGB_MARKER_SIZE) / max(arcsec_per_pixel, 1e-9))
                    except Exception:
                        # Fallback to a small visible radius if WCS scale not available
                        radius_pixels = 5.0

                    import matplotlib.patches as mpatches
                    cx, cy = pixel_coords[0], pixel_coords[1]
                    facecolor = mface if mface != 'none' else 'none'
                    edgecolor = RGB_MARKER_EDGE_COLOR
                    lw = RGB_MARKER_EDGE_WIDTH
                    sym = (RGB_MARKER_SYMBOL or 'o')

                    def add_patch(p):
                        p.set_alpha(RGB_MARKER_ALPHA)
                        ax.add_patch(p)

                    if sym == 'o':
                        add_patch(mpatches.Circle((cx, cy), radius_pixels, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                    elif sym == 's':
                        side = radius_pixels * 2
                        add_patch(mpatches.Rectangle((cx - radius_pixels, cy - radius_pixels), side, side, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                    elif sym == 'D':
                        add_patch(mpatches.RegularPolygon((cx, cy), numVertices=4, radius=radius_pixels, orientation=0.78539816339, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                    elif sym == '^':
                        add_patch(mpatches.RegularPolygon((cx, cy + radius_pixels/3), numVertices=3, radius=radius_pixels, orientation=0, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                    elif sym == 'v':
                        add_patch(mpatches.RegularPolygon((cx, cy - radius_pixels/3), numVertices=3, radius=radius_pixels, orientation=3.1415926535, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                    elif sym == 'p':
                        add_patch(mpatches.RegularPolygon((cx, cy), numVertices=5, radius=radius_pixels, orientation=-3.1415926535/2, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                    elif sym == '+':
                        ax.plot([cx - radius_pixels, cx + radius_pixels], [cy, cy], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                        ax.plot([cx, cx], [cy - radius_pixels, cy + radius_pixels], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                    elif sym == 'x':
                        ax.plot([cx - radius_pixels, cx + radius_pixels], [cy - radius_pixels, cy + radius_pixels], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                        ax.plot([cx + radius_pixels, cx - radius_pixels], [cy - radius_pixels, cy + radius_pixels], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                    elif sym == '*':
                        ax.plot([cx - radius_pixels, cx + radius_pixels], [cy, cy], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                        ax.plot([cx, cx], [cy - radius_pixels, cy + radius_pixels], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                        ax.plot([cx - radius_pixels, cx + radius_pixels], [cy - radius_pixels, cy + radius_pixels], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                        ax.plot([cx + radius_pixels, cx - radius_pixels], [cy - radius_pixels, cy + radius_pixels], color=edgecolor, linewidth=lw, alpha=RGB_MARKER_ALPHA)
                    elif sym == '.':
                        add_patch(mpatches.Circle((cx, cy), max(1.0, radius_pixels*0.35), facecolor=edgecolor if facecolor=='none' else facecolor, edgecolor=edgecolor, linewidth=lw))
                    else:
                        add_patch(mpatches.Circle((cx, cy), radius_pixels, facecolor=facecolor, edgecolor=edgecolor, linewidth=lw))
                else:
                    print(f"RA/Dec marker for {panel_info['short_title']} is outside image bounds based on WCS.")
            except Exception as e:
                print(f"Error plotting RA/Dec marker for {panel_info['short_title']}: {e}")

    plt.tight_layout(pad=RGB_TIGHT_LAYOUT_PAD, w_pad=RGB_TIGHT_LAYOUT_W_PAD, h_pad=RGB_TIGHT_LAYOUT_H_PAD)

    image_dir = Path(IMAGE_DIR)
    image_dir.mkdir(exist_ok=True)
    safe_galaxy_name = "".join(c if c in RGB_ALLOWED_FILENAME_CHARS else RGB_FILENAME_REPLACEMENT_CHAR 
                              for c in target_galaxy_name).rstrip().replace(' ', RGB_FILENAME_REPLACEMENT_CHAR)
    if not safe_galaxy_name or safe_galaxy_name.lower() == "unknown":
        safe_galaxy_name = RGB_DEFAULT_GALAXY_NAME
    
    timestamp = int(time.time())
    filename = RGB_FILENAME_TEMPLATE.format(prefix=RGB_FILENAME_PREFIX, galaxy=safe_galaxy_name, ra=ra, dec=dec, timestamp=timestamp)
    filepath = image_dir / filename

    try:
        fig.savefig(str(filepath), dpi=RGB_OUTPUT_DPI)
        plt.close(fig)
        print(f"RGB Cutout panel saved to {filepath}")
        url_path = f"/{IMAGE_DIR}/{filename}"
        return JSONResponse(content={"message": "RGB cutouts generated successfully", "url": url_path,
                                   "filename": filename, "data_found_summary": all_data_found_flags})
    except Exception as e:
        plt.close(fig)
        print(f"Error saving RGB cutouts plot: {e}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Failed to save RGB cutouts plot: {str(e)}"})

# Add this to your main.py file
import subprocess
import sys
import os
import json
from fastapi import Form
from fastapi.responses import JSONResponse

# Helper function to run the peak finder script in a blocking manner
def _run_peak_finder_blocking(
    full_file_path: str,
    pix_across_beam: float,
    min_beams: float,
    beams_to_search: float,
    delta_rms: float,
    minval_rms: float,
    edge_clip: int
):
    peak_finder_script = os.path.join(os.path.dirname(__file__), 'peak_finder.py')
    cmd = [
        sys.executable,
        peak_finder_script,
        full_file_path,
        str(pix_across_beam),
        str(min_beams),
        str(beams_to_search),
        str(delta_rms),
        str(minval_rms),
        str(edge_clip)
    ]
    print(f"Executing peak finder command: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False, # Don't raise exception on non-zero exit status
            timeout=PEAK_FINDER_TIMEOUT,  # 5-minute timeout, adjust as needed
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
    except subprocess.TimeoutExpired:
        print("Peak finder script timed out")
        return {
            "error": "Peak finder script timed out after 5 minutes",
            "ra": [], "dec": [], "source_count": 0, "status_code": 500
        }

    print(f"Peak Finder STDOUT: {result.stdout}")
    print(f"Peak Finder STDERR: {result.stderr}")
    print(f"Peak Finder return code: {result.returncode}")

    if result.returncode != 0:
        return {
            "error": f"Peak finder script failed: {result.stderr or result.stdout}",
            "ra": [], "dec": [], "source_count": 0, "status_code": 500
        }
    
    try:
        json_match = re.search(r'({.*"source_count":\s*\d+})', result.stdout, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
            output_data = json.loads(json_str)
            if not isinstance(output_data, dict) or \
               not all(k in output_data for k in ["ra", "dec", "source_count"]):
                raise ValueError("Invalid JSON structure from peak_finder.py")
            output_data["status_code"] = 200
            return output_data
        else:
            raise ValueError("No valid JSON data found in peak finder output.")
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error parsing peak_finder.py output: {e}")
        return {
            "error": f"Error parsing output from peak finder: {str(e)}", 
            "raw_output": result.stdout[:1000],
            "ra": [], "dec": [], "source_count": 0, "status_code": 500
        }



class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()


import psutil
import json

def get_system_stats_data(app_process_names=['python']):
        # CPU
    cpu_percent = psutil.cpu_percent(interval=None)  # Non-blocking

    # RAM
    ram = psutil.virtual_memory()
    ram_total_gb = ram.total / (1024**3)
    ram_available_gb = ram.available / (1024**3)
    ram_used_gb = ram_total_gb - ram_available_gb
    ram_percent_used = ram.percent

    # Disk Usage for root directory '/'
    disk = psutil.disk_usage('/')
    disk_total_gb = disk.total / (1024**3)
    disk_used_gb = disk.used / (1024**3)
    disk_free_gb = disk.free / (1024**3)
    disk_percent_used = disk.percent

    # Top processes filtered by relevance to the app
    processes = []
    # This part for process filtering remains the same
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent']):
        try:
            if app_process_names and any(name in proc.info['name'].lower() for name in app_process_names):
                if proc.info['cpu_percent'] is not None and proc.info['cpu_percent'] > 0.1:
                    processes.append({
                        'pid': proc.info['pid'],
                        'name': proc.info['name'],
                        'cpu': proc.info['cpu_percent']
                    })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    top_processes = sorted(processes, key=lambda p: p['cpu'], reverse=True)[:5]

    return {
        'cpu_percent': cpu_percent,
        'ram': {
            'total_gb': ram_total_gb,
            'available_gb': ram_available_gb,
            'used_gb': ram_used_gb,
            'percent_used': ram_percent_used,
        },
        'disk': {
            'total_gb': disk_total_gb,
            'used_gb': disk_used_gb,
            'free_gb': disk_free_gb,
            'percent_used': disk_percent_used,
        },
        'top_processes': top_processes
    }
async def system_stats_sender(manager: ConnectionManager):
    """Periodically fetches and sends system stats to all connected clients."""
    while True:
        stats_data = await get_system_stats_data()
        if stats_data:
            await manager.broadcast(json.dumps(stats_data))
        await asyncio.sleep(SYSTEM_STATS_UPDATE_INTERVAL)  # Updated from 2
@app.on_event("startup")
async def startup_event():
    # Initialize shared executor and tile render semaphore
    try:
        max_workers = int(os.getenv("TILE_EXECUTOR_WORKERS", "24"))
    except Exception:
        max_workers = 4
    try:
        render_limit = int(os.getenv("TILE_RENDER_CONCURRENCY", "24"))
    except Exception:
        render_limit = 3
    try:
        fits_limit = int(os.getenv("FITS_INIT_CONCURRENCY", "2"))
    except Exception:
        fits_limit = 2
    try:
        if not hasattr(app.state, "thread_executor") or app.state.thread_executor is None:
            app.state.thread_executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="tiles")
        if not hasattr(app.state, "tile_render_semaphore") or app.state.tile_render_semaphore is None:
            app.state.tile_render_semaphore = asyncio.Semaphore(render_limit)
        if not hasattr(app.state, "fits_init_semaphore") or app.state.fits_init_semaphore is None:
            app.state.fits_init_semaphore = asyncio.Semaphore(fits_limit)
        print(f"[startup] Thread executor (max_workers={max_workers}), tile semaphore (limit={render_limit}), fits semaphore (limit={fits_limit}) initialized")
    except Exception as _e:
        print(f"[startup] Failed to initialize executor/semaphore: {_e}")

    # Start the background task
    asyncio.create_task(system_stats_sender(manager))
    # Start uploads auto-clean worker
    try:
        asyncio.create_task(uploads_auto_clean_worker())
        print("[startup] uploads_auto_clean_worker scheduled")
    except Exception as _e:
        print(f"[startup] Failed to schedule uploads_auto_clean_worker: {_e}")
    # Seed settings_profiles.json at startup so UI click isn't required
    try:
        from settings_api import _load_store as _sp_load, _save_store as _sp_save, _get_original_defaults as _sp_defaults
        store = _sp_load() or {}
        profiles = store.setdefault("profiles", [])
        if not any(p.get("name") == "default" for p in profiles):
            profiles.append({"name": "default", "settings": _sp_defaults(), "owner_session": None})
        # Preserve last active or set default
        store.setdefault("last_active_profile", "default")
        # Ensure mapping structure exists
        store.setdefault("active_by_session", {})
        _sp_save(store)
        print("[startup] Ensured settings_profiles.json exists with default profile")
    except Exception as _e:
        print(f"[startup] Failed to seed settings profiles: {_e}")

@app.on_event("shutdown")
async def shutdown_event():
    try:
        exec_obj = getattr(app.state, "thread_executor", None)
        if exec_obj is not None:
            exec_obj.shutdown(wait=False, cancel_futures=True)
            print("[shutdown] Thread executor shut down")
    except Exception as _e:
        print(f"[shutdown] Failed to shut down executor: {_e}")
@app.websocket("/ws/system-stats")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial data immediately on connection
        # Offload initial stats fetch to a worker thread (shared executor)
        loop = asyncio.get_running_loop()
        initial_data = await loop.run_in_executor(app.state.thread_executor, get_system_stats_data)
        if initial_data:
            await websocket.send_text(json.dumps(initial_data))
            
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("Client disconnected from system stats WebSocket.")




async def system_stats_sender(manager: ConnectionManager):
    """Periodically fetches and sends system stats to all connected clients."""
    while True:
        loop = asyncio.get_running_loop()
        stats_data = await loop.run_in_executor(None, get_system_stats_data)
        if stats_data:
            await manager.broadcast(json.dumps(stats_data))
        await asyncio.sleep(SYSTEM_STATS_UPDATE_INTERVAL) # Update interval
# --- Peak Finder Background Task Management ---
PEAK_FINDER_JOBS = {}
def peak_finder_worker(job_id: str, job_state: dict, params: dict):
    """
    This function runs in a separate process to perform peak finding.
    """
    try:
        print(f"[Worker {job_id}] Starting peak finding for {params['full_file_path']}", file=sys.stderr)
        
        job_state['status'] = 'running'
        job_state['progress'] = 0
        job_state['eta'] = -1  # Use -1 to indicate "calculating..."
        start_time = time.time()

        def progress_reporter(progress, stage=""):
            # This callback is passed to the long-running task
            job_state['progress'] = progress
            job_state['stage'] = stage
            
            # --- Correct ETA Calculation ---
            if progress > 5 and progress < 100:
                elapsed = time.time() - start_time
                eta = (elapsed / progress) * (100 - progress) if progress > 0 else -1
                job_state['eta'] = round(eta)
            else:
                job_state['eta'] = -1  # Use -1 when not actively calculating

        # Call the actual peak finder (updated signature and args)
        from peak_finder import find_sources
        ra, dec, x, y, x_bl_out, y_bl_out = find_sources(
            fits_file=params['full_file_path'],
            pix_across_beam=params['pix_across_beam'],
            min_beams=params['min_beams'],
            beams_to_search=params['beams_to_search'],
            delta_rms=params['delta_rms'],
            minval_rms=params['minval_rms'],
            edge_clip=params['edge_clip'],
            filter_name=params.get('filterName'),
            progress_reporter=progress_reporter,
            hdu_index=params.get('hdu_index', 0)
        )
        
        # --- Final Update ---
        job_state['progress'] = 100
        job_state['eta'] = 0
        job_state['stage'] = 'Complete'
        job_state['result'] = {
            "sources": {
                "ra": ra, "dec": dec,
                "x": x, "y": y,
                "x_bottom_left": x_bl_out, "y_bottom_left": y_bl_out,
                "source_count": len(ra)
            }
        }
        job_state['status'] = 'complete'
        print(f"[Worker {job_id}] Peak finding complete.", file=sys.stderr)

    except Exception as e:
        print(f"[Worker {job_id}] Error during peak finding: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        job_state['status'] = 'error'
        job_state['error'] = str(e)       



@app.post("/start-peak-finder/")
async def start_peak_finder(
    fits_file: str = Form(...),
    pix_across_beam: float = Form(PEAK_FINDER_DEFAULTS['pix_across_beam']),
    min_beams: float = Form(PEAK_FINDER_DEFAULTS['min_beams']),
    beams_to_search: float = Form(PEAK_FINDER_DEFAULTS['beams_to_search']),
    delta_rms: float = Form(PEAK_FINDER_DEFAULTS['delta_rms']),
    minval_rms: float = Form(PEAK_FINDER_DEFAULTS['minval_rms']),
    edge_clip: int = Form(PEAK_FINDER_DEFAULTS['edge_clip']),
    filterName: str = Form('Not JWST Filter'),
    hdu_index: int = Form(0),
):
    job_id = str(uuid.uuid4())
    
    manager = Manager()
    job_state = manager.dict({
        'status': 'queued',
        'progress': 0,
        'eta': -1,
        'stage': 'Initializing',
        'result': None,
        'error': None
    })
    
    # Resolve the file path on the server
    base_dir = Path(__file__).resolve().parent
    full_file_path = base_dir / fits_file
    
    if not os.path.exists(full_file_path):
        raise HTTPException(status_code=404, detail=f"File not found at {full_file_path}")

    params = {
        'full_file_path': str(full_file_path),
        'pix_across_beam': pix_across_beam,
        'min_beams': min_beams,
        'beams_to_search': beams_to_search,
        'delta_rms': delta_rms,
        'minval_rms': minval_rms,
        'edge_clip': edge_clip,
        'filterName': filterName,  # pass through to find_sources for photometry
        'hdu_index': hdu_index,
    }

    process = Process(target=peak_finder_worker, args=(job_id, job_state, params))
    process.start()
    
    PEAK_FINDER_JOBS[job_id] = {'process': process, 'state': job_state}
    
    print(f"Started peak finder job: {job_id}", file=sys.stderr)
    return {"job_id": job_id}

@app.get("/peak-finder-status/{job_id}")
@app.get("/peak-finder-status/{job_id}/")
async def get_peak_finder_status(job_id: str):
    job = PEAK_FINDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job_state = dict(job['state'])
    
    if job_state['status'] in ['complete', 'error']:
        job['process'].join()
        # To save memory, we can remove the job after some time
        # For now, let's keep it for client retrieval
        # del PEAK_FINDER_JOBS[job_id]

    return JSONResponse(content=job_state)
# --- End Peak Finder Background Task Management ---


if __name__ == "__main__":
    # Allow running the API with: python main.py
    # Mirrors: uvicorn main:app --host 127.0.0.1 --port 8000 --reload
    uvicorn.run("main:app", host=UVICORN_HOST, port=UVICORN_PORT, reload=UVICORN_RELOAD_MODE)