import { useState } from 'react';

export default function DeckSettings({ deck, onChange }) {
  const [value, setValue] = useState('');
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [err, setErr] = useState('');

  const remove = (v) => onChange(deck.filter((d) => d !== v));

  const add = () => {
    const n = Number(value.trim());
    if (value.trim() === '' || !Number.isInteger(n)) {
      setErr('Введите целое число');
      return;
    }
    if (n < 1 || n > 100) {
      setErr('Допустимый диапазон: от 1 до 100');
      return;
    }
    if (deck.includes(n)) {
      setErr('Такая карта уже есть в наборе');
      return;
    }
    setErr('');
    setValue('');
    onChange([...deck, n].sort((a, b) => a - b));
  };

  const parseRange = () => {
    const from = Number(fromValue.trim());
    const to = Number(toValue.trim());
    if (
      fromValue.trim() === '' ||
      toValue.trim() === '' ||
      !Number.isInteger(from) ||
      !Number.isInteger(to)
    ) {
      setErr('Введите целые числа «От» и «До»');
      return null;
    }
    if (from < 1 || to > 100 || from > to) {
      setErr('Диапазон: целые от 1 до 100, «От» не больше «До»');
      return null;
    }
    return { from, to };
  };

  // mode 'add' — добавить все карты диапазона, которых ещё нет;
  // mode 'del' — удалить все существующие карты диапазона
  const applyRange = (mode) => {
    const range = parseRange();
    if (!range) return;
    let next = [...deck];
    if (mode === 'add') {
      for (let v = range.from; v <= range.to; v += 1) {
        if (!next.includes(v)) next.push(v);
      }
      next.sort((a, b) => a - b);
    } else {
      next = next.filter((v) => v < range.from || v > range.to);
      if (next.length === 0) {
        setErr('Набор не может стать пустым — такой диапазон удалять нельзя');
        return;
      }
    }
    setErr('');
    onChange(next);
  };

  return (
    <div className="deck-settings">
      <h3 className="deck-settings-title">Набор карт ({deck.length} шт.)</h3>
      <p className="hint">
        Допустимы целые числа от 1 до 100 без повторов. Изменение набора сбрасывает все голоса.
      </p>
      <div className="deck-chips">
        {deck.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" title="Убрать карту" onClick={() => remove(v)}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="deck-add">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Новое значение"
          inputMode="numeric"
        />
        <button type="button" onClick={add}>
          Добавить карту
        </button>
      </div>
      <div className="deck-range">
        <span className="range-label">Диапазон:</span>
        <input
          value={fromValue}
          onChange={(e) => setFromValue(e.target.value)}
          placeholder="От"
          inputMode="numeric"
        />
        <span className="range-dash">—</span>
        <input
          value={toValue}
          onChange={(e) => setToValue(e.target.value)}
          placeholder="До"
          inputMode="numeric"
        />
        <button type="button" onClick={() => applyRange('add')} title="Добавить все карты диапазона, которых ещё нет">
          Добавить все
        </button>
        <button type="button" onClick={() => applyRange('del')} title="Удалить все существующие карты диапазона">
          Удалить все
        </button>
      </div>
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
