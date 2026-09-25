import type { Request, Response } from 'express';

export type Lang = 'pt-BR' | 'en' | 'es';
export const LANGS: Lang[] = ['pt-BR', 'en', 'es'];

const pt = {
  'err.loginRequired': 'Faça login para continuar.',
  'err.passwordChangeRequired': 'Troque sua senha temporária para continuar.',
  'err.adminOnly': 'Apenas administradores podem fazer isso.',
  'err.readOnly': 'O RabbitFlow é somente leitura no RabbitMQ.',
  'err.jsonRequired': 'Envie JSON (Content-Type: application/json).',
  'err.originNotAllowed': 'Origem não permitida.',
  'err.invalidJson': 'JSON inválido.',
  'err.internal': 'Erro interno.',
  'err.routeNotFound': 'Rota não encontrada.',
  'err.passwordRequired': 'Informe a senha.',
  'err.passwordTooShort': 'A senha precisa ter pelo menos 8 caracteres.',
  'err.passwordTooLong': 'A senha pode ter no máximo 200 caracteres.',
  'err.usernameInvalid': 'O usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.',
  'err.alreadySetUp': 'O RabbitFlow já foi configurado. Faça login.',
  'err.credentialsRequired': 'Informe usuário e senha.',
  'err.tooManyAttempts': 'Muitas tentativas. Tente de novo em {minutes} min.',
  'err.invalidCredentials': 'Usuário ou senha inválidos.',
  'err.wrongPassword': 'A senha atual está incorreta.',
  'err.samePassword': 'A nova senha precisa ser diferente da atual.',
  'err.invalidLanguage': 'Idioma inválido.',
  'err.userNotFound': 'Usuário não encontrado.',
  'err.userExists': 'Já existe um usuário "{name}".',
  'err.useChangePassword': 'Para a sua própria conta, use "Alterar senha".',
  'err.isAdminRequired': 'Informe isAdmin.',
  'err.lastAdmin': 'Precisa existir pelo menos um administrador.',
  'err.cannotDeleteSelf': 'Você não pode remover a própria conta.',
  'err.vhostRequired': 'Informe o vhost.',
  'err.connectionRequired': 'Informe a conexão.',
  'err.connectionNotFound': 'Conexão não encontrada.',
  'err.positionsRequired': 'Envie positions.',
  'err.tooManyNodes': 'Nós demais.',
  'err.invalidPosition': 'Posição inválida para "{id}".',
  'err.invalidViewport': 'Enquadramento inválido.',
  'err.apiUrlRequired': 'Informe a URL da Management API.',
  'err.apiUrlInvalid': 'URL inválida. Exemplo: http://rabbitmq:15672',
  'err.apiUrlScheme': 'Use uma URL http:// ou https://.',
  'err.apiUrlCredentials': 'Informe usuário e senha nos campos próprios, não na URL.',
  'err.connectionNameRequired': 'Informe o nome.',
  'err.connectionNameTooLong': 'Nome muito longo.',
  'err.connectionUserRequired': 'Informe o usuário.',
  'err.connectionUserTooLong': 'Usuário muito longo.',
  'err.connectionExists': 'Já existe uma conexão "{name}".',
  'err.secretUnreadable':
    'Não foi possível ler a senha salva desta conexão (a chave RABBITFLOW_SECRET_KEY mudou?). Edite a conexão e informe a senha de novo.',
  'rabbit.unreachable': 'Não foi possível conectar em {url}: {reason}',
  'rabbit.reason.timeout': 'tempo esgotado (10 s)',
  'rabbit.reason.refused': 'conexão recusada (o RabbitMQ está no ar? a porta é a do management, normalmente 15672)',
  'rabbit.reason.notFound': 'endereço não encontrado (confira o host)',
  'rabbit.auth': 'O RabbitMQ recusou o usuário ou a senha da conexão.',
  'rabbit.httpError': 'RabbitMQ respondeu {status} em {path}.',
  'rabbit.redirect': 'A URL respondeu com redirecionamento ({status}). Informe o endereço direto da Management API.',
  'rabbit.notRabbit': 'A URL respondeu, mas não parece ser a Management API do RabbitMQ.',
  'err.layoutTooLarge': 'Layout grande demais para salvar.',
};

export type MsgKey = keyof typeof pt;

