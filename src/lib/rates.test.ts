import { beforeEach, expect, it, vi } from 'vitest'
import { clearRateCache, fetchRate, parseRate, rateUrl } from './rates'

const body = [{ date: '2026-11-06', base: 'AED', quote: 'INR', rate: 25.635 }]
const ok = (json: unknown) => ({ ok: true, json: async () => json }) as Response
beforeEach(() => clearRateCache())

it('builds the dated URL', () => {
  expect(rateUrl('AED', 'INR', '2026-11-06'))
    .toBe('https://api.frankfurter.dev/v2/rates?base=AED&quotes=INR&date=2026-11-06')
})

it.each([
  [body, 25.635], [[], null], [null, null], [{ status: 422 }, null],
  [[{ ...body[0], quote: 'USD' }], null], [[{ ...body[0], rate: '25' }], null],
  [[{ ...body[0], rate: 0 }], null], [[{ ...body[0], rate: -1 }], null],
])('reads %j as %j', (json, expected) => {
  expect(parseRate(json, 'AED', 'INR')).toBe(expected)
})

it('asks once, privately, and remembers the answer', async () => {
  const fetchImpl = vi.fn(async () => ok(body))
  expect(await fetchRate('AED', 'INR', '2026-11-06', { fetchImpl })).toBe(25.635)
  expect(await fetchRate('AED', 'INR', '2026-11-06', { fetchImpl })).toBe(25.635)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(rateUrl('AED', 'INR', '2026-11-06'))
  expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  expect(init.signal).toBeInstanceOf(AbortSignal)
})

it.each([
  ['AED&x=1', 'INR', '2026-11-06'], ['aed', 'INR', '2026-11-06'],
  ['AED', 'INR?', '2026-11-06'], ['AED', 'INR', '2026-11-6'],
])('asks nothing for %j to %j on %j', async (base, quote, date) => {
  const fetchImpl = vi.fn(async () => ok(body))
  expect(await fetchRate(base, quote, date, { fetchImpl })).toBeNull()
  expect(fetchImpl).not.toHaveBeenCalled()
})

it('shares one request between callers in flight', async () => {
  const fetchImpl = vi.fn(async () => ok(body))
  const [a, b] = await Promise.all([
    fetchRate('AED', 'INR', '2026-11-06', { fetchImpl }),
    fetchRate('AED', 'INR', '2026-11-06', { fetchImpl }),
  ])
  expect([a, b]).toEqual([25.635, 25.635])
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it.each([
  ['the request fails', async () => { throw new TypeError('offline') }],
  ['the service says no', async () => ({ ok: false, status: 422, json: async () => ({}) }) as Response],
  ['the body is not JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('x') } }) as unknown as Response],
  ['there is no rate for the day', async () => ok([])],
])('gives null when %s, and does not remember it', async (_name, impl) => {
  const failing = vi.fn(impl) as unknown as typeof fetch
  expect(await fetchRate('AED', 'INR', '2026-11-06', { fetchImpl: failing })).toBeNull()
  const working = vi.fn(async () => ok(body))
  expect(await fetchRate('AED', 'INR', '2026-11-06', { fetchImpl: working })).toBe(25.635)
})

it('gives up after the timeout', async () => {
  const hanging = vi.fn((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
  expect(await fetchRate('AED', 'INR', '2026-11-06', { fetchImpl: hanging as unknown as typeof fetch, timeoutMs: 10 })).toBeNull()
})
