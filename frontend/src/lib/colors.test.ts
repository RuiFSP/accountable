/**
 * The one-place rule for color (docs/changes/dark-mode/plan.md):
 * every color literal under src/ lives in brand.css, the light :root values
 * never drift from the values the app shipped with, the dark palette holds
 * WCAG AA (docs/spec.md design decision 7), and every badge's text clears
 * 4.5:1 in both modes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const BRAND_CSS = path.join(SRC_DIR, "styles", "brand.css");

/** #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba()/hsl()/hsla(). */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;

const VAR_REFERENCE = /var\(\s*(--[\w-]+)/g;

/** Tokens holding a color (or a color inside a shadow); fonts/radii are not. */
const isColorToken = (name: string): boolean =>
  /^--(color|tint|border|wash|overlay|shadow)/.test(name);

/** Every file under src/, so nothing can hide a literal outside the CSS. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  };
  walk(SRC_DIR);
  return files;
}

/** The custom properties declared inside one selector's block. */
function parseBlock(css: string, selector: RegExp): Record<string, string> {
  const raw = css.match(selector)?.[1] ?? "";
  // Strip comments first: a semicolon inside one would otherwise split a
  // declaration in half and drop the token.
  const body = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  for (const declaration of body.split(";")) {
    const [name, ...rest] = declaration.split(":");
    const token = name.trim();
    if (token.startsWith("--")) {
      tokens[token] = rest.join(":").trim();
    }
  }
  return tokens;
}

function parseBrandCss(): {
  light: Record<string, string>;
  dark: Record<string, string>;
  css: string;
} {
  const css = fs.readFileSync(BRAND_CSS, "utf8");
  return {
    light: parseBlock(css, /:root\s*\{([^}]*)\}/),
    dark: parseBlock(css, /\[data-theme="dark"\]\s*\{([^}]*)\}/),
    css,
  };
}

/** Only the color-bearing tokens, which is what the rules below pin down. */
function colorTokens(tokens: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).filter(([name]) => isColorToken(name)),
  );
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(value: string): Rgba {
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const full =
      hex.length <= 4
        ? hex
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    throw new Error(`Not a color: ${value}`);
  }
  const [r, g, b, a = "1"] = match[1].split(",").map((part) => part.trim());
  return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
}

