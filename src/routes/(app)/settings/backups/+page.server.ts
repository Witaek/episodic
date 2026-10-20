import { error, fail } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { createBackup, deleteBackup, listBackups } from '$lib/server/services/backup';
import type { Actions, PageServerLoad } from './$types';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(403, 'Only admins can manage backups.');
}

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return {
		backups: listBackups(),
		retentionDays: config().BACKUP_RETENTION_DAYS
	};
};

export const actions: Actions = {
	create: async ({ locals }) => {
		requireAdmin(locals);
		const backup = await createBackup({ manual: true });
		return { message: `Backup ${backup.name} created.` };
	},
	delete: async ({ locals, request }) => {
		requireAdmin(locals);
		const name = String((await request.formData()).get('name') ?? '');
		if (!deleteBackup(name)) return fail(404, { error: 'Backup not found.' });
		return { message: `Backup ${name} deleted.` };
	}
};
