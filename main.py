# from fastapi import FastAPI, UploadFile, Request, Response

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse

from fastapi.responses import HTMLResponse, JSONResponse
from fastapi import Response
from bokeh.plotting import figure
from bokeh.resources import CDN
from bokeh.embed import file_html

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
        
@app.get("/login")
async def login():
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt='consent')
    return RedirectResponse(auth_url)
    
    
CACHE_DIR = "/data/cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def plot_with_buttons(image_data):
    fig, ax = plt.subplots()
    ax.imshow(image_data, cmap='gray', origin='lower', vmin=0, vmax=5)
    ax.set_title("FITS Image Viewer")

    def zoom_in(event):
        ax.set_xlim(ax.get_xlim()[0] + 10, ax.get_xlim()[1] - 10)
        ax.set_ylim(ax.get_ylim()[0] + 10, ax.get_ylim()[1] - 10)
        fig.canvas.draw()

    def zoom_out(event):
        ax.set_xlim(ax.get_xlim()[0] - 10, ax.get_xlim()[1] + 10)
        ax.set_ylim(ax.get_ylim()[0] - 10, ax.get_ylim()[1] + 10)
        fig.canvas.draw()

    def pan_left(event):
        ax.set_xlim(ax.get_xlim()[0] - 10, ax.get_xlim()[1] - 10)
        fig.canvas.draw()

    def pan_right(event):
        ax.set_xlim(ax.get_xlim()[0] + 10, ax.get_xlim()[1] + 10)
        fig.canvas.draw()

    zoom_in_button = Button(plt.axes([0.7, 0.05, 0.1, 0.075]), 'Zoom In')
    zoom_out_button = Button(plt.axes([0.81, 0.05, 0.1, 0.075]), 'Zoom Out')
    pan_left_button = Button(plt.axes([0.59, 0.05, 0.1, 0.075]), 'Left')
    pan_right_button = Button(plt.axes([0.92, 0.05, 0.1, 0.075]), 'Right')

    zoom_in_button.on_clicked(zoom_in)
    zoom_out_button.on_clicked(zoom_out)
    pan_left_button.on_clicked(pan_left)
    pan_right_button.on_clicked(pan_right)

    return fig
    
@app.get("/view-fits/")
async def view_fits():
    try:
        cached_file = os.path.join(CACHE_DIR, "ngc0628_miri_lv3_f2100w_i2d_anchor.fits")

        if not os.path.exists(cached_file):
            service = authenticate_drive()
            folder_results = service.files().list(q="name='aseman' and mimeType='application/vnd.google-apps.folder'", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
            folders = folder_results.get('files', [])
            if not folders:
                return JSONResponse({"error": "aseman folder not found"}, status_code=404)

            folder_id = folders[0]['id']
            results = service.files().list(q=f"name='ngc0628_miri_lv3_f2100w_i2d_anchor.fits' and '{folder_id}' in parents", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
            files = results.get('files', [])
            if not files:
                return JSONResponse({"error": "FITS file not found in aseman folder"}, status_code=404)

            file_id = files[0]['id']
            request = service.files().get_media(fileId=file_id)
            file_data = request.execute()
            with open(cached_file, 'wb') as f:
                f.write(file_data)

        with fits.open(cached_file) as hdul:
            image_data = hdul[1].data

        image_data = np.nan_to_num(image_data)
        fig = plot_with_buttons(image_data)

        canvas = FigureCanvas(fig)
        img_io = BytesIO()
        canvas.print_png(img_io)
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
