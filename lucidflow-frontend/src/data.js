import { padId, titleCase } from "./utils/format.js";
import { REPORT } from "./config.js";

export const recentScans = [
  {
    domain: "www.abcinsurance.example",
    date: "16 Oct 2026",
    status: "Completed",
    result: "4 potential dark patterns",
  },
  {
    domain: "www.novafinance.example",
    date: "14 Oct 2026",
    status: "Needs review",
    result: "7 potential dark patterns",
  },
  {
    domain: "www.orbitcover.example",
    date: "10 Oct 2026",
    status: "Completed",
    result: "2 potential dark patterns",
  },
];

// Paths used to simulate page discovery in "Whole domain" mode
export const SAMPLE_PATHS = [
  "/",
  "/claims",
  "/renewal",
  "/support",
  "/contact",
  "/about",
  "/plans",
  "/faq",
];

const TEMPLATES = [
  {
    title: "Repeated Advertisement",
    cause:
      "The advertisement overlay is triggered on a timer and is not suppressed after the user dismisses it.",
    severity: "MEDIUM",
    pattern: "NAGGING",
    effort: "MEDIUM EFFORT",
    owner: "Product / UX / Compliance",
    evidence:
      "A promotional modal appears over the page and reappears at intervals even after being dismissed using the Close option.",
    why: "Repeatedly displaying a promotion after dismissal interrupts the browsing experience and obstructs access to the intended content.",
    fix: [
      "Do not redisplay the promotion immediately after the user closes it.",
      "Implement frequency caps within a browsing session.",
      "Provide a clearly visible and easily accessible Close option.",
    ],
  },
  {
    title: "Preselected Add-on",
    cause: "The add-on option is set to selected by default in the checkout configuration.",
    severity: "HIGH",
    pattern: "FORCED ACTION",
    effort: "LOW EFFORT",
    owner: "Product / Compliance",
    evidence:
      "An optional add-on is preselected and added to the total by default without an explicit choice.",
    why: "Preselected add-ons can lead users to pay for services they did not actively choose.",
    fix: [
      "Leave optional add-ons unchecked by default.",
      "Show the price impact before the add-on is selected.",
    ],
  },
  {
    title: "Bundled Acceptance of Terms",
    cause:
      "A single continue action is mapped to acceptance of the terms and marketing consent, with no separate consent controls.",
    severity: "MEDIUM",
    pattern: "FORCED ACTION",
    effort: "MEDIUM EFFORT",
    owner: "Product / UX / Legal",
    evidence:
      "The page states that by continuing, the user agrees to the Terms & Conditions and Privacy Policy. No separate, visible consent controls are provided for each agreement.",
    why: "Users may be unable to distinguish between terms necessary to access the service and optional permissions, which limits an informed choice.",
    fix: [
      "Clearly identify which terms are mandatory.",
      "Provide separate consent controls for distinct or optional agreements.",
      "Allow users to proceed without optional consent.",
    ],
  },
  {
    title: "Urgency-oriented Offer Messaging",
    cause:
      "The banner copy and expiry date are maintained manually and are not verified against the approved campaign period.",
    severity: "MEDIUM",
    pattern: "FALSE URGENCY",
    effort: "LOW EFFORT",
    owner: "Marketing / Product / Compliance",
    evidence:
      "An offer banner uses urgency-oriented wording and an explicit expiry date that may pressure users to act before evaluating the offer.",
    why: "Urgency that cannot be verified may push users into a decision before they have reviewed the terms and eligibility.",
    fix: [
      "Verify the expiry date against the approved campaign period.",
      "Disclose applicable terms and eligibility.",
      "Correct or remove misleading urgency messaging.",
    ],
  },
];

