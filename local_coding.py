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

router = APIRouter()

# Global dictionary to keep track of running processes
running_processes = {}

class CodeExecution(BaseModel):
    code: str
    execution_id: str

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
"""
    
    full_code = prelude + "\n" + execution.code
    
    plot_capture_suffix = """
import io, base64
if plt.get_fignums():
    fig = plt.gcf()
    buf = io.BytesIO()
    try:
        fig.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        print(f"__PLOT_START__\\n{img_base64}\\n__PLOT_END__")
    finally:
        plt.close(fig)
"""
    
    full_code_with_plotter = full_code + "\n" + plot_capture_suffix
    
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-c", full_code_with_plotter,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        running_processes[execution.execution_id] = process

        stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=60)
        
        stdout = stdout_bytes.decode('utf-8', errors='replace')
        stderr = stderr_bytes.decode('utf-8', errors='replace')
        image_data = None

        if "__PLOT_START__" in stdout:
            parts = stdout.split("__PLOT_START__\n")
            stdout_clean = parts[0]
            plot_part = parts[1]
            
            if "\n__PLOT_END__" in plot_part:
                img_base64 = plot_part.split("\n__PLOT_END__")[0]
                image_data = f"data:image/png;base64,{img_base64}"
                stdout_clean += plot_part.split("\n__PLOT_END__")[1]

            stdout = stdout_clean.strip()

        return {"stdout": stdout, "stderr": stderr, "image": image_data}
        
    except asyncio.TimeoutError:
        if process:
            process.terminate()
            await process.wait()
        return {"stdout": "", "stderr": "Execution timed out after 60 seconds."}
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
            process.terminate()
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