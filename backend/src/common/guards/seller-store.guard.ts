import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Store } from '../../stores/store.entity';
import { StoresService } from '../../stores/stores.service';

interface RequestWithUserStore {
  user?: { id: string };
  store?: Store;
}

@Injectable()
export class SellerStoreGuard implements CanActivate {
  constructor(private readonly stores: StoresService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<RequestWithUserStore>();
    if (!req.user?.id) throw new ForbiddenException('Seller account required');
    const store = await this.stores.findByOwnerId(req.user.id);
    if (!store) throw new ForbiddenException('No store owned by this user');
    req.store = store;
    return true;
  }
}
