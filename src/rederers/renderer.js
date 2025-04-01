document.addEventListener("DOMContentLoaded", async () => {
  const historyContainer = document.getElementById("historyContainer");
  const searchInput = document.getElementById("searchInput");
  let clipboardHistory = [];

  // Get initial clipboard history
  try {
    clipboardHistory = await window.clipboardAPI.getHistory();
    renderHistory(clipboardHistory);
  } catch (error) {
    console.error("Failed to get clipboard history:", error);
  }

  // Listen for history updates
  const removeListener = window.clipboardAPI.onHistoryUpdate(
    (updatedHistory) => {
      clipboardHistory = updatedHistory;
      renderHistory(filterHistory(clipboardHistory, searchInput.value));
    }
  );

  // Filter history when search input changes
  searchInput.addEventListener("input", () => {
    renderHistory(filterHistory(clipboardHistory, searchInput.value));
  });

  // Filter history by search term
  function filterHistory(history, searchTerm) {
    if (!searchTerm) return history;
    searchTerm = searchTerm.toLowerCase();
    return history.filter((item) => {
      if (item.type === "text") {
        return item.text && item.text.toLowerCase().includes(searchTerm);
      }
      // Images can't be searched by content, only by timestamp
      return false;
    });
  }

  // Render clipboard history items
  function renderHistory(history) {
    historyContainer.innerHTML = "";

    if (!history || history.length === 0) {
      historyContainer.innerHTML =
        '<div class="empty-history">No clipboard history yet.</div>';
      return;
    }

    history.forEach((item, index) => {
      // Skip empty or invalid items
      if (
        !item ||
        !item.type ||
        (item.type === "text" && (!item.text || item.text.trim() === "")) ||
        (item.type === "image" && !item.ImageData)
      ) {
        return;
      }

      const clipboardItem = document.createElement("div");
      clipboardItem.className = "clipboard-item";

      // Format timestamp
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleString();

      if (item.type === "text") {
        clipboardItem.innerHTML = `
          <div class="clipboard-content text-content">${escapeHTML(
            item.text
          )}</div>
          <div class="clipboard-meta">
            <div class="clipboard-time">${formattedDate}</div>
            <div class="clipboard-actions">
              <button class="copy-btn" data-index="${index}">Copy</button>
              <button class="delete-btn" data-index="${index}">Delete</button>
            </div>
          </div>
        `;
      } else if (item.type === "image" && item.ImageData) {
        clipboardItem.innerHTML = `
          <div class="clipboard-content image-content">
            <img src="data:image/png;base64,${item.ImageData}" alt="Clipboard image" />
          </div>
          <div class="clipboard-meta">
            <div class="clipboard-time">${formattedDate}</div>
            <div class="clipboard-actions">
              <button class="copy-btn" data-index="${index}">Copy</button>
              <button class="delete-btn" data-index="${index}">Delete</button>
            </div>
          </div>
        `;
      }

      historyContainer.appendChild(clipboardItem);
    });

    // If all items were invalid and nothing was rendered
    if (historyContainer.children.length === 0) {
      historyContainer.innerHTML =
        '<div class="empty-history">No valid clipboard items found.</div>';
      return;
    }

    // Add click event for copy button
    document.querySelectorAll(".copy-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(e.target.dataset.index);
        if (index >= 0 && index < history.length) {
          window.clipboardAPI.setClipboard(history[index]);
          showNotification("Copied to clipboard");
        }
      });
    });

    // Add click event for delete button
    document.querySelectorAll(".delete-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(e.target.dataset.index);
        if (index >= 0 && index < history.length) {
          window.clipboardAPI.deleteItem(index);
        }
      });
    });

    // Click on item to copy
    document.querySelectorAll(".clipboard-item").forEach((item, idx) => {
      item.addEventListener("click", () => {
        const index = Array.from(historyContainer.children).indexOf(item);
        if (index >= 0 && index < history.length) {
          window.clipboardAPI.setClipboard(history[index]);
          showNotification("Copied to clipboard");
        }
      });
    });
  }

  // Helper to escape HTML to prevent XSS
  function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Show notification
  function showNotification(message) {
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    document.body.appendChild(notification);

    // Show and remove after 2 seconds
    setTimeout(() => (notification.style.opacity = "1"), 50);
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  // Clean up listener when window unloads
  window.addEventListener("unload", removeListener);
});
