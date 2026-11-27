// State fingerprint - PROPOSED RECOVERY CONTRACT (PR #39), not a recovered E2-08 specification.
// See docs/state-fingerprint-and-action-journal.md for the supported signals and rules.
const test = require("node:test");
const assert = require("node:assert/strict");
const { getStateFingerprint } = require("../../../backend/src/modules/stateFingerprinter/stateFingerprinter");
const { isSensitiveField } = require("../../../backend/src/capture/stateScriptRunner");
const scriptConfig = require("../../../backend/src/config/stateScript.config");
const { launchBrowser, openHtml } = require("../fixture");

let browser;
test.before(async () => { browser = await launchBrowser(); });
test.after(async () => { if (browser) await browser.close(); });

async function withPage(html, fn) {
    const { page, context } = await openHtml(browser, html);
    try {
        return await fn(page);
    } finally {
        await context.close();
    }
}

const FORM = `
<h1>Quote form</h1>
<label for="name">Your name</label><input id="name">
<label for="note">Note</label><textarea id="note"></textarea>
<label><input type="checkbox" id="agree"> I agree</label>
<label><input type="radio" name="plan" id="basic" checked> Basic</label>
<label><input type="radio" name="plan" id="plus"> Plus</label>
<select id="city"><option>Pune</option><option>Chennai</option></select>`;

test("identical page state gives the same fingerprint across separate loads", { timeout: 60000 }, async () => {
    const a = await withPage(FORM, (p) => getStateFingerprint(p));
    const b = await withPage(FORM, (p) => getStateFingerprint(p));
    assert.match(a.hash, /^[0-9a-f]{64}$/);
    assert.equal(a.hash, b.hash);
});

test("visible text changes distinguish states", { timeout: 60000 }, async () => {
    const a = await withPage("<h1>Step one</h1>", (p) => getStateFingerprint(p));
    const b = await withPage("<h1>Step two</h1>", (p) => getStateFingerprint(p));
    assert.notEqual(a.hash, b.hash);
});

test("non-sensitive input and textarea values distinguish states", { timeout: 60000 }, async () => {
    await withPage(FORM, async (page) => {
        const before = await getStateFingerprint(page);
        await page.fill("#name", "Test User");
        const afterInput = await getStateFingerprint(page);
        await page.fill("#note", "A short note");
        const afterTextarea = await getStateFingerprint(page);
        assert.notEqual(before.hash, afterInput.hash, "input value must change the fingerprint");
        assert.notEqual(afterInput.hash, afterTextarea.hash, "textarea value must change the fingerprint");
    });
});

test("checkbox and radio checked state distinguish states", { timeout: 60000 }, async () => {
    await withPage(FORM, async (page) => {
        const before = await getStateFingerprint(page);
        await page.check("#agree");
        const afterCheckbox = await getStateFingerprint(page);
        await page.check("#plus");
        const afterRadio = await getStateFingerprint(page);
        assert.notEqual(before.hash, afterCheckbox.hash, "checkbox state must change the fingerprint");
        assert.notEqual(afterCheckbox.hash, afterRadio.hash, "radio state must change the fingerprint");
    });
});

test("the selected option distinguishes states", { timeout: 60000 }, async () => {
    await withPage(FORM, async (page) => {
        const before = await getStateFingerprint(page);
        await page.selectOption("#city", { index: 1 });
        const after = await getStateFingerprint(page);
        assert.notEqual(before.hash, after.hash);
    });
});

test("a visible overlay distinguishes states even when the text is the same", { timeout: 60000 }, async () => {
    const html = `<h1>Page</h1><div class="modal" id="m" style="display:none;width:200px;height:100px;background:#333"></div>`;
    await withPage(html, async (page) => {
        const closed = await getStateFingerprint(page);
        await page.evaluate(() => { document.getElementById("m").style.display = "block"; });
        const open = await getStateFingerprint(page);
        assert.notEqual(closed.hash, open.hash);
        assert.equal(closed.counts.overlays, 0);
        assert.equal(open.counts.overlays, 1);
    });
});

test("hidden .modal elements do not count as overlays just because the selector matches", { timeout: 60000 }, async () => {
    const plain = "<h1>No dialog visible</h1>";
    const withHidden = `<h1>No dialog visible</h1>
        <div class="modal" style="display:none">hidden one</div>
        <div class="modal" style="visibility:hidden;width:50px;height:50px">hidden two</div>
        <div role="dialog" style="opacity:0;width:50px;height:50px">hidden three</div>`;
    const a = await withPage(plain, (p) => getStateFingerprint(p));
    const b = await withPage(withHidden, (p) => getStateFingerprint(p));
    assert.equal(b.counts.overlays, 0);
    assert.equal(a.hash, b.hash);
});

