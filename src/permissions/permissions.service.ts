import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { DRIZLE } from 'src/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class PermissionsService {
    constructor(
        @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>
      ) {}

  async findAll() {
    return this.db.query.permissions.findMany();
  }

  async findOne(id: number) {
    const permission = await this.db.query.permissions.findFirst({
      where: (permissions, { eq }) => eq(schema.permissions.id, id),
    });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }
} 