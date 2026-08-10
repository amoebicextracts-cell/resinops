-- ResinEx foundation, phase 1: a dedicated equipment-company SALES contact
-- on vendors, separate from the existing contact/phone/email (today's
-- general service/support contact -- see Equipment.jsx's vendor dropdown
-- and Maintenance.jsx's work-order vendor field). ResinEx's capex-planning
-- phase needs to request quotes from equipment manufacturers/dealers, and
-- the person who sells equipment is frequently not who services it.
--
-- Additive columns on `vendors`, not a new vendor_contacts child table:
-- this phase needs exactly one more contact per vendor (sales), not an
-- arbitrary many-contacts-with-roles model. A child table would need its
-- own RLS + audit trigger + CRUD surface for no present benefit, and
-- `vendors` predates migration coverage in this repo (no CREATE TABLE on
-- file), adding risk to a join-heavy redesign. Existing consumers
-- (Equipment.jsx, InventoryERP.jsx, Maintenance.jsx) only read
-- name/vendor_type/contact/phone/email/lead_days and are unaffected by
-- pure column additions. Revisit as a real child table only if a vendor
-- legitimately needs multiple sales reps tracked -- not needed now.

alter table public.vendors
  add column if not exists sales_contact_name text,
  add column if not exists sales_contact_title text,
  add column if not exists sales_contact_phone text,
  add column if not exists sales_contact_email text;

comment on column public.vendors.sales_contact_name is 'Equipment sales rep name, for requesting ResinEx capex-planning quotes. Distinct from `contact`, the general service/support contact.';
comment on column public.vendors.sales_contact_title is 'Optional job title of the sales contact, e.g. "Regional Sales Manager".';
comment on column public.vendors.sales_contact_phone is 'Sales contact direct phone, if different from the vendor''s general `phone`.';
comment on column public.vendors.sales_contact_email is 'Sales contact email, for sending quote requests.';
