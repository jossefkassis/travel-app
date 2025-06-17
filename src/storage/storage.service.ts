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
    const files = await this.db
      .select()
      .from(schema.fileObjects)
      .where(eq(schema.fileObjects.scope, 'PUBLIC')) // Filter by public scope
      .orderBy(desc(schema.fileObjects.uploadedAt)) // Order by upload date
      .limit(limit)
      .offset(offset);

    return {
      files,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}
