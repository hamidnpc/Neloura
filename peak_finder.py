import warnings
warnings.filterwarnings("ignore")

# Core imports
import numpy as np
import os
import sys
import json
import traceback
import multiprocessing # Added for parallel processing
from functools import partial # Added for passing fixed arguments to worker
from datetime import datetime
import re # Added for galaxy name extraction

# Astropy imports
from astropy.io import fits
from astropy.wcs import WCS
from astropy.stats import sigma_clipped_stats, SigmaClip
from astropy.coordinates import SkyCoord
from astropy import units as u
from astropy.wcs.utils import proj_plane_pixel_scales
from astropy.table import Table

# Image processing imports
import scipy.ndimage as nd
from scipy.ndimage import maximum_filter
from skimage.morphology import disk

# Photometry imports
from photutils.aperture import CircularAperture, CircularAnnulus, ApertureStats, SkyCircularAnnulus
from fastapi import APIRouter, Form, HTTPException
from pydantic import BaseModel
import uuid
from multiprocessing import Process, Manager
import traceback
from datetime import datetime
import os
import sys
from astrodendro import Dendrogram, Structure, pruning
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from multiprocessing import shared_memory
import atexit
import threading

router = APIRouter()

# --- Job Management for Asynchronous Peak Finding ---
# Lazily initialize multiprocessing Manager to avoid spawn-while-importing issues in workers
manager = None
job_status = None

def _ensure_manager():
    global manager, job_status
    if manager is None or job_status is None:
        mgr = Manager()
        # assign atomically
        manager = mgr
        job_status = manager.dict()
# ---

# --- JWST filter metadata for photometry (mirrors ast_test.py) ---
jwst_filters = {
    'F200W': {'FWHM': 0.066, 'solid_angle': 0.167e-12},
    'F300M': {'FWHM': 0.100, 'solid_angle': 0.365e-12},
    'F335M': {'FWHM': 0.111, 'solid_angle': 0.458e-12},
    'F360M': {'FWHM': 0.120, 'solid_angle': 0.530e-12},
    'F770M': {'FWHM': 0.25,  'solid_angle': 2.18e-12},
    'F1000W':{'FWHM': 0.32,  'solid_angle': 3.77e-12},
    'F1130W':{'FWHM': 0.36,  'solid_angle': 4.95e-12},
    'F2100W':{'FWHM': 0.67,  'solid_angle': 16.1e-12},
    # Special non-JWST option: no unit conversion and no background subtraction for flux
    'Not JWST Filter': {'FWHM': None, 'solid_angle': None}
}

# Surface brightness (MJy/sr) to flux density (uJy) conversion factor
# uJy = (MJy/sr) * (sr) * 1e12
FLUX_CONVERSION_FACTOR = 1e12

def peak_finder_worker(job_id: str, job_state: dict, params: dict):
    """
    The actual worker function that runs in a separate process.
    It calls the find_sources function and updates the shared state.
    """
    try:
        # Initial status update
        job_state[job_id] = {"status": "running", "progress": 0, "stage": "Initializing..."}

        def progress_reporter(progress, stage=""):
            """Callback to report progress from within the find_sources function."""
            current_status = job_state.get(job_id, {})
            current_status.update({'progress': int(progress), 'stage': stage})
            job_state[job_id] = current_status

        full_file_path = params['fits_file']
        
        # Resolve file path. Assumes 'files' directory is in the project root.
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        potential_path = os.path.join(base_dir, 'files', os.path.basename(full_file_path))

        if os.path.exists(potential_path):
            full_file_path = potential_path
        elif not os.path.isabs(full_file_path) or not os.path.exists(full_file_path):
            raise FileNotFoundError(f"File not found at specified path: {params['fits_file']}")

        # Run the source finding algorithm
        results = find_sources(
            fits_file=full_file_path,
            pix_across_beam=params['pix_across_beam'],
            min_beams=params['min_beams'],
            beams_to_search=params['beams_to_search'],
            delta_rms=params['delta_rms'],
            minval_rms=params['minval_rms'],
            edge_clip=params['edge_clip'],
            filter_name=params.get('filterName'),
            progress_reporter=progress_reporter
        )
        ra_coords, dec_coords, x_coords, y_coords = results
        
        progress_reporter(98, "Saving catalog...")

        # Prepare catalog details
        base_name = os.path.basename(full_file_path)
        galaxy_match = re.search(r"^(ngc\d+|ic\d+)", base_name, re.IGNORECASE)
        galaxy_name = galaxy_match.group(1) if galaxy_match else "UnknownGalaxy"
        
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        catalogs_dir = os.path.join(base_dir, 'catalogs')
        os.makedirs(catalogs_dir, exist_ok=True)
        
        output_filename = f"peak_catalog_{galaxy_name}_{os.path.splitext(base_name)[0]}_{timestamp}.fits"
        output_path = os.path.join(catalogs_dir, output_filename)

        # Save the results to a FITS catalog
        # Note: saving handled later inside find_sources when table is written, or could be extended

        # Final status update
        job_state[job_id] = {
            "status": "completed",
            "progress": 100,
            "stage": "Finished",
            "result": {
                "message": f"Peak finding complete. Catalog saved to {output_path}",
                "catalog_file": output_path,
                "num_sources": len(ra_coords),
            }
        }

    except Exception as e:
        # Error handling
        print(f"Error in peak finder worker (job {job_id}): {e}", file=sys.stderr)
        traceback.print_exc()
        job_state[job_id] = {"status": "error", "message": str(e), "traceback": traceback.format_exc()}


