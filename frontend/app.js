
const CATEGORIES = ["Grains", "Pulses", "Spices", "Oils", "Dairy", "Vegetables", "Other"];
const LEGACY_UNITS = ["Kg", "Grams", "Litres", "Ml", "Pieces", "Bottles"];

const inventoryCollection = firebase.firestore().collection("inventory_items");

// AI Agent API - local development
const AI_API_URL = window.location.origin;

let items = [];
let editingId = null;
let toastTimer;
let inventoryLoaded = false;

// Voice recognition state
let recognition = null;
let isListening = false;

window.onAndroidVoiceStart = function () {
  isListening = true;
  const voiceButton = $("#voice-button");
  const voiceStatus = $("#voice-status");
  if (voiceButton) {
    voiceButton.classList.add("recording");
    voiceButton.textContent = "🔴";
  }
  if (voiceStatus) voiceStatus.textContent = "Listening... Speak now.";
};

window.onAndroidVoicePartial = function (transcript) {
  const input = $("#assistant-input");
  if (input) input.value = transcript;
  const voiceStatus = $("#voice-status");
  if (voiceStatus) voiceStatus.textContent = "Listening...";
};

window.onAndroidVoiceResult = function (transcript) {
  const input = $("#assistant-input");
  if (!input) return;
  input.value = transcript;
  const voiceStatus = $("#voice-status");
  if (voiceStatus) voiceStatus.textContent = `Recognized: ${transcript}`;
  $("#assistant-form").requestSubmit();
};

window.onAndroidVoiceError = function (message) {
  isListening = false;
  const voiceButton = $("#voice-button");
  const voiceStatus = $("#voice-status");
  if (voiceButton) {
    voiceButton.classList.remove("recording");
    voiceButton.textContent = "🎤";
  }
  if (voiceStatus) voiceStatus.textContent = message;
};

window.onAndroidVoiceEnd = function () {
  isListening = false;
  const voiceButton = $("#voice-button");
  const voiceStatus = $("#voice-status");
  if (voiceButton) {
    voiceButton.classList.remove("recording");
    voiceButton.textContent = "🎤";
  }
  if (voiceStatus && !$("#assistant-input")?.value.trim()) {
    voiceStatus.textContent = "Tap the microphone to speak.";
  }
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[char]);

if (sessionStorage.getItem("mykitchen-auth") !== "true") {
  location.replace("/login.html");
} else {
  initializeApp();
}


// --------------------------------------------------
// APP INITIALIZATION
// --------------------------------------------------

function initializeApp() {
  $("#current-date").textContent = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  $("#logout-button").addEventListener("click", logout);
  $("#mobile-menu").addEventListener("click", toggleSidebar);

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;

      showView(button.dataset.view);

      if (filter) $("#stock-filter").value = filter;
      if (filter) renderInventory();
    });
  });

  $("#quick-add").addEventListener("click", () => openItemModal());
  $("#add-item").addEventListener("click", () => openItemModal());
  $("#empty-add").addEventListener("click", () => openItemModal());

  $("#close-modal").addEventListener("click", closeItemModal);
  $("#cancel-modal").addEventListener("click", closeItemModal);

  $("#item-modal").addEventListener("click", (event) => {
    if (event.target === $("#item-modal")) closeItemModal();
  });

  $("#item-form").addEventListener("submit", saveItem);

  $("#search-input").addEventListener("input", renderInventory);
  $("#category-filter").addEventListener("change", renderInventory);
  $("#stock-filter").addEventListener("change", renderInventory);

  // AI Manager form
  $("#assistant-form").addEventListener("submit", sendAssistantMessage);

  // Voice button
  const voiceButton = $("#voice-button");

  if (voiceButton) {
    voiceButton.addEventListener("click", startVoiceRecognition);
  }

  // AI Manager quick prompts
  document.querySelectorAll(".assistant-prompt").forEach((button) => {
    button.addEventListener("click", () => {
      $("#assistant-input").value = button.dataset.question;
      $("#assistant-form").requestSubmit();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeItemModal();
  });

  populateCategoryFilter();
  refreshData();
}


// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

function logout() {
  stopVoiceRecognition();

  sessionStorage.removeItem("mykitchen-auth");
  location.replace("/login.html");
}


// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

function toggleSidebar() {
  const isOpen = $("#sidebar").classList.toggle("sidebar-open");
  $("#mobile-menu").setAttribute("aria-expanded", String(isOpen));
}

function showView(view) {
  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.remove("active");
  });

  $(`#${view}-view`).classList.add("active");

  document.querySelectorAll(".nav-link[data-view]").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === view);
  });

  $("#page-title").textContent = {
    dashboard: "Dashboard",
    inventory: "Inventory",
    "ai-manager": "AI Manager",
  }[view] || "Dashboard";

  $("#sidebar").classList.remove("sidebar-open");
  $("#mobile-menu").setAttribute("aria-expanded", "false");

  if (view === "inventory") renderInventory();

  window.scrollTo({ top: 0, behavior: "smooth" });
}


