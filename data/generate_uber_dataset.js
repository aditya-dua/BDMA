#!/usr/bin/env node
/**
 * Generate a teaching dataset of Uber-style ride bookings for BDMA Lectures 15-16.
 *
 * Column names and value domains mirror the public Kaggle dataset
 * "Uber Ride Analytics Dashboard" (yashdevladdha), so everything students
 * practise here transfers directly to the real 2024 NCR file:
 * https://www.kaggle.com/datasets/yashdevladdha/uber-ride-analytics-dashboard
 *
 * Why generate instead of shipping the Kaggle CSV?
 *   - Kaggle requires a login, which blocks students mid-class.
 *   - Redistributing the original file would breach its licence terms.
 *   - A fixed seed means every student's dashboard shows identical numbers,
 *     so the lecturer can state an expected figure and have it match exactly.
 *
 * Outputs (written next to this script):
 *   uber_bookings.csv     flat file for Atlas Charts / spreadsheet import
 *   uber_bookings.json    array of documents for `mongoimport --jsonArray`
 *   uber_summary.json     pre-computed aggregates powering dashboard/index.html
 *   uber_summary.js       the same aggregates as window.BDMA_SUMMARY (file:// safe)
 *
 * Usage:
 *   node data/generate_uber_dataset.js
 *   node data/generate_uber_dataset.js --rows 50000
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SEED = 20241201;
const OUT_DIR = __dirname;

/* ---------------------------------------------------------------------------
 * Deterministic RNG (mulberry32). Node's Math.random cannot be seeded, and a
 * reproducible dataset is the whole point of this script.
 * ------------------------------------------------------------------------- */
function makeRng(seed) {
  let a = seed >>> 0;
  function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  next.int = (maxExclusive) => Math.floor(next() * maxExclusive);
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.weighted = (items, weights) => {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i += 1) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };
  // Box-Muller, so fares and ratings cluster realistically instead of being flat.
  next.gauss = (mu, sd) => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return next;
}

/* --- Value domains, matched to the Kaggle dataset ------------------------ */

const VEHICLE_TYPES = ['Go Mini', 'Go Sedan', 'Auto', 'eBike', 'Bike', 'Premier Sedan', 'Uber XL'];
const VEHICLE_WEIGHTS = [0.21, 0.19, 0.24, 0.07, 0.08, 0.13, 0.08];

// base fare (INR), rate per km, [mean trip km, sd]
const VEHICLE_ECONOMICS = {
  'Go Mini':       { base: 48,  perKm: 11.5, dist: [11.0, 6.0] },
  'Go Sedan':      { base: 62,  perKm: 14.0, dist: [13.0, 7.0] },
  'Auto':          { base: 32,  perKm: 9.0,  dist: [7.5, 4.0] },
  'eBike':         { base: 22,  perKm: 6.5,  dist: [5.0, 2.8] },
  'Bike':          { base: 25,  perKm: 7.0,  dist: [6.0, 3.2] },
  'Premier Sedan': { base: 95,  perKm: 18.5, dist: [16.0, 8.5] },
  'Uber XL':       { base: 120, perKm: 21.0, dist: [18.0, 9.0] },
};

const LOCATIONS = [
  'Connaught Place', 'Saket', 'Dwarka Sector 21', 'Noida Sector 62', 'Gurgaon Cyber City',
  'Indira Gandhi International Airport', 'Hauz Khas', 'Rajiv Chowk', 'Karol Bagh',
  'Vasant Kunj', 'Lajpat Nagar', 'Nehru Place', 'Janakpuri', 'Rohini Sector 18',
  'Greater Kailash', 'Pitampura', 'Mayur Vihar', 'Shahdara', 'New Delhi Railway Station',
  'Anand Vihar ISBT', 'Okhla', 'Chandni Chowk', 'Khan Market', 'Aerocity',
  'Noida Electronic City', 'Sohna Road', 'MG Road Gurgaon', 'Badarpur',
];
// Transport hubs and business districts generate disproportionate demand.
const HIGH_DEMAND = new Set([
  'Indira Gandhi International Airport', 'Connaught Place', 'Gurgaon Cyber City',
  'New Delhi Railway Station', 'Noida Sector 62',
]);
const LOCATION_WEIGHTS = LOCATIONS.map((loc) => (HIGH_DEMAND.has(loc) ? 3 : 1));

