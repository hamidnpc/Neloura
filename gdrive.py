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