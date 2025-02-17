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
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from gdrive import authenticate_drive, get_flow
import json
import os


from gdrive import authenticate_drive

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



from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import RedirectResponse
from gdrive import authenticate_drive, get_flow
import json
import os

app = FastAPI()

@app.get("/login")
async def login():
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt='consent')
    return RedirectResponse(auth_url)

@app.get("/oauth2callback")
async def oauth2callback(request: Request):
    flow = get_flow()
    flow.fetch_token(authorization_response=str(request.url))

    creds = flow.credentials
    with open("/data/token.json", "w") as token:
        token.write(creds.to_json())

    return {"message": "Authentication successful! You can now access Google Drive files."}

@app.get("/list-files/")
async def list_files():
    service = authenticate_drive()
    results = service.files().list(pageSize=10, fields="files(id, name)").execute()
    items = results.get('files', [])
    for item in items:
        print(f"{item['name']} ({item['id']})")
    return {"files": items}
