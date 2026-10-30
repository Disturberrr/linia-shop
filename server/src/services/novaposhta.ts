import { config } from '../config.ts';
import { HttpError } from '../lib/http.ts';

/**
 * Довідники Нової пошти (офіційний API v2.0). Працює лише з NOVAPOSHTA_API_KEY.
 * Без ключа сервер повертає 501, а форма замовлення просить ввести місто та відділення вручну —
 * ніяких «вигаданих» відділень чи тарифів не показується.
 */
async function call(modelName: string, calledMethod: string, methodProperties: Record<string, unknown>) {
  if (!config.novaPoshtaKey) throw new HttpError(501, 'Довідник Нової пошти не підключено');
  let res: Response;
  try {
    res = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: config.novaPoshtaKey, modelName, calledMethod, methodProperties }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(502, 'Нова пошта зараз недоступна. Введіть дані вручну.');
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new HttpError(502, 'Нова пошта повернула помилку. Введіть дані вручну.');
  return json.data as any[];
}

export async function searchCities(q: string) {
  const data = await call('Address', 'searchSettlements', { CityName: q, Limit: '10' });
  const addresses: any[] = data[0]?.Addresses ?? [];
  return addresses.map((a) => ({ ref: a.DeliveryCity as string, name: a.Present as string }));
}

export async function searchWarehouses(cityRef: string, q: string) {
  const data = await call('Address', 'getWarehouses', { CityRef: cityRef, FindByString: q, Limit: '30', Language: 'UA' });
  return data.map((w) => ({ ref: w.Ref as string, name: w.Description as string, number: w.Number as string }));
}
