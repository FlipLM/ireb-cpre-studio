/**
 * Feature flag central do módulo RPG "Jornada do Herói".
 *
 * - Padrão: habilitado (`true`) enquanto `NEXT_PUBLIC_ENABLE_RPG_MODULE` não for explicitamente `'false'` ou `'0'`.
 * - Permite desativar completamente o módulo tanto na UI quanto nas rotas `/api/rpg/*` e `/rpg/*`
 *   sem afetar nenhuma funcionalidade tradicional do IREB CPRE Studio.
 */
export function isRpgModuleEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE;
  if (raw === undefined || raw === null || raw.trim() === '') {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
}
