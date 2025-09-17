from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import subprocess
import sys
import base64
from io import BytesIO
import asyncio
import uuid
import os
from pathlib import Path
from fastapi import Query
import signal

router = APIRouter()

# Global dictionary to keep track of running processes
running_processes = {}

# Derive directories from main.py if available; fallbacks provided
try:
    FILES_DIR_DEFAULT = getattr(sys.modules.get('main'), 'FILES_DIRECTORY', 'files')
    UPLOADS_DIR_DEFAULT = getattr(sys.modules.get('main'), 'UPLOADS_DIRECTORY', FILES_DIR_DEFAULT + '/uploads')
except Exception:
    FILES_DIR_DEFAULT = 'files'
    UPLOADS_DIR_DEFAULT = FILES_DIR_DEFAULT + '/uploads'

class CodeExecution(BaseModel):
    code: str
    execution_id: str
    timeout: int | None = 60

class StopExecution(BaseModel):
    execution_id: str

@router.post("/run")
async def run_code(execution: CodeExecution):
    """
    Executes Python code in a separate process that can be terminated.
    """
    
    prelude = """
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.table import Table
import astropy.units as u
from astropy.coordinates import SkyCoord
import matplotlib
matplotlib.use('Agg') # Use non-interactive backend
import matplotlib.pyplot as plt
import warnings
# Suppress non-interactive backend show() warnings and make plt.show() a no-op
warnings.filterwarnings('ignore', message='.*FigureCanvasAgg is non-interactive.*')
def _local_show(*args, **kwargs):
    pass
plt.show = _local_show
# Capture Plotly shows inline (instead of opening new tabs)
try:
    import plotly.io as _pio
    from plotly.io import to_html as _plotly_to_html
    def _plotly_show(fig, *args, **kwargs):
        try:
            _html = _plotly_to_html(fig, include_plotlyjs='inline', full_html=False)
            print("__PLOTLY_START__")
            print(_html)
            print("__PLOTLY_END__")
        except Exception as _e:
            print(f"__PLOTLY_ERROR__{_e}")
    _pio.show = _plotly_show
    try:
        import plotly.offline as _po
        def _offline_plot(fig, *args, **kwargs):
            try:
                include_js = kwargs.get('include_plotlyjs', 'inline') if isinstance(kwargs, dict) else 'inline'
            except Exception:
                include_js = 'cdn'
            try:
                _html = _plotly_to_html(fig, include_plotlyjs=include_js, full_html=False)
                print("__PLOTLY_START__")
                print(_html)
                print("__PLOTLY_END__")
            except Exception as _e:
                print(f"__PLOTLY_ERROR__{_e}")
            return None
        _po.plot = _offline_plot
    except Exception:
        pass
except Exception:
    pass
import os as _os
import uuid as _uuid
from astropy.io import fits as _fits
from astropy.io.fits import Header as _FitsHeader

# Helper to open an image in the main viewer from either a filepath or raw data/header
def open_image(data=None, header=None, hdu_index=0, filepath=None, name_prefix='local'):
    try:
        if filepath is None:
            if data is None:
                print('[ERROR] open_image requires either filepath or data')
                return
            base_dir = UPLOADS_DIR
            unique = _uuid.uuid4().hex
            filepath = _os.path.join(base_dir, f"{name_prefix}_{unique}.fits")
            # Coerce header if given as dict-like
            hdr = None
            if header is not None:
                if isinstance(header, _FitsHeader):
                    hdr = header
                else:
                    try:
                        hdr = _FitsHeader(header)
                    except Exception:
                        hdr = None
            hdu = _fits.PrimaryHDU(data=data, header=hdr)
            _fits.HDUList([hdu]).writeto(filepath, overwrite=True)
            hdu_index = 0
        # Emit magic for the UI to consume using path RELATIVE to 'files/'
        try:
            rel_path = filepath
            prefix = FILES_DIR + _os.sep
            if filepath.startswith(prefix):
                rel_path = filepath[len(prefix):]
            elif filepath.startswith(FILES_DIR + '/'):
                rel_path = filepath[len(FILES_DIR) + 1:]
        except Exception:
            rel_path = filepath
        print(f"__OPEN_IMAGE__({repr(rel_path)},{hdu_index})")
    except Exception as _e:
        print(f"[ERROR] open_image failed: {_e}")

# Helper to open a catalog viewer by name (e.g., 'catalogs/your_catalog.fits' or API name)
def open_catalog(catalog_name=None):
    try:
        if not catalog_name:
            print('[ERROR] open_catalog requires catalog_name')
            return
        print(f"__OPEN_CATALOG__({repr(catalog_name)})")
    except Exception as _e:
        print(f"[ERROR] open_catalog failed: {_e}")
"""
    
    # Inject runtime-configured files dir constant into the executed environment
    files_dir_decl = f"FILES_DIR = {repr(FILES_DIR_DEFAULT)}\n"
    uploads_dir_decl = f"UPLOADS_DIR = {repr(UPLOADS_DIR_DEFAULT)}\n"
    full_code = files_dir_decl + uploads_dir_decl + prelude + "\n" + execution.code
    
    plot_capture_suffix = """
import io, base64
# Capture and emit ALL open Matplotlib figures, if any
try:
    import mpld3  # type: ignore
    _mpld3_available = True
except Exception:
    _mpld3_available = False

fig_nums = plt.get_fignums()
for _num in fig_nums:
    _fig = plt.figure(_num)
    _buf = io.BytesIO()
    try:
        _fig.savefig(_buf, format='png', bbox_inches='tight')
        _buf.seek(0)
        _img_base64 = base64.b64encode(_buf.read()).decode('utf-8')
        # Use escaped newlines so the generated code remains a single-line string literal
        print(f"__PLOT_START__\\n{_img_base64}\\n__PLOT_END__")
        if _mpld3_available:
            try:
                _html = mpld3.fig_to_html(_fig)
                print("__MPLD3_START__")
                print(_html)
                print("__MPLD3_END__")
            except Exception:
                pass
    finally:
        plt.close(_fig)
"""
    
    full_code_with_plotter = full_code + "\n" + plot_capture_suffix
    
    process = None
    try:
        # Start subprocess in its own process group so we can terminate children
        preexec = os.setsid if hasattr(os, "setsid") else None
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-c", full_code_with_plotter,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            preexec_fn=preexec
        )
        running_processes[execution.execution_id] = process

        timeout_seconds = execution.timeout if execution.timeout and execution.timeout > 0 else 60
        stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=timeout_seconds)
        
        stdout = stdout_bytes.decode('utf-8', errors='replace')
        stderr = stderr_bytes.decode('utf-8', errors='replace')
        images = []
        plots_html = []
        stdout_clean = stdout
        # Extract all embedded images
        start_token = "__PLOT_START__\n"
        end_token = "\n__PLOT_END__"
        while start_token in stdout_clean:
            pre, rest = stdout_clean.split(start_token, 1)
            if end_token in rest:
                img_b64, rest_after = rest.split(end_token, 1)
                images.append(f"data:image/png;base64,{img_b64}")
                stdout_clean = pre + rest_after
            else:
                # Malformed block; break to avoid infinite loop
                break

        # Extract mpld3 HTML blocks
        html_start = "__MPLD3_START__"
        html_end = "__MPLD3_END__"
        while html_start in stdout_clean:
            pre, rest = stdout_clean.split(html_start, 1)
            if html_end in rest:
                html_content, rest_after = rest.split(html_end, 1)
                plots_html.append(html_content.lstrip("\n"))
                stdout_clean = pre + rest_after
            else:
                break

        # Extract Plotly HTML blocks
        p_start = "__PLOTLY_START__"
        p_end = "__PLOTLY_END__"
        while p_start in stdout_clean:
            pre, rest = stdout_clean.split(p_start, 1)
            if p_end in rest:
                html_content, rest_after = rest.split(p_end, 1)
                plots_html.append(html_content.lstrip("\n"))
                stdout_clean = pre + rest_after
            else:
                break

        stdout = stdout_clean.strip()

        first_image = images[0] if images else None
        return {"stdout": stdout, "stderr": stderr, "image": first_image, "images": images, "plots_html": plots_html}
        
    except asyncio.TimeoutError:
        if process:
            try:
                # Try graceful termination of process group first
                if hasattr(os, "killpg") and process.pid:
                    os.killpg(process.pid, signal.SIGTERM)
                else:
                    process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=2)
                except asyncio.TimeoutError:
                    if hasattr(os, "killpg") and process.pid:
                        os.killpg(process.pid, signal.SIGKILL)
                    else:
                        process.kill()
                    await process.wait()
            except Exception:
                pass
        return {"stdout": "", "stderr": f"Execution timed out after {execution.timeout or 60} seconds."}
    except Exception as e:
        return {"stdout": "", "stderr": f"An unexpected error occurred: {str(e)}"}
    finally:
        if execution.execution_id in running_processes:
            del running_processes[execution.execution_id]


