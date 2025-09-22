/**
 * Security class for route-level authorization checks
 * Following best practices from https://www.captaincodeman.com/securing-your-sveltekit-app
 */

import type { User } from './acl';
import { createACL, type ACL } from './acl';
import type { Permission, ResourceType } from './types';
import { redirect } from '@sveltejs/kit';

export class Security {
  private user: User | null | undefined;
  private acl: ACL;

  constructor(user: User | null | undefined) {
    this.user = user;
    this.acl = createACL(user);
  }

  /**
   * Check if user is authenticated - throws redirect if not
   */
  isAuthenticated(): Security {
    if (!this.user) {
      throw redirect(303, '/sailor/auth/login');
    }
    return this;
  }

  /**
   * Check if user has admin role - throws redirect if not
   */
  async isAdmin(): Promise<Security> {
    if (!this.user || !(await this.acl.isAdmin())) {
      throw redirect(302, '/sailor?error=Administrator access required');
    }
    return this;
  }

  /**
   * Check if user has specific role - throws redirect if not
   */
  hasRole(role: string): Security {
    if (!this.user || !this.acl.hasRole(role)) {
      throw redirect(302, `/sailor?error=Role '${role}' required`);
    }
    return this;
  }

  /**
   * Check if user has any of the specified roles - throws redirect if not
   */
  hasAnyRole(roles: string[]): Security {
    if (!this.user || !roles.some((role) => this.acl.hasRole(role))) {
      throw redirect(302, `/sailor?error=One of roles [${roles.join(', ')}] required`);
    }
    return this;
  }

  /**
   * Check if user can perform action on resource type - throws redirect if not
   */
  async can(permission: Permission, resourceType: ResourceType, resource?: any): Promise<Security> {
    if (!this.user || !(await this.acl.can(permission, resourceType, resource))) {
      throw redirect(302, `/sailor?error=Permission denied: cannot ${permission} ${resourceType}`);
    }
    return this;
  }

  /**
   * Check if user has any permission for resource type - throws redirect if not
   */
  async hasAnyPermission(resourceType: ResourceType, permission: Permission): Promise<Security> {
    if (!this.user || !(await this.acl.hasAnyPermission(resourceType, permission))) {
      throw redirect(302, `/sailor?error=No ${permission} permissions for ${resourceType}`);
    }
    return this;
  }

  /**
   * Check if user owns a resource - throws redirect if not
   */
  owns(resource: { author?: string }): Security {
    if (!this.user || !this.acl.owns(resource)) {
      throw redirect(302, '/sailor?error=You can only access your own resources');
    }
    return this;
  }

  /**
   * Get the user (after ensuring they're authenticated)
   */
  getUser(): User {
    if (!this.user) {
      throw redirect(303, '/sailor/auth/login');
    }
    return this.user;
  }

  /**
   * Get the ACL instance for more complex checks
   */
  getACL(): ACL {
    return this.acl;
  }

  /**
   * Non-throwing version - check if user is authenticated
   */
  isAuthenticatedSilent(): boolean {
    return !!this.user;
  }

  /**
   * Non-throwing version - check if user has admin role
   */
  async isAdminSilent(): Promise<boolean> {
    if (!this.user) return false;
    return await this.acl.isAdmin();
  }

  /**
   * Non-throwing version - check permission
   */
  async canSilent(
    permission: Permission,
    resourceType: ResourceType,
    resource?: any
  ): Promise<boolean> {
    if (!this.user) return false;
    return await this.acl.can(permission, resourceType, resource);
  }
}

/**
 * Factory function to create a Security instance
 */
export function createSecurity(user: User | null | undefined): Security {
  return new Security(user);
}
