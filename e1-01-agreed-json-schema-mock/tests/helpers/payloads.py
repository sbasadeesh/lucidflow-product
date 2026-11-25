"""Load the saved mock and build deterministic payload variants for tests."""

from __future__ import annotations

import copy
import json
from pathlib import Path

TASK_ROOT = Path(__file__).resolve().parents[2]
MOCK_PATH = TASK_ROOT / "mock_payload.json"
SCHEMA_PATH = TASK_ROOT / "schema.json"


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_mock() -> dict:
    return load_json(MOCK_PATH)


def load_schema() -> dict:
    return load_json(SCHEMA_PATH)


def zero_findings_payload(base: dict | None = None) -> dict:
    """Return a schema-shaped payload with no findings and zero KPI counts."""
    payload = copy.deepcopy(base if base is not None else load_mock())
    payload["detection"]["result"] = "no"
    payload["detection"]["reason"] = "No dark-pattern findings were recorded."
    payload["findings"] = []
    payload["evidence"] = []
    payload["cap_tracker"]["items"] = []
    empty_kpis = {
        "total_findings": 0,
        "confirmed_findings": 0,
        "candidate_findings": 0,
        "rejected_findings": 0,
        "by_severity": {},
        "by_category": {},
        "by_pattern": {},
    }
    payload["kpis"] = copy.deepcopy(empty_kpis)
    payload["ai_payload"]["included_finding_ids"] = []
    payload["ai_payload"]["confirmed_findings"] = []
    payload["ai_payload"]["facts_for_summary"] = copy.deepcopy(empty_kpis)
    payload["executive_summary"]["potential_findings"] = 0
    payload["executive_summary"]["pattern_distribution"] = {}
    payload["scan"]["pages_scanned"] = 0
    payload["scan"]["states_captured"] = 0
    return payload


def rejected_finding_in_ai_payload(base: dict | None = None) -> dict:
    """Add a rejected finding that is also listed in the AI payload."""
    payload = copy.deepcopy(base if base is not None else load_mock())
    finding = copy.deepcopy(payload["findings"][0])
    finding["finding_id"] = "F-003"
    finding["status"] = "rejected"
    finding["evidence_ids"] = ["E-003"]
    finding["cap_id"] = "CAP-003"
    evidence = copy.deepcopy(payload["evidence"][0])
    evidence["evidence_id"] = "E-003"
    evidence["finding_id"] = "F-003"
    cap = copy.deepcopy(payload["cap_tracker"]["items"][0])
    cap["cap_id"] = "CAP-003"
    cap["finding_id"] = "F-003"
    payload["findings"].append(finding)
    payload["evidence"].append(evidence)
    payload["cap_tracker"]["items"].append(cap)
    kpis = {
        "total_findings": 3,
        "confirmed_findings": 2,
        "candidate_findings": 0,
        "rejected_findings": 1,
        "by_severity": {"MEDIUM": 3},
        "by_category": {"Nagging": 2, "Forced Action": 1},
        "by_pattern": {"Nagging": 2, "Forced Action": 1},
    }
    payload["kpis"] = kpis
    payload["ai_payload"]["facts_for_summary"] = copy.deepcopy(kpis)
    payload["ai_payload"]["included_finding_ids"] = ["F-001", "F-002", "F-003"]
    return payload


def thousand_finding_payload(base: dict | None = None) -> dict:
    """Build 1,000 confirmed findings with matching evidence and CAP rows."""
    payload = copy.deepcopy(base if base is not None else load_mock())
    finding_template = copy.deepcopy(payload["findings"][0])
    evidence_template = copy.deepcopy(payload["evidence"][0])
    cap_template = copy.deepcopy(payload["cap_tracker"]["items"][0])
    findings = []
    evidence_rows = []
    cap_rows = []
    confirmed = []
    included_ids = []
    for number in range(1, 1001):
        finding_id = f"F-{number:04d}"
        evidence_id = f"E-{number:04d}"
        cap_id = f"CAP-{number:04d}"
        finding = copy.deepcopy(finding_template)
        finding["finding_id"] = finding_id
        finding["evidence_ids"] = [evidence_id]
        finding["cap_id"] = cap_id
        evidence = copy.deepcopy(evidence_template)
        evidence["evidence_id"] = evidence_id
        evidence["finding_id"] = finding_id
        cap = copy.deepcopy(cap_template)
        cap["cap_id"] = cap_id
        cap["finding_id"] = finding_id
        findings.append(finding)
        evidence_rows.append(evidence)
        cap_rows.append(cap)
        included_ids.append(finding_id)
        confirmed.append(
            {
                "finding_id": finding_id,
                "status": "confirmed",
                "pattern": finding["pattern"],
                "severity": finding["severity"],
            }
        )
    counts = {
        "total_findings": 1000,
        "confirmed_findings": 1000,
        "candidate_findings": 0,
        "rejected_findings": 0,
        "by_severity": {"MEDIUM": 1000},
        "by_category": {"Nagging": 1000},
        "by_pattern": {"Nagging": 1000},
    }
    payload["findings"] = findings
    payload["evidence"] = evidence_rows
    payload["cap_tracker"]["items"] = cap_rows
    payload["kpis"] = counts
    payload["ai_payload"]["included_finding_ids"] = included_ids
    payload["ai_payload"]["confirmed_findings"] = confirmed
    payload["ai_payload"]["facts_for_summary"] = copy.deepcopy(counts)
    payload["scan"]["rule_versions"] = [payload["scan"]["rule_versions"][0]]
    return payload
