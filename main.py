from fastapi import FastAPI, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from astropy.io import fits
import numpy as np
import logging
from gdrive import upload_to_drive, list_drive_files
from fastapi import FastAPI, HTTPException  # Add HTTPException here
import os
import json
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.service_account import Credentials
import io
import logging

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




SCOPES = ["https://www.googleapis.com/auth/drive.file"]

# Load credentials from Railway environment variable
CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS")
CREDENTIALS_DICT = json.loads(CREDENTIALS_JSON)  # Convert JSON string to dictionary

def authenticate_drive():
    creds = Credentials.from_service_account_info(CREDENTIALS_DICT, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


@app.get("/list-files/")
async def list_files():
    """List Google Drive files and print them in Railway logs."""
    try:
        service = authenticate_drive()
        results = service.files().list(pageSize=10, fields="files(id, name)").execute()
        items = results.get('files', [])

        if items:
            logging.info("Google Drive Files:")
            for item in items:
                logging.info(f"{item['name']} ({item['id']})")
        else:
            logging.info("No files found in Google Drive.")

        return {"files": items}
    
    except Exception as e:
        logging.error(f"Error fetching files: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch files from Google Drive")

