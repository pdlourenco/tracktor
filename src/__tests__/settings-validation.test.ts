import { describe, expect, it } from 'vitest';
import { createSettingsConfigSchema } from '$lib/helper/settings-form.helper';
import * as m from '$lib/paraglide/messages';
import { setLocale } from '$lib/paraglide/runtime';

// Mirrors how the settings page builds the schema. The date-format and
// timezone validators are stubbed to always fail so their messages surface.
const schema = () =>
  createSettingsConfigSchema(
    m,
    () => ({ valid: false }),
    () => false,
    { includeNotificationProcessingSchedule: true }
  );

const base = {
  dateFormat: 'dd/MM/yyyy',
  locale: 'en',
  timezone: 'Europe/Lisbon',
  currency: 'EUR',
  unitOfDistance: 'kilometer',
  unitOfVolume: 'liter'
};

const messageFor = (data: Record<string, unknown>, path: string) => {
  const result = schema().safeParse(data);
  return result.success
    ? undefined
    : result.error.issues.find((i) => i.path.join('.') === path)?.message;
};

describe('settings validation messages', () => {
  it('localizes the empty-currency message', () => {
    expect(messageFor({ ...base, currency: '' }, 'currency')).toBe(
      m.settings_error_currency_required()
    );
  });

  it('localizes invalid enum options instead of leaking zod internals', () => {
    const message = messageFor({ ...base, unitOfLpg: 'litre' }, 'unitOfLpg');
    expect(message).toBe(m.settings_error_invalid_option());
    expect(message).not.toContain('Invalid option: expected one of');
  });

  it('localizes the date format and timezone refinements', () => {
    expect(messageFor(base, 'dateFormat')).toBe(m.settings_error_date_format_invalid());
    const timezone = messageFor(base, 'timezone');
    expect(timezone).toBe(m.settings_error_timezone_invalid());
    expect(timezone).not.toContain('timzone');
  });

  it('follows the active locale', async () => {
    await setLocale('de', { reload: false });
    try {
      const message = messageFor({ ...base, currency: '' }, 'currency');
      expect(message).toBe(m.settings_error_currency_required({}, { locale: 'de' }));
    } finally {
      await setLocale('en', { reload: false });
    }
  });
});
