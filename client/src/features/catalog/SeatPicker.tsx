import { useEffect, useState } from 'react';
import { api, category, money, when, type Seat, type Session, type User } from '../../shared/api';
import { Modal } from '../../shared/components/Modal';
export function SeatPicker({
  session,
  user,
  login,
  close,
  done,
}: {
  session: Session;
  user: User | null;
  login: () => void;
  close: () => void;
  done: () => void;
}) {
  const [seats, setSeats] = useState<Seat[]>([]),
    [chosen, setChosen] = useState<string[]>([]),
    [promo, setPromo] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  function refresh() {
    return api<{ seats: Seat[] }>(`/sessions/${session.id}/seats`)
      .then((r) => {
        setSeats(r.seats);
        setChosen((old) =>
          old.filter((id) => r.seats.some((s) => s.id === id && s.status === 'AVAILABLE')),
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [session.id]);
  const items = seats.filter((s) => chosen.includes(s.id)),
    total = items.reduce((sum, s) => sum + s.price_kopecks, 0);
  async function reserve() {
    if (!user) {
      login();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/bookings', 'POST', {
        sessionId: session.id,
        seatIds: chosen,
        promoCode: promo.trim() || undefined,
      });
      done();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={close} locked={busy}>
      <section
        className="dialog seats-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-title"
      >
        <button className="close" disabled={busy} aria-label="Закрити" onClick={close}>
          ×
        </button>
        <p className="eyebrow">ОБЕРІТЬ СВОЄ МІСЦЕ</p>
        <h2 id="seat-title">{session.title}</h2>
        <p className="muted">
          {when(session.starts_at)} · {session.hall_name}
        </p>
        <div className="seat-layout">
          <div>
            <div className="screen">СЦЕНА / ЕКРАН</div>
            {loading ? (
              <p role="status">Завантажуємо схему…</p>
            ) : (
              <div className="seat-map" aria-label="Схема залу">
                {[...new Set(seats.map((s) => s.row_number))].map((row) => (
                  <div className="seat-row" key={row}>
                    <span className="row-label">{row}</span>
                    {seats
                      .filter((s) => s.row_number === row)
                      .map((s) => (
                        <button
                          key={s.id}
                          className={`seat ${s.category.toLowerCase()} ${chosen.includes(s.id) ? 'selected' : ''}`}
                          disabled={s.status !== 'AVAILABLE' || busy}
                          aria-pressed={chosen.includes(s.id)}
                          aria-label={`Ряд ${row}, місце ${s.seat_number}, ${category[s.category]}, ${money(s.price_kopecks)}, ${s.status === 'AVAILABLE' ? 'вільне' : 'зайняте'}`}
                          title={`${category[s.category]} · ${money(s.price_kopecks)}`}
                          onClick={() =>
                            setChosen((old) =>
                              old.includes(s.id)
                                ? old.filter((id) => id !== s.id)
                                : old.length < 8
                                  ? [...old, s.id]
                                  : old,
                            )
                          }
                        >
                          {s.seat_number}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
            <div className="legend">
              <span>
                <i className="standard" />
                Стандарт
              </span>
              <span>
                <i className="vip" />
                VIP
              </span>
              <span>
                <i className="balcony" />
                Балкон
              </span>
              <span>
                <i className="occupied" />
                Зайняте
              </span>
              <span>
                <i className="selected" />
                Ваш вибір
              </span>
            </div>
            <button className="text-button" onClick={() => void refresh()}>
              Оновити наявність
            </button>
          </div>
          <aside className="order-summary">
            <h3>Ваш вечір</h3>
            {items.length ? (
              items.map((s) => (
                <div className="summary-line" key={s.id}>
                  <span>
                    Ряд {s.row_number}, місце {s.seat_number}
                    <small>{category[s.category]}</small>
                  </span>
                  <b>{money(s.price_kopecks)}</b>
                </div>
              ))
            ) : (
              <p className="muted">
                Натисніть на вільне місце на схемі. До 8 місць за одне бронювання.
              </p>
            )}
            <label>
              Промокод
              <input
                value={promo}
                maxLength={32}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="Якщо маєте"
              />
            </label>
            <div className="summary-line total">
              <span>Без знижок</span>
              <strong>{money(total)}</strong>
            </div>
            <p className="small-note">
              {user?.student_verified ? 'Вашу студентську знижку 10% підтверджено. ' : ''}
              Найвигіднішу доступну знижку застосуємо під час бронювання. Остаточна сума — перед
              оплатою.
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={!chosen.length || busy} onClick={reserve}>
              {busy ? 'Бронюємо…' : user ? 'Забронювати ↗' : 'Увійти для бронювання'}
            </button>
            <p className="small-note">
              Місця зберігаються 15 хвилин, але не пізніше початку сеансу.
            </p>
          </aside>
        </div>
      </section>
    </Modal>
  );
}
