import { theme } from "../theme.js";

// "#rrggbb" -> "FFRRGGBB" (the colour format Excel expects)
export const toArgb = (hex) => `FF${hex.slice(1).toUpperCase()}`;

// Colours and font used by the Excel export, taken from the theme file
export const COLORS = {
  black: toArgb(theme.colors.primary),
  rowFill: toArgb(theme.colors.surface3),
  border: toArgb(theme.colors.borderStrong),
  white: toArgb(theme.colors.text),
  red: toArgb(theme.colors.secondary),
  muted: toArgb(theme.colors.muted),
  link: toArgb(theme.colors.link),
};

export const FONT_NAME = theme.font.name;
