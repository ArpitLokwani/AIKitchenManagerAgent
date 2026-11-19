from sqlalchemy import select
from sqlalchemy.orm import Session

from models import InventoryItem
from schemas import InventoryItemInput


def get_items(db: Session) -> list[InventoryItem]:
    return list(
        db.scalars(select(InventoryItem).order_by(InventoryItem.name.asc())).all()
    )


def get_item(db: Session, item_id: int) -> InventoryItem | None:
    return db.get(InventoryItem, item_id)


def create_item(db: Session, item: InventoryItemInput) -> InventoryItem:
    db_item = InventoryItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


def update_item(
    db: Session, db_item: InventoryItem, item: InventoryItemInput
) -> InventoryItem:
    for field, value in item.model_dump().items():
        setattr(db_item, field, value)
    db.commit()
    db.refresh(db_item)
    return db_item


def delete_item(db: Session, db_item: InventoryItem) -> None:
    db.delete(db_item)
    db.commit()
