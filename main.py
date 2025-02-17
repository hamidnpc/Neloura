from fastapi import FastAPI, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from astropy.io import fits
import numpy as np
import logging
from gdrive import upload_to_drive, list_drive_files

import logging
logging.basicConfig(level=logging.INFO)


logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html", "r") as f:
        return f.read()

@app.post("/upload/")
async def upload_fits(file: UploadFile):
    with fits.open(file.file) as hdul:
        data = hdul[0].data
        if data is not None:
            data = data.tolist()  # Convert NumPy array to list for JSON
        header = dict(hdul[0].header)
    return JSONResponse({"header": header, "data": data})


from gdrive import upload_to_drive, list_drive_files

@app.get("/list-files/")
async def list_files():
    files = list_drive_files()
    return {"files": files}