@router.post("/start-peak-finder/", tags=["Peak Finder"])
async def start_peak_finder(
    fits_file: str = Form(...),
    pix_across_beam: float = Form(5.0),
    min_beams: float = Form(1.0),
    beams_to_search: float = Form(1.0),
    delta_rms: float = Form(3.0),
    minval_rms: float = Form(2.0),
    edge_clip: int = Form(1),
    filterName: str = Form("F2100W")
):
    """
    Starts an asynchronous peak-finding job.
    """
    _ensure_manager()
    job_id = str(uuid.uuid4())
    params = locals()
    # Remove non-serializable parts from params if any before passing to worker
    del params['request'] 

    process = Process(target=peak_finder_worker, args=(job_id, job_status, params))
    process.start()
    
    return {"message": "Peak finding job started.", "job_id": job_id}

@router.get("/peak-finder-status/{job_id}", tags=["Peak Finder"])
async def get_peak_finder_status(job_id: str):
    """
    Retrieves the status of a peak-finding job.
    """
    _ensure_manager()
    status = job_status.get(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return status


def find_all_local_maxima(data, kern_in_pix=3, fid_low_val=None, blank_mask=None):
    """
    Manual search for local maxima in a sliding kernel.
    """
    if fid_low_val is None:
        fid_low_val = np.nanmin(data)

    # Replace not-a-numbers with the minimum in the image
    if blank_mask is not None:
        blank_mask = blank_mask * (np.isfinite(data) == False)
    else:
        blank_mask = (np.isfinite(data) == False)

    working_data = np.nan_to_num(data, nan=fid_low_val)
    working_data[blank_mask] = fid_low_val

    # Create a round structuring element
    struct_element = disk(kern_in_pix)

    # Run a maximum filter over the data using that element
    max_filtered_data = nd.maximum_filter(
        working_data, footprint=struct_element)

    # The local maxima as a where result
    lmaxes = np.nonzero(
        (working_data == max_filtered_data) * 
        (blank_mask == False))

    return lmaxes


def get_leaves(struct):
    if type(struct) is Dendrogram:
        return struct.leaves
    if type(struct) is Structure:
        return [desc for desc in struct.descendants if desc.is_leaf]


def peaks_from_map(
        data,
        pix_across_beam=5,
        min_beams=1.0,
        beams_to_search=1.0,
        contour_step=None,
        delta_rms=3.0,
        minval_rms=2.0,
        mask=None):

    # Search kernel for the initial maxima
    search_radius = int(np.round(pix_across_beam * beams_to_search))

    # Minimum area required in beam units for the dendrogram
    min_pix = int(min_beams * np.round(np.pi * (pix_across_beam / 2.0) ** 2) / np.log(2))

    # If no step is defined bootstrap an rms-like value from the data
    if contour_step is None:
        contour_step = np.nanpercentile(data, 50) - np.nanpercentile(data, 16)

    req_delta = delta_rms * contour_step
    req_min = np.nanmin(data) + minval_rms * contour_step

    # Find seeds
    initial_maxima = find_all_local_maxima(
        data, kern_in_pix=search_radius, fid_low_val=None, blank_mask=mask)

    # Set the criteria for independence
    indep_criteria = pruning.all_true([
        pruning.min_npix(min_pix),
        pruning.min_delta(req_delta),
        pruning.contains_seeds(initial_maxima)
    ])

    # Compute the dendrogram
    our_dendro = Dendrogram.compute(
        data, is_independent=indep_criteria, min_value=req_min)

    # Get the leaves
    the_leaves = get_leaves(our_dendro)

    # Extract coordinates of each maximum
    nmax = len(the_leaves)
    y_max = np.zeros(nmax, dtype=int)
    x_max = np.zeros(nmax, dtype=int)

    for ii, this_leaf in enumerate(the_leaves):
        this_ind = this_leaf.indices()
        max_ind = np.argmax(data[this_ind[0], this_ind[1]])
        y_max[ii] = int(this_ind[0][max_ind])
        x_max[ii] = int(this_ind[1][max_ind])

    return (x_max, y_max)


def _worker_init():
    # Limit threads in numerical libs to avoid oversubscription
    for var in [
        'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS',
        'NUMEXPR_MAX_THREADS', 'VECLIB_MAXIMUM_THREADS', 'BLIS_NUM_THREADS']:
        os.environ[var] = '1'


def _peaks_from_map_worker(args):
    (
        data_tile,
        mask_tile,
        pix_across_beam,
        min_beams,
        beams_to_search,
        contour_step,
        delta_rms,
        minval_rms,
        x_offset,
        y_offset,
    ) = args

    try:
        x_local, y_local = peaks_from_map(
            data_tile,
            pix_across_beam=pix_across_beam,
            min_beams=min_beams,
            beams_to_search=beams_to_search,
            contour_step=contour_step,
            delta_rms=delta_rms,
            minval_rms=minval_rms,
            mask=mask_tile,
        )
        if len(x_local) == 0:
            return [], []
        return (list(x_local + x_offset), list(y_local + y_offset))
    except Exception as e:
        print(f"Parallel worker error: {e}", file=sys.stderr)
        return [], []


_PEAKS_EXECUTOR = None
_EXECUTOR_LOCK = threading.Lock()
_EXECUTOR_MAX_WORKERS = None


def _get_executor(max_workers):
    global _PEAKS_EXECUTOR, _EXECUTOR_MAX_WORKERS
    with _EXECUTOR_LOCK:
        if _PEAKS_EXECUTOR is None or _EXECUTOR_MAX_WORKERS != max_workers:
            if _PEAKS_EXECUTOR is not None:
                _PEAKS_EXECUTOR.shutdown(wait=True, cancel_futures=True)
            # Prefer spawn to avoid BLAS/Accelerate fork issues on macOS
            try:
                ctx = multiprocessing.get_context("spawn")
            except Exception:
                ctx = None
            if ctx is not None:
                _PEAKS_EXECUTOR = ProcessPoolExecutor(
                    max_workers=max_workers, mp_context=ctx, initializer=_worker_init
                )
            else:
                _PEAKS_EXECUTOR = ProcessPoolExecutor(
                    max_workers=max_workers, initializer=_worker_init
                )
            _EXECUTOR_MAX_WORKERS = max_workers
    return _PEAKS_EXECUTOR


def _run_peaks_from_map_tiled(
    data,
    mask,
    pix_across_beam,
    min_beams,
    beams_to_search,
    contour_step,
    delta_rms,
    minval_rms,
    max_workers=None,
):
    """Parallel wrapper around peaks_from_map using vertical tiling with overlap.

    Does NOT modify peaks_from_map implementation.
    """
    height, width = data.shape[-2], data.shape[-1]
    search_radius = int(np.round(pix_across_beam * beams_to_search))

    # Choose number of tiles/workers
    if max_workers is None:
        try:
            max_workers = max(1, multiprocessing.cpu_count() - 1)
        except Exception:
            max_workers = 1

    num_tiles = max(1, min(max_workers, max(1, width // max(256, search_radius * 4))))
    # Ensure at least 1 tile
    if num_tiles == 1:
        x_all, y_all = peaks_from_map(
            data,
            pix_across_beam=pix_across_beam,
            min_beams=min_beams,
            beams_to_search=beams_to_search,
            contour_step=contour_step,
            delta_rms=delta_rms,
            minval_rms=minval_rms,
            mask=mask,
        )
        return np.array(x_all, dtype=int), np.array(y_all, dtype=int)

    # Build tiles with overlap on x
    tile_width = int(np.ceil(width / num_tiles))
    tasks = []

    for t in range(num_tiles):
        x0 = t * tile_width
        x1 = min(width, (t + 1) * tile_width)
        # Add overlap
        x0_ov = max(0, x0 - search_radius)
        x1_ov = min(width, x1 + search_radius)

        # Build actual tile arrays (contiguous) for threads
        data_tile = np.ascontiguousarray(data[0:height, x0_ov:x1_ov])
        mask_tile = None
        if mask is not None:
            mask_tile = np.ascontiguousarray(mask[0:height, x0_ov:x1_ov])

        tasks.append((
            data_tile,
            mask_tile,
            float(pix_across_beam),
            float(min_beams),
            float(beams_to_search),
            float(contour_step) if contour_step is not None and np.isfinite(contour_step) else None,
            float(delta_rms),
            float(minval_rms),
            int(x0_ov), 0
        ))

    x_all_list: list[int] = []
    y_all_list: list[int] = []
    # Use threads to avoid process spawn instability on macOS
    with ThreadPoolExecutor(max_workers=num_tiles) as ex:
        for xys in ex.map(_peaks_from_map_worker, tasks):
            x_list, y_list = xys
            if x_list:
                x_all_list.extend(x_list)
                y_all_list.extend(y_list)

    # Deduplicate exact duplicates from overlaps
    seen = set()
    x_final: list[int] = []
    y_final: list[int] = []
    for xv, yv in zip(x_all_list, y_all_list):
        key = (int(xv), int(yv))
        if key in seen:
            continue
        seen.add(key)
        x_final.append(int(xv))
        y_final.append(int(yv))

    return np.array(x_final, dtype=int), np.array(y_final, dtype=int)


def find_sources(fits_file, pix_across_beam=5, min_beams=1.0, 
                beams_to_search=1.0, delta_rms=3.0, minval_rms=5.0, edge_clip=1, progress_reporter=None,
                filter_name: str = None):
    """
    Find sources in a FITS image using simplified peak detection with improved progress reporting.
    
    Parameters are the same as before.
        
    Returns:
    --------
    tuple
        Lists of (ra_coords, dec_coords, x_coords, y_coords) of detected sources
    """
    try:
        if progress_reporter:
            progress_reporter(5, "Opening FITS file...")

        # Open the FITS file
        with fits.open(fits_file) as hdul:
            # Find the first HDU with image data
            for hdu_idx, hdu in enumerate(hdul):
                if hasattr(hdu, 'data') and hdu.data is not None and len(hdu.data.shape) >= 2:
                    # Copy the data to avoid modifying the original
                    data = hdu.data.copy()
                    header = hdu.header.copy()
                    
                    # Process the WCS with special handling for JWST files
                    try:
                        # First try to parse the header with JWST-specific fixes
                        modified_header = (header)
                        wcs = WCS(modified_header)
                        
                        # Test if the WCS is valid
                        if not wcs.has_celestial:
                            print(f"WCS doesn't have celestial coordinates, trying standard WCS", file=sys.stderr)
                            wcs = WCS(header)
                            
                            if wcs.has_celestial:
                                print(f"Using WCS from HDU {hdu_idx} with projection {wcs.wcs.ctype}", file=sys.stderr)
                            else:
                                print(f"No valid celestial WCS found in HDU {hdu_idx}", file=sys.stderr)
                                continue
                        
                    except Exception as e:
                        print(f"Error getting WCS: {e}", file=sys.stderr)
                        continue
                    
                    break
            else:
                print("No suitable image data found in the FITS file", file=sys.stderr)
                return [], [], [], []
        
        # Clean up data - handle NaN and negative values
        data[np.isnan(data)] = 0
        
        # Apply edge masking
        data[(data == 0)] = np.nan
        nan_mask = np.isfinite(data) == False
        nan_mask[0,:] = True
        nan_mask[-1,:] = True
        nan_mask[:,0] = True
        nan_mask[:,-1] = True
        nan_mask = nd.binary_dilation(nan_mask, disk(edge_clip))
        data[nan_mask] = np.nan
        
        # Calculate noise level using percentile difference
        if progress_reporter:
            progress_reporter(10, "Estimating noise...")
        contour_step = np.nanpercentile(data, 50) - np.nanpercentile(data, 16)
        print(f"Estimated noise level: {contour_step:.3e}", file=sys.stderr)
        
        # Create detection mask for valid data
        det_mask = data > 0
        
        # Peak detection via dendrogram-based algorithm
        if progress_reporter:
            progress_reporter(25, "Finding sources via dendrogram...")

        print(float(pix_across_beam), float(min_beams), float(beams_to_search), float(contour_step), float(delta_rms), float(minval_rms))
        x_max, y_max = _run_peaks_from_map_tiled(
            data=data,
            mask=nan_mask,
            pix_across_beam=float(pix_across_beam),
            min_beams=float(min_beams),
            beams_to_search=float(beams_to_search),
            contour_step=float(contour_step) if np.isfinite(contour_step) else None,
            delta_rms=float(delta_rms),
            minval_rms=float(minval_rms),
        )
            
        print('sources found!!!!')
        # Count the number of peaks
        num_sources = len(x_max)
        print(f"Found {num_sources} potential sources after filtering", file=sys.stderr)
        
        # Convert pixel coordinates to world coordinates
        ra_coords = []
        dec_coords = []
        
        # Process sources in batches to avoid memory issues
        if progress_reporter:
            progress_reporter(50, f"Converting coordinates for {num_sources} sources...")

        batch_size = 500
        for i in range(0, num_sources, batch_size):
            if progress_reporter:
                progress = 50 + (i / num_sources) * 45 if num_sources > 0 else 95
                progress_reporter(progress, f"Converting coordinates... ({i+1}/{num_sources})")

            batch_x = x_max[i:i+batch_size]
            batch_y = y_max[i:i+batch_size]
            
            try:
                # Convert to world coordinates
                coords = wcs.pixel_to_world(batch_x, batch_y)
                batch_ra = coords.ra.deg
                batch_dec = coords.dec.deg
                
                # Add to lists
                ra_coords.extend(batch_ra)
                dec_coords.extend(batch_dec)
            except Exception as e:
                print(f"Error converting coordinates for batch {i//batch_size}: {e}", file=sys.stderr)
                # Fallback to individual conversion if batch fails
                for k in range(len(batch_x)):
                    try:
                        coord = wcs.pixel_to_world(batch_x[k], batch_y[k])
                        ra_coords.append(coord.ra.deg)
                        dec_coords.append(coord.dec.deg)
                    except Exception as e2:
                        print(f"Could not convert pixel ({batch_x[k]},{batch_y[k]}): {e2}", file=sys.stderr)
        
        if progress_reporter:
            progress_reporter(95, "Finalizing...")

        # Convert NumPy arrays to lists for JSON serialization
        ra_coords = [float(ra) for ra in ra_coords]
        dec_coords = [float(dec) for dec in dec_coords]
        x_coords_out = [float(x) for x in x_max]
        y_coords_out = [float(y) for y in y_max]
        
        # --- Optional photometry using JWST filter metadata (mirrors ast_test.inject_sources) ---
        fluxes_jy = None
        flux_errs_jy = None
        snrs = None
        try:
            if filter_name:
                filter_key = str(filter_name).upper()
                norm_filters = {k.upper(): v for k, v in jwst_filters.items()}
                if filter_key in norm_filters:
                    meta = norm_filters[filter_key]
                    FWHM_arcsec = meta['FWHM']
                    solid_angle_sr = meta['solid_angle']

                    # Special handling for non-JWST selection
                    if filter_key == 'NOT JWST FILTER':
                        # Directly use the image values at peak pixels as flux in Jy, no background subtraction,
                        # no multiplication by solid_angle or conversion factor
                        if len(x_max) > 0:
                            surfbright_arr = nd.map_coordinates(
                                data,
                                np.vstack([y_max, x_max]).astype(float),
                                order=0,
                                mode='nearest'
                            )
                        else:
                            surfbright_arr = np.array([])
                        fluxes_jy = surfbright_arr
                        flux_errs_jy = np.full_like(fluxes_jy, np.nan, dtype=float)
                        snrs = np.full_like(fluxes_jy, np.nan, dtype=float)
                    else:
                        # JWST filter: require FWHM and solid angle
                        if FWHM_arcsec is None or solid_angle_sr is None:
                            raise ValueError("JWST filter metadata incomplete (FWHM or solid angle is None)")

                        # Background annulus 2*FWHM .. 3*FWHM (in arcsec)
                        if len(ra_coords) > 0:
                            positions = SkyCoord(ra=ra_coords * u.deg if isinstance(ra_coords, np.ndarray) else np.array(ra_coords) * u.deg,
                                                  dec=dec_coords * u.deg if isinstance(dec_coords, np.ndarray) else np.array(dec_coords) * u.deg)
                            aper = SkyCircularAnnulus(positions, 2 * FWHM_arcsec * u.arcsec, 3 * FWHM_arcsec * u.arcsec)
                            sigclip = SigmaClip(sigma=3.0, maxiters=10)
                            bkg_stats = ApertureStats(data, aper, sigma_clip=sigclip, wcs=wcs)

                            # Background median per-pixel (surface brightness in same units as data, e.g., MJy/sr)
                            flux_bkg_arr = np.asarray(bkg_stats.median)

                            # Estimate background sigma (per pixel)
                            if hasattr(bkg_stats, 'std') and bkg_stats.std is not None:
                                bkg_sigma_arr = np.asarray(bkg_stats.std)
                            elif hasattr(bkg_stats, 'mad_std') and bkg_stats.mad_std is not None:
                                bkg_sigma_arr = np.asarray(bkg_stats.mad_std)
                            else:
                                # Fallback to global std (finite region only)
                                finite_mask = np.isfinite(data)
                                global_sky_std = float(np.nanstd(data[finite_mask])) if np.any(finite_mask) else 0.0
                                bkg_sigma_arr = np.full_like(flux_bkg_arr, global_sky_std, dtype=float)

                            # Sample the surface brightness at peak pixels
                            if len(x_max) > 0:
                                surfbright_arr = nd.map_coordinates(
                                    data,
                                    np.vstack([y_max, x_max]).astype(float),
                                    order=0,
                                    mode='nearest'
                                )
                            else:
                                surfbright_arr = np.array([])

                            # Convert to Jy using solid angle and factor
                            fluxes_jy = (surfbright_arr - flux_bkg_arr) * solid_angle_sr * FLUX_CONVERSION_FACTOR
                            flux_errs_jy = bkg_sigma_arr * solid_angle_sr * FLUX_CONVERSION_FACTOR
                            with np.errstate(divide='ignore', invalid='ignore'):
                                snrs = np.where(flux_errs_jy > 0, fluxes_jy / flux_errs_jy, 0.0)
                else:
                    print(f"Unknown JWST filter '{filter_name}'. Skipping photometry.", file=sys.stderr)
        except Exception as e_phot:
            print(f"Photometry step failed: {e_phot}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)

        # Convert NumPy to Python lists if computed
        if isinstance(fluxes_jy, np.ndarray):
            fluxes_jy = [float(x) if np.isfinite(x) else np.nan for x in fluxes_jy]
        if isinstance(flux_errs_jy, np.ndarray):
            flux_errs_jy = [float(x) if np.isfinite(x) else np.nan for x in flux_errs_jy]
        if isinstance(snrs, np.ndarray):
            snrs = [float(x) if np.isfinite(x) else np.nan for x in snrs]
        
        # --- Create and save the catalog ---
        if len(ra_coords) > 0:
            try:
                # Create an Astropy Table
                output_table = Table()
                output_table['RA'] = ra_coords
                output_table['DEC'] = dec_coords
                output_table['X'] = x_coords_out
                output_table['Y'] = y_coords_out
                if fluxes_jy is not None:
                    output_table['Flux_uJy'] = fluxes_jy
                if flux_errs_jy is not None:
                    output_table['FluxErr_uJy'] = flux_errs_jy
                if snrs is not None:
                    output_table['SNR'] = snrs

                # Extract galaxy name from filename
                base_name = os.path.basename(fits_file)
                galaxy_match = re.search(r'(ngc\d+|ic\d+|[a-zA-Z]+\d+)', base_name)
                galaxy = galaxy_match.group(1) if galaxy_match else "Unknown"

                # Create a unique catalog name
                timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                output_dir = "catalogs"
                os.makedirs(output_dir, exist_ok=True)
                output_filename = f"peak_catalog_{galaxy}_{base_name.replace('.fits', '')}_{timestamp}.fits"
                output_path = os.path.join(output_dir, output_filename)
                
                # Save the table
                output_table.write(output_path, format='fits', overwrite=True)
                print(f"Saved peak catalog to: {output_path}", file=sys.stderr)

            except Exception as e:
                print(f"Error saving catalog: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)

        if progress_reporter:
            progress_reporter(100, "Complete")

        return ra_coords, dec_coords, x_coords_out, y_coords_out
        
    except Exception as e:
        print(f"An error occurred in find_sources: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        if progress_reporter:
            progress_reporter(-1, f"Error: {e}")
        return [], [], [], []


def find_peaks(full_file_path: str, progress_callback=None, **kwargs):
    """
    Main function to find peaks, perform photometry, and save a catalog.
    
    This function now correctly passes the progress_callback to the find_sources function.
    """
    try:
        # Define a reporter function that can be passed down
        def reporter(progress, stage):
            if progress_callback:
                progress_callback(progress, stage)
            # Also print to stderr for command-line execution
            print(f"[Progress {int(progress)}%] {stage}", file=sys.stderr)

        reporter(1, "Starting peak finding process...")

        # Find sources using the simplified peak detection method
        # ** This is the key change: passing the reporter to find_sources **
        ra_coords, dec_coords, values, x_coords, y_coords = find_sources(
            full_file_path, 
            pix_across_beam=kwargs.get('pix_across_beam', 5),
            min_beams=kwargs.get('min_beams', 1.0),
            beams_to_search=kwargs.get('beams_to_search', 1.0),
            delta_rms=kwargs.get('delta_rms', 3.0),
            minval_rms=kwargs.get('minval_rms', 5.0),
            edge_clip=kwargs.get('edge_clip', 1),
            progress_reporter=reporter  # Pass the reporter function here
        )
        
        # After finding sources, the progress should be around 95% if sources were found.
        # If no sources are found, find_sources will report 100% and this function will exit.
        if not ra_coords:
            reporter(100, "No sources found. Process complete.")
            return {
                "ra": [], "dec": [], "x": [], "y": [],
                "source_count": 0, "photometry": None
            }

        # If sources are found, we can proceed to photometry, which is very fast.
        reporter(98, "Peak finding complete. Preparing for photometry...")
        
        # For now, we will skip photometry as it is not the bottleneck and
        # the main source detection is complete. We will return the sources found.
        # This simplifies the flow and ensures completion is reported correctly.

        # The 'find_sources' function now handles saving the catalog.

        reporter(100, "Process complete.")

        return {
            "ra": ra_coords, "dec": dec_coords,
            "x": x_coords, "y": y_coords, "source_count": len(ra_coords)
        }

    except Exception as e:
        print(f"An error occurred in find_peaks: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        if progress_callback:
            progress_callback(-1, f"Error in find_peaks: {e}")
        return {"error": str(e)}





def save_catalog(output_file, galaxy, ra_coords, dec_coords, fluxes=None, 
                flux_errs=None, snrs=None, beam_size=0.67, env_values=None):
    """
    Save detected sources to a catalog file
    
    Parameters:
    -----------
    output_file : str
        Path to the output catalog file
    galaxy : str
        Galaxy name
    ra_coords : list
        List of RA coordinates
    dec_coords : list
        List of DEC coordinates
    fluxes : list, optional
        List of flux values
    flux_errs : list, optional
        List of flux errors
    snrs : list, optional
        List of SNR values
    beam_size : float, optional
        Beam size in arcseconds, default 0.67
    env_values : list, optional
        List of environment values
        
    Returns:
    --------
    bool
        True if successful, False otherwise
    """
    try:
        # Verify all lists have the same length
        lengths = [len(ra_coords), len(dec_coords)]
        if fluxes is not None:
            lengths.append(len(fluxes))
        if flux_errs is not None:
            lengths.append(len(flux_errs))
        if snrs is not None:
            lengths.append(len(snrs))
        if env_values is not None:
            lengths.append(len(env_values))
            
        if len(set(lengths)) > 1:
            print(f"Warning: Inconsistent column lengths: {lengths}", file=sys.stderr)
            
            # Truncate to the shortest length
            min_length = min(lengths)
            ra_coords = ra_coords[:min_length]
            dec_coords = dec_coords[:min_length]
            if fluxes is not None:
                fluxes = fluxes[:min_length]
            if flux_errs is not None:
                flux_errs = flux_errs[:min_length]
            if snrs is not None:
                snrs = snrs[:min_length]
            if env_values is not None:
                env_values = env_values[:min_length]
            
            print(f"Truncated all columns to length {min_length}", file=sys.stderr)
        
        # Create a Table object
        catalog = Table()
        
        # Convert all lists to ensure they contain native Python types, not numpy types
        galaxy_col = [str(galaxy)] * len(ra_coords)
        ra_col = [float(ra) for ra in ra_coords]
        dec_col = [float(dec) for dec in dec_coords]
        bmaj_col = [float(beam_size)] * len(ra_coords)
        
        # Add columns
        catalog['galaxy'] = galaxy_col
        catalog['ra'] = ra_col
        catalog['dec'] = dec_col
        catalog['bmaj'] = bmaj_col
        
        # Add photometry columns if available
        if fluxes is not None:
            catalog['flux'] = [float(f) if np.isfinite(f) else np.nan for f in fluxes]
        if flux_errs is not None:
            catalog['flux_err'] = [float(e) if np.isfinite(e) else np.nan for e in flux_errs]
        if snrs is not None:
            catalog['snr'] = [float(s) if np.isfinite(s) else np.nan for s in snrs]
        if env_values is not None:
            catalog['env'] = [float(ev) if np.isfinite(ev) else np.nan for ev in env_values]
        
        # Write to file
        catalog.write(output_file, overwrite=True, format='fits')
        print(f"Catalog saved to {output_file}", file=sys.stderr)
        return True
        
    except Exception as e:
        print(f"Error saving catalog: {e}", file=sys.stderr)
        return False


def main():
    """
    Main function to run source detection from command line
    """
    # Default parameters
    fits_file = None
    output_format = 'fits'  # Default to fits
    params = {
        'pix_across_beam': 5,
        'min_beams': 1.0,
        'beams_to_search': 1.0,
        'delta_rms': 3.0,
        'minval_rms': 5.0,
        'edge_clip': 1
    }
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        fits_file = sys.argv[1]
        
        # Override defaults with command-line arguments
        if len(sys.argv) > 2:
            params['pix_across_beam'] = float(sys.argv[2])
        if len(sys.argv) > 3:
            params['min_beams'] = float(sys.argv[3])
        if len(sys.argv) > 4:
            params['beams_to_search'] = float(sys.argv[4])
        if len(sys.argv) > 5:
            params['delta_rms'] = float(sys.argv[5])
        if len(sys.argv) > 6:
            params['minval_rms'] = float(sys.argv[6])
    
    # Validate input
    if not fits_file:
        error_obj = {
            "error": "No FITS file specified",
            "ra": [],
            "dec": [],
            "source_count": 0
        }
        # print(json.dumps(error_obj))
        sys.exit(1)
    
    # Run source detection
    try:
        print(f"Processing file: {fits_file}")
        ra_list, dec_list, x_list, y_list = find_sources(
            fits_file, 
            pix_across_beam=params['pix_across_beam'],
            min_beams=params['min_beams'],
            beams_to_search=params['beams_to_search'],
            delta_rms=params['delta_rms'],
            minval_rms=params['minval_rms'],
            edge_clip=params['edge_clip']
        )

    
        # Also print JSON result for the web interface
        result = {
            "ra": ra_list,
            "dec": dec_list,
            "x": x_list,
            "y": y_list,
            "source_count": len(ra_list)
        }
        # print(json.dumps(result))

    except Exception as e:
        # Print any unexpected errors as JSON
        error_output = {
            "error": str(e),
            "ra": [],
            "dec": [],
            "source_count": 0
        }
        # print(json.dumps(error_output))
        sys.exit(1)

if __name__ == "__main__":
    # Example of how main might call it (this part is illustrative and depends on your CLI arg parsing)
    # It assumes sys.argv provides parameters similar to how main() currently parses them for find_sources
    # For direct testing of photometry, you would need RA/DEC inputs for this part.
    # The current main() in peak_finder.py only calls find_sources and prints JSON.
    # If you want main() to also do photometry and save a catalog for CLI testing:
    
    fits_file_arg = None
    if len(sys.argv) > 1:
        fits_file_arg = sys.argv[1]
    
    if not fits_file_arg:
        # This print MUST go to stdout as it's the script's error JSON output
        # print(json.dumps({"error": "No FITS file specified for main execution.", "ra": [], "dec": [], "source_count": 0}))
        sys.exit(1)

    # Default find_sources parameters (from your existing main)
    fs_params = {
        'pix_across_beam': float(sys.argv[2]) if len(sys.argv) > 2 else 5,
        'min_beams': float(sys.argv[3]) if len(sys.argv) > 3 else 1.0,
        'beams_to_search': float(sys.argv[4]) if len(sys.argv) > 4 else 1.0,
        'delta_rms': float(sys.argv[5]) if len(sys.argv) > 5 else 3.0,
        'minval_rms': float(sys.argv[6]) if len(sys.argv) > 6 else 5.0,
        'edge_clip': 1 # default from find_sources signature
    }

    try:
        # REMOVED: print(f"Peak Finder Script: Processing file: {fits_file_arg} with params: {fs_params}", file=sys.stderr) 
        # All informational prints should go to stderr if they are kept.
        # It's better to keep the script quiet unless there are errors for stderr,
        # and if it's specifically being debugged.
        
        ra_found, dec_found, x_found, y_found = find_sources(fits_file_arg, **fs_params)
        
        # Photometry is still commented out in this main block, which is fine.
        # If it were enabled, its internal prints are already stderr.

        result_json = {
            "ra": ra_found,
            "dec": dec_found,
            "x": x_found,
            "y": y_found,
            # "fluxes": fluxes_phot, # Uncomment if photometry is performed
            # "flux_errors": flux_errs_phot, # Uncomment if photometry is performed
            # "snr": snrs_phot, # Uncomment if photometry is performed
            "source_count": len(ra_found)
        }
        # This print MUST go to stdout
        print(json.dumps(result_json))

        # --- Optionally, save a catalog (mainly for CLI testing) ---
        # if ra_found:
        #    output_cat_filename = fits_file_arg.replace(".fits", "_cat.fits")
        #    galaxy_name_from_file = os.path.basename(fits_file_arg).split('_')[0] # Basic galaxy name extraction
        #    save_catalog(output_cat_filename, galaxy_name_from_file, ra_found, dec_found, 
        #                 fluxes=fluxes_phot, flux_errs=flux_errs_phot, snrs=snrs_phot)
        # --- End Optional Save Catalog ---

    except Exception as e_main:
        # This print MUST go to stdout
        print(json.dumps({
            "error": f"Error in peak_finder.py main execution: {str(e_main)}", 
            "traceback": traceback.format_exc(), # Consider if full traceback is always needed for client
            "ra": [], "dec": [], "source_count": 0
        }))
        sys.exit(1)