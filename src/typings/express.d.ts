// src/typings/express.d.ts
import { Request } from 'express';
import * as schema from '../db/schema'; // Adjust path to your Drizzle schema

// Define the type of user that will be attached to the request by Passport strategies
export interface AuthenticatedUser {
  id: typeof schema.users.$inferSelect.id;
  username: typeof schema.users.$inferSelect.username;
  email: typeof schema.users.$inferSelect.email;
  roleId: typeof schema.users.$inferSelect.roleId;
  jti: string; // From the JWT payload
  // Add any other properties you attach to req.user for convenience
  name?: string | null;
  phone?: string | null;
  birthDate?: Date | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  // Make sure to include all necessary fields that might be used for updates or display
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
