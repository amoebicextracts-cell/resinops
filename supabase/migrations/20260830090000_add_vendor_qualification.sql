-- Customer-facing counterpart to ResinOps' own supplier-qualification
-- document (docs/supplier-qualification.md): lets a facility document
-- and track qualification of ITS OWN vendors -- Annex 11 §3 for the
-- customer, not for ResinOps itself. Extends the existing vendors table
-- (already used for supply/equipment-service vendor contacts, POs, and
-- invoices in InventoryERP.jsx) rather than a new table, since a
-- qualification record is a property of an existing vendor, not a new
-- entity.
--
-- Deliberately lightweight -- a status, a review date pair, and a free
-- text notes field for what's actually on file (COI, W9, license copy,
-- etc.) rather than a full document-management system. ResinOps already
-- has document-upload infrastructure elsewhere (resinex_project_documents)
-- that a future pass could wire up here if a facility wants to attach
-- the actual files; this migration only adds the tracking fields.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

alter table public.vendors
  add column if not exists qualification_status text not null default 'not_started'
    check (qualification_status in ('not_started', 'pending', 'qualified', 'disqualified')),
  add column if not exists qualification_reviewed_at date,
  add column if not exists qualification_reviewed_by text,
  add column if not exists qualification_next_review_date date,
  add column if not exists qualification_notes text;

commit;
