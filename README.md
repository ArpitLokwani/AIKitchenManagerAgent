# MyKitchen Manager

A lightweight family pantry and kitchen inventory manager. The frontend is plain HTML, CSS, and JavaScript; the backend is FastAPI with SQLAlchemy and a persistent SQLite database. Authentication is intentionally a frontend-only demo and is not suitable for production.

## Features

- Demo sign-in with session storage and logout.
- Dashboard with inventory, low-stock, out-of-stock, and category counts.
- Inventory search, category and stock filters, plus add, edit, and delete.
- Packet-count inventory with whole-number quantities and minimum-stock thresholds.
- AI Manager chat for inventory quantities, low-stock items, and out-of-stock items.
- Responsive layout with mobile-friendly inventory cards.
- Persistent SQLite storage and first-run sample data.
- Modular backend ready for future service integrations; no AI/RAG code is included.

## Requirements

- macOS
- Python 3.10 or newer

## Run locally

From the project root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). FastAPI serves both the frontend and API on this single local URL. API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

Demo credentials:

- Username: `admin`
- Password: `kitchen123`

The database is created at `backend/kitchen.db`. On startup, the eight sample items are inserted only if the inventory table is empty. New items are counted in whole packets, and minimum stock accepts only whole numbers. Low-stock alerts appear when a positive quantity is at or below its minimum stock; out-of-stock items have a separate dashboard count. Existing saved records keep their original units until edited.

## REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/inventory` | List inventory items |
| GET | `/api/inventory/{item_id}` | Get one item |
| POST | `/api/inventory` | Create an item |
| PUT | `/api/inventory/{item_id}` | Replace an item |
| DELETE | `/api/inventory/{item_id}` | Delete an item |
| GET | `/api/dashboard/stats` | Get dashboard counts and lists |

Inventory API input uses `name`, `category`, `quantity`, `unit`, and `minimum_stock`. Categories are validated against the choices in the UI; new and updated API entries require `unit: "Packets"` and non-negative whole-number quantities and minimum stock.

## Demo authentication note

The requested credentials are checked in the browser and the signed-in flag is kept in `sessionStorage`. This is a convenience for a local demo, not server-side authentication or an authorization boundary. Do not expose this setup to untrusted users or use it for sensitive data.

## AI Manager

The AI Manager is a browser-based, inventory-grounded assistant for questions about saved quantities, low stock, and out-of-stock items. It uses the inventory already loaded from Firestore and does not send pantry data to an external AI service.

## Android testing APK

The Android app is a small WebView wrapper around the live Firebase-hosted app, so a device needs an internet connection to sign in and use the pantry. To build a debug APK, install Android SDK platform 35 and build tools 35.0.0, then run `./gradlew assembleDebug` from the `android` directory. The APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to an Android device and open it to install; allow installation from that file source if Android asks.

## Future integrations

The backend separates HTTP routes (`main.py`), persistence setup (`database.py`), ORM models (`models.py`), validation/response schemas (`schemas.py`), and data operations (`crud.py`). A future generative assistant can be added independently without coupling it to the inventory model or CRUD layer.
