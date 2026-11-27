// Read-only overlay snapshot and identity - browser tests on local HTML (page.setContent).
// PROPOSED contract: docs/overlay-recurrence-observation.md
const test = require("node:test");
const assert = require("node:assert/strict");
const { snapshotOverlays, identifyTarget } = require("../../../backend/src/modules/overlayObservation/overlaySnapshot");
const { matchIdentity, overlayIdOf } = require("../../../backend/src/modules/overlayObservation/overlayObserver");
const { launchBrowser, openHtml, overlay, PRIVATE_TEXT } = require("../fixture");

let browser;
test.before(async () => { browser = await launchBrowser(); });
test.after(async () => { if (browser) await browser.close(); });

async function withPage(html, fn) {
    const { page, context } = await openHtml(browser, html);
    try { return await fn(page); } finally { await context.close(); }
}

const PROMO = overlay("promo", `<p>Summer offer</p><button>Got it</button>`);

test("the same overlay gives the same identity on separate page loads", { timeout: 60000 }, async () => {
    const a = await withPage(PROMO, (p) => snapshotOverlays(p));
    const b = await withPage(PROMO, (p) => snapshotOverlays(p));
    assert.equal(a.length, 1);
    assert.ok(matchIdentity(a[0], b[0]));
    assert.equal(overlayIdOf(a[0]), overlayIdOf(b[0]));
});

test("hidden or too-small matching elements are not visible overlays", { timeout: 60000 }, async () => {
    const html = [
        overlay("a", "<p>one</p>").replace("position:fixed", "display:none;position:fixed"),
        overlay("b", "<p>two</p>").replace("position:fixed", "visibility:hidden;position:fixed"),
        overlay("c", "<p>three</p>").replace("position:fixed", "opacity:0;position:fixed"),
        `<div class="promo-modal" style="position:fixed;top:0;left:0;width:100px;height:60px;z-index:1000">tiny</div>`,
    ].join("");
    assert.deepEqual(await withPage(html, (p) => snapshotOverlays(p)), []);
});

test("an overlay shown again after hiding is matched (same element)", { timeout: 60000 }, async () => {
    await withPage(PROMO, async (page) => {
        const [before] = await snapshotOverlays(page);
        await page.evaluate(() => { document.getElementById("promo").style.display = "none"; });
        assert.deepEqual(await snapshotOverlays(page), []);
        await page.evaluate(() => { document.getElementById("promo").style.display = "block"; });
        const [after] = await snapshotOverlays(page);
        assert.ok(matchIdentity(before, after));
    });
});

test("an identical replacement element has the same identity (documented ambiguity)", { timeout: 60000 }, async () => {
    await withPage(PROMO, async (page) => {
        const [before] = await snapshotOverlays(page);
        await page.evaluate(() => {
            const old = document.getElementById("promo");
            const copy = old.cloneNode(true);
            old.remove();
            document.body.appendChild(copy);
        });
        const [after] = await snapshotOverlays(page);
        assert.ok(matchIdentity(before, after), "replacement cannot be told apart from the original");
    });
});

test("a different overlay, or unrelated overlays sharing a short text, do not match", { timeout: 60000 }, async () => {
    const other = overlay("other", `<p>Newsletter signup</p><button>Got it</button>`);
    const moved = overlay("promo", `<p>Summer offer</p><button>Got it</button>`).replace("left:200px", "left:700px");
    const links = overlay("promo", `<p>Summer offer</p><a href="#">Got it</a>`);
    const base = (await withPage(PROMO, (p) => snapshotOverlays(p)))[0];
    for (const html of [other, moved, links]) {
        const [s] = await withPage(html, (p) => snapshotOverlays(p));
        assert.equal(matchIdentity(base, s), false);
    }
});

test("identifyTarget returns the same identity as the snapshot for a tagged overlay", { timeout: 60000 }, async () => {
    await withPage(PROMO, async (page) => {
        await page.evaluate(() => document.getElementById("promo").setAttribute("data-popup-target", "0"));
        const tagged = await identifyTarget(page, 0);
        const [snap] = await snapshotOverlays(page);
        assert.ok(matchIdentity(tagged, snap));
        assert.equal(await identifyTarget(page, 7), null, "no element with that tag");
    });
});

test("snapshot output carries no overlay text", { timeout: 60000 }, async () => {
    const html = overlay("promo", `<p>${PRIVATE_TEXT}</p><input value="typed-secret"><button>Got it</button>`);
    await withPage(html, async (page) => {
        const out = JSON.stringify([await snapshotOverlays(page), await identifyTarget(page, 0)]);
        for (const leak of ["PRIVATE-OVERLAY-TEXT-7731", "jane.doe@example.com", "9876543210", "typed-secret", "Got it", "promo"]) {
            assert.ok(!out.includes(leak), `snapshot must not contain ${leak}`);
        }
    });
});

test("snapshots perform no clicks, key presses or DOM changes", { timeout: 60000 }, async () => {
    const html = PROMO + `<script>
        window.__events = 0; window.__mutations = 0;
        ['click','mousedown','keydown','focusin'].forEach((t) => document.addEventListener(t, () => window.__events++, true));
        new MutationObserver((m) => { window.__mutations += m.length; }).observe(document, { subtree: true, attributes: true, childList: true });
    </script>`;
    await withPage(html, async (page) => {
        for (let i = 0; i < 3; i++) await snapshotOverlays(page);
        await identifyTarget(page, 0);
        await page.waitForTimeout(50);
        assert.deepEqual(await page.evaluate(() => [window.__events, window.__mutations]), [0, 0]);
    });
});

test("candidate rules match the engine's: sticky bars and app shells are not overlays", { timeout: 60000 }, async () => {
    const html = `
        <div class="site-bar" style="position:fixed;top:0;left:0;width:1300px;height:119px;z-index:1000">sticky bar</div>
        <div class="overlay-shell" style="position:fixed;top:100px;left:0;width:800px;height:500px;z-index:1000"><header>h</header><main>m</main></div>`;
    assert.deepEqual(await withPage(html, (p) => snapshotOverlays(p)), []);
});
