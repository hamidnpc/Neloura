import time
from pathlib import Path
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS as WCSpy
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
from astropy.table import Table
from astropy.coordinates import SkyCoord
import astropy.units as u
from astropy.stats import SigmaClip
from photutils.aperture import SkyCircularAnnulus, ApertureStats
from pydantic import BaseModel
from typing import Optional
import scipy.ndimage as nd
from scipy.ndimage import zoom
from datetime import datetime
from scipy.optimize import curve_fit

jwst_filters = {
                'F200W':{'FWHM':0.066,'solid_angle':0.167e-12},
                'F300M':{'FWHM':0.100,'solid_angle':0.365e-12},
                'F335M':{'FWHM':0.111,'solid_angle':0.458e-12},
                'F360M':{'FWHM':0.120,'solid_angle':0.530e-12},
                'F770M':{'FWHM':0.25,'solid_angle':2.18e-12},
                'F1000W':{'FWHM':0.32,'solid_angle':3.77e-12},
                'F1130W':{'FWHM':0.36,'solid_angle':4.95e-12},
                'F2100W':{'FWHM':0.67,'solid_angle':16.1e-12}}


fluxfac= 1e12 #from MJy/sr to_uJy

# Pydantic model for the request body
class AstInjectRequest(BaseModel):
    fitsFile: str
    hdu: int
    psfFile: str
    # Deprecated fields kept for compatibility with main.py; ignored by logic
    useSeparation: Optional[bool] = False
    catalogFile: Optional[str] = None
    separationValue: Optional[float] = None
    numSources: int
    filterName: str
    fluxMinMultiplier: Optional[float] = 5.0
    fluxMaxMultiplier: Optional[float] = 1000.0


class AstPlotRequest(BaseModel):
    fakeCatalogFile: str
    detectedCatalogFile: str
    minFakeSeparationArcsec: float = 1.5
    matchRadiusArcsec: float = 0.67
    fluxColumn: Optional[str] = None
    colorColumn: Optional[str] = None
    overlapRadiusDeg: float = 2.0
    # galaxyName removed from UI; backend will auto-group if present
    galaxyName: Optional[str] = None


def _find_column_case_insensitive(table: Table, candidates: list[str]) -> Optional[str]:
    lower_map = {c.lower(): c for c in table.colnames}
    for cand in candidates:
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
    return None


def _get_flux_column(table: Table, preferred: Optional[str]) -> Optional[str]:
    if preferred and preferred in table.colnames:
        return preferred
    if preferred:
        # try case-insensitive
        for col in table.colnames:
            if col.lower() == preferred.lower():
                return col
    # common defaults
    for cand in ['FLUX', 'flux', 'F2100W', 'F1000W', 'F1130W']:
        if cand in table.colnames:
            return cand
    # heuristic: first column that contains 'flux'
    for col in table.colnames:
        if 'flux' in col.lower():
            return col
    return None


def _logistic(x: np.ndarray, b: float, c: float) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-b * (x - c)))


