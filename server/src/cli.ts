/**
 * Manutenção pela linha de comando (ex.: recuperar acesso quando não há outro administrador).
 *   node server/dist/cli.js reset-password <usuário>
 *   node server/dist/cli.js list-users
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { generateTempPassword, hashPassword } from './auth/passwords.js';
import { deleteUserSessions, type UserRow } from './auth/sessions.js';

const dataDir = process.env.DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const db = openDb(path.join(dataDir, 'rabbitflow.db'));
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'reset-password' && arg) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(arg) as UserRow | undefined;
  if (!user) {
    console.error(`Usuário "${arg}" não encontrado.`);
    process.exit(1);
  }
  const temp = generateTempPassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await hashPassword(temp), user.id);
  deleteUserSessions(db, user.id);
  console.log(`Senha temporária de "${user.username}": ${temp}\nEla precisa ser trocada no próximo login.`);
} else if (cmd === 'list-users') {
  const rows = db.prepare('SELECT username, is_admin FROM users ORDER BY username').all() as { username: string; is_admin: number }[];
  for (const u of rows) console.log(`${u.username}${u.is_admin ? ' (administrador)' : ''}`);
  if (!rows.length) console.log('Nenhum usuário. Abra o RabbitFlow no navegador para criar o administrador.');
} else {
  console.log('Uso:\n  cli reset-password <usuário>\n  cli list-users');
  process.exit(cmd ? 1 : 0);
}