test('ordinary static text such as "9:30" is kept and no timer is inferred', { timeout: 60000 }, async () => {
    const a = await withPage("<h1>Branch hours 9:30 to 18:00</h1>", (p) => getStateFingerprint(p));
    const b = await withPage("<h1>Branch hours 9:45 to 18:00</h1>", (p) => getStateFingerprint(p));
    assert.notEqual(a.hash, b.hash, "the time text is page content and must stay in the fingerprint");
    assert.deepEqual(Object.keys(a).sort(), ["counts", "hash", "version"], "no timer or time-sensitivity flag");
});

test("dynamic content is normalised only through configured ignoreSelectors", { timeout: 60000 }, async () => {
    const page1 = `<h1>Offer</h1><span data-volatile>Ends in 04:59</span>`;
    const page2 = `<h1>Offer</h1><span data-volatile>Ends in 04:58</span>`;
    const opts = { ignoreSelectors: ["[data-volatile]"] };
    const a = await withPage(page1, (p) => getStateFingerprint(p, opts));
    const b = await withPage(page2, (p) => getStateFingerprint(p, opts));
    assert.equal(a.hash, b.hash, "configured volatile content is ignored");

    const c = await withPage(page1, (p) => getStateFingerprint(p));
    const d = await withPage(page2, (p) => getStateFingerprint(p));
    assert.notEqual(c.hash, d.hash, "without configuration nothing is ignored");
});

test("an invalid ignore selector is rejected with a clear error", { timeout: 60000 }, async () => {
    await withPage("<h1>x</h1>", async (page) => {
        await assert.rejects(() => getStateFingerprint(page, { ignoreSelectors: ["div[[["] }), /ignoreSelectors|overlaySelectors|selector/i);
        await assert.rejects(() => getStateFingerprint(page, { ignoreSelectors: "not-a-list" }), TypeError);
    });
});

test("sensitive field values do not affect or appear in the fingerprint", { timeout: 60000 }, async () => {
    const html = `<h1>Contact</h1>
        <input id="tel" type="tel">
        <input id="pw" type="password">
        <input id="otp" name="otp">
        <label for="mob">Mobile number</label><input id="mob">
        <label for="name">Your name</label><input id="name">`;
    await withPage(html, async (page) => {
        const before = await getStateFingerprint(page);
        await page.fill("#tel", "9876543210");
        await page.fill("#pw", "hunter2-secret");
        await page.fill("#otp", "424242");
        await page.fill("#mob", "9123456789");
        const after = await getStateFingerprint(page);
        assert.equal(before.hash, after.hash, "sensitive values must not change the fingerprint");
        assert.equal(after.counts.sensitiveControls, 4);
        const json = JSON.stringify(after);
        for (const secret of ["9876543210", "hunter2-secret", "424242", "9123456789"]) {
            assert.ok(!json.includes(secret), `fingerprint must not contain ${secret}`);
        }
    });
});

test("hidden inputs (tokens) do not affect or appear in the fingerprint", { timeout: 60000 }, async () => {
    const a = await withPage(`<h1>Form</h1><input type="hidden" name="csrf" value="token-aaaa">`, (p) => getStateFingerprint(p));
    const b = await withPage(`<h1>Form</h1><input type="hidden" name="csrf" value="token-bbbb">`, (p) => getStateFingerprint(p));
    assert.equal(a.hash, b.hash);
    assert.ok(!JSON.stringify(a).includes("token-aaaa"));
});

test("the fingerprint result holds no page text, field values or raw DOM", { timeout: 60000 }, async () => {
    await withPage(`<h1>Visible heading text</h1><input id="name">`, async (page) => {
        await page.fill("#name", "typed-value");
        const fp = await getStateFingerprint(page);
        const json = JSON.stringify(fp);
        assert.ok(!json.includes("Visible heading text"));
        assert.ok(!json.includes("typed-value"));
        assert.ok(!json.includes("<h1"));
        assert.deepEqual(Object.keys(fp).sort(), ["counts", "hash", "version"]);
    });
});

test("the fingerprinter uses the runner's sensitive-field rule and pattern", () => {
    assert.equal(typeof isSensitiveField, "function");
    assert.equal(isSensitiveField({ type: "tel", text: "" }, scriptConfig), true);
    assert.equal(isSensitiveField({ type: "password", text: "" }, scriptConfig), true);
    assert.equal(isSensitiveField({ type: "text", text: "Vehicle registration" }, scriptConfig), true);
    assert.equal(isSensitiveField({ type: "text", text: "Your name" }, scriptConfig), false);
    assert.equal(isSensitiveField(null, scriptConfig), false);
});
