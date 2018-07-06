export function formatMoney(number, currency) {
  const currencyFormatter = new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency,
  });

  return currencyFormatter.format(number);
}
