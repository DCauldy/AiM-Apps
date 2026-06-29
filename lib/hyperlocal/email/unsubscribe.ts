import { SignJWT, jwtVerify } from "jose";

const ISSUER = "aim-hyperlocal";
const AUDIENCE = "unsubscribe";

function getSecret(): Uint8Array {
  const raw = process.env.HYPERLOCAL_UNSUBSCRIBE_SECRET;
  if (!raw) {
    throw new Error("HYPERLOCAL_UNSUBSCRIBE_SECRET is not set");
  }
  return new TextEncoder().encode(raw);
}

export async function generateUnsubscribeToken(
  userId: string,
  email: string
): Promise<string> {
  return await new SignJWT({ uid: userId, e: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(getSecret());
}

export async function verifyUnsubscribeToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.uid !== "string" ||
      typeof payload.e !== "string"
    ) {
      return null;
    }
    return { userId: payload.uid, email: payload.e };
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://apps.aimarketingacademy.com";
  return `${base.replace(/\/$/, "")}/api/hyperlocal/unsubscribe?token=${encodeURIComponent(token)}`;
}
