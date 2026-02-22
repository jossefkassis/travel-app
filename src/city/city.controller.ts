import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CityService } from './city.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  Permission,
  SetPermissions,
} from '../common/decorators/permissions.decorator';

@Controller('cities')
export class CityController {
  constructor(private readonly cityService: CityService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createCityDto: CreateCityDto) {
    return this.cityService.create(createCityDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityRead)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('countryId') countryId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page && !isNaN(Number(page)) ? parseInt(page, 10) : 1;
    const limitNum = limit && !isNaN(Number(limit)) ? parseInt(limit, 10) : 10;
    return this.cityService.findAll(pageNum, limitNum, orderBy, orderDir, {
      countryId: countryId ? parseInt(countryId) : undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('public/:id')
  findOnePublic(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.findOne(id);
  }
  @Get('public')
  async findAllClient(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page && !isNaN(Number(page)) ? parseInt(page, 10) : 1;
    const limitNum = limit && !isNaN(Number(limit)) ? parseInt(limit, 10) : 10;
    return this.cityService.findAllClient(
      pageNum,
      limitNum,
      orderBy,
      orderDir,
      {
        countryId: countryId ? parseInt(countryId) : undefined,
        search,
      },
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityManage)
  @Get('trashed')
  async findAllTrashed(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'deletedAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page && !isNaN(Number(page)) ? parseInt(page, 10) : 1;
    const limitNum = limit && !isNaN(Number(limit)) ? parseInt(limit, 10) : 10;
    return this.cityService.findAllTrashed(
      pageNum,
      limitNum,
      orderBy,
      orderDir,
      {
        countryId: countryId ? parseInt(countryId) : undefined,
        search,
      },
    );
  }

  @Get('search')
  searchCities(@Query('q') searchTerm: string, @Query('limit') limit?: string) {
    return this.cityService.searchCities(
      searchTerm,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('popular')
  getPopularCities(@Query('limit') limit?: string) {
    return this.cityService.getPopularCities(limit ? parseInt(limit) : 10);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cityService.findBySlug(slug);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityRead)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.findOne(id);
  }

  @Get(':id/with-hotels-attractions')
  async findOneWithHotelsAndAttractions(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.findOneWithHotelsAndAttractions(id);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityRead)
  getCityStats(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.getCityStats(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCityDto: UpdateCityDto,
  ) {
    return this.cityService.update(id, updateCityDto);
  }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard)
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.activate(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard)
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.deactivate(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityManage)
  @Patch(':id/soft-delete')
  async softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.softDelete(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityManage)
  @Patch(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.restore(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.CityManage)
  @Delete(':id/hard-delete')
  async hardDelete(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.hardDelete(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cityService.remove(id);
  }
}
