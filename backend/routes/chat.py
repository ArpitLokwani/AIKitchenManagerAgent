
import logging
import secrets
from threading import Lock

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.kitchen_agent import (
    ask_kitchen_agent,
    execute_inventory_action,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Temporary in-memory storage for pending actions.
# For production, replace this with Firestore or Redis.
pending_actions = {}
pending_actions_lock = Lock()


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ConfirmRequest(BaseModel):
    action_id: str = Field(min_length=1, max_length=100)


class CancelRequest(BaseModel):
    action_id: str = Field(min_length=1, max_length=100)


@router.post("/chat")
def chat(request: ChatRequest):
    try:
        result = ask_kitchen_agent(request.question)

        pending_action = result.get("pending_action")
        action_id = None

        if pending_action:
            action_id = secrets.token_urlsafe(24)

            with pending_actions_lock:
                pending_actions[action_id] = pending_action

        return {
            "question": request.question,
            "answer": result.get("answer", ""),
            "pending_action": (
                {
                    "action_id": action_id,
                    "action": pending_action["action"],
                    "arguments": pending_action["arguments"],
                }
                if pending_action else None
            )
        }

    except Exception:
        logger.exception("Kitchen AI request failed")

        raise HTTPException(
            status_code=500,
            detail="Kitchen AI could not process your request."
        )


@router.post("/chat/confirm")
def confirm_action(request: ConfirmRequest):
    try:
        with pending_actions_lock:
            action = pending_actions.pop(request.action_id, None)

        if action is None:
            raise HTTPException(
                status_code=404,
                detail="This action has expired or was already processed."
            )

        result = execute_inventory_action(action)

        if not result.get("success", False):
            return {
                "success": False,
                "message": result.get(
                    "message",
                    "The inventory operation could not be completed."
                ),
                "result": result
            }

        return {
            "success": True,
            "message": result.get(
                "message",
                "Inventory updated successfully."
            ),
            "result": result
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Inventory confirmation failed")

        raise HTTPException(
            status_code=500,
            detail="Could not update your inventory."
        )


@router.post("/chat/cancel")
def cancel_action(request: CancelRequest):
    with pending_actions_lock:
        action = pending_actions.pop(request.action_id, None)

    if action is None:
        raise HTTPException(
            status_code=404,
            detail="This action has expired or was already processed."
        )

    return {
        "success": True,
        "message": "Inventory action cancelled."
    }
