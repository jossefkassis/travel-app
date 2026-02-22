// src/common/decorators/ws-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const WsUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const client = ctx.switchToWs().getClient() as any;
  return client.user; // set by WsJwtGuard
});
