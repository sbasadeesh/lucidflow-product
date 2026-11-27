// E2-02 DOM/style evidence: schema and validators for the allowlisted record format.
// All keys and value domains are fixed. Unknown keys are dropped. Out-of-domain values become null
// and are counted, never stored raw.

const HTML_TAGS = [
    "html", "head", "body", "title", "meta", "link", "style", "script",
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span", "a", "button",
    "input", "textarea", "select", "option", "label", "form", "fieldset", "legend",
    "img", "picture", "video", "audio", "source", "track", "canvas", "svg",
    "table", "tr", "td", "th", "tbody", "thead", "tfoot", "caption", "col", "colgroup",
    "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "section", "article",
    "aside", "nav", "header", "footer", "main", "dialog", "details", "summary",
    "iframe", "embed", "object", "param", "bdo", "br", "hr", "wbr", "pre", "code",
    "kbd", "samp", "var", "mark", "del", "ins", "sub", "sup", "time", "address",
    "blockquote", "q", "cite", "dfn", "abbr", "strong", "em", "small", "template",
];

const HTML_TYPES = [
    "button", "checkbox", "color", "date", "datetime-local", "email", "file", "hidden",
    "image", "month", "number", "password", "radio", "range", "reset", "search", "submit",
    "tel", "text", "time", "url", "week",
];

const ARIA_ROLES = [
    "alert", "alertdialog", "application", "article", "banner", "blockquote", "button",
    "caption", "cell", "checkbox", "code", "columnheader", "combobox", "complementary",
    "contentinfo", "definition", "deletion", "dialog", "directory", "document", "emphasis",
    "feed", "figure", "form", "generic", "group", "heading", "img", "insertion", "link",
    "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar",
    "menuitem", "menuitemcheckbox", "menuitemradio", "navigation", "note", "option",
    "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup",
    "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton",
    "status", "strong", "subscript", "superscript", "switch", "tab", "table", "tablist",
    "tabpanel", "term", "textbox", "time", "timer", "toolbar", "tooltip", "tree", "treegrid",
    "treeitem",
];

