# Slate & Earth — studio color direction

The default visual identity is **neutral gray, with warm earth tones and restrained olive accents**, rather than a green-tinted dark UI. This document records the intent so new controls follow the existing system rather than reintroducing green everywhere.

## Visual hierarchy

- **Main editor:** pale warm-gray paper (#ECEDEA), canvas (#D9DBD7), graphite notes/rulers and labels (#282E2C). The grid and scale overlays remain clear while colored MIDI notes stay distinctive.
- **Shell and Compose inspector:** neutral charcoal (#373C3E, #484E50) for tools, navigation, sound selection and sidebar forms. The darkness is a framing device, not a green tint.
- **Primary actions:** muted clay and sand (#C8A78A). Play and Generate are warm stone, not luminous lime.
- **Musical selections:** muted olive (#7B8D76), limited to active modes, chord locks and other semantically selected states. Green still belongs in the ident and some MIDI note colors.
- **Supporting accents:** muted ochre (#B39B74) for section indicators and secondary musical structure.
- **Important boundaries:** darker gray strokes on the light editor and lighter gray strokes in charcoal panels. The contrast rule is not to reuse one border shade across both backgrounds.

Implementation lives in `src/earth.css`, loaded after the original layout styles. It intentionally changes color, not spacing, transport behavior or MIDI geometry. The first-party accessibility suite checks representative text contrast (at least 4.5:1) and major nontext-control boundaries (at least 3:1), plus responsive/zoomed and touch states. This is a sampled browser audit, not a blanket accessibility-conformance claim.

## Working on the palette

Make future color decisions primarily in `src/earth.css`; avoid adding new bright-green hex values directly to components. Prefer `--earth-*` tokens. If a control has a colored meaning (track identity, selected note, pending lock), preserve that semantics instead of flattening all visual color.

The app still uses a **4/4 piano-roll grid**. This visual refresh does not change any musical timing, generation algorithms or data formats.
