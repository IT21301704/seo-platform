// Stripe billing (Phase 4, screen 12): Checkout for new subscriptions, the customer portal for
// plan changes, payment method and invoices, and signed webhooks that set the plan.
// REST + form encoding through the SSRF-guarded client (no SDK needed).
import { createHmac, timingSafeEqual } from "node:crypto";
import { ok } from "./http";
import type { JsonHttp } from "./http";

const API = "https://api.stripe.com/v1";
export const STRIPE_TOLERANCE_SECONDS = 300;

export type PaidPlan = "starter" | "pro" | "agency";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Stripe price id per paid plan (STRIPE_PRICE_STARTER, …). */
  prices: Record<PaidPlan, string>;
}

/** Stripe settings from the environment, or null (then billing runs in local test mode). */
export function stripeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  const secretKey = env["STRIPE_SECRET_KEY"];
  const webhookSecret = env["STRIPE_WEBHOOK_SECRET"];
  const starter = env["STRIPE_PRICE_STARTER"];
  const pro = env["STRIPE_PRICE_PRO"];
  const agency = env["STRIPE_PRICE_AGENCY"];
  if (!secretKey || !webhookSecret || !starter || !pro || !agency) return null;
  return { secretKey, webhookSecret, prices: { starter, pro, agency } };
}

/** The plan a Stripe price id belongs to, or null. */
export function planForPrice(
  config: StripeConfig,
  priceId: string | null | undefined,
): PaidPlan | null {
  const entry = Object.entries(config.prices).find(([, id]) => id === priceId);
  return entry ? (entry[0] as PaidPlan) : null;
}

export class StripeClient {
  constructor(
    private readonly http: JsonHttp,
    private readonly secretKey: string,
  ) {}

  private async post<T>(path: string, form: Record<string, string>, what: string): Promise<T> {
    return ok(
      await this.http.send<T>({
        method: "POST",
        url: `${API}${path}`,
        headers: { authorization: `Bearer ${this.secretKey}` },
        form,
      }),
      `Stripe ${what}`,
    );
  }

  /** Hosted Checkout for a new subscription. client_reference_id links it to the organization. */
  createCheckoutSession(args: {
    priceId: string;
    organizationId: string;
    customerId: string | null;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }> {
    return this.post(
      "/checkout/sessions",
      {
        mode: "subscription",
        "line_items[0][price]": args.priceId,
        "line_items[0][quantity]": "1",
        client_reference_id: args.organizationId,
        "subscription_data[metadata][organizationId]": args.organizationId,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        ...(args.customerId ? { customer: args.customerId } : { customer_email: args.email }),
      },
      "Checkout",
    );
  }

  /** Customer portal: change or cancel the plan, payment method, invoices. */
  createPortalSession(args: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    return this.post(
      "/billing_portal/sessions",
      { customer: args.customerId, return_url: args.returnUrl },
      "billing portal",
    );
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Stripe-Signature: "t=<unix>,v1=<hex>[,v1=…]" — HMAC-SHA256 of "<t>.<payload>". */
export function signStripePayload(payload: string, secret: string, timestamp: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now: Date,
  toleranceSeconds = STRIPE_TOLERANCE_SECONDS,
): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!Number.isFinite(t) || Math.abs(now.getTime() / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"),
  );
  return parts
    .filter(([k]) => k === "v1")
    .some(([, v]) => {
      const given = Buffer.from(v ?? "");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
