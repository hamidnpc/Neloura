import warnings
warnings.filterwarnings("ignore")

# Core imports
import numpy as np
import os
import sys
import json
import traceback

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
from photutils.aperture import CircularAperture, CircularAnnulus, ApertureStats

def parse_jwst_wcs(header):
    """
    Create a complete WCS for JWST headers that may have partial PC matrix
    """
    # Create a modified header with complete WCS information
    new_header = header.copy()
    
    # Check if this is a JWST image with incomplete PC matrix
    is_jwst = False
    for key in header:
        if ('TELESCOP' in key and 'JWST' in str(header.get(key, ''))) or \
           ('BUNIT' in key and 'MJy/sr' in str(header.get(key, ''))):
            is_jwst = True
            break
    
    # For JWST images with PC1_1 and PC2_2 but missing PC1_2 and PC2_1
    if is_jwst and 'PC1_1' in header and 'PC2_2' in header:
        if 'PC1_2' not in header:
            new_header['PC1_2'] = 0.0
        if 'PC2_1' not in header:
            new_header['PC2_1'] = 0.0
        print(f"Fixed PC matrix elements for JWST image")
    
    return new_header


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


def find_sources(fits_file, pix_across_beam=5, min_beams=1.0, 
                beams_to_search=1.0, delta_rms=3.0, minval_rms=5.0, edge_clip=0.5):
    """
    Find sources in a FITS image using simplified peak detection
    
    Parameters:
    -----------
    fits_file : str
        Path to the FITS file
    pix_across_beam : int, optional
        Pixels across beam, default 5
    min_beams : float, optional
        Minimum number of beams, default 1.0
    beams_to_search : float, optional
        Number of beams to search, default 1.0
    delta_rms : float, optional
        Delta RMS threshold, default 3.0
    minval_rms : float, optional
        Minimum RMS threshold, default 5.0
    edge_clip : float, optional
        Edge clipping factor, default 0.5
        
    Returns:
    --------
    tuple
        Lists of (ra_coords, dec_coords, values) of detected sources
    """
    try:
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
                        modified_header = parse_jwst_wcs(header)
                        wcs = WCS(modified_header)
                        
                        # Test if the WCS is valid
                        if not wcs.has_celestial:
                            print(f"WCS doesn't have celestial coordinates, trying standard WCS")
                            wcs = WCS(header)
                            
                            if wcs.has_celestial:
                                print(f"Using WCS from HDU {hdu_idx} with projection {wcs.wcs.ctype}")
                            else:
                                print(f"No valid celestial WCS found in HDU {hdu_idx}")
                                continue
                        
                    except Exception as e:
                        print(f"Error getting WCS: {e}")
                        continue
                    
                    break
            else:
                print("No suitable image data found in the FITS file")
                return [], [], []
        
        # Clean up data - handle NaN and negative values
        data[data < 0] = 0
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
        contour_step = np.nanpercentile(data, 50) - np.nanpercentile(data, 16)
        print(f"Estimated noise level: {contour_step:.3e}")
        
        # Create detection mask for valid data
        det_mask = data > 0
        
        # Simple peak detection
        # Calculate threshold based on noise estimate
        threshold = contour_step * delta_rms
        
        # Find local maxima
        initial_maxima = find_all_local_maxima(
            data, kern_in_pix=int(pix_across_beam),
            fid_low_val=None, blank_mask=nan_mask)
            
        # Get coordinates from the local maxima
        y_maxima, x_maxima = initial_maxima
        
        # Calculate required minimum value
        req_min = np.nanmin(data) + minval_rms * contour_step
        
        # Filter maxima by intensity threshold
        above_threshold = []
        for i in range(len(y_maxima)):
            y = y_maxima[i]
            x = x_maxima[i]
            if data[y, x] > req_min:
                above_threshold.append((y, x))
        
        # Convert to arrays
        if above_threshold:
            y_max = np.array([y for y, x in above_threshold])
            x_max = np.array([x for y, x in above_threshold])
        else:
            y_max = np.array([])
            x_max = np.array([])
            
        # Apply detection mask to keep only valid peaks
        if len(y_max) > 0:
            keep = det_mask[y_max, x_max]
            y_max = y_max[keep]
            x_max = x_max[keep]
            
        # Count the number of peaks
        print(f"Found {len(x_max)} potential sources")
        
        # Convert pixel coordinates to world coordinates
        ra_coords = []
        dec_coords = []
        values = []
        
        # Process sources in batches to avoid memory issues
        batch_size = 100
        for i in range(0, len(x_max), batch_size):
            batch_x = x_max[i:i+batch_size]
            batch_y = y_max[i:i+batch_size]
            
            try:
                # Convert to world coordinates
                coords = wcs.pixel_to_world(batch_x, batch_y)
                batch_ra = coords.ra.deg
                batch_dec = coords.dec.deg
                
                # Get flux values
                batch_values = [data[y, x] for y, x in zip(batch_y, batch_x)]
                
                # Add to lists
                ra_coords.extend(batch_ra)
                dec_coords.extend(batch_dec)
                values.extend(batch_values)
            except Exception as e:
                print(f"Error converting coordinates for batch {i//batch_size}: {e}")
                
                # Try alternative conversion method
                try:
                    coords = wcs.wcs_pix2world(np.column_stack((batch_x, batch_y)), 0)
                    batch_ra = coords[:, 0]
                    batch_dec = coords[:, 1]
                    
                    batch_values = [data[y, x] for y, x in zip(batch_y, batch_x)]
                    
                    ra_coords.extend(batch_ra)
                    dec_coords.extend(batch_dec)
                    values.extend(batch_values)
                except Exception as e2:
                    print(f"Alternative conversion also failed: {e2}")
        
        # Convert NumPy arrays to lists for JSON serialization
        ra_coords = [float(ra) for ra in ra_coords]
        dec_coords = [float(dec) for dec in dec_coords]
        values = [float(v) for v in values]
        
        # Print a few examples for verification
        for i in range(min(5, len(ra_coords))):
            print(f"Source {i}: RA={ra_coords[i]:.6f}, Dec={dec_coords[i]:.6f}, value={values[i]:.3e}")
            
        return ra_coords, dec_coords, values
    
    except Exception as e:
        print(f"Unexpected error in source detection: {e}")
        print(traceback.format_exc())
        return [], [], []


