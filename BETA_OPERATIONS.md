# ResinOps private-beta operating guide

## Admission criteria

Start with one facility and one named operator. Expand to no more than three facilities only after the first facility completes a stable week. Record the operator's facility, role, support contact, onboarding date, workflows being tested, and whether the facility uses real or synthetic data.

Before importing production data, the operator must export the source system data and confirm where that backup is stored. Do not use the beta as the only copy of operational or compliance records.

## Onboarding session

1. Confirm the operator is authorized to use the facility's data.
2. Explain role permissions and assign the minimum necessary role.
3. Demonstrate the request reference shown with API errors.
4. Confirm METRC writes are disabled and no METRC credentials are stored in browser-readable fields.
5. Review the AI decision-support warning and identify workflows that always require human approval.
6. Run a read-only tenant-isolation smoke test before the operator imports data.
7. Record the support channel and expected response times from `INCIDENT_RESPONSE.md`.

## Weekly beta review

Collect feedback under these workflows: authentication and access, data import, cultivation, inventory, production, quality, compliance, reporting, AI assistance, and integrations. For each item record severity, frequency, workaround, request IDs, affected role, and whether data correction is required.

## Exit criteria

A facility exits the beta when it requests deletion, violates acceptable-use or access requirements, cannot maintain its source-data backup, or creates unacceptable safety/compliance risk. Export requested operator data, revoke access, document retention/deletion actions, and preserve required incident evidence.
