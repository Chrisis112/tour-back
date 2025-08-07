import express from 'express';
import Stripe from 'stripe';
import mongoose from 'mongoose';
import Booking from '../models/Booking';
import { notifyTherapist } from '../routes/telegramBot'; // Укажите правильный путь к вашему telegram боту, где есть notifyTherapist

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-07-30.basil' });

// Важно: для webhook тело запроса должно быть сырым Bufferом,
// настройте в основном сервере express.raw({type:'application/json'}) 
// чтобы работать с webhook корректно

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('Missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata;

    if (!meta) {
      console.error('No metadata found in checkout session');
      return res.status(400).send('No metadata in session');
    }

    const {
      clientId, // необязательный
      therapistId,
      serviceId,
      firstName,
      lastName,
      phone,
      email,
      address,
      date,
      timeSlot,
      duration,
      notes,
    } = meta;

    // Проверяем обязательные поля (кроме clientId - он может быть гостем)
    if (
      !therapistId ||
      !serviceId ||
      !firstName ||
      !lastName ||
      !phone ||
      !email ||
      !address ||
      !date ||
      !timeSlot ||
      !duration
    ) {
      console.error('Missing required metadata fields:', meta);
      return res.status(400).send('Missing required metadata');
    }

    try {
      // Проверим что бронирование с таким платежом еще нет
      const existingBooking = await Booking.findOne({ stripePaymentId: session.payment_intent as string });
      if (existingBooking) {
        console.log('Booking already exists for payment:', session.payment_intent);
        return res.status(200).json({ received: true });
      }

      const bookingData: Record<string, any> = {
        therapistId: new mongoose.Types.ObjectId(therapistId),
        serviceId: new mongoose.Types.ObjectId(serviceId),
        firstName,
        lastName,
        phone,
        email,
        address,
        date: new Date(date),
        scheduledDate: new Date(date),
        timeSlot,
        duration: parseInt(duration, 10),
        durationMinutes: parseInt(duration, 10),
        price: (session.amount_total ?? 0) / 100,
        status: 'pending',
        paymentStatus: 'PAID',
        stripePaymentId: session.payment_intent as string,
        notes: notes ?? '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // clientId может быть с null, если гость, но если есть и валиден - добавляем
      if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
        bookingData.clientId = new mongoose.Types.ObjectId(clientId);
      }

      const booking = await Booking.create(bookingData);
      console.log('Booking saved successfully from webhook:', session.id);

      // Отправляем уведомление терапевту через Telegram бота
      try {
        // Подготовим Имя клиента для уведомления
        const clientName = `${firstName} ${lastName}`;

        // chatId для Telegram уведомления — его нужно получить из базы, зная therapistId
        // Предположим есть модель User с методом поиска
        const User = require('../models/User').default; // или import, смотрите как у вас устроено

        const therapistUser = await User.findById(therapistId);
        const chatId = therapistUser?.telegramChatId;

        if (chatId) {
          await notifyTherapist({
            chatId,
            service: 'услуга', // если хотите, можно подгрузить название услуги из базы по serviceId
            date,
            time: timeSlot,
            clientName,
            address,
            duration: parseInt(duration, 10),
          });
          console.log(`Telegram notification sent to therapist ${therapistId}`);
        } else {
          console.warn(`Therapist ${therapistId} does not have telegramChatId. Notification skipped.`);
        }
      } catch (notifyError) {
        console.error('Failed to send Telegram notification:', notifyError);
      }

    } catch (err) {
      console.error('Error saving booking from webhook:', err);
      return res.status(500).send('DB Save Error');
    }
  }

  // Stripe требует 200 для подтверждения приёма webhook
  return res.status(200).json({ received: true });
});

export default router;
