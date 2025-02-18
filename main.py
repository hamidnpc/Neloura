# from fastapi import FastAPI, UploadFile, Request, Response

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse

from fastapi.responses import HTMLResponse, JSONResponse


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

        # List all shared drives
        drives = service.drives().list().execute()
        logging.info(f"Shared Drives: {drives}")

        # Find PHANGS folder across all drives
        results = service.files().list(q="name='PHANGS' and mimeType='application/vnd.google-apps.folder'", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        folders = results.get('files', [])

        if not folders:
            return JSONResponse({"error": "PHANGS folder not found"}, status_code=404)

        folder_id = folders[0]['id']

        items = []
        page_token = None

        while True:
            files_result = service.files().list(q=f"'{folder_id}' in parents", supportsAllDrives=True, includeItemsFromAllDrives=True, pageSize=100, fields="nextPageToken, files(id, name, mimeType, parents, driveId)", pageToken=page_token).execute()
            items.extend(files_result.get('files', []))
            page_token = files_result.get('nextPageToken')
            if not page_token:
                break

        if not items:
            return JSONResponse({"error": "No items found in PHANGS folder"}, status_code=404)

        item_list = [{"name": item["name"], "id": item["id"], "type": item["mimeType"], "parents": item.get("parents", []), "driveId": item.get("driveId", "")} for item in items]
        for item in item_list:
            logging.info(f"Item: {item['name']} (ID: {item['id']}), Type: {item['type']}, Parents: {item['parents']}, Drive ID: {item['driveId']}")

        return JSONResponse({"items": item_list})
    except Exception as e:
        return JSONResponse({"error": f"Failed to list items: {str(e)}"}, status_code=500)

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

        # Ensure Railway's /data directory exists
        os.makedirs("/data", exist_ok=True)

        # Save token securely in Railway's /data storage
        with open("/data/token.json", "w") as token_file:
            token_file.write(creds.to_json())

        return {"message": "Authentication successful! You can now access Google Drive files."}

    except Exception as e:
        return {"error": f"Failed to authenticate: {str(e)}"}
