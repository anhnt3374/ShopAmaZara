import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';

type RepoMock = Partial<Record<keyof Repository<User>, jest.Mock>>;

function makeRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    create: jest.fn((dto) => dto as User),
    save: jest.fn(),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let repo: RepoMock;

  beforeEach(async () => {
    repo = makeRepoMock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('persists the user with normalized email', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      (repo.save as jest.Mock).mockImplementation((u) => ({ ...u, id: '1' }));

      const created = await service.create({
        email: '  Jane@Example.COM ',
        passwordHash: 'hashed',
        fullName: 'Jane Doe',
        role: 'buyer',
      });

      expect(created.email).toBe('jane@example.com');
      expect(repo.create).toHaveBeenCalledWith({
        email: 'jane@example.com',
        passwordHash: 'hashed',
        fullName: 'Jane Doe',
        role: 'buyer',
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('throws ConflictException when email already exists', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue({ id: '1' } as unknown as User);
      await expect(
        service.create({
          email: 'jane@example.com',
          passwordHash: 'hashed',
          fullName: 'Jane Doe',
          role: 'buyer',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('updates only provided fields and trims fullName', async () => {
      const existing = {
        id: '1',
        email: 'a@b.c',
        fullName: 'Old',
        role: 'buyer',
        phone: null,
        avatarUrl: null,
        biography: null,
        preferredLanguage: 'en',
      } as unknown as User;
      (repo.findOne as jest.Mock).mockResolvedValue(existing);
      (repo.save as jest.Mock).mockImplementation((u) => ({ ...existing, ...u }));

      const out = await service.updateProfile('1', {
        fullName: '  New Name  ',
        phone: '+1 555',
      });

      expect(out.fullName).toBe('New Name');
      expect(out.phone).toBe('+1 555');
      expect(out.biography).toBeNull();
    });

    it('throws NotFound when user does not exist', async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.updateProfile('1', { fullName: 'x' })).rejects.toThrow();
    });
  });
});
