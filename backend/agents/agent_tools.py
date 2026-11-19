
from firebase.firebase_client import get_firestore_client

COLLECTION_NAME = "inventory_items"

CATEGORIES = [
    "Grains",
    "Pulses",
    "Spices",
    "Oils",
    "Dairy",
    "Vegetables",
    "Other",
]


def get_inventory():
    """Fetch all kitchen inventory items from Firestore."""

    db = get_firestore_client()
    documents = db.collection(COLLECTION_NAME).stream()

    inventory = []

    for document in documents:
        item = document.to_dict()
        item["id"] = document.id
        inventory.append(item)

    return {
        "total_items": len(inventory),
        "inventory": inventory
    }


def find_inventory_item(item_name: str):
    """Find an inventory item by its name, ignoring case."""

    db = get_firestore_client()
    documents = db.collection(COLLECTION_NAME).stream()

    matches = []

    for document in documents:
        item = document.to_dict()

        if item.get("name", "").strip().lower() == item_name.strip().lower():
            item["id"] = document.id
            matches.append(item)

    return matches


def add_inventory_item(
    name: str,
    category: str,
    quantity: float,
    unit: str,
    minimum_stock: float = 1
):
    """Add a new item to Firestore."""

    if not name.strip():
        raise ValueError("Item name cannot be empty.")

    if quantity < 0 or minimum_stock < 0:
        raise ValueError("Quantity and minimum stock cannot be negative.")

    if category not in CATEGORIES:
        raise ValueError(f"Invalid category: {category}")

    existing_items = find_inventory_item(name)

    if existing_items:
        return {
            "success": False,
            "message": f"{name} already exists in inventory.",
            "existing_item": existing_items[0]
        }

    db = get_firestore_client()

    item_data = {
        "name": name.strip(),
        "category": category,
        "quantity": quantity,
        "unit": unit.strip(),
        "minimum_stock": minimum_stock
    }

    document_ref = db.collection(COLLECTION_NAME).document()
    document_ref.set(item_data)

    return {
        "success": True,
        "message": f"{name} added successfully.",
        "item": {
            "id": document_ref.id,
            **item_data
        }
    }


def update_inventory_item(
    item_name: str,
    quantity: float = None,
    unit: str = None,
    category: str = None,
    minimum_stock: float = None,
    new_name: str = None
):
    """Update an existing inventory item."""

    matches = find_inventory_item(item_name)

    if not matches:
        return {
            "success": False,
            "message": f"{item_name} was not found in inventory."
        }

    if len(matches) > 1:
        return {
            "success": False,
            "message": f"Multiple items named {item_name} were found. Please identify the correct item."
        }

    updates = {}

    if quantity is not None:
        if quantity < 0:
            raise ValueError("Quantity cannot be negative.")
        updates["quantity"] = quantity

    if unit is not None:
        if not unit.strip():
            raise ValueError("Unit cannot be empty.")
        updates["unit"] = unit.strip()

    if category is not None:
        if category not in CATEGORIES:
            raise ValueError(f"Invalid category: {category}")
        updates["category"] = category

    if minimum_stock is not None:
        if minimum_stock < 0:
            raise ValueError("Minimum stock cannot be negative.")
        updates["minimum_stock"] = minimum_stock

    if new_name is not None:
        if not new_name.strip():
            raise ValueError("New item name cannot be empty.")

        duplicate = find_inventory_item(new_name)

        if duplicate and duplicate[0]["id"] != matches[0]["id"]:
            return {
                "success": False,
                "message": f"An item named {new_name} already exists."
            }

        updates["name"] = new_name.strip()

    if not updates:
        return {
            "success": False,
            "message": "No changes were provided."
        }

    db = get_firestore_client()
    document_id = matches[0]["id"]

    db.collection(COLLECTION_NAME).document(document_id).update(updates)

    updated_item = {
        **matches[0],
        **updates
    }

    return {
        "success": True,
        "message": f"{item_name} updated successfully.",
        "item": updated_item
    }


def delete_inventory_item(item_name: str):
    """Delete an existing inventory item."""

    matches = find_inventory_item(item_name)

    if not matches:
        return {
            "success": False,
            "message": f"{item_name} was not found in inventory."
        }

    if len(matches) > 1:
        return {
            "success": False,
            "message": f"Multiple items named {item_name} were found. Please identify the correct item."
        }

    db = get_firestore_client()
    document_id = matches[0]["id"]

    deleted_item = matches[0]

    db.collection(COLLECTION_NAME).document(document_id).delete()

    return {
        "success": True,
        "message": f"{item_name} deleted successfully.",
        "deleted_item": deleted_item
    }
