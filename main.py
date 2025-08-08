import sys
import os
import threading
import time
from fastapi import FastAPI, Response, Body, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
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
from datetime import datetime # Add datetime import
from concurrent.futures import ProcessPoolExecutor
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
plt.rcParams["font.family"] = "serif"
mpl.rcParams['mathtext.fontset'] = 'stix'
mpl.rcParams['mathtext.rm'] = 'serif'

#Global parameters

logger = logging.getLogger(__name__) # Create a logger instance

# --- Global Configuration Constants for Performance Tuning ---
MAX_SAMPLE_POINTS_FOR_DYN_RANGE = 1000  # Max points for dynamic range calculation in SimpleTileGenerator
MAX_POINTS_FOR_HISTOGRAM = 1000        # Max points for direct histogram processing or deriving overall stats
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
PROXY_REQUEST_TIMEOUT = 30
DEFAULT_API_PAGE_SIZE = 1000
MAX_API_PAGE_SIZE = 10000
DEFAULT_API_SORT_ORDER = "asc"
MAX_CATALOG_ROWS_FULL_LOAD = 50000000
RANGE_SEARCH_MAX_RESULTS = 5000000000
DEFAULT_EXPORT_FORMAT = 'csv'
MAX_EXPORT_ROWS = 10000
CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE = 1000
SYSTEM_STATS_UPDATE_INTERVAL = 2
PROXY_DOWNLOAD_TIMEOUT = 60
FIND_FILES_TIMEOUT = 2.0
MAX_DISTANCE_DEG = 0.5
PEAK_FINDER_TIMEOUT = 300
SYSTEM_STATS_WEBSOCKET_UPDATE_INTERVAL = 2

# ------------------------------------------------------------------------------
# II. File System & Path Configuration
# ------------------------------------------------------------------------------
CATALOGS_DIRECTORY = 'catalogs'
UPLOADS_DIRECTORY = 'files/uploads'
AST_INJECT_OUTPUT_DIR = 'files/injected'
PEAK_FINDER_OUTPUT_DIR = 'catalogs'
PEAK_FINDER_FILENAME_FORMAT = "peak_catalog_{base_name}_{timestamp}.fits"
FILE_BROWSER_IGNORE_DIRS = {".git", "__pycache__", "node_modules", ".vscode", "catalogs", "data", "psf"}
FILE_BROWSER_IGNORE_FILES = {".DS_Store"}
IGNORED_CATALOGS_LIST = {'test_catalog.fits'}
CATALOG_MAPPINGS_FILE= 'catalog_mappings.json'
FILES_DIRECTORY= 'files'
BASE_FITS_PATH = f"{FILES_DIRECTORY}/"
PSF_DIRECTORY = 'psf'
BASE_PSF_PATH = f"{PSF_DIRECTORY}/"
IMAGE_DIR = 'images'
# ------------------------------------------------------------------------------
# III. FITS Image & Tile Processing
# ------------------------------------------------------------------------------
DEFAULT_HDU_INDEX = 0
IMAGE_TILE_SIZE_PX = 256
DEFAULT_TILE_REQUEST_RADIUS = 2
OVERVIEW_IMAGE_SIZE_PX = 512
MAX_SAMPLE_POINTS_FOR_DYN_RANGE = 1000
DYNAMIC_RANGE_PERCENTILES = {'q_min': 0.5, 'q_max': 99.5}

# ------------------------------------------------------------------------------
# IV. Algorithm & Processing Defaults
# ------------------------------------------------------------------------------
PEAK_FINDER_DEFAULTS = {
    'pix_across_beam': 5.0, 'min_beams': 1.0, 'beams_to_search': 1.0,
    'delta_rms': 3.0, 'minval_rms': 2.0, 'edge_clip': 1
}
CUTOUT_BATCH_SIZE = 4
SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC = 1.0
MAX_POINTS_FOR_FULL_HISTOGRAM = 1000
FITS_HISTOGRAM_DEFAULT_BINS = 100
CATALOG_ANALYSIS_HISTOGRAM_BINS = 20

RA_COLUMN_NAMES = ['XCTR_DEG','cen_ra','ra', 'RA', 'Ra', 'right_ascension', 'RIGHT_ASCENSION', 'raj2000', 'RAJ2000']
DEC_COLUMN_NAMES = ['YCTR_DEG','cen_dec','dec', 'DEC', 'Dec', 'declination', 'DECLINATION', 'decj2000', 'DECJ2000', 'dej2000', 'DEJ2000']
RGB_GALAXY_COLUMN_NAMES = ['galaxy', 'galaxy_name', 'object_name', 'obj_name', 'target']
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
# V. Caching Configuration
# ------------------------------------------------------------------------------
TILE_CACHE_MAX_SIZE = 100
GLOB_SEARCH_CACHE_SIZE = 200
FILE_LIST_CACHE_SIZE = 100

# ------------------------------------------------------------------------------
# VI. Plotting & Visualization (RGB and SED)
# ------------------------------------------------------------------------------
# --- General Settings ---
PLOT_DPI = 300
PLOT_SAVEFIG_BBOX_INCHES = 'tight'
MATPLOTLIB_FONT_FAMILY = "serif"
MATPLOTLIB_MATH_FONTSET = 'stix'
MATPLOTLIB_MATH_RM_FONT = 'serif'

# --- RGB Cutout Settings (`generate_rgb_cutouts`) ---
# NOTE: The filter logic for RGB is handled by if/elif/else statements
# in the function, not a single dictionary. These are the relevant values.
RGB_FIGURE_SIZE_INCHES = (10, 10)
RGB_FIGURE_FACE_COLOR = '#1e293b'
CUTOUT_SIZE_ARCSEC= 7.5
RGB_CUTOUT_STRETCH_PERCENTILES = {'q_min': 12.0, 'q_max': 99.8}
RGB_PANEL_TYPE_DEFAULT = "default"


# Coordinate matching
RGB_COORDINATE_TOLERANCE_FACTOR = 3.0  # Cutout size divided by this factor for coordinate matching


# ------------------------------------------------------------------------------
# VI. RGB
# ------------------------------------------------------------------------------

# Figure layout
RGB_FIGURE_WIDTH = 9.2
RGB_FIGURE_HEIGHT = 2.3
RGB_SUBPLOT_ROWS = 1
RGB_SUBPLOT_COLS = 4
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
RGB_MARKER_SYMBOL = 'r+'
RGB_MARKER_SIZE = 10
RGB_MARKER_EDGE_WIDTH = 1.5
RGB_MARKER_ALPHA = 0.8

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

# Panel titles and labels
RGB_HST_SHORT_TITLE = "HST"
RGB_NIRCAM_SHORT_TITLE = "NIRCam"
RGB_MIRI_SHORT_TITLE = "MIRI"
RGB_HA_SHORT_TITLE = "H-alpha"

# Default scaling parameters
RGB_DEFAULT_Q_MIN = 0.5
RGB_DEFAULT_Q_MAX = 99.4

# File output settings
RGB_OUTPUT_DPI = 300
RGB_DEFAULT_GALAXY_NAME = "UnknownGalaxy"
RGB_FILENAME_PREFIX = "RGB_Cutouts"
RGB_ALLOWED_FILENAME_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ '
RGB_FILENAME_REPLACEMENT_CHAR = '_'

# Panel indices
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

# --- SED Plot Settings (`generate_sed_optimized`) ---
# Figure and Main Plot
SED_FIGURE_SIZE_INCHES = (18, 14)
SED_FIGURE_BACKGROUND_COLOR = '#1e293b'

# Main Plot Axes, Grid, and Text
SED_X_LABEL = "Wavelength (μm)"
SED_Y_LABEL = "Flux (mJy)"


# SED Generation Parameters
SED_COORDINATE_TOLERANCE = 0.0003

# Filter wavelengths and names
SED_FILTER_WAVELENGTHS = [0.275, 0.336, 0.438, 0.555, 0.814, 2.0, 3.0, 3.35, 3.6, 7.7, 10.0, 11.3, 21]
SED_FILTER_NAMES = ['F275W', 'F336W', 'F438W', 'F555W', 'F814W', 'F200W', 'F300M', 'F335M', 'F360M', 'F770W', 'F1000W', 'F1130W', 'F2100W']
SED_FILTER_WAVELENGTHS_EXTENDED = [0.275, 0.336, 0.438, 0.555, 0.814, 2.0, 3.0, 3.35, 3.6, 7.7, 10.0, 11.3, 11.4, 11.5, 21, 21.5]

# Filter categories
SED_HST_FILTERS = ['F275W', 'F336W', 'F438W', 'F555W', 'F814W']
SED_JWST_NIRCAM_FILTERS = ['F200W', 'F300M', 'F335M', 'F360M']
SED_JWST_MIRI_FILTERS = ['F770W', 'F1000W', 'F1130W', 'F2100W']

# CIGALE multiplier
SED_CIGALE_MULTIPLIER = 1000

# Catalog column names
SED_COL_AGE = 'best.stellar.age_m_star'
SED_COL_MASS = 'best.stellar.m_star'
SED_COL_CHI = 'best.reduced_chi_square'
SED_COL_EBV_GAS = 'best.attenuation.E_BV_lines'
SED_COL_ISM_SOURCE = 'ISM_source'
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

# Ha wavelength and positioning
SED_HA_WAVELENGTH = 21.5
SED_HA_X_OFFSET = -0.7
SED_HA_Y_POSITION = 0.72

# Processing configuration
SED_MAX_WORKERS_FILES = 8
SED_MAX_WORKERS_CUTOUTS = 3
SED_BATCH_SIZE = 4

# Percentile values for image normalization
SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE = 99.7  # Max value for NIRCam/MIRI individual cutout display
SED_HST_CUTOUT_DISPLAY_MAX_PERCENTILE = 99.97          # Max value for HST individual cutout display with sqrt norm



SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE = 99.9           # Max value for H-alpha cutout display with sqrt norm
SED_CO_CONTOUR_LOW_LEVEL_PERCENTILE = 70              # Low level percentile for CO contours
SED_CO_CONTOUR_MID_LEVEL_PERCENTILE = 80              # Mid level percentile for CO contours
SED_CO_CONTOUR_HIGH_LEVEL_PERCENTILE = 98             # High level percentile for CO contours
SED_HA_CONTOUR_HIGH_LEVEL_PERCENTILE = 99             # High level percentile for H-alpha contours

# Contour settings
SED_CONTOUR_LINEWIDTH = 0.3
SED_CONTOUR_ALPHA = 0.5
SED_GAUSSIAN_FILTER_SIGMA = 4

# Info box settings
SED_INFO_BOX_X = 0.98
SED_INFO_BOX_Y = 0.05
SED_RGB_TEXT_X = 0.63
SED_RGB_TEXT_Y = 0.83
SED_RGB_TEXT_X_ALT = 0.4


# ==============================================================================
# --- END OF CONFIGURATION ---
# ==============================================================================
# Python implementations of Colormaps and Scaling functions
# Adapted from static/image-processing.js


COLOR_MAPS_PY = {
    'grayscale': lambda val: (val, val, val),

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
        round(val / 255 * 255),
        round((1 - val / 255) * 255),
        255
    ),

    'rainbow': lambda val: (
        round(math.sin(0.024 * val + 0) * 127 + 128),
        round(math.sin(0.024 * val + 2) * 127 + 128),
        round(math.sin(0.024 * val + 4) * 127 + 128)
    ),

    'jet': lambda val: (
        round(max(0, min(255, 4 * (val - 96)))) if val > 96 else 
        round(max(0, min(255, 255 - 4 * (val - 32)))) if val > 160 else 0,
        
        round(max(0, min(255, 4 * (val - 32)))) if 32 <= val <= 96 else
        255 if 96 < val <= 160 else
        round(max(0, min(255, 255 - 4 * (val - 160)))) if val > 160 else 0,
        
        255 if val <= 32 else
        round(max(0, min(255, 255 - 4 * (val - 32)))) if val <= 96 else 0
    ),
}


SCALING_FUNCTIONS_PY = {
    'linear': lambda val, min_v, max_v: (val - min_v) / (max_v - min_v) if min_v != max_v else 0.5,
    'logarithmic': lambda val, min_v, max_v:
        (math.log(max(val, 1e-10)) - math.log(max(min_v, 1e-10))) / (math.log(max_v) - math.log(max(min_v, 1e-10)))
        if max_v > 0 and math.log(max_v) != math.log(max(min_v, 1e-10)) # Revised condition
        else (0.5 if min_v == max_v else ((val - min_v) / (max_v - min_v) if max_v > min_v else 0.5)), # Fallback
    'sqrt': lambda val, min_v, max_v: math.sqrt(max(0, (val - min_v) / (max_v - min_v))) if min_v != max_v else 0.5,
    'power': lambda val, min_v, max_v: math.pow(max(0, (val - min_v) / (max_v - min_v)), 2) if min_v != max_v else 0.5,
    'asinh': lambda val, min_v, max_v: 
        (math.asinh( (2 * ((val - min_v) / (max_v - min_v)) - 1) * 3 ) / math.asinh(3) + 1) / 2 
        if min_v != max_v else 0.5
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

# Determine if we're running locally or on a server
RUNNING_ON_SERVER = os.getenv("RUN_SERVER", "False").lower() == "true"

# FastAPI app
app = FastAPI()

app.include_router(coding.router, prefix="/coding", tags=["coding"])
app.include_router(local_coding_router, prefix="/local-coding", tags=["local-coding"])
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

# Cache for catalog data to avoid re-reading files
catalog_cache = {}

# Serve static HTML page for OpenSeadragon
@app.get("/")
async def home():
    return FileResponse(f"{STATIC_DIRECTORY}/index.html")

@app.get("/favicon.ico")
async def favicon():
    return FileResponse(f"{STATIC_DIRECTORY}/favicon.ico")

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


@app.get("/load-catalog/{catalog_name}")
async def load_catalog_endpoint(catalog_name: str):
    """Load a catalog file and return info about it."""
    try:
        catalog_path = f"{CATALOGS_DIRECTORY}/{catalog_name}"  # Updated
        
        if not os.path.exists(catalog_path):
            return JSONResponse(
                status_code=404,
                content={"error": f"Catalog file not found: {catalog_name}"}
            )
        
        # Clear previously loaded catalogs to prevent issues
        loaded_catalogs.clear()
        print("Cleared previously loaded catalogs")
        
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
                        if col_name.lower() in RA_COLUMN_NAMES:  # Updated
                            ra_col = col_name
                        elif col_name.lower() in DEC_COLUMN_NAMES:  # Updated
                            dec_col = col_name
                    
                    if ra_col and dec_col:
                        # For each object in the catalog data
                        for obj in catalog_data:
                            ra = obj['ra']
                            dec = obj['dec']
                            
                            # Calculate distances to find matching object in table
                            ra_diff = np.abs(catalog_table[ra_col] - ra)
                            dec_diff = np.abs(catalog_table[dec_col] - dec)
                            distances = np.sqrt(ra_diff**2 + dec_diff**2)
                            closest_idx = np.argmin(distances)
                            
                            # Check if the match is close enough
                            if distances[closest_idx] < 0.0003:  # ~1 arcsec threshold
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


@app.post("/upload-catalog/")
async def upload_catalog(file: UploadFile = File(...)):
    """Uploads a FITS catalog file, adding a timestamp to avoid overwrites."""
    try:
        # Generate a unique filename with a timestamp
        original_stem = Path(file.filename).stem
        original_suffix = Path(file.filename).suffix
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{original_stem}_{timestamp}{original_suffix}"
        upload_path = catalogs_dir / unique_filename

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
        
        # Return the UNIQUE filename used for saving
        return JSONResponse(content={"message": "Catalog uploaded successfully", "filename": unique_filename, "path": str(upload_path)})
    
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
    catalog_path = Path(CATALOGS_DIRECTORY) / catalog_name  # Updated
    if not catalog_path.is_file():
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
        
        # Keep the FITS file open with memory mapping
        self._hdul = fits.open(fits_file_path, memmap=True, lazy_load_hdus=True)
        hdu = self._hdul[self.hdu_index] # Use self.hdu_index
        self.header = hdu.header 

        # Get reference to data without copying
        self.image_data = image_data if image_data is not None else hdu.data
        
        # Handle different dimensionality
        if self.image_data.ndim > 2:
            if self.image_data.ndim == 3:
                self.image_data = self.image_data[0, :, :]
            elif self.image_data.ndim == 4:
                self.image_data = self.image_data[0, 0, :, :]
            # Higher dimensions are not directly processed further here for min/max,
            # but the full self.image_data is kept for potential tile generation from other slices if customized later.
        
        self.height, self.width = self.image_data.shape[-2:] # Use last two dimensions for height/width
        
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
        
        print(f"SimpleTileGenerator initialized: {self.width}x{self.height}, max_level: {self.max_level}. Dynamic range calculation deferred.")
    
    def _calculate_initial_dynamic_range(self):
        """Calculates and sets the initial dynamic range (min/max values) using percentiles."""
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
        self.ensure_dynamic_range_calculated() # ADDED: Ensure dynamic range is available first
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
            # Create a small overview (max 512x512)
            target_size = 512
            scale = max(1, max(self.width, self.height) / target_size)
            overview_width = int(self.width / scale)
            overview_height = int(self.height / scale)
            
            # Use very fast strided sampling for the overview
            if scale > 1:
                # Calculate stride for fast sampling
                stride_y = max(1, int(self.height / overview_height))
                stride_x = max(1, int(self.width / overview_width))
                
                # Use NumPy's advanced indexing for fast sampling
                # This is much faster than resize for large images
                y_indices = np.arange(0, self.height, stride_y)[:overview_height]
                x_indices = np.arange(0, self.width, stride_x)[:overview_width]
                
                # Create mesh grid for indexing
                y_grid, x_grid = np.meshgrid(y_indices, x_indices, indexing='ij')
                
                # Sample the data
                overview_data = self.image_data[y_grid, x_grid]
            else:
                overview_data = np.array(self.image_data)  # Small image, use as-is
            
            # Handle NaN and infinity values
            overview_data = np.nan_to_num(overview_data, nan=0, posinf=0, neginf=0)
            
            # Normalize to 0-1 range using selected scaling function
            scaling_func = SCALING_FUNCTIONS_PY.get(self.scaling_function, SCALING_FUNCTIONS_PY['linear'])
            
            # Apply scaling to each pixel -> requires iterating or vectorized approach
            # For overview, a simple loop is acceptable given smaller size
            normalized_overview = np.zeros_like(overview_data, dtype=float)
            for i in range(overview_data.shape[0]):
                for j in range(overview_data.shape[1]):
                    pixel_val = overview_data[i,j]
                    # Clip pixel_val to [self.min_value, self.max_value] before scaling
                    clipped_val = np.clip(pixel_val, self.min_value, self.max_value)
                    normalized_overview[i,j] = scaling_func(clipped_val, self.min_value, self.max_value)
            
            # Clip normalized data to 0-1 just in case scaling function output is outside this range
            normalized_overview = np.clip(normalized_overview, 0, 1)
            
            # Convert to 8-bit image based on normalized values (0-255)
            img_data_8bit = (normalized_overview * 255).astype(np.uint8)

            # Apply colormap using the LUT
            rgb_img_data = self.lut[img_data_8bit]
            
            # Create PIL image and convert to base64
            from PIL import Image
            img = Image.fromarray(rgb_img_data, 'RGB') # Ensure mode is RGB
            
            # Use lower quality for faster encoding
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=False, compress_level=1)
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
    
    def get_tile(self, level, x, y):
        """Generate a tile at the specified level and coordinates."""
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
                img.save(buffer, format='PNG', optimize=False, compress_level=1)
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
                # Downsampled - use strided sampling for speed (scale > 1)
                # Calculate pixel coordinates in the original image for the larger region
                region_start_x = x * self.tile_size * scale
                region_start_y = y * self.tile_size * scale
                region_end_x = min(region_start_x + self.tile_size * scale, self.width)
                region_end_y = min(region_start_y + self.tile_size * scale, self.height)

                stride = max(1, int(scale))
                
                # Ensure integer coordinates for arange start/stop
                y_indices = np.arange(int(region_start_y), int(region_end_y), stride)
                x_indices = np.arange(int(region_start_x), int(region_end_x), stride)
                
                # Limit to tile size if the sampled region is larger (can happen with arange and stride)
                y_indices = y_indices[:self.tile_size]
                x_indices = x_indices[:self.tile_size]
                
                if len(y_indices) > 0 and len(x_indices) > 0:
                    # Create mesh grid for indexing
                    y_grid, x_grid = np.meshgrid(y_indices, x_indices, indexing='ij')
                    
                    # Ensure indices are within bounds of self.image_data
                    y_grid = np.clip(y_grid, 0, self.height - 1)
                    x_grid = np.clip(x_grid, 0, self.width - 1)
                    
                    sampled_region = self.image_data[y_grid, x_grid]
                    
                    # Pad if necessary (if sampled_region is smaller than tile_size)
                    if sampled_region.shape[0] < self.tile_size or sampled_region.shape[1] < self.tile_size:
                        padded = np.zeros((self.tile_size, self.tile_size), dtype=sampled_region.dtype)
                        padded[:sampled_region.shape[0], :sampled_region.shape[1]] = sampled_region
                        tile_data = padded
                    else:
                        tile_data = sampled_region
                else:
                    # print(f"Tile ({level},{x},{y}) resulted in empty y_indices or x_indices for downsampling.")
                    # If indices are empty, it means the tile is effectively off-image or calculation is problematic
                    tile_data = np.zeros((self.tile_size, self.tile_size), dtype=self.image_data.dtype)

            # Handle NaN and infinity values
            tile_data = np.nan_to_num(tile_data, nan=0, posinf=self.max_value, neginf=self.min_value) # More robust nan handling
            
            # Normalize to 0-1 range using selected scaling function
            scaling_func = SCALING_FUNCTIONS_PY.get(self.scaling_function, SCALING_FUNCTIONS_PY['linear'])
            
            # Vectorized application of scaling function after clipping
            clipped_tile_data = np.clip(tile_data, self.min_value, self.max_value)
            
            # Need to handle cases where min_value == max_value for scaling function correctly
            if self.min_value == self.max_value:
                normalized_tile_data = np.full_like(clipped_tile_data, 0.5, dtype=float) # or 0, depending on desired behavior
            else:
                # Apply scaling function. This might need to be element-wise if not already.
                # The lambda functions in SCALING_FUNCTIONS_PY are designed for single values.
                # We need to vectorize this call or loop.
                v_scaling_func = np.vectorize(lambda x: scaling_func(x, self.min_value, self.max_value))
                normalized_tile_data = v_scaling_func(clipped_tile_data)

            normalized_tile_data = np.clip(normalized_tile_data, 0, 1) # Ensure output is 0-1
            
            # Convert to 8-bit image
            img_data_8bit = (normalized_tile_data * 255).astype(np.uint8)
            
            # Apply colormap using the LUT
            rgb_img_data = self.lut[img_data_8bit]
            
            # Create PNG with minimal compression for speed
            from PIL import Image
            img = Image.fromarray(rgb_img_data, 'RGB') # Ensure mode is RGB
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=False, compress_level=1)
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
        color_map_func = COLOR_MAPS_PY.get(self.color_map, COLOR_MAPS_PY['grayscale'])
        # Create a LUT: 256 entries, each with 3 (RGB) uint8 values
        self.lut = np.zeros((256, 3), dtype=np.uint8)
        for i in range(256):
            self.lut[i] = color_map_func(i)
        print(f"Colormap LUT updated for '{self.color_map}'")


