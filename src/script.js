document.addEventListener("DOMContentLoaded", () => {
  // Global Elements
  const statusEl = document.getElementById("status");
  const spinnerEl = document.getElementById("spinner");

  // Modal Elements
  const apiModal = document.getElementById("api-modal");
  const apiKeyInput = document.getElementById("api-key-input");
  const btnCancelApi = document.getElementById("btn-cancel-api");
  const btnSaveApi = document.getElementById("btn-save-api");
  const btnResetMindweaveApi = document.getElementById("btn-reset-mindweave-api");
  
  // State variables for pending game launch when modal is triggered
  let pendingGame = "";
  let pendingFallbackLaunch = "";

  /**
   * Fetches game availability from the server and disables locked games.
   */
  async function loadAvailability() {
    try {
      const response = await fetch("/api/games");
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const games = Array.isArray(payload.games) ? payload.games : [];
      const byKey = Object.fromEntries(games.map((item) =>[item.key, item]));

      document.querySelectorAll(".game-card").forEach((button) => {
        const gameKey = button.dataset.game;
        const config = byKey[gameKey];
        if (!config || config.available) {
          return;
        }
        button.disabled = true;
        button.title = config.reason || "Game unavailable";
        // Optional: Add visual styling to indicate it's disabled
        button.classList.add("opacity-50", "cursor-not-allowed");
      });
    } catch (error) {
      console.warn("Could not fetch game availability", error);
    }
  }

  /**
   * Initializes the game via the server API and handles redirection.
   */
  async function selectGame(game, fallbackLaunch) {
    statusEl.textContent = `Initializing ${game.replace("_", " ")}...`;
    spinnerEl.classList.remove("hidden");

    try {
      const response = await fetch("/api/select-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `Request failed with ${response.status}`);
      }

      statusEl.textContent = payload.message || `${game} initialized.`;

      const launchUrl = payload.launch_url || fallbackLaunch;
      if (launchUrl) {
        window.location.href = launchUrl;
      }
    } catch (error) {
      statusEl.textContent = `Unable to launch ${game}: ${error.message}`;
      console.error("Game selection failed", error);
    } finally {
      spinnerEl.classList.add("hidden");
    }
  }

  // Listen for game card clicks
  document.querySelectorAll(".game-card").forEach((button) => {
    button.addEventListener("click", () => {
      // 1. Prevent clicking if disabled by the availability check
      if (button.disabled) return;

      const gameId = button.dataset.game;
      const launchUrl = button.dataset.launch;
      // JS dataset maps HTML `data-requires-api` to `dataset.requiresApi`
      const requiresApi = button.dataset.requiresApi === "true"; 

      // 2. Check for required local API key before hitting the server
      if (requiresApi) {
        const storedKey = localStorage.getItem("mindweave_llm_api_key");
        if (!storedKey) {
          // Open modal if no key is found
          pendingGame = gameId;
          pendingFallbackLaunch = launchUrl;
          apiModal.classList.remove("hidden");
          apiKeyInput.value = "";
          apiKeyInput.focus();
          return; // Stop execution here until the modal is resolved
        }
      }

      // 3. Launch immediately if no API is required, or if the key already exists
      selectGame(gameId, launchUrl);
    });
  });

  // Manual reset/update entrypoint for the Mindweave BYOK token
  btnResetMindweaveApi.addEventListener("click", () => {
    pendingGame = "";
    pendingFallbackLaunch = "";

    apiModal.classList.remove("hidden");
    apiKeyInput.value = localStorage.getItem("mindweave_llm_api_key") || "";
    apiKeyInput.focus();

    statusEl.textContent = "Update your Mindweave API key and save to continue.";
  });

  // Modal Cancel Button
  btnCancelApi.addEventListener("click", () => {
    apiModal.classList.add("hidden");
    pendingGame = "";
    pendingFallbackLaunch = "";
    statusEl.textContent = "Launch aborted. Awaiting game selection...";
  });

  // Modal Save & Launch Button
  btnSaveApi.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      // Save to local storage (Frontend only)
      localStorage.setItem("mindweave_llm_api_key", key);
      apiModal.classList.add("hidden");

      // Proceed with the server launch sequence
      if (pendingGame && pendingFallbackLaunch) {
        selectGame(pendingGame, pendingFallbackLaunch);
        // Reset pending state
        pendingGame = "";
        pendingFallbackLaunch = "";
      }
    } else {
      // Provide visual feedback for an empty input
      apiKeyInput.style.borderColor = "var(--traffic-red)";
      setTimeout(() => (apiKeyInput.style.borderColor = ""), 1000);
    }
  });

  // Initialize the availability check on load
  loadAvailability();
});
