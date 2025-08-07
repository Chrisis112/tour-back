import express, { Request, Response } from 'express';
import AWS from 'aws-sdk';
import multer from 'multer';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const upload = multer({ dest: 'uploads/certificates/' });

function getS3KeyFromUrl(url: string): string | null {
  try {
    // формат S3-ссылки: https://bucket.s3.region.amazonaws.com/certificates/xyz.jpg
    const u = new URL(url);
    // pathname всегда начинается со слеша (/certificates/...)
    return u.pathname.replace(/^\/+/, ''); // убираем ведущий слеш
  } catch {
    return null;
  }
}

async function uploadFileToS3(localFilePath: string, filename: string, mimetype: string) {
  const fileContent = fs.readFileSync(localFilePath);
  const key = `certificates/${Date.now()}-${filename.replace(/\s+/g, '_')}`;
  const params = {
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: fileContent,
    ContentType: mimetype,
    ACL: 'public-read',
  };
  await s3.putObject(params).promise();
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

// --- 1. Загрузка сертификата ---
router.post(
  '/',
  authenticateToken,
  upload.single('certificate'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не прикреплён' });
    if (!req.file.mimetype.startsWith('image/')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Только изображения!' });
    }
    try {
      const fileUrl = await uploadFileToS3(req.file.path, req.file.originalname, req.file.mimetype);
      fs.unlinkSync(req.file.path);
      const { title } = req.body;
      const userId = (req as any).user.id;
      await User.findByIdAndUpdate(userId, {
        $push: { certificates: { fileUrl, title } }
      });
      res.json({ success: true });
    } catch (e) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'Ошибка загрузки на S3' });
    }
  }
);

// --- 2. Удаление сертификата ---
router.delete(
  '/:id',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id } = req.params;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'Not found' });

      // Универсальный поиск сертификата по _id
      const cert =
        typeof user.certificates.id === 'function'
          ? user.certificates.id(id)
          : (user.certificates || []).find(
              (c: any) =>
                (c._id?.toString?.() || c._id) === id ||
                (typeof c._id === 'string' && c._id === id)
            );

      if (!cert) return res.status(404).json({ error: 'Certificate not found' });

      // Удаляем файл с S3, если fileUrl корректный
      if (cert.fileUrl && cert.fileUrl.includes('amazonaws.com/')) {
        const key = getS3KeyFromUrl(cert.fileUrl);
        if (key) {
          try {
            await s3.deleteObject({
              Bucket: process.env.AWS_S3_BUCKET!,
              Key: key,
            }).promise();
          } catch (err: any) {
            // Не прерываем удаление в базе, если S3-ошибка — это нормально, логируем в консоль
            console.error('Ошибка удаления с S3:', err.message || err);
          }
        }
      }

      // Удаляем сертификат из массива пользователя
      if (typeof user.certificates.id === 'function' && cert.remove) {
        cert.remove();
      } else {
        user.certificates = (user.certificates || []).filter(
          (c: any) => (c._id?.toString?.() || c._id) !== id
        );
      }
      await user.save();
      res.json({ success: true });
    } catch (err: any) {
      console.error('Ошибка в DELETE /certificates/:id', err);
      res.status(500).json({ error: err?.message || 'Server error' });
    }
  }
);

// --- 3. Редактирование сертификата ---
router.put(
  '/:id',
  authenticateToken,
  upload.single('certificate'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { id } = req.params;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'Not found' });

      // Универсальный поиск сертификата
      const cert =
        typeof user.certificates.id === 'function'
          ? user.certificates.id(id)
          : (user.certificates || []).find(
              (c: any) =>
                (c._id?.toString?.() || c._id) === id ||
                (typeof c._id === 'string' && c._id === id)
            );

      if (!cert) return res.status(404).json({ error: 'Certificate not found' });

      if (req.file) {
        if (!req.file.mimetype.startsWith('image/')) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Только изображения!' });
        }
        // Удалить старый файл (если есть)
        if (cert.fileUrl && cert.fileUrl.includes('amazonaws.com/')) {
          const key = getS3KeyFromUrl(cert.fileUrl);
          if (key) {
            try {
              await s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }).promise();
            } catch (e) {}
          }
        }
        // Загрузить новый
        const fileUrl = await uploadFileToS3(req.file.path, req.file.originalname, req.file.mimetype);
        fs.unlinkSync(req.file.path);
        cert.fileUrl = fileUrl;
      }
      if (req.body.title) cert.title = req.body.title;
      await user.save();
      res.json({ success: true });
    } catch (err: any) {
      console.error('Ошибка в PUT /certificates/:id', err);
      res.status(500).json({ error: err?.message || 'Ошибка редактирования' });
    }
  }
);

export default router;
