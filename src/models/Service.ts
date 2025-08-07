import mongoose, { Document, Schema } from 'mongoose';

export interface IService extends Document {
  title: {
    [lang: string]: string; // ключ — язык, значение — строка
  };
  description: {
    [lang: string]: string;
  };
  photoUrl?: string;
  variants: {
    duration: number;
    price: number;
  }[];
  availability: {
    dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
    timeSlots: { start: string; end: string }[];
  }[];
  country: string;   // 2-буквенный ISO код страны (например "EE", "RU")
  city: string;
  therapistId: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  address?: string;
}


// Схема для мультиязычных строк — перечисляем языки
const localizedStringSchema = new Schema(
  {
    en: { type: String },
    ru: { type: String },
    et: { type: String },
    fi: { type: String },
    pl: { type: String },
    lt: { type: String },
    lv: { type: String },
    // Добавляйте другие языки по необходимости
  },
  { _id: false }
);


// Подсхема для расписания
const availabilitySchema = new Schema({
  dayOfWeek: {
    type: String,
    enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    required: true,
  },
  timeSlots: [
    {
      start: { type: String, required: true },
      end: { type: String, required: true },
    },
  ],
}, { _id: false });


// Подсхема для вариантов длительности/цены
const variantSchema = new Schema({
  duration: { type: Number, required: true }, // в минутах
  price: { type: Number, required: true }, // цена для данной длительности
}, { _id: false });


const serviceSchema = new Schema<IService>(
  {
    title: {
      type: localizedStringSchema,
      required: true,
    },
    description: {
      type: localizedStringSchema,
      required: true,
    },
    photoUrl: { type: String, required: false },
    
     address: {
      type: String,
      required: false,
      trim: true, // опционально, чтобы убрать пробелы по краям
    },

    availability: [availabilitySchema],

    country: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      match: /^[A-Z]{2}$/, // ISO 2-буквенный код страны
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    therapistId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    variants: {
      type: [variantSchema],
      required: true,
      validate: {
        validator: (arr: any[]) => Array.isArray(arr) && arr.length > 0,
        message: 'Требуется хотя бы один вариант массажа (длительность и цена)',
      },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Service || mongoose.model<IService>('Service', serviceSchema);
