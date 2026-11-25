# Take a tour

Design boards for the guided tour: a small card anchored beside the real control it explains. Made on 2026-11-25. These are targets, not a record of what is built; each note on the canvas says what exists today.

| Page | Board | What it shows | Tweaks |
| --- | --- | --- | --- |
| Tour card | `TourCard.dc.html` | The card, the highlight ring, "Step N of M", Back, Skip this step, Next and close. Stages: an ordinary step, a step whose control is hidden (the card says so and offers to show it), and the finished card. | theme, accent, motion, stage, step |
| Tours for each page | `PageTours.dc.html` | A short tour for Home, Map, Work and Servers, each two or three steps on that page's own controls. | theme, accent, motion, destination, step |
| Where the tour starts | `TourEntries.dc.html` | The command palette row "Take a tour", the list in Help, the rows in Settings and the one-time offer after setup. | theme, accent, motion, entry |

## Rules the boards carry

- Each step points at a live control and moves focus to it. A step never points at nothing: when its control is hidden, the card says so and offers the way to reveal it.
- The tour is offered once after setup and never forced. Closing it never blocks the page, and it resumes where it stopped.
- Esc closes. Left and Right move between steps while focus is in the card. Each step is announced to screen readers.
- With motion off, or when the system asks for reduced motion, the ring and the card are still.
- The accent, theme and motion levers use the same names and defaults on all three boards.

## Not done

- No rendered frames or review pass were made for these boards.
- `support.js` is the canvas runtime the boards load; it is not application code.
