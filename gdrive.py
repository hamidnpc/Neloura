import os
import json
import io
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.service_account import Credentials
import logging
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from fastapi import HTTPException
from fastapi import HTTPException


# Load credentials from Railway environment variable
CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS")
CREDENTIALS_DICT = json.loads(CREDENTIALS_JSON)  # Convert JSON string to dictionary


SCOPES = ["https://www.googleapis.com/auth/drive"]

from google_auth_oauthlib.flow import Flow


from google.oauth2.credentials import Credentials

def authenticate_drive():
    creds = None
    token_path = "/data/token.json"
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if not creds or not creds.valid:
        raise HTTPException(status_code=401, detail="Authentication required. Please visit /login to authenticate.")
    return build('drive', 'v3', credentials=creds)

def get_flow():
    creds_data = json.loads(os.getenv('GOOGLE_OAUTH_CREDENTIALS'))
    return Flow.from_client_config(creds_data, SCOPES, redirect_uri="https://aseman-production.up.railway.app/oauth2callback")


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