// --------------------------------------------------
// FIRESTORE INVENTORY
// --------------------------------------------------

async function refreshData() {
  try {
    const snapshot = await inventoryCollection.get();

    items = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));

    inventoryLoaded = true;

    const lowStock = items.filter(
      (item) => item.quantity > 0 && item.quantity <= item.minimum_stock
    );

    const outOfStock = items.filter(
      (item) => item.quantity <= 0
    );

    const recent = [...items]
      .sort((a, b) =>
        (b.created_at?.toMillis() || 0) -
        (a.created_at?.toMillis() || 0)
      )
      .slice(0, 5);

    renderDashboard({
      total_items: items.length,
      low_stock_items: lowStock.length,
      out_of_stock_items: outOfStock.length,
      total_categories: new Set(items.map((item) => item.category)).size,
      recent_items: recent,
      low_stock_list: lowStock,
    });

    renderInventory();

  } catch (error) {
    inventoryLoaded = false;

    showToast(
      `Couldn't load your kitchen data: ${error.message}`,
      "error"
    );

    $("#recent-list").innerHTML =
      '<div class="error-state">We couldn’t load your pantry. Please try again.</div>';

    $("#alert-list").innerHTML =
      '<div class="error-state">Stock alerts are temporarily unavailable.</div>';

    $("#inventory-body").innerHTML =
      '<tr><td class="table-message" colspan="7">Inventory could not be loaded.</td></tr>';
  }
}


// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

function renderDashboard(stats) {
  $("#total-items").textContent = stats.total_items;
  $("#low-items").textContent = stats.low_stock_items;
  $("#out-items").textContent = stats.out_of_stock_items;
  $("#category-count").textContent = stats.total_categories;
  $("#alert-count").textContent = stats.low_stock_list.length;

  if (!stats.recent_items.length) {
    $("#recent-list").innerHTML =
      '<div class="empty-inline">Your pantry is ready for its first item.</div>';
  } else {
    $("#recent-list").innerHTML = stats.recent_items.map((item) => `
      <div class="recent-row">
        <span class="item-initial">${escapeHtml(item.name.slice(0, 1).toUpperCase())}</span>
        <span class="recent-name">
          <b>${escapeHtml(item.name)}</b>
          <small>${escapeHtml(item.category)}</small>
        </span>
        <span class="recent-quantity">
          ${formatQuantity(item.quantity)} ${escapeHtml(item.unit)}
        </span>
        <span class="status-badge ${statusClass(item)}">
          ${statusText(item)}
        </span>
      </div>
    `).join("");
  }

  if (!stats.low_stock_list.length) {
    $("#alert-list").innerHTML =
      '<div class="all-good"><span>✓</span><b>All stocked up!</b><small>Nothing needs your attention right now.</small></div>';
  } else {
    $("#alert-list").innerHTML = stats.low_stock_list.slice(0, 4).map((item) => `
      <div class="alert-row">
        <span class="alert-indicator">!</span>
        <span class="alert-name">
          <b>${escapeHtml(item.name)}</b>
          <small>${escapeHtml(item.category)}</small>
        </span>
        <span class="alert-quantity">
          ${formatQuantity(item.quantity)} ${escapeHtml(item.unit)} left
        </span>
      </div>
    `).join("");
  }
}


