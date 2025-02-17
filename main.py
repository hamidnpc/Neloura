from fastapi import FastAPI, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from astropy.io import fits
import numpy as np
import logging
from gdrive import authenticate_drive, get_flow
import os

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def home():
    try:
        service = authenticate_drive()
        results = service.files().list(pageSize=10, fields="files(id, name)").execute()
        items = results.get('files', [])

        html_content = "<h1>Google Drive Files:</h1><ul>"
        for item in items:
            html_content += f"<li>{item['name']} ({item['id']})</li>"
        html_content += "</ul>"

        return html_content
    except Exception as e:
        return f"<h1>Error fetching files:</h1><p>{str(e)}</p>"

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




from fastapi import Response
import numpy as np
import matplotlib.pyplot as plt
from io import BytesIO
from astropy.io import fits

@app.get("/view-fits/{file_id}")
async def view_fits(file_id: str):
    try:
        # Authenticate and download the FITS file from Google Drive
        service = authenticate_drive()
        request = service.files().get_media(fileId=file_id)
        file_stream = BytesIO()
        request.execute(fd=file_stream)

        # Read FITS file with Astropy
        file_stream.seek(0)
        with fits.open(file_stream) as hdul:
            image_data = hdul[0].data

        # Normalize image data for visualization
        image_data = np.nan_to_num(image_data)  # Replace NaNs with 0
        image_data = (image_data - np.min(image_data)) / (np.max(image_data) - np.min(image_data)) * 255
        image_data = image_data.astype(np.uint8)

        # Convert to PNG
        fig, ax = plt.subplots()
        ax.imshow(image_data, cmap='gray', origin='lower')
        ax.axis('off')

        img_io = BytesIO()
        plt.savefig(img_io, format='png', bbox_inches='tight', pad_inches=0)
        img_io.seek(0)

        return Response(content=img_io.getvalue(), media_type="image/png")

    except Exception as e:
        return JSONResponse({"error": f"Failed to read FITS file: {str(e)}"}, status_code=500)

