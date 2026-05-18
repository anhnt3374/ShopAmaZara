import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentBlocksToMessages1716163000000 implements MigrationInterface {
  name = 'AddContentBlocksToMessages1716163000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE messages MODIFY body TEXT NULL`);
    await qr.query(`ALTER TABLE messages ADD COLUMN content_blocks JSON NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE messages DROP COLUMN content_blocks`);
    await qr.query(`ALTER TABLE messages MODIFY body TEXT NOT NULL`);
  }
}
