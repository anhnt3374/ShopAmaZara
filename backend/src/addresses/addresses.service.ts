import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserAddress } from './address.entity';

type AddressView = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
};

function toView(a: UserAddress): AddressView {
  return {
    id: String(a.id),
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    region: a.region,
    postalCode: a.postalCode,
    country: a.country,
    isDefault: Boolean(a.isDefault),
    createdAt: a.createdAt,
  };
}

@Injectable()
export class AddressesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(UserAddress)
    private readonly repo: Repository<UserAddress>,
  ) {}

  async list(userId: string) {
    const rows = await this.repo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    const sorted = [...rows].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return { items: sorted.map(toView) };
  }

  async create(userId: string, dto: Partial<UserAddress> & { isDefault?: boolean }) {
    return this.ds.transaction(async (m) => {
      const existing = await m.count(UserAddress, { where: { userId } });
      const makeDefault = existing === 0 ? true : Boolean(dto.isDefault);
      if (makeDefault) {
        await m.update(UserAddress, { userId }, { isDefault: false });
      }
      const entity = m.create(UserAddress, {
        userId,
        label: dto.label!,
        recipientName: dto.recipientName!,
        phone: dto.phone!,
        line1: dto.line1!,
        line2: dto.line2 ?? null,
        city: dto.city!,
        region: dto.region!,
        postalCode: dto.postalCode!,
        country: dto.country!,
        isDefault: makeDefault,
      });
      const saved = await m.save(entity);
      return { address: toView(saved as UserAddress) };
    });
  }

  async update(userId: string, id: string, dto: Partial<UserAddress>) {
    return this.ds.transaction(async (m) => {
      const current = await m.findOne(UserAddress, { where: { id } });
      if (!current) throw new NotFoundException('Address not found');
      if (current.userId !== userId) throw new ForbiddenException('Not your address');
      if (dto.isDefault === true && !current.isDefault) {
        await m.update(UserAddress, { userId }, { isDefault: false });
      }
      Object.assign(current, {
        label: dto.label ?? current.label,
        recipientName: dto.recipientName ?? current.recipientName,
        phone: dto.phone ?? current.phone,
        line1: dto.line1 ?? current.line1,
        line2: dto.line2 === undefined ? current.line2 : dto.line2,
        city: dto.city ?? current.city,
        region: dto.region ?? current.region,
        postalCode: dto.postalCode ?? current.postalCode,
        country: dto.country ?? current.country,
        isDefault: dto.isDefault === undefined ? current.isDefault : dto.isDefault,
      });
      const saved = await m.save(current);
      return { address: toView(saved) };
    });
  }

  async remove(userId: string, id: string) {
    return this.ds.transaction(async (m) => {
      const target = await m.findOne(UserAddress, { where: { id } });
      if (!target) throw new NotFoundException('Address not found');
      if (target.userId !== userId) throw new ForbiddenException('Not your address');
      const wasDefault = target.isDefault;
      await m.delete(UserAddress, { id });
      if (wasDefault) {
        const next = await m.findOne(UserAddress, {
          where: { userId },
          order: { createdAt: 'DESC' },
        });
        if (next) await m.update(UserAddress, { id: next.id }, { isDefault: true });
      }
      return { ok: true };
    });
  }

  async findOneOwned(userId: string, id: string): Promise<UserAddress> {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Address not found');
    if (a.userId !== userId) throw new ForbiddenException('Not your address');
    return a;
  }
}