const PAYMENT_METHODS = ['UPI', 'Cash', 'Uber Wallet', 'Credit Card', 'Debit Card'];
const PAYMENT_WEIGHTS = [0.45, 0.25, 0.12, 0.11, 0.07];

const BOOKING_STATUSES = [
  'Completed',
  'Cancelled by Driver',
  'Cancelled by Customer',
  'No Driver Found',
  'Incomplete',
];
// Shaped to match the real dataset: a clear majority completed, with driver
// cancellations running roughly triple customer cancellations.
const STATUS_WEIGHTS = [0.62, 0.18, 0.07, 0.07, 0.06];

const CUSTOMER_CANCEL_REASONS = [
  'Wrong Address',
  'Driver is not moving towards pickup location',
  'Driver asked to cancel',
  'AC is not working',
  'Change of plans',
];
const DRIVER_CANCEL_REASONS = [
  'Personal & Car related issues',
  'Customer related issue',
  'The customer was coughing/sick',
  'More than permitted people in there',
];
const INCOMPLETE_REASONS = ['Vehicle Breakdown', 'Customer Demand', 'Other Issue'];

// Two commute peaks plus a late-night tail — the classic ride-hailing curve.
const HOUR_WEIGHTS = [
  0.8, 0.5, 0.35, 0.3, 0.4, 0.9,
  2.0, 4.2, 6.5, 7.4, 5.1, 4.0,
  4.3, 4.4, 4.0, 4.2, 5.0, 6.8,
  8.2, 7.6, 5.9, 4.4, 3.0, 1.7,
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const CSV_HEADERS = [
  'Date', 'Time', 'Booking ID', 'Booking Status', 'Customer ID', 'Vehicle Type',
  'Pickup Location', 'Drop Location', 'Avg VTAT', 'Avg CTAT',
  'Cancelled Rides by Customer', 'Reason for cancelling by Customer',
  'Cancelled Rides by Driver', 'Driver Cancellation Reason',
  'Incomplete Rides', 'Incomplete Rides Reason',
  'Booking Value', 'Ride Distance', 'Driver Ratings', 'Customer Rating', 'Payment Method',
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
const pad = (n, width = 2) => String(n).padStart(width, '0');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function buildRows(rows) {
  const rng = makeRng(SEED);
  const start = Date.UTC(2024, 0, 1);
  const DAYS_IN_2024 = 366;
  const DAY_MS = 86400000;

  const poolSize = Math.max(Math.floor(rows / 4), 500);
  const customerPool = Array.from(
    { length: poolSize },
    () => `CID${100000 + rng.int(900000)}`,
  );

  const records = [];

  for (let i = 0; i < rows; i += 1) {
    const dayOffset = rng.int(DAYS_IN_2024);
    const day = new Date(start + dayOffset * DAY_MS);
    const dateStr = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;

    // Weekends run later and lighter; bias the hour draw accordingly.
    const weights = HOUR_WEIGHTS.map((w, h) => (isWeekend ? w * (h >= 21 || h <= 2 ? 1.5 : 0.85) : w));
    const hour = rng.weighted(HOURS, weights);
    const timeStr = `${pad(hour)}:${pad(rng.int(60))}:${pad(rng.int(60))}`;

    const status = rng.weighted(BOOKING_STATUSES, STATUS_WEIGHTS);
    const vehicle = rng.weighted(VEHICLE_TYPES, VEHICLE_WEIGHTS);
    const pickup = rng.weighted(LOCATIONS, LOCATION_WEIGHTS);
    let drop = rng.pick(LOCATIONS);
    while (drop === pickup) drop = rng.pick(LOCATIONS);

    const econ = VEHICLE_ECONOMICS[vehicle];

    const row = {
      'Date': dateStr,
      'Time': timeStr,
      'Booking ID': `CNR${String(3000000 + i).padStart(7, '0')}`,
      'Booking Status': status,
      'Customer ID': rng.pick(customerPool),
      'Vehicle Type': vehicle,
      'Pickup Location': pickup,
      'Drop Location': drop,
      'Avg VTAT': '',
      'Avg CTAT': '',
      'Cancelled Rides by Customer': '',
      'Reason for cancelling by Customer': '',
      'Cancelled Rides by Driver': '',
      'Driver Cancellation Reason': '',
      'Incomplete Rides': '',
      'Incomplete Rides Reason': '',
      'Booking Value': '',
      'Ride Distance': '',
      'Driver Ratings': '',
      'Customer Rating': '',
      'Payment Method': '',
    };

    // "No Driver Found" means nothing was ever dispatched, so every downstream
    // measure stays blank — exactly as in the source dataset.
    if (status !== 'No Driver Found') {
      row['Avg VTAT'] = round2(Math.max(1, rng.gauss(8.0, 3.2)));
    }

    if (status === 'Completed') {
      const distance = Math.max(0.6, rng.gauss(econ.dist[0], econ.dist[1]));
      const surge = [8, 9, 18, 19, 20].includes(hour) ? 1.25 : 1.0;
      const airport = pickup.includes('Airport') || drop.includes('Airport') ? 1.18 : 1.0;
      const fare = (econ.base + econ.perKm * distance) * surge * airport * rng.range(0.92, 1.12);

      row['Avg CTAT'] = round2(Math.max(4, distance * rng.range(2.1, 3.4) + rng.gauss(4, 2)));
      row['Ride Distance'] = round2(distance);
      row['Booking Value'] = round2(fare);
      row['Driver Ratings'] = round1(clamp(rng.gauss(4.42, 0.32), 3, 5));
      row['Customer Rating'] = round1(clamp(rng.gauss(4.39, 0.35), 3, 5));
      row['Payment Method'] = rng.weighted(PAYMENT_METHODS, PAYMENT_WEIGHTS);
    } else if (status === 'Cancelled by Customer') {
      row['Cancelled Rides by Customer'] = 1;
      row['Reason for cancelling by Customer'] = rng.pick(CUSTOMER_CANCEL_REASONS);
    } else if (status === 'Cancelled by Driver') {
      row['Cancelled Rides by Driver'] = 1;
      row['Driver Cancellation Reason'] = rng.pick(DRIVER_CANCEL_REASONS);
    } else if (status === 'Incomplete') {
      // The trip started and was billed, then failed partway.
      const distance = Math.max(0.5, rng.gauss(econ.dist[0] * 0.55, econ.dist[1] * 0.5));
      row['Incomplete Rides'] = 1;
      row['Incomplete Rides Reason'] = rng.pick(INCOMPLETE_REASONS);
      row['Ride Distance'] = round2(distance);
      row['Booking Value'] = round2((econ.base + econ.perKm * distance) * rng.range(0.85, 1.05));
      row['Avg CTAT'] = round2(Math.max(3, distance * rng.range(2.0, 3.2)));
      row['Payment Method'] = rng.weighted(PAYMENT_METHODS, PAYMENT_WEIGHTS);
    }

    records.push(row);
  }

  records.sort((a, b) => (a.Date + a.Time < b.Date + b.Time ? -1 : 1));
  return records;
}

/** Convert a flat CSV row into the nested shape used in the MongoDB exercises. */
function toDocument(row) {
  const doc = {
    booking_id: row['Booking ID'],
    booked_at: `${row.Date}T${row.Time}Z`,
    date: row.Date,
    status: row['Booking Status'],
    customer_id: row['Customer ID'],
    vehicle_type: row['Vehicle Type'],
    route: { pickup: row['Pickup Location'], drop: row['Drop Location'] },
  };

  const numeric = {
    avg_vtat: row['Avg VTAT'],
    avg_ctat: row['Avg CTAT'],
    booking_value: row['Booking Value'],
    ride_distance: row['Ride Distance'],
  };
  for (const [key, value] of Object.entries(numeric)) {
    if (value !== '') doc[key] = value;
  }

  const ratings = {};
  if (row['Driver Ratings'] !== '') ratings.driver = row['Driver Ratings'];
  if (row['Customer Rating'] !== '') ratings.customer = row['Customer Rating'];
  if (Object.keys(ratings).length) doc.ratings = ratings;

  if (row['Payment Method']) doc.payment_method = row['Payment Method'];

  if (row['Reason for cancelling by Customer']) {
    doc.cancellation = { by: 'customer', reason: row['Reason for cancelling by Customer'] };
  } else if (row['Driver Cancellation Reason']) {
    doc.cancellation = { by: 'driver', reason: row['Driver Cancellation Reason'] };
  } else if (row['Incomplete Rides Reason']) {
    doc.incomplete = { reason: row['Incomplete Rides Reason'] };
  }

  return doc;
}

function summarise(records) {
  const total = records.length;
  const completed = records.filter((r) => r['Booking Status'] === 'Completed');

  const statusCounts = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
  let totalValue = 0;
  for (const r of records) {
    statusCounts[r['Booking Status']] += 1;
    if (r['Booking Value'] !== '') totalValue += r['Booking Value'];
  }

  const completedValue = completed.reduce((s, r) => s + r['Booking Value'], 0);
  const totalDistance = completed.reduce((s, r) => s + r['Ride Distance'], 0);

  const group = (keyFn, init) => {
    const map = new Map();
    for (const r of records) {
      const key = keyFn(r);
      if (!map.has(key)) map.set(key, init());
      const b = map.get(key);
      b.bookings += 1;
      if (r['Booking Status'] === 'Completed') {
        b.completed += 1;
        b.revenue += r['Booking Value'];
        if ('distance' in b) b.distance += r['Ride Distance'];
      }
      if ('cancelled' in b
        && (r['Booking Status'].startsWith('Cancelled') || r['Booking Status'] === 'No Driver Found')) {
        b.cancelled += 1;
      }
      if ('grossRevenue' in b && r['Booking Value'] !== '') b.grossRevenue += r['Booking Value'];
    }
    return map;
  };

  const byVehicle = group((r) => r['Vehicle Type'], () => ({ bookings: 0, completed: 0, revenue: 0, distance: 0 }));
  const byHour = group((r) => Number(r.Time.slice(0, 2)), () => ({ bookings: 0, completed: 0, revenue: 0 }));
  const byMonth = group((r) => r.Date.slice(0, 7), () => ({ bookings: 0, completed: 0, revenue: 0 }));
  const byPickup = group(
    (r) => r['Pickup Location'],
    () => ({ bookings: 0, completed: 0, revenue: 0, cancelled: 0, grossRevenue: 0 }),
  );

  const tally = (field) => {
    const counts = new Map();
    for (const r of records) {
      const v = r[field];
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return counts;
  };
  const toShareList = (counts, labelKey) => {
    const sum = [...counts.values()].reduce((s, c) => s + c, 0) || 1;
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ [labelKey]: label, count, share_pct: round2((count / sum) * 100) }));
  };

  const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
  const driverRatings = completed.map((r) => r['Driver Ratings']);
  const customerRatings = completed.map((r) => r['Customer Rating']);
  const vtats = records.filter((r) => r['Avg VTAT'] !== '').map((r) => r['Avg VTAT']);

  const failed = total - statusCounts.Completed;
  const avgValue = completed.length ? completedValue / completed.length : 0;

  return {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source_note:
      'Synthetic dataset generated by data/generate_uber_dataset.js. Schema mirrors the Kaggle '
      + '"Uber Ride Analytics Dashboard" dataset (yashdevladdha).',
    kpis: {
      total_bookings: total,
      completed_bookings: statusCounts.Completed,
      completion_rate_pct: round2((statusCounts.Completed / total) * 100),
      failed_bookings: failed,
      failure_rate_pct: round2((failed / total) * 100),
      total_booking_value: round2(totalValue),
      completed_booking_value: round2(completedValue),
      lost_revenue_estimate: round2(failed * avgValue),
      avg_booking_value: round2(avgValue),
      total_distance_km: round2(totalDistance),
      avg_distance_km: round2(completed.length ? totalDistance / completed.length : 0),
      avg_driver_rating: round2(avg(driverRatings)),
      avg_customer_rating: round2(avg(customerRatings)),
      avg_vtat_min: round2(avg(vtats)),
    },
    status_breakdown: BOOKING_STATUSES.map((status) => ({
      status,
      bookings: statusCounts[status],
      share_pct: round2((statusCounts[status] / total) * 100),
    })),
    by_vehicle: [...byVehicle.entries()]
      .map(([vehicle_type, v]) => ({
        vehicle_type,
        bookings: v.bookings,
        completed: v.completed,
        completion_rate_pct: round2((v.completed / v.bookings) * 100),
        revenue: round2(v.revenue),
        avg_booking_value: round2(v.completed ? v.revenue / v.completed : 0),
        avg_distance_km: round2(v.completed ? v.distance / v.completed : 0),
      }))
      .sort((a, b) => b.revenue - a.revenue),
    by_hour: HOURS.map((hour) => {
      const v = byHour.get(hour) || { bookings: 0, completed: 0, revenue: 0 };
      return {
        hour,
        bookings: v.bookings,
        completed: v.completed,
        revenue: round2(v.revenue),
        failure_rate_pct: v.bookings ? round2(((v.bookings - v.completed) / v.bookings) * 100) : 0,
      };
    }),
    by_month: [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, v]) => ({
        month,
        bookings: v.bookings,
        completed: v.completed,
        revenue: round2(v.revenue),
      })),
    payment_methods: toShareList(tally('Payment Method'), 'method').map((d) => ({
      method: d.method,
      bookings: d.count,
      share_pct: d.share_pct,
    })),
    top_pickups: [...byPickup.entries()]
      .map(([location, v]) => ({
        location,
        bookings: v.bookings,
        cancelled: v.cancelled,
        cancellation_rate_pct: round2((v.cancelled / v.bookings) * 100),
        revenue: round2(v.grossRevenue),
      }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 12),
    cancellation_reasons: {
      customer: toShareList(tally('Reason for cancelling by Customer'), 'reason'),
      driver: toShareList(tally('Driver Cancellation Reason'), 'reason'),
    },
  };
}

