// Wording, labels and limits used by the screens.
// Pages read from here, so text and numbers can change without touching the page code.

export const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/new-scan", label: "New scan" },
  { to: "/reports", label: "Reports" },
  { to: "/history", label: "History" },
  { to: "/schedule", label: "Schedule" },
  { to: "/settings", label: "Settings" },
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
};
