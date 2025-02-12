from fastapi import FastAPI, UploadFile
from astropy.io import fits

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Welcome to the FITS Viewer!"}

@app.post("/upload/")
async def upload_fits(file: UploadFile):
    content = await file.read()
    with fits.open(file.file) as hdul:
        header = hdul[0].header
    return {"header": dict(header)}
