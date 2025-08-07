// src/utils/s3.ts
import { S3Client, PutObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3';
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function uploadToS3(file: Express.Multer.File): Promise<string> {
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}_${Math.round(Math.random() * 1e6)}.${fileExt}`;
  const bucket = process.env.AWS_S3_BUCKET!;

  const params = {
    Bucket: bucket,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3.send(new PutObjectCommand(params));
  // Верни url вида https://BUCKET.s3.REGION.amazonaws.com/fileName
  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
}
