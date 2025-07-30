/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as schema from '../db/schema'; // Adjust path
import { eq, or, and, count, asc, desc, SQL } from 'drizzle-orm';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import {
  PaginationQueryDto,
  SortBy,
  SortOrder,
} from './dto/pagination-query.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZLE } from 'src/database.module';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly storageService: StorageService,
  ) {}

  // --- Operations for the currently logged-in user ---

  async findMe(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        birthDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        role: {
          columns: { name: true },
        },
        userAvatars: {
          with: { fileObject: true },
        },
        wallets: {
          columns: { balance: true, currency: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Logged-in user not found.');
    }

    const avatarUrl = user.userAvatars?.fileObject
      ? `/${user.userAvatars.fileObject.bucket}/${user.userAvatars.fileObject.objectKey}`
      : null;

    const { userAvatars, role, ...rest } = user; // Destructure relations
    return {
      ...rest,
      avatar: avatarUrl,
      role: role?.name,
    };
  }

  async updateMe(userId: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!existingUser) {
      throw new NotFoundException('Logged-in user not found.');
    }

    const [updatedUser] = await this.db
      .update(schema.users)
      .set({
        ...updateUserDto,
        updatedAt: new Date(), // Manually set updatedAt as Drizzle's defaultNow might not trigger on update
      })
      .where(eq(schema.users.id, userId))
      .returning({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        email: schema.users.email,
        phone: schema.users.phone,
        birthDate: schema.users.birthDate,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
        roleId: schema.users.roleId,
      });

    if (!updatedUser) {
      throw new BadRequestException('Failed to update user profile.');
    }

    // Re-fetch with relations to return full object
    return this.findMe(updatedUser.id);
  }

  // --- Operations for Admin (manage any user) ---

  async findAllUsers(paginationQuery: PaginationQueryDto) {
    const {
      offset = 0,
      limit = 10,
      sortBy = SortBy.DATE, // Default to 'date'
      order = SortOrder.DESC, // Default to 'desc'
      roleId,
    } = paginationQuery;
    const whereConditions: SQL<unknown>[] = []; // <-- Use SQL<unknown>[]
    if (roleId) {
      whereConditions.push(eq(schema.users.roleId, roleId));
    }
    // Determine the column to sort by
    let orderByColumn;
    switch (sortBy) {
      case SortBy.NAME:
        orderByColumn = schema.users.name;
        break;
      case SortBy.DATE:
      default:
        orderByColumn = schema.users.createdAt; // Assuming 'createdAt' is your date field for sorting
        break;
    }

    // Determine the sort order
    const orderByDirection = order === SortOrder.ASC ? asc : desc;

    const totalItemsQuery = await this.db
      .select({ count: count(schema.users.id) })
      .from(schema.users)
      .where(whereConditions.length ? and(...whereConditions) : undefined);
    const totalItems = totalItemsQuery[0].count;

    const users = await this.db.query.users.findMany({
      where: whereConditions.length ? and(...whereConditions) : undefined,
      limit,
      offset,
      orderBy: orderByDirection(orderByColumn),
      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        birthDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        role: {
          columns: { name: true, id: true },
        },
        userAvatars: {
          with: { fileObject: true },
        },
      },
    });

    const paginatedUsers = users.map((user) => {
      const avatarUrl = user.userAvatars?.fileObject
        ? `/${user.userAvatars.fileObject.bucket}/${user.userAvatars.fileObject.objectKey}`
        : null;
      const { userAvatars, role, ...rest } = user;
      return {
        ...rest,
        role: {
          id: role?.id,
          name: role?.name,
        },
        avatar: avatarUrl,
      };
    });

    return {
      data: paginatedUsers,
      meta: {
        totalItems,
        offset,
        limit,
        roleId
      },
    };
  }

  async findUserById(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        birthDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        role: {
          columns: { id: true, name: true },
        },
        userAvatars: {
          with: { fileObject: true },
        },
        wallets: {
          columns: { balance: true, currency: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    const avatarUrl = user.userAvatars?.fileObject
      ? `/${user.userAvatars.fileObject.bucket}/${user.userAvatars.fileObject.objectKey}`
      : null;

    const { userAvatars, role, wallets, ...rest } = user;
    return {
      ...rest,
      role: {
        id: role?.id,
        name: role?.name,
      },
      avatar: avatarUrl,
      wallet: wallets,
    };
  }

  async createUser(createUserDto: CreateUserAdminDto, avatar?: Express.Multer.File) {
    // Check for existing email or username
    const existingUser = await this.db.query.users.findFirst({
      where: or(
        eq(schema.users.email, createUserDto.email),
        eq(schema.users.username, createUserDto.username),
      ),
    });

    if (existingUser) {
      if (existingUser.email === createUserDto.email) {
        throw new ConflictException('Email already in use.');
      }
      throw new ConflictException('Username already taken.');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const [newUser] = await this.db
      .insert(schema.users)
      .values({
        name: createUserDto.name,
        username: createUserDto.username,
        email: createUserDto.email,
        phone: createUserDto.phone,
        birthDate: createUserDto.birthDate,
        password: hashedPassword,
        roleId: createUserDto.roleId,
        isActive: createUserDto.isActive ?? true,
      })
      .returning({ id: schema.users.id }); // Only need ID to fetch full details

    if (!newUser) {
      throw new BadRequestException('Failed to create user.');
    }

    // Avatar upload logic
    if (avatar) {
      const fileName = `avatars/${newUser.id}${avatar.mimetype === 'image/svg+xml' ? '.svg' : '.png'}`;
      await this.storageService.upload(fileName, avatar);
      const [fileObject] = await this.db
        .insert(schema.fileObjects)
        .values({
          bucket: process.env.AWS_BUCKET_NAME!,
          objectKey: fileName,
          mime: avatar.mimetype,
          scope: 'PUBLIC',
          ownerId: newUser.id,
        })
        .returning();
      await this.db.insert(schema.userAvatars).values({
        userId: newUser.id,
        fileObjectId: fileObject.id,
      });
    }

    // You might also want to create a wallet here for the new user
    await this.db.insert(schema.wallets).values({
      userId: newUser.id,
      balance: '0',
      currency: 'USD',
    });

    return this.findUserById(newUser.id); // Return the full user object with relations
  }

  async updateUser(id: string, updateUserAdminDto: UpdateUserAdminDto, avatar?: Express.Multer.File) {
    const existingUser = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    // Check for duplicate email/username if they are being updated to something new
    if (
      updateUserAdminDto.email &&
      updateUserAdminDto.email !== existingUser.email
    ) {
      const emailExists = await this.db.query.users.findFirst({
        where: and(
          eq(schema.users.email, updateUserAdminDto.email),
          eq(schema.users.id, id), // Exclude current user from check
        ),
      });
      if (emailExists) {
        throw new ConflictException('Email already in use.');
      }
    }
    if (
      updateUserAdminDto.username &&
      updateUserAdminDto.username !== existingUser.username
    ) {
      const usernameExists = await this.db.query.users.findFirst({
        where: and(
          eq(schema.users.username, updateUserAdminDto.username),
          eq(schema.users.id, id), // Exclude current user from check
        ),
      });
      if (usernameExists) {
        throw new ConflictException('Username already taken.');
      }
    }

    let hashedPassword = updateUserAdminDto.password;
    if (updateUserAdminDto.password) {
      hashedPassword = await bcrypt.hash(updateUserAdminDto.password, 12);
    }

    const [updatedUser] = await this.db
      .update(schema.users)
      .set({
        ...updateUserAdminDto,
        password: hashedPassword, // Use hashed password if provided
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id });

    if (!updatedUser) {
      throw new BadRequestException('Failed to update user.');
    }

    // Avatar upload logic
    if (avatar) {
      const fileName = `avatars/${updatedUser.id}${avatar.mimetype === 'image/svg+xml' ? '.svg' : '.png'}`;
      await this.storageService.upload(fileName, avatar);
      const [fileObject] = await this.db
        .insert(schema.fileObjects)
        .values({
          bucket: process.env.AWS_BUCKET_NAME!,
          objectKey: fileName,
          mime: avatar.mimetype,
          scope: 'PUBLIC',
          ownerId: updatedUser.id,
        })
        .returning();
      await this.db.insert(schema.userAvatars).values({
        userId: updatedUser.id,
        fileObjectId: fileObject.id,
      });
    }

    return this.findUserById(updatedUser.id);
  }

  async deleteUser(id: string) {
    const [deletedUser] = await this.db
      .delete(schema.users)
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id });

    if (!deletedUser) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    return { message: `User with ID "${id}" deleted successfully.` };
  }
}