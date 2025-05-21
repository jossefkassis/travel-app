import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  constructor(private readonly configServices: ConfigService) {}
  private readonly s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    endpoint: process.env.AWS_ENDPOINT!, // MinIO local endpoint
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
  async delete(objectKey: string, bucketName: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      }),
    );
  }
}
