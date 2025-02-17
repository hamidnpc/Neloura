from fastapi import FastAPI, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from astropy.io import fits
import numpy as np
import logging
from gdrive import authenticate_drive, get_flow
import os

from fastapi import Response
import numpy as np
import matplotlib.pyplot as plt
from io import BytesIO
from astropy.io import fits

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def home():
    with open("static/index.html", "r") as f:
        return f.read()


@app.post("/upload/")
async def upload_fits(file: UploadFile):
    with fits.open(file.file) as hdul:
        data = hdul[0].data
        if data is not None:
            data = data.tolist()
        header = dict(hdul[0].header)
    return JSONResponse({"header": header, "data": data})

@app.get("/login")
async def login():
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt='consent')
    return RedirectResponse(auth_url)

@app.get("/oauth2callback")
async def oauth2callback(request: Request):
    try:
        flow = get_flow()
        flow.fetch_token(authorization_response=str(request.url))
        creds = flow.credentials
        os.makedirs("/data", exist_ok=True)
        with open("/data/token.json", "w") as token_file:
            token_file.write(creds.to_json())
        return {"message": "Authentication successful!"}
    except Exception as e:
        return {"error": f"Failed to authenticate: {str(e)}"}


FITS_FILE_NAME = "PHANGS/Archive/JWST/v1p1p1/ngc0628/ngc0628_miri_lv3_f2100w_i2d_anchor.fits"  # Target file name

@app.get("/view-fits/")
async def view_fits():
    try:
        service = authenticate_drive()
        folder_name = "PHANGS"

        # Step 1: List all files inside PHANGS folder
        results = service.files().list(q=f"name contains '{folder_name}'", fields="files(id, name, mimeType, parents)").execute()
        items = results.get('files', [])

        if not items:
            return JSONResponse({"error": f"No files found in folder: {folder_name}"}, status_code=404)

        # Log and return all files in PHANGS folder
        file_list = []
        for item in items:
            file_list.append({"name": item["name"], "id": item["id"], "type": item["mimeType"]})
            logging.info(f"File: {item['name']} (ID: {item['id']}), Type: {item['mimeType']}")

        return JSONResponse({"files": file_list})
    
    except Exception as e:
        return JSONResponse({"error": f"Failed to list files: {str(e)}"}, status_code=500)
