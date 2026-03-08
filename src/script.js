const statusEl = document.getElementById("status");
const spinnerEl = document.getElementById("spinner");

async function loadAvailability() {
  try {
    const response = await fetch("/api/games");
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const games = Array.isArray(payload.games) ? payload.games : [];
    const byKey = Object.fromEntries(games.map((item) => [item.key, item]));

    document.querySelectorAll(".game-card").forEach((button) => {
      const gameKey = button.dataset.game;
      const config = byKey[gameKey];
      if (!config || config.available) {
        return;
      }
      button.disabled = true;
      button.title = config.reason || "Game unavailable";
    });
  } catch (error) {
    console.warn("Could not fetch game availability", error);
  }
}

async function selectGame(game, fallbackLaunch) {
  statusEl.textContent = `Initializing ${game.replace("_", " ")}...`;
  spinnerEl.classList.remove("hidden");

  try {
    const response = await fetch("/api/select-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game })
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

document.querySelectorAll(".game-card").forEach((button) => {
  button.addEventListener("click", () => {
    if (!button.disabled) {
      selectGame(button.dataset.game, button.dataset.launch);
    }
  });
});

loadAvailability();
