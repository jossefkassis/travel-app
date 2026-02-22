/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DRIZLE } from 'src/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from 'src/db/schema';
import { and, desc, eq, sql, or } from 'drizzle-orm';
import { RequestTopupDto } from './dot/request-topup.dto';

type ReqStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

@Injectable()
export class WalletService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // Ensure a wallet exists for a user
  private async getOrCreateWallet(userId: string) {
    const w = await this.db.query.wallets.findFirst({
      where: (t, { eq }) => eq(t.userId, userId),
    });
    if (w) return w;
    const [nw] = await this.db
      .insert(schema.wallets)
      .values({
        userId,
        balance: '0',
        currency: 'USD',
      })
      .returning();
    return nw;
  }

  // --- User
  async getWallet(userId: string) {
    const w = await this.getOrCreateWallet(userId);
    return { userId: w.userId, balance: w.balance, currency: w.currency };
  }

  async listTransactions(
    userId: string,
    type?: 'CREDIT' | 'DEBIT',
    page = 1,
    limit = 20,
  ) {
    const wallet = await this.getOrCreateWallet(userId);

    // Optional filtering by sign
    const whereParts: any[] = [eq(schema.userTransactions.walletId, wallet.id)];
    if (type === 'CREDIT')
      whereParts.push(sql`${schema.userTransactions.amount} > 0`);
    if (type === 'DEBIT')
      whereParts.push(sql`${schema.userTransactions.amount} < 0`);

    const rows = await this.db
      .select()
      .from(schema.userTransactions)
      .where(and(...whereParts))
      .orderBy(desc(schema.userTransactions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.userTransactions)
      .where(and(...whereParts));

    return { items: rows, total: count, page, limit };
  }

  async requestTopup(userId: string, dto: RequestTopupDto) {
    if (dto.amount <= 0)
      throw new BadRequestException('Amount must be greater than zero');
    await this.getOrCreateWallet(userId);

    const [req] = await this.db
      .insert(schema.balanceRequests)
      .values({
        userId,
        amount: dto.amount.toString(),
        note: dto.note,
        status: 'PENDING',
      })
      .returning();

    return {
      id: req.id,
      status: req.status,
      amount: req.amount,
      note: req.note,
    };
  }

  async listMyRequests(
    userId: string,
    status?: ReqStatus,
    page = 1,
    limit = 20,
  ) {
    const whereParts: any[] = [eq(schema.balanceRequests.userId, userId)];
    if (status) whereParts.push(eq(schema.balanceRequests.status, status));

    const rows = await this.db
      .select()
      .from(schema.balanceRequests)
      .where(and(...whereParts))
      .orderBy(desc(schema.balanceRequests.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.balanceRequests)
      .where(and(...whereParts));

    return { items: rows, total: count, page, limit };
  }

  // --- Admin
  async listAllRequests(status?: ReqStatus, page = 1, limit = 20) {
    const whereParts: any[] = [];
    if (status) whereParts.push(eq(schema.balanceRequests.status, status));


    const rows = await this.db

      .select({
        id: schema.balanceRequests.id,
        status: schema.balanceRequests.status,
        amount: schema.balanceRequests.amount,
        note: schema.balanceRequests.note,
        createdAt: schema.balanceRequests.createdAt,
        updatedAt: schema.balanceRequests.updatedAt,

        // user columns (will be nested in JS)
        userId: schema.users.id,
        userName: schema.users.name,
        userEmail: schema.users.email,

        // wallet balance
        balance: schema.wallets.balance,
      })
      .from(schema.balanceRequests)
      .leftJoin(schema.users, eq(schema.users.id, schema.balanceRequests.userId))
      .leftJoin(schema.wallets, eq(schema.wallets.userId, schema.users.id))
      .where(whereParts.length ? and(...whereParts) : undefined)
      .orderBy(desc(schema.balanceRequests.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.balanceRequests)
      .where(whereParts.length ? and(...whereParts) : undefined);

    const items = rows.map((r: any) => ({
      id: r.id,
      status: r.status,
      amount: r.amount,
      note: r.note,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: {
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        balance: r.balance,
      },
    }));

    return { items, total: count, page, limit };
  }

  async listAllTransactions(
    q?: { search?: string; status?: 'PENDING' | 'POSTED' | 'REJECTED'; source?: 'TOPUP' | 'BOOKING' | 'REFUND' | 'ADMIN_ADJUST' },
    page = 1,
    limit = 20,
  ) {
    const whereParts: any[] = [];

    if (q?.status) {
      whereParts.push(eq(schema.userTransactions.status, q.status));
    }

    if (q?.source) {
      whereParts.push(eq(schema.userTransactions.source, q.source));
    }

    if (q?.search) {
      const like = `%${q.search}%`;
      whereParts.push(
        or(
          sql`${schema.users.name} ILIKE ${like}`,
          sql`${schema.users.email} ILIKE ${like}`,
        ),
      );
    }

    const rows = await this.db
      .select({
        id: schema.userTransactions.id,
        walletId: schema.userTransactions.walletId,
        amount: schema.userTransactions.amount,
        source: schema.userTransactions.source,
        status: schema.userTransactions.status,
        note: schema.userTransactions.note,
        createdAt: schema.userTransactions.createdAt,

        userId: schema.users.id,
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.userTransactions)
      .leftJoin(schema.wallets, eq(schema.wallets.id, schema.userTransactions.walletId))
      .leftJoin(schema.users, eq(schema.users.id, schema.wallets.userId))
      .where(whereParts.length ? and(...whereParts) : undefined)
      .orderBy(desc(schema.userTransactions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.userTransactions)
      .leftJoin(schema.wallets, eq(schema.wallets.id, schema.userTransactions.walletId))
      .leftJoin(schema.users, eq(schema.users.id, schema.wallets.userId))
      .where(whereParts.length ? and(...whereParts) : undefined);

    const items = rows.map((r: any) => ({
      id: r.id,
      walletId: r.walletId,
      amount: r.amount,
      source: r.source,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt,
      user: {
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
      },
    }));

    return {
      items,
      total: count,
      page,
      limit,
      filters: {
        search: q?.search ?? null,
        status: q?.status ?? null,
        source: q?.source ?? null,
      },
    };
  }

  async approveRequest(adminId: string, requestId: number, note?: string) {
    return this.db.transaction(async (tx) => {
      // 1) Load request and validate
      const req = await tx.query.balanceRequests.findFirst({
        where: (r, { eq }) => eq(r.id, requestId),
      });
      if (!req) throw new NotFoundException('Request not found');
      if (req.status !== 'PENDING')
        throw new BadRequestException('Request already processed');

      // 2) Mark as APPROVED (idempotent guard)
      const [approved] = await tx
        .update(schema.balanceRequests)
        .set({
          status: 'APPROVED',
          processedBy: adminId,
          processedAt: new Date(),
          note: note ?? req.note,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.balanceRequests.id, requestId),
            eq(schema.balanceRequests.status, 'PENDING'),
          ),
        )
        .returning();

      if (!approved) throw new BadRequestException('Request already processed');

      // 3) Get wallet + compute before/after
      const wallet = await this.getOrCreateWallet(req.userId);
      const before = wallet.balance ?? '0';

      const [afterWallet] = await tx
        .update(schema.wallets)
        .set({
          balance: sql`${schema.wallets.balance}::numeric + ${req.amount}::numeric`,
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.wallets.id, wallet.id))
        .returning({ balance: schema.wallets.balance });

      // 4) Write ledger row in user_transactions
      await tx.insert(schema.userTransactions).values({
        walletId: wallet.id,
        amount: req.amount, // positive = credit
        source: 'TOPUP',
        status: 'POSTED',
        note: `Top-up request #${req.id} approved by admin ${adminId}`,

        // optional fields (if you added them):
        balanceBefore: before as any,
        balanceAfter: afterWallet.balance as any,
        balanceRequestId: req.id,
      });

      // 5) notify user
      await tx.insert(schema.notifications).values({
        userId: req.userId,
        title: 'Top-up approved',
        body: `Your top-up request #${req.id} for amount ${req.amount} has been approved.`,
        data: JSON.stringify({ type: 'TOPUP_APPROVED', requestId: req.id }),
      });

      return {
        id: req.id,
        status: 'APPROVED',
        amount: req.amount,
        balanceBefore: before,
        balanceAfter: afterWallet.balance,
      };
    });
  }

  async rejectRequest(adminId: string, requestId: number, note?: string) {
    const [updated] = await this.db
      .update(schema.balanceRequests)
      .set({
        status: 'REJECTED',
        processedBy: adminId,
        processedAt: new Date(),
        note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.balanceRequests.id, requestId),
          eq(schema.balanceRequests.status, 'PENDING'),
        ),
      )
      .returning();

    if (!updated)
      throw new BadRequestException('Request not found or already processed');

    // notify user about rejection
    try {
      await this.db.insert(schema.notifications).values({
        userId: updated.userId,
        title: 'Top-up rejected',
        body: `Your top-up request #${updated.id} has been rejected${note ? `: ${note}` : ''}.`,
        data: JSON.stringify({ type: 'TOPUP_REJECTED', requestId: updated.id }),
      });
    } catch (e) {
      // log and continue
      // eslint-disable-next-line no-console
      console.warn('Failed to write topup rejection notification', e);
    }

    return { id: updated.id, status: updated.status };
  }
}