const COLOR_RE = /^rgba?\(\d{1,3}, \d{1,3}, \d{1,3}(, (0|1|0?\.\d{1,6}))?\)$/;
const FONT_SIZE_RE = /^\d{1,4}(\.\d{1,4})?px$/;
const FONT_WEIGHT_RE = /^([1-9]\d{0,2}|1000)$/;
const OPACITY_RE = /^(0|1|0?\.\d{1,6})$/;
const Z_INDEX_RE = /^(auto|-?\d{1,10})$/;
const DISPLAY_VALUES = new Set(["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "table", "table-row", "table-cell", "list-item", "contents", "flow-root"]);
const VISIBILITY_VALUES = new Set(["visible", "hidden", "collapse"]);
const POSITION_VALUES = new Set(["static", "relative", "absolute", "fixed", "sticky"]);
const POINTER_EVENTS = new Set(["auto", "none", "visiblePainted", "visibleFill", "visibleStroke", "visible", "painted", "fill", "stroke", "all"]);
const ARIA_STATE_VALUES = new Set(["true", "false", "mixed"]);

function validateTag(tag) {
    return typeof tag === "string" && (HTML_TAGS.includes(tag) || tag === "x-other") ? tag : null;
}

function validateType(type) {
    return typeof type === "string" && (HTML_TYPES.includes(type) || type === "other") ? type : null;
}

function validateRole(role) {
    return typeof role === "string" && (ARIA_ROLES.includes(role) || role === "other") ? role : null;
}

function validateColor(color) {
    return typeof color === "string" && COLOR_RE.test(color) ? color : null;
}

function validateFontSize(size) {
    return typeof size === "string" && FONT_SIZE_RE.test(size) ? size : null;
}

function validateFontWeight(weight) {
    return typeof weight === "string" && FONT_WEIGHT_RE.test(weight) ? weight : null;
}

function validateOpacity(opacity) {
    return typeof opacity === "string" && OPACITY_RE.test(opacity) ? opacity : null;
}

function validateDisplay(display) {
    return typeof display === "string" && DISPLAY_VALUES.has(display) ? display : null;
}

function validateVisibility(visibility) {
    return typeof visibility === "string" && VISIBILITY_VALUES.has(visibility) ? visibility : null;
}

function validatePosition(position) {
    return typeof position === "string" && POSITION_VALUES.has(position) ? position : null;
}

function validateZIndex(zIndex) {
    return typeof zIndex === "string" && Z_INDEX_RE.test(zIndex) ? zIndex : null;
}

function validatePointerEvents(pe) {
    return typeof pe === "string" && POINTER_EVENTS.has(pe) ? pe : null;
}

function validateAriaState(state) {
    return typeof state === "string" && ARIA_STATE_VALUES.has(state) ? state : null;
}

function validateRecord(record) {
    const errors = [];
    
    // Check for unknown top-level keys
    const allowedKeys = new Set([
        "schemaVersion", "scanId", "seq", "endpoint", "link", "capturedAt", "durationMs",
        "viewport", "scroll", "document", "elements", "counts", "excluded"
    ]);
    for (const key of Object.keys(record)) {
        if (!allowedKeys.has(key)) errors.push(`unknown key: ${key}`);
    }
    
    if (record.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (typeof record.scanId !== "string" || !/^scan-\d{1,16}$/.test(record.scanId)) errors.push("scanId");
    if (typeof record.seq !== "number" || record.seq < 1 || record.seq > 999) errors.push("seq");
    if (!["screenshot", "script"].includes(record.endpoint)) errors.push("endpoint");
    if (record.endpoint === "screenshot") {
        const link = record.link;
        if (!link || typeof link !== "object" || typeof link.label !== "string" || typeof link.rawObservationIndex !== "number") errors.push("link (screenshot)");
        const labels = ["full-page", "evidence-crop", "sensitive-field", "top-of-page", "quote-before-phone", "element"];
        if (!labels.includes(link.label)) errors.push("link.label");
    } else {
        const link = record.link;
        if (!link || typeof link !== "object" || typeof link.step !== "number" || typeof link.stateIndex !== "number") errors.push("link (script)");
    }
    if (typeof record.capturedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.capturedAt)) errors.push("capturedAt");
    if (typeof record.durationMs !== "number" || record.durationMs < 0 || record.durationMs > 60000) errors.push("durationMs");
    if (!record.viewport || typeof record.viewport.width !== "number" || typeof record.viewport.height !== "number") errors.push("viewport");
    if (!record.scroll || typeof record.scroll.x !== "number" || typeof record.scroll.y !== "number") errors.push("scroll");
    if (!record.document || typeof record.document.width !== "number" || typeof record.document.height !== "number" || typeof record.document.nodeCount !== "number") errors.push("document");
    if (!Array.isArray(record.elements)) errors.push("elements not array");
    for (const el of record.elements) {
        // Check for unknown element keys
        const allowedElKeys = new Set([
            "path", "tag", "type", "role", "state", "box", "visible", "hiddenReason", "inViewport", "style"
        ]);
        for (const key of Object.keys(el)) {
            if (!allowedElKeys.has(key)) errors.push(`element unknown key: ${key}`);
        }
        
        if (typeof el.path !== "string") errors.push("element.path");
        const tags = el.path.split(" > ");
        for (const tag of tags) {
            if (!/^(html|x-other(?::nth-of-type\(\d+\))?|[a-z0-9]+(?::nth-of-type\(\d+\))?)$/.test(tag)) errors.push(`element.path tag: ${tag}`);
        }
        if (!validateTag(el.tag)) errors.push("element.tag");
        if (el.type !== null && !validateType(el.type)) errors.push("element.type");
        if (el.role !== null && !validateRole(el.role)) errors.push("element.role");
        if (el.state) {
            const allowedStateKeys = new Set([
                "checked", "disabled", "required", "readOnly", "open",
                "expanded", "ariaChecked", "ariaDisabled", "ariaHidden", "ariaModal", "selectedIndex", "multiple"
            ]);
            for (const key of Object.keys(el.state)) {
                if (!allowedStateKeys.has(key)) errors.push(`element.state unknown key: ${key}`);
            }
            if (typeof el.state.checked !== "boolean" && el.state.checked !== null) errors.push("element.state.checked");
            if (typeof el.state.disabled !== "boolean" && el.state.disabled !== null) errors.push("element.state.disabled");
            if (typeof el.state.required !== "boolean" && el.state.required !== null) errors.push("element.state.required");
            if (typeof el.state.readOnly !== "boolean" && el.state.readOnly !== null) errors.push("element.state.readOnly");
            if (typeof el.state.open !== "boolean" && el.state.open !== null) errors.push("element.state.open");
            if (el.state.expanded !== null && !validateAriaState(el.state.expanded)) errors.push("element.state.expanded");
            if (el.state.ariaChecked !== null && !validateAriaState(el.state.ariaChecked)) errors.push("element.state.ariaChecked");
            if (el.state.ariaDisabled !== null && !validateAriaState(el.state.ariaDisabled)) errors.push("element.state.ariaDisabled");
            if (el.state.ariaHidden !== null && !validateAriaState(el.state.ariaHidden)) errors.push("element.state.ariaHidden");
            if (el.state.ariaModal !== null && !validateAriaState(el.state.ariaModal)) errors.push("element.state.ariaModal");
            if (typeof el.state.selectedIndex !== "number" && el.state.selectedIndex !== null) errors.push("element.state.selectedIndex");
            if (typeof el.state.multiple !== "boolean" && el.state.multiple !== null) errors.push("element.state.multiple");
        }
        if (el.style) {
            if (el.style.color !== null && !validateColor(el.style.color)) errors.push("element.style.color");
            if (el.style.display !== null && !validateDisplay(el.style.display)) errors.push("element.style.display");
        }
    }
    return errors;
}

module.exports = {
    HTML_TAGS,
    HTML_TYPES,
    ARIA_ROLES,
    validateTag,
    validateType,
    validateRole,
    validateColor,
    validateFontSize,
    validateFontWeight,
    validateOpacity,
    validateDisplay,
    validateVisibility,
    validatePosition,
    validateZIndex,
    validatePointerEvents,
    validateAriaState,
    validateRecord,
};
