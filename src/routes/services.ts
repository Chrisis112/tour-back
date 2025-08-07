import express from 'express';
import mongoose from 'mongoose';
import Service from '../models/Service';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { formatService } from '../utils/formatService';

const router = express.Router();

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// Вспомогательная функция для выбора текста по языку с fallback
function getLocalizedField(field: Record<string, string> | undefined, lang: string): string {
  if (!field) return '';
  return field[lang] || field['en'] || Object.values(field)[0] || '';
}

// GET /api/services/public — публичные услуги, без авторизации
router.get('/public', async (req, res) => {
  try {
    // Получаем параметры из запроса
    const lang = (req.query.lang?.toString().toLowerCase()) || 'en';
    const city = req.query.city?.toString().trim();

    // Формируем фильтр для запроса в базу
    const filter: any = {};
    if (city) {
      // Фильтрация по городу (чувствительность к регистру зависит от БД,
      // можно добавить RegExp для нечувствительности)
      filter.city = city;
      // Если нужно игнорировать регистр:
      // filter.city = new RegExp(`^${city}$`, 'i');
    }

    const services = await Service.find(filter)
      .populate('therapistId', 'firstName lastName photoUrl rating')
      .lean();

    const response = services.map(service => {
      const therapist = service.therapistId as any;

      return {
        _id: service._id,
        title: service.title ?? {},
        address: service.address ?? '',
        description: service.description ?? {},
        photoUrl: service.photoUrl ?? '',
        availability: service.availability ?? [],
        variants: service.variants ?? [],
        country: service.country ?? '',
        countryName: service.countryName ?? '',
        city: service.city ?? '',
        therapist: therapist
          ? {
              _id: therapist._id,
              firstName: therapist.firstName,
              lastName: therapist.lastName,
              photoUrl: therapist.photoUrl,
              rating: therapist.rating ?? 0,
            }
          : null,
      };
    });

    return res.json(response);
  } catch (error) {
    console.error('[GET /api/services/public] Error:', error);
    return res.status(500).json({ error: 'Server error while fetching services' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const lang = (req.query.lang?.toString().toLowerCase()) || 'en';
    const id = req.params.id;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid service ID format' });
    }

    const service = await Service.findById(id)
      .populate('therapistId', 'firstName lastName photoUrl rating');

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    return res.json(formatService(service, lang));
  } catch (error) {
    console.error('[GET /api/services/:id] Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/services — услуги текущего аутентифицированного терапевта
router.get('/', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const lang = (req.query.lang?.toString().toLowerCase()) || 'en';
    const therapistId = authReq.user?.id;
    if (!therapistId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const services = await Service.find({ therapistId })
      .populate('therapistId', 'firstName lastName photoUrl rating');

    const response = services.map(service => {
      const therapist = service.therapistId as any;

      return {
        _id: service._id,
        address: service.address,
        title: service.title ?? [],
        description: service.description ?? [],
        photoUrl: service.photoUrl,
        availability: service.availability ?? [],
        variants: service.variants ?? [],
        country: service.country,
        countryName: service.countryName,
        city: service.city,
        therapist: therapist
          ? {
              _id: therapist._id,
              firstName: therapist.firstName,
              lastName: therapist.lastName,
              photoUrl: therapist.photoUrl,
              rating: therapist.rating ?? 0,
            }
          : null,
      };
    });

    return res.json(response);
  } catch (error) {
    console.error('[GET /api/services] Error:', error);
    return res.status(500).json({ error: 'Server error while fetching services' });
  }
});

// POST /api/services — создать новую услугу (только для аутентифицированных терапевтов)
router.post('/', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const {
      title,
      description,
      photoUrl,
      availability,
      variants,
      country,
      countryName,
      city,
      address, // <-- добавляем сюда
    } = req.body;

    // Проверка нужных обязательных полей (address не проверяем, так как необязательное)
    if (
      !title || typeof title !== 'object' ||
      !description || typeof description !== 'object' ||
      !photoUrl ||
      !Array.isArray(variants) || !variants.length ||
      !country || !city
    ) {
      return res.status(400).json({ error: 'Please provide all required fields with correct types' });
    }

    if (!variants.every((v: any) => v.duration && (v.price !== undefined && v.price !== null))) {
      return res.status(400).json({ error: 'Each variant must have duration and price' });
    }

    const therapistId = authReq.user?.id;
    if (!therapistId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const existingServicesCount = await Service.countDocuments({ therapistId: therapistId });
    if (existingServicesCount >= 3) {
      return res.status(403).json({ error: 'Максимальное количество услуг для терапевта — 3' });
    }

    const newServiceData: any = {
      title,
      description,
      photoUrl,
      availability,
      variants: variants.map((v: any) => ({
        duration: Number(v.duration),
        price: Number(v.price),
      })),
      country,
      countryName,
      city,
      therapistId,
    };

    // Если передан address и это строка — добавляем в объект
    if (address && typeof address === 'string') {
      newServiceData.address = address.trim();
    }

    const newService = new Service(newServiceData);

    await newService.save();

    return res.status(201).json(newService);
  } catch (error) {
    console.error('[POST /api/services] Error creating service:', error);
    return res.status(500).json({ error: 'Server error while creating service' });
  }
});

// PUT /api/services/:id — обновить услугу (авторизованный терапевт)
router.put('/:id', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const id = req.params.id;
    const {
      title,
      description,
      photoUrl,
      availability,
      variants,
      country,
      countryName,
      city,
    } = req.body;

    const therapistId = authReq.user?.id;
    if (!therapistId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const service = await Service.findOne({ _id: id, therapistId });
    if (!service) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }

    if (title !== undefined) {
      if (typeof title !== 'object') {
        return res.status(400).json({ error: 'Title must be an object with translations' });
      }
      service.title = title;
    }

    if (description !== undefined) {
      if (typeof description !== 'object') {
        return res.status(400).json({ error: 'Description must be an object with translations' });
      }
      service.description = description;
    }

    if (photoUrl !== undefined) service.photoUrl = photoUrl;
    if (availability !== undefined) service.availability = availability;
    if (country !== undefined) service.country = country;
    if (countryName !== undefined) service.countryName = countryName;
    if (city !== undefined) service.city = city;

    if (Array.isArray(variants)) {
      if (!variants.every((v: any) => v.duration && (v.price !== undefined && v.price !== null))) {
        return res.status(400).json({ error: 'Each variant must have duration and price' });
      }
      service.variants = variants.map((v: any) => ({
        duration: Number(v.duration),
        price: Number(v.price),
      }));
    }

    await service.save();

    return res.json(service);
  } catch (error) {
    console.error('[PUT /api/services/:id] Error:', error);
    return res.status(500).json({ error: 'Server error while updating service' });
  }
});

// DELETE /api/services/:id — удалить услугу (авторизованный терапевт)
router.delete('/:id', authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const id = req.params.id;
    const therapistId = authReq.user?.id;
    if (!therapistId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const service = await Service.findOneAndDelete({ _id: id, therapistId });

    if (!service) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }

    return res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('[DELETE /api/services/:id] Error:', error);
    return res.status(500).json({ error: 'Server error while deleting service' });
  }
});

export default router;
