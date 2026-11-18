export const readToken = (cookie?: string) =>
  cookie
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('lumiere_session='))
    ?.slice(16);
