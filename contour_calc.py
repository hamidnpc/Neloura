"""DS9-style contour levels and polylines for a FITS plane.

Levels follow the SAOImage DS9 contour dialog: N samples from the low limit
toward the high limit, spaced in linear, log, pow, sqrt, squared, or asinh.
Smooth is a block average. Coordinates come back in the target image's
display pixels (y = 0 at the top of the viewer), after the same Y flip the
tiles use, and after a sky projection when the contour file is a different
image. That keeps CD-matrix rotation and scale in the line positions.
"""

from __future__ import annotations

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

MAX_LEVELS = 50
MAX_SIDE = 1400
MAX_POINTS = 50000
SCALES = ("linear", "log", "pow", "sqrt", "squared", "asinh")


def generate_levels(number, scale, low, high):
    """DS9 Contour Parameters → Generate.

    The step is (f(high) - f(low)) / N, and the levels are
    inv(f(low) + i * step) for i = 0 .. N-1. The high limit itself is the
    end of the range, not an extra level.
    """
    count = int(number)
    if count < 1 or count > MAX_LEVELS:
        raise ValueError(f"Number of levels must be from 1 to {MAX_LEVELS}.")
    scale_name = str(scale or "linear").strip().lower()
    if scale_name not in SCALES:
        raise ValueError("Scale must be linear, log, pow, sqrt, squared, or asinh.")
    low = float(low)
    high = float(high)
    if not np.isfinite(low) or not np.isfinite(high):
        raise ValueError("Limits must be finite numbers.")
    if high < low:
        low, high = high, low
    if count == 1 or low == high:
        return [low]

    if scale_name == "linear":
        forward, inverse = (lambda v: v), (lambda v: v)
    elif scale_name == "log":
        if low <= 0 or high <= 0:
            raise ValueError("Log scale needs limits above zero.")
        forward, inverse = np.log10, (lambda v: 10 ** v)
    elif scale_name == "pow":
        if low <= 0 or high <= 0:
            raise ValueError("Pow scale needs limits above zero.")
        forward, inverse = np.log, np.exp
    elif scale_name == "sqrt":
        if low < 0 or high < 0:
            raise ValueError("Sqrt scale needs limits of zero or above.")
        forward, inverse = np.sqrt, (lambda v: v * v)
    elif scale_name == "squared":
        forward, inverse = (lambda v: v * v), np.sqrt
    else:
        forward, inverse = np.arcsinh, np.sinh

    start = float(forward(low))
    stop = float(forward(high))
    if not np.isfinite(start) or not np.isfinite(stop):
        raise ValueError("Those limits do not work with this scale.")
    step = (stop - start) / float(count)
    levels = []
    for index in range(count):
        value = float(inverse(start + index * step))
        if np.isfinite(value):
            levels.append(value)
    if not levels:
        raise ValueError("No contour levels could be generated.")
    return levels


def _flip_y(header) -> bool:
    """Same decision the viewer uses when it turns a FITS plane upright."""
    try:
        if "CD1_1" in header:
            cd11 = float(header.get("CD1_1", 0.0))
            cd12 = float(header.get("CD1_2", 0.0))
            cd21 = float(header.get("CD2_1", 0.0))
            cd22 = float(header.get("CD2_2", 0.0))
        elif "PC1_1" in header:
            cdelt1 = float(header.get("CDELT1", 1.0))
            cdelt2 = float(header.get("CDELT2", 1.0))
            cd11 = float(header.get("PC1_1", 1.0)) * cdelt1
            cd12 = float(header.get("PC1_2", 0.0)) * cdelt1
            cd21 = float(header.get("PC2_1", 0.0)) * cdelt2
            cd22 = float(header.get("PC2_2", 1.0)) * cdelt2
        else:
            cd11 = float(header.get("CDELT1", 1.0))
            cd12 = 0.0
            cd21 = 0.0
            cd22 = float(header.get("CDELT2", 1.0))
        determinant = cd11 * cd22 - cd12 * cd21
        flip = determinant < 0
        if cd22 < 0 and determinant > 0:
            flip = True
        if abs(determinant) < 1e-15:
            flip = cd22 < 0
        return bool(flip)
    except Exception:
        return False


