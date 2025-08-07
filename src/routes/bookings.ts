import express from 'express';
import mongoose from 'mongoose';
import Booking, { IMessage } from '../models/Booking';
import Service from '../models/Service';
import User from '../models/User';
import Review from '../models/Review';
import { authenticateToken, optionalAuthenticateToken, AuthenticatedRequest } from '../middleware/auth';
import cron from 'node-cron';
import { io } from '../../server';  // Импортируйте io из вашего server.ts
import { notifyTherapist } from './telegramBot';

const router = express.Router();

async function updateOrderStatuses() {
  try {
    const now = new Date();
    const pendingOrders = await Booking.find({ status: 'pending' });
    for (const order of pendingOrders) {
  const datePart = new Date(order.date);
  if (isNaN(datePart.getTime())) {
    console.error(`Invalid date for order ${order._id}: ${order.date}`);
    continue;
  }
  const [hours, minutes] = order.timeSlot.split(':').map(Number);
  const start = new Date(datePart);
  start.setHours(hours, minutes, 0, 0);
  const endTime = new Date(start.getTime() + (order.duration ?? 0) * 60000);
  if (now >= endTime) {
    order.status = 'confirmed';
    await order.save();
    console.log(`[${new Date().toISOString()}] Order ${order._id} updated to confirmed`);
  }

    }
  } catch (e) {
    console.error('Error updating order statuses:', e);
  }
}

cron.schedule('* * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Running scheduled order status update...`);
  await updateOrderStatuses();
});

function timeStrToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function logRequest(route: string, details?: any) {
  console.log(`[${new Date().toISOString()}] Route ${route} called`, details || '');
}

