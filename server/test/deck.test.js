import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeck, sanitizeName, defaultDeck } from '../src/rooms.js';

test('defaultDeck возвращает целые числа от 1 до 30', () => {
  const deck = defaultDeck();
  assert.equal(deck.length, 30);
  assert.deepEqual(deck[0], 1);
  assert.deepEqual(deck[29], 30);
  assert.ok(deck.every((v) => Number.isInteger(v)));
});

test('validateDeck принимает урезанный набор и значения сверх 30', () => {
  assert.equal(validateDeck([1, 2, 3, 10]), null);
  assert.equal(validateDeck([45, 100]), null);
  assert.equal(validateDeck([30, 31, 99]), null);
});

test('validateDeck отклоняет нецелые значения', () => {
  assert.match(validateDeck([1.5, 2, 3]), /целыми числами/);
  assert.match(validateDeck(['5']), /целыми числами/);
});

test('validateDeck отклоняет значения больше 100 и меньше 1', () => {
  assert.match(validateDeck([101]), /от 1 до 100/);
  assert.match(validateDeck([0]), /от 1 до 100/);
  assert.match(validateDeck([-5]), /от 1 до 100/);
});

test('validateDeck отклоняет дубликаты', () => {
  assert.match(validateDeck([5, 5]), /повторяться/);
  assert.match(validateDeck([1, 2, 2, 3]), /повторяться/);
});

test('validateDeck отклоняет пустой набор и не-массив', () => {
  assert.match(validateDeck([]), /пустым/);
  assert.match(validateDeck('123'), /массивом/);
  assert.match(validateDeck(null), /массивом/);
});

test('sanitizeName обрезает пробелы и отклоняет пустое имя', () => {
  assert.equal(sanitizeName('  Аня  '), 'Аня');
  assert.equal(sanitizeName('Борис   Иванов'), 'Борис Иванов');
  assert.equal(sanitizeName(''), null);
  assert.equal(sanitizeName('   '), null);
  assert.equal(sanitizeName(null), null);
  assert.equal(sanitizeName(42), null);
});
