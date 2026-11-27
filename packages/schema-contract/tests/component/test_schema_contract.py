"""Component tests for the E1-01 schema and mock payload contract."""

from __future__ import annotations

import copy

import pytest
from jsonschema.exceptions import ValidationError

from tests.helpers.payloads import (
    load_mock,
    load_schema,
    thousand_finding_payload,
    zero_findings_payload,
)
from validate_payload import validate_payload


def test_given_the_two_finding_mock_when_validated_then_it_passes() -> None:
    validate_payload(load_mock(), load_schema())


def test_given_the_zero_findings_fixture_when_validated_then_it_passes() -> None:
    payload = zero_findings_payload()
    validate_payload(payload, load_schema())
    assert payload["kpis"]["total_findings"] == 0, (
        "A zero-findings payload must keep the total finding KPI at 0."
    )
    assert payload["findings"] == [], "A zero-findings payload must have an empty finding list."
    assert payload["evidence"] == [], "A zero-findings payload must have an empty evidence list."


def test_given_report_is_missing_when_validated_then_the_message_names_report() -> None:
    payload = load_mock()
    del payload["report"]
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "'report' is a required property" in str(caught.value), (
        "A missing required field must be named in the validation error. "
        f"Actual error: {caught.value}"
    )


def test_given_detection_result_maybe_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["detection"]["result"] = "maybe"
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "maybe" in str(caught.value), (
        "An unsupported detection result must be rejected. "
        f"Actual error: {caught.value}"
    )
    assert "could_not_assess" in str(caught.value), (
        "The detection error must show the allowed values. "
        f"Actual error: {caught.value}"
    )


def test_given_severity_urgent_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["findings"][0]["severity"] = "URGENT"
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "URGENT" in str(caught.value), (
        "A severity outside the provisional scale must be rejected. "
        f"Actual error: {caught.value}"
    )


def test_given_empty_evidence_ids_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["findings"][0]["evidence_ids"] = []
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "non-empty" in str(caught.value) or "minItems" in str(caught.value), (
        "A finding with no evidence link must be rejected. "
        f"Actual error: {caught.value}"
    )


def test_given_appendix_flag_true_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["report"]["include_responsible_business_appendix"] = True
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "False was expected" in str(caught.value), (
        "The responsible-business appendix must stay excluded. "
        f"Actual error: {caught.value}"
    )


def test_given_twelve_taxonomy_patterns_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["dark_pattern_taxonomy"]["patterns"] = payload["dark_pattern_taxonomy"][
        "patterns"
    ][:12]
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "too short" in str(caught.value), (
        "The taxonomy must contain exactly 13 patterns. "
        f"Actual error: {caught.value}"
    )


def test_given_findings_schema_when_inspected_then_it_has_no_maximum_length() -> None:
    schema = load_schema()
    findings = schema["properties"]["findings"]
    evidence = schema["properties"]["evidence"]
    assert "maxItems" not in findings, (
        "findings must not set maxItems; the contract allows 1,000 or more findings."
    )
    assert "maxItems" not in evidence, (
        "evidence must not set maxItems; each finding needs a matching evidence row."
    )


def test_given_1000_findings_and_matching_evidence_when_validated_then_it_passes() -> None:
    validate_payload(thousand_finding_payload(), load_schema())


def test_given_personal_data_flag_true_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["ai_payload"]["contains_personal_data"] = True
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "False was expected" in str(caught.value), (
        "The AI payload must keep contains_personal_data false. "
        f"Actual error: {caught.value}"
    )


def test_given_a_non_datetime_timestamp_when_validated_then_it_fails() -> None:
    payload = copy.deepcopy(load_mock())
    payload["scan"]["started_at"] = "yesterday"
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, load_schema())
    assert "date-time" in str(caught.value), (
        "scan.started_at must be rejected when it is not a date-time. "
        f"Actual error: {caught.value}"
    )
