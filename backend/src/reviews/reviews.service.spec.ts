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

  describe('update', () => {
    const dbReview = {
      id: 'r-1', productId: 'p-1', userId: '42', rating: 4, comment: 'x',
      createdAt: new Date('2026-05-14T10:00:00Z'), updatedAt: new Date('2026-05-14T10:00:00Z'),
    };

    it('updates when caller is owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh' });
      reviews.save.mockResolvedValue({ ...dbReview, rating: 5, comment: 'better' });

      const result = await service.update('r-1', '42', { rating: 5, comment: 'better' });
      expect(result.rating).toBe(5);
      expect(result.comment).toBe('better');
    });

    it('throws 404 when review missing', async () => {
      reviews.findOne.mockResolvedValue(null);
      await expect(service.update('r-x', '42', { rating: 5 })).rejects.toMatchObject({ status: 404 });
    });

    it('throws 403 when caller is not owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      await expect(service.update('r-1', '99', { rating: 5 })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('remove', () => {
    const dbReview = { id: 'r-1', productId: 'p-1', userId: '42' };

    it('removes when caller is owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      reviews.remove.mockResolvedValue(undefined);
      await service.remove('r-1', '42');
      expect(reviews.remove).toHaveBeenCalledWith(dbReview);
    });

    it('throws 404 when review missing', async () => {
      reviews.findOne.mockResolvedValue(null);
      await expect(service.remove('r-x', '42')).rejects.toMatchObject({ status: 404 });
    });

    it('throws 403 when caller is not owner', async () => {
      reviews.findOne.mockResolvedValue(dbReview);
      await expect(service.remove('r-1', '99')).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('listForProduct', () => {
    it('returns paginated items, summary and breakdown', async () => {
      const listQb: any = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'r-1', productId: 'p-1', userId: '42', rating: 5, comment: 'a', createdAt: new Date(), updatedAt: new Date() }],
          1,
        ]),
      };
      const summaryQb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { rating: '5', cnt: '3' },
          { rating: '4', cnt: '1' },
        ]),
      };
      reviews.createQueryBuilder = jest.fn()
        .mockImplementationOnce(() => listQb)
        .mockImplementationOnce(() => summaryQb);
      users.find = jest.fn().mockResolvedValue([{ id: '42', fullName: 'Anh' }]);

      const out = await service.listForProduct('p-1', { page: 1, limit: 10 });

      expect(out.total).toBe(1);
      expect(out.items).toHaveLength(1);
      expect(out.summary.count).toBe(4);
      expect(out.summary.average).toBeCloseTo((5 * 3 + 4 * 1) / 4, 1);
      expect(out.summary.breakdown['5']).toBe(3);
      expect(out.summary.breakdown['1']).toBe(0);
    });
  });

  describe('myReviewForProduct', () => {
    it('returns review + canReview=false when review exists', async () => {
      const review = {
        id: 'r-1', productId: 'p-1', userId: '42', rating: 5, comment: 'a',
        createdAt: new Date(), updatedAt: new Date(),
      };
      reviews.findOne.mockResolvedValue(review);
      users.findOne.mockResolvedValue({ id: '42', fullName: 'Anh' });

      const out = await service.myReviewForProduct('42', 'p-1');
      expect(out.review?.id).toBe('r-1');
      expect(out.canReview).toBe(false);
    });

    it('returns null review + canReview=true when no review and eligible', async () => {
      reviews.findOne.mockResolvedValue(null);
      orderItemsQb.getCount.mockResolvedValue(1);

      const out = await service.myReviewForProduct('42', 'p-1');
      expect(out.review).toBeNull();
      expect(out.canReview).toBe(true);
    });

    it('returns null review + canReview=false when no review and not eligible', async () => {
      reviews.findOne.mockResolvedValue(null);
      orderItemsQb.getCount.mockResolvedValue(0);

      const out = await service.myReviewForProduct('42', 'p-1');
      expect(out.review).toBeNull();
      expect(out.canReview).toBe(false);
    });
  });
});
