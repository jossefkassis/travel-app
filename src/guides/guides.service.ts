import { Injectable, NotFoundException, BadRequestException, Inject, ConflictException, forwardRef } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import { CreateGuideDto } from './dto/create-guide.dto';
import { UpdateGuideDto } from './dto/update-guide.dto';
import { UsersService } from '../users/users.service';
import { CityService } from '../city/city.service';
import { eq, and, sql, asc, desc } from 'drizzle-orm';

@Injectable()
export class GuidesService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    @Inject(forwardRef(() => CityService)) private readonly cityService: CityService,
  ) {}

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: { cityId?: number } = {},
  ) {
    const offset = (page - 1) * limit;
    const conditions: any[] = [];
    
    if (filters.cityId) {
      conditions.push(eq(schema.guides.cityId, filters.cityId));
    }

    // Get total count
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.guides)
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;

    // Determine order column
    let orderColumn: any = schema.guides.createdAt;
    if (orderBy === 'name') {
      // We'll need to join with users to order by name
      orderColumn = schema.users.name;
    }
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // Fetch guides with pagination and ordering
    let guides;
    if (orderBy === 'name') {
      // Join with users to order by name
      guides = await this.db
        .select()
        .from(schema.guides)
        .leftJoin(schema.users, eq(schema.guides.userId, schema.users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .limit(limit)
        .offset(offset)
        .orderBy(orderExpr);
      
      // Extract guide data from join result
      guides = guides.map(result => result.guides);
    } else {
      // Simple query for other order columns
      guides = await this.db.query.guides.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        with: { user: true },
        limit,
        offset,
        orderBy: [orderExpr],
      });
    }

    // Enrich with user and city data using existing services
    const enrichedGuides = await Promise.all(
      guides.map(async (guide) => {
        const user = await this.usersService.findMe(guide.userId);
        const city = await this.cityService.findOne(guide.cityId);
        return {
          ...guide,
          user,
          city,
        };
      })
    );

    return {
      data: enrichedGuides,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
      filters,
    };
  }

  async findOne(id: string) {
    const guide = await this.db.query.guides.findFirst({
      where: (guides, { eq }) => eq(guides.id, id),
      with: { user: true },
    });
    
    if (!guide) throw new NotFoundException('Guide not found');
    
    // Enrich with user and city data using existing services
    const user = await this.usersService.findMe(guide.userId);
    const city = await this.cityService.findOne(guide.cityId);
    
    return {
      ...guide,
      user,
      city,
    };
  }


  async create(dto: CreateGuideDto, avatar?: Express.Multer.File) {
    // Create user data from flat DTO
    const userData = {
      name: dto.name,
      username: dto.username,
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
      roleId: 3,
    };
    
    // Create user with guide role and avatar
    const user = await this.usersService.createUser(userData, avatar);
    
    // Create guide data
    const [guide] = await this.db.insert(schema.guides).values({
      userId: user.id,
      pricePerDay: dto.pricePerDay.toString(),
      description: dto.description,
      cityId: dto.cityId,
    }).returning();
    
    return this.findOne(guide.id);
  }

  async update(id: string, dto: UpdateGuideDto, avatar?: Express.Multer.File) {
    // First, get the guide to find the associated user ID
    const guide = await this.db.query.guides.findFirst({
      where: (guides, { eq }) => eq(guides.id, id),
    });
    
    if (!guide) throw new NotFoundException('Guide not found');

    // Update user data if provided
    const userUpdateData: any = {};
    if (dto.name !== undefined) userUpdateData.name = dto.name;
    if (dto.phone !== undefined) userUpdateData.phone = dto.phone;
    if (dto.birthDate !== undefined) userUpdateData.birthDate = dto.birthDate;

    if (Object.keys(userUpdateData).length > 0 || avatar) {
      await this.usersService.updateUser(guide.userId, userUpdateData, avatar);
    }

    // Update guide data if provided
    const guideUpdateData: any = {};
    if (dto.pricePerDay !== undefined) guideUpdateData.pricePerDay = dto.pricePerDay.toString();
    if (dto.description !== undefined) guideUpdateData.description = dto.description;
    if (dto.cityId !== undefined) guideUpdateData.cityId = dto.cityId;
    guideUpdateData.updatedAt = new Date();

    if (Object.keys(guideUpdateData).length > 0) {
      await this.db.update(schema.guides).set(guideUpdateData).where(eq(schema.guides.id, id));
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    // First, get the guide to find the associated user ID
    const guide = await this.db.query.guides.findFirst({
      where: (guides, { eq }) => eq(guides.id, id),
    });
    
    if (!guide) throw new NotFoundException('Guide not found');
    
    // Delete the guide record
    await this.db.delete(schema.guides).where(eq(schema.guides.id, id));
    
    // Delete the associated user
    await this.usersService.deleteUser(guide.userId);
    
    return { 
      message: `Guide with ID ${id} and associated user have been deleted successfully.`,
      deletedGuideId: id,
      deletedUserId: guide.userId 
    };
  }
} 