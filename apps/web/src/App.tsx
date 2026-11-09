import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  money,
  when,
  category,
  type User,
  type Session,
  type Seat,
  type Booking,
} from './api';
import { Admin } from './Admin';
import { Modal } from './Modal';
const states: Record<string, string> = {
  PENDING: 'Очікує оплати',
  PAID: 'Оплачено',
  CANCELLED: 'Скасовано',
  EXPIRED: 'Час вичерпано',
};
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState('afisha'),
    [auth, setAuth] = useState(false),
    [sessions, setSessions] = useState<Session[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('ALL'),
    [search, setSearch] = useState(''),
    [day, setDay] = useState(''),
    [selected, setSelected] = useState<Session | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Session[]>('/sessions')
      .then((r) => {
        if (active) {
          setSessions(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);
  const visible = sessions.filter(
    (s) =>
      (kind === 'ALL' || s.type === kind) &&
      s.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!day ||
        new Date(s.starts_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }) === day),
  );
  return (
    <>
      <a className="skip" href="#main">
        Перейти до вмісту
      </a>
      <header className="header wrap">
        <a href="#afisha" className="brand" onClick={() => setPage('afisha')}>
          <span className="brand-icon">L</span>lumière<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Основна навігація">
          <button className={page === 'afisha' ? 'active' : ''} onClick={() => setPage('afisha')}>
            Афіша
          </button>
          {user && (
            <button
              className={page === 'bookings' ? 'active' : ''}
              onClick={() => setPage('bookings')}
            >
              Мої квитки
            </button>
          )}
          {user?.role === 'ADMIN' && (
            <button className={page === 'admin' ? 'active' : ''} onClick={() => setPage('admin')}>
              Керування
            </button>
          )}
        </nav>
        <div className="account">
          {user ? (
            <>
              <span>{user.display_name}</span>
              <button
                onClick={async () => {
                  try {
                    await api('/auth/logout', 'POST', {});
                    setUser(null);
                    setPage('afisha');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Вийти
              </button>
            </>
          ) : (
            <button className="outline" onClick={() => setAuth(true)}>
              Увійти ↗
            </button>
          )}
        </div>
      </header>
      <main id="main">
        {error && (
          <div className="wrap notice error" role="alert">
            {error} <button onClick={() => setVersion((v) => v + 1)}>Повторити</button>
          </div>
        )}
        {page === 'afisha' && (
          <>
            <section className="hero wrap">
              <div className="hero-copy">
                <p className="eyebrow">
                  <span /> МІСЦЕ ДЛЯ ВРАЖЕНЬ
                </p>
                <h1>
                  Вечір, який
                  <br />
                  хочеться <em>відчути.</em>
                </h1>
                <p className="intro">
                  Велике кіно. Живі історії. Ваше місце в залі.
                  <br />
                  Обирайте подію — і залишайте буденність за дверима.
                </p>
                <a className="primary" href="#afisha">
                  Обрати свій вечір <span>↗</span>
                </a>
                <p className="hero-note">Бронювання на 15 хвилин · Знижка студентам 10%</p>
              </div>
              <div className="poster" aria-hidden="true">
                <div className="poster-top">
                  <span>LUMIÈRE / ВІДЧУЙ МОМЕНТ</span>
                  <span>01</span>
                </div>
                <div className="orb" />
                <div className="beam" />
                <div className="poster-text">
                  ІСТОРІЇ
                  <br />
                  ОЖИВАЮТЬ
                  <br />
                  <i>тут.</i>
                </div>
                <div className="poster-bottom">
                  <span>КІНО · ТЕАТР · ЕМОЦІЇ</span>
                  <span>↗</span>
                </div>
              </div>
            </section>
            <section id="afisha" className="afisha wrap">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ВАШ НАСТУПНИЙ ВЕЧІР</p>
                  <h2>На сцені та екрані</h2>
                </div>
                <span className="small-note">Усі події за київським часом</span>
              </div>
              <div className="filter-bar">
                <div className="filters" role="group" aria-label="Тип події">
                  {[
                    ['ALL', 'Усі події'],
                    ['FILM', 'Кіно'],
                    ['PLAY', 'Театр'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label>
                  Пошук
                  <input
                    type="search"
                    placeholder="Назва події…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label>
                  Дата
                  <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                </label>
              </div>
              {loading ? (
                <p role="status" className="empty">
                  Завантажуємо афішу…
                </p>
              ) : visible.length ? (
                <div className="event-grid">
                  {visible.map((s, i) => (
                    <article className="event-card" key={s.id}>
                      <div className={`event-art art-${i % 3}`} aria-hidden="true">
                        <span>{s.type === 'FILM' ? 'CINEMA' : 'THEATRE'}</span>
                        <b>{s.type === 'FILM' ? '◒' : '✦'}</b>
                        <small>LUMIÈRE / {String(i + 1).padStart(2, '0')}</small>
                      </div>
                      <div className="event-body">
                        <p className="eyebrow">
                          {s.type === 'FILM' ? 'КІНО' : 'ТЕАТР'} · {s.duration_minutes} ХВ
                        </p>
                        <h3>{s.title}</h3>
                        <p className="description">{s.description}</p>
                        <p>
                          {when(s.starts_at)}
                          <br />
                          <span className="muted">
                            {s.hall_name} · {s.available} вільних місць
                          </span>
                        </p>
                        <div className="card-bottom">
                          <strong>від {money(s.min_price)}</strong>
                          <button
                            className="primary"
                            disabled={!s.available}
                            onClick={() => setSelected(s)}
                          >
                            Обрати місця ↗
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <span className="ticket-icon">✦</span>
                  <h3>Подій не знайдено</h3>
                  <p>Спробуйте іншу дату або змініть фільтри.</p>
                </div>
              )}
            </section>
            <section className="about wrap">
              <div>
                <p className="eyebrow">КОЖНОМУ — СВОЄ МІСЦЕ</p>
                <h2>Оберіть свій формат вечора</h2>
              </div>
              <div className="categories">
                {[
                  [
                    'STANDARD',
                    'Ближче до історії',
                    'Класичні місця для зустрічі з великим кіно та живою сценою.',
                  ],
                  [
                    'VIP',
                    'Трохи більше комфорту',
                    'Особливий формат перегляду для вашого особливого вечора.',
                  ],
                  [
                    'BALCONY',
                    'Інший погляд',
                    'Панорама сцени та атмосфера театру з місць на балконі.',
                  ],
                ].map(([key, title, desc], i) => (
                  <article key={key}>
                    <span>
                      0{i + 1} / {key}
                    </span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
        {page === 'bookings' && user && <Bookings onBrowse={() => setPage('afisha')} />}
        {page === 'admin' && user?.role === 'ADMIN' && <Admin />}
      </main>
      <footer className="footer wrap">
        <div>
          <strong>lumière.</strong>
          <p>Кіно та театр. Ближче до вас.</p>
        </div>
        <p className="small-note">
          Навчальний проєкт · Оплата демонстраційна
          <br />
          Кошти не списуються
        </p>
      </footer>
      {auth && (
        <Auth
          close={() => setAuth(false)}
          done={async () => {
            const r = await api<{ user: User }>('/auth/me');
            setUser(r.user);
            setAuth(false);
          }}
        />
      )}
      {selected && !auth && (
        <SeatPicker
          session={selected}
          user={user}
          login={() => setAuth(true)}
          close={() => {
            setSelected(null);
            setVersion((v) => v + 1);
          }}
          done={() => {
            setSelected(null);
            setPage('bookings');
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
function Auth({ close, done }: { close: () => void; done: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, 'POST', data);
      await done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={close} locked={busy}>
      <section
        className="dialog auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button className="close" aria-label="Закрити" disabled={busy} onClick={close}>
          ×
        </button>
        <p className="eyebrow">ВАШ ПРОСТІР LUMIÈRE</p>
        <h2 id="auth-title">{register ? 'Раді знайомству' : 'З поверненням'}</h2>
        <p className="muted">Збережіть місце для наступної історії.</p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Ваше ім’я
              <input autoFocus name="displayName" autoComplete="name" maxLength={100} required />
            </label>
          )}
          <label>
            Електронна пошта
            <input
              autoFocus={!register}
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {register && (
            <small>Щонайменше 8 символів. Студентський статус підтверджує адміністратор.</small>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Зачекайте…' : register ? 'Створити акаунт' : 'Увійти'}
          </button>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Уже маєте акаунт? Увійти' : 'Уперше тут? Зареєструватися'}
        </button>
      </section>
    </Modal>
  );
}
function SeatPicker({
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
function Bookings({ onBrowse }: { onBrowse: () => void }) {
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
