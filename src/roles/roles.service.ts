import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { roles, permissions, rolePermissions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZLE } from '../database.module';
import * as schema from '../db/schema';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>
  ) {}

  async findAll() {
    return this.db.query.roles.findMany({
      with: { rolePermissions: { with: { permission: true } } },
    });
  }

  async findOne(id: number) {
    const role = await this.db.query.roles.findFirst({
      where: (roles, { eq }) => eq(roles.id, id),
      with: { rolePermissions: { with: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto) {
    // Create role
    const [role] = await this.db.insert(roles).values({
      name: dto.name,
      description: dto.description,
    }).returning();
    // Assign permissions
    if (dto.permissionIds && dto.permissionIds.length) {
      await this.db.insert(rolePermissions).values(
        dto.permissionIds.map(pid => ({ roleId: role.id, permissionId: pid }))
      );
    }
    return this.findOne(role.id);
  }

  async update(id: number, dto: UpdateRoleDto) {
    const [role] = await this.db.update(roles).set({
      name: dto.name,
      description: dto.description,
      updatedAt: new Date(),
    }).where(eq(roles.id, id)).returning();
    if (!role) throw new NotFoundException('Role not found');
    // Update permissions
    if (dto.permissionIds) {
      await this.db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await this.db.insert(rolePermissions).values(
        dto.permissionIds.map(pid => ({ roleId: id, permissionId: pid }))
      );
    }
    return this.findOne(id);
  }

  async remove(id: number) {
    const [role] = await this.db.delete(roles).where(eq(roles.id, id)).returning();
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }
}