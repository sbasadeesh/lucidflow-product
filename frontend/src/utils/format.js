// Small reusable text helpers

// "FORCED ACTION" -> "Forced Action"
export const titleCase = (text) => text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// padId("CAP", 3) -> "CAP-003"
export const padId = (prefix, number) => `${prefix}-${String(number).padStart(3, "0")}`;
