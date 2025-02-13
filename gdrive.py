import os
import json
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.service_account import Credentials
import logging

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
import os
import json

SCOPES = ["https://www.googleapis.com/auth/drive.file"]

CREDENTIALS_FILE = "/data/webapp-450712-abbef95ba2d2.json"  # Path where Railway stores uploaded secrets

import json

with open(CREDENTIALS_FILE, 'r') as file:
    credentials_json = json.load(file)

def authenticate_drive():
    creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def list_drive_files():
    service = authenticate_drive()
    results = service.files().list(pageSize=1000, fields="files(id, name, mimeType, parents)").execute()
    items = results.get("files", [])
    
    # Log all files and their details
    for item in items:
        logging.info(f"File: {item['name']}, ID: {item['id']}, Type: {item['mimeType']}, Parent: {item.get('parents', 'Root')}")

    return items



def upload_to_drive(file_path, file_name):
    service = authenticate_drive()
    file_metadata = {"name": file_name, "mimeType": "application/octet-stream"}
    media = MediaFileUpload(file_path, resumable=True)
    uploaded_file = service.files().create(body=file_metadata, media_body=media, fields="id").execute()

    return f"File uploaded successfully! Google Drive ID: {uploaded_file['id']}"
