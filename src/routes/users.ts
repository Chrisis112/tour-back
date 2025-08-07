import express, { Request, Response, NextFunction } from 'express';
import AWS from 'aws-sdk';
import multer from 'multer';

import User from '../models/User';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.put('/:id/about', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userIdParam = req.params.id;

    // Проверка прав: пользователь может менять только свой профиль
    if (!authReq.user || authReq.user.id !== userIdParam) {
      return res.status(403).json({ error: 'Нет прав для изменения данных' });
    }

    const about = req.body.about;
    if (!about || typeof about !== 'object') {
      return res.status(400).json({ error: 'Некорректное поле about' });
    }

    // Обновление поля about в базе
    const updatedUser = await User.findByIdAndUpdate(
      userIdParam,
      { about: about },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    return res.json({ message: 'Информация обновлена', about: updatedUser.about });
  } catch (err) {
    console.error('Ошибка обновления about:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить текущего пользователя — строго ДО /:id!
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = authReq.user.id;
    const user = await User.findById(userId).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/users?userType=THERAPIST - поиск по роли с учетом массива userType
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userType = req.query.userType;

    if (!userType) {
      return res.status(400).json({ error: 'Параметр userType обязателен' });
    }

    // Используем $in, так как userType теперь массив
    const users = await User.find({
      userType: { $in: [userType.toString().toUpperCase()] }
    })
      .select('firstName lastName photo rating skills bio certificates services') // выберите нужные поля
      .lean();

    res.json(users);
  } catch (error) {
    console.error('Ошибка получения списка пользователей:', error);
    res.status(500).json({ error: 'Серверная ошибка' });
  }
});

// Только после, маршрут по id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }
    const user = await User.findById(id).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// POST /api/users/me/photo - загрузить или обновить фото профиля
router.post(
  '/me/photo',
  authenticateToken,
  upload.single('avatar'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Фото не прикреплено' });
      }

      const fileName = `${authReq.user.id}-${Date.now()}-${req.file.originalname}`;
      const params = {
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: `profile/${fileName}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read', // 'private', если нужны временные ссылки
      };

      const uploadResult = await s3.upload(params).promise();

      await User.findByIdAndUpdate(authReq.user.id, {
        photoUrl: uploadResult.Location,
      });

      res.json({ photoUrl: uploadResult.Location });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Ошибка загрузки фото' });
    }
  }
);

export default router;
