import { SignJWT, jwtVerify } from "jose";

const ISSUER = "aim-hyperlocal-oauth";

function getSecret(): Uint8Array {
  const raw =
    process.env.HYPERLOCAL_UNSUBSCRIBE_SECRET ??
    process.env.AIM_APP_TOKEN_SECRET;
  if (!raw) {
    throw new Error(
      "HYPERLOCAL_UNSUBSCRIBE_SECRET (or AIM_APP_TOKEN_SECRET fallback) must be set for OAuth state signing"
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signOauthState(opts: {
  userId: string;
  provider: "google" | "microsoft";
  returnTo?: string;
}): Promise<string> {
  return await new SignJWT({ ...opts })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret());
}

export async function verifyOauthState(token: string): Promise<{
  userId: string;
  provider: "google" | "microsoft";
  returnTo?: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: ISSUER });
    if (
      typeof payload.userId !== "string" ||
      (payload.provider !== "google" && payload.provider !== "microsoft")
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      provider: payload.provider,
      returnTo:
        typeof payload.returnTo === "string" ? payload.returnTo : undefined,
    };
  } catch {
    return null;
  }
}
