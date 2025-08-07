// utils/formatService.ts

interface Therapist {
  _id: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  rating?: number;
}

export function formatService(service: any, lang = 'en') {
  const therapist = service.therapistId as Therapist | null;

  return {
    _id: service._id,
    therapistId: therapist?._id || null, // 👈 Явно включаем therapistId
    title: service.title ?? {},
    description: service.description ?? {},
    photoUrl: service.photoUrl,
    availability: service.availability ?? [],
    variants: service.variants ?? [],
    country: service.country,
    address: service.address,
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
}
