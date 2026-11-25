// Extra tests (not a story criterion): reading a script written as JSON or YAML.

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseScript, ScriptError } = require("../../stateScriptRunner");
const config = require("../../stateScript.config");

let hasYaml = true;
try { require("js-yaml"); } catch { hasYaml = false; }

test("a script object is accepted", () => {
    const s = parseScript({ name: "demo", steps: [{ action: "capture" }] });
    assert.equal(s.name, "demo");
    assert.equal(s.steps.length, 1);
});

test("a JSON string is accepted", () => {
    const s = parseScript('{"name":"json","url":"https://example.com","steps":[{"action":"click","selector":"#a"}]}');
    assert.equal(s.name, "json");
    assert.equal(s.url, "https://example.com");
});

test("a bare list of steps is accepted", () => {
    const s = parseScript([{ action: "capture" }, { action: "capture" }]);
    assert.equal(s.steps.length, 2);
});

test("YAML steps are accepted when js-yaml is installed", { skip: !hasYaml && "js-yaml is not installed" }, () => {
    const yaml = [
        "name: yaml script",
        "maxStates: 3",
        "steps:",
        "  - action: click",
        "    selector: '#open-modal'",
        "  - action: capture",
        "    name: modal open",
    ].join("\n");

    const s = parseScript(yaml);
    assert.equal(s.name, "yaml script");
    assert.equal(s.maxStates, 3);
    assert.equal(s.steps[1].name, "modal open");
});

test("text that is neither JSON nor YAML is rejected with a clear message", () => {
    assert.throws(() => parseScript("{ not: [valid"), (e) => e instanceof ScriptError && e.message.length > 10);
});

test("a script without steps, or with an empty list, is rejected", () => {
    assert.throws(() => parseScript({ name: "x" }), ScriptError);
    assert.throws(() => parseScript({ steps: [] }), ScriptError);
    assert.throws(() => parseScript(null), ScriptError);
    assert.throws(() => parseScript(42), ScriptError);
});

test("a script with too many steps is rejected", () => {
    const steps = Array.from({ length: config.maxSteps + 1 }, () => ({ action: "wait", ms: 1 }));
    assert.throws(() => parseScript({ steps }), (e) => e instanceof ScriptError && e.message.includes(String(config.maxSteps)));
});
