import express, { Request, Response, NextFunction } from 'express';
import AWS from 'aws-sdk';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// --- Тип расширенного запроса ---
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Загрузка сервис-фото (на S3)
const uploadServicePhotoHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const multerReq = req as MulterRequest;
  try {
    if (!multerReq.file) {
      return res.status(400).json({ error: 'Фото не прикреплено' });
    }

    const fileName = `service-${Date.now()}-${multerReq.file.originalname}`;
    const params = {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: `services/${fileName}`,
      Body: multerReq.file.buffer,
      ContentType: multerReq.file.mimetype,
      ACL: 'public-read',
    };

    const uploadResult = await s3.upload(params).promise();
    return res.json({ photoUrl: uploadResult.Location });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Ошибка загрузки фото услуги' });
  }
};

// Загрузка фото услуги — S3
router.post(
  '/service-photo',
  upload.single('photo'),
  uploadServicePhotoHandler
);

export default router;
