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


FITS_FILE_NAME = "PHANGS/Archive/JWST/v1p0p1/ngc0628/ngc0628_miri_lv3_f2100w_i2d_anchor.fits"  # Target file name

@app.get("/view-fits/")
async def view_fits():
    try:
        service = authenticate_drive()

        # Step 1: Find the file in Google Drive
        results = service.files().list(q=f"name='{FITS_FILE_NAME}'", fields="files(id, name)").execute()
        items = results.get('files', [])
        if not items:
            return JSONResponse({"error": f"File {FITS_FILE_NAME} not found in Google Drive"}, status_code=404)

        file_id = items[0]['id']  # Get the file ID

        # Step 2: Download the FITS file
        request = service.files().get_media(fileId=file_id)
        file_stream = BytesIO()
        request.execute(fd=file_stream)

        # Step 3: Read FITS file with Astropy
        file_stream.seek(0)
        with fits.open(file_stream) as hdul:
            image_data = hdul[0].data

        # Normalize image data for visualization
        image_data = np.nan_to_num(image_data)  # Replace NaNs with 0
        image_data = (image_data - np.min(image_data)) / (np.max(image_data) - np.min(image_data)) * 255
        image_data = image_data.astype(np.uint8)

        # Step 4: Convert to PNG for web display
        fig, ax = plt.subplots()
        ax.imshow(image_data, cmap='gray', origin='lower')
        ax.axis('off')

        img_io = BytesIO()
        plt.savefig(img_io, format='png', bbox_inches='tight', pad_inches=0)
        img_io.seek(0)

        return Response(content=img_io.getvalue(), media_type="image/png")

    except Exception as e:
        return JSONResponse({"error": f"Failed to read FITS file: {str(e)}"}, status_code=500)
