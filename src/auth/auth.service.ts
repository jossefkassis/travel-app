/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { DRIZLE } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { and, eq, ne } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Validates user credentials
   * @param emailOrUsername - User's email or username
   * @param password - User's password
   * @returns User object if valid, throws UnauthorizedException otherwise
   */
  async validateUser(emailOrUsername: string, password: string) {
    const user = await this.db.query.users.findFirst({
      where: (users, { or, eq }) =>
        or(
          eq(users.email, emailOrUsername),
          eq(users.username, emailOrUsername),
        ),
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid not found credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials unauth');
    }

    return user;
  }

  /**
   * Generates access and refresh tokens for a user
   * @param user - User object
   * @returns Object containing accessToken and refreshToken
   */
  private async generateTokens(user: typeof schema.users.$inferSelect) {
    const jti = uuidv4();
    const refreshToken = uuidv4();

    const payload = {
      sub: user.id,
      jti, // Unique session ID
    };

    const accessToken = this.jwtService.sign(payload);

    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() +
        this.configService.getOrThrow<number>('REFRESH_TOKEN_EXPIRES_IN'),
    );

    await this.db.insert(schema.sessions).values({
      userId: user.id,
      jti,
      refreshToken,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Handles user login
   * @param loginDto - Login credentials
   * @returns Authentication tokens
   */
  async login(loginDto: LoginDto) {
    const user = await this.validateUser(
      loginDto.emailOrUsername,
      loginDto.password,
    );

    // Get user with relations (wallet, avatar, and role name)
    const userWithRelations = await this.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, user.id),

      // ⬇️ Only the columns you really need
      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true, // Use phone_number as per schema
        isActive: true,
        createdAt: true,
        roleId: true, // Select roleId from users table
      },

      with: {
        wallets: {
          columns: { balance: true, currency: true },
        },
        userAvatars: {
          with: { fileObject: true },
        },
        role: {
          // Fetch the related role to get its name
          columns: { name: true },
        },
      },
    });

    if (!userWithRelations) {
      throw new NotFoundException('User not found');
    }

    // Construct avatar URL if exists
    let avatarUrl: string | null = null;
    if (userWithRelations.userAvatars?.fileObject) {
      const fileObject = userWithRelations.userAvatars.fileObject;
      avatarUrl = `/${fileObject.bucket}/${fileObject.objectKey}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userAvatars, role, ...userWithoutAvatar } = userWithRelations; // Destructure role for separate use
    return {
      user: {
        ...userWithoutAvatar,
        avatar: avatarUrl,
        role: role?.name, // Return the role name
      },
      tokens: await this.generateTokens(user),
    };
  }

  async adminLogin(loginDto: LoginDto) {
    const user = await this.validateUser(
      loginDto.emailOrUsername,
      loginDto.password,
    );

    // Get user with relations (wallet, avatar, and role name)
    const userWithRelations = await this.db.query.users.findFirst({
      where: eq(schema.users.id, user.id),

      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true, // Assuming your schema column is named 'phone' or 'phone_number'
        isActive: true,
        createdAt: true,
        roleId: true,
        // Don't select password here for security
      },

      with: {
        wallets: {
          columns: { balance: true, currency: true },
        },
        userAvatars: {
          with: { fileObject: true },
        },
        role: {
          columns: { id: true, name: true }, // Select role name
          with: {
            rolePermissions: {
              columns: { permissionId: false, roleId: false }, // Don't need these join IDs
              with: {
                permission: {
                  columns: { name: true, description: true }, // Select permission name and description
                },
              },
            },
          },
        },
      },
    });

    if (!userWithRelations) {
      throw new NotFoundException('User not found');
    }

    // Check if the user's role is 'Super Admin'
    if (userWithRelations.role?.name === 'Customer') {
      // Compare against the role name
      throw new ForbiddenException('User is not authorized as an admin');
    }

    let avatarUrl: string | null = null;
    if (userWithRelations.userAvatars?.fileObject) {
      const fileObject = userWithRelations.userAvatars.fileObject;
      avatarUrl = `/${fileObject.bucket}/${fileObject.objectKey}`;
    }

    // Flatten permissions into a simple array of permission names
    const permissions =
      userWithRelations.role?.rolePermissions.map((rp) => rp.permission.name) ||
      [];

    const { userAvatars, role, ...userWithoutRelations } = userWithRelations;

    return {
      user: {
        ...userWithoutRelations,
        avatar: avatarUrl,
        role: role?.name, // Return the role name
        permissions: permissions, // Return the array of permission names
      },
      tokens: await this.generateTokens(user), // Use the original 'user' object for token generation
    };
  }

  /**
   * Handles user registration
   * @param createUserDto - User registration data
   * @returns Authentication tokens
   */
  async register(createUserDto: RegisterDto, avatar?: Express.Multer.File) {
    // Check if email or username already exists
    const existingUser = await this.db.query.users.findFirst({
      where: (users, { or, eq }) =>
        or(
          eq(users.email, createUserDto.email),
          eq(users.username, createUserDto.username),
        ),
    });

    if (existingUser) {
      if (existingUser.email === createUserDto.email) {
        throw new ConflictException('Email already in use');
      }
      throw new ConflictException('Username already taken');
    }

    // Fetch the Customer role ID
    const customerRole = await this.db.query.roles.findFirst({
      where: (roles, { eq }) => eq(roles.name, 'Customer'),
    });

    if (!customerRole) {
      throw new NotFoundException(
        'Customer role not found. Please ensure roles are seeded.',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    // Create user
    const [user] = await this.db
      .insert(schema.users)
      .values({
        name: createUserDto.name,
        username: createUserDto.username,
        email: createUserDto.email,
        password: hashedPassword,
        isActive: true,
        roleId: customerRole.id, // Assign Customer role on signup
      })
      .returning();

    let avatarUrl: string | null = null;
    if (avatar) {
      const fileName = `avatars/${user.id}${avatar.mimetype === 'image/svg+xml' ? '.svg' : '.png'}`;

      await this.storageService.upload(fileName, avatar);

      // First create the file object
      const [fileObject] = await this.db
        .insert(schema.fileObjects)
        .values({
          bucket: process.env.AWS_BUCKET_NAME!,
          objectKey: fileName,
          mime: avatar.mimetype,
          scope: 'PUBLIC', // Avatars are typically public
          ownerId: user.id,
        })
        .returning();

      // Then create the avatar record
      await this.db.insert(schema.userAvatars).values({
        userId: user.id,
        fileObjectId: fileObject.id,
      });

      avatarUrl = `/${fileObject.bucket}/${fileName}`;
    }

    // Create wallet for the user
    const [wallet] = await this.db
      .insert(schema.wallets)
      .values({
        userId: user.id,
        balance: '0',
        currency: 'USD',
      })
      .returning();

    // Re-fetch user with role relation to include the role name in the response
    const userWithRole = await this.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, user.id),
      columns: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        roleId: true,
      },
      with: {
        role: {
          columns: { name: true },
        },
      },
    });

    return {
      user: {
        id: userWithRole?.id,
        name: userWithRole?.name,
        username: userWithRole?.username,
        email: userWithRole?.email,
        phone: userWithRole?.phone,
        isActive: userWithRole?.isActive,
        role: userWithRole?.role?.name, // Use the role name
        createdAt: userWithRole?.createdAt,
        avatar: avatarUrl,
        wallet: {
          balance: wallet.balance,
          cuurency: wallet.currency,
        },
      },
      tokens: await this.generateTokens(user),
    };
  }

  /**
   * Logs user out of current session
   * @param jti - JWT ID from token
   */
  // src/auth/auth.service.ts
  async logout(jti: string) {
    try {
      // First verify the session exists
      const session = await this.db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.jti, jti),
      });

      if (!session) {
        console.warn(`Session with jti ${jti} not found`);
        return; // Or throw an error if you prefer
      }

      // Delete the session
      const result = await this.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.jti, jti))
        .returning();

      if (result.length === 0) {
        console.error('Failed to delete session - no rows affected');
      }
    } catch (error) {
      console.error('Error during logout:', error);
      throw new Error('Failed to logout');
    }
  }

  async logoutOthesr(jti: string, userId: string) {
    try {
      // First verify the session exists
      const session = await this.db.query.sessions.findFirst({
        where: (sessions, { eq }) => eq(sessions.jti, jti),
      });

      if (!session) {
        console.warn(`Session with jti ${jti} not found`);
        return; // Or throw an error if you prefer
      }

      await this.db
        .delete(schema.sessions)
        .where(
          and(eq(schema.sessions.userId, userId), ne(schema.sessions.jti, jti)),
        );
    } catch (error) {
      console.error('Error during logout:', error);
      throw new Error('Failed to logout');
    }
  }

  async logoutAll(userId: string) {
    try {
      await this.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, userId));
    } catch (error) {
      console.error('Error during logoutAll:', error);
      throw new Error('Failed to logout from all sessions');
    }
  }

  /**
   * Refreshes access token
   * @param refreshToken - Valid refresh token
   * @returns New access token
   */
  async refreshToken(refreshToken: string) {
    // Find the active session with the provided refresh token
    const session = await this.db.query.sessions.findFirst({
      where: (sessions, { and, eq, gt }) =>
        and(
          eq(sessions.refreshToken, refreshToken),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, new Date()),
        ),
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Get the user associated with the session
    const user = await this.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, session.userId),
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Invalidate the old session
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.jti, session.jti));

    // Generate new tokens (this will create a new session)
    return { tokens: await this.generateTokens(user) };
  }
}