@app.get("/fits-histogram/")
async def get_fits_histogram(bins: int = Query(FITS_HISTOGRAM_DEFAULT_BINS), min_val: float = Query(None), max_val: float = Query(None)):  # Updated default
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
            # Use current_hdu_index from app.state if available
            current_hdu_idx = getattr(app.state, "current_hdu_index", DEFAULT_HDU_INDEX)  # Updated
            
            if 0 <= current_hdu_idx < len(hdul) and \
               hasattr(hdul[current_hdu_idx], 'data') and \
               hdul[current_hdu_idx].data is not None and \
               len(getattr(hdul[current_hdu_idx], 'shape', [])) >= 2:
                hdu = hdul[current_hdu_idx]
                print(f"Using HDU {current_hdu_idx} for histogram.")
            else:
                # Fallback to searching for the first valid HDU if current_hdu_idx is not suitable
                print(f"HDU {current_hdu_idx} not suitable or not found, searching for first valid image HDU.")
                for i, h in enumerate(hdul):
                    if hasattr(h, 'data') and h.data is not None and len(getattr(h, 'shape', [])) >= 2:
                        hdu = h
                        print(f"Fallback: Found valid image data in HDU {i}.")
                        break
            
            if hdu is None:
                return JSONResponse(
                    status_code=400,
                    content={"error": "No suitable image data found in FITS file for histogram"}
                )
            
            # Get the image data
            image_data_raw = hdu.data # Keep raw for original shape info
            
            # Handle different dimensionality - create a 2D working copy for histogram
            image_data_processed = image_data_raw
            if image_data_raw.ndim > 2:
                if image_data_raw.ndim == 3:
                    image_data_processed = image_data_raw[0, :, :]
                elif image_data_raw.ndim == 4:
                    image_data_processed = image_data_raw[0, 0, :, :]
                else: 
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Image data has {image_data_raw.ndim} dimensions, histogram supports 2D, 3D (first slice), or 4D (first slice)."}
                    )

            data_to_bin = None # This will hold the final data (sampled or full, and finite) for histogramming
            sampled = False
            
            # If data is large, sample it first.
            if image_data_processed.size > MAX_POINTS_FOR_HISTOGRAM:
                sampled_data_for_stats = None
                if image_data_processed.ndim == 2: # Should always be 2D here
                    ratio = image_data_processed.size / MAX_POINTS_FOR_HISTOGRAM
                    stride = max(1, int(np.sqrt(ratio)))
                    sampled_data_for_stats = image_data_processed[::stride, ::stride]
                    print(f"Histogram: Strided sampling (stride={stride}) on 2D data ({image_data_processed.shape}). Sampled ~{sampled_data_for_stats.size} points for stats/binning.")
                else: # Fallback, though image_data_processed should be 2D
                    num_to_sample = MAX_POINTS_FOR_HISTOGRAM
                    # Flatten for random choice, less ideal but a fallback
                    flat_data = image_data_processed.ravel()
                    if flat_data.size > 0: # Ensure there's data to sample from
                        indices = np.random.choice(flat_data.size, size=min(num_to_sample, flat_data.size), replace=False)
                        sampled_data_for_stats = flat_data[indices]
                        print(f"Histogram: Random sampling on fallback data ({image_data_processed.shape}). Sampled {sampled_data_for_stats.size} points for stats/binning.")


                if sampled_data_for_stats is not None and sampled_data_for_stats.size > 0:
                    data_to_bin = sampled_data_for_stats[np.isfinite(sampled_data_for_stats)]
                else: # If sampling resulted in nothing (e.g. source was empty)
                    data_to_bin = np.array([]) 
                sampled = True
            else: # Data is small enough, use all of it
                data_to_bin = image_data_processed[np.isfinite(image_data_processed)]
                sampled = False
                print(f"Histogram: Using all {data_to_bin.size} finite points (data smaller than max sample size).")

            if data_to_bin.size == 0: # Check after potential sampling and finite filtering
                 print("No finite data in the image (or sample) for histogram calculation.")
                 # Use min_val, max_val if provided for the range, else 0,1
                 # This ensures query_min/max are reflected if user sent them for an empty data situation
                 hist_range_min = min_val if min_val is not None else 0.0
                 hist_range_max = max_val if max_val is not None else 1.0
                 if hist_range_min >= hist_range_max: hist_range_max = hist_range_min + 1e-6

                 hist_counts, bin_edges = np.histogram([], bins=bins, range=(hist_range_min, hist_range_max))
                 hist_data = {
                     "counts": hist_counts.tolist(),
                     "bin_edges": bin_edges.tolist(),
                     "min_value": hist_range_min, # Reflects the range attempted
                     "max_value": hist_range_max, # Reflects the range attempted
                     "data_overall_min": hist_range_min, # No data, so use the attempted range
                     "data_overall_max": hist_range_max,
                     "width": image_data_processed.shape[1] if image_data_processed.ndim >=2 else 0,
                     "height": image_data_processed.shape[0] if image_data_processed.ndim >=2 else 0,
                     "sampled": sampled, 
                     "query_min_val": min_val,
                     "query_max_val": max_val,
                     "notes": "No finite data found in image (or sample); used specified or default range for empty histogram."
                 }
                 return JSONResponse(content=hist_data)

            # Determine the overall min/max from `data_to_bin` (which is now sampled if original was large, and finite)
            # These are the actual min/max of the data being considered for histogram range default.
            actual_data_min = float(np.min(data_to_bin))
            actual_data_max = float(np.max(data_to_bin))
            if actual_data_min >= actual_data_max: # If all values in data_to_bin are the same
                actual_data_max = actual_data_min + 1e-6

            # Determine the histogram range (current_min_val_hist, current_max_val_hist)
            current_min_val_hist: float
            current_max_val_hist: float
            range_notes = ""

            if min_val is None or max_val is None or min_val >= max_val:
                current_min_val_hist = actual_data_min
                current_max_val_hist = actual_data_max
                range_notes = f"Used {'sampled ' if sampled else ''}data range."
                print(f"Histogram: Using {'sampled ' if sampled else ''}data range for histogram: {current_min_val_hist} to {current_max_val_hist}")
            else:
                current_min_val_hist = min_val
                current_max_val_hist = max_val
                range_notes = f"Used user-specified range: {current_min_val_hist} to {current_max_val_hist}."
                print(f"Histogram: Using user-specified range for histogram: {current_min_val_hist} to {current_max_val_hist}")
            
            # Ensure current_min_val_hist < current_max_val_hist for np.histogram
            if current_min_val_hist >= current_max_val_hist:
                current_max_val_hist = current_min_val_hist + 1e-6 # Add epsilon

            print(f"Histogram: Generating histogram with {bins} bins for {data_to_bin.size} points over range [{current_min_val_hist}, {current_max_val_hist}]")
            hist_counts, bin_edges_out = np.histogram(
                data_to_bin, # This is already sampled and finite
                bins=bins,
                range=(current_min_val_hist, current_max_val_hist)
            )
            
            # Convert to Python types for JSON serialization
            hist_data = {
                "counts": hist_counts.tolist(),
                "bin_edges": bin_edges_out.tolist(),
                "min_value": float(current_min_val_hist), # Reflect the range used for histogram
                "max_value": float(current_max_val_hist), # Reflect the range used for histogram
                "data_overall_min": actual_data_min, # Actual min of (potentially sampled) finite data
                "data_overall_max": actual_data_max, # Actual max of (potentially sampled) finite data
                "width": image_data_processed.shape[1],
                "height": image_data_processed.shape[0],
                "sampled": sampled, # True if initial image_data_processed was sampled
                "notes": range_notes,
                "query_min_val": min_val, # Store original query parameters
                "query_max_val": max_val
            }
            
            return JSONResponse(content=hist_data)
    
    except Exception as e:
        # Log the error for debugging
        print(f"Error generating histogram: {e}")
        import traceback
        print(traceback.format_exc())
        
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate histogram: {str(e)}"}
        )
        
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




@app.get("/generate-sed/")



