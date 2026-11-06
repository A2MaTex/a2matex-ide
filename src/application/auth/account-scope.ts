export function accountScopeFromName(account: string) {
  const normalized = account.normalize('NFC').trim().toLowerCase();
  if (!normalized) throw new TypeError('account must not be empty');
  return `login:${normalized}`;
}
