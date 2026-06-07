import { getActiveSlotPrice } from "@/lib/profiles/slot-billing";

export const dynamic = "force-dynamic";

/**
 * GET /api/profiles/slots/price
 *
 * Returns the active recurring price for the Profile Slot product so the
 * SlotUpgradeModal can display the amount and interval without leaking
 * the Stripe Price object to the client.
 */
export async function GET() {
  const price = await getActiveSlotPrice();
  if (!price || !price.unit_amount || !price.recurring) {
    return Response.json({ error: "Slot product not configured" }, { status: 503 });
  }

  return Response.json({
    amountCents: price.unit_amount,
    currency: price.currency,
    interval: price.recurring.interval, // "year" | "month" | etc.
    intervalCount: price.recurring.interval_count,
  });
}
