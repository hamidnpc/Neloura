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
from astropy.io import fits
import numpy as np
import matplotlib.pyplot as plt
from io import BytesIO

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


        
@app.get("/login")
async def login():
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt='consent')
    return RedirectResponse(auth_url)

@app.get("/view-fits/")
async def view_fits():
    try:
        service = authenticate_drive()

        # Find the 'aseman/ngc0628_miri_lv3_f2100w_i2d_anchor.fits' file
        results = service.files().list(q="name='ngc0628_miri_lv3_f2100w_i2d_anchor.fits' and 'aseman' in parents", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        files = results.get('files', [])

        if not files:
            return JSONResponse({"error": "FITS file not found in aseman folder"}, status_code=404)

        file_id = files[0]['id']

        # Download and read FITS file with astropy
        request = service.files().get_media(fileId=file_id)
        file_stream = BytesIO()
        request.execute(fd=file_stream)
        file_stream.seek(0)
        with fits.open(file_stream) as hdul:
            image_data = hdul[1].data  # Read HDU[1]

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