const en: Record<MsgKey, string> = {
  'err.loginRequired': 'Log in to continue.',
  'err.passwordChangeRequired': 'Change your temporary password to continue.',
  'err.adminOnly': 'Only administrators can do this.',
  'err.readOnly': 'RabbitFlow is read-only on RabbitMQ.',
  'err.jsonRequired': 'Send JSON (Content-Type: application/json).',
  'err.originNotAllowed': 'Origin not allowed.',
  'err.invalidJson': 'Invalid JSON.',
  'err.internal': 'Internal error.',
  'err.routeNotFound': 'Route not found.',
  'err.passwordRequired': 'Enter the password.',
  'err.passwordTooShort': 'The password must have at least 8 characters.',
  'err.passwordTooLong': 'The password can have at most 200 characters.',
  'err.usernameInvalid': 'The username must have 3 to 32 characters: letters, numbers, dot, hyphen or underscore.',
  'err.alreadySetUp': 'RabbitFlow is already set up. Please log in.',
  'err.credentialsRequired': 'Enter username and password.',
  'err.tooManyAttempts': 'Too many attempts. Try again in {minutes} min.',
  'err.invalidCredentials': 'Invalid username or password.',
  'err.wrongPassword': 'The current password is incorrect.',
  'err.samePassword': 'The new password must be different from the current one.',
  'err.invalidLanguage': 'Invalid language.',
  'err.userNotFound': 'User not found.',
  'err.userExists': 'A user "{name}" already exists.',
  'err.useChangePassword': 'For your own account, use "Change password".',
  'err.isAdminRequired': 'Provide isAdmin.',
  'err.lastAdmin': 'There must be at least one administrator.',
  'err.cannotDeleteSelf': 'You cannot remove your own account.',
  'err.vhostRequired': 'Provide the vhost.',
  'err.connectionRequired': 'Provide the connection.',
  'err.connectionNotFound': 'Connection not found.',
  'err.positionsRequired': 'Send positions.',
  'err.tooManyNodes': 'Too many nodes.',
  'err.invalidPosition': 'Invalid position for "{id}".',
  'err.invalidViewport': 'Invalid viewport.',
  'err.apiUrlRequired': 'Enter the Management API URL.',
  'err.apiUrlInvalid': 'Invalid URL. Example: http://rabbitmq:15672',
  'err.apiUrlScheme': 'Use an http:// or https:// URL.',
  'err.apiUrlCredentials': 'Enter username and password in their own fields, not in the URL.',
  'err.connectionNameRequired': 'Enter the name.',
  'err.connectionNameTooLong': 'Name too long.',
  'err.connectionUserRequired': 'Enter the username.',
  'err.connectionUserTooLong': 'Username too long.',
  'err.connectionExists': 'A connection "{name}" already exists.',
  'err.secretUnreadable':
    'Could not read the saved password of this connection (did RABBITFLOW_SECRET_KEY change?). Edit the connection and enter the password again.',
  'rabbit.unreachable': 'Could not connect to {url}: {reason}',
  'rabbit.reason.timeout': 'timed out (10 s)',
  'rabbit.reason.refused': 'connection refused (is RabbitMQ up? use the management port, usually 15672)',
  'rabbit.reason.notFound': 'address not found (check the host)',
  'rabbit.auth': 'RabbitMQ rejected the connection username or password.',
  'rabbit.httpError': 'RabbitMQ answered {status} on {path}.',
  'rabbit.redirect': 'The URL answered with a redirect ({status}). Enter the direct Management API address.',
  'rabbit.notRabbit': 'The URL answered, but it does not look like the RabbitMQ Management API.',
  'err.layoutTooLarge': 'Layout too large to save.',
};

