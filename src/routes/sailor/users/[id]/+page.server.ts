import { redirect, fail, error } from '@sveltejs/kit';
import { log } from '$sailor/core/utils/logger';
import { db } from '$sailor/core/db/index.server';
import { eq, ne, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { users, accounts, sessions } from '$sailor/generated/schema';
import {
  adoptUserContent,
  deleteUserContent,
  getUserContentSummary
} from '$sailor/core/services/user-adoption.server';
import type { User } from '$sailor/generated/types';
// Database type removed - using any for flexibility
import type { Actions, PageServerLoad } from './$types';

export type AvailableUser = Pick<User, 'id' | 'name' | 'email'>;

export const load: PageServerLoad = async ({ params, locals }) => {
  // Check if user is authenticated and admin
  if (!locals.user?.id || locals.user.role !== 'admin') {
    throw redirect(302, '/sailor');
  }

  const userId = params.id;
  if (!userId) {
    throw error(404, 'User not found');
  }

  try {
    // Try to fetch the user
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
        updated_at: true
      }
    });

    // Fetch other users for adoption option (exclude user being edited/deleted)
    const availableUsers: AvailableUser[] =
      userId !== 'new' && user
        ? await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email
            })
            .from(users)
            .where(ne(users.id, userId))
        : [];

    // Get content summary for the user (for deletion confirmation)
    const contentSummary = user ? await getUserContentSummary(userId) : {};

    return {
      targetUser: user, // Will be null if not found (create mode)
      isCreateMode: !user,
      availableUsers,
      contentSummary
    };
  } catch (err) {
    log.error('Failed to load user', { userId }, err as Error);
    // Return create mode on any database error
    return {
      targetUser: null,
      isCreateMode: true,
      availableUsers: [],
      contentSummary: {}
    };
  }
};

