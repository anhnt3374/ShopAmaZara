import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * One-time data fix for the duplicate-assistant-chat bug.
 *
 * Before ensureSystem was made race-safe, concurrent opens could create more
 * than one `kind='system'` conversation per buyer, splitting the assistant
 * history. This script collapses each buyer's system conversations into the
 * oldest one (MIN id): it re-points every message from the duplicates onto the
 * keeper, then deletes the now-empty duplicates.
 *
 * Idempotent — running it again is a no-op once each buyer has a single
 * system conversation.
 *
 * Run: npm run migrate:merge-system-chats   (from backend/)
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const ds = app.get(DataSource);

    const groups: Array<{ buyer_id: string; keeper: string; n: string }> =
      await ds.query(
        `SELECT buyer_id, MIN(id) AS keeper, COUNT(*) AS n
           FROM conversations
          WHERE kind = 'system'
          GROUP BY buyer_id
         HAVING COUNT(*) > 1`,
      );

    if (groups.length === 0) {
      console.log('No duplicate system conversations found. Nothing to do.');
      return;
    }

    console.log(`Found ${groups.length} buyer(s) with duplicate system chats.`);
    let mergedConvos = 0;
    let movedMessages = 0;

    for (const g of groups) {
      await ds.transaction(async (m) => {
        const dups: Array<{ id: string }> = await m.query(
          `SELECT id FROM conversations
            WHERE kind = 'system' AND buyer_id = ? AND id <> ?`,
          [g.buyer_id, g.keeper],
        );
        const dupIds = dups.map((d) => d.id);
        if (dupIds.length === 0) return;
        const placeholders = dupIds.map(() => '?').join(', ');

        const moved = await m.query(
          `UPDATE messages SET conversation_id = ?
            WHERE conversation_id IN (${placeholders})`,
          [g.keeper, ...dupIds],
        );
        await m.query(
          `DELETE FROM conversations WHERE id IN (${placeholders})`,
          dupIds,
        );

        mergedConvos += dupIds.length;
        movedMessages += moved.affectedRows ?? 0;
        console.log(
          `  buyer ${g.buyer_id}: kept ${g.keeper}, merged ${dupIds.length} duplicate(s)`,
        );
      });
    }

    console.log(
      `Done. Removed ${mergedConvos} duplicate conversation(s), moved ${movedMessages} message(s).`,
    );
  } finally {
    await app.close();
  }
}

// Exit explicitly: AppModule opens handles (e.g. the ioredis query-cache client)
// that aren't all closed by app.close(), which would otherwise hang the process.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
