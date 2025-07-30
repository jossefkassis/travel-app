import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, NotFoundException, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { Permission, SetPermissions } from 'src/common/decorators/permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}
  
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.RoleManage)
  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.RoleManage)
  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.rolesService.findOne(id);
  }
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.RoleManage)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.RoleManage)
  @Patch(':id')
  async update(@Param('id') id: number, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.rolesService.remove(id);
  }
} 