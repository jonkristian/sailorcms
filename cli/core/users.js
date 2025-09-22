#!/usr/bin/env node

// Commander is used via program parameter passed to registerUserCommands
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

// Helper function to create a temporary script and execute it
async function runUserScript(scriptContent) {
  const tempScript = path.join(process.cwd(), `user-script-${Date.now()}.js`);

  try {
    await fs.writeFile(tempScript, scriptContent);
    execSync(`bun run ${tempScript}`, { stdio: 'inherit', cwd: process.cwd() });
  } finally {
    await fs.remove(tempScript);
  }
}

export function registerUserCommands(program) {
  program
    .command('users:list')
    .description('List all users')
    .action(async () => {
      const script = `
import { db, users } from './src/lib/sailor/core/db/index.server.js';

async function listUsers() {
  try {
    console.log('📋 Fetching users...\\n');
    const allUsers = await db.select().from(users);

    if (allUsers.length === 0) {
      console.log('No users found in the database.');
      return;
    }

    console.log(\`Found \${allUsers.length} user(s):\\n\`);
    allUsers.forEach((user, index) => {
      console.log(\`\${index + 1}. \${user.name || 'No name'} (\${user.email})\`);
      console.log(\`   ID: \${user.id}\`);
      console.log(\`   Role: \${user.role || 'No role assigned'}\`);
      console.log(\`   Created: \${user.created_at}\`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error fetching users:', error.message);
    process.exit(1);
  }
}

listUsers();
`;
      await runUserScript(script);
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

      const script = `
import { db, users } from './src/lib/sailor/core/db/index.server.js';
import { eq } from 'drizzle-orm';

async function assignRole() {
  try {
    console.log(\`🔍 Looking for user with email: ${email}\`);

    // Check if user exists
    const user = await db.select().from(users).where(eq(users.email, '${email}')).get();
    if (!user) {
      console.error('❌ User not found with that email');
      console.log('💡 Make sure the user has signed up first (via email/password or OAuth)');
      process.exit(1);
    }

    console.log(\`👤 Found user: \${user.name || 'No name'} (ID: \${user.id})\`);
    console.log(\`📝 Current role: \${user.role || 'No role assigned'}\`);

    if (user.role === '${role}') {
      console.log(\`ℹ️  User already has role: ${role}\`);
      return;
    }

    console.log(\`🔄 Assigning role: ${role}\`);

    // Update user role
    await db.update(users).set({ role: '${role}' }).where(eq(users.email, '${email}'));

    console.log('✅ Role assigned successfully!');
    console.log(\`\\nUser ${email} now has role: ${role}\`);
  } catch (error) {
    console.error('❌ Error assigning role:', error.message);
    process.exit(1);
  }
}

assignRole();
`;
      await runUserScript(script);
    });

  program
    .command('users:verify')
    .description("Verify a user's email address")
    .argument('<email>', 'User email to verify')
    .action(async (email) => {
      const script = `
import { db, users } from './src/lib/sailor/core/db/index.server.js';
import { eq } from 'drizzle-orm';

async function verifyEmail() {
  try {
    console.log(\`🔍 Looking for user with email: ${email}\`);

    // Check if user exists
    const user = await db.select().from(users).where(eq(users.email, '${email}')).get();
    if (!user) {
      console.error('❌ User not found with that email');
      process.exit(1);
    }

    console.log(\`👤 Found user: \${user.name || 'No name'} (ID: \${user.id})\`);
    console.log(\`📧 Current email verification status: \${user.email_verified ? 'Verified' : 'Not verified'}\`);

    if (user.email_verified) {
      console.log('ℹ️  User email is already verified');
      return;
    }

    console.log('🔄 Verifying user email...');

    // Update user email verification status
    await db.update(users).set({ email_verified: true }).where(eq(users.email, '${email}'));

    console.log('✅ Email verified successfully!');
    console.log(\`\\nUser ${email} can now access email-protected features.\`);
  } catch (error) {
    console.error('❌ Error verifying email:', error.message);
    process.exit(1);
  }
}

verifyEmail();
`;
      await runUserScript(script);
    });
}
