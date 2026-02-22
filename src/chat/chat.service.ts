import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZLE } from 'src/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from 'src/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

@Injectable()
export class ChatService {
  constructor(
    @Inject(DRIZLE) readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async assertMember(chatRoomId: number, userId: string) {
    const mem = await this.db.query.chatMembers.findFirst({
      where: and(eq(schema.chatMembers.chatRoomId, chatRoomId), eq(schema.chatMembers.userId, userId)),
      columns: { id: true },
    });
    if (!mem) throw new ForbiddenException('Not a member of this chat room');
  }

  async getUserInfo(userId: string) {
    const usersRows = await this.db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        objectKey: schema.fileObjects.objectKey,
        roleId: schema.users.roleId,
        roleName: schema.roles.name,
      })
      .from(schema.users)
      .leftJoin(schema.userAvatars, eq(schema.userAvatars.userId, schema.users.id))
      .leftJoin(schema.fileObjects, eq(schema.fileObjects.id, schema.userAvatars.fileObjectId))
      .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    const userRow = usersRows && usersRows.length > 0 ? usersRows[0] : null;
    if (!userRow) return { id: userId, name: null, email: null, avatar: null, role: { id: null, name: null } };
    return {
      id: userRow.id,
      name: userRow.name ?? null,
      email: userRow.email ?? null,
      avatar: userRow.objectKey ? `/${userRow.objectKey}` : null,
      role: { id: userRow.roleId ?? null, name: userRow.roleName ?? null },
    };
  }


  async getRoom(chatRoomId: number) {
    const room = await this.db.query.chatRooms.findFirst({
      where: eq(schema.chatRooms.id, chatRoomId),
      columns: { id: true, tripId: true, isCustomTrip: true },
    });
    if (!room) throw new NotFoundException('Chat room not found');
    return room;
  }

  async saveMessage(chatRoomId: number, senderId: string, message: string) {
    if (!message?.trim()) throw new BadRequestException('Empty message');
    const [row] = await this.db
      .insert(schema.chatMessages)
      .values({ chatRoomId, senderId, message: message.trim() })
      .returning({
        id: schema.chatMessages.id,
        chatRoomId: schema.chatMessages.chatRoomId,
        senderId: schema.chatMessages.senderId,
        message: schema.chatMessages.message,
        sentAt: schema.chatMessages.sentAt,
      });
    if (!row) return row;

    // attach sender info (name, email, avatar, role) to the returned message
    const usersRows = await this.db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        objectKey: schema.fileObjects.objectKey,
        roleId: schema.users.roleId,
        roleName: schema.roles.name,
      })
      .from(schema.users)
      .leftJoin(schema.userAvatars, eq(schema.userAvatars.userId, schema.users.id))
      .leftJoin(schema.fileObjects, eq(schema.fileObjects.id, schema.userAvatars.fileObjectId))
      .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
      .where(eq(schema.users.id, senderId))
      .limit(1);

    const userRow = usersRows && usersRows.length > 0 ? usersRows[0] : null;
    const avatar = userRow?.objectKey ? `/${userRow.objectKey}` : null;

    return {
      ...row,
      sender: userRow
        ? {
            id: userRow.id,
            name: userRow.name,
            email: userRow.email,
            avatar,
            role: { id: userRow.roleId ?? null, name: userRow.roleName ?? null },
          }
        : { id: senderId, name: null, email: null, avatar: null, role: { id: null, name: null } },
    };
  }

  async recent(chatRoomId: number, limit = 50, beforeId?: number) {
    // simple cursor by message id
    const where = beforeId
      ? and(eq(schema.chatMessages.chatRoomId, chatRoomId), sql`${schema.chatMessages.id} < ${beforeId}`)
      : eq(schema.chatMessages.chatRoomId, chatRoomId);

    // fetch latest `limit` messages (by id desc) then return them ordered oldest->newest
    const rows = await this.db
      .select({
        id: schema.chatMessages.id,
        chatRoomId: schema.chatMessages.chatRoomId,
        senderId: schema.chatMessages.senderId,
        message: schema.chatMessages.message,
        sentAt: schema.chatMessages.sentAt,
        senderName: schema.users.name,
        senderEmail: schema.users.email,
        objectKey: schema.fileObjects.objectKey,
        roleId: schema.users.roleId,
        roleName: schema.roles.name,
      })
      .from(schema.chatMessages)
      .leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.senderId))
      .leftJoin(schema.userAvatars, eq(schema.userAvatars.userId, schema.users.id))
      .leftJoin(schema.fileObjects, eq(schema.fileObjects.id, schema.userAvatars.fileObjectId))
      .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
      .where(where)
      .orderBy(desc(schema.chatMessages.id))
      .limit(Math.min(Math.max(limit, 1), 100));

    // map to desired shape and sort ascending by sentAt (oldest -> newest)
    const mapped = rows.map((r) => ({
      id: r.id,
      chatRoomId: r.chatRoomId,
      senderId: r.senderId,
      message: r.message,
      sentAt: r.sentAt,
      sender: {
        id: r.senderId,
        name: r.senderName ?? null,
        email: r.senderEmail ?? null,
        avatar: r.objectKey ? `/${r.objectKey}` : null,
        role: { id: r.roleId ?? null, name: r.roleName ?? null },
      },
    }));

    // currently rows are newest->oldest, so reverse to oldest->newest
    return mapped.reverse();
  }

  // list all chat rooms for a given user with last message preview
  async listRoomsForUser(userId: string) {
    // get rooms where user is a member
    const rooms = await this.db
      .select({
        id: schema.chatRooms.id,
        tripId: schema.chatRooms.tripId,
        isCustomTrip: schema.chatRooms.isCustomTrip,
      })
      .from(schema.chatRooms)
      .where(sql`${schema.chatRooms.id} IN (SELECT chat_room_id FROM chat_members WHERE user_id = ${userId})`);

    if (!rooms || rooms.length === 0) return [];

    // attach last message preview for each room by fetching the most recent message per room
    const lastByRoom = new Map<number, any>();
    await Promise.all(
      rooms.map(async (r) => {
        const msgs = await this.recent(r.id, 1);
        if (msgs && msgs.length > 0) lastByRoom.set(r.id, msgs[0]);
      }),
    );

    return rooms.map((r) => ({
      ...r,
      lastMessage: lastByRoom.get(r.id) || null,
    }));
  }
}