/**
 * Stripe Checkout for the commissioner videos (Oct 10): two calls over
 * plain HTTPS, no SDK. Create a hosted checkout page for a one-time payment,
 * and ask Stripe whether a session was paid. No webhooks: the app asks
 * Stripe directly when the buyer comes back (and again whenever they open
 * their videos), so a closed tab after paying still ends in a credit.
 *
 * STRIPE_SECRET_KEY decides test vs live (sk_test_... / sk_live_...).
 */

// STRIPE_API_BASE exists for local end-to-end tests against a stand-in; never set it in production
const STRIPE_API = process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1';
const TIMEOUT_MS = 15_000;

export interface CheckoutRequest {
  amountCents: number;
  productName: string;
  successUrl: string; // may contain Stripe's {CHECKOUT_SESSION_ID} placeholder
  cancelUrl: string;
  email: string;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string | null; // the hosted page, while the session is open
  paid: boolean;
  amountCents: number | null;
}

// What the video payments call: the real Stripe in production, a stub in the smoke test
export interface PaymentGateway {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getCheckout(sessionId: string): Promise<CheckoutSession>;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeFetch(path: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (body.error as { message?: string } | undefined)?.message ?? 'no details';
    throw new Error(`Stripe ${res.status}: ${message}`);
  }
  return body;
}

function toSession(body: Record<string, unknown>): CheckoutSession {
  return {
    id: String(body.id),
    url: typeof body.url === 'string' ? body.url : null,
    paid: body.payment_status === 'paid',
    amountCents: typeof body.amount_total === 'number' ? body.amount_total : null,
  };
}

export const stripeGateway: PaymentGateway = {
  async createCheckout(request) {
    const form: Record<string, string> = {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(request.amountCents),
      'line_items[0][price_data][product_data][name]': request.productName,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      customer_email: request.email,
    };
    for (const [key, value] of Object.entries(request.metadata)) form[`metadata[${key}]`] = value;
    return toSession(await stripeFetch('/checkout/sessions', form));
  },

  async getCheckout(sessionId) {
    return toSession(await stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`));
  },
};
