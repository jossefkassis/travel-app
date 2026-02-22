// chat.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard';
import { WsUser } from 'src/common/decorators/ws-user.decorator';
import { JwtService } from '@nestjs/jwt';

type JoinPayload = { chatRoomId: number };
type SendPayload = { chatRoomId: number; message: string; tempId?: string };
type HistoryPayload = { chatRoomId: number; beforeId?: number; limit?: number };

@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: ['http://localhost:3001','http://192.168.1.4:3001', '*'],
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
  ) {}

  private extractToken(client: Socket): string | null {
    const hs = client.handshake as any;
    const authz: string | undefined = hs.headers?.authorization;
    const fromHeader =
      typeof authz === 'string' && authz.startsWith('Bearer ')
        ? authz.slice(7)
        : null;
    const fromAuth = hs.auth?.token ?? null;
    const fromQuery = hs.query?.token ?? null;
    const fromCookie = (() => {
      const cookies = (hs.headers?.cookie as string | undefined) ?? '';
      const map = cookies
        .split(';')
        .map((c) => c.trim())
        .reduce(
          (acc, c) => {
            const [k, ...rest] = c.split('=');
            if (k) acc[k] = decodeURIComponent(rest.join('='));
            return acc;
          },
          {} as Record<string, string>,
        );
      return map['accessToken'] ?? null;
    })();
    return fromHeader || fromAuth || fromQuery || fromCookie;
  }

  afterInit(server: Server) {
    // Handshake auth middleware
    server.use((socket, next) => {
      try {
        const token = this.extractToken(socket);
        if (!token) return next(new Error('Unauthorized'));
        const payload = this.jwt.verify(token);
        (socket as any).user = {
          id: payload.sub ?? payload.id ?? payload.userId ?? payload.uid,
          ...payload,
        };
        return next();
      } catch {
        return next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    console.log('connected');
    // At this point, (client as any).user is set
    // If you still want to reject here:
    if (!(client as any).user) {
      client.disconnect(true);
      return;
    }
  }

  handleDisconnect(client: Socket) {}

  // Now per-message guard is optional,
  // but you can keep it for defense-in-depth:
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat.join')
  async join(
    @MessageBody() body: { chatRoomId: number },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`room:${body.chatRoomId}`);

    // explicitly emit back to this client
    client.emit('chat.joined', { chatRoomId: body.chatRoomId });

    // also send history
    const items = await this.chat.recent(body.chatRoomId, 20);
    client.emit('chat.history', { chatRoomId: body.chatRoomId, items });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat.leave')
  async leave(
    @MessageBody() body: { chatRoomId: number },
    @ConnectedSocket() client: Socket,
  ) {
    await client.leave(`room:${body.chatRoomId}`);
    client.emit('chat.left', { chatRoomId: body.chatRoomId });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat.send')
  async send(
    @MessageBody()
    body: { chatRoomId: number; message: string; tempId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user as { id: string };
    await this.chat.assertMember(body.chatRoomId, user.id);

    const saved = await this.chat.saveMessage(
      body.chatRoomId,
      user.id,
      body.message,
    );

    // ack to sender
    client.emit('chat.ack', { tempId: body.tempId, message: saved });

    // broadcast to everyone in the room (including sender if you want)
    this.server.to(`room:${body.chatRoomId}`).emit('chat.message', saved);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat.history')
  async history(
    @MessageBody()
    body: { chatRoomId: number; beforeId?: number; limit?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user as { id: string };
    await this.chat.assertMember(body.chatRoomId, user.id);
    const items = await this.chat.recent(
      body.chatRoomId,
      body.limit,
      body.beforeId,
    );
    client.emit('chat.history', { chatRoomId: body.chatRoomId, items });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('chat.typing')
  async typing(
    @MessageBody() body: { chatRoomId: number; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user as { id: string };
    await this.chat.assertMember(body.chatRoomId, user.id);
    const info = await this.chat.getUserInfo(user.id);
    // emit includes user info (id, name, email, avatar, role)
    client
      .to(`room:${body.chatRoomId}`)
      .emit('chat.typing', { userId: user.id, info: info, isTyping: body.isTyping });
  }
}