def perform_photometry(fits_file, ra_coords, dec_coords, 
                      inner_radius=1.34, outer_radius=2.01, sigma=3.0, 
                      beam_area=None, flux_unit='uJy'):
    """
    Perform aperture photometry on detected sources using annular apertures
    
    Parameters:
    -----------
    fits_file : str
        Path to the FITS file
    ra_coords : list
        List of RA coordinates in degrees
    dec_coords : list
        List of DEC coordinates in degrees
    inner_radius : float, optional
        Inner radius of background annulus in arcsec, default 1.34 (2*PSF)
    outer_radius : float, optional
        Outer radius of background annulus in arcsec, default 2.01 (3*PSF)
    sigma : float, optional
        Sigma for clipping in background estimation, default 3.0
    beam_area : float, optional
        Beam area in steradians (for JWST), default None
    flux_unit : str, optional
        Output flux unit, default 'uJy'
        
    Returns:
    --------
    tuple
        Lists of (flux, flux_err, flux_snr) for each source
    """
    try:
        # Open the FITS file
        with fits.open(fits_file) as hdul:
            # Find the first HDU with image data
            for hdu in hdul:
                if hasattr(hdu, 'data') and hdu.data is not None and len(hdu.data.shape) >= 2:
                    data = hdu.data.copy()
                    header = hdu.header.copy()
                    wcs = WCS(header)
                    break
            else:
                print("No suitable image data found for photometry")
                return [], [], []
        
        # Check if data is in MJy/sr (JWST typical unit)
        is_jwst = False
        conversion_factor = 1.0
        
        for key in header:
            if 'BUNIT' in key and 'MJy/sr' in str(header.get(key, '')):
                is_jwst = True
                # For JWST, we need the beam area to convert to flux
                if beam_area is None:
                    # Typical JWST beam area for F2100W
                    beam_area = 1.61e-11  # sr
                
                # Convert to uJy
                if flux_unit.lower() == 'ujy':
                    conversion_factor = beam_area * 1e12
                print(f"JWST image detected, using beam area: {beam_area} sr")
                print(f"Conversion factor to {flux_unit}: {conversion_factor:.3e}")
                break
        
        # Replace zeros with NaN for proper background estimation
        data[data == 0] = np.nan
        
        # Convert sky coordinates to pixel coordinates
        x0, y0 = wcs.wcs_world2pix(np.array(ra_coords), np.array(dec_coords), 0)
        
        # Ensure x0 and y0 are lists of floats
        x0 = [float(x) for x in x0]
        y0 = [float(y) for y in y0]
        
        # Calculate pixel scale to convert arcsec to pixels
        try:
            pixel_scale = proj_plane_pixel_scales(wcs)[0] * 3600.0  # deg to arcsec
            print(f"Pixel scale: {pixel_scale:.3f} arcsec/pixel")
            inner_radius_pix = inner_radius / pixel_scale
            outer_radius_pix = outer_radius / pixel_scale
            print(f"Annulus radii: {inner_radius_pix:.2f} to {outer_radius_pix:.2f} pixels")
        except Exception as e:
            print(f"Warning: Could not calculate pixel scale, using default values: {e}")
            inner_radius_pix = 3  # default fallback
            outer_radius_pix = 5  # default fallback
        
        # Set up sigma clipping for background estimation
        sigclip = SigmaClip(sigma=sigma, maxiters=10)
        
        # Prepare result lists
        fluxes = []
        flux_errs = []
        snrs = []
        
        # Perform photometry on each source
        for i, (x, y, ra, dec) in enumerate(zip(x0, y0, ra_coords, dec_coords)):
            try:
                # Get the pixel value at the source position
                try:
                    pixel_value = nd.map_coordinates(data, np.array([[y, x]]).T, order=0)[0]
                    
                    # Create annular aperture in pixel coordinates
                    annulus_aperture = CircularAnnulus(
                        [(float(x), float(y))],  # Convert numpy values to float
                        r_in=float(inner_radius_pix), 
                        r_out=float(outer_radius_pix)
                    )
                    
                    # Calculate background statistics
                    bkg_stats = ApertureStats(data, annulus_aperture, sigma_clip=sigclip)
                    
                    # Calculate source flux (background subtracted)
                    source_flux = float((pixel_value - bkg_stats.median) * conversion_factor)
                    
                    # Estimate flux error from background variation
                    flux_err = float(bkg_stats.std * conversion_factor)
                    
                    # Calculate SNR
                    snr = float(source_flux / flux_err if flux_err > 0 else 0)
                    
                    fluxes.append(source_flux)
                    flux_errs.append(flux_err)
                    snrs.append(snr)
                    
                    if i < 5:  # Print details for first few sources
                        print(f"Source {i+1}: RA={float(ra):.6f}, Dec={float(dec):.6f}, Flux={source_flux:.3e} {flux_unit}, SNR={snr:.1f}")
                    
                except Exception as e:
                    print(f"Error performing photometry on source at RA={float(ra):.6f}, Dec={float(dec):.6f}: {e}")
                    print(f"  - Type of x, y: {type(x)}, {type(y)}")
                    print(f"  - Data shape: {data.shape}")
                    fluxes.append(np.nan)
                    flux_errs.append(np.nan)
                    snrs.append(np.nan)
            except Exception as e:
                print(f"Error processing source {i}: {e}")
                fluxes.append(np.nan)
                flux_errs.append(np.nan)
                snrs.append(np.nan)
        
        return fluxes, flux_errs, snrs
        
    except Exception as e:
        print(f"Unexpected error in photometry: {e}")
        print(traceback.format_exc())
        return [], [], []


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
            print(f"Warning: Inconsistent column lengths: {lengths}")
            
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
            
            print(f"Truncated all columns to length {min_length}")
        
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
        print(f"Catalog saved to {output_file}")
        return True
        
    except Exception as e:
        print(f"Error saving catalog: {e}")
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
        'edge_clip': 0.5
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
        print(json.dumps(error_obj))
        sys.exit(1)
    
    # Run source detection
    try:
        print(f"Processing file: {fits_file}")
        ra_list, dec_list, values = find_sources(
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
            "values": values,
            "source_count": len(ra_list)
        }
        print(json.dumps(result))

    except Exception as e:
        # Print any unexpected errors as JSON
        error_output = {
            "error": str(e),
            "ra": [],
            "dec": [],
            "values": [],
            "source_count": 0
        }
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == "__main__":
    main()
