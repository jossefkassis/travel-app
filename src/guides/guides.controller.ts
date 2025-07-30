import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { GuidesService } from './guides.service';
import { CreateGuideDto } from './dto/create-guide.dto';
import { UpdateGuideDto } from './dto/update-guide.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('guides')
export class GuidesController {
  constructor(private readonly guidesService: GuidesService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'name',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('cityId') cityId?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const orderDirValue = orderDir || 'desc';
    const orderByValue = orderBy || 'createdAt';
    const cityIdNum = cityId ? parseInt(cityId, 10) : undefined;

    return this.guidesService.findAll(
      pageNum,
      limitNum,
      orderByValue,
      orderDirValue,
      { cityId: cityIdNum },
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.guidesService.findOne(id);
  }


  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('avatar'))
  async create(
    @Body() CreateGuideDto: CreateGuideDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.guidesService.create(CreateGuideDto, avatar);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('avatar'))
  async update(
    @Param('id') id: string, 
    @Body() updateGuideDto: UpdateGuideDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.guidesService.update(id, updateGuideDto, avatar);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.guidesService.remove(id);
  }
} 