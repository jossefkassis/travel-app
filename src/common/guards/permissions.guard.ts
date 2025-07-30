/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Permission,
  REQUIRED_PERMISSIONS_KEY,
} from '../../common/decorators/permissions.decorator';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZLE } from 'src/database.module';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no specific permissions are required for this route, allow access
    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user; // User object attached by JWT or Local strategy

    // If no user is logged in (should be caught by AuthGuard, but good to check)
    if (!user) {
      this.logger.warn('PermissionsGuard: No user found in request.');
      throw new ForbiddenException(
        'You must be logged in to access this resource.',
      );
    }

    // Fetch the user's role and its associated permissions from the database
    // Ensure the user object has roleId, which it should from your JWT payload or initial validation.
    if (!user.roleId) {
      this.logger.error(`PermissionsGuard: User ${user.id} has no roleId.`);
      throw new ForbiddenException('User role not assigned.');
    }

    const userRoleWithPermissions = await this.db.query.roles.findFirst({
      where: eq(schema.roles.id, user.roleId),
      with: {
        rolePermissions: {
          with: {
            permission: true, // Fetch the permission details
          },
        },
      },
    });

    if (!userRoleWithPermissions) {
      this.logger.warn(
        `PermissionsGuard: Role ID ${user.roleId} not found or no permissions assigned.`,
      );
      throw new ForbiddenException('Your role has no associated permissions.');
    }

    const userPermissions = userRoleWithPermissions.rolePermissions.map(
      (rp) => rp.permission.name,
    );

    // Check if the user has all required permissions
    const hasAllRequiredPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (hasAllRequiredPermissions) {
      return true;
    } else {
      this.logger.warn(
        `PermissionsGuard: User ${user.id} lacks required permissions. Required: [${requiredPermissions.join(', ')}], User has: [${userPermissions.join(', ')}]`,
      );
      throw new ForbiddenException(
        `You do not have the necessary permissions to perform this action. Required: ${requiredPermissions.join(', ')}.`,
      );
    }
  }
}
