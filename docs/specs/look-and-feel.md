# Spec: Look and feel

## Look and feel

The look follows Accountable's brand guidelines, which take priority over any general design guidance. Light mode by default; a toggle in the top bar switches to dark mode on every page, the app remembers the choice, and it never follows the device's own setting. Designed for a laptop or desktop screen. The copy stays neutral: it doesn't assume the user is the business owner or a hired salesperson.

## Design

Follow the brand skill: Instrument Sans headings/body, Instrument Serif accent, JetBrains Mono for numbers and money. Two modes, one set of color tokens each, no scattered overrides. Light mode, the default — page background `#F0F4F5`, white rounded panels with no outline, Midnight `#073B4C` for ink. Dark mode — page background `#04232E`, black rounded panels with no outline, Sea Mist `#CDD8DB` for ink. Sea Green / Marigold / Coral for three side-by-side things (stages, chart series), Cerulean fourth, Raspberry fifth, in both modes; darken Sea Green and Marigold for small text on light backgrounds and lighten them on dark ones. Dark mode text meets WCAG AA (4.5:1 normal text, 3:1 large text and UI elements). Charts, dialogs and messages follow the mode. No one-edge borders, no gradient fills. Plain, neutral business copy, no exclamation marks. Laptop/desktop layout.

## Design decisions

Points this spec fixes:

1. **Fonts are bundled, not fetched.** Brand fonts (Instrument Sans, Instrument Serif, JetBrains Mono) come from Google Fonts, but the app must work offline. The font files are bundled locally so the app needs no connection.
7. **Dark mode meets WCAG AA.** Dark mode text holds 4.5:1 for normal text and 3:1 for large text and UI elements; light mode's contrast is unchanged.
