/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZLE } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import {
  PaginationQueryDto,
  SortBy,
  SortOrder,
} from './dto/pagination-query.dto';
import { asc, desc, eq } from 'drizzle-orm';
import { StorageService } from 'src/storage/storage.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly storageService: StorageService,
  ) {}

  async getUserProfile(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, userId),

      // ⬇️  Only the columns you really need
      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        provider: true,
        providerId: true,
        role: true,
        isActive: true,
        createdAt: true,
      },

      with: {
        wallet: {
          columns: { balance: true, currency: true },
        },
        avatar: {
          with: { fileObject: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Construct avatar URL if exists
    let avatarUrl: string | null = null;
    if (user.avatar?.fileObject) {
      const fileObject = user.avatar.fileObject;
      avatarUrl = `/${fileObject.bucket}/${fileObject.objectKey}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { avatar, ...userWithoutAvatar } = user;
    return {
      user: {
        ...userWithoutAvatar,
        avatar: avatarUrl,
      },
    };
  }

  async findAll(query: PaginationQueryDto) {
    // Validate and set defaults
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 10, 100); // Max 100 items per page
    const sortBy = query.sortBy ?? SortBy.DATE;
    const order = query.order ?? SortOrder.DESC;

    // Determine order column
    let orderByColumn;
    switch (sortBy) {
      case SortBy.NAME:
        orderByColumn = schema.users.name;
        break;
      case SortBy.DATE:
      default:
        orderByColumn = schema.users.createdAt;
    }

    // Execute query
    const usersList = await this.db
      .select()
      .from(schema.users)
      .orderBy(
        order === SortOrder.ASC ? asc(orderByColumn) : desc(orderByColumn),
      )
      .limit(limit)
      .offset(offset);

    return {
      users: usersList,
      pagination: {
        offset,
        limit,
        sortBy,
        order,
        total: await this.db
          .select()
          .from(schema.users)
          .then((res) => res.length),
      },
    };
  }

  async updateUser(
    userId: string,
    updateDto: UpdateUserDto,
    avatar?: Express.Multer.File,
  ) {
    return this.db.transaction(async (tx) => {
      // Get current user with avatar
      const user = await tx.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, userId),
        columns: {
          id: true,
          name: true,
          phone: true,
        },
        with: {
          avatar: {
            with: {
              fileObject: {
                columns: {
                  id: true,
                  objectKey: true,
                  bucket: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Handle avatar update if provided
      let avatarUrl: string | null = null;
      let fileObjectIdToDelete: number | null = null;
      let oldAvatarKey: string | null = null;
      let bucketName: string | null = null;

      if (avatar) {
        // Mark old avatar for deletion if exists
        if (user.avatar?.fileObject) {
          fileObjectIdToDelete = user.avatar.fileObject.id;
          oldAvatarKey = user.avatar.fileObject.objectKey;
          bucketName = user.avatar.fileObject.bucket;
        }

        // Upload new avatar
        const fileName = `avatars/${userId}${avatar.mimetype === 'image/svg+xml' ? '.svg' : '.png'}`;
        await this.storageService.upload(fileName, avatar);

        // Create new file object
        const [newFileObject] = await tx
          .insert(schema.fileObjects)
          .values({
            bucket: process.env.AWS_BUCKET_NAME!,
            objectKey: fileName,
            mime: avatar.mimetype,
            scope: 'PUBLIC',
            ownerId: userId,
          })
          .returning();

        // Update or create avatar record
        if (user.avatar) {
          await tx
            .update(schema.userAvatars)
            .set({ fileObjectId: newFileObject.id })
            .where(eq(schema.userAvatars.userId, userId));
        } else {
          await tx
            .insert(schema.userAvatars)
            .values({ userId, fileObjectId: newFileObject.id });
        }

        avatarUrl = `/${newFileObject.bucket}/${fileName}`;
      }

      // Update user data
      const [updatedUser] = await tx
        .update(schema.users)
        .set({
          name: updateDto.name ?? user.name,
          phone: updateDto.phone ?? user.phone,
        })
        .where(eq(schema.users.id, userId))
        .returning();

      // Delete old avatar after successful update
      if (fileObjectIdToDelete && oldAvatarKey && bucketName) {
        try {
          await this.storageService.delete(oldAvatarKey, bucketName);
          await tx
            .delete(schema.fileObjects)
            .where(eq(schema.fileObjects.id, fileObjectIdToDelete));
        } catch (err) {
          console.error('Error deleting old avatar:', err);
          // Consider logging to an error tracking service
        }
      }

      return {
        ...updatedUser,
        avatar: avatarUrl,
      };
    });
  }
}