async def generate_sed_optimized(ra: float, dec: float, catalog_name: str, galaxy_name: str = None):
    """SED plot generation that accepts catalog_name, derives galaxy from row (ignores JS galaxy_name),
    searches recursively under FILES_DIRECTORY with galaxy-token preference, and keeps cutouts/RGB logic."""
    try:
        if np.isnan(ra) or np.isinf(ra) or np.isnan(dec) or np.isinf(dec):
            return JSONResponse(status_code=400, content={"error": "Invalid RA/Dec coordinates"})

        print(f"[[DEBUG]] generate_sed_optimized CALLED. ra: {ra} dec: {dec} catalog_name: {catalog_name} (ignoring JS galaxy_name)")

        # 1) Load catalog
        catalog_table = loaded_catalogs.get(catalog_name)
        if catalog_table is None:
            print(f"SED: Loading catalog '{catalog_name}'...")
            catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
            if catalog_table is None:
                return JSONResponse(status_code=404, content={"error": f"Failed to load catalog '{catalog_name}'"})
            loaded_catalogs[catalog_name] = catalog_table

        # 2) Find nearest row
        ra_col = dec_col = None
        for col_name in catalog_table.colnames:
            lower_col = col_name.lower()
            if not ra_col and lower_col in SED_RA_COLUMN_NAMES:
                ra_col = col_name
            elif not dec_col and lower_col in SED_DEC_COLUMN_NAMES:
                dec_col = col_name
            if ra_col and dec_col:
                break
        if not ra_col or not dec_col:
            return JSONResponse(status_code=400, content={"error": "Could not find RA and DEC columns in catalog"})

        ra_diff = np.abs(catalog_table[ra_col] - ra)
        dec_diff = np.abs(catalog_table[dec_col] - dec)
        distances = np.sqrt(ra_diff**2 + dec_diff**2)
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
            str(closest_obj.get('NAME', '')),
            str(closest_obj.get('name', ''))
        )
        target_galaxy_name = galaxy_from_row if galaxy_from_row else "UnknownGalaxy"
        print(f"[SED] Galaxy from row: {target_galaxy_name}")

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
            flux_val = float(closest_obj[filter_name]) if filter_name in available_cols else 0.0
            sed_fluxes.append(flux_val)
            sed_fluxes_total.append(flux_val + (float(closest_obj.get(f"{filter_name}_bkg", 0.0)) if f"{filter_name}_bkg" in available_cols else 0.0))
            sed_fluxes_err.append(float(closest_obj.get(f"{filter_name}_err", 0.0)) if f"{filter_name}_err" in available_cols else 0.0)
            cigale_val = 0.0
            for pattern in [f"best.hst.wfc3.{filter_name}", f"best.hst.wfc.{filter_name}", f"best.hst_{filter_name}"]:
                if pattern in available_cols:
                    cigale_val = float(closest_obj[pattern]) * SED_CIGALE_MULTIPLIER
                    break
            sed_fluxes_cigale.append(cigale_val)

        for filter_name in SED_JWST_NIRCAM_FILTERS:
            flux_val = float(closest_obj[filter_name]) if filter_name in available_cols else 0.0
            sed_fluxes.append(flux_val)
            sed_fluxes_total.append(flux_val + (float(closest_obj.get(f"{filter_name}_bkg", 0.0)) if f"{filter_name}_bkg" in available_cols else 0.0))
            sed_fluxes_err.append(float(closest_obj.get(f"{filter_name}_err", 0.0)) if f"{filter_name}_err" in available_cols else 0.0)
            sed_fluxes_cigale.append((float(closest_obj.get(f"best.jwst.nircam.{filter_name}", 0.0)) if f"best.jwst.nircam.{filter_name}" in available_cols else 0.0) * SED_CIGALE_MULTIPLIER)

        for filter_name in SED_JWST_MIRI_FILTERS:
            flux_val = float(closest_obj[filter_name]) if filter_name in available_cols else 0.0
            sed_fluxes.append(flux_val)
            sed_fluxes_total.append(flux_val + (float(closest_obj.get(f"{filter_name}_bkg", 0.0)) if f"{filter_name}_bkg" in available_cols else 0.0))
            sed_fluxes_err.append(float(closest_obj.get(f"{filter_name}_err", 0.0)) if f"{filter_name}_err" in available_cols else 0.0)
            sed_fluxes_cigale.append((float(closest_obj.get(f"best.jwst.miri.{filter_name}", 0.0)) if f"best.jwst.miri.{filter_name}" in available_cols else 0.0) * SED_CIGALE_MULTIPLIER)

        # 5) Plot
        fig = plt.figure(figsize=(SED_FIGURE_SIZE_WIDTH, SED_FIGURE_SIZE_HEIGHT))
        ax = fig.add_subplot(111)
        try:
            ax.errorbar(SED_FILTER_WAVELENGTHS, sed_fluxes_total, yerr=sed_fluxes_err, fmt='o', ecolor='gray', color='purple',
                        label='Observed', alpha=SED_ALPHA, markersize=SED_MARKERSIZE, capsize=SED_CAPSIZE)
            ax.errorbar(SED_FILTER_WAVELENGTHS, sed_fluxes, yerr=sed_fluxes_err, fmt='o', ecolor='gray', color='blue',
                        label='BKG-Subtracted', markersize=SED_MARKERSIZE, capsize=SED_CAPSIZE, alpha=SED_ALPHA)
        except:
            ax.errorbar(SED_FILTER_WAVELENGTHS[:-1], sed_fluxes, yerr=sed_fluxes_err, fmt='o', ecolor='gray', color='blue',
                        label='BKG-Subtracted', markersize=SED_MARKERSIZE, capsize=SED_CAPSIZE, alpha=SED_ALPHA)
        ax.set_xlabel(SED_X_LABEL, fontsize=SED_FONTSIZE_LABELS)
        ax.set_ylabel(SED_Y_LABEL, fontsize=SED_FONTSIZE_LABELS)
        ax.legend(loc='lower right', bbox_to_anchor=(0.67, 0.0))
        ax.set_xscale('log'); ax.set_yscale('log')
        ax.set_xticks(SED_FILTER_WAVELENGTHS)
        ax.set_xticklabels([f'{w:.2f}' for w in SED_FILTER_WAVELENGTHS], rotation=45, fontsize=SED_FONTSIZE_TICKS)
        ax.set_xlim(SED_X_LIM_MIN, SED_X_LIM_MAX)

        bbox = dict(boxstyle="round", alpha=0.7, facecolor="white")
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
            patterns = [f"{base_dir}/*{lf}*.fits", f"{base_dir}/**/*{lf}*.fits"]
            if filter_name == 'F438W':
                patterns.extend([f"{base_dir}/*f435w*.fits", f"{base_dir}/**/*f435w*.fits"])
            for tok in galaxy_tokens:
                patterns.extend([f"{base_dir}/*{tok}*{lf}*.fits", f"{base_dir}/**/*{tok}*{lf}*.fits"])
                if filter_name == 'F438W':
                    patterns.extend([f"{base_dir}/*{tok}*f435w*.fits", f"{base_dir}/**/*{tok}*f435w*.fits"])
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
                if filter_name.upper() in ['F555W', 'F814W']:
                    matches = [f for f in matches if not any(t in os.path.basename(f).lower() for t in ['_ha-img', '_ha_', '-ha-', '-ha.fits'])]
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

        if target_galaxy_name and target_galaxy_name != 'UnknownGalaxy':
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
                    x_norm = max(min(x_norm, 1 - 0.05), 0.0)
                    x_norm += SED_X_OFFSETS[i] if i < len(SED_X_OFFSETS) else 0

                    ax_inset = inset_axes(ax, width=SED_INSET_WIDTH, height=SED_INSET_HEIGHT, loc='center',
                                          bbox_to_anchor=(x_norm, 0.945, SED_INSET_BBOX_SIZE, SED_INSET_BBOX_SIZE),
                                          bbox_transform=fig.transFigure)

                    if filter_name in SED_JWST_NIRCAM_FILTERS + [SED_MIRI_RED_FILTER, SED_MIRI_GREEN_FILTER, SED_MIRI_BLUE_FILTER]:
                        ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP,
                                        vmin=0, vmax=np.percentile(cutout_data, SED_NIRCAM_MIRI_CUTOUT_DISPLAY_MAX_PERCENTILE))
                    else:
                        sqrt_norm = PowerNorm(gamma=0.5, vmin=0, vmax=np.percentile(cutout_data, SED_HST_CUTOUT_DISPLAY_MAX_PERCENTILE))
                        ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP, norm=sqrt_norm)

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
                    elif filter_name.upper() == 'F814W':
                        hst_cutouts['red'] = np.array(cutout_data); hst_header = header.copy()
                    elif filter_name.upper() == 'F555W':
                        hst_cutouts['green'] = np.array(cutout_data); hst_header = hst_header or header.copy()
                    elif filter_name.upper() in ['F438W', 'F435W']:
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
            ha_patterns.extend([
                f"{base_dir}/*{tok}*ha-img.fits",        f"{base_dir}/**/*{tok}*ha-img.fits",
                f"{base_dir}/*{tok}*_ha-*.fits",         f"{base_dir}/**/*{tok}*_ha-*.fits",
                f"{base_dir}/*{tok}*-ha-*.fits",         f"{base_dir}/**/*{tok}*-ha-*.fits",
                f"{base_dir}/*{tok}*halpha*.fits",       f"{base_dir}/**/*{tok}*halpha*.fits",
            ])
        ha_files = []
        for pattern in ha_patterns:
            matches = glob.glob(pattern, recursive=True)
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
                        x_norm = max(min(x_norm, 1 - 0.05), 0.0); x_norm += SED_HA_X_OFFSET
                        ax_inset = inset_axes(ax, width=SED_INSET_WIDTH, height=SED_INSET_HEIGHT, loc='center',
                                             bbox_to_anchor=(x_norm, SED_HA_Y_POSITION, SED_INSET_BBOX_SIZE, SED_INSET_BBOX_SIZE),
                                             bbox_transform=fig.transFigure)
                        sqrt_norm = PowerNorm(gamma=0.5, vmin=0, vmax=np.percentile(cutout_data, SED_HA_CUTOUT_DISPLAY_MAX_PERCENTILE))
                        ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP, norm=sqrt_norm)
                        region_sky = CircleSkyRegion(center=target_coord, radius=SED_CIRCLE_RADIUS_ARCSEC * u.arcsec)
                        reg = region_sky.to_pixel(cutout.wcs); reg.plot(ax=ax_inset, color=CIRCLE_COLOR, lw=CIRCLE_LINEWIDTH)
                        ax_inset.set_title(r'HST H$\alpha$', fontsize=SED_FONTSIZE_TITLE)
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
                ax_nircam_rgb.text(SED_RGB_TEXT_X, SED_RGB_TEXT_Y, 'NIRCam', fontsize=SED_FONTSIZE_TITLE, color='white',
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
                ax_miri_rgb.text(SED_RGB_TEXT_X_ALT, SED_RGB_TEXT_Y, 'MIRI', fontsize=SED_FONTSIZE_TITLE, color='white',
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
                ax_hst_rgb.text(SED_RGB_TEXT_X_ALT, SED_RGB_TEXT_Y, 'HST', fontsize=SED_FONTSIZE_TITLE, color='white',
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

        filename = f"SED_RA{ra:.4f}_DEC{dec:.4f}.png"
        image_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), IMAGE_DIR)
        os.makedirs(image_dir, exist_ok=True)
        filepath = os.path.join(image_dir, filename)
        fig.savefig(filepath, format='png', dpi=SED_DPI, bbox_inches='tight')
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
# HELPER FUNCTION FOR CACHING FILE SEARCHES
import functools
from typing import List
# HELPER FUNCTION FOR CACHING FILE SEARCHES
import functools
from typing import List







@functools.lru_cache(maxsize=200)
def cached_glob_search(pattern: str) -> List[str]:
    """Cache glob search results to avoid repeated filesystem calls."""
    return glob.glob(pattern)


# OPTIMIZED BATCH CUTOUT PROCESSOR
def process_cutouts_in_batches(file_matches: dict, ra: float, dec: float, batch_size: int = 4) -> dict:
    """Process cutouts in parallel batches for optimal performance."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    
    results_lock = threading.Lock()
    all_results = {}
    
    def process_single_cutout(filter_name: str, fits_file: str):
        """Process a single cutout file."""
        try:
            with fits.open(fits_file) as hdul:
                # Quick HDU detection
                image_hdu = next((hdu for hdu in hdul 
                                if hdu.data is not None and 
                                hasattr(hdu.data, 'shape') and 
                                len(hdu.data.shape) >= 2), None)
                
                if image_hdu is None:
                    return None
                
                # Fast WCS and cutout
                prepared_header = _prepare_jwst_header_for_wcs(image_hdu.header)
                wcs = WCS(prepared_header)
                
                if not wcs.has_celestial:
                    return None
                
                # Handle dimensionality efficiently
                image_data = image_hdu.data
                while len(image_data.shape) > 2:
                    image_data = image_data[0]
                
                # Create cutout
                target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
                cutout = Cutout2D(image_data, target_coord, 2.5 * u.arcsec, wcs=wcs)
                
                # Clean data in-place
                cutout_data = cutout.data.copy()
                mask = np.isnan(cutout_data) | np.isinf(cutout_data)
                cutout_data[mask] = 0
                
                return {
                    'cutout_data': cutout_data,
                    'cutout': cutout,
                    'target_coord': target_coord
                }
                
        except Exception as e:
            print(f"Error processing cutout {filter_name}: {e}")
            return None
    
    # Process in batches using ThreadPoolExecutor
    filter_items = list(file_matches.items())
    
    for i in range(0, len(filter_items), batch_size):
        batch = filter_items[i:i+batch_size]
        
        with ThreadPoolExecutor(max_workers=batch_size) as executor:
            future_to_filter = {
                executor.submit(process_single_cutout, fname, fpath): fname 
                for fname, fpath in batch
            }
            
            for future in as_completed(future_to_filter, timeout=FIND_FILES_TIMEOUT):
                filter_name = future_to_filter[future]
                try:
                    result = future.result()
                    if result is not None:
                        with results_lock:
                            all_results[filter_name] = result
                except Exception as e:
                    print(f"Batch processing error for {filter_name}: {e}")
    
    return all_results

async def process_cutouts_async(ra: float, dec: float, filter_data: dict, fig, ax):
    """Async cutout processing with optimizations."""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    # Pre-compile glob patterns
    filter_patterns = {}
    for filter_name in filter_data['names']:
        patterns = [
            f"{FILES_DIRECTORY}/*{filter_name.lower()}*.fits",
            f"{FILES_DIRECTORY}/*f435w*.fits" if filter_name == 'F438W' else None
        ]
        filter_patterns[filter_name] = [p for p in patterns if p]
    
    # Find all matching files in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = []
        for filter_name, patterns in filter_patterns.items():
            for pattern in patterns:
                future = executor.submit(glob.glob, pattern)
                futures.append((filter_name, future))
        
        # Collect results
        file_matches = {}
        for filter_name, future in futures:
            try:
                matches = future.result(timeout=FIND_FILES_TIMEOUT)  # 500ms timeout per glob
                if matches and filter_name not in file_matches:
                    file_matches[filter_name] = matches[0]  # Take first match
            except:
                continue
    
    # Process only available cutouts
    cutout_tasks = []
    for filter_name in filter_data['names']:
        if filter_name in file_matches:
            task = process_single_cutout(
                filter_name, file_matches[filter_name], ra, dec, fig, ax
            )
            cutout_tasks.append(task)
    
    # Process cutouts concurrently (limit to 3 to avoid memory issues)
    semaphore = asyncio.Semaphore(3)
    
    async def limited_cutout(task):
        async with semaphore:
            return await task
    
    if cutout_tasks:
        await asyncio.gather(*[limited_cutout(task) for task in cutout_tasks], 
                           return_exceptions=True)


async def process_single_cutout(filter_name: str, fits_file: str, ra: float, dec: float, fig, ax):
    """Process a single cutout asynchronously."""
    try:
        # Use thread pool for I/O operations
        loop = asyncio.get_event_loop()
        
        # Read FITS file in thread
        with ThreadPoolExecutor(max_workers=1) as executor:
            hdul = await loop.run_in_executor(executor, fits.open, fits_file)
        
        # Find image HDU quickly
        image_hdu = None
        for hdu in hdul:
            if (hdu.data is not None and 
                hasattr(hdu.data, 'shape') and 
                len(hdu.data.shape) >= 2):
                image_hdu = hdu
                break
        
        if image_hdu is None:
            return
        
        # Quick WCS and cutout
        prepared_header = _prepare_jwst_header_for_wcs(image_hdu.header)
        wcs = WCS(prepared_header)
        
        if not wcs.has_celestial:
            return
        
        # Handle dimensionality
        image_data = image_hdu.data
        if len(image_data.shape) > 2:
            image_data = image_data[0] if len(image_data.shape) == 3 else image_data[0, 0]
        
        # Create cutout
        target_coord = SkyCoord(ra=ra*u.deg, dec=dec*u.deg)
        cutout_size = SED_CUTOUT_SIZE_ARCSEC * u.arcsec
        cutout = Cutout2D(image_data, target_coord, cutout_size, wcs=wcs)
        
        # Clean data
        cutout_data = cutout.data.copy()
        cutout_data[np.isnan(cutout_data)] = 0
        cutout_data[np.isinf(cutout_data)] = 0
        
        # Add to plot (simplified positioning)
        wavelength = filter_data['wavelengths'][filter_data['names'].index(filter_name)]
        x_norm = 0.1 + (filter_data['names'].index(filter_name) * 0.07)  # Simplified positioning
        
        ax_inset = inset_axes(ax, width='80%', height='80%', loc='center',
                             bbox_to_anchor=(x_norm, 0.945, 0.19, 0.19),
                             bbox_transform=fig.transFigure)
        
        # Quick normalization
        if filter_name in ['F200W', 'F300M', 'F335M', 'F360M', 'F1000W', 'F1130W', 'F2100W']:
            ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP,
                           vmin=0, vmax=np.percentile(cutout_data, 99.5))
        else:
            sqrt_norm = PowerNorm(gamma=0.5, vmin=0, vmax=np.percentile(cutout_data, 99.9))
            ax_inset.imshow(cutout_data, origin='lower', cmap=SED_CUTOUT_CMAP, norm=sqrt_norm)
        
        # Add circle and formatting
        region_sky = CircleSkyRegion(center=target_coord, radius=0.67 * u.arcsec)
        reg = region_sky.to_pixel(cutout.wcs)
        reg.plot(ax=ax_inset, color=CIRCLE_COLOR,lw=CIRCLE_LINEWIDTH)
        
        ax_inset.set_title(filter_name, fontsize=8)
        ax_inset.axis('off')
        
        hdul.close()
        
    except Exception as e:
        print(f"Error processing cutout {filter_name}: {e}")


# Additional optimization: Cache frequently used data
import functools

@functools.lru_cache(maxsize=100)
def get_cached_file_list(pattern: str):
    """Cache file glob results to avoid repeated filesystem calls."""
    return glob.glob(pattern)


@app.get("/source-properties/")
async def source_properties(ra: float, dec: float, catalog_name: str):
    print(f"!!!!!!!!!! Entering /source-properties/ endpoint. Catalog: '{catalog_name}', RA: {ra}, Dec: {dec}")
    """Get all properties for a specific source based on RA and DEC coordinates."""
    try:
        catalog_table = loaded_catalogs.get(catalog_name)
        if catalog_table is None:
            print(f"Catalog '{catalog_name}' not in loaded_catalogs cache. Attempting to load as Astropy Table.")
            catalog_table = get_astropy_table_from_catalog(catalog_name, Path(CATALOGS_DIRECTORY))  # Updated
            if catalog_table is None:
                print(f"Failed to load catalog '{catalog_name}' for source properties.")
                return JSONResponse(
                    status_code=404,
                    content={"error": f"Failed to load catalog '{catalog_name}' as Astropy Table."}
                )
            loaded_catalogs[catalog_name] = catalog_table # Cache it
            print(f"Successfully loaded and cached Astropy Table for '{catalog_name}' in loaded_catalogs.")

        print(f"Using (potentially newly loaded) catalog: {catalog_name} for source properties.")

        ra_col = None
        dec_col = None
        available_cols_lower = {col.lower(): col for col in catalog_table.colnames}

        for potential_ra_name in RA_COLUMN_NAMES:  # Updated
            if potential_ra_name.lower() in available_cols_lower:
                ra_col = available_cols_lower[potential_ra_name.lower()]
                break
        
        for potential_dec_name in DEC_COLUMN_NAMES:  # Updated
            if potential_dec_name.lower() in available_cols_lower:
                dec_col = available_cols_lower[potential_dec_name.lower()]
                break

        if not ra_col or not dec_col:
            print(f"Could not find RA ('{ra_col}') or DEC ('{dec_col}') columns in catalog '{catalog_name}'. Available: {catalog_table.colnames}")
            return JSONResponse(
                status_code=400,
                content={"error": f"Could not find RA/DEC columns in catalog '{catalog_name}'. Available: {catalog_table.colnames}"}
            )
        print(f"Using RA column: '{ra_col}', DEC column: '{dec_col}' for catalog '{catalog_name}'.")
        
        try:
            table_ra_values = catalog_table[ra_col].astype(float)
            table_dec_values = catalog_table[dec_col].astype(float)
        except Exception as e:
            print(f"Error converting RA/DEC columns to float for properties in catalog '{catalog_name}': {e}")
            return JSONResponse(
                status_code=500,
                content={"error": f"Error processing RA/DEC columns for properties in catalog '{catalog_name}'."}
            )

        ra_diff = np.abs(table_ra_values - ra)
        dec_diff = np.abs(table_dec_values - dec)
        ra_diff = np.where(ra_diff > 180, 360 - ra_diff, ra_diff) # Correct for RA wrap
        distances = np.sqrt((ra_diff * np.cos(np.radians(dec)))**2 + dec_diff**2) # More accurate distance

        if len(distances) == 0:
             return JSONResponse(
                status_code=404,
                content={"error": f"No data in catalog '{catalog_name}' to search for object near RA={ra}, Dec={dec} for properties."}
            )
            
        closest_idx = np.argmin(distances)
        closest_obj_row = catalog_table[closest_idx] # This is an Astropy Row object

        if distances[closest_idx] > SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC / 3600.0:  # Updated to use constant
            print(f"No object found close enough for properties. Min distance: {distances[closest_idx]*3600:.2f} arcsec")
            return JSONResponse(
                status_code=404,
                content={"error": f"No object found within threshold near RA={ra}, Dec={dec} for properties. Closest at {distances[closest_idx]*3600:.2f} arcsec."}
            )
        
        print(f"Found object for properties at index {closest_idx}, distance {distances[closest_idx]*3600:.2f} arcsec.")
        
        obj_dict = {}
        for col_name in catalog_table.colnames:
            value = closest_obj_row[col_name]
            processed_value = None # Default to None
            
            # 1. Handle Astropy Quantities
            if isinstance(value, u.Quantity):
                if np.isscalar(value.value):
                    # Attempt to get a Python native type from the .value attribute
                    num_val = value.value
                    if hasattr(num_val, 'item'): # For numpy scalars
                        processed_value = num_val.item()
                    else: # For Python scalars (int, float)
                        processed_value = num_val
                    # Check for NaN/Inf after potential conversion
                    if isinstance(processed_value, float) and (np.isnan(processed_value) or np.isinf(processed_value)):
                        processed_value = None
                else: # For array quantities, convert to string representation
                    processed_value = str(value)
            # 2. Handle Astropy Time objects
            elif isinstance(value, Time):
                try:
                    processed_value = value.isot # Standard ISO format string
                except Exception:
                    processed_value = str(value) # Fallback to string
            # 3. Handle Astropy SkyCoord objects
            elif isinstance(value, SkyCoord):
                try:
                    processed_value = f"RA:{value.ra.deg:.6f}, Dec:{value.dec.deg:.6f}" 
                except Exception:
                    processed_value = str(value) # Fallback to string
            # 4. Handle Numpy scalars (float, int, bool, complex)
            elif isinstance(value, (np.floating, np.integer, np.complexfloating)):
                if np.isnan(value) or np.isinf(value):
                    processed_value = None
                else:
                    processed_value = value.item()
            elif isinstance(value, np.bool_):
                processed_value = value.item()
            # 5. Handle Numpy arrays
            elif isinstance(value, np.ndarray):
                if value.dtype.kind in 'fc': # float or complex arrays
                    # Convert to list, replacing NaN/Inf with None
                    temp_list = []
                    for x in value.flat: # Iterate over all elements for multi-dim arrays
                        if np.isnan(x) or np.isinf(x):
                            temp_list.append(None)
                        elif hasattr(x, 'item'):
                            temp_list.append(x.item())
                        else:
                            temp_list.append(x)
                    processed_value = temp_list
                elif value.dtype.kind == 'S' or value.dtype.kind == 'U': # String arrays
                     processed_value = [item.decode('utf-8', 'replace') if isinstance(item, bytes) else str(item) for item in value.tolist()]
                else:
                    processed_value = value.tolist()
            # 6. Handle bytes (decode to string)
            elif isinstance(value, bytes):
                try:
                    processed_value = value.decode('utf-8', errors='replace')
                except Exception:
                    processed_value = str(value) # Fallback to string representation of bytes
            # 7. Handle Python floats specifically for NaN/Inf
            elif isinstance(value, float):
                if np.isnan(value) or np.isinf(value):
                    processed_value = None
                else:
                    processed_value = value
            # 8. Handle standard Python types that are directly JSON serializable
            elif isinstance(value, (str, int, bool, list, dict)) or value is None:
                processed_value = value
            # 9. Fallback for other types
            else:
                try:
                    processed_value = str(value)
                    print(f"Warning: Converted unhandled type {type(value)} to string for column '{col_name}'. Value (first 100 chars): '{processed_value[:100]}'")
                except Exception as e_str_conv:
                    processed_value = f"Error converting value of type {type(value)} to string: {e_str_conv}"
                    print(f"Critical Error: Could not convert value of type {type(value)} for column '{col_name}' to string: {e_str_conv}")
            
            obj_dict[col_name] = processed_value
        
        return JSONResponse(
            status_code=200,
            content={"properties": obj_dict}
        )

    except Exception as e:
        print(f"Error in /source-properties/ endpoint: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to get source properties: {str(e)}"}
        )
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


import requests
from fastapi import Request, Response, HTTPException
from urllib.parse import quote_plus
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


# =============================================================================
# OLD FitsTileGenerator CLASS COMPLETELY REMOVED
# =============================================================================
# The original complex FitsTileGenerator class has been completely removed
# because it was causing 'cannot pickle _thread.lock object' errors.
# It has been replaced with SimpleTileGenerator (defined at end of file).
# =============================================================================

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


@app.get("/fits-tile-info/")
async def get_fits_tile_information():
    """Returns tile information for the currently loaded FITS file."""
    fits_file = getattr(app.state, "current_fits_file", None)
    hdu_index = getattr(app.state, "current_hdu_index", 0)

    if not fits_file:
        raise HTTPException(status_code=400, detail="No FITS file currently loaded.")

    file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
    tile_generator = active_tile_generators.get(file_id)

    if not tile_generator:
        # Attempt to initialize if not found, similar to /fits-tile/ endpoint logic
        try:
            print(f"Tile generator not found for {file_id} in /fits-tile-info/, attempting to initialize.")
            generator_instance = SimpleTileGenerator(fits_file, hdu_index)
            active_tile_generators[file_id] = generator_instance
            tile_generator = generator_instance
            print(f"Successfully initialized tile generator for {file_id} in /fits-tile-info/")
        except Exception as e:
            print(f"Error initializing tile generator for {file_id} in /fits-tile-info/: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to initialize tile generator: {str(e)}")

    if tile_generator:
        return JSONResponse(content=tile_generator.get_tile_info())
    else:
        # This case should ideally be covered by the initialization attempt or prior errors.
        raise HTTPException(status_code=404, detail=f"Tile generator not available for {file_id}")


@app.get("/fits-tile/{level}/{x}/{y}")
async def get_fits_tile(level: int, x: int, y: int, request: Request):
    """Get a specific tile of the current FITS file."""
    try:
        fits_file = getattr(app.state, "current_fits_file", None)
        hdu_index = getattr(app.state, "current_hdu_index", 0)
        query_v = request.query_params.get('v', 'N/A')

        logger.info(f"TILE_REQUEST: L{level}, X{x}, Y{y}, v={query_v}, app.state.fits_file='{fits_file}', app.state.hdu_index={hdu_index}")

        if not fits_file:
            logger.error("TILE_ERROR: No FITS file currently loaded in app.state.")
            # Return a placeholder or error image. For now, let's assume error handling below covers it or returns empty.
            # For a quick fix, returning a 404 might be better than letting it proceed to error out later.
            return JSONResponse(status_code=400, content={"error": "No FITS file currently loaded in app.state"})

        file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
        logger.info(f"TILE_INFO: Constructed file_id='{file_id}'")

        tile_generator = active_tile_generators.get(file_id)
        generator_status = "EXISTING"

        if not tile_generator:
            generator_status = "NEWLY_INITIALIZED"
            logger.warning(f"TILE_INIT: No active generator for '{file_id}'. Initializing SimpleTileGenerator.")
            try:
                # Ensure fits_file path is valid before passing to generator
                if not Path(fits_file).exists():
                    logger.error(f"TILE_ERROR: FITS file path '{fits_file}' from app.state does not exist for new generator.")
                    return JSONResponse(status_code=404, content={"error": f"FITS file path not found: {fits_file}"})

                tile_generator = SimpleTileGenerator(fits_file, hdu_index)
                tile_generator.ensure_dynamic_range_calculated() # Sets initial min/max based on percentiles
                active_tile_generators[file_id] = tile_generator
                logger.info(f"TILE_INIT: Successfully initialized and stored generator for '{file_id}'. Initial min/max: {tile_generator.min_value}/{tile_generator.max_value}")
            except Exception as e:
                logger.exception(f"TILE_ERROR: Failed to initialize SimpleTileGenerator for '{file_id}': {e}")
                # Return a placeholder or error image
                # Consistent error response might be better.
                return JSONResponse(status_code=500, content={"error": f"Failed to initialize tile generator: {str(e)}"})
        else:
            logger.info(f"TILE_INFO: Using {generator_status} generator for '{file_id}'.")

        # Log the state of the generator *before* get_tile is called
        logger.info(f"TILE_GENERATOR_STATE ({generator_status} for '{file_id}'): "
                    f"min={getattr(tile_generator, 'min_value', 'N/A')}, "
                    f"max={getattr(tile_generator, 'max_value', 'N/A')}, "
                    f"scale='{getattr(tile_generator, 'scaling_function', 'N/A')}', "
                    f"cmap='{getattr(tile_generator, 'color_map', 'N/A')}'")

        # Caching logic
        tile_key = f"{file_id}/{level}/{x}/{y}/{tile_generator.color_map}/{tile_generator.scaling_function}/{tile_generator.min_value}/{tile_generator.max_value}"
        cached_tile = tile_cache.get(tile_key)
        if cached_tile:
            logger.info(f"TILE_CACHE: Hit for {tile_key}")
            return Response(content=cached_tile, media_type="image/png")
        logger.info(f"TILE_CACHE: Miss for {tile_key}")

        tile_data = tile_generator.get_tile(level, x, y)

        if tile_data is None:
            logger.error(f"TILE_ERROR: get_tile returned None for L{level},X{x},Y{y} on file_id '{file_id}'")
            return JSONResponse(status_code=404, content={"error": f"Tile ({level},{x},{y}) data not found or generation failed"})

        tile_cache.put(tile_key, tile_data)
        return Response(content=tile_data, media_type="image/png")

    except Exception as e:
        logger.exception(f"TILE_ERROR: Unexpected error in get_fits_tile (L{level},X{x},Y{y}): {e}")
        return JSONResponse(status_code=500, content={"error": f"Failed to get tile due to unexpected server error: {str(e)}"})




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
            key_dirs = ["files", "catalogs", "kernels"]
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
async def load_file(filepath: str, hdu: int = Query(DEFAULT_HDU_INDEX)):  # Updated
    """
    Set the active FITS file and initialize its tile generator.
    
    Args:
        filepath: The path to the FITS file, relative to the files directory.
        hdu: The HDU index of the FITS file to load.
    """
    try:
        # Base directory is "files"
        base_dir = Path(FILES_DIRECTORY)
        
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
        
        # Initialize the tile generator
        initialize_tile_generator(file_id=file_path, fits_data=None)
        
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
    data = await request.json()
    min_value = data.get('min_value')
    max_value = data.get('max_value')
    color_map = data.get('color_map')
    scaling_function = data.get('scaling_function') # Get the scaling function

    if min_value is None or max_value is None:
        raise HTTPException(status_code=400, detail="Missing min_value or max_value")
    if color_map is None:
        raise HTTPException(status_code=400, detail="Missing color_map")
    if scaling_function is None: # Add check for scaling_function
        raise HTTPException(status_code=400, detail="Missing scaling_function")

    fits_file = getattr(app.state, "current_fits_file", None)
    hdu_index = getattr(app.state, "current_hdu_index", 0)
    file_id = f"{os.path.basename(fits_file)}:{hdu_index}" if fits_file else None

    if not file_id or file_id not in active_tile_generators:
        raise HTTPException(status_code=404, detail="Tile generator not found or no file loaded.")

    tile_generator = active_tile_generators[file_id]
    tile_generator.min_value = float(min_value)
    tile_generator.max_value = float(max_value)
    
    if tile_generator.color_map != color_map:
        tile_generator.color_map = color_map
        tile_generator._update_colormap_lut() # Update LUT if colormap changes

    # Update scaling function
    if tile_generator.scaling_function != scaling_function:
        tile_generator.scaling_function = scaling_function
        print(f"Scaling function for {file_id} updated to: {scaling_function}")

    # Clear overview as it depends on range, colormap, and scaling
    tile_generator.overview_image = None 
    print(f"Dynamic range for {file_id} updated: min={min_value}, max={max_value}, cmap={color_map}, scale={scaling_function}. Overview cleared.")

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



# Complete implementation of load_catalog_data function with WCS orientation analysis
def load_catalog_data(catalog_path_str):
    """
    Load catalog data from a file.
    Supports FITS tables and CSV/TSV formats.
    Filters objects to match the loaded FITS image galaxy.
    Uses saved column mappings if available.
    Incorporates WCS orientation analysis for proper coordinate handling.
    """
    catalog_path = Path(catalog_path_str) # Convert string path to Path object
    catalog_name = catalog_path.name # Get filename for mapping lookup
    print(f"load_catalog_data called for: {catalog_name}")
    
    try:
        catalog_data = []
        
        # Use the currently selected FITS file
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            print("No FITS file currently selected")
            return []
            
        print(f"Using WCS from current FITS file: {fits_file}")
        fits_filename = os.path.basename(fits_file).lower()
        fits_name_without_ext = os.path.splitext(fits_filename)[0]
        
        # Extract potential galaxy name from filename
        galaxy_patterns = [
            r'(ngc\d+)',  # NGC galaxies (e.g., ngc0628)
            r'(m\d+)',    # Messier objects (e.g., m74)
            r'(ic\d+)',   # IC catalog objects
            r'([a-z]+\d+)'  # Any letter followed by numbers
        ]
        
        target_galaxy = None
        for pattern in galaxy_patterns:
            matches = re.findall(pattern, fits_name_without_ext)
            if matches:
                target_galaxy = matches[0]
                print(f"Extracted galaxy identifier from FITS filename: {target_galaxy}")
                break
        
        # Get WCS of the current image to filter by position and analyze orientation
        image_wcs = None
        image_center_ra = None
        image_center_dec = None
        wcs_analysis_result = None
        try:
            with fits.open(fits_file) as hdul:
                # Find the HDU with image data
                image_hdu = None
                for i, hdu in enumerate(hdul):
                    if hasattr(hdu, 'data') and hdu.data is not None and len(getattr(hdu, 'shape', [])) >= 2:
                        image_hdu = hdu
                        break
                
                if image_hdu:
                    # Analyze WCS orientation using the header
                    print("Analyzing WCS orientation for coordinate system...")
                    print('calling me???')
                    wcs_analysis_result = analyze_wcs_orientation(image_hdu.header, image_hdu.data)
                    
                    if wcs_analysis_result:
                        flip_y = wcs_analysis_result[0]
                        determinant = wcs_analysis_result[1]
                        flipped_data = wcs_analysis_result[2]
                        
                        print(f"WCS Analysis Results:")
                        print(f"  Y-axis flip needed: {flip_y}")
                        print(f"  Transformation determinant: {determinant}")
                        
                        # Store WCS analysis results for later use
                        wcs_flip_info = {
                            'flip_y': flip_y,
                            'determinant': determinant,
                            'coordinate_system_flipped': determinant < 0
                        }
                    else:
                        print("WCS orientation analysis failed, proceeding with standard orientation")
                        wcs_flip_info = {
                            'flip_y': False,
                            'determinant': 1.0,
                            'coordinate_system_flipped': False
                        }
                    
                    # Get WCS from the HDU
                    try:
                        image_wcs = WCS(image_hdu.header)
                        print("Successfully created WCS object from header")
                        
                        # Get transformation matrix elements for additional validation
                        header = image_hdu.header
                        if 'CD1_1' in header:
                            cd11 = header.get('CD1_1', 0)
                            cd12 = header.get('CD1_2', 0)
                            cd21 = header.get('CD2_1', 0)
                            cd22 = header.get('CD2_2', 0)
                            print(f"CD matrix: [[{cd11}, {cd12}], [{cd21}, {cd22}]]")
                        elif 'PC1_1' in header:
                            pc11 = header.get('PC1_1', 1)
                            pc12 = header.get('PC1_2', 0)
                            pc21 = header.get('PC2_1', 0)
                            pc22 = header.get('PC2_2', 1)
                            cdelt1 = header.get('CDELT1', 1)
                            cdelt2 = header.get('CDELT2', 1)
                            print(f"PC matrix: [[{pc11}, {pc12}], [{pc21}, {pc22}]]")
                            print(f"CDELT: [{cdelt1}, {cdelt2}]")
                        
                    except Exception as wcs_error:
                        print(f"Error creating WCS object: {wcs_error}")
                        image_wcs = None
                    
                    # Get the image center in pixel coordinates
                    if hasattr(image_hdu, 'data') and image_wcs:
                        try:
                            height, width = image_hdu.data.shape[-2:]
                            center_x = width // 2
                            center_y = height // 2
                            
                            # Apply Y-flip correction if needed for center calculation
                            if wcs_flip_info['flip_y']:
                                center_y_corrected = height - center_y - 1
                                print(f"Applied Y-flip correction to center: {center_y} -> {center_y_corrected}")
                                center_y = center_y_corrected
                            
                            # Convert center to RA, DEC
                            center_coords = image_wcs.pixel_to_world(center_x, center_y)
                            if hasattr(center_coords, 'ra') and hasattr(center_coords, 'dec'):
                                image_center_ra = center_coords.ra.deg
                                image_center_dec = center_coords.dec.deg
                                print(f"Image center (corrected): RA={image_center_ra:.6f}, DEC={image_center_dec:.6f}")
                            else:
                                print("Warning: Could not extract RA/DEC from center coordinates")
                        except Exception as center_error:
                            print(f"Error calculating image center coordinates: {center_error}")
                else:
                    print("No image HDU found in FITS file")
        except Exception as e:
            print(f"Error getting image WCS and orientation: {e}")
            import traceback
            print(traceback.format_exc())
        
        # --- Column Name Handling --- 
        ra_col = None
        dec_col = None
        resolution_col = None # Optional resolution/size column
        
        # Check for saved mapping first
        if catalog_name in catalog_column_mappings:
            mapping = catalog_column_mappings[catalog_name]
            ra_col = mapping.get('ra_col')
            dec_col = mapping.get('dec_col')
            resolution_col = mapping.get('resolution_col') # Get resolution if mapped
            print(f"Using saved mapping for {catalog_name}: RA={ra_col}, Dec={dec_col}, Res={resolution_col}")
        else:
             print(f"No saved mapping found for {catalog_name}. Attempting auto-detection.")
        # --- End Column Name Handling --- 
        
        # Check if it's a FITS file
        if catalog_path.suffix.lower() in ['.fits', '.fit']:
            print(f"Loading FITS catalog: {catalog_path}")
            try:
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
                    available_columns = [col.lower() for col in catalog_table.names]
                    print(f"FITS catalog columns: {catalog_table.names}")
                    
                    # Auto-detect columns ONLY if mapping wasn't found/used
                    if not ra_col:
                        # Common names for RA and DEC columns
                        ra_names = ['ra', 'alpha', 'alpha_j2000', 'raj2000', 'cen_ra']
                        for name in ra_names:
                            if name in available_columns:
                                ra_col = catalog_table.names[available_columns.index(name)] # Get original case
                                print(f"Auto-detected RA column: {ra_col}")
                                break
                    
                    if not dec_col:
                        dec_names = ['dec', 'delta', 'delta_j2000', 'dej2000', 'cen_dec']
                        for name in dec_names:
                            if name in available_columns:
                                dec_col = catalog_table.names[available_columns.index(name)] # Get original case
                                print(f"Auto-detected Dec column: {dec_col}")
                                break
                    
                    # Optional: Auto-detect resolution column if not mapped
                    if not resolution_col:
                        res_names = ['radius', 'size', 'resolution', 'fwhm', 'radius_pixels']
                        for name in res_names:
                            if name in available_columns:
                                resolution_col = catalog_table.names[available_columns.index(name)]
                                print(f"Auto-detected Resolution column: {resolution_col}")
                                break
                                
                    # Check if columns were successfully found (either mapped or auto-detected)
                    if ra_col is None or dec_col is None:
                        print(f"ERROR: RA ({ra_col}) or DEC ({dec_col}) column could not be determined in catalog: {catalog_path}")
                        print(f"Available columns: {catalog_table.names}")
                        return [] # Return empty if critical columns are missing
                    
                    print(f"Using columns - RA: {ra_col}, DEC: {dec_col}, Resolution: {resolution_col}")
                    
                    # Find galaxy column if it exists (for filtering)
                    galaxy_col = None
                    galaxy_col_candidates = ['galaxy', 'name', 'id', 'source_id', 'target', 'object']
                    
                    for col_name_candidate in galaxy_col_candidates:
                        if col_name_candidate in available_columns:
                            galaxy_col = catalog_table.names[available_columns.index(col_name_candidate)]
                            print(f"Found potential galaxy column: {galaxy_col}")
                            break
                    
                    # Process each row - optimize by pre-filtering if possible
                    total_count = len(catalog_table)
                    filtered_count = 0
                    
                    # Filtering logic - use a combination of galaxy name and position filtering
                    process_rows = catalog_table # Start with all rows
                    
                    # First try galaxy name filtering if possible
                    if galaxy_col and target_galaxy:
                        try:
                            # Create a mask for matching rows
                            mask = np.zeros(total_count, dtype=bool)
                            
                            # Convert all galaxy names to lowercase for case-insensitive comparison
                            galaxy_names_lower = np.array([str(row[galaxy_col]).lower() for row in catalog_table])
                            
                            # Set mask for rows that contain the target galaxy name
                            mask = np.core.defchararray.find(galaxy_names_lower, target_galaxy) != -1
                            filtered_count = np.sum(mask)
                            
                            if filtered_count > 0:
                                # Apply the mask to get only matching rows
                                process_rows = catalog_table[mask]
                                print(f"Filtered catalog by galaxy name '{target_galaxy}' from {total_count} to {filtered_count} objects.")
                            else:
                                # If no matches by galaxy name, fall back to all rows (will filter by position later)
                                print(f"No objects match galaxy: {target_galaxy}, using position filtering only")
                        except Exception as galaxy_filter_error:
                            print(f"Error in galaxy name filtering: {galaxy_filter_error}")
                    
                    # Apply distance-based filtering if we have image center coordinates
                    if image_center_ra is not None and image_center_dec is not None and ra_col and dec_col:
                        position_filtered_count = 0
                        # Increased max_distance_deg for initial load to ensure context
                        max_distance_deg = MAX_DISTANCE_DEG  # ~30 arcmin - adjust as needed
                        
                        try:
                            # Create arrays for faster calculation (handle potential non-numeric data)
                            valid_rows = []
                            valid_indices = []
                            
                            for i, row in enumerate(process_rows):
                                try:
                                    ra_val = float(row[ra_col])
                                    dec_val = float(row[dec_col])
                                    if np.isfinite(ra_val) and np.isfinite(dec_val):
                                        valid_rows.append((ra_val, dec_val, i))
                                        valid_indices.append(i)
                                except (ValueError, TypeError):
                                    continue
                            
                            if len(valid_rows) > 0:
                                ra_values = np.array([row[0] for row in valid_rows])
                                dec_values = np.array([row[1] for row in valid_rows])
                                
                                # Calculate angular distance (simple approximation)
                                cos_dec = np.cos(np.radians(image_center_dec))
                                ra_diff = (ra_values - image_center_ra) * cos_dec
                                dec_diff = dec_values - image_center_dec
                                distances = np.sqrt(ra_diff**2 + dec_diff**2)
                                
                                # Create mask for objects within distance limit
                                distance_mask = distances <= max_distance_deg
                                final_indices = np.array(valid_indices)[distance_mask]
                                
                                # Select the rows using the final indices
                                process_rows = process_rows[final_indices]
                                position_filtered_count = len(process_rows)
                                
                                print(f"Position-filtered from {len(valid_rows)} to {position_filtered_count} objects within {max_distance_deg:.2f} degrees of image center")
                            else:
                                print("No valid RA/DEC values found for position filtering.")
                                process_rows = np.array([]) # Empty array if no valid coords
                        except Exception as coord_err:
                            print(f"Warning: Could not perform position filtering due to coordinate data issues: {coord_err}")
                            # Continue without position filtering
                    else:
                        print("Skipping position filtering (no image center or RA/Dec columns determined).")
                    
                    # Process the filtered rows
                    print(f"Processing {len(process_rows)} filtered FITS catalog rows...")
                    for row_idx, row in enumerate(process_rows):
                        try:
                            # Use determined RA/Dec columns
                            ra = float(row[ra_col])
                            dec = float(row[dec_col])
                            
                            # Skip if invalid coordinates
                            if not (np.isfinite(ra) and np.isfinite(dec)):
                                continue
                            
                            # Create object data
                            obj_data = {
                                'ra': ra,
                                'dec': dec,
                                'x': 0,  # Will be set later
                                'y': 0,  # Will be set later
                                'radius_pixels': 5.0  # Default radius
                            }
                            
                            # Add resolution/size if column exists and is valid
                            if resolution_col and resolution_col in row.array.dtype.names:
                                 try:
                                     res_value = float(row[resolution_col])
                                     if np.isfinite(res_value) and res_value > 0:
                                         obj_data['radius_pixels'] = res_value
                                 except (ValueError, TypeError):
                                     pass # Ignore if conversion fails
                            
                            # Add magnitude if available
                            mag_col_found = False
                            for mag_col_candidate in ['mag', 'magnitude']:
                                if mag_col_candidate in available_columns:
                                    mag_col = catalog_table.names[available_columns.index(mag_col_candidate)]
                                    try:
                                        mag_value = float(row[mag_col])
                                        if np.isfinite(mag_value):
                                            obj_data['magnitude'] = mag_value
                                            mag_col_found = True
                                            break # Found one, stop looking
                                    except (ValueError, TypeError):
                                        pass # Ignore if conversion fails
                            
                            catalog_data.append(obj_data)
                        except Exception as e:
                            print(f"Error processing FITS catalog row {row_idx}: {e}")
                            continue
            except Exception as fits_error:
                print(f"Error loading FITS catalog: {fits_error}")
                import traceback
                print(traceback.format_exc())
                return []
        else:
            # Assume it's a CSV/TSV file
            print(f"Loading ASCII/CSV catalog: {catalog_path}")
            try:
                from astropy.table import Table
                # Try common formats
                catalog_table = None
                try:
                     catalog_table = Table.read(catalog_path, format='ascii')
                     print("Successfully read as ASCII format")
                except Exception:
                     try:
                         catalog_table = Table.read(catalog_path, format='csv')
                         print("Successfully read as CSV format")
                     except Exception:
                         catalog_table = Table.read(catalog_path, format='tab') # Try tab-separated
                         print("Successfully read as tab-separated format")
                         
            except Exception as e:
                print(f"Error reading catalog as ASCII/CSV/TSV: {e}")
                import traceback
                print(traceback.format_exc())
                return []
            
            available_columns = [col.lower() for col in catalog_table.colnames]
            print(f"ASCII catalog columns: {catalog_table.colnames}")
            
            # Auto-detect columns ONLY if mapping wasn't found/used
            if not ra_col:
                ra_names = ['ra', 'alpha', 'alpha_j2000', 'raj2000', 'cen_ra']
                for name in ra_names:
                    if name in available_columns:
                        ra_col = catalog_table.colnames[available_columns.index(name)]
                        print(f"Auto-detected RA column: {ra_col}")
                        break
            
            if not dec_col:
                dec_names = ['dec', 'delta', 'delta_j2000', 'dej2000', 'cen_dec']
                for name in dec_names:
                    if name in available_columns:
                        dec_col = catalog_table.colnames[available_columns.index(name)]
                        print(f"Auto-detected Dec column: {dec_col}")
                        break
                        
            # Optional: Auto-detect resolution column if not mapped
            if not resolution_col:
                res_names = ['radius', 'size', 'resolution', 'fwhm', 'radius_pixels']
                for name in res_names:
                    if name in available_columns:
                        resolution_col = catalog_table.colnames[available_columns.index(name)]
                        print(f"Auto-detected Resolution column: {resolution_col}")
                        break
                        
            # Check if columns were successfully found
            if ra_col is None or dec_col is None:
                print(f"ERROR: RA or DEC column could not be determined in ASCII catalog: {catalog_path}")
                print(f"Available columns: {catalog_table.colnames}")
                return [] # Return empty if critical columns are missing
                
            print(f"Using columns - RA: {ra_col}, DEC: {dec_col}, Resolution: {resolution_col}")
                
            # Find galaxy column if it exists
            galaxy_col = None
            galaxy_col_candidates = ['galaxy', 'name', 'id', 'source_id', 'target', 'object']
            for col_name_candidate in galaxy_col_candidates:
                if col_name_candidate in available_columns:
                    galaxy_col = catalog_table.colnames[available_columns.index(col_name_candidate)]
                    print(f"Found potential galaxy column: {galaxy_col}")
                    break
            
            # Process each row
            total_count = len(catalog_table)
            filtered_count = 0
            process_rows = catalog_table # Start with all rows
            
            # Apply filtering (similar logic as FITS)
            if galaxy_col and target_galaxy:
                try:
                    mask = np.zeros(total_count, dtype=bool)
                    galaxy_names_lower = np.array([str(row[galaxy_col]).lower() for row in catalog_table])
                    mask = np.core.defchararray.find(galaxy_names_lower, target_galaxy) != -1
                    filtered_count = np.sum(mask)
                    if filtered_count > 0:
                        process_rows = catalog_table[mask]
                        print(f"Filtered ASCII catalog by galaxy name '{target_galaxy}' from {total_count} to {filtered_count} objects.")
                    else:
                        print(f"No objects match galaxy: {target_galaxy}, using position filtering only")
                except Exception as galaxy_filter_error:
                    print(f"Error in galaxy name filtering for ASCII: {galaxy_filter_error}")
                    
            if image_center_ra is not None and image_center_dec is not None and ra_col and dec_col:
                max_distance_deg = MAX_DISTANCE_DEG # Same larger distance for initial load
                try:
                    valid_rows = []
                    valid_indices = []
                    
                    for i, row in enumerate(process_rows):
                        try:
                            ra_val = float(row[ra_col])
                            dec_val = float(row[dec_col])
                            if np.isfinite(ra_val) and np.isfinite(dec_val):
                                valid_rows.append((ra_val, dec_val, i))
                                valid_indices.append(i)
                        except (ValueError, TypeError):
                            continue
                    
                    if len(valid_rows) > 0:
                        ra_values = np.array([row[0] for row in valid_rows])
                        dec_values = np.array([row[1] for row in valid_rows])
                        
                        cos_dec = np.cos(np.radians(image_center_dec))
                        ra_diff = (ra_values - image_center_ra) * cos_dec
                        dec_diff = dec_values - image_center_dec
                        distances = np.sqrt(ra_diff**2 + dec_diff**2)
                        distance_mask = distances <= max_distance_deg
                        final_indices = np.array(valid_indices)[distance_mask]
                        process_rows = process_rows[final_indices]
                        position_filtered_count = len(process_rows)
                        print(f"Position-filtered ASCII from {len(valid_rows)} to {position_filtered_count} objects within {max_distance_deg:.2f} degrees")
                    else:
                        print("No valid RA/DEC values found for position filtering.")
                        process_rows = np.array([]) # Empty array
                except Exception as coord_err:
                    print(f"Warning: Could not perform position filtering on ASCII data: {coord_err}")
            else:
                 print("Skipping position filtering (no image center or RA/Dec columns determined).")
                 
            # Process the filtered rows
            print(f"Processing {len(process_rows)} filtered ASCII catalog rows...")
            for row_idx, row in enumerate(process_rows):
                try:
                    # Use determined RA/Dec columns
                    ra = float(row[ra_col])
                    dec = float(row[dec_col])
                    
                    # Skip if invalid coordinates
                    if not (np.isfinite(ra) and np.isfinite(dec)):
                        continue
                    
                    # Create object data
                    obj_data = {
                        'ra': ra,
                        'dec': dec,
                        'x': 0,  # Will be set later
                        'y': 0,  # Will be set later
                        'radius_pixels': 5.0  # Default radius
                    }
                    
                    # Add resolution/size if column exists and is valid
                    if resolution_col and resolution_col in catalog_table.colnames:
                         try:
                             res_value = float(row[resolution_col])
                             if np.isfinite(res_value) and res_value > 0:
                                 obj_data['radius_pixels'] = res_value
                         except (ValueError, TypeError):
                             pass # Ignore if conversion fails
                             
                    # Add magnitude if available
                    mag_col_found = False
                    for mag_col_candidate in ['mag', 'magnitude']:
                        if mag_col_candidate in available_columns:
                            mag_col = catalog_table.colnames[available_columns.index(mag_col_candidate)]
                            try:
                                mag_value = float(row[mag_col])
                                if np.isfinite(mag_value):
                                    obj_data['magnitude'] = mag_value
                                    mag_col_found = True
                                    break # Found one, stop looking
                            except (ValueError, TypeError):
                                pass # Ignore if conversion fails
                    
                    catalog_data.append(obj_data)
                except Exception as e:
                    print(f"Error processing ASCII catalog row {row_idx}: {e}")
                    continue
        
        # Convert RA/DEC to pixel coordinates using the CURRENT image's WCS with orientation correction
        if image_wcs and image_wcs.has_celestial and catalog_data:
            print(f"Applying WCS transformation with orientation correction to {len(catalog_data)} catalog objects...")
            try:
                # Extract RA/DEC arrays
                ra_array = np.array([obj['ra'] for obj in catalog_data])
                dec_array = np.array([obj['dec'] for obj in catalog_data])
                
                # Create SkyCoord object for all points at once
                sky_coords = SkyCoord(ra_array, dec_array, unit='deg')
                
                # Convert all coordinates at once
                pixel_coords = image_wcs.celestial.world_to_pixel(sky_coords)
                
                # Apply WCS orientation corrections if needed
                if wcs_analysis_result and len(wcs_analysis_result) >= 3:
                    flip_y = wcs_analysis_result[0]
                    determinant = wcs_analysis_result[1]
                    
                    print(f"Applying WCS orientation corrections: flip_y={flip_y}, determinant={determinant}")
                    
                    # Get image dimensions for Y-flip correction
                    if flip_y:
                        try:
                            with fits.open(fits_file) as hdul:
                                for hdu in hdul:
                                    if hasattr(hdu, 'data') and hdu.data is not None:
                                        height = hdu.data.shape[-2]
                                        # Apply Y-flip correction to pixel coordinates
                                        pixel_coords = (pixel_coords[0], height - pixel_coords[1] - 1)
                                        print(f"Applied Y-flip correction using image height: {height}")
                                        break
                        except Exception as flip_error:
                            print(f"Warning: Could not apply Y-flip correction: {flip_error}")
                
                # Update object data with pixel coordinates
                valid_conversion_count = 0
                for i, obj in enumerate(catalog_data):
                    try:
                        px = float(pixel_coords[0][i])
                        py = float(pixel_coords[1][i])
                        # Only include if coordinates are finite (within image bounds)
                        if np.isfinite(px) and np.isfinite(py):
                            obj['x'] = px
                            obj['y'] = py
                            valid_conversion_count += 1
                        else:
                             # Mark objects outside the image bounds
                             obj['x'] = np.nan
                             obj['y'] = np.nan 
                    except Exception as coord_error:
                        print(f"Error converting coordinates for object {i}: {coord_error}")
                        obj['x'] = np.nan
                        obj['y'] = np.nan
                
                # Filter out objects that fall outside the image after WCS conversion
                original_count = len(catalog_data)
                catalog_data = [obj for obj in catalog_data if np.isfinite(obj['x']) and np.isfinite(obj['y'])]
                print(f"WCS conversion successful. Kept {len(catalog_data)} of {original_count} objects within image bounds.")
                
            except Exception as e:
                print(f"Error applying WCS to catalog: {e}")
                import traceback
                print(traceback.format_exc())
                # If WCS conversion fails, mark coords as invalid
                for obj in catalog_data:
                    obj['x'] = np.nan
                    obj['y'] = np.nan
        elif not image_wcs or not image_wcs.has_celestial:
             print("Skipping WCS conversion (no valid WCS found in current image).")
             # Mark all coordinates as invalid if no WCS
             for obj in catalog_data:
                 obj['x'] = np.nan
                 obj['y'] = np.nan
        
        print(f"Final loaded object count for {catalog_name}: {len(catalog_data)}")
        return catalog_data
        
    except Exception as e:
        print(f"Error loading catalog {catalog_name}: {e}")
        import traceback
        print(traceback.format_exc())
        return [] # Return empty list on error


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
        app.state.current_hdu_index = hdu_index # Explicitly set app.state to the used HDU index

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
            
            if fast_loading: # MODIFIED: Always use fast_loading path if true, regardless of is_large_file
                print(f"File processing with fast_loading=True (size: {format_file_size(file_size)}). Using SimpleTileGenerator.")
                
                # First, check if we already have a tile generator
                file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
                tile_generator = None # Ensure tile_generator is defined in this scope
                
                # Ensure we have a valid HDU index
                if hdu_index is None:
                    hdu_index = 0
                    
                try:
                    # Check if a generator for this file_id already exists
                    if file_id in active_tile_generators:
                        generator_instance = active_tile_generators[file_id]
                        logger.info(f"Reusing existing tile generator for {file_id}")
                    else:
                        # If not, create a new one
                        logger.info(f"Initializing tile generator for fast loading: {file_id}")
                        
                        # IMPORTANT: We need to open the FITS file to pass image data to the generator
                        with fits.open(fits_file) as hdul:
                            if not (0 <= hdu_index < len(hdul)):
                                raise HTTPException(status_code=400, detail=f"HDU index {hdu_index} is out of range.")
                            
                            image_data = hdul[hdu_index].data
                            header = hdul[hdu_index].header
                            
                            # Check if image_data is valid before creating the generator
                            if image_data is None:
                                raise HTTPException(status_code=400, detail=f"No image data found in HDU {hdu_index}.")

                            # Handle different dimensionality
                            if image_data is not None and image_data.ndim > 2:
                                print(f"Original image has {image_data.ndim} dimensions, taking first 2D slice for tile generator")
                                if image_data.ndim == 3:
                                    image_data = image_data[0, :, :]
                                elif image_data.ndim == 4:
                                    image_data = image_data[0, 0, :, :]

                            # Apply Y-flip correction based on WCS orientation
                            flip_y, determinant, corrected_data = analyze_wcs_orientation(header, image_data)
                            if corrected_data is not None:
                                image_data = corrected_data

                        # Now create the generator with the corrected image data
                        generator_instance = SimpleTileGenerator(fits_file, hdu_index, image_data=image_data)
                        active_tile_generators[file_id] = generator_instance

                    # Ensure the overview is generated (can be done in the background)
                    if not generator_instance.overview_generated:
                        generator_instance.ensure_overview_generated()

                    # Get tile info from the generator
                    tile_info = generator_instance.get_tile_info()

                    # Return a JSON response indicating fast loading is active
                    return JSONResponse(content={
                        "fast_loading": True,
                        "file_id": file_id,
                        "tile_info": tile_info,
                        "message": "Fast loading enabled. Use tile endpoints to fetch image data."
                    })

                except Exception as e_init:
                    logger.critical(f"Error initializing SimpleTileGenerator for {file_id}: {e_init}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Failed to initialize tile generator: {str(e_init)}")

        except Exception as e:
            print(f"Error during fast-loading section or FITS processing in /fits-binary: {e}") # Modified to be more general
            import traceback
            print(traceback.format_exc())
            # Continue with normal processing if file size check fails or other init error
            # This fall-through might be problematic if fast_loading was expected.
            # Consider returning an error if fast_loading was true and failed.
            pass # Original code had a pass here after printing "Error checking file size"
        
        # Open the FITS file (This part is for non-fast_loading or if fast_loading path had an issue and passed)
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
            image_data = hdu.data
            if image_data is not None and image_data.ndim > 2:
                print(f"Original image has {image_data.ndim} dimensions, taking first 2D slice for fits-binary output")
                if image_data.ndim == 3:
                    image_data = image_data[0, :, :]
                elif image_data.ndim == 4:
                    image_data = image_data[0, 0, :, :]
                # else: higher dimensions are not explicitly sliced here, assuming they are rare for direct binary output
            
            # Get the header
            header = hdu.header
            
            # Apply Y-flip correction based on WCS orientation
            flip_y, determinant, corrected_data = analyze_wcs_orientation(header, image_data)
            if corrected_data is not None:
                image_data = corrected_data
            
            # Check if data is valid
            if image_data is None:
                return JSONResponse(
                    status_code=400,
                    content={"error": f"No data in HDU {hdu_index} after potential slicing."}
                )
            
            # Get dimensions (use last two for multi-dim data after slicing)
            height, width = image_data.shape[-2:]
            
            # Calculate min and max values using percentiles for initial display
            valid_data = image_data[np.isfinite(image_data)]
            if valid_data.size == 0:
                print("Warning: No finite data in image for percentile calculation (fits-binary non-tiled). Defaulting min/max.")
                min_value = 0.0
                max_value = 1.0
            else:
                min_value = float(np.percentile(valid_data, 0.5))
                max_value = float(np.percentile(valid_data, 99.5))
                if min_value >= max_value: # Fallback for noisy or flat data
                    print(f"Warning: Percentile min ({min_value}) >= max ({max_value}) in fits-binary. Falling back to overall min/max.")
                    min_value = float(np.min(valid_data))
                    max_value = float(np.max(valid_data))
                    if min_value >= max_value:
                        max_value = min_value + 1e-6 # Add epsilon if still equal
            
            print(f"Initial dynamic range for non-tiled fits-binary (0.5-99.5 percentile): min={min_value}, max={max_value}")

            # Extract WCS information if available
            wcs_info = None
            try:
                w = WCS(_prepare_jwst_header_for_wcs(header))
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
                        "bunit": header.get('BUNIT', '')
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
        print(f"Initializing simple tile generator for {file_id} in background")
        
        # Create simple tile generator using file path and HDU index
        tile_generator = SimpleTileGenerator(fits_file, hdu_index)
        active_tile_generators[file_id] = tile_generator
        print(f"Simple tile generator initialized for {file_id}")
    except Exception as e:
        print(f"Error initializing simple tile generator: {e}")
        import traceback
        print(traceback.format_exc())

def initialize_tile_generator(file_id, fits_data):
    try:
        print(f"Initializing tile generator for {file_id}")
        # Extract file path and HDU index from the fits_data
        if hasattr(fits_data, 'fits_file_path') and hasattr(fits_data, 'hdu_index'):
            active_tile_generators[file_id] = SimpleTileGenerator(fits_data.fits_file_path, fits_data.hdu_index)
        else:
            # Fallback - try to use current file info
            fits_file = getattr(app.state, "current_fits_file", None)
            hdu_index = getattr(app.state, "current_hdu_index", 0)
            if fits_file:
                active_tile_generators[file_id] = SimpleTileGenerator(fits_file, hdu_index)
        print(f"Tile generator initialized for {file_id}")
    except Exception as e:
        print(f"Error in tile generator initialization: {e}")
        import traceback
        print(traceback.format_exc())




@app.get("/fits-overview/{quality}")
async def get_fits_overview(quality: int = 0, file_id: str = Query(None)): # Added file_id query parameter
    # if file_id is not provided, try to construct from app.state (legacy or direct calls)
    if not file_id:
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            raise HTTPException(status_code=404, detail="No FITS file loaded and no file_id provided")
        hdu_index = getattr(app.state, "current_hdu_index", 0)
        file_id = f"{os.path.basename(fits_file)}:{hdu_index}"
    else: # If file_id is provided, parse it (e.g., "filename.fits:0")
        try:
            # This assumes file_id from client is "actual_filename_on_server.fits:hdu_index"
            # We need to ensure the tile_generator was initialized with the full path.
            # The active_tile_generators keys are basename:hdu_index.
            # So file_id from client should match this key format.
            pass # file_id is already in the correct format for active_tile_generators lookup
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid file_id format: {file_id}. Expected 'filename:hdu_index'")

    print(f"Requesting overview for file_id: {file_id}, quality: {quality}")

    tile_generator = active_tile_generators.get(file_id)
    if not tile_generator:
        # This case should ideally be handled by client: /fits-binary should be called first.
        # However, if a generator is missing, it's an issue.
        print(f"Tile generator not found for {file_id} in /fits-overview. This might indicate an issue or a direct call without prior /fits-binary.")
        # Attempt to re-initialize - this requires knowing the full_path and hdu_index from file_id
        try:
            base_filename, hdu_str = file_id.rsplit(':', 1)
            hdu_idx_from_id = int(hdu_str)
            # This is tricky: we only have base_filename. We need the full path.
            # We'll assume current_fits_file corresponds to this if its basename matches.
            current_full_path = getattr(app.state, "current_fits_file", None)
            if current_full_path and os.path.basename(current_full_path) == base_filename:
                print(f"Attempting to re-initialize generator for {file_id} using path {current_full_path}")
                generator_instance = SimpleTileGenerator(current_full_path, hdu_idx_from_id)
                active_tile_generators[file_id] = generator_instance
                tile_generator = generator_instance
            else:
                # Search for the file in the "files" directory
                found_path = None
                for root, _, files_in_dir in os.walk("files"):
                    if base_filename in files_in_dir:
                        found_path = os.path.join(root, base_filename)
                        break
                if found_path:
                    print(f"Attempting to re-initialize generator for {file_id} using found path {found_path}")
                    generator_instance = SimpleTileGenerator(found_path, hdu_idx_from_id)
                    active_tile_generators[file_id] = generator_instance
                    tile_generator = generator_instance
                else:
                    print(f"Could not find full path for {base_filename} to re-initialize generator.")
                    raise HTTPException(status_code=404, detail=f"Tile generator for {file_id} not found and could not be re-initialized.")
        except Exception as e_reinit:
            print(f"Error re-initializing generator for {file_id}: {e_reinit}")
            raise HTTPException(status_code=500, detail=f"Failed to prepare tile generator for {file_id}")

    try:
        tile_generator.ensure_overview_generated() # Ensure overview is generated
        if tile_generator.overview_image:
            print(f"Successfully retrieved overview for {file_id}")
            return Response(content=base64.b64decode(tile_generator.overview_image), media_type="image/png")
        else:
            print(f"Overview not generated or empty for {file_id} even after ensure_overview_generated.")
            raise HTTPException(status_code=404, detail="Overview not available or empty")
    except Exception as e:
        print(f"Error serving overview for {file_id}: {e}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error serving overview: {str(e)}")



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
from pathlib import Path
import numpy as np
import json
from typing import Optional, Dict, Any, List
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

@app.get("/catalog-binary/{catalog_name}")
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
    stats: bool = Query(False, description="Include column statistics")
):
    """
    Return catalog data in binary format for faster transfer.
    
    Binary format structure:
    - Header (JSON metadata as UTF-8 bytes, length prefixed)
    - Data section with fixed-size records
    """
    catalogs_dir = Path("catalogs")
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

        # Load and process catalog data
        catalog_data = load_catalog_data(str(catalogs_dir / catalog_name))
        if not catalog_data:
            raise HTTPException(
                status_code=500,
                detail="Failed to process catalog. An image with WCS may be required for full data."
            )

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
        
        for i, item in enumerate(catalog_data):
            ra_array[i] = item.get('ra', 0.0)
            dec_array[i] = item.get('dec', 0.0)
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
            binary_buffer.write(struct.pack('<d', ra_array[idx]))        # 8 bytes
            binary_buffer.write(struct.pack('<d', dec_array[idx]))       # 8 bytes
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
        
             
@app.get("/catalog-with-flags/{catalog_name}")
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
    stats: bool = Query(False, description="Include column statistics")
):
    """
    Return catalog data with advanced filtering, pagination, and TopCat-like features.
    """
    catalogs_dir = Path("catalogs")
    try:
        catalog_table = get_astropy_table_from_catalog(catalog_name, catalogs_dir)
        if catalog_table is None:
            raise HTTPException(status_code=404, detail=f"Could not load catalog '{catalog_name}'.")

        # Extract boolean columns (unchanged logic)
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

        # Load and process catalog data
        catalog_data = load_catalog_data(str(catalogs_dir / catalog_name))
        if not catalog_data:
            raise HTTPException(
                status_code=500,
                detail="Failed to process catalog. An image with WCS may be required for full data."
            )

        full_data = table_to_serializable(catalog_table)
        
        # Create a dictionary for quick lookup of catalog data by RA
        catalog_data_map = {f"{item['ra']:.6f}": item for item in catalog_data}

        # Merge the data
        for item in full_data:
            ra_key = f"{item.get('ra', ''):.6f}"
            if ra_key in catalog_data_map:
                item.update(catalog_data_map[ra_key])
        
        total_items = len(full_data)
        
        # Apply advanced filters if provided
        filtered_data = apply_advanced_filters(full_data, search, filters)
        filtered_total = len(filtered_data)
        
        # Apply sorting if requested
        if sort_by and filtered_data:
            filtered_data = apply_sorting(filtered_data, sort_by, sort_order)
        
        # Select specific columns if requested
        if columns:
            selected_columns = [col.strip() for col in columns.split(',')]
            available_columns = list(filtered_data[0].keys()) if filtered_data else []
            valid_columns = [col for col in selected_columns if col in available_columns]
            
            if valid_columns:
                filtered_data = [{col: item.get(col) for col in valid_columns} for item in filtered_data]
        
        # Apply pagination
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_data = filtered_data[start_idx:end_idx]
        
        # Calculate pagination metadata
        total_pages = (filtered_total + limit - 1) // limit
        has_next = page < total_pages
        has_prev = page > 1
        
        response_data = {
            "catalog_data": paginated_data,
            "boolean_columns": boolean_columns,
            "pagination": {
                "page": page,
                "limit": limit,
                "total_items": filtered_total,
                "total_pages": total_pages,
                "has_next": has_next,
                "has_prev": has_prev,
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
        
        # Add column statistics if requested
        if stats and paginated_data:
            response_data["column_stats"] = calculate_column_stats(paginated_data)
        
        # Check if client accepts gzip and size warrants compression
        response_size = len(json.dumps(response_data, separators=(',', ':')))
        accept_encoding = request.headers.get('accept-encoding', '')
        
        # Only compress if response is large and client accepts gzip
        if 'gzip' in accept_encoding and response_size > 5000:
            return create_safe_compressed_response(response_data)
        
        return JSONResponse(content=response_data)

    except Exception as e:
        logger.error(f"Error in catalog_with_flags: {str(e)}")
        import traceback
        traceback.print_exc()
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


@app.get("/catalog-metadata/{catalog_name}")
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



@app.get("/catalog-column-analysis/{catalog_name}/{column_name}")
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
import json
from fastapi import Form
from fastapi.responses import JSONResponse

# Helper function to load catalog as Astropy Table
from astropy.table import Table # Ensure Table is imported


from typing import Union, Optional
from pathlib import Path
from astropy.table import Table
from astropy.io import fits

def get_astropy_table_from_catalog(catalog_name: str, catalogs_dir_path: Path) -> Optional[Table]:
   # catalog_file_path = catalogs_dir_path / catalog_name # Original line
   # Try with the name as is (spaces might be legitimate or decoded from %20)
   catalog_file_path_as_is = catalogs_dir_path / catalog_name
   
   if catalog_file_path_as_is.exists():
       catalog_file_path = catalog_file_path_as_is
       print(f"[get_astropy_table_from_catalog] Found catalog file directly: {catalog_file_path}")
   else:
       # If not found, try replacing spaces with '+' (common for URL-decoded query params)
       catalog_name_with_plus = catalog_name.replace(' ', '+')
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
    
    # # Standard FITS WCS keywords for matrix-based transformations
    # pc_keys = ['PC1_1', 'PC1_2', 'PC2_1', 'PC2_2']
    # cd_keys = ['CD1_1', 'CD1_2', 'CD2_1', 'CD2_2']
    # cdelt_keys = ['CDELT1', 'CDELT2']

    # has_pc = any(key in new_header for key in pc_keys)
    # has_cd = any(key in new_header for key in cd_keys)

    # # Simple check for JWST data - can be made more specific if needed
    # is_jwst = 'JWST' in str(new_header.get('TELESCOP', '')) or \
    #           any(instr in str(new_header.get('INSTRUME', '')) for instr in ['NIRCAM', 'MIRI'])

    # if not is_jwst:
    #     return new_header # Return original header if not identified as JWST

    # print("[_prepare_jwst_header_for_wcs] JWST header detected. Analyzing WCS keywords.")

    # # Astropy's WCS processing prefers CDi_j over PCi_j + CDELTi.
    # # If a CD matrix is present, we assume it's the intended representation.
    # # To prevent conflicts, we can remove the PC matrix and CDELT values.
    # if has_cd:
    #     print("[_prepare_jwst_header_for_wcs] CD matrix found. Prioritizing it.")
    #     # Remove PC and CDELT keys to avoid ambiguity for Astropy
    #     keys_to_remove = []
    #     for key in pc_keys + cdelt_keys:
    #         if key in new_header:
    #             keys_to_remove.append(key)
        
    #     if keys_to_remove:
    #         print(f"[_prepare_jwst_header_for_wcs] Removing {keys_to_remove} to prevent conflict with CD matrix.")
    #         for key in keys_to_remove:
    #             del new_header[key]

    # # If only a PC matrix is present, ensure it's complete for Astropy.
    # # Some JWST products might omit zero-value off-diagonal terms.
    # elif has_pc:
    #     print("[_prepare_jwst_header_for_wcs] PC matrix found (and no CD matrix). Checking for completeness.")
    #     if 'PC1_2' not in new_header:
    #         new_header['PC1_2'] = 0.0
    #         print("[_prepare_jwst_header_for_wcs] Added PC1_2 = 0.0 to complete PC matrix.")
    #     if 'PC2_1' not in new_header:
    #         new_header['PC2_1'] = 0.0
    #         print("[_prepare_jwst_header_for_wcs] Added PC2_1 = 0.0 to complete PC matrix.")

    # else:
    #     print("[_prepare_jwst_header_for_wcs] No CD or PC matrix keywords found. No changes made.")
        
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

def load_catalog_data(catalog_path_str):
    """
    Load catalog data from a file.
    Supports FITS tables and CSV/TSV formats.
    Filters objects to match the loaded FITS image galaxy.
    Uses saved column mappings if available.
    Incorporates WCS orientation analysis for proper coordinate handling.
    """
    catalog_path = Path(catalog_path_str) # Convert string path to Path object
    catalog_name = catalog_path.name # Get filename for mapping lookup
    print(f"load_catalog_data called for: {catalog_name}")
    
    try:
        catalog_data = []
        
        # Use the currently selected FITS file
        fits_file = getattr(app.state, "current_fits_file", None)
        if not fits_file:
            print("No FITS file currently selected")
            return []
            
        print(f"Using WCS from current FITS file: {fits_file}")
        fits_filename = os.path.basename(fits_file).lower()
        fits_name_without_ext = os.path.splitext(fits_filename)[0]
        
        # Extract potential galaxy name from filename
        galaxy_patterns = [
            r'(ngc\d+)',  # NGC galaxies (e.g., ngc0628)
            r'(m\d+)',    # Messier objects (e.g., m74)
            r'(ic\d+)',   # IC catalog objects
            r'([a-z]+\d+)'  # Any letter followed by numbers
        ]
        
        target_galaxy = None
        for pattern in galaxy_patterns:
            matches = re.findall(pattern, fits_name_without_ext)
            if matches:
                target_galaxy = matches[0]
                print(f"Extracted galaxy identifier from FITS filename: {target_galaxy}")
                break
        
        # Get WCS of the current image to filter by position and analyze orientation
        image_wcs = None
        image_center_ra = None
        image_center_dec = None
        wcs_flip_info = {
            'flip_y': False,
            'determinant': 1.0,
            'coordinate_system_flipped': False
        }
        
        try:
            with fits.open(fits_file) as hdul:
                # Find the HDU with image data
                image_hdu = None
                for i, hdu in enumerate(hdul):
                    if hasattr(hdu, 'data') and hdu.data is not None and len(getattr(hdu, 'shape', [])) >= 2:
                        image_hdu = hdu
                        break
                
                if image_hdu:
                    # Analyze WCS orientation using the header
                    print("Analyzing WCS orientation for coordinate system...")
                    print('calling analyze_wcs_orientation...')
                    try:
                        wcs_analysis_result = analyze_wcs_orientation(image_hdu.header, image_hdu.data)
                        
                        if wcs_analysis_result and len(wcs_analysis_result) >= 3:
                            flip_y = wcs_analysis_result[0]
                            determinant = wcs_analysis_result[1]
                            flipped_data = wcs_analysis_result[2]
                            
                            print(f"WCS Analysis Results:")
                            print(f"  Y-axis flip needed: {flip_y}")
                            print(f"  Transformation determinant: {determinant}")
                            
                            # Store WCS analysis results for later use
                            wcs_flip_info = {
                                'flip_y': flip_y,
                                'determinant': determinant,
                                'coordinate_system_flipped': determinant < 0
                            }
                        else:
                            print("WCS orientation analysis returned invalid result, proceeding with standard orientation")
                            wcs_flip_info = {
                                'flip_y': False,
                                'determinant': 1.0,
                                'coordinate_system_flipped': False
                            }
                    except Exception as wcs_analysis_error:
                        print(f"Error in WCS orientation analysis: {wcs_analysis_error}")
                        import traceback
                        print(traceback.format_exc())
                        wcs_flip_info = {
                            'flip_y': False,
                            'determinant': 1.0,
                            'coordinate_system_flipped': False
                        }
                    
                    # Get WCS from the HDU and apply orientation corrections
                    try:
                        # Create a copy of the header for potential modifications
                        corrected_header = image_hdu.header.copy()
                        
                        # Apply WCS corrections if needed
                        if wcs_flip_info['flip_y']:
                            print("Applying Y-flip correction to WCS header...")
                            
                            # Get image dimensions
                            if hasattr(image_hdu, 'data'):
                                height, width = image_hdu.data.shape[-2:]
                                
                                # Modify the WCS header to account for Y-flip
                                # Update CRPIX2 to reflect the flipped coordinate system
                                if 'CRPIX2' in corrected_header:
                                    original_crpix2 = corrected_header['CRPIX2']
                                    corrected_crpix2 = height + 1 - original_crpix2
                                    corrected_header['CRPIX2'] = corrected_crpix2
                                    print(f"Updated CRPIX2: {original_crpix2} -> {corrected_crpix2}")
                                
                                # Flip the Y-axis transformation matrix elements
                                if 'CD2_2' in corrected_header:
                                    corrected_header['CD2_2'] = -corrected_header['CD2_2']
                                    print(f"Flipped CD2_2 sign: {corrected_header['CD2_2']}")
                                if 'CD1_2' in corrected_header:
                                    corrected_header['CD1_2'] = -corrected_header['CD1_2']
                                    print(f"Flipped CD1_2 sign: {corrected_header['CD1_2']}")
                                elif 'PC2_2' in corrected_header:
                                    corrected_header['PC2_2'] = -corrected_header['PC2_2']
                                    print(f"Flipped PC2_2 sign: {corrected_header['PC2_2']}")
                                if 'PC1_2' in corrected_header:
                                    corrected_header['PC1_2'] = -corrected_header['PC1_2']
                                    print(f"Flipped PC1_2 sign: {corrected_header['PC1_2']}")
                        
                        # Create WCS object with corrected header
                        image_wcs = WCS(corrected_header)
                        print("Successfully created WCS object with orientation corrections")
                        
                        # Get transformation matrix elements for validation
                        header = corrected_header
                        if 'CD1_1' in header:
                            cd11 = header.get('CD1_1', 0)
                            cd12 = header.get('CD1_2', 0)
                            cd21 = header.get('CD2_1', 0)
                            cd22 = header.get('CD2_2', 0)
                            print(f"Final CD matrix: [[{cd11}, {cd12}], [{cd21}, {cd22}]]")
                        elif 'PC1_1' in header:
                            pc11 = header.get('PC1_1', 1)
                            pc12 = header.get('PC1_2', 0)
                            pc21 = header.get('PC2_1', 0)
                            pc22 = header.get('PC2_2', 1)
                            cdelt1 = header.get('CDELT1', 1)
                            cdelt2 = header.get('CDELT2', 1)
                            print(f"Final PC matrix: [[{pc11}, {pc12}], [{pc21}, {pc22}]]")
                            print(f"Final CDELT: [{cdelt1}, {cdelt2}]")
                        
                    except Exception as wcs_error:
                        print(f"Error creating WCS object: {wcs_error}")
                        import traceback
                        print(traceback.format_exc())
                        image_wcs = None
                    
                    # Get the image center in pixel coordinates (no additional Y-flip needed since WCS is corrected)
                    if hasattr(image_hdu, 'data') and image_wcs:
                        try:
                            height, width = image_hdu.data.shape[-2:]
                            center_x = width // 2
                            center_y = height // 2
                            
                            # No additional Y-flip correction needed here since WCS is already corrected
                            print(f"Using image center: x={center_x}, y={center_y}")
                            
                            # Convert center to RA, DEC using corrected WCS
                            center_coords = image_wcs.pixel_to_world(center_x, center_y)
                            if hasattr(center_coords, 'ra') and hasattr(center_coords, 'dec'):
                                image_center_ra = center_coords.ra.deg
                                image_center_dec = center_coords.dec.deg
                                print(f"Image center (with corrected WCS): RA={image_center_ra:.6f}, DEC={image_center_dec:.6f}")
                            else:
                                print("Warning: Could not extract RA/DEC from center coordinates")
                        except Exception as center_error:
                            print(f"Error calculating image center coordinates: {center_error}")
                            import traceback
                            print(traceback.format_exc())
                else:
                    print("No image HDU found in FITS file")
        except Exception as e:
            print(f"Error getting image WCS and orientation: {e}")
            import traceback
            print(traceback.format_exc())
        
        # --- Column Name Handling --- 
        ra_col = None
        dec_col = None
        resolution_col = None # Optional resolution/size column
        
        # Check for saved mapping first
        if catalog_name in catalog_column_mappings:
            mapping = catalog_column_mappings[catalog_name]
            ra_col = mapping.get('ra_col')
            dec_col = mapping.get('dec_col')
            resolution_col = mapping.get('resolution_col') # Get resolution if mapped
            print(f"Using saved mapping for {catalog_name}: RA={ra_col}, Dec={dec_col}, Res={resolution_col}")
        else:
             print(f"No saved mapping found for {catalog_name}. Attempting auto-detection.")
        # --- End Column Name Handling --- 
        
        # Check if it's a FITS file
        if catalog_path.suffix.lower() in ['.fits', '.fit']:
            print(f"Loading FITS catalog: {catalog_path}")
            try:
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
                    available_columns = [col.lower() for col in catalog_table.names]
                    print(f"FITS catalog columns: {catalog_table.names}")
                    
                    # Auto-detect columns ONLY if mapping wasn't found/used
                    if not ra_col:
                        # Common names for RA and DEC columns
                        ra_names = ['ra', 'alpha', 'alpha_j2000', 'raj2000', 'cen_ra']
                        for name in ra_names:
                            if name in available_columns:
                                ra_col = catalog_table.names[available_columns.index(name)] # Get original case
                                print(f"Auto-detected RA column: {ra_col}")
                                break
                    
                    if not dec_col:
                        dec_names = ['dec', 'delta', 'delta_j2000', 'dej2000', 'cen_dec']
                        for name in dec_names:
                            if name in available_columns:
                                dec_col = catalog_table.names[available_columns.index(name)] # Get original case
                                print(f"Auto-detected Dec column: {dec_col}")
                                break
                    
                    # Optional: Auto-detect resolution column if not mapped
                    if not resolution_col:
                        res_names = ['radius', 'size', 'resolution', 'fwhm', 'radius_pixels']
                        for name in res_names:
                            if name in available_columns:
                                resolution_col = catalog_table.names[available_columns.index(name)]
                                print(f"Auto-detected Resolution column: {resolution_col}")
                                break
                                
                    # Check if columns were successfully found (either mapped or auto-detected)
                    if ra_col is None or dec_col is None:
                        print(f"ERROR: RA ({ra_col}) or DEC ({dec_col}) column could not be determined in catalog: {catalog_path}")
                        print(f"Available columns: {catalog_table.names}")
                        return [] # Return empty if critical columns are missing
                    
                    print(f"Using columns - RA: {ra_col}, DEC: {dec_col}, Resolution: {resolution_col}")
                    
                    # Find galaxy column if it exists (for filtering)
                    galaxy_col = None
                    galaxy_col_candidates = ['galaxy', 'name', 'id', 'source_id', 'target', 'object']
                    
                    for col_name_candidate in galaxy_col_candidates:
                        if col_name_candidate in available_columns:
                            galaxy_col = catalog_table.names[available_columns.index(col_name_candidate)]
                            print(f"Found potential galaxy column: {galaxy_col}")
                            break
                    
                    # Process each row - optimize by pre-filtering if possible
                    total_count = len(catalog_table)
                    filtered_count = 0
                    
                    # Filtering logic - use a combination of galaxy name and position filtering
                    process_rows = catalog_table # Start with all rows
                    
                    # First try galaxy name filtering if possible
                    if galaxy_col and target_galaxy:
                        try:
                            # Create a mask for matching rows
                            mask = np.zeros(total_count, dtype=bool)
                            
                            # Convert all galaxy names to lowercase for case-insensitive comparison
                            galaxy_names_lower = np.array([str(row[galaxy_col]).lower() for row in catalog_table])
                            
                            # Set mask for rows that contain the target galaxy name
                            mask = np.core.defchararray.find(galaxy_names_lower, target_galaxy) != -1
                            filtered_count = np.sum(mask)
                            
                            if filtered_count > 0:
                                # Apply the mask to get only matching rows
                                process_rows = catalog_table[mask]
                                print(f"Filtered catalog by galaxy name '{target_galaxy}' from {total_count} to {filtered_count} objects.")
                            else:
                                # If no matches by galaxy name, fall back to all rows (will filter by position later)
                                print(f"No objects match galaxy: {target_galaxy}, using position filtering only")
                        except Exception as galaxy_filter_error:
                            print(f"Error in galaxy name filtering: {galaxy_filter_error}")
                    
                    # Apply distance-based filtering if we have image center coordinates
                    if image_center_ra is not None and image_center_dec is not None and ra_col and dec_col:
                        position_filtered_count = 0
                        # Increased max_distance_deg for initial load to ensure context
                        max_distance_deg = MAX_DISTANCE_DEG  # ~30 arcmin - adjust as needed
                        
                        try:
                            # Create arrays for faster calculation (handle potential non-numeric data)
                            valid_rows = []
                            valid_indices = []
                            
                            for i, row in enumerate(process_rows):
                                try:
                                    ra_val = float(row[ra_col])
                                    dec_val = float(row[dec_col])
                                    if np.isfinite(ra_val) and np.isfinite(dec_val):
                                        valid_rows.append((ra_val, dec_val, i))
                                        valid_indices.append(i)
                                except (ValueError, TypeError):
                                    continue
                            
                            if len(valid_rows) > 0:
                                ra_values = np.array([row[0] for row in valid_rows])
                                dec_values = np.array([row[1] for row in valid_rows])
                                
                                # Calculate angular distance (simple approximation)
                                cos_dec = np.cos(np.radians(image_center_dec))
                                ra_diff = (ra_values - image_center_ra) * cos_dec
                                dec_diff = dec_values - image_center_dec
                                distances = np.sqrt(ra_diff**2 + dec_diff**2)
                                
                                # Create mask for objects within distance limit
                                distance_mask = distances <= max_distance_deg
                                final_indices = np.array(valid_indices)[distance_mask]
                                
                                # Select the rows using the final indices
                                process_rows = process_rows[final_indices]
                                position_filtered_count = len(process_rows)
                                
                                print(f"Position-filtered from {len(valid_rows)} to {position_filtered_count} objects within {max_distance_deg:.2f} degrees of image center")
                            else:
                                print("No valid RA/DEC values found for position filtering.")
                                process_rows = np.array([]) # Empty array if no valid coords
                        except Exception as coord_err:
                            print(f"Warning: Could not perform position filtering due to coordinate data issues: {coord_err}")
                            # Continue without position filtering
                    else:
                        print("Skipping position filtering (no image center or RA/Dec columns determined).")
                    
                    # Process the filtered rows
                    print(f"Processing {len(process_rows)} filtered FITS catalog rows...")
                    for row_idx, row in enumerate(process_rows):
                        try:
                            # Use determined RA/Dec columns
                            ra = float(row[ra_col])
                            dec = float(row[dec_col])
                            
                            # Skip if invalid coordinates
                            if not (np.isfinite(ra) and np.isfinite(dec)):
                                continue
                            
                            # Create object data
                            obj_data = {
                                'ra': ra,
                                'dec': dec,
                                'x': 0,  # Will be set later
                                'y': 0,  # Will be set later
                                'radius_pixels': 5.0  # Default radius
                            }
                            
                            # Add resolution/size if column exists and is valid
                            if resolution_col and resolution_col in row.array.dtype.names:
                                 try:
                                     res_value = float(row[resolution_col])
                                     if np.isfinite(res_value) and res_value > 0:
                                         obj_data['radius_pixels'] = res_value
                                 except (ValueError, TypeError):
                                     pass # Ignore if conversion fails
                            
                            # Add magnitude if available
                            mag_col_found = False
                            for mag_col_candidate in ['mag', 'magnitude']:
                                if mag_col_candidate in available_columns:
                                    mag_col = catalog_table.names[available_columns.index(mag_col_candidate)]
                                    try:
                                        mag_value = float(row[mag_col])
                                        if np.isfinite(mag_value):
                                            obj_data['magnitude'] = mag_value
                                            mag_col_found = True
                                            break # Found one, stop looking
                                    except (ValueError, TypeError):
                                        pass # Ignore if conversion fails
                            
                            catalog_data.append(obj_data)
                        except Exception as e:
                            print(f"Error processing FITS catalog row {row_idx}: {e}")
                            continue
            except Exception as fits_error:
                print(f"Error loading FITS catalog: {fits_error}")
                import traceback
                print(traceback.format_exc())
                return []
        else:
            # Assume it's a CSV/TSV file
            print(f"Loading ASCII/CSV catalog: {catalog_path}")
            try:
                from astropy.table import Table
                # Try common formats
                catalog_table = None
                try:
                     catalog_table = Table.read(catalog_path, format='ascii')
                     print("Successfully read as ASCII format")
                except Exception:
                     try:
                         catalog_table = Table.read(catalog_path, format='csv')
                         print("Successfully read as CSV format")
                     except Exception:
                         catalog_table = Table.read(catalog_path, format='tab') # Try tab-separated
                         print("Successfully read as tab-separated format")
                         
            except Exception as e:
                print(f"Error reading catalog as ASCII/CSV/TSV: {e}")
                import traceback
                print(traceback.format_exc())
                return []
            
            available_columns = [col.lower() for col in catalog_table.colnames]
            print(f"ASCII catalog columns: {catalog_table.colnames}")
            
            # Auto-detect columns ONLY if mapping wasn't found/used
            if not ra_col:
                ra_names = ['ra', 'alpha', 'alpha_j2000', 'raj2000', 'cen_ra']
                for name in ra_names:
                    if name in available_columns:
                        ra_col = catalog_table.colnames[available_columns.index(name)]
                        print(f"Auto-detected RA column: {ra_col}")
                        break
            
            if not dec_col:
                dec_names = ['dec', 'delta', 'delta_j2000', 'dej2000', 'cen_dec']
                for name in dec_names:
                    if name in available_columns:
                        dec_col = catalog_table.colnames[available_columns.index(name)]
                        print(f"Auto-detected Dec column: {dec_col}")
                        break
                        
            # Optional: Auto-detect resolution column if not mapped
            if not resolution_col:
                res_names = ['radius', 'size', 'resolution', 'fwhm', 'radius_pixels']
                for name in res_names:
                    if name in available_columns:
                        resolution_col = catalog_table.colnames[available_columns.index(name)]
                        print(f"Auto-detected Resolution column: {resolution_col}")
                        break
                        
            # Check if columns were successfully found
            if ra_col is None or dec_col is None:
                print(f"ERROR: RA or DEC column could not be determined in ASCII catalog: {catalog_path}")
                print(f"Available columns: {catalog_table.colnames}")
                return [] # Return empty if critical columns are missing
                
            print(f"Using columns - RA: {ra_col}, DEC: {dec_col}, Resolution: {resolution_col}")
                
            # Find galaxy column if it exists
            galaxy_col = None
            galaxy_col_candidates = ['galaxy', 'name', 'id', 'source_id', 'target', 'object']
            for col_name_candidate in galaxy_col_candidates:
                if col_name_candidate in available_columns:
                    galaxy_col = catalog_table.colnames[available_columns.index(col_name_candidate)]
                    print(f"Found potential galaxy column: {galaxy_col}")
                    break
            
            # Process each row
            total_count = len(catalog_table)
            filtered_count = 0
            process_rows = catalog_table # Start with all rows
            
            # Apply filtering (similar logic as FITS)
            if galaxy_col and target_galaxy:
                try:
                    mask = np.zeros(total_count, dtype=bool)
                    galaxy_names_lower = np.array([str(row[galaxy_col]).lower() for row in catalog_table])
                    mask = np.core.defchararray.find(galaxy_names_lower, target_galaxy) != -1
                    filtered_count = np.sum(mask)
                    if filtered_count > 0:
                        process_rows = catalog_table[mask]
                        print(f"Filtered ASCII catalog by galaxy name '{target_galaxy}' from {total_count} to {filtered_count} objects.")
                    else:
                        print(f"No objects match galaxy: {target_galaxy}, using position filtering only")
                except Exception as galaxy_filter_error:
                    print(f"Error in galaxy name filtering for ASCII: {galaxy_filter_error}")
                    
            if image_center_ra is not None and image_center_dec is not None and ra_col and dec_col:
                max_distance_deg = 0.5 # Same larger distance for initial load
                try:
                    valid_rows = []
                    valid_indices = []
                    
                    for i, row in enumerate(process_rows):
                        try:
                            ra_val = float(row[ra_col])
                            dec_val = float(row[dec_col])
                            if np.isfinite(ra_val) and np.isfinite(dec_val):
                                valid_rows.append((ra_val, dec_val, i))
                                valid_indices.append(i)
                        except (ValueError, TypeError):
                            continue
                    
                    if len(valid_rows) > 0:
                        ra_values = np.array([row[0] for row in valid_rows])
                        dec_values = np.array([row[1] for row in valid_rows])
                        
                        cos_dec = np.cos(np.radians(image_center_dec))
                        ra_diff = (ra_values - image_center_ra) * cos_dec
                        dec_diff = dec_values - image_center_dec
                        distances = np.sqrt(ra_diff**2 + dec_diff**2)
                        distance_mask = distances <= max_distance_deg
                        final_indices = np.array(valid_indices)[distance_mask]
                        process_rows = process_rows[final_indices]
                        position_filtered_count = len(process_rows)
                        print(f"Position-filtered ASCII from {len(valid_rows)} to {position_filtered_count} objects within {max_distance_deg:.2f} degrees")
                    else:
                        print("No valid RA/DEC values found for position filtering.")
                        process_rows = np.array([]) # Empty array
                except Exception as coord_err:
                    print(f"Warning: Could not perform position filtering on ASCII data: {coord_err}")
            else:
                 print("Skipping position filtering (no image center or RA/Dec columns determined).")
                 
            # Process the filtered rows
            print(f"Processing {len(process_rows)} filtered ASCII catalog rows...")
            for row_idx, row in enumerate(process_rows):
                try:
                    # Use determined RA/Dec columns
                    ra = float(row[ra_col])
                    dec = float(row[dec_col])
                    
                    # Skip if invalid coordinates
                    if not (np.isfinite(ra) and np.isfinite(dec)):
                        continue
                    
                    # Create object data
                    obj_data = {
                        'ra': ra,
                        'dec': dec,
                        'x': 0,  # Will be set later
                        'y': 0,  # Will be set later
                        'radius_pixels': 5.0  # Default radius
                    }
                    
                    # Add resolution/size if column exists and is valid
                    if resolution_col and resolution_col in catalog_table.colnames:
                         try:
                             res_value = float(row[resolution_col])
                             if np.isfinite(res_value) and res_value > 0:
                                 obj_data['radius_pixels'] = res_value
                         except (ValueError, TypeError):
                             pass # Ignore if conversion fails
                             
                    # Add magnitude if available
                    mag_col_found = False
                    for mag_col_candidate in ['mag', 'magnitude']:
                        if mag_col_candidate in available_columns:
                            mag_col = catalog_table.colnames[available_columns.index(mag_col_candidate)]
                            try:
                                mag_value = float(row[mag_col])
                                if np.isfinite(mag_value):
                                    obj_data['magnitude'] = mag_value
                                    mag_col_found = True
                                    break # Found one, stop looking
                            except (ValueError, TypeError):
                                pass # Ignore if conversion fails
                    
                    catalog_data.append(obj_data)
                except Exception as e:
                    print(f"Error processing ASCII catalog row {row_idx}: {e}")
                    continue
        
        # Convert RA/DEC to pixel coordinates using the CORRECTED image WCS
        if image_wcs and image_wcs.has_celestial and catalog_data:
            print(f"Applying corrected WCS transformation to {len(catalog_data)} catalog objects...")
            try:
                # Extract RA/DEC arrays
                ra_array = np.array([obj['ra'] for obj in catalog_data])
                dec_array = np.array([obj['dec'] for obj in catalog_data])
                
                # Create SkyCoord object for all points at once
                sky_coords = SkyCoord(ra_array, dec_array, unit='deg')
                
                # Convert all coordinates at once using the corrected WCS
                pixel_coords = image_wcs.celestial.world_to_pixel(sky_coords)
                
                print(f"WCS transformation completed using {'corrected' if wcs_flip_info['flip_y'] else 'standard'} WCS")
                
                # Update object data with pixel coordinates
                valid_conversion_count = 0
                for i, obj in enumerate(catalog_data):
                    try:
                        px = float(pixel_coords[0][i])
                        py = float(pixel_coords[1][i])
                        # Only include if coordinates are finite (within image bounds)
                        if np.isfinite(px) and np.isfinite(py):
                            obj['x'] = px
                            obj['y'] = py
                            valid_conversion_count += 1
                        else:
                             # Mark objects outside the image bounds
                             obj['x'] = np.nan
                             obj['y'] = np.nan 
                    except Exception as coord_error:
                        print(f"Error converting coordinates for object {i}: {coord_error}")
                        obj['x'] = np.nan
                        obj['y'] = np.nan
                
                # Filter out objects that fall outside the image after WCS conversion
                original_count = len(catalog_data)
                catalog_data = [obj for obj in catalog_data if np.isfinite(obj['x']) and np.isfinite(obj['y'])]
                print(f"WCS conversion successful. Kept {len(catalog_data)} of {original_count} objects within image bounds.")
                
            except Exception as e:
                print(f"Error applying WCS to catalog: {e}")
                import traceback
                print(traceback.format_exc())
                # If WCS conversion fails, mark coords as invalid
                for obj in catalog_data:
                    obj['x'] = np.nan
                    obj['y'] = np.nan
        elif not image_wcs or not image_wcs.has_celestial:
             print("Skipping WCS conversion (no valid WCS found in current image).")
             # Mark all coordinates as invalid if no WCS
             for obj in catalog_data:
                 obj['x'] = np.nan
                 obj['y'] = np.nan
        
        print(f"Final loaded object count for {catalog_name}: {len(catalog_data)}")
        return catalog_data
        
    except Exception as e:
        print(f"Error loading catalog {catalog_name}: {e}")
        import traceback
        print(traceback.format_exc())
        return [] # Return empty list on error


# RGB Display Creation Parameters


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
        patterns = [
            os.path.join(base_search_path, f"*{ident_lower}*.fits"),
            os.path.join(base_search_path, "**", f"*{ident_lower}*.fits"),
        ]
        # Add targeted galaxy+identifier patterns for each token
        for tok in galaxy_tokens:
            patterns.extend([
                os.path.join(base_search_path, f"*{tok}*{ident_lower}*.fits"),
                os.path.join(base_search_path, "**", f"*{tok}*{ident_lower}*.fits"),
            ])

        for pattern in patterns:
            found = glob.glob(pattern, recursive=True)
            if found:
                filtered_found = []
                for file_path in found:
                    filename = os.path.basename(file_path).lower()
                    should_exclude = any(excl.lower() in filename for excl in exclude_patterns)
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

    fits_file_path = matching_files[0]
    print(f"Cutout [{display_filter_name}]: Using FITS file {fits_file_path}")

    try:
        with fits.open(fits_file_path) as hdul:
            for hdu_idx, hdu in enumerate(hdul):
                if hdu.data is not None and hasattr(hdu.data, 'shape') and len(hdu.data.shape) >= 2:
                    try:
                        header = hdu.header.copy()
                        if any(tag in display_filter_name.upper() for tag in ["F200W", "F300M", "F335M", "F360M", "F770W", "F1000W", "F1130W", "F2100W"]):
                            header = _prepare_jwst_header_for_wcs(header)

                        wcs = WCS(header)
                        if not wcs.has_celestial:
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
                        try:
                            cutout_obj = Cutout2D(
                                image_data_full,
                                target_coord,
                                cutout_size_arcsec * u.arcsec,
                                wcs=wcs,
                                mode='partial',
                                fill_value=np.nan
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

    print('????????',galaxy_name)
    BASE_FITS_PATH = FILES_DIRECTORY
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
                            for gal_col_name in RGB_GALAXY_COLUMN_NAMES:
                                if gal_col_name in closest_obj.colnames:
                                    cat_galaxy_name = str(closest_obj[gal_col_name]).strip()
                                    if cat_galaxy_name and cat_galaxy_name.lower() not in RGB_INVALID_GALAXY_NAMES:
                                        target_galaxy_name = cat_galaxy_name
                                        print(f"RGB Cutouts: Galaxy name from catalog ('{gal_col_name}'): {target_galaxy_name}")
                                        break
                except Exception as cat_e:
                    print(f"RGB Cutouts: Error processing catalog for galaxy name: {cat_e}")
    except Exception as e:
        print(f"RGB Cutouts: Error loading/processing catalog '{catalog_name}': {e}")

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

    print(f"RGB Cutouts: Generating for RA={ra}, Dec={dec}. Target Galaxy: {target_galaxy_name}")

    fig, axes_list = plt.subplots(RGB_SUBPLOT_ROWS, RGB_SUBPLOT_COLS, figsize=(RGB_FIGURE_WIDTH, RGB_FIGURE_HEIGHT))
    if not isinstance(axes_list, np.ndarray): axes_list = [axes_list]

    plot_panels_info = [
        {
            "ax_idx": RGB_HST_PANEL_INDEX,
            "short_title": RGB_HST_SHORT_TITLE,
            "full_title": f"{RGB_HST_SHORT_TITLE} ({target_galaxy_name})",
            "filters": {
                "r": {"id": RGB_FILTERS["HST"]["RED"][0], "name": RGB_FILTERS["HST"]["RED"][1]},
                "g": {"id": RGB_FILTERS["HST"]["GREEN"][0], "name": RGB_FILTERS["HST"]["GREEN"][1]},
                "b": {"id": RGB_FILTERS["HST"]["BLUE"][0], "name": RGB_FILTERS["HST"]["BLUE"][1]}
            }
        },
        {
            "ax_idx": RGB_NIRCAM_PANEL_INDEX,
            "short_title": RGB_NIRCAM_SHORT_TITLE,
            "full_title": f"{RGB_NIRCAM_SHORT_TITLE} ({target_galaxy_name})",
            "filters": {
                "r": {"id": RGB_FILTERS["NIRCAM"]["RED"][0], "name": RGB_FILTERS["NIRCAM"]["RED"][1]},
                "g": {"id": RGB_FILTERS["NIRCAM"]["GREEN"][0], "name": RGB_FILTERS["NIRCAM"]["GREEN"][1]},
                "b": {"id": RGB_FILTERS["NIRCAM"]["BLUE"][0], "name": RGB_FILTERS["NIRCAM"]["BLUE"][1]}
            }
        },
        {
            "ax_idx": RGB_MIRI_PANEL_INDEX,
            "short_title": RGB_MIRI_SHORT_TITLE,
            "full_title": f"{RGB_MIRI_SHORT_TITLE} ({target_galaxy_name})",
            "filters": {
                "r": {"id": RGB_FILTERS["MIRI"]["RED"][0], "name": RGB_FILTERS["MIRI"]["RED"][1]},
                "g": {"id": RGB_FILTERS["MIRI"]["GREEN"][0], "name": RGB_FILTERS["MIRI"]["GREEN"][1]},
                "b": {"id": RGB_FILTERS["MIRI"]["BLUE"][0], "name": RGB_FILTERS["MIRI"]["BLUE"][1]}
            }
        },
        {
            "ax_idx": RGB_HA_PANEL_INDEX,
            "short_title": RGB_HA_SHORT_TITLE,
            "full_title": f"HST {RGB_HA_SHORT_TITLE} ({target_galaxy_name})",
            "is_single_channel": True,
            "filters": { "ha": {"id": RGB_FILTERS["HA"][0], "name": RGB_FILTERS["HA"][1]} }
        }
    ]

    all_data_found_flags = {}
    panel_wcs_objects = [None] * len(axes_list)

    for panel_info in plot_panels_info:
        ax_idx = panel_info["ax_idx"]
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
                ax.imshow(ha_data, origin='lower', cmap=RGB_HA_COLORMAP, norm=norm, aspect='equal')
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
                    ax.imshow(rgb_image, origin='lower', aspect='equal')
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
                    ax.plot(pixel_coords[0], pixel_coords[1], RGB_MARKER_SYMBOL,
                            markersize=RGB_MARKER_SIZE, markeredgewidth=RGB_MARKER_EDGE_WIDTH, alpha=RGB_MARKER_ALPHA)
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
    filename = f"{RGB_FILENAME_PREFIX}_{safe_galaxy_name}_RA{ra:.4f}_DEC{dec:.4f}_{timestamp}.png"
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
    # Start the background task
    asyncio.create_task(system_stats_sender(manager))

@app.websocket("/ws/system-stats")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial data immediately on connection
        initial_data = get_system_stats_data()
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
        ra, dec, x, y = find_sources(
            fits_file=params['full_file_path'],
            pix_across_beam=params['pix_across_beam'],
            min_beams=params['min_beams'],
            beams_to_search=params['beams_to_search'],
            delta_rms=params['delta_rms'],
            minval_rms=params['minval_rms'],
            edge_clip=params['edge_clip'],
            filter_name=params.get('filterName'),
            progress_reporter=progress_reporter
        )
        
        # --- Final Update ---
        job_state['progress'] = 100
        job_state['eta'] = 0
        job_state['stage'] = 'Complete'
        job_state['result'] = {
            "sources": {
                "ra": ra, "dec": dec,
                "x": x, "y": y,
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
    }

    process = Process(target=peak_finder_worker, args=(job_id, job_state, params))
    process.start()
    
    PEAK_FINDER_JOBS[job_id] = {'process': process, 'state': job_state}
    
    print(f"Started peak finder job: {job_id}", file=sys.stderr)
    return {"job_id": job_id}

# @app.post("/run-peak-finder/")
# async def run_peak_finder(
#     fits_file: str = Form(...),
#     pix_across_beam: float = Form(PEAK_FINDER_DEFAULTS['pix_across_beam']),  # Updated
#     min_beams: float = Form(PEAK_FINDER_DEFAULTS['min_beams']),  # Updated
#     beams_to_search: float = Form(PEAK_FINDER_DEFAULTS['beams_to_search']),  # Updated
#     delta_rms: float = Form(PEAK_FINDER_DEFAULTS['delta_rms']),  # Updated
#     minval_rms: float = Form(PEAK_FINDER_DEFAULTS['minval_rms']),  # Updated
#     edge_clip: int = Form(PEAK_FINDER_DEFAULTS['edge_clip'])  # Updated
# ):
#     import os
#     loop = asyncio.get_running_loop()
    
#     # Check if the file exists before proceeding.
#     # We construct an absolute path here to avoid ambiguity with the current working directory
#     # and to robustly handle filenames with spaces or special characters.
#     full_path = Path(os.getcwd()).joinpath(fits_file)
    
#     if not full_path.exists():
#         raise HTTPException(status_code=404, detail={"error": f"File not found: {fits_file}"})
    
#     try:
#         # Run the blocking function in a separate process
#         with ProcessPoolExecutor() as executor:
#             sources_found = await loop.run_in_executor(
#                 executor,
#                 _run_peak_finder_blocking,
#                 str(full_path),  # Pass the full, absolute path as a string
#                 pix_across_beam,
#                 min_beams,
#                 beams_to_search,
#                 delta_rms,
#                 minval_rms,
#                 edge_clip
#             )
        
#         # The result from _run_peak_finder_blocking is already a serializable list of lists
#         return JSONResponse(content={"sources": sources_found})

#     except Exception as e:
#         logger.error(f"Error during peak finding process: {e}")
#         logger.error(traceback.format_exc())
#         raise HTTPException(status_code=500, detail={"error": "An internal error occurred during source detection."})


@app.get("/peak-finder-status/{job_id}")
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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)