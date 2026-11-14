# Studio palette and icons

MIDI Spark pairs graphite transport and inspector panels with a light silver piano roll. Steel blue marks primary actions, focus, and musical selections.

| Element | Color treatment |
| --- | --- |
| Studio chrome | Graphite surfaces with silver text. Control borders use lighter strokes on dark panels and darker strokes on the light editor. |
| Play, Generate, and Export | Steel-blue fills. The dark panels use light blue with dark type, while the empty editor uses a deeper blue with white type. |
| Piano roll | Dark ink on light keys. Selected notes use a deep blue with light pitch labels. Sounding notes turn graphite. |
| Track identity | Six subdued swatches appear on notes, velocity bars, and mixer strips. |
| Warnings and destructive actions | Muted warm tones accompany an icon or text label. |

The palette lives in `src/earth.css` and the component stylesheets. Track swatches are shared through `src/lib/constants.ts`. The browser accessibility checks sample text contrast at 4.5:1 and control boundaries at 3:1 on the editor and sound library.

The browser tab, loading screen, and studio header share `public/favicon.svg`. Its three staggered note bars form an S. The control icons in `src/components/StudioIcons.tsx` share a 20-unit drawing grid and inherit their control's color.
