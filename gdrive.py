import os
import json
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.service_account import Credentials
import io
import logging
import os
import json
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle


# Load credentials from Railway environment variable
CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS")
CREDENTIALS_DICT = json.loads(CREDENTIALS_JSON)  # Convert JSON string to dictionary


SCOPES = ["https://www.googleapis.com/auth/drive"]

def authenticate_drive():
    creds = None
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            creds_data = json.loads(os.getenv('GOOGLE_OAUTH_CREDENTIALS'))
            flow = InstalledAppFlow.from_client_config(creds_data, SCOPES)
            creds = flow.flow.run_console()
        
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)

    return build('drive', 'v3', credentials=creds)


def list_drive_files():
    service = authenticate_drive()
    results = service.files().list(
        pageSize=1000,
         corpora="user",
        fields="files(id, name, mimeType, parents)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()

    items = results.get("files", [])

    if items:
        logging.info("Google Drive Files (Including Shared Drives):")
        for item in items:
            logging.info(f"Name: {item['name']}, ID: {item['id']}, Type: {item['mimeType']}")
    else:
        logging.info("No files found in Google Drive.")
        
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

def upload_to_drive(file_path, file_name):
    service = authenticate_drive()
    file_metadata = {"name": file_name, "mimeType": "application/octet-stream"}
    media = MediaFileUpload(file_path, resumable=True)
    uploaded_file = service.files().create(body=file_metadata, media_body=media, fields="id").execute()

    return f"File uploaded successfully! Google Drive ID: {uploaded_file['id']}"


def list_drive_files():
    service = authenticate_drive()
    results = service.files().list(pageSize=1000, fields="files(id, name, mimeType)").execute()
    items = results.get("files", [])

    # Log all files to Railway logs
    if items:
        logging.info("Google Drive Files:")
        for item in items:
            logging.info(f"Name: {item['name']}, ID: {item['id']}, Type: {item['mimeType']}")
    else:
        logging.info("No files found in Google Drive.")
        
    return items

