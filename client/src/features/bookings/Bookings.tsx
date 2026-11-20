import { useEffect, useState } from 'react';
import { api, category, money, when, type Booking } from '../../shared/api';
import { Modal } from '../../shared/components/Modal';
const states: Record<string, string> = {
  PENDING: 'Очікує оплати',
  PAID: 'Оплачено',
  CANCELLED: 'Скасовано',
  EXPIRED: 'Час вичерпано',
};

export function Bookings({ onBrowse }: { onBrowse: () => void }) {
  const [rows, setRows] = useState<Booking[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [now, setNow] = useState(Date.now()),
    [confirm, setConfirm] = useState<Booking | null>(null);
  const refresh = () =>
    api<Booking[]>('/bookings/mine')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000),
      clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);
  async function act(b: Booking, action: string) {
    setBusy(b.id);
    setError('');
    try {
      await api(`/bookings/${b.id}/${action}`, 'POST', {});
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
      await refresh();
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="workspace wrap">
      <p className="eyebrow">ОСОБИСТИЙ КАБІНЕТ</p>
      <div className="section-heading">
        <h1>Мої квитки</h1>
        <button className="outline" onClick={() => void refresh()}>
          Оновити
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Завантажуємо…</p>
      ) : !rows.length ? (
        <div className="empty">
          <h3>Ваша перша історія попереду</h3>
          <p>Заброньовані місця та квитки з’являться тут.</p>
          <button className="primary" onClick={onBrowse}>
            Переглянути афішу ↗
          </button>
        </div>
      ) : (
        <div className="booking-list">
          {rows.map((b) => {
            const remaining = Math.max(
              0,
              Math.ceil((new Date(b.expires_at).getTime() - now) / 1000),
            );
            return (
              <article className={`booking-card ${b.status.toLowerCase()}`} key={b.id}>
                <div className="booking-heading">
                  <div>
                    <span className={`badge ${b.status.toLowerCase()}`}>{states[b.status]}</span>
                    <h2>{b.title}</h2>
                    <p>
                      {when(b.starts_at)} · {b.hall_name}
                    </p>
                  </div>
                  <strong className="booking-price">{money(b.total_kopecks)}</strong>
                </div>
                <div className="ticket-items">
                  {b.items.map((item) => (
                    <div key={item.id}>
                      <strong>
                        Ряд {item.row} · Місце {item.seat}
                      </strong>
                      <span>
                        {category[item.category]} · {money(item.price)}
                        {item.discount !== 'NONE' &&
                          ` · ${item.discount === 'STUDENT' ? 'Студентська' : 'Акційна'} знижка`}
                      </span>
                      {item.ticketId && <code>Квиток: {item.ticketId}</code>}
                    </div>
                  ))}
                </div>
                {b.status === 'PENDING' && (
                  <div className="booking-actions">
                    <p role="timer">
                      До оплати:{' '}
                      <b>
                        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                      </b>
                    </p>
                    <button
                      className="primary"
                      disabled={!!busy || !remaining}
                      onClick={() => setConfirm(b)}
                    >
                      Оплатити {money(b.total_kopecks)}
                    </button>
                    <button
                      className="outline"
                      disabled={!!busy}
                      onClick={() => void act(b, 'cancel')}
                    >
                      Скасувати
                    </button>
                  </div>
                )}
                {b.status === 'PAID' && (
                  <p className="small-note">
                    Квитки збережено у вашому кабінеті.{' '}
                    <button className="text-button" onClick={() => window.print()}>
                      Друкувати квитки
                    </button>
                  </p>
                )}
                <small className="muted">Бронювання {b.id}</small>
              </article>
            );
          })}
        </div>
      )}
      {confirm && (
        <Modal onClose={() => setConfirm(null)} locked={!!busy}>
          <section
            className="dialog auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-title"
          >
            <h2 id="pay-title">Підтвердження оплати</h2>
            <p>{confirm.title}</p>
            <h3>{money(confirm.total_kopecks)}</h3>
            <p>
              Це навчальна демонстрація. Банківські дані не потрібні, кошти не списуються. Після
              підтвердження місця отримають статус проданих.
            </p>
            <button className="primary" disabled={!!busy} onClick={() => void act(confirm, 'pay')}>
              {busy ? 'Обробляємо…' : 'Підтвердити демооплату'}
            </button>
            <button className="text-button" disabled={!!busy} onClick={() => setConfirm(null)}>
              Повернутися
            </button>
          </section>
        </Modal>
      )}
    </section>
  );
}
