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
});
