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

CREDENTIALS_DICT={
  "type": "service_account",
  "project_id": "webapp-450712",
  "private_key_id": "b84650d945bc1070310c9dfc1dbdfd280c10b856",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDEI6XOVzk+ZGae\ntefRHvFRjOhyO86F1bH3wafgdrED4ZXa7ULts9OsPW90zLs9AyVx5YnXHddlru8c\n7wlnFNyFztcxHLeqWleO5kEH/e7CjLZe8DZaCoGdAwtQ8c5EpjFlDKAVg777fwZa\nlVXIxRYk+7w/jwCuq+kUfLh2zk5hd0jlMxE/m/OMKKFYW+F9qM2CJ0p+tMHuWg3l\nPS63X+rVDeDSRdIIssNjemGieYW7oopCClqp/Rlsp01Y2NT7TkjWMGMDH0CiBTWH\nyyLvE/sWEsgoUmfN8QQnObCCQnDD1m2TjSFATD4WBfDG5g/E1KpAwyK+sPn+FgEC\nrk+3wwDtAgMBAAECggEADWWC6mpGOGb6pF330K58nI2ThdPkafs7zdiOCxSISCPV\nDLA2aU5mR4YlsfRW2Ja5rMMZDFaXMvSFE/SWr5H68u+6/nl/6PSFNPcwm2dicqrS\nPP9KsxEzI6KE2Bk/9avlRUncuEN4nKxjJnY7NvyRI+MGy0+M5CFNSO8w2TqDm3//\noAx7GWG5eMo0eVKmdx6BS/2bzA3qbLbMMxw152i7S5pBKo10lNfw0e9olRdYYI6q\n7+u8T+bCwVN8DQaCwnKxa6sSR9mmi31uz/8u+MydUJ1U34c29MCTyd+t5gVtAQns\nVXmwxLzbkEAgi/Piaig0UwR6W0pUPqcpAr5GnktDYQKBgQD+oL8Z2kyYFrJqkW5O\nJtyBl3M/aZDx/dYwaQYnpaWMsLCh+MTxtY2UXDPT1iwrmW3eedaa9uYR6zY7SpJc\n9W7JznEMT3D85j6xjoslWpyUDwKfxh/i70bjqMhmqTQZflc2pi0i+yX6o5Aglqt0\n35pZLKEZ79dwZ8Fs+tf1oJodIQKBgQDFMjemeo1YmTXNWCgi/Jwlkhd3m2IJd0lg\n1+HtT/GaL//sZ+pqAjgXFj8akrNweOAvs6HXik8NkBjurscLv7s3WYCEgHhpRWum\nl6PRmexWL6VXKMmA4fN8aqC2bWPllA10hwfggaZpIS5obPDZ1NmjCNld0iulo+sq\nlzoHatJ+TQKBgDV6BSik1FlMywPer0/ykXUWHbo/rZVlPkrEg+pnu7EkmrQpzxME\nkkuKYcgnvvcZLh3/cLbzC7bPs4AYVUz4rt/rX4q6VHyIzrnzuf2KXkAqNt7feWrr\n3fOKSyxkdPC1vBNaKzihjoRpPafafP/6xivcV6le2dxdrh35QMnxhOyBAoGAcH9x\nmBwaPw1I0FkWrL8IJbbuhGG00EmpJwKB9WzCHIB9tFSkOs4BScp7PaGrlOKgoxYL\nondZGhe24ZP8IgvDtpPs6aqRBx1/iI7B+nWhipmr7clrC4fb7IK4JNrLPtHzyyKt\nr7rHQPqZCyH7VYpEjuohd5DLLbgSFT4o8MpUQ5ECgYAE6UZeRlZuBGQhF1NcQHwY\n7UbSlVnihKMG7Oann5Mu3sDC6SUf6dBRZoVz4kGzOLbxZOj98aIEiobqHfVgmdKc\nwaXoeyGfpcBW90Z2GX2hDcp0kFxLebPidI47yrz1U2wut6JotQ8mdxoKQDEhRZqW\n6uGYvhZz3mh/QTq1itJXqQ==\n-----END PRIVATE KEY-----\n",
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
