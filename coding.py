import httpx
from fastapi import APIRouter, HTTPException, Body
from typing import Optional
import os
import glob
import json
import base64
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()

CERTIFICATE_PATH = None

SKAHA_API_URL = "https://ws-uv.canfar.net/skaha/v0"

def find_certificate() -> Optional[str]:
    """
    Finds a unique .pem file in the 'files/' directory.
    Caches the path in a global variable to avoid repeated scans.
    """
    global CERTIFICATE_PATH
    if CERTIFICATE_PATH is not None:
        return CERTIFICATE_PATH

    search_path = os.path.join("files", "*.pem")
    pem_files = glob.glob(search_path)

    if len(pem_files) == 1:
        CERTIFICATE_PATH = pem_files[0]
        print(f"Found certificate: {CERTIFICATE_PATH}")
        return CERTIFICATE_PATH
    elif len(pem_files) > 1:
        print(f"Error: Found multiple .pem files in 'files/'. Please ensure only one exists. Files found: {pem_files}")
        CERTIFICATE_PATH = "ambiguous" # Set a specific state to avoid re-scanning
        return None
    else:
        print("Error: No .pem certificate file found in 'files/' directory.")
        return None

def get_api_client() -> httpx.AsyncClient:
    """
    Returns an httpx.AsyncClient configured with the certificate.
    Raises a 401 HTTPException if the certificate is not found or is ambiguous.
    """
    cert_path = find_certificate()
    if cert_path is None:
        if CERTIFICATE_PATH == "ambiguous":
             raise HTTPException(status_code=401, detail="Ambiguous credentials: More than one .pem file found in 'files/'.")
        else:
             raise HTTPException(status_code=401, detail="Certificate not found in 'files/' directory.")
    
    return httpx.AsyncClient(cert=cert_path, timeout=30.0)

@router.get("/images")
async def list_images(image_type: Optional[str] = None):
    """Lists available images from the Skaha API using the client certificate."""
    async with get_api_client() as client:
        try:
            params = {}
            if image_type:
                params['type'] = image_type
            response = await client.get(f"{SKAHA_API_URL}/image", params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.get("/context")
async def get_context():
    """Gets available CPU/RAM contexts from the Skaha API using the client certificate."""
    async with get_api_client() as client:
        try:
            response = await client.get(f"{SKAHA_API_URL}/context")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.get("/sessions")
async def list_sessions(status: Optional[str] = None):
    """Lists user sessions from the Skaha API using the client certificate."""
    async with get_api_client() as client:
        try:
            params = {}
            if status:
                params['status'] = status
            response = await client.get(f"{SKAHA_API_URL}/session", params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.get("/sessions/{session_id}")
async def get_session_details(session_id: str, view: Optional[str] = None):
    """
    Gets details for a specific session.
    Can also fetch logs or events by setting the 'view' parameter.
    """
    params = {}
    if view:
        params['view'] = view

    async with get_api_client() as client:
        try:
            response = await client.get(f"{SKAHA_API_URL}/session/{session_id}", params=params)
            response.raise_for_status()
            
            # Handle different views based on content type
            if view == 'logs':
                return Response(content=response.text, media_type="text/plain")
            
            # If the response is not logs, it should be JSON.
            # Handle empty responses to avoid JSON decoding errors.
            if not response.content:
                # Return a default structure if the response is empty
                return {"items": []} if view == 'events' else {}

            try:
                return response.json()
            except json.JSONDecodeError:
                print(f"Warning: Could not decode JSON for session {session_id}, view: {view}")
                return {"items": []} if view == 'events' else {}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.post("/sessions/{session_id}/renew")
async def renew_session(session_id: str):
    """Renews a specific session."""
    async with get_api_client() as client:
        try:
            # The action is passed as a query parameter
            response = await client.post(f"{SKAHA_API_URL}/session/{session_id}", params={"action": "renew"})
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.get("/repository")
async def get_repository_info():
    """Gets the list of image repository hosts."""
    async with get_api_client() as client:
        try:
            response = await client.get(f"{SKAHA_API_URL}/repository")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.get("/sessions/{session_id}/apps")
async def list_desktop_apps(session_id: str):
    """Lists attached desktop apps for a given session."""
    async with get_api_client() as client:
        try:
            response = await client.get(f"{SKAHA_API_URL}/session/{session_id}/app")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

class AppDetails(BaseModel):
    image: str
    cores: str
    ram: str

@router.post("/sessions/{session_id}/apps")
async def attach_desktop_app(session_id: str, details: AppDetails):
    """Attaches a new desktop app to a session."""
    async with get_api_client() as client:
        try:
            app_details_dict = details.model_dump()
            response = await client.post(f"{SKAHA_API_URL}/session/{session_id}/app", data=app_details_dict)
            response.raise_for_status()
            try:
                return response.json()
            except json.JSONDecodeError:
                return {"id": response.text}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.delete("/sessions/{session_id}/apps/{app_id}")
async def delete_desktop_app(session_id: str, app_id: str):
    """Deletes a desktop app from a session."""
    async with get_api_client() as client:
        try:
            response = await client.delete(f"{SKAHA_API_URL}/session/{session_id}/app/{app_id}")
            response.raise_for_status()
            if response.status_code == 200 and not response.text:
                return {"status": "success", "message": f"App {app_id} deleted."}
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.get("/sessions/{session_id}/apps/{app_id}")
async def get_desktop_app_details(session_id: str, app_id: str):
    """Gets details for a specific desktop app."""
    async with get_api_client() as client:
        try:
            response = await client.get(f"{SKAHA_API_URL}/session/{session_id}/app/{app_id}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

class SessionDetails(BaseModel):
    name: str
    image: str
    cores: str
    ram: str
    type: str
    cmd: Optional[str] = None
    args: Optional[str] = None
    env: Optional[str] = None
    registry_username: Optional[str] = None
    registry_password: Optional[str] = None

@router.post("/sessions")
async def create_session(details: SessionDetails):
    """Creates a new session in Skaha using the client certificate."""
    async with get_api_client() as client:
        try:
            session_details_dict = details.model_dump(exclude_none=True)
            
            headers = {}
            if details.registry_username and details.registry_password:
                auth_string = f"{details.registry_username}:{details.registry_password}"
                encoded_auth = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')
                headers['x-skaha-registry-auth'] = encoded_auth
                
                del session_details_dict['registry_username']
                del session_details_dict['registry_password']

            response = await client.post(
                f"{SKAHA_API_URL}/session", 
                data=session_details_dict,
                headers=headers
            )
            response.raise_for_status()
            try:
                return response.json()
            except json.JSONDecodeError:
                return {"sessionID": response.text}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}")

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Deletes a session from Skaha using the client certificate."""
    async with get_api_client() as client:
        try:
            response = await client.delete(f"{SKAHA_API_URL}/session/{session_id}")
            response.raise_for_status()
            if response.status_code == 200 and not response.text:
                return {"status": "success", "message": f"Session {session_id} deleted."}
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Error from Skaha API: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Error connecting to Skaha API: {type(e).__name__} - {e}")
            raise HTTPException(status_code=500, detail=f"Could not connect to Skaha API: {e}") 