import { z } from 'zod'

export const PlanIdSchema = z.enum(['free', 'plus', 'pro'])
export type PlanId = z.infer<typeof PlanIdSchema>
export const UsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
})
export type TokenUsage = z.infer<typeof UsageSchema>
export const TariffSchema = z.object({
  version: z.string(),
  model: z.string(),
  input: z.number().int().nonnegative(),
  output: z.number().int().positive(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
})
export type Tariff = z.infer<typeof TariffSchema>
// Money and allowance use integer units: one credit = 1,000,000 microcredits.
export function creditUnits(value: string): number {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error('Invalid credit amount')
  const [whole, fraction = ''] = value.split('.')
  const units = Number(
    BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')),
  )
  if (!Number.isSafeInteger(units))
    throw new Error('Credit amount is too large')
  return units
}
export function usageCharge(usage: TokenUsage, tariff: Tariff): number {
  const verified = UsageSchema.parse(usage)
  const rates = TariffSchema.parse(tariff)
  const numerator = (Object.keys(verified) as (keyof TokenUsage)[]).reduce(
    (sum, key) => sum + BigInt(verified[key]) * BigInt(rates[key]),
    0n,
  )
  // Round once per model response, never per token/category.
  const units = Number((numerator + 999999n) / 1000000n)
  if (!Number.isSafeInteger(units))
    throw new Error('Usage exceeds accounting bounds')
  return units
}
export const BillingSummarySchema = z.object({
  plan: PlanIdSchema,
  periodStart: z.number(),
  periodEnd: z.number(),
  allowance: z.number(),
  used: z.number(),
  reserved: z.number(),
  remaining: z.number(),
  tokens: UsageSchema,
  paymentConfigured: z.boolean(),
  alipayConfigured: z.boolean().default(false),
  canManage: z.boolean(),
  cancelAtPeriodEnd: z.boolean(),
  plans: z.array(
    z.object({
      id: PlanIdSchema,
      name: z.string(),
      monthlyCents: z.number(),
      credits: z.number(),
    }),
  ),
  tariff: TariffSchema,
})
export type BillingSummary = z.infer<typeof BillingSummarySchema>
