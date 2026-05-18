import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { Store } from '../stores/store.entity';

describe('ChatsService', () => {
  let service: ChatsService;
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    query: jest.fn(),
    create: jest.fn((_e: any, d: any) => d),
  };
  const ds = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;
  const convoRepo: any = { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
  const messageRepo: any = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const storesRepo: any = { findOne: jest.fn() };

  beforeEach(async () => {
    [manager, convoRepo, messageRepo, storesRepo].forEach((o: any) =>
      Object.values(o).forEach((f: any) => (f as jest.Mock).mockReset?.()),
    );
    manager.create.mockImplementation((_e: any, d: any) => d);
    const mod = await Test.createTestingModule({
      providers: [
        ChatsService,
        { provide: DataSource, useValue: ds },
        { provide: getRepositoryToken(Conversation), useValue: convoRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: getRepositoryToken(Store), useValue: storesRepo },
      ],
    }).compile();
    service = mod.get(ChatsService);
  });

  describe('ensureSystem', () => {
    it('returns existing system conversation when present', async () => {
      manager.findOne.mockResolvedValue({ id: '1', kind: 'system', buyerId: 'u' });
      const out = await service.ensureSystem('u');
      expect(out.id).toBe('1');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('creates one when missing', async () => {
      manager.findOne.mockResolvedValue(null);
      manager.save.mockResolvedValue({ id: '99', kind: 'system', buyerId: 'u' });
      const out = await service.ensureSystem('u');
      expect(out.id).toBe('99');
      expect(manager.save).toHaveBeenCalled();
    });
  });

  describe('ensureStore', () => {
    it('throws NotFound when store does not exist', async () => {
      storesRepo.findOne.mockResolvedValue(null);
      await expect(service.ensureStore('u', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns existing conversation', async () => {
      storesRepo.findOne.mockResolvedValue({ id: 's1' });
      manager.findOne.mockResolvedValue({ id: '5', kind: 'store', buyerId: 'u', storeId: 's1' });
      const out = await service.ensureStore('u', 's1');
      expect(out.id).toBe('5');
    });
  });

  describe('sendBuyerMessage', () => {
    it('inserts buyer message and bumps conversation.updated_at', async () => {
      manager.findOne.mockResolvedValue({ id: '5', kind: 'store', buyerId: 'u', storeId: 's1' });
      manager.save.mockImplementation(async (m: any) => ({ ...m, id: 'msg-1', createdAt: new Date() }));
      const out = await service.sendBuyerMessage('u', '5', 'hi');
      expect(out.messages.length).toBe(1);
      expect(out.messages[0].senderKind).toBe('buyer');
      expect(manager.update).toHaveBeenCalled();
    });

    it('also inserts a system echo for kind=system', async () => {
      manager.findOne.mockResolvedValue({ id: '7', kind: 'system', buyerId: 'u', storeId: null });
      manager.save
        .mockResolvedValueOnce({ id: 'msg-1', senderKind: 'buyer', body: 'hi', createdAt: new Date() })
        .mockResolvedValueOnce({ id: 'msg-2', senderKind: 'system', body: 'Thanks, we received your message: hi', createdAt: new Date() });
      const out = await service.sendBuyerMessage('u', '7', 'hi');
      expect(out.messages.length).toBe(2);
      expect(out.messages[0].senderKind).toBe('buyer');
      expect(out.messages[1].senderKind).toBe('system');
      expect((out.messages[1].body ?? '')).toContain('hi');
    });

    it('403 for another buyer', async () => {
      manager.findOne.mockResolvedValue({ id: '5', kind: 'store', buyerId: 'other', storeId: 's1' });
      await expect(service.sendBuyerMessage('u', '5', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('sendStoreMessage', () => {
    it('403 for foreign store', async () => {
      manager.findOne.mockResolvedValue({ id: '5', kind: 'store', buyerId: 'u', storeId: 's1' });
      await expect(service.sendStoreMessage('s2', '5', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('markRead', () => {
    it('updates buyerLastReadAt for buyer party', async () => {
      manager.findOne.mockResolvedValue({ id: '5', buyerId: 'u', storeId: 's1', kind: 'store' });
      await service.markRead('5', { party: 'buyer', userId: 'u' });
      expect(manager.update).toHaveBeenCalled();
    });
  });
});
