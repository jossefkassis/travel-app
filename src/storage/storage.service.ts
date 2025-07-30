import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql, desc } from 'drizzle-orm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

@Injectable()
export class StorageService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly configServices: ConfigService,
  ) {}
  private readonly s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.AWS_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true, // important for MinIO
  });

  async upload(fileName: string, file: Express.Multer.File) {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: 'inline',
      }),
    );
  }
  async publicUpload(files: Array<Express.Multer.File>) {
    return this.db.transaction(async (tx) => {
      const uploadPromises = files.map(async (file) => {
        const objectKey = `uploads/${Date.now()}-${file.originalname}`;
        const bucket = process.env.AWS_BUCKET_NAME!;

        await this.upload(objectKey, file);

        const inserted = await tx
          .insert(schema.fileObjects)
          .values({
            bucket,
            objectKey,
            mime: file.mimetype,
            size: file.size,
            scope: 'PUBLIC',
            uploadedAt: new Date(),
          })
          .returning();

        return inserted[0];
      });

      return Promise.all(uploadPromises);
    });
  }

  async delete(objectKey: string, bucketName: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      }),
    );
  }

  async deleteFileObject(fileObjectId: number): Promise<{ message: string }> {
    // 1. Check if file exists
    const file = await this.db.query.fileObjects.findFirst({
      where: (fo, { eq }) => eq(fo.id, fileObjectId),
    });
    if (!file) throw new NotFoundException('File not found');

    // 2. Check for attachments
    const attachment = await this.db.query.attachments.findFirst({
      where: (att, { eq }) => eq(att.objectId, fileObjectId),
    });
    if (attachment) {
      throw new BadRequestException('File is attached and cannot be deleted');
    }

    // 3. Delete from S3
    await this.delete(file.objectKey, file.bucket);

    // 4. Delete from DB
    await this.db.delete(schema.fileObjects).where(eq(schema.fileObjects.id, fileObjectId));

    return { message: 'File deleted from DB and S3' };
  }

  /**
   * Retrieves paginated list of all public file objects.
   * This is for files not tied to a specific owner, or if ownerId is nullable in schema.
   * @param page The current page number (1-indexed).
   * @param limit The number of items per page.
   * @returns An object containing the paginated file objects and total count.
   */
  async getAllPublicFilesPaginated(page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;

    // Fetch total count for pagination metadata
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.fileObjects)
      .where(eq(schema.fileObjects.scope, 'PUBLIC')); // Filter by public scope

    const totalCount = totalCountResult[0].count;

    // Fetch paginated files
    // Fetch files and for each, check if it has attachments
    const filesRaw = await this.db
      .select()
      .from(schema.fileObjects)
      .where(eq(schema.fileObjects.scope, 'PUBLIC'))
      .orderBy(desc(schema.fileObjects.uploadedAt))
      .limit(limit)
      .offset(offset);

    // For each file, check if it has attachments
    const files = await Promise.all(
      filesRaw.map(async (file) => {
        const attachment = await this.db.query.attachments.findFirst({
          where: (att, { eq }) => eq(att.objectId, file.id),
        });
        return {
          ...file,
          hasAttachment: !!attachment,
        };
      }),
    );

    return {
      files,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}
