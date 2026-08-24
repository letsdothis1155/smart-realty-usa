'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const S = require('./property-search.js');

test('parses natural-language housing queries', () => {
  const q = S.parseQuery('3 bedroom houses under 250k near Greensboro');
  assert.equal(q.beds, 3);
  assert.equal(q.priceMax, 250000);
  assert.ok(q.city.includes('greensboro') || q.city === 'greensboro');
});

test('parses Southern Indiana housing queries', () => {
  const jeff = S.parseQuery('houses under 300k near Jeffersonville');
  assert.equal(jeff.priceMax, 300000);
  assert.ok(String(jeff.city).includes('jeffersonville'));
  const albany = S.parseQuery('3 bedroom homes New Albany');
  assert.equal(albany.beds, 3);
  assert.equal(albany.city, 'new albany');
  assert.equal(albany.state, 'IN');
  assert.equal(albany.text, '');
  const utica = S.parseQuery('Utica');
  assert.equal(utica.city, 'utica');
  assert.equal(utica.state, 'IN');
});

test('city searches require the full city and state instead of matching one loose word', () => {
  const rows = [
    { title: '17 Oak St', location: 'New Albany, IN', source: 'hud', listPrice: 140000 },
    { title: '89 Albany Rd', location: 'Louisville, KY', status: 'New listing', source: 'hud', listPrice: 150000 },
    { title: '22 River Rd', location: 'Utica, KY', source: 'hud', listPrice: 120000 },
  ];
  assert.deepEqual(S.filterListings(rows, S.parseQuery('New Albany')).map((p) => p.title), ['17 Oak St']);
  assert.equal(S.filterListings(rows, S.parseQuery('Utica')).length, 0);
});

test('multi-word free text requires every meaningful token', () => {
  const rows = [
    { title: '17 Willow Crest Dr', location: 'Louisville, KY', source: 'hud', listPrice: 140000 },
    { title: '89 Willow Rd', location: 'Louisville, KY', source: 'hud', listPrice: 150000 },
  ];
  assert.deepEqual(S.filterListings(rows, S.parseQuery('Willow Crest')).map((p) => p.title), ['17 Willow Crest Dr']);
});

test('drops courthouse entities but keeps a house with county records in the description', () => {
  assert.equal(
    S.isGovernmentEntity({ title: 'Jefferson County Courthouse', propertyType: 'Government office' }),
    true,
  );
  assert.equal(
    S.isListableHome({
      title: '123 Main St',
      location: 'Louisville, KY',
      propertyType: 'Single family',
      desc: 'County PVA tax record exists for this parcel.',
    }),
    true,
  );
  assert.equal(S.isListableHome({ title: 'Hall of Justice', location: 'Louisville' }), false);
  assert.equal(S.isListableHome({ title: 'Northwestern Parkway' }), false);
  assert.equal(S.isListableHome({ title: '2611 Harmony Rd', location: 'Louisville, KY 40299' }), false);
});

test('3D only for real listing photos', () => {
  assert.equal(S.hasUsableRoomPhoto({ source: 'hud', image: 'https://example.com/house.jpg' }), true);
  assert.equal(S.hasUsableRoomPhoto({ source: 'mock', image: 'images/listing-19.jpg' }), true);
  assert.equal(S.hasUsableRoomPhoto({ source: 'court', image: 'https://example.com/house.jpg' }), false);
  assert.equal(S.hasUsableRoomPhoto({ source: 'hud', image: 'data:image/svg+xml,x' }), false);
});

test('property type filter distinguishes estate, condo, and house', () => {
  const rows = [
    { title: 'Palm Crest Glass Estate', location: 'Las Vegas, NV', tags: ['mansion'], propertyType: 'Estate', listPrice: 8900000 },
    { title: 'Miami Edge Condo Loft', location: 'Miami, FL', tags: ['modern'], propertyType: 'Condo / Loft', listPrice: 890000 },
    { title: 'Sunnyvale Family Craftsman', location: 'Sunnyvale, CA', tags: ['family'], propertyType: 'Single family', listPrice: 240000 },
  ];
  assert.deepEqual(S.filterListings(rows, S.parseQuery(''), { propertyType: 'estate' }).map((p) => p.title), ['Palm Crest Glass Estate']);
  assert.deepEqual(S.filterListings(rows, S.parseQuery(''), { propertyType: 'condo' }).map((p) => p.title), ['Miami Edge Condo Loft']);
  assert.equal(S.filterListings(rows, S.parseQuery(''), { propertyType: 'house' }).some((p) => p.title === 'Sunnyvale Family Craftsman'), true);
  assert.equal(S.filterListings(rows, S.parseQuery(''), { propertyType: 'house' }).some((p) => p.title === 'Miami Edge Condo Loft'), false);
});

test('room simulator href is empty without a usable photo and carries listing context', () => {
  assert.equal(S.roomSimulatorHref({ id: 'court-1', source: 'court', image: 'https://x/a.jpg' }), '');
  const href = S.roomSimulatorHref(
    { id: 'sr-019', source: 'demo', image: 'images/listing-19.jpg' },
    { from: '/?q=Louisville#listings' },
  );
  assert.match(href, /\/room-builder\/\?listing=sr-019/);
  assert.match(href, /photo=/);
  assert.match(href, /from=/);
});

test('demo named homes stay listable without a house number', () => {
  assert.equal(S.isListableHome({ title: 'Palm Crest Glass Estate', location: 'Las Vegas, NV' }), true);
});

test('ranks an active home above a government-shaped leftover', () => {
  const parsed = S.parseQuery('homes in Louisville');
  const ranked = S.rankListings(
    [
      { title: '2001 Crums Lane', location: 'Louisville, KY', source: 'hud', listPrice: 120000, offer: 120000, beds: 3, image: 'https://x/a.jpg', lat: 38.18, lng: -85.83 },
      { title: 'Jefferson County Courthouse', location: 'Louisville, KY', source: 'court', listPrice: 0, offer: 0, propertyType: 'Courthouse' },
    ],
    parsed,
    { lat: 38.25, lng: -85.76 },
  );
  assert.equal(ranked[0].title, '2001 Crums Lane');
});
