import json
import math
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
import numpy as np


_RW_LOCK = threading.Lock()
SETTINGS_FILE = Path("settings_profiles.json")


class SettingsProfile(BaseModel):
    name: str
    settings: Dict[str, Any]
    owner_session: Optional[str] = None  # None => global/admin


class CreateOrUpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    settings: Dict[str, Any] = Field(default_factory=dict)


class SetActiveProfileRequest(BaseModel):
    name: Optional[str]  # None to clear


router = APIRouter(prefix="/settings", tags=["settings"])


def _read_json_file(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _write_json_file(path: Path, data: Dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp.replace(path)


def _load_store() -> Dict[str, Any]:
    with _RW_LOCK:
        return _read_json_file(SETTINGS_FILE)


def _save_store(store: Dict[str, Any]) -> None:
    with _RW_LOCK:
        _write_json_file(SETTINGS_FILE, store)


def _get_main_module():
    # Avoid circular import at module import time
    import sys
    return sys.modules.get("main")


def _get_session_id(request: Request) -> Optional[str]:
    sid = request.headers.get("X-Session-ID") or request.query_params.get("sid")
    if sid:
        return sid
    try:
        c = request.cookies.get("session_id")
        if c:
            return c
    except Exception:
        pass
    sess = getattr(request.state, "session", None)
    if sess is not None:
        try:
            return getattr(sess, "session_id", None)
        except Exception:
            return None
    return None


# Snapshot of original defaults at first use to avoid drift from runtime mutations
_ORIGINAL_DEFAULTS: Dict[str, Any] = {}

def _get_original_defaults() -> Dict[str, Any]:
    global _ORIGINAL_DEFAULTS
    if not _ORIGINAL_DEFAULTS:
        _ORIGINAL_DEFAULTS = _build_defaults_from_main()
    return _ORIGINAL_DEFAULTS

def _compute_effective_settings_for_session(session_id: Optional[str], store: Dict[str, Any]) -> Dict[str, Any]:
    # Always start from original, hardcoded defaults (from main.py at process start)
    base = _get_original_defaults()
    eff = dict(base)
    if not store:
        return eff
    active_by_session = store.get("active_by_session", {})
    active_name = active_by_session.get(session_id)
    if active_name:
        for p in store.get("profiles", []):
            if p.get("name") == active_name:
                eff.update(p.get("settings", {}))
                break
    return eff


def _apply_effective_to_runtime(request: Request) -> None:
    main = _get_main_module()
    if not main:
        return
    store = _load_store()
    session_id = _get_session_id(request)
    effective = _compute_effective_settings_for_session(session_id, store)
    # Apply module-level constants when present
    try:
        # Only allow keys that are part of the declared schema
        allowed_names = {entry.get("name") for entry in _get_schema()}
    except Exception:
        allowed_names = set()
    for k, v in effective.items():
        if allowed_names and k not in allowed_names:
            continue
        if hasattr(main, k):
            try:
                setattr(main, k, v)
            except Exception:
                pass
    # Update per-session generators and caches
    session = getattr(request.state, "session", None)
    if session is not None:
        data = session.data
        try:
            gens = data.get("active_tile_generators", {}) or {}
            # Adopt new tile size and recalc levels; force dynamic range refresh when percentile changed
            new_tile_size = effective.get("IMAGE_TILE_SIZE_PX")
            drp = effective.get("DYNAMIC_RANGE_PERCENTILES")
            for gen in list(gens.values()):
                try:
                    if new_tile_size and hasattr(gen, "tile_size") and hasattr(gen, "width") and hasattr(gen, "height"):
                        gen.tile_size = int(new_tile_size)
                        try:
                            import math as _m
                            gen.max_level = max(0, int(_m.ceil(_m.log2(max(gen.width, gen.height) / max(1, gen.tile_size)))))
                        except Exception:
                            pass
                    if drp is not None and isinstance(drp, dict) and hasattr(gen, "min_value") and hasattr(gen, "max_value"):
                        gen.min_value = None
                        gen.max_value = None
                        if hasattr(gen, "dynamic_range_calculated"):
                            gen.dynamic_range_calculated = False
                except Exception:
                    continue
            # Clear session tile cache to reflect changes
            cache = data.get("tile_cache")
            if cache and hasattr(cache, "clear"):
                try:
                    cache.clear()
                except Exception:
                    pass
        except Exception:
            pass


def _is_admin(request: Request) -> bool:
    # Admin concept removed (only user-scoped profiles used).
    return False


def _build_defaults_from_main() -> Dict[str, Any]:
    main = _get_main_module()
    if not main:
        return {}
    # Whitelist of configurable settings grouped by category
    # name => (default_value, type, group, options)
    schema: Dict[str, Dict[str, Any]] = {}

    def add(name: str, group: str, options: Optional[List[Any]] = None):
        if hasattr(main, name):
            schema[name] = {
                "default": getattr(main, name),
                "group": group,
                "options": options,
            }

    # I. Web Server & API
    add("UVICORN_HOST", "Web/API")
    add("UVICORN_PORT", "Web/API")
    add("UVICORN_RELOAD_MODE", "Web/API", options=[True, False])
    add("DEFAULT_EXPORT_FORMAT", "Web/API", options=["csv", "json", "fits"])
    add("MAX_EXPORT_ROWS", "Web/API")
    add("CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE", "Web/API")
    add("SYSTEM_STATS_UPDATE_INTERVAL", "Web/API")
    add("PROXY_DOWNLOAD_TIMEOUT", "Web/API")
    add("FIND_FILES_TIMEOUT", "Web/API")
    add("PEAK_FINDER_TIMEOUT", "Web/API")

    # II. Paths
    add("CATALOGS_DIRECTORY", "Paths")
    add("UPLOADS_DIRECTORY", "Paths")
    add("CATALOG_MAPPINGS_FILE", "Paths")
    add("FILES_DIRECTORY", "Paths")
    add("BASE_FITS_PATH", "Paths")
    add("PSF_DIRECTORY", "Paths")
    add("BASE_PSF_PATH", "Paths")
    add("IMAGE_DIR", "Paths")
    # Expose static and kernels directories in Paths
    add("STATIC_DIRECTORY", "Paths")
    add("KERNELS_DIRECTORY", "Paths")

    # III. FITS & Tiles
    add("DEFAULT_HDU_INDEX", "FITS/Tiles")
    add("IMAGE_TILE_SIZE_PX", "FITS/Tiles")
    add("DYNAMIC_RANGE_PERCENTILES", "FITS/Tiles")

    # IV. Algorithms
    add("PEAK_FINDER_DEFAULTS", "Algorithms")
    add("SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC", "Algorithms")
    add("MAX_POINTS_FOR_FULL_HISTOGRAM", "Algorithms")
    add("FITS_HISTOGRAM_DEFAULT_BINS", "Algorithms")
    add("CATALOG_ANALYSIS_HISTOGRAM_BINS", "Algorithms")
    add("RA_COLUMN_NAMES", "Algorithms")
    add("DEC_COLUMN_NAMES", "Algorithms")
    add("RGB_GALAXY_COLUMN_NAMES", "Algorithms")
    add("RGB_INVALID_GALAXY_NAMES", "Algorithms")
    add("CUTOUT_SIZE_ARCSEC", "Algorithms")
    add("RGB_PANEL_TYPE_DEFAULT", "Algorithms")

    # V. Cache
    add("TILE_CACHE_MAX_SIZE", "Cache")
    add("SED_HST_FILTERS", "Cache")
    add("SED_JWST_NIRCAM_FILTERS", "Cache")
    add("SED_JWST_MIRI_FILTERS", "Cache")

    # VII. I/O Mitigations
    add("ENABLE_IN_MEMORY_FITS", "I/O", options=[True, False])
    add("IN_MEMORY_FITS_MAX_MB", "I/O")
    add("IN_MEMORY_FITS_RAM_FRACTION", "I/O")
    add("ENABLE_PAGECACHE_WARMUP", "I/O", options=[True, False])
    add("PAGECACHE_WARMUP_CHUNK_ROWS", "I/O")
    add("IN_MEMORY_FITS_MODE", "I/O", options=["auto", "always", "never"])
    add("RANDOM_READ_BENCH_SAMPLES", "I/O")
    add("RANDOM_READ_CHUNK_BYTES", "I/O")
    add("RANDOM_READ_THRESHOLD_MBPS", "I/O")

    # JSON-safe conversion helpers
    def _json_safe(val: Any) -> Any:
        # Numpy scalars -> python types
        try:
            if isinstance(val, (np.generic,)):
                val = val.item()
        except Exception:
            pass
        # Floats: replace NaN/Inf with None
        if isinstance(val, float):
            if not math.isfinite(val):
                return None
            return val
        # Int, bool, str fine
        if isinstance(val, (int, bool, str)):
            return val
        # Lists/Tuples
        if isinstance(val, (list, tuple)):
            out = []
            for x in val:
                out.append(_json_safe(x))
            return out
        # Dict
        if isinstance(val, dict):
            out: Dict[str, Any] = {}
            for k, v in val.items():
                try:
                    key = str(k)
                except Exception:
                    key = repr(k)
                out[key] = _json_safe(v)
            return out
        # Fallback: stringify
        try:
            return json.loads(json.dumps(val))
        except Exception:
            try:
                return str(val)
            except Exception:
                return None

    # Convert into defaults dict from whitelist (JSON-safe)
    defaults: Dict[str, Any] = {k: _json_safe(v["default"]) for k, v in schema.items()}

    # Auto-include additional uppercase constants that are JSON-serializable
    def is_jsonish(v: Any) -> bool:
        if isinstance(v, (str, int, float, bool)):
            return True
        if isinstance(v, (list, tuple)):
            return all(is_jsonish(x) for x in v)
        if isinstance(v, dict):
            try:
                return all(isinstance(k, (str, int, float, bool)) and is_jsonish(val) for k, val in v.items())
            except Exception:
                return False
        return False

    for key in dir(main):
        if not key or not key[0].isalpha():
            continue
        if not key.isupper():
            continue
        if key in defaults:
            continue
        val = getattr(main, key)
        if not is_jsonish(val):
            continue
        # Convert tuples to lists for JSON
        val = _json_safe(val)
        defaults[key] = val
    return defaults


def _get_schema() -> List[Dict[str, Any]]:
    main = _get_main_module()
    if not main:
        return []

    def type_of(val: Any) -> str:
        if isinstance(val, bool):
            return "bool"
        if isinstance(val, int) and not isinstance(val, bool):
            return "int"
        if isinstance(val, float):
            return "float"
        if isinstance(val, (list, tuple)):
            return "list"
        if isinstance(val, dict):
            return "dict"
        return "string"

    schema_list: List[Dict[str, Any]] = []
    EXCLUDED_KEYS = {"ADMIN_MODE"}
    defaults = _get_original_defaults()
    # Options by key
    OPTIONS: Dict[str, List[Any]] = {
        "DEFAULT_EXPORT_FORMAT": ["csv", "json", "fits"],
        "UVICORN_RELOAD_MODE": [True, False],
        "ENABLE_IN_MEMORY_FITS": [True, False],
        "ENABLE_PAGECACHE_WARMUP": [True, False],
        "IN_MEMORY_FITS_MODE": ["auto", "always", "never"],
        "WCS_LABEL_MODE": ["sexagesimal", "degrees"],
    }
    GROUPS: Dict[str, str] = {}
    # groups mirror _build_defaults_from_main grouping
    group_map = {
        "Web/API": [
            "UVICORN_HOST", "UVICORN_PORT", "UVICORN_RELOAD_MODE", "DEFAULT_EXPORT_FORMAT",
            "MAX_EXPORT_ROWS", "CATALOG_COLUMN_ANALYSIS_SAMPLE_SIZE", "SYSTEM_STATS_UPDATE_INTERVAL",
            "PROXY_DOWNLOAD_TIMEOUT", "FIND_FILES_TIMEOUT", "PEAK_FINDER_TIMEOUT"
        ],
        "Paths": [
            "CATALOGS_DIRECTORY", "UPLOADS_DIRECTORY", "CATALOG_MAPPINGS_FILE", "FILES_DIRECTORY",
            "BASE_FITS_PATH", "PSF_DIRECTORY", "BASE_PSF_PATH", "IMAGE_DIR", "STATIC_DIRECTORY", "KERNELS_DIRECTORY"
        ],
        "FITS/Tiles": ["DEFAULT_HDU_INDEX", "IMAGE_TILE_SIZE_PX", "DYNAMIC_RANGE_PERCENTILES"],
        "Algorithms": [
            "PEAK_FINDER_DEFAULTS", "SOURCE_PROPERTIES_SEARCH_RADIUS_ARCSEC", "MAX_POINTS_FOR_FULL_HISTOGRAM",
            "FITS_HISTOGRAM_DEFAULT_BINS", "CATALOG_ANALYSIS_HISTOGRAM_BINS", "RA_COLUMN_NAMES",
            "DEC_COLUMN_NAMES", "RGB_GALAXY_COLUMN_NAMES", "RGB_INVALID_GALAXY_NAMES",
            "CUTOUT_SIZE_ARCSEC", "RGB_PANEL_TYPE_DEFAULT"
        ],
        "WCS": [
            "WCS_ENABLE",
            "WCS_CATALOG_AUTO_CONVERT",
            "WCS_REFLECTION_FIX",
            "WCS_PREFER_CD",
            "WCS_LABEL_MODE",
            "WCS_AXIS_COLOR",
            "WCS_TICK_COLOR",
            "WCS_LABEL_TEXT_COLOR",
            "WCS_LABEL_BG_COLOR",
            "WCS_LABEL_BG_ALPHA",
        ],
        "Cache": ["TILE_CACHE_MAX_SIZE"],
        "Uploads": [
            "UPLOADS_AUTO_CLEAN_ENABLE",
            "UPLOADS_AUTO_CLEAN_INTERVAL_MINUTES"
        ],
        "I/O": [
            "ENABLE_IN_MEMORY_FITS", "IN_MEMORY_FITS_MAX_MB", "IN_MEMORY_FITS_RAM_FRACTION",
            "ENABLE_PAGECACHE_WARMUP", "PAGECACHE_WARMUP_CHUNK_ROWS", "IN_MEMORY_FITS_MODE",
            "RANDOM_READ_BENCH_SAMPLES", "RANDOM_READ_CHUNK_BYTES", "RANDOM_READ_THRESHOLD_MBPS"
        ],
    }
    for g, keys in group_map.items():
        for k in keys:
            GROUPS[k] = g

    # Prefix-based grouping for any additional constants picked up
    def auto_group(name: str) -> str:
        if name.startswith("UVICORN_"):
            return "Web/API"
        if name.startswith("CATALOG") or name.startswith("UPLOADS") or name.startswith("FILES_") or name.startswith("PSF_") or name in ("IMAGE_DIR", "STATIC_DIRECTORY", "KERNELS_DIRECTORY"):
            return "Paths"
        if name.startswith("DEFAULT_HDU") or name.startswith("IMAGE_TILE") or name == "DYNAMIC_RANGE_PERCENTILES":
            return "FITS/Tiles"
        if name.startswith("PEAK_FINDER") or name.startswith("SOURCE_PROPERTIES") or name.startswith("FITS_HISTOGRAM") or name.startswith("CATALOG_ANALYSIS") or name in ("RA_COLUMN_NAMES","DEC_COLUMN_NAMES","RGB_GALAXY_COLUMN_NAMES","RGB_INVALID_GALAXY_NAMES","CUTOUT_SIZE_ARCSEC","RGB_PANEL_TYPE_DEFAULT"):
            return "Algorithms"
        if name.startswith("TILE_CACHE"):
            return "Cache"
        if name.startswith("ENABLE_") or name.startswith("IN_MEMORY_") or name.startswith("PAGECACHE_") or name.startswith("RANDOM_READ_"):
            return "I/O"
        if name.startswith("RGB_"):
            return "RGB"
        if name.startswith("SED_") or name in ("CIRCLE_COLOR", "CIRCLE_LINEWIDTH", "SED_CUTOUT_CMAP"):
            return "SED"
        return "Misc"

    for key, default_val in defaults.items():
        if key in EXCLUDED_KEYS:
            continue
        schema_list.append({
            "name": key,
            "type": type_of(default_val),
            "group": GROUPS.get(key, auto_group(key)),
            "default": default_val,
            "options": OPTIONS.get(key),
        })
    # stable sort by group then name
    schema_list.sort(key=lambda x: (x["group"], x["name"]))
    return schema_list


def _apply_global_defaults_to_runtime(new_defaults: Dict[str, Any]) -> None:
    # No-op: runtime mutation of defaults by global profiles removed.
    return


@router.get("/schema")
async def get_schema():
    return {"schema": _get_schema()}


@router.get("/me")
async def get_me(request: Request):
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    return {"admin": is_admin}


@router.get("/profiles")
async def list_profiles(request: Request):
    store = _load_store()
    session_id = _get_session_id(request)
    profiles: List[Dict[str, Any]] = store.get("profiles", [])
    # Show all profiles (global view)
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    # Ensure admin profile exists when admin mode
    if is_admin:
        if not any(p.get("name") == "admin" for p in profiles):
            # Seed with defaults
            profiles.append({"name": "admin", "settings": _get_original_defaults(), "owner_session": None})
            store["profiles"] = profiles
            _save_store(store)
        # Only show a single default profile in admin mode
        visible = [{"name": "default", "owner_session": None, "locked": True}]
        # Force active to admin for this session
        store.setdefault("active_by_session", {})[session_id] = "admin"
        _save_store(store)
    else:
        # Ensure a non-editable default profile exists in non-admin mode
        if not any(p.get("name") == "default" for p in profiles):
            profiles.append({"name": "default", "settings": _get_original_defaults(), "owner_session": None})
            store["profiles"] = profiles
            _save_store(store)
        # Seed active session to default if not set
        active_by_session = store.setdefault("active_by_session", {})
        if not active_by_session.get(session_id):
            active_by_session[session_id] = "default"
            _save_store(store)
        visible = [{"name": p.get("name"), "owner_session": p.get("owner_session"), "locked": (p.get("name") == "default") } for p in profiles]
    # Active session profile
    active_by_session = store.get("active_by_session", {})
    active_name = active_by_session.get(session_id)
    return {"profiles": visible, "active": active_name}


@router.get("/profile/{name}")
async def get_profile(request: Request, name: str):
    store = _load_store()
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    lookup_name = "admin" if (is_admin and name.lower() == "default") else ("default" if (not is_admin and name.lower() == "default") else name)
    for p in store.get("profiles", []):
        if p.get("name") == lookup_name:
            return {"name": name, "settings": p.get("settings", {})}
    raise HTTPException(status_code=404, detail="Profile not found")


@router.post("/profile")
async def create_or_update_profile(request: Request, payload: CreateOrUpdateProfileRequest):
    store = _load_store()
    session_id = _get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=400, detail="No session")
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    # Upsert by name (global unique). If admin mode is enabled and name is 'admin', disallow edits (locked).
    prof_list = store.setdefault("profiles", [])
    # In admin mode, only the 'admin' (default) profile is editable and present
    if is_admin:
        payload.name = "admin"
    else:
        if payload.name == "default":
            raise HTTPException(status_code=403, detail="Default profile is read-only; create a new profile to customize")
    existing = None
    for p in prof_list:
        if p.get("name") == payload.name:
            existing = p
            break
    if existing is not None:
        existing["settings"] = payload.settings
    else:
        prof_list.append({
            "name": payload.name,
            "settings": payload.settings,
            "owner_session": session_id,
        })

    _save_store(store)
    # Apply to runtime/session caches if this profile is currently active
    try:
        active_name = (store.get("active_by_session", {}) or {}).get(session_id)
        if active_name == payload.name:
            _apply_effective_to_runtime(request)
            # Track last active for future sessions
            try:
                store["last_active_profile"] = payload.name
                _save_store(store)
            except Exception:
                pass
        # Notify front-end listeners that settings changed
        try:
            from fastapi import Response as _Resp
        except Exception:
            pass
    except Exception:
        pass
    return {"ok": True}


@router.delete("/profile/{name}")
async def delete_profile(request: Request, name: str):
    store = _load_store()
    session_id = _get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=400, detail="No session")
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    if is_admin:
        raise HTTPException(status_code=403, detail="Profile deletion disabled in admin mode")
    else:
        if name == "default":
            raise HTTPException(status_code=403, detail="Default profile cannot be deleted")
    prof_list = store.get("profiles", [])
    new_list = []
    removed = False
    for p in prof_list:
        if p.get("name") == name and not removed:
            removed = True
            continue
        new_list.append(p)
    if not removed:
        raise HTTPException(status_code=404, detail="Profile not found")
    store["profiles"] = new_list
    _save_store(store)
    return {"ok": True}


