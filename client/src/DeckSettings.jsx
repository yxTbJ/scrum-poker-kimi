import { useState } from 'react';

export default function DeckSettings({ deck, onChange }) {
  const [value, setValue] = useState('');
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
      {err && <p className="error-text">{err}</p>}
    </div>
  );
}
