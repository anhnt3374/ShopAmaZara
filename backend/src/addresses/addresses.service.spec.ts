import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserAddress } from './address.entity';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  let service: AddressesService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const manager = {
    update: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    create: jest.fn((_e: any, d: any) => d),
  };
  const ds = {
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
  } as unknown as DataSource;

  beforeEach(async () => {
    Object.values(repo).forEach((f) => (f as jest.Mock).mockReset());
    Object.values(manager).forEach((f) => (f as jest.Mock).mockReset());
    manager.create.mockImplementation((_e: any, d: any) => d);
    repo.create.mockImplementation((d: any) => d);

    const mod = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: DataSource, useValue: ds },
        { provide: getRepositoryToken(UserAddress), useValue: repo },
      ],
    }).compile();
    service = mod.get(AddressesService);
  });

  it('list returns default first', async () => {
    repo.find.mockResolvedValue([
      { id: '1', userId: 'u', isDefault: false, createdAt: new Date(2) },
      { id: '2', userId: 'u', isDefault: true, createdAt: new Date(1) },
    ]);
    const out = await service.list('u');
    expect(out.items[0].id).toBe('2');
  });

  it('first address auto-becomes default', async () => {
    manager.count.mockResolvedValue(0);
    manager.save.mockResolvedValue({ id: 'new', userId: 'u', isDefault: true });
    const out = await service.create('u', { label: 'H', recipientName: 'r', phone: 'p', line1: 'a', city: 'c', region: 'r', postalCode: 'p', country: 'co' } as any);
    expect(out.address.isDefault).toBe(true);
  });

  it('setting a new default unsets others atomically', async () => {
    manager.count.mockResolvedValue(1);
    manager.save.mockResolvedValue({ id: 'new', userId: 'u', isDefault: true });
    await service.create('u', { label: 'H', recipientName: 'r', phone: 'p', line1: 'a', city: 'c', region: 'r', postalCode: 'p', country: 'co', isDefault: true } as any);
    expect(manager.update).toHaveBeenCalledWith(UserAddress, { userId: 'u' }, { isDefault: false });
  });

  it('update throws Forbidden for other user', async () => {
    manager.findOne.mockResolvedValue({ id: '1', userId: 'other' });
    await expect(service.update('u', '1', { label: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delete promotes a remaining address if default was removed', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: '1', userId: 'u', isDefault: true })
      .mockResolvedValueOnce({ id: '2', userId: 'u', isDefault: false });
    manager.delete.mockResolvedValue({ affected: 1 });
    await service.remove('u', '1');
    expect(manager.update).toHaveBeenCalledWith(UserAddress, { id: '2' }, { isDefault: true });
  });

  it('delete throws NotFound when missing', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('u', '999')).rejects.toBeInstanceOf(NotFoundException);
  });
});
