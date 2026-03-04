# AI Game Project

This project is a full-stack application featuring a React frontend and a Python-based AI backend.

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)

## Installation

1.  **Clone the repository** (or download the source code).

2.  **Install Frontend/Backend Dependencies**:
    Open a terminal in the project root and run:
    ```bash
    npm install
    ```

3.  **Install Python Dependencies**:
    It is recommended to use a virtual environment.
    
    **On macOS/Linux:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

    **On Windows:**
    ```bash
    python -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt
    ```

4.  **Environment Setup**:
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    (On Windows, use `copy .env.example .env`)

---

## 🧠 Strategy Tips

- Use Scouts to claim core tiles quickly – their value 1 combined with the center multiplier (2) gives 2 points, helping toward the 5‑point threshold.  
- Wardens are durable and can hold core positions.  
- The Strategos is fragile but high‑value; protecting it is vital, but a well‑timed dash to the center can win the game instantly.  
- Timing of token numbers matters: higher tokens win clashes, but lower tokens might still be useful for moves or claims if you expect no clash.  
- Watch for collisions – a well‑coordinated move can eliminate an enemy unit without spending an attack token.

---

## Running the Application

1.  **Start the Development Server**:
    Ensure your Python virtual environment is activated (if you used one).
    
    ```bash
    npm run dev
    ```

    This command will:
    - Start the Node.js/Express server on port 3000.
    - Automatically start the Python AI server on port 5000.
    - Launch the Vite development server for the frontend.

2.  **Access the App**:
    Open your browser and navigate to:
    [http://localhost:5000](http://localhost:5000)

## Troubleshooting

-   **AI Server Issues**: If the AI features aren't working, check the terminal output for errors related to the Python process. Ensure all Python dependencies are installed correctly.
-   **Port Conflicts**: The app uses ports 3000 (Web) and 5000 (AI). Ensure these ports are free.

---

## AI Agent Architecture

The AI opponent in Chronos: Clash of Wills is powered by four specialized agents working together. Each agent handles a distinct aspect of intelligence:

-   **Knowledge Agent** – Provides strategic context by retrieving relevant game rules and tactics from pre‑loaded documents (e.g., strategy guides). It answers queries like “Chronos game strategy and piece value” and returns text snippets that influence move scoring.

-   **Planning Agent** – Generates a high‑level plan to guide move selection. It receives the current game state and the strategy context, then uses hierarchical task network (HTN) planning to produce a sequence of steps. Moves that align with this plan receive a scoring bonus.

-   **Execution Agent** – (Primarily for future expansion) Intended to carry out planned actions and handle low‑level execution details. Currently, move scoring is performed heuristically within the AI player, but this agent could bridge planning and physical/virtual action execution.

-   **Learning Agent** – Improves the AI over time by learning from game outcomes. After each match, it observes the result (win/loss) and updates an internal meta‑controller that selects among different learning strategies (DQN, MAML, RSI, RL). This enables the AI to adapt its behavior to different situations.

These agents are orchestrated by the AIPlayer class during each turn: first gather knowledge, then create a plan, then score moves using the plan and knowledge, and finally learn from the game’s result.

flowchart TD
    subgraph During_Turn [During a Turn]
        A[Game State] --> B[Knowledge Agent]
        A --> C[Planning Agent]
        B -->|Strategy Context| C
        C -->|High‑Level Plan| D[Execution / AIPlayer]
        D -->|Heuristic Scoring| E[Selected Move]
    end

    subgraph Post_Game [Post‑Game]
        E --> F[Game Result]
        F --> G[Learning Agent]
        G -->|Updates Meta‑Controller| H[Improved Strategy Selection]
        H -.->|Future Turns| C
    end

    style B fill:#e1f5fe,stroke:#01579b
    style C fill:#fff3e0,stroke:#e65100
    style D fill:#f1f8e9,stroke:#33691e
    style G fill:#fce4ec,stroke:#880e4f