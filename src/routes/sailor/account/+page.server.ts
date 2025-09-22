import { fail, error, redirect } from '@sveltejs/kit';
import { db, users, accounts } from '$sailor/core/db/index.server';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export const load = async ({ locals }: { locals: App.Locals }) => {
  // Authentication handled by hooks

  const user = await db.query.users.findFirst({
    where: eq(users.id, locals.user!.id)
  });

  if (!user) {
    throw redirect(303, '/sailor/auth/login');
  }

  // Get OAuth accounts for this user (exclude credential-based accounts)
  const oauthAccounts = await db.query.accounts
    .findMany({
      where: eq(accounts.user_id, locals.user!.id)
    })
    .then((accounts: any[]) =>
      accounts.filter((account: any) => account.provider_id !== 'credential')
    );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      image: user.image,
      email_verified: user.email_verified,
      created_at: user.created_at,
      updated_at: user.updated_at
    },
    oauthAccounts
  };
};

export const actions = {
  update: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    if (!locals.user) {
      throw error(401, 'Unauthorized');
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const currentPassword = formData.get('currentPassword') as string;
    const newPassword = formData.get('newPassword') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // Basic validation
    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Name is required' });
    }

    // Password validation
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return fail(400, {
          error: 'Password change requires current password, new password, and confirmation'
        });
      }
      if (newPassword !== confirmPassword) {
        return fail(400, { error: 'New password and confirmation must match' });
      }
    }

    try {
      const updateData: { name: string } = {
        name: name.trim()
      };

      // Handle password change if provided
      if (currentPassword && newPassword) {
        // Get current user's credential account
        const credentialAccount = await db.query.accounts.findFirst({
          where: and(eq(accounts.user_id, locals.user.id), eq(accounts.provider_id, 'credential'))
        });

        if (!credentialAccount || !credentialAccount.password) {
          return fail(400, { error: 'Password authentication not available for this account' });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(
          currentPassword,
          credentialAccount.password
        );
        if (!isCurrentPasswordValid) {
          return fail(400, { error: 'Your current password is incorrect' });
        }

        // Hash new password and update the credential account
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        await db
          .update(accounts)
          .set({ password: hashedNewPassword })
          .where(eq(accounts.id, credentialAccount.id));
      }

      await db.update(users).set(updateData).where(eq(users.id, locals.user.id));

      return { success: true, message: 'Account updated successfully' };
    } catch (err) {
      return fail(500, { error: 'Failed to update user' });
    }
  }
};