def compute_ast_plot(params: AstPlotRequest):
    try:
        fake_path = Path(params.fakeCatalogFile)
        detected_path = Path(params.detectedCatalogFile)

        if not fake_path.is_file():
            raise FileNotFoundError(f"Fake catalog not found: {params.fakeCatalogFile}")
        if not detected_path.is_file():
            raise FileNotFoundError(f"Detected catalog not found: {params.detectedCatalogFile}")

        fake_table = Table.read(fake_path, format='fits')
        det_table = Table.read(detected_path, format='fits')

        ra_col = _find_column_case_insensitive(fake_table, ['RA'])
        dec_col = _find_column_case_insensitive(fake_table, ['DEC'])
        if ra_col is None or dec_col is None:
            raise ValueError('Could not find RA/DEC columns in fake catalog')

        flux_col = _get_flux_column(fake_table, params.fluxColumn)
        if flux_col is None:
            raise ValueError('Could not determine flux column in fake catalog')

        # Helper that computes AST for provided subset tables
        def compute_for_subset(fake_subset: Table, det_subset: Table, galaxy_name: Optional[str], color_vals: Optional[np.ndarray]):
            ra_fake = np.array(fake_subset[ra_col], dtype=float)
            dec_fake = np.array(fake_subset[dec_col], dtype=float)
            flux_fake_vals = np.array(fake_subset[flux_col], dtype=float)

            coords_fake_all = SkyCoord(ra=ra_fake * u.deg, dec=dec_fake * u.deg)
            ra_det_col = _find_column_case_insensitive(det_subset, ['RA'])
            dec_det_col = _find_column_case_insensitive(det_subset, ['DEC'])
            if ra_det_col is None or dec_det_col is None:
                raise ValueError('Could not find RA/DEC columns in detected catalog')
            coords_det_all = SkyCoord(ra=np.array(det_subset[ra_det_col], dtype=float) * u.deg,
                                      dec=np.array(det_subset[dec_det_col], dtype=float) * u.deg)

            # Overlap filtering
            if len(coords_det_all) > 0 and len(coords_fake_all) > 0:
                _, fake_to_det_d2d, _ = coords_fake_all.match_to_catalog_sky(coords_det_all)
                keep_fake_mask = fake_to_det_d2d < (params.overlapRadiusDeg * u.deg)
                coords_fake = coords_fake_all[keep_fake_mask]
                flux_fake = flux_fake_vals[keep_fake_mask]
                _, det_to_fake_d2d, _ = coords_det_all.match_to_catalog_sky(coords_fake_all)
                keep_det_mask = det_to_fake_d2d < (params.overlapRadiusDeg * u.deg)
                coords_det = coords_det_all[keep_det_mask]
            else:
                coords_fake = coords_fake_all
                flux_fake = flux_fake_vals
                coords_det = coords_det_all

            # Enforce min fake-fake separation
            if len(coords_fake) > 1:
                _, d2d_nn, _ = coords_fake.match_to_catalog_sky(coords_fake, nthneighbor=2)
                sep_ok = d2d_nn > (params.minFakeSeparationArcsec * u.arcsec)
                coords_fake = coords_fake[sep_ok]
                flux_fake = flux_fake[sep_ok]
                color_vals = color_vals[sep_ok] if color_vals is not None else None

            # Detection vector
            if len(coords_fake) == 0:
                return None
            idx_match, d2d_match, _ = coords_det.match_to_catalog_sky(coords_fake)
            detected_vec = np.zeros(len(coords_fake), dtype=int)
            within = d2d_match.arcsec < params.matchRadiusArcsec
            detected_indices = np.unique(idx_match[within])
            detected_vec[detected_indices] = 1

            # Valid flux
            good = np.isfinite(flux_fake) & (flux_fake > 0)
            flux = flux_fake[good]
            detection = detected_vec[good]
            
            color_payload = None
            if color_vals is not None:
                color_payload = color_vals[good].tolist()

            if flux.size == 0:
                return None

            popt, _ = curve_fit(_logistic, flux, detection, p0=[1.0 / max(np.median(flux), 1e-6), np.median(flux)], maxfev=5000)


            b_fit = float(popt[0])
            c_fit = float(popt[1])
            f_sorted = np.sort(flux)
            grid = np.linspace(f_sorted[0], f_sorted[-1], 200) if f_sorted.size > 200 else f_sorted
            curve_y = _logistic(grid, b_fit, c_fit)

            max_scatter = 5000
            if flux.size > max_scatter:
                idxs = np.linspace(0, flux.size - 1, max_scatter, dtype=int)
                flux_payload = flux[idxs].tolist()
                detect_payload = detection[idxs].tolist()
                if color_payload is not None:
                    color_payload = np.array(color_payload)[idxs].tolist()
            else:
                flux_payload = flux.tolist()
                detect_payload = detection.tolist()

            return {
                'galaxy_name': galaxy_name,
                'num_fake_total': int(len(fake_subset)),
                'num_fake_after_filter': int(len(coords_fake)),
                'num_detected': int(np.sum(detected_vec)),
                'fit_b': b_fit,
                'fit_c': c_fit,
                'scatter_flux': flux_payload,
                'scatter_detection': detect_payload,
                'scatter_color': color_payload,
                'curve_flux': grid.tolist(),
                'curve_detection': curve_y.tolist(),
            }

        # If both have galaxy columns, compute per common galaxy; else single group
        galaxy_col_fake = _find_column_case_insensitive(fake_table, ['GALAXY', 'galaxy'])
        galaxy_col_det = _find_column_case_insensitive(det_table, ['GALAXY', 'galaxy'])
        
        color_col = _find_column_case_insensitive(fake_table, [params.colorColumn]) if params.colorColumn else None
        color_data = np.array(fake_table[color_col], dtype=float) if color_col else None

        groups = []
        if galaxy_col_fake and galaxy_col_det:
            fake_gs = set(str(v).strip() for v in fake_table[galaxy_col_fake])
            det_gs = set(str(v).strip() for v in det_table[galaxy_col_det])
            common = sorted(list(fake_gs & det_gs))
            for g in common:
                mask_fake = np.array([str(v).strip() == g for v in fake_table[galaxy_col_fake]], dtype=bool)
                mask_det = np.array([str(v).strip() == g for v in det_table[galaxy_col_det]], dtype=bool)
                
                color_subset = color_data[mask_fake] if color_data is not None else None
                res = compute_for_subset(fake_table[mask_fake], det_table[mask_det], g, color_subset)
                if res is not None:
                    groups.append(res)
        else:
            res = compute_for_subset(fake_table, det_table, None, color_data)
            if res is not None:
                groups.append(res)

        ra_fake = np.array(fake_table[ra_col], dtype=float)
        dec_fake = np.array(fake_table[dec_col], dtype=float)
        flux_fake = np.array(fake_table[flux_col], dtype=float)

        # Coordinates for both catalogs
        coords_fake_all = SkyCoord(ra=ra_fake * u.deg, dec=dec_fake * u.deg)
        ra_det_col = _find_column_case_insensitive(det_table, ['RA'])
        dec_det_col = _find_column_case_insensitive(det_table, ['DEC'])
        if ra_det_col is None or dec_det_col is None:
            raise ValueError('Could not find RA/DEC columns in detected catalog')
        coords_det_all = SkyCoord(ra=np.array(det_table[ra_det_col], dtype=float) * u.deg,
                                  dec=np.array(det_table[dec_det_col], dtype=float) * u.deg)

        # Restrict to overlapping sky regions (within overlapRadiusDeg)
        # Keep only fakes near any detected
        if len(coords_det_all) > 0 and len(coords_fake_all) > 0:
            fake_to_det_idx, fake_to_det_d2d, _ = coords_fake_all.match_to_catalog_sky(coords_det_all)
            keep_fake_mask = fake_to_det_d2d < (params.overlapRadiusDeg * u.deg)
            coords_fake = coords_fake_all[keep_fake_mask]
            flux_fake = flux_fake[keep_fake_mask]
            # Also keep only detected near any fake
            det_to_fake_idx, det_to_fake_d2d, _ = coords_det_all.match_to_catalog_sky(coords_fake_all)
            keep_det_mask = det_to_fake_d2d < (params.overlapRadiusDeg * u.deg)
            coords_det = coords_det_all[keep_det_mask]
        else:
            coords_fake = coords_fake_all
            coords_det = coords_det_all

        # Drop too-close fakes via nearest neighbor distance (on filtered fakes)
        if len(coords_fake) > 1:
            idx_nn, d2d_nn, _ = coords_fake.match_to_catalog_sky(coords_fake, nthneighbor=2)
            sep_ok = d2d_nn > (params.minFakeSeparationArcsec * u.arcsec)
            coords_fake = coords_fake[sep_ok]
            flux_fake = flux_fake[sep_ok]
        # For each detected source, find closest fake
        idx_match, d2d_match, _ = coords_det.match_to_catalog_sky(coords_fake)
        detected = np.zeros(len(coords_fake), dtype=int)
        within = d2d_match.arcsec < params.matchRadiusArcsec
        # The indices in idx_match refer to coords_fake; set those as detected where within threshold
        detected_indices = np.unique(idx_match[within])
        detected[detected_indices] = 1

        # Filter to positive finite flux values
        good = np.isfinite(flux_fake) & (flux_fake > 0)
        flux = flux_fake[good]
        detection = detected[good]
        if flux.size == 0:
            raise ValueError('No valid flux values after filtering')

        # Logistic fit
        popt, _ = curve_fit(_logistic, flux, detection, p0=[1.0 / max(np.median(flux), 1e-6), np.median(flux)], maxfev=5000)


        b_fit = float(popt[0])
        c_fit = float(popt[1])

        # Prepare curve on sorted flux grid
        f_sorted = np.sort(flux)
        # sample at up to 200 points for front-end plotting
        if f_sorted.size > 200:
            grid = np.linspace(f_sorted[0], f_sorted[-1], 200)
        else:
            grid = f_sorted
        curve_y = _logistic(grid, b_fit, c_fit)

        # Limit scatter payload to avoid huge responses
        max_scatter = 5000
        if flux.size > max_scatter:
            idxs = np.linspace(0, flux.size - 1, max_scatter, dtype=int)
            flux_payload = flux[idxs].tolist()
            detect_payload = detection[idxs].tolist()
        else:
            flux_payload = flux.tolist()
            detect_payload = detection.tolist()

        return {
            'flux_column': flux_col,
            'groups': groups,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e

def get_pixel_scale_from_header(header, wcs=None):
    """
    Robustly determines pixel scale from FITS header in arcsec/pixel.
    Tries WCS first, then falls back to common keywords, checking units.
    """
    if wcs and wcs.has_celestial:
        try:
            scales = proj_plane_pixel_scales(wcs)
            return np.mean(scales) * 3600
        except Exception:
            pass  # WCS lookup failed, try keywords

    # Case-insensitive check for all known keyword variants
    header_keys_upper = {k.strip().upper(): k for k in header}

    # Check for CDELT or CD matrix keys
    for key in ['CDELT1', 'CD1_1']:
        if key in header_keys_upper:
            original_key = header_keys_upper[key]
            cdelt = abs(header[original_key])
            unit_key = 'CUNIT1'
            unit = header.get(unit_key, 'deg').lower()
            
            if 'deg' in unit:
                return cdelt * 3600
            elif 'arcsec' in unit:
                return cdelt
            elif 'arcmin' in unit:
                return cdelt * 60
            else:
                return cdelt * 3600

    # Fallback to PIXSCALE keywords
    for key in ['PIXSCALE', 'PIXSCAL1', 'PIXELSCL']:
        if key in header_keys_upper:
            original_key = header_keys_upper[key]
            return header[original_key]

    raise ValueError("Could not determine pixel scale. No WCS, CDELT, or PIXSCALE keywords found.")


def inject_sources(params: AstInjectRequest):
    """
    Injects artificial sources (PSFs) into a FITS image, reads pixel scales
    from headers, and saves a new file.
    """
    try:
        fits_path = Path(params.fitsFile)
        psf_path = Path(params.psfFile)
        
        if not fits_path.is_file():
            raise FileNotFoundError(f"FITS file not found: {params.fitsFile}")
        if not psf_path.is_file():
            raise FileNotFoundError(f"PSF file not found: {params.psfFile}")
            
        # Separation/cross-match catalog is deprecated and ignored

        with fits.open(fits_path) as hdul:
            image_data = hdul[params.hdu].data.astype(np.float32)
            header = hdul[params.hdu].header
            wcs = WCSpy(header)
            target_pixel_scale = get_pixel_scale_from_header(header, wcs)

        with fits.open(psf_path) as psf_hdul:
            psf_data = psf_hdul[0].data.astype(np.float32)
            psf_header = psf_hdul[0].header
            try:
                psf_wcs = WCSpy(psf_header, naxis=psf_data.ndim)
            except Exception:
                psf_wcs = None
            psf_pixel_scale = get_pixel_scale_from_header(psf_header, psf_wcs)

        # Validate selected filter and extract parameters
        filter_key = (params.filterName or '').upper()
        if filter_key not in jwst_filters:
            raise ValueError(f"Unknown or unsupported filter '{params.filterName}'. Supported: {', '.join(jwst_filters.keys())}")
        FWHM_arcsec = jwst_filters[filter_key]['FWHM']
        solid_angle_sr = jwst_filters[filter_key]['solid_angle']
        # For compatibility with provided computation snippet
        FWHM = FWHM_arcsec
        solid_angle = solid_angle_sr
        
        if target_pixel_scale <= 0 or psf_pixel_scale <= 0:
             raise ValueError(f"Invalid pixel scale detected (target: {target_pixel_scale}, psf: {psf_pixel_scale}).")

        if not np.isclose(target_pixel_scale, psf_pixel_scale, rtol=1e-5):
            zoom_factor = psf_pixel_scale / target_pixel_scale
            if not (0.01 < zoom_factor < 100):
                raise ValueError(f"Extreme zoom factor ({zoom_factor:.2f}) calculated. Check FITS headers.")
            print(f"Resampling PSF: Target scale={target_pixel_scale:.4f}\", PSF scale={psf_pixel_scale:.4f}\", Zoom={zoom_factor:.4f}")
            resampled_psf = zoom(psf_data, zoom_factor, order=3) * (zoom_factor**2)
            psf_data = resampled_psf
        else:
            print("PSF and target pixel scales match. No resampling needed.")

        psf_data /= np.sum(psf_data)
        psf_h, psf_w = psf_data.shape

        # No real-source separation logic

        num_sources = params.numSources
        y_max, x_max = image_data.shape
        sources_added = 0
        xs: list[float] = []
        ys: list[float] = []

        # Precompute global sky stats as fallbacks and avoid repeated NaN warnings
        finite_mask = np.isfinite(image_data)
        global_sky = float(np.nanmedian(image_data[finite_mask])) if np.any(finite_mask) else 0.0
        global_sky_std = float(np.nanstd(image_data[finite_mask])) if np.any(finite_mask) else 0.0

        for _ in range(num_sources * 5):
            if sources_added >= num_sources:
                break
            x_center = np.random.uniform(psf_w / 2, x_max - psf_w / 2)
            y_center = np.random.uniform(psf_h / 2, y_max - psf_h / 2)

            # No separation constraint

            x_start, y_start = int(x_center - psf_w / 2), int(y_center - psf_h / 2)
            x_end, y_end = x_start + psf_w, y_start + psf_h

            if not (0 <= x_start and x_end < x_max and 0 <= y_start and y_end < y_max):
                continue

            local = image_data[y_start:y_end, x_start:x_end]
            finite_local = np.isfinite(local)
            if not np.any(finite_local):
                sky_val = global_sky
            else:
                sky_val = float(np.nanmedian(local[finite_local]))

            min_mult = params.fluxMinMultiplier if params.fluxMinMultiplier is not None else 5.0
            max_mult = params.fluxMaxMultiplier if params.fluxMaxMultiplier is not None else 1000.0
            if max_mult <= min_mult:
                max_mult = min_mult + 1.0
            flux_value = np.random.uniform(min_mult * sky_val, max_mult * sky_val)
            image_data[y_start:y_end, x_start:x_end] += psf_data * flux_value
            sources_added += 1
            xs.append(x_center)
            ys.append(y_center)

        # Photometry using provided method, but done in batch for speed
        coordinates = []
        if sources_added > 0:
            xs_arr = np.array(xs)
            ys_arr = np.array(ys)
            ras, decs = wcs.all_pix2world(xs_arr, ys_arr, 1)

            surfbright_arr = nd.map_coordinates(
                image_data,
                np.vstack([ys_arr, xs_arr]),
                order=0,
                mode='nearest'
            )

            sigclip = SigmaClip(sigma=3.0, maxiters=10)
            positions = SkyCoord(ra=ras * u.deg, dec=decs * u.deg)
            aper = SkyCircularAnnulus(positions, 2 * FWHM * u.arcsec, 3 * FWHM * u.arcsec)
            bkg_stats = ApertureStats(image_data, aper, sigma_clip=sigclip, wcs=WCS(header))
            flux_bkg_arr = np.asarray(bkg_stats.median)

            # Background sigma estimate for error; fallback to MAD_STD or global
            bkg_sigma_arr = None
            if hasattr(bkg_stats, 'std') and bkg_stats.std is not None:
                bkg_sigma_arr = np.asarray(bkg_stats.std)
            elif hasattr(bkg_stats, 'mad_std') and bkg_stats.mad_std is not None:
                bkg_sigma_arr = np.asarray(bkg_stats.mad_std)
            else:
                bkg_sigma_arr = np.full_like(flux_bkg_arr, global_sky_std, dtype=float)

            # Convert to microJy
            bkg_uJy_arr = flux_bkg_arr * solid_angle * fluxfac
            flux_arr = (surfbright_arr - flux_bkg_arr) * solid_angle * fluxfac
            err_arr = bkg_sigma_arr * solid_angle * fluxfac
            with np.errstate(divide='ignore', invalid='ignore'):
                snr_arr = np.where(err_arr > 0, flux_arr / err_arr, 0.0)

            for i in range(sources_added):
                coordinates.append((
                    float(xs_arr[i]),
                    float(ys_arr[i]),
                    float(ras[i]),
                    float(decs[i]),
                    float(bkg_uJy_arr[i]),
                    float(flux_arr[i]),
                    float(err_arr[i]),
                    float(snr_arr[i])
                ))
    
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        output_filename = f"{Path(params.fitsFile).stem}_with_fakes_{timestamp}.fits"
        from main import UPLOADS_DIRECTORY, PEAK_FINDER_OUTPUT_DIR
        output_path = Path(UPLOADS_DIRECTORY) / output_filename
        fits.writeto(output_path, image_data, header, overwrite=True)  

        coord_table = Table(rows=coordinates, names=('X', 'Y', 'RA', 'DEC', 'FLUX_BKG_uJy', 'FLUX_uJy', 'FLUX_ERR_uJy', 'SNR'))
        # Add units (uJy) to relevant columns
        try:
            coord_table['FLUX_uJy'].unit = 'uJy'
            coord_table['FLUX_BKG_uJy'].unit = 'uJy'
            coord_table['FLUX_ERR_uJy'].unit = 'uJy'
        except Exception:
            pass
        # Save filter in catalog: as a column and metadata
        try:
            filter_str = str(params.filterName)
            coord_table['FILTER'] = [filter_str] * len(coord_table)
            coord_table.meta['FILTER'] = filter_str
            coord_table.meta['FLUX_UNIT'] = 'uJy'
        except Exception:
            pass
        catalog_filename = f"injected_catalog_{Path(params.fitsFile).stem}_{timestamp}.fits"
        catalog_path = Path(PEAK_FINDER_OUTPUT_DIR) / catalog_filename
        coord_table.write(catalog_path, format='fits', overwrite=True)

        return {
            "message": f"Successfully injected {sources_added} sources.",
            "output_fits_file": str(output_path),
            "output_catalog_file": str(catalog_path)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e