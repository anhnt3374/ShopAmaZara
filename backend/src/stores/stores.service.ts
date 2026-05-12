import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './store.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  findByOwnerId(ownerId: string): Promise<Store | null> {
    return this.stores.findOne({ where: { ownerId } });
  }

  findById(id: string): Promise<Store | null> {
    return this.stores.findOne({ where: { id } });
  }
}
