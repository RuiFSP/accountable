# Spec: Look and feel

## Look and feel

The look follows Accountable's brand guidelines, which take priority over any general design guidance. Light mode by default; on every signed-in page, a menu under your initials in the top bar holds Settings, the theme — light, dark or system — and signing out. The app remembers the theme choice, and system follows the device's own setting. Designed for a laptop or desktop screen. The copy stays neutral: it doesn't assume the user is the business owner or a hired salesperson.

## Design

Follow the brand skill: Instrument Sans headings/body, Instrument Serif accent, JetBrains Mono for numbers and money. Two modes, one set of color tokens each, no scattered overrides. Light mode, the default — page background `#F0F4F5`, white rounded panels with no outline, Midnight `#073B4C` for ink. Dark mode — page background `#04232E`, black rounded panels with no outline, Sea Mist `#CDD8DB` for ink. Sea Green / Marigold / Coral for three side-by-side things (stages, chart series), Cerulean fourth, Raspberry fifth, in both modes; darken Sea Green and Marigold for small text on light backgrounds and lighten them on dark ones. Dark mode text meets WCAG AA (4.5:1 normal text, 3:1 large text and UI elements). Charts, dialogs and messages follow the mode. No one-edge borders, no gradient fills. Plain, neutral business copy, no exclamation marks. Laptop/desktop layout. The Settings page uses the same rounded panel, labelled fields, Sea Green primary save button and Raspberry error line as the record forms, in both modes. The quote preview and its PDF are the customer's paper rather than the app: a white page with Midnight ink and a Sea Green accent in both themes, Instrument Sans for the text, Instrument Serif for the title, JetBrains Mono for the number and every amount, and money always with its currency. No gradients and no one-edge borders there either.

## Design decisions

Points this spec fixes:

1. **Fonts are bundled, not fetched.** Brand fonts (Instrument Sans, Instrument Serif, JetBrains Mono) come from Google Fonts, but the font files are bundled locally, so a page load never waits on Google Fonts and the brand comes from the app itself.
7. **Dark mode meets WCAG AA.** Dark mode text holds 4.5:1 for normal text and 3:1 for large text and UI elements; light mode's contrast is unchanged.
11. **The theme lives in the user menu.** The top-bar toggle is gone: the menu under your initials offers light, dark or system, the choice is remembered, and system follows the device's own setting.
18. **A 1024px laptop fits everything.** With seven sections, the top bar keeps room for the search box and New deal by tightening its gaps and link padding below 1180px, and the tables tighten their cell padding, so the page never scrolls sideways.
19. **Document statuses use the agreed tones.** Status badges always name their status, and their tone is one of the shared badge tones: Draft and Void are quiet on the page color; Sent, Issued and Unpaid are information in Cerulean; Part paid is Marigold; Accepted and Paid are Sea Green; Expired, Declined and Overdue are Raspberry. No new colors are added for documents, and the contrast test checks every badge.
20. **Bill categories use the brand's palette.** Software is Sea Green, Contractors Marigold, Travel Coral, Office Cerulean and Marketing Raspberry — the five colors in the order the brand gives them — and Other takes the quiet ink-muted tone rather than a sixth color the brand doesn't have. The category's color sits in a dot beside its name in the table and in the chart legend, never instead of the name, and the spending chart uses the same six keys in both modes. A bill's status keeps decision 19's tones: Unpaid Cerulean, Overdue Raspberry, Paid Sea Green.
