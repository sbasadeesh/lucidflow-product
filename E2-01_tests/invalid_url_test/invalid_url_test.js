// E2-01 criterion 3
// Given an invalid URL, when submitted, then a clear error is shown.
// No browser is needed: an invalid address is rejected before anything starts.
// Put in E2-01_tests/. Uses fixtures/expected.json ("invalid-urls")

const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../capture");
const { expected } = require("../fixture");

const bad = expected["invalid-urls"];

test("Given an invalid URL, when submitted, then a clear error is shown", async () => {
    for (const c of bad.cases) {
        await assert.rejects(
            () => capture.render(c.input),
            (e) => {
                assert.ok(e instanceof capture.RenderError, `"${c.input}" gives a RenderError`);
                assert.equal(e.code, bad.errorCode);
                assert.equal(e.httpStatus, bad.httpStatus);
                assert.ok(e.message.includes(c.messageContains), `"${c.input}": ${e.message}`);
                return true;
            }
        );
    }
});