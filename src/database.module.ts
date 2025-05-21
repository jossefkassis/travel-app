import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as schema from './db/schema';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';

export const DRIZLE = Symbol('drizzle-connection');

@Module({
  providers: [
    {
      provide: DRIZLE,
      inject: [ConfigService],
      // eslint-disable-next-line @typescript-eslint/require-await
      useFactory: async (configService: ConfigService) => {
        const dburl = configService.get<string>('DATABASE_URL');
        const pool = new Pool({
          connectionString: dburl,
          // ssl: true,
        });
        return drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;
      },
    },
  ],
  exports: [DRIZLE],
})
export class DatabaseModule {}
