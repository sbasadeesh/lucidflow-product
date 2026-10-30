import { WORDING } from "../config.js";

// Text la cautious wording irukka nu check pannum
export function checkWording(text) {
  // "Non Compliant", "non-compliant" ellam onnaa maathum
  const lower = text.toLowerCase().replace(/non[\s-]+compliant/g, "non-compliant");

  return {
    missing: WORDING.required.filter((word) => !lower.includes(word)),
    forbidden: WORDING.forbidden.filter((word) => lower.includes(word)),
  };
}