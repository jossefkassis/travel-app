import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

function parseCookie(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=') ?? '');
  }
  return out;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'ws') return true;
    const client = ctx.switchToWs().getClient<Socket>();

    // if already attached by handshake middleware, allow
    if ((client as any).user) return true;

    // fallback: validate here
    const token =
      (client.handshake.auth as any)?.token ||
      (client.handshake.query as any)?.token ||
      (typeof client.handshake.headers?.authorization === 'string' &&
        client.handshake.headers.authorization.startsWith('Bearer ') &&
        client.handshake.headers.authorization.slice(7)) ||
      parseCookie(client.handshake.headers?.cookie)?.accessToken;

    if (!token) throw new WsException('Unauthorized');

    try {
      const payload = this.jwt.verify(token); // uses same secret/opts as HTTP
      (client as any).user = { id: payload.sub ?? payload.id ?? payload.userId ?? payload.uid, ...payload };
      return true;
    } catch {
      throw new WsException('Unauthorized');
    }
  }
}