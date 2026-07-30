// ============================================================
// ResinOps — Repeatable facility onboarding
// scripts/onboard-facility.mjs
//
// Replaces manual, one-off SQL for seeding a new pilot facility. Creates
// the facilities row, sends the owner a real Supabase invite email (the
// same api/invite.js flow an in-app admin invite uses), and creates the
// pending facility_members row so the owner lands on AuthScreen's
// "accept-invite" mode exactly like any other invited teammate.
//
// Usage:
//   node scripts/onboard-facility.mjs --name "Green Wells Venture LLC" \
//     --owner-email owner@example.com [--license OCM-AUPR-000000] \
//     [--license-type "Adult-Use Cultivator"] [--dry-run | --confirm]
//
// Defaults to --dry-run (prints the plan, writes nothing). Requires
// --confirm to actually create the facility and send the invite.
// Requires SUPABASE_URL (or VITE_SUPABASE_URL) and
// SUPABASE_SERVICE_ROLE_KEY in the environment for --confirm.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv) {
  const args = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--confirm') args.confirm = true;
    else if (arg === '--dry-run') args.confirm = false;
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--license') args.license = argv[++i];
    else if (arg === '--license-type') args.licenseType = argv[++i];
    else if (arg === '--owner-email') args.ownerEmail = argv[++i];
  }
  return args;
}

export function validateArgs(args) {
  if (!args.name || !args.name.trim()) return 'A facility name is required (--name "Facility LLC")';
  if (!args.ownerEmail || !EMAIL_PATTERN.test(args.ownerEmail)) return 'A valid owner email is required (--owner-email you@example.com)';
  return null;
}

export function buildPlan(args) {
  return {
    facility: {
      facility_name: args.name.trim(),
      license_number: args.license?.trim() || null,
      license_type: args.licenseType?.trim() || null,
    },
    owner: { email: args.ownerEmail.trim(), role: 'owner' },
  };
}

export function getServiceRoleClient(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function onboardFacility(args, { env = process.env, clientFactory = getServiceRoleClient } = {}) {
  const validationError = validateArgs(args);
  if (validationError) throw new Error(validationError);

  const plan = buildPlan(args);
  if (!args.confirm) return { dryRun: true, plan };

  const admin = clientFactory(env);
  if (!admin) throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment');

  const { data: facility, error: facilityError } = await admin
    .from('facilities')
    .insert(plan.facility)
    .select()
    .single();
  if (facilityError) throw new Error(`Failed to create facility: ${facilityError.message}`);

  const origin = env.APP_ORIGIN || 'https://app.resinops.com';
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(plan.owner.email, {
    redirectTo: `${origin}/accept-invite`,
  });
  if (inviteError) {
    throw new Error(`Facility created (${facility.id}), but the owner invite email failed to send: ${inviteError.message}. The facility row now exists — either retry the invite manually or delete the facility before re-running this script.`);
  }

  const invitedUserId = inviteData?.user?.id;
  if (!invitedUserId) {
    throw new Error(`Facility created (${facility.id}) and invite sent, but no user id was returned — membership was not created. Investigate before the owner tries to accept.`);
  }

  const { error: memberError } = await admin
    .from('facility_members')
    .upsert(
      { facility_id: facility.id, user_id: invitedUserId, role: plan.owner.role, accepted_at: null },
      { onConflict: 'facility_id,user_id' },
    );
  if (memberError) {
    throw new Error(`Facility created (${facility.id}) and invite sent to ${plan.owner.email}, but membership setup failed: ${memberError.message}`);
  }

  return { dryRun: false, facilityId: facility.id, invitedUserId, invited: plan.owner.email };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const result = await onboardFacility(args, { env });
  if (result.dryRun) {
    console.log('DRY RUN — nothing was written. Plan:');
    console.log(JSON.stringify(result.plan, null, 2));
    console.log('\nRe-run with --confirm to actually create this facility and send the owner invite.');
  } else {
    console.log(`Facility created: ${result.facilityId}`);
    console.log(`Invite sent to ${result.invited} (auth user ${result.invitedUserId})`);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Onboarding failed: ${error.message}`);
    process.exitCode = 1;
  });
}
