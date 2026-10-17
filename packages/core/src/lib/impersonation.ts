const IMPERSONATOR_TOKEN_KEY = 'impersonatorToken';

export const startImpersonation = (impersonationToken: string) => {
  const currentToken = localStorage.getItem('token');
  if (currentToken && !localStorage.getItem(IMPERSONATOR_TOKEN_KEY)) {
    localStorage.setItem(IMPERSONATOR_TOKEN_KEY, currentToken);
  }
  localStorage.setItem('token', impersonationToken);
  localStorage.removeItem('activeTeamId');
  window.location.href = '/chat';
};

export const stopImpersonation = () => {
  const impersonatorToken = localStorage.getItem(IMPERSONATOR_TOKEN_KEY);
  localStorage.removeItem(IMPERSONATOR_TOKEN_KEY);
  localStorage.removeItem('activeTeamId');
  if (impersonatorToken) {
    localStorage.setItem('token', impersonatorToken);
    window.location.href = '/superadmin';
  } else {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
};