def _header_has_wcs(header) -> bool:
    if header is None:
        return False
    try:
        ctype1 = str(header.get("CTYPE1", "") or "").upper()
        ctype2 = str(header.get("CTYPE2", "") or "").upper()
    except Exception:
        return False
    if any(token in ctype1 for token in ("RA", "GLON", "ELON", "HLON")):
        return True
    if any(token in ctype2 for token in ("DEC", "GLAT", "ELAT", "HLAT")):
        return True
    return False


def _celestial_wcs(header):
    if not _header_has_wcs(header):
        return None
    try:
        wcs = WCS(header)
        if int(getattr(wcs, "naxis", 2) or 2) > 2 and getattr(wcs, "has_celestial", False):
            wcs = wcs.celestial
        if not getattr(wcs, "has_celestial", False):
            return None
        return wcs
    except Exception:
        return None


def _image_hdu_index(hdul, requested):
    if requested is not None and str(requested) != "":
        index = int(requested)
        if index < 0 or index >= len(hdul):
            raise ValueError(f"HDU {index} is not in this file.")
        data = hdul[index].data
        if data is None or int(getattr(data, "ndim", 0) or 0) < 2:
            raise ValueError(f"HDU {index} has no image.")
        return index
    for index, hdu in enumerate(hdul):
        data = getattr(hdu, "data", None)
        if data is None:
            continue
        ndim = int(getattr(data, "ndim", 0) or 0)
        if ndim >= 2 and int(data.shape[-1]) > 1 and int(data.shape[-2]) > 1:
            return index
    raise ValueError("This file has no image to contour.")


def _plane(data, slice_index):
    array = np.asarray(data)
    messages = []
    while array.ndim > 2:
        depth = int(array.shape[0])
        if array.ndim == 3 and slice_index is not None and str(slice_index) != "":
            chosen = int(slice_index)
        else:
            chosen = 0
        if chosen < 0 or chosen >= depth:
            raise ValueError(f"Slice {chosen} is outside this cube (0 to {depth - 1}).")
        if depth > 1 and array.ndim == 3:
            messages.append(f"Using slice {chosen + 1} of {depth}.")
        array = array[chosen]
    if array.ndim != 2:
        raise ValueError("This extension is not a 2D image.")
    return np.array(array, dtype=np.float32, copy=True), messages


def load_display_plane(path, hdu_index=None, slice_index=None):
    """Return the plane as the viewer shows it, plus the header that carries the WCS."""
    with fits.open(path, memmap=True, lazy_load_hdus=True) as hdul:
        index = _image_hdu_index(hdul, hdu_index)
        hdu = hdul[index]
        if hdu.data is None:
            raise ValueError(f"HDU {index} has no image.")
        plane, messages = _plane(hdu.data, slice_index)
        header = hdu.header
        wcs_header = header
        if not _header_has_wcs(header):
            for other in hdul:
                other_header = getattr(other, "header", None)
                if other_header is None or not _header_has_wcs(other_header):
                    continue
                try:
                    same = (
                        int(other_header.get("NAXIS1") or 0) == int(plane.shape[1])
                        and int(other_header.get("NAXIS2") or 0) == int(plane.shape[0])
                    )
                except Exception:
                    same = False
                if same:
                    wcs_header = other_header
                    break
        flip = _flip_y(wcs_header)
        if flip:
            plane = np.flipud(plane)
        return {
            "data": plane,
            "header": wcs_header,
            "flip": flip,
            "hdu": index,
            "width": int(plane.shape[1]),
            "height": int(plane.shape[0]),
            "messages": messages,
        }


def block_average(data, factor):
    factor = int(factor)
    if factor <= 1:
        return data, 1
    height, width = data.shape
    rows = height // factor
    cols = width // factor
    if rows < 2 or cols < 2:
        return data, 1
    trimmed = data[: rows * factor, : cols * factor]
    blocks = trimmed.reshape(rows, factor, cols, factor)
    with np.errstate(all="ignore"):
        reduced = np.nanmean(blocks, axis=(1, 3)).astype(np.float32, copy=False)
    return reduced, factor


def _working_copy(data, smooth):
    """Block-average by the requested smooth, then keep the long side near MAX_SIDE."""
    requested = max(1, int(smooth or 1))
    height, width = data.shape
    long_side = max(height, width)
    extra = 1
    if long_side // requested > MAX_SIDE:
        extra = int(np.ceil((long_side / requested) / float(MAX_SIDE)))
    factor = max(1, requested * max(1, extra))
    reduced, used = block_average(data, factor)
    return reduced, used, requested


