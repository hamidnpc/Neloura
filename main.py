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

FOLDER_PATH = "PHANGS/Archive/JWST/v1p0p1/ngc0628"
FITS_FILE_NAME = "ngc0628_miri_lv3_f2100w_i2d_anchor.fits"

@app.get("/view-fits/")
async def view_fits():
    try:
        service = authenticate_drive()

        # List all files in the specified folder
        results = service.files().list(q=f"name contains 'ngc0628' and '{FOLDER_PATH}' in parents", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        items = results.get('files', [])

        if not items:
            return JSONResponse({"error": f"No files found in {FOLDER_PATH}"}, status_code=404)

        file_list = [{"name": item["name"], "id": item["id"], "type": item["mimeType"]} for item in items]
        for item in file_list:
            logging.info(f"File: {item['name']} (ID: {item['id']}), Type: {item['type']}")

        # Find and display the specific FITS file
        target_file = next((item for item in items if item['name'] == FITS_FILE_NAME), None)
        if not target_file:
            return JSONResponse({"error": f"File {FITS_FILE_NAME} not found"}, status_code=404)

        request = service.files().get_media(fileId=target_file['id'])
        file_stream = BytesIO()
        request.execute(fd=file_stream)

        file_stream.seek(0)
        with fits.open(file_stream) as hdul:
            image_data = hdul[0].data

        image_data = np.nan_to_num(image_data)
        image_data = (image_data - np.min(image_data)) / (np.max(image_data) - np.min(image_data)) * 255
        image_data = image_data.astype(np.uint8)

        fig, ax = plt.subplots()
        ax.imshow(image_data, cmap='gray', origin='lower')
        ax.axis('off')

        img_io = BytesIO()
        plt.savefig(img_io, format='png', bbox_inches='tight', pad_inches=0)
        img_io.seek(0)

        return Response(content=img_io.getvalue(), media_type="image/png")
    except Exception as e:
        return JSONResponse({"error": f"Failed to display FITS file: {str(e)}"}, status_code=500)

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
