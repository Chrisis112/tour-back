import mongoose, { Schema, Document, Types } from 'mongoose';

const certificateSchema = new Schema(
  {
    fileUrl: { type: String, required: true },
    title: { type: String },
    _id: { type: Schema.Types.ObjectId, auto: true }, // уникальный ID сертификата
  },
  { _id: true }
);

export enum UserType {
  CLIENT = 'CLIENT',
  THERAPIST = 'THERAPIST',
  MANAGER = 'MANAGER',
}

export enum OAuthProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}

export interface ICertificate {
  fileUrl: string;
  title?: string;
  _id: Types.ObjectId | string;
}
const aboutSchema = new Schema(
  {
    ru: { type: String, trim: true, default: '' },
    et: { type: String, trim: true, default: '' },
    fi: { type: String, trim: true, default: '' },
    lt: { type: String, trim: true, default: '' },
    lv: { type: String, trim: true, default: '' },
    pl: { type: String, trim: true, default: '' },
    en: { type: String, trim: true, default: '' },
  },
  { _id: false } // без отдельного id, вложенный объект
);



export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  about?: IAbout;
  userType: UserType[];        // Массив ролей
  photoUrl?: string;
  rating?: number;
  telegramChatId?: string;
  certificates: ICertificate[];
  phone?: string;
  address?: string;
  oauthProvider?: OAuthProvider;
  oauthId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface IAbout {
  ru?: string;
  et?: string;
  fi?: string;
  lt?: string;
  lv?: string;
  pl?: string;
  en?: string;
}
const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },

    passwordHash: {
      type: String,
      required: function () {
        return !this.oauthProvider;
      },
    },

    firstName: {
      type: String,
      required: function () {
        return !this.oauthProvider;
      },
      trim: true,
    },

    lastName: {
      type: String,
      required: function () {
        return !this.oauthProvider;
      },
      trim: true,
    },
     about: {
      type: aboutSchema,
      default: () => ({})
     },

    userType: {
      type: [String],
      enum: Object.values(UserType),
      required: true,
      default: [UserType.CLIENT], // можно задать дефолтные роли
    },

    telegramChatId: { type: String },

    photoUrl: { type: String },

    rating: { type: Number, default: 0 },

    certificates: { type: [certificateSchema], default: [] },

    phone: { type: String },

    address: { type: String },

    oauthProvider: {
      type: String,
      enum: Object.values(OAuthProvider),
      required: false,
    },

    oauthId: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
