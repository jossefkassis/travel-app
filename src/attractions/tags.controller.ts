import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AttractionsService } from './attractions.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Controller('tags')
@ApiTags('tags')
export class TagsController {
  constructor(private readonly attractionsService: AttractionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tags' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully.' })
  async findAll() {
    return this.attractionsService.findAllTags();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag by ID' })
  @ApiResponse({ status: 200, description: 'Tag retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  async findOne(@Param('id') id: string) {
    return this.attractionsService.findOneTag(parseInt(id, 10));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created successfully.' })
  async create(@Body() createTagDto: CreateTagDto) {
    return this.attractionsService.createTag(createTagDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag' })
  @ApiResponse({ status: 200, description: 'Tag updated successfully.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  async update(
    @Param('id') id: string,
    @Body() updateTagDto: UpdateTagDto,
  ) {
    return this.attractionsService.updateTag(parseInt(id, 10), updateTagDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiResponse({ status: 200, description: 'Tag deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  async remove(@Param('id') id: string) {
    return this.attractionsService.removeTag(parseInt(id, 10));
  }
} 