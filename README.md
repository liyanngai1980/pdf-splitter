# PDF Page Splitter (Web Tool)

A fast, elegant, client-side web application for inspecting and splitting PDF documents after reading the total number of pages.

Runs **100% locally in your browser** — no files are uploaded to any server, guaranteeing privacy and data security.

**Live Demo / GitHub Pages:** [https://liyanngai1980.github.io/pdf-splitter/](https://liyanngai1980.github.io/pdf-splitter/)

---

## 🌟 Key Features

1. **Instant Page Count & Metadata Reading**:
   - Immediately calculates and displays the **total page count** (e.g. `📄 12 Pages`) as soon as you drop or select a PDF file.
   - Shows document file size, dimensions (A4, Letter, Legal), and page orientation (Portrait / Landscape).

2. **Visual Page Grid & Thumbnails**:
   - Renders live interactive thumbnail previews for every page.
   - Page selection tools: "Select All", "Deselect All", "Odd Pages", "Even Pages", and "Invert Selection".
   - Zoom in on any page with full-resolution lightbox preview.

3. **5 Flexible Splitting Modes**:
   - **Mode 1: Split Every Page**: Extracts all pages into separate 1-page PDF files.
   - **Mode 2: By Page Ranges**: Custom intervals such as `1-3, 4-6, 7-10` or `1, 3, 5-8`. Includes syntax validator and presets.
   - **Mode 3: Fixed Chunks**: Split into consecutive blocks of N pages (e.g., every 2 pages, every 5 pages).
   - **Mode 4: Extract Selected Pages**: Pick pages from the visual grid and save them as either one merged PDF or separate files.
   - **Mode 5: Remove / Delete Pages**: Select unwanted pages to delete, generating a clean PDF with remaining pages.

4. **One-Click Downloads & ZIP Export**:
   - Download individual split PDF files with in-browser preview links.
   - **"Download All as ZIP"** packages all split files into a single zip archive (`split_document.zip`) using JSZip.
   - Live progress indicator showing exact page extraction percentage.

5. **Apple-Inspired Design System**:
   - Modern SF-style aesthetics, smooth transitions, drag-and-drop animation.
   - Light and Dark mode toggle (persisted in local storage).
   - Completely offline: all libraries (`pdf-lib`, `pdf.js`, `jszip`) are bundled locally in `lib/`.

---

## 🚀 How to Launch & Use

### Option 1: Open Directly in Browser
Double-click `open.command` or `index.html` in Finder, or run in terminal:
```bash
open /Users/local/pdf-splitter/index.html
```

### Option 2: Run via Local HTTP Server
```bash
python3 /Users/local/pdf-splitter/server.py
```
This opens `http://localhost:8085` in your default browser.

---

## 🌐 Publishing to GitHub Pages

1. Create a new public repository named `pdf-splitter` on your GitHub account:
   [https://github.com/new?name=pdf-splitter](https://github.com/new?name=pdf-splitter)
2. Push the committed code:
   ```bash
   cd /Users/local/pdf-splitter
   ./push_to_github.sh
   # or: git push -u origin main
   ```
3. Enable GitHub Pages in your repository settings:
   - Go to **Settings** → **Pages**
   - Under **Build and deployment**, select **Deploy from a branch** (`main` / `/ (root)`) or **GitHub Actions**
   - The web tool will be live at: `https://liyanngai1980.github.io/pdf-splitter/`
