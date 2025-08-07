// src/types/express/index.d.ts
import * as express from 'express';

declare global {
  namespace Express {
    interface User {
      id?: string;
      _id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      userType?: string;
      oauthProvider?: string;
      oauthId?: string;
    }
    interface Request {
      user?: User;
    }
  }
}
