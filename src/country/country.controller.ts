import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
  ParseIntPipe, // For validating and transforming ID params to numbers
  NotFoundException,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { CountryService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CountryWithImages, CountryWithCities } from './country.service'; // Assuming you export this type from service
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import {
  Permission,
  SetPermissions,
} from 'src/common/decorators/permissions.decorator';

@Controller('countries')
@UseInterceptors(ClassSerializerInterceptor) // Automatically applies serialization rules from class-transformer
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED) // Explicitly set 201 Created for POST success
  async create(
    @Body() createCountryDto: CreateCountryDto,
  ): Promise<CountryWithImages> {
    return this.countryService.create(createCountryDto);
  }
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryRead)
  @Get()
  // No HttpCode needed, 200 OK is default for GET
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('orderBy') orderBy?: 'createdAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
  ) {
    // The service returns the paginated object directly
    return this.countryService.findAll(page, limit, orderBy, orderDir);
  }

  @Get('public')
  async findAllClient(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
  ) {
    console.log('Controller received :');
    const pageNum = page && !isNaN(Number(page)) ? parseInt(page, 10) : 1;
    const limitNum = limit && !isNaN(Number(limit)) ? parseInt(limit, 10) : 20;
    return this.countryService.findAllClient(
      pageNum,
      limitNum,
      orderBy,
      orderDir,
    );
  }

  @Get('public/:id')
  async findOneClient(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CountryWithCities> {
    console.log('Controller received id:', id);
    const country = await this.countryService.findOneClient(id);
    if (!country) {
      throw new NotFoundException(
        `Country with ID ${id} not found or is not active.`,
      );
    }
    return country;
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryManage)
  @Get('trashed')
  async findAllTrashed(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'deletedAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
  ) {
    const pageNum = page && !isNaN(Number(page)) ? parseInt(page, 10) : 1;
    const limitNum = limit && !isNaN(Number(limit)) ? parseInt(limit, 10) : 10;
    return this.countryService.findAllTrashed(
      pageNum,
      limitNum,
      orderBy,
      orderDir,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryRead)
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CountryWithImages> {
    const country = await this.countryService.findOne(id);
    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found.`);
    }
    return country;
  }
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryManage)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCountryDto: UpdateCountryDto,
  ): Promise<CountryWithImages> {
    console.log('Controller received updateCountryDto:', updateCountryDto);
    console.log('Type of is_active:', typeof updateCountryDto.is_active);
    console.log('Value of is_active:', updateCountryDto.is_active);
    // The service's update method already handles NotFoundException,
    // so we can directly return its result.
    return this.countryService.update(id, updateCountryDto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryManage)
  @Patch(':id/soft-delete')
  async softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.countryService.softDelete(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryManage)
  @Patch(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number) {
    return this.countryService.restore(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CountryManage)
  @Delete(':id/hard-delete')
  async hardDelete(@Param('id', ParseIntPipe) id: number) {
    return this.countryService.hardDelete(id);
  }

  // --- Client-facing (Public) Endpoints ---
  // These usually don't require authentication and might return less sensitive data.
  // We'll put them under a '/public' path for clarity.
}
