import os
import json
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from fastapi import HTTPException

# Load credentials from Railway environment variable
CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS")
SCOPES = ["https://www.googleapis.com/auth/drive"]

def authenticate_drive():
    """Authenticate and return a Google Drive API service, or None if not authenticated."""
    token_path = "/data/token.json"
    
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        if creds and creds.valid:
            return build('drive', 'v3', credentials=creds)
    
    return None  # Instead of raising an error, return None

def get_flow():
    creds_data = json.loads(os.getenv('GOOGLE_OAUTH_CREDENTIALS'))
    return Flow.from_client_config(creds_data, SCOPES, redirect_uri="https://aseman-production.up.railway.app/oauth2callback")
