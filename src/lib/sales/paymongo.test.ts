import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePaidEvent, verifyPaymongoSignature } from "./paymongo";

const secret = "whsk_test";
const body = JSON.stringify({ hello: "world" });
const sign = (t: number, b = body) => createHmac("sha256", secret).update(`${t}.${b}`).digest("hex");

describe("verifyPaymongoSignature", () => {
  it("accepts a fresh live signature and rejects tampering", () => {
    const t = 1_800_000_000;
    expect(verifyPaymongoSignature(`t=${t},te=,li=${sign(t)}`, body, secret, t + 10)).toBe(true);
    expect(verifyPaymongoSignature(`t=${t},te=,li=${sign(t)}`, body + " ", secret, t + 10)).toBe(false);
    expect(verifyPaymongoSignature(`t=${t},te=${sign(t)},li=`, body, secret, t + 10, false)).toBe(true);
  });
  it("rejects old or missing signatures", () => {
    const t = 1_800_000_000;
    expect(verifyPaymongoSignature(`t=${t},li=${sign(t)}`, body, secret, t + 301)).toBe(false);
    expect(verifyPaymongoSignature(null, body, secret)).toBe(false);
    expect(verifyPaymongoSignature(`t=${t},li=${sign(t)}`, body, "", t)).toBe(false);
  });
});

describe("parsePaidEvent", () => {
  it("reads the order number, amount and payment id", () => {
    const ev = { data: { attributes: { type: "checkout_session.payment.paid", livemode: false, data: { attributes: { reference_number: "SO-2026-00001", payments: [{ id: "pay_1", attributes: { amount: 76800, status: "paid" } }] } } } } };
    expect(parsePaidEvent(ev)).toEqual({ reference: "SO-2026-00001", amountCentavos: 76800, paymentId: "pay_1", livemode: false });
    expect(parsePaidEvent({ data: { attributes: { type: "payment.failed" } } })).toBeNull();
  });
});
