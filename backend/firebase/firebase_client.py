import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def get_firestore_client():
    if firebase_admin._apps:
        return firestore.client()

    # Railway / production:
    # Firebase service account JSON stored as an environment variable.
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

    if service_account_json:
        try:
            service_account_info = json.loads(service_account_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON contains invalid JSON."
            ) from exc

        credential = credentials.Certificate(service_account_info)

        firebase_admin.initialize_app(
            credential,
            {"projectId": "aikitchenmanager"}
        )

        return firestore.client()

    # Local development:
    # Use the Firebase service account file.
    credentials_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

    if not credentials_path:
        raise RuntimeError(
            "Neither FIREBASE_SERVICE_ACCOUNT_JSON nor "
            "FIREBASE_SERVICE_ACCOUNT_PATH is configured."
        )

    credentials_file = Path(credentials_path)

    if not credentials_file.is_absolute():
        credentials_file = PROJECT_ROOT / credentials_file

    if not credentials_file.exists():
        raise FileNotFoundError(
            f"Firebase credentials not found: {credentials_file}"
        )

    credential = credentials.Certificate(str(credentials_file))

    firebase_admin.initialize_app(
        credential,
        {"projectId": "aikitchenmanager"}
    )

    return firestore.client()