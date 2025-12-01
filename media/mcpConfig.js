// MCP Configuration View JavaScript
(() => {
	const vscode = acquireVsCodeApi();

	const form = document.getElementById("add-server-form");
	const serverList = document.getElementById("server-list");

	// Handle form submission
	form.addEventListener("submit", (e) => {
		e.preventDefault();

		const name = document.getElementById("server-name").value;
		const transport = document.getElementById("transport-type").value;
		const uri = document.getElementById("server-uri").value;

		if (name && transport && uri) {
			vscode.postMessage({
				type: "addServer",
				server: {
					name,
					transport,
					uri,
				},
			});

			// Reset form
			form.reset();
		}
	});

	// Add event listeners to remove buttons
	function addRemoveListeners() {
		const removeButtons = document.querySelectorAll(".remove-server-btn");
		removeButtons.forEach((button) => {
			button.addEventListener("click", () => {
				const serverName = button.getAttribute("data-server-name");
				if (serverName) {
					vscode.postMessage({
						type: "removeServer",
						serverName,
					});
				}
			});
		});
	}

	// Add event listener to refresh button if it exists
	const refreshButton = document.getElementById("refresh-btn");
	if (refreshButton) {
		refreshButton.addEventListener("click", () => {
			vscode.postMessage({
				type: "refresh",
			});
		});
	}

	// Initialize
	window.addEventListener("message", (event) => {
		const message = event.data;

		switch (message.type) {
			case "updateServerList":
				renderServerList(message.servers);
				break;
		}
	});

	function renderServerList(servers) {
		serverList.innerHTML = "";

		if (servers.length === 0) {
			serverList.innerHTML = "<p>No servers configured</p>";
			return;
		}

		servers.forEach((server) => {
			const serverItem = document.createElement("div");
			serverItem.className = "server-item";

			let statusClass = "status-disconnected";
			let statusText = "Disconnected";

			if (server.health === "ok") {
				statusClass = "status-connected";
				statusText = "Connected";
			} else if (server.health === "error") {
				statusClass = "status-error";
				statusText = "Error";
			}

			serverItem.innerHTML = `
        <div class="server-info">
          <div class="server-name">${server.name}</div>
          <div class="server-details">
            <span class="status-indicator ${statusClass}"></span>
            ${statusText} | ${server.transport}: ${server.uri}
          </div>
        </div>
        <div class="server-actions">
          <button class="remove-server-btn" data-server-name="${server.name}">Remove</button>
        </div>
      `;

			serverList.appendChild(serverItem);
		});

		addRemoveListeners();
	}

	// Request initial server list
	vscode.postMessage({
		type: "refresh",
	});
})();
