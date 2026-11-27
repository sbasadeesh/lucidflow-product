// Browser regression for the S6 print finding page.
// Requires the dev server on 5173 and Edge with --remote-debugging-port=9222.
// This is the layout check. A jsdom text assertion is not a substitute.
const CDP = process.env.CDP || "http://127.0.0.1:9222";
const URL = process.env.REPORT_URL || "http://127.0.0.1:5173/reports?mock=S6-long-text";
const TOLERANCE_PX = 1;

async function connect() {
  const created = await fetch(CDP + "/json/new?about:blank", { method: "PUT" });
  const tab = await created.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  return { send, close: () => ws.close() };
}

async function evaluate(send, expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
}

const MEASURE = `() => {
  const sheets = [...document.querySelectorAll(".print-only .sheet")];
  const sheet = sheets.find((s) => (s.querySelector(".scanned") || {}).textContent);
  const body = sheet.querySelector(".s-body");
  const inner = body.firstElementChild;
  const foot = sheet.querySelector(".s-foot");
  const ib = inner.getBoundingClientRect();
  const fb = foot.getBoundingClientRect();
  const text = sheet.innerText;
  return {
    printDisplay: getComputedStyle(document.querySelector(".print-only")).display,
    fitted: inner.dataset.fitted || "",
    overflowFlag: inner.dataset.overflow || "",
    zoom: Number(getComputedStyle(inner).zoom),
    overflowPx: body.scrollHeight - body.clientHeight,
    footerGapPx: Math.round(fb.top - ib.bottom),
    hasEvidence: text.includes("EVIDENCE-LED FINDING") && text.includes("Lorem ipsum"),
    hasWhy: text.includes("WHY THIS MATTERS"),
    hasRemediation: text.includes("REMEDIATION FIX"),
    hasUrl: text.includes("utm_campaign=renewal-offer-2026&session=abcdef0123456789abcdef0123456789&ref=homepage-top-nav"),
  };
}`;

const { send, close } = await connect();
await send("Page.navigate", { url: URL });
for (let i = 0; i < 40; i++) {
  if (await evaluate(send, "!!document.querySelector('.print-only .sheet')")) break;
  await new Promise((r) => setTimeout(r, 250));
}
await evaluate(send, "document.fonts.ready");
await send("Emulation.setEmulatedMedia", { media: "print" });
let emulated = null;
for (let i = 0; i < 20; i++) {
  await evaluate(send, "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  emulated = await evaluate(send, `(${MEASURE})()`);
  if (emulated?.fitted === "1") break;
}

await send("Emulation.setEmulatedMedia", { media: "" });
await evaluate(
  send,
  `new Promise((resolve) => {
    window.addEventListener("afterprint", () => resolve("afterprint"), { once: true });
    window.dispatchEvent(new Event("afterprint"));
  })`,
);
const previewZoom = await evaluate(
  send,
  `(() => {
    const inner = document.querySelector(".preview .s-body")?.firstElementChild;
    return inner ? Number(getComputedStyle(inner).zoom) : null;
  })()`,
);

const pdf = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
const pages = pdf.result?.data ? "pdf-bytes" : "missing";

const failures = [];
if (emulated.printDisplay !== "block") failures.push("print layout not active");
if (emulated.fitted !== "1") failures.push("fit did not run");
if (emulated.overflowPx > TOLERANCE_PX) failures.push("overflow " + emulated.overflowPx);
if (emulated.footerGapPx < 0) failures.push("footer overlap " + emulated.footerGapPx);
if (emulated.zoom < 0.6) failures.push("zoom " + emulated.zoom);
if (emulated.overflowFlag) failures.push("overflow flag " + emulated.overflowFlag);
for (const key of ["hasEvidence", "hasWhy", "hasRemediation", "hasUrl"]) {
  if (!emulated[key]) failures.push("missing " + key);
}
if (pages !== "pdf-bytes") failures.push("printToPDF produced no data");
if (previewZoom !== null && previewZoom < 0.6) failures.push("preview zoom after print " + previewZoom);

console.log(JSON.stringify({ emulated, previewZoomAfterPrint: previewZoom, pdf: pages, failures }, null, 2));
close();
if (failures.length) process.exit(1);
