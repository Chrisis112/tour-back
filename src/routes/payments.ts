import express from 'express';
import Stripe from 'stripe';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-07-30.basil' });

router.post('/api/create-checkout-session', async (req, res) => {
  try {
    const {
      price,
      serviceId,
      clientId,
      therapistId,
      firstName,
      lastName,
      phone,
      email,
      address,
      date,
      duration,
      timeSlot,
      notes = '',
    } = req.body;

    // Валидация обязательных полей
    if (
      !price ||
      !serviceId ||
      !therapistId ||
      !firstName ||
      !lastName ||
      !phone ||
      !email ||
      !address ||
      !date ||
      !duration ||
      !timeSlot
    ) {
      return res.status(400).json({ error: 'Недостаточно данных для создания сессии оплаты' });
    }

    // Создаём сессию Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Service ID: ${serviceId}`,
              description: `Date: ${date}, Time: ${timeSlot}, Duration: ${duration}min`,
            },
            unit_amount: Math.round(price * 100), // цена в центах
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      success_url: 'http://localhost:3000/thank-you',  // измените на ваш URL успеха
      cancel_url: 'http://localhost:3000/cancel',     // измените на ваш URL отмены
      metadata: {
        ...(clientId ? { clientId } : {}),
        therapistId,          // <- обязательно передаем therapistId
        serviceId,
        firstName,
        lastName,
        phone,
        email,
        address,
        date,
        duration: duration.toString(),  // строка для надежности
        timeSlot,
        notes,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
