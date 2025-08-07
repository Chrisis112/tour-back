import express from 'express';
import Therapist from '../models/Therapist';
import User from '../models/User';
import Service from '../models/Service';

const router = express.Router();

router.get('/', async (req, res) => {
  const therapists = await Therapist.find().populate('userId', 'firstName lastName avatarUrl rating');
  res.json(therapists);
});

// GET /api/therapists/:id — профиль массжиста и его услуги
router.get('/:id', async (req, res) => {
  try {
    const therapist = await User.findById(req.params.id).lean();
    // Явно учитываем, что therapist не массив:
    if (!therapist || Array.isArray(therapist)) {
      return res.status(404).json({ error: 'Массажист не найден' });
    }

    const services = await Service.find({ therapistId: therapist._id });

    res.json({
      _id: therapist._id,
      firstName: therapist.firstName,
      lastName: therapist.lastName,
      bio: therapist.bio,
      photoUrl: therapist.photoUrl,
      skills: therapist.skills,
      certificates: therapist.certificates,
      services,
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
export default router;
