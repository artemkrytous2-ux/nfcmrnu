const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateOwnerAccount(email: unknown, password: unknown) {
  if (typeof email !== "string" || typeof password !== "string") {
    return "Введите почту и пароль владельца";
  }
  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized) || normalized.length > 320) {
    return "Введите корректную почту владельца";
  }
  if (password.length < 8 || password.length > 72) {
    return "Пароль должен быть от 8 до 72 символов";
  }
  return { email: normalized };
}

export function isExistingAccountError(error: { message?: string; code?: string; status?: number }) {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("already exists")
  );
}
