from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Category = Literal[
    "Grains", "Pulses", "Spices", "Oils", "Dairy", "Vegetables", "Other"
]
Unit = Literal["Packets"]
StoredUnit = Literal["Kg", "Grams", "Litres", "Ml", "Pieces", "Packets", "Bottles"]


class InventoryItemInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Category
    quantity: int = Field(ge=0, strict=True)
    unit: Unit
    minimum_stock: int = Field(ge=0, strict=True)

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Item name is required")
        return value


class InventoryItemRead(InventoryItemInput):
    model_config = ConfigDict(from_attributes=True)

    quantity: float
    unit: StoredUnit
    minimum_stock: float
    id: int
    created_at: datetime
    updated_at: datetime


class DashboardStats(BaseModel):
    total_items: int
    low_stock_items: int
    out_of_stock_items: int
    total_categories: int
    recent_items: list[InventoryItemRead]
    low_stock_list: list[InventoryItemRead]
