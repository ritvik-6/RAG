const USER_ID_KEY = 'RAG_USER_ID';

export function getUserId() {
  if (!localStorage.getItem(USER_ID_KEY)) {
    localStorage.setItem(USER_ID_KEY, 'user_' + Math.random().toString(36).substr(2, 9));
  }
  return localStorage.getItem(USER_ID_KEY);
}