def _finite_values(data):
    values = np.asanyarray(data)
    values = values[np.isfinite(values)]
    if values.size == 0:
        raise ValueError("This image has no numeric values to contour.")
    if values.size > 1_500_000:
        step = int(np.ceil(values.size / 1_500_000))
        values = values[::step]
    return values


def _data_limits(data):
    finite = np.isfinite(data)
    if not np.any(finite):
        raise ValueError("This image has no numeric values to contour.")
    return float(np.min(data[finite])), float(np.max(data[finite]))


def _percentile_table(data):
    values = _finite_values(data)
    marks = (0.1, 1, 5, 10, 25, 50, 75, 90, 95, 99, 99.9)
    found = np.percentile(values, marks)
    return {str(mark): float(value) for mark, value in zip(marks, found)}


def _map_to_full(lines, factor):
    """Smoothed pixel-center coordinates back to full-resolution display pixels."""
    offset = (float(factor) - 1.0) / 2.0
    mapped = []
    for line in lines:
        if line is None or len(line) < 2:
            continue
        points = np.asarray(line, dtype=np.float64)
        points = points * float(factor) + offset
        mapped.append(points)
    return mapped


def _simplify(points, budget):
    count = len(points)
    if count <= budget:
        return points
    step = int(np.ceil(count / float(budget)))
    kept = points[::step]
    if not np.array_equal(kept[-1], points[-1]):
        kept = np.vstack([kept, points[-1]])
    return kept


def _pack(points):
    rounded = np.round(points, 2)
    if len(rounded) >= 2:
        keep = np.ones(len(rounded), dtype=bool)
        keep[1:] = np.any(np.diff(rounded, axis=0) != 0, axis=1)
        rounded = rounded[keep]
    if len(rounded) < 2:
        return []
    return rounded.tolist()


def _contour_lines(data, levels):
    import contourpy

    generator = contourpy.contour_generator(z=np.asarray(data, dtype=np.float64))
    lines = []
    for level in levels:
        try:
            produced = generator.lines(float(level))
        except Exception:
            produced = []
        for line in produced or []:
            if line is not None and len(line) >= 2:
                lines.append((float(level), np.asarray(line, dtype=np.float64)))
    return lines


def _display_to_fits(xs, ys, height, flip):
    if flip:
        return xs, (float(height) - 1.0) - ys
    return xs, ys


def _fits_to_display(xs, ys, height, flip):
    if flip:
        return xs, (float(height) - 1.0) - ys
    return xs, ys


def _project(lines, source, target):
    """Move display-pixel polylines onto the target image. Same grid stays put."""
    source_wcs = _celestial_wcs(source["header"])
    target_wcs = _celestial_wcs(target["header"])
    same_shape = source["width"] == target["width"] and source["height"] == target["height"]
    if source_wcs is None or target_wcs is None:
        if same_shape and source["flip"] == target["flip"]:
            return lines, []
        raise ValueError(
            "This file has no sky coordinates that match the open image, so its contours cannot be placed."
        )

    chunks = []
    levels = []
    for level, points in lines:
        chunks.append(points)
        levels.append(level)
    if not chunks:
        return [], []
    stacked = np.vstack(chunks)
    fits_x, fits_y = _display_to_fits(stacked[:, 0], stacked[:, 1], source["height"], source["flip"])
    try:
        world = source_wcs.all_pix2world(np.column_stack([fits_x, fits_y]), 0)
        pixels = target_wcs.all_world2pix(world, 0)
    except Exception as exc:
        raise ValueError("The sky coordinates of these two images could not be matched.") from exc
    display_x, display_y = _fits_to_display(pixels[:, 0], pixels[:, 1], target["height"], target["flip"])
    projected = np.column_stack([display_x, display_y])

    margin = 0.25 * max(target["width"], target["height"]) + 32.0
    output = []
    cursor = 0
    for level, points in lines:
        count = len(points)
        block = projected[cursor: cursor + count]
        cursor += count
        finite = np.isfinite(block).all(axis=1)
        current = []
        for point, ok in zip(block, finite):
            if not ok:
                if len(current) >= 2:
                    output.append((level, np.asarray(current, dtype=np.float64)))
                current = []
                continue
            current.append(point)
        if len(current) >= 2:
            group = np.asarray(current, dtype=np.float64)
            inside = (
                (group[:, 0] >= -margin) & (group[:, 0] <= target["width"] + margin)
                & (group[:, 1] >= -margin) & (group[:, 1] <= target["height"] + margin)
            )
            if np.any(inside):
                output.append((level, group))
    return output, []


