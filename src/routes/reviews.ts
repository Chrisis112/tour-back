import express from 'express';
import mongoose from 'mongoose';
import Booking from '../models/Booking';
import User from '../models/User';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// Импорт или определение модели Review
const Review = mongoose.models.Review || mongoose.model('Review', new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
}));

router.post('/', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { recipientId: inputRecipientId, orderId, rating } = req.body;
  const currentUserId = authReq.user?.id;
const currentRoles: string[] = Array.isArray(authReq.user?.userType)
  ? authReq.user.userType.map(r => r.toLowerCase())
  : [];

  if (!currentUserId) {
    return res.status(401).json({ error: 'Неавторизован' });
  }

  if (!orderId || !rating || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Неверные данные: отсутствует orderId или rating' });
  }
  
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Рейтинг должен быть от 1 до 5' });
  }

  try {
    const order = await Booking.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Проверка, что currentUser участвует в этом заказе
    const participants = [order.clientId?.toString(), order.therapistId?.toString()];
    if (!participants.includes(currentUserId)) {
      return res.status(403).json({ error: 'Вы не участник этого заказа' });
    }

    // Определяем, кто является получателем рейтинга
    let recipientId: string | undefined;

    if (currentRoles.includes('therapist')) {
      // Терапевт оценивает клиента
      if (!order.clientId) {
        return res.status(400).json({ error: 'Невозможно оценить гостя (нет clientId)' });
      }
      recipientId = order.clientId.toString();
      if (recipientId === currentUserId) {
        return res.status(400).json({ error: 'Нельзя оценивать самого себя' });
      }
    } else {
      // Клиент оценивает терапевта
      if (!order.therapistId) {
        return res.status(400).json({ error: 'Терапевт не назначен' });
      }
      recipientId = order.therapistId.toString();
      if (recipientId === currentUserId) {
        return res.status(400).json({ error: 'Нельзя оценивать самого себя' });
      }
    }

    // Дополнительно: если в теле передан recipientId, проверить совпадение (опционально)
    if (inputRecipientId && inputRecipientId !== recipientId) {
      // Игнорируем inputRecipientId, используем вычисленный recipientId
      console.warn(`Игнорируем переданный recipientId ${inputRecipientId}, используется вычисленный ${recipientId}`);
    }

    // Проверка, что текущий пользователь не оставил отзыв по этому заказу ранее
    const existingReview = await Review.findOne({ order: orderId, rater: currentUserId });
    if (existingReview) {
      return res.status(400).json({ error: 'Вы уже оставили отзыв по этому заказу' });
    }

    // Создаем и сохраняем отзыв
    const review = new Review({
      order: orderId,
      rater: currentUserId,
      recipient: recipientId,
      rating,
    });

    await review.save();

    // Пересчет среднего рейтинга получателя
    const ratingStats = await Review.aggregate([
      { $match: { recipient: new mongoose.Types.ObjectId(recipientId) } },
      { $group: { _id: '$recipient', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating = ratingStats.length > 0 ? ratingStats[0].avgRating : 0;

    // Обновляем поле рейтинга пользователя
    await User.findByIdAndUpdate(recipientId, { rating: avgRating });

    return res.json({ success: true, avgRating });
  } catch (err) {
    console.error('Ошибка при добавлении отзыва:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
