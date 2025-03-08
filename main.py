from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from astropy.io import fits
import numpy as np
import logging
import os
import io
import matplotlib.pyplot as plt
from gdrive import authenticate_drive, get_flow
from googleapiclient.http import MediaIoBaseDownload
from astropy.coordinates import SkyCoord
from astropy import units as u
from regions import PixCoord, CirclePixelRegion

# Environment Setup
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
logging.basicConfig(level=logging.INFO)

# FastAPI App
app = FastAPI()

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Caching Setup
CACHE_DIR = "/data/cache"
os.makedirs(CACHE_DIR, exist_ok=True)

cached_fits_data = None  # Store image data in memory
cached_fits_file = None  # Store the FITS file path
FITS_FILE_ID = None  # Cache the file ID for efficiency

# ------------------------------
# Google Drive Authentication
# ------------------------------
def get_drive_service():
    """Retrieve an authenticated Google Drive API service."""
    service = authenticate_drive()
    if service is None:
        return None
    return service

def get_fits_file_id():
    """Get the Google Drive file ID (cached for better performance)."""
    global FITS_FILE_ID
    if FITS_FILE_ID is None:
        service = get_drive_service()
        if service is None:
            return None  # Prevent errors if authentication is not completed
        
        folder_results = service.files().list(q="name='aseman' and mimeType='application/vnd.google-apps.folder'",
                                              supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        folders = folder_results.get('files', [])
        if not folders:
            return None

        folder_id = folders[0]['id']
        results = service.files().list(q=f"name='ngc0628_miri_lv3_f2100w_i2d_anchor.fits' and '{folder_id}' in parents",
                                       supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        files = results.get('files', [])
        if files:
            FITS_FILE_ID = files[0]['id']
    return FITS_FILE_ID

# ------------------------------
# Background Task: Cache FITS File
# ------------------------------
async def cache_fits_file():
    """Download the FITS file from Google Drive and store it in memory."""
    global cached_fits_data, cached_fits_file
    cached_fits_file = os.path.join(CACHE_DIR, "ngc0628_miri_lv3_f2100w_i2d_anchor.fits")

    # Ensure authentication before downloading
    service = get_drive_service()
    if service is None:
        logging.warning("Google Drive authentication is required before caching FITS file.")
        return

    file_id = get_fits_file_id()
    if not file_id:
        logging.error("FITS file ID not found!")
        return

    request = service.files().get_media(fileId=file_id)
    file_stream = io.BytesIO()
    downloader = MediaIoBaseDownload(file_stream, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
        logging.info(f"Download progress: {int(status.progress() * 100)}%")

    # Save to disk and memory
    file_stream.seek(0)
    with open(cached_fits_file, "wb") as f:
        f.write(file_stream.read())

    with fits.open(cached_fits_file) as hdul:
        cached_fits_data = hdul[1].data.astype(float)

# ------------------------------
# Routes
# ------------------------------

@app.get("/", response_class=HTMLResponse)
async def home():
    """Serve the home page."""
    with open("static/index.html", "r") as f:
        return f.read()

@app.get("/login")
async def login():
    """Start OAuth authentication."""
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt='consent')
    return RedirectResponse(auth_url)

@app.get("/oauth2callback")
async def oauth2callback(request: Request):
    """Handle OAuth callback and store authentication token."""
    try:
        flow = get_flow()
        flow.fetch_token(authorization_response=str(request.url))

        creds = flow.credentials
        os.makedirs("/data", exist_ok=True)
        with open("/data/token.json", "w") as token_file:
            token_file.write(creds.to_json())

        return {"message": "Authentication successful! You can now access Google Drive files."}

    except Exception as e:
        return {"error": f"Failed to authenticate: {str(e)}"}

@app.get("/view-fits/", response_class=HTMLResponse)
async def view_fits(background_tasks: BackgroundTasks):
    """Display the FITS file as an image."""
    global cached_fits_data

    # If authentication is not done, prevent errors
    service = get_drive_service()
    if service is None:
        return JSONResponse({"error": "Authentication required. Please visit /login to authenticate."}, status_code=401)

    if cached_fits_data is None:
        # Trigger background task to fetch data if not cached
        background_tasks.add_task(cache_fits_file)
        return JSONResponse({"error": "FITS file is being loaded, try again in a few seconds"}, status_code=503)

    # Convert NaN values to zero
    image_data = np.nan_to_num(cached_fits_data)

    # Create Matplotlib figure
    fig, ax = plt.subplots(figsize=(10, 10))  
    im = ax.imshow(image_data, cmap="gray", origin="lower", vmin=0, vmax=10)

    # Add a region
    region_pix = CirclePixelRegion(center=PixCoord(x=897, y=1300), radius=5)
    region_pix.plot(ax=ax, color='red', lw=1)

    plt.axis("off")  # Hide axes for better viewing

    # Save image as high-resolution PNG
    image_path = os.path.join(CACHE_DIR, "fits_image.png")
    plt.savefig(image_path, format="png", bbox_inches="tight", dpi=300)

    return FileResponse(image_path, media_type="image/png")

@app.get("/update-fits-cache/")
async def update_fits_cache(background_tasks: BackgroundTasks):
    """Manually update the FITS cache."""
    background_tasks.add_task(cache_fits_file)
    return {"message": "FITS file is being updated in the background."}
