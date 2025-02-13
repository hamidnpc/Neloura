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

json_hamid = os.getenv("hamid")

if json_hamid:
    CREDENTIALS_DICT = json.loads(json_hamid)
    SCOPES = ["https://www.googleapis.com/auth/drive"]
else:
    raise Exception("GOOGLE_CREDENTIALS not found")

def authenticate_drive():
    creds = Credentials.from_service_account_info(CREDENTIALS_DICT, scopes=SCOPES)
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
