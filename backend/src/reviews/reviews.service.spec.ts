import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';
import { Review } from './review.entity';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviews: any;
  let orderItems: any;
  let users: any;
  let orderItemsQb: any;

  beforeEach(async () => {
    orderItemsQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
    };
    reviews = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      create: jest.fn((data) => data),
    };
    orderItems = {
      createQueryBuilder: jest.fn().mockReturnValue(orderItemsQb),
    };
    users = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: reviews },
        { provide: getRepositoryToken(OrderItem), useValue: orderItems },
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(User), useValue: users },
      ],
    }).compile();

    service = moduleRef.get(ReviewsService);
  });

  describe('canUserReview', () => {
    it('returns true when user has Delivered order containing product', async () => {
      orderItemsQb.getCount.mockResolvedValue(1);
      await expect(service.canUserReview('42', 'p-1')).resolves.toBe(true);
    });

    it('returns false when no Delivered order matches', async () => {
      orderItemsQb.getCount.mockResolvedValue(0);
      await expect(service.canUserReview('42', 'p-1')).resolves.toBe(false);
    });
  });

  describe('create', () => {
    const userId = '42';
    const productId = 'p-1';
    const dto = { rating: 5, comment: 'Great' };
    const dbReview = {
      id: 'r-1',
      productId,
      userId,
      rating: 5,
      comment: 'Great',
      createdAt: new Date('2026-05-14T10:00:00Z'),
      updatedAt: new Date('2026-05-14T10:00:00Z'),
    };

    it('creates review when user is eligible', async () => {
      orderItemsQb.getCount.mockResolvedValue(1);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh N.' });
      reviews.save.mockResolvedValue(dbReview);

      const result = await service.create(userId, productId, dto);

      expect(reviews.save).toHaveBeenCalledWith(
        expect.objectContaining({ productId, userId, rating: 5, comment: 'Great' }),
      );
      expect(result.user.name).toBe('Anh N.');
      expect(result.rating).toBe(5);
    });

    it('throws 403 when user is not eligible', async () => {
      orderItemsQb.getCount.mockResolvedValue(0);
      await expect(service.create(userId, productId, dto)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('throws 409 on duplicate (ER_DUP_ENTRY)', async () => {
      orderItemsQb.getCount.mockResolvedValue(1);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh N.' });
      const err: any = new Error('dup');
      err.code = 'ER_DUP_ENTRY';
      reviews.save.mockRejectedValue(err);

      await expect(service.create(userId, productId, dto)).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});
