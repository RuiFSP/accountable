# Spec: Pipeline

- **Pipeline**: the deals as cards on a board, one column per stage. Drag a card to another column to change the deal's stage, or within a column to change its place; a card can be dropped anywhere in a column, and it stays where it was dropped. A new deal can be added straight into a column, at that stage. The board shows the total value and expected revenue of the deals still open, each column shows its own, and the figures change as soon as a card moves. The six columns share the width on a laptop screen, so none of them is cut off; on a narrower window the board scrolls sideways and shows its scrollbar.

## Design decisions

Points this spec fixes:

3. **Position within a pipeline column.** A card dropped anywhere in a column keeps its exact slot, so every deal stores a `position`, renumbered on every drop. Refresh behaviour is covered by a test.
