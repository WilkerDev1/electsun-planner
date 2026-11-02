export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Valida contraseña y confirmación (AUT-03, AUT-05): de 12 a 128 caracteres y coincidentes. */
export function passwordErrors(password: string, confirm: string): { password?: string; confirm?: string } {
  const out: { password?: string; confirm?: string } = {};
  if (password.length < PASSWORD_MIN) out.password = `Usa al menos ${PASSWORD_MIN} caracteres (ahora tienes ${password.length}).`;
  else if (password.length > PASSWORD_MAX) out.password = `Usa como máximo ${PASSWORD_MAX} caracteres.`;
  if (confirm !== password) out.confirm = "Las contraseñas no coinciden.";
  return out;
}
