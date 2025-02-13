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


CREDENTIALS_DICT = {
  "type": "service_account",
  "project_id": "webapp-450712",
  "private_key_id": "5240068958080a00dc7ec892acf3082afdcf1f70",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCR8C4Zys/nFmlG\nMW5egjE0/wUi6OTlwXO5wzhhp6y/bxxrW5n5Ez7nU49C7TF09GjTvhMsCwKCv3RV\nd+AVRyaeZolsS10dt0ICBppRtiucdpxDMOw8hrllfdcuiVNoGMHrEQjfQDbNfOMN\npOuWJg3hCR66yxNCmTBdU1Yyx5lt5/5HQkBSE5B4x/b24vObOPUiaD2XaIDXLUv9\nCwge8A6xgrH+aZXUxJ7oh0R4Bi7BFfBgtN7E6+F469P6Asxnm3Yxhyt53RRGH1A5\noVHARiR+SbGyCQokdw4YFiYrGLoHBKs1bumxUT3vwq/StM3pKV8GEttAdsTqCgkr\nJmCKEJWzAgMBAAECggEAD24OtGu/mztrimA2lFJ9Q7uvk4HT6xY5l0tJ6PVSq/OM\n/y2HtDsx3EEhoAi2a8WzAamSmwZXpR2l/gAMgWNs9LQlqn1gt9VvlV7qWQ0C7mo8\nr6lQCOmRAjyRuu9fvLKwFMZPzambQb2xv026b5J6xtob1Xxxfwn1qvW2jZbnT3ne\nMVNl39e+V98LT6k8IlC2GQV08wcUKIYb1bgxIUAJqQmFwYv1/wJnsabNmOtRA469\nx8oWKQFvQ/MxSiHkJlIdoSNxqGEJXlaSzZETgEdnoAad7svCU6Y2K3BJeMBsLfa+\nbecYf/Z2ZTzLBiHwB5/Kbhqo5xXJA4nJoCfM+M8YVQKBgQDCBUxwiIZHsvTbmkkd\neLz+ZD/fsI920kbohx7YgW8fOvbvQVw/iJnxZxZFOT+7rWQVMw4+yfAlTqRuGPuW\noff33fjgHbOH0ei6TGX847gLV7e8G3WqeBpGl7APBrOhtTjBR8KOsXXxzIj7tX2m\n7E8czrDQlxZMKtKDbYhuqagCfQKBgQDAjsWyA0lu/Qf8wEo28q01fe61aD9joEnA\nfTGUuWwD7yQRsCAkAotpVVXCWecBxs1cm9t+196X+bD10wTr3H961PKjndNKbmPs\nsybvaLRNnyaOBX8tuHLBkPhoyjDVEJjb/p/CvuuoN2DUzqo/0zDq/6Kon9tDBdB4\nRresKbe/7wKBgHF/rAHAu9zBoV+917u338dpWbw/iw1VYUmxkafRv/GjCsVXlOFN\nxdBkH7ELFm9xtTR5k4HDnAoXATWuw66QvYBwh6CDf3yanOwuuRLBG+72t3MBFUpN\nzAEzxzhjET4txy+6DORwh7CVmCS3PPQjFPyjJOhBGjggbNmZf9BMyw35AoGBALvq\nWSpJJN/olWPm8EZBfCGo3U0yCDKcmXz9cGZ4sd4BAg00+ZjK1uybt86sV9GXBpDr\nFUDrQDLGHRk5ryLSk6H2sThVbH7FzkSP7V5UqyjZORH+cUfYKj2W0aXKM++qe9Kt\n4ZF3KpmGObxUVzdkTef4Q/AV2S/GO9U1BkhAii8HAoGACSW1EAXNtLS+sWoCAhqp\nbg9qJcN3B10GSZY0NwKEYjXnCSY4ul1DLhxzfTKwsTl7IyD2pjzaG2yWCb4W2Fav\n6gOoC8AJjMmB04jN2+odbGLsSGqBv+rNuKSrIhvGtNrF9+Jp8fw+YUCQaQiWTxvS\nRqeUqfbaUufXf3UB5qJsgoM=\n-----END PRIVATE KEY-----\n",
  "client_email": "aseman@webapp-450712.iam.gserviceaccount.com",
  "client_id": "115492359670944248112",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/aseman%40webapp-450712.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}

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
