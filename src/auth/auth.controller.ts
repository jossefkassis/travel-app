/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Get,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from '../common/guards/local-auth.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { FileInterceptor } from '@nestjs/platform-express';
// import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
  @Post('admin-login')
  @UseGuards(LocalAuthGuard)
  async adminLogin(@Body() loginDto: LoginDto) {
    return this.authService.adminLogin(loginDto);
  }

  @Post('register')
  @UseInterceptors(FileInterceptor('avatar'))
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body()
    registerDto: {
      name: string;
      email: string;
      username: string;
      password: string;
    },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100000 }), // 1MB
          new FileTypeValidator({
            fileType: /image\/(png|jpeg|jpg|webp|svg\+xml)/,
          }),
        ],

        fileIsRequired: false,
      }),
    )
    avatar?: Express.Multer.File,
  ) {
    return await this.authService.register(registerDto, avatar);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: any) {
    console.log('here');
    if (!user?.jti) {
      throw new BadRequestException('Invalid token: missing jti');
    }

    await this.authService.logout(user.jti);
    return { message: 'Logged out successfully' };
  }
  @Post('logout-others')
  @UseGuards(JwtAuthGuard)
  async logoutOthers(@CurrentUser() user: any) {
    if (!user?.jti || !user?.sub) {
      throw new BadRequestException('Invalid token: missing jti');
    }

    await this.authService.logoutOthesr(user.jti, user.sub);
    return { message: 'Logged out from other sessions successfully' };
  }
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: any) {
    await this.authService.logoutAll(user?.sub);
    return { message: 'Logged out from all sessions successfully' };
  }

  @Get('google')
  // @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  async googleAuth() {
    // This route will redirect to Google OAuth
  }

  @Get('google/callback')
  // @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const loginUser = await this.authService.login(user);

    // Redirect with tokens or set cookies
    res.redirect(
      `/auth/success?access_token=${loginUser.tokens.accessToken}&refresh_token=${loginUser.tokens.refreshToken}`,
    );
  }

  @Get('facebook')
  // @ApiOperation({ summary: 'Initiate Facebook OAuth flow' })
  async facebookAuth() {
    // This route will redirect to Facebook OAuth
  }

  @Get('facebook/callback')
  // @ApiOperation({ summary: 'Facebook OAuth callback' })
  async facebookAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const loginUser = await this.authService.login(user);

    // Redirect with tokens or set cookies
    res.redirect(
      `/auth/success?access_token=${loginUser.tokens.accessToken}&refresh_token=${loginUser.tokens.refreshToken}`,
    );
  }

  @Post('refresh')
  // @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }
}
