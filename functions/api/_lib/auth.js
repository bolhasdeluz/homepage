// Verificação de identidade via token do Firebase Auth (Google Sign-In),
// igual ao padrão já usado no Pontos Cantados — em vez de senha compartilhada,
// confere de verdade quem é a pessoa por trás do token antes de liberar ações
// de admin.
const ADMIN_EMAILS = ['bolhasdeluz@gmail.com', 'annagomes.bdl@gmail.com'];

export function isAdmin(email) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function getUserFromRequest(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const apiKey = request.headers.get('x-firebase-api-key') || env.FIREBASE_API_KEY || '';
  if (apiKey) {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      if (res.ok) {
        const data = await res.json();
        const account = data.users?.[0];
        if (account) {
          return {
            id: account.localId || account.uid || '',
            email: account.email || '',
            name: account.displayName || '',
            picture: account.photoUrl || '',
          };
        }
      }
    } catch {}
  }

  const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (tokenInfoRes.ok) {
    const data = await tokenInfoRes.json();
    return {
      id: data.sub,
      email: data.email || '',
      name: data.name || data.given_name || '',
      picture: data.picture || '',
    };
  }

  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.sub,
    email: data.email || '',
    name: data.name || '',
    picture: data.picture || '',
  };
}

export async function requireAdmin(request, env) {
  const user = await getUserFromRequest(request, env);
  if (!user || !isAdmin(user.email)) return null;
  return user;
}
