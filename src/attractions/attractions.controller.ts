import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AttractionsService } from './attractions.service';
import { CreateAttractionDto } from './dto/create-attraction.dto';
import { UpdateAttractionDto } from './dto/update-attraction.dto';

@ApiTags('attractions')
@Controller('attractions')
export class AttractionsController {
  constructor(private readonly attractionsService: AttractionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all attractions with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of attractions retrieved successfully.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'orderBy', required: false, enum: ['createdAt', 'name', 'price'], description: 'Order by field' })
  @ApiQuery({ name: 'orderDir', required: false, enum: ['asc', 'desc'], description: 'Order direction' })
  @ApiQuery({ name: 'cityId', required: false, type: Number, description: 'Filter by city ID' })
  @ApiQuery({ name: 'poiTypeId', required: false, type: Number, description: 'Filter by POI type ID' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in name and description' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'minPrice', required: false, type: Number, description: 'Minimum price filter' })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number, description: 'Maximum price filter' })
  @ApiQuery({ name: 'tagIds', required: false, type: String, description: 'Comma-separated tag IDs to filter by' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'name' | 'price',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('cityId') cityId?: string,
    @Query('poiTypeId') poiTypeId?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('tagIds') tagIds?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const orderDirValue = orderDir || 'desc';
    const orderByValue = orderBy || 'createdAt';
    const cityIdNum = cityId ? parseInt(cityId, 10) : undefined;
    const poiTypeIdNum = poiTypeId ? parseInt(poiTypeId, 10) : undefined;
    const isActiveBool = isActive !== undefined ? isActive === 'true' : undefined;
    const minPriceNum = minPrice ? parseFloat(minPrice) : undefined;
    const maxPriceNum = maxPrice ? parseFloat(maxPrice) : undefined;
    const tagIdsArray = tagIds ? tagIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) : undefined;

    return this.attractionsService.findAll(
      pageNum,
      limitNum,
      orderByValue,
      orderDirValue,
      {
        cityId: cityIdNum,
        poiTypeId: poiTypeIdNum,
        search,
        isActive: isActiveBool,
        minPrice: minPriceNum,
        maxPrice: maxPriceNum,
        tagIds: tagIdsArray,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attraction by ID' })
  @ApiResponse({ status: 200, description: 'Attraction retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Attraction not found.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attractionsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new attraction' })
  @ApiResponse({ status: 201, description: 'Attraction created successfully.' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createAttractionDto: CreateAttractionDto) {
    console.log('Controller received createAttractionDto:', createAttractionDto);
    return this.attractionsService.create(createAttractionDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an attraction' })
  @ApiResponse({ status: 200, description: 'Attraction updated successfully.' })
  @ApiResponse({ status: 404, description: 'Attraction not found.' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAttractionDto: UpdateAttractionDto,
  ) {
    return this.attractionsService.update(id, updateAttractionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attraction' })
  @ApiResponse({ status: 200, description: 'Attraction deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Attraction not found.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.attractionsService.remove(id);
  }
} 