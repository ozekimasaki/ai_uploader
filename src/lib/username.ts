const RESERVED = new Set<string>([
  'admin','root','system','support','help','contact',
  'login','logout','signin','signout','signup','register','oauth','auth',
  'api','graphql','rest','docs','assets','static','cdn','cdn-cgi','ws','wss',
  'items','item','upload','downloads','search','tags','tag','users','user','u',
  'terms','privacy','policy','about','status','health','metrics'
]);

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateRandomUsername(length: number = 10): string {
  if (length !== 10) length = 10;
  const array = new Uint8Array(length);
  // @ts-ignore - crypto is available in Next.js/Workers runtime
  crypto.getRandomValues(array);
  let out = '';
  for (let i = 0; i < array.length; i++) {
    out += ALPHABET[array[i] % ALPHABET.length];
  }
  if (RESERVED.has(out)) {
    return generateRandomUsername(length);
  }
  return out;
}

export function isReservedUsername(name: string): boolean {
  return RESERVED.has(name.toLowerCase());
}