export const actions: Actions = {
  create: async ({ request, params, locals }) => {
    // Check if user is authenticated and admin
    if (!locals.user?.id || locals.user.role !== 'admin') {
      throw redirect(302, '/sailor');
    }

    const userId = params.id;
    if (!userId) {
      throw error(400, 'User ID is required');
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const role = formData.get('role') as string;

    // Validation
    if (!name || !email || !password || !role) {
      return fail(400, {
        error: 'All fields are required',
        values: { name, email, role }
      });
    }

    if (password.length < 6) {
      return fail(400, {
        error: 'Password must be at least 6 characters long',
        values: { name, email, role }
      });
    }

    if (password !== confirmPassword) {
      return fail(400, {
        error: 'Passwords do not match',
        values: { name, email, role }
      });
    }

    if (!['admin', 'editor', 'user'].includes(role)) {
      return fail(400, {
        error: 'Invalid role selected',
        values: { name, email, role }
      });
    }

    try {
      // Check if user with this email already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email)
      });

      if (existingUser) {
        return fail(400, {
          error: 'A user with this email already exists',
          values: { name, email, role }
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user and credential account in a transaction
      await db.transaction(async (tx: any) => {
        // Create user (without password - better-auth doesn't use users.password)
        await tx.insert(users).values({
          id: userId,
          name,
          email,
          role: role as 'admin' | 'editor' | 'user',
          created_at: new Date(),
          updated_at: new Date()
        });

        // Create credential account for better-auth
        await tx.insert(accounts).values({
          id: crypto.randomUUID(),
          user_id: userId,
          account_id: email,
          provider_id: 'credential',
          password: hashedPassword,
          created_at: new Date(),
          updated_at: new Date()
        });
      });
    } catch (error) {
      log.error('Failed to create user', {}, error as Error);
      log.error('Error details', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack
      } as any);

      return fail(500, {
        error: 'Failed to create user. Please try again.',
        values: { name, email, role }
      });
    }

    return { success: true, message: 'User created successfully' };
  },

  update: async ({ request, params, locals }) => {
    // Check if user is authenticated and admin
    if (!locals.user?.id || locals.user.role !== 'admin') {
      throw redirect(302, '/sailor');
    }

    const userId = params.id;
    if (!userId) {
      throw error(404, 'User not found');
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const role = formData.get('role') as string;

    // Validation
    if (!name || !email || !role) {
      return fail(400, {
        error: 'Name, email, and role are required',
        values: { name, email, role }
      });
    }

    if (password && password.length < 6) {
      return fail(400, {
        error: 'Password must be at least 6 characters long',
        values: { name, email, role }
      });
    }

    if (password && password !== confirmPassword) {
      return fail(400, {
        error: 'Passwords do not match',
        values: { name, email, role }
      });
    }

    if (!['admin', 'editor', 'user'].includes(role)) {
      return fail(400, {
        error: 'Invalid role selected',
        values: { name, email, role }
      });
    }

    try {
      // Check if another user with this email already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email) // Will check below if it's the same user
      });

      if (existingUser && existingUser.id !== userId) {
        return fail(400, {
          error: 'A user with this email already exists',
          values: { name, email, role }
        });
      }

      // Update user and credential account in a transaction
      await db.transaction(async (tx: any) => {
        // Update user (without password - better-auth doesn't use users.password)
        await tx
          .update(users)
          .set({
            name,
            email,
            role: role as 'admin' | 'editor' | 'user',
            updated_at: new Date()
          })
          .where(eq(users.id, userId));

        // Update password in credential account if provided
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);

          // Update existing credential account or create one if it doesn't exist
          const existingAccount = await tx.query.accounts.findFirst({
            where: and(eq(accounts.user_id, userId), eq(accounts.provider_id, 'credential'))
          });

          if (existingAccount) {
            // Update existing credential account
            await tx
              .update(accounts)
              .set({
                password: hashedPassword,
                account_id: email, // Update account_id in case email changed
                updated_at: new Date()
              })
              .where(eq(accounts.id, existingAccount.id));
          } else {
            // Create new credential account if none exists
            await tx.insert(accounts).values({
              id: crypto.randomUUID(),
              user_id: userId,
              account_id: email,
              provider_id: 'credential',
              password: hashedPassword,
              created_at: new Date(),
              updated_at: new Date()
            });
          }
        } else {
          // If no password provided but email changed, update account_id
          await tx
            .update(accounts)
            .set({
              account_id: email,
              updated_at: new Date()
            })
            .where(and(eq(accounts.user_id, userId), eq(accounts.provider_id, 'credential')));
        }
      });
    } catch (error) {
      log.error('Failed to update user', { userId }, error as Error);

      return fail(500, {
        error: 'Failed to update user. Please try again.',
        values: { name, email, role }
      });
    }

    return { success: true, message: 'User updated successfully' };
  },

  delete: async ({ params, locals, request }) => {
    // Check if user is authenticated and admin
    if (!locals.user?.id || locals.user.role !== 'admin') {
      throw redirect(302, '/sailor');
    }

    const userId = params.id;
    if (!userId) {
      throw error(404, 'User not found');
    }

    // Prevent deleting own account
    if (userId === locals.user.id) {
      return fail(400, {
        error: 'You cannot delete your own account'
      });
    }

    // Get form data for adoption option
    const formData = await request.formData();
    const adoptingUserId = formData.get('adoptingUserId') as string;

    try {
      // If an adopting user is selected, transfer content
      if (adoptingUserId && adoptingUserId !== 'null' && adoptingUserId !== '') {
        // Verify the adopting user exists
        const adoptingUser = await db.query.users.findFirst({
          where: eq(users.id, adoptingUserId),
          columns: { id: true }
        });

        if (!adoptingUser) {
          return fail(400, {
            error: 'Selected user to adopt content does not exist'
          });
        }

        // Transfer content ownership using the new service
        await adoptUserContent(userId, adoptingUserId);
      } else {
        // No adoption - delete all content created by this user
        await deleteUserContent(userId);
      }

      // Delete user and associated auth data
      await db.transaction(async (tx: any) => {
        // Delete associated auth data (always cascade these)
        await tx.delete(sessions).where(eq(sessions.user_id, userId));
        await tx.delete(accounts).where(eq(accounts.user_id, userId));

        // Finally delete the user
        await tx.delete(users).where(eq(users.id, userId));
      });
    } catch (error) {
      log.error('Failed to delete user', { userId }, error as Error);

      return fail(500, {
        error: 'Failed to delete user. Please try again.'
      });
    }

    throw redirect(303, '/sailor/users');
  }
};
