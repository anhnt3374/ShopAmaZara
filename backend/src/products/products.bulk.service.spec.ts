import { ProductsBulkService } from './products.bulk.service';

describe('ProductsBulkService.parseCsvBuffer', () => {
  let service: ProductsBulkService;
  beforeEach(() => {
    service = new ProductsBulkService();
  });

  it('parses a valid CSV', () => {
    const csv = Buffer.from(
      'name,sku,category,price,stock\nA,NX-A,cat,10,5\nB,,cat,20,2\n',
    );
    const out = service.parseCsvBuffer(csv);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ name: 'A', sku: 'NX-A', price: '10' });
    expect(out[1].sku).toBe('');
  });

  it('matches headers case-insensitively', () => {
    const csv = Buffer.from('Name,SKU,Category,Price,Stock\nX,X1,c,1,1\n');
    const out = service.parseCsvBuffer(csv);
    expect(out[0]).toMatchObject({ name: 'X', sku: 'X1', category: 'c' });
  });

  it('ignores trailing empty rows', () => {
    const csv = Buffer.from('name,sku,category,price,stock\nA,NX-A,c,1,1\n\n');
    const out = service.parseCsvBuffer(csv);
    expect(out.length).toBe(1);
  });
});

describe('ProductsBulkService.validateRows', () => {
  let service: ProductsBulkService;
  beforeEach(() => {
    service = new ProductsBulkService();
  });

  it('rejects rows missing name', () => {
    const result = service.validateRows([
      { name: '', sku: 'A', category: 'c', price: '10', stock: '1' },
      { name: 'B', sku: 'B', category: 'c', price: '20', stock: '2' },
    ]);
    expect(result.valid.length).toBe(1);
    expect(result.skipped).toEqual([{ row: 1, reason: 'Missing name' }]);
  });

  it('rejects invalid price/stock', () => {
    const result = service.validateRows([
      { name: 'A', sku: 'A', category: 'c', price: 'abc', stock: '1' },
      { name: 'B', sku: 'B', category: 'c', price: '10', stock: 'xyz' },
    ]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'Invalid price',
      'Invalid stock',
    ]);
  });

  it('rejects duplicate SKU within the upload', () => {
    const result = service.validateRows([
      { name: 'A', sku: 'DUP', category: 'c', price: '10', stock: '1' },
      { name: 'B', sku: 'DUP', category: 'c', price: '20', stock: '2' },
    ]);
    expect(result.valid.length).toBe(1);
    expect(result.skipped[0]).toMatchObject({ row: 2, reason: 'Duplicate SKU' });
  });

  it('rejects salePrice >= price', () => {
    const result = service.validateRows([
      { name: 'A', sku: 'A', category: 'c', price: '10', stock: '1', saleprice: '10' },
    ]);
    expect(result.valid.length).toBe(0);
    expect(result.skipped[0].reason).toBe('Sale price not less than price');
  });
});
