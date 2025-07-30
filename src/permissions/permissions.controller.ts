import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Permission, SetPermissions } from 'src/common/decorators/permissions.decorator';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.PermissionManage)
  @Get()
  async findAll() {
    return this.permissionsService.findAll();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.PermissionManage)
  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.permissionsService.findOne(id);
  }
} 