// E2-02 developer note
// Store selectors so findings can point to an element.
// Every stored element has a selector that finds that same element again, and only that element.

const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../../backend/src/capture/capture");
const { captureStyles } = require("../../../backend/src/capture/DOMcapture");
const { startFixtureServer, expected } = require("../fixture");

let site;
let rendered;

test.before(async () => {
    site = await startFixtureServer();
    rendered = await capture.render(site.url);
});

test.after(async () => {
    if (rendered) await rendered.close();
    if (site) await site.close();
});

test("Given a stored element, when its selector is used, then exactly that element is found", { timeout: 60000 }, async () => {
    const styles = await captureStyles(rendered.page, { selectors: ["li", "#big", "h1"], includeDefaults: false });
    assert.equal(styles.elements.length, 5, "three list items, the button and the heading");

    for (const el of styles.elements) {
        assert.equal(el.selectorUnique, true, `${el.selector} matches one element`);
        const found = rendered.page.locator(el.selector);
        assert.equal(await found.count(), 1, `${el.selector} finds exactly one element`);
        assert.equal((await found.innerText()).replace(/\s+/g, " ").trim(), el.text, `${el.selector} is the same element`);
    }
});

test("Given list items that have no id, when they are stored, then each has its own selector", { timeout: 60000 }, async () => {
    const styles = await captureStyles(rendered.page, { selectors: ["li"], includeDefaults: false });
    const selectors = styles.elements.map((e) => e.selector);

    assert.deepEqual(styles.elements.map((e) => e.text), expected.listItems);
    assert.equal(new Set(selectors).size, 3, "three different selectors");
    assert.deepEqual(selectors, ["#list > li:nth-of-type(1)", "#list > li:nth-of-type(2)", "#list > li:nth-of-type(3)"]);
});

test("Given an element with an id, when it is stored, then its selector is the id", { timeout: 60000 }, async () => {
    const styles = await captureStyles(rendered.page, { selectors: ["#big"], includeDefaults: false });
    assert.equal(styles.elements[0].selector, "#big");
});

test("Given an element that matches two queries, when styles are captured, then it is stored once", { timeout: 60000 }, async () => {
    const styles = await captureStyles(rendered.page, { selectors: ["#big", "button#big", "button"], includeDefaults: false });
    const bigs = styles.elements.filter((e) => e.id === "big");
    assert.equal(bigs.length, 1);
});

test("Given the same page captured twice, when selectors are stored, then each element has the same selector both times", { timeout: 60000 }, async () => {
    const options = { selectors: ["li", "#big", "h1", "button"], includeDefaults: false };

    const first = await captureStyles(rendered.page, options);
    const second = await captureStyles(rendered.page, options);
    assert.deepEqual(second.elements.map((e) => e.selector), first.elements.map((e) => e.selector));
});

test("Given the page is loaded again, when selectors are stored, then the same elements get the same selectors", { timeout: 60000 }, async () => {
    const options = { selectors: ["li", "#big", "h1", "button"], includeDefaults: false };
    const before = await captureStyles(rendered.page, options);

    await rendered.page.reload({ waitUntil: "load" });
    const after = await captureStyles(rendered.page, options);

    const pairs = (styles) => styles.elements.map((e) => `${e.selector} => ${e.text}`);
    assert.deepEqual(pairs(after), pairs(before), "a selector still points to the same element after a reload");
});