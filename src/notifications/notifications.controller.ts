import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZLE } from 'src/database.module';
import { Inject } from '@nestjs/common';
import * as schema from 'src/db/schema';
import { desc, sql } from 'drizzle-orm';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? Math.min(100, Math.max(1, parseInt(limitStr, 10))) : 20;

    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(sql`${schema.notifications.userId} = ${user.id}`)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.notifications)
      .where(sql`${schema.notifications.userId} = ${user.id}`);

    return { items: rows, total: count, page, limit };
  }
}
