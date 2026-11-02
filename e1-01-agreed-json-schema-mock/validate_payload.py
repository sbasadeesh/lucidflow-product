"""Validate a LucidFlow payload beyond the shape rules in schema.json.

schema.json checks the shape of each section. This module also checks the
links between ids, the code-derived KPI counts, and the AI hand-off.
"""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError

CONFIG_PATH = Path(__file__).resolve().parent / "config" / "schema_contract_config.json"


def _load_contract_config() -> dict:
    with CONFIG_PATH.open(encoding="utf-8") as config_file:
        return json.load(config_file)


CONTRACT_CONFIG = _load_contract_config()
KPI_FIELDS = tuple(CONTRACT_CONFIG["kpi_fields"])
STATUS_COUNT_FIELDS = CONTRACT_CONFIG["status_count_fields"]


def validate_payload(payload: dict, schema: dict) -> None:
    """Raise ValidationError when the payload breaks the LucidFlow contract."""
    _verify_schema_matches_config(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    validator.validate(payload)
    _check_evidence_links(payload)
    _check_cap_links(payload)
    _check_rule_versions(payload)
    _check_taxonomy_names(payload)
    _check_kpis(payload)
    _check_ai_payload(payload)


def _fail(message: str, path: tuple = ()) -> None:
    raise ValidationError(message, path=path)


def _verify_schema_matches_config(schema: dict) -> None:
    """Keep shared lists in the config aligned with the structural schema."""
    detection = schema["properties"]["detection"]["properties"]["result"]["enum"]
    if detection != CONTRACT_CONFIG["detection_results"]:
        _fail("detection.result in schema.json does not match the contract config.")
    statuses = schema["properties"]["findings"]["items"]["properties"]["status"]["enum"]
    if statuses != CONTRACT_CONFIG["finding_statuses"]:
        _fail("finding status in schema.json does not match the contract config.")
    severities = schema["properties"]["findings"]["items"]["properties"]["severity"][
        "enum"
    ]
    if severities != CONTRACT_CONFIG["provisional_severity_values"]:
        _fail("severity in schema.json does not match the contract config.")
    appendix = schema["properties"]["report"]["properties"][
        "include_responsible_business_appendix"
    ]["const"]
    if appendix is not CONTRACT_CONFIG["include_responsible_business_appendix"]:
        _fail("The appendix flag in schema.json does not match the contract config.")
    if CONTRACT_CONFIG["schema_version"] not in schema["$id"]:
        _fail("schema.json $id does not match the contract config schema version.")


def _check_taxonomy_names(payload: dict) -> None:
    names = [item["name"] for item in payload["dark_pattern_taxonomy"]["patterns"]]
    expected = CONTRACT_CONFIG["taxonomy_patterns"]
    if names != expected:
        _fail(
            "dark_pattern_taxonomy.patterns must use the 13 approved pattern names, "
            "in the approved order."
        )


def _count_by(findings: list[dict], field_name: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        key = finding[field_name]
        counts[key] = counts.get(key, 0) + 1
    return counts


def _ids_with_status(findings: list[dict], status: str) -> list[str]:
    return [
        finding["finding_id"] for finding in findings if finding["status"] == status
    ]


def _check_evidence_links(payload: dict) -> None:
    evidence_by_id: dict[str, dict] = {}
    for item in payload["evidence"]:
        evidence_id = item["evidence_id"]
        if evidence_id in evidence_by_id:
            _fail(f"Duplicate evidence id {evidence_id}.")
        evidence_by_id[evidence_id] = item

    referenced_ids: list[str] = []
    for finding in payload["findings"]:
        finding_id = finding["finding_id"]
        for evidence_id in finding["evidence_ids"]:
            item = evidence_by_id.get(evidence_id)
            if item is None:
                _fail(
                    f"Finding {finding_id} points at unknown evidence id {evidence_id}."
                )
            if item["finding_id"] != finding_id:
                _fail(
                    f"Evidence {evidence_id} is linked to {item['finding_id']}, "
                    f"not {finding_id}."
                )
            if item["rule_id"] != finding["rule_id"]:
                _fail(f"Evidence {evidence_id} uses a different rule_id.")
            if item["state_id"] != finding["state_id"]:
                _fail(f"Evidence {evidence_id} uses a different state_id.")
            if item["url"] != finding["page_scanned"]:
                _fail(f"Evidence {evidence_id} uses a different url.")
            referenced_ids.append(evidence_id)

    orphan_ids = set(evidence_by_id) - set(referenced_ids)
    if orphan_ids:
        names = ", ".join(sorted(orphan_ids))
        _fail(f"Evidence items are not linked from any finding: {names}.")


def _check_cap_links(payload: dict) -> None:
    cap_by_finding: dict[str, dict] = {}
    for item in payload["cap_tracker"]["items"]:
        finding_id = item["finding_id"]
        if finding_id in cap_by_finding:
            _fail(f"Duplicate CAP row for finding {finding_id}.")
        cap_by_finding[finding_id] = item

    finding_ids = {finding["finding_id"] for finding in payload["findings"]}
    if set(cap_by_finding) != finding_ids:
        _fail("CAP rows must match the finding list by finding_id.")

    for finding in payload["findings"]:
        item = cap_by_finding[finding["finding_id"]]
        if item["cap_id"] != finding["cap_id"]:
            _fail(
                f"Finding {finding['finding_id']} cap_id {finding['cap_id']} "
                f"does not match CAP row {item['cap_id']}."
            )
        if item["pattern"] != finding["pattern"]:
            _fail(f"CAP row {item['cap_id']} pattern does not match its finding.")
        if item["severity"] != finding["severity"]:
            _fail(f"CAP row {item['cap_id']} severity does not match its finding.")
        if item["page_scanned"] != finding["page_scanned"]:
            _fail(f"CAP row {item['cap_id']} page_scanned does not match its finding.")


def _check_rule_versions(payload: dict) -> None:
    known_rules = {
        (rule["rule_id"], rule["version"]) for rule in payload["scan"]["rule_versions"]
    }
    for finding in payload["findings"]:
        rule_key = (finding["rule_id"], finding["rule_version"])
        if rule_key not in known_rules:
            _fail(
                f"Finding {finding['finding_id']} uses rule "
                f"{finding['rule_id']} {finding['rule_version']}, "
                "which is not listed in scan.rule_versions."
            )


def _expected_kpis(findings: list[dict]) -> dict:
    status_counts = {
        field_name: len(_ids_with_status(findings, status))
        for status, field_name in STATUS_COUNT_FIELDS.items()
    }
    return {
        "total_findings": len(findings),
        "confirmed_findings": status_counts["confirmed_findings"],
        "candidate_findings": status_counts["candidate_findings"],
        "rejected_findings": status_counts["rejected_findings"],
        "by_severity": _count_by(findings, "severity"),
        "by_category": _count_by(findings, "category"),
        "by_pattern": _count_by(findings, "pattern"),
    }


def _check_kpis(payload: dict) -> None:
    expected = _expected_kpis(payload["findings"])
    actual = payload["kpis"]
    for field_name in KPI_FIELDS:
        if actual[field_name] != expected[field_name]:
            _fail(
                f"kpis.{field_name} must be calculated from findings. "
                f"Expected {expected[field_name]}."
            )

    facts = payload["ai_payload"]["facts_for_summary"]
    for field_name in KPI_FIELDS:
        if facts.get(field_name) != expected[field_name]:
            _fail(
                f"ai_payload.facts_for_summary.{field_name} must match "
                "the code-derived KPI."
            )


def _check_ai_payload(payload: dict) -> None:
    findings = payload["findings"]
    confirmed_ids = _ids_with_status(findings, "confirmed")
    rejected_ids = set(_ids_with_status(findings, "rejected"))
    ai_payload = payload["ai_payload"]
    included_ids = ai_payload["included_finding_ids"]
    copied_ids = [item["finding_id"] for item in ai_payload["confirmed_findings"]]

    leaked = [finding_id for finding_id in included_ids if finding_id in rejected_ids]
    if leaked:
        names = ", ".join(leaked)
        _fail(
            f"Rejected finding {names} cannot appear in ai_payload.",
            path=("ai_payload",),
        )

    if included_ids != confirmed_ids:
        _fail(
            "ai_payload.included_finding_ids must list confirmed findings only, "
            "in finding order."
        )
    if copied_ids != confirmed_ids:
        _fail("ai_payload.confirmed_findings must contain the confirmed findings only.")
