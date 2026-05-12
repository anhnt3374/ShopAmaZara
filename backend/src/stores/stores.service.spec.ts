import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './store.entity';
import { StoresService } from './stores.service';

describe('StoresService', () => {
  let service: StoresService;
  let repo: jest.Mocked<Repository<Store>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StoresService,
        {
          provide: getRepositoryToken(Store),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StoresService);
    repo = moduleRef.get(getRepositoryToken(Store));
  });

  describe('findByOwnerId', () => {
    it('returns the store owned by the user', async () => {
      const store = { id: 's1', name: 'Test', slug: 'test', ownerId: '7' } as Store;
      repo.findOne.mockResolvedValue(store);
      const result = await service.findByOwnerId('7');
      expect(result).toBe(store);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { ownerId: '7' } });
    });

    it('returns null when the user owns no store', async () => {
      repo.findOne.mockResolvedValue(null);
      const result = await service.findByOwnerId('99');
      expect(result).toBeNull();
    });
  });
});
