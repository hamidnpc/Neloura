from fastapi import FastAPI, UploadFile, Request, Response, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from astropy.io import fits
import numpy as np
import logging
import os
from io import BytesIO
import matplotlib.pyplot as plt
from gdrive import authenticate_drive, get_flow

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def home():
    with open("static/index.html", "r") as f:
        return f.read()

@app.get("/view-fits/")
async def view_fits():
    try:
        service = authenticate_drive()
        folder_name = ""

        # List all files inside PHANGS folder, including shared drives
        results = service.files().list(q=f"name contains '{folder_name}'", fields="files(id, name, mimeType, parents)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
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
