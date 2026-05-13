import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export async function renameProcessingStatus(ds: DataSource): Promise<void> {
  const log = new Logger('OrderStatusRename');
  try {
    const res = await ds.query("UPDATE orders SET status = 'Paid' WHERE status = 'Processing'");
    const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
    if (affected > 0) log.log(`Renamed ${affected} order(s) Processing -> Paid`);
  } catch (err) {
    log.warn(`Skipping rename: ${(err as Error).message}`);
  }
}
