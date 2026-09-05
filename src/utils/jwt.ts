import { SignJWT } from "jose";
import { ACCESS_TOKEN_TTL_SECONDS, JWT_SECRET } from "../common/env.ts";

export interface AccessTokenClaims {
  userId: string;
  role: string;
  sessionId: string;
}

export async function signAccessToken(
  claims: AccessTokenClaims,
): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ role: claims.role, sessionId: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secret);
}