const es: Record<MsgKey, string> = {
  'err.loginRequired': 'Inicia sesión para continuar.',
  'err.passwordChangeRequired': 'Cambia tu contraseña temporal para continuar.',
  'err.adminOnly': 'Solo los administradores pueden hacer esto.',
  'err.readOnly': 'RabbitFlow es de solo lectura en RabbitMQ.',
  'err.jsonRequired': 'Envía JSON (Content-Type: application/json).',
  'err.originNotAllowed': 'Origen no permitido.',
  'err.invalidJson': 'JSON inválido.',
  'err.internal': 'Error interno.',
  'err.routeNotFound': 'Ruta no encontrada.',
  'err.passwordRequired': 'Ingresa la contraseña.',
  'err.passwordTooShort': 'La contraseña debe tener al menos 8 caracteres.',
  'err.passwordTooLong': 'La contraseña puede tener como máximo 200 caracteres.',
  'err.usernameInvalid': 'El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.',
  'err.alreadySetUp': 'RabbitFlow ya está configurado. Inicia sesión.',
  'err.credentialsRequired': 'Ingresa usuario y contraseña.',
  'err.tooManyAttempts': 'Demasiados intentos. Intenta de nuevo en {minutes} min.',
  'err.invalidCredentials': 'Usuario o contraseña inválidos.',
  'err.wrongPassword': 'La contraseña actual es incorrecta.',
  'err.samePassword': 'La nueva contraseña debe ser diferente de la actual.',
  'err.invalidLanguage': 'Idioma inválido.',
  'err.userNotFound': 'Usuario no encontrado.',
  'err.userExists': 'Ya existe un usuario "{name}".',
  'err.useChangePassword': 'Para tu propia cuenta, usa "Cambiar contraseña".',
  'err.isAdminRequired': 'Indica isAdmin.',
  'err.lastAdmin': 'Debe existir al menos un administrador.',
  'err.cannotDeleteSelf': 'No puedes eliminar tu propia cuenta.',
  'err.vhostRequired': 'Indica el vhost.',
  'err.connectionRequired': 'Indica la conexión.',
  'err.connectionNotFound': 'Conexión no encontrada.',
  'err.positionsRequired': 'Envía positions.',
  'err.tooManyNodes': 'Demasiados nodos.',
  'err.invalidPosition': 'Posición inválida para "{id}".',
  'err.invalidViewport': 'Encuadre inválido.',
  'err.apiUrlRequired': 'Ingresa la URL de la Management API.',
  'err.apiUrlInvalid': 'URL inválida. Ejemplo: http://rabbitmq:15672',
  'err.apiUrlScheme': 'Usa una URL http:// o https://.',
  'err.apiUrlCredentials': 'Ingresa usuario y contraseña en sus propios campos, no en la URL.',
  'err.connectionNameRequired': 'Ingresa el nombre.',
  'err.connectionNameTooLong': 'Nombre demasiado largo.',
  'err.connectionUserRequired': 'Ingresa el usuario.',
  'err.connectionUserTooLong': 'Usuario demasiado largo.',
  'err.connectionExists': 'Ya existe una conexión "{name}".',
  'err.secretUnreadable':
    'No se pudo leer la contraseña guardada de esta conexión (¿cambió RABBITFLOW_SECRET_KEY?). Edita la conexión e ingresa la contraseña de nuevo.',
  'rabbit.unreachable': 'No se pudo conectar a {url}: {reason}',
  'rabbit.reason.timeout': 'tiempo agotado (10 s)',
  'rabbit.reason.refused': 'conexión rechazada (¿RabbitMQ está activo? usa el puerto del management, normalmente 15672)',
  'rabbit.reason.notFound': 'dirección no encontrada (revisa el host)',
  'rabbit.auth': 'RabbitMQ rechazó el usuario o la contraseña de la conexión.',
  'rabbit.httpError': 'RabbitMQ respondió {status} en {path}.',
  'rabbit.redirect': 'La URL respondió con una redirección ({status}). Ingresa la dirección directa de la Management API.',
  'rabbit.notRabbit': 'La URL respondió, pero no parece ser la Management API de RabbitMQ.',
  'err.layoutTooLarge': 'Layout demasiado grande para guardar.',
};

const bundles: Record<Lang, Record<MsgKey, string>> = { 'pt-BR': pt, en, es };

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as string[]).includes(v);

export function translate(lang: Lang, key: MsgKey, vars: Record<string, string | number> = {}): string {
  const msg = bundles[lang][key] ?? pt[key] ?? key;
  return msg.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Idioma da resposta: o da interface (cabeçalho), senão o da conta, senão o Accept-Language */
export function langOf(req: Request, res?: Response): Lang {
  const header = req.headers['x-rabbitflow-lang'];
  if (isLang(header)) return header;
  const userLang = (res?.locals.user as { language?: string | null } | null | undefined)?.language;
  if (isLang(userLang)) return userLang;
  const accept = String(req.headers['accept-language'] ?? '').toLowerCase();
  if (accept.startsWith('en')) return 'en';
  if (accept.startsWith('es')) return 'es';
  return 'pt-BR';
}

export { bundles as serverBundles };
