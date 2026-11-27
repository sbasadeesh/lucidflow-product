// E2-02 criterion 2
// Given an element, when queried, then its computed size, colour, and visibility are stored.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const capture = require("../../../backend/src/capture/capture");            // E2-01: renders the page
const { captureState } = require("../../../backend/src/capture/DOMcapture");
const { startFixtureServer, expected } = require("../fixture");

let site;
let rendered;
let dir;

test.before(async () => {
    site = await startFixtureServer();
    rendered = await capture.render(site.url);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2-02-"));
});

test.after(async () => {
    if (rendered) await rendered.close();
    if (site) await site.close();
});

test("Given an element, when queried, then its computed size, colour, and visibility are stored", { timeout: 60000 }, async () => {
    // query the elements and save them (the styles file is what is stored)
    const state = await captureState(rendered.page, {
        name: "styles",
        index: 1,
        dir,
        filePrefix: "scan-test",
        selectors: [expected.big.selector, expected.gone.selector, expected.invisible.selector, expected.faint.selector],
        includeDefaults: false,
    });
    assert.equal(state.styles.saved, true, state.styles.reason);

    // read back what was stored
    const stored = JSON.parse(fs.readFileSync(path.join(dir, state.styles.file), "utf8"));
    const get = (selector) => stored.elements.find((e) => e.selector === selector);

    // a visible element: size, colour, visibility
    const big = get(expected.big.selector);
    assert.ok(big, "the element is stored");
    assert.deepEqual(big.size, expected.big.size, "size");
    assert.equal(big.colour.color, expected.big.color, "colour");
    assert.equal(big.colour.backgroundColor, expected.big.backgroundColor, "background colour");
    assert.equal(big.visibility.visible, true, "visibility");
    assert.equal(big.visibility.reason, null);

    // elements that are not visible: stored as not visible, with the reason
    assert.equal(get(expected.gone.selector).visibility.visible, false);
    assert.equal(get(expected.gone.selector).visibility.reason, expected.gone.reason);
    assert.equal(get(expected.invisible.selector).visibility.reason, expected.invisible.reason);
    assert.equal(get(expected.faint.selector).visibility.reason, expected.faint.reason);
});