@router.get("/defaults")
async def get_defaults():
    # The baseline defaults from the running app
    return {"defaults": _get_original_defaults()}


@router.get("/effective")
async def get_effective(request: Request):
    store = _load_store()
    session_id = _get_session_id(request)
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False

    # Ensure baseline profiles exist (default and admin when admin mode)
    try:
        profiles = store.setdefault("profiles", [])
        if not any(p.get("name") == "default" for p in profiles):
            profiles.append({
                "name": "default",
                "settings": _get_original_defaults(),
                "owner_session": None,
            })
            _save_store(store)
        if is_admin and not any(p.get("name") == "admin" for p in profiles):
            profiles.append({
                "name": "admin",
                "settings": _get_original_defaults(),
                "owner_session": None,
            })
            _save_store(store)
    except Exception:
        pass

    # Ensure this session is mapped to a profile
    try:
        active_by_session = store.setdefault("active_by_session", {})
        if session_id and not active_by_session.get(session_id):
            names = {p.get("name") for p in (store.get("profiles") or [])}
            if is_admin and "admin" in names:
                active_by_session[session_id] = "admin"
            else:
                pref = store.get("last_active_profile") or "default"
                active_by_session[session_id] = pref if pref in names else "default"
            _save_store(store)
    except Exception:
        pass

    # Compute effective settings now that a mapping is guaranteed
    eff = _compute_effective_settings_for_session(session_id, store)
    active_name = (store.get("active_by_session", {}) or {}).get(session_id)

    # Apply effective settings to runtime immediately so the app reflects latest values
    try:
        _apply_effective_to_runtime(request)
    except Exception:
        pass
    return {"settings": eff, "active": active_name}


