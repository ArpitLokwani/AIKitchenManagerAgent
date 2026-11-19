
import json
import os

from openai import OpenAI

from agents.agent_tools import (
    get_inventory,
    add_inventory_item,
    update_inventory_item,
    delete_inventory_item,
)

client = OpenAI()

MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")

SYSTEM_INSTRUCTIONS = """
You are My Kitchen Manager, a friendly AI assistant for an Indian family.

PERSONALITY:
- Speak naturally like a helpful family member.
- Use simple, friendly Indian English.
- Understand casual language and voice transcription.
- Be concise and conversational.

YOUR RESPONSIBILITIES:
- Check kitchen inventory.
- Add grocery items.
- Update existing grocery items.
- Delete grocery items.
- Help users understand low-stock items.

IMPORTANT SAFETY RULES:
1. Always fetch live inventory when answering inventory questions.
2. Never invent item names or quantities.
3. Never directly execute an add, update or delete operation.
4. For every requested modification, prepare a pending action.
5. Ask the user to confirm the proposed change.
6. Never claim an item was modified before confirmation.
7. If an item does not exist, explain that clearly.
8. If required information is missing, ask the user.
9. Do not assume that "add 5 kg rice" means increase
   existing rice by 5 kg. Ask whether the user means
   adding a new item or increasing its quantity.

AVAILABLE OPERATIONS:

ADD:
Prepare an add action with:
- name
- category
- quantity
- unit
- minimum_stock

UPDATE:
Prepare an update action with:
- item_name
- quantity (only if supplied)
- unit (only if supplied)
- category (only if supplied)
- minimum_stock (only if supplied)
- new_name (only if supplied)

DELETE:
Prepare a delete action with:
- item_name

For modifications, explain the exact proposed changes.
Ask the user to confirm before execution.

When the user asks about inventory, call get_inventory.
"""

TOOLS = [
    {
        "type": "function",
        "name": "get_inventory",
        "description": "Fetch the latest kitchen inventory.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "propose_add_inventory_item",
        "description": "Prepare an add-item request. This does not modify Firestore.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "category": {
                    "type": "string",
                    "enum": [
                        "Grains", "Pulses", "Spices", "Oils",
                        "Dairy", "Vegetables", "Other"
                    ]
                },
                "quantity": {"type": "number"},
                "unit": {"type": "string"},
                "minimum_stock": {"type": "number"}
            },
            "required": [
                "name", "category", "quantity", "unit", "minimum_stock"
            ],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "propose_update_inventory_item",
        "description": "Prepare an update request. This does not modify Firestore.",
        "parameters": {
            "type": "object",
            "properties": {
                "item_name": {"type": "string"},
                "quantity": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"]},
                "category": {
                    "type": ["string", "null"],
                    "enum": [
                        "Grains", "Pulses", "Spices", "Oils",
                        "Dairy", "Vegetables", "Other", None
                    ]
                },
                "minimum_stock": {"type": ["number", "null"]},
                "new_name": {"type": ["string", "null"]}
            },
            "required": [
                "item_name", "quantity", "unit", "category",
                "minimum_stock", "new_name"
            ],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "propose_delete_inventory_item",
        "description": "Prepare a delete request. This does not modify Firestore.",
        "parameters": {
            "type": "object",
            "properties": {
                "item_name": {"type": "string"}
            },
            "required": ["item_name"],
            "additionalProperties": False
        },
        "strict": True
    }
]


def ask_kitchen_agent(question: str) -> dict:
    """
    Ask the AI agent a question.

    Inventory changes are returned as pending actions.
    They are not executed here.
    """

    response = client.responses.create(
        model=MODEL,
        instructions=SYSTEM_INSTRUCTIONS,
        input=question,
        tools=TOOLS
    )

    for _ in range(5):

        function_calls = [
            item
            for item in response.output
            if item.type == "function_call"
        ]

        if not function_calls:
            return {
                "answer": response.output_text,
                "pending_action": None
            }

        tool_outputs = []
        pending_action = None

        for call in function_calls:

            arguments = json.loads(call.arguments)

            if call.name == "get_inventory":

                result = get_inventory()

            elif call.name == "propose_add_inventory_item":

                pending_action = {
                    "action": "add",
                    "arguments": arguments
                }

                result = {
                    "success": True,
                    "message": "Add request prepared. Waiting for confirmation.",
                    "pending_action": pending_action
                }

            elif call.name == "propose_update_inventory_item":

                pending_action = {
                    "action": "update",
                    "arguments": {
                        key: value
                        for key, value in arguments.items()
                        if value is not None
                    }
                }

                result = {
                    "success": True,
                    "message": "Update request prepared. Waiting for confirmation.",
                    "pending_action": pending_action
                }

            elif call.name == "propose_delete_inventory_item":

                pending_action = {
                    "action": "delete",
                    "arguments": arguments
                }

                result = {
                    "success": True,
                    "message": "Delete request prepared. Waiting for confirmation.",
                    "pending_action": pending_action
                }

            else:
                raise ValueError(f"Unknown function: {call.name}")

            tool_outputs.append({
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": json.dumps(result, default=str)
            })

        response = client.responses.create(
            model=MODEL,
            instructions=SYSTEM_INSTRUCTIONS,
            previous_response_id=response.id,
            input=tool_outputs,
            tools=TOOLS
        )

        if pending_action:
            return {
                "answer": response.output_text,
                "pending_action": pending_action
            }

    raise RuntimeError("Maximum AI tool-call iterations exceeded")


def execute_inventory_action(action: dict) -> dict:
    """
    Execute a previously confirmed inventory action.

    This function must only be called by a protected
    backend confirmation endpoint after user confirmation.
    """

    action_type = action.get("action")
    arguments = action.get("arguments", {})

    if action_type == "add":
        return add_inventory_item(**arguments)

    if action_type == "update":
        return update_inventory_item(**arguments)

    if action_type == "delete":
        return delete_inventory_item(**arguments)

    raise ValueError("Invalid inventory action.")
