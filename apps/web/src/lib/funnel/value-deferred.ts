/** Marca negócios cujo valor só será conhecido após o fechamento. */

export function isValueDeferred(
  customFields: { value_deferred?: unknown } | Record<string, unknown> | null | undefined,
): boolean {
  if (!customFields || typeof customFields !== 'object') return false;
  return (customFields as { value_deferred?: unknown }).value_deferred === true;
}

export function hasKnownMonetaryValue(value: number | null | undefined): boolean {
  return (value ?? 0) > 0;
}

/** Falta de valor que exige ação de cadastro (exclui valor pós-fechamento). */
export function isMissingActionableValue(
  value: number | null | undefined,
  customFields: { value_deferred?: unknown } | Record<string, unknown> | null | undefined,
): boolean {
  return !hasKnownMonetaryValue(value) && !isValueDeferred(customFields);
}
