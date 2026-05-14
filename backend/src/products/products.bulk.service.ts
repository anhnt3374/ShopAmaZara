import { Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface ParsedRow {
  name?: string;
  sku?: string;
  category?: string;
  price?: string;
  stock?: string;
  brand?: string;
  saleprice?: string;
  model?: string;
  description?: string;
  imageurl?: string;
  ispublished?: string;
  [k: string]: string | undefined;
}

export interface ValidRow {
  name: string;
  sku: string | null;
  category: string;
  price: number;
  stock: number;
  brand: string;
  salePrice: number | null;
  model: string | null;
  description: string | null;
  imageUrl: string | null;
  isPublished: boolean;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export const MAX_ROWS = 500;

@Injectable()
export class ProductsBulkService {
  parseCsvBuffer(buffer: Buffer): ParsedRow[] {
    const rows: Record<string, string>[] = parseCsv(buffer, {
      columns: (header: string[]) => header.map((h) => h.toLowerCase().trim()),
      skip_empty_lines: true,
      trim: true,
    });
    return rows;
  }

  parseXlsxBuffer(buffer: Buffer): ParsedRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    const sheet = wb.Sheets[firstSheet];
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
    });
    return raw.map((row) => {
      const out: ParsedRow = {};
      for (const [k, v] of Object.entries(row)) {
        out[k.toLowerCase().trim()] = String(v ?? '').trim();
      }
      return out;
    });
  }

  validateRows(rows: ParsedRow[]): { valid: ValidRow[]; skipped: SkippedRow[] } {
    const valid: ValidRow[] = [];
    const skipped: SkippedRow[] = [];
    const seenSkus = new Set<string>();
    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const name = (row.name ?? '').trim();
      if (!name) {
        skipped.push({ row: rowNum, reason: 'Missing name' });
        return;
      }
      const price = Number(row.price);
      if (!Number.isFinite(price) || price < 0) {
        skipped.push({ row: rowNum, reason: 'Invalid price' });
        return;
      }
      const stock = Number(row.stock);
      if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
        skipped.push({ row: rowNum, reason: 'Invalid stock' });
        return;
      }
      const salePriceRaw = (row.saleprice ?? '').trim();
      let salePrice: number | null = null;
      if (salePriceRaw) {
        const n = Number(salePriceRaw);
        if (!Number.isFinite(n) || n < 0) {
          skipped.push({ row: rowNum, reason: 'Invalid sale price' });
          return;
        }
        if (n >= price) {
          skipped.push({ row: rowNum, reason: 'Sale price not less than price' });
          return;
        }
        salePrice = n;
      }
      const sku = (row.sku ?? '').trim() || null;
      if (sku) {
        if (seenSkus.has(sku)) {
          skipped.push({ row: rowNum, reason: 'Duplicate SKU' });
          return;
        }
        seenSkus.add(sku);
      }
      const ispub = (row.ispublished ?? '').trim().toLowerCase();
      const isPublished = ispub === '' ? true : ispub !== 'false' && ispub !== '0';
      valid.push({
        name,
        sku,
        category: (row.category ?? '').trim() || 'Uncategorized',
        price,
        stock,
        brand: (row.brand ?? '').trim() || 'Unknown',
        salePrice,
        model: (row.model ?? '').trim() || null,
        description: (row.description ?? '').trim() || null,
        imageUrl: (row.imageurl ?? '').trim() || null,
        isPublished,
      });
    });
    return { valid, skipped };
  }
}