function toCsv(records) {
  const escape = (value) => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_HEADERS.join(',')];
  for (const r of records) {
    lines.push(CSV_HEADERS.map((h) => escape(r[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const argv = process.argv.slice(2);
  const rowsFlag = argv.indexOf('--rows');
  const rows = rowsFlag !== -1 ? Number(argv[rowsFlag + 1]) : 15000;

  if (!Number.isFinite(rows) || rows < 100) {
    console.error('--rows must be a number >= 100');
    process.exit(1);
  }

  const records = buildRows(rows);
  const summary = summarise(records);

  // uber_summary.js is the same payload wrapped in a global assignment so the
  // dashboard can load it with a plain <script> tag. fetch() is blocked under
  // file://, and students open the page straight off disk.
  const summaryJs =
    '/* Generated by data/generate_uber_dataset.js — do not edit by hand. */\n' +
    `window.BDMA_SUMMARY = ${JSON.stringify(summary, null, 2)};\n`;

  const outputs = [
    ['uber_bookings.csv', toCsv(records)],
    ['uber_bookings.json', JSON.stringify(records.map(toDocument))],
    ['uber_summary.json', `${JSON.stringify(summary, null, 2)}\n`],
    ['uber_summary.js', summaryJs],
  ];

  console.log(`Wrote ${records.length.toLocaleString('en-US')} bookings`);
  for (const [name, content] of outputs) {
    const target = path.join(OUT_DIR, name);
    fs.writeFileSync(target, content, 'utf8');
    console.log(`  data/${name}  (${Math.round(Buffer.byteLength(content) / 1024)} KB)`);
  }
}

if (require.main === module) main();

module.exports = { buildRows, toDocument, summarise, toCsv };
