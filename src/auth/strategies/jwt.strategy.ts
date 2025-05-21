/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { DRIZLE } from '../../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Verify session exists first
    const session = await this.db.query.sessions.findFirst({
      where: (sessions, { and, eq, gt }) =>
        and(eq(sessions.jti, payload.jti), gt(sessions.expiresAt, new Date())),
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, payload.sub),
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return both user data AND the jti
    return {
      ...user,
      jti: payload.jti, // Include the jti from the token
      sub: payload.sub, // Include other relevant claims
    };
  }
}
