"""Integration tests for schema validation plus the payload cross-checks."""

from __future__ import annotations

import pytest
from jsonschema.exceptions import ValidationError

from tests.helpers.payloads import (
    load_mock,
    load_schema,
    rejected_finding_in_ai_payload,
    zero_findings_payload,
)
from validate_payload import validate_payload


def test_given_the_same_mock_twice_when_validated_then_both_runs_pass() -> None:
    schema = load_schema()
    first = load_mock()
    second = load_mock()
    validate_payload(first, schema)
    validate_payload(second, schema)
    assert first == second, "Repeating validation must not change the payload."


def test_given_zero_findings_when_the_full_contract_runs_then_detection_is_no() -> None:
    payload = zero_findings_payload()
    validate_payload(payload, load_schema())
    assert payload["detection"]["result"] == "no", (
        "The zero-findings fixture must record detection result no."
    )
    assert payload["cap_tracker"]["items"] == [], (
        "The zero-findings fixture must not invent CAP rows."
    )


def test_given_a_rejected_finding_in_ai_payload_when_validated_then_it_fails() -> None:
    with pytest.raises(ValidationError) as caught:
        validate_payload(rejected_finding_in_ai_payload(), load_schema())
    assert list(caught.value.path) == ["ai_payload"], (
        "A rejected finding in the AI payload must be reported on ai_payload. "
        f"Actual path: {list(caught.value.path)}"
    )
    assert "Rejected finding F-003 cannot appear in ai_payload." in str(caught.value), (
        "The error must name the rejected finding. "
        f"Actual error: {caught.value}"
    )