@router.post("/active")
async def set_active(request: Request, payload: SetActiveProfileRequest):
    store = _load_store()
    session_id = _get_session_id(request)
    if not session_id:
        raise HTTPException(status_code=400, detail="No session")
    if payload.name is None:
        main = _get_main_module()
        is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
        # Reset this session to defaults by binding to 'default' profile
        # Ensure default profile exists
        profiles = store.setdefault("profiles", [])
        if not any(p.get("name") == "default" for p in profiles):
            profiles.append({"name": "default", "settings": _get_original_defaults(), "owner_session": None})
        # Ensure admin profile exists (when admin mode)
        if is_admin and not any(p.get("name") == "admin" for p in profiles):
            profiles.append({"name": "admin", "settings": _get_original_defaults(), "owner_session": None})
        # Re-seed the target profile(s) with original defaults from main.py
        # so ALL parameters (including WCS) truly revert to hardcoded values
        if is_admin:
            for p in profiles:
                if p.get("name") == "admin":
                    p["settings"] = _get_original_defaults()
            store.setdefault("active_by_session", {})[session_id] = "admin"
            store["last_active_profile"] = "admin"
        else:
            for p in profiles:
                if p.get("name") == "default":
                    p["settings"] = _get_original_defaults()
            store.setdefault("active_by_session", {})[session_id] = "default"
            store["last_active_profile"] = "default"
        _save_store(store)
        try:
            _apply_effective_to_runtime(request)
        except Exception:
            pass
        # Let frontend listeners refresh
        try:
            pass
        except Exception:
            pass
        return {"ok": True}
    main = _get_main_module()
    is_admin = bool(getattr(main, "ADMIN_MODE", False)) if main else False
    if is_admin:
        # Force admin default
        store.setdefault("active_by_session", {})[session_id] = "admin"
    else:
        exists = any(p.get("name") == payload.name for p in store.get("profiles", []))
        if not exists:
            raise HTTPException(status_code=404, detail="Profile not found or access denied")
        store.setdefault("active_by_session", {})[session_id] = payload.name
    # Remember last active profile globally
    try:
        store["last_active_profile"] = payload.name
    except Exception:
        pass
    _save_store(store)
    # Apply to runtime/session caches immediately
    try:
        _apply_effective_to_runtime(request)
    except Exception:
        pass
    return {"ok": True}


