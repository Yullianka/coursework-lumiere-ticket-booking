import { useEffect, useState } from 'react';
import { Admin } from './features/admin/Admin';
import { Auth } from './features/auth/Auth';
import { Bookings } from './features/bookings/Bookings';
import { SeatPicker } from './features/catalog/SeatPicker';
import { api, money, when, type Session, type User } from './shared/api';

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
    [sort, setSort] = useState('date_asc'),
    [selected, setSelected] = useState<Session | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        if (r.user?.role === 'ADMIN') setPage('admin');
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({ sort });
    if (kind !== 'ALL') query.set('type', kind);
    if (search.trim()) query.set('search', search.trim());
    if (day) query.set('day', day);
    const timer = setTimeout(() => {
      void api<Session[]>('/sessions?' + query.toString())
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
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [version, kind, search, day, sort]);
  return (
    <>
      <a className="skip" href="#main">
        Перейти до вмісту
      </a>
      <header className="header wrap">
        <a
          href={user?.role === 'ADMIN' ? '#admin' : '#afisha'}
          className="brand"
          onClick={() => setPage(user?.role === 'ADMIN' ? 'admin' : 'afisha')}
        >
          <span className="brand-icon">L</span>lumière<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Основна навігація">
          {user?.role !== 'ADMIN' && (
            <button className={page === 'afisha' ? 'active' : ''} onClick={() => setPage('afisha')}>
              Афіша
            </button>
          )}
          {user?.role === 'CLIENT' && (
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
                    setSelected(null);
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
        {page === 'afisha' && user?.role !== 'ADMIN' && (
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
                <label>
                  Сортування
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="date_asc">Спочатку найближчі</option>
                    <option value="date_desc">Спочатку пізніші</option>
                    <option value="price_asc">Від дешевших</option>
                    <option value="price_desc">Від дорожчих</option>
                  </select>
                </label>
              </div>
              {loading ? (
                <p role="status" className="empty">
                  Завантажуємо афішу…
                </p>
              ) : sessions.length ? (
                <div className="event-grid">
                  {sessions.map((s, i) => (
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
        {page === 'bookings' && user?.role === 'CLIENT' && (
          <Bookings onBrowse={() => setPage('afisha')} />
        )}
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
            setPage(r.user.role === 'ADMIN' ? 'admin' : 'afisha');
            if (r.user.role === 'ADMIN') setSelected(null);
            setAuth(false);
          }}
        />
      )}
      {selected && !auth && user?.role !== 'ADMIN' && (
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
