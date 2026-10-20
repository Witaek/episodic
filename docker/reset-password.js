// Resets a user's password from the command line, e.g. when the only admin is locked out:
//   docker exec -it -u 1000:1000 episodic node reset-password.js <username> <new-password>
// The user is also re-enabled, made admin with --admin, and signed out everywhere.
import { hash } from '@node-rs/argon2';
import Database from 'better-sqlite3';

const [username, password, flag] = process.argv.slice(2);
if (!username || !password) {
	console.error('Usage: node reset-password.js <username> <new-password> [--admin]');
	process.exit(1);
}
if (password.length < 8) {
	console.error('Use a password of at least 8 characters.');
	process.exit(1);
}

const db = new Database(`${process.env.DATA_DIR ?? '/data'}/episodic.db`);
db.pragma('busy_timeout = 5000');
const user = db.prepare('select id from users where username = ?').get(username.toLowerCase());
if (!user) {
	const names = db
		.prepare('select username from users')
		.all()
		.map((u) => u.username);
	console.error(`No user "${username}". Existing users: ${names.join(', ') || '(none)'}`);
	process.exit(1);
}

db.prepare(
	`update users set password_hash = ?, disabled = 0${flag === '--admin' ? ", role = 'admin'" : ''} where id = ?`
).run(await hash(password), user.id);
db.prepare('delete from sessions where user_id = ?').run(user.id);
console.log(
	`Password for "${username}" was reset${flag === '--admin' ? ' and admin rights granted' : ''}.`
);