// PUBLIC SLOTS
router.get('/slots', async (req, res) => {
    const { serviceId, date } = req.query;

    if (typeof serviceId !== 'string' || typeof date !== 'string') {
        return res.status(400).json({ error: 'Параметры serviceId и date обязательны' });
    }

    try {
        const dateStart = new Date(date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(date);
        dateEnd.setHours(23, 59, 59, 999);

        const bookings = await Booking.find({
            serviceId,
            date: { $gte: dateStart, $lte: dateEnd },
            status: { $in: ['pending', 'confirmed'] },
        }).lean();

        const busyIntervals = bookings.map(b => ({
            startMin: timeStrToMinutes(b.timeSlot),
            endMin: timeStrToMinutes(b.timeSlot) + (b.duration ?? 0) + 30,
        }));

        res.json({ busyIntervals });
    } catch (error) {
        console.error('Ошибка получения слотов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


router.get('/manager/stats', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (
    !authReq.user ||
    !Array.isArray(authReq.user.userType) ||
    !authReq.user.userType.some(role => {
      const roleUpper = role.toUpperCase();
      return roleUpper === 'MANAGER' ;
    })
  ) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { therapistId, dateFrom, dateTo } = req.query;

  if (!therapistId || !dateFrom || !dateTo) {
    return res.status(400).json({ error: 'Обязательны параметры therapistId, dateFrom и dateTo' });
  }

  try {
    const startDate = dateFrom.toString();
    const endDate = dateTo.toString();

    const stats = await Booking.aggregate([
      {
        $match: {
          therapistId: new mongoose.Types.ObjectId(therapistId.toString()),
          status: "confirmed",
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          completedOrders: { $sum: 1 },
          totalEarned: { $sum: "$price" }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.json({ completedOrders: 0, totalEarned: 0 });
    }

    return res.json({
      completedOrders: stats[0].completedOrders,
      totalEarned: stats[0].totalEarned
    });
  } catch (err) {
    console.error('Ошибка получения статистики:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// CREATE BOOKING
router.post('/', optionalAuthenticateToken, async (req, res) => {
  logRequest('POST /', { body: req.body, user: (req as AuthenticatedRequest).user });

  const authReq = req as AuthenticatedRequest;
  const { serviceId, firstName, lastName, phone, email, address, date, timeSlot, duration, price } = req.body;

  if (!serviceId || !phone || !address || !date || !timeSlot || !duration) {
    return res.status(400).json({ error: 'Обязательные поля отсутствуют' });
  }

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  try {
    const service = await Service.findById(serviceId);
    if (!service) {
      logRequest('POST / error', 'Service not found');
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const conflict = await Booking.findOne({
      serviceId,
      date,
      timeSlot,
      status: { $in: ['pending', 'confirmed'] },
    });
    if (conflict) {
      return res.status(400).json({ error: 'Выбранное время занято' });
    }

    const bookingData: any = {
      serviceId,
      phone,
      email,
      address,
      date,
      timeSlot,
      duration,
      price,
      status: 'pending',
      therapistId: service.therapistId,
      lastReadAt: {},
    };

    if (authReq.user?.id) {
      const user = await User.findById(authReq.user.id);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      bookingData.clientId = user._id;
      bookingData.firstName = user.firstName;
      bookingData.lastName = user.lastName;
      bookingData.email = user.email;
    } else {
      bookingData.firstName = firstName;
      bookingData.lastName = lastName;
      bookingData.email = email;
    }

    const booking = await Booking.create(bookingData);

    logRequest('POST / success', booking);
const therapist = await User.findOne({
  _id: booking.therapistId,
  userType: { $in: ['THERAPIST'] },
});
    // Notify therapist
    if (booking.therapistId) {
      try {
        const therapist = await User.findOne({
          _id: booking.therapistId,
          userType: { $in: ['THERAPIST'] }
        });

        if (therapist?.telegramChatId) {
          await notifyTherapist({
            chatId: therapist.telegramChatId,
            service: service.title.trim(),
            date: booking.date,
            time: booking.timeSlot,
            clientName: `${booking.firstName} ${booking.lastName}`,
            address: booking.address,
            duration: booking.duration,
          });
        }
      } catch (notifyError) {
        console.error('Failed to send Telegram notification:', notifyError);
      }
    }

    return res.status(201).json({ success: true, booking });
  } catch (error) {
    console.error('Ошибка создания бронирования:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

function sortByStatusThenDate(a: any, b: any) {
  const statusPriority = (status: string) => {
    if (!status) return 99;
    switch (status.toLowerCase()) {
      case 'pending': return 0;
      case 'confirmed': return 1;
      default: return 2;
    }
  };
  const sa = statusPriority(a.status);
  const sb = statusPriority(b.status);
  if (sa !== sb) return sa - sb;
  const da = new Date(`${a.date}T${a.timeSlot}`).getTime();
  const db = new Date(`${b.date}T${b.timeSlot}`).getTime();
  return da - db;
}

router.get('/my', authenticateToken, async (req, res) => {
  logRequest('GET /my', req.query);

  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.id) {
    return res.status(401).json({ error: 'Неавторизован' });
  }
  const userId = authReq.user.id;

  try {
    const filter = { clientId: userId };

    let orders = await Booking.find(filter)
      .populate('serviceId', 'title photoUrl description')
      .populate('clientId', 'firstName lastName phone')
      .populate('therapistId', 'firstName lastName photo')
      .lean();

    orders = orders.map(order => {
      const lastRead = order.lastReadAt?.get ? order.lastReadAt.get(userId) : order.lastReadAt ? order.lastReadAt[userId] : null;
      let lastReadDate = lastRead ? new Date(lastRead) : null;

      const hasUnread = order.messages.some((msg: IMessage) => {
        return msg.sender.toString() !== userId && (!lastReadDate || new Date(msg.timestamp) > lastReadDate);
      });
      return { ...order, hasUnreadMessages: hasUnread };
    });

    orders.sort(sortByStatusThenDate);

    logRequest('GET /my result', { count: orders.length });
    res.json(orders);
  } catch (error) {
    console.error('Ошибка получения заказов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/clients', authenticateToken, async (req, res) => {
  logRequest('GET /clients', req.query);

  const authReq = req as AuthenticatedRequest;
  if (
  !authReq.user ||
  !Array.isArray(authReq.user.userType) ||
  !authReq.user.userType.some(role => role.toLowerCase() === 'therapist')
) {
  return res.status(403).json({ error: 'Доступ запрещён' });
}
  const therapistId = authReq.user.id;


  try {
    let clients = await Booking.find({ therapistId })
      .populate('clientId', 'firstName lastName phone rating')
      .populate('serviceId', 'title description')
      .lean();

    clients = clients.map(order => {
      const lastRead = order.lastReadAt?.get ? order.lastReadAt.get(therapistId) : order.lastReadAt ? order.lastReadAt[therapistId] : null;
      let lastReadDate = lastRead ? new Date(lastRead) : null;

      const hasUnread = order.messages.some((msg: IMessage) => {
        return msg.sender.toString() !== therapistId && (!lastReadDate || new Date(msg.timestamp) > lastReadDate);
      });
      return { ...order, hasUnreadMessages: hasUnread };
    });

    clients.sort(sortByStatusThenDate);

    logRequest('GET /clients result', { count: clients.length });
    res.json(clients);
  } catch (error) {
    console.error('Ошибка получения клиентов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id/messages', authenticateToken, async (req, res) => {
  logRequest('GET /:id/messages', req.query);

  if (!req.user?.id) return res.status(401).json({ error: 'Неавторизован' });

  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Заказ не найден' });

    const userId = req.user.id;
    if (![booking.clientId?.toString(), booking.therapistId?.toString()].includes(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    booking.lastReadAt.set(userId, new Date());
    await booking.save();

    res.json(booking.messages);
  } catch (error) {
    console.error('Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/:id/messages', authenticateToken, async (req, res) => {
  logRequest('POST /:id/messages', req.body);

  if (!req.user?.id) return res.status(401).json({ error: 'Неавторизован' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Текст обязателен' });

  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Заказ не найден' });

    // Если в заказе нет clientId — это гость, запрещаем отправку сообщений
    if (!booking.clientId) {
      return res.status(403).json({ error: 'Гостям запрещено отправлять сообщения' });
    }

    const userId = req.user.id;
    if (![booking.clientId?.toString(), booking.therapistId?.toString()].includes(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const message: IMessage = {
      sender: new mongoose.Types.ObjectId(userId),
      text,
      timestamp: new Date(),
    };
    booking.messages.push(message);
    await booking.save();

    // Отправляем новое сообщение через socket.io в комнату booking
    io.to(req.params.id).emit('newMessage', {
      bookingId: req.params.id,
      ...message,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Ошибка добавления сообщения:', error);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/:id/mark-read', authenticateToken, async (req, res) => {
  logRequest('POST /:id/mark-read', req.body);

  if (!req.user?.id) return res.status(401).json({ error: 'Неавторизован' });

  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Заказ не найден' });

    const userId = req.user.id;
    if (![booking.clientId?.toString(), booking.therapistId?.toString()].includes(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    if (booking.lastReadAt && typeof booking.lastReadAt.set === 'function') {
      booking.lastReadAt.set(userId, new Date());
    } else {
      booking.lastReadAt = booking.lastReadAt || {};
      booking.lastReadAt[userId] = new Date();
    }
    await booking.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при отметке прочитанным:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/:orderId/review', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { orderId } = req.params;
  const { rating } = req.body;
  const raterId = authReq.user?.id;

  if (!raterId) {
    return res.status(401).json({ error: 'Неавторизован' });
  }

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Рейтинг должен быть от 1 до 5' });
  }

  // Получаем userType из токена, безопасно приводим к массиву строк в нижнем регистре
  const userRoles: string[] = Array.isArray(authReq.user?.userType)
    ? authReq.user.userType.map(role => role.toLowerCase().trim())
    : [];

  try {
    const order = await Booking.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Определяем роли рейтера
    const isTherapist = userRoles.includes('therapist');

    let recipientId: string | undefined;

    if (isTherapist) {
      // Терапевт оценивает клиента
      if (!order.clientId) {
        return res.status(400).json({ error: 'Нельзя оценить гостя' });
      }
      recipientId = order.clientId.toString();
      if (recipientId === raterId) {
        return res.status(400).json({ error: 'Нельзя оценивать себя' });
      }
    } else {
      // Клиент оценивает терапевта
      if (!order.therapistId) {
        return res.status(400).json({ error: 'Терапевт не назначен' });
      }
      recipientId = order.therapistId.toString();
      if (recipientId === raterId) {
        return res.status(400).json({ error: 'Нельзя оценивать себя' });
      }
    }

    // Проверка, что текущий пользователь является участником этого заказа
    if (![order.clientId?.toString(), order.therapistId?.toString()].includes(raterId)) {
      return res.status(403).json({ error: 'Нет доступа к отзыву по этому заказу' });
    }

    // Проверяем, не оставлял ли уже отзыв
    const existingReview = await Review.findOne({ order: orderId, rater: raterId });
    if (existingReview) {
      return res.status(400).json({ error: 'Вы уже оставили отзыв по этому заказу' });
    }

    // Создаём и сохраняем новый отзыв
    const review = new Review({
      order: orderId,
      rater: raterId,
      recipient: recipientId,
      rating,
    });
    await review.save();

    // Пересчёт среднего рейтинга для получателя
    const stats = await Review.aggregate([
      { $match: { recipient: new mongoose.Types.ObjectId(recipientId) } },
      { $group: { _id: '$recipient', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating = stats.length > 0 ? stats[0].avgRating : 0;

    // Обновляем рейтинг пользователя
    await User.findByIdAndUpdate(recipientId, { rating: avgRating });

    return res.json({ success: true });
  } catch (e) {
    console.error('Ошибка создания отзыва:', e);
    return res.status(500).json({ error: 'Ошибка сервера при создании отзыва' });
  }
});

export default router;
