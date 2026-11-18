# Spec: Look and feel

## Look and feel

The look follows Accountable's brand guidelines, which take priority over any general design guidance. Light mode by default; a menu under your initials in the top bar holds the theme — light, dark or system — on every page, the app remembers the choice, and system follows the device's own setting. Designed for a laptop or desktop screen. The copy stays neutral: it doesn't assume the user is the business owner or a hired salesperson.

## Design

Follow the brand skill: Instrument Sans headings/body, Instrument Serif accent, JetBrains Mono for numbers and money. Two modes, one set of color tokens each, no scattered overrides. Light mode, the default — page background `#F0F4F5`, white rounded panels with no outline, Midnight `#073B4C` for ink. Dark mode — page background `#04232E`, black rounded panels with no outline, Sea Mist `#CDD8DB` for ink. Sea Green / Marigold / Coral for three side-by-side things (stages, chart series), Cerulean fourth, Raspberry fifth, in both modes; darken Sea Green and Marigold for small text on light backgrounds and lighten them on dark ones. Dark mode text meets WCAG AA (4.5:1 normal text, 3:1 large text and UI elements). Charts, dialogs and messages follow the mode. No one-edge borders, no gradient fills. Plain, neutral business copy, no exclamation marks. Laptop/desktop layout.

## Design decisions

Points this spec fixes:

1. **Fonts are bundled, not fetched.** Brand fonts (Instrument Sans, Instrument Serif, JetBrains Mono) come from Google Fonts, but the font files are bundled locally, so a page load never waits on Google Fonts and the brand comes from the app itself.
7. **Dark mode meets WCAG AA.** Dark mode text holds 4.5:1 for normal text and 3:1 for large text and UI elements; light mode's contrast is unchanged.
11. **The theme lives in the user menu.** The top-bar toggle is gone: the menu under your initials offers light, dark or system, the choice is remembered, and system follows the device's own setting.
