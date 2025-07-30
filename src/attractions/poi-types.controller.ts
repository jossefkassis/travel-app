import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AttractionsService } from './attractions.service';
import { CreatePoiTypeDto } from './dto/create-poi-type.dto';
import { UpdatePoiTypeDto } from './dto/update-poi-type.dto';

@Controller('poi-types')
@ApiTags('poi-types')
export class PoiTypesController {
  constructor(private readonly attractionsService: AttractionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all POI types' })
  @ApiResponse({ status: 200, description: 'POI types retrieved successfully.' })
  async findAll() {
    return this.attractionsService.findAllPoiTypes();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a POI type by ID' })
  @ApiResponse({ status: 200, description: 'POI type retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'POI type not found.' })
  async findOne(@Param('id') id: string) {
    return this.attractionsService.findOnePoiType(parseInt(id, 10));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new POI type' })
  @ApiResponse({ status: 201, description: 'POI type created successfully.' })
  async create(@Body() createPoiTypeDto: CreatePoiTypeDto) {
    return this.attractionsService.createPoiType(createPoiTypeDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a POI type' })
  @ApiResponse({ status: 200, description: 'POI type updated successfully.' })
  @ApiResponse({ status: 404, description: 'POI type not found.' })
  async update(
    @Param('id') id: string,
    @Body() updatePoiTypeDto: UpdatePoiTypeDto,
  ) {
    return this.attractionsService.updatePoiType(parseInt(id, 10), updatePoiTypeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a POI type' })
  @ApiResponse({ status: 200, description: 'POI type deleted successfully.' })
  @ApiResponse({ status: 404, description: 'POI type not found.' })
  async remove(@Param('id') id: string) {
    return this.attractionsService.removePoiType(parseInt(id, 10));
  }
} 