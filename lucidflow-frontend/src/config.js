// Wording, labels and limits used by the screens.
// Pages read from here, so text and numbers can change without touching the page code.

export const NAV_LINKS = [
  { label: "Home", to: "/", icon: "home" },
  { label: "New scan", to: "/new-scan", icon: "plus" },
  { label: "Reports", to: "/reports", icon: "report" },
  { label: "Remediation", to: "/remediation", icon: "shieldCheck" },
  { label: "Prevention", to: "/prevention", icon: "shield" },
  { label: "History", to: "/history", icon: "clock" },
  { label: "Schedule", to: "/schedule", icon: "calendar" },
  { label: "Settings", to: "/settings", icon: "gear" },
];

export const HOME = {
  title: "Start a scan",
  runLabel: "Run scan",
  recentTitle: "Recent scans",
  scanRoute: "/scan",
  modes: {
    pages: {
      label: "Page URLs",
      inputLabel: "Page URLs",
      placeholder: "https://www.example.com/page",
      multiline: true,
      help: "Add one or more page URLs, separated by commas or new lines. Example: https://www.royalsundaram.in/copyright, https://www.royalsundaram.in/claims",
    },
    domain: {
      label: "Whole domain",
      inputLabel: "Domain",
      placeholder: "https://www.example.com",
      multiline: false,
      help: "Enter only the domain. Example: https://www.royalsundaram.in",
    },
  },
};

// Simulated scan (replace with real values when the scan engine is connected)
export const SCAN = {
  domainPages: 214,
  maxTemplates: 12,
  reportRoute: "/reports",
  discovery: { foundStep: 7, checkedStep: 6, tickMs: 250, toScanDelayMs: 800 },
  scanning: { domainStep: 9, domainTickMs: 120, pagesStep: 1, pagesTickMs: 1200, doneDelayMs: 700 },
};

export const REPORT = {
  maxFindings: 4,
  capRowsPerPage: 5,
  capBodyMm: 195, // table height available on one CAP page (mm)
   barUnitPct: 12, // bar width for one finding (% of the bar track)
};

// CAP Excel: Root cause and Corrective action are AI columns.
// They show this placeholder text until the AI is connected.
export const CAP_AI_PLACEHOLDER = {
  rootCause: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  action: "Sed do eiusmod tempor incididunt ut labore et dolore.",
};

export const WORDING = {
  required: ["potential"],
  forbidden: ["violation", "non-compliant"],
};

export const SEVERITY_ORDER = ["Medium", "Observed", "High", "Critical"];

// AI text slots. Shown until the AI is connected.
export const SUMMARY_AI_PLACEHOLDER = {
  posture:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  theme:
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
};

export const PLANNED_LABEL = "Planned for a later phase";

export const SETTINGS_SECTIONS = [
  { label: "Profile", to: "/settings/profile", icon: "user" },
  { label: "Organisation", to: "/settings/organisation", icon: "building" },
  { label: "Users and roles", to: "/settings/users-and-roles", icon: "users" },
  { label: "Licence", to: "/settings/licence", icon: "file" },
  { label: "Data and retention", to: "/settings/data-and-retention", icon: "database" },
  { label: "Notifications", to: "/settings/notifications", icon: "bell" },
];