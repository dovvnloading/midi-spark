# README screenshot sources

The images in this directory are **real Chromium screenshots**, not mockups or design renders.

Updated **2026-11-09** from successful [Browser UX checks run #42700759239](https://github.com/dovvnloading/midi-spark/actions/runs/42700759239), which tested main commit [`e6d8c28`](https://github.com/dovvnloading/midi-spark/commit/e6d8c28f498d5ea77d9180f2b6d105a0f0e28375). The run's `browser-review` artifact supplied the pixels.

| Image referenced by README | Source screenshot in browser-review | Browser viewport |
| --- | --- | --- |
| `desktop-editor.png` | `workbench-1440.png` | 1440 × 900 |
| `melody-follow.png` | `melody-follow.png` | 1280 × 800 |
| `note-lab.png` | `transform-desktop.png` | 1440 × 900 |
| `mobile-piano-roll.png` | `workbench-390.png` | 390 × 844 |
| `mobile-compose.png` | `mobile-inspector.png` | 375 × 667 |
| `mobile-tracks.png` | `touch-accessibility-390.png` | 390 × 844 |
| `empty-state.png` | `empty-desktop.png` | 1440 × 900 |

## Re-capture after UI changes

1. From the repository root, run `npm ci && npm run build`.
2. Start `npm run preview -- --host 127.0.0.1 --port 4173`.
3. Install Playwright (`python -m pip install playwright==1.57.0 && python -m playwright install chromium`), then run `python scripts/browser_smoke.py --url http://127.0.0.1:4173 --output browser-report` in a separate terminal. Set `CHROMIUM_PATH` for system Chrome/Chromium if needed.
4. Inspect the resulting PNGs; replace the named files using the mapping above. Update this note's source revision and date, and check README image links.

The suite creates a randomized music pattern in some frames; changing notes between runs is expected. Treat these captures as *documentation of browser-observed UI*, not musical-quality test results or a promise of identical pixels across environments.
