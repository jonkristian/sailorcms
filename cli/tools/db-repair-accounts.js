// Backfill `accounts.issuer` for installs that pre-date better-auth 1.7.
//
// Background: better-auth <=1.6 identified a linked account by
// (provider_id, account_id). 1.7 scopes identity by a new required `issuer`
// field instead, and looks accounts up with (issuer, account_id). A row
// written before 1.7 has no issuer, so every 1.7 lookup misses it — OAuth
// sign-in fails and the account reads as unlinked.
//
// The value is derived, not stored anywhere else, so the backfill is exact
// (see `@better-auth/core/dist/db/schema/account.mjs`):
//   provider_id === 'credential'  ->  'local:credential'
//   anything else (social/OAuth)  ->  'local:oauth:<encodeURIComponent(id)>'
//
// A provider configured with its own `accountIssuer` (a real OIDC issuer URL,
// rather than better-auth's synthetic one) is NOT covered by this derivation.
// Those rows are reported and left alone — re-linking the account is the only
// way to recover the true issuer.
//
// Postgres: skipped — this ships alongside the other SQLite-only repairs.

import { createConsumerLibsqlClient } from '../utils.js';

// Mirrors createLocalAccountIssuer / createOAuthAccountIssuer.
const CREDENTIAL_PROVIDER = 'credential';

function issuerFor(providerId) {
  const encoded = encodeURIComponent(providerId);
  return providerId === CREDENTIAL_PROVIDER ? `local:${encoded}` : `local:oauth:${encoded}`;
}

async function columnExists(client, table, column) {
  const r = await client.execute(`PRAGMA table_info("${table}")`);
  return (r.rows || []).some((c) => c.name === column);
}

export const ACCOUNT_ISSUER_REPAIR = {
  id: 'accounts-issuer',
  label: 'accounts.issuer backfill (better-auth >=1.7)',
  run: runAccountIssuerRepair
};

/**
 * Backfill `accounts.issuer`. Shared by the standalone `db:repair-accounts`
 * command and `db:repair --all`, so it neither opens nor closes the client and
 * never calls process.exit — it reports status and lets the caller decide.
 *
 * Returns { status: 'ok' | 'would-change' | 'changed' | 'refused', rows }.
 */
export async function runAccountIssuerRepair({ client, dryRun = false }) {
  const hasTable = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`
  );
  if (hasTable.rows.length === 0) {
    console.log('ℹ️  No accounts table — nothing to backfill.');
    return { status: 'skipped', rows: 0 };
  }

  if (!(await columnExists(client, 'accounts', 'issuer'))) {
    console.error(
      '❌ accounts.issuer does not exist yet.\n' +
        '   Run `npx sailor db:update` first — it regenerates the schema and adds the column,\n' +
        '   then re-run this command to backfill it.'
    );
    return { status: 'refused', rows: 0 };
  }

  const pending = await client.execute(
    `SELECT id, provider_id FROM accounts WHERE issuer IS NULL OR issuer = ''`
  );
  if (pending.rows.length === 0) {
    console.log('✅ Nothing to backfill — every account row already has an issuer.');
    return { status: 'ok', rows: 0 };
  }

  // Group by the issuer each row would receive, so one UPDATE covers
  // each provider and the report reads per-provider rather than per-row.
  const byProvider = new Map();
  for (const row of pending.rows) {
    const providerId = row.provider_id;
    const bucket = byProvider.get(providerId) ?? [];
    bucket.push(row.id);
    byProvider.set(providerId, bucket);
  }

  console.log(
    dryRun ? '🔍 Dry run — accounts.issuer backfill:' : '🛠️  Backfilling accounts.issuer…'
  );
  for (const [providerId, ids] of byProvider) {
    console.log(`  ${providerId} → '${issuerFor(providerId)}' (${ids.length} row(s))`);
  }

  // The (issuer, account_id) index is unique. NULLs count as distinct, so
  // the index built fine on a populated table — but the backfill collapses
  // those NULLs into real values and can surface a genuine duplicate.
  // Detect that here rather than failing halfway through the writes.
  const collisions = [];
  for (const [providerId, ids] of byProvider) {
    const issuer = issuerFor(providerId);
    const dupes = await client.execute({
      sql:
        `SELECT account_id, COUNT(*) AS n FROM accounts ` +
        `WHERE provider_id = ? GROUP BY account_id HAVING n > 1`,
      args: [providerId]
    });
    for (const d of dupes.rows) {
      collisions.push({ issuer, accountId: d.account_id, count: Number(d.n), ids });
    }
  }
  if (collisions.length > 0) {
    console.error('\n❌ Refusing to backfill — duplicate (issuer, account_id) pairs:');
    for (const c of collisions) {
      console.error(`   '${c.issuer}' + account_id '${c.accountId}' — ${c.count} rows`);
    }
    console.error(
      '\n   The same external identity is linked more than once. Decide which row to keep\n' +
        '   (usually the most recent `updated_at`), delete the rest, then re-run this command.'
    );
    return { status: 'refused', rows: 0 };
  }

  if (dryRun) {
    console.log(`\n${pending.rows.length} row(s) would be updated. Re-run without --dry-run.`);
    return { status: 'would-change', rows: pending.rows.length };
  }

  let total = 0;
  for (const [providerId] of byProvider) {
    const res = await client.execute({
      sql: `UPDATE accounts SET issuer = ? WHERE provider_id = ? AND (issuer IS NULL OR issuer = '')`,
      args: [issuerFor(providerId), providerId]
    });
    total += Number(res.rowsAffected ?? 0);
  }
  console.log(`\n✅ Backfilled ${total} account row(s).`);
  return { status: 'changed', rows: total };
}

export function registerDbRepairAccounts(program) {
  program
    .command('db:repair-accounts')
    .description('Backfill accounts.issuer for rows written before better-auth 1.7')
    .option('--dry-run', 'Report what would change without modifying anything')
    .action(async (options) => {
      const targetDir = process.cwd();
      const { client, skipped, skipReason } = await createConsumerLibsqlClient(targetDir, {
        skipPostgres: 'Postgres detected — repair is SQLite-only. Nothing to do.'
      }).catch((err) => {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      });
      if (skipped) {
        console.log(`ℹ️  ${skipReason}`);
        return;
      }
      try {
        const result = await runAccountIssuerRepair({ client, dryRun: options.dryRun });
        if (result.status === 'refused') process.exit(1);
      } catch (err) {
        console.error('❌ Repair failed:', err.message);
        process.exit(1);
      } finally {
        client.close?.();
      }
    });
}
