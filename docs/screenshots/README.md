# README screenshot sources

These Chromium captures show the studio’s graphite and steel-blue palette and custom icons. They were captured on 2026-11-14 from a production build.

| Image referenced by README | Capture source | Browser viewport |
| --- | --- | --- |
| `desktop-editor.png` | Four-bar phrase in Select mode, fitted to the canvas | 1440 × 900 |
| `melody-follow.png` | `melody-follow.png` | 1280 × 800 |
| `note-lab.png` | `transform-desktop.png` | 1440 × 900 |
| `mobile-piano-roll.png` | Same phrase, zoomed to its second bar | 390 × 844 |
| `mobile-compose.png` | `mobile-inspector.png` | 375 × 667 |
| `mobile-tracks.png` | `touch-accessibility-390.png` | 390 × 844 |
| `empty-state.png` | `empty-desktop.png` | 1440 × 900 |

## Re-capture after UI changes

1. From the repository root, run `npm ci && npm run build`.
2. Start `npm run preview -- --host 127.0.0.1 --port 4173`.
3. Install Playwright (`python -m pip install playwright==1.57.0 && python -m playwright install chromium`), then run `python scripts/browser_smoke.py --url http://127.0.0.1:4173 --output browser-report` in a separate terminal. Set `CHROMIUM_PATH` for system Chrome/Chromium if needed.
4. Run `python scripts/browser_accessibility.py --url http://127.0.0.1:4173 --output browser-report` for the mobile Tracks capture.
5. For the two phrase captures, start a blank pattern at 120 BPM. In Stamp, place the Four-chord pop preset on C3 at bar 1. Set Snap to 1/8 and draw a melody above the four chords, varying its lengths and velocities. Select an A4 on the second half of beat 2 in bar 2 and seek to its onset. At 1440 × 900 use Fit to frame the full phrase. At 390 × 844 use Fit, then zoom in until bar 2 fills the visible grid and scroll to that bar.
6. Inspect the PNGs and replace the named files using the mapping above. Update the capture date and check the README image links.

The suite creates a randomized music pattern in some frames; changing notes between runs is expected. Treat these captures as *documentation of browser-observed UI*, not musical-quality test results or a promise of identical pixels across environments.
