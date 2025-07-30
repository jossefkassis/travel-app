import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  Permission,
  SetPermissions,
} from 'src/common/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AuthenticatedUser } from 'src/typings/express';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Users')
@ApiBearerAuth() // Indicates that this controller requires a bearer token
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard) // Apply JWT Auth and Permissions Guard globally for the controller
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- Operations for the currently logged-in user ---

  @Get('me')
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully.',
  })
  async getMe(@Request() req: { user: AuthenticatedUser }) {
    return this.usersService.findMe(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current logged-in user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully.',
  })
  @SetPermissions(Permission.ProfileManageOwn) // Users can only manage their own profile
  async updateMe(
    @Request() req: { user: AuthenticatedUser },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateMe(req.user.id, updateUserDto);
  }

  // --- Operations for Admin (managing all users) ---

  @Get()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all users retrieved successfully.',
  })
  @SetPermissions(Permission.UserReadAll) // Requires permission to read all users
  async findAll(@Query() paginationQuery: PaginationQueryDto) {
    return this.usersService.findAllUsers(paginationQuery);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully.' })
  @HttpCode(HttpStatus.CREATED)
  @SetPermissions(Permission.UserManage) // Requires permission to manage users
  @UseInterceptors(FileInterceptor('avatar'))
  async create(
    @Body() createUserAdminDto: CreateUserAdminDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.usersService.createUser(createUserAdminDto, avatar);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully.' })
  @SetPermissions(Permission.UserReadAll) // Requires permission to read all users
  async findOne(@Param('id') id: string) {
    return this.usersService.findUserById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully.' })
  @SetPermissions(Permission.UserManage) // Requires permission to manage users
  @UseInterceptors(FileInterceptor('avatar'))
  async update(
    @Param('id') id: string,
    @Body() updateUserAdminDto: UpdateUserAdminDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.usersService.updateUser(id, updateUserAdminDto, avatar);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully.' })
  @HttpCode(HttpStatus.OK)
  @SetPermissions(Permission.UserManage) // Requires permission to manage users
  async remove(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