const ordinal = (n) => (n > 3 && n < 21 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

function today() {
  const d = new Date();
  const month = d.toLocaleString("en-GB", { month: "long" });
  return `${d.getDate()}${ordinal(d.getDate())} ${month} ${d.getFullYear()}`;
}

const hostOf = (u) => new URL(u).hostname.replace(/^www\./, "");

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Builds the report only from what the user entered.
// Pages from different websites -> every website (company) is shown.
export function buildReport(scan) {
  const isDomain = scan.mode === "domain";
  const pages = isDomain
    ? SAMPLE_PATHS.map((p) => `https://${scan.host}${p === "/" ? "" : p}`)
    : scan.urls;
  const assessed = isDomain ? 214 : scan.urls.length;

  // group pages by website
  const byHost = {};
  pages.forEach((u) => {
    const h = hostOf(u);
    (byHost[h] = byHost[h] || []).push(u);
  });
  const hosts = Object.keys(byHost);

  // round-robin, so the findings cover every website
  const queues = hosts.map((h) => [...byHost[h]]);
  const ordered = [];
  while (queues.some((q) => q.length)) {
    queues.forEach((q) => q.length && ordered.push(q.shift()));
  }

  const findings = TEMPLATES.slice(0, Math.min(REPORT.maxFindings, ordered.length)).map((t, i) => {
    const company = hostOf(ordered[i]);
    return {
      ...t,
      id: `FINDING -00${i + 1}`,
      company,
      title: `${company} - ${t.title}`,
      url: ordered[i],
    };
  });

  const counts = {};
  findings.forEach((f) => {
    const name = titleCase(f.pattern);
    counts[name] = (counts[name] || 0) + 1;
  });

  const names =
    hosts.length > 1 ? `${hosts.slice(0, -1).join(", ")} and ${hosts[hosts.length - 1]}` : hosts[0];

  return {
    title: "Dark Pattern Assessment Report",
    tagline: "Automated Scanning. Continuous governance. Evidence-led findings.",
    client: hosts.join(", "),
    clients: hosts,
        scope: isDomain
      ? `${hosts[0]} (whole domain)`
      : hosts
          .map((h) => {
            const states = findings.filter((f) => f.company === h).length; // 1 finding = 1 state
            return `${h} (${plural(byHost[h].length, "page")}, ${plural(states, "state")})`;
          })
          .join(", "),
    id: `LF-${hosts.length > 1 ? "MULTI" : hosts[0].split(".")[0].toUpperCase()}-2026-001`,
    version: "V1.0",
    date: today(),
    stats: [
      { value: assessed, label: "Pages / screens assessed" },
      { value: findings.length, label: "Potential findings" },
      { value: findings.filter((f) => f.severity === "HIGH").length, label: "High / critical" },
      { value: 0, label: "Revalidated closed" },
    ],
    distribution: Object.entries(counts).map(([name, count]) => ({ name, count })),
    posture: `The assessment of ${names} identified dark-pattern concerns including forced action and nagging. These patterns influence how users interact with the journey, accept terms and provide personal information.`,
    findings,
    // Corrective action plan register (PDF + Excel)
    cap: findings.map((f, i) => ({
      id: padId("CAP", i + 1),
      findingRef: padId("F", i + 1),
      finding: f.title,
      company: f.company,
      url: f.url,
      pattern: titleCase(f.pattern),
      severity: f.severity,
      rootCause: f.cause,
      action: f.fix,
      owner: f.owner,
      due: "[Date]",
      status: "OPEN",
    })),
  };
}

export const PRIORITY_THEMES = [
  {
    title: "CHOICE ARCHITECTURE",
    text: "The presentation of terms and consent options can influence users to proceed without fully distinguishing essential requirements from optional permissions.",
  },
  {
    title: "PRICE & DISCLOSURE",
    text: "Bundled acceptance of terms and promotional communication consent can limit users' ability to make independent, informed choices.",
  },
  {
    title: "CONSENT & DATA",
    text: "Customer interactions should provide clear information, meaningful choices and transparent consent mechanisms to support a fair and user-friendly experience.",
  },
];

export const ABOUT = [
  "Dark patterns are user-interface designs or digital practices that are intentionally created to mislead, manipulate, coerce or otherwise impair a consumer's ability to make free, informed and autonomous choices. They may influence a customer to purchase a product, share personal information, accept marketing communication, select an add-on, remain enrolled in a paid service or make another decision that primarily benefits the platform rather than the customer.",
  "For customer journeys across numerous industries, dark-pattern risks may arise during product discovery, quotation, add-on selection, proposal submission, payment, renewal, servicing, cancellation and communication-consent processes. The assessment of a dark pattern should consider the full customer journey, the wording, default settings, timing, prominence of choices, data requested and the practical ability to decline or exit.",
  "The taxonomy is aligned with the categories identified in the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023. IRDAI, RBI-regulated entities and other digital platforms involved in financial transactions (Example: E-commerce) should also assess these practices against applicable customer-protection, disclosure, consent, grievance-handling and fair-conduct requirements. A finding in this report is an operational assessment of potential risk in a customer facing journey.",
];

// 13 dark-pattern categories (shown in the PDF)
export const CATEGORIES = [
  [
    "False Urgency",
    "Creating a false or misleading impression of urgency or scarcity to pressure an immediate decision.",
  ],
  [
    "Basket Sneaking",
    "Adding products, services, riders, add-ons or charges to a customer's cart or checkout without the customer's explicit consent.",
  ],
  [
    "Confirm Shaming",
    "Using guilt, shame, fear or emotionally loaded language to pressure a customer into accepting an option or avoiding an opt-out.",
  ],
  [
    "Forced Action",
    "Requiring a customer to complete unrelated actions or provide unnecessary information to access a product, service or basic functionality.",
  ],
  [
    "Subscription Trap",
    "Making cancellation, withdrawal, non-renewal or termination of a recurring service intentionally difficult, unclear or burdensome.",
  ],
  [
    "Interface Interference",
    "Manipulating the visual design, presentation, hierarchy or default state of interface elements to favor an option that benefits the platform.",
  ],
  [
    "Bait and Switch",
    "Advertising a specific product, benefit or price but presenting a different, less favourable or higher-cost outcome later in the journey.",
  ],
  [
    "Drip Pricing",
    "Revealing mandatory charges, fees or unavoidable costs only late in the purchase or payment journey rather than presenting them upfront.",
  ],
  [
    "Disguised Advertisement",
    "Designing advertising, promotional content or sponsored recommendations to resemble neutral information, system messages or ordinary content.",
  ],
  [
    "Nagging",
    "Repeatedly interrupting or prompting a customer to take a particular action after they have declined, dismissed or deferred it.",
  ],
  [
    "Trick Wording",
    "Using confusing, vague, misleading or double-negative language that makes it difficult for a customer to understand the consequence of a choice.",
  ],
  [
    "SaaS Billing / Unsolicited Billing",
    "Charging a customer without clear, informed and transparent authorization, including obscuring recurring-payment or paid-renewal terms.",
  ],
  [
    "Rogue Malware / Scareware",
    "Using fake security warnings, misleading alerts or deceptive pop-ups to pressure a customer into paying, downloading software or sharing credentials.",
  ],
];
