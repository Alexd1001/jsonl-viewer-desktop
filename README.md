<div align="center">
  <img src="jsonl-gazelle.png" alt="JSONL Gazelle Desktop" width="180">
  <h1>JSONL Gazelle Desktop</h1>
  <p><strong>Fast, standalone JSONL / NDJSON / JSON desktop viewer and editor with a BBEdit-style document sidebar for macOS, Windows, and Linux.</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#quick-start-development">Quick Start</a> •
    <a href="#macos-installation--dmg">macOS (DMG)</a> •
    <a href="#windows-setup-powershell">Windows (PowerShell)</a> •
    <a href="#linux-setup-appimage--deb">Linux (AppImage / DEB)</a> •
    <a href="#keyboard-shortcuts">Shortcuts</a> •
    <a href="#license">License</a>
  </p>
</div>

---

## Overview

**JSONL Gazelle Desktop** brings the power of [JSONL Gazelle](https://github.com/gaborcselle/jsonl-gazelle) into a dedicated, cross-platform desktop application supporting **macOS**, **Windows**, and **Linux**.

Designed for data scientists, AI researchers, and developers working with LLM datasets, log records, and streaming JSON, it pairs high-speed virtualized table rendering with a multi-file document sidebar.

---

## Features

- **Exact Visual & Feature Parity with Gazelle:**
  - **Table View:** Virtualized high-speed table rendering capable of smoothly loading and paging large `.jsonl` files.
  - **Smart Column Detection & Expansion:** Automatically discovers nested JSON fields and allows one-click expansion (e.g. `user.profile.name`).
  - **Spreadsheet Navigation:** Arrow key cell cursor, inline cell editing, and type-aware column sorting (currencies, timestamps, version strings, numbers).
  - **Pretty Print & Raw Views:** Powered by Monaco Editor with syntax coloring, folding, and record navigation.
  - **Find & Replace:** Full-text regex search and replace across the entire dataset.
  - **Export to CSV:** Instant CSV export (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>E</kbd>) preserving current column visibility and filters.

- **Document Sidebar (BBEdit-Style):**
  - **Multi-File Management:** Open and switch across multiple `.jsonl`, `.ndjson`, or `.json` files in a single window.
  - **Pinned Documents:** Pin critical datasets to the top section of the sidebar.
  - **Drag-and-Drop Reordering:** Freely reorder open documents within the sidebar.
  - **Context Menu:** Right-click actions for *Close*, *Close Others*, *Close All*, *Close Below*, *Pin / Unpin*, *Reveal in File Manager*, and *Copy Path*.
  - **Collapsible Sidebar (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>B</kbd>):** Hide or show the sidebar anytime to give your dataset maximum screen real estate.

- **Seamless Native File Handling:**
  - **System File Associations:** Double-clicking any `.jsonl`, `.ndjson`, or `.json` file attaches it directly to the sidebar.
  - **Drag & Drop Anywhere:** Drag files directly from your file manager (Finder, File Explorer, Nautilus/Dolphin) onto either the sidebar or the home screen to open them immediately.
  - **Escape to Home:** Press <kbd>Esc</kbd> anytime to return to the drop zone / home screen.
  - **Session State Restoration:** Remembers open documents, pin statuses, and active selection across application restarts.

- **Dark & Light Modern Themes:**
  - Styled with VS Code's **Dark Modern** theme by default.
  - Switch to **Light Modern** anytime with <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>T</kbd> or via the application menu.

---

## Quick Start (Development)

Requires [Node.js](https://nodejs.org/) (v18 or higher) and `npm`.

```bash
# 1. Clone the repository
git clone https://github.com/your-username/json-viewer-gazelle.git
cd json-viewer-gazelle

# 2. Install dependencies
npm install

# 3. Launch the app in development
npm start
```

---

## macOS: Installation & DMG

### Pre-built DMG
If downloading a release from GitHub:
1. Download `JSONL-Gazelle-1.0.0-Intel.dmg`.
2. Open the disk image and drag **JSONL Gazelle** into your **Applications** folder.
3. *(Optional)* Set as default viewer: Right-click any `.jsonl` file in Finder ➔ **Get Info** (<kbd>Cmd</kbd>+<kbd>I</kbd>) ➔ Under **Open with**, select **JSONL Gazelle** ➔ Click **Change All...**.

### Building the DMG locally on macOS
```bash
npm run dist:dmg
```
The installer will be generated at `dist/JSONL-Gazelle-1.0.0-Intel.dmg`.

---

## Windows: Setup & Building (PowerShell / CMD)

### 1. Run in Development
```powershell
git clone https://github.com/your-username/json-viewer-gazelle.git
cd json-viewer-gazelle

npm install
npm start
```

### 2. Build Standalone Installer or Portable App
```powershell
npm run dist:win
```
This produces:
- `dist/JSONL Gazelle Setup 1.0.0.exe` — Standard NSIS Windows desktop installer.
- `dist/JSONL Gazelle 1.0.0.exe` — Standalone portable executable.

---

## Linux: Setup & Building (AppImage / DEB)

### 1. Run in Development
```bash
git clone https://github.com/your-username/json-viewer-gazelle.git
cd json-viewer-gazelle

npm install
npm start
```

### 2. Build Linux AppImage, DEB, or tar.gz
```bash
npm run dist:linux
```
This produces:
- `dist/JSONL Gazelle-1.0.0.AppImage` — Universal standalone Linux binary (run `chmod +x` and launch on Ubuntu, Fedora, Arch, Debian, etc.).
- `dist/jsonl-gazelle-app_1.0.0_amd64.deb` — Debian/Ubuntu installation package (`sudo dpkg -i ...`).
- `dist/JSONL Gazelle-1.0.0.tar.gz` — Portable archive.

---

## Keyboard Shortcuts

| macOS | Windows / Linux | Action |
| :--- | :--- | :--- |
| <kbd>Cmd</kbd> + <kbd>O</kbd> | <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open File Dialog |
| <kbd>Cmd</kbd> + <kbd>W</kbd> | <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close Current Document |
| <kbd>Cmd</kbd> + <kbd>B</kbd> | <kbd>Ctrl</kbd> + <kbd>B</kbd> | Toggle Sidebar (Show / Hide) |
| <kbd>Cmd</kbd> + <kbd>T</kbd> | <kbd>Ctrl</kbd> + <kbd>T</kbd> | Toggle Theme (Dark / Light) |
| <kbd>Cmd</kbd> + <kbd>E</kbd> | <kbd>Ctrl</kbd> + <kbd>E</kbd> | Export Active File to CSV |
| <kbd>Cmd</kbd> + <kbd>D</kbd> | <kbd>Ctrl</kbd> + <kbd>D</kbd> | Diff with Git HEAD |
| <kbd>Cmd</kbd> + <kbd>F</kbd> / <kbd>Cmd</kbd> + <kbd>H</kbd> | <kbd>Ctrl</kbd> + <kbd>F</kbd> / <kbd>Ctrl</kbd> + <kbd>H</kbd> | Find / Find & Replace in Table View |
| <kbd>Esc</kbd> | <kbd>Esc</kbd> | Return to Home Screen (or dismiss menus) |
| <kbd>Arrow Keys</kbd> | <kbd>Arrow Keys</kbd> | Navigate table cell cursor |
| <kbd>Enter</kbd> / <kbd>F2</kbd> | <kbd>Enter</kbd> / <kbd>F2</kbd> | Edit selected table cell |

---

## Credits & Acknowledgments

This desktop app builds upon the core parsing and webview engine developed by **Gabor Cselle** in [jsonl-gazelle](https://github.com/gaborcselle/jsonl-gazelle).

---

## License

This project is licensed under the [MIT License](LICENSE).
