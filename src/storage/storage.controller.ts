import {
  BadRequestException,
  Controller,
  FileTypeValidator,
  Get,
  ParseFilePipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Param,
  Delete,
  ParseIntPipe,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageServise: StorageService) {}

  @Get('media/:folder/:key')
  async streamWithRange(
    @Param('folder') folder: string,
    @Param('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const range = req.headers.range as string;

    // delegate to your service so you keep controller thin
    const { Body, ContentType, ContentLength } =
      await this.storageServise.getObjectStream(`${folder}/${key}`, range);

    if (!Body) {
      throw new NotFoundException('Image not found');
    }

    res.status(200).set({
        'Content-Type': ContentType!,
        'Content-Length': ContentLength?.toString() ?? undefined,
        'Accept-Ranges': 'bytes',
      });

    (Body as NodeJS.ReadableStream).pipe(res as any);
  }
  
  @UseGuards(JwtAuthGuard)
  @Post('admin/upload-public')
  @UseInterceptors(FilesInterceptor('images'))
  async uploadFiles(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [new FileTypeValidator({ fileType: 'image' })],
      }),
    )
    files: Array<Express.Multer.File>,
  ) {
    console.log("reseved",files)
    return await this.storageServise.publicUpload(files);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/files/public')
  async getPublicFiles(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    // Validate query parameters
    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException(
        'Invalid page number. Page must be a positive integer.',
      );
    }
    if (isNaN(limitNum) || limitNum < 1) {
      throw new BadRequestException(
        'Invalid limit number. Limit must be a positive integer.',
      );
    }
    // Optional: Add a max limit to prevent excessively large requests
    if (limitNum > 100) {
      throw new BadRequestException('Limit cannot exceed 100 items per page.');
    }

    // Call the service method to get paginated public files
    return await this.storageServise.getAllPublicFilesPaginated(
      pageNum,
      limitNum,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('admin/file/:id')
  async deleteFile(@Param('id', ParseIntPipe) id: number) {
    return this.storageServise.deleteFileObject(id);
  }
}
