import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveShape, categoryColor, equipmentDimsFt, rackShelfCount } from '../src/resinex/equipmentShapes.js';

test('resolveShape picks a shape from the equipment name', () => {
  assert.equal(resolveShape({ name: '100L Solvent Tank', category: 'Extraction' }), 'tank');
  assert.equal(resolveShape({ name: 'Jacketed Vessel', category: 'Extraction' }), 'tank');
  assert.equal(resolveShape({ name: '4-Column Rack', category: 'Extraction' }), 'rack');
  assert.equal(resolveShape({ name: 'Trim Table', category: 'Other' }), 'bench');
  assert.equal(resolveShape({ name: 'Belt Conveyor', category: 'Pre-Roll & Packaging' }), 'line');
  assert.equal(resolveShape({ name: 'Vacuum Oven', category: 'Extraction' }), 'box');
});

test('racks and stands win over tanks so a tank stand is drawn as a frame', () => {
  assert.equal(resolveShape({ name: 'Solvent Tank Stand' }), 'rack');
  assert.equal(resolveShape({ name: 'Material Column Rack' }), 'rack');
  assert.equal(resolveShape({ name: 'Extraction Column' }), 'tank');
});

test('lighting category and light-like names hang overhead', () => {
  assert.equal(resolveShape({ name: 'HLG 600', category: 'Lighting' }), 'overhead');
  assert.equal(resolveShape({ name: 'Ceiling Fan', category: 'HVAC & Dehumidification' }), 'overhead');
});

test('category is the fallback when the name matches nothing', () => {
  assert.equal(resolveShape({ name: 'Unit 7', category: 'Trimming & Bucking' }), 'bench');
  assert.equal(resolveShape({ name: 'Unit 7', category: 'Drying & Curing' }), 'box');
  assert.equal(resolveShape({ name: 'Unit 7' }), 'box');
  assert.equal(resolveShape(undefined), 'box');
});

test('an explicit valid shape_type overrides the guess; an invalid one is ignored', () => {
  assert.equal(resolveShape({ name: '100L Solvent Tank', shape_type: 'rack' }), 'rack');
  assert.equal(resolveShape({ name: '100L Solvent Tank', shape_type: 'spaceship' }), 'tank');
});

test('equipmentDimsFt converts inches to feet and flags missing dimensions', () => {
  assert.deepEqual(equipmentDimsFt({ width_in: 24, depth_in: 36, height_in: 60 }), { w: 2, d: 3, h: 5, defaulted: false });
  const partial = equipmentDimsFt({ width_in: 48 });
  assert.equal(partial.w, 4);
  assert.equal(partial.d, 2);
  assert.equal(partial.h, 3);
  assert.equal(partial.defaulted, true);
  assert.equal(equipmentDimsFt(null).defaulted, true);
  // Zero, negative and non-numeric values fall back instead of collapsing the model.
  assert.equal(equipmentDimsFt({ width_in: 0, depth_in: -5, height_in: 'abc' }).w, 2);
});

test('rackShelfCount scales with height within 2 to 6 shelves', () => {
  assert.equal(rackShelfCount(1), 2);
  assert.equal(rackShelfCount(6), 5);
  assert.equal(rackShelfCount(40), 6);
});

test('categoryColor falls back for unknown categories', () => {
  assert.equal(categoryColor('Extraction'), '#b8c4cc');
  assert.equal(categoryColor('Nonexistent'), categoryColor('Other'));
  assert.equal(categoryColor(undefined), categoryColor('Other'));
});
