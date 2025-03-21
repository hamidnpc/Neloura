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
from scipy.ndimage import maximum_filter
from skimage.morphology import disk

def find_sources(fits_file, pix_across_beam=5, min_beams=1.0, 
                 beams_to_search=1.0, delta_rms=3.0, minval_rms=2.0):
    """
    Find sources in a FITS image using a simplified peak detection method
    
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
        Minimum RMS threshold, default 2.0
    
    Returns:
    --------
    tuple
        Lists of RA and DEC coordinates of detected sources
    """
    try:
        # Open the FITS file
        with fits.open(fits_file) as hdul:
            # Find the first HDU with image data
            for hdu in hdul:
                if hasattr(hdu, 'data') and hdu.data is not None and len(hdu.data.shape) >= 2:
                    # Copy the data to avoid modifying the original
                    data = hdu.data.copy()
                    
                    # Get the WCS (World Coordinate System)
                    try:
                        wcs = WCS(hdu.header)
                    except Exception as e:
                        print(f"Error getting WCS: {e}", file=sys.stderr)
                        return [], []
                    
                    break
            else:
                print("No suitable image data found in the FITS file", file=sys.stderr)
                return [], []
        
        # Clean up data
        data = np.nan_to_num(data, nan=0)
        data[data < 0] = 0
        
        # Calculate RMS and threshold
        rms = np.std(data)
        threshold = rms * delta_rms
        
        # Create a structuring element for peak detection
        struct_element = disk(int(pix_across_beam))
        
        # Find local maxima
        max_filtered = maximum_filter(data, footprint=struct_element)
        
        # Find peaks that are local maxima and above the threshold
        peaks = (data == max_filtered) & (data > threshold)
        
        # Get coordinates of peaks
        y_coords, x_coords = np.where(peaks)
        
        # Convert pixel coordinates to world coordinates
        ra_coords = []
        dec_coords = []
        
        for y, x in zip(y_coords, x_coords):
            try:
                sky_coord = wcs.pixel_to_world(x, y)
                ra_coords.append(sky_coord.ra.deg)
                dec_coords.append(sky_coord.dec.deg)
            except Exception as e:
                print(f"Error converting coordinates: {e}", file=sys.stderr)
        
        return ra_coords, dec_coords
    
    except Exception as e:
        print(f"Unexpected error in source detection: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return [], []

def main():
    """
    Main function to run source detection from command line
    """
    # Default parameters
    fits_file = None
    params = {
        'pix_across_beam': 5,
        'min_beams': 1.0,
        'beams_to_search': 1.0,
        'delta_rms': 3.0,
        'minval_rms': 2.0
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
        print(json.dumps({
            "error": "No FITS file specified",
            "ra": [],
            "dec": [],
            "source_count": 0
        }))
        sys.exit(1)
    
    # Run source detection
    try:
        ra_list, dec_list = find_sources(
            fits_file, 
            pix_across_beam=params['pix_across_beam'],
            min_beams=params['min_beams'],
            beams_to_search=params['beams_to_search'],
            delta_rms=params['delta_rms'],
            minval_rms=params['minval_rms']
        )
        
        # Print results as JSON
        print(json.dumps({
            "ra": ra_list,
            "dec": dec_list,
            "source_count": len(ra_list)
        }))
    
    except Exception as e:
        # Print any unexpected errors
        print(json.dumps({
            "error": str(e),
            "ra": [],
            "dec": [],
            "source_count": 0
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()