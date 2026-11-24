// Node test-runner reporter used by CI: writes the results of one test run as a Markdown
// table with one row per story, so every run records clearly what was tested.
//
//   node --test \
//     --test-reporter=tap --test-reporter-destination=stdout \
//     --test-reporter=./.github/ci/story-summary-reporter.mjs --test-reporter-destination=summary.md \
//     <test files>
//
// The story comes from the test file's folder: E2-09_tests/... -> E2-09.
// Files outside an E2-xx_tests folder are listed by file name.
// The table title comes from the STORY_SUMMARY_TITLE environment variable.
// Counts follow node's own summary ("# tests", "# pass", ...): every test is counted, including
// subtests, but not suites; skipped and todo tests are counted separately from passed tests.
// "Test time" adds up only top-level tests, so a parent and its subtests are not counted twice.

import path from "node:path";

function storyOf(file) {
    if (!file) return "(no file)";
    const m = String(file).replace(/\\/g, "/").match(/(?:^|\/)(E\d+-\d+)_tests\//i);
    return m ? m[1].toUpperCase() : path.basename(String(file));
}

// E2-1 < E2-3 < E2-10 (numeric, not text, order)
function compareStories(a, b) {
    const pa = a.match(/^E(\d+)-(\d+)$/);
    const pb = b.match(/^E(\d+)-(\d+)$/);
    if (pa && pb) return Number(pa[1]) - Number(pb[1]) || Number(pa[2]) - Number(pb[2]);
    if (pa) return -1;
    if (pb) return 1;
    return a.localeCompare(b);
}

const oneLine = (s) => String(s).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

export default async function* storySummary(source) {
    const stories = new Map();
    const notes = [];
    const row = (story) => {
        if (!stories.has(story)) {
            stories.set(story, { files: new Set(), tests: 0, pass: 0, fail: 0, cancelled: 0, skip: 0, todo: 0, ms: 0 });
        }
        return stories.get(story);
    };

    for await (const event of source) {
        if (event.type !== "test:pass" && event.type !== "test:fail") continue;
        const d = event.data || {};
        if (d.details && d.details.type === "suite") continue;

        const story = storyOf(d.file);
        const s = row(story);
        if (d.file) s.files.add(d.file);
        s.tests++;
        if (d.nesting === 0) s.ms += (d.details && d.details.duration_ms) || 0;

        const isSet = (v) => v !== undefined && v !== false;
        if (isSet(d.todo)) {
            s.todo++;
            notes.push(`- TODO ${story}: ${oneLine(d.name)}${typeof d.todo === "string" ? ` (${oneLine(d.todo)})` : ""}`);
        } else if (event.type === "test:fail") {
            const cancelled = d.details && d.details.error && d.details.error.failureType === "cancelledByParent";
            if (cancelled) s.cancelled++;
            else s.fail++;
            notes.push(`- ${cancelled ? "CANCELLED" : "FAIL"} ${story}: ${oneLine(d.name)}`);
        } else if (isSet(d.skip)) {
            s.skip++;
            notes.push(`- SKIP ${story}: ${oneLine(d.name)}${typeof d.skip === "string" ? ` (${oneLine(d.skip)})` : ""}`);
        } else {
            s.pass++;
        }
    }

    const title = process.env.STORY_SUMMARY_TITLE || "Test results by story";
    const out = [`### ${title}`, "", "| Story | Files | Tests | Pass | Fail | Cancelled | Skip | Todo | Test time (s, sum) |", "|---|---|---|---|---|---|---|---|---|"];
    const total = { files: 0, tests: 0, pass: 0, fail: 0, cancelled: 0, skip: 0, todo: 0, ms: 0 };
    for (const story of [...stories.keys()].sort(compareStories)) {
        const s = stories.get(story);
        out.push(`| ${story} | ${s.files.size} | ${s.tests} | ${s.pass} | ${s.fail} | ${s.cancelled} | ${s.skip} | ${s.todo} | ${(s.ms / 1000).toFixed(1)} |`);
        total.files += s.files.size;
        for (const k of ["tests", "pass", "fail", "cancelled", "skip", "todo", "ms"]) total[k] += s[k];
    }
    out.push(`| **Total** | ${total.files} | ${total.tests} | ${total.pass} | ${total.fail} | ${total.cancelled} | ${total.skip} | ${total.todo} | ${(total.ms / 1000).toFixed(1)} |`);
    if (total.tests === 0) out.push("", "No tests were reported.");
    if (notes.length) out.push("", "Failed, cancelled, skipped and todo tests:", "", ...notes);
    out.push("");
    yield out.join("\n") + "\n";
}