def _budget_lines(lines):
    packed = []
    remaining = MAX_POINTS
    # Prefer longer lines when the cap is reached; they are the structures you can see.
    ordered = sorted(lines, key=lambda item: len(item[1]), reverse=True)
    for level, points in ordered:
        if remaining < 8:
            break
        allowance = min(800, remaining)
        simplified = _simplify(points, allowance)
        coded = _pack(simplified)
        if len(coded) < 2:
            continue
        remaining -= len(coded)
        packed.append({"level": level, "points": coded})
    return packed


def prepare_source(path, hdu_index, slice_index, smooth):
    loaded = load_display_plane(path, hdu_index, slice_index)
    reduced, used, requested = _working_copy(loaded["data"], smooth)
    low, high = _data_limits(reduced)
    messages = list(loaded["messages"])
    if used != requested:
        messages.append(f"Blocked by {used} so the contour stays responsive.")
    loaded["reduced"] = reduced
    loaded["factor"] = used
    loaded["messages"] = messages
    loaded["data_min"] = low
    loaded["data_max"] = high
    loaded["percentiles"] = _percentile_table(loaded["reduced"])
    return loaded


def levels_for_request(loaded, number, scale, low, high):
    data_low = loaded["data_min"]
    data_high = loaded["data_max"]
    use_low = data_low if low is None or str(low).strip() == "" else float(low)
    use_high = data_high if high is None or str(high).strip() == "" else float(high)
    levels = generate_levels(number, scale, use_low, use_high)
    return levels, use_low, use_high


def contours_for_levels(loaded, target, levels):
    if not levels:
        return []
    raw = _contour_lines(loaded["reduced"], levels)
    full = []
    for level, points in raw:
        mapped = _map_to_full([points], loaded["factor"])
        if mapped:
            full.append((level, mapped[0]))
    if target is loaded:
        projected = full
    else:
        projected, _notes = _project(full, loaded, target)
    return _budget_lines(projected)


def run_limits(path, hdu_index, slice_index, smooth):
    loaded = prepare_source(path, hdu_index, slice_index, smooth)
    return {
        "percentiles": loaded["percentiles"],
        "data_min": loaded["data_min"],
        "data_max": loaded["data_max"],
        "hdu": loaded["hdu"],
        "smooth": loaded["factor"],
        "messages": loaded["messages"],
    }


def run_generate(path, hdu_index, slice_index, smooth, number, scale, low, high):
    loaded = prepare_source(path, hdu_index, slice_index, smooth)
    levels, use_low, use_high = levels_for_request(loaded, number, scale, low, high)
    return {
        "levels": levels,
        "min": use_low,
        "max": use_high,
        "data_min": loaded["data_min"],
        "data_max": loaded["data_max"],
        "smooth": loaded["factor"],
        "hdu": loaded["hdu"],
        "width": loaded["width"],
        "height": loaded["height"],
        "messages": loaded["messages"],
    }


def run_apply(source_path, source_hdu, source_slice, target_path, target_hdu, target_slice, smooth, levels):
    cleaned = []
    for value in levels or []:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if np.isfinite(number):
            cleaned.append(number)
    if len(cleaned) > MAX_LEVELS:
        raise ValueError(f"Use at most {MAX_LEVELS} levels.")
    if not cleaned:
        return {"lines": [], "count": 0, "messages": ["No levels to draw."]}
    loaded = prepare_source(source_path, source_hdu, source_slice, smooth)
    if _same_plane(source_path, loaded, source_slice, target_path, target_hdu, target_slice):
        target = loaded
    else:
        target = load_display_plane(target_path, target_hdu, target_slice)
    lines = contours_for_levels(loaded, target, cleaned)
    messages = list(loaded["messages"])
    if target is not loaded:
        messages.extend(target["messages"])
    return {
        "lines": lines,
        "count": len(lines),
        "smooth": loaded["factor"],
        "hdu": loaded["hdu"],
        "messages": messages,
    }


def _slice_index(value):
    if value is None or str(value) == "":
        return 0
    return int(value)


def _same_plane(source_path, loaded, source_slice, target_path, target_hdu, target_slice):
    if str(source_path) != str(target_path):
        return False
    if target_hdu is not None and str(target_hdu) != "" and int(loaded["hdu"]) != int(target_hdu):
        return False
    return _slice_index(source_slice) == _slice_index(target_slice)
