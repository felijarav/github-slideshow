#!/usr/bin/env node
'use strict';

// Simple CLI to list Guitar Center used products via Algolia
// Outputs link, product name, and price.

const { parseArgs } = require('node:util');

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || '7AQ22QS8RJ';
const ALGOLIA_API_KEY = process.env.ALGOLIA_API_KEY || 'd04d765e552eb08aff3601eae8f2b729'; // public search key from site
const ALGOLIA_INDEX = process.env.ALGOLIA_INDEX || 'guitarcenter';
const ALGOLIA_ENDPOINT = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

/**
 * Build filters string for Algolia
 * @param {string|undefined} category - top-level category e.g., "Guitars", "Bass", etc.
 */
function buildFilters(category) {
  const filters = ["condition.lvl0:\"Used\""];
  if (category) {
    filters.push(`categories.lvl0:\"${category}\"`);
  }
  return filters.join(' AND ');
}

/**
 * Query Algolia index
 * @param {object} opts
 * @param {string} [opts.query]
 * @param {string} [opts.category]
 * @param {number} [opts.page]
 * @param {number} [opts.hitsPerPage]
 */
async function queryUsed({ query = '', category, page = 0, hitsPerPage = 30 }) {
  const body = {
    query,
    page,
    hitsPerPage,
    filters: buildFilters(category),
  };

  const res = await fetch(ALGOLIA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Algolia request failed: ${res.status} ${res.statusText} ${text}`);
  }

  const json = await res.json();
  const hits = Array.isArray(json.hits) ? json.hits : [];

  return hits.map((hit) => {
    const seoUrl = hit.seoUrl || hit.url || '';
    const link = seoUrl.startsWith('http') ? seoUrl : `https://www.guitarcenter.com${seoUrl}`;
    const name = hit.displayName || hit.name || '';
    const price = typeof hit.price === 'number' ? hit.price : (typeof hit.listPrice === 'number' ? hit.listPrice : null);
    return { link, name, price };
  });
}

function formatCurrency(value) {
  if (typeof value !== 'number' || !isFinite(value)) return '';
  return `$${value.toFixed(2)}`;
}

function toCsv(rows) {
  const escapeCsv = (s) => {
    const str = s == null ? '' : String(s);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const header = ['link', 'name', 'price'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([escapeCsv(r.link), escapeCsv(r.name), escapeCsv(formatCurrency(r.price))].join(','));
  }
  return lines.join('\n');
}

function toTable(rows) {
  const headers = ['LINK', 'NAME', 'PRICE'];
  const data = rows.map((r) => [r.link, r.name, formatCurrency(r.price)]);
  const all = [headers, ...data];
  const widths = headers.map((_, i) => Math.max(...all.map((row) => (row[i] ? String(row[i]).length : 0))));
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const fmtRow = (row) => '| ' + row.map((cell, i) => {
    const s = cell == null ? '' : String(cell);
    return s.padEnd(widths[i], ' ');
  }).join(' | ') + ' |';
  const lines = [sep, fmtRow(headers), sep];
  for (const row of data) lines.push(fmtRow(row));
  lines.push(sep);
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      query: { type: 'string', short: 'q' },
      category: { type: 'string', short: 'c' },
      page: { type: 'string', short: 'p' },
      hitsPerPage: { type: 'string' },
      format: { type: 'string', short: 'f' }, // json|csv|table
    },
    allowPositionals: false,
  });

  const query = values.query || '';
  const category = values.category;
  const page = values.page != null ? Number(values.page) : 0;
  const hitsPerPage = values.hitsPerPage != null ? Number(values.hitsPerPage) : 30;
  const format = (values.format || 'table').toLowerCase();

  if (Number.isNaN(page) || page < 0) {
    console.error('Invalid --page');
    process.exit(1);
  }
  if (Number.isNaN(hitsPerPage) || hitsPerPage <= 0 || hitsPerPage > 1000) {
    console.error('Invalid --hitsPerPage (1-1000)');
    process.exit(1);
  }

  try {
    const items = await queryUsed({ query, category, page, hitsPerPage });
    if (format === 'json') {
      console.log(JSON.stringify(items, null, 2));
    } else if (format === 'csv') {
      console.log(toCsv(items));
    } else if (format === 'table') {
      console.log(toTable(items));
    } else {
      console.error('Unknown --format. Use json|csv|table');
      process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (require.main === module) {
  // Node 18+ includes global fetch; if not present, instruct
  if (typeof fetch !== 'function') {
    console.error('This script requires Node 18+ (global fetch)');
    process.exit(1);
  }
  main();
}
