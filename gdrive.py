import os
import json
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.service_account import Credentials
import io
import logging

SCOPES = ["https://www.googleapis.com/auth/drive.file"]

# Load credentials from Railway environment variable
CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS")
CREDENTIALS_DICT = json.loads(CREDENTIALS_JSON)  # Convert JSON string to dictionary

def authenticate_drive():
    creds = Credentials.from_service_account_info(CREDENTIALS_DICT, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)

def list_drive_files():
    service = authenticate_drive()
    results = service.files().list(pageSize=1000, fields="files(id, name, mimeType)").execute()
    items = results.get("files", [])
    for item in items:
        logging.info(f"File: {item['name']}, ID: {item['id']}, Type: {item['mimeType']}")
    return items

def download_file_from_drive(file_id):
    service = authenticate_drive()
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
        logging.info(f"Download {int(status.progress() * 100)}%.")
    fh.seek(0)
    return fh