/** A translucent color over an opaque one, as the browser composites it. */
function over(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** WCAG 2.x relative luminance. */
function luminance({ r, g, b }: Rgba): number {
  const linear = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio, 1 to 21. */
function contrast(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The custom property a declaration points at, e.g. the color token. */
function declaredToken(block: string, property: string): string | undefined {
  return block.match(new RegExp(`${property}:\\s*var\\((--[\\w-]+)\\)`))?.[1];
}

/** Every rule that gives a badge a fill, so a new badge can't skip the check. */
function badgeRules(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({
      selector: match[1].trim(),
      body: match[2].replace(/\/\*[\s\S]*?\*\//g, ""),
    }))
    .filter(
      ({ selector, body }) =>
        selector.includes(".badge") && body.includes("background: var("),
    );
}

/** Today's light values — the light mode must not drift (plan risk 3). */
const LIGHT: Record<string, string> = {
  "--color-page": "#f0f4f5",
  "--color-panel": "#ffffff",
  "--color-ink": "#073b4c",
  "--color-ink-muted": "#597b87",
  "--color-sea-green": "#06d6a0",
  "--color-sea-green-ink": "#049670",
  "--color-marigold": "#ffc145",
  "--color-marigold-ink": "#a87c00",
  "--color-coral": "#f78c6b",
  "--color-cerulean": "#118ab2",
  "--color-raspberry": "#ef476f",
  "--color-sea-mist": "#cdd8db",
  "--tint-sea-green": "#e0faf3",
  "--tint-marigold": "#fff4dc",
  "--tint-coral": "#fdece5",
  "--tint-cerulean": "#e4f2f8",
  "--tint-raspberry": "#fde7ed",
  "--color-on-primary": "#073b4c",
  "--color-on-danger": "#ffffff",
  "--color-danger-hover": "#d93a61",
  "--color-btn-bg": "#ffffff",
  "--color-grid": "#e2e9eb",
  "--color-tooltip-border": "#ccc",
  "--border-hairline": "rgba(7, 59, 76, 0.07)",
  "--wash-row-hover": "rgba(240, 244, 245, 0.7)",
  "--wash-sea-green": "rgba(6, 214, 160, 0.1)",
  "--overlay-backdrop": "rgba(7, 59, 76, 0.4)",
  "--shadow-soft": "0 1px 2px rgba(7, 59, 76, 0.08)",
  "--shadow-modal": "0 18px 40px rgba(7, 59, 76, 0.25)",
  "--shadow-drag": "0 10px 24px rgba(7, 59, 76, 0.18)",
};

describe("one place for color", () => {
  it("holds every color literal under src/ in brand.css", () => {
    // Test files are excluded: they carry the expected values this test
    // asserts against, and never ship to the browser.
    const offenders = sourceFiles()
      .filter(
        (file) => file !== BRAND_CSS && !/\.(test|spec)\.tsx?$/.test(file),
      )
      .flatMap((file) => {
        const found = fs
          .readFileSync(file, "utf8")
          .match(new RegExp(COLOR_LITERAL, "g"));
        return found
          ? [`${path.relative(SRC_DIR, file)}: ${found.join(", ")}`]
          : [];
      });
    expect(offenders).toEqual([]);
  });

  it("defines every var() that any file references", () => {
    const { light } = parseBrandCss();
    const missing = new Set<string>();
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(VAR_REFERENCE)) {
        if (!(match[1] in light)) {
          missing.add(`${path.relative(SRC_DIR, file)}: ${match[1]}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe("the light palette", () => {
  it("keeps today's :root values exactly", () => {
    const { light } = parseBrandCss();
    expect(colorTokens(light)).toEqual(LIGHT);
  });

  it("re-points every color token in the dark block", () => {
    const { dark } = parseBrandCss();
    expect(Object.keys(colorTokens(dark)).sort()).toEqual(
      Object.keys(LIGHT).sort(),
    );
  });
});

describe("badge contrast (WCAG AA in both modes)", () => {
  const { css, light, dark } = parseBrandCss();
  const rules = badgeRules(css);

  it("holds 4.5:1 for badge text on its fill", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const [mode, tokens] of Object.entries({ light, dark })) {
      const panel = parseColor(
        tokens["--color-panel"] ?? light["--color-panel"],
      );
      for (const { selector, body } of rules) {
        const foreground = declaredToken(body, "color") ?? "--color-ink";
        const background = declaredToken(body, "background");
        if (!background) {
          throw new Error(`${selector} needs a background token.`);
        }
        const fill = over(
          parseColor(tokens[background] ?? light[background]),
          panel,
        );
        expect(
          contrast(parseColor(tokens[foreground] ?? light[foreground]), fill),
          `${mode} ${selector}: ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("dark mode contrast (WCAG AA)", () => {
  const { light, dark } = parseBrandCss();
  const resolved = (name: string): string => dark[name] ?? light[name];
  const page = parseColor(resolved("--color-page"));
  const panel = parseColor(resolved("--color-panel"));
  const onPanel = (name: string): Rgba => parseColor(resolved(name));

  it("the contrast math itself matches the WCAG reference values", () => {
    expect(contrast(parseColor("#ffffff"), parseColor("#000000"))).toBeCloseTo(
      21,
      5,
    );
    // The classic 4.5:1 boundary grays against white.
    expect(
      contrast(parseColor("#767676"), parseColor("#ffffff")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseColor("#777777"), parseColor("#ffffff"))).toBeLessThan(
      4.5,
    );
  });

  it("holds 4.5:1 for normal text on page and panel", () => {
    const textTokens = [
      "--color-ink",
      "--color-ink-muted",
      "--color-sea-green-ink",
      "--color-marigold-ink",
      "--color-cerulean",
      "--color-raspberry",
    ];
    for (const token of textTokens) {
      expect(
        contrast(onPanel(token), page),
        `${token} on page`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(onPanel(token), panel),
        `${token} on panel`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast(onPanel("--color-on-primary"), onPanel("--color-sea-green")),
      "primary button text",
    ).toBeGreaterThanOrEqual(4.5);
    // The late pill (11px) and the delete button (15px) are normal text on
    // the danger fill and its hover — spec decision 7's 4.5:1, not 3:1.
    expect(
      contrast(onPanel("--color-on-danger"), onPanel("--color-raspberry")),
      "late pill and danger button text",
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(onPanel("--color-on-danger"), onPanel("--color-danger-hover")),
      "danger button hover text",
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(onPanel("--color-ink"), onPanel("--color-btn-bg")),
      "secondary button text",
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("holds 4.5:1 for pill text on every dark tint", () => {
    const ink = onPanel("--color-ink");
    for (const tint of [
      "--tint-sea-green",
      "--tint-marigold",
      "--tint-coral",
      "--tint-cerulean",
      "--tint-raspberry",
    ]) {
      const background = over(parseColor(resolved(tint)), panel);
      expect(contrast(ink, background), tint).toBeGreaterThanOrEqual(4.5);
    }
    // The late deal's date sits on the raspberry tint of its card.
    const lateCard = over(parseColor(resolved("--tint-raspberry")), panel);
    expect(
      contrast(onPanel("--color-raspberry"), lateCard),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("holds 3:1 for dots, UI and buttons", () => {
    const uiTokens = [
      "--color-sea-green",
      "--color-marigold",
      "--color-coral",
      "--color-cerulean",
      "--color-raspberry",
      "--color-sea-mist",
    ];
    for (const token of uiTokens) {
      expect(
        contrast(onPanel(token), page),
        `${token} on page`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(onPanel(token), panel),
        `${token} on panel`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
