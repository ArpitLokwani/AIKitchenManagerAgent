
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

import crud
from database import Base, SessionLocal, engine, get_db
from models import InventoryItem
from schemas import DashboardStats, InventoryItemInput, InventoryItemRead


# Project configuration
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load environment variables before importing the AI agent
load_dotenv(PROJECT_ROOT / ".env")

from routes.chat import router as chat_router


SAMPLE_ITEMS = [
    {"name": "Rice", "category": "Grains", "quantity": 5, "unit": "Packets", "minimum_stock": 2},
    {"name": "Atta", "category": "Grains", "quantity": 3, "unit": "Packets", "minimum_stock": 2},
    {"name": "Toor Dal", "category": "Pulses", "quantity": 2, "unit": "Packets", "minimum_stock": 1},
    {"name": "Sugar", "category": "Other", "quantity": 2, "unit": "Packets", "minimum_stock": 1},
    {"name": "Cooking Oil", "category": "Oils", "quantity": 1, "unit": "Packets", "minimum_stock": 2},
    {"name": "Salt", "category": "Other", "quantity": 1, "unit": "Packets", "minimum_stock": 1},
    {"name": "Poha", "category": "Grains", "quantity": 2, "unit": "Packets", "minimum_stock": 1},
    {"name": "Besan", "category": "Pulses", "quantity": 1, "unit": "Packets", "minimum_stock": 1},
]


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        if db.scalar(select(InventoryItem.id).limit(1)) is None:
            db.add_all(InventoryItem(**item) for item in SAMPLE_ITEMS)
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


# FastAPI application
app = FastAPI(
    title="MyKitchen Manager API",
    version="1.0.0",
    lifespan=lifespan
)


# CORS - local development only
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register AI Agent chat API
app.include_router(chat_router)


# SQLite inventory APIs
@app.get("/api/inventory", response_model=list[InventoryItemRead])
def list_inventory(db: Session = Depends(get_db)):
    return crud.get_items(db)


@app.get("/api/inventory/{item_id}", response_model=InventoryItemRead)
def read_inventory_item(item_id: int, db: Session = Depends(get_db)):
    item = crud.get_item(db, item_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Inventory item not found"
        )

    return item


@app.post(
    "/api/inventory",
    response_model=InventoryItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inventory_item(
    item: InventoryItemInput,
    db: Session = Depends(get_db)
):
    return crud.create_item(db, item)


@app.put("/api/inventory/{item_id}", response_model=InventoryItemRead)
def update_inventory_item(
    item_id: int,
    item: InventoryItemInput,
    db: Session = Depends(get_db)
):
    db_item = crud.get_item(db, item_id)

    if db_item is None:
        raise HTTPException(
            status_code=404,
            detail="Inventory item not found"
        )

    return crud.update_item(db, db_item, item)


@app.delete(
    "/api/inventory/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db)
):
    db_item = crud.get_item(db, item_id)

    if db_item is None:
        raise HTTPException(
            status_code=404,
            detail="Inventory item not found"
        )

    crud.delete_item(db, db_item)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Dashboard statistics API
@app.get("/api/dashboard/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db)):
    items = crud.get_items(db)

    low_stock = [
        item for item in items
        if 0 < item.quantity <= item.minimum_stock
    ]

    out_of_stock = [
        item for item in items
        if item.quantity <= 0
    ]

    recent = sorted(
        items,
        key=lambda item: item.created_at,
        reverse=True
    )[:5]

    categories = {item.category for item in items}

    return DashboardStats(
        total_items=len(items),
        low_stock_items=len(low_stock),
        out_of_stock_items=len(out_of_stock),
        total_categories=len(categories),
        recent_items=recent,
        low_stock_list=low_stock,
    )


# Serve frontend
frontend_dir = PROJECT_ROOT / "frontend"

app.mount(
    "/",
    StaticFiles(directory=frontend_dir, html=True),
    name="frontend"
)
