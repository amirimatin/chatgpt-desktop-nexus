# Codex Desktop Nexus

Standalone Local Web Dashboard and Monokai Markdown Color Theme Patcher for **OpenAI Codex Desktop (ChatGPT Desktop)** and Codex CLI.

## ✨ Features

- **🌐 Standalone Local Web Dashboard (Zero LLM Dependency)**:
  - Runs locally on `http://127.0.0.1:4321`.
  - Built with pure Node.js standard libraries (zero third-party dependencies).
  - Completely decoupled from model availability: switch providers and models instantly even when a provider is offline or throwing 500/502/401 errors.
  - Multi-provider manager: add, update, test, and switch custom OpenAI-compatible providers (OmniRoute, OpenRouter, DeepSeek, Local vLLM/Ollama, etc.).
  - Live model list fetcher via `/models` endpoint.
  - Named model profiles: save and reuse a `provider + model` pair without duplicating provider configuration or credentials.
  - Multilingual interface (Persian RTL & English LTR).
  - Material Design 3 theme with Dark / Light mode toggle.

- **🎨 Monokai Markdown Color & Typography Theme for Desktop**:
  - Injects a refined Monokai color palette into Codex Desktop's conversation view (`webview/index.html` in `app.asar`).
  - Distinct colors for Headings (H1 to H6), inline code, code blocks, blockquotes, list markers, and tables.
  - **Preserves native font (Vazirmatn) and native RTL direction** of Codex Desktop.
  - Clean backup & restore mechanism.

## 🚀 Quick Start

### 1. Launch Local Web Dashboard
```bash
npm run dashboard
# or with CLI
./bin/cli.js dashboard --port 4321
```
Open **`http://127.0.0.1:4321`** in your browser.

### 2. Check Desktop Theme Status
```bash
npm run status:desktop
```

### 3. Apply Monokai Theme to Desktop
```bash
sudo npm run patch:desktop
```
Restart Codex Desktop to activate the new colors.

After patching, the model selector is a compact dropdown in the chat header, alongside the project and branch details. Choose a saved profile to apply its provider and model, or choose a provider/model pair and use **Save profile** to create a preset. Presets are stored locally in `~/.codex/nexus-model-profiles.json`; they never contain API keys or other provider credentials. If the current desktop version does not expose a compatible chat header, the selector remains hidden instead of floating elsewhere in the app.

### 4. Restore Default Desktop Styling
```bash
sudo npm run restore:desktop
```

### 5. CLI Provider Commands
```bash
./bin/cli.js provider list
./bin/cli.js provider use omniroute antigravity/gemini-3.8-flash-high
```

## 🧪 Tests
```bash
npm test
```