@router.post("/stop")
async def stop_code(stop_request: StopExecution):
    """Stops a running code execution."""
    execution_id = stop_request.execution_id
    if execution_id in running_processes:
        process = running_processes[execution_id]
        try:
            # Attempt graceful stop of process group first
            if hasattr(os, "killpg") and process.pid:
                os.killpg(process.pid, signal.SIGTERM)
            else:
                process.terminate()
            try:
                # Wait a short grace period
                loop = asyncio.get_event_loop()
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                if hasattr(os, "killpg") and process.pid:
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
                await process.wait()
            del running_processes[execution_id]
            return {"status": "success", "message": "Execution stopped."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to stop process: {e}")
    else:
        raise HTTPException(status_code=404, detail="Execution not found or already completed.")


@router.get("/autocomplete-paths/")
async def autocomplete_paths(partial_path: str = Query("")):
    """Provides a list of files and directories for path autocompletion."""
    try:
        if ".." in partial_path:
            return []

        # Determine the base directory and search term from the partial path
        if partial_path.endswith('/'):
            base_dir = Path(partial_path)
            search_term = ""
        else:
            base_dir = Path(os.path.dirname(partial_path))
            search_term = os.path.basename(partial_path)

        # Fallback to root if the path does not exist
        if not base_dir.is_dir():
            base_dir = Path('.')
            search_term = partial_path

        completions = []
        for p in base_dir.iterdir():
            if p.name.lower().startswith(search_term.lower()):
                # Use os.path.join to construct the path with correct separators
                full_path = os.path.join(str(base_dir), p.name)
                if p.is_dir():
                    completions.append(f"{full_path}/")
                else:
                    completions.append(full_path)
        
        return sorted(completions)[:50]

    except Exception as e:
        print(f"Error during path autocompletion: {e}")
        return [] 