// --------------------------------------------------
// VOICE ASSISTANT - SPEECH TO TEXT
// --------------------------------------------------

function startVoiceRecognition() {
  if (window.AndroidVoice) {
    window.AndroidVoice.startListening("en-IN");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  const voiceButton = $("#voice-button");
  const voiceStatus = $("#voice-status");
  const input = $("#assistant-input");

  if (!SpeechRecognition) {
    showToast(
      "Voice recognition is not supported. Please use Google Chrome.",
      "error"
    );
    return;
  }

  if (isListening) {
    stopVoiceRecognition();
    return;
  }

  recognition = new SpeechRecognition();

  // English (India)
  // Change to "hi-IN" for Hindi recognition.
  recognition.lang = "en-IN";

  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () {
    isListening = true;

    voiceButton.classList.add("recording");
    voiceButton.textContent = "🔴";
    voiceButton.title = "Stop listening";

    if (voiceStatus) {
      voiceStatus.textContent = "Listening... Speak now.";
    }
  };

  recognition.onresult = function (event) {
    let transcript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    // Show the recognized speech in the chat input.
    input.value = transcript;

    if (voiceStatus) {
      voiceStatus.textContent = finalTranscript
        ? `Recognized: ${finalTranscript}`
        : "Listening...";
    }
  };

  recognition.onerror = function (event) {
    console.error("Voice recognition error:", event.error);

    const messages = {
      "not-allowed": "Please allow microphone permission in your browser.",
      "no-speech": "No speech detected. Please try again.",
      "audio-capture": "Microphone not found. Please check your microphone.",
      "network": "Network error during voice recognition.",
      "aborted": "Voice recognition stopped.",
    };

    if (voiceStatus) {
      voiceStatus.textContent =
        messages[event.error] || `Voice error: ${event.error}`;
    }
  };

  recognition.onend = function () {
    isListening = false;

    voiceButton.classList.remove("recording");
    voiceButton.textContent = "🎤";
    voiceButton.title = "Speak to AI Manager";

    if (voiceStatus && !input.value.trim()) {
      voiceStatus.textContent = "Tap the microphone to speak.";
    }

    input.focus();
  };

  try {
    recognition.start();
  } catch (error) {
    console.error("Could not start voice recognition:", error);

    showToast(
      "Could not start microphone. Please try again.",
      "error"
    );
  }
}


function stopVoiceRecognition() {
  if (recognition && isListening) {
    recognition.stop();
  }
}


// --------------------------------------------------
// AI MANAGER - OPENAI AGENT INTEGRATION
// --------------------------------------------------



// --------------------------------------------------
// AI MANAGER - OPENAI AGENT INTEGRATION
// --------------------------------------------------

async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    if (response.status === 404) {
      throw new Error(
        "The AI chat service is not available at this address (HTTP 404)."
      );
    }

    throw new Error(
      `The AI chat service returned an unexpected response (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || fallbackMessage);
  }

  return data;
}

async function sendAssistantMessage(event) {
  if (event) event.preventDefault();

  const input = $("#assistant-input");
  const submitButton = $("#assistant-send-button");

  if (!input) return;

  const question = input.value.trim();

  if (!question) return;

  if (!inventoryLoaded) {
    appendAssistantMessage(
      "Please wait while your kitchen inventory loads.",
      "bot"
    );
    return;
  }

  input.value = "";

  appendAssistantMessage(question, "user");

  const directAction = prepareLocalVoiceAction(question);
  if (directAction) {
    appendAssistantMessage(directAction.description, "bot");
    appendActionControls(directAction.pendingAction);
    return;
  }

  const thinkingMessage = appendAssistantMessage(
    "Let me check that for you...",
    "bot"
  );

  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${AI_API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: question
      })
    });

    const data = await readApiResponse(
      response,
      "AI assistant request failed."
    );

    thinkingMessage.remove();

    appendAssistantMessage(
      data.answer || "I couldn't generate a response.",
      "bot"
    );

    if (data.pending_action) {
      appendActionControls(data.pending_action);
    }

  } catch (error) {
    thinkingMessage.remove();

    console.error("AI Manager error:", error);

    appendAssistantMessage(
      `Sorry, I couldn't process your request. ${error.message}`,
      "bot"
    );

  } finally {
    if (submitButton) submitButton.disabled = false;
    input.focus();
  }
}


// --------------------------------------------------
// AI MANAGER - CHAT MESSAGE RENDERING
// --------------------------------------------------

function appendAssistantMessage(text, sender) {
  const thread = $("#assistant-thread");

  if (!thread) {
    console.error("Assistant chat container not found.");
    return null;
  }

  const message = document.createElement("div");

  message.className =
    `assistant-message assistant-message-${sender}`;

  const label = document.createElement("span");
  label.className = "assistant-message-label";
  label.textContent = sender === "user" ? "You" : "AI Manager";

  const body = document.createElement("p");
  body.textContent = text;

  message.append(label, body);

  thread.append(message);
  thread.scrollTop = thread.scrollHeight;

  return message;
}


// --------------------------------------------------
// AI MANAGER - INVENTORY ACTION CONFIRMATION
// --------------------------------------------------

function appendActionControls(pendingAction) {
  const thread = $("#assistant-thread");

  if (!thread || !pendingAction?.action_id) return;

  const container = document.createElement("div");
  container.className = "assistant-action-controls";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "button button-primary";
  confirmButton.textContent = "Confirm";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button-quiet";
  cancelButton.textContent = "Cancel";

  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    confirmButton.textContent = "Processing...";

    try {
      if (pendingAction.direct) {
        await executeLocalInventoryAction(pendingAction);
        container.remove();
        appendAssistantMessage(pendingAction.successMessage, "bot");
        await refreshData();
        return;
      }

      const response = await fetch(`${AI_API_URL}/chat/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action_id: pendingAction.action_id
        })
      });

      const data = await readApiResponse(
        response,
        "Could not confirm this action."
      );

      container.remove();

      appendAssistantMessage(
        data.message || "Inventory operation completed.",
        "bot"
      );

      if (data.success) {
        await refreshData();
      }

    } catch (error) {
      appendAssistantMessage(
        `Sorry, the operation failed: ${error.message}`,
        "bot"
      );

      confirmButton.disabled = false;
      cancelButton.disabled = false;
      confirmButton.textContent = "Confirm";
    }
  });

  cancelButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    cancelButton.disabled = true;

    try {
      const response = await fetch(`${AI_API_URL}/chat/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action_id: pendingAction.action_id
        })
      });

      await readApiResponse(response, "Could not cancel this action.");

      container.remove();

      appendAssistantMessage(
        "No problem! I've cancelled that operation.",
        "bot"
      );

    } catch (error) {
      appendAssistantMessage(
        `Could not cancel the operation: ${error.message}`,
        "bot"
      );

      confirmButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  container.append(confirmButton, cancelButton);
  thread.append(container);

  thread.scrollTop = thread.scrollHeight;
}

// --------------------------------------------------
// DIRECT VOICE INVENTORY CONTROL
// --------------------------------------------------

function inferCategory(name) {
  const value = name.toLowerCase();
  if (/rice|atta|maida|besan|rava|poha|dalia|sevai|flour|oats|bread|rusk|cornflakes/.test(value)) return "Grains";
  if (/dal|chana|rajma|peas|moong/.test(value)) return "Pulses";
  if (/turmeric|chilli|coriander|cumin|mustard|masala|pepper|hing|amchur|methi|cinnamon|cloves|cardamom|bay leaf/.test(value)) return "Spices";
  if (/oil|ghee/.test(value)) return "Oils";
  if (/milk|curd|paneer|butter|cheese|cream/.test(value)) return "Dairy";
  if (/onion|potato|tomato|chilli|ginger|garlic|lemon|coriander leaves|curry leaves|carrot|beans|capsicum|cucumber|cauliflower|cabbage|brinjal|gourd|spinach/.test(value)) return "Vegetables";
  return "Other";
}

function cleanVoiceName(value) {
  return value
    .replace(/^(?:please\s+)?(?:add|delete|remove|set|update|change)\s+/i, "")
    .replace(/\b(?:to|with)\s+(?:the\s+)?(?:quantity|stock)\s*.*$/i, "")
    .replace(/\bquantity\s+(?:of|for)?\s*/i, "")
    .replace(/\b(?:item|packets?|pieces?|kg|grams?|litres?)\b.*$/i, "")
    .replace(/[^a-zA-Z0-9 /()_-]+/g, "")
    .trim();
}

function prepareLocalVoiceAction(question) {
  const text = question.trim();

  const deleteMatch = text.match(/^(?:please\s+)?(?:delete|remove)\s+(?:the\s+)?(.+?)\s*(?:from\s+(?:my\s+)?(?:pantry|inventory))?$/i);
  if (deleteMatch) {
    const name = cleanVoiceName(deleteMatch[1]);
    const item = items.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
      || items.find((entry) => entry.name.toLowerCase().includes(name.toLowerCase()));
    if (!item) return null;
    return {
      description: `I’ll delete ${item.name} from your inventory.`,
      pendingAction: {
        direct: true,
        action: "delete",
        action_id: `local-delete-${item.id}`,
        arguments: { itemId: item.id, itemName: item.name },
        successMessage: `${item.name} deleted successfully.`,
      },
    };
  }

  let updateMatch = text.match(/^(?:please\s+)?(?:set|update|change)\s+(?:the\s+)?(.+?)\s+(?:quantity|stock)(?:\s+(?:to|as))?\s+(\d+)$/i);
  if (!updateMatch) {
    const alternateUpdate = text.match(/^(?:please\s+)?(?:set|update|change)\s+(?:the\s+)?(.+?)\s+(?:to|as)\s+(\d+)$/i);
    if (alternateUpdate) updateMatch = alternateUpdate;
  }
  if (updateMatch) {
    const name = cleanVoiceName(updateMatch[1]);
    const quantity = Number(updateMatch[2]);
    const item = items.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
      || items.find((entry) => entry.name.toLowerCase().includes(name.toLowerCase()));
    if (!item) return null;
    return {
      description: `I’ll set ${item.name} quantity to ${quantity}.`,
      pendingAction: {
        direct: true,
        action: "update",
        action_id: `local-update-${item.id}`,
        arguments: { itemId: item.id, quantity },
        successMessage: `${item.name} updated to ${quantity}.`,
      },
    };
  }

  const addMatch = text.match(/^(?:please\s+)?(?:add|create)\s+(?:(\d+)\s+(?:packets?\s+of\s+)?)?(?:new\s+)?(.+)$/i);
  if (addMatch) {
    const quantity = addMatch[1] ? Number(addMatch[1]) : 1;
    const name = cleanVoiceName(addMatch[2]);
    if (!name) return null;
    const existing = items.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return {
        description: `${existing.name} already exists.`,
        pendingAction: {
          direct: true,
          action: "update",
          action_id: `local-update-${existing.id}`,
          arguments: { itemId: existing.id, quantity },
          successMessage: `${existing.name} quantity updated to ${quantity}.`,
        },
      };
    }
    const category = inferCategory(name);
    return {
      description: `I’ll add ${name} to ${category} with quantity ${quantity}.`,
      pendingAction: {
        direct: true,
        action: "add",
        action_id: `local-add-${Date.now()}`,
        arguments: { name, category, quantity, unit: "Packets", minimum_stock: 1 },
        successMessage: `${name} added successfully.`,
      },
    };
  }

  return null;
}

async function executeLocalInventoryAction(pendingAction) {
  const args = pendingAction.arguments;
  if (pendingAction.action === "add") {
    await inventoryCollection.add({
      ...args,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else if (pendingAction.action === "update") {
    await inventoryCollection.doc(args.itemId).update({
      quantity: args.quantity,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else if (pendingAction.action === "delete") {
    await inventoryCollection.doc(args.itemId).delete();
  }
}

// --------------------------------------------------
// INVENTORY FILTERS
// --------------------------------------------------

function populateCategoryFilter() {
  $("#category-filter").innerHTML =
    '<option value="">All categories</option>' +
    CATEGORIES.map(
      (category) => `<option value="${category}">${category}</option>`
    ).join("");
}

function getFilteredItems() {
  const query = $("#search-input").value.trim().toLocaleLowerCase();
  const category = $("#category-filter").value;
  const filter = $("#stock-filter").value;

  return items.filter((item) => {
    if (query && !item.name.toLocaleLowerCase().includes(query)) return false;

    if (category && item.category !== category) return false;

    if (
      filter === "low" &&
      !(item.quantity > 0 && item.quantity <= item.minimum_stock)
    ) return false;

    if (filter === "out" && item.quantity > 0) return false;

    return true;
  });
}


// --------------------------------------------------
// INVENTORY RENDERING
// --------------------------------------------------

function renderInventory() {
  if (!$("#inventory-body")) return;

  const filtered = getFilteredItems();

  $("#item-count").textContent = `(${filtered.length})`;

  $("#inventory-body").innerHTML = filtered.map((item) => `
    <tr>
      <td data-label="Item name">
        <span class="table-item">
          <span class="item-initial">${escapeHtml(item.name.slice(0, 1).toUpperCase())}</span>
          <b>${escapeHtml(item.name)}</b>
        </span>
      </td>

      <td data-label="Category">
        <span class="category-pill">${escapeHtml(item.category)}</span>
      </td>

      <td data-label="Quantity">
        <b>${formatQuantity(item.quantity)}</b>
      </td>

      <td data-label="Unit">${escapeHtml(item.unit)}</td>

      <td data-label="Min. stock">
        ${formatQuantity(item.minimum_stock)} ${escapeHtml(item.unit)}
      </td>

      <td data-label="Status">
        <span class="status-badge ${statusClass(item)}">${statusText(item)}</span>
      </td>

      <td data-label="Actions">
        <div class="row-actions">
          <button class="row-action edit-action"
            data-action="edit"
            data-id="${item.id}"
            aria-label="Edit ${escapeHtml(item.name)}">
            Edit
          </button>

          <button class="row-action delete-action"
            data-action="delete"
            data-id="${item.id}"
            aria-label="Delete ${escapeHtml(item.name)}">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  $("#empty-state").hidden = filtered.length !== 0;

  $("#inventory-body").closest(".table-wrap").hidden =
    filtered.length === 0;

  $("#inventory-body").querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => openItemModal(button.dataset.id));
  });

  $("#inventory-body").querySelectorAll("[data-action='delete']").forEach((button) => {
    button.addEventListener("click", () => deleteItem(button.dataset.id));
  });
}


// --------------------------------------------------
// INVENTORY STATUS
// --------------------------------------------------

function statusText(item) {
  if (item.quantity <= 0) return "Out of stock";
  if (item.quantity <= item.minimum_stock) return "Low stock";
  return "In stock";
}

function statusClass(item) {
  if (item.quantity <= 0) return "status-out";
  if (item.quantity <= item.minimum_stock) return "status-low";
  return "status-in";
}

function formatQuantity(quantity) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(quantity);
}


// --------------------------------------------------
// ADD / EDIT INVENTORY MODAL
// --------------------------------------------------

function openItemModal(itemId = null) {
  editingId = itemId;

  const item = itemId === null
    ? null
    : items.find((entry) => entry.id === itemId);

  $("#item-form").reset();
  $("#item-error").hidden = true;

  const legacyUnit =
    item && LEGACY_UNITS.includes(item.unit)
      ? item.unit
      : null;

  $("#item-unit").innerHTML = ["Packets", ...(legacyUnit ? [legacyUnit] : [])]
    .map((unit) => `<option value="${unit}">${unit}</option>`)
    .join("");

  $("#modal-title").textContent = item ? "Edit item" : "Add an item";
  $("#modal-eyebrow").textContent = item
    ? "UPDATE YOUR PANTRY"
    : "PANTRY DETAILS";

  $("#save-item").textContent = item ? "Save changes" : "Save item";

  $("#item-quantity").value = item ? item.quantity : 0;
  $("#item-minimum").value = item ? item.minimum_stock : 0;
  $("#item-unit").value = legacyUnit || "Packets";

  if (item) {
    $("#item-name").value = item.name;
    $("#item-category").value = item.category;
  }

  $("#item-modal").hidden = false;
  $("#item-name").focus();
}

function closeItemModal() {
  if (!$("#item-modal") || $("#item-modal").hidden) return;

  $("#item-modal").hidden = true;
  editingId = null;
}


// --------------------------------------------------
// SAVE INVENTORY ITEM
// --------------------------------------------------

async function saveItem(event) {
  event.preventDefault();

  const isEditing = editingId !== null;
  const itemId = editingId;

  const form = new FormData(event.currentTarget);

  const payload = {
    name: form.get("name").trim(),
    category: form.get("category"),
    quantity: Number(form.get("quantity")),
    unit: form.get("unit"),
    minimum_stock: Number(form.get("minimum_stock")),
  };

  if (
    !Number.isSafeInteger(payload.quantity) ||
    !Number.isSafeInteger(payload.minimum_stock)
  ) {
    $("#item-error").textContent =
      "Quantity and minimum stock must be whole numbers of packets.";

    $("#item-error").hidden = false;
    return;
  }

  const saveButton = $("#save-item");

  saveButton.disabled = true;
  saveButton.textContent = "Saving…";

  $("#item-error").hidden = true;

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();

    if (isEditing) {
      await inventoryCollection.doc(itemId).update({
        ...payload,
        updated_at: now,
      });
    } else {
      await inventoryCollection.add({
        ...payload,
        created_at: now,
        updated_at: now,
      });
    }

    closeItemModal();

    await refreshData();

    showToast(
      isEditing
        ? "Item updated successfully"
        : "Item added to your pantry"
    );

  } catch (error) {
    $("#item-error").textContent = error.message;
    $("#item-error").hidden = false;

  } finally {
    saveButton.disabled = false;
    saveButton.textContent = isEditing
      ? "Save changes"
      : "Save item";
  }
}


// --------------------------------------------------
// DELETE INVENTORY ITEM
// --------------------------------------------------

async function deleteItem(itemId) {
  const item = items.find((entry) => entry.id === itemId);

  if (
    !item ||
    !window.confirm(
      `Delete "${item.name}" from your inventory? This can't be undone.`
    )
  ) return;

  try {
    await inventoryCollection.doc(itemId).delete();

    await refreshData();

    showToast(`${item.name} removed from your pantry`);

  } catch (error) {
    showToast(
      `Couldn't delete item: ${error.message}`,
      "error"
    );
  }
}


// --------------------------------------------------
// TOAST NOTIFICATIONS
// --------------------------------------------------

function showToast(message, type = "success") {
  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  $("#toast-region").replaceChildren(toast);

  window.clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => toast.remove(), 3600);
}
