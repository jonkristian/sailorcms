#!/usr/bin/env node

// Import CLI database connection (no SvelteKit dependencies)
import { createCLIDatabase, users } from '../../src/lib/sailor/core/db/cli.js';
import { eq } from 'drizzle-orm';

// Create database connection for CLI usage
let db = null;
async function getDb() {
  if (!db) {
    db = await createCLIDatabase();
  }
  return db;
}

export function registerUserCommands(program) {
  program
    .command('users:list')
    .description('List all users')
    .action(async () => {
      try {
        const database = await getDb();
        console.log('📋 Fetching users...\n');
        const allUsers = await database.select().from(users);

        if (allUsers.length === 0) {
          console.log('No users found in the database.');
          return;
        }

        console.log(`Found ${allUsers.length} user(s):\n`);
        allUsers.forEach((user, index) => {
          console.log(`${index + 1}. ${user.name || 'No name'} (${user.email})`);
          console.log(`   ID: ${user.id}`);
          console.log(`   Role: ${user.role || 'No role assigned'}`);
          console.log(`   Created: ${user.created_at}`);
          console.log('');
        });
      } catch (error) {
        console.error('❌ Error fetching users:', error.message);
        process.exit(1);
      }
    });

  program
    .command('users:role')
    .description('Assign a role to a user by email address')
    .argument('<email>', 'User email to assign role to')
    .argument('<role>', 'Role to assign (admin, editor, user)')
    .action(async (email, role) => {
      // Validate role
      const validRoles = ['admin', 'editor', 'user'];
      if (!validRoles.includes(role)) {
        console.error(`❌ Invalid role. Must be one of: ${validRoles.join(', ')}`);
        process.exit(1);
      }

      try {
        const database = await getDb();
        console.log(`🔍 Looking for user with email: ${email}`);

        // Check if user exists
        const user = await database.select().from(users).where(eq(users.email, email)).get();
        if (!user) {
          console.error('❌ User not found with that email');
          console.log('💡 Make sure the user has signed up first (via email/password or OAuth)');
          process.exit(1);
        }

        console.log(`👤 Found user: ${user.name || 'No name'} (ID: ${user.id})`);
        console.log(`📝 Current role: ${user.role || 'No role assigned'}`);

        if (user.role === role) {
          console.log(`ℹ️  User already has role: ${role}`);
          return;
        }

        console.log(`🔄 Assigning role: ${role}`);

        // Update user role
        await database.update(users).set({ role: role }).where(eq(users.email, email));

        console.log('✅ Role assigned successfully!');
        console.log(`\nUser ${email} now has role: ${role}`);
      } catch (error) {
        console.error('❌ Error assigning role:', error.message);
        process.exit(1);
      }
    });

  program
    .command('users:verify')
    .description("Verify a user's email address")
    .argument('<email>', 'User email to verify')
    .action(async (email) => {
      try {
        const database = await getDb();
        console.log(`🔍 Looking for user with email: ${email}`);

        // Check if user exists
        const user = await database.select().from(users).where(eq(users.email, email)).get();
        if (!user) {
          console.error('❌ User not found with that email');
          process.exit(1);
        }

        console.log(`👤 Found user: ${user.name || 'No name'} (ID: ${user.id})`);
        console.log(`📧 Current email verification status: ${user.email_verified ? 'Verified' : 'Not verified'}`);

        if (user.email_verified) {
          console.log('ℹ️  User email is already verified');
          return;
        }

        console.log('🔄 Verifying user email...');

        // Update user email verification status
        await database.update(users).set({ email_verified: true }).where(eq(users.email, email));

        console.log('✅ Email verified successfully!');
        console.log(`\nUser ${email} can now access email-protected features.`);
      } catch (error) {
        console.error('❌ Error verifying email:', error.message);
        process.exit(1);
      }
    });
}