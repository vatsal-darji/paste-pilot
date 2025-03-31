// document.addEventListener("DOMContentLoaded", async () => {
//   const clipboardText = await window.clipboardAPI.getClipboardText();
//   console.log("From renderer:", clipboardText);

//   // Display it on page
//   const textDisplay = document.createElement("div");
//   textDisplay.textContent = `Current clipboard: ${clipboardText}`;
//   document.body.appendChild(textDisplay);
// });

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.createElement("div");
  container.className = "history-container";
  document.body.appendChild(container);

  // Get initial history
  const history = await window.clipboardAPI.getHistory();
  renderHistory(history);

  // Listen for updates
  window.clipboardAPI.onHistoryUpdate((history) => {
    renderHistory(history);
  });

  // Render history items
  function renderHistory(items) {
    container.innerHTML = "";

    if (items.length === 0) {
      container.innerHTML = "<p>No clipboard history yet. Copy something!</p>";
      return;
    }

    items.forEach((item) => {
      const itemElement = document.createElement("div");
      itemElement.className = "clipboard-item";

      // Format the date
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleString();

      itemElement.innerHTML = `
        <div class="content">${item.text}</div>
        <div class="meta">${formattedDate}</div>
      `;

      // Click to copy
      itemElement.addEventListener("click", () => {
        window.clipboardAPI.setClipboard(item.text);
        showNotification("Copied to clipboard!");
      });

      container.appendChild(itemElement);
    });
  }

  // Simple notification
  function showNotification(message) {
    const notification = document.createElement("div");
    notification.className = "notification";
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 2000);
  }
